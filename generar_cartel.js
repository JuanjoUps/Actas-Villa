/**
 * Genera automáticamente el cartel de partido (PNG) a partir de los datos
 * de un acta de rffm.es, usando la plantilla cartel-villa-buitrago.html.
 *
 * No hace falta rellenar nada a mano: este script abre la plantilla con
 * los datos como parámetros de URL, espera a que se pinte y hace una
 * captura en alta resolución del cartel.
 *
 * USO:
 *   node generar_cartel.js "<url_del_acta_rffm>" salida.png
 *
 * Requiere:
 *   npm install puppeteer node-fetch@2
 */

const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

// Para descargar escudos usamos puppeteer-extra + plugin "stealth": oculta
// las señales que delatan que es un navegador automatizado (rffm.es las usa
// para bloquear peticiones que no vienen de una persona real navegando).
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(StealthPlugin());

const CACHE_ESCUDOS_DIR = path.join(__dirname, "escudos-cache");
const ESCUDO_GENERICO_PATH = path.join(__dirname, "escudo-generico.png");

function claveEscudo(url) {
  // Usa el nombre de archivo de la federación como clave estable
  // (ej. "00100_0011756754_LOGO_ALCOBENDAS_ORIGINAL_2024.jpg").
  const nombre = url.split("/").pop().split("?")[0];
  return nombre.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

/**
 * Gestor de escudos de rivales con caché en disco.
 * - Si ya lo descargamos antes (mismo nombre de archivo de la federación),
 *   lo coge del caché sin volver a pedirlo — los rivales se repiten toda
 *   la temporada, así que una vez conseguido no hace falta más.
 * - Si no está en caché, lo intenta descargar usando un navegador real
 *   (Puppeteer), porque rffm.es bloquea las descargas "a pelo" con una
 *   página de aviso disfrazada de imagen.
 * - Lo que consigue descargar nuevo, lo guarda en el caché para la
 *   próxima vez (hay que hacer `git add escudos-cache` para que persista).
 */
function claveEquipo(nombreEquipo) {
  return nombreEquipo
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const EXTENSIONES_IMAGEN = ["png", "jpg", "jpeg", "webp"];

/**
 * Gestor de escudos de rivales con caché en disco, indexada por NOMBRE DE
 * EQUIPO (no por la URL interna de la federación) para que se pueda
 * alimentar a mano fácilmente:
 *   - Guarda una imagen en escudos-cache/ con el nombre del equipo tal
 *     como aparece en el cartel (ej. "ALCOBENDAS_CF_B.png") y el sistema
 *     la usará siempre, sin intentar descargarla.
 *   - Si no hay nada guardado, intenta descargarla sola desde rffm.es
 *     (puede fallar por su protección anti-bot); si lo consigue, la deja
 *     guardada para la próxima vez.
 */
class GestorEscudos {
  constructor() {
    this.paginaNavegador = null;
    if (!fs.existsSync(CACHE_ESCUDOS_DIR)) fs.mkdirSync(CACHE_ESCUDOS_DIR);
  }

  async _obtenerPagina() {
    if (this.paginaNavegador) return this.paginaNavegador;
    const browser = await puppeteerExtra.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    // Visitamos el mismo dominio donde viven las imágenes (appweb.rffm.es,
    // no www.rffm.es) para que la petición de cada escudo sea del mismo
    // origen y no la bloquee el navegador por seguridad.
    await page.goto("https://appweb.rffm.es/pnfg/", { waitUntil: "networkidle0" });
    this._browser = browser;
    this.paginaNavegador = page;
    return page;
  }

  async cerrar() {
    if (this._browser) await this._browser.close();
  }

  _bufferAdataURI(buffer, extension) {
    const tipos = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
    return `data:${tipos[extension] || "image/png"};base64,${buffer.toString("base64")}`;
  }

  /** Busca un escudo ya guardado a mano (o de una descarga anterior) para este equipo. */
  _buscarEnCache(clave) {
    for (const ext of EXTENSIONES_IMAGEN) {
      const ruta = path.join(CACHE_ESCUDOS_DIR, `${clave}.${ext}`);
      if (fs.existsSync(ruta)) {
        return this._bufferAdataURI(fs.readFileSync(ruta), ext);
      }
    }
    return null;
  }

  async obtener(nombreEquipo, url) {
    if (!nombreEquipo) return "";
    const clave = claveEquipo(nombreEquipo);

    const enCache = this._buscarEnCache(clave);
    if (enCache) return enCache;

    let resultadoDescarga = null;

    if (url) {
      try {
        const page = await this._obtenerPagina();
        resultadoDescarga = await page.evaluate(async (imgUrl) => {
          const resp = await fetch(imgUrl);
          if (!resp.ok) return null;
          const tipo = resp.headers.get("content-type") || "";
          if (!tipo.startsWith("image/")) return null;
          const blob = await resp.blob();
          const dataUri = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          return { dataUri, tipo };
        }, url);
      } catch (err) {
        console.log(`Error descargando escudo de "${nombreEquipo}":`, err.message);
      }
    }

    if (resultadoDescarga) {
      const extension = resultadoDescarga.tipo.includes("png") ? "png" : "jpg";
      const base64 = resultadoDescarga.dataUri.split(",")[1];
      fs.writeFileSync(path.join(CACHE_ESCUDOS_DIR, `${clave}.${extension}`), Buffer.from(base64, "base64"));
      console.log(`Escudo de "${nombreEquipo}" descargado y guardado en escudos-cache/${clave}.${extension}`);
      return resultadoDescarga.dataUri;
    }

    // No se ha conseguido un escudo real: usamos el genérico, pero lo
    // guardamos en caché CON EL NOMBRE DE ESTE EQUIPO, para que quede
    // fijado (y si algún día consigues el real, basta con reemplazar
    // ese archivo en escudos-cache/ por el bueno).
    console.log(`Escudo de "${nombreEquipo}" no disponible — usando escudo genérico, guardado en escudos-cache/${clave}.png`);
    const generico = fs.readFileSync(ESCUDO_GENERICO_PATH);
    fs.writeFileSync(path.join(CACHE_ESCUDOS_DIR, `${clave}.png`), generico);
    return this._bufferAdataURI(generico, "png");
  }
}

async function descargarComoDataURI(url) {
  if (!url) {
    console.log("Escudo: sin URL (el campo venía vacío)");
    return "";
  }
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.rffm.es/",
      },
    });
    const tipo = resp.headers.get("content-type") || "";
    console.log(`Escudo ${url} -> status ${resp.status}, content-type "${tipo}"`);
    if (!resp.ok || !tipo.startsWith("image/")) return "";
    const buffer = await resp.buffer();
    console.log(`Escudo ${url} -> ${buffer.length} bytes descargados`);
    if (buffer.length < 200) return "";
    return `data:${tipo};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.log("Escudo: error de descarga en", url, "->", err.message);
    return "";
  }
}

function capitalizarTexto(texto) {
  if (!texto) return "";
  return texto
    .toLowerCase()
    .replace(/(^|\s|[-.'])([a-záéíóúñ])/g, (m, sep, letra) => sep + letra.toUpperCase());
}

const CODIGO_CLUB = "846904"; // C.D. Villa de Buitrago del Lozoya (según el acta)
const PLANTILLA = path.join(__dirname, "cartel-villa-buitrago.html");
const PLANTILLA_JORNADA = path.join(__dirname, "cartel-jornada.html");

const DIAS_SEMANA = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
const MESES_LARGO = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];

function diaSemanaDeFecha(fechaDDMMYYYY) {
  const [dia, mes, anio] = fechaDDMMYYYY.split("-").map(Number);
  const d = new Date(anio, mes - 1, dia);
  return DIAS_SEMANA[d.getDay()];
}

function fechaLarga(fechaDDMMYYYY) {
  const [dia, mes] = fechaDDMMYYYY.split("-").map(Number);
  return `${dia} ${MESES_LARGO[mes - 1]}`;
}

async function generarImagenJornada(fecha, partidos, salida) {
  const partidosJsonPath = path.join(path.dirname(PLANTILLA_JORNADA), "partidos.json");
  fs.writeFileSync(partidosJsonPath, JSON.stringify(partidos));

  const params = new URLSearchParams({
    diaSemana: diaSemanaDeFecha(fecha),
    fechaLarga: fechaLarga(fecha),
  });
  const url = "file://" + PLANTILLA_JORNADA + "?" + params.toString();

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
  });

  // try/finally: el navegador se cierra SIEMPRE, incluso si algo
  // falla (p.ej. falta la plantilla). Si no, el proceso de Chromium
  // se queda abierto y Node.js nunca llega a terminar el script.
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 2400, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForFunction("window.__listo === true");

    const cartel = await page.$("#cartel");
    await cartel.screenshot({ path: salida });
  } finally {
    await browser.close();
    if (fs.existsSync(partidosJsonPath)) fs.unlinkSync(partidosJsonPath);
  }
}

async function extraerActa(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const html = await resp.text();

  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("No se encontró __NEXT_DATA__ en la página del acta.");

  const data = JSON.parse(match[1]);
  const game = data.props.pageProps.game;

  const esLocal = game.codigo_equipo_local === CODIGO_CLUB;
  const rival = (esLocal ? game.equipo_visitante : game.equipo_local || "").trim();
  const escudoRivalRelativo = esLocal ? game.escudo_visitante : game.escudo_local;
  const rivalEscudoUrl = escudoRivalRelativo ? "https://appweb.rffm.es" + escudoRivalRelativo : "";
  const rivalEscudo = await descargarComoDataURI(rivalEscudoUrl);

  return {
    categoria: game.nombre_competicion,
    rival,
    rivalEscudo,
    fecha: formatearFecha(game.fecha),
    hora: game.hora,
    campo: formatearCampo(game.campo),
    esLocal,
    acta_cerrada: game.acta_cerrada === "1",
  };
}

function formatearFecha(fechaDDMMYYYY) {
  // "28-09-2025" -> "28 SEP"
  const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const [dia, mes] = fechaDDMMYYYY.split("-");
  return `${dia} ${meses[parseInt(mes, 10) - 1]}`;
}

const CAMPO_LOCAL = "Peñalta, Buitrago del Lozoya";

function formatearCampo(campoRaw) {
  if (!campoRaw) return "";
  if (campoRaw.toUpperCase().includes("BUITRAGO")) return CAMPO_LOCAL;
  // "(HA)" = Hierba Artificial; la federación lo repite dos veces por un
  // fallo de formato suyo. Quitamos ese sufijo para que quede limpio.
  return capitalizarTexto(
    campoRaw
      .replace(/\s*\(HA\)\s*/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

async function generarImagen(datos, salida) {
  const params = new URLSearchParams({
    categoria: datos.categoria || "",
    rival: datos.rival || "",
    rivalEscudo: datos.rivalEscudo || "",
    fecha: datos.fecha || "",
    hora: datos.hora || "",
    campo: datos.campo || "",
    esLocal: String(!!datos.esLocal),
  });
  const urlPlantilla = "file://" + PLANTILLA + "?" + params.toString();

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 500, height: 700, deviceScaleFactor: 2.85 }); // ~1080px de ancho final
    await page.goto(urlPlantilla, { waitUntil: "networkidle0" });

    const cartel = await page.$("#cartel");
    await cartel.screenshot({ path: salida });
  } finally {
    await browser.close();
  }
}

module.exports = { extraerActa, generarImagen, generarImagenJornada, formatearFecha, formatearCampo, descargarComoDataURI, GestorEscudos, CODIGO_CLUB, PLANTILLA };

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}

async function main() {
  const [, , urlActa, salida] = process.argv;
  if (!urlActa || !salida) {
    console.error("Uso: node generar_cartel.js <url_del_acta> <archivo_salida.png>");
    process.exit(1);
  }

  const datos = await extraerActa(urlActa);

  if (!datos.acta_cerrada) {
    console.log("El acta todavía no está cerrada, no se genera cartel.");
    return;
  }

  await generarImagen(datos, salida);
  console.log("Cartel generado:", salida);
  console.log(JSON.stringify(datos, null, 2));
}
