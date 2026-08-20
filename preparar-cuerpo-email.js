/**
 * Compone el cuerpo del email de "vídeo de resultado" añadiendo,
 * si los hay, los rivales con su @usuario de Instagram para que
 * sea fácil mencionarlos al subir la story.
 *
 * Lee video-pendiente.json (generado por video/generar-video.js,
 * con el array "partidos": [{ codacta, rival, instagram }]).
 *
 * Escribe el resultado como output multilínea "cuerpo" para que el
 * workflow lo use directamente en el paso de envío de email:
 *
 *   body: ${{ steps.mensaje.outputs.cuerpo }}
 *
 * USO (desde el workflow):
 *   node preparar-cuerpo-email.js
 */

const fs = require("fs");

const PENDIENTE_PATH = "video-pendiente.json";

const lineas = [
  "Hola,",
  "",
  "Ya está generado el vídeo de resultado del/de los partido(s)",
  "finalizado(s). Se adjunta listo para subir como historia de",
  "Instagram.",
];

if (fs.existsSync(PENDIENTE_PATH)) {
  const datos = JSON.parse(fs.readFileSync(PENDIENTE_PATH, "utf-8"));
  const partidos = datos.partidos || [];

  const conMencion = partidos.filter((p) => p.instagram);
  const sinMencion = partidos.filter((p) => p.rival && !p.instagram);

  if (conMencion.length > 0) {
    lineas.push("");
    lineas.push("Menciones sugeridas para las stories:");
    conMencion.forEach((p) => {
      lineas.push(`  - ${p.rival}: @${p.instagram}`);
    });
  }

  if (sinMencion.length > 0) {
    lineas.push("");
    lineas.push("Sin Instagram encontrado todavía para:");
    sinMencion.forEach((p) => {
      lineas.push(`  - ${p.rival}`);
    });
  }
}

lineas.push("");
lineas.push("Un saludo.");

const texto = lineas.join("\n");

console.log("----- CUERPO DEL CORREO -----");
console.log(texto);
console.log("------------------------------");

if (!process.env.GITHUB_OUTPUT) {
  console.log(
    "\n(GITHUB_OUTPUT no definido — normal si lo ejecutas en local, no en Actions.)"
  );
  process.exit(0);
}

const delimitador = "CUERPO_EOF";
fs.appendFileSync(
  process.env.GITHUB_OUTPUT,
  `cuerpo<<${delimitador}\n${texto}\n${delimitador}\n`
);
