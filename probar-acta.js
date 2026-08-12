/**
 * PRUEBA END-TO-END con actas de temporadas anteriores.
 *
 * Descarga una o varias actas reales, extrae los datos limpios
 * (resultado, alineación, goles, hat-tricks, expulsiones) y los
 * imprime por consola para poder revisarlos a mano.
 *
 * Esto NO toca partidos-video.json ni genera carteles: es solo
 * para verificar que obtener-acta.js + extraer-datos-partido.js
 * funcionan bien juntos, usando actas de partidos que ya se jugaron.
 *
 * USO:
 *   node probar-acta.js
 */

const { obtenerActaCruda } = require("./obtener-acta");
const { extraerDatosPartido } = require("./extraer-datos-partido");

// ============================================================
// ACTAS ANTIGUAS DE PRUEBA
//
// Pon aquí las URLs de actas de partidos ya finalizados de
// temporadas pasadas (las que ya me pasaste sirven).
// ============================================================

const ACTAS_DE_PRUEBA = [
  "https://www.rffm.es/acta-partido/5431943?temporada=21&competicion=24037730&grupo=24037732",
  "https://www.rffm.es/acta-partido/5431946?temporada=21&competicion=24037730&grupo=24037732",
  "https://www.rffm.es/acta-partido/5432490?temporada=21&competicion=24762963&grupo=24762965",
];

// ============================================================
// MAIN
// ============================================================

async function main() {
  for (const url of ACTAS_DE_PRUEBA) {
    console.log("\n================================================");
    console.log(url);
    console.log("================================================");

    try {
      const pageProps = await obtenerActaCruda(url);

      if (!pageProps.game) {
        console.log("  -> Esta página no tiene datos de partido (game).");
        continue;
      }

      if (pageProps.game.acta_cerrada !== "1") {
        console.log("  -> Acta todavía no cerrada, sin datos completos.");
        continue;
      }

      const datos = extraerDatosPartido(pageProps.game);

      console.log(
        `\n${datos.resultado.equipoPropio}  ${datos.resultado.propioLocal ? datos.resultado.local : datos.resultado.visitante}` +
        ` - ${datos.resultado.propioLocal ? datos.resultado.visitante : datos.resultado.local}  ${datos.resultado.rival}`
      );

      console.log(`Categoría: ${datos.categoria} (${datos.grupo}) - Jornada ${datos.jornada}`);
      console.log(`Fecha: ${datos.fecha}  Campo: ${datos.campo}`);

      console.log(`\nAlineación titular (${datos.alineacion.length}):`);
      for (const j of datos.alineacion) {
        console.log(
          `  #${j.dorsal}  ${j.nombre}` +
          `${j.capitan ? "  (C)" : ""}${j.portero ? "  (POR)" : ""}`
        );
      }

      console.log(`\nGoles propios (${datos.golesPropios.length}):`);
      for (const g of datos.golesPropios) {
        console.log(`  min ${g.minuto}'  ${g.jugador}`);
      }

      console.log(`\nGoles rival (${datos.golesRival.length}):`);
      for (const g of datos.golesRival) {
        console.log(`  min ${g.minuto}'`);
      }

      if (datos.hatTricks.length > 0) {
        console.log(`\nHAT-TRICK: ${datos.hatTricks.join(", ")}`);
      }

      if (datos.tarjetas.length > 0) {
        console.log(`\nTarjetas propias (${datos.tarjetas.length}):`);
        for (const t of datos.tarjetas) {
          console.log(
            `  min ${t.minuto}'  ${t.jugador}${t.expulsion ? "  -> EXPULSION" : ""}`
          );
        }
      }
    } catch (err) {
      console.error(`  -> ERROR: ${err.message}`);
    }
  }
}

main();
