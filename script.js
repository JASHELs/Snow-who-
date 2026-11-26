const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const bgMusic = document.getElementById('bgMusic');
const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');
const lyricsBox = document.getElementById('lyricsBox');

if (lyricsBox) lyricsBox.style.display = 'none';

const LYRICS_TIMELINE = [
  { time: 0.3, text: "I want you to know ,\nthat I'm never leaving" },
  { time: 5.2, text: "'Cause I'm Mrs. Snow\n 'til death we'll be freezing" },
  { time: 9.0, text: "You are my home,\nmy home for all seasons" },
  { time: 12.0, text: "So come on" },
  { time: 14.5, text: "let's go" }
];

// Segundo exacto en el que termina esa parte y la cámara entra al cristal
const ZOOM_TRIGGER_TIME = 16.0;

// Duración total exacta de toda la animación (en segundos)
const TOTAL_DURATION = 34.0;
// =========================================================================

let width = 0;
let height = 0;

function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- GENERADOR DE PUNTOS 3D DE ALTA NITIDEZ PARA LAS LETRAS ---
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d');

function sampleTextToSnowTargets(text) {
  const lines = text.split('\n');
  offCanvas.width = 860;
  offCanvas.height = 240;

  offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
  offCtx.fillStyle = '#ffffff';
  offCtx.font = '900 46px Arial, Helvetica, sans-serif';
  offCtx.textAlign = 'center';
  offCtx.textBaseline = 'middle';

  const lineHeight = 58;
  const startY = offCanvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, idx) => {
    offCtx.fillText(line, offCanvas.width / 2, startY + idx * lineHeight);
  });

  const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height).data;
  const targets = [];

  const stepX = 3;
  const stepY = 3;
  for (let py = 0; py < offCanvas.height; py += stepY) {
    for (let px = 0; px < offCanvas.width; px += stepX) {
      const alpha = imgData[(py * offCanvas.width + px) * 4 + 3];
      if (alpha > 140) {
        const wx = (px - offCanvas.width / 2) * 0.56;
        const wy = (py - offCanvas.height / 2) * 0.56 - 210;
        const wz = 152;
        const order = px / offCanvas.width;
        targets.push({ x: wx, y: wy, z: wz, order });
      }
    }
  }

  targets.sort((a, b) => a.order - b.order);
  return targets;
}

// --- CONTROL DE INICIO, AUDIO Y TIEMPO ---
let isStarted = false;
let isFinished = false;
let fallbackStartTime = 0;
let targetProgress = 0;
let progress = 0;
let currentLyricIndex = -1;
let activeTextTargets = [];
let lineStartTime = 0;

startBtn.addEventListener('click', () => {
  isStarted = true;
  isFinished = false;
  fallbackStartTime = performance.now();
  startOverlay.classList.add('hidden');
  bgMusic.currentTime = 0;
  bgMusic.volume = 1;
  bgMusic.play().catch(() => {});
});

function getElapsedSeconds() {
  if (!isStarted) return 0;
  if (!bgMusic.paused && !isNaN(bgMusic.currentTime) && bgMusic.currentTime > 0) {
    return bgMusic.currentTime;
  }
  return (performance.now() - fallbackStartTime) / 1000;
}

function assignSnowToTargets(targets) {
  for (let i = 0; i < outerSnow.length; i++) {
    outerSnow[i].target = null;
    outerSnow[i].revealAt = 0;
  }

  if (!targets || targets.length === 0) return;

  const maxTextFlakes = outerSnow.length - 700;
  const count = Math.min(targets.length, maxTextFlakes);
  const stride = targets.length / count;

  for (let i = 0; i < count; i++) {
    const t = targets[Math.floor(i * stride)];
    const flake = outerSnow[i];
    flake.target = t;
    flake.revealAt = t.order * 0.45;
  }
}

function updateLyricsAndTransition(elapsed) {
  if (!isStarted) return;

  let activeIndex = -1;
  for (let i = 0; i < LYRICS_TIMELINE.length; i++) {
    if (elapsed >= LYRICS_TIMELINE[i].time) {
      activeIndex = i;
    }
  }

  if (elapsed >= ZOOM_TRIGGER_TIME) {
    if (targetProgress === 0) {
      targetProgress = 1;
      assignSnowToTargets([]);
    }
    return;
  }

  if (activeIndex !== currentLyricIndex && activeIndex >= 0) {
    currentLyricIndex = activeIndex;
    lineStartTime = elapsed;
    activeTextTargets = sampleTextToSnowTargets(LYRICS_TIMELINE[activeIndex].text);
    assignSnowToTargets(activeTextTargets);
  }
}

// --- ROTACIÓN INTERACTIVA ---
let rotY = 0;
let rotX = 0.14;
let targetRotY = 0;
let targetRotX = 0.14;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener('pointerdown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;

  targetRotY += dx * 0.006;
  targetRotX += dy * 0.004;
  targetRotY = Math.max(-0.75, Math.min(0.75, targetRotY));
  targetRotX = Math.max(-0.22, Math.min(0.45, targetRotX));

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

// --- GEOMETRÍA 3D ---
const innerScenePoints = [];
const outerGlobePoints = [];
const innerSnow = [];
const outerSnow = [];

function addPoint(arr, x, y, z, r, g, b, char = '@', emissive = false, isReflection = false, group = 'static') {
  arr.push({ x, y, z, r, g, b, char, emissive, isReflection, group });
}

const GLOBE_RADIUS = 115;
const FLOOR_Y = 48;

const DANCE_PIVOT_X = 6;
const DANCE_PIVOT_Z = 4;

function buildInnerScene() {
  // 1. Suelo nevado circular (fijo)
  for (let x = -110; x <= 110; x += 4.2) {
    for (let z = -110; z <= 110; z += 4.2) {
      if (x * x + z * z <= 104 * 104) {
        const wave = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 1.4;
        const y = FLOOR_Y + wave;
        addPoint(innerScenePoints, x, y, z, 215, 225, 240, '#');
        if (z > 65 && Math.random() > 0.35) {
          addPoint(innerScenePoints, x, y + 4, z, 170, 185, 205, '+');
        }
      }
    }
  }

  // 2. Farola vintage (fija)
  const lampX = -52;
  const lampZ = -12;
  for (let y = FLOOR_Y; y >= -38; y -= 2.6) {
    const radius = y > FLOOR_Y - 8 ? 3.5 : 1.7;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
      addPoint(innerScenePoints, lampX + Math.cos(a) * radius, y, lampZ + Math.sin(a) * radius, 65, 70, 82, '|');
    }
  }

  for (let y = -39; y >= -58; y -= 2.4) {
    const progressH = (-39 - y) / 19;
    const halfW = 4.2 + progressH * 2.5;
    for (let dx = -halfW; dx <= halfW; dx += 2.3) {
      for (let dz = -halfW; dz <= halfW; dz += 2.3) {
        if (Math.abs(dx) > halfW - 1.5 || Math.abs(dz) > halfW - 1.5) {
          addPoint(innerScenePoints, lampX + dx, y, lampZ + dz, 255, 205, 85, '@', true);
        }
      }
    }
  }

  for (let y = -59; y >= -66; y -= 2) {
    const r = Math.max(0.5, (66 + y) * 1.1);
    for (let a = 0; a < Math.PI * 2; a += 0.7) {
      addPoint(innerScenePoints, lampX + Math.cos(a) * r, y, lampZ + Math.sin(a) * r, 55, 60, 70, '^');
    }
  }

  // 3. Snowman
  const snowX = -11;
  const snowZ = 4;
  const snowSpheres = [
    { cy: 33, r: 15.5 },
    { cy: 11, r: 11.8 },
    { cy: -6, r: 8.6 }
  ];

  for (const s of snowSpheres) {
    for (let lat = -Math.PI / 2; lat <= Math.PI / 2; lat += 0.24) {
      const y = s.cy + Math.sin(lat) * s.r;
      if (y > FLOOR_Y) continue;
      const ringR = Math.cos(lat) * s.r;
      const stepA = ringR > 2 ? 0.28 : 1.5;
      for (let a = 0; a < Math.PI * 2; a += stepA) {
        addPoint(innerScenePoints, snowX + Math.cos(a) * ringR, y, snowZ + Math.sin(a) * ringR, 235, 244, 255, '@', false, false, 'couple');
      }
    }
  }

  for (let y = 1; y >= -2; y -= 1.5) {
    for (let a = 0; a < Math.PI * 2; a += 0.32) {
      addPoint(innerScenePoints, snowX + Math.cos(a) * 9.3, y, snowZ + Math.sin(a) * 9.3, 215, 55, 60, '#', false, false, 'couple');
    }
  }

  for (const by of [6, 12, 18]) {
    addPoint(innerScenePoints, snowX, by, snowZ + 11.8, 30, 35, 45, 'O', false, false, 'couple');
  }

  addPoint(innerScenePoints, snowX - 1.5, -8, snowZ + 8.4, 25, 30, 40, 'o', false, false, 'couple');
  addPoint(innerScenePoints, snowX + 4.0, -8, snowZ + 7.6, 25, 30, 40, 'o', false, false, 'couple');
  for (let nz = 8.2; nz <= 15.2; nz += 1.6) {
    addPoint(innerScenePoints, snowX + 1.8, -6, snowZ + nz, 245, 125, 45, '>', false, false, 'couple');
  }

  for (let t = 0; t <= 1; t += 0.14) {
    addPoint(innerScenePoints, snowX - 10 - t * 10, 9 - t * 7, snowZ + 2, 115, 72, 48, '/', false, false, 'couple');
  }

  for (let t = 0; t <= 1; t += 0.1) {
    const bx = snowX + 9 + t * 8.5;
    const by = 8 + Math.sin(t * Math.PI) * 3.5;
    addPoint(innerScenePoints, bx, by, snowZ + 3, 115, 72, 48, '=', false, false, 'couple');
  }

  for (let a = 0; a < Math.PI * 2; a += 0.32) {
    addPoint(innerScenePoints, snowX + Math.cos(a) * 10.5, -14.2, snowZ + Math.sin(a) * 10.5, 45, 50, 62, '=', false, false, 'couple');
  }
  for (let y = -15; y >= -23; y -= 2) {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      addPoint(innerScenePoints, snowX + Math.cos(a) * 6.5, y, snowZ + Math.sin(a) * 6.5, 45, 50, 62, '#', false, false, 'couple');
    }
  }

  // 4. Chica junto al Snowman
  const girlX = 23;
  const girlZ = 4;

  for (let y = FLOOR_Y; y >= 31; y -= 2.3) {
    for (const leg of [-4.2, 4.2]) {
      for (let a = 0; a < Math.PI * 2; a += 0.9) {
        addPoint(innerScenePoints, girlX + leg + Math.cos(a) * 2.6, y, girlZ + Math.sin(a) * 2.6, 125, 72, 58, '#', false, false, 'couple');
      }
    }
  }

  for (let y = 32; y >= -10; y -= 2.2) {
    const t = (32 - y) / 42;
    const rx = 16.5 * (1 - t * 0.46);
    const rz = 11.5 * (1 - t * 0.42);
    for (let a = 0; a < Math.PI * 2; a += 0.24) {
      const fold = Math.sin(a * 5) * (1 - t) * 1.1;
      addPoint(innerScenePoints, girlX + Math.cos(a) * (rx + fold), y, girlZ + Math.sin(a) * (rz + fold), 78, 152, 212, '@', false, false, 'couple');
    }
  }

  for (let t = 0; t <= 1; t += 0.09) {
    const ax = girlX - 9 - t * 7.5;
    const ay = -1 + t * 12.5;
    for (let a = 0; a < Math.PI * 2; a += 1.2) {
      addPoint(innerScenePoints, ax + Math.cos(a) * 2.2, ay, girlZ + 3 + Math.sin(a) * 2.2, 85, 160, 220, '#', false, false, 'couple');
    }
  }

  for (let a = 0; a < Math.PI * 2; a += 0.7) {
    addPoint(innerScenePoints, 6.5 + Math.cos(a) * 2.2, 11.5, girlZ + 3 + Math.sin(a) * 2.2, 255, 224, 195, '@', false, false, 'couple');
  }

  for (let y = -11; y >= -16; y -= 2.1) {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      addPoint(innerScenePoints, girlX + Math.cos(a) * 8.2, y, girlZ + Math.sin(a) * 8.2, 215, 58, 62, '@', false, false, 'couple');
    }
  }

  for (let y = -17; y >= -36; y -= 2.1) {
    const t = (-17 - y) / 19;
    const r = Math.cos(t * Math.PI * 0.48) * 8.6;
    for (let a = 0; a < Math.PI * 2; a += 0.32) {
      const isHair = t < 0.25 && Math.sin(a) > 0.2;
      addPoint(innerScenePoints, girlX + Math.cos(a) * r, y, girlZ + Math.sin(a) * r, isHair ? 95 : 220, isHair ? 55 : 52, isHair ? 42 : 58, '@', false, false, 'couple');
    }
  }

  for (let a = 0; a < Math.PI * 2; a += 0.7) {
    addPoint(innerScenePoints, girlX + Math.cos(a) * 2.2, -37.5, girlZ + Math.sin(a) * 2.2, 235, 90, 95, '*', false, false, 'couple');
  }
}

function buildOuterGlobe() {
  const latSteps = 56;
  const lonSteps = 92;

  for (let i = 1; i < latSteps; i++) {
    const phi = (i / latSteps) * Math.PI * 0.76;
    const y = -Math.cos(phi) * GLOBE_RADIUS;
    const r = Math.sin(phi) * GLOBE_RADIUS;

    for (let j = 0; j < lonSteps; j++) {
      const theta = (j / lonSteps) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;

      if (z < -25 && (i + j) % 2 !== 0) continue;

      const diag = x * 0.85 + y * 0.65;
      const isWideReflection = z > 10 && Math.abs(diag + 12) < 34;
      const isCoreReflection = z > 20 && Math.abs(diag + 12) < 15;
      const isParallelStreak = z > 15 && Math.abs(diag - 36) < 7;

      if (isCoreReflection) {
        addPoint(outerGlobePoints, x, y, z, 255, 255, 255, '@', true, true);
      } else if (isWideReflection || isParallelStreak) {
        addPoint(outerGlobePoints, x, y, z, 205, 238, 255, '#', true, true);
      } else {
        const lightFactor = Math.max(0.25, (z + GLOBE_RADIUS) / (2 * GLOBE_RADIUS));
        const rCol = Math.floor(42 + lightFactor * 52);
        const gCol = Math.floor(68 + lightFactor * 78);
        const bCol = Math.floor(102 + lightFactor * 108);
        const char = lightFactor > 0.72 ? '+' : '#';
        addPoint(outerGlobePoints, x, y, z, rCol, gCol, bCol, char, false, false);
      }
    }
  }

  for (let y = 82; y <= 136; y += 2.8) {
    const t = (y - 82) / 54;
    const curve = Math.sin(t * Math.PI * 0.75) * 24;
    const flare = Math.pow(t, 1.4) * 22;
    const radius = 98 + curve + flare;

    for (let a = 0; a < Math.PI * 2; a += 0.11) {
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const shine = Math.cos(a - 0.8) * 35;

      if (y < 89 || (y > 129 && y <= 136)) {
        const rCol = Math.min(255, Math.max(150, 225 + shine));
        const gCol = Math.min(255, Math.max(155, 230 + shine));
        const bCol = Math.min(255, Math.max(165, 240 + shine));
        addPoint(outerGlobePoints, x, y, z, rCol, gCol, bCol, '=');
      } else {
        const rCol = Math.min(255, Math.max(115, 178 + shine));
        const gCol = Math.min(255, Math.max(120, 184 + shine));
        const bCol = Math.min(255, Math.max(130, 196 + shine));
        addPoint(outerGlobePoints, x, y, z, rCol, gCol, bCol, '#');
      }
    }
  }

  const tableTopY = 137;
  const tableThickness = 10;
  const tableRadius = 205;

  for (let r = 0; r <= tableRadius; r += 6.5) {
    const stepA = r === 0 ? Math.PI * 2 : 7.5 / r;
    for (let a = 0; a < Math.PI * 2; a += stepA) {
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      const grain = Math.sin(x * 0.06 + Math.cos(z * 0.04) * 2) * 12;
      const red = Math.min(255, Math.max(40, 128 + grain));
      const green = Math.min(255, Math.max(25, 74 + grain * 0.6));
      const blue = Math.min(255, Math.max(15, 44 + grain * 0.4));
      const shadow = r < 135 ? 0.52 : 1.0;

      addPoint(
        outerGlobePoints,
        x,
        tableTopY,
        z,
        Math.floor(red * shadow),
        Math.floor(green * shadow),
        Math.floor(blue * shadow),
        r > tableRadius - 8 ? '@' : '='
      );
    }
  }

  for (let y = tableTopY + 2.5; y <= tableTopY + tableThickness; y += 2.8) {
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = Math.cos(a) * tableRadius;
      const z = Math.sin(a) * tableRadius;
      addPoint(outerGlobePoints, x, y, z, 88, 48, 28, '#');
    }
  }
}

function initSnow() {
  for (let i = 0; i < 420; i++) {
    const r = Math.random() * (GLOBE_RADIUS - 10);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    innerSnow.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: Math.min(FLOOR_Y - 2, r * Math.cos(phi)),
      z: r * Math.sin(phi) * Math.sin(theta),
      speed: 0.28 + Math.random() * 0.45,
      drift: Math.random() * Math.PI * 2,
      char: Math.random() > 0.4 ? '*' : '.'
    });
  }

  for (let i = 0; i < 2350; i++) {
    outerSnow.push({
      x: (Math.random() - 0.5) * 600,
      y: (Math.random() - 0.5) * 480,
      z: (Math.random() - 0.5) * 360,
      speed: 0.55 + Math.random() * 0.9,
      drift: Math.random() * Math.PI * 2,
      char: Math.random() > 0.35 ? '*' : '.',
      target: null,
      revealAt: 0
    });
  }
}

buildInnerScene();
buildOuterGlobe();
initSnow();

// =========================================================================
// SISTEMA DE FUEGOS ARTIFICIALES DETRÁS DE LA PAREJA (ALTURA BAJA Y ENCUADRADA)
// =========================================================================
const fireworks = [];
const FIREWORK_PALETTES = [
  ['#ff5964', '#ffbe0b', '#ffffff'],
  ['#38bdf8', '#a855f7', '#f0abfc'],
  ['#fbbf24', '#fb7185', '#fef08a'],
  ['#34d399', '#60a5fa', '#ffffff']
];

let lastFireworkSpawn = 0;

function spawnFirework(time) {
  const baseX = (Math.random() - 0.5) * 110;
  const baseZ = -48 - Math.random() * 32;
  // Explotan más abajo (entre y = -8 y y = -32) para quedar justo detrás de ellos bien encuadrados
  const targetY = -8 - Math.random() * 24;
  const palette = FIREWORK_PALETTES[Math.floor(Math.random() * FIREWORK_PALETTES.length)];

  fireworks.push({
    state: 'rising',
    x: baseX,
    y: FLOOR_Y - 2,
    z: baseZ,
    baseX,
    targetY,
    speedY: 0.9 + Math.random() * 0.3,
    wiggleFreq: 0.15 + Math.random() * 0.05,
    wiggleAmp: 3.2 + Math.random() * 1.3,
    phase: Math.random() * Math.PI * 2,
    trail: [],
    sparks: [],
    palette,
    spawnTime: time
  });
}

function updateAndCollectFireworks(time, renderList, cosY, sinY, cosX, sinX, camDist, fov, camOffsetY, innerAlpha) {
  if (innerAlpha <= 0.05) return;

  if (time - lastFireworkSpawn > 1300 && fireworks.length < 4) {
    spawnFirework(time);
    lastFireworkSpawn = time;
  }

  for (let f = fireworks.length - 1; f >= 0; f--) {
    const fw = fireworks[f];

    if (fw.state === 'rising') {
      fw.y -= fw.speedY;
      const progressRise = (FLOOR_Y - fw.y) / (FLOOR_Y - fw.targetY);
      const wiggle = Math.sin(fw.y * fw.wiggleFreq + fw.phase) * fw.wiggleAmp;
      fw.x = fw.baseX + wiggle;

      fw.trail.push({ x: fw.x, y: fw.y, z: fw.z, life: 1.0 });
      if (fw.trail.length > 20) {
        fw.trail.shift();
      }

      if (fw.y <= fw.targetY || progressRise >= 1) {
        fw.state = 'exploded';
        const sparkCount = 65;
        for (let i = 0; i < sparkCount; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const speed = 0.55 + Math.random() * 1.15;
          fw.sparks.push({
            x: fw.x,
            y: fw.y,
            z: fw.z,
            vx: Math.sin(phi) * Math.cos(theta) * speed,
            vy: Math.cos(phi) * speed,
            vz: Math.sin(phi) * Math.sin(theta) * speed * 0.65,
            life: 1.0,
            decay: 0.014 + Math.random() * 0.01,
            color: fw.palette[i % fw.palette.length],
            char: i % 3 === 0 ? '@' : (i % 2 === 0 ? '*' : '+')
          });
        }
      }
    }

    for (let t = fw.trail.length - 1; t >= 0; t--) {
      const seg = fw.trail[t];
      seg.life -= 0.038;
      if (seg.life <= 0) {
        fw.trail.splice(t, 1);
        continue;
      }

      const rPos = rotate3D(seg.x, seg.y + camOffsetY, seg.z, cosY, sinY, cosX, sinX);
      const zDepth = rPos.z + camDist;
      if (zDepth <= 15) continue;

      const behindCouple = Math.abs(seg.x - DANCE_PIVOT_X) < 34 && seg.y > -38;
      const occlusionFactor = behindCouple ? 0.32 : 0.85;

      const scale = fov / zDepth;
      const isHead = t === fw.trail.length - 1 && fw.state === 'rising';
      renderList.push({
        x: width * 0.5 + rPos.x * scale,
        y: height * 0.5 + rPos.y * scale,
        z: zDepth,
        size: Math.max(6, Math.min(15, (isHead ? 2.4 : 1.75) * scale)),
        color: isHead ? '#ffffff' : fw.palette[0],
        char: isHead ? '@' : '~',
        alpha: seg.life * innerAlpha * occlusionFactor,
        isText: false,
        isFirework: true
      });
    }

    if (fw.state === 'exploded') {
      for (let s = fw.sparks.length - 1; s >= 0; s--) {
        const sp = fw.sparks[s];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.z += sp.vz;
        sp.vx *= 0.962;
        sp.vy = sp.vy * 0.962 + 0.016;
        sp.vz *= 0.962;
        sp.life -= sp.decay;

        if (sp.life <= 0) {
          fw.sparks.splice(s, 1);
          continue;
        }

        const rPos = rotate3D(sp.x, sp.y + camOffsetY, sp.z, cosY, sinY, cosX, sinX);
        const zDepth = rPos.z + camDist;
        if (zDepth <= 15) continue;

        const behindCouple = Math.abs(sp.x - DANCE_PIVOT_X) < 36 && sp.y > -38;
        const occlusionFactor = behindCouple ? 0.30 : 0.88;

        const scale = fov / zDepth;
        renderList.push({
          x: width * 0.5 + rPos.x * scale,
          y: height * 0.5 + rPos.y * scale,
          z: zDepth,
          size: Math.max(6, Math.min(15, (1.4 + sp.life * 1.1) * scale)),
          color: sp.color,
          char: sp.life > 0.45 ? sp.char : '.',
          alpha: sp.life * innerAlpha * occlusionFactor,
          isText: false,
          isFirework: true
        });
      }
    }

    if (fw.state === 'exploded' && fw.trail.length === 0 && fw.sparks.length === 0) {
      fireworks.splice(f, 1);
    }
  }
}

// --- PROYECCIÓN 3D Y RENDERIZADO ---
function rotate3D(x, y, z, cosY, sinY, cosX, sinX) {
  const x1 = x * cosY - z * sinY;
  const z1 = z * cosY + x * sinY;
  const y2 = y * cosX - z1 * sinX;
  const z2 = z1 * cosX + y * sinX;
  return { x: x1, y: y2, z: z2 };
}

function animate(time) {
  const elapsed = getElapsedSeconds();

  // Control de duración exacta de 34 segundos con cierre suave
  let endingOpacity = 1.0;
  if (isStarted) {
    if (elapsed >= TOTAL_DURATION) {
      isFinished = true;
      bgMusic.pause();
      ctx.fillStyle = '#030408';
      ctx.fillRect(0, 0, width, height);
      return; // Detiene el ciclo exactamente a los 34 segundos
    } else if (elapsed > TOTAL_DURATION - 2.5) {
      // Desvanecimiento gradual de imagen y música en los últimos 2.5 segundos
      endingOpacity = Math.max(0, (TOTAL_DURATION - elapsed) / 2.5);
      if (!bgMusic.paused) {
        bgMusic.volume = endingOpacity;
      }
    }
  }

  updateLyricsAndTransition(elapsed);

  progress += (targetProgress - progress) * 0.032;
  rotY += (targetRotY - rotY) * 0.08;
  rotX += (targetRotX - rotX) * 0.08;

  const autoSway = !isDragging ? Math.sin(time * 0.00055) * 0.13 : 0;
  const currentRotY = rotY + autoSway;

  const cosY = Math.cos(currentRotY);
  const sinY = Math.sin(currentRotY);
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);

  const minDim = Math.min(width, height);
  const camDist = 415 * (1 - progress) + 152 * progress;
  const fov = minDim * (0.80 * (1 - progress) + 1.05 * progress);
  const camOffsetY = 14 * (1 - progress) + 6 * progress;

  ctx.fillStyle = '#030408';
  ctx.fillRect(0, 0, width, height);

  const renderList = [];
  const lampLight = { x: -52, y: -46, z: -12 };

  const innerAlpha = Math.max(0, Math.min(1, (progress - 0.25) / 0.65)) * endingOpacity;

  const danceAngle = time * 0.00055;
  const cosDance = Math.cos(danceAngle);
  const sinDance = Math.sin(danceAngle);
  const danceBobY = Math.abs(Math.sin(time * 0.0022)) * -1.8;

  // A) Escena interior
  if (innerAlpha > 0.01) {
    updateAndCollectFireworks(time, renderList, cosY, sinY, cosX, sinX, camDist, fov, camOffsetY, innerAlpha);

    for (let i = 0; i < innerScenePoints.length; i++) {
      const p = innerScenePoints[i];
      let px = p.x;
      let py = p.y;
      let pz = p.z;

      if (p.group === 'couple') {
        const dx = px - DANCE_PIVOT_X;
        const dz = pz - DANCE_PIVOT_Z;
        px = DANCE_PIVOT_X + (dx * cosDance - dz * sinDance);
        pz = DANCE_PIVOT_Z + (dz * cosDance + dx * sinDance);
        py += danceBobY;
      }

      const rPos = rotate3D(px, py + camOffsetY, pz, cosY, sinY, cosX, sinX);
      const zDepth = rPos.z + camDist;
      if (zDepth <= 15) continue;

      const scale = fov / zDepth;
      const screenX = width * 0.5 + rPos.x * scale;
      const screenY = height * 0.5 + rPos.y * scale;

      if (screenX < -20 || screenX > width + 20 || screenY < -20 || screenY > height + 20) continue;

      let r = p.r;
      let g = p.g;
      let b = p.b;

      if (!p.emissive) {
        const dx = px - lampLight.x;
        const dy = py - lampLight.y;
        const dz = pz - lampLight.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 105) {
          const influence = Math.pow(1 - dist / 105, 1.8) * 0.72;
          r = Math.min(255, r + 255 * influence);
          g = Math.min(255, g + 195 * influence);
          b = Math.max(0, b + 15 * influence);
        }

        const fog = Math.max(0.42, Math.min(1.15, 220 / zDepth));
        r = Math.floor(r * fog);
        g = Math.floor(g * fog);
        b = Math.floor(b * fog);
      }

      renderList.push({
        x: screenX,
        y: screenY,
        z: zDepth,
        size: Math.max(6, Math.min(17, 2.5 * scale)),
        color: `rgb(${r},${g},${b})`,
        char: p.char,
        alpha: innerAlpha,
        isText: false,
        isFirework: false
      });
    }

    // B) Nieve dentro del globo
    for (let i = 0; i < innerSnow.length; i++) {
      const s = innerSnow[i];
      s.y += s.speed;
      s.x += Math.sin(time * 0.0015 + s.drift) * 0.15;

      if (s.y > FLOOR_Y - 1) {
        const r = Math.random() * (GLOBE_RADIUS - 18);
        const a = Math.random() * Math.PI * 2;
        s.x = Math.cos(a) * r;
        s.z = Math.sin(a) * r;
        s.y = -Math.sqrt(Math.max(0, (GLOBE_RADIUS - 12) ** 2 - r * r)) * (0.4 + Math.random() * 0.6);
      }

      const rPos = rotate3D(s.x, s.y + camOffsetY, s.z, cosY, sinY, cosX, sinX);
      const zDepth = rPos.z + camDist;
      if (zDepth <= 15) continue;

      const scale = fov / zDepth;
      renderList.push({
        x: width * 0.5 + rPos.x * scale,
        y: height * 0.5 + rPos.y * scale,
        z: zDepth,
        size: Math.max(6, Math.min(15, 2.2 * scale)),
        color: '#f1f5f9',
        char: s.char,
        alpha: 0.88 * innerAlpha,
        isText: false,
        isFirework: false
      });
    }
  }

  // C) Esfera exterior y nieve formando letras
  const outerAlpha = Math.max(0, 1 - progress * 1.45) * endingOpacity;
  if (outerAlpha > 0.02) {
    for (let i = 0; i < outerGlobePoints.length; i++) {
      const p = outerGlobePoints[i];
      const rPos = rotate3D(p.x, p.y + camOffsetY, p.z, cosY, sinY, cosX, sinX);
      const zDepth = rPos.z + camDist;
      if (zDepth <= 20) continue;

      const scale = fov / zDepth;
      let pointAlpha = outerAlpha;
      if (p.isReflection) {
        pointAlpha *= 1.0;
      } else if (p.y < 82) {
        pointAlpha *= 0.92;
      }

      renderList.push({
        x: width * 0.5 + rPos.x * scale,
        y: height * 0.5 + rPos.y * scale,
        z: zDepth,
        size: Math.max(7, Math.min(18, 2.7 * scale)),
        color: `rgb(${p.r},${p.g},${p.b})`,
        char: p.char,
        alpha: pointAlpha,
        isText: false,
        isFirework: false
      });
    }

    const lineElapsed = elapsed - lineStartTime;

    for (let i = 0; i < outerSnow.length; i++) {
      const s = outerSnow[i];
      const isFormingLetter = s.target && lineElapsed >= s.revealAt;

      if (isFormingLetter) {
        const jitterX = Math.sin(time * 0.003 + s.drift) * 0.14;
        const jitterY = Math.cos(time * 0.003 + s.drift) * 0.14;
        s.x += (s.target.x + jitterX - s.x) * 0.32;
        s.y += (s.target.y + jitterY - s.y) * 0.32;
        s.z += (s.target.z - s.z) * 0.32;
      } else {
        s.y += s.speed;
        s.x += Math.cos(time * 0.001 + s.drift) * 0.25;
        if (s.y > 136) {
          s.y = -245;
          s.x = (Math.random() - 0.5) * 600;
        }
      }

      const textRotY = isFormingLetter ? currentRotY * 0.15 : currentRotY;
      const textRotX = isFormingLetter ? rotX * 0.15 : rotX;
      const rPos = rotate3D(
        s.x,
        s.y + camOffsetY,
        s.z,
        Math.cos(textRotY),
        Math.sin(textRotY),
        Math.cos(textRotX),
        Math.sin(textRotX)
      );

      const zDepth = rPos.z + camDist;
      if (zDepth <= 25) continue;

      const scale = fov / zDepth;
      renderList.push({
        x: width * 0.5 + rPos.x * scale,
        y: height * 0.5 + rPos.y * scale,
        z: zDepth,
        size: isFormingLetter
          ? Math.max(6, Math.min(12, 1.55 * scale))
          : Math.max(7, Math.min(17, 2.5 * scale)),
        color: isFormingLetter ? '#ffffff' : '#e2e8f0',
        char: isFormingLetter ? '#' : s.char,
        alpha: outerAlpha * (isFormingLetter ? 1.0 : 0.88),
        isText: isFormingLetter,
        isFirework: false
      });
    }
  }

  renderList.sort((a, b) => b.z - a.z);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let lastFont = '';
  for (let i = 0; i < renderList.length; i++) {
    const item = renderList[i];
    const fontStr = `bold ${Math.round(item.size)}px "Courier New", monospace`;
    if (fontStr !== lastFont) {
      ctx.font = fontStr;
      lastFont = fontStr;
    }

    if (item.isText) {
      ctx.shadowColor = 'rgba(186, 230, 253, 0.75)';
      ctx.shadowBlur = 6;
    } else if (item.isFirework) {
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 4;
    } else if (ctx.shadowBlur !== 0) {
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = item.alpha;
    ctx.fillStyle = item.color;
    ctx.fillText(item.char, item.x, item.y);
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  if (!isFinished) {
    requestAnimationFrame(animate);
  }
}

requestAnimationFrame(animate);