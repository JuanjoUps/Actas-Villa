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

// Código oficial del club en la RFFM (mismo que usa generar_cartel.js).
// Filtramos por ESTE código, no por el nombre — nombres como
// "GREDOS SAN DIEGO - BUITRAGO 'D'" contienen la palabra "BUITRAGO"
// sin ser el club, y un filtro de texto los cogería por error.
const CODIGO_CLUB = "846904";

// ============================================================
// ¿Es el club local o visitante en este partido?
// ============================================================

function esClubLocal(game) {
  return game.codigo_equipo_local === CODIGO_CLUB;
}

function esClubVisitante(game) {
  return game.codigo_equipo_visitante === CODIGO_CLUB;
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

  const alineacion = extraerAlineacion(game, esLocal);
  const suplentes = extraerSuplentes(game, esLocal);

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
