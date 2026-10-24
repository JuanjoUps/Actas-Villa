/**
 * Procesa las actas de los partidos YA JUGADOS (o empezados) cuya
 * acta todavía no se ha extraído.
 *
 * Qué partidos mira:
 *   - Los de partidos-video.json (lo genera partidos-actuales.js)
 *     que tienen acta real, no están ya procesados, y cuya fecha y
 *     hora de inicio ya han pasado (hasta 7 días atrás).
 *   - NO depende de que el calendario de la RFFM ya muestre el
 *     resultado: la página del calendario va con retraso, pero el
 *     acta suele tener los datos antes. Se mira siempre el acta.
 *
 * Cuándo da un acta por buena (y genera el vídeo):
 *   - El acta tiene marcador (goles local y visitante no vacíos), y
 *   - tiene alineación del club.
 *   Da igual que el árbitro haya cerrado el acta o no.
 *   Si falta cualquiera de las dos cosas, se deja para la siguiente
 *   pasada (no se marca como procesada).
 *
 * Por cada acta buena:
 *   1. Extrae los datos limpios (resultado, alineación, goles, ...).
 *   2. Guarda resultados-partidos/resultado-<codacta>.json
 *   3. Marca el codacta como procesado en estado-actas.json.
 *
 * Este script NO genera el vídeo, solo prepara los datos.
 *
 * USO:
 *   node procesar-actas.js
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

// Cuántos días hacia atrás se siguen mirando partidos sin procesar.
const DIAS_HACIA_ATRAS = 7;

// ============================================================
// ESTADO (qué codacta ya se ha procesado)
// ============================================================

function cargarEstadoActas() {
  if (!fs.existsSync(ESTADO_ACTAS_PATH)) return {};
  return JSON.parse(fs.readFileSync(ESTADO_ACTAS_PATH, "utf-8"));
}

function guardarEstadoActas(estado) {
  fs.writeFileSync(ESTADO_ACTAS_PATH, JSON.stringify(estado, null, 2));
}

// ============================================================
// ¿Este partido tiene un acta real de la RFFM?
// (los amistosos manuales, codacta "MAN-...", no la tienen)
// ============================================================

function tieneActaReal(partido) {
  return Boolean(
    partido.codacta &&
      !String(partido.codacta).startsWith("MAN-") &&
      partido.temporada &&
      partido.competicion &&
      partido.grupo
  );
}

// ============================================================
// FECHAS (hora de Madrid)
// ============================================================

function ahoraEnMadrid(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ahora);

  const v = {};
  partes.forEach((p) => (v[p.type] = p.value));

  return {
    // Día como número comparable (AAAAMMDD) y minutos desde medianoche.
    dia: Number(`${v.year}${v.month}${v.day}`),
    minutos: (Number(v.hour) % 24) * 60 + Number(v.minute),
    fecha: new Date(Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day))),
  };
}

// "DD-MM-YYYY" (o DD/MM/YYYY o YYYY-MM-DD) -> AAAAMMDD, o null.
function diaNumero(texto) {
  const t = String(texto || "").trim();
  let m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return Number(`${m[3]}${m[2].padStart(2, "0")}${m[1].padStart(2, "0")}`);
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Number(`${m[1]}${m[2]}${m[3]}`);
  return null;
}

function minutosDeHora(hora) {
  const m = String(hora || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * ¿Ya ha empezado el partido (o ya pasó) y todavía está en la
 * ventana de días que miramos?
 */
function yaEmpezado(partido, ahora) {
  const dia = diaNumero(partido.fecha);
  if (dia === null) return false;

  // Límite inferior: hoy menos DIAS_HACIA_ATRAS días.
  const limite = new Date(ahora.fecha.getTime() - DIAS_HACIA_ATRAS * 86400000);
  const diaLimite = Number(
    `${limite.getUTCFullYear()}${String(limite.getUTCMonth() + 1).padStart(2, "0")}${String(limite.getUTCDate()).padStart(2, "0")}`
  );

  if (dia < diaLimite) return false;
  if (dia < ahora.dia) return true;
  if (dia > ahora.dia) return false;

  // Es hoy: solo si ya pasó la hora de inicio (si no hay hora, se mira).
  const inicio = minutosDeHora(partido.hora);
  return inicio === null || ahora.minutos >= inicio;
}

// ============================================================
// ¿El acta trae marcador de verdad?
// Ojo: se mira el valor CRUDO. Un partido sin jugar trae "" y
// Number("") es 0, lo que daría un falso 0-0.
// ============================================================

function hayValor(v) {
  return v !== "" && v !== null && v !== undefined;
}

function actaConMarcador(game) {
  const local = hayValor(game.goles_local) ? game.goles_local : game.goles_casa;
  return hayValor(local) && hayValor(game.goles_visitante);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  if (!fs.existsSync(PARTIDOS_VIDEO_PATH)) {
    console.error(`No existe ${PARTIDOS_VIDEO_PATH}. Ejecuta primero partidos-actuales.js.`);
    process.exit(1);
  }

  if (!fs.existsSync(RESULTADOS_DIR)) fs.mkdirSync(RESULTADOS_DIR);

  const todosLosPartidos = JSON.parse(fs.readFileSync(PARTIDOS_VIDEO_PATH, "utf-8"));
  const estadoActas = cargarEstadoActas();
  const ahora = ahoraEnMadrid();

  const pendientes = todosLosPartidos.filter(
    (p) => tieneActaReal(p) && !estadoActas[p.codacta] && yaEmpezado(p, ahora)
  );

  console.log(`Partidos empezados y sin procesar: ${pendientes.length}`);

  if (pendientes.length === 0) {
    console.log("Nada nuevo que procesar.");
    return;
  }

  let procesados = 0;
  const gestorEscudos = new GestorEscudos();

  for (const partido of pendientes) {
    const url = urlActa(partido.codacta, partido.temporada, partido.competicion, partido.grupo);

    console.log(
      `\nMirando acta ${partido.codacta} (${partido.categoria}, ${partido.fecha} ${partido.hora || ""})...`
    );

    try {
      const pageProps = await obtenerActaCruda(url);
      const game = pageProps && pageProps.game;

      if (!game) {
        console.log("  -> Sin datos de partido todavía. Se reintentará.");
        continue;
      }

      if (!actaConMarcador(game)) {
        console.log("  -> Todavía no hay marcador en el acta. Se reintentará.");
        continue;
      }

      let datos;
      try {
        datos = extraerDatosPartido(game);
      } catch (e) {
        console.log(`  -> El acta está incompleta (${e.message}). Se reintentará.`);
        continue;
      }

      if (!Number.isFinite(datos.resultado.local) || !Number.isFinite(datos.resultado.visitante)) {
        console.log("  -> Marcador no válido todavía. Se reintentará.");
        continue;
      }

      if (!datos.alineacion || datos.alineacion.length === 0) {
        console.log("  -> Hay marcador pero aún no hay alineación. Se reintentará.");
        continue;
      }

      datos.resultado.escudoPropio = await gestorEscudos.obtener(
        datos.resultado.equipoPropio,
        datos.resultado.escudoPropioUrl
      );
      datos.resultado.escudoRival = await gestorEscudos.obtener(
        datos.resultado.rival,
        datos.resultado.escudoRivalUrl
      );

      const archivoSalida = path.join(RESULTADOS_DIR, `resultado-${partido.codacta}.json`);
      fs.writeFileSync(archivoSalida, JSON.stringify(datos, null, 2));
      console.log(
        `  -> OK: ${datos.resultado.local}-${datos.resultado.visitante}, ` +
          `${datos.alineacion.length} titulares. Guardado en ${archivoSalida}`
      );

      // Se marca como procesado SOLO si todo ha ido bien.
      estadoActas[partido.codacta] = new Date().toISOString();
      procesados++;
    } catch (err) {
      // Un fallo de red o de la web de la RFFM no es grave: se
      // reintenta en la siguiente pasada. No se hace fallar el workflow.
      console.log(`  -> No se pudo leer el acta ahora (${err.message}). Se reintentará.`);
    }
  }

  await gestorEscudos.cerrar();
  guardarEstadoActas(estadoActas);

  console.log(`\nActas nuevas procesadas: ${procesados}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("\n❌ ERROR GENERAL:");
    console.error(err);
    process.exit(1);
  });
}

module.exports = { yaEmpezado, ahoraEnMadrid, actaConMarcador, diaNumero };
