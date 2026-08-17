/**
 * Convierte el objeto "game" del acta de rffm.es (extraído de
 * __NEXT_DATA__ en la página /acta-partido/<codacta>) en los datos
 * limpios que necesita el generador de vídeo: resultado, alineación,
 * goles propios/rival, tarjetas, hat-tricks y expulsiones.
 *
 * ENTRADA: el objeto "game" tal cual viene en:
 *   data.props.pageProps.game
 *
 * SALIDA: un objeto listo para partidos-video.json / generar-video.js
 *
 * PENDIENTE DE CONFIRMAR:
 *   El código "codigo_tipo_amonestacion" de una tarjeta ROJA directa
 *   todavía no lo hemos visto en un ejemplo real (solo amarillas,
 *   código "100"). En cuanto tengamos un acta con roja directa,
 *   hay que revisar y ajustar la función esExpulsion() de abajo.
 */

// Equipos del club en la RFFM, uno por categoría (sacado de la
// ficha real del club: rffm.es/fichaclub/847373). Filtramos por
// estos códigos, no por el nombre — nombres como "GREDOS SAN
// DIEGO - BUITRAGO 'D'" contienen la palabra "BUITRAGO" sin ser
// el club, y un filtro de texto los cogería por error.
const EQUIPOS_CLUB = new Set([
  "846904",   // Segunda Aficionado
  "2276659",  // Primera Juvenil
  "3082888",  // Segunda Cadete
  "3088877",  // Primera Infantil
  "24710895", // Primera Alevín F-7
  "17138002", // Primera Fútbol Femenino
  // "23996978" Primera Benjamín F7 no compite esta temporada.
]);

// ============================================================
// ¿Es el club local o visitante en este partido?
// ============================================================

function esClubLocal(game) {
  return EQUIPOS_CLUB.has(game.codigo_equipo_local);
}

function esClubVisitante(game) {
  return EQUIPOS_CLUB.has(game.codigo_equipo_visitante);
}

// ============================================================
// Alineación titular del club (para la animación al campo)
// ============================================================

// El acta da los nombres como "APELLIDOS, NOMBRE" (p.ej.
// "GONZÁLEZ GARCÍA, GEMA MARÍA"). Los pasamos a "Nombre Apellidos".
function invertirNombre(nombreCrudo) {
  if (!nombreCrudo || !nombreCrudo.includes(",")) return nombreCrudo || "";
  const [apellidos, nombre] = nombreCrudo.split(",").map((s) => s.trim());
  return `${nombre} ${apellidos}`;
}

// ¿Es un partido de fútbol 7? En estas categorías el acta a veces
// marca como "titular" a más jugadores de los que caben en el
// campo (hasta 14-15) — necesitamos saberlo para poner el tope
// correcto (7, no 11).
function esFutbol7(game) {
  const texto = `${game.nombre_competicion || ""} ${game.nombre_grupo || ""}`
    .toUpperCase();
  return (
    texto.includes("F-7") ||
    texto.includes("F7") ||
    texto.includes("FUTBOL 7") ||
    texto.includes("FÚTBOL 7")
  );
}

function extraerAlineacion(game, esLocal) {
  const jugadores = esLocal
    ? game.jugadores_equipo_local
    : game.jugadores_equipo_visitante;

  return (jugadores || [])
    .filter((j) => j.titular === "1")
    .map((j) => ({
      dorsal: j.dorsal,
      nombre: invertirNombre(j.nombre_jugador),
      capitan: j.capitan === "1",
      portero: j.portero === "1",
    }));
}

// Suplentes (para la lista lateral junto al campo).
// Jugadores que ENTRARON en algún cambio durante el partido (los
// que de verdad participaron), leído de la sección de
// sustituciones del acta.
function extraerCambios(game, esLocal) {
  const cambios = esLocal
    ? game.sustituciones_equipo_local
    : game.sustituciones_equipo_visitante;

  if (!Array.isArray(cambios) || cambios.length === 0) return null;

  const vistos = new Set();
  const resultado = [];

  cambios.forEach((c) => {
    // El nombre exacto del campo puede variar según categoría —
    // probamos las variantes más habituales.
    const nombreEntra =
      c.nombre_jugador_entra || c.jugador_entra || c.entra || c.nombre_entra;
    const dorsalEntra = c.dorsal_entra || c.dorsal_jugador_entra || "";

    if (nombreEntra && !vistos.has(nombreEntra)) {
      vistos.add(nombreEntra);
      resultado.push({ dorsal: dorsalEntra, nombre: invertirNombre(nombreEntra) });
    }
  });

  return resultado.length > 0 ? resultado : null;
}

function extraerSuplentes(game, esLocal) {
  // Preferimos los que constan como ENTRADOS en algún cambio (la
  // sección de sustituciones) — esos sí participaron de verdad.
  // Si el acta no trae esa sección reconocible, usamos como
  // respaldo el listado completo del banquillo.
  const porCambios = extraerCambios(game, esLocal);
  if (porCambios) return porCambios;

  const jugadores = esLocal
    ? game.jugadores_equipo_local
    : game.jugadores_equipo_visitante;

  return (jugadores || [])
    .filter((j) => j.suplente === "1")
    .map((j) => ({
      dorsal: j.dorsal,
      nombre: invertirNombre(j.nombre_jugador),
    }));
}

// ============================================================
// Goles propios y del rival
// ============================================================

function extraerGoles(game, esLocal) {
  const golesPropios = esLocal
    ? game.goles_equipo_local
    : game.goles_equipo_visitante;

  const golesRival = esLocal
    ? game.goles_equipo_visitante
    : game.goles_equipo_local;

  const propios = (golesPropios || []).map((g) => ({
    jugador: invertirNombre(g.nombre_jugador),
    minuto: Number(g.minuto),
  }));

  const rival = (golesRival || []).map((g) => ({
    minuto: Number(g.minuto),
  }));

  return { propios, rival };
}

// ============================================================
// Hat-tricks (3 o más goles del mismo jugador propio)
// ============================================================

function detectarHatTricks(golesPropios) {
  const conteo = {};

  for (const g of golesPropios) {
    conteo[g.jugador] = (conteo[g.jugador] || 0) + 1;
  }

  return Object.keys(conteo).filter((nombre) => conteo[nombre] >= 3);
}

// ============================================================
// Tarjetas del club y detección de expulsión
//
// De momento consideramos expulsión: segunda amarilla, o
// cualquier código de amonestación que NO sea "100" (amarilla
// simple). AJUSTAR cuando tengamos un ejemplo real con roja.
// ============================================================

function esExpulsion(tarjeta) {
  if (tarjeta.segunda_amarilla === "1") {
    return true;
  }

  // TODO: confirmar el código real de tarjeta roja directa
  if (tarjeta.codigo_tipo_amonestacion !== "100") {
    return true;
  }

  return false;
}

function extraerTarjetas(game, esLocal) {
  const tarjetas = esLocal
    ? game.tarjetas_equipo_local
    : game.tarjetas_equipo_visitante;

  return (tarjetas || []).map((t) => ({
    jugador: t.nombre_jugador,
    minuto: Number(t.minuto),
    expulsion: esExpulsion(t),
  }));
}

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================

function extraerDatosPartido(game) {
  const esLocal = esClubLocal(game);
  const esVisitante = esClubVisitante(game);

  if (!esLocal && !esVisitante) {
    throw new Error(
      `Este partido no es del club (${(game.equipo_local || "").trim()}` +
      ` vs ${(game.equipo_visitante || "").trim()}), acta ${game.codacta}`
    );
  }

  const escudoUrl = (relativo) =>
    relativo ? "https://appweb.rffm.es" + relativo : "";

  const resultado = {
    local: Number(game.goles_local),
    visitante: Number(game.goles_visitante),
    propioLocal: esLocal,
    equipoPropio: esLocal ? game.equipo_local.trim() : game.equipo_visitante.trim(),
    rival: esLocal ? game.equipo_visitante.trim() : game.equipo_local.trim(),
    // URLs crudas del escudo en rffm.es. GestorEscudos (de
    // generar_cartel.js) las convierte en data URI cacheada.
    escudoPropioUrl: escudoUrl(esLocal ? game.escudo_local : game.escudo_visitante),
    escudoRivalUrl: escudoUrl(esLocal ? game.escudo_visitante : game.escudo_local),
  };

  let alineacion = extraerAlineacion(game, esLocal);
  let suplentes = extraerSuplentes(game, esLocal);

  // Tope de titulares según el tipo de partido — si el acta marca
  // más "titulares" de los que caben en el campo (pasa en algunas
  // actas de F-7), los que sobran pasan a "también participaron"
  // en vez de amontonarse en el campo.
  const maxTitulares = esFutbol7(game) ? 7 : 11;

  if (alineacion.length > maxTitulares) {
    // Portero primero, luego el resto en su orden — nos quedamos
    // con los primeros "maxTitulares" para el campo.
    const ordenados = [...alineacion].sort(
      (a, b) => Number(b.portero) - Number(a.portero)
    );
    const sobran = ordenados.slice(maxTitulares).map((j) => ({
      dorsal: j.dorsal,
      nombre: j.nombre,
    }));
    alineacion = ordenados.slice(0, maxTitulares);
    suplentes = [...sobran, ...suplentes];
  }

  const { propios: golesPropios, rival: golesRival } = extraerGoles(
    game,
    esLocal
  );

  const hatTricks = detectarHatTricks(golesPropios);

  const tarjetas = extraerTarjetas(game, esLocal);

  const expulsiones = tarjetas.filter((t) => t.expulsion);

  return {
    codacta: game.codacta,
    categoria: game.nombre_competicion,
    grupo: game.nombre_grupo,
    jornada: game.jornada,
    fecha: game.fecha,
    campo: game.campo,
    resultado,
    alineacion,
    suplentes,
    golesPropios,
    golesRival,
    hatTricks,
    tarjetas,
    expulsiones,
  };
}

module.exports = { extraerDatosPartido };
