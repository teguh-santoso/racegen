import * as THREE from "three";

// ---------- Konfigurasi ramah anak ----------
const TRACK_RX = 30;      // jari-jari trek (x)
const TRACK_RZ = 20;      // jari-jari trek (z)
const TRACK_HALF = 6;     // setengah lebar trek
const BASE_SPEED = 8;     // jalan otomatis pelan
const MAX_SPEED = 13;     // gas penuh tetap pelan
const MIN_SPEED = 3;      // rem tidak pernah berhenti total
const TURN_RATE = 1.7;    // belok lembut
const DEADZONE = 0.35;    // analog stick toleran goyangan anak
const TOTAL_STARS = 8;
const BOUND = 55;         // pagar luar lapangan

// ---------- State ----------
let started = false;
let starCount = 0;
let heading = 0;
let speed = 0;
const keys = { left: false, right: false, gas: false, brake: false };
let startButtonPrev = false;

// ---------- DOM ----------
const container = document.getElementById("game-container");
const overlay = document.getElementById("start-overlay");
const startButton = document.getElementById("start-button");
const starsEl = document.getElementById("stars");
const stickEl = document.getElementById("stick-status");
const messageEl = document.getElementById("message");

let messageTimer = null;
function showMessage(text, ms = 2500) {
  messageEl.textContent = text;
  messageEl.classList.add("show");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => messageEl.classList.remove("show"), ms);
}

// ---------- Audio (dibuat setelah klik Start) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      audioCtx = null;
    }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function beep(freq, t0, dur, type = "sine", vol = 0.25) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + t0 + dur);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(audioCtx.currentTime + t0);
  o.stop(audioCtx.currentTime + t0 + dur);
}
const soundStar = () => { beep(880, 0, 0.15); beep(1320, 0.12, 0.25); };
const soundHorn = () => beep(240, 0, 0.25, "square", 0.15);
const soundFanfare = () => { beep(523, 0, 0.2); beep(659, 0.18, 0.2); beep(784, 0.36, 0.4); };

// ---------- Three.js dasar ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 90, 220);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a7d3a, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
scene.add(sun);

// ---------- Lapangan ----------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(BOUND * 2 + 20, BOUND * 2 + 20),
  new THREE.MeshStandardMaterial({ color: 0x58a34c, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Trek oval (pita segitiga buatan sendiri) ----------
function ellipsePoint(angle, rx, rz) {
  return new THREE.Vector3(Math.cos(angle) * rx, 0, Math.sin(angle) * rz);
}
function buildTrackRibbon() {
  const SEG = 96;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const cx = Math.cos(a) * TRACK_RX;
    const cz = Math.sin(a) * TRACK_RZ;
    // normal arah radial (gradien elips), dinormalisasi
    const nx = cx / (TRACK_RX * TRACK_RX);
    const nz = cz / (TRACK_RZ * TRACK_RZ);
    const len = Math.hypot(nx, nz) || 1;
    const ox = (nx / len) * TRACK_HALF;
    const oz = (nz / len) * TRACK_HALF;
    positions.push(cx - ox, 0.05, cz - oz, cx + ox, 0.05, cz + oz);
    if (i < SEG) {
      const b = i * 2;
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.95 })
  );
  mesh.receiveShadow = true;
  return mesh;
}
scene.add(buildTrackRibbon());

// Garis start
{
  const a = 0;
  const c = ellipsePoint(a, TRACK_RX, TRACK_RZ);
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.08, TRACK_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  line.position.set(c.x, 0.08, c.z);
  scene.add(line);
}

// Pagar merah-putih di tepi dalam & luar trek
{
  const postGeo = new THREE.BoxGeometry(0.9, 1.2, 0.9);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xd23b2e, roughness: 0.8 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const cx = Math.cos(a) * TRACK_RX;
      const cz = Math.sin(a) * TRACK_RZ;
      const nx = cx / (TRACK_RX * TRACK_RX);
      const nz = cz / (TRACK_RZ * TRACK_RZ);
      const len = Math.hypot(nx, nz) || 1;
      const w = TRACK_HALF + 0.8;
      const post = new THREE.Mesh(postGeo, i % 2 === 0 ? redMat : whiteMat);
      post.position.set(cx + (nx / len) * w * side, 0.6, cz + (nz / len) * w * side);
      post.castShadow = true;
      scene.add(post);
    }
  }
}

// Pohon hias (tetap jauh dari trek)
{
  const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.6, 8);
  const leafGeo = new THREE.ConeGeometry(1.8, 3.2, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d5a2b, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8f3a, roughness: 1 });
  const spots = [
    [0, 0], [12, 12], [-14, 10], [16, -12], [-12, -14],
    [42, 20], [-42, -18], [40, -30], [-40, 28], [8, -34], [-8, 34],
  ];
  for (const [tx, tz] of spots) {
    const e = (tx / TRACK_RX) ** 2 + (tz / TRACK_RZ) ** 2;
    if (e > 0.35 && e < 2.2) continue; // jangan menutupi trek
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 3.2;
    leaf.castShadow = true;
    tree.add(trunk, leaf);
    tree.position.set(tx, 0, tz);
    scene.add(tree);
  }
}

// Awan lucu
const clouds = [];
{
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const puffGeo = new THREE.SphereGeometry(2, 12, 10);
  for (let i = 0; i < 4; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set(j * 2.2 - 2.2, j % 2, 0);
      puff.scale.y = 0.6;
      cloud.add(puff);
    }
    cloud.position.set(-50 + i * 30, 26 + (i % 2) * 4, -45 + (i % 3) * 20);
    clouds.push(cloud);
    scene.add(cloud);
  }
}

// ---------- Mobil pemain ----------
const car = new THREE.Group();
{
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe63b2e, roughness: 0.5 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.3 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 1.9), cabinMat);
  cabin.position.set(0, 1.35, -0.2);
  cabin.castShadow = true;

  car.add(body, cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 14);
  const wheelPos = [
    [-1.15, 0.45, 1.3], [1.15, 0.45, 1.3],
    [-1.15, 0.45, -1.3], [1.15, 0.45, -1.3],
  ];
  for (const [x, y, z] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    car.add(w);
  }
}
scene.add(car);

// Posisi awal di garis start, menghadap arah trek
car.position.set(TRACK_RX, 0, 0);
heading = 0; // forward = (sin h, 0, cos h) -> +z, searah trek di garis start
car.rotation.y = heading;

// ---------- Bintang ----------
const stars = [];
{
  const starGeo = new THREE.OctahedronGeometry(0.9);
  const starMat = new THREE.MeshStandardMaterial({
    color: 0xffd93b, emissive: 0xaa7700, roughness: 0.4,
  });
  for (let i = 0; i < TOTAL_STARS; i++) {
    const a = (i / TOTAL_STARS) * Math.PI * 2 + 0.2;
    const m = new THREE.Mesh(starGeo, starMat.clone());
    m.position.set(Math.cos(a) * TRACK_RX, 1.4, Math.sin(a) * TRACK_RZ);
    m.castShadow = true;
    scene.add(m);
    stars.push({ mesh: m, taken: false, phase: Math.random() * Math.PI * 2 });
  }
}

// ---------- Konfeti sederhana ----------
const CONFETTI_N = 150;
const confettiGeo = new THREE.BufferGeometry();
const confettiPos = new Float32Array(CONFETTI_N * 3);
const confettiVel = new Float32Array(CONFETTI_N * 3);
const confettiCol = new Float32Array(CONFETTI_N * 3);
confettiGeo.setAttribute("position", new THREE.BufferAttribute(confettiPos, 3));
confettiGeo.setAttribute("color", new THREE.BufferAttribute(confettiCol, 3));
const confetti = new THREE.Points(
  confettiGeo,
  new THREE.PointsMaterial({ size: 0.5, vertexColors: true })
);
confetti.frustumCulled = false;
scene.add(confetti);
let confettiLife = 0;
{
  // sembunyikan di bawah tanah saat idle
  for (let i = 0; i < CONFETTI_N; i++) confettiPos[i * 3 + 1] = -50;
}
function burstConfetti(x, y, z) {
  const palette = [[1, 0.3, 0.3], [1, 0.85, 0.2], [0.3, 0.8, 0.4], [0.35, 0.6, 1]];
  for (let i = 0; i < CONFETTI_N; i++) {
    confettiPos[i * 3] = x;
    confettiPos[i * 3 + 1] = y;
    confettiPos[i * 3 + 2] = z;
    const th = Math.random() * Math.PI * 2;
    const up = 4 + Math.random() * 6;
    confettiVel[i * 3] = Math.cos(th) * 4;
    confettiVel[i * 3 + 1] = up;
    confettiVel[i * 3 + 2] = Math.sin(th) * 4;
    const c = palette[i % palette.length];
    confettiCol[i * 3] = c[0];
    confettiCol[i * 3 + 1] = c[1];
    confettiCol[i * 3 + 2] = c[2];
  }
  confettiGeo.attributes.position.needsUpdate = true;
  confettiGeo.attributes.color.needsUpdate = true;
  confettiLife = 1.6;
}

// ---------- Input: keyboard ----------
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = true;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = true;
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") keys.gas = true;
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") keys.brake = true;
  if (e.key === " ") { ensureAudio(); soundHorn(); }
  if (e.key === "Enter") startGame();
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keys.left = false;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keys.right = false;
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") keys.gas = false;
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") keys.brake = false;
});

// ---------- Input: USB gamepad (Gamepad API) ----------
function applyDeadzone(v) {
  return Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}
function readGamepad() {
  const out = { steer: 0, gas: false, brake: false, startPressed: false };
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes && p.axes.length > 0 ? applyDeadzone(p.axes[0]) : 0;
      out.steer = Math.max(-1, Math.min(1, ax));
      const b = (i) => !!(p.buttons && p.buttons[i] && p.buttons[i].pressed);
      out.gas = b(7) || b(0);      // RT atau A
      out.brake = b(6) || b(1);    // LT atau B
      out.startPressed = b(9);     // Start
      break; // pakai gamepad pertama saja (cukup untuk anak TK)
    }
  } catch (e) {
    // browser tanpa Gamepad API: abaikan, keyboard tetap jalan
  }
  return out;
}
function refreshStickLabel() {
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find((x) => x && x.connected);
    if (p) {
      const name = (p.id || "stick").slice(0, 22);
      stickEl.textContent = "Stick tersambung: " + name;
      stickEl.classList.add("connected");
    } else {
      stickEl.textContent = "Stick: belum tersambung";
      stickEl.classList.remove("connected");
    }
  } catch (e) {
    stickEl.textContent = "Stick: tidak didukung browser ini";
  }
}
window.addEventListener("gamepadconnected", refreshStickLabel);
window.addEventListener("gamepaddisconnected", refreshStickLabel);
setInterval(refreshStickLabel, 2000);
refreshStickLabel();

// ---------- Start ----------
function startGame() {
  if (started) return;
  started = true;
  ensureAudio();
  overlay.classList.add("hidden");
  showMessage("Ayo jalan! Kumpulkan bintang ★", 2500);
}
startButton.addEventListener("click", startGame);

// ---------- Fisika arcade super sederhana ----------
function ellipseClosest(x, z) {
  const e = (x / TRACK_RX) ** 2 + (z / TRACK_RZ) ** 2;
  if (e < 1e-6) return { cx: TRACK_RX, cz: 0, dist: TRACK_RX };
  const k = 1 / Math.sqrt(e);
  const cx = x * k;
  const cz = z * k;
  return { cx, cz, dist: Math.hypot(x - cx, z - cz) };
}

function updateCar(dt, gp) {
  // Setir gabungan keyboard + stick
  let steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + gp.steer;
  steer = Math.max(-1, Math.min(1, steer));

  // Kecepatan: otomatis jalan, gas menambah, rem mengurangi (tak pernah 0)
  let target = BASE_SPEED;
  if (keys.gas || gp.gas) target = MAX_SPEED;
  if (keys.brake || gp.brake) target = MIN_SPEED;

  // Rumput di luar trek memperlambat (lembut, tanpa hukuman)
  const { cx, cz, dist } = ellipseClosest(car.position.x, car.position.z);
  if (dist > TRACK_HALF - 1) target *= 0.7;

  speed += (target - speed) * Math.min(1, dt * 2.5);

  // Belok proporsional kecepatan supaya tidak spin.
  // Tanda minus: kamera di belakang mobil, jadi steer+ (kanan)
  // harus memutar mobil ke kanan layar.
  heading -= steer * TURN_RATE * (speed / MAX_SPEED) * dt;

  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  car.position.x += fx * speed * dt;
  car.position.z += fz * speed * dt;

  // Pagar lembut trek: dorong kembali ke dalam koridor
  const after = ellipseClosest(car.position.x, car.position.z);
  if (after.dist > TRACK_HALF) {
    const excess = after.dist - TRACK_HALF;
    const dx = after.cx - car.position.x;
    const dz = after.cz - car.position.z;
    const len = Math.hypot(dx, dz) || 1;
    car.position.x += (dx / len) * excess;
    car.position.z += (dz / len) * excess;
    speed *= 0.985;
  }

  // Pagar luar lapangan (keras tapi memantul, bukan game over)
  car.position.x = Math.max(-BOUND, Math.min(BOUND, car.position.x));
  car.position.z = Math.max(-BOUND, Math.min(BOUND, car.position.z));

  car.rotation.y = heading;

  // Kamera mengikuti dari belakang-atas
  const desired = new THREE.Vector3(
    car.position.x - fx * 9,
    6,
    car.position.z - fz * 9
  );
  camera.position.lerp(desired, Math.min(1, dt * 4));
  camera.lookAt(car.position.x + fx * 6, 1.5, car.position.z + fz * 6);
}

// ---------- Bintang & konfeti ----------
function updateStars(t, dt) {
  for (const s of stars) {
    if (s.taken) continue;
    s.mesh.rotation.y += dt * 2;
    s.mesh.position.y = 1.4 + Math.sin(t * 3 + s.phase) * 0.25;
    const dx = car.position.x - s.mesh.position.x;
    const dz = car.position.z - s.mesh.position.z;
    if (Math.hypot(dx, dz) < 2.8) {
      s.taken = true;
      s.mesh.visible = false;
      starCount++;
      starsEl.textContent = `★ ${starCount}/${TOTAL_STARS}`;
      soundStar();
      burstConfetti(s.mesh.position.x, 2, s.mesh.position.z);
      if (starCount >= TOTAL_STARS) {
        soundFanfare();
        showMessage("Hebat! Semua bintang dapat! ★", 3500);
        setTimeout(() => {
          starCount = 0;
          starsEl.textContent = `★ 0/${TOTAL_STARS}`;
          for (const r of stars) { r.taken = false; r.mesh.visible = true; }
          showMessage("Ayo cari lagi!", 2000);
        }, 3600);
      }
    }
  }
  if (confettiLife > 0) {
    confettiLife -= dt;
    for (let i = 0; i < CONFETTI_N; i++) {
      confettiVel[i * 3 + 1] -= 12 * dt;
      confettiPos[i * 3] += confettiVel[i * 3] * dt;
      confettiPos[i * 3 + 1] += confettiVel[i * 3 + 1] * dt;
      confettiPos[i * 3 + 2] += confettiVel[i * 3 + 2] * dt;
      if (confettiPos[i * 3 + 1] < 0.1) confettiPos[i * 3 + 1] = 0.1;
    }
    confettiGeo.attributes.position.needsUpdate = true;
    if (confettiLife <= 0) {
      for (let i = 0; i < CONFETTI_N; i++) confettiPos[i * 3 + 1] = -50;
      confettiGeo.attributes.position.needsUpdate = true;
    }
  }
}

// ---------- Loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  const gp = readGamepad();
  if (gp.startPressed && !startButtonPrev) startGame();
  startButtonPrev = gp.startPressed;

  if (started) {
    updateCar(dt, gp);
    updateStars(t, dt);
  } else {
    // idle: kamera pelan mengelilingi trek sebelum Start
    const a = t * 0.08;
    camera.position.set(Math.cos(a) * 55, 30, Math.sin(a) * 55);
    camera.lookAt(0, 0, 0);
  }

  for (const c of clouds) {
    c.position.x += dt * 0.7;
    if (c.position.x > 70) c.position.x = -70;
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
