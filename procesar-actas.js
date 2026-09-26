// procesar-actas.js
// Descarga y procesa las actas oficiales de los partidos ya
// jugados de la RFFM y las guarda en
// resultados-partidos/resultado-<codacta>.json, con el mismo
// formato que usa el vídeo de resultado.
//
// Usa los dos módulos ya existentes y probados: obtener-acta.js
// (descarga con Playwright + lee __NEXT_DATA__) y
// extraer-datos-partido.js (convierte el "game" crudo de la RFFM
// a nuestro formato) -- el mismo camino que ya confirmamos que
// funciona en probar-acta.js, sin reinventar la extracción.
//
// Lleva su propio registro (estado-actas.json) para no volver a
// procesar un acta ya guardada.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { obtenerActaCruda } = require('./obtener-acta');
const { extraerDatosPartido } = require('./extraer-datos-partido');

// ============================================================
// EQUIPOS DEL CLUB (por código numérico de la RFFM)
// ============================================================
const EQUIPOS_CLUB = new Set([
  "846904",   // Segunda Aficionado (Senior)
  "3082888",  // Segunda Cadete
  "3088877",  // Primera Infantil
  "24710895", // Primera Alevín F-7
  "17138002", // Primera Fútbol Femenino
  "23996978", // Primera Benjamín F-7 'A'
  "27703615", // Primera Benjamín F-7 'B' -- confirmado en la ficha oficial del club
  // TODO: falta Prebenjamín ("28105851", equipo 'B') -- pendiente
  // de confirmar la URL de calendario de esa categoría.
]);

const RESULTADOS_DIR = path.join(__dirname, 'resultados-partidos');
const ESTADO_ACTAS_PATH = path.join(__dirname, 'estado-actas.json');
const PARTIDOS_VIDEO_PATH = path.join(__dirname, 'partidos-video.json');

// ============================================================
// ESTADO (qué actas ya se han procesado)
// ============================================================

function cargarEstadoActas() {
  if (!fs.existsSync(ESTADO_ACTAS_PATH)) return {};
  return JSON.parse(fs.readFileSync(ESTADO_ACTAS_PATH, 'utf-8'));
}

function guardarEstadoActas(estado) {
  fs.writeFileSync(ESTADO_ACTAS_PATH, JSON.stringify(estado, null, 2));
}

// ============================================================
// PARTIDOS PENDIENTES: los que partidos-actuales.js ya dejó
// guardados en partidos-video.json, dentro de la ventana de 7 días
// ============================================================

function cargarPartidosPendientes() {
  if (!fs.existsSync(PARTIDOS_VIDEO_PATH)) return [];
  return JSON.parse(fs.readFileSync(PARTIDOS_VIDEO_PATH, 'utf-8'));
}

function esPartidoDelClub(partido) {
  return (
    EQUIPOS_CLUB.has(partido.codigo_equipo_local) ||
    EQUIPOS_CLUB.has(partido.codigo_equipo_visitante)
  );
}

// ============================================================
// URL del acta a partir de los datos que ya trae cada partido de
// partidos-video.json (mismo formato que urlActa() en obtener-acta.js)
// ============================================================

function urlDelActa(partido) {
  return (
    `https://www.rffm.es/acta-partido/${partido.codacta}` +
    `?temporada=22&competicion=${partido.competicion || ''}&grupo=${partido.grupo_id || ''}`
  );
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  if (!fs.existsSync(RESULTADOS_DIR)) {
    fs.mkdirSync(RESULTADOS_DIR, { recursive: true });
  }

  const estadoActas = cargarEstadoActas();
  const pendientes = cargarPartidosPendientes().filter(esPartidoDelClub);

  const sinProcesar = pendientes.filter((p) => !estadoActas[p.codacta]);

  console.log(`Partidos finalizados sin procesar: ${sinProcesar.length}`);

  if (sinProcesar.length === 0) {
    console.log('Nada nuevo que procesar.');
    return;
  }

  const browser = await chromium.launch();
  let procesados = 0;
  let erroresReales = 0;

  for (const partido of sinProcesar) {
    console.log(`\nProcesando acta: ${partido.codacta}...`);

    try {
      const url = urlDelActa(partido);
      console.log(`  URL construida: ${url}`);
      const pageProps = await obtenerActaCruda(url, browser);

      if (!pageProps.game) {
        console.log('  -> Esta página no tiene datos de partido (game).');
        continue;
      }

      // Ya no bloqueamos por "acta_cerrada" -- ese indicador lo
      // marca el árbitro a mano y puede tardar horas de más aunque
      // el resultado y la alineación ya estén públicos del todo.
      // Comprobamos el dato que de verdad importa: si el marcador
      // ya tiene los dos goles rellenos.
      const golesLocal = pageProps.game.goles_casa ?? pageProps.game.goles_local;
      const golesVisitante = pageProps.game.goles_visitante;
      const resultadoCompleto =
        golesLocal !== '' && golesLocal != null &&
        golesVisitante !== '' && golesVisitante != null;

      if (!resultadoCompleto) {
        console.log('  ℹ️ El marcador todavía no está completo, se reintentará más adelante.');
        continue;
      }

      const datos = extraerDatosPartido(pageProps.game);

      const rutaSalida = path.join(RESULTADOS_DIR, `resultado-${partido.codacta}.json`);
      fs.writeFileSync(rutaSalida, JSON.stringify(datos, null, 2));
      console.log(`  ✓ Guardado en ${rutaSalida}`);

      estadoActas[partido.codacta] = new Date().toISOString();
      procesados++;
    } catch (err) {
      console.error(`  -> ERROR REAL procesando ${partido.codacta}: ${err.message}`);
      erroresReales++;
    }
  }

  await browser.close();
  guardarEstadoActas(estadoActas);
  console.log(`\nActas nuevas procesadas: ${procesados}`);

  if (erroresReales > 0) {
    // Hacemos que el proceso termine en fallo, para que el propio
    // workflow dispare el aviso de Telegram que ya tienes montado
    // para errores -- sin hardcodear nada de este partido en
    // concreto, cualquier fallo real de cualquier acta futura
    // avisará igual.
    console.error(`\n❌ ${erroresReales} acta(s) fallaron con un error real (no "todavía no cerrada"). Revisa el log de arriba.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error general:', err);
  process.exit(1);
});
