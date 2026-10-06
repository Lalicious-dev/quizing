
import { Router } from "express";
import {
  registrar,
  iniciarSesion,
  obtenerPerfil,
} from "../controllers/auth.controller.js";
import { verificarToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/registro", registrar);
router.post("/login", iniciarSesion);
router.get("/perfil", verificarToken, obtenerPerfil);

export default router;
