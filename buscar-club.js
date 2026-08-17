// ============================================================
// DIAGNÓSTICO: guarda en un archivo el contenido real de la
// ficha del club en la RFFM (equipos, categorías, códigos),
// para construir un filtro definitivo por código de equipo.
//
// Uso: node buscar-club.js
// Genera: club-diagnostico.json (súbeme ese archivo)
// ============================================================

const fetch = require("node-fetch");
const fs = require("fs");

const URL_FICHA_CLUB = "https://www.rffm.es/fichaclub/847373";

async function main() {
  console.log("Consultando:", URL_FICHA_CLUB);

  const resp = await fetch(URL_FICHA_CLUB);
  const html = await resp.text();

  const inicio = html.indexOf('__NEXT_DATA__');
  if (inicio === -1) {
    console.error("No se encontró __NEXT_DATA__ en la página.");
    fs.writeFileSync("club-diagnostico.json", html.slice(0, 3000));
    console.log("Guardados los primeros 3000 caracteres del HTML en club-diagnostico.json para depurar.");
    return;
  }

  const aperturaScript = html.indexOf(">", inicio) + 1;
  const cierreScript = html.indexOf("</script>", aperturaScript);
  const jsonCrudo = html.slice(aperturaScript, cierreScript);

  let datos;
  try {
    datos = JSON.parse(jsonCrudo);
  } catch (e) {
    console.error("No se pudo parsear el JSON:", e.message);
    fs.writeFileSync("club-diagnostico.json", jsonCrudo.slice(0, 3000));
    console.log("Guardado un fragmento crudo en club-diagnostico.json para depurar.");
    return;
  }

  const pageProps = datos?.props?.pageProps;
  if (!pageProps) {
    console.error("No se encontró pageProps.");
    return;
  }

  // SOLO lo que nos interesa: el objeto "club" (que debería traer
  // el listado de equipos/categorías con sus códigos).
  fs.writeFileSync(
    "club-diagnostico.json",
    JSON.stringify(pageProps.club, null, 2)
  );

  console.log("Guardado en club-diagnostico.json — súbeme ese archivo.");
}

main().catch((e) => console.error("Error:", e));
