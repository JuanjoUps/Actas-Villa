/**
 * Descarga el JSON crudo (__NEXT_DATA__) de una o varias actas de
 * partido en rffm.es y lo guarda en disco para poder inspeccionar
 * su estructura real.
 *
 * ACTUALIZADO: la RFFM bloquea las peticiones simples (fetch/curl),
 * así que ahora se usa Playwright (navegador real) para descargar
 * la página -- mismo mecanismo ya confirmado funcionando para
 * partidos-actuales.js. El resto (extracción de __NEXT_DATA__,
 * nombres de archivo, exportaciones) se queda exactamente igual.
 *
 * USO:
 *   node obtener-acta.js
 *
 * Genera:
 *   actas-crudas/acta-<codacta>.json   (JSON completo, tal cual)
 *   actas-crudas/resumen.txt           (claves de primer nivel, para
 *                                        no tener que abrir los JSON
 *                                        enteros a mano)
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

// ============================================================
// ACTAS A CONSULTAR (de prueba)
// ============================================================

const ACTAS_DE_PRUEBA = [
  "https://www.rffm.es/acta-partido/5431943?temporada=21&competicion=24037730&grupo=24037732",
  "https://www.rffm.es/acta-partido/5431946?temporada=21&competicion=24037730&grupo=24037732",
  "https://www.rffm.es/acta-partido/5432490?temporada=21&competicion=24762963&grupo=24762965",
];

const SALIDA_DIR = path.join(__dirname, "actas-crudas");

// ============================================================
// Construye la URL del acta a partir de los datos que ya
// tenemos en cada partido de partidos-video.json
// ============================================================

function urlActa(codacta, temporada, competicion, grupo) {
  return (
    `https://www.rffm.es/acta-partido/${codacta}` +
    `?temporada=${temporada}&competicion=${competicion}&grupo=${grupo}`
  );
}

// ============================================================
// Descarga la página del acta con Playwright y extrae el JSON de
// __NEXT_DATA__ (mismo mecanismo que ya usa el calendario).
//
// Acepta opcionalmente un navegador ya abierto (browserExterno)
// para que quien llame muchas veces seguidas (procesar-actas.js)
// pueda reutilizar el mismo navegador en vez de abrir uno nuevo
// por cada acta -- si no se pasa ninguno, abre y cierra uno propio,
// para que probar-acta.js siga funcionando exactamente igual que
// antes, sin tener que tocarlo.
// ============================================================

// La RFFM corre sobre Liferay y en fechas de mucha carga responde
// lento o da 504 -- reintentamos con espera creciente en vez de
// rendirnos a la primera.
const REINTENTOS_MAX = 2;
const TIMEOUT_PAGINA_MS = 25000;

function esperarMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function obtenerActaCruda(url, browserExterno) {
  console.log(`Consultando acta: ${url}`);

  const browser = browserExterno || (await chromium.launch());
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  try {
    let ultimoError;
    for (let intento = 1; intento <= REINTENTOS_MAX; intento++) {
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_PAGINA_MS });
        if (resp && resp.status() >= 500) {
          throw new Error(`HTTP ${resp.status()} (servidor sobrecargado)`);
        }
        await page.waitForTimeout(1500);
        const html = await page.content();

        const match = html.match(
          /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
        );

        if (!match) {
          throw new Error("No se encontró __NEXT_DATA__ en " + url);
        }

        const data = JSON.parse(match[1]);
        return data.props.pageProps;
      } catch (err) {
        ultimoError = err;
        const esperaMs = intento * 5000;
        console.log(`  ⚠️ Intento ${intento}/${REINTENTOS_MAX} falló: ${err.message}`);
        if (intento < REINTENTOS_MAX) {
          console.log(`  Reintentando en ${esperaMs / 1000}s...`);
          await esperarMs(esperaMs);
        }
      }
    }
    throw ultimoError;
  } finally {
    await page.close();
    if (!browserExterno) await browser.close();
  }
}

// ============================================================
// Extrae el codacta de una URL de acta, para nombrar el archivo
// ============================================================
function codactaDeUrl(url) {
  const match = url.match(/acta-partido\/(\d+)/);
  return match ? match[1] : "desconocido";
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  if (!fs.existsSync(SALIDA_DIR)) {
    fs.mkdirSync(SALIDA_DIR);
  }

  const resumen = [];
  const browser = await chromium.launch();

  for (const url of ACTAS_DE_PRUEBA) {
    const codacta = codactaDeUrl(url);

    try {
      const pageProps = await obtenerActaCruda(url, browser);

      const archivoSalida = path.join(
        SALIDA_DIR,
        `acta-${codacta}.json`
      );

      fs.writeFileSync(
        archivoSalida,
        JSON.stringify(pageProps, null, 2)
      );

      const clavesPrimerNivel = Object.keys(pageProps);

      console.log(
        `  -> guardado en ${archivoSalida}`
      );
      console.log(
        `  -> claves de primer nivel: ${clavesPrimerNivel.join(", ")}`
      );

      resumen.push(
        `acta-${codacta}.json  |  claves: ${clavesPrimerNivel.join(", ")}`
      );
    } catch (err) {
      console.error(`  -> ERROR con ${url}: ${err.message}`);
      resumen.push(`acta-${codacta}.json  |  ERROR: ${err.message}`);
    }
  }

  await browser.close();

  fs.writeFileSync(
    path.join(SALIDA_DIR, "resumen.txt"),
    resumen.join("\n")
  );

  console.log("\nListo. Revisa la carpeta actas-crudas/");
}

// Solo se ejecuta main() si este archivo se lanza directamente
// (node obtener-acta.js), no cuando otro script hace require() de él.
if (require.main === module) {
  main().catch((err) => {
    console.error("\n❌ ERROR GENERAL:");
    console.error(err);
    process.exit(1);
  });
}

module.exports = { urlActa, obtenerActaCruda, codactaDeUrl };
