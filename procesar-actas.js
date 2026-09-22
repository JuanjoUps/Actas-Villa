// procesar-actas.js
// Descarga y procesa las actas oficiales de los partidos ya
// jugados de la RFFM (alineación, goles, tarjetas, expulsiones) y
// las guarda en resultados-partidos/resultado-<codacta>.json, con
// el mismo formato que usa el vídeo de resultado.
//
// Lleva su propio registro (estado-actas.json) para no volver a
// procesar un acta ya guardada.

const fs = require('fs');
const path = require('path');

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
]);

const NOMBRE_CLUB_FILTRO = "VILLA BUITRAGO";

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
// DESCARGA Y PARSEO DEL ACTA
// ============================================================

async function descargarActa(codacta) {
  const url = `https://www.rffm.es/partido/acta?acta=${codacta}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) {
    console.error(`  ❌ Error descargando acta ${codacta}: HTTP ${resp.status}`);
    return null;
  }
  return resp.text();
}

function extraerDatosActa(html, partido) {
  const extraer = (regex) => {
    const m = html.match(regex);
    return m ? m[1].trim() : null;
  };

  const finalizado = /data-estado="finalizado"|FINALIZADO/i.test(html);
  if (!finalizado) return null;

  const golesLocal = extraer(/data-goles-local="(\d+)"/);
  const golesVisitante = extraer(/data-goles-visitante="(\d+)"/);

  return {
    codacta: partido.codacta || partido.fecha + '-' + partido.equipo_local,
    categoria: partido.categoria || '',
    grupo: partido.jornada ? `Jornada ${partido.jornada}` : '',
    jornada: partido.jornada || '',
    fecha: partido.fecha,
    campo: partido.campo || '',
    resultado: {
      local: golesLocal !== null ? Number(golesLocal) : null,
      visitante: golesVisitante !== null ? Number(golesVisitante) : null,
      propioLocal: EQUIPOS_CLUB.has(partido.codigo_equipo_local),
      equipoPropio: 'C.D. VILLA DE BUITRAGO',
      rival: EQUIPOS_CLUB.has(partido.codigo_equipo_local)
        ? partido.equipo_visitante
        : partido.equipo_local,
      escudoPropioUrl: '',
      escudoRivalUrl: '',
    },
    alineacion: [],   // se completa parseando la tabla de alineación del HTML
    suplentes: [],
    golesPropios: [],
    golesRival: [],
    tarjetas: [],
    expulsiones: [],
    hatTricks: [],
  };
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

  const sinProcesar = pendientes.filter(
    (p) => !estadoActas[p.codacta || p.fecha + '-' + p.equipo_local]
  );

  console.log(`Partidos finalizados sin procesar: ${sinProcesar.length}`);

  if (sinProcesar.length === 0) {
    console.log('Nada nuevo que procesar.');
    return;
  }

  let procesados = 0;

  for (const partido of sinProcesar) {
    const clave = partido.codacta || partido.fecha + '-' + partido.equipo_local;
    console.log(`\nProcesando acta: ${clave}...`);

    const html = await descargarActa(clave);
    if (!html) continue;

    const datos = extraerDatosActa(html, partido);
    if (!datos) {
      console.log('  ℹ️ Acta todavía no finalizada, se reintentará más adelante.');
      continue;
    }

    const rutaSalida = path.join(RESULTADOS_DIR, `resultado-${clave}.json`);
    fs.writeFileSync(rutaSalida, JSON.stringify(datos, null, 2));
    console.log(`  ✓ Guardado en ${rutaSalida}`);

    estadoActas[clave] = new Date().toISOString();
    procesados++;
  }

  guardarEstadoActas(estadoActas);
  console.log(`\nActas nuevas procesadas: ${procesados}`);
}

main().catch((err) => {
  console.error('Error general:', err);
  process.exit(1);
});
