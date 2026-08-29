/**
 * Vigila el calendario de C.D. Villa de Buitrago en rffm.es.
 *
 * PRUEBA:
 *   Del 01-02-2026 al 14-02-2026
 *
 * Obtiene:
 *   - Partidos de la Federación
 *   - Partidos manuales (cualquier categoría: veterano, pretemporada,
 *     amistosos sueltos...), rellenados desde el formulario de Apps
 *     Script y guardados en partidos-manuales.json
 *
 * Además de generar los carteles, guarda TODOS los partidos
 * encontrados en:
 *
 *   partidos-video.json
 *
 * Ese archivo será utilizado posteriormente por generar-video.js
 *
 * NOVEDAD: cada partido de la Federación ahora incluye también
 * temporada, competicion y grupo, necesarios para poder construir
 * la URL del acta (acta-partido/<codacta>?temporada=...) desde
 * procesar-actas.js.
 */

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const {
  generarImagenJornada,
  formatearFecha,
  formatearCampo,
  GestorEscudos,
} = require("./generar_cartel");

// ============================================================
// EQUIPOS DEL CLUB (uno por categoría — sacado de la ficha real
// del club en la RFFM: rffm.es/fichaclub/847373). Antes solo
// teníamos el código de Segunda Aficionado, por eso el resto de
// categorías dependían del filtro por texto, que coló a "Gredos".
// ============================================================

const EQUIPOS_CLUB = new Set([
  "846904",   // Segunda Aficionado
  "2276659",  // Primera Juvenil
  "3082888",  // Segunda Cadete
  "3088877",  // Primera Infantil
  "24710895", // Primera Alevín F-7
  "17138002", // Primera Fútbol Femenino
  // "23996978" Primera Benjamín F7 queda fuera a propósito: la
  // ficha del club la marca "en_competicion": "0" (no compite
  // esta temporada) — si vuelve a competir, añádela aquí.
]);

// ============================================================
// CONFIGURACIÓN FEDERACIÓN
// ============================================================

const CALENDARIO_URLS = [

  // Temporada 2026-2027 (temporada=22) — sustituye por completo a
  // las de temporada=21, que ya no reciben partidos nuevos.

  // Senior (Segunda Aficionado)
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=1&competicion=26738300&grupo=26738302",

  // Alevín (fútbol 7 — nota el tipojuego=2)
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=2&competicion=26738141&grupo=26738146",

  // Juvenil
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=1&competicion=26737724&grupo=26737728",

  // Infantil
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=1&competicion=26737828&grupo=26737830",

  // Fútbol femenino
  "https://www.rffm.es/competicion/calendario?temporada=22&tipojuego=1&competicion=26737874&grupo=26737876",

];


// Texto que identifica al club

const NOMBRE_CLUB_FILTRO = "BUITRAGO";


// ============================================================
// RANGO DE PRUEBA
// ============================================================
//
// SOLO PARA ESTA PRUEBA.
//
// Cuando pasemos a producción:
// const RANGO_FIJO_PRUEBA = null;
//
// ============================================================

const RANGO_FIJO_PRUEBA = {
  desde: "01-02-2026",
  hasta: "14-02-2026"
};


const DIAS_VENTANA = 9;


// ============================================================
// FUNCIONES DE FECHA
// ============================================================

function fechaEnVentana(fechaDDMMYYYY) {

  const [dia, mes, anio] =
    fechaDDMMYYYY
      .split("-")
      .map(Number);

  const fechaPartido =
    new Date(
      anio,
      mes - 1,
      dia
    );


  // ------------------------------------------
  // PRUEBA FIJA
  // ------------------------------------------

  if (RANGO_FIJO_PRUEBA) {

    const [d1, m1, a1] =
      RANGO_FIJO_PRUEBA.desde
        .split("-")
        .map(Number);

    const [d2, m2, a2] =
      RANGO_FIJO_PRUEBA.hasta
        .split("-")
        .map(Number);


    return (
      fechaPartido >=
        new Date(a1, m1 - 1, d1)
      &&
      fechaPartido <=
        new Date(a2, m2 - 1, d2)
    );
  }


  // ------------------------------------------
  // PRODUCCIÓN
  // ------------------------------------------

  const hoy =
    new Date();

  hoy.setHours(
    0,
    0,
    0,
    0
  );


  const limite =
    new Date(hoy);

  limite.setDate(
    limite.getDate() +
    DIAS_VENTANA
  );


  return (
    fechaPartido >= hoy &&
    fechaPartido <= limite
  );
}


// ============================================================
// RUTAS
// ============================================================

const ESTADO_PATH =
  path.join(
    __dirname,
    "estado.json"
  );


const SALIDA_DIR =
  path.join(
    __dirname,
    "carteles-generados"
  );


const PARTIDOS_VIDEO_PATH =
  path.join(
    __dirname,
    "partidos-video.json"
  );


// ============================================================
// PARTIDOS MANUALES (cualquier categoría: veterano, pretemporada,
// amistosos sueltos...) — vienen del formulario de Apps Script,
// guardados en partidos-manuales.json
// ============================================================

const CAMPO_LOCAL = "Peñalta, Buitrago del Lozoya";

const PARTIDOS_MANUALES_PATH = path.join(
  __dirname,
  "partidos-manuales.json"
);

function partidosManuales() {
  if (!fs.existsSync(PARTIDOS_MANUALES_PATH)) {
    console.log("Sin partidos-manuales.json — se omiten los amistosos por ahora.");
    return [];
  }

  const lista = require("./partidos-manuales.json");

  return lista.map((p, i) => ({
    codacta: "MAN-" + p.categoria + "-" + p.fecha + "-" + i,
    jornada: "",
    categoria: p.categoria + " - AMISTOSO",
    equipoPropio: "VILLA DE BUITRAGO",
    rival: p.rival,
    rivalEscudo: "", // el gestor de escudos usa la caché o el genérico
    fecha: p.fecha,
    hora: p.hora,
    campo: p.esLocal ? CAMPO_LOCAL : p.campo || p.rival,
    esLocal: p.esLocal,
    finalizado: false,
    // Los amistosos manuales no tienen acta real en la RFFM.
    temporada: null,
    competicion: null,
    grupo: null,
  }));
}


// ============================================================
// OBTENER CALENDARIO RFFM
// ============================================================

async function obtenerCalendario(url) {

  console.log(
    `Consultando Federación: ${url}`
  );


  const resp =
    await fetch(
      url,
      {
        headers: {

          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"

        }
      }
    );


  const html =
    await resp.text();


  const match =
    html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );


  if (!match) {

    throw new Error(
      "No se encontró __NEXT_DATA__ en " +
      url
    );

  }


  const data =
    JSON.parse(
      match[1]
    );

  // Sacamos temporada, competicion y grupo de la propia URL de
  // consulta, para poder guardarlos junto a cada partido y así
  // luego poder construir la URL exacta de su acta.
  const urlObj = new URL(url);

  return {
    calendario: data.props.pageProps.calendar,
    temporada: urlObj.searchParams.get("temporada"),
    competicion: urlObj.searchParams.get("competicion"),
    grupo: urlObj.searchParams.get("grupo"),
  };
}


// ============================================================
// EXTRAER PARTIDOS DEL CLUB
// ============================================================

function partidosDelClub(
  calendario,
  meta
) {

  const partidos = [];

  // DIAGNÓSTICO TEMPORAL: para confirmar si el calendario trae
  // código de equipo (fiable) o si toca seguir usando el nombre
  // (con el riesgo de que vuelva a colarse un "falso Buitrago").
  const primerEquipo = calendario.rounds?.[0]?.equipos?.[0];
  if (primerEquipo) {
    console.log(
      "  [diagnóstico] ¿Trae código de equipo el calendario?",
      primerEquipo.codigo_equipo_local !== undefined
        ? `Sí (codigo_equipo_local=${primerEquipo.codigo_equipo_local})`
        : "No — se sigue usando el filtro por nombre"
    );
  }


  for (
    const ronda of
    calendario.rounds
  ) {

    for (
      const m of
      ronda.equipos
    ) {

      // Preferimos el código oficial del equipo (fiable) sobre el
      // texto del nombre — "GREDOS SAN DIEGO - BUITRAGO 'D'" no es
      // nuestro club aunque contenga la palabra "BUITRAGO", y ya
      // nos coló por error una vez con el filtro de texto.
      const tieneCodigos =
        m.codigo_equipo_local !== undefined ||
        m.codigo_equipo_visitante !== undefined;

      // Respaldo de texto más estricto: si algún día el calendario
      // no trae el código, exigimos "VILLA" además de "BUITRAGO"
      // (un "BUITRAGO" suelto también coincide con clubes ajenos
      // como "Gredos San Diego - Buitrago").
      const nombreCoincide = (nombre) => {
        const n = (nombre || "").toUpperCase();
        return n.includes("VILLA") && n.includes("BUITRAGO");
      };

      const localEsClub = tieneCodigos
        ? EQUIPOS_CLUB.has(m.codigo_equipo_local)
        : nombreCoincide(m.equipo_local);

      const visitanteEsClub = tieneCodigos
        ? EQUIPOS_CLUB.has(m.codigo_equipo_visitante)
        : nombreCoincide(m.equipo_visitante);

      if (
        !localEsClub &&
        !visitanteEsClub
      ) {

        continue;
      }


      const esLocal =
        localEsClub;


      const escudoRivalRelativo =
        esLocal
          ? m.escudo_equipo_visitante
          : m.escudo_equipo_local;


      partidos.push({

        codacta:
          m.codacta,

        jornada:
          ronda.codjornada,

        categoria:
          calendario.competicion ||
          "",

        equipoPropio:
          (
            esLocal
              ? m.equipo_local
              : m.equipo_visitante ||
              ""
          ).trim(),

        rival:
          (
            esLocal
              ? m.equipo_visitante
              : m.equipo_local ||
              ""
          ).trim(),

        rivalEscudo:
          escudoRivalRelativo
            ? "https://appweb.rffm.es" +
              escudoRivalRelativo
            : "",

        fecha:
          m.fecha,

        hora:
          (
            m.hora ||
            ""
          ).trim(),

        campo:
          m.campo,

        esLocal,

        finalizado:
          m.goles_casa !== "" &&
          m.goles_casa != null,

        // Necesarios para poder construir luego la URL del acta.
        temporada: meta.temporada,
        competicion: meta.competicion,
        grupo: meta.grupo,

      });

    }

  }


  return partidos;
}


// ============================================================
// ESTADO
// ============================================================

function cargarEstado() {

  if (
    !fs.existsSync(
      ESTADO_PATH
    )
  ) {

    return {};

  }


  return JSON.parse(
    fs.readFileSync(
      ESTADO_PATH,
      "utf-8"
    )
  );
}


// ============================================================
// GUARDAR ESTADO
// ============================================================

function guardarEstado(
  estado
) {

  fs.writeFileSync(

    ESTADO_PATH,

    JSON.stringify(
      estado,
      null,
      2
    )

  );
}


// ============================================================
// MAIN
// ============================================================

async function main() {

  if (
    !fs.existsSync(
      SALIDA_DIR
    )
  ) {

    fs.mkdirSync(
      SALIDA_DIR
    );

  }


  const estado =
    cargarEstado();


  const gestorEscudos =
    new GestorEscudos();


  let generados = 0;


  // ==========================================================
  // OBTENER TODOS LOS PARTIDOS
  // ==========================================================

  let todosLosPartidos = [];


  console.log(
    "\n================================"
  );

  console.log(
    "DESCARGANDO CALENDARIO RFFM"
  );

  console.log(
    "================================\n"
  );


  for (
    const url of
    CALENDARIO_URLS
  ) {

    const { calendario, temporada, competicion, grupo } =
      await obtenerCalendario(
        url
      );


    const partidos =
      partidosDelClub(
        calendario,
        { temporada, competicion, grupo }
      );


    console.log(
      `Partidos del club encontrados: ${partidos.length}`
    );


    todosLosPartidos =
      todosLosPartidos.concat(
        partidos
      );

  }


  // ==========================================================
  // PARTIDOS MANUALES (veterano, pretemporada, amistosos...)
  // ==========================================================

  console.log(
    "\n================================"
  );

  console.log(
    "PARTIDOS MANUALES"
  );

  console.log(
    "================================\n"
  );


  const partidosAmistosos =
    partidosManuales();


  console.log(
    `Partidos manuales encontrados: ${partidosAmistosos.length}`
  );


  todosLosPartidos =
    todosLosPartidos.concat(
      partidosAmistosos
    );


  // ==========================================================
  // GUARDAR DATOS REALES PARA EL VÍDEO
  // ==========================================================

  fs.writeFileSync(

    PARTIDOS_VIDEO_PATH,

    JSON.stringify(
      todosLosPartidos,
      null,
      2
    )

  );


  console.log(
    `\nDatos para vídeo guardados: ${todosLosPartidos.length} partidos`
  );


  console.log(
    `Archivo: ${PARTIDOS_VIDEO_PATH}`
  );


  // ==========================================================
  // FILTRAR PARTIDOS CON HORA Y FECHA
  // ==========================================================

  const porFecha = {};


  for (
    const p of
    todosLosPartidos
  ) {

    if (!p.hora) {
      continue;
    }


    if (
      !fechaEnVentana(
        p.fecha
      )
    ) {

      continue;

    }


    if (
      !porFecha[p.fecha]
    ) {

      porFecha[p.fecha] = [];

    }


    porFecha[p.fecha].push(
      p
    );

  }


  // ==========================================================
  // GENERAR CARTELES
  // ==========================================================

  console.log(
    "\n================================"
  );

  console.log(
    "GENERANDO CARTELES"
  );

  console.log(
    "================================\n"
  );


  for (
    const fecha of
    Object.keys(
      porFecha
    )
  ) {

    const partidosDelDia =
      porFecha[fecha];


    const firma =
      partidosDelDia
        .map(
          p =>
            `${p.codacta}:${p.hora}:${p.campo}`
        )
        .sort()
        .join("|");


    if (
      estado[fecha] ===
      firma
    ) {

      console.log(
        `Sin cambios en ${fecha}`
      );

      continue;

    }


    console.log(
      `Cambios en ${fecha}: ${partidosDelDia.length} partido(s).`
    );


    const partidosConEscudo = [];


    for (
      const p of
      partidosDelDia
    ) {

      const escudoRival =
        await gestorEscudos.obtener(
          p.rival,
          p.rivalEscudo
        );


      partidosConEscudo.push({

        categoria:
          p.categoria,

        rival:
          p.rival,

        escudoRival,

        esLocal:
          p.esLocal,

        hora:
          p.hora,

        campo:
          formatearCampo(
            p.campo
          )

      });

    }


    partidosConEscudo.sort(
      (a, b) =>
        a.hora.localeCompare(
          b.hora
        )
    );


    const nombreArchivo =
      `jornada-${fecha}.png`;


    const salida =
      path.join(
        SALIDA_DIR,
        nombreArchivo
      );


    // Un fallo generando ESTE cartel concreto (p.ej. si falta la
    // plantilla cartel-jornada.html en este repo) no debe tumbar
    // todo el proceso — seguimos con el resto de fechas y, sobre
    // todo, dejamos que continúe el resto del workflow (actas).
    try {
      await generarImagenJornada(

        fecha,

        partidosConEscudo,

        salida

      );

      estado[fecha] =
        firma;

      generados++;
    } catch (err) {
      console.error(
        `  -> ERROR generando cartel de ${fecha}: ${err.message}`
      );
      console.error(
        "     (se omite este cartel y se continúa con el resto)"
      );
    }

  }


  await gestorEscudos.cerrar();


  guardarEstado(
    estado
  );


  // ==========================================================
  // RESULTADO
  // ==========================================================

  console.log(
    "\n================================"
  );

  console.log(
    "RESULTADO"
  );

  console.log(
    "================================"
  );


  if (
    generados === 0
  ) {

    console.log(
      "Sin cambios: ningún día nuevo o modificado desde la última revisión."
    );

  } else {

    console.log(
      `${generados} cartel(es) generado(s) en ${SALIDA_DIR}`
    );

  }


  console.log(
    `\nPartidos totales encontrados: ${todosLosPartidos.length}`
  );

  console.log(
    `Partidos dentro del periodo de prueba: ${
      Object.values(porFecha)
        .reduce(
          (total, lista) =>
            total + lista.length,
          0
        )
    }`
  );

  console.log(
    `\nDatos para vídeo: ${PARTIDOS_VIDEO_PATH}`
  );

}


// ============================================================
// ARRANCAR
// ============================================================

main().catch(
  err => {

    console.error(
      "\n❌ ERROR:"
    );

    console.error(
      err
    );

    process.exit(1);

  }
);
