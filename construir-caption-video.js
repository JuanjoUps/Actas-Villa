/**
 * Construye el pie de foto para el vídeo de un partido, con el
 * @usuario de Instagram del rival si lo tenemos mapeado en
 * rivales-instagram.json. Se llama con el codacta del partido:
 *
 *   node construir-caption-video.js 5432619
 *
 * Imprime el texto por stdout, para que el workflow lo capture.
 */

const fs = require("fs");
const path = require("path");

function claveEquipo(nombreOriginal) {
  // Ignora la letra de equipo final ('A', 'B', 'C'...) — un mismo
  // club suele tener una sola cuenta de Instagram para todos sus
  // equipos.
  const sinSufijo = (nombreOriginal || "").replace(/\s+'[A-ZÑ]'$/i, "");
  return sinSufijo
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const codacta = process.argv[2];
let caption = "⚽ Nuevo vídeo de resultado";

if (codacta) {
  const rutaResultado = path.join(__dirname, "resultados-partidos", `resultado-${codacta}.json`);
  const rutaRivales = path.join(__dirname, "rivales-instagram.json");

  try {
    const datos = JSON.parse(fs.readFileSync(rutaResultado, "utf-8"));
    const rival = datos?.resultado?.rival || "";
    const categoria = datos?.categoria || "";

    let ig = null;
    if (fs.existsSync(rutaRivales)) {
      const mapa = JSON.parse(fs.readFileSync(rutaRivales, "utf-8"));
      ig = mapa[claveEquipo(rival)] || null;
    }

    if (rival) {
      caption = `⚽ ${categoria}: vs ${rival}${ig ? " (@" + ig + ")" : ""}`;
    }
  } catch (e) {
    // Si algo falla (JSON no encontrado, etc.), nos quedamos con
    // el pie de foto genérico de arriba, sin romper el envío.
  }
}

console.log(caption);
