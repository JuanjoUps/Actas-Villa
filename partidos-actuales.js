// partidos-actuales.js
// Descarga el calendario público de la RFFM para cada categoría del
// club, filtra los partidos que son nuestros (por código de equipo,
// no por nombre de texto) y guarda los que caen dentro de la
// ventana de 7 días en partidos-video.json / lo que consuma el
// resto del pipeline (matchday, cartel semanal, procesar-actas.js).
//
// TEMPORADA 2026-2027 (temporada=22) -- ya en competición real,
// sin ventana fija de pruebas.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ============================================================
// EQUIPOS DEL CLUB (por código numérico de la RFFM, no por texto)
// ============================================================
// El nombre del club en texto libre puede variar (mayúsculas, con/
// sin "DE", abreviado...) así que el filtro real de "esto es
// nuestro" se hace SIEMPRE por código de equipo, nunca por nombre.
const EQUIPOS_CLUB = new Set([
  "846904",   // Segunda Aficionado (Senior)
  "3082888",  // Segunda Cadete
  "3088877",  // Primera Infantil
  "24710895", // Primera Alevín F-7
  "17138002", // Primera Fútbol Femenino
  "23996978", // Primera Benjamín F-7 'A'
  "27703615", // Primera Benjamín F-7 'B' -- confirmado en la ficha oficial del club
]);

// Filtro de respaldo por texto (solo como comprobación extra, nunca
// como criterio único) -- el nombre oficial real en la RFFM es
// "C.D. VILLA BUITRAGO DEL LOZOYA" (sin "DE" entre Villa y
// Buitrago). Usar solo "BUITRAGO" capturaría también a otros clubes
// distintos (ej. "Gredos Buitrago"), así que el filtro de texto
// siempre es "VILLA BUITRAGO", nunca "BUITRAGO" suelto.
const NOMBRE_CLUB_FILTRO = "VILLA BUITRAGO";

// ============================================================
// VENTANA DE FECHAS: próximos 7 días desde hoy
// ============================================================
const HOY = new Date();
const VENTANA_DIAS = 7;
const FECHA_LIMITE = new Date(HOY);
FECHA_LIMITE.setDate(FECHA_LIMITE.getDate() + VENTANA_DIAS);

// Convierte la fecha tal como la mande la RFFM a un objeto Date
// fiable, sin depender de que new Date() adivine bien el formato.
// Acepta ISO (2026-09-24), DD-MM-YYYY y DD/MM/YYYY.
function parsearFecha(valor) {
  if (!valor) return null;

  // ISO ya válido (2026-09-24 o con hora incluida)
  if (/^\d{4}-\d{2}-\d{2}/.test(valor)) {
    return new Date(valor);
  }

  // DD-MM-YYYY o DD/MM/YYYY
  const m = String(valor).match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (m) {
    const [, dia, mes, anio] = m;
    return new Date(`${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`);
  }

  // Como último recurso, lo que JS entienda (puede fallar, por eso
  // es el último intento, no el primero)
  return new Date(valor);
}

let yaMostroDiagnosticoFecha = false;

function dentroDeVentana(fechaPartido) {
  const f = parsearFecha(fechaPartido);

  if (!yaMostroDiagnosticoFecha) {
    console.log(`  [diagnóstico fecha] valor original="${fechaPartido}" -> parseado=${f} (${f && !isNaN(f) ? 'válido' : 'INVÁLIDO'})`);
    yaMostroDiagnosticoFecha = true;
  }

  if (!f || isNaN(f)) return false;
  return f >= HOY && f <= FECHA_LIMITE;
}

// ============================================================
// CALENDARIOS A CONSULTAR, UNO POR CATEGORÍA
// ============================================================
const CALENDARIO_URLS = [

  // Temporada 2026-2027 (temporada=22) -- sustituye por completo a
  // las de temporada=21, que ya no reciben partidos nuevos.

  // Senior (Segunda Aficionado)
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=1&competicion=26738300&grupo=26738302",

  // Alevín (fútbol 7 -- nota el tipojuego=2)
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=2&competicion=26738141&grupo=26738146",

  // Infantil
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=1&competicion=26737828&grupo=26737830",

  // Fútbol femenino (grupo corregido: 26737875, no 26737876)
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=1&competicion=26737874&grupo=26737875",

  // Cadete
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=1&competicion=26737768&grupo=26737774",

  // Benjamín (fútbol 7 -- A y B juntos en la misma competición)
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=2&competicion=26737943&grupo=27642668",

  // Juvenil retirado: el equipo no compite esta temporada.

];

// ============================================================
// DESCARGA Y PARSEO DE CADA CALENDARIO
// ============================================================

// La RFFM corre sobre Liferay y en fechas de mucha carga (fichas,
// jornadas con muchos partidos) responde lento o da 504 -- en vez
// de rendirnos a la primera, reintentamos con una espera creciente
// entre intentos (backoff), y un tiempo de espera más generoso.
const REINTENTOS_MAX = 2;
const TIMEOUT_PAGINA_MS = 25000;

function esperarMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function conReintentos(descripcion, fn) {
  let ultimoError;
  for (let intento = 1; intento <= REINTENTOS_MAX; intento++) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      const esperaMs = intento * 5000; // 5s, 10s, 15s, 20s...
      console.log(`  ⚠️ Intento ${intento}/${REINTENTOS_MAX} falló para ${descripcion}: ${err.message}`);
      if (intento < REINTENTOS_MAX) {
        console.log(`  Reintentando en ${esperaMs / 1000}s...`);
        await esperarMs(esperaMs);
      }
    }
  }
  throw ultimoError;
}

async function descargarCalendario(url, browser) {
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  try {
    const html = await conReintentos(url, async () => {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_PAGINA_MS });
      if (resp && resp.status() >= 500) {
        throw new Error(`HTTP ${resp.status()} (servidor sobrecargado)`);
      }
      // Esperamos un poco extra por si hay alguna comprobación de
      // JavaScript antes de que la página termine de montar el
      // bloque __NEXT_DATA__.
      await page.waitForTimeout(1500);
      const contenido = await page.content();
      if (contenido.length < 5000) {
        throw new Error(`Respuesta sospechosamente pequeña (${contenido.length} caracteres)`);
      }
      return contenido;
    });

    console.log(`  Tamaño de la respuesta: ${html.length} caracteres.`);
    const partidos = extraerPartidos(html);
    const paramsUrl = new URL(url).searchParams;
    const competicion = paramsUrl.get('competicion');
    const grupo = paramsUrl.get('grupo');
    partidos.forEach((p) => {
      p.competicion = competicion;
      p.grupo_id = grupo;
    });
    return partidos;
  } catch (err) {
    console.error(`  ❌ Error descargando ${url} (tras ${REINTENTOS_MAX} intentos): ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

// Extrae la tabla de partidos del HTML público de la RFFM. La
// estructura exacta de la tabla puede variar levemente entre
// competiciones (fútbol 11 vs fútbol 7), así que se buscan los
// campos por atributo/columna, no por posición fija.
function extraerPartidos(html) {
  const bloque = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!bloque) {
    console.error('  ❌ No se encontró el bloque __NEXT_DATA__ en la página (¿cambió la web?).');
    return [];
  }

  let datos;
  try {
    datos = JSON.parse(bloque[1]);
  } catch (err) {
    console.error('  ❌ Error parseando __NEXT_DATA__:', err.message);
    return [];
  }

  const calendar = datos?.props?.pageProps?.calendar;
  if (!calendar || !Array.isArray(calendar.rounds)) {
    console.error('  ❌ No se encontró calendar.rounds dentro de __NEXT_DATA__.');
    console.error('  Claves disponibles en pageProps:', Object.keys(datos?.props?.pageProps || {}));
    return [];
  }

  // Modo diagnóstico: la PRIMERA vez que hay al menos un partido,
  // imprime el objeto completo tal cual viene de la RFFM -- así
  // confirmamos los nombres de campo reales con datos de verdad.
  let yaMostroDiagnostico = false;

  const partidos = [];
  calendar.rounds.forEach((round) => {
    (round.equipos || []).forEach((partido) => {
      if (!yaMostroDiagnostico) {
        console.log('  [diagnóstico] Primer partido tal cual llega de la RFFM:');
        console.log('  ' + JSON.stringify(partido, null, 2).replace(/\n/g, '\n  '));
        yaMostroDiagnostico = true;
      }

      partidos.push({
        codacta: partido.codacta,
        fecha: partido.fecha || partido.Fecha || partido.fecha_partido,
        jornada: round.jornada || round.numero_jornada || round.nombre || '',
        equipo_local: partido.equipo_local || partido.local || partido.nombre_local,
        equipo_visitante: partido.equipo_visitante || partido.visitante || partido.nombre_visitante,
        codigo_equipo_local: String(partido.codigo_local || partido.codigo_equipo_local || ''),
        codigo_equipo_visitante: String(partido.codigo_visitante || partido.codigo_equipo_visitante || ''),
        campo: partido.campo || partido.nombre_campo || '',
        hora: partido.hora || '',
      });
    });
  });

  return partidos;
}
// ============================================================
// FILTRADO: solo partidos nuestros, dentro de la ventana de 7 días
// ============================================================

function esPartidoDelClub(partido) {
  const porCodigo =
    EQUIPOS_CLUB.has(partido.codigo_equipo_local) ||
    EQUIPOS_CLUB.has(partido.codigo_equipo_visitante);

  // Diagnóstico: si el partido tiene texto del club pero el código
  // no está en la lista, avisamos -- puede ser un código nuevo que
  // falta añadir a EQUIPOS_CLUB.
  const pareceDelClubPorTexto =
    (partido.equipo_local || '').toUpperCase().includes(NOMBRE_CLUB_FILTRO) ||
    (partido.equipo_visitante || '').toUpperCase().includes(NOMBRE_CLUB_FILTRO);

  if (pareceDelClubPorTexto && !porCodigo) {
    console.log(
      `  [diagnóstico] ¿Trae código de equipo pero no está en EQUIPOS_CLUB? ` +
      `local="${partido.equipo_local}" (${partido.codigo_equipo_local}) vs ` +
      `visitante="${partido.equipo_visitante}" (${partido.codigo_equipo_visitante})`
    );
  }

  return porCodigo;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(`Consultando ${CALENDARIO_URLS.length} calendarios (temporada 22)...`);
  console.log(`Ventana: hoy (${HOY.toISOString().slice(0, 10)}) hasta ${FECHA_LIMITE.toISOString().slice(0, 10)}`);

  const browser = await chromium.launch();
  let todosLosPartidos = [];

  for (const url of CALENDARIO_URLS) {
    console.log(`\nDescargando: ${url}`);
    const partidos = await descargarCalendario(url, browser);
    console.log(`  ${partidos.length} partidos encontrados en la tabla.`);
    todosLosPartidos = todosLosPartidos.concat(partidos);
  }

  await browser.close();

  const nuestros = todosLosPartidos.filter(esPartidoDelClub);
  console.log(`\nPartidos del club (todas las fechas): ${nuestros.length}`);

  // Mostramos las fechas más próximas de los 98, ordenadas -- así
  // vemos de un vistazo si el partido del sábado está ahí o no,
  // en vez de adivinar con un solo ejemplo.
  const conFechaValida = nuestros
    .map((p) => ({ ...p, _fechaParseada: parsearFecha(p.fecha) }))
    .filter((p) => p._fechaParseada && !isNaN(p._fechaParseada))
    .sort((a, b) => a._fechaParseada - b._fechaParseada);

  const pasados = conFechaValida.filter((p) => p._fechaParseada < HOY);
  const futuros = conFechaValida.filter((p) => p._fechaParseada >= HOY);

  console.log(`\n[diagnóstico] De ${conFechaValida.length} partidos con fecha válida: ${pasados.length} ya pasados, ${futuros.length} futuros.`);
  console.log(`[diagnóstico] Las 10 fechas FUTURAS más próximas (>= hoy):`);
  futuros.slice(0, 10).forEach((p) => {
    console.log(`  ${p.fecha} -- ${p.equipo_local} vs ${p.equipo_visitante} (categoria detectada por código: ${p.codigo_equipo_local}/${p.codigo_equipo_visitante})`);
  });

  const enVentana = nuestros.filter((p) => dentroDeVentana(p.fecha));
  console.log(`Partidos del club dentro de los próximos ${VENTANA_DIAS} días: ${enVentana.length}`);

  const rutaSalida = path.join(__dirname, 'partidos-video.json');
  fs.writeFileSync(rutaSalida, JSON.stringify(enVentana, null, 2));
  console.log(`\n✓ Guardado en ${rutaSalida}`);
}

main().catch((err) => {
  console.error('Error general:', err);
  process.exit(1);
});
