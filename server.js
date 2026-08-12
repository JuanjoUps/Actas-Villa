/**
 * Servidor local minimo, sin dependencias, para previsualizar el
 * video del partido en el navegador y para que generar-video.js
 * (Playwright) pueda grabarlo.
 *
 * USO DIRECTO (previsualizar en el navegador):
 *   node server.js
 *   -> http://localhost:8080/video/index.html?codacta=5432490
 *
 * USO COMO MODULO (desde generar-video.js):
 *   const { crearServidor } = require("../server");
 *   const servidor = crearServidor();
 *   servidor.listen(8080);
 *   ...
 *   servidor.close();
 *
 * Sirve TODO el repo (no solo la carpeta video/), para que el
 * navegador pueda pedir directamente los JSON de
 * resultados-partidos/ con fetch().
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;

const TIPOS_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
};

function crearServidor(raizRepo) {
  const raiz = raizRepo || __dirname;

  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);

    if (urlPath === "/") {
      urlPath = "/video/index.html";
    }

    const rutaArchivo = path.join(raiz, urlPath);

    fs.readFile(rutaArchivo, (err, contenido) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("No encontrado: " + urlPath);
        return;
      }

      const ext = path.extname(rutaArchivo);
      res.writeHead(200, {
        "Content-Type": TIPOS_MIME[ext] || "application/octet-stream",
      });
      res.end(contenido);
    });
  });
}

module.exports = { crearServidor };

if (require.main === module) {
  const servidor = crearServidor();
  servidor.listen(PORT, () => {
    console.log(`Servidor local escuchando en el puerto ${PORT}`);
    console.log(
      `Abre: http://localhost:${PORT}/video/index.html?codacta=5432490`
    );
  });
}
