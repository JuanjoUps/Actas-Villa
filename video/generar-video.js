/**
 * Graba en vídeo (.mp4) la animación de cada partido cuyo resultado
 * ya se ha extraído (resultados-partidos/resultado-<codacta>.json)
 * y que todavía no tiene vídeo generado.
 *
 * Usa Playwright para reproducir video/index.html en un navegador
 * real y grabar la sesión — así el .mp4 es EXACTAMENTE lo que se ve
 * en pantalla, sin tener que reconstruir la animación fotograma a
 * fotograma.
 *
 * Arranca su propio servidor local (server.js) para poder cargar
 * la página y los JSON con fetch(), y lo para al terminar.
 *
 * USO:
 *   node generar-video.js
 *
 * Salida:
 *   videos-generados/resultado-<codacta>.mp4   (uno por partido)
 *   video-pendiente.json                        (si se generó algo,
 *                                                 lo usa el workflow
 *                                                 para decidir si
 *                                                 manda el email, e
 *                                                 incluye el rival y
 *                                                 su Instagram para
 *                                                 poder mencionarlo)
 *
 * Lleva su propio registro en estado-videos.json para no volver a
 * grabar un partido ya procesado.
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

ffmpeg.setFfmpegPath(ffmpegPath);

const RAIZ_REPO = path.join(__dirname, "..");
const { crearServidor } = require(path.join(RAIZ_REPO, "server.js"));

// ============================================================
// CONFIGURACIÓN
// ============================================================

const ANCHO = 1080;
const ALTO = 1920; // formato historia de Instagram (9:16)
const PUERTO = 8090;
const TIMEOUT_ANIMACION_MS = 60000;

const RESULTADOS_DIR = path.join(RAIZ_REPO, "resultados-partidos");
const VIDEOS_DIR = path.join(RAIZ_REPO, "videos-generados");
const ESTADO_VIDEOS_PATH = path.join(RAIZ_REPO, "estado-videos.json");
const VIDEO_PENDIENTE_PATH = path.join(RAIZ_REPO, "video-pendiente.json");

// Mapeo equipo rival -> @usuario de Instagram (ver proyecto rivales-instagram.json)
const RIVALES_INSTAGRAM_PATH = path.join(RAIZ_REPO, "rivales-instagram.json");

// ============================================================
// ESTADO (qué codacta ya tiene vídeo generado)
// ============================================================

function cargarEstadoVideos() {
  if (!fs.existsSync(ESTADO_VIDEOS_PATH)) return {};
  return JSON.parse(fs.readFileSync(ESTADO_VIDEOS_PATH, "utf-8"));
}

function guardarEstadoVideos(estado) {
  fs.writeFileSync(ESTADO_VIDEOS_PATH, JSON.stringify(estado, null, 2));
}

// ============================================================
// MENCIÓN DE INSTAGRAM DEL RIVAL
// ============================================================

function cargarRivalesInstagram() {
  if (!fs.existsSync(RIVALES_INSTAGRAM_PATH)) {
    console.log(
      "⚠️ No existe rivales-instagram.json — no se añadirán menciones."
    );
    return {};
  }
  return JSON.parse(fs.readFileSync(RIVALES_INSTAGRAM_PATH, "utf-8"));
}

/**
 * Lee resultados-partidos/resultado-<codacta>.json para sacar el
 * nombre del rival de ESE partido concreto.
 *
 * OJO: el nombre tiene que coincidir EXACTAMENTE (mismas mayúsculas,
 * comillas, espacios) con la clave usada en rivales-instagram.json,
 * o no encontrará la mención (sin dar error, simplemente no la pondrá).
 */
function obtenerRivalDeResultado(codacta) {
  const ruta = path.join(RESULTADOS_DIR, `resultado-${codacta}.json`);

  if (!fs.existsSync(ruta)) return null;

  try {
    const datos = JSON.parse(fs.readFileSync(ruta, "utf-8"));
    return datos.rival || null;
  } catch (err) {
    console.log(`⚠️ No se pudo leer el rival de ${ruta}: ${err.message}`);
    return null;
  }
}

// ============================================================
// Graba un partido concreto y devuelve la ruta del .mp4
// ============================================================

async function grabarPartido(browser, codacta) {
  const dirTemporal = path.join(VIDEOS_DIR, `_tmp-${codacta}`);
  fs.mkdirSync(dirTemporal, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: ANCHO, height: ALTO },
    recordVideo: {
      dir: dirTemporal,
      size: { width: ANCHO, height: ALTO },
    },
  });

  const page = await context.newPage();

  await page.goto(
    `http://localhost:${PUERTO}/video/index.html?codacta=${codacta}`
  );

  await page.waitForFunction("window.__terminado === true", {
    timeout: TIMEOUT_ANIMACION_MS,
  });

  const video = page.video();
  await page.close();
  await context.close();

  const rutaWebm = await video.path();

  const rutaMp4 = path.join(VIDEOS_DIR, `resultado-${codacta}.mp4`);

  await new Promise((resolve, reject) => {
    ffmpeg(rutaWebm)
      .outputOptions(["-pix_fmt yuv420p"]) // compatibilidad con Instagram
      .output(rutaMp4)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });

  fs.rmSync(dirTemporal, { recursive: true, force: true });

  return rutaMp4;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  if (!fs.existsSync(RESULTADOS_DIR)) {
    console.log("No hay resultados-partidos/ todavía. Nada que grabar.");
    return;
  }

  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR);
  }

  const estadoVideos = cargarEstadoVideos();
  const rivalesInstagram = cargarRivalesInstagram();

  const codactas = fs
    .readdirSync(RESULTADOS_DIR)
    .filter((f) => f.startsWith("resultado-") && f.endsWith(".json"))
    .map((f) => f.replace("resultado-", "").replace(".json", ""))
    .filter((codacta) => !estadoVideos[codacta]);

  console.log(`Partidos con resultado y sin vídeo: ${codactas.length}`);

  if (codactas.length === 0) {
    console.log("Nada nuevo que grabar.");
    return;
  }

  // Arrancamos el servidor local que sirve la página del vídeo y
  // los JSON de resultados.
  const servidor = crearServidor(RAIZ_REPO);
  await new Promise((resolve) => servidor.listen(PUERTO, resolve));
  console.log(`Servidor local arrancado en el puerto ${PUERTO}`);

  const browser = await chromium.launch();

  const generados = [];

  for (const codacta of codactas) {
    console.log(`\nGrabando vídeo del partido ${codacta}...`);

    try {
      const rutaMp4 = await grabarPartido(browser, codacta);
      console.log(`  -> Guardado en ${rutaMp4}`);
      estadoVideos[codacta] = new Date().toISOString();
      generados.push(codacta);
    } catch (err) {
      console.error(`  -> ERROR grabando ${codacta}: ${err.message}`);
      // No lo marcamos como hecho: se reintentará en la siguiente pasada.
    }
  }

  await browser.close();
  servidor.close();

  guardarEstadoVideos(estadoVideos);

  if (generados.length > 0) {
    // Por cada partido generado, buscamos su rival y, si está en el
    // mapeo, su @usuario de Instagram — para que el paso de email
    // pueda sugerir la mención.
    const partidos = generados.map((codacta) => {
      const rival = obtenerRivalDeResultado(codacta);
      const instagram = rival ? rivalesInstagram[rival] || null : null;

      if (rival && !instagram) {
        console.log(
          `ℹ️ Rival "${rival}" (partido ${codacta}) sin Instagram en el mapeo — se enviará sin mención.`
        );
      }

      return { codacta, rival, instagram };
    });

    fs.writeFileSync(
      VIDEO_PENDIENTE_PATH,
      JSON.stringify(
        {
          codactas: generados, // se mantiene igual, por si algo más lo usa
          partidos, // nuevo: rival + instagram por cada vídeo generado
        },
        null,
        2
      )
    );
  }

  console.log(`\nVídeos nuevos generados: ${generados.length}`);
}

main().catch((err) => {
  console.error("\n❌ ERROR GENERAL:");
  console.error(err);
  process.exit(1);
});
