
import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";
import {  crearSala,
  unirsePartida,
  iniciarPartida, } from "../controllers/partidas.controller.js";

const router = Router();

// Crear una sala: requiere autenticación.
router.post("/", verificarToken, crearSala);

// Unirse como jugador: no requiere autenticación.
router.post("/unirse", unirsePartida);

router.post("/:id/iniciar", verificarToken, iniciarPartida);

export default router;
