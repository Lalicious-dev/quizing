
import { randomInt } from "node:crypto";
import { pool } from "../config/database.js";

const generarCodigo = () =>
  String(randomInt(0, 1_000_000)).padStart(6, "0");

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
        message:
          "No se encontró el cuestionario publicado o no te pertenece.",
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

      io.to(`partida:${sala.id}`).emit(
        "participantes-actualizados",
        {
          partidaId: sala.id,
          participantes: jugadores.rows,
        },
      );
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
        message:
          "La partida no existe, no te pertenece o ya comenzó.",
      });
    }

    const partida = resultado.rows[0];
    const io = req.app.get("io");

    io.to(`partida:${partida.id}`).emit("partida-iniciada", {
      partidaId: partida.id,
      estado: partida.estado,
    });

    return res.json({
      message: "La partida ha comenzado.",
      partida,
    });
  } catch (error) {
    console.error("Error al iniciar partida:", error);

    return res.status(500).json({
      message: "No se pudo iniciar la partida.",
    });
  }
};
