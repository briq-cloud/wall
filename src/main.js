import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sound } from './audio.js';
import { ICONS, drawIcon, iconSvg, shade, textOn } from './icons.js';
import { LEVELS, TOOLS } from './levels.js';
import { BLOCK, C } from './palette.js';
import { BOT, BOT_BOX, MARK, MARK_BOX, offset } from './shapes.js';

// ---------------------------------------------------------------- dimensions (world units)

const BRICK = { w: 2, h: 0.8, d: 0.9, gap: 0.16, r: 0.1 };
const PITCH_X = BRICK.w + BRICK.gap;
const PITCH_Y = BRICK.h + BRICK.gap;
const COLS = 12;
const HALF = (COLS * PITCH_X - BRICK.gap) / 2;
const FIELD = { left: -HALF - 0.1, right: HALF + 0.1, top: 11.4, bottom: -12.5 };
const WALL_TOP = 10.2;
/** The paddle: three bricks long, one brick high. */
const PADDLE = { y: -10, w: 3 * BRICK.w + 2 * BRICK.gap, h: BRICK.h, d: BRICK.d + 0.1 };
const R = 0.28;
/** An agent fills two rows; the B fills four. */
const AGENT_S = (2 * BRICK.h + BRICK.gap) / BOT_BOX.height;
const MARK_S = (4 * BRICK.h + 3 * BRICK.gap) / MARK_BOX.height;
const MIN_PIECE = 0.45;
const MAX_BALLS = 9;
/** Blast radius: a bomb brick, a bomb ball, a rocket. */
const BLAST = { bomb: 2.7, ball: 2.3, rocket: 1.3 };
/** With this many bricks left, the balls curve towards them. */
const ENDGAME = 6;
const LIVES = 3;
const DT = 1 / 120;

const rowTop = (r) => WALL_TOP - r * PITCH_Y;
const colX = (c) => -HALF + BRICK.w / 2 + c * PITCH_X;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- scene

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.kiln);

const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 300);
const lookAt = new THREE.Vector3(0, -0.6, 0);
const viewDir = new THREE.Vector3(0, -0.12, 1).normalize();
let viewDist = 40;

scene.add(new THREE.HemisphereLight(0xfff1e6, 0x2a201a, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-9, 14, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 16, bottom: -16, near: 1, far: 80 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const geometries = new Map();
function box(w, h, d, r = BRICK.r) {
  const key = `${w.toFixed(3)}:${h.toFixed(3)}:${d}:${r}`;
  let g = geometries.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
    geometries.set(key, g);
  }
  return g;
}
const materials = new Map();
function mat(color) {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
    materials.set(color, m);
  }
  return m;
}
function solid(geometry, material, shadows = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

// The mortar behind the wall and the frame around the field.
{
  const w = FIELD.right - FIELD.left;
  const h = FIELD.top - FIELD.bottom + 1;
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: C.surface, roughness: 0.95 }),
  );
  back.position.set(0, (FIELD.top + FIELD.bottom) / 2 - 0.5, -BRICK.d / 2 - 0.01);
  back.receiveShadow = true;
  scene.add(back);
  const frame = mat(C.lineStrong);
  for (const side of [-1, 1]) {
    const rail = solid(box(0.5, h + 0.5, 1.2, 0.12), frame);
    rail.position.set(side * (FIELD.right + 0.25), back.position.y + 0.25, 0);
    scene.add(rail);
  }
  const top = solid(box(w + 1, 0.5, 1.2, 0.12), frame);
  top.position.set(0, FIELD.top + 0.25, 0);
  scene.add(top);
}

// The paddle: a long brick-orange brick.
const paddleMesh = solid(
  box(PADDLE.w, PADDLE.h, PADDLE.d, 0.14),
  new THREE.MeshStandardMaterial({ color: C.brick, emissive: C.brick, emissiveIntensity: 0.18, roughness: 0.45 }),
);
paddleMesh.position.y = PADDLE.y;
scene.add(paddleMesh);
const paddle = { x: 0, target: 0, scale: 1, scaleTarget: 1, squash: 0 };
const paddleWidth = () => PADDLE.w * paddle.scale;

// Balls: a small ink brick, each of the first three carrying a light.
const ballGeo = box(0.5, 0.5, 0.5, 0.12);
const ballMat = new THREE.MeshStandardMaterial({ color: C.ink, emissive: C.ink, emissiveIntensity: 0.4, roughness: 0.3 });
const ballLights = [0, 1, 2].map(() => {
  const l = new THREE.PointLight(0xffe2cc, 0, 7, 2);
  scene.add(l);
  return l;
});
let balls = [];
const fireMat = new THREE.MeshStandardMaterial({ color: C.brick, emissive: '#ff8a4a', emissiveIntensity: 1.4 });
const bombBallMat = new THREE.MeshStandardMaterial({ color: BLOCK.bomb, emissive: C.brick, emissiveIntensity: 0.7 });
/** The bomb brick's glowing core, shared so every bomb pulses together. */
const bombCoreMat = new THREE.MeshStandardMaterial({ color: C.brick, emissive: C.brick, emissiveIntensity: 1 });

// Rockets and their launchers at the paddle's ends.
const rocketGeo = box(0.24, 0.62, 0.24, 0.08);
const rocketMat = new THREE.MeshStandardMaterial({ color: C.ink, emissive: C.brick, emissiveIntensity: 0.35 });
const launchers = [-1, 1].map((side) => {
  const m = solid(box(0.42, 0.5, PADDLE.d * 0.8, 0.08), mat(C.lineStrong));
  m.userData.side = side;
  m.visible = false;
  scene.add(m);
  return m;
});
let rockets = [];

// Explosions: a ring that grows and fades, a flash of light.
const ringGeo = new THREE.RingGeometry(0.7, 1, 56);
const rings = [];
const flashes = [0, 1].map(() => {
  const l = new THREE.PointLight(0xffa060, 0, 14, 2);
  scene.add(l);
  return l;
});
let flashIndex = 0;
/** Explosions waiting to go off: a chain of bombs goes one after another. */
let pending = [];
/** Small cubes left behind by balls and rockets. */
const ghostGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const ghostMats = {
  ball: new THREE.MeshBasicMaterial({ color: C.lineStrong }),
  fire: new THREE.MeshBasicMaterial({ color: C.brick }),
  bomb: new THREE.MeshBasicMaterial({ color: '#7a3a22' }),
  rocket: new THREE.MeshBasicMaterial({ color: BLOCK.amber }),
};
const ghosts = [];
const ghostPool = [];

// Everything that belongs to a level lives in `world`.
const world = new THREE.Group();
scene.add(world);
let solids = [];
let agents = [];
const dying = [];

// ---------------------------------------------------------------- game state

const game = {
  state: 'menu', // menu (a demo plays behind it) · play · sleep · clear · over
  demo: true,
  level: 0,
  score: 0,
  lives: LIVES,
  speed: 13,
  largeT: 0,
  fireT: 0,
  bombHits: 0,
  rocketsT: 0,
  rocketCd: 0,
  rocketSide: 1,
  combo: 0,
  endgame: false,
  clearT: 0,
  launchT: 0,
  shake: 0,
  time: 0,
  best: readBest(),
};
const keys = { left: false, right: false };
/** `?autoplay`: the demo's autopilot plays a real game too. */
const AUTOPLAY = new URLSearchParams(location.search).has('autoplay');

// ---------------------------------------------------------------- levels

function buildLevel(index) {
  for (const child of [...world.children]) world.remove(child);
  for (const d of dying.splice(0)) scene.remove(d.mesh);
  for (const r of rockets) scene.remove(r.mesh);
  solids = [];
  agents = [];
  rockets = [];
  pending = [];
  game.endgame = false;
  const def = LEVELS[index % LEVELS.length];
  const bombs = new Set(def.bombs ?? []);
  const openings = [];
  if (def.mark) {
    const w = MARK_BOX.width * MARK_S;
    const h = MARK_BOX.height * MARK_S;
    const x = colX(def.mark.col);
    const top = rowTop(def.mark.row);
    openings.push({ x0: x - w / 2, x1: x + w / 2, top, bottom: top - h });
    addMark(x, top - h / 2);
  }
  for (const a of def.agents ?? []) {
    const w = BOT_BOX.width * AGENT_S;
    const h = BOT_BOX.height * AGENT_S;
    const x = colX(a.col);
    const top = rowTop(a.row);
    openings.push({ x0: x - w / 2, x1: x + w / 2, top, bottom: top - h });
    addAgent(x, top - h / 2, a.tool);
  }
  // Running bond: odd rows shift by half a brick and end in half bricks. Bricks that meet an
  // opening are cut around it, as a mason would.
  for (let r = 0; r < def.rows; r++) {
    const top = rowTop(r);
    const bottom = top - BRICK.h;
    const shift = r % 2 ? -PITCH_X / 2 : 0;
    for (let c = 0; c <= COLS; c++) {
      const x0 = Math.max(-HALF, -HALF + c * PITCH_X + shift);
      const x1 = Math.min(HALF, -HALF + c * PITCH_X + shift + BRICK.w);
      if (x1 - x0 < MIN_PIECE) continue;
      let kind = bombs.has(`${r}:${c}`) ? { color: 'bomb', hits: 1, bomb: true } : def.brick(r, c, (x0 + x1) / 2);
      if (!kind) continue;
      if (typeof kind === 'string') kind = { color: kind, hits: 1 };
      let pieces = [[x0, x1]];
      for (const o of openings) {
        if (o.bottom >= top - 0.01 || o.top <= bottom + 0.01) continue;
        pieces = pieces.flatMap(([a, b]) => cut(a, b, o.x0 - BRICK.gap, o.x1 + BRICK.gap));
      }
      for (const [a, b] of pieces) if (b - a >= MIN_PIECE) addBrick(a, b, top, kind, r);
    }
  }
  game.speed = Math.min(14.5 + index * 1.2, 22);
}

function cut(a, b, c0, c1) {
  if (c1 <= a || c0 >= b) return [[a, b]];
  const out = [];
  if (c0 > a) out.push([a, c0]);
  if (c1 < b) out.push([c1, b]);
  return out;
}

function addBrick(x0, x1, top, kind, row) {
  const w = x1 - x0;
  const color = BLOCK[kind.color];
  const tough = kind.hits > 1;
  const material = tough ? mat(color).clone() : mat(color);
  if (tough) {
    // Lights up for a moment when hit (see `animate`).
    material.emissive.set(C.ink);
    material.emissiveIntensity = 0;
  }
  const mesh = solid(box(w, BRICK.h, BRICK.d), material);
  const x = (x0 + x1) / 2;
  const y = top - BRICK.h / 2;
  mesh.position.set(x, y, 0);
  if (kind.bomb) {
    const core = new THREE.Mesh(box(Math.min(0.7, w * 0.4), 0.34, 0.12, 0.05), bombCoreMat);
    core.position.z = BRICK.d / 2 + 0.02;
    mesh.add(core);
  }
  world.add(mesh);
  solids.push({
    type: 'brick',
    mesh,
    x,
    y,
    w,
    h: BRICK.h,
    hits: kind.hits,
    max: kind.hits,
    color: kind.bomb ? C.brick : color,
    bomb: !!kind.bomb,
    row,
    alive: true,
    flash: 0,
  });
}

/** The B: three brick-orange pieces, lit, three hits each. */
function addMark(cx, cy) {
  for (const rect of MARK) {
    const o = offset(rect, MARK_BOX);
    const w = rect.width * MARK_S;
    const h = rect.height * MARK_S;
    const material = new THREE.MeshStandardMaterial({
      color: C.brick,
      emissive: C.brick,
      emissiveIntensity: 0.45,
      roughness: 0.4,
    });
    const mesh = solid(box(w, h, BRICK.d + 0.2, 0.12), material);
    const x = cx + o.x * MARK_S;
    const y = cy + o.y * MARK_S;
    mesh.position.set(x, y, 0.1);
    world.add(mesh);
    solids.push({ type: 'mark', mesh, x, y, w, h, hits: 3, max: 3, color: C.brick, row: 3, alive: true, flash: 0 });
  }
}

/** An agent asleep in the wall: the bot, eyes shut. */
function addAgent(x, y, tool) {
  const s = AGENT_S;
  const group = new THREE.Group();
  group.position.set(x, y, 0);
  const head = solid(box(BOT.head.width * s, BOT.head.height * s, BRICK.d), new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.5 }));
  const ho = offset(BOT.head, BOT_BOX);
  head.position.set(ho.x * s, ho.y * s, 0);
  // Asleep, nothing tells which power an agent holds; its antenna takes the power's colour on waking.
  const antennaMat = new THREE.MeshStandardMaterial({ color: C.lineStrong, emissive: C.brick, emissiveIntensity: 0, roughness: 0.5 });
  const antenna = solid(box(BOT.antenna.width * s, BOT.antenna.height * s, 0.4, 0.05), antennaMat);
  const ao = offset(BOT.antenna, BOT_BOX);
  antenna.position.set(ao.x * s, ao.y * s, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: C.kiln });
  const eyes = BOT.eyes.map((e) => {
    const eo = offset(e, BOT_BOX);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(e.width * s, e.height * s, 0.04), eyeMat);
    eye.position.set(eo.x * s, eo.y * s, BRICK.d / 2 + 0.01);
    eye.userData.x = eo.x * s;
    return eye;
  });
  group.add(head, antenna, ...eyes);
  world.add(group);
  const agent = {
    group,
    eyes,
    antennaMat,
    label: null,
    tool,
    state: 'asleep', // asleep · awake · caught · gone
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    t: 0,
    open: 0,
    w: BOT_BOX.width * s,
    h: BOT_BOX.height * s,
    trail: null,
  };
  agents.push(agent);
  solids.push({ type: 'agent', agent, x, y, w: agent.w, h: agent.h, alive: true, flash: 0 });
}

// ---------------------------------------------------------------- balls

function addBall(x, y, vx, vy, stuck = false) {
  const mesh = solid(ballGeo, ballMat);
  mesh.receiveShadow = false;
  scene.add(mesh);
  const ball = { mesh, x, y, vx, vy, stuck, dead: false };
  balls.push(ball);
  return ball;
}

function resetBalls() {
  for (const b of balls) scene.remove(b.mesh);
  balls = [];
  addBall(paddle.x, PADDLE.y + PADDLE.h / 2 + R + 0.02, 0, 0, true);
  paddle.scaleTarget = 1;
  game.largeT = 0;
  game.fireT = 0;
  game.bombHits = 0;
  game.rocketsT = 0;
  game.launchT = 0;
  game.combo = 0;
  renderCombo();
}

function launch(ball) {
  const a = (Math.random() - 0.5) * 0.7;
  ball.stuck = false;
  ball.vx = game.speed * Math.sin(a);
  ball.vy = game.speed * Math.cos(a);
}

/** Every ball forks into three, up to MAX_BALLS. */
function forkBalls() {
  for (const b of [...balls]) {
    if (b.stuck) launch(b);
    const a = Math.atan2(b.vx, b.vy);
    for (const da of [-0.38, 0.38]) {
      if (balls.length >= MAX_BALLS) return;
      addBall(b.x, b.y, game.speed * Math.sin(a + da), game.speed * Math.cos(a + da));
    }
  }
}

/** Keeps a ball at the game's speed and off near-horizontal paths, which take forever. */
function settle(b) {
  const sp = game.speed;
  if (Math.abs(b.vy) < 0.3 * sp) b.vy = (Math.sign(b.vy) || 1) * 0.3 * sp;
  const n = Math.hypot(b.vx, b.vy) || 1;
  b.vx = (b.vx / n) * sp;
  b.vy = (b.vy / n) * sp;
}

function moveBall(b, dt) {
  if (b.stuck) {
    b.x = paddle.x;
    b.y = PADDLE.y + PADDLE.h / 2 + R + 0.02;
    return;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x < FIELD.left + R) {
    b.x = FIELD.left + R;
    b.vx = Math.abs(b.vx);
    sound.wall();
  } else if (b.x > FIELD.right - R) {
    b.x = FIELD.right - R;
    b.vx = -Math.abs(b.vx);
    sound.wall();
  }
  if (b.y > FIELD.top - R) {
    b.y = FIELD.top - R;
    b.vy = -Math.abs(b.vy);
    sound.wall();
  }
  if (b.y < FIELD.bottom) {
    b.dead = true;
    return;
  }

  // The paddle sends the ball off at an angle that follows where it hit: the edges, up to 60°.
  const pw = paddleWidth();
  if (
    b.vy < 0 &&
    b.y - R <= PADDLE.y + PADDLE.h / 2 &&
    b.y + R >= PADDLE.y - PADDLE.h / 2 &&
    b.x + R >= paddle.x - pw / 2 &&
    b.x - R <= paddle.x + pw / 2
  ) {
    const t = clamp((b.x - paddle.x) / (pw / 2), -1, 1);
    const a = t * 1.05;
    b.vx = game.speed * Math.sin(a);
    b.vy = game.speed * Math.cos(a);
    b.y = PADDLE.y + PADDLE.h / 2 + R;
    paddle.squash = 1;
    game.speed = Math.min(game.speed + 0.12, 24);
    if (game.combo) {
      game.combo = 0;
      renderCombo();
    }
    sound.paddle();
    return;
  }

  // A fireball goes through everything it touches.
  if (game.fireT > 0) {
    for (const s of solids) {
      if (!s.alive) continue;
      if (Math.abs(b.x - s.x) > s.w / 2 + R || Math.abs(b.y - s.y) > s.h / 2 + R) continue;
      damage(s, 99);
    }
    return;
  }

  // One brick per step: the nearest one the ball overlaps.
  let hit = null;
  let best = R * R;
  for (const s of solids) {
    if (!s.alive) continue;
    if (Math.abs(b.x - s.x) > s.w / 2 + R || Math.abs(b.y - s.y) > s.h / 2 + R) continue;
    const dx = b.x - clamp(b.x, s.x - s.w / 2, s.x + s.w / 2);
    const dy = b.y - clamp(b.y, s.y - s.h / 2, s.y + s.h / 2);
    const d2 = dx * dx + dy * dy;
    if (d2 < best || (d2 === 0 && !hit)) {
      best = d2;
      hit = { s, dx, dy };
    }
  }
  if (!hit) return;
  const { s } = hit;
  let { dx, dy } = hit;
  if (dx === 0 && dy === 0) {
    const px = s.w / 2 - Math.abs(b.x - s.x);
    const py = s.h / 2 - Math.abs(b.y - s.y);
    if (px < py) dx = Math.sign(b.x - s.x) || 1;
    else dy = Math.sign(b.y - s.y) || 1;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    b.vx = Math.sign(dx) * Math.abs(b.vx);
    b.x = s.x + Math.sign(dx) * (s.w / 2 + R);
  } else {
    b.vy = Math.sign(dy) * Math.abs(b.vy);
    b.y = s.y + Math.sign(dy) * (s.h / 2 + R);
  }
  settle(b);
  damage(s);
  if (game.bombHits > 0 && s.type !== 'agent') {
    game.bombHits -= 1;
    explode(b.x, b.y, BLAST.ball);
  }
}

/** Takes `n` hits off a brick; an agent wakes; a broken bomb brick goes off a moment later. */
function damage(s, n = 1) {
  if (!s.alive) return;
  if (s.type === 'agent') {
    s.alive = false;
    wake(s.agent);
    return;
  }
  s.hits -= n;
  s.flash = 1;
  if (s.hits > 0) {
    const left = s.hits / s.max;
    if (s.type === 'mark') {
      s.mesh.material.color.set(C.brick).multiplyScalar(0.55 + 0.45 * left);
      sound.mark();
    } else {
      s.mesh.material.color.set(s.color).multiplyScalar(0.6 + 0.4 * left);
      sound.tough();
    }
    addScore(10);
    return;
  }
  s.alive = false;
  dying.push({ mesh: s.mesh, t: 0 });
  burst(s.x, s.y, s.color, s.type === 'mark' ? 22 : 9, s.type === 'mark' ? 1.6 : 1);
  game.shake = Math.min(0.5, game.shake + (s.type === 'mark' ? 0.4 : 0.12));
  if (s.type === 'mark') sound.clear();
  else sound.brick(s.row);
  game.combo += 1;
  addScore((s.type === 'mark' ? 250 : 50 * s.max) * comboMultiplier());
  renderCombo();
  if (s.bomb) pending.push({ x: s.x, y: s.y, r: BLAST.bomb, t: 0.12 });
}

/** Every 6 bricks in a row without touching the paddle add one to the multiplier, up to 5. */
const comboMultiplier = () => Math.min(5, 1 + Math.floor(game.combo / 6));

/** Breaks what is within `r` (the B loses one hit), wakes agents, sets off other bombs. */
function explode(x, y, r) {
  const big = r > 2;
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: '#ff8a4a', transparent: true, opacity: 1, depthWrite: false }),
  );
  ring.position.set(x, y, BRICK.d / 2 + 0.3);
  scene.add(ring);
  rings.push({ mesh: ring, r, t: 0 });
  const flash = flashes[flashIndex++ % flashes.length];
  flash.position.set(x, y, 2.5);
  flash.intensity = big ? 90 : 40;
  burst(x, y, C.brick, big ? 18 : 8, big ? 1.8 : 1.1);
  burst(x, y, BLOCK.amber, big ? 10 : 4, big ? 1.4 : 0.9);
  game.shake = Math.min(1, game.shake + (big ? 0.55 : 0.2));
  if (big) sound.boom();
  else sound.pop();
  for (const s of solids) {
    if (!s.alive) continue;
    const dx = Math.max(Math.abs(x - s.x) - s.w / 2, 0);
    const dy = Math.max(Math.abs(y - s.y) - s.h / 2, 0);
    if (dx * dx + dy * dy > r * r) continue;
    damage(s, s.type === 'mark' ? 1 : 99);
  }
}

// ---------------------------------------------------------------- agents

function wake(a) {
  a.state = 'awake';
  a.t = 0;
  a.vx = (Math.random() - 0.5) * 1.6;
  a.vy = 0;
  const tint = a.tool === 'bomb' ? C.brick : ICONS[a.tool].bg;
  a.antennaMat.color.set(tint);
  a.antennaMat.emissive.set(tint);
  a.label = powerTag(a.tool);
  // Resting on the antenna's tip.
  a.label.position.set(0, a.h / 2 + a.label.userData.h / 2 - 0.02, 0.3);
  a.group.add(a.label);
  a.trail = makeTrail();
  burst(a.x, a.y, C.ink, 6, 0.8);
  sound.wake();
  addScore(100);
}

function stepAgents(dt) {
  for (const a of agents) {
    if (a.state === 'awake') {
      a.t += dt;
      if (a.t < 0.4) {
        // Out of the wall, towards the camera, then down.
        a.z = 2.4 * (1 - (1 - a.t / 0.4) ** 3);
        a.y += 1.2 * dt;
      } else {
        a.vy = Math.max(a.vy - 9 * dt, -4.6);
        a.y += a.vy * dt;
        a.x += a.vx * dt + Math.sin(a.t * 3) * 0.9 * dt;
        a.x = clamp(a.x, FIELD.left + a.w / 2, FIELD.right - a.w / 2);
      }
      const pw = paddleWidth();
      if (Math.abs(a.x - paddle.x) < pw / 2 + a.w * 0.4 && Math.abs(a.y - PADDLE.y) < a.h / 2 + PADDLE.h / 2) {
        a.state = 'caught';
        a.t = 0;
        runTool(a.tool, a);
      } else if (a.y < FIELD.bottom - 1) {
        a.state = 'gone';
      }
      sampleTrail(a, dt);
    } else if (a.state === 'caught') {
      a.t += dt;
      a.x += (paddle.x - a.x) * Math.min(1, dt * 14);
      a.y += (PADDLE.y - a.y) * Math.min(1, dt * 14);
      a.group.scale.setScalar(Math.max(0.001, 1 - a.t / 0.25));
      if (a.t >= 0.25) a.state = 'gone';
      sampleTrail(a, dt);
    }
  }
  for (const a of agents) {
    if (a.state !== 'gone') continue;
    world.remove(a.group);
    if (a.trail) world.remove(a.trail.points);
  }
  agents = agents.filter((a) => a.state !== 'gone');
}

function runTool(tool, from) {
  sound.catch();
  addScore(250);
  const def = TOOLS[tool];
  if (tool === 'fork') forkBalls();
  if (tool === 'large') {
    paddle.scaleTarget = 1.4;
    game.largeT = def.seconds;
  }
  if (tool === 'bomb') game.bombHits = def.hits;
  if (tool === 'rockets') {
    game.rocketsT = def.seconds;
    game.rocketCd = 0;
  }
  if (tool === 'fire') {
    game.fireT = def.seconds;
    sound.fire();
  }
  let flash = tool === 'fork' ? '×3' : null;
  if (tool === 'start' && !game.demo) {
    if (game.lives < LIVES) {
      game.lives += 1;
      renderHud();
      flash = '+1';
    } else {
      flash = '+500';
      addScore(500);
    }
  }
  if (!game.demo) showPower(tool, from, flash);
}

// The agent leaves a dotted curve behind it, in the wall's neutral grey.
const TRAIL = 28;
const trailMat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, sizeAttenuation: true });
const trailNew = new THREE.Color(C.inkMuted);
const trailOld = new THREE.Color(C.surface);
function makeTrail() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
  g.setDrawRange(0, 0);
  const points = new THREE.Points(g, trailMat);
  points.frustumCulled = false;
  world.add(points);
  return { points, pts: [], acc: 0 };
}
function sampleTrail(a, dt) {
  const tr = a.trail;
  tr.acc += dt;
  if (tr.acc < 0.045) return;
  tr.acc = 0;
  tr.pts.unshift([a.x, a.y + a.h / 2 + 0.05, a.z - 0.3]);
  if (tr.pts.length > TRAIL) tr.pts.pop();
  const pos = tr.points.geometry.attributes.position;
  const col = tr.points.geometry.attributes.color;
  const c = new THREE.Color();
  tr.pts.forEach((p, i) => {
    pos.setXYZ(i, p[0], p[1], p[2]);
    c.lerpColors(trailNew, trailOld, i / TRAIL);
    col.setXYZ(i, c.r, c.g, c.b);
  });
  pos.needsUpdate = true;
  col.needsUpdate = true;
  tr.points.geometry.setDrawRange(0, tr.pts.length);
}

/**
 * The tag over a woken agent: the power's icon and name on a block of its colour, with a darker
 * lip under it, like the cards down the side.
 */
const tagTextures = new Map();
function powerTag(tool) {
  let tex = tagTextures.get(tool);
  if (!tex) {
    const font = '700 44px "Bricolage Grotesque", system-ui, sans-serif';
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = font;
    const h = 76;
    const lip = 8;
    const icon = 44;
    const w = Math.ceil(ctx.measureText(TOOLS[tool].label).width) + icon + 52;
    c.width = w;
    c.height = h + lip;
    const bg = ICONS[tool].bg;
    ctx.fillStyle = shade(bg, tool === 'bomb' ? 0.5 : 0.45);
    ctx.beginPath();
    ctx.roundRect(0, lip, w, h, 14);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 14);
    ctx.fill();
    if (tool === 'bomb') {
      // Dark on the dark field: an orange edge keeps it readable.
      ctx.strokeStyle = C.brick;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(2, 2, w - 4, h - 4, 12);
      ctx.stroke();
    }
    drawIcon(ctx, tool, 16, (h - icon) / 2, icon);
    ctx.font = font;
    ctx.fillStyle = textOn(tool);
    ctx.textBaseline = 'middle';
    ctx.fillText(TOOLS[tool].label, icon + 28, h / 2 + 2);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.userData = { w: c.width, h: c.height };
    tagTextures.set(tool, tex);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const height = 0.92;
  sprite.userData = { w: (tex.userData.w / tex.userData.h) * height, h: height };
  sprite.scale.set(0.001, 0.001, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// ---------------------------------------------------------------- particles

const partGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const parts = [];
const partPool = [];
function burst(x, y, color, n, spread) {
  for (let i = 0; i < n && parts.length < 400; i++) {
    const mesh = partPool.pop() ?? new THREE.Mesh(partGeo);
    mesh.material = mat(color);
    mesh.position.set(x + (Math.random() - 0.5) * 1.2, y + (Math.random() - 0.5) * 0.4, 0.3);
    mesh.scale.setScalar(0.6 + Math.random() * 0.8);
    scene.add(mesh);
    parts.push({
      mesh,
      vx: (Math.random() - 0.5) * 7 * spread,
      vy: Math.random() * 5 * spread + 1,
      vz: Math.random() * 6 + 2,
      life: 0.6 + Math.random() * 0.5,
      size: mesh.scale.x,
      t: 0,
    });
  }
}

function ghost(x, y, kind, size) {
  if (ghosts.length > 300) return;
  const mesh = ghostPool.pop() ?? new THREE.Mesh(ghostGeo);
  mesh.material = ghostMats[kind];
  mesh.position.set(x, y, -0.1);
  mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  scene.add(mesh);
  ghosts.push({ mesh, t: 0, life: 0.28, size: size / 0.3 });
}

// ---------------------------------------------------------------- the loop

function step(dt) {
  game.time += dt;
  if (keys.left || keys.right) paddle.target += ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 30 * dt;
  if (game.demo || AUTOPLAY) autopilot(dt);
  const lim = FIELD.right - paddleWidth() / 2;
  paddle.target = clamp(paddle.target, -lim, lim);
  const ms = 50 * dt;
  paddle.x = clamp(paddle.x + clamp(paddle.target - paddle.x, -ms, ms), -lim, lim);
  paddle.scale += (paddle.scaleTarget - paddle.scale) * Math.min(1, dt * 8);
  if (game.largeT > 0) {
    game.largeT -= dt;
    if (game.largeT <= 0) paddle.scaleTarget = 1;
  }

  if (game.fireT > 0) game.fireT -= dt;
  stepRockets(dt);
  for (const p of pending) {
    p.t -= dt;
    if (p.t <= 0) explode(p.x, p.y, p.r);
  }
  pending = pending.filter((p) => p.t > 0);

  const left = solids.filter((s) => s.alive && s.type !== 'agent');
  if (left.length && left.length <= ENDGAME) {
    if (!game.endgame && !game.demo) toast(`${left.length} bricks left`, 'the balls go after them');
    game.endgame = true;
    for (const b of balls) if (!b.stuck) steer(b, left, dt);
  }

  for (const b of balls) moveBall(b, dt);
  for (const b of balls) if (b.dead) scene.remove(b.mesh);
  balls = balls.filter((b) => !b.dead);
  stepAgents(dt);

  if (!balls.length) {
    lostBalls();
    return;
  }
  if (!solids.some((s) => s.alive && s.type !== 'agent')) wallDown();
}

/** Turns a ball a little towards the nearest brick left, so the last few do not take forever. */
function steer(b, left, dt) {
  let near = left[0];
  let nd = Number.POSITIVE_INFINITY;
  for (const s of left) {
    const d = (s.x - b.x) ** 2 + (s.y - b.y) ** 2;
    if (d < nd) {
      nd = d;
      near = s;
    }
  }
  const cur = Math.atan2(b.vy, b.vx);
  let turn = Math.atan2(near.y - b.y, near.x - b.x) - cur;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const a = cur + clamp(turn, -1.6 * dt, 1.6 * dt);
  b.vx = game.speed * Math.cos(a);
  b.vy = game.speed * Math.sin(a);
}

/** While the paddle has rockets, it fires from each end in turn; a rocket blows up what it hits. */
function stepRockets(dt) {
  if (game.rocketsT > 0) {
    game.rocketsT -= dt;
    game.rocketCd -= dt;
    if (game.rocketCd <= 0 && balls.some((b) => !b.stuck)) {
      game.rocketCd = 0.3;
      game.rocketSide = -game.rocketSide;
      const mesh = solid(rocketGeo, rocketMat);
      const x = paddle.x + game.rocketSide * (paddleWidth() / 2 - 0.25);
      const y = PADDLE.y + PADDLE.h / 2 + 0.3;
      mesh.position.set(x, y, 0);
      scene.add(mesh);
      rockets.push({ mesh, x, y, dead: false, trail: 0 });
      sound.rocket();
    }
  }
  for (const r of rockets) {
    r.y += 26 * dt;
    if (r.y > FIELD.top) {
      r.dead = true;
      burst(r.x, FIELD.top - 0.3, C.inkFaint, 4, 0.6);
      continue;
    }
    for (const s of solids) {
      if (!s.alive) continue;
      if (Math.abs(r.x - s.x) < s.w / 2 + 0.12 && Math.abs(r.y - s.y) < s.h / 2 + 0.31) {
        r.dead = true;
        explode(r.x, r.y + 0.2, BLAST.rocket);
        break;
      }
    }
  }
  for (const r of rockets) if (r.dead) scene.remove(r.mesh);
  rockets = rockets.filter((r) => !r.dead);
}

/**
 * The menu's demo: the paddle follows the lowest falling ball, slightly off centre to vary the
 * angles, and goes for a falling agent while no ball is close.
 */
function autopilot(dt) {
  let low = null;
  for (const b of balls) if (b.stuck || (b.vy < 0 && (!low || b.y < low.y))) low = b;
  if (low?.stuck) {
    game.launchT += dt;
    if (game.launchT > 0.9) {
      launch(low);
      game.launchT = 0;
    }
  }
  const agent = agents.find((a) => a.state === 'awake' && a.t > 0.4);
  if (agent && (!low || low.y > agent.y + 3)) paddle.target = agent.x;
  else if (low) paddle.target = low.x + Math.sin(game.time * 0.7) * 1.3;
}

function lostBalls() {
  if (game.demo) {
    resetBalls();
    return;
  }
  game.lives -= 1;
  sound.lose();
  renderHud();
  if (game.lives <= 0) gameOver();
  else resetBalls();
}

function wallDown() {
  if (game.demo) {
    buildLevel(0);
    resetBalls();
    return;
  }
  sound.clear();
  game.state = 'clear';
  game.clearT = 1.8;
  for (const b of balls) {
    burst(b.x, b.y, C.ink, 5, 0.6);
    scene.remove(b.mesh);
  }
  balls = [];
  for (const r of rockets) scene.remove(r.mesh);
  rockets = [];
  game.rocketsT = 0;
  game.fireT = 0;
  game.bombHits = 0;
  game.largeT = 0;
  for (const a of agents) {
    burst(a.x, a.y, C.ink, 8, 1);
    a.state = 'gone';
  }
  stepAgents(0);
  banner('Wall down', `+${game.lives * 100} for the balls left`);
  addScore(game.lives * 100);
}

function nextLevel() {
  game.level += 1;
  buildLevel(game.level);
  // Each lap of the levels goes faster.
  game.speed = Math.min(game.speed + Math.floor(game.level / LEVELS.length) * 1.5, 22);
  resetBalls();
  game.state = 'play';
  renderHud();
  banner(`Level ${game.level + 1}`, LEVELS[game.level % LEVELS.length].name);
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'play' || game.state === 'menu') {
    acc += dt;
    while (acc >= DT && (game.state === 'play' || game.state === 'menu')) {
      step(DT);
      acc -= DT;
    }
  } else {
    acc = 0;
  }
  if (game.state === 'clear') {
    game.clearT -= dt;
    if (game.clearT <= 0) nextLevel();
  }
  animate(dt, now / 1000);
  renderer.render(scene, camera);
}

/** Everything that only shows: meshes follow the simulation, effects play out. */
function animate(dt, t) {
  paddle.squash = Math.max(0, paddle.squash - dt * 6);
  paddleMesh.position.x = paddle.x;
  paddleMesh.scale.set(paddle.scale * (1 + 0.05 * paddle.squash), 1 - 0.22 * paddle.squash, 1);

  const look = game.fireT > 0 ? 'fire' : game.bombHits > 0 ? 'bomb' : 'ball';
  const moving = game.state === 'play' || game.state === 'menu';
  for (const b of balls) {
    b.mesh.position.set(b.x, b.y, 0);
    b.mesh.material = look === 'fire' ? fireMat : look === 'bomb' ? bombBallMat : ballMat;
    if (!b.stuck && moving) {
      b.mesh.rotation.x -= b.vy * dt * 0.5;
      b.mesh.rotation.y += b.vx * dt * 0.5;
      b.trail = (b.trail ?? 0) + dt;
      if (b.trail > 0.02) {
        b.trail = 0;
        ghost(b.x, b.y, look, look === 'ball' ? 0.22 : 0.35);
      }
    }
  }
  for (const r of rockets) {
    r.mesh.position.set(r.x, r.y, 0);
    r.trail += dt;
    if (r.trail > 0.015) {
      r.trail = 0;
      ghost(r.x, r.y - 0.4, 'rocket', 0.28);
    }
  }
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i];
    g.t += dt;
    g.mesh.scale.setScalar(Math.max(0.001, g.size * (1 - g.t / g.life)));
    if (g.t >= g.life) {
      scene.remove(g.mesh);
      ghostPool.push(g.mesh);
      ghosts.splice(i, 1);
    }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    const k = Math.min(1, r.t / 0.38);
    r.mesh.scale.setScalar(r.r * (0.25 + 0.75 * (1 - (1 - k) ** 3)));
    r.mesh.material.opacity = 1 - k * k;
    if (k >= 1) {
      scene.remove(r.mesh);
      r.mesh.material.dispose();
      rings.splice(i, 1);
    }
  }
  for (const f of flashes) f.intensity *= Math.exp(-dt * 9);
  renderPowers(dt);
  bombCoreMat.emissiveIntensity = 0.7 + 0.5 * Math.sin(t * 7);
  for (const l of launchers) {
    l.visible = game.rocketsT > 0;
    l.position.set(paddle.x + l.userData.side * (paddleWidth() / 2 - 0.25), PADDLE.y + PADDLE.h / 2 + 0.2, 0);
  }
  ballLights.forEach((l, i) => {
    const b = balls[i];
    l.intensity = b ? 7 : 0;
    if (b) l.position.set(b.x, b.y, 1.4);
  });

  for (const s of solids) {
    if (s.flash <= 0 || !s.alive || s.type === 'agent') continue;
    s.flash = Math.max(0, s.flash - dt * 5);
    s.mesh.scale.setScalar(1 + 0.07 * s.flash);
    if (s.type === 'mark') s.mesh.material.emissiveIntensity = 0.15 + 0.3 * (s.hits / s.max) + 0.8 * s.flash;
    else if (s.max > 1) s.mesh.material.emissiveIntensity = 0.5 * s.flash;
  }

  for (let i = dying.length - 1; i >= 0; i--) {
    const d = dying[i];
    d.t += dt;
    const k = d.t / 0.14;
    d.mesh.position.z += dt * 8;
    d.mesh.scale.setScalar(Math.max(0.001, 1 - k));
    if (k >= 1) {
      d.mesh.parent?.remove(d.mesh);
      dying.splice(i, 1);
    }
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    p.vy -= 18 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += dt * 6;
    p.mesh.rotation.y += dt * 4;
    p.mesh.scale.setScalar(Math.max(0.001, p.size * (1 - p.t / p.life)));
    if (p.t >= p.life) {
      scene.remove(p.mesh);
      partPool.push(p.mesh);
      parts.splice(i, 1);
    }
  }

  for (const a of agents) {
    a.group.position.set(a.x, a.y, a.z);
    let look = 0;
    if (a.state === 'asleep') {
      // Asleep, an agent peeks at a ball that comes close.
      let near = null;
      let nd = 5.5;
      for (const b of balls) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < nd) {
          nd = d;
          near = b;
        }
      }
      const want = near && game.state !== 'sleep' ? 0.7 : 0;
      a.open += (want - a.open) * Math.min(1, dt * 6);
      if (near) look = clamp((near.x - a.x) / 3, -1, 1);
    } else {
      a.open = a.t % 2.4 > 2.25 ? 0 : 1;
      look = Math.sin(a.t * 2.2);
      a.group.rotation.z = Math.sin(a.t * 5) * 0.14;
      // The tag pops up over the agent, with a little overshoot.
      const k = Math.min(1, a.t / 0.3);
      const pop = (1 + 0.3 * Math.sin(k * Math.PI)) * k;
      a.label.scale.set(a.label.userData.w * pop, a.label.userData.h * pop, 1);
      a.antennaMat.emissiveIntensity = 0.5 + 0.5 * Math.sin(a.t * 12);
    }
    for (const e of a.eyes) {
      e.scale.y = 1 / 3 + (2 / 3) * a.open;
      e.position.x = e.userData.x + look * AGENT_S;
    }
  }

  game.shake = Math.max(0, game.shake - dt * 2.5);
  const sx = (Math.random() - 0.5) * game.shake * 0.5;
  const sy = (Math.random() - 0.5) * game.shake * 0.5;
  const sway = game.state === 'menu' || game.state === 'over' ? Math.sin(t * 0.25) * 1.2 : paddle.x * 0.03;
  camera.position.copy(lookAt).addScaledVector(viewDir, viewDist);
  camera.position.x += sway + sx;
  camera.position.y += sy;
  camera.lookAt(lookAt.x + sway * 0.25, lookAt.y, 0);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const v = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  viewDist = Math.max(14.2 / v, 15.4 / (v * camera.aspect));
}

// ---------------------------------------------------------------- the page around the canvas

const $ = (id) => document.getElementById(id);
const screens = { menu: $('menu'), sleep: $('sleep'), over: $('over') };
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  document.body.dataset.state = game.state;
}

function addScore(n) {
  if (game.demo) return;
  game.score += n;
  renderHud();
}

function renderHud() {
  $('score').textContent = game.score.toLocaleString('en');
  $('lives').textContent = `${game.lives} / ${LIVES}`;
  $('level').textContent = String(game.level + 1);
}

// The powers you hold, down the left side: a block in the power's colour with its icon, its
// name, the time (or the bomb hits) left. One-off powers show for a moment, then go.
const powers = new Map();
const FLASH_S = 1.6;
const SEGMENTS = 10;
function showPower(tool, from, flash) {
  let p = powers.get(tool);
  if (!p) {
    const el = document.createElement('div');
    el.className = 'power';
    const bg = ICONS[tool].bg;
    el.style.setProperty('--bg', bg);
    el.style.setProperty('--lip', shade(bg, tool === 'bomb' ? 0.5 : 0.45));
    el.style.setProperty('--text', textOn(tool));
    el.style.setProperty('--seg', tool === 'bomb' ? C.brick : textOn(tool));
    if (tool === 'bomb') el.style.setProperty('--edge', C.brick);
    // A timer in segments that go out one by one, like bricks; the bomb ball has one per hit.
    const segs = TOOLS[tool].hits ?? SEGMENTS;
    el.innerHTML = `<div class="icon">${iconSvg(tool)}</div>
      <div class="info"><b>${TOOLS[tool].label}</b><div class="segs">${'<i></i>'.repeat(segs)}</div></div>
      <div class="count"></div>`;
    $('powers').append(el);
    p = {
      el,
      segs: [...el.querySelectorAll('.segs i')],
      text: el.querySelector('.count'),
      label: '',
      lit: -1,
    };
    powers.set(tool, p);
    // From the catch to its place in the column.
    const v = new THREE.Vector3(from.x, PADDLE.y, 0).project(camera);
    const box = el.getBoundingClientRect();
    const dx = ((v.x + 1) / 2) * window.innerWidth - (box.left + box.width / 2);
    const dy = ((1 - v.y) / 2) * window.innerHeight - (box.top + box.height / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1.6)`, opacity: 0.3 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ],
      { duration: 650, easing: 'cubic-bezier(.2, .9, .25, 1)' },
    );
  } else {
    p.el.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  }
  p.flash = flash ? FLASH_S : 0;
  if (flash) p.flashText = flash;
}

function renderPowers(dt) {
  const held = {
    fire: [game.fireT, TOOLS.fire.seconds],
    rockets: [game.rocketsT, TOOLS.rockets.seconds],
    large: [game.largeT, TOOLS.large.seconds],
    bomb: [game.bombHits, TOOLS.bomb.hits],
  };
  for (const [tool, p] of powers) {
    let frac;
    let label;
    let ending = false;
    if (held[tool]) {
      const [v, max] = held[tool];
      frac = clamp(v / max, 0, 1);
      label = tool === 'bomb' ? `×${v}` : `${Math.ceil(v)}<small>s</small>`;
      ending = tool !== 'bomb' && v < 2;
      if (v <= 0) frac = 0;
    } else {
      if (game.state === 'play') p.flash -= dt;
      frac = clamp(p.flash / FLASH_S, 0, 1);
      label = p.flashText;
    }
    if (frac <= 0) {
      powers.delete(tool);
      const el = p.el;
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
      continue;
    }
    const lit = Math.ceil(frac * p.segs.length - 0.001);
    if (lit !== p.lit) {
      p.lit = lit;
      p.segs.forEach((seg, i) => seg.classList.toggle('on', i < lit));
    }
    p.el.classList.toggle('ending', ending);
    if (label !== p.label) {
      p.label = label;
      p.text.innerHTML = label;
    }
  }
}

/** The menu's cards: each power's icon, name and what it does. */
function renderMenuPowers() {
  const cards = Object.entries(TOOLS).map(
    ([tool, t]) => `<li><span class="who"><span class="badge" style="background:${ICONS[tool].bg}">${iconSvg(tool)}</span></span>
      <span class="what"><b>${t.label}</b><span>${t.note}</span></span></li>`,
  );
  cards.push(`<li class="wide"><span class="who"><span class="bomb-brick"><i></i></span></span>
    <span class="what"><b>Dark brick</b><span>explodes, and sets off the ones next to it</span></span></li>`);
  $('tools').innerHTML = cards.join('');
}

function renderCombo() {
  const el = $('combo');
  if (!el) return;
  const show = !game.demo && game.combo >= 3;
  el.classList.toggle('show', show);
  if (show) {
    el.querySelector('b').textContent = String(game.combo);
    const m = comboMultiplier();
    el.querySelector('span').textContent = m > 1 ? `points ×${m}` : 'in a row';
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
}

let bannerTimer;
function banner(title, sub) {
  const el = $('banner');
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = sub;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

let toastTimer;
function toast(tool, note) {
  const el = $('toast');
  el.querySelector('b').textContent = tool;
  el.querySelector('span').textContent = note;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function start() {
  sound.unlock();
  game.demo = false;
  game.level = 0;
  game.score = 0;
  game.lives = LIVES;
  paddle.target = paddle.x = 0;
  buildLevel(0);
  resetBalls();
  game.state = 'play';
  show(null);
  renderHud();
  banner('Level 1', LEVELS[0].name);
}

function gameOver() {
  game.state = 'over';
  const best = game.score > game.best;
  if (best) {
    game.best = game.score;
    writeBest(game.score);
  }
  $('final').textContent = game.score.toLocaleString('en');
  $('best').textContent = best ? 'a new best' : `best ${game.best.toLocaleString('en')}`;
  show('over');
}

function sleep() {
  if (game.state !== 'play') return;
  game.state = 'sleep';
  show('sleep');
  $('pause').textContent = 'resume';
}
function wakeUp() {
  if (game.state !== 'sleep') return;
  game.state = 'play';
  last = performance.now();
  show(null);
  $('pause').textContent = 'pause';
}

/** Click, tap or space: whatever the moment calls for. */
function act() {
  sound.unlock();
  if (game.state === 'menu' || game.state === 'over') start();
  else if (game.state === 'sleep') wakeUp();
  else if (game.state === 'play') for (const b of balls) if (b.stuck) launch(b);
}

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2();
const onPlane = new THREE.Vector3();
function aim(e) {
  if (game.demo || AUTOPLAY) return;
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, onPlane)) paddle.target = onPlane.x;
}
window.addEventListener('pointermove', aim);
canvas.addEventListener('pointerdown', (e) => {
  aim(e);
  if (game.state === 'play' || game.state === 'sleep') act();
});
for (const el of document.querySelectorAll('[data-action]')) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    act();
  });
}
window.addEventListener('keydown', (e) => {
  if (e.repeat && (e.code === 'Space' || e.code === 'KeyP')) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    act();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.state === 'play') sleep();
    else wakeUp();
  } else if (e.code === 'KeyM') toggleSound();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});
// A game nobody watches sleeps, like a briq nobody uses.
document.addEventListener('visibilitychange', () => document.hidden && sleep());
window.addEventListener('blur', sleep);
window.addEventListener('resize', resize);

function toggleSound() {
  const muted = sound.toggle();
  $('mute').textContent = muted ? 'sound off' : 'sound on';
}
$('pause').addEventListener('click', (e) => {
  e.stopPropagation();
  if (game.state === 'play') sleep();
  else wakeUp();
});
$('mute').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSound();
});

function readBest() {
  try {
    return Number(localStorage.getItem('briq-wall-best')) || 0;
  } catch {
    return 0;
  }
}
function writeBest(n) {
  try {
    localStorage.setItem('briq-wall-best', String(n));
  } catch {}
}

// A handle for checking the game from the console, with `?autoplay` only.
if (AUTOPLAY) {
  window.wall = {
    game,
    get balls() {
      return balls;
    },
    get agents() {
      return agents;
    },
    get left() {
      return solids.filter((s) => s.alive && s.type !== 'agent').length;
    },
    /** Runs the game for `seconds` without waiting for frames. */
    advance(seconds) {
      for (let i = 0; i < seconds / DT && (game.state === 'play' || game.state === 'menu'); i++) step(DT);
      animate(DT, performance.now() / 1000);
      renderer.render(scene, camera);
    },
    next: () => nextLevel(),
    get rings() {
      return rings.length;
    },
  };
}

renderMenuPowers();
// The agents' tags are drawn on canvas, in the display font.
document.fonts?.load('700 44px "Bricolage Grotesque"').catch(() => {});
resize();
buildLevel(0);
resetBalls();
show('menu');
requestAnimationFrame(frame);
