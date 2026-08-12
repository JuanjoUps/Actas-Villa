// ============================================================
// CONFIGURACIÓN
// ============================================================

// Imágenes de la mascota: una por cada combinación de resultado
// (victoria/empate/derrota) y campo (local = verde / visitante =
// amarillo), tal como las tienes.
const MASCOTA_IMG = {
  victoria: {
    local: "/video/assets/mascota-victoria-local.png",
    visitante: "/video/assets/mascota-victoria-visitante.png",
  },
  empate: {
    local: "/video/assets/mascota-empate-local.png",
    visitante: "/video/assets/mascota-empate-visitante.png",
  },
  derrota: {
    local: "/video/assets/mascota-derrota-local.png",
    visitante: "/video/assets/mascota-derrota-visitante.png",
  },
};

const MASCOTA_EMOJI_RESPALDO = {
  victoria: "🏆",
  empate: "🤝",
  derrota: "💪",
};

// ============================================================
// FRASES — según el margen de goles del resultado
// ============================================================

const FRASES = {
  victoriaGrande: [
    "¡Festival de goles del Villa! ¡Qué partidazo!",
    "¡Goleada espectacular! El Villa pasa por encima del rival.",
    "¡Qué exhibición! El Villa firma una victoria arrolladora.",
    "¡Noche de goles y fútbol! El Villa se luce a lo grande.",
  ],
  victoriaMedia: [
    "¡Gran victoria del Villa! El equipo se impone con autoridad.",
    "¡Tres puntos y una actuación fantástica del equipo!",
    "¡Victoria contundente! El Villa demuestra su calidad.",
    "¡Partidazo del Villa! Victoria merecida de principio a fin.",
  ],
  victoriaMinima: [
    "¡Victoria trabajada hasta el último minuto!",
    "¡Tres puntos de oro en un partido de infarto!",
    "¡Sufriendo, peleando y ganando! ¡Así se consiguen estos tres puntos!",
    "¡El Villa aguanta hasta el final y se lleva una victoria de mucho mérito!",
  ],
  empate: [
    "¡Empate muy luchado por los dos equipos!",
    "¡Partido de máxima igualdad hasta el pitido final!",
    "¡Los dos equipos lo dejaron todo sobre el campo!",
    "¡Reparto de puntos después de un auténtico partidazo!",
  ],
  derrotaMinima: [
    "¡Derrota muy luchada! El Villa peleó hasta el final.",
    "¡Partido muy competido que esta vez cayó del lado rival!",
    "¡El equipo lo intentó hasta el último minuto!",
    "¡No pudo ser! Toca seguir trabajando y levantarse.",
  ],
  derrotaGrande: [
    "¡Dura derrota para el Villa en un partido complicado!",
    "¡Hoy no salió nada como esperábamos! Toca aprender y volver más fuertes.",
    "¡Resultado duro para el equipo! Ahora toca levantar la cabeza.",
    "¡Partido difícil para el Villa! Lo importante es seguir adelante.",
  ],
};

// ============================================================
// FRASES ESPECIALES — expulsión, hat-trick, doblete, portería a
// cero. [JUGADOR] se sustituye por el nombre real.
// ============================================================

const FRASES_EXPULSION = [
  "El partido también dejó una expulsión. ¡A mantener la calma!",
  "Hubo tarjeta roja en el encuentro. ¡Cabeza fría y a seguir!",
  "El Villa terminó con una expulsión. ¡Seguimos luchando hasta el final!",
  "La roja también fue protagonista hoy. ¡Toca aprender y seguir!",
];

const FRASES_HATTRICK = [
  "¡[JUGADOR] estuvo imparable con un hat-trick espectacular!",
  "¡Tres goles para [JUGADOR]! ¡Partido para recordar!",
  "¡[JUGADOR] se convierte en protagonista con un auténtico hat-trick!",
  "¡Hat-trick de [JUGADOR]! Hoy tenía la portería entre ceja y ceja.",
];

const FRASES_DOBLETE = [
  "¡[JUGADOR] firma un partidazo con dos goles!",
  "¡Doblete de [JUGADOR] para liderar al Villa!",
  "¡[JUGADOR] aparece por partida doble y deja su sello en el partido!",
  "¡Dos goles de [JUGADOR] y una actuación espectacular!",
];

const FRASES_PORTERIA_CERO = [
  "¡Portería a cero! Trabajo enorme de todo el equipo.",
  "¡Hoy no pasó ni una! ¡Gran trabajo defensivo del Villa!",
  "¡Candado echado! El Villa mantiene su portería imbatida.",
  "¡Defensa de acero y portería a cero!",
];

const FRASES_EXTRA_CIERRE = [
  "¡Somos Villa!",
  "¡A seguir trabajando!",
  "¡Este equipo no para!",
  "¡Seguimos! ¡La huella del Villa continúa!",
];

// Duraciones de cada pantalla (ms)
const DURACION_RESULTADO = 3500;
const DURACION_ALINEACION_LISTA = 3000;
const DURACION_ALINEACION_CAMPO = 3000;
const DURACION_ENTRE_GOLES = 900;
const DURACION_GOLES_FINAL = 2000;
const DURACION_MASCOTA = 5000;

// ============================================================
// UTILIDADES
// ============================================================

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elegirAleatorio(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function ajustarEscala() {
  const escala = Math.min(
    window.innerWidth / 1080,
    window.innerHeight / 1920
  );
  document.documentElement.style.setProperty("--escala", escala);
}

window.addEventListener("resize", ajustarEscala);
ajustarEscala();

// ============================================================
// CAMISETA (SVG con el número)
// ============================================================

function crearCamisetaSVG(jugador, esPartidoLocal) {
  // Verde en casa, amarillo fuera. Número siempre en negro, salvo
  // el portero (camiseta negra, número blanco).
  let colorCamiseta = esPartidoLocal ? "var(--color-club)" : "var(--color-club-visitante)";
  let colorTexto = "#000000";

  if (jugador.portero) {
    colorCamiseta = "#1c1c1c";
    colorTexto = "#ffffff";
  }

  // Capitán: "C" en una insignia en la esquina de la camiseta.
  const insigniaCapitan = jugador.capitan
    ? `<circle cx="86" cy="16" r="13" fill="#ffd700" stroke="#333" stroke-width="1.5" />
       <text x="86" y="21" font-size="16" font-weight="bold" fill="#222" text-anchor="middle">C</text>`
    : "";

  return `
    <svg class="camiseta" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 10 L10 25 L20 40 L30 33 L30 90 L70 90 L70 33 L80 40 L90 25 L70 10
               C 65 18, 35 18, 30 10 Z"
            fill="${colorCamiseta}" stroke="white" stroke-width="2" />
      <text x="50" y="65" font-size="34" font-weight="bold"
            fill="${colorTexto}" text-anchor="middle">${jugador.dorsal}</text>
      ${insigniaCapitan}
    </svg>
  `;
}

// ============================================================
// PANTALLA 1: RESULTADO
// ============================================================

function pintarResultado(datos) {
  const cont = document.getElementById("bloque-resultado");

  const golesPropios = datos.resultado.propioLocal
    ? datos.resultado.local
    : datos.resultado.visitante;

  const golesRival = datos.resultado.propioLocal
    ? datos.resultado.visitante
    : datos.resultado.local;

  cont.innerHTML = `
    <div class="marcador-card">
      <div class="resultado-equipos">
        <div class="equipo">
          <img class="escudo-equipo" src="${datos.resultado.escudoPropio || ""}" />
          <div class="resultado-nombre">${datos.resultado.equipoPropio}</div>
        </div>
        <div class="resultado-marcador">
          <span>${golesPropios}</span><span>-</span><span>${golesRival}</span>
        </div>
        <div class="equipo">
          <img class="escudo-equipo" src="${datos.resultado.escudoRival || ""}" />
          <div class="resultado-nombre">${datos.resultado.rival}</div>
        </div>
      </div>
      <div class="resultado-fecha">${datos.fecha} · ${datos.campo}</div>
    </div>
  `;

  // La cabecera fija muestra la categoría/jornada durante todo el vídeo.
  document.getElementById("cabecera-categoria").textContent =
    `${datos.categoria} · Jornada ${datos.jornada}`;
}

// ============================================================
// PANTALLA 2: ALINEACIÓN + CAMPO
// ============================================================

// Reparte N jugadores de campo (sin portero) en filas de defensa,
// centro y ataque, lo más equilibrado posible.
function repartirEnFilas(cantidad) {
  const filas = [0, 0, 0];
  for (let i = 0; i < cantidad; i++) {
    filas[i % 3]++;
  }
  // Reordenamos para que la fila más numerosa quede en defensa
  filas.sort((a, b) => b - a);
  return filas;
}

function posicionesEnCampo(numJugadores) {
  const posiciones = [];

  // Portero: centrado, cerca de la parte baja del campo.
  posiciones.push({ top: "88%", left: "50%" });

  const filas = repartirEnFilas(numJugadores - 1);
  const alturaFilas = ["68%", "45%", "22%"]; // defensa, centro, ataque

  filas.forEach((cantidadFila, indiceFila) => {
    for (let i = 0; i < cantidadFila; i++) {
      const hueco = 100 / (cantidadFila + 1);
      posiciones.push({
        top: alturaFilas[indiceFila],
        left: `${hueco * (i + 1)}%`,
      });
    }
  });

  return posiciones;
}

async function pintarAlineacion(datos) {
  const campo = document.getElementById("campo");
  const cont = document.getElementById("jugadores");
  cont.innerHTML = "";

  // Portero primero (si lo detectamos), luego el resto en el
  // orden en que viene el acta.
  const alineacion = [...datos.alineacion].sort(
    (a, b) => Number(b.portero) - Number(a.portero)
  );

  // --- Paso 1: lista de tarjetas, centradas verticalmente ---
  // Calculamos el alto disponible en tiempo real (el campo cambia
  // de tamaño según cuánto texto tenga el resto del vídeo).
  const altoCampo = campo.clientHeight;
  const altoTarjeta = Math.min(62, (altoCampo - 30) / alineacion.length);
  const inicioY = altoCampo / 2 - (alineacion.length * altoTarjeta) / 2;

  alineacion.forEach((jugador, i) => {
    const el = document.createElement("div");
    el.className = "jugador en-lista";
    el.style.top = `${inicioY + i * altoTarjeta + altoTarjeta / 2}px`;
    el.style.left = "50%";
    el.innerHTML = `
      ${crearCamisetaSVG(jugador, datos.resultado.propioLocal)}
      <div class="nombre">${jugador.nombre}${jugador.capitan ? " (C)" : ""}</div>
    `;
    cont.appendChild(el);
  });

  await esperar(DURACION_ALINEACION_LISTA);

  // --- Paso 2: quitamos el estilo de "tarjeta de lista" y
  // movemos cada jugador a su posición en el campo ---
  const posiciones = posicionesEnCampo(alineacion.length);
  const elementos = cont.querySelectorAll(".jugador");

  elementos.forEach((el, i) => {
    el.classList.remove("en-lista");
    const pos = posiciones[i] || { top: "50%", left: "50%" };
    el.style.top = pos.top;
    el.style.left = pos.left;
  });

  await esperar(DURACION_ALINEACION_CAMPO);
}

// ============================================================
// PANTALLA 3: GOLES
// ============================================================

async function pintarGoles(datos) {
  document.getElementById("goles-nombre-propio").textContent =
    datos.resultado.equipoPropio;
  document.getElementById("goles-nombre-rival").textContent =
    datos.resultado.rival;

  const contPropios = document.getElementById("lista-goles-propios");
  const contRival = document.getElementById("lista-goles-rival");
  contPropios.innerHTML = "";
  contRival.innerHTML = "";

  const propios = [...datos.golesPropios].sort((a, b) => a.minuto - b.minuto);
  const rival = [...datos.golesRival].sort((a, b) => a.minuto - b.minuto);

  if (propios.length === 0 && rival.length === 0) {
    return;
  }

  // Intercalamos la aparición de ambas columnas para que el
  // vídeo no se quede "vacío" mirando una sola columna vacía.
  const maxLen = Math.max(propios.length, rival.length);

  for (let i = 0; i < maxLen; i++) {
    if (propios[i]) {
      const el = document.createElement("div");
      el.className = "gol";
      el.innerHTML =
        `<span class="balon">⚽</span> ${propios[i].jugador}` +
        ` <span class="minuto">${propios[i].minuto}'</span>`;
      contPropios.appendChild(el);
      void el.offsetWidth;
      el.classList.add("visible");
    }

    if (rival[i]) {
      const el = document.createElement("div");
      el.className = "gol";
      el.innerHTML = `<span class="balon">⚽</span>`;
      contRival.appendChild(el);
      void el.offsetWidth;
      el.classList.add("visible");
    }

    await esperar(DURACION_ENTRE_GOLES);
  }

  await esperar(DURACION_GOLES_FINAL);
}

// ============================================================
// PANTALLA 4: MASCOTA
// ============================================================

// Categoría de frase según el margen de goles.
function categoriaResultado(diferencia) {
  if (diferencia >= 4) return "victoriaGrande";
  if (diferencia >= 2) return "victoriaMedia";
  if (diferencia === 1) return "victoriaMinima";
  if (diferencia === 0) return "empate";
  if (diferencia >= -2) return "derrotaMinima";
  return "derrotaGrande";
}

// Cuenta goles por jugador, para detectar dobletes (2) y
// hat-tricks (3 o más). Los hat-tricks ya vienen en
// datos.hatTricks, pero aquí calculamos también los dobletes.
function contarGolesPorJugador(golesPropios) {
  const conteo = {};
  for (const g of golesPropios) {
    conteo[g.jugador] = (conteo[g.jugador] || 0) + 1;
  }
  return conteo;
}

function frasePersonalizada(lista, nombreJugador) {
  return elegirAleatorio(lista).replace("[JUGADOR]", nombreJugador);
}

function pintarMascota(datos) {
  const propios = datos.resultado.propioLocal
    ? datos.resultado.local
    : datos.resultado.visitante;

  const rival = datos.resultado.propioLocal
    ? datos.resultado.visitante
    : datos.resultado.local;

  const diferencia = propios - rival;

  let tipo = "empate";
  if (diferencia > 0) tipo = "victoria";
  else if (diferencia < 0) tipo = "derrota";

  const campo = datos.resultado.propioLocal ? "local" : "visitante";

  const imgMascota = document.getElementById("img-mascota");
  imgMascota.src = MASCOTA_IMG[tipo][campo];
  imgMascota.onerror = () => {
    // Si no existe el archivo de imagen, mostramos un emoji grande
    // en su lugar para no dejar el hueco vacío.
    imgMascota.replaceWith(
      Object.assign(document.createElement("div"), {
        id: "img-mascota",
        style: "font-size: 220px;",
        textContent: MASCOTA_EMOJI_RESPALDO[tipo],
      })
    );
  };

  const categoria = categoriaResultado(diferencia);

  // Cada línea del bocadillo lleva un icono + su frase, al estilo
  // de la referencia (viñetas con emoji delante).
  const iconoResultado = { victoria: "🏆", empate: "🤝", derrota: "💪" }[tipo];
  const lineas = [
    { icono: iconoResultado, texto: elegirAleatorio(FRASES[categoria]) },
  ];

  // Dobletes y hat-tricks (contados a partir de los goles propios).
  const conteoGoles = contarGolesPorJugador(datos.golesPropios || []);
  for (const nombreJugador of Object.keys(conteoGoles)) {
    const goles = conteoGoles[nombreJugador];
    if (goles >= 3) {
      lineas.push({
        icono: "⚽",
        texto: frasePersonalizada(FRASES_HATTRICK, nombreJugador),
      });
    } else if (goles === 2) {
      lineas.push({
        icono: "⚽",
        texto: frasePersonalizada(FRASES_DOBLETE, nombreJugador),
      });
    }
  }

  // Portería a cero (el rival no marcó).
  if ((datos.golesRival || []).length === 0) {
    lineas.push({ icono: "🧤", texto: elegirAleatorio(FRASES_PORTERIA_CERO) });
  }

  // Expulsión (sin decir el nombre del jugador).
  const expulsiones = (datos.expulsiones || []).filter((t) => t.expulsion);
  if (expulsiones.length > 0) {
    lineas.push({ icono: "🟥", texto: elegirAleatorio(FRASES_EXPULSION) });
  }

  // Frase de cierre, siempre presente.
  lineas.push({ icono: "💚", texto: elegirAleatorio(FRASES_EXTRA_CIERRE) });

  document.getElementById("lista-resumen").innerHTML = lineas
    .map(
      (l) =>
        `<div class="linea-resumen"><span class="icono">${l.icono}</span><span>${l.texto}</span></div>`
    )
    .join("");
}

// ============================================================
// SECUENCIA PRINCIPAL
// ============================================================

function mostrarBloque(id) {
  document.getElementById(id).classList.add("visible");
}

async function reproducirVideo(datos) {
  document.getElementById("escudo-club").src = datos.resultado.escudoPropio || "";

  pintarResultado(datos);
  mostrarBloque("bloque-resultado");
  await esperar(DURACION_RESULTADO);

  mostrarBloque("bloque-alineacion");
  await pintarAlineacion(datos);

  mostrarBloque("bloque-goles");
  await pintarGoles(datos);

  pintarMascota(datos);
  mostrarBloque("bloque-mascota");
  await esperar(DURACION_MASCOTA);

  // Señal para el grabador de vídeo (Playwright): el vídeo ya
  // terminó de reproducirse, puede parar de grabar.
  window.__terminado = true;
}

// ============================================================
// ARRANQUE: cargar el JSON del partido indicado en la URL
// ============================================================

async function iniciar() {
  const params = new URLSearchParams(window.location.search);
  const codacta = params.get("codacta");

  if (!codacta) {
    document.body.innerHTML =
      "<p style='color:white;padding:40px;font-size:24px'>" +
      "Falta el parámetro ?codacta=XXXXX en la URL." +
      "</p>";
    return;
  }

  try {
    const resp = await fetch(`/resultados-partidos/resultado-${codacta}.json`);
    if (!resp.ok) {
      throw new Error(`No se encontró resultado-${codacta}.json (HTTP ${resp.status})`);
    }
    const datos = await resp.json();
    await reproducirVideo(datos);
  } catch (err) {
    document.body.innerHTML =
      "<p style='color:white;padding:40px;font-size:24px'>Error: " +
      err.message +
      "</p>";
  }
}

iniciar();
