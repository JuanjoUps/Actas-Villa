/**
 * REVISAR CLASIFICACIÓN — vigila cambios de posición en la tabla
 * ==================================================================
 *
 * Consulta la clasificación de cada categoría en la RFFM (mismo
 * patrón que ya usa partidos-actuales.js para el calendario: HTML
 * con __NEXT_DATA__ embebido), busca la fila de tu equipo, y la
 * compara con la última vez que se consultó (guardada en
 * clasificacion-estado.json). Si hay cambios, los deja listados en
 * clasificacion-cambios.json para que el workflow te los mande por
 * email — si no hay cambios, no se manda nada.
 *
 * IMPORTANTE — primera ejecución: como el patrón de datos de esta
 * página no lo hemos visto todavía, la primera vez que corra este
 * script SOLO va a volcar un diagnóstico (qué claves trae
 * pageProps, y una muestra del contenido) en vez de intentar
 * extraer la tabla — así lo ajustamos con datos reales en vez de
 * adivinar. Una vez confirmado, hay que rellenar `extraerTabla()`
 * de más abajo con los nombres de campo correctos.
 *
 * USO:
 *   node revisar-clasificacion.js
 */

const fetch = require("node-fetch");
const fs2 = require("fs");
const path = require("path");

const ESTADO_PATH = path.join(__dirname, "clasificacion-estado.json");
const CAMBIOS_PATH = path.join(__dirname, "clasificacion-cambios.json");

// ============================================================
// CATEGORÍAS A VIGILAR — mismos competicion/grupo/temporada que
// CALENDARIO_URLS en partidos-actuales.js. Si añades una
// categoría nueva ahí, añádela también aquí.
// ============================================================

const CATEGORIAS = [
  { nombre: "Senior (Segunda Aficionado)", temporada: 22, tipojuego: 1, competicion: 26738300, grupo: 26738302 },
  { nombre: "Cadete", temporada: 22, tipojuego: 1, competicion: 26737768, grupo: 26737774 },
  { nombre: "Infantil", temporada: 22, tipojuego: 1, competicion: 26737828, grupo: 26737830 },
  { nombre: "Alevín F-7", temporada: 22, tipojuego: 2, competicion: 26738141, grupo: 26738146 },
  { nombre: "Fútbol femenino", temporada: 22, tipojuego: 1, competicion: 26737874, grupo: 26737875 },
  { nombre: "Benjamín F-7", temporada: 22, tipojuego: 2, competicion: 26737943, grupo: 27642668 },
  { nombre: "Prebenjamín F-7", temporada: 22, tipojuego: 2, competicion: 26797573, grupo: 28112552 },
];

// Nombre con el que se avisa cuando hay dos equipos del club en el mismo
// grupo (Benjamín A y B comparten competición y grupo).
const NOMBRE_POR_EQUIPO = {
  "23996978": "Benjamín F-7 (A)",
  "27703615": "Benjamín F-7 (B)",
};

// Códigos de equipo del club, para localizar la fila correcta en
// la tabla (mismos que EQUIPOS_CLUB del resto del proyecto).
const EQUIPOS_CLUB = new Set([
  "846904", "3082888", "3088877", "24710895", "17138002", "23996978", "27703615", "28105851",
]);

// ============================================================
// ÚLTIMA JORNADA JUGADA POR CATEGORÍA — la RFFM no da la última
// clasificación por defecto si no le pasas "jornada" en la URL
// (sin ese parámetro, siempre devuelve la jornada 1). La sacamos
// de partidos-video.json, que el propio proyecto ya mantiene al
// día con la jornada de cada partido.
// ============================================================

function ultimaJornadaPorCategoria() {
  const rutaPartidos = path.join(__dirname, "partidos-video.json");
  const resultado = {};

  if (!fs2.existsSync(rutaPartidos)) {
    console.log(
      "  Aviso: no existe partidos-video.json — se usará la jornada 1 " +
      "por defecto (ejecuta antes partidos-actuales.js si puedes)."
    );
    return resultado;
  }

  const partidos = JSON.parse(fs2.readFileSync(rutaPartidos, "utf-8"));

  partidos.forEach((p) => {
    if (!p.finalizado) return;
    const clave = `${p.temporada}|${p.competicion}|${p.grupo}`;
    const jornadaNum = Number(p.jornada) || 0;
    if (!resultado[clave] || jornadaNum > resultado[clave]) {
      resultado[clave] = jornadaNum;
    }
  });

  return resultado;
}

// ============================================================
// DESCARGA + PARSEO (mismo patrón que obtenerCalendario)
// ============================================================

async function obtenerClasificacion(categoria, jornada) {
  const url =
    `https://www.rffm.es/competicion/clasificaciones?temporada=${categoria.temporada}` +
    `&tipojuego=${categoria.tipojuego}&competicion=${categoria.competicion}` +
    `&grupo=${categoria.grupo}` +
    (jornada ? `&jornada=${jornada}` : "");

  console.log(`Consultando: ${url}`);

  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await resp.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    console.log(`  No se encontró __NEXT_DATA__ para ${categoria.nombre}.`);
    return null;
  }

  const data = JSON.parse(match[1]);
  return data.props.pageProps;
}

// ============================================================
// DIAGNÓSTICO — vuelca qué trae pageProps, para confirmar el
// nombre real de la clave de la tabla antes de intentar leerla.
// ============================================================

function diagnosticar(pageProps, nombreCategoria) {
  console.log(`\n[diagnóstico] ${nombreCategoria} — claves en pageProps:`);
  console.log("  " + Object.keys(pageProps).join(", "));

  // Mostramos un fragmento de cada clave que parezca prometedora
  // (tabla, clasificacion, standing...) para ver su forma real.
  Object.keys(pageProps).forEach((clave) => {
    if (/clasific|standing|tabla|team|equipo/i.test(clave)) {
      const contenido = JSON.stringify(pageProps[clave]).slice(0, 800);
      console.log(`  [${clave}] = ${contenido}`);
    }
  });
}

// ============================================================
// EXTRAER LA TABLA — PENDIENTE de confirmar con datos reales.
// De momento intenta las claves más probables; si falla, lo dice
// claramente en vez de fallar en silencio.
// ============================================================

function extraerTabla(pageProps) {
  // Confirmado con datos reales: la tabla vive en
  // pageProps.standings.clasificacion (no en la raíz de pageProps).
  return pageProps?.standings?.clasificacion || null;
}

function encontrarFilaDelClub(tabla) {
  if (!Array.isArray(tabla)) return null;
  // El campo real se llama "codequipo" (confirmado con datos reales).
  return tabla.filter((fila) => EQUIPOS_CLUB.has(String(fila.codequipo)));
}

// ============================================================
// ESTADO ANTERIOR (para comparar)
// ============================================================

function cargarEstadoAnterior() {
  if (!fs2.existsSync(ESTADO_PATH)) return {};
  return JSON.parse(fs2.readFileSync(ESTADO_PATH, "utf-8"));
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const estadoAnterior = cargarEstadoAnterior();
  // Se parte del estado anterior: si una categoría falla un día, no se pierde
  // su posición (así no salen avisos falsos en la siguiente ejecución).
  const estadoNuevo = { ...estadoAnterior };
  const cambios = [];
  const jornadas = ultimaJornadaPorCategoria();

  for (const categoria of CATEGORIAS) {
    const clave = `${categoria.temporada}|${categoria.competicion}|${categoria.grupo}`;
    const jornada = jornadas[clave] || null;

    const pageProps = await obtenerClasificacion(categoria, jornada);
    if (!pageProps) continue;

    const tabla = extraerTabla(pageProps);

    if (!tabla) {
      console.log(
        `  ⚠️ No se pudo localizar la tabla de clasificación para ${categoria.nombre} ` +
        `con los nombres de campo probados — mostrando diagnóstico completo:`
      );
      diagnosticar(pageProps, categoria.nombre);
      continue;
    }

    const filasClub = encontrarFilaDelClub(tabla);
    if (!filasClub || filasClub.length === 0) {
      console.log(`  ⚠️ No se encontró la fila del club en la tabla de ${categoria.nombre}.`);
      diagnosticar(pageProps, categoria.nombre);
      continue;
    }

    for (const filaClub of filasClub) {
      const posicionActual = Number(filaClub.posicion || filaClub.puesto || filaClub.rank);
      const puntos = Number(filaClub.puntos || filaClub.points);
      const totalEquipos = tabla.length;

      // Si hay más de un equipo del club en el grupo (Benjamín A y B),
      // se distinguen por el nombre del equipo.
      const clave2 = filasClub.length > 1
        ? (NOMBRE_POR_EQUIPO[String(filaClub.codequipo)] || `${categoria.nombre} · ${filaClub.codequipo}`)
        : categoria.nombre;

      estadoNuevo[clave2] = { posicion: posicionActual, puntos, totalEquipos };

      const anterior = estadoAnterior[clave2];
      const detalle = `puesto ${posicionActual} de ${totalEquipos} (${puntos} puntos)`;
      const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

      if (anterior && anterior.posicion !== posicionActual) {
        const subio = posicionActual < anterior.posicion;
        cambios.push({
          categoria: clave2,
          posicionAnterior: anterior.posicion,
          posicionNueva: posicionActual,
          puntos,
          totalEquipos,
          subio,
          texto: `${subio ? "⬆️ SUBE" : "⬇️ BAJA"} — ${clave2}: puesto ${anterior.posicion} -> ${posicionActual} de ${totalEquipos} (${puntos} puntos)`,
        });
      } else if (!anterior || manual) {
        // Categoría vista por primera vez, o ejecución manual: se manda la
        // posición actual de TODOS los equipos, aunque no haya cambiado.
        cambios.push({
          categoria: clave2,
          posicionNueva: posicionActual,
          puntos,
          totalEquipos,
          texto: `📌 ${clave2}: ${detalle}`,
        });
      }
    }
  }

  fs2.writeFileSync(ESTADO_PATH, JSON.stringify(estadoNuevo, null, 2));

  if (cambios.length > 0) {
    fs2.writeFileSync(CAMBIOS_PATH, JSON.stringify(cambios, null, 2));
    console.log(`\n${cambios.length} aviso(s) de clasificación:`);
    cambios.forEach((c) => console.log("  " + c.texto));
  } else {
    if (fs2.existsSync(CAMBIOS_PATH)) fs2.unlinkSync(CAMBIOS_PATH);
    console.log("\nSin cambios de posición desde la última revisión.");
  }
}

main().catch((e) => {
  console.error("❌ ERROR:", e);
  process.exit(1);
});
