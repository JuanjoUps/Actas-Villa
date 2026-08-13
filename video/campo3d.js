// ============================================================
// CAMPO 3D (Babylon.js) — versión conectada a datos reales.
//
// Expone window.iniciarCampo3D(idLienzo, alineacionReal, esLocal)
// que devuelve una Promise que se resuelve cuando la escena está
// lista para grabarse (o pasados 4s como límite de seguridad, por
// si la textura de entorno tarda en descargarse desde el CDN).
//
// alineacionReal: array de { dorsal, nombre, capitan, portero }
// (mismo formato que ya produce extraer-datos-partido.js).
// ============================================================

const ANCHO_CAMPO_3D = 22;
const LARGO_CAMPO_3D = 34;

// Camisetas que se balancean "al viento" — una lista por escena,
// se resetea en cada llamada a iniciarCampo3D.
let TORSOS_CON_VIENTO_3D = [];

// ============================================================
// POSICIONES EN EL CAMPO (mismo criterio que posicionesEnCampo()
// del vídeo en CSS — portero abajo, luego 3 líneas repartidas)
// ============================================================

function posicionesEnCampo3D(numJugadores) {
  const posiciones = [];

  // Portero: centrado, cerca de la portería propia.
  posiciones.push({ x: 0, z: -0.85 });

  // repartirEnFilas() ya existe en animacion.js, cargado en la
  // misma página — la reutilizamos tal cual.
  const filas = repartirEnFilas(numJugadores - 1);
  const zFilas = [-0.45, 0, 0.5]; // defensa, medio, ataque

  filas.forEach((cantidadFila, indiceFila) => {
    for (let i = 0; i < cantidadFila; i++) {
      const hueco = 100 / (cantidadFila + 1);
      const porcentaje = hueco * (i + 1);
      posiciones.push({
        x: (porcentaje - 50) / 50,
        z: zFilas[indiceFila],
      });
    }
  });

  return posiciones;
}

// ============================================================
// PUNTO DE ENTRADA
// ============================================================

function iniciarCampo3D(idLienzo, alineacionReal, esLocal) {
  TORSOS_CON_VIENTO_3D = [];

  const lienzo = document.getElementById(idLienzo);
  const motor = new BABYLON.Engine(lienzo, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });

  const escena = new BABYLON.Scene(motor);
  escena.clearColor = new BABYLON.Color4(0.02, 0.03, 0.02, 1);
  escena.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  escena.fogDensity = 0.012;
  escena.fogColor = new BABYLON.Color3(0.02, 0.05, 0.03);

  // --- Cámara: ángulo de retransmisión de TV, fija (sin girar) ---
  const camara = new BABYLON.ArcRotateCamera(
    "camara",
    -Math.PI / 2,
    Math.PI / 3.2,
    38,
    new BABYLON.Vector3(0, 0, 0),
    escena
  );
  camara.lowerRadiusLimit = 20;
  camara.upperRadiusLimit = 55;

  // --- Postprocesado de cine ---
  const pipeline = new BABYLON.DefaultRenderingPipeline(
    "pipelineCine", true, escena, [camara]
  );
  pipeline.depthOfFieldEnabled = true;
  pipeline.depthOfField.focalLength = 65;
  pipeline.depthOfField.fStop = 2.2;
  pipeline.depthOfField.focusDistance = 38000;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.6;
  pipeline.bloomWeight = 0.5;
  pipeline.bloomKernel = 64;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.5;
  pipeline.imageProcessing.contrast = 1.15;
  pipeline.imageProcessing.exposure = 1.05;
  pipeline.fxaaEnabled = true;

  // --- Entorno + reflejos automáticos ---
  escena.createDefaultEnvironment({
    createSkybox: true,
    skyboxSize: 200,
    createGround: false,
    environmentTexture:
      "https://assets.babylonjs.com/environments/environmentSpecular.env",
  });

  // --- SSAO (sombras de contacto) ---
  const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", escena, {
    ssaoRatio: 0.5,
    blurRatio: 0.5,
  });
  ssao.radius = 2;
  ssao.totalStrength = 1.3;
  ssao.expensiveBlur = true;
  ssao.samples = 16;
  escena.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", camara);

  // --- Luces ---
  const luzAmbiente = new BABYLON.HemisphericLight(
    "luzAmbiente", new BABYLON.Vector3(0, 1, 0), escena
  );
  luzAmbiente.intensity = 0.4;
  luzAmbiente.groundColor = new BABYLON.Color3(0.05, 0.08, 0.05);

  const luzDireccional = new BABYLON.DirectionalLight(
    "luzDireccional", new BABYLON.Vector3(-0.3, -1, -0.4), escena
  );
  luzDireccional.position = new BABYLON.Vector3(20, 40, 20);
  luzDireccional.intensity = 1.1;

  const generadorSombras = new BABYLON.ShadowGenerator(1024, luzDireccional);
  generadorSombras.useBlurExponentialShadowMap = true;
  generadorSombras.blurKernel = 24;

  // --- Focos en torres finas de celosía ---
  const posicionesFoco = [
    [-ANCHO_CAMPO_3D * 0.65, 16, -LARGO_CAMPO_3D * 0.55],
    [ANCHO_CAMPO_3D * 0.65, 16, -LARGO_CAMPO_3D * 0.55],
    [-ANCHO_CAMPO_3D * 0.65, 16, LARGO_CAMPO_3D * 0.55],
    [ANCHO_CAMPO_3D * 0.65, 16, LARGO_CAMPO_3D * 0.55],
  ];

  const capaBrillo = new BABYLON.GlowLayer("brillo", escena);
  capaBrillo.intensity = 0.6;

  const matPoste = new BABYLON.StandardMaterial("matPoste", escena);
  matPoste.diffuseColor = new BABYLON.Color3(0.55, 0.55, 0.58);
  matPoste.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

  const matBombilla = new BABYLON.StandardMaterial("matBombilla", escena);
  matBombilla.emissiveColor = new BABYLON.Color3(1, 1, 0.9);

  posicionesFoco.forEach((pos, i) => {
    const foco = new BABYLON.SpotLight(
      "foco" + i,
      new BABYLON.Vector3(pos[0], pos[1], pos[2]),
      new BABYLON.Vector3(-pos[0] * 0.4, -pos[1] + 2, -pos[2] * 0.4),
      Math.PI / 3, 6, escena
    );
    foco.intensity = 0.5;
    foco.diffuse = new BABYLON.Color3(1, 1, 0.95);

    const torre = BABYLON.MeshBuilder.CreateCylinder(
      "torre" + i, { height: pos[1], diameterTop: 0.18, diameterBottom: 0.35, tessellation: 6 }, escena
    );
    torre.position = new BABYLON.Vector3(pos[0], pos[1] / 2, pos[2]);
    torre.material = matPoste;

    for (let b = 0; b < 6; b++) {
      const bombilla = BABYLON.MeshBuilder.CreateSphere(
        "bombilla" + i + "_" + b, { diameter: 0.35 }, escena
      );
      const angulo = (b / 6) * Math.PI * 2;
      bombilla.position = new BABYLON.Vector3(
        pos[0] + Math.cos(angulo) * 0.5, pos[1], pos[2] + Math.sin(angulo) * 0.5
      );
      bombilla.material = matBombilla;
    }
  });

  // --- Suelo ---
  const texturaCampo = crearTexturaCampo3D(escena);
  const suelo = BABYLON.MeshBuilder.CreateGround(
    "suelo", { width: ANCHO_CAMPO_3D, height: LARGO_CAMPO_3D }, escena
  );
  const matSuelo = new BABYLON.PBRMaterial("matSuelo", escena);
  matSuelo.albedoTexture = texturaCampo;
  matSuelo.bumpTexture = texturaCampo;
  matSuelo.bumpTexture.level = 0.4;
  matSuelo.roughness = 0.9;
  matSuelo.metallic = 0;
  suelo.material = matSuelo;
  suelo.receiveShadows = true;

  // --- Valla perimetral ---
  const texturaValla = crearTexturaValla3D(escena);
  [-1, 1].forEach((lado) => {
    const valla = BABYLON.MeshBuilder.CreatePlane(
      "valla" + lado, { width: LARGO_CAMPO_3D * 1.05, height: 5 }, escena
    );
    valla.rotation.y = Math.PI / 2;
    valla.position = new BABYLON.Vector3(lado * (ANCHO_CAMPO_3D / 2 + 0.6), 2.5, 0);
    const matValla = new BABYLON.StandardMaterial("matValla" + lado, escena);
    matValla.diffuseTexture = texturaValla;
    matValla.diffuseTexture.hasAlpha = true;
    matValla.useAlphaFromDiffuseTexture = true;
    matValla.backFaceCulling = false;
    matValla.diffuseColor = new BABYLON.Color3(0.75, 0.75, 0.75);
    valla.material = matValla;

    for (let p = -LARGO_CAMPO_3D / 2; p <= LARGO_CAMPO_3D / 2; p += 5) {
      const posteValla = BABYLON.MeshBuilder.CreateCylinder(
        "posteValla" + lado + p, { height: 5.2, diameter: 0.12 }, escena
      );
      posteValla.position = new BABYLON.Vector3(lado * (ANCHO_CAMPO_3D / 2 + 0.6), 2.6, p);
      posteValla.material = matPoste;
    }
  });

  // --- Vallas publicitarias ---
  const texturaPublicidad = crearTexturaPublicidad3D(escena);
  [-1, 1].forEach((lado) => {
    const valla = BABYLON.MeshBuilder.CreatePlane(
      "publicidad" + lado, { width: LARGO_CAMPO_3D * 0.85, height: 1 }, escena
    );
    valla.rotation.y = Math.PI / 2;
    valla.position = new BABYLON.Vector3(lado * (ANCHO_CAMPO_3D / 2 + 0.15), 0.55, 0);
    const matPublicidad = new BABYLON.StandardMaterial("matPublicidad" + lado, escena);
    matPublicidad.diffuseTexture = texturaPublicidad;
    matPublicidad.backFaceCulling = false;
    valla.material = matPublicidad;
  });

  // --- Edificio al fondo ---
  const edificio = BABYLON.MeshBuilder.CreateBox(
    "edificio", { width: ANCHO_CAMPO_3D * 0.9, height: 7, depth: 4 }, escena
  );
  edificio.position = new BABYLON.Vector3(0, 3.5, -(LARGO_CAMPO_3D / 2 + 5));
  const matEdificio = new BABYLON.StandardMaterial("matEdificio", escena);
  matEdificio.diffuseColor = new BABYLON.Color3(0.85, 0.85, 0.83);
  edificio.material = matEdificio;

  // --- Porterías ---
  [-1, 1].forEach((lado) => {
    crearPorteria3D(escena, lado * (LARGO_CAMPO_3D / 2 - 1));
  });

  // --- Jugadores reales, en sus posiciones tácticas ---
  const guiCanvas = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI" + idLienzo);
  const posiciones = posicionesEnCampo3D(alineacionReal.length);

  alineacionReal.forEach((jugador, i) => {
    const pos = posiciones[i] || { x: 0, z: 0 };
    crearJugador3D(
      escena,
      { ...jugador, x: pos.x, z: pos.z },
      !!jugador.portero,
      esLocal,
      generadorSombras,
      guiCanvas
    );
  });

  // --- Camisetas al viento ---
  escena.registerBeforeRender(() => {
    const t = performance.now() / 1000;
    TORSOS_CON_VIENTO_3D.forEach(({ mesh, fase }) => {
      mesh.rotation.z = Math.sin(t * 1.6 + fase) * 0.045;
      mesh.rotation.x = Math.sin(t * 1.1 + fase) * 0.025;
      const respiracion = 1 + Math.sin(t * 1.6 + fase) * 0.02;
      mesh.scaling.x = respiracion;
      mesh.scaling.z = respiracion;
    });
  });

  motor.runRenderLoop(() => escena.render());
  window.addEventListener("resize", () => motor.resize());
  motor.resize();

  // Lista para grabar cuando la escena termine de preparar
  // materiales/texturas — con un límite de 4s por si la textura
  // de entorno tarda en llegar desde el CDN.
  return new Promise((resolve) => {
    let resuelto = false;
    const terminar = () => {
      if (resuelto) return;
      resuelto = true;
      resolve({ motor, escena });
    };
    escena.executeWhenReady(terminar);
    setTimeout(terminar, 4000);
  });
}

// ============================================================
// TEXTURAS (mismas que en el prototipo)
// ============================================================

let TEXTURA_TELA_BUMP_CACHE_3D = null;

function obtenerTexturaTelaBump3D(escena) {
  if (TEXTURA_TELA_BUMP_CACHE_3D) return TEXTURA_TELA_BUMP_CACHE_3D;
  const tam = 256;
  const textura = new BABYLON.DynamicTexture("bumpTela", { width: tam, height: tam }, escena);
  const ctx = textura.getContext();
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, tam, tam);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * tam, y = Math.random() * tam;
    const v = 128 + (Math.random() - 0.5) * 40;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 1.3, 1.3);
  }
  ctx.strokeStyle = "rgba(90,90,90,0.4)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const y0 = Math.random() * tam;
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(tam * 0.3, y0 + (Math.random() - 0.5) * 40, tam * 0.7, y0 + (Math.random() - 0.5) * 40, tam, y0);
    ctx.stroke();
  }
  textura.update();
  TEXTURA_TELA_BUMP_CACHE_3D = textura;
  return textura;
}

function crearTexturaCamiseta3D(escena, color3) {
  const tam = 256;
  const textura = new BABYLON.DynamicTexture("texCamiseta" + Math.random(), { width: tam, height: tam }, escena);
  const ctx = textura.getContext();
  const r = Math.round(color3.r * 255), g = Math.round(color3.g * 255), b = Math.round(color3.b * 255);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, tam, tam);
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * tam, y = Math.random() * tam, brillo = Math.random();
    ctx.fillStyle = brillo > 0.5
      ? `rgba(255,255,255,${(brillo - 0.5) * 0.15})`
      : `rgba(0,0,0,${(0.5 - brillo) * 0.15})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  [tam * 0.28, tam * 0.72].forEach((x) => {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, tam); ctx.stroke();
  });
  const gradienteSup = ctx.createLinearGradient(0, 0, 0, tam * 0.18);
  gradienteSup.addColorStop(0, "rgba(0,0,0,0.22)");
  gradienteSup.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradienteSup;
  ctx.fillRect(0, 0, tam, tam * 0.18);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, tam * 0.92, tam, tam * 0.08);
  textura.update();
  return textura;
}

function crearTexturaValla3D(escena) {
  const w = 512, h = 128;
  const textura = new BABYLON.DynamicTexture("texturaValla", { width: w, height: h }, escena);
  const ctx = textura.getContext();
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(200,200,200,0.5)";
  ctx.lineWidth = 1;
  const paso = 10;
  for (let x = 0; x <= w; x += paso) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += paso) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  textura.hasAlpha = true;
  textura.update();
  return textura;
}

function crearTexturaPublicidad3D(escena) {
  const w = 1024, h = 128;
  const textura = new BABYLON.DynamicTexture("texturaPublicidad", { width: w, height: h }, escena);
  const ctx = textura.getContext();
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, w, h);
  const colores = ["#1e8449", "#F4B400", "#174B2B", "#c0392b", "#2c3e50"];
  const numBloques = 8;
  for (let i = 0; i < numBloques; i++) {
    ctx.fillStyle = colores[i % colores.length];
    const anchoBloque = w / numBloques;
    ctx.fillRect(i * anchoBloque + 10, 20, anchoBloque - 20, h - 40);
  }
  textura.update();
  return textura;
}

function crearTexturaCampo3D(escena) {
  const tam = 1024;
  const textura = new BABYLON.DynamicTexture(
    "texturaCampo", { width: tam, height: tam * (LARGO_CAMPO_3D / ANCHO_CAMPO_3D) }, escena
  );
  const ctx = textura.getContext();
  const w = textura.getSize().width, h = textura.getSize().height;
  const franjas = 14;
  for (let i = 0; i < franjas; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#1c5c33" : "#16492a";
    ctx.fillRect(0, (h / franjas) * i, w, h / franjas + 1);
  }
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * w, y = Math.random() * h, brillo = Math.random();
    ctx.fillStyle = brillo > 0.5
      ? "rgba(255,255,255," + (brillo - 0.5) * 0.12 + ")"
      : "rgba(0,0,0," + (0.5 - brillo) * 0.15 + ")";
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 5;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.beginPath(); ctx.moveTo(20, h / 2); ctx.lineTo(w - 20, h / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.12, 0, Math.PI * 2); ctx.stroke();
  [0.12, 0.88].forEach((frac) => {
    ctx.strokeRect(w * 0.28, h * frac - (frac < 0.5 ? 0 : h * 0.12), w * 0.44, h * 0.12);
  });
  textura.update();
  return textura;
}

function crearTexturaRed3D(escena) {
  const tam = 256;
  const textura = new BABYLON.DynamicTexture("texturaRed", { width: tam, height: tam }, escena);
  const ctx = textura.getContext();
  ctx.clearRect(0, 0, tam, tam);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  const paso = 14;
  for (let x = 0; x <= tam; x += paso) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, tam); ctx.stroke(); }
  for (let y = 0; y <= tam; y += paso) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(tam, y); ctx.stroke(); }
  textura.hasAlpha = true;
  textura.update();
  return textura;
}

function crearPorteria3D(escena, z) {
  const mat = new BABYLON.StandardMaterial("matPorteria" + z, escena);
  mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  const ancho = 7.32 * 1.4, alto = 2.44 * 1.4, grosor = 0.12;

  const poste1 = BABYLON.MeshBuilder.CreateCylinder("p1" + z, { height: alto, diameter: grosor }, escena);
  poste1.position = new BABYLON.Vector3(-ancho / 2, alto / 2, z);
  poste1.material = mat;
  const poste2 = poste1.clone("p2" + z);
  poste2.position.x = ancho / 2;

  const larguero = BABYLON.MeshBuilder.CreateCylinder("larguero" + z, { height: ancho, diameter: grosor }, escena);
  larguero.rotation.z = Math.PI / 2;
  larguero.position = new BABYLON.Vector3(0, alto, z);
  larguero.material = mat;

  const profundidad = 1.4;
  const direccion = Math.sign(z) || 1;
  const zFondo = z + direccion * profundidad;

  const texturaRed = crearTexturaRed3D(escena);
  const matRed = new BABYLON.StandardMaterial("matRed" + z, escena);
  matRed.diffuseTexture = texturaRed;
  matRed.diffuseTexture.hasAlpha = true;
  matRed.useAlphaFromDiffuseTexture = true;
  matRed.backFaceCulling = false;
  matRed.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);

  const redTrasera = BABYLON.MeshBuilder.CreatePlane("redTrasera" + z, { width: ancho, height: alto }, escena);
  redTrasera.position = new BABYLON.Vector3(0, alto / 2, zFondo);
  redTrasera.material = matRed;

  [-1, 1].forEach((lado) => {
    const redLateral = BABYLON.MeshBuilder.CreatePlane(
      "redLateral" + lado + z, { width: profundidad, height: alto }, escena
    );
    redLateral.rotation.y = Math.PI / 2;
    redLateral.position = new BABYLON.Vector3(lado * ancho / 2, alto / 2, z + direccion * profundidad / 2);
    redLateral.material = matRed;
  });

  const redSuperior = BABYLON.MeshBuilder.CreatePlane("redSuperior" + z, { width: ancho, height: profundidad }, escena);
  redSuperior.rotation.x = Math.PI / 2;
  redSuperior.position = new BABYLON.Vector3(0, alto, z + direccion * profundidad / 2);
  redSuperior.material = matRed;
}

// ============================================================
// JUGADOR (camiseta con cajas + etiqueta GUI)
// ============================================================

function crearJugador3D(escena, jugador, esPortero, esLocal, generadorSombras, guiCanvas) {
  const posX = jugador.x * (ANCHO_CAMPO_3D / 2 - 1.5);
  const posZ = jugador.z * (LARGO_CAMPO_3D / 2 - 1.5);

  let colorCamiseta = esLocal
    ? new BABYLON.Color3(0.118, 0.518, 0.286)
    : new BABYLON.Color3(0.957, 0.769, 0.188);
  if (esPortero) colorCamiseta = new BABYLON.Color3(0.11, 0.11, 0.11);

  const raiz = new BABYLON.TransformNode("raiz" + jugador.dorsal, escena);
  raiz.position = new BABYLON.Vector3(posX, 0, posZ);

  const matCamiseta = new BABYLON.PBRMaterial("matCamiseta" + jugador.dorsal, escena);
  matCamiseta.albedoTexture = crearTexturaCamiseta3D(escena, colorCamiseta);
  matCamiseta.bumpTexture = obtenerTexturaTelaBump3D(escena);
  matCamiseta.bumpTexture.level = 0.25;
  matCamiseta.roughness = 0.65;
  matCamiseta.metallic = 0.05;

  const mallaJugador = [];

  const torso = BABYLON.MeshBuilder.CreateBox(
    "torso" + jugador.dorsal, { width: 1.15, height: 1.5, depth: 0.4 }, escena
  );
  torso.position.y = 1.55;
  torso.parent = raiz;
  torso.material = matCamiseta;
  mallaJugador.push(torso);

  TORSOS_CON_VIENTO_3D.push({ mesh: torso, fase: jugador.dorsal * 0.7 });

  const mangaIzq = BABYLON.MeshBuilder.CreateBox(
    "mangaIzq" + jugador.dorsal, { width: 0.42, height: 0.62, depth: 0.36 }, escena
  );
  mangaIzq.position = new BABYLON.Vector3(-0.72, 1.98, 0);
  mangaIzq.rotation.z = Math.PI / 4;
  mangaIzq.parent = raiz;
  mangaIzq.material = matCamiseta;
  mallaJugador.push(mangaIzq);

  const mangaDer = mangaIzq.clone("mangaDer" + jugador.dorsal);
  mangaDer.position = new BABYLON.Vector3(0.72, 1.98, 0);
  mangaDer.rotation.z = -Math.PI / 4;
  mangaDer.parent = raiz;
  mangaDer.material = matCamiseta;
  mallaJugador.push(mangaDer);

  if (jugador.capitan) {
    const brazalete = BABYLON.MeshBuilder.CreateTorus(
      "brazalete" + jugador.dorsal, { diameter: 0.34, thickness: 0.06, tessellation: 12 }, escena
    );
    brazalete.rotation.x = Math.PI / 2;
    brazalete.position = new BABYLON.Vector3(-0.72, 1.85, 0);
    brazalete.parent = raiz;
    const matOro = new BABYLON.StandardMaterial("matBrazalete" + jugador.dorsal, escena);
    matOro.emissiveColor = new BABYLON.Color3(0.95, 0.7, 0);
    brazalete.material = matOro;
  }

  const insignia = new BABYLON.GUI.Rectangle("insignia" + jugador.dorsal);
  insignia.width = "150px";
  insignia.height = "42px";
  insignia.cornerRadius = 10;
  insignia.color = "#F4B400";
  insignia.thickness = 2;
  insignia.background = "rgba(5, 20, 12, 0.75)";
  guiCanvas.addControl(insignia);
  insignia.linkWithMesh(torso);
  insignia.linkOffsetY = -70;

  const panelInsignia = new BABYLON.GUI.StackPanel();
  panelInsignia.isVertical = false;
  insignia.addControl(panelInsignia);

  const circuloDorsal = new BABYLON.GUI.Ellipse();
  circuloDorsal.width = "26px";
  circuloDorsal.height = "26px";
  circuloDorsal.color = "#F4B400";
  circuloDorsal.thickness = 2;
  circuloDorsal.background = "#F4B400";
  circuloDorsal.paddingLeft = "6px";
  panelInsignia.addControl(circuloDorsal);

  const textoDorsal = new BABYLON.GUI.TextBlock();
  textoDorsal.text = String(jugador.dorsal);
  textoDorsal.color = "#000000";
  textoDorsal.fontWeight = "bold";
  textoDorsal.fontSize = 15;
  circuloDorsal.addControl(textoDorsal);

  const textoNombre = new BABYLON.GUI.TextBlock();
  textoNombre.text = "  " + jugador.nombre + (jugador.capitan ? " (C)" : "");
  textoNombre.color = "#ffffff";
  textoNombre.fontWeight = "bold";
  textoNombre.fontSize = 14;
  textoNombre.paddingLeft = "6px";
  panelInsignia.addControl(textoNombre);

  if (generadorSombras) {
    mallaJugador.forEach((m) => generadorSombras.addShadowCaster(m));
  }
}

window.iniciarCampo3D = iniciarCampo3D;
