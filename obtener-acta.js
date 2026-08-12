/**
 * Descarga el JSON crudo (__NEXT_DATA__) de una o varias actas de
 * partido en rffm.es y lo guarda en disco para poder inspeccionar
 * su estructura real.
 *
 * Este script es un paso PREVIO al parser definitivo: todavía no
 * sabemos cómo vienen nombradas la alineación, los goles, las
 * tarjetas, etc. dentro del JSON del acta. Una vez tengamos un
 * ejemplo real (sobre todo de un partido YA finalizado, con datos
 * completos), se puede escribir el extractor de verdad.
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
// Node.js 18+ ya trae `fetch` integrado, no hace falta node-fetch.

// ============================================================
// ACTAS A CONSULTAR (de prueba)
//
// Puedes pasar la URL completa tal cual la copiaste del navegador,
// o construirla a partir de codacta + temporada + competicion + grupo
// (que es como las tendrás disponibles desde partidos-video.json).
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
// Descarga la página del acta y extrae el JSON de __NEXT_DATA__
// (mismo mecanismo que ya usas para el calendario)
// ============================================================

async function obtenerActaCruda(url) {
  console.log(`Consultando acta: ${url}`);

  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} al consultar ${url}`);
  }

  const html = await resp.text();

  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );

  if (!match) {
    throw new Error("No se encontró __NEXT_DATA__ en " + url);
  }

  const data = JSON.parse(match[1]);

  // Todavía no sabemos el nombre exacto de la clave (como
  // "calendar" en el calendario). Devolvemos pageProps completo
  // para poder inspeccionarlo.
  return data.props.pageProps;
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

  for (const url of ACTAS_DE_PRUEBA) {
    const codacta = codactaDeUrl(url);

    try {
      const pageProps = await obtenerActaCruda(url);

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
