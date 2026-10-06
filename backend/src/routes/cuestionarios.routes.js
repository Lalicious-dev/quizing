
import { Router } from "express";
import { verificarToken } from "../middleware/auth.middleware.js";


import {
  listarCuestionarios,
  crearCuestionario,
  obtenerCuestionario,
  editarCuestionario,
  eliminarCuestionario,
  crearReactivo,
  editarReactivo,
  eliminarReactivo,
  publicarCuestionario,
} from "../controllers/cuestionarios.controller.js";

const router = Router();

// Todas estas rutas requieren iniciar sesión.
router.use(verificarToken);

router.get("/", listarCuestionarios);
router.post("/", crearCuestionario);

router.get("/:id", obtenerCuestionario);
router.put("/:id", editarCuestionario);
router.delete("/:id", eliminarCuestionario);

router.post("/:id/reactivos", crearReactivo);
router.put("/:id/reactivos/:reactivoId", editarReactivo);
router.delete("/:id/reactivos/:reactivoId", eliminarReactivo);
router.post("/:id/publicar", publicarCuestionario);
export default router;
