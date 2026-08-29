/**
 * PUBLICAR EN INSTAGRAM — Actas Villa
 * =====================================
 *
 * Sube el/los vídeo(s) de resultado a Instagram como STORY, con la
 * mención (user_tag) del rival ya puesta — usando el mapeo de
 * rivales-instagram.json a través de video-pendiente.json (que ya
 * calcula generar-video.js con { codacta, rival, instagram }).
 *
 * DISEÑADO PARA NO ROMPER NADA SI FALTA ALGO O ALGO FALLA:
 *   - Si faltan las credenciales (IG_USER_ID / IG_ACCESS_TOKEN), se
 *     salta entero sin dar error.
 *   - Si un vídeo concreto falla al publicar, se registra el error
 *     y se sigue con el siguiente — nunca hace fallar todo el
 *     workflow (el email y el guardado de estado ya se hicieron
 *     antes de este paso).
 *
 * REQUISITOS (pendientes de configurar):
 *   - Cuenta de Instagram profesional vinculada a una página de
 *     Facebook.
 *   - App en developers.facebook.com con permiso de publicar
 *     contenido, con esta cuenta añadida como Instagram Tester.
 *   - Dos secrets en el repo: IG_USER_ID (el ID numérico de la
 *     cuenta de Instagram) e IG_ACCESS_TOKEN (token de larga
 *     duración con permiso instagram_content_publish).
 *
 * USO:
 *   node publicar-instagram.js
 *
 * Ejecutar DESPUÉS de enviar el email, ANTES de borrar
 * video-pendiente.json.
 */

const fs = require("fs");
const path = require("path");

const VIDEO_PENDIENTE_PATH = path.join(__dirname, "video-pendiente.json");
const VIDEOS_DIR = path.join(__dirname, "videos-generados");

const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

// ============================================================
// SUBIDA TEMPORAL A UN HOST PÚBLICO
//
// Instagram necesita una URL pública para descargar el vídeo — el
// repo puede ser privado, así que lo subimos un rato a un hosting
// temporal gratuito (litterbox.catbox.moe, pensado justo para esto:
// archivos que solo hacen falta un rato). Se borra solo pasada 1h.
// ============================================================

async function subirTemporal(rutaVideo) {
  const buffer = fs.readFileSync(rutaVideo);
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("time", "1h");
  formData.append("fileToUpload", new Blob([buffer]), path.basename(rutaVideo));

  const resp = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
    method: "POST",
    body: formData,
  });

  const url = (await resp.text()).trim();

  if (!url.startsWith("http")) {
    throw new Error("No se pudo subir el vídeo al hosting temporal: " + url);
  }

  return url;
}

// ============================================================
// PUBLICACIÓN EN INSTAGRAM (Content Publishing API — Stories)
// ============================================================

async function crearContenedorStory(videoUrl, usernameMencion) {
  const params = new URLSearchParams({
    media_type: "STORIES",
    video_url: videoUrl,
    access_token: IG_ACCESS_TOKEN,
  });

  if (usernameMencion) {
    // Mención sin sticker visual (solo notifica al usuario), con
    // coordenadas centradas — es lo único que soporta la API para
    // contenido publicado programáticamente.
    params.set(
      "user_tags",
      JSON.stringify([{ username: usernameMencion, x: 0.5, y: 0.5 }])
    );
  }

  const resp = await fetch(`${GRAPH_API_BASE}/${IG_USER_ID}/media?${params.toString()}`, {
    method: "POST",
  });

  const datos = await resp.json();
  if (!resp.ok) throw new Error("Error creando contenedor: " + JSON.stringify(datos));
  return datos.id;
}

async function esperarProcesado(creationId, maxIntentos = 20) {
  for (let intento = 0; intento < maxIntentos; intento++) {
    const resp = await fetch(
      `${GRAPH_API_BASE}/${creationId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`
    );
    const datos = await resp.json();

    if (datos.status_code === "FINISHED") return true;
    if (datos.status_code === "ERROR") throw new Error("Instagram no pudo procesar el vídeo.");

    await new Promise((r) => setTimeout(r, 3000)); // esperar 3s y reintentar
  }
  throw new Error("Tiempo de espera agotado procesando el vídeo.");
}

async function publicarContenedor(creationId) {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: IG_ACCESS_TOKEN,
  });

  const resp = await fetch(`${GRAPH_API_BASE}/${IG_USER_ID}/media_publish?${params.toString()}`, {
    method: "POST",
  });

  const datos = await resp.json();
  if (!resp.ok) throw new Error("Error publicando: " + JSON.stringify(datos));
  return datos.id;
}

async function publicarVideoComoStory(rutaVideo, usernameMencion) {
  console.log(`  Subiendo a hosting temporal: ${path.basename(rutaVideo)}...`);
  const videoUrl = await subirTemporal(rutaVideo);

  console.log(`  Creando story en Instagram${usernameMencion ? ` (mención: @${usernameMencion})` : ""}...`);
  const creationId = await crearContenedorStory(videoUrl, usernameMencion);

  console.log("  Esperando a que Instagram procese el vídeo...");
  await esperarProcesado(creationId);

  console.log("  Publicando...");
  await publicarContenedor(creationId);

  console.log("  ✓ Publicado en Instagram.");
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    console.log(
      "ℹ️ Publicación en Instagram desactivada todavía (faltan los secrets IG_USER_ID / IG_ACCESS_TOKEN). Se omite este paso sin error."
    );
    return;
  }

  if (!fs.existsSync(VIDEO_PENDIENTE_PATH)) {
    console.log("No hay video-pendiente.json — nada que publicar.");
    return;
  }

  const pendiente = JSON.parse(fs.readFileSync(VIDEO_PENDIENTE_PATH, "utf-8"));
  const partidos = pendiente.partidos || [];

  if (partidos.length === 0) {
    console.log("video-pendiente.json no trae información de partidos — nada que publicar.");
    return;
  }

  for (const partido of partidos) {
    const rutaVideo = path.join(VIDEOS_DIR, `resultado-${partido.codacta}.mp4`);

    if (!fs.existsSync(rutaVideo)) {
      console.log(`⚠️ No se encuentra ${rutaVideo}, se omite.`);
      continue;
    }

    console.log(`\n[${partido.codacta}] ${partido.rival || "(rival desconocido)"}`);

    try {
      await publicarVideoComoStory(rutaVideo, partido.instagram);
    } catch (err) {
      // Un fallo aquí NUNCA debe tumbar el workflow — el email y el
      // guardado de estado ya se hicieron antes de este paso.
      console.error(`  ❌ No se pudo publicar automáticamente: ${err.message}`);
      console.error("  (Puedes subirlo a mano como siempre, no pasa nada.)");
    }
  }
}

main().catch((err) => {
  console.error("❌ Error inesperado en publicar-instagram.js (no debería tumbar el workflow):", err);
  // Salimos con código 0 a propósito: este paso es un extra, nunca
  // debe hacer fallar el resto del workflow.
  process.exit(0);
});
