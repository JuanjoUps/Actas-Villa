/**
 * Procesa los partidos que ya están FINALIZADOS en
 * partidos-video.json (generado por partidos-actuales.js) y cuya
 * acta todavía no se ha extraído.
 *
 * Para cada partido nuevo:
 *   1. Construye la URL de su acta (codacta + temporada +
 *      competicion + grupo, guardados en partidos-video.json).
 *   2. Descarga el acta y comprueba que esté cerrada.
 *   3. Extrae los datos limpios (resultado, alineación, goles,
 *      hat-tricks, expulsiones).
 *   4. Guarda el resultado en resultados-partidos/resultado-<codacta>.json
 *   5. Marca el codacta como procesado en estado-actas.json, para
 *      no volver a descargar la misma acta en la siguiente pasada.
 *
 * Este script NO genera el vídeo — solo prepara los datos. El
 * generador de vídeo (pendiente) leerá los archivos de
 * resultados-partidos/.
 *
 * USO:
 *   node procesar-actas.js
 *
 * Pensado para ejecutarse DESPUÉS de partidos-actuales.js en el
 * mismo GitHub Action, los fines de semana.
 */

const fs = require("fs");
const path = require("path");

const { obtenerActaCruda, urlActa } = require("./obtener-acta");
const { extraerDatosPartido } = require("./extraer-datos-partido");
const { GestorEscudos } = require("./generar_cartel");

// ============================================================
// RUTAS
// ============================================================

const PARTIDOS_VIDEO_PATH = path.join(__dirname, "partidos-video.json");
const ESTADO_ACTAS_PATH = path.join(__dirname, "estado-actas.json");
const RESULTADOS_DIR = path.join(__dirname, "resultados-partidos");

// ============================================================
// ESTADO (qué codacta ya se ha procesado)
// ============================================================

function cargarEstadoActas() {
  if (!fs.existsSync(ESTADO_ACTAS_PATH)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(ESTADO_ACTAS_PATH, "utf-8"));
}

function guardarEstadoActas(estado) {
  fs.writeFileSync(
    ESTADO_ACTAS_PATH,
    JSON.stringify(estado, null, 2)
  );
}

// ============================================================
// ¿Este partido tiene un acta real de la RFFM?
// (los amistosos manuales, codacta "MAN-...", no la tienen)
// ============================================================

function tieneActaReal(partido) {
  return (
    partido.codacta &&
    !String(partido.codacta).startsWith("MAN-") &&
    partido.temporada &&
    partido.competicion &&
    partido.grupo
  );
}

// ============================================================
// RANGO DE FECHAS A PROCESAR (para revisar un fin de semana
// concreto con datos reales, en vez de todo el histórico).
//
// Formato DD-MM-YYYY, ambos límites incluidos. Ponlo a `null`
// para procesar TODO lo pendiente (modo producción normal).
// ============================================================

const RANGO_FECHAS_PRUEBA = {
  desde: "07-02-2026",
  hasta: "08-02-2026",
};

function fechaEnRango(fechaDDMMYYYY, rango) {
  if (!rango) return true;

  const aFecha = (f) => {
    const [d, m, a] = f.split("-").map(Number);
    return new Date(a, m - 1, d);
  };

  const fecha = aFecha(fechaDDMMYYYY);
  return fecha >= aFecha(rango.desde) && fecha <= aFecha(rango.hasta);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  if (!fs.existsSync(PARTIDOS_VIDEO_PATH)) {
    console.error(
      `No existe ${PARTIDOS_VIDEO_PATH}. Ejecuta primero partidos-actuales.js.`
    );
    process.exit(1);
  }

  if (!fs.existsSync(RESULTADOS_DIR)) {
    fs.mkdirSync(RESULTADOS_DIR);
  }

  const todosLosPartidos = JSON.parse(
    fs.readFileSync(PARTIDOS_VIDEO_PATH, "utf-8")
  );

  const estadoActas = cargarEstadoActas();

  // Partidos finalizados, con acta real, todavía no procesados,
  // y dentro del rango de fechas de prueba (si hay uno definido).
  const pendientes = todosLosPartidos.filter(
    (p) =>
      p.finalizado &&
      tieneActaReal(p) &&
      !estadoActas[p.codacta] &&
      fechaEnRango(p.fecha, RANGO_FECHAS_PRUEBA)
  );

  console.log(
    `Partidos finalizados sin procesar` +
    (RANGO_FECHAS_PRUEBA
      ? ` entre ${RANGO_FECHAS_PRUEBA.desde} y ${RANGO_FECHAS_PRUEBA.hasta}`
      : "") +
    `: ${pendientes.length}`
  );

  if (pendientes.length === 0) {
    console.log("Nada nuevo que procesar.");
    return;
  }

  let procesados = 0;

  // Mismo gestor de caché de escudos que usa generar_cartel.js —
  // así el escudo del rival (y el del propio Villa Buitrago, que
  // se resuelve igual, por nombre) sale ya cacheado del proyecto
  // de carteles si ya se había descargado antes.
  const gestorEscudos = new GestorEscudos();

  for (const partido of pendientes) {
    const url = urlActa(
      partido.codacta,
      partido.temporada,
      partido.competicion,
      partido.grupo
    );

    console.log(`\nProcesando acta ${partido.codacta} (${partido.categoria})...`);

    try {
      const pageProps = await obtenerActaCruda(url);

      if (!pageProps.game) {
        console.log("  -> Sin datos de partido todavía, se reintentará más tarde.");
        continue;
      }

      if (pageProps.game.acta_cerrada !== "1") {
        console.log("  -> Acta todavía no cerrada, se reintentará más tarde.");
        continue;
      }

      const datos = extraerDatosPartido(pageProps.game);

      // Resolvemos los escudos a data URI (descarga + caché en
      // escudos-cache/, o genérico si no se consigue).
      datos.resultado.escudoPropio = await gestorEscudos.obtener(
        datos.resultado.equipoPropio,
        datos.resultado.escudoPropioUrl
      );
      datos.resultado.escudoRival = await gestorEscudos.obtener(
        datos.resultado.rival,
        datos.resultado.escudoRivalUrl
      );

      const archivoSalida = path.join(
        RESULTADOS_DIR,
        `resultado-${partido.codacta}.json`
      );

      fs.writeFileSync(archivoSalida, JSON.stringify(datos, null, 2));

      console.log(`  -> Guardado en ${archivoSalida}`);

      // Marcamos como procesado SOLO si todo ha ido bien.
      estadoActas[partido.codacta] = new Date().toISOString();
      procesados++;
    } catch (err) {
      console.error(`  -> ERROR: ${err.message}`);
      // No lo marcamos como procesado: se reintentará en la
      // siguiente pasada.
    }
  }

  await gestorEscudos.cerrar();

  guardarEstadoActas(estadoActas);

  console.log(`\nActas nuevas procesadas: ${procesados}`);
}

main().catch((err) => {
  console.error("\n❌ ERROR GENERAL:");
  console.error(err);
  process.exit(1);
});
