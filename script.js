/*
 * Maqueta digital 3D — Mejoramiento del alumbrado, vía de Ternera (Cartagena)
 *
 * Sistema de coordenadas (metros):
 *   x = a lo largo de la vía (muestra de -90 a +90 m ≈ 180 m)
 *   y = altura
 *   z = sección transversal (+z = andén con árboles/edificios que se ve en las fotos)
 *
 * Datos del proyecto tomados del Excel (MML): 20 luminarias nuevas con poste,
 * 8 existentes reubicadas, 30 luminarias LED. Todo lo demás (alturas,
 * interdistancias, anchos) es aproximación visual y está marcado como tal.
 */
(function () {
  'use strict';

  const loader = document.getElementById('loader');

  if (!window.THREE || !THREE.OrbitControls) {
    loader.innerHTML =
      '<p class="error"><b>No se pudo cargar Three.js.</b><br>' +
      'Verifica la conexión a internet, o copia <code>three.min.js</code> y ' +
      '<code>OrbitControls.js</code> en la carpeta <code>lib/</code> (ver README).</p>';
    return;
  }

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  const PROJECT = { newTotal: 20, relocatedTotal: 8, ledTotal: 30 }; // Excel (MML)

  const SAMPLE_HALF = 90;  // muestra de ~180 m
  const WORLD_HALF = 170;  // escenario de contexto (más allá de la muestra)

  // Sección transversal APROXIMADA (estimada a partir de las fotos)
  const XS = {
    swS: [10, 13],      // andén sur (el de las fotos)
    stripS: [13, 15.5], // franja verde con setos
    cwS: [3, 10],       // calzada sur: 2 carriles x 3.5 m
    med: [-3, 3],       // separador central con vegetación
    cwN: [-10, -3],     // calzada norte (supuesta simétrica)
    swN: [-13, -10],
    stripN: [-15.5, -13],
  };
  const KERB = 0.16;
  const NEW_POLE_Z = 10.6;   // poste nuevo junto al sardinel del andén sur
  const NEW_ARM = 2.0;       // brazo hacia la calzada (aprox.)
  const MED_ARM = 1.8;       // brazo doble en el separador (aprox.)

  const params = {
    mountH: 10,     // altura de montaje (aprox., editable)
    spacing: 30,    // interdistancia de las nuevas en la muestra (aprox., editable)
    power: 1.0,     // multiplicador visual
    cones: true,
    heat: false,
    labels: true,
    markers: true,
    traffic: true,
  };

  const state = { after: false, night: false, view: 'aerial' };

  // Luminarias existentes del separador en la muestra (posiciones y estados ILUSTRATIVOS)
  const MEDIAN_DEF = [
    { id: 'E-01', kind: 'existing', x: -78, before: 0.35, note: 'Baja intensidad (ilustrativo)' },
    { id: 'E-02', kind: 'existing', x: -46, before: 1.0 },
    { id: 'R-01', kind: 'relocated', x: -39, xAfter: 30, before: 1.0 },
    { id: 'E-03', kind: 'existing', x: -6, before: 0.0, note: 'Apagada / en falla (ilustrativo)' },
    { id: 'R-02', kind: 'relocated', x: 1, xAfter: 64, before: 1.0 },
  ];

  const COLORS = {
    amber: new THREE.Color(0xffa63d),
    led: new THREE.Color(0xeef4ff),
    existing: 0x5aa9ff,
    new: 0x34d399,
    relocated: 0xf59e0b,
  };

  // RNG determinista para que la escena sea igual en cada carga
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20261014);
  const rr = (a, b) => a + (b - a) * rand();

  // ---------------------------------------------------------------------------
  // Renderer, escena, cámara
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe0ee, 140, 460);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2500);
  camera.position.set(-70, 70, 95);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 2;
  controls.maxDistance = 420;
  controls.target.set(0, 0, 0);

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  // Material Lambert (iluminación por fragmento en r147): mucho más liviano que PBR
  // con ~15 focos simultáneos. Se ignoran roughness/metalness.
  function std(color, opts) {
    const o = Object.assign({ color }, opts || {});
    delete o.roughness; delete o.metalness;
    return new THREE.MeshLambertMaterial(o);
  }
  function addBox(w, h, d, material, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = !!(opts && opts.cast);
    m.receiveShadow = !(opts && opts.receive === false);
    (opts && opts.parent ? opts.parent : scene).add(m);
    return m;
  }
  function noiseTexture(base, spread, size, repeatX, repeatY) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const n = (Math.random() - 0.5) * spread;
      img.data[i * 4] = base[0] + n;
      img.data[i * 4 + 1] = base[1] + n;
      img.data[i * 4 + 2] = base[2] + n;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function radialTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const glowTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

  function damp(cur, target, k, dt) {
    return cur + (target - cur) * (1 - Math.exp(-k * dt));
  }

  // ---------------------------------------------------------------------------
  // Cielo, estrellas e iluminación ambiental
  // ---------------------------------------------------------------------------
  const SKY = {
    day: { top: new THREE.Color(0x3f86de), hor: new THREE.Color(0xd4e7f7), bot: new THREE.Color(0xa9bccb), fog: new THREE.Color(0xcfe0ee) },
    night: { top: new THREE.Color(0x03060f), hor: new THREE.Color(0x141c33), bot: new THREE.Color(0x07090f), fog: new THREE.Color(0x0a0f1e) },
  };
  const skyUniforms = {
    top: { value: SKY.day.top.clone() },
    hor: { value: SKY.day.hor.clone() },
    bot: { value: SKY.day.bot.clone() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vP;' +
        'void main(){ float h = normalize(vP).y;' +
        ' vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, bot, pow(-h, 0.35));' +
        ' gl_FragColor = vec4(c, 1.0); }',
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const stars = (function () {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rand() * Math.PI * 2, ph = Math.acos(rr(0.08, 1));
      pos[i * 3] = 1100 * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = 1100 * Math.cos(ph);
      pos[i * 3 + 2] = 1100 * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(p);
    return p;
  })();

  const hemi = new THREE.HemisphereLight(0xdcecff, 0x6b6b4a, 0.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3dc, 0.95);
  sun.position.set(60, 110, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const LIGHTING = {
    day: { hemiSky: new THREE.Color(0xdcecff), hemiGround: new THREE.Color(0x6b6b4a), hemiI: 0.62, sunC: new THREE.Color(0xfff3dc), sunI: 0.95 },
    night: { hemiSky: new THREE.Color(0x2b3b66), hemiGround: new THREE.Color(0x0b0b10), hemiI: 0.3, sunC: new THREE.Color(0x8ea6ff), sunI: 0.12 },
  };

  // ---------------------------------------------------------------------------
  // Terreno, calzadas, separador, andenes
  // ---------------------------------------------------------------------------
  const LEN = WORLD_HALF * 2;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    std(0x6f7f4c, { map: noiseTexture([120, 130, 80], 30, 128, 120, 120) })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);

  const asphaltMat = std(0x55585e, { map: noiseTexture([150, 150, 150], 40, 256, LEN / 6, 1.2), roughness: 0.95 });
  addBox(LEN, 0.1, XS.cwS[1] - XS.cwS[0], asphaltMat, 0, 0.0, (XS.cwS[0] + XS.cwS[1]) / 2);
  addBox(LEN, 0.1, XS.cwN[1] - XS.cwN[0], asphaltMat, 0, 0.0, (XS.cwN[0] + XS.cwN[1]) / 2);

  // Andenes (concreto) y sardineles
  const concrete = std(0xb9b5ab, { map: noiseTexture([200, 200, 200], 25, 128, LEN / 3, 2) });
  addBox(LEN, KERB + 0.02, XS.swS[1] - XS.swS[0], concrete, 0, KERB / 2, (XS.swS[0] + XS.swS[1]) / 2);
  addBox(LEN, KERB + 0.02, XS.swN[1] - XS.swN[0], concrete, 0, KERB / 2, (XS.swN[0] + XS.swN[1]) / 2);
  const kerbYellow = std(0xd6c77a);
  const kerbGray = std(0xc9c6bd);
  addBox(LEN, KERB + 0.04, 0.22, kerbYellow, 0, KERB / 2 + 0.01, XS.swS[0] + 0.11);
  addBox(LEN, KERB + 0.04, 0.22, kerbGray, 0, KERB / 2 + 0.01, XS.swN[1] - 0.11);

  // Separador central
  const medianGrass = std(0x4d7432, { map: noiseTexture([110, 150, 80], 40, 128, LEN / 4, 1) });
  addBox(LEN, 0.22, XS.med[1] - XS.med[0], medianGrass, 0, 0.11, 0);
  addBox(LEN, 0.26, 0.2, kerbGray, 0, 0.13, XS.med[0] + 0.1);
  addBox(LEN, 0.26, 0.2, kerbGray, 0, 0.13, XS.med[1] - 0.1);

  // Franjas verdes laterales
  const stripGrass = std(0x6d8f45, { map: noiseTexture([120, 150, 90], 40, 128, LEN / 4, 1) });
  addBox(LEN, 0.12, XS.stripS[1] - XS.stripS[0], stripGrass, 0, 0.06, (XS.stripS[0] + XS.stripS[1]) / 2);
  addBox(LEN, 0.12, XS.stripN[1] - XS.stripN[0], stripGrass, 0, 0.06, (XS.stripN[0] + XS.stripN[1]) / 2);

  // Demarcación: líneas de carril discontinuas y bordes
  (function markings() {
    const white = new THREE.MeshBasicMaterial({ color: 0xe9e9e4 });
    const dashLen = 3, period = 8;
    const nDash = Math.floor(LEN / period);
    const dashGeo = new THREE.PlaneGeometry(dashLen, 0.15);
    dashGeo.rotateX(-Math.PI / 2);
    const dashes = new THREE.InstancedMesh(dashGeo, std(0xeeeeea), nDash * 2);
    const m = new THREE.Matrix4();
    let k = 0;
    [6.5, -6.5].forEach(z => {
      for (let i = 0; i < nDash; i++) {
        m.makeTranslation(-WORLD_HALF + i * period + dashLen / 2, 0.06, z);
        dashes.setMatrixAt(k++, m);
      }
    });
    dashes.receiveShadow = true;
    scene.add(dashes);
    [3.35, 9.65, -3.35, -9.65].forEach(z => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 0.12), std(0xe2e2dc));
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.055, z);
      line.receiveShadow = true;
      scene.add(line);
    });
    void white;
  })();

  // ---------------------------------------------------------------------------
  // Vegetación (árboles, setos, palmas)
  // ---------------------------------------------------------------------------
  const BUILD_ZONE = [18, 64];   // edificios beige (foto 2)
  const FENCE_ZONE = [-32, 6];   // reja azul (foto 3)
  const inZone = (x, zone) => x >= zone[0] && x <= zone[1];

  const trees = [];
  (function placeTrees() {
    // Lado sur: árboles grandes cuyas copas cubren el andén (fotos 1 y 4)
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += rr(5.5, 9)) {
      if (inZone(x, BUILD_ZONE)) continue;
      const behindFence = inZone(x, FENCE_ZONE);
      trees.push({ x, z: behindFence ? rr(18, 22) : rr(15.2, 18), h: rr(6.5, 9.5), r: rr(3.2, 4.8) });
      if (rand() < 0.5) trees.push({ x: x + rr(-2, 2), z: rr(21, 30), h: rr(6, 10), r: rr(3, 5) });
    }
    // Lado norte
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += rr(7, 12)) {
      trees.push({ x, z: rr(-19, -16), h: rr(6, 9), r: rr(3, 4.5) });
      if (rand() < 0.6) trees.push({ x: x + rr(-3, 3), z: rr(-34, -22), h: rr(6, 10), r: rr(3, 5) });
    }
  })();

  (function buildTrees() {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 1, 7);
    trunkGeo.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, std(0x5b4636), trees.length);
    const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
    const canopies = new THREE.InstancedMesh(canopyGeo, std(0xffffff, { flatShading: true }), trees.length * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const greens = [0x3f7a2c, 0x4d8a33, 0x356b28, 0x5a9a3a, 0x447f30];
    const col = new THREE.Color();
    let k = 0;
    trees.forEach((t, i) => {
      const trunkH = t.h * 0.55;
      m.compose(p.set(t.x, 0, t.z), q.identity(), s.set(1, trunkH, 1));
      trunks.setMatrixAt(i, m);
      for (let j = 0; j < 3; j++) {
        const ox = rr(-t.r * 0.45, t.r * 0.45), oz = rr(-t.r * 0.45, t.r * 0.45);
        // las copas del lado sur tienden a inclinarse hacia la calle
        const lean = t.z > 0 && t.z < 19 ? -t.r * 0.25 : 0;
        const sc = t.r * rr(0.65, 0.9);
        m.compose(p.set(t.x + ox, t.h - sc * 0.3 + rr(-0.6, 0.6), t.z + oz + lean), q.identity(), s.set(sc, sc * rr(0.6, 0.8), sc));
        canopies.setMatrixAt(k, m);
        col.setHex(greens[Math.floor(rand() * greens.length)]);
        canopies.setColorAt(k, col);
        k++;
      }
    });
    trunks.castShadow = canopies.castShadow = true;
    trunks.receiveShadow = canopies.receiveShadow = true;
    scene.add(trunks, canopies);
  })();

  // Setos: franja sur (fotos 1 y 4) y separador central
  (function hedges() {
    const segs = [];
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += 4) {
      if (inZone(x + 2, BUILD_ZONE) || inZone(x + 2, FENCE_ZONE)) continue;
      segs.push({ x: x + 2, z: 14.3, w: 4.05, h: rr(1.6, 2.3), d: rr(1.4, 1.9) });
    }
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += 5) {
      if (rand() < 0.12) continue;
      segs.push({ x: x + 2.5, z: rr(-0.4, 0.4), w: rr(3.2, 4.6), h: rr(0.6, 1.0), d: rr(1.2, 1.8) });
    }
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += 6) {
      if (rand() < 0.3) continue;
      segs.push({ x: x + 3, z: -14.2, w: rr(3, 5.5), h: rr(1.0, 1.8), d: 1.4 });
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, std(0xffffff), segs.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    segs.forEach((h, i) => {
      m.makeScale(h.w, h.h, h.d);
      m.setPosition(h.x, 0.1, h.z);
      mesh.setMatrixAt(i, m);
      col.setHex([0x3e7a2e, 0x4a8a35, 0x37702a][i % 3]);
      mesh.setColorAt(i, col);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  })();

  function palm(x, z, h) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 7), std(0x8a7a62));
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    const leafMat = std(0x4f8f3a, { side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), leafMat);
      leaf.geometry.translate(1.7, 0, 0);
      leaf.position.y = h;
      leaf.rotation.set(Math.PI / 2, 0.45, (i / 8) * Math.PI * 2);
      leaf.rotation.order = 'ZYX';
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }

  // ---------------------------------------------------------------------------
  // Edificaciones y elementos de contexto observados en las fotos
  // ---------------------------------------------------------------------------
  (function buildings() {
    // Foto 2: edificios beige de 2 pisos con patio de tierra al frente
    const dirt = std(0xb5a687, { map: noiseTexture([190, 170, 140], 40, 128, 10, 4) });
    addBox(BUILD_ZONE[1] - BUILD_ZONE[0], 0.1, 6, dirt, (BUILD_ZONE[0] + BUILD_ZONE[1]) / 2, 0.05, 16);
    const beige = std(0xd9c39d), beige2 = std(0xcdb58c), dark = std(0x2b2d33, { roughness: 0.4 });
    [[20, 34, 19, 30, 7.2], [36, 50, 19.5, 29, 6.4], [52, 64, 19, 28, 7.6]].forEach((b, i) => {
      const [x0, x1, z0, z1, h] = b;
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      addBox(w, h, d, i % 2 ? beige2 : beige, cx, h / 2, cz, { cast: true });
      addBox(w + 0.3, 0.5, d + 0.3, beige2, cx, h + 0.25, cz, { cast: true });
      for (let wx = x0 + 1.6; wx < x1 - 1; wx += 3.2) {
        addBox(1.6, 1.1, 0.08, dark, wx, h * 0.72, z0 - 0.04);
        if (rand() < 0.5) addBox(1.4, 1.0, 0.08, dark, wx, h * 0.3, z0 - 0.04);
      }
      if (i === 0) addBox(4, 3.6, 0.08, std(0x3a3a3a), x1 - 3.5, 1.8, z0 - 0.04); // portón
    });
    for (let i = 0; i < 5; i++) palm(rr(BUILD_ZONE[0] + 2, BUILD_ZONE[1] - 2), rr(17, 18.5), rr(5, 7.5));

    // Foto 3: muro bajo con reja azul y edificación clara detrás
    const fenceLen = FENCE_ZONE[1] - FENCE_ZONE[0];
    const fx = (FENCE_ZONE[0] + FENCE_ZONE[1]) / 2;
    addBox(fenceLen, 0.6, 0.3, std(0xcfcac2), fx, 0.3, 14.2, { cast: true });
    const nBars = Math.floor(fenceLen / 0.18);
    const barGeo = new THREE.BoxGeometry(0.06, 1.9, 0.06);
    const bars = new THREE.InstancedMesh(barGeo, std(0x2e4fa6, { roughness: 0.5 }), nBars);
    const m = new THREE.Matrix4();
    for (let i = 0; i < nBars; i++) { m.makeTranslation(FENCE_ZONE[0] + i * 0.18, 1.55, 14.2); bars.setMatrixAt(i, m); }
    bars.castShadow = true;
    scene.add(bars);
    addBox(fenceLen, 0.08, 0.08, std(0x2e4fa6), fx, 2.5, 14.2);
    addBox(fenceLen, 0.1, 6.5, std(0x9c9a90), fx, 0.06, 17.6); // patio interior
    addBox(20, 5, 9, std(0xe0b3b0), -15, 2.5, 25.5, { cast: true });
    addBox(12, 4.2, 8, std(0xe8e2d4), 0, 2.1, 26, { cast: true });
    for (let i = 0; i < 3; i++) palm(rr(-28, 2), rr(16, 17.5), rr(5, 7));

    // Lado norte: edificaciones genéricas de fondo (no visibles en las fotos; contexto)
    const muted = [0xcfc6b5, 0xbdb8ae, 0xd8cdb8, 0xc2b8a5];
    for (let x = -WORLD_HALF; x < WORLD_HALF; x += rr(14, 24)) {
      const w = rr(9, 16), d = rr(8, 14), h = rr(4, 8);
      addBox(w, h, d, std(muted[Math.floor(rand() * muted.length)]), x, h / 2, -rr(26, 34) - d / 2, { cast: true });
    }
  })();

  // Señales: paradero (foto 1) y señal de peatones (foto 3)
  (function signs() {
    const post = std(0xa9adb3, { metalness: 0.5, roughness: 0.4 });
    // paradero
    addBox(0.08, 3.0, 0.08, post, -62, 1.6, 12.2, { cast: true });
    addBox(0.08, 0.95, 0.75, std(0x1f5fd6), -62, 2.75, 12.2, { cast: true });
    addBox(0.09, 0.32, 0.55, std(0xf2f2f2), -62, 2.15, 12.2);
    // personas esperando
    [[-61.2, 12.6, 0x2e6fd1], [-60.6, 12.4, 0xe58fb0]].forEach(([x, z, c]) => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 1.1, 8), std(c));
      body.position.set(x, 0.16 + 0.55 + 0.45, z);
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.8, 8), std(0x2a3550));
      legs.position.set(x, 0.16 + 0.4, z);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), std(0x6b4a35));
      head.position.set(x, 0.16 + 1.85, z);
      [body, legs, head].forEach(o => { o.castShadow = true; scene.add(o); });
    });
    // señal preventiva de peatones
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64); g.rotate(Math.PI / 4);
    g.fillStyle = '#111'; g.fillRect(-44, -44, 88, 88);
    g.fillStyle = '#f5b301'; g.fillRect(-40, -40, 80, 80);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = '#111'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(64, 38, 6, 0, Math.PI * 2); g.fillStyle = '#111'; g.fill();
    g.beginPath(); g.moveTo(64, 48); g.lineTo(60, 72); g.lineTo(50, 92); g.moveTo(60, 72); g.lineTo(72, 90);
    g.moveTo(62, 54); g.lineTo(50, 66); g.moveTo(62, 54); g.lineTo(76, 64); g.stroke();
    const signTex = new THREE.CanvasTexture(c);
    addBox(0.07, 2.6, 0.07, post, -12, 1.4, 10.6, { cast: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide }));
    sign.position.set(-12, 2.9, 10.6);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);
  })();

  // ---------------------------------------------------------------------------
  // Postes de la red eléctrica (contexto) con cableado
  // ---------------------------------------------------------------------------
  (function utilityPoles() {
    const mat = std(0xa7a49c);
    const armMat = std(0x8e8b84);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1b1b1b, transparent: true, opacity: 0.85 });
    [12.9, -12.9].forEach((z, side) => {
      const xs = [];
      for (let x = -WORLD_HALF + 8 + side * 15; x < WORLD_HALF; x += 35) xs.push(x);
      xs.forEach((x, i) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 12, 8), mat);
        pole.position.set(x, 6, z);
        pole.castShadow = true;
        pole.userData.info = { kind: 'utility' };
        scene.add(pole);
        addBox(0.14, 0.14, 2.4, armMat, x, 11.4, z, { cast: true });
        addBox(0.12, 0.12, 1.6, armMat, x, 10.3, z, { cast: true });
        if (side === 0 && i % 3 === 1) {
          const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 12), std(0x7d8086, { metalness: 0.4 }));
          tr.position.set(x + 0.45, 8.6, z);
          tr.castShadow = true;
          scene.add(tr);
        }
      });
      for (let i = 0; i < xs.length - 1; i++) {
        [[11.45, -1.1], [11.45, 0], [11.45, 1.1], [10.35, -0.7], [10.35, 0.7]].forEach(([y, dz]) => {
          const pts = [];
          for (let t = 0; t <= 1.0001; t += 0.1) {
            pts.push(new THREE.Vector3(xs[i] + (xs[i + 1] - xs[i]) * t, y - 0.9 * 4 * t * (1 - t), z + dz));
          }
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
        });
      }
    });
  })();

  // ---------------------------------------------------------------------------
  // Límites de la muestra
  // ---------------------------------------------------------------------------
  function textSprite(text, opts) {
    opts = opts || {};
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const font = (opts.weight || 700) + ' ' + (opts.size || 44) + 'px Segoe UI, Arial, sans-serif';
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 40;
    c.width = w; c.height = (opts.size || 44) + 30;
    g.font = font;
    g.fillStyle = opts.bg || 'rgba(12,18,32,0.85)';
    const r = 18;
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r); g.lineTo(w, c.height - r);
    g.quadraticCurveTo(w, c.height, w - r, c.height); g.lineTo(r, c.height); g.quadraticCurveTo(0, c.height, 0, c.height - r);
    g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.fill();
    if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 5; g.stroke(); }
    g.fillStyle = opts.color || '#fff';
    g.textBaseline = 'middle';
    g.fillText(text, 20, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false }));
    const hScale = opts.scale || 1.1;
    spr.scale.set(hScale * w / c.height, hScale, 1);
    return spr;
  }

  const sampleMarkers = new THREE.Group();
  scene.add(sampleMarkers);
  (function sampleBounds() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    [-SAMPLE_HALF, SAMPLE_HALF].forEach((x, i) => {
      for (let z = -15; z < 15; z += 1.6) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.9), mat);
        d.rotation.x = -Math.PI / 2;
        d.position.set(x, 0.3, z + 0.45);
        sampleMarkers.add(d);
      }
      const label = textSprite(i === 0 ? 'Inicio de la muestra · 0 m' : 'Fin de la muestra · ≈180 m', { size: 40, color: '#bfe3ff', border: 'rgba(124,196,255,0.7)', scale: 1.6 });
      label.position.set(x, 4.5, 17);
      sampleMarkers.add(label);
    });
  })();

  // ---------------------------------------------------------------------------
  // Luminarias
  // ---------------------------------------------------------------------------
  const coneMaterialProto = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 0 }, uH: { value: 10 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader:
      'uniform float uH; varying float vH; varying vec3 vN; varying vec3 vV;' +
      'void main(){ vH = position.y / uH + 0.5;' +
      ' vec4 mv = modelViewMatrix * vec4(position,1.0);' +
      ' vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);' +
      ' gl_Position = projectionMatrix * mv; }',
    fragmentShader:
      'uniform vec3 color; uniform float opacity; varying float vH; varying vec3 vN; varying vec3 vV;' +
      'void main(){ float edge = pow(abs(dot(vN, vV)), 1.6);' +
      ' float a = opacity * pow(clamp(vH,0.0,1.0), 1.4) * edge;' +
      ' gl_FragColor = vec4(color * a, a); }',
  });

  const poleMats = {
    concrete: std(0xb3b0a8),
    steel: std(0x9aa1a9, { metalness: 0.6, roughness: 0.35 }),
    head: std(0x6f757d, { metalness: 0.5, roughness: 0.4 }),
  };

  const luminaires = [];
  const luminaireRoot = new THREE.Group();
  scene.add(luminaireRoot);
  const pickables = [];

  function makeHead(parent, x, y, z, rotY, w, recs) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.36), poleMats.head);
    head.position.set(x, y, z);
    head.rotation.y = rotY;
    head.castShadow = true;
    parent.add(head);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x555555, fog: false });
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, 0.28), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -0.085, 0);
    head.add(lens);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(3.2, 3.2, 1);
    glow.position.set(x, y - 0.2, z);
    parent.add(glow);
    recs.heads.push({ local: new THREE.Vector3(x, y, z), lensMat, glow, mesh: head });
  }

  function makeCone(parent, x, y, z, radius, recs) {
    const geo = new THREE.ConeGeometry(radius, y, 40, 1, true);
    const mat = coneMaterialProto.clone();
    mat.uniforms.uH.value = y;
    const cone = new THREE.Mesh(geo, mat);
    cone.position.set(x, y / 2, z);
    cone.renderOrder = 5;
    parent.add(cone);
    recs.cones.push(cone);
  }

  function makeMarker(parent, color, recs) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.35, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, fog: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.32;
    parent.add(ring);
    recs.marker = ring;
  }

  function buildLuminaire(def, H, prevCur) {
    const group = new THREE.Group();
    const rec = Object.assign({}, def, { group, heads: [], cones: [], H });
    const kindColor = COLORS[def.kind];

    if (def.kind === 'new') {
      // Poste metálico nuevo con brazo hacia la calzada
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, H, 10), poleMats.steel);
      pole.position.y = H / 2 + KERB;
      pole.castShadow = true;
      group.add(pole);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, NEW_ARM, 8), poleMats.steel);
      arm.rotation.x = Math.PI / 2 - 0.15;
      arm.position.set(0, H + KERB - 0.05, -NEW_ARM / 2);
      group.add(arm);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), new THREE.MeshBasicMaterial({ color: kindColor }));
      band.position.y = 2.6;
      group.add(band);
      makeHead(group, 0, H + KERB + 0.1, -NEW_ARM, 0, 0.75, rec);
      rec.heads[0].mesh.rotation.y = Math.PI / 2;
      makeCone(group, 0, H + KERB, -NEW_ARM - 0.4, H * 0.62, rec);
      rec.lightLocal = new THREE.Vector3(0, H + KERB, -NEW_ARM);
      rec.targetLocal = new THREE.Vector3(0, 0, -NEW_ARM - 1.4);
      rec.angle = 1.12;
      group.position.z = NEW_POLE_Z;
      pickables.push(pole, rec.heads[0].mesh);
      pole.userData.lum = rec; rec.heads[0].mesh.userData.lum = rec;
    } else {
      // Poste del separador con brazo doble (existente o reubicado)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, H, 8), poleMats.concrete);
      pole.position.y = H / 2 + 0.22;
      pole.castShadow = true;
      group.add(pole);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12), new THREE.MeshBasicMaterial({ color: kindColor }));
      band.position.y = 2.6;
      group.add(band);
      [-1, 1].forEach(s => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, MED_ARM, 8), poleMats.steel);
        arm.rotation.x = Math.PI / 2 + s * 0.15;
        arm.position.set(0, H + 0.22 - 0.05, s * MED_ARM / 2);
        group.add(arm);
        makeHead(group, 0, H + 0.32, s * MED_ARM, Math.PI / 2, 0.75, rec);
        makeCone(group, 0, H + 0.22, s * (MED_ARM + 0.6), H * 0.62, rec);
      });
      rec.lightLocal = new THREE.Vector3(0, H + 0.22, 0);
      rec.targetLocal = new THREE.Vector3(0, 0, 0);
      rec.angle = 1.25;
      pickables.push(pole);
      pole.userData.lum = rec;
      rec.heads.forEach(h => { pickables.push(h.mesh); h.mesh.userData.lum = rec; });
    }

    makeMarker(group, kindColor, rec);

    const light = new THREE.SpotLight(0xffffff, 0, 48, rec.angle, 0.75, 1.5);
    light.position.copy(rec.lightLocal);
    light.target.position.copy(rec.targetLocal);
    group.add(light, light.target);
    rec.light = light;

    const label = textSprite(def.id, {
      size: 42, scale: 1.25, color: '#ffffff',
      bg: 'rgba(12,18,32,0.82)', border: '#' + new THREE.Color(kindColor).getHexString(),
    });
    label.position.set(0, H + 2.2, def.kind === 'new' ? -1 : 0);
    group.add(label);
    rec.label = label;

    if (def.kind === 'relocated') {
      // trayectoria de reubicación (visible en DESPUÉS)
      const dx = def.xAfter - def.x;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(def.x, H + 1, 0),
        new THREE.Vector3(def.x + dx / 2, H + 9, 0),
        new THREE.Vector3(def.xAfter, H + 1, 0)
      );
      const path = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
        new THREE.LineDashedMaterial({ color: COLORS.relocated, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0, fog: false })
      );
      path.computeLineDistances();
      luminaireRoot.add(path);
      rec.path = path;
      const ghost = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.35, 40),
        new THREE.MeshBasicMaterial({ color: COLORS.relocated, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide })
      );
      ghost.rotation.x = -Math.PI / 2;
      ghost.position.set(def.x, 0.32, 0);
      luminaireRoot.add(ghost);
      rec.ghost = ghost;
    }

    // Estado animado (se conserva al reconstruir para no "saltar")
    const t = targetFor(rec);
    rec.cur = prevCur ? Object.assign({}, prevCur) : { x: t.x, show: t.show, f: t.f, colorT: t.colorT };
    group.position.x = rec.cur.x;
    luminaireRoot.add(group);
    luminaires.push(rec);
    return rec;
  }

  function newPositions() {
    const usable = 150; // las nuevas se distribuyen dentro de los ~180 m de la muestra
    const n = Math.floor(usable / params.spacing) + 1;
    const start = -((n - 1) * params.spacing) / 2;
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(start + i * params.spacing);
    return xs;
  }

  function disposeTree(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== poleMats.steel && o.material !== poleMats.concrete && o.material !== poleMats.head) {
        if (o.material.map && o.material.map !== glowTex) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  function rebuildLuminaires() {
    hideTooltip();
    const prev = {};
    luminaires.forEach(l => { prev[l.id] = l.cur; });
    luminaires.length = 0;
    pickables.length = 0;
    while (luminaireRoot.children.length) {
      const c = luminaireRoot.children[0];
      luminaireRoot.remove(c);
      disposeTree(c);
    }
    const H = params.mountH;
    MEDIAN_DEF.forEach(d => buildLuminaire(d, H, prev[d.id]));
    newPositions().forEach((x, i) => {
      const id = 'N-' + String(i + 1).padStart(2, '0');
      buildLuminaire({ id, kind: 'new', x, xAfter: x, before: 0 }, H, prev[id] ? Object.assign({}, prev[id], { x }) : null);
    });
    updateCounts();
    applyLayerVisibility();
    heatDirty = true;
  }

  function targetFor(l) {
    const after = state.after;
    if (l.kind === 'new') return { x: l.x, show: after ? 1 : 0, f: after ? 1 : 0, colorT: 1 };
    if (l.kind === 'relocated') return { x: after ? l.xAfter : l.x, show: 1, f: 1, colorT: after ? 1 : 0 };
    return { x: l.x, show: 1, f: after ? 1 : l.before, colorT: after ? 1 : 0 };
  }

  function updateCounts() {
    const n = luminaires.filter(l => l.kind === 'new').length;
    document.getElementById('cntNew').textContent = n;
    document.getElementById('cntReloc').textContent = luminaires.filter(l => l.kind === 'relocated').length;
    document.getElementById('cntExist').textContent = luminaires.filter(l => l.kind === 'existing').length;
  }

  // ---------------------------------------------------------------------------
  // Mapa de distribución relativa (ilustrativo, NO fotométrico)
  // ---------------------------------------------------------------------------
  const HEAT = { x0: -SAMPLE_HALF, x1: SAMPLE_HALF, z0: -13, z1: 13, ppm: 4 };
  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = (HEAT.x1 - HEAT.x0) * HEAT.ppm;
  heatCanvas.height = (HEAT.z1 - HEAT.z0) * HEAT.ppm;
  const heatCtx = heatCanvas.getContext('2d');
  const heatImg = heatCtx.createImageData(heatCanvas.width, heatCanvas.height);
  const heatTex = new THREE.CanvasTexture(heatCanvas);
  heatTex.minFilter = THREE.LinearFilter;
  const heatMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(HEAT.x1 - HEAT.x0, HEAT.z1 - HEAT.z0),
    new THREE.MeshBasicMaterial({ map: heatTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 })
  );
  heatMesh.rotation.x = -Math.PI / 2;
  heatMesh.position.set(0, 0.36, 0);
  heatMesh.renderOrder = 4;
  heatMesh.visible = false;
  scene.add(heatMesh);
  let heatDirty = true, heatTimer = 0, heatRef = 1;

  const HEAT_STOPS = [
    [0.0, [11, 13, 43]], [0.2, [31, 58, 147]], [0.4, [22, 163, 163]],
    [0.6, [76, 198, 80]], [0.8, [242, 210, 46]], [1.0, [255, 246, 213]],
  ];
  function heatColor(t) {
    for (let i = 1; i < HEAT_STOPS.length; i++) {
      if (t <= HEAT_STOPS[i][0]) {
        const [t0, c0] = HEAT_STOPS[i - 1], [t1, c1] = HEAT_STOPS[i];
        const u = (t - t0) / (t1 - t0);
        return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
      }
    }
    return HEAT_STOPS[HEAT_STOPS.length - 1][1];
  }

  function heatSources(useTarget) {
    const src = [];
    luminaires.forEach(l => {
      const s = useTarget ? targetFor(l) : l.cur;
      const w = s.f * s.show;
      if (w <= 0.001) return;
      const gx = s.x, gz = l.group.position.z;
      l.heads.forEach(h => src.push([gx + h.local.x, h.local.y, gz + h.local.z, w / l.heads.length * (l.kind === 'new' ? 1 : 2)]));
    });
    return src;
  }
  function heatField(src, x, z) {
    let e = 0;
    for (let i = 0; i < src.length; i++) {
      const s = src[i], dx = x - s[0], dz = z - s[2], h = s[1];
      const d2 = dx * dx + dz * dz + h * h;
      e += s[3] * h / (d2 * Math.sqrt(d2)); // E ≈ I·cosθ/d² (fuente puntual isotrópica)
    }
    return e;
  }
  function computeHeatRef() {
    // referencia fija = escenario DESPUÉS, para comparar ANTES vs DESPUÉS en la misma escala
    const saved = state.after;
    state.after = true;
    const src = heatSources(true);
    state.after = saved;
    let sum = 0, n = 0;
    for (let x = -80; x <= 80; x += 2) for (let z = -10; z <= 10; z += 2) { sum += heatField(src, x, z); n++; }
    heatRef = (sum / n) * 1.8;
  }
  function renderHeat() {
    const src = heatSources(false);
    const W = heatCanvas.width, Hh = heatCanvas.height, d = heatImg.data;
    for (let j = 0; j < Hh; j++) {
      const z = HEAT.z1 - (j + 0.5) / HEAT.ppm;
      for (let i = 0; i < W; i++) {
        const x = HEAT.x0 + (i + 0.5) / HEAT.ppm;
        const t = Math.min(1, Math.pow(heatField(src, x, z) / heatRef, 0.6));
        const c = heatColor(t), k = (j * W + i) * 4;
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 120 + 120 * t;
      }
    }
    heatCtx.putImageData(heatImg, 0, 0);
    heatTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // Tráfico
  // ---------------------------------------------------------------------------
  const cars = [];
  const trafficGroup = new THREE.Group();
  scene.add(trafficGroup);
  (function traffic() {
    const palette = [0xd9d9d9, 0xf2c200, 0x2b2b2b, 0x9aa3ad, 0xb22222, 0x3b5ba5, 0xf2f2f2, 0xf2c200];
    const lanes = [[4.75, 1], [8.25, 1], [-4.75, -1], [-8.25, -1]];
    for (let i = 0; i < 10; i++) {
      const [z, dir] = lanes[i % 4];
      const g = new THREE.Group();
      const bodyMat = std(palette[i % palette.length], { roughness: 0.4, metalness: 0.3 });
      addBox(4.2, 0.75, 1.8, bodyMat, 0, 0.6, 0, { cast: true, parent: g });
      addBox(2.2, 0.6, 1.6, std(0x1d2430, { roughness: 0.2, metalness: 0.5 }), -0.2, 1.25, 0, { cast: true, parent: g });
      addBox(3.4, 0.3, 1.7, std(0x111111), 0, 0.2, 0, { parent: g });
      const head = new THREE.MeshBasicMaterial({ color: 0x777777 });
      const tail = new THREE.MeshBasicMaterial({ color: 0x551111 });
      [-0.6, 0.6].forEach(dz => {
        addBox(0.06, 0.18, 0.35, head, 2.11, 0.72, dz, { parent: g });
        addBox(0.06, 0.16, 0.3, tail, -2.11, 0.75, dz, { parent: g });
      });
      g.rotation.y = dir > 0 ? 0 : Math.PI;
      g.position.set(rr(-WORLD_HALF, WORLD_HALF), 0.05, z);
      trafficGroup.add(g);
      cars.push({ g, dir, speed: rr(8, 13), head, tail });
    }
  })();

  // ---------------------------------------------------------------------------
  // Cámaras predefinidas y recorrido
  // ---------------------------------------------------------------------------
  const VIEWS = {
    aerial: { pos: [-58, 46, 70], target: [-4, 0, 2], label: 'Vista aérea' },
    plan: { pos: [0, 118, 0.01], target: [0, 0, 0], label: 'Vista en planta' },
    street: { pos: [-82, 1.7, 11.8], target: [-60, 2.6, 10.2], label: 'Nivel de calle · peatón' },
    driver: { pos: [-88, 1.3, 8.2], target: [-62, 1.8, 7.6], label: 'Nivel de calle · conductor' },
    walk: { pos: [-88, 1.7, 11.6], target: [-70, 2.0, 11.0], label: 'Recorrido peatonal' },
  };
  let tween = null;
  let walking = false;

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function goToView(name) {
    const v = VIEWS[name];
    state.view = name;
    walking = false;
    hideTooltip();
    tween = {
      t: 0, dur: 1.8,
      p0: camera.position.clone(), t0: controls.target.clone(),
      p1: new THREE.Vector3().fromArray(v.pos), t1: new THREE.Vector3().fromArray(v.target),
      then: name === 'walk' ? () => { walking = true; } : null,
    };
    controls.enabled = false;
    controls.minDistance = name === 'street' || name === 'driver' || name === 'walk' ? 0.5 : 2;
    document.getElementById('badgeView').textContent = v.label;
    setActive('segView', 'view', name);
  }

  // ---------------------------------------------------------------------------
  // Interfaz
  // ---------------------------------------------------------------------------
  function setActive(segId, attr, value) {
    document.querySelectorAll('#' + segId + ' button').forEach(b => b.classList.toggle('active', b.dataset[attr] === value));
  }

  function setScenario(after) {
    state.after = after;
    setActive('segScenario', 'scenario', after ? 'after' : 'before');
    const b = document.getElementById('badgeScenario');
    b.textContent = after ? 'DESPUÉS' : 'ANTES';
    b.className = 'tag ' + (after ? 'tag-after' : 'tag-before');
    heatDirty = true;
  }
  function setNight(night) {
    state.night = night;
    setActive('segTime', 'time', night ? 'night' : 'day');
    const b = document.getElementById('badgeTime');
    b.textContent = night ? 'NOCHE' : 'DÍA';
    b.className = 'tag ' + (night ? 'tag-night' : 'tag-day');
  }

  document.querySelectorAll('#segScenario button').forEach(b => b.addEventListener('click', () => setScenario(b.dataset.scenario === 'after')));
  document.querySelectorAll('#segTime button').forEach(b => b.addEventListener('click', () => setNight(b.dataset.time === 'night')));
  document.querySelectorAll('#segView button').forEach(b => b.addEventListener('click', () => goToView(b.dataset.view)));

  function applyLayerVisibility() {
    luminaires.forEach(l => {
      l.label.visible = params.labels;
      l.marker.visible = params.markers;
    });
    sampleMarkers.visible = params.markers;
    heatMesh.visible = params.heat;
    trafficGroup.visible = params.traffic;
    document.getElementById('heatLegend').classList.toggle('hidden', !params.heat);
  }
  function bindToggle(id, key) {
    const el = document.getElementById(id);
    el.addEventListener('change', () => { params[key] = el.checked; if (key === 'heat') heatDirty = true; applyLayerVisibility(); });
    return el;
  }
  const toggles = {
    cones: bindToggle('tglCones', 'cones'),
    heat: bindToggle('tglHeat', 'heat'),
    labels: bindToggle('tglLabels', 'labels'),
    markers: bindToggle('tglMarkers', 'markers'),
    traffic: bindToggle('tglTraffic', 'traffic'),
  };
  function flip(key) { toggles[key].checked = !toggles[key].checked; toggles[key].dispatchEvent(new Event('change')); }

  const rngH = document.getElementById('rngH'), rngS = document.getElementById('rngS'), rngP = document.getElementById('rngP');
  rngH.addEventListener('input', () => { document.getElementById('valH').textContent = rngH.value + ' m'; });
  rngH.addEventListener('change', () => { params.mountH = parseFloat(rngH.value); rebuildLuminaires(); computeHeatRef(); });
  rngS.addEventListener('input', () => { document.getElementById('valS').textContent = rngS.value + ' m'; });
  rngS.addEventListener('change', () => { params.spacing = parseFloat(rngS.value); rebuildLuminaires(); computeHeatRef(); });
  rngP.addEventListener('input', () => { params.power = rngP.value / 100; document.getElementById('valP').textContent = rngP.value + ' %'; });

  document.querySelectorAll('[data-collapse]').forEach(btn => btn.addEventListener('click', () => {
    const p = document.getElementById(btn.dataset.collapse);
    const mobile = window.innerWidth <= 760;
    if (mobile) p.classList.toggle('expanded'); else p.classList.toggle('collapsed');
    const closed = mobile ? !p.classList.contains('expanded') : p.classList.contains('collapsed');
    btn.textContent = closed ? '+' : '–';
  }));
  if (window.innerWidth <= 760) document.querySelectorAll('[data-collapse]').forEach(b => { b.textContent = '+'; });

  const showUiBtn = document.getElementById('showUi');
  function toggleUi() {
    document.body.classList.toggle('ui-hidden');
    showUiBtn.classList.toggle('hidden', !document.body.classList.contains('ui-hidden'));
    hideTooltip();
  }
  showUiBtn.addEventListener('click', toggleUi);

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'q') setScenario(false);
    else if (k === 'w') setScenario(true);
    else if (k === 'n') setNight(!state.night);
    else if (k === '1') goToView('aerial');
    else if (k === '2') goToView('plan');
    else if (k === '3') goToView('street');
    else if (k === '4') goToView('driver');
    else if (k === 'r') goToView('walk');
    else if (k === 'c') flip('cones');
    else if (k === 'm') flip('heat');
    else if (k === 'l') flip('labels');
    else if (k === 'h') toggleUi();
    else if (k === 'escape') hideTooltip();
  });

  // Tarjeta de información al hacer clic en una luminaria
  const tooltip = document.getElementById('tooltip');
  function hideTooltip() { tooltip.classList.add('hidden'); }
  function kindName(k) { return k === 'new' ? 'Luminaria nueva' : k === 'relocated' ? 'Luminaria reubicada' : 'Luminaria existente'; }
  function showInfo(l, px, py) {
    const col = '#' + new THREE.Color(COLORS[l.kind]).getHexString();
    const pos = x => Math.round(x + SAMPLE_HALF) + ' m';
    let body = '';
    if (l.kind === 'new') {
      body = '<p>Luminaria LED nueva con su poste (ACT.1.2: 20 en el proyecto; ACT.3.1: LED de bajo consumo).</p>' +
        '<p>Posición en la muestra: ' + pos(l.x) + ' desde el inicio, andén sur.</p>' +
        '<p class="muted">Potencia, flujo luminoso y temperatura de color: <b>no especificados en el Excel</b>.</p>' +
        '<p>Escenario actual: ' + (state.after ? 'instalada' : 'aún no existe') + '.</p>';
    } else if (l.kind === 'relocated') {
      body = '<p>Luminaria existente reubicada hacia un sector con déficit de cobertura (ACT.1.3: 8 en el proyecto).</p>' +
        '<p>Posición: ' + pos(l.x) + ' → ' + pos(l.xAfter) + ' (separador central). <span class="muted">Ubicación ilustrativa.</span></p>' +
        '<p>Escenario actual: ' + (state.after ? 'reubicada, con tecnología LED' : 'en su posición original') + '.</p>';
    } else {
      body = '<p>Luminaria existente del separador central.</p>' +
        '<p>Posición en la muestra: ' + pos(l.x) + '.</p>' +
        '<p>ANTES: ' + (l.note || 'en funcionamiento') + '.</p>' +
        '<p>DESPUÉS: incluida en el mantenimiento preventivo y correctivo (Componente 2; meta ≥ 95 % en funcionamiento).</p>';
    }
    body += '<p class="muted">Altura de montaje modelada: ' + params.mountH + ' m (aproximación editable).</p>';
    tooltip.innerHTML = '<button class="close" aria-label="Cerrar">×</button><h4><i class="dot" style="background:' + col + '"></i>' + l.id + ' · ' + kindName(l.kind) + '</h4>' + body;
    tooltip.querySelector('.close').addEventListener('click', hideTooltip);
    tooltip.classList.remove('hidden');
    const w = 300, h = tooltip.offsetHeight;
    tooltip.style.left = Math.min(window.innerWidth - w - 12, px + 14) + 'px';
    tooltip.style.top = Math.max(12, Math.min(window.innerHeight - h - 12, py - 20)) + 'px';
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const visible = pickables.filter(o => o.parent && o.parent.visible);
    const hit = raycaster.intersectObjects(visible, false)[0];
    if (hit && hit.object.userData.lum) showInfo(hit.object.userData.lum, e.clientX, e.clientY);
    else hideTooltip();
  });
  canvas.addEventListener('pointermove', e => {
    if (e.buttons) return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    canvas.style.cursor = raycaster.intersectObjects(pickables, false).length ? 'pointer' : '';
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------------------
  // Bucle de animación
  // ---------------------------------------------------------------------------
  let nightT = 0;
  const clock = new THREE.Clock();
  const tmpC = new THREE.Color();
  const BASE_SPOT = 2.6;

  function updateEnvironment(dt) {
    nightT = damp(nightT, state.night ? 1 : 0, 2.2, dt);
    const n = nightT;
    skyUniforms.top.value.copy(SKY.day.top).lerp(SKY.night.top, n);
    skyUniforms.hor.value.copy(SKY.day.hor).lerp(SKY.night.hor, n);
    skyUniforms.bot.value.copy(SKY.day.bot).lerp(SKY.night.bot, n);
    scene.fog.color.copy(SKY.day.fog).lerp(SKY.night.fog, n);
    scene.fog.near = 140 - 60 * n;
    scene.fog.far = 460 - 120 * n;
    hemi.color.copy(LIGHTING.day.hemiSky).lerp(LIGHTING.night.hemiSky, n);
    hemi.groundColor.copy(LIGHTING.day.hemiGround).lerp(LIGHTING.night.hemiGround, n);
    hemi.intensity = LIGHTING.day.hemiI + (LIGHTING.night.hemiI - LIGHTING.day.hemiI) * n;
    sun.color.copy(LIGHTING.day.sunC).lerp(LIGHTING.night.sunC, n);
    sun.intensity = LIGHTING.day.sunI + (LIGHTING.night.sunI - LIGHTING.day.sunI) * n;
    stars.material.opacity = Math.max(0, n * 1.2 - 0.2);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
  }

  function updateLuminaires(dt) {
    let moving = false;
    luminaires.forEach(l => {
      const t = targetFor(l), c = l.cur;
      const before = [c.x, c.show, c.f, c.colorT];
      c.x = damp(c.x, t.x, 1.6, dt);
      c.show = damp(c.show, t.show, 2.4, dt);
      c.f = damp(c.f, t.f, 2.4, dt);
      c.colorT = damp(c.colorT, t.colorT, 2.0, dt);
      if (Math.abs(c.x - before[0]) + Math.abs(c.show - before[1]) + Math.abs(c.f - before[2]) > 1e-3) moving = true;

      // posición y aparición (los postes nuevos "brotan" del andén)
      l.group.position.x = c.x;
      const hidden = c.show < 0.01;
      l.group.visible = !hidden;
      l.group.position.y = -(1 - c.show) * (l.H + 1.5);
      l.marker.material.opacity = 0.95 * c.show;
      l.marker.position.y = 0.32 + (1 - c.show) * (l.H + 1.5);

      const lampColor = tmpC.copy(COLORS.amber).lerp(COLORS.led, c.colorT);
      const on = c.f * c.show;
      l.light.color.copy(lampColor);
      l.light.intensity = BASE_SPOT * on * nightT * params.power;
      l.heads.forEach(h => {
        h.lensMat.color.setRGB(0.33, 0.33, 0.33).lerp(lampColor, Math.min(1, on * (0.25 + nightT)));
        h.glow.material.color.copy(lampColor);
        h.glow.material.opacity = on * nightT * Math.min(1.2, params.power);
      });
      l.cones.forEach(cone => {
        cone.visible = params.cones && on * nightT > 0.01;
        cone.material.uniforms.color.value.copy(lampColor);
        cone.material.uniforms.opacity.value = 0.32 * on * nightT * Math.min(1.4, params.power);
      });
      if (l.path) {
        const a = params.markers ? Math.max(0, (c.colorT - 0.05)) : 0;
        l.path.material.opacity = a;
        l.path.visible = a > 0.01;
        l.ghost.material.opacity = 0.7 * a;
        l.ghost.visible = a > 0.01;
      }
    });
    return moving;
  }

  function updateTraffic(dt) {
    if (!params.traffic) return;
    cars.forEach(car => {
      car.g.position.x += car.dir * car.speed * dt;
      if (car.g.position.x > WORLD_HALF) car.g.position.x = -WORLD_HALF;
      if (car.g.position.x < -WORLD_HALF) car.g.position.x = WORLD_HALF;
      car.head.color.setRGB(0.45 + 0.55 * nightT, 0.45 + 0.55 * nightT, 0.42 + 0.5 * nightT);
      car.tail.color.setRGB(0.35 + 0.65 * nightT, 0.05, 0.05);
    });
  }

  function updateCamera(dt) {
    if (tween) {
      tween.t += dt / tween.dur;
      const k = easeInOut(Math.min(1, tween.t));
      camera.position.lerpVectors(tween.p0, tween.p1, k);
      controls.target.lerpVectors(tween.t0, tween.t1, k);
      if (tween.t >= 1) {
        const then = tween.then;
        tween = null;
        controls.enabled = true;
        if (then) then();
      }
    } else if (walking) {
      const speed = 4.5; // m/s, ritmo de caminata un poco acelerado
      camera.position.x += speed * dt;
      camera.position.y = 1.7 + Math.sin(camera.position.x * 2.4) * 0.03;
      controls.target.set(camera.position.x + 18, 2.0, 11.0);
      if (camera.position.x > SAMPLE_HALF + 2) {
        walking = false;
      }
    }
    controls.update();
  }

  // Detener recorrido si el usuario interactúa con la cámara
  controls.addEventListener('start', () => { if (walking) walking = false; });

  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    updateEnvironment(dt);
    const moving = updateLuminaires(dt);
    updateTraffic(dt);
    updateCamera(dt);

    if (params.heat) {
      heatTimer -= dt;
      if (heatDirty || (moving && heatTimer <= 0)) {
        renderHeat();
        heatDirty = false;
        heatTimer = 0.15;
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Inicio
  // ---------------------------------------------------------------------------
  rebuildLuminaires();
  computeHeatRef();
  controls.target.fromArray(VIEWS.aerial.target);
  camera.position.fromArray(VIEWS.aerial.pos);
  setScenario(false);
  setNight(false);
  void PROJECT;

  // expuesto para depuración y pruebas
  window.maqueta = { state, params, setScenario, setNight, goToView, luminaires, renderer, scene, camera };

  requestAnimationFrame(() => {
    frame();
    setTimeout(() => loader.classList.add('done'), 300);
  });
})();
