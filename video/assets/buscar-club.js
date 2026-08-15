// ============================================================
// DIAGNÓSTICO: vuelca en el log el contenido real de la ficha
// del club en la RFFM (equipos, categorías, códigos), para
// construir un filtro definitivo por código de equipo — sin
// depender de coincidencias de texto en el nombre.
//
// Uso: node buscar-club.js
// ============================================================

const fetch = require("node-fetch");

const URL_FICHA_CLUB = "https://www.rffm.es/fichaclub/847373";

async function main() {
  console.log("Consultando:", URL_FICHA_CLUB);

  const resp = await fetch(URL_FICHA_CLUB);
  const html = await resp.text();

  const inicio = html.indexOf('__NEXT_DATA__');
  if (inicio === -1) {
    console.error("No se encontró __NEXT_DATA__ en la página.");
    console.log("Primeros 1000 caracteres del HTML recibido, para depurar:");
    console.log(html.slice(0, 1000));
    return;
  }

  // Extraemos el bloque JSON del script __NEXT_DATA__
  const aperturaScript = html.indexOf(">", inicio) + 1;
  const cierreScript = html.indexOf("</script>", aperturaScript);
  const jsonCrudo = html.slice(aperturaScript, cierreScript);

  let datos;
  try {
    datos = JSON.parse(jsonCrudo);
  } catch (e) {
    console.error("No se pudo parsear el JSON:", e.message);
    console.log("Fragmento crudo (primeros 1500 caracteres):");
    console.log(jsonCrudo.slice(0, 1500));
    return;
  }

  const pageProps = datos?.props?.pageProps;
  if (!pageProps) {
    console.error("No se encontró pageProps. Claves disponibles en props:");
    console.log(Object.keys(datos?.props || {}));
    return;
  }

  console.log("\n=== CLAVES DISPONIBLES EN pageProps ===");
  console.log(Object.keys(pageProps));

  console.log("\n=== CONTENIDO COMPLETO (recórtalo si es muy largo) ===");
  console.log(JSON.stringify(pageProps, null, 2).slice(0, 6000));
}

main().catch((e) => console.error("Error:", e));
