import express from "express";
import http from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { pool } from "./config/database.js";
import authRoutes from "./routes/auth.routes.js";
import cuestionariosRoutes from "./routes/cuestionarios.routes.js";
import partidasRoutes from "./routes/partidas.routes.js";

dotenv.config();

const app = express();
const httpServer = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());



app.use("/api/auth", authRoutes);
app.use("/api/cuestionarios", cuestionariosRoutes);
app.use("/api/partidas", partidasRoutes);



const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      database: "connected",
      application: "Quizing",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "error",
      message: "No se pudo conectar con la base de datos",
    });
  }
});


app.set("io", io);

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  socket.on("entrar-sala", async ({ codigo } = {}) => {
    try {
      if (!/^\d{6}$/.test(String(codigo ?? ""))) {
        socket.emit("error-sala", {
          message: "El código de sala no es válido.",
        });
        return;
      }

      const resultado = await pool.query(
        `SELECT id, codigo, estado
         FROM partidas
         WHERE codigo = $1`,
        [String(codigo)],
      );

      if (resultado.rowCount === 0) {
        socket.emit("error-sala", {
          message: "No encontramos esa sala.",
        });
        return;
      }

      const partida = resultado.rows[0];
      const salaSocket = `partida:${partida.id}`;

      // Evitar que el socket quede conectado a otra sala anterior.
      for (const sala of socket.rooms) {
        if (sala.startsWith("partida:")) {
          socket.leave(sala);
        }
      }

      socket.join(salaSocket);

      const jugadores = await pool.query(
        `SELECT id, nombre_visible, puntuacion, unido_en
         FROM participantes
         WHERE partida_id = $1
         ORDER BY unido_en ASC, id ASC`,
        [partida.id],
      );

      io.to(salaSocket).emit("participantes-actualizados", {
        partidaId: partida.id,
        participantes: jugadores.rows,
      });
    } catch (error) {
      console.error("Error al entrar a la sala Socket.IO:", error);

      socket.emit("error-sala", {
        message: "No se pudo conectar con la sala.",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});


const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Quizing backend disponible en el puerto ${PORT}`);
});