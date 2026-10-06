
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";

function generarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      correo: usuario.correo,
    },
    process.env.JWT_SECRET,
    { expiresIn: "4h" }
  );
}

export async function registrar(req, res) {
  try {
    const { nombre, correo, password } = req.body;

    if (
      typeof nombre !== "string" ||
      typeof correo !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Completa todos los campos correctamente.",
      });
    }

    const nombreLimpio = nombre.trim();
    const correoLimpio = correo.trim().toLowerCase();

    if (nombreLimpio.length < 2 || nombreLimpio.length > 100) {
      return res.status(400).json({
        message: "El nombre debe tener entre 2 y 100 caracteres.",
      });
    }

    if (
      correoLimpio.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoLimpio)
    ) {
      return res.status(400).json({
        message: "Ingresa un correo válido.",
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: "La contraseña debe tener entre 8 y 72 caracteres.",
      });
    }

    const existente = await pool.query(
      "SELECT id FROM usuarios WHERE correo = $1",
      [correoLimpio]
    );

    if (existente.rowCount > 0) {
      return res.status(409).json({
        message: "Este correo ya está registrado.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre, correo, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, nombre, correo, creado_en`,
      [nombreLimpio, correoLimpio, passwordHash]
    );

    const usuario = resultado.rows[0];
    const token = generarToken(usuario);

    return res.status(201).json({
      message: "Cuenta creada correctamente.",
      token,
      usuario,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Este correo ya está registrado.",
      });
    }

    console.error("Error al registrar:", error);

    return res.status(500).json({
      message: "Error interno al crear la cuenta.",
    });
  }
}

export async function iniciarSesion(req, res) {
  try {
    const { correo, password } = req.body;

    if (
      typeof correo !== "string" ||
      typeof password !== "string" ||
      correo.length > 150 ||
      password.length > 72
    ) {
      return res.status(400).json({
        message: "Correo o contraseña inválidos.",
      });
    }

    const resultado = await pool.query(
      `SELECT id, nombre, correo, password_hash, creado_en
       FROM usuarios
       WHERE correo = $1`,
      [correo.trim().toLowerCase()]
    );

    const usuario = resultado.rows[0];

    if (
      !usuario ||
      !(await bcrypt.compare(password, usuario.password_hash))
    ) {
      return res.status(401).json({
        message: "Correo o contraseña incorrectos.",
      });
    }

    const token = generarToken(usuario);

    delete usuario.password_hash;

    return res.json({
      message: "Inicio de sesión correcto.",
      token,
      usuario,
    });
  } catch (error) {
    console.error("Error al iniciar sesión:", error);

    return res.status(500).json({
      message: "Error interno al iniciar sesión.",
    });
  }
}

export async function obtenerPerfil(req, res) {
  try {
    const resultado = await pool.query(
      `SELECT id, nombre, correo, creado_en
       FROM usuarios
       WHERE id = $1`,
      [req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        message: "El usuario ya no existe.",
      });
    }

    return res.json({ usuario: resultado.rows[0] });
  } catch (error) {
    console.error("Error al consultar perfil:", error);

    return res.status(500).json({
      message: "No se pudo consultar el perfil.",
    });
  }
}
