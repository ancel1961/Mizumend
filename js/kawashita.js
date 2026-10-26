/* ================================================================
   Mizumend · the Kawashita prologue, "Two Lamps" (v13.1).
   A new game begins downriver, in Kawashita, in winter, the night Kiyo dies. Fixed beat 1: her mother's death
   starts the journey.
     1. The last ferry of the night. Aoi sculls Kiyo across (tap E with the song); Kiyo sings the downstream verse.
        Her lamp is lit in the window: "Habit. Somebody's always out late."
     2. Home past Toma's boatshed. Kiyo's last evening by the hearth: small, quiet and funny, then not. She asks for
        the song; Aoi can't reach the last line, and Kiyo finishes it in a whisper. The basket: "Take it home.
        Upriver." "This is home." Kiyo doesn't answer. The lamp burns until morning, then goes out.
     3. The funeral on the hill. Toma offers to come. "Go home, Toma." (The first time she sends him away.)
     4. Kiyo's ferry box: her revolver, and its memory (a bear on the landing, one shot in the air, an hour of laughing).
     5. Dawn. The ferry upriver, alone, with the basket. A small boat follows, badly hidden.
   Then Mill Pond, as before. Saves from before v13.1 count the prologue as played. #kawa=1 plays it anyway,
   #kawa=0 skips it; Esc twice skips it in the game. Debug: window.__mzk (jump('ferry'|'home'|'evening'|'funeral'|'box'|'dawn'|'end')).
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
import { loadCast } from './cast.js';
const { HOOKS, scene, camera, player, cam, S, PARAMS, makeToon, addOutline, clamp, lerp, damp, rr, G, $, SFX, AU, INTERACTS, toast, showCardBrief } = MZ;

const KZ = 1000;                         /* Kawashita sits far downriver: world z = KZ + w */
const TAU = Math.PI * 2;
const K = { on: false, gen: 0, step: '', t: 0, cast: {}, root: new THREE.Group(), shot: null, shotK: 0, saved: null, obj: '', flags: {} };
MZ.kawa = K;
if (PARAMS.debug === '1' || PARAMS.debug === 'true') window.__mzk = K;
const W = (u, w, y = 0) => new THREE.Vector3(u, y, KZ + w);

/* ---------- ground ---------- */
function hsh(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hsh(xi, yi), hsh(xi + 1, yi), u), lerp(hsh(xi, yi + 1), hsh(xi + 1, yi + 1), u), v); }
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function kH(u, w) {
  const aw = Math.abs(w);
  let h;
  if (aw < 9) h = -1.9 + 0.6 * (aw / 9) ** 2;
  else if (aw < 14) h = lerp(-1.3, 0.55, sm(9, 14, aw));
  else h = 0.55;
  const n = vn(u * 0.06 + 3, w * 0.06 - 2) * 0.6 + vn(u * 0.17, w * 0.17) * 0.25;
  if (w > 14) h += (w - 14) * 0.035 + Math.max(0, w - 52) * 0.2 + n * sm(16, 30, w);
  if (w < -14) h += (-w - 14) * 0.025 + Math.max(0, -w - 40) * 0.16 + n * sm(16, 30, -w);
  h += 3.2 * Math.exp(-((u - 36) ** 2 + (w - 54) ** 2) / 220);         /* the hill where the village buries its dead */
  return Math.min(h, 18);
}
const PIERS = [{ u: 0, w0: 7.6, w1: 15.5, deck: 0.55 }, { u: 0, w0: -15.5, w1: -7.6, deck: 0.55 }];
function pierAt(u, w) { for (const p of PIERS) if (Math.abs(u - p.u) < 1.15 && w > p.w0 && w < p.w1) return p.deck; return -1e9; }
const ROOM = { u: 0, w: -300, y: 0, hw: 3.4, hd: 2.8 };               /* Kiyo's room: built away from the town, walls all round */
HOOKS.farGround = (x, z) => kH(x, z - KZ);
HOOKS.farDepth = (x, z) => { const w = z - KZ; if (pierAt(x, w) > -1e8) return 0; return 0 - kH(x, w); };
HOOKS.farWalk = (x, z) => { const w = z - KZ; if (Math.abs(x - ROOM.u) < ROOM.hw && Math.abs(w - ROOM.w) < ROOM.hd) return ROOM.y; return Math.max(kH(x, w), pierAt(x, w)); };
const COLL = [];
HOOKS.farStep = (fx, fz, tx, tz) => {
  const w = tz - KZ;
  if (pierAt(tx, w) > -1e8) return true;
  if (0 - kH(tx, w) > 0.05) return false;                  /* the river in winter: not for wading */
  for (const c of COLL) if (Math.abs(tx - c.x) < c.hx && Math.abs(w - c.w) < c.hz) return false;
  if (Math.abs(tx) > 110 || w > 70 || w < -60) return false;
  return null;
};
HOOKS.clockHold = () => K.on;
HOOKS.noSave = () => K.on;

/* ---------- materials ---------- */
const tn = (c, o = {}) => makeToon(c, Object.assign({ noHeal: true, rim: 0.22, snow: 0.9 }, o));
const M = {
  wood: tn(0x5a4432), woodDk: tn(0x3a2c22), plaster: tn(0xb8ad98), roof: tn(0x4a4c55, { snow: 1 }), stone: tn(0x7a7670, { snow: 0.7 }),
  deck: tn(0x6a5440), paper: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.05, 0.55), fog: true }),
  paperDim: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.27, 0.22) }),
  rope: tn(0xb89a6a, { snow: 0 }), bark: tn(0x3c3430, { snow: 0.5 }), pine: tn(0x2f4a3a, { snow: 1 }), cloth: tn(0x2a2a30, { snow: 0.3 }),
  ember: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.9, 0.3) }), ash: tn(0x3a3634, { snow: 0 }), tatami: tn(0x9a9466, { snow: 0 }),
  futon: tn(0xd8d0c4, { snow: 0 }), quilt: tn(0x34486a, { snow: 0 }),
};
const GLOW = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t; })();
function glow(parent, x, y, z, s, col = 0xffb060, op = 0.85) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); sp.position.set(x, y, z); sp.scale.setScalar(s); parent.add(sp); return sp; }
function box(parent, w, h, d, mat, x, y, z, ry = 0, ol = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; parent.add(m); if (ol) addOutline(m, ol); return m; }

/* ---------- the town ---------- */
const LAMPS = [];        /* lamp positions (world) for the river's reflections */
function house(g, u, w, wid, dep, face, lit, opt = {}) {
  const h = new THREE.Group(); const gy = Math.min(kH(u - wid / 2, w), kH(u + wid / 2, w), kH(u, w - dep / 2), kH(u, w + dep / 2));
  h.position.set(u, gy, KZ + w); h.rotation.y = face; g.add(h);
  const wallH = opt.wallH || 2.5;
  box(h, wid + 0.3, 0.6, dep + 0.3, M.stone, 0, 0.0, 0);                                  /* stone footing */
  box(h, wid, wallH, dep, M.plaster, 0, 0.3 + wallH / 2, 0, 0, 0.02);
  for (const sx of [-1, 1]) box(h, 0.16, wallH, 0.16, M.woodDk, sx * wid / 2, 0.3 + wallH / 2, dep / 2 + 0.02);
  box(h, wid, 0.18, 0.12, M.woodDk, 0, 0.3 + wallH - 0.1, dep / 2 + 0.03);
  box(h, wid, 0.18, 0.12, M.woodDk, 0, 0.3 + 1.0, dep / 2 + 0.03);
  /* gabled roof, overhanging */
  const rw = dep / 2 + 0.7, rise = 1.25, slope = Math.hypot(rw, rise), ang = Math.atan2(rise, rw);
  for (const s of [-1, 1]) { const r = box(h, wid + 1.0, 0.14, slope, M.roof, 0, 0.3 + wallH + rise / 2, s * rw / 2, 0); r.rotation.x = s * ang; }
  const ridge = box(h, wid + 1.1, 0.16, 0.22, M.woodDk, 0, 0.3 + wallH + rise + 0.02, 0);
  /* windows: lit paper panels, or dark */
  const wm = lit ? M.paper : M.paperDim;
  for (const x of (opt.windows || [-wid / 4, wid / 4])) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), wm); p.position.set(x, 1.65, dep / 2 + 0.01); h.add(p);
    for (let i = -1; i <= 1; i++) box(h, 0.03, 0.7, 0.03, M.woodDk, x + i * 0.3, 1.65, dep / 2 + 0.03); box(h, 0.9, 0.03, 0.03, M.woodDk, x, 1.65, dep / 2 + 0.03);
    if (lit) { glow(h, x, 1.65, dep / 2 + 0.25, 2.2, 0xffb870, 0.5); } }
  const door = box(h, 1.0, 1.9, 0.06, M.wood, opt.doorX ?? 0, 0.3 + 0.95, dep / 2 + 0.02);
  COLL.push({ x: u, w, hx: (Math.abs(Math.cos(face)) * wid + Math.abs(Math.sin(face)) * dep) / 2 + 0.25, hz: (Math.abs(Math.sin(face)) * wid + Math.abs(Math.cos(face)) * dep) / 2 + 0.25 });
  return h;
}
function stoneLantern(g, u, w, lit) {
  const l = new THREE.Group(); l.position.set(u, kH(u, w), KZ + w); g.add(l);
  box(l, 0.5, 0.2, 0.5, M.stone, 0, 0.1, 0); box(l, 0.18, 0.7, 0.18, M.stone, 0, 0.55, 0); box(l, 0.42, 0.34, 0.42, M.stone, 0, 1.05, 0);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 4), M.roof); cap.position.y = 1.36; cap.rotation.y = Math.PI / 4; l.add(cap);
  if (lit) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), M.paper); c.position.y = 1.05; l.add(c); glow(l, 0, 1.05, 0, 1.6, 0xffb060, 0.7); LAMPS.push(W(u, w, kH(u, w) + 1.05)); }
  COLL.push({ x: u, w, hx: 0.35, hz: 0.35 });
}
function bareTree(g, u, w, s = 1) {
  const t = new THREE.Group(); t.position.set(u, kH(u, w), KZ + w); g.add(t);
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 3.2 * s, 6), M.bark); tr.position.y = 1.6 * s; t.add(tr);
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.07 * s, 1.8 * s, 4), M.bark); const a = i * 1.1 + u;
    b.position.set(Math.cos(a) * 0.5 * s, (2.2 + i * 0.25) * s, Math.sin(a) * 0.5 * s); b.rotation.set(Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9); t.add(b); }
  COLL.push({ x: u, w, hx: 0.3, hz: 0.3 });
}
function pine(g, u, w, s = 1) {
  const t = new THREE.Group(); t.position.set(u, kH(u, w), KZ + w); g.add(t);
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.18 * s, 2.4 * s, 6), M.bark); tr.position.y = 1.2 * s; t.add(tr);
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry((1.5 - i * 0.4) * s, 1.4 * s, 7), M.pine); c.position.y = (2.2 + i * 0.9) * s; c.castShadow = true; t.add(c); }
  COLL.push({ x: u, w, hx: 0.4, hz: 0.4 });
}
function pier(g, p) {
  const len = p.w1 - p.w0, mid = (p.w0 + p.w1) / 2;
  box(g, 2.3, 0.14, len, M.deck, p.u, p.deck - 0.07, KZ + mid, 0, 0.012);
  for (let w = p.w0 + 0.3; w < p.w1; w += 1.6) for (const sx of [-1, 1]) box(g, 0.16, 2.6, 0.16, M.woodDk, p.u + sx * 1.05, p.deck - 1.4, KZ + w);
}
const kiyoWin = { pos: W(4.6, 26.6, 0), glow: null, light: null, mat: null, k: 1 };
function buildTown() {
  const g = new THREE.Group(); K.root.add(g);          /* everything that never moves: merged per material at the end */
  /* terrain */
  const geo = new THREE.PlaneGeometry(280, 150, 140, 75); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 5);
  const P = geo.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const u = P.getX(i), w = P.getZ(i), h = kH(u, w); P.setY(i, h);
    const aw = Math.abs(w);
    if (aw < 14.5 && aw > 8.5) c.set(0x5a5650);                       /* the stone embankment */
    else if (aw <= 8.5) c.set(0x2a2a26);
    else c.set(0x6a6050).lerp(new THREE.Color(0x4a5a3a), vn(u * 0.1, w * 0.1) * 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals(); geo.translate(0, 0, KZ);
  const ground = new THREE.Mesh(geo, makeToon(0xffffff, { vc: true, noHeal: true, snow: 1, rim: 0.05 })); ground.receiveShadow = true; K.root.add(ground);
  /* the river */
  K.river = river(); K.root.add(K.river);
  /* piers, the town on the north bank, the meadow and the road on the south bank */
  for (const p of PIERS) pier(g, p);
  const kh = house(g, 4.6, 24.0, 6.2, 5.0, Math.PI, false, { windows: [-1.6, 1.4], doorX: -0.2 });   /* Kiyo's house, facing the river */
  K.kiyoHouse = kh;
  /* her lamp: in the right-hand window, a small oil lamp behind the paper */
  const wm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.25, 0.6) }); kiyoWin.mat = wm;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), wm); pane.position.set(1.4, 1.65, 2.52); kh.add(pane);
  kiyoWin.glow = glow(kh, 1.4, 1.65, 2.9, 3.4, 0xffb060, 0.9);
  kh.updateMatrixWorld(true); kiyoWin.pos = kh.localToWorld(new THREE.Vector3(1.4, 1.65, 2.6));
  kiyoWin.light = new THREE.PointLight(0xffb060, 1.4, 16, 2); kiyoWin.light.position.copy(kiyoWin.pos).add(new THREE.Vector3(0, 0, -0.6)); K.root.add(kiyoWin.light);
  LAMPS.push(kiyoWin.pos.clone());
  house(g, 11.6, 24.6, 3.0, 3.0, Math.PI, false, { wallH: 2.0, windows: [] });               /* her shed, locked */
  K.shedPos = W(11.6, 22.9);
  const others = [[-12, 23, 6, 5, 0, true], [-24, 27, 7, 5, 0.1, false], [19, 30, 6, 5, -0.15, true], [31, 25, 5, 4, -0.3, false], [-8, 40, 6, 5, 0, true], [10, 44, 7, 5, 0.1, false], [-34, 37, 6, 5, 0.25, true], [-46, 26, 5, 4, 0.1, false], [44, 34, 6, 4, -0.4, true]];
  for (const [u, w, a, b, f, lit] of others) house(g, u, w, a, b, Math.PI + f, lit);     /* the town faces the river */
  /* Toma's boatshed by the landing: open on the river side, a hull on trestles, a lantern */
  const bs = new THREE.Group(); bs.position.set(-8.5, kH(-8.5, 16.8), KZ + 16.8); g.add(bs);
  for (const [x, z] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) box(bs, 0.18, 2.6, 0.18, M.woodDk, x, 1.3, z);
  const br = box(bs, 4.8, 0.12, 4.0, M.roof, 0, 2.7, 0); br.rotation.x = 0.12;
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 10, 1, true, 0, Math.PI), M.wood); hull.rotation.set(0, 0, Math.PI / 2); hull.position.set(0, 0.95, 0); hull.material.side = THREE.DoubleSide; bs.add(hull);
  for (const x of [-1.2, 1.2]) box(bs, 0.12, 0.7, 1.2, M.woodDk, x, 0.35, 0);
  const lan = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), M.paper); lan.position.set(1.8, 2.2, 1.4); bs.add(lan); glow(bs, 1.8, 2.2, 1.4, 2.2, 0xffb060, 0.7);
  bs.updateMatrixWorld(true); LAMPS.push(bs.localToWorld(new THREE.Vector3(1.8, 2.2, 1.4)));
  COLL.push({ x: -8.5, w: 16.8, hx: 2.3, hz: 1.9 });
  K.tomaSpot = W(-7.4, 15.6);
  /* lanterns along the river lane, and the south landing's */
  for (const [u, w, lit] of [[-3.4, 15.8, true], [14, 16.2, true], [-26, 16.4, true], [3.2, -16.0, true], [30, 16.6, false], [-40, 16.6, true]]) stoneLantern(g, u, w, lit);
  for (const [u, w, s] of [[-14, -20, 1.1], [9, -24, 1.0], [24, -19, 1.2], [-30, -26, 1.3], [40, -28, 1.0], [-50, 22, 1.1], [52, 22, 1.2], [26, 38, 1.0], [-20, 44, 1.2]]) bareTree(g, u, w, s);
  for (const [u, w, s] of [[30, 50, 1.3], [42, 58, 1.5], [36, 62, 1.2], [-6, 54, 1.4], [-30, 50, 1.3], [12, 58, 1.2], [-44, -36, 1.4], [16, -38, 1.3]]) pine(g, u, w, s);
  /* the graves on the hill: low stones and one new wooden marker */
  const gh = new THREE.Group(); gh.position.set(36, kH(36, 52), KZ + 52); g.add(gh);
  for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 2.6 + (i % 3) * 1.2; const s = box(gh, 0.4, 0.6 + (i % 2) * 0.25, 0.22, M.stone, Math.cos(a) * r, 0.3, Math.sin(a) * r - 2, a); }
  const marker = box(gh, 0.14, 1.45, 0.05, M.wood, 0, 0.72, 0.6); K.marker = W(36, 52.6);
  for (const y of [1.18, 1.28]) box(gh, 0.17, 0.025, 0.06, M.woodDk, 0, y, 0.6);     /* a plain wooden post, notched at the top */
  box(gh, 0.5, 0.18, 0.3, M.stone, 0, 0.09, 0.6);
  K.graveCenter = W(36, 54);
  /* the boat */
  K.boat = boat(); K.root.add(K.boat.g);
  K.tomaBoat = boat(true); K.root.add(K.tomaBoat.g); K.tomaBoat.g.visible = false;
  /* Kiyo's room */
  buildRoom(K.root);
  /* the ferry box on the north landing */
  const fb = new THREE.Group(); fb.position.copy(W(-1.6, 14.2, kH(-1.6, 14.2))); g.add(fb);
  box(fb, 0.9, 0.5, 0.55, M.wood, 0, 0.25, 0, 0.2, 0.012); box(fb, 0.95, 0.06, 0.6, M.woodDk, 0, 0.52, 0, 0.2);
  K.boxPos = fb.position.clone(); COLL.push({ x: -1.6, w: 14.2, hx: 0.5, hz: 0.4 });
  /* villagers for the funeral */
  K.villagers = [];
  for (let i = 0; i < 6; i++) { const v = villager(i); K.root.add(v); v.visible = false; K.villagers.push(v); }
  /* a bear, for the memory */
  K.bear = bear(); K.root.add(K.bear); K.bear.visible = false;
  MZ.bakeStatic?.(g);
  K.root.traverse((o) => { o.layers.enable(1); });
}
function river() {
  const geo = new THREE.PlaneGeometry(280, 20, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0.0, KZ);
  const lampU = { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, -99, 0)) };
  K.lampU = lampU;
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: G.uTime, uLamps: lampU, uN: { value: 0 }, uSky: { value: new THREE.Color(0.1, 0.13, 0.2) }, uDeep: { value: new THREE.Color(0.02, 0.03, 0.05) }, uDay: { value: 0 } },
    transparent: true, depthWrite: true, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uDay; uniform vec3 uLamps[8]; uniform int uN; uniform vec3 uSky, uDeep; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float fr = 0.25 + 0.75 * pow(1.0 - max(V.y, 0.0), 3.0);
        vec2 fl = vW.xz * vec2(0.35, 1.6) + vec2(-uTime * 0.55, 0.0);         /* the current runs along the river */
        float rip = n(fl) * 0.6 + n(fl * 2.3 + 4.0) * 0.4;
        vec3 c = mix(uDeep, uSky, fr * (0.6 + 0.4 * rip));
        /* lamps reflected as long broken streaks toward the eye */
        for (int i = 0; i < 8; i++) { if (i >= uN) break; vec3 L = uLamps[i]; vec3 Lm = vec3(L.x, -L.y, L.z);
          float t = cameraPosition.y / max(0.01, cameraPosition.y - Lm.y); vec3 I = cameraPosition + (Lm - cameraPosition) * t;
          vec2 d = vW.xz - I.xz; vec2 ax = normalize((I.xz - cameraPosition.xz) + vec2(1e-4)); float along = dot(d, ax), across = dot(d, vec2(-ax.y, ax.x));
          float s = exp(-across * across / (0.06 + 0.02 * abs(along)) - along * along / 26.0) * (0.55 + 0.9 * smoothstep(0.45, 0.8, n(vW.xz * vec2(3.0, 9.0) + vec2(uTime * 0.9, 0.0))));
          c += vec3(1.0, 0.62, 0.26) * s * 0.9 * (1.0 - uDay * 0.8); }
        float edge = smoothstep(9.6, 10.0, abs(vW.z - ${KZ.toFixed(1)}));
        gl_FragColor = vec4(c, 0.96 - edge * 0.5);
      }`,
  });
  const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 2; return mesh;
}
function boat(small) {
  const g = new THREE.Group(); const L = small ? 3.0 : 5.2, Wd = small ? 1.0 : 1.5;
  const sh = new THREE.Shape(); sh.moveTo(-L / 2, -Wd / 2); sh.lineTo(L / 2 - 0.9, -Wd / 2); sh.quadraticCurveTo(L / 2, -Wd * 0.2, L / 2 + 0.25, 0); sh.quadraticCurveTo(L / 2, Wd * 0.2, L / 2 - 0.9, Wd / 2); sh.lineTo(-L / 2, Wd / 2); sh.lineTo(-L / 2, -Wd / 2);
  /* a hollow hull: the outline with the same outline (inset) as a hole, for the sides; a thin bottom plate */
  const inset = (k) => { const q = new THREE.Path(); const l = L / 2 - k, w2 = Wd / 2 - k;
    q.moveTo(-l, -w2); q.lineTo(l - 0.9, -w2); q.quadraticCurveTo(l, -w2 * 0.4, l + 0.25 - k, 0); q.quadraticCurveTo(l, w2 * 0.4, l - 0.9, w2); q.lineTo(-l, w2); q.lineTo(-l, -w2); return q; };
  sh.holes.push(inset(0.07));
  const orient = (geo) => { geo.rotateX(-Math.PI / 2); geo.rotateY(-Math.PI / 2); return geo; };
  const hull = new THREE.Mesh(orient(new THREE.ExtrudeGeometry(sh, { depth: 0.46, bevelEnabled: false })), M.wood); hull.position.y = -0.28; hull.castShadow = true; g.add(hull); addOutline(hull, 0.02);
  const sh2 = new THREE.Shape(inset(0.0).getPoints(24));
  const bottom = new THREE.Mesh(orient(new THREE.ExtrudeGeometry(sh2, { depth: 0.06, bevelEnabled: false })), M.deck); bottom.position.y = -0.28; g.add(bottom);
  for (const z of (small ? [0.2] : [-0.4, 0.9])) box(g, Wd - 0.12, 0.05, 0.3, M.woodDk, 0, 0.06, z);     /* thwarts */
  /* the floor (top of the bottom plate) is at local y = -0.22 */
  const res = { g, L };
  if (!small) {
    /* the stern oar (a ro), and a lantern on a pole at the bow */
    const oar = new THREE.Group(); oar.position.set(0.25, 0.25, -L / 2 + 0.05); g.add(oar);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 3.6, 6), M.wood); shaft.position.set(0, 0, -1.6); shaft.rotation.x = Math.PI / 2 - 0.35; oar.add(shaft);
    const blade = box(oar, 0.06, 0.04, 0.9, M.wood, 0, -0.62, -3.15); blade.rotation.x = -0.35;
    res.oar = oar;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 5), M.woodDk); pole.position.set(0, 0.75, L / 2 - 0.6); g.add(pole);
    const ln = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), M.paper); ln.position.set(0, 1.5, L / 2 - 0.6); g.add(ln);
    res.lanGlow = glow(g, 0, 1.5, L / 2 - 0.6, 2.4, 0xffb060, 0.8); res.lanPos = new THREE.Vector3(0, 1.5, L / 2 - 0.6);
    res.light = new THREE.PointLight(0xffb468, 2.2, 9, 1.6); res.light.position.set(0, 1.4, L / 2 - 0.9); g.add(res.light);
  } else {
    const tarp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, TAU, 0, Math.PI / 2), M.cloth); tarp.scale.set(0.9, 0.55, 1.6); tarp.position.set(0, 0.05, -0.1); g.add(tarp);
    for (const sx of [-1, 1]) box(g, 0.12, 0.12, 0.3, M.woodDk, sx * 0.12, 0.12, -1.25);      /* his boots, sticking out */
  }
  return res;
}
function villager(i) {
  const g = new THREE.Group(); const cl = [0x5a5a62, 0x6a5a4c, 0x4c5466, 0x6a5450, 0x58604e, 0x60606a][i], sc = [1, 0.94, 1.04, 0.9, 1.0, 0.97][i];
  const coat = tn(cl, { snow: 0.5, rim: 0.4 }), hoodM = tn(new THREE.Color(cl).multiplyScalar(0.8).getHex(), { snow: 0.7, rim: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.33, 1.15, 10), coat); body.position.y = 0.6; body.castShadow = true; g.add(body); addOutline(body, 0.014);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), coat); sh.scale.set(1.2, 0.55, 0.9); sh.position.y = 1.18; g.add(sh);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hoodM); hood.position.set(0, 1.42, -0.015); hood.scale.set(1, 1.12, 1.08); g.add(hood); addOutline(hood, 0.012);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), tn([0xd0a888, 0xc09070, 0xb88a68, 0xd8b090, 0xa87858, 0xc8a080][i], { snow: 0, rim: 0.2 })); face.position.set(0, 1.4, 0.07); face.scale.set(0.95, 1.1, 0.8); g.add(face);
  for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 3, 6), coat); arm.position.set(sx * 0.22, 0.9, 0.1); arm.rotation.x = -0.5; arm.rotation.z = sx * 0.12; g.add(arm); }
  if (i === 2) { const ln = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), M.paper); ln.position.set(0.05, 0.75, 0.38); g.add(ln); }
  g.scale.setScalar(sc);
  return g;
}
function bear() {
  const g = new THREE.Group(); const m = tn(0x241c18, { snow: 0.2, rim: 0.5 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), m); b.scale.set(0.9, 0.75, 1.5); b.position.y = 0.85; g.add(b); addOutline(b, 0.02);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), m); hd.position.set(0, 1.05, 1.05); g.add(hd);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), m); e.position.set(sx * 0.22, 1.36, 1.0); g.add(e);
    for (const z of [-0.6, 0.55]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.7, 6), m); l.position.set(sx * 0.35, 0.35, z); g.add(l); } }
  return g;
}
/* ---------- Kiyo's room ---------- */
function buildRoom(g) {
  const r = new THREE.Group(); ROOM.y = kH(ROOM.u, ROOM.w) + 0.3; r.position.set(ROOM.u, ROOM.y, KZ + ROOM.w); g.add(r); K.room = r;
  const hw = ROOM.hw, hd = ROOM.hd, H = 2.4;
  box(r, hw * 2, 0.1, hd * 2, M.tatami, 0, -0.05, 0);
  for (let i = -2; i <= 2; i++) box(r, 0.04, 0.012, hd * 2, M.woodDk, i * 1.3, 0.006, 0);
  const wallM = tn(0xa89a84, { snow: 0, rim: 0.05 });
  box(r, hw * 2, H, 0.1, wallM, 0, H / 2, -hd); box(r, hw * 2, H, 0.1, wallM, 0, H / 2, hd); box(r, 0.1, H, hd * 2, wallM, -hw, H / 2, 0); box(r, 0.1, H, hd * 2, wallM, hw, H / 2, 0);
  box(r, hw * 2, 0.1, hd * 2, tn(0x3a2e26, { snow: 0 }), 0, H, 0);
  for (const x of [-hw, -1.2, 1.2, hw]) box(r, 0.14, H, 0.14, M.woodDk, x, H / 2, -hd + 0.06);
  for (let x = -hw + 0.5; x < hw; x += 0.9) box(r, 0.1, 0.12, hd * 2, M.woodDk, x, H - 0.1, 0);
  /* the paper window, lamplit, with her lamp on the sill */
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.42, 0.5) })); sh.position.set(1.8, 1.5, hd - 0.06); sh.rotation.y = Math.PI; r.add(sh);
  const lamp = new THREE.Group(); lamp.position.set(1.8, 0.95, hd - 0.28); r.add(lamp);
  box(lamp, 0.22, 0.05, 0.22, M.woodDk, 0, 0, 0); const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 8), M.paper); lg.position.y = 0.14; lamp.add(lg);
  K.roomLampGlow = glow(lamp, 0, 0.15, 0, 1.2, 0xffb060, 0.9);
  /* the hearth (irori): a sunken square of ash, embers, a kettle on a hook */
  const ir = new THREE.Group(); ir.position.set(-0.4, 0, 0); r.add(ir);
  box(ir, 1.3, 0.06, 1.3, M.woodDk, 0, 0.01, 0); box(ir, 1.1, 0.04, 1.1, M.ash, 0, 0.035, 0);
  for (let i = 0; i < 9; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06 + (i % 3) * 0.02, 6, 4), M.ember); e.position.set(Math.cos(i * 2.4) * 0.18, 0.06, Math.sin(i * 2.4) * 0.18); ir.add(e); }
  K.fireGlow = glow(ir, 0, 0.25, 0, 2.4, 0xff7a30, 0.8);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.7, 4), M.woodDk); hook.position.y = 1.3; ir.add(hook);
  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), tn(0x2a2826, { snow: 0, rim: 0.5 })); kettle.scale.y = 0.8; kettle.position.y = 0.5; ir.add(kettle);
  K.fire = new THREE.PointLight(0xff8a40, 2.2, 7, 2); K.fire.position.set(ROOM.u - 0.4, ROOM.y + 0.6, KZ + ROOM.w); g.add(K.fire);
  /* her futon by the fire, a low shelf, the basket */
  box(r, 1.0, 0.12, 2.0, M.futon, -2.3, 0.06, 0.2); box(r, 1.04, 0.1, 1.5, M.quilt, -2.3, 0.15, 0.45);
  box(r, 1.6, 0.9, 0.35, M.wood, -2.2, 0.45, -hd + 0.25);
  K.basket = basketMesh(); K.basket.position.set(-1.2, 0.02, -0.9); r.add(K.basket);
}
/* the worn reed basket: a lopsided weave (this is the cradle; nobody knows yet) */
function basketMesh() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#9a7a4a'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#b8935a' : '#7e6038'; x.fillRect(i * 8, j * 8 + ((i % 2) ? 2 : 0), 7, 6); }
  x.fillStyle = '#3a5aa0'; x.fillRect(0, 6, 128, 2);         /* one blue strand under the rim */
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(3, 1); tx.colorSpace = THREE.SRGBColorSpace;
  const m = makeToon(0xffffff, { noHeal: true, map: tx, mapKey: 'kawaBasket', rim: 0.3, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.28, 16, 1, true), m); body.position.y = 0.14; body.scale.set(1, 1, 0.82); body.rotation.z = 0.05; g.add(body);
  const bot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), m); bot.rotation.x = -Math.PI / 2; bot.scale.set(1, 0.82, 1); bot.position.y = 0.01; g.add(bot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 5, 18), makeToon(0x8a6a3e, { noHeal: true })); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 0.82, 1); rim.position.y = 0.28; g.add(rim);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/* ---------- song: "The River Knows the Way", the downstream verse ---------- */
const VERSE = ['One oar for the morning, two for the light,', 'three for the long water, four for the night,', "five for the lamp in the window that's mine.", 'Row, little boat, the river knows the line.'];
const TUNE = [
  [[69, 1], [74, 1], [76, 1], [78, 1.5], [76, 0.5], [74, 1], [71, 1], [69, 2]],
  [[69, 1], [74, 1], [76, 1], [78, 1], [81, 1], [78, 1], [76, 1], [74, 2]],
  [[71, 1], [74, 1], [76, 1], [78, 1], [76, 1], [74, 1], [71, 1], [74, 1], [76, 1]],
  [[78, 1.5], [76, 0.5], [74, 1], [71, 1], [69, 1], [71, 1], [74, 3]],
];
const BEAT = 60 / 84;
function sing(line, voice, t0, opt = {}) {
  const ctx = AU.ctx; if (!ctx || !AU.music) return 0;
  const out = ctx.createGain(); out.gain.value = voice === 'kiyo' ? 0.16 : 0.14; out.connect(AU.music);
  const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = voice === 'kiyo' ? 1900 : 2600; bp.connect(out);
  let t = (t0 ?? ctx.currentTime) + 0.05; const notes = TUNE[line]; const stop = opt.stopAt ?? notes.length;
  for (let i = 0; i < stop; i++) {
    const [m, b] = notes[i]; const f = 440 * Math.pow(2, (m - 69 + (voice === 'kiyo' ? -2 : 0)) / 12); const d = b * BEAT * (opt.slow || 1);
    for (const [type, mul, vol] of [['triangle', 1, 1], ['sine', 2, 0.25], ['sine', 0.5, 0.18]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.value = f * mul * 0.006; vib.connect(vg); vg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(bp);
      const v = vol * (opt.whisper ? 0.25 : 1);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.07); g.gain.setValueAtTime(v * 0.85, t + Math.max(0.08, d - 0.12)); g.gain.linearRampToValueAtTime(0, t + d + 0.1);
      if (opt.breakAt === i) { o.frequency.setValueAtTime(f * mul, t + d * 0.4); o.frequency.exponentialRampToValueAtTime(f * mul * 0.86, t + d * 0.9); g.gain.linearRampToValueAtTime(0, t + d * 0.7); }
      o.start(t); vib.start(t); o.stop(t + d + 0.2); vib.stop(t + d + 0.2);
    }
    if (opt.whisper) { const nb = ctx.createBufferSource(); const len = ctx.sampleRate * d | 0, buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (let k = 0; k < len; k++) ch[k] = (Math.random() * 2 - 1) * 0.5; nb.buffer = buf; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = f * 2; nf.Q.value = 3;
      const ng = ctx.createGain(); ng.gain.value = 0.05; nb.connect(nf); nf.connect(ng); ng.connect(bp); nb.start(t); }
    t += d;
    if (opt.breakAt === i) break;
  }
  return t - (t0 ?? ctx.currentTime);
}
let musicDuck = 1;
function duck(k) { musicDuck = k; }
HOOKS.vis.push((dt) => { if (!AU.music || !AU.ctx) return; if (K.on) { const want = 0.5 * musicDuck; AU.music.gain.value = damp(AU.music.gain.value, want, 2, dt); } });

/* ---------- UI ---------- */
const ui = (() => {
  const st = document.createElement('style');
  st.textContent = `#kawaObj{position:absolute;left:calc(16px + env(safe-area-inset-left,0px));top:calc(16px + env(safe-area-inset-top,0px));padding:9px 16px;font-size:16px;max-width:min(420px,calc(100vw - 32px));pointer-events:none}
  #kawaSub{position:absolute;left:50%;bottom:calc(11vh + 18px);transform:translateX(-50%);color:#f4ead8;font-style:italic;font-size:20px;text-shadow:0 2px 8px rgba(0,0,0,.8);text-align:center;width:min(720px,calc(100vw - 32px));pointer-events:none;transition:opacity .6s;opacity:0}
  #kawaSub.on{opacity:1}
  #kawaRow{position:absolute;left:50%;bottom:calc(16vh + 34px);transform:translateX(-50%);display:flex;align-items:center;gap:12px;color:#f4ead8;font-size:16px;text-shadow:0 1px 6px rgba(0,0,0,.8);pointer-events:auto;cursor:pointer}
  #kawaRow .ring{width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,220,160,.9);box-shadow:0 0 18px rgba(255,190,110,.6);transform:scale(var(--s,1))}
  #kawaRow .hit{color:#ffd9a0;font-weight:700;min-width:5em}
  #kawaTitle{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f6ecd8;pointer-events:none;opacity:0;transition:opacity 2.2s}
  #kawaTitle.on{opacity:1} #kawaTitle h1{font-family:var(--f-display);font-size:min(84px,13vw);margin:0;letter-spacing:.04em;text-shadow:0 4px 24px rgba(0,0,0,.6)} #kawaTitle p{font-size:20px;font-style:italic;margin:8px 0 0;text-shadow:0 2px 10px rgba(0,0,0,.7)}
  #kawaMem{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(120,90,50,0) 40%,rgba(60,40,20,.65) 100%);mix-blend-mode:multiply;opacity:0;transition:opacity 1.2s}
  #kawaMem.on{opacity:1}
  body.kawa #tab,body.kawa #satchel,body.kawa #waypoint,body.kawa #hint,body.kawa #lookHint{display:none!important}
  #talk.narr .who{display:none} #talk.narr .line{font-style:italic;text-align:center}`;
  document.head.appendChild(st);
  const mk = (id, html, cls) => { const e = document.createElement('div'); e.id = id; if (cls) e.className = cls; e.innerHTML = html; e.hidden = true; $('app').appendChild(e); return e; };
  return { obj: mk('kawaObj', '', 'paper note'), sub: mk('kawaSub', ''), row: mk('kawaRow', '<div class="ring"></div><div><div>Scull · press E with the song</div><div class="hit"></div></div>'),
    title: mk('kawaTitle', '<h1>Mizumend</h1><p>The river knows the way.</p>'), mem: mk('kawaMem', '') };
})();
function objective(t) { K.obj = t; ui.obj.hidden = !t; ui.obj.textContent = t || ''; }
function subtitle(t, secs = 5) { ui.sub.hidden = false; ui.sub.textContent = t; ui.sub.classList.add('on'); clearTimeout(K.subT); K.subT = setTimeout(() => ui.sub.classList.remove('on'), secs * 1000); }
function fade(on) { const f = $('sleepFade'); f.hidden = false; requestAnimationFrame(() => f.classList.toggle('on', on)); }
/* a scene's pause; if the scene was replaced meanwhile (a jump, a skip), the old one simply stops here */
const wait = (s) => { const g = K.gen; return new Promise((r) => setTimeout(() => { if (g === K.gen) r(); }, s * 1000 / Math.max(0.05, MZ.timeScale || 1))); };
function letterbox(on) { $('letterbox').classList.toggle('on', on); }
function talk(lines) { return new Promise((res) => MZ.talkRun(lines, res)); }
const aoi = (text, ex, w = 0.8) => ({ who: 'Aoi', text, fn: () => { if (ex) MZ.hero?.expr?.(ex, w, 6); shotOn('aoi'); } });
const kiyo = (text, ex, w = 0.8) => ({ who: 'Kiyo', text, fn: () => { if (ex) K.cast.kiyo?.expr(ex, w, 6); shotOn('kiyo'); } });
const toma = (text, ex, w = 0.8) => ({ who: 'Toma', text, fn: () => { if (ex) K.cast.toma?.expr(ex, w, 6); } });
const narr = (text, fn) => ({ who: '', text, fn });

/* ---------- camera ---------- */
/* a scene's camera: shot = { p, l } world points or a function returning them; eased in, held, eased out */
function shot(s) { K.shot = s; }
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _curL = new THREE.Vector3();
let camInit = false;
HOOKS.vis.push((dt) => {
  if (!K.on) return;
  const s = K.shot;
  K.shotK = damp(K.shotK, s ? 1 : 0, 2.2, dt);
  if (!s && K.shotK < 0.01) { camInit = false; return; }
  const v = s ? (typeof s === 'function' ? s() : s) : null;
  if (v) { if (!camInit) { _cp.copy(camera.position); camera.getWorldDirection(_curL); _cl.copy(camera.position).add(_curL.multiplyScalar(5)); camInit = true; }
    const k = 1 - Math.exp(-(v.snap ? 30 : 2.6) * dt); _cp.lerp(v.p, k); _cl.lerp(v.l, k); }
  camera.position.lerpVectors(camera.position, _cp, K.shotK); _curL.copy(_cl); camera.lookAt(_curL);
});
function shotOn(who) {
  if (K.step !== 'evening') return;
  const r = K.room.position;
  K.shot = who === 'kiyo' ? { p: new THREE.Vector3(r.x - 0.75, r.y + 0.95, r.z + 1.45), l: new THREE.Vector3(r.x - 2.2, r.y + 0.62, r.z + 0.1) }
    : who === 'aoi' ? { p: new THREE.Vector3(r.x - 1.75, r.y + 0.95, r.z + 1.25), l: new THREE.Vector3(r.x - 0.7, r.y + 0.72, r.z + 0.5) }
    : { p: new THREE.Vector3(r.x + 1.6, r.y + 1.5, r.z + 2.0), l: new THREE.Vector3(r.x - 1.3, r.y + 0.5, r.z - 0.1) };
}

/* ---------- scene control ---------- */
function setTime(h, wx) { S.hours = h; MZ.W.forced = wx; MZ.pickWeather(true); }
function placePlayer(p, face) { player.pos.set(p.x, MZ.walkH(p.x, p.z), p.z); player.vel.set(0, 0, 0); player.vy = 0; player.face = player.faceT = face; cam.yaw = face + Math.PI; cam.target.set(p.x, player.pos.y + 1.25, p.z); }
const LAYER_KEEP = [];
function enterWorld() {
  K.on = true; document.body.classList.add('kawa');
  if (!K.built) { buildTown(); K.built = true; scene.add(K.root); }
  K.root.visible = true;
  /* draw only Kawashita, her, the sky, the mountains, the weather and the lights */
  for (const o of scene.children) {
    const keep = o === K.root || o === player.root || o.isLight || (o.frustumCulled === false && o.renderOrder !== 0) || o.isPoints;
    if (keep) o.traverse((c) => c.layers.enable(1));
  }
  player.root.traverse((c) => c.layers.enable(1));
  camera.layers.set(1);
  K.saved = K.saved || { season: MZ.SEASON, forced: MZ.W.forced };
  MZ.setSeason('winter'); G.uSnow.value = 0.95;
  K.lampU.value.forEach((v, i) => { if (LAMPS[i]) v.copy(LAMPS[i]); });
  K.river.material.uniforms.uN.value = Math.min(8, LAMPS.length);
}
function leaveWorld() {
  K.on = false; document.body.classList.remove('kawa'); camera.layers.set(0); K.root.visible = false; K.shot = null; K.shotK = 0;
  ui.obj.hidden = true; ui.row.hidden = true; ui.sub.classList.remove('on'); ui.title.classList.remove('on'); ui.mem.classList.remove('on'); letterbox(false);
  for (const c of Object.values(K.cast)) if (c && c.g) c.g.visible = false;
  MZ.setSeason(MZ.SEASON_PARAM || K.saved?.season || MZ.realSeason()); MZ.W.forced = MZ.WEATHER_PARAM; MZ.pickWeather(true);
  G.uSnow.value = MZ.SEASON === 'winter' ? 0.9 : 0; MZ.hero && (MZ.hero.hidden = false);
}
async function castReady() {
  const load = async (n) => { try { const c = await loadCast(n); c.g.traverse((o) => o.layers.enable(1)); return c; } catch (e) { console.warn('cast', n, e); return null; } };
  const [kiyoC, tomaC] = await Promise.all([load('kiyo'), load('toma')]);
  K.cast.kiyo = kiyoC; K.cast.toma = tomaC;
  if (kiyoC) { K.kiyoStick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 1.2, 5), M.wood); K.kiyoStick.position.set(0, -0.5, 0.06); kiyoC.anchors.handR.add(K.kiyoStick); K.kiyoStick.layers.enable(1); }
}
HOOKS.pose.push((dt) => {            /* runs before Aoi's (hero.js is imported after this file): poses for the boat and the scenes */
  if (!K.on) return;
  const p = player;
  const gear = MZ.combat?.gear; if (gear) { gear.hand.visible = false; gear.back.visible = false; gear.lan.visible = false; }   /* no staff or lantern yet: those are found at Mill Pond */
  if (K.faceLock !== undefined && K.faceLock !== null) { p.face = p.faceT = K.faceLock; p.idle = 0; }
  if (K.step === 'rowing' || K.step === 'depart') {
    const k = K.stroke || 0, sw = Math.sin(k * TAU);
    p.arms[1].rotation.set(-1.1 - sw * 0.35, 0, 0.3); p.arms[0].rotation.set(-0.9 - sw * 0.35, 0, -0.35);
    p.body.rotation.x = 0.12 + sw * 0.08; p.legs[0].rotation.x = -0.25; p.legs[1].rotation.x = 0.25;
  }
  if (K.step === 'evening' || K.step === 'song' || K.step === 'holdBasket') { p.body.position.y = -0.72; p.legs[0].rotation.x = -1.5; p.legs[1].rotation.x = -1.5; p.body.rotation.x = 0.05; p.arms[0].rotation.x = -0.5; p.arms[1].rotation.x = -0.5; p.head.rotation.y = 0; p.head.rotation.x = 0.1; }
  if (K.step === 'holdBasket') { p.arms[0].rotation.set(-0.9, 0, -0.3); p.arms[1].rotation.set(-0.9, 0, 0.3); }
});
HOOKS.vis.push((dt) => {
  if (!K.on) return;
  for (const c of Object.values(K.cast)) if (c && c.g.visible) c.update(dt);
  /* her lamp in the window, and the room's; the fire flickers */
  const t = G.uTime.value;
  if (kiyoWin.glow) { kiyoWin.glow.material.opacity = 0.9 * kiyoWin.k * (0.92 + 0.08 * Math.sin(t * 7.3)); kiyoWin.light.intensity = 1.4 * kiyoWin.k; kiyoWin.mat.color.setRGB(0.32 + 1.6 * kiyoWin.k, 0.27 + 1.0 * kiyoWin.k, 0.22 + 0.4 * kiyoWin.k); }
  if (K.fire) { K.fire.intensity = 2.0 + Math.sin(t * 11) * 0.25 + Math.sin(t * 17.3) * 0.15; K.fireGlow.material.opacity = 0.7 + Math.sin(t * 9) * 0.1; }
  if (K.river) { const u = K.river.material.uniforms, n = MZ.nightF, h = S.hours; u.uDay.value = 1 - n;
    const dawn = h > 5 && h < 8 ? 1 - Math.abs(h - 6.5) / 1.5 : 0;
    u.uSky.value.setRGB(lerp(0.42, 0.07, n) + dawn * 0.18, lerp(0.48, 0.09, n) + dawn * 0.04, lerp(0.56, 0.15, n) + dawn * 0.06);
    u.uDeep.value.setRGB(lerp(0.08, 0.015, n), lerp(0.11, 0.025, n), lerp(0.14, 0.045, n)); }
});

/* ---------- the rowing ---------- */
const STROKE = 1.75;
function rowStep(dt) {
  const b = K.boat, R = K.row;
  R.t += dt; R.v = damp(R.v, 0, 0.55, dt);
  R.s += R.v * dt; K.stroke = (R.t % STROKE) / STROKE;
  const s = clamp(R.s / R.len, 0, 1);
  const u = 1.95 + Math.sin(s * Math.PI) * 1.6, w = lerp(R.w0, R.w1, s);
  b.g.position.set(u, 0.24 + Math.sin(R.t * 1.3) * 0.03, KZ + w); b.g.rotation.set(Math.sin(R.t * 1.1) * 0.02, R.dir, Math.sin(R.t * 0.9) * 0.025);
  if (b.oar) b.oar.rotation.y = Math.sin(K.stroke * TAU) * 0.45;
  /* her place at the stern, Kiyo's on the middle thwart */
  b.g.updateMatrixWorld(true);
  const st = b.g.localToWorld(new THREE.Vector3(-0.1, -0.22, -b.L / 2 + 0.55));
  player.pos.copy(st); player.vel.set(0, 0, 0); player.vy = 0; player.grounded = true; player.face = player.faceT = R.dir; player.idle = 0;
  const kc = K.cast.kiyo; if (kc) { const kp = b.g.localToWorld(new THREE.Vector3(0, -0.22, 1.05)); kc.place(kp.x, kp.y, kp.z, R.dir + Math.PI); kc.P.sit = 1; kc.P.look = new THREE.Vector3().copy(kiyoWin.pos); kc.P.lookK = 0.5; }
  const ring = ui.row.querySelector('.ring'); const ph = K.stroke; ring.style.setProperty('--s', String(1 + 0.25 * Math.max(0, Math.cos(ph * TAU)) ** 6));
  if (R.s >= R.len - 0.05) return true;
  return false;
}
function rowPress() {
  if (K.step !== 'rowing' && K.step !== 'depart') return;
  const R = K.row; const ph = K.stroke, off = Math.min(ph, 1 - ph);
  const good = off < 0.16;
  R.v = Math.min(R.v + (good ? 1.25 : 0.55), 2.6);
  ui.row.querySelector('.hit').textContent = good ? 'Good stroke' : 'Steady…';
  SFX.splash?.();
}
addEventListener('keydown', (e) => { if (!K.on || e.repeat) return; if (e.code === 'KeyE' && (K.step === 'rowing' || K.step === 'depart')) rowPress();
  if (e.code === 'Escape' && K.on && K.step !== 'end') { if (MZ.simTime - (K.escT || -9) < 3) skip(); else { K.escT = MZ.simTime; toast('Press Esc again to skip the prologue.'); } } });
ui.row.addEventListener('click', () => rowPress());

/* ---------- the script ---------- */
const SOUTH = W(0, -12.4), NORTH = W(0, 13.6);
async function start() {
  if (K.running) return; K.running = true;
  MZ.mode = 'play'; $('title').classList.add('out'); setTimeout(() => { $('title').hidden = true; }, 1300); $('hud').classList.remove('dim');
  fade(true);
  enterWorld();
  await castReady();
  scene1();
}
async function scene1() {
  K.step = 'ferry_ready'; setTime(21.6, 'snow');
  const b = K.boat; b.g.position.copy(W(1.95, -9.4, 0.24)); b.g.rotation.set(0, 0, 0);
  placePlayer(W(0.2, -12.6), 0);
  const kc = K.cast.kiyo; if (kc) { kc.g.visible = true; b.g.updateMatrixWorld(true); const kp = b.g.localToWorld(new THREE.Vector3(0, -0.22, 1.05)); kc.place(kp.x, kp.y, kp.z, Math.PI); kc.P.sit = 1; kc.S.sit = 1; kc.P.look = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)); }
  if (K.cast.toma) K.cast.toma.g.visible = false;
  for (const v of K.villagers) v.visible = false;
  kiyoWin.k = 1;
  shot({ p: W(-5.5, -17.5, 3.0), l: W(1, 8, 1.2) });
  await wait(1.0); fade(false); letterbox(true);
  showCardBrief({ k: 'Kawashita · winter', t: 'Two Lamps', s: 'The last ferry of the night.' });
  await wait(5.2);
  await talk([kiyo('Last crossing. Then home, and my feet in the coals.', 'happy', 0.5), aoi('You said that two crossings ago.', 'tender', 0.5), kiyo('And I meant it both times.', 'happy', 0.7)]);
  letterbox(false); shot(null);
  objective('Board the ferry');
}
async function scene1Row() {
  K.step = 'rowing'; objective(''); letterbox(true);
  const b = K.boat;
  K.row = { t: 0, v: 0.4, s: 0, len: 18.8, w0: -9.4, w1: 9.4, dir: 0 };
  ui.row.hidden = false; ui.row.querySelector('.hit').textContent = '';
  shot(() => { const p = b.g.position; return { p: new THREE.Vector3(p.x - 3.4, p.y + 2.5, p.z - 4.9), l: new THREE.Vector3(p.x + 0.5, p.y + 1.0, p.z + 4.5) }; });
  duck(0.25);
  (async () => {            /* Kiyo sings the verse while Aoi rows, and the lamp waits across the water */
    await wait(1.5);
    for (let i = 0; i < 4 && K.step === 'rowing'; i++) { subtitle(VERSE[i], 6); K.cast.kiyo?.expr('tender', 0.5, 6); const d = sing(i, 'kiyo'); await wait(Math.max(5.6, d + 0.3)); }
    if (K.step === 'rowing') { subtitle('(she hums it again, softer)', 4); sing(0, 'kiyo', undefined, { whisper: true }); }
  })();
  await new Promise((res) => { K.rowDone = res; });
  ui.row.hidden = true; duck(1);
  await talk([aoi('You lit the lamp. You were right here with me.', 'tender', 0.6), kiyo('Habit. Somebody\'s always out late.', 'tender', 0.6)]);
  /* step out on the north landing */
  placePlayer(W(0.3, 9.4), 0); shot(null); letterbox(false);
  K.step = 'walk_home'; objective('Walk Kiyo home');
  const kc = K.cast.kiyo; if (kc) { kc.P.sit = 0; kc.place(-0.6, 0.55, KZ + 9.8, 0); kc.walkTo = [W(-0.6, 14.8), W(-0.3, 18.5), W(4.8, 20.6)]; }
  if (K.cast.toma) { const t = K.cast.toma; t.g.visible = true; t.place(K.tomaSpot.x, kH(K.tomaSpot.x, K.tomaSpot.z - KZ), K.tomaSpot.z, -1.2); t.P.hold = 0.7; t.P.lean = 0.3; }
}
function castWalk(c, dt, speed = 0.75) {
  if (!c || !c.walkTo || !c.walkTo.length) { if (c) c.P.walk = 0; return true; }
  const tg = c.walkTo[0], p = c.g.position; const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
  if (d < 0.25) { c.walkTo.shift(); return !c.walkTo.length; }
  const sp = Math.min(d, speed * dt); p.x += dx / d * sp; p.z += dz / d * sp; p.y = MZ.walkH(p.x, p.z);
  let a = Math.atan2(dx, dz) - c.g.rotation.y; while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; c.g.rotation.y += a * Math.min(1, dt * 4);
  c.P.walk = 0.45; return false;
}
async function tomaMeet() {
  K.flags.toma = true; const t = K.cast.toma;
  if (t) { t.P.hold = 0; t.P.lean = 0; t.P.look = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)); }
  shot(() => ({ p: W(-4.2, 12.2, 2.0), l: W(-7.0, 16.2, 1.5) }));
  await talk([toma('Ice on the oars again?'), aoi('Ice on everything.'), toma('I can fix that oarlock tomorrow.'), aoi("It's fine.", 'tender', 0.3), toma('It squeaks.'), aoi("It's a boat. It's allowed to squeak.")]);
  shot(null);
  if (t) { t.P.hold = 0.7; t.P.lean = 0.3; t.P.look = null; }
  await wait(1.6);
  await talk([kiyo('He fixed it last week. He\'ll fix it again tomorrow. You know why.'), aoi('Because it breaks.'), kiyo('Mm.', 'happy', 0.4)]);
}
async function scene2() {
  K.step = 'evening'; objective(''); fade(true); await wait(1.3);
  setTime(22.6, 'snow');
  const r = K.room.position;
  placePlayer(new THREE.Vector3(r.x - 0.7, r.y, r.z + 0.55), -Math.PI / 2 - 0.3); K.faceLock = -Math.PI / 2 - 0.3;
  const kc = K.cast.kiyo;
  if (kc) { kc.walkTo = null; kc.P.walk = 0; kc.place(r.x - 2.25, r.y + 0.12, r.z + 0.1, Math.PI / 2 + 0.2); kc.P.sit = 0; kc.S.sit = 0; kc.P.floor = 1; kc.S.floor = 1; kc.P.lean = 0.15; kc.P.look = new THREE.Vector3(r.x - 0.7, r.y + 1.0, r.z + 0.55); kc.P.lookK = 0.8; }
  if (K.cast.toma) K.cast.toma.g.visible = false;
  K.basket.visible = true; K.basket.position.set(-1.6, 0.02, -0.4);
  shotOn('wide'); letterbox(true);
  await wait(0.6); fade(false); await wait(1.4);
  duck(0.35);
  await talk([
    kiyo('Sit. You\'re dripping on my floor.'), aoi('It\'s my floor too.', null), kiyo('Then drip on your half.', 'happy', 0.6),
    narr('The kettle ticks. The fire settles.', () => shotOn('wide')),
    kiyo('My hands won\'t get warm tonight.', 'sad', 0.4), aoi('Give them here.', 'worried', 0.6, true),
    narr('Kiyo coughs, a long one. It goes on too long.', () => { K.cast.kiyo && (K.cast.kiyo.P.cough = 2.5); MZ.hero?.expr('worried', 0.9, 6); shotOn('aoi'); }),
    aoi('You\'re not fine.', 'worried', 0.9), kiyo('I\'m old. It\'s different.', 'tender', 0.5),
    kiyo('Sing it for me. The ferry song.'), aoi('You sing it. You\'re the one who knows the words.', 'tender', 0.5), kiyo('I\'m the one who\'s tired. Go on.', 'tender', 0.6),
  ]);
  await songBeat();
  K.step = 'evening';
  K.cast.kiyo?.expr('tender', 0.9, 30);
  /* the basket */
  K.basket.position.set(-1.75, 0.3, 0.25);
  await talk([
    narr('Kiyo reaches past the fire for the old reed basket and puts it in Aoi\'s hands.', () => { K.basket.position.set(-1.1, 0.42, 0.45); K.step = 'holdBasket'; shotOn('aoi'); }),
    kiyo('Take it home. Upriver.'), aoi('This is home.', 'sad', 0.8),
    narr('Kiyo doesn\'t answer. She looks at the fire for a long time.', () => { K.cast.kiyo && (K.cast.kiyo.P.look = new THREE.Vector3(r.x - 0.4, r.y + 0.1, r.z)); shotOn('kiyo'); }),
  ]);
  K.step = 'evening';
  await wait(1.2); fade(true); await wait(1.6); K.faceLock = null;
  showCardBrief({ k: 'Kawashita', t: 'Kiyo died before the morning ferry.', s: '' });
  await wait(5.5);
  /* the lamp in the window: it burns until morning, then goes out */
  setTime(5.9, 'snow'); if (K.cast.kiyo) K.cast.kiyo.g.visible = false;
  placePlayer(W(-6, 8.2), 0.4); MZ.hero && (MZ.hero.hidden = true);
  shot({ p: W(-1.2, 12.0, 2.2), l: kiyoWin.pos.clone() });
  await wait(1.0); fade(false); await wait(3.0);
  subtitle('The lamp in the window burned until morning.', 5);
  await wait(3.5); for (let i = 0; i < 40; i++) { kiyoWin.k = 1 - i / 40; await wait(0.08); } kiyoWin.k = 0;
  subtitle('Then it went out.', 4); await wait(4.2);
  MZ.hero && (MZ.hero.hidden = false); duck(1);
  scene3();
}
async function songBeat() {
  K.step = 'song';
  shotOn('aoi');
  for (let i = 0; i < 4; i++) {
    await new Promise((res) => {
      MZ.talkRun([{ who: 'Aoi', text: i === 0 ? 'Sing · press E' : 'Sing the next line · press E', hold: true }], null);
      MZ.talk.onHoldKey = () => { MZ.talk.onHoldKey = null; MZ.talk.hold = false; MZ.talkEnd(); res(); };
    });
    if (i < 3) { subtitle(VERSE[i], 6); MZ.hero?.expr('tender', 0.7, 6); const d = sing(i, 'aoi'); await wait(Math.max(4.0, d)); if (i === 1) { K.cast.kiyo?.expr('tender', 1, 8); K.cast.kiyo && (K.cast.kiyo.P.eyesClosed = true); } }
    else {
      subtitle('Row, little boat, the river…', 4); MZ.hero?.expr('grief', 0.9, 9); sing(3, 'aoi', undefined, { breakAt: 2 });
      await wait(3.2); shotOn('kiyo');
      K.cast.kiyo && (K.cast.kiyo.P.eyesClosed = false);
      subtitle('“…knows the line.”', 5); K.cast.kiyo?.expr('tender', 0.8, 8);
      const ctx = AU.ctx; if (ctx) sing(3, 'kiyo', ctx.currentTime + 0.1, { whisper: true, slow: 1.25 });
      await wait(5.0);
    }
  }
}
async function scene3() {
  K.step = 'funeral'; objective(''); fade(true); await wait(1.3);
  setTime(10.4, 'snow');
  showCardBrief({ k: 'Kawashita', t: 'The hill above the river', s: 'Three days later.' });
  const gc = K.graveCenter;
  K.villagers.forEach((v, i) => { const a = -0.6 + i * 0.42, r = 3.4 + (i % 2) * 0.6; v.position.set(gc.x + Math.sin(a) * r, 0, gc.z - 1.4 - Math.cos(a) * r * 0.6); v.position.y = MZ.walkH(v.position.x, v.position.z); v.rotation.y = Math.atan2(K.marker.x - v.position.x, K.marker.z - v.position.z); v.visible = true; });
  placePlayer(W(34.8, 49.2), Math.atan2(K.marker.x - 34.8, K.marker.z - (KZ + 49.2)));
  const t = K.cast.toma; if (t) { t.g.visible = true; t.P.hold = 0; t.P.lean = 0.08; const tp = W(37.4, 49.0); t.place(tp.x, MZ.walkH(tp.x, tp.z), tp.z, Math.atan2(K.marker.x - tp.x, K.marker.z - tp.z)); t.P.look = new THREE.Vector3(K.marker.x, K.marker.y + 1.0, K.marker.z); t.mood('sad', 0.5); }
  MZ.hero?.setMood('grief', 0.5);
  shot({ p: W(30.0, 44.0, kH(30, 44) + 2.4), l: W(36.2, 52.0, kH(36, 52) + 0.9) });
  await wait(0.5); fade(false); await wait(5.5);
  shot(null); MZ.hero?.setMood('sad', 0.45);
  objective('Talk to Toma');
  K.step = 'funeral_talk';
}
async function scene3Talk() {
  K.step = 'funeral_said'; objective('');
  const t = K.cast.toma; if (t) { t.P.look = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)); t.mood(null); }
  shot(() => ({ p: W(33.0, 47.2, kH(33, 47) + 1.9), l: W(37.2, 49.2, kH(37, 49) + 1.5) }));
  await talk([
    toma('I\'ll take you up the river. Whatever she asked.', 'worried', 0.6), aoi('She asked me. A basket and a river. It\'s an errand.', 'determined', 0.5),
    toma('Then it\'s a short trip. I\'ll have the boat ready by—', 'hopeful', 0.5), aoi('No.', 'determined', 0.8),
    toma('Aoi.', 'sad', 0.6), aoi('Go home, Toma.', 'sad', 0.7),
    narr('He doesn\'t argue. He looks at the basket for a long time.'),
  ]);
  shot(null); MZ.hero?.setMood(null);
  if (t) { t.P.look = null; t.walkTo = [W(30, 44), W(-6, 20), K.tomaSpot]; }
  objective('Go down to Kiyo\'s ferry box on the landing');
  K.step = 'box';
}
async function memory() {
  K.step = 'memory'; objective(''); letterbox(true);
  S.arsenal = S.arsenal || { have: {}, up: {} }; S.arsenal.have.revolver = 1;
  await talk([narr('Under the coiled rope and the spare oarlock, wrapped in oilcloth: Kiyo\'s revolver.')]);
  ui.mem.classList.add('on'); duck(0.3);
  /* the memory: a winter years ago, a bear on the landing */
  const kc = K.cast.kiyo; const bp = W(2.6, 12.4);
  if (kc) { kc.g.visible = true; kc.mood(null); const kp = W(-1.0, 14.0); kc.place(kp.x, MZ.walkH(kp.x, kp.z), kp.z, Math.atan2(bp.x - kp.x, bp.z - kp.z)); kc.P.sit = 0; kc.S.sit = 0; kc.P.floor = 0; kc.S.floor = 0; kc.P.walk = 0; kc.P.look = bp.clone().add(new THREE.Vector3(0, 1, 0)); }
  K.bear.visible = true; K.bear.position.set(bp.x, MZ.walkH(bp.x, bp.z), bp.z); K.bear.rotation.y = Math.PI * 0.8;
  MZ.hero && (MZ.hero.hidden = true);
  shot({ p: W(-4.6, 11.0, 2.0), l: W(0.8, 13.4, 1.2) });
  subtitle('A winter, years ago. A bear came down to the landing.', 5);
  await wait(4.0);
  if (kc) kc.P.armR = [-1.9, -0.1, 0.1];
  await wait(1.2);
  const flash = new THREE.PointLight(0xffd8a0, 0, 10, 2); flash.layers.enable(1); K.root.add(flash);
  if (kc) { kc.g.updateMatrixWorld(true); kc.anchors.handR.getWorldPosition(flash.position); }
  flash.intensity = 30; SFX.knock?.(0, 120); cam.shake = Math.max(cam.shake || 0, 0.5);
  await wait(0.12); flash.intensity = 0;
  subtitle('Kiyo fired once, into the air.', 4);
  for (let i = 0; i < 40; i++) { K.bear.position.x += 0.14; K.bear.position.z += 0.06; K.bear.position.y = MZ.walkH(K.bear.position.x, K.bear.position.z); K.bear.rotation.y = 1.3; await wait(0.04); }
  K.bear.visible = false;
  if (kc) { kc.P.armR = null; kc.expr('happy', 1, 6); kc.P.lean = -0.1; }
  subtitle('Then she laughed at herself for an hour.', 5); await wait(5.0);
  ui.mem.classList.remove('on'); if (kc) kc.g.visible = false; MZ.hero && (MZ.hero.hidden = false); K.root.remove(flash); duck(1);
  shot(null); letterbox(false);
  showCardBrief({ k: 'Found · Kiyo\'s ferry box', t: 'Kiyo\'s revolver', s: 'Six chambers, one ever fired. She only needed the noise.' });
  { const kp = 'Kiyo\'s revolver · from her ferry box'; if (!S.keepsakes.includes(kp)) S.keepsakes.push(kp); }
  toast('Kiyo\'s revolver is with your keepsakes (J).');
  await wait(3);
  K.step = 'night'; objective('Pack the basket and sleep · go to Kiyo\'s door');
}
async function scene4() {
  K.step = 'dawn'; objective(''); fade(true); await wait(1.4);
  setTime(7.05, 'clear');
  kiyoWin.k = 0;
  const b = K.boat; b.g.position.copy(W(1.95, 9.6, 0.24)); b.g.rotation.set(0, -Math.PI / 2, 0);
  placePlayer(W(0.4, 12.8), Math.PI); if (K.cast.toma) K.cast.toma.g.visible = false; for (const v of K.villagers) v.visible = false;
  await wait(0.5); fade(false);
  subtitle('Dawn. The river is the colour of the inside of a shell.', 5);
  objective('Take the ferry upriver');
  K.step = 'dawn_ready';
}
async function scene4Go() {
  K.step = 'depart'; objective(''); letterbox(true);
  const b = K.boat;
  K.row = { t: 0, v: 1.1, s: 0, len: 60, w0: 0, w1: 0, dir: -Math.PI / 2 };
  K.departT = 0;
  const tb = K.tomaBoat; tb.g.visible = true; tb.g.position.copy(W(26, -3.5, 0.02)); tb.g.rotation.y = -Math.PI / 2;
  shot(() => { const p = b.g.position; return { p: new THREE.Vector3(p.x + 5.5, p.y + 2.6, p.z - 5.2), l: new THREE.Vector3(p.x - 2, p.y + 1.0, p.z) }; });
  ui.row.hidden = true;
  (async () => { await wait(2.5); duck(0.3); subtitle('(she hums the ferry song under her breath)', 5); MZ.hero?.expr('sad', 0.5, 12);
    for (let i = 0; i < 3 && K.step === 'depart'; i++) { const d = sing(i, 'aoi', undefined, { whisper: i === 2 }); await wait(Math.max(5, d)); } duck(1); })();
  await new Promise((res) => { K.rowDone = res; });
  ui.row.hidden = true;
  /* pull back: a small boat behind her, badly hidden under a tarp */
  shot(() => { const p = b.g.position, q = tb.g.position; return { p: new THREE.Vector3(q.x + 6, 5.5, q.z + 8), l: new THREE.Vector3((p.x + q.x) / 2, 0.8, (p.z + q.z) / 2) }; });
  subtitle('Behind her, a small boat, very badly hidden.', 5);
  await wait(5.5);
  ui.title.hidden = false; ui.title.classList.add('on');
  await wait(5.0); fade(true); await wait(1.6);
  ui.title.classList.remove('on'); await wait(0.4);
  finish();
}
function finish() {
  K.step = 'end'; K.running = false;
  leaveWorld();
  S.kawa = 1; S.hours = 8.5;
  MZ.teleport(2, 60, 2, 50);
  player.face = player.faceT = Math.PI; cam.yaw = 0.32;
  fade(false);
  MZ.hero?.setMood(null);
  setTimeout(() => { toast('Upriver. A drowned valley, a mill, and a lamp in a window across the water.'); }, 2200);
  setTimeout(() => { if (S.gifts && S.gifts.length) toast('The flood left a few things on the shore. Look for the glints.'); }, 8000);
  MZ.writeSave();
}
function skip() {
  if (!K.on) return;
  K.gen++;
  K.step = 'end'; K.running = false; MZ.talkEnd?.(); fade(true);
  S.arsenal = S.arsenal || { have: {}, up: {} }; S.arsenal.have.revolver = 1;
  { const kp = 'Kiyo\'s revolver · from her ferry box'; if (!S.keepsakes.includes(kp)) S.keepsakes.push(kp); }
  setTimeout(() => { finish(); toast('Prologue skipped. Kiyo\'s revolver is with your keepsakes.'); }, 1200);
}
K.start = start; K.skip = skip;
K.jump = async (where) => {
  K.gen++; MZ.talkEnd?.(); K.shot = null; K.rowDone = null; K.faceLock = null;
  if (!K.on) { enterWorld(); await castReady(); }
  K.running = true; fade(false);
  if (where === 'ferry') scene1(); else if (where === 'row') { await scene1(); scene1Row(); } else if (where === 'home') { K.step = 'walk_home'; placePlayer(W(0.3, 9.4), 0); if (K.cast.kiyo) { K.cast.kiyo.g.visible = true; K.cast.kiyo.P.sit = 0; K.cast.kiyo.S.sit = 0; K.cast.kiyo.place(-0.6, 0.55, KZ + 9.8, 0); K.cast.kiyo.walkTo = [W(-0.6, 14.8), W(-0.3, 18.5), W(4.4, 25.8)]; } if (K.cast.toma) { const t = K.cast.toma; t.g.visible = true; t.place(K.tomaSpot.x, kH(K.tomaSpot.x, K.tomaSpot.z - KZ), K.tomaSpot.z, -1.2); } setTime(21.8, 'snow'); objective('Walk Kiyo home'); }
  else if (where === 'evening') scene2(); else if (where === 'funeral') scene3(); else if (where === 'box') { await scene3(); scene3Talk(); }
  else if (where === 'dawn') scene4(); else if (where === 'end') finish();
};

/* ---------- interactions and per-step logic ---------- */
const _ip = new THREE.Vector3();
INTERACTS.push({ x: 0.6, z: KZ - 9.6, r: 3.4, pen: -1, state() { if (!K.on || K.step !== 'ferry_ready') return null; return { ok: true, text: 'Board the ferry', verb: 'Hold E', hold: 0.4 }; }, done() { scene1Row(); }, pos: () => _ip.copy(W(1.95, -9.4, 1.4)) });
INTERACTS.push({ x: 4.8, z: KZ + 20.8, r: 2.8, state() { if (!K.on) return null; if (K.step === 'walk_home') return { ok: true, text: 'Go inside', hold: 0.5 }; if (K.step === 'night') return { ok: true, text: 'Pack the basket and sleep', hold: 0.8 }; return null; },
  done() { if (K.step === 'walk_home') scene2(); else if (K.step === 'night') scene4(); }, pos: () => _ip.copy(W(4.8, 21.2, kH(4.8, 21.2) + 1.6)) });
INTERACTS.push({ x: 11.6, z: KZ + 22.6, r: 2.4, state() { if (!K.on || ['ferry_ready', 'rowing', 'evening', 'song', 'memory', 'depart'].includes(K.step)) return null; return { ok: false, text: 'Kiyo\'s shed · locked. She always kept the key on her.' }; }, done() {}, pos: () => _ip.copy(W(11.6, 22.8, kH(11.6, 22.8) + 1.4)) });
INTERACTS.push({ x: 0, z: KZ, r: 0, upd() { const t = K.cast.toma; if (t) { this.x = t.g.position.x; this.z = t.g.position.z; this.r = 3.0; } }, state() { if (!K.on || K.step !== 'funeral_talk') return null; return { ok: true, text: 'Talk to Toma', hold: 0.3 }; }, done() { scene3Talk(); }, pos: () => { const t = K.cast.toma; return _ip.copy(t ? t.g.position : K.marker).add(new THREE.Vector3(0, 1.9, 0)); } });
INTERACTS.push({ x: -1.6, z: KZ + 14.2, r: 2.4, state() { if (!K.on || K.step !== 'box') return null; return { ok: true, text: 'Open Kiyo\'s ferry box', hold: 0.8 }; }, done() { memory(); }, pos: () => _ip.copy(W(-1.6, 14.2, kH(-1.6, 14.2) + 0.9)) });
INTERACTS.push({ x: 0.6, z: KZ + 10.2, r: 3.2, state() { if (!K.on || K.step !== 'dawn_ready') return null; return { ok: true, text: 'Take the ferry upriver', hold: 0.6 }; }, done() { scene4Go(); }, pos: () => _ip.copy(W(1.95, 9.6, 1.4)) });
HOOKS.sim.push((dt) => {
  if (!K.on) return;
  K.t += dt;
  if ((K.step === 'rowing' || K.step === 'depart') && K.row) {
    if (K.step === 'depart') {
      const R = K.row, b = K.boat;
      R.t += dt; R.v = damp(Math.max(R.v, 0.8), 0.95, 0.5, dt); R.s += R.v * dt; K.stroke = (R.t % STROKE) / STROKE;
      b.g.position.set(1.95 - R.s, 0.24 + Math.sin(R.t * 1.3) * 0.03, KZ + 9.6 * Math.max(0, 1 - R.s / 9) + 0.6 * Math.sin(R.s * 0.05)); b.g.rotation.set(0, R.dir, Math.sin(R.t * 0.9) * 0.02);
      if (b.oar) b.oar.rotation.y = Math.sin(K.stroke * TAU) * 0.45;
      b.g.updateMatrixWorld(true); const st = b.g.localToWorld(new THREE.Vector3(-0.1, -0.22, -b.L / 2 + 0.55));
      player.pos.copy(st); player.vel.set(0, 0, 0); player.vy = 0; player.grounded = true; player.face = player.faceT = R.dir;
      const tb = K.tomaBoat; const gap = tb.g.position.x - b.g.position.x;
      tb.g.position.x -= dt * (gap > 16 ? 1.25 : 0.8); tb.g.position.y = 0.2 + Math.sin(R.t * 1.4) * 0.03;
      if (R.s > 34 && K.rowDone) { const f = K.rowDone; K.rowDone = null; f(); }
    } else if (rowStep(dt) && K.rowDone) { const f = K.rowDone; K.rowDone = null; f(); }
  }
  if (K.step === 'walk_home') {
    const kc = K.cast.kiyo; castWalk(kc, dt, 0.8);
    if (kc) kc.P.look = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    if (!K.flags.toma && K.cast.toma && Math.hypot(player.pos.x - K.tomaSpot.x, player.pos.z - K.tomaSpot.z) < 6.5) tomaMeet();
  }
  if (K.step === 'box' || K.step === 'night') { const t = K.cast.toma; if (t && t.walkTo) { if (castWalk(t, dt, 1.1)) { t.walkTo = null; t.P.hold = 0.7; t.P.lean = 0.3; t.g.rotation.y = -1.2; } } }
});

/* ---------- the opening: a new game starts here ---------- */
let forceKawa = false;
const want = () => forceKawa || (PARAMS.kawa === '1') || (!MZ.sandbox && (S.kawa | 0) === 0 && PARAMS.kawa !== '0' && !PARAMS.state && !PARAMS.tp);
/* a returning player can play the new prologue without losing their valley: it ends on Mill Pond's south shore */
setTimeout(() => {
  if ((S.kawa | 0) !== 1 || MZ.sandbox) return;
  const row = document.querySelector('#title .title-actions'); if (!row) return;
  const b = document.createElement('button'); b.className = 'ghost-btn'; b.type = 'button'; b.textContent = 'Play the Kawashita prologue';
  b.addEventListener('click', () => { forceKawa = true; document.getElementById('btnStart').click(); });
  row.appendChild(b);
}, 0);
HOOKS.onStart.push(() => { if (!want()) { if (PARAMS.kawa === '0' && (S.kawa | 0) === 0 && !MZ.sandbox) S.kawa = 1; return false; } start(); return true; });
