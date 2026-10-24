/**
 * Genera el footer dinámico del vídeo (valla publicitaria digital).
 *
 * Abre footer-dinamico.html con el navegador, congela la animación
 * fotograma a fotograma (25 fps, bucle de 12 s) y los junta con ffmpeg
 * en footer-loop.mp4. El script del vídeo lo repite en bucle y lo pega
 * sobre la parte de abajo de cada cartel.
 *
 * Si algo falla, devuelve null y el vídeo se hace igual con el footer
 * fijo que ya trae cada cartel.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const FPS_FOOTER = 25;

function ejecutar(binario, args) {
    return new Promise((resolve, reject) => {
        const p = spawn(binario, args, { stdio: "inherit" });
        p.on("error", reject);
        p.on("close", (c) =>
            c === 0 ? resolve() : reject(new Error(`ffmpeg terminó con código ${c}`))
        );
    });
}

async function generarFooter(videoDir, tempDir, ffmpegPath) {
    const html = path.join(videoDir, "footer-dinamico.html");

    if (!fs.existsSync(html)) {
        console.log("ℹ️ No hay footer-dinamico.html — se usa el footer fijo del cartel.");
        return null;
    }

    let browser = null;

    try {
        const puppeteer = require("puppeteer");

        const framesDir = path.join(tempDir, "footer-frames");
        fs.mkdirSync(framesDir, { recursive: true });

        console.log("");
        console.log("================================");
        console.log("GENERANDO FOOTER DINÁMICO");
        console.log("================================");

        browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1080, height: 190, deviceScaleFactor: 1 });
        // Errores de la página: se muestran en el log para poder diagnosticar
        page.on("pageerror", e => console.log("   [footer] error de página: " + (e.message || e)));
        page.on("console", m => { if (m.type() === "error") console.log("   [footer] consola: " + m.text()); });
        await page.goto("file://" + html, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForFunction("window.__listo === true", { timeout: 20000 });

        const duracionMs = await page.evaluate("window.__DURACION_MS");
        const total = Math.round((duracionMs / 1000) * FPS_FOOTER);

        for (let f = 0; f < total; f++) {
            await page.evaluate(`window.__setT(${(f * 1000) / FPS_FOOTER})`);
            const nombre = `f_${String(f).padStart(4, "0")}.png`;
            await page.screenshot({ path: path.join(framesDir, nombre) });
        }

        await browser.close();
        browser = null;

        const salida = path.join(tempDir, "footer-loop.mp4");

        await ejecutar(ffmpegPath, [
            "-y",
            "-framerate", String(FPS_FOOTER),
            "-i", path.join(framesDir, "f_%04d.png"),
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            salida,
        ]);

        console.log(`✓ Footer dinámico listo (${total} fotogramas, bucle de ${duracionMs / 1000} s)`);
        return salida;
    } catch (err) {
        console.log("⚠️ No se pudo generar el footer dinámico: " + (err.message || err));
        console.log("   El vídeo se hace igualmente con el footer fijo del cartel.");
        if (browser) {
            try { await browser.close(); } catch (e) { /* nada */ }
        }
        return null;
    }
}

module.exports = { generarFooter };
