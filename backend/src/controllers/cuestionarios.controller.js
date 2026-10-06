
import { pool } from "../config/database.js";

export async function listarCuestionarios(req, res) {
  try {
    const resultado = await pool.query(
      `SELECT c.id, c.titulo, c.descripcion, c.categoria,
              c.publicado, c.creado_en,
              COUNT(DISTINCT r.id)::int AS total_reactivos
       FROM cuestionarios c
       LEFT JOIN reactivos r ON r.cuestionario_id = c.id
       WHERE c.usuario_id = $1
       GROUP BY c.id
       ORDER BY c.creado_en DESC`,
      [req.usuario.id]
    );

    res.json({ cuestionarios: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "No se pudieron listar los cuestionarios." });
  }
}

export async function crearCuestionario(req, res) {
  try {
    const { titulo, descripcion = "", categoria = "" } = req.body;

    if (typeof titulo !== "string" || !titulo.trim() || titulo.trim().length > 150) {
      return res.status(400).json({ message: "El título es obligatorio y debe tener máximo 150 caracteres." });
    }

    if (
      typeof descripcion !== "string" ||
      typeof categoria !== "string" ||
      descripcion.length > 5000 ||
      categoria.length > 100
    ) {
      return res.status(400).json({ message: "La descripción o categoría no son válidas." });
    }

    const resultado = await pool.query(
      `INSERT INTO cuestionarios (usuario_id, titulo, descripcion, categoria)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.usuario.id, titulo.trim(), descripcion.trim(), categoria.trim()]
    );

    res.status(201).json({
      message: "Cuestionario creado correctamente.",
      cuestionario: resultado.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "No se pudo crear el cuestionario." });
  }
}

export async function obtenerCuestionario(req, res) {
  try {
    const resultado = await pool.query(
      `SELECT c.id, c.usuario_id, c.titulo, c.descripcion,
              c.categoria, c.publicado, c.creado_en
       FROM cuestionarios c
       WHERE c.id = $1 AND c.usuario_id = $2`,
      [req.params.id, req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ message: "Cuestionario no encontrado." });
    }

    const cuestionario = resultado.rows[0];

    const reactivos = await pool.query(
      `SELECT r.id, r.enunciado, r.orden,
              r.tiempo_limite_segundos, r.puntos,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', o.id,
                    'texto', o.texto,
                    'es_correcta', o.es_correcta,
                    'orden', o.orden
                  ) ORDER BY o.orden
                ) FILTER (WHERE o.id IS NOT NULL),
                '[]'::json
              ) AS opciones
       FROM reactivos r
       LEFT JOIN opciones o ON o.reactivo_id = r.id
       WHERE r.cuestionario_id = $1
       GROUP BY r.id
       ORDER BY r.orden`,
      [cuestionario.id]
    );

    res.json({ cuestionario, reactivos: reactivos.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "No se pudo consultar el cuestionario." });
  }
}

export async function editarCuestionario(req, res) {
  try {
    const { titulo, descripcion = "", categoria = "" } = req.body;

    if (
      typeof titulo !== "string" ||
      !titulo.trim() ||
      titulo.trim().length > 150 ||
      typeof descripcion !== "string" ||
      typeof categoria !== "string" ||
      descripcion.length > 5000 ||
      categoria.length > 100
    ) {
      return res.status(400).json({ message: "Los datos del cuestionario no son válidos." });
    }

    const resultado = await pool.query(
      `UPDATE cuestionarios
       SET titulo = $1, descripcion = $2, categoria = $3,
           actualizado_en = NOW()
       WHERE id = $4 AND usuario_id = $5
       RETURNING *`,
      [titulo.trim(), descripcion.trim(), categoria.trim(), req.params.id, req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ message: "Cuestionario no encontrado." });
    }

    res.json({
      message: "Cuestionario actualizado.",
      cuestionario: resultado.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "No se pudo editar el cuestionario." });
  }
}

export async function eliminarCuestionario(req, res) {
  try {
    const resultado = await pool.query(
      `DELETE FROM cuestionarios
       WHERE id = $1 AND usuario_id = $2
       RETURNING id`,
      [req.params.id, req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ message: "Cuestionario no encontrado." });
    }

    res.json({ message: "Cuestionario eliminado correctamente." });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        message: "El cuestionario tiene partidas asociadas y no puede eliminarse.",
      });
    }

    console.error(error);
    res.status(500).json({ message: "No se pudo eliminar el cuestionario." });
  }
}

export async function crearReactivo(req, res) {
  const { enunciado, opciones, tiempo_limite_segundos = 20, puntos = 1000 } = req.body;
  const cuestionarioId = req.params.id;

  if (
    typeof enunciado !== "string" ||
    !enunciado.trim() ||
    enunciado.trim().length > 5000 ||
    !Array.isArray(opciones) ||
    opciones.length !== 4 ||
    !opciones.every(
      (o) =>
        o &&
        typeof o.texto === "string" &&
        o.texto.trim().length > 0 &&
        o.texto.trim().length <= 1000 &&
        typeof o.es_correcta === "boolean"
    ) ||
    opciones.filter((o) => o.es_correcta).length !== 1 ||
    !Number.isInteger(tiempo_limite_segundos) ||
    tiempo_limite_segundos < 5 ||
    tiempo_limite_segundos > 300 ||
    !Number.isInteger(puntos) ||
    puntos < 0 ||
    puntos > 100000
  ) {
    return res.status(400).json({
      message: "La pregunta debe tener cuatro opciones, una correcta y valores válidos.",
    });
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const propietario = await cliente.query(
      `SELECT id FROM cuestionarios
       WHERE id = $1 AND usuario_id = $2
       FOR UPDATE`,
      [cuestionarioId, req.usuario.id]
    );

    if (propietario.rowCount === 0) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ message: "Cuestionario no encontrado." });
    }

    const orden = await cliente.query(
      `SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente
       FROM reactivos WHERE cuestionario_id = $1`,
      [cuestionarioId]
    );

    const pregunta = await cliente.query(
      `INSERT INTO reactivos
       (cuestionario_id, enunciado, orden, tiempo_limite_segundos, puntos)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        cuestionarioId,
        enunciado.trim(),
        orden.rows[0].siguiente,
        tiempo_limite_segundos,
        puntos,
      ]
    );

    const reactivo = pregunta.rows[0];
    const opcionesGuardadas = [];

    for (let i = 0; i < opciones.length; i++) {
      const resultado = await cliente.query(
        `INSERT INTO opciones (reactivo_id, texto, es_correcta, orden)
         VALUES ($1, $2, $3, $4)
         RETURNING id, texto, es_correcta, orden`,
        [reactivo.id, opciones[i].texto.trim(), opciones[i].es_correcta, i + 1]
      );

      opcionesGuardadas.push(resultado.rows[0]);
    }

    await cliente.query("COMMIT");

    res.status(201).json({
      message: "Reactivo creado correctamente.",
      reactivo: { ...reactivo, opciones: opcionesGuardadas },
    });
  } catch (error) {
    await cliente.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ message: "No se pudo guardar el reactivo." });
  } finally {
    cliente.release();
  }
}



export async function editarReactivo(req, res) {
  const { enunciado, opciones, tiempo_limite_segundos = 20, puntos = 1000 } = req.body;

  if (
    typeof enunciado !== "string" ||
    !enunciado.trim() ||
    enunciado.trim().length > 5000 ||
    !Array.isArray(opciones) ||
    opciones.length !== 4 ||
    !opciones.every(
      (o) =>
        o &&
        typeof o.texto === "string" &&
        o.texto.trim().length > 0 &&
        o.texto.trim().length <= 1000 &&
        typeof o.es_correcta === "boolean"
    ) ||
    opciones.filter((o) => o.es_correcta).length !== 1 ||
    !Number.isInteger(tiempo_limite_segundos) ||
    tiempo_limite_segundos < 5 ||
    tiempo_limite_segundos > 300 ||
    !Number.isInteger(puntos) ||
    puntos < 0 ||
    puntos > 100000
  ) {
    return res.status(400).json({
      message: "Datos inválidos. Se requieren cuatro opciones y una respuesta correcta.",
    });
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const propiedad = await cliente.query(
      `SELECT r.id
       FROM reactivos r
       JOIN cuestionarios c ON c.id = r.cuestionario_id
       WHERE r.id = $1
         AND c.id = $2
         AND c.usuario_id = $3
       FOR UPDATE OF r, c`,
      [req.params.reactivoId, req.params.id, req.usuario.id]
    );

    if (propiedad.rowCount === 0) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ message: "Reactivo no encontrado." });
    }

    await cliente.query(
      `UPDATE reactivos
       SET enunciado = $1,
           tiempo_limite_segundos = $2,
           puntos = $3
       WHERE id = $4`,
      [
        enunciado.trim(),
        tiempo_limite_segundos,
        puntos,
        req.params.reactivoId,
      ]
    );

    await cliente.query(
      "DELETE FROM opciones WHERE reactivo_id = $1",
      [req.params.reactivoId]
    );

    const opcionesGuardadas = [];

    for (let i = 0; i < opciones.length; i++) {
      const resultado = await cliente.query(
        `INSERT INTO opciones (reactivo_id, texto, es_correcta, orden)
         VALUES ($1, $2, $3, $4)
         RETURNING id, texto, es_correcta, orden`,
        [
          req.params.reactivoId,
          opciones[i].texto.trim(),
          opciones[i].es_correcta,
          i + 1,
        ]
      );

      opcionesGuardadas.push(resultado.rows[0]);
    }

    await cliente.query("COMMIT");

    res.json({
      message: "Reactivo actualizado correctamente.",
      opciones: opcionesGuardadas,
    });
  } catch (error) {
    await cliente.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ message: "No se pudo actualizar el reactivo." });
  } finally {
    cliente.release();
  }
}

export async function eliminarReactivo(req, res) {
  try {
    const resultado = await pool.query(
      `DELETE FROM reactivos r
       USING cuestionarios c
       WHERE r.id = $1
         AND r.cuestionario_id = c.id
         AND c.id = $2
         AND c.usuario_id = $3
       RETURNING r.id`,
      [req.params.reactivoId, req.params.id, req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ message: "Reactivo no encontrado." });
    }

    res.json({ message: "Reactivo eliminado correctamente." });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        message: "No se puede eliminar esta pregunta porque está siendo utilizada en una partida.",
      });
    }

    console.error(error);
    res.status(500).json({ message: "No se pudo eliminar el reactivo." });
  }
}

export async function publicarCuestionario(req, res) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const cuestionario = await cliente.query(
      `SELECT id, publicado
       FROM cuestionarios
       WHERE id = $1 AND usuario_id = $2
       FOR UPDATE`,
      [req.params.id, req.usuario.id]
    );

    if (cuestionario.rowCount === 0) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ message: "Cuestionario no encontrado." });
    }

    const revision = await cliente.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (
           WHERE cantidad_opciones <> 4 OR correctas <> 1
         ) AS invalidos
       FROM (
         SELECT
           r.id,
           COUNT(o.id) AS cantidad_opciones,
           COUNT(o.id) FILTER (WHERE o.es_correcta) AS correctas
         FROM reactivos r
         LEFT JOIN opciones o ON o.reactivo_id = r.id
         WHERE r.cuestionario_id = $1
         GROUP BY r.id
       ) AS validacion`,
      [req.params.id]
    );

    const { total, invalidos } = revision.rows[0];

    if (Number(total) === 0 || Number(invalidos) > 0) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({
        message: "Agrega al menos una pregunta y asegúrate de que cada una tenga cuatro opciones y exactamente una respuesta correcta.",
      });
    }

    const resultado = await cliente.query(
      `UPDATE cuestionarios
       SET publicado = TRUE, actualizado_en = NOW()
       WHERE id = $1
       RETURNING id, titulo, publicado`,
      [req.params.id]
    );

    await cliente.query("COMMIT");

    res.json({
      message: "Cuestionario publicado correctamente.",
      cuestionario: resultado.rows[0],
    });
  } catch (error) {
    await cliente.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ message: "No se pudo publicar el cuestionario." });
  } finally {
    cliente.release();
  }
}

