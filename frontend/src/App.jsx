import { useEffect, useState } from "react";
import axios from "axios";
import {
  Users,
  BrainCircuit,
  LogIn,
  UserPlus,
  LogOut,
  Plus,
  BookOpen,
  Trophy,
  Sparkles,
  Trash2,
  Send,
  LoaderCircle,
  CircleHelp,
  X,
  CheckCircle2,
  Clock3,
  Layers3,
} from "lucide-react";
import "./App.css";
import { io } from "socket.io-client";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
});

function PantallaUnirse() {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [partida, setPartida] = useState(null);
  const [participante, setParticipante] = useState(null);

  const unirse = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError("");

    try {
      const { data } = await api.post("/partidas/unirse", {
        codigo: codigo.trim(),
        nombre_visible: nombre.trim(),
      });

      setPartida(data.partida);
      setParticipante(data.participante);
    } catch (err) {
      setError(
        err.response?.data?.message || "No fue posible unirse a la partida.",
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!partida?.id || !partida?.codigo) return;

    const socket = io("http://localhost:3000");

    socket.on("connect", () => {
      socket.emit("entrar-sala", {
        codigo: String(partida.codigo),
      });
    });

    socket.on("error-sala", (data) => {
      setError(data.message || "Error al conectar con la sala.");
    });

    return () => socket.disconnect();
  }, [partida?.id, partida?.codigo]);

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      <header className="brand auth-brand">
        <div className="brand-icon">
          <BrainCircuit size={28} />
        </div>
        <span>
          quiz<span className="brand-accent">ing</span>
        </span>
      </header>

      <section className="auth-layout">
        <div className="auth-presentation">
          <div className="eyebrow">
            <Sparkles size={15} /> ZONA DE JUEGO
          </div>

          <h1>
            ¡Es hora de
            <br />
            <span className="gradient-text">demostrar lo que sabes!</span>
          </h1>

          <p className="auth-description">
            Ingresa el código de tu partida, elige tu nombre y prepárate para el
            reto.
          </p>
        </div>

        <div className="auth-card">
          {!partida ? (
            <>
              <div className="auth-card-top">
                <div className="mini-logo">
                  <Trophy size={22} />
                </div>
                <span className="card-kicker">ÚNETE A UNA PARTIDA</span>
              </div>

              <h2>¿Listo para jugar?</h2>
              <p className="auth-card-subtitle">
                No necesitas crear una cuenta.
              </p>

              <form className="auth-form" onSubmit={unirse}>
                <label>
                  Código de la partida
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ej. 924884"
                    value={codigo}
                    onChange={(e) =>
                      setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    minLength={6}
                    maxLength={6}
                    required
                  />
                </label>

                <label>
                  Tu nombre de jugador
                  <input
                    type="text"
                    placeholder="¿Cómo te llamamos?"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    minLength={2}
                    maxLength={50}
                    required
                  />
                </label>

                {error && <div className="alert alert-error">{error}</div>}

                <button
                  className="primary-button auth-submit"
                  disabled={cargando}
                >
                  {cargando ? (
                    <LoaderCircle className="spin" size={19} />
                  ) : (
                    <LogIn size={18} />
                  )}
                  {cargando ? "Ingresando..." : "Entrar a la partida"}
                </button>
              </form>
            </>
          ) : (
            <div className="lobby-jugador">
              <div className="mini-logo">
                <CheckCircle2 size={25} />
              </div>

              <div className="eyebrow">¡YA ESTÁS DENTRO!</div>
              <h2>¡Bienvenido, {participante.nombre_visible}!</h2>

              <p className="auth-card-subtitle">Te has unido a la partida:</p>

              <h3>{partida.titulo}</h3>

              <div className="lobby-espera">
                <Users size={30} />
                <strong>Esperando al anfitrión...</strong>
                <span>
                  Cuando comience el juego, aquí continuará tu experiencia.
                </span>
              </div>

              <p className="lobby-codigo">
                Código: <strong>{partida.codigo}</strong>
              </p>

              {error && <div className="alert alert-error">{error}</div>}
            </div>
          )}

          <div className="auth-footer">
            <span className="status-dot" />
            QUIZING · APRENDER JUGANDO
          </div>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("quizing_token") || "",
  );
  const [usuario, setUsuario] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("quizing_usuario")) || null;
    } catch {
      return null;
    }
  });

  const [modo, setModo] = useState("login");
  const [formAuth, setFormAuth] = useState({
    nombre: "",
    correo: "",
    password: "",
  });
  const [cuestionarios, setCuestionarios] = useState([]);
  const [formQuiz, setFormQuiz] = useState({
    titulo: "",
    descripcion: "",
    categoria: "Informática",
  });

  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [creandoSala, setCreandoSala] = useState(false);
  const [salaActual, setSalaActual] = useState(null);
  const [participantesSala, setParticipantesSala] = useState([]);

  const [quizEditando, setQuizEditando] = useState(null);
  const [reactivos, setReactivos] = useState([]);
  const [cargandoEditor, setCargandoEditor] = useState(false);
  const [reactivoEditando, setReactivoEditando] = useState(null);
  const [formReactivo, setFormReactivo] = useState({
    enunciado: "",
    tiempo_limite_segundos: 20,
    puntos: 1000,
    opciones: [
      { texto: "", es_correcta: true },
      { texto: "", es_correcta: false },
      { texto: "", es_correcta: false },
      { texto: "", es_correcta: false },
    ],
  });

  const guardarSesion = (data) => {
    const nuevoToken = data.token;
    const nuevoUsuario = data.usuario;

    localStorage.setItem("quizing_token", nuevoToken);
    localStorage.setItem("quizing_usuario", JSON.stringify(nuevoUsuario));

    setToken(nuevoToken);
    setUsuario(nuevoUsuario);
    setError("");
    setMensaje("");
  };

  const cerrarSesion = () => {
    localStorage.removeItem("quizing_token");
    localStorage.removeItem("quizing_usuario");
    setToken("");
    setUsuario(null);
    setCuestionarios([]);
    setMostrarCrear(false);
    setError("");
    setMensaje("");
  };

  const cargarCuestionarios = async (credencial = token) => {
    setCargandoLista(true);
    setError("");

    try {
      const { data } = await api.get("/cuestionarios", {
        headers: { Authorization: `Bearer ${credencial}` },
      });

      setCuestionarios(Array.isArray(data) ? data : data.cuestionarios || []);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        cerrarSesion();
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
      } else {
        setError(
          err.response?.data?.message ||
            "No se pudieron cargar los cuestionarios.",
        );
      }
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    if (!salaActual?.codigo || !salaActual?.id) {
      setParticipantesSala([]);
      return;
    }

    const socket = io("http://localhost:3000");

    socket.on("connect", () => {
      socket.emit("entrar-sala", {
        codigo: String(salaActual.codigo),
      });
    });

    socket.on("participantes-actualizados", (data) => {
      if (String(data.partidaId) === String(salaActual.id)) {
        setParticipantesSala(data.participantes || []);
      }
    });

    socket.on("error-sala", (data) => {
      setError(data.message || "No se pudo conectar con la sala.");
    });

    return () => {
      socket.disconnect();
    };
  }, [salaActual?.id, salaActual?.codigo]);

  useEffect(() => {
    if (token) cargarCuestionarios(token);
  }, [token]);

  useEffect(() => {
    if (!quizEditando) return;

    const manejarEscape = (e) => {
      if (e.key === "Escape") {
        setQuizEditando(null);
        setReactivoEditando(null);
        setError("");
        setMensaje("");
      }
    };

    window.addEventListener("keydown", manejarEscape);

    return () => {
      window.removeEventListener("keydown", manejarEscape);
    };
  }, [quizEditando]);

  const autenticar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError("");
    setMensaje("");

    try {
      const endpoint = modo === "login" ? "/auth/login" : "/auth/registro";
      const { data } = await api.post(endpoint, formAuth);
      guardarSesion(data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No fue posible completar la operación. Revisa los datos y el backend.",
      );
    } finally {
      setCargando(false);
    }
  };

  const crearCuestionario = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError("");
    setMensaje("");

    try {
      const { data } = await api.post("/cuestionarios", formQuiz, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setFormQuiz({
        titulo: "",
        descripcion: "",
        categoria: "Informática",
      });
      setMostrarCrear(false);
      setMensaje("¡Cuestionario creado! Ahora puedes agregar sus preguntas.");

      await cargarCuestionarios();

      // Si la respuesta incluye el cuestionario recién creado, úsala
      // para mostrar un mensaje más informativo.
      if (data.cuestionario?.titulo) {
        setMensaje(`¡"${data.cuestionario.titulo}" está creado!`);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "No se pudo crear el cuestionario.",
      );
    } finally {
      setCargando(false);
    }
  };

  const publicarCuestionario = async (id) => {
    setError("");
    setMensaje("");

    try {
      await api.post(
        `/cuestionarios/${id}/publicar`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setMensaje("¡Cuestionario publicado correctamente!");
      await cargarCuestionarios();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo publicar. Comprueba que tenga preguntas y opciones válidas.",
      );
    }
  };

  const crearSala = async (quiz) => {
    setError("");
    setMensaje("");
    setCreandoSala(true);

    try {
      const { data } = await api.post(
        "/partidas",
        { cuestionario_id: quiz.id },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setSalaActual(data.partida);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo crear la sala. Inténtalo de nuevo.",
      );
    } finally {
      setCreandoSala(false);
    }
  };

  const eliminarCuestionario = async (quiz) => {
    if (
      !window.confirm(
        `¿Seguro que quieres eliminar "${quiz.titulo}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setError("");
    setMensaje("");

    try {
      await api.delete(`/cuestionarios/${quiz.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setCuestionarios((actuales) =>
        actuales.filter((q) => String(q.id) !== String(quiz.id)),
      );
      setMensaje("Cuestionario eliminado.");
    } catch (err) {
      setError(
        err.response?.data?.message || "No se pudo eliminar el cuestionario.",
      );
    }
  };

  const abrirEditor = async (quiz) => {
    setQuizEditando(quiz);
    setReactivoEditando(null);
    setError("");
    setMensaje("");
    setCargandoEditor(true);

    try {
      const { data } = await api.get(`/cuestionarios/${quiz.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const lista = Array.isArray(data.reactivos)
        ? data.reactivos
        : Array.isArray(data.cuestionario?.reactivos)
          ? data.cuestionario.reactivos
          : [];

      setReactivos(lista);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudieron cargar las preguntas del cuestionario.",
      );
      setQuizEditando(null);
    } finally {
      setCargandoEditor(false);
    }
  };

  const prepararEdicionReactivo = (reactivo) => {
    setReactivoEditando(reactivo);
    setFormReactivo({
      enunciado: reactivo.enunciado || "",
      tiempo_limite_segundos: reactivo.tiempo_limite_segundos || 20,
      puntos: reactivo.puntos ?? 1000,
      opciones: Array.from({ length: 4 }, (_, i) => ({
        texto: reactivo.opciones?.[i]?.texto || "",
        es_correcta: Boolean(reactivo.opciones?.[i]?.es_correcta),
      })).map((opcion, i, opciones) => ({
        ...opcion,
        es_correcta: opciones.some((o) => o.es_correcta)
          ? opcion.es_correcta
          : i === 0,
      })),
    });

    setError("");
    setMensaje("");
  };

  const guardarReactivo = async (e) => {
    e.preventDefault();

    if (!quizEditando) return;

    const opciones = formReactivo.opciones.map((opcion) => ({
      texto: opcion.texto.trim(),
      es_correcta: opcion.es_correcta,
    }));

    if (!formReactivo.enunciado.trim()) {
      setError("Escribe el enunciado de la pregunta.");
      return;
    }

    if (opciones.some((opcion) => !opcion.texto)) {
      setError("Completa las cuatro opciones de respuesta.");
      return;
    }

    if (opciones.filter((opcion) => opcion.es_correcta).length !== 1) {
      setError("Selecciona exactamente una respuesta correcta.");
      return;
    }

    setCargando(true);
    setError("");
    setMensaje("");

    const payload = {
      enunciado: formReactivo.enunciado.trim(),
      tiempo_limite_segundos: Number(formReactivo.tiempo_limite_segundos),
      puntos: Number(formReactivo.puntos),
      opciones,
    };

    try {
      if (reactivoEditando) {
        await api.put(
          `/cuestionarios/${quizEditando.id}/reactivos/${reactivoEditando.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        await api.post(`/cuestionarios/${quizEditando.id}/reactivos`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      const eraEdicion = Boolean(reactivoEditando);
      setReactivoEditando(null);
      setFormReactivo({
        enunciado: "",
        tiempo_limite_segundos: 20,
        puntos: 1000,
        opciones: [
          { texto: "", es_correcta: true },
          { texto: "", es_correcta: false },
          { texto: "", es_correcta: false },
          { texto: "", es_correcta: false },
        ],
      });

      await abrirEditor(quizEditando);
      await cargarCuestionarios();
      setMensaje(eraEdicion ? "Pregunta actualizada." : "¡Pregunta agregada!");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo guardar la pregunta. Revisa los datos e inténtalo de nuevo.",
      );
    } finally {
      setCargando(false);
    }
  };

  const eliminarReactivo = async (reactivo) => {
    if (!window.confirm(`¿Eliminar la pregunta "${reactivo.enunciado}"?`)) {
      return;
    }

    setError("");
    setMensaje("");

    try {
      await api.delete(
        `/cuestionarios/${quizEditando.id}/reactivos/${reactivo.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setReactivos((actuales) =>
        actuales.filter((r) => String(r.id) !== String(reactivo.id)),
      );

      if (String(reactivoEditando?.id) === String(reactivo.id)) {
        setReactivoEditando(null);
      }

      setMensaje("Pregunta eliminada.");
      await cargarCuestionarios();
    } catch (err) {
      setError(
        err.response?.data?.message || "No se pudo eliminar la pregunta.",
      );
    }
  };

  const cambiarOpcion = (indice, campo, valor) => {
    setFormReactivo((actual) => ({
      ...actual,
      opciones: actual.opciones.map((opcion, i) => ({
        ...opcion,
        [campo]:
          campo === "es_correcta"
            ? i === indice && valor
            : i === indice
              ? valor
              : opcion[campo],
      })),
    }));
  };

  const actualizarAuth = (e) => {
    setFormAuth({ ...formAuth, [e.target.name]: e.target.value });
  };
  if (window.location.pathname === "/unirse") {
    return <PantallaUnirse />;
  }
  if (!token) {
    return (
      <main className="auth-page">
        <div className="auth-glow auth-glow-one" />
        <div className="auth-glow auth-glow-two" />

        <header className="brand auth-brand">
          <div className="brand-icon">
            <BrainCircuit size={28} />
          </div>
          <span>
            quiz<span className="brand-accent">ing</span>
          </span>
        </header>

        <section className="auth-layout">
          <div className="auth-presentation">
            <div className="eyebrow">
              <Sparkles size={15} /> APRENDE JUGANDO
            </div>

            <h1>
              El conocimiento
              <br />
              también puede ser
              <br />
              <span className="gradient-text">una aventura.</span>
            </h1>

            <p className="auth-description">
              Crea tus propios cuestionarios, reta a tus amigos y demuestra lo
              que sabes. Tu siguiente partida comienza aquí.
            </p>

            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon purple">
                  <BookOpen size={19} />
                </span>
                <div>
                  <strong>Tus propios cuestionarios</strong>
                  <span>Crea retos sobre cualquier tema.</span>
                </div>
              </div>

              <div className="feature-item">
                <span className="feature-icon green">
                  <Trophy size={19} />
                </span>
                <div>
                  <strong>Compite y aprende</strong>
                  <span>Prepárate para poner a prueba tus conocimientos.</span>
                </div>
              </div>
            </div>

            <div className="auth-decoration">
              <div className="decoration-card decoration-one">
                <CircleHelp size={22} />
                <span>¿Listo para el reto?</span>
              </div>
              <div className="decoration-card decoration-two">
                <Trophy size={24} />
                <strong>¡Tú puedes!</strong>
              </div>
              <div className="decoration-orbit">✦</div>
            </div>
          </div>

          <div className="auth-card">
            <div className="auth-card-top">
              <div className="mini-logo">
                {modo === "login" ? (
                  <LogIn size={22} />
                ) : (
                  <UserPlus size={22} />
                )}
              </div>
              <span className="card-kicker">TU ESPACIO DE APRENDIZAJE</span>
            </div>

            <h2>
              {modo === "login" ? "¡Qué bueno verte!" : "Únete a Quizing"}
            </h2>
            <p className="auth-card-subtitle">
              {modo === "login"
                ? "Inicia sesión para continuar."
                : "Crea tu cuenta y empieza a jugar."}
            </p>

            <form className="auth-form" onSubmit={autenticar}>
              {modo === "registro" && (
                <label>
                  Nombre
                  <input
                    name="nombre"
                    type="text"
                    placeholder="¿Cómo te llamas?"
                    value={formAuth.nombre}
                    onChange={actualizarAuth}
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    required
                  />
                </label>
              )}

              <label>
                Correo electrónico
                <input
                  name="correo"
                  type="email"
                  placeholder="tu@correo.com"
                  value={formAuth.correo}
                  onChange={actualizarAuth}
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  placeholder={
                    modo === "registro"
                      ? "Mínimo 8 caracteres"
                      : "Escribe tu contraseña"
                  }
                  value={formAuth.password}
                  onChange={actualizarAuth}
                  minLength={modo === "registro" ? 8 : undefined}
                  autoComplete={
                    modo === "login" ? "current-password" : "new-password"
                  }
                  required
                />
              </label>

              {error && <div className="alert alert-error">{error}</div>}

              <button
                className="primary-button auth-submit"
                disabled={cargando}
              >
                {cargando ? (
                  <LoaderCircle className="spin" size={19} />
                ) : modo === "login" ? (
                  <LogIn size={18} />
                ) : (
                  <UserPlus size={18} />
                )}
                {cargando
                  ? "Un momento..."
                  : modo === "login"
                    ? "Iniciar sesión"
                    : "Crear mi cuenta"}
              </button>
            </form>

            <div className="auth-switch">
              {modo === "login"
                ? "¿Aún no tienes cuenta?"
                : "¿Ya tienes cuenta?"}
              <button
                type="button"
                onClick={() => {
                  setModo(modo === "login" ? "registro" : "login");
                  setError("");
                }}
              >
                {modo === "login" ? "Regístrate" : "Inicia sesión"}
              </button>
            </div>

            <div className="auth-footer">
              <span className="status-dot" /> Tu espacio para aprender y jugar
            </div>
          </div>
        </section>

        <footer className="page-footer">
          QUIZING © 2026 <span>·</span> APRENDER NUNCA FUE TAN DIVERTIDO
        </footer>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <aside className="sidebar">
        <a
          className="brand sidebar-brand"
          href="#"
          onClick={(e) => e.preventDefault()}
        >
          <div className="brand-icon">
            <BrainCircuit size={25} />
          </div>
          <span>
            quiz<span className="brand-accent">ing</span>
          </span>
        </a>

        <div className="sidebar-section-label">ESPACIO DE TRABAJO</div>
        <div className="sidebar-link active">
          <Layers3 size={19} /> Mis cuestionarios
        </div>
        <div className="sidebar-link">
          <Trophy size={19} /> Zona de juego
          <span className="soon-tag">PRONTO</span>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <Sparkles size={19} />
            <strong>¡Sigue aprendiendo!</strong>
            <span>Crea tu próximo reto y comparte tus conocimientos.</span>
          </div>
          <div className="profile-row">
            <div className="avatar">
              {(usuario?.nombre || "Q").charAt(0).toUpperCase()}
            </div>
            <div className="profile-info">
              <strong>{usuario?.nombre || "Usuario"}</strong>
              <span>{usuario?.correo || ""}</span>
            </div>
            <button
              className="icon-button logout-button"
              onClick={cerrarSesion}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="breadcrumb">
            Mi espacio <span>/</span> <strong>Cuestionarios</strong>
          </div>
          <div className="topbar-right">
            <span className="online-label">
              <span className="status-dot" /> Sesión activa
            </span>
            <div className="avatar small">
              {(usuario?.nombre || "Q").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          {salaActual && (
            <div
              className="editor-modal-overlay"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  setSalaActual(null);
                }
              }}
            >
              <section
                className="editor-panel sala-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sala-titulo"
              >
                <div className="editor-top">
                  <div className="editor-title">
                    <div className="panel-icon">
                      <Trophy size={22} />
                    </div>

                    <div>
                      <div className="eyebrow">
                        <Sparkles size={14} /> SALA DE JUEGO
                      </div>
                      <h2 id="sala-titulo">¡Tu sala está lista!</h2>
                      <p>{salaActual.titulo}</p>
                    </div>
                  </div>

                  <button
                    className="icon-button"
                    onClick={() => setSalaActual(null)}
                    aria-label="Cerrar sala"
                  >
                    <X size={19} />
                  </button>
                </div>

                <div className="sala-contenido">
                  <p>
                    Comparte este código con los jugadores para que puedan
                    unirse.
                  </p>

                  <div className="sala-codigo">{salaActual.codigo}</div>

                  <button
                    className="primary-button"
                    onClick={() => {
                      navigator.clipboard.writeText(String(salaActual.codigo));
                      setMensaje("Código de sala copiado.");
                    }}
                  >
                    <BookOpen size={18} />
                    Copiar código
                  </button>

                  <div className="sala-detalles">
                    <span>
                      <CircleHelp size={17} />
                      {salaActual.total_preguntas} preguntas
                    </span>

                    <span>
                      <CheckCircle2 size={17} />
                      Esperando jugadores
                    </span>
                  </div>

                  <div className="participantes-sala">
                    <div className="participantes-sala-heading">
                      <div>
                        <h3>Jugadores conectados</h3>
                        <p>Los participantes aparecerán aquí al unirse.</p>
                      </div>

                      <span className="participantes-contador">
                        {participantesSala.length}
                      </span>
                    </div>

                    {participantesSala.length === 0 ? (
                      <div className="participantes-vacio">
                        <Users size={25} />
                        <span>Esperando al primer jugador...</span>
                      </div>
                    ) : (
                      <div className="participantes-lista">
                        {participantesSala.map((participante, index) => (
                          <div
                            className="participante-item"
                            key={participante.id}
                          >
                            <div className="participante-avatar">
                              {participante.nombre_visible
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <span>{participante.nombre_visible}</span>

                            <span className="participante-numero">
                              #{index + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <Sparkles size={15} /> TU CENTRO DE APRENDIZAJE
              </div>
              <h1>
                ¡Hola, {usuario?.nombre?.split(" ")[0] || "explorador"}!{" "}
                <span>✦</span>
              </h1>
              <p>¿Qué conocimiento vamos a poner a prueba hoy?</p>
            </div>
            <button
              className="primary-button create-button"
              onClick={() => {
                setMostrarCrear(!mostrarCrear);
                setError("");
                setMensaje("");
              }}
            >
              {mostrarCrear ? <X size={19} /> : <Plus size={20} />}
              {mostrarCrear ? "Cancelar" : "Crear cuestionario"}
            </button>
          </div>

          {error && (
            <div className="alert alert-error dashboard-alert">{error}</div>
          )}
          {mensaje && (
            <div className="alert alert-success dashboard-alert">
              <CheckCircle2 size={18} /> {mensaje}
              <button
                onClick={() => setMensaje("")}
                aria-label="Cerrar mensaje"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {mostrarCrear && (
            <section className="create-panel">
              <div className="panel-heading">
                <div className="panel-icon">
                  <Plus size={20} />
                </div>
                <div>
                  <h2>Un nuevo reto</h2>
                  <p>Dale forma a tu próximo cuestionario.</p>
                </div>
              </div>

              <form className="create-form" onSubmit={crearCuestionario}>
                <label>
                  Nombre del cuestionario
                  <input
                    value={formQuiz.titulo}
                    onChange={(e) =>
                      setFormQuiz({ ...formQuiz, titulo: e.target.value })
                    }
                    placeholder="Ej. Olimpiada del Conocimiento Informático"
                    maxLength={150}
                    required
                  />
                </label>

                <label>
                  Categoría
                  <select
                    value={formQuiz.categoria}
                    onChange={(e) =>
                      setFormQuiz({ ...formQuiz, categoria: e.target.value })
                    }
                  >
                    <option>Informática</option>
                    <option>Ciencias</option>
                    <option>Matemáticas</option>
                    <option>Historia</option>
                    <option>Idiomas</option>
                    <option>Cultura general</option>
                    <option>Otro</option>
                  </select>
                </label>

                <label className="full-field">
                  Descripción <span className="optional-label">OPCIONAL</span>
                  <textarea
                    value={formQuiz.descripcion}
                    onChange={(e) =>
                      setFormQuiz({ ...formQuiz, descripcion: e.target.value })
                    }
                    placeholder="¿De qué trata tu cuestionario?"
                    rows={3}
                    maxLength={500}
                  />
                </label>

                <button className="primary-button" disabled={cargando}>
                  {cargando ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Send size={17} />
                  )}
                  {cargando ? "Creando..." : "Crear cuestionario"}
                </button>
              </form>
            </section>
          )}
          {quizEditando && (
            <div
              className="editor-modal-overlay"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  setQuizEditando(null);
                  setReactivoEditando(null);
                  setError("");
                  setMensaje("");
                }
              }}
            >
              <section className="editor-panel">
                <div className="editor-top">
                  <div className="editor-title">
                    <button
                      className="icon-button"
                      onClick={() => {
                        setQuizEditando(null);
                        setReactivoEditando(null);
                        setError("");
                        setMensaje("");
                      }}
                      aria-label="Volver al dashboard"
                      title="Volver"
                    >
                      <X size={18} />
                    </button>

                    <div>
                      <div className="eyebrow">
                        <BookOpen size={14} /> EDITOR DE CUESTIONARIOS
                      </div>
                      <h2>{quizEditando.titulo}</h2>
                      <p>Diseña las preguntas de tu próximo reto.</p>
                    </div>
                  </div>

                  <span className="count-pill">
                    {reactivos.length} preguntas
                  </span>
                </div>

                {error && <div className="alert alert-error">{error}</div>}
                {mensaje && (
                  <div className="alert alert-success">
                    <CheckCircle2 size={17} /> {mensaje}
                  </div>
                )}

                {cargandoEditor ? (
                  <div className="empty-state">
                    <LoaderCircle className="spin" size={28} />
                    <p>Cargando preguntas...</p>
                  </div>
                ) : (
                  <div className="editor-grid">
                    <div className="question-list">
                      <div className="question-list-heading">
                        <h3>Preguntas del cuestionario</h3>
                        <button
                          className="primary-button"
                          onClick={() => {
                            setReactivoEditando(null);
                            setFormReactivo({
                              enunciado: "",
                              tiempo_limite_segundos: 20,
                              puntos: 1000,
                              opciones: [
                                { texto: "", es_correcta: true },
                                { texto: "", es_correcta: false },
                                { texto: "", es_correcta: false },
                                { texto: "", es_correcta: false },
                              ],
                            });
                            setError("");
                            setMensaje("");
                          }}
                        >
                          <Plus size={17} /> Nueva pregunta
                        </button>
                      </div>

                      {reactivos.length === 0 ? (
                        <div className="question-empty">
                          <CircleHelp size={28} />
                          <strong>Aún no hay preguntas</strong>
                          <span>Agrega la primera para comenzar.</span>
                        </div>
                      ) : (
                        <div className="question-list-items">
                          {reactivos.map((reactivo, index) => (
                            <article
                              className="question-item"
                              key={reactivo.id}
                            >
                              <div className="question-number">
                                {String(index + 1).padStart(2, "0")}
                              </div>

                              <div className="question-item-info">
                                <strong>{reactivo.enunciado}</strong>
                                <span>
                                  {reactivo.opciones?.length || 0} opciones ·{" "}
                                  {reactivo.tiempo_limite_segundos || 20}{" "}
                                  segundos · {reactivo.puntos ?? 1000} puntos
                                </span>
                              </div>

                              <button
                                className="icon-button"
                                title="Editar pregunta"
                                aria-label="Editar pregunta"
                                onClick={() =>
                                  prepararEdicionReactivo(reactivo)
                                }
                              >
                                <BookOpen size={16} />
                              </button>

                              <button
                                className="icon-button delete-button"
                                title="Eliminar pregunta"
                                aria-label="Eliminar pregunta"
                                onClick={() => eliminarReactivo(reactivo)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>

                    <form className="question-form" onSubmit={guardarReactivo}>
                      <div className="question-form-heading">
                        <div className="panel-icon">
                          {reactivoEditando ? (
                            <BookOpen size={20} />
                          ) : (
                            <Plus size={20} />
                          )}
                        </div>
                        <div>
                          <h3>
                            {reactivoEditando
                              ? "Editar pregunta"
                              : "Nueva pregunta"}
                          </h3>
                          <p>Cuatro opciones, una respuesta correcta.</p>
                        </div>
                      </div>

                      <label>
                        Enunciado
                        <textarea
                          rows={3}
                          maxLength={1000}
                          placeholder="Escribe aquí tu pregunta..."
                          value={formReactivo.enunciado}
                          onChange={(e) =>
                            setFormReactivo({
                              ...formReactivo,
                              enunciado: e.target.value,
                            })
                          }
                          required
                        />
                      </label>

                      <div className="options-heading">
                        <span>Opciones de respuesta</span>
                        <span>Marca la correcta</span>
                      </div>

                      <div className="answer-options">
                        {formReactivo.opciones.map((opcion, index) => (
                          <div
                            className={`answer-option ${opcion.es_correcta ? "answer-correct" : ""}`}
                            key={index}
                          >
                            <span className="answer-letter">
                              {String.fromCharCode(65 + index)}
                            </span>

                            <input
                              type="text"
                              placeholder={`Opción ${index + 1}`}
                              value={opcion.texto}
                              maxLength={500}
                              onChange={(e) =>
                                cambiarOpcion(index, "texto", e.target.value)
                              }
                              required
                            />

                            <label
                              className="correct-radio"
                              title="Marcar como respuesta correcta"
                            >
                              <input
                                type="radio"
                                name="respuesta-correcta"
                                checked={opcion.es_correcta}
                                onChange={() =>
                                  cambiarOpcion(index, "es_correcta", true)
                                }
                              />
                              <CheckCircle2 size={18} />
                            </label>
                          </div>
                        ))}
                      </div>

                      <div className="question-settings">
                        <label>
                          <span>
                            <Clock3 size={14} /> Tiempo (segundos)
                          </span>
                          <select
                            value={formReactivo.tiempo_limite_segundos}
                            onChange={(e) =>
                              setFormReactivo({
                                ...formReactivo,
                                tiempo_limite_segundos: Number(e.target.value),
                              })
                            }
                          >
                            {[5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300].map(
                              (s) => (
                                <option key={s} value={s}>
                                  {s} segundos
                                </option>
                              ),
                            )}
                          </select>
                        </label>

                        <label>
                          <span>
                            <Trophy size={14} /> Puntos
                          </span>
                          <select
                            value={formReactivo.puntos}
                            onChange={(e) =>
                              setFormReactivo({
                                ...formReactivo,
                                puntos: Number(e.target.value),
                              })
                            }
                          >
                            {[0, 100, 250, 500, 750, 1000, 1500, 2000].map(
                              (p) => (
                                <option key={p} value={p}>
                                  {p} puntos
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>

                      <div className="question-form-actions">
                        {reactivoEditando && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setReactivoEditando(null);
                              setFormReactivo({
                                enunciado: "",
                                tiempo_limite_segundos: 20,
                                puntos: 1000,
                                opciones: [
                                  { texto: "", es_correcta: true },
                                  { texto: "", es_correcta: false },
                                  { texto: "", es_correcta: false },
                                  { texto: "", es_correcta: false },
                                ],
                              });
                              setError("");
                            }}
                          >
                            Cancelar
                          </button>
                        )}

                        <button className="primary-button" disabled={cargando}>
                          {cargando ? (
                            <LoaderCircle size={17} className="spin" />
                          ) : (
                            <CheckCircle2 size={17} />
                          )}
                          {cargando
                            ? "Guardando..."
                            : reactivoEditando
                              ? "Guardar cambios"
                              : "Agregar pregunta"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </section>{" "}
            </div>
          )}

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon purple">
                <BookOpen size={21} />
              </div>
              <div>
                <span>Mis cuestionarios</span>
                <strong>{cuestionarios.length}</strong>
              </div>
              <div className="stat-decoration">01</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">
                <CheckCircle2 size={21} />
              </div>
              <div>
                <span>Publicados</span>
                <strong>
                  {cuestionarios.filter((q) => q.publicado).length}
                </strong>
              </div>
              <div className="stat-decoration">02</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange">
                <Clock3 size={21} />
              </div>
              <div>
                <span>En preparación</span>
                <strong>
                  {cuestionarios.filter((q) => !q.publicado).length}
                </strong>
              </div>
              <div className="stat-decoration">03</div>
            </div>
          </div>

          <div className="section-heading">
            <div>
              <h2>
                Tu biblioteca <span className="heading-sparkle">✦</span>
              </h2>
              <p>Todos tus retos, organizados en un solo lugar.</p>
            </div>
            <span className="count-pill">
              {cuestionarios.length} cuestionarios
            </span>
          </div>

          {cargandoLista ? (
            <div className="empty-state">
              <LoaderCircle className="spin" size={30} />
              <p>Cargando tu biblioteca...</p>
            </div>
          ) : cuestionarios.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <BookOpen size={30} />
              </div>
              <h3>Tu biblioteca comienza aquí</h3>
              <p>
                Crea tu primer cuestionario y prepara un reto para compartir.
              </p>
              <button
                className="primary-button"
                onClick={() => setMostrarCrear(true)}
              >
                <Plus size={18} /> Crear mi primer cuestionario
              </button>
            </div>
          ) : (
            <div className="quiz-grid">
              {cuestionarios.map((quiz, index) => (
                <article className="quiz-card" key={quiz.id}>
                  <div className={`quiz-card-art art-${index % 4}`}>
                    <div className="quiz-art-number">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="quiz-art-symbol">
                      {index % 4 === 0 ? (
                        <BrainCircuit size={39} />
                      ) : index % 4 === 1 ? (
                        <Sparkles size={39} />
                      ) : index % 4 === 2 ? (
                        <BookOpen size={39} />
                      ) : (
                        <Trophy size={39} />
                      )}
                    </div>
                    <span
                      className={`status-badge ${quiz.publicado ? "published" : "draft"}`}
                    >
                      <span /> {quiz.publicado ? "Publicado" : "Borrador"}
                    </span>
                  </div>

                  <div className="quiz-card-body">
                    <span className="quiz-category">
                      {quiz.categoria || "General"}
                    </span>
                    <h3>{quiz.titulo}</h3>
                    <p className="quiz-description">
                      {quiz.descripcion ||
                        "Un cuestionario listo para poner a prueba tus conocimientos."}
                    </p>
                    <div className="quiz-card-meta">
                      <span>
                        <CircleHelp size={15} /> {quiz.total_reactivos ?? 0}{" "}
                        preguntas
                      </span>
                    </div>
                    <div className="quiz-card-actions">
                      {quiz.publicado && (
                        <button
                          className="primary-button publish-button"
                          onClick={() => crearSala(quiz)}
                          disabled={creandoSala}
                        >
                          {creandoSala ? (
                            <LoaderCircle className="spin" size={16} />
                          ) : (
                            <Trophy size={16} />
                          )}
                          {creandoSala ? "Creando sala..." : "Crear sala"}
                        </button>
                      )}
                      <button
                        className="secondary-button edit-quiz-button"
                        onClick={() => abrirEditor(quiz)}
                      >
                        <BookOpen size={16} />
                        Preguntas
                      </button>

                      {!quiz.publicado && (
                        <button
                          className="primary-button publish-button"
                          onClick={() => publicarCuestionario(quiz.id)}
                        >
                          <CheckCircle2 size={16} /> Publicar
                        </button>
                      )}
                      <button
                        className="icon-button delete-button"
                        onClick={() => eliminarCuestionario(quiz)}
                        title="Eliminar cuestionario"
                        aria-label={`Eliminar ${quiz.titulo}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <footer className="dashboard-footer">
            <span>QUIZING © 2026</span>
            <span>
              Aprende · Crea · Compite <span className="footer-star">✦</span>
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}

export default App;
