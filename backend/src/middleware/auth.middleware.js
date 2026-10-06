
import jwt from "jsonwebtoken";

export function verificarToken(req, res, next) {
  const autorizacion = req.headers.authorization;

  if (!autorizacion?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Debes iniciar sesión.",
    });
  }

  const token = autorizacion.slice(7);

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "La sesión es inválida o ha expirado.",
    });
  }
}
