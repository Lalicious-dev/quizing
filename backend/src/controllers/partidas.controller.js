import { randomInt } from "node:crypto";
import { pool } from "../config/database.js";

const generarCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
// Temporizadores activos, uno por partida.
const temporizadoresPartidas = new Map();

const obtenerPregunta = async (cuestionarioId, ordenActual = null) => {
  const resultado = await pool.query(
    `SELECT
       r.id,
       r.enunciado,
       r.orden,
       r.tiempo_limite_segundos,
       r.puntos,
       COALESCE(
         json_agg(
           json_build_object(
             'id', o.id,
             'texto', o.texto,
             'orden', o.orden
           )
           ORDER BY o.orden
         ) FILTER (WHERE o.id IS NOT NULL),
         '[]'::json
       ) AS opciones
     FROM reactivos r
     LEFT JOIN opciones o ON o.reactivo_id = r.id
     WHERE r.cuestionario_id = $1
       AND ($2::integer IS NULL OR r.orden > $2)
     GROUP BY r.id
     ORDER BY r.orden ASC
     LIMIT 1`,
    [cuestionarioId, ordenActual],
  );

  return resultado.rows[0] ?? null;
};

const programarTemporizador = (partidaId, pregunta, reactivoIniciadoEn, io) => {
  const temporizadorAnterior = temporizadoresPartidas.get(String(partidaId));

  if (temporizadorAnterior) {
    clearTimeout(temporizadorAnterior);
  }

  const inicio = new Date(reactivoIniciadoEn).getTime();
  const duracion = pregunta.tiempo_limite_segundos * 1000;
  const tiempoRestante = Math.max(0, inicio + duracion - Date.now());

  const temporizador = setTimeout(() => {
    avanzarReactivo(partidaId, pregunta.id, reactivoIniciadoEn, io).catch(
      (error) => {
        console.error("Error al avanzar por tiempo agotado:", error);
      },
    );
  }, tiempoRestante);

  temporizadoresPartidas.set(String(partidaId), temporizador);
};

const avanzarReactivo = async (
  partidaId,
  reactivoActualId,
  reactivoIniciadoEn,
  io,
) => {
  // Recuperar la partida y el orden del reactivo actual.
  const actualResult = await pool.query(
    `SELECT
       p.id,
       p.cuestionario_id,
       r.orden
     FROM partidas p
     JOIN reactivos r
       ON r.id = p.reactivo_actual_id
      AND r.cuestionario_id = p.cuestionario_id
     WHERE p.id = $1
  AND p.estado = 'en_curso'
  AND p.reactivo_actual_id = $2`,
    [partidaId, reactivoActualId],
  );

  // La pregunta pudo avanzar por otra solicitud.
  if (actualResult.rowCount === 0) return;

  const partida = actualResult.rows[0];

  const siguiente = await obtenerPregunta(
    partida.cuestionario_id,
    partida.orden,
  );

  // Ya no hay más preguntas: finalizar la partida.
  if (!siguiente) {
    const finalizacion = await pool.query(
      `UPDATE partidas
       SET estado = 'finalizada',
           finalizada_en = NOW(),
           reactivo_iniciado_en = NULL
       WHERE id = $1
         AND estado = 'en_curso'
         AND reactivo_actual_id = $2
       RETURNING id`,
      [partidaId, reactivoActualId],
    );

    if (finalizacion.rowCount === 0) return;

    const temporizador = temporizadoresPartidas.get(String(partidaId));

    if (temporizador) {
      clearTimeout(temporizador);
      temporizadoresPartidas.delete(String(partidaId));
    }

    const clasificacion = await pool.query(
      `SELECT id, nombre_visible, puntuacion
       FROM participantes
       WHERE partida_id = $1
       ORDER BY puntuacion DESC, unido_en ASC, id ASC`,
      [partidaId],
    );

    io.to(`partida:${partidaId}`).emit("partida-finalizada", {
      partidaId,
      clasificacion: clasificacion.rows,
    });

    return;
  }

  // Iniciar el siguiente reactivo de forma atómica.
  const actualizacion = await pool.query(
    `UPDATE partidas
     SET reactivo_actual_id = $1,
         reactivo_iniciado_en = NOW()
     WHERE id = $2
       AND estado = 'en_curso'
       AND reactivo_actual_id = $3
     RETURNING reactivo_iniciado_en`,
    [siguiente.id, partidaId, reactivoActualId],
  );

  // Otra solicitud pudo avanzar primero.
  if (actualizacion.rowCount === 0) return;

  const nuevoInicio = actualizacion.rows[0].reactivo_iniciado_en;

  io.to(`partida:${partidaId}`).emit("reactivo-actualizado", {
    partidaId,
    pregunta: siguiente,
    reactivoIniciadoEn: nuevoInicio,
  });

  programarTemporizador(partidaId, siguiente, nuevoInicio, io);
};

export const crearSala = async (req, res) => {
  const { cuestionario_id } = req.body;
  const usuarioId = req.usuario.id;

  if (!cuestionario_id) {
    return res.status(400).json({
      message: "Debes seleccionar un cuestionario.",
    });
  }

  try {
    // Verificar que el cuestionario pertenece al anfitrión
    // y que ya está publicado.
    const resultadoQuiz = await pool.query(
      `SELECT id, titulo
       FROM cuestionarios
       WHERE id = $1
         AND usuario_id = $2
         AND publicado = TRUE`,
      [cuestionario_id, usuarioId],
    );

    if (resultadoQuiz.rowCount === 0) {
      return res.status(404).json({
        message: "No se encontró el cuestionario publicado o no te pertenece.",
      });
    }

    const quiz = resultadoQuiz.rows[0];

    // Comprobar que tenga preguntas.
    const resultadoPreguntas = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM reactivos
       WHERE cuestionario_id = $1`,
      [quiz.id],
    );

    if (resultadoPreguntas.rows[0].total === 0) {
      return res.status(400).json({
        message: "El cuestionario no tiene preguntas.",
      });
    }

    // Generar un código único para la sala.
    for (let intento = 0; intento < 10; intento++) {
      const codigo = generarCodigo();

      try {
        const resultadoSala = await pool.query(
          `INSERT INTO partidas
             (cuestionario_id, anfitrion_id, codigo, estado)
           VALUES ($1, $2, $3, 'esperando')
           RETURNING id, cuestionario_id, anfitrion_id,
                     codigo, estado, creada_en`,
          [quiz.id, usuarioId, codigo],
        );

        return res.status(201).json({
          message: "Sala creada correctamente.",
          partida: {
            ...resultadoSala.rows[0],
            titulo: quiz.titulo,
            total_preguntas: resultadoPreguntas.rows[0].total,
          },
        });
      } catch (error) {
        // Si el código ya existe, generar otro.
        if (error.code === "23505") {
          continue;
        }

        throw error;
      }
    }

    return res.status(503).json({
      message: "No se pudo generar un código. Intenta nuevamente.",
    });
  } catch (error) {
    console.error("Error al crear sala:", error);

    return res.status(500).json({
      message: "Ocurrió un error al crear la sala.",
    });
  }
};

export const unirsePartida = async (req, res) => {
  const { codigo, nombre_visible } = req.body;

  // Validar los datos recibidos.
  if (!codigo || !/^\d{6}$/.test(String(codigo).trim())) {
    return res.status(400).json({
      message: "Ingresa un código de sala válido de 6 dígitos.",
    });
  }

  const nombre = String(nombre_visible || "").trim();

  if (nombre.length < 2 || nombre.length > 50) {
    return res.status(400).json({
      message: "El nombre debe tener entre 2 y 50 caracteres.",
    });
  }

  try {
    // Verificar que la sala exista y siga esperando jugadores.
    const salaResult = await pool.query(
      `SELECT
         p.id,
         p.codigo,
         p.estado,
         c.titulo,
         c.id AS cuestionario_id
       FROM partidas p
       INNER JOIN cuestionarios c
         ON c.id = p.cuestionario_id
       WHERE p.codigo = $1`,
      [String(codigo).trim()],
    );

    if (salaResult.rowCount === 0) {
      return res.status(404).json({
        message: "No encontramos una sala con ese código.",
      });
    }

    const sala = salaResult.rows[0];

    if (sala.estado !== "esperando") {
      return res.status(409).json({
        message: "Esta partida ya comenzó o ha finalizado.",
      });
    }

    // Registrar al jugador sin exigir una cuenta.
    const participanteResult = await pool.query(
      `INSERT INTO participantes
         (partida_id, usuario_id, nombre_visible)
       VALUES ($1, NULL, $2)
       RETURNING id, partida_id, nombre_visible, puntuacion, unido_en`,
      [sala.id, nombre],
    );

    // Notificar a los clientes conectados que llegó un jugador.
    try {
      const io = req.app.get("io");

      const jugadores = await pool.query(
        `SELECT id, nombre_visible, puntuacion, unido_en
         FROM participantes
         WHERE partida_id = $1
         ORDER BY unido_en ASC, id ASC`,
        [sala.id],
      );

      io.to(`partida:${sala.id}`).emit("participantes-actualizados", {
        partidaId: sala.id,
        participantes: jugadores.rows,
      });
    } catch (error) {
      // Un fallo de notificación no debe invalidar el registro del jugador.
      console.error("Error al notificar nuevos participantes:", error);
    }

    return res.status(201).json({
      message: "Te has unido a la sala correctamente.",
      partida: {
        id: sala.id,
        codigo: sala.codigo,
        titulo: sala.titulo,
        estado: sala.estado,
      },
      participante: participanteResult.rows[0],
    });
  } catch (error) {
    // El mismo nombre no puede repetirse dentro de una sala.
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Ese nombre ya está ocupado en esta sala. Prueba con otro.",
      });
    }

    console.error("Error al unirse a la partida:", error);

    return res.status(500).json({
      message: "No se pudo ingresar a la sala.",
    });
  }
};

export const iniciarPartida = async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.usuario.id;

  try {
    // Cambiar el estado de la partida.
    const resultado = await pool.query(
      `UPDATE partidas
       SET estado = 'en_curso'
       WHERE id = $1
         AND anfitrion_id = $2
         AND estado = 'esperando'
       RETURNING id, codigo, cuestionario_id, estado`,
      [id, usuarioId],
    );

    if (resultado.rowCount === 0) {
      return res.status(409).json({
        message: "La partida no existe, no te pertenece o ya comenzó.",
      });
    }

    const partida = resultado.rows[0];

    // Obtener la primera pregunta y sus opciones.
    // No incluir es_correcta en los datos enviados al jugador.
    const resultadoPregunta = await pool.query(
      `SELECT
         r.id,
         r.enunciado,
         r.tiempo_limite_segundos,
         r.puntos,
         COALESCE(
           json_agg(
             json_build_object(
               'id', o.id,
               'texto', o.texto,
               'orden', o.orden
             )
             ORDER BY o.orden
           ) FILTER (WHERE o.id IS NOT NULL),
           '[]'::json
         ) AS opciones
       FROM reactivos r
       LEFT JOIN opciones o
         ON o.reactivo_id = r.id
       WHERE r.cuestionario_id = $1
       GROUP BY r.id
       ORDER BY r.orden ASC
       LIMIT 1`,
      [partida.cuestionario_id],
    );

    // Evitar dejar la partida iniciada si no hay preguntas.
    if (resultadoPregunta.rowCount === 0) {
      await pool.query(
        `UPDATE partidas
     SET estado = 'esperando',
         reactivo_actual_id = NULL,
         iniciada_en = NULL,
         reactivo_iniciado_en = NULL
     WHERE id = $1
       AND anfitrion_id = $2
       AND estado = 'en_curso'`,
        [partida.id, usuarioId],
      );

      return res.status(400).json({
        message: "La partida no tiene preguntas disponibles.",
      });
    }
    // Obtener la primera pregunta.
    const pregunta = resultadoPregunta.rows[0];

    // Registrar el reactivo actual antes de notificar a los jugadores.
    const inicioResult = await pool.query(
      `UPDATE partidas
   SET reactivo_actual_id = $1,
       reactivo_iniciado_en = NOW(),
       iniciada_en = NOW()
   WHERE id = $2
     AND anfitrion_id = $3
     AND estado = 'en_curso'
   RETURNING reactivo_iniciado_en`,
      [pregunta.id, partida.id, usuarioId],
    );

    if (inicioResult.rowCount === 0) {
      return res.status(409).json({
        message: "No se pudo iniciar el reactivo.",
      });
    }

    const reactivoIniciadoEn = inicioResult.rows[0].reactivo_iniciado_en;

    const io = req.app.get("io");

    // Avisar a todos los jugadores que ya comenzó el juego.
    io.to(`partida:${partida.id}`).emit("partida-iniciada", {
      partidaId: partida.id,
      pregunta,
      reactivoIniciadoEn,
    });

    programarTemporizador(partida.id, pregunta, reactivoIniciadoEn, io);

    return res.json({
      message: "La partida ha comenzado.",
      partida,
      pregunta,
    });
  } catch (error) {
    console.error("Error al iniciar partida:", error);

    return res.status(500).json({
      message: "No se pudo iniciar la partida.",
    });
  }
};

export const responderPregunta = async (req, res) => {
  const { id: partidaId } = req.params;
  const { participanteId, reactivoId, opcionId } = req.body;

  if (!participanteId || !reactivoId || !opcionId) {
    return res.status(400).json({
      message: "Faltan datos para registrar la respuesta.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const resultado = await client.query(
      `SELECT
         p.id AS partida_id,
         p.estado,
         p.reactivo_actual_id,
         p.reactivo_iniciado_en,
         pa.id AS participante_id,
         r.id AS reactivo_id,
         r.puntos,
         r.tiempo_limite_segundos,
         o.es_correcta
       FROM partidas p
       JOIN participantes pa
         ON pa.partida_id = p.id
        AND pa.id = $2
       JOIN reactivos r
         ON r.id = p.reactivo_actual_id
        AND r.cuestionario_id = p.cuestionario_id
       JOIN opciones o
         ON o.reactivo_id = r.id
        AND o.id = $4
       WHERE p.id = $1
         AND r.id = $3
       FOR UPDATE OF p`,
      [partidaId, participanteId, reactivoId, opcionId],
    );

    if (resultado.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message:
          "La partida, el participante, la pregunta o la opción no son válidos.",
      });
    }

    const datos = resultado.rows[0];

    if (datos.estado !== "en_curso" || !datos.reactivo_iniciado_en) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "La partida no está activa o la pregunta no ha comenzado.",
      });
    }

    // Calcular el tiempo transcurrido desde el inicio del reactivo.
    const tiempoRespuestaMs = Math.max(
      0,
      Date.now() - new Date(datos.reactivo_iniciado_en).getTime(),
    );

    if (tiempoRespuestaMs > datos.tiempo_limite_segundos * 1000) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Se terminó el tiempo para responder.",
      });
    }

    const esCorrecta = datos.es_correcta;
    const puntosObtenidos = esCorrecta ? datos.puntos : 0;

    await client.query(
      `INSERT INTO respuestas (
         partida_id,
         participante_id,
         reactivo_id,
         opcion_id,
         es_correcta,
         puntos_obtenidos,
         tiempo_respuesta_ms
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        partidaId,
        participanteId,
        reactivoId,
        opcionId,
        esCorrecta,
        puntosObtenidos,
        tiempoRespuestaMs,
      ],
    );

    const resultadoPuntuacion = await client.query(
      `UPDATE participantes
       SET puntuacion = puntuacion + $1
       WHERE id = $2
         AND partida_id = $3
       RETURNING puntuacion`,
      [puntosObtenidos, participanteId, partidaId],
    );

    await client.query("COMMIT");
    const conteo = await pool.query(
      `SELECT
     COUNT(DISTINCT pa.id)::int AS total,
     COUNT(DISTINCT r.participante_id)::int AS respondidas
   FROM participantes pa
   LEFT JOIN respuestas r
     ON r.participante_id = pa.id
    AND r.partida_id = pa.partida_id
    AND r.reactivo_id = $2
   WHERE pa.partida_id = $1`,
      [partidaId, datos.reactivo_id],
    );

    const { total, respondidas } = conteo.rows[0];

    if (total > 0 && respondidas >= total) {
      const io = req.app.get("io");

      await avanzarReactivo(
        partidaId,
        datos.reactivo_id,
        datos.reactivo_iniciado_en,
        io,
      );
    }

    return res.json({
      message: "Respuesta registrada.",
      resultado: {
        esCorrecta,
        puntosObtenidos,
        puntuacion: resultadoPuntuacion.rows[0].puntuacion,
        tiempoRespuestaMs,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Ya respondiste esta pregunta.",
      });
    }

    console.error("Error al registrar respuesta:", error);

    return res.status(500).json({
      message: "No se pudo registrar la respuesta.",
    });
  } finally {
    client.release();
  }
};
