/* ================================================================
   Mizumend · Chapter 2, the Upper Marsh (v13.3).
   Past the Reedbeds the stream opens into a wide marsh: braided channels, reed islands, willows, and three places
   where the water has stopped moving. Toma carries his reed boat up past the falls; Aoi takes it from there.
     Stillness: grief that refuses to move, and the enemy Aoi most resembles. A glassy mourner kneels on water
       that has gone flat as a mirror. It feels nothing until the water moves: paddle hard around it, throw
       something, make ripples, and then it can be mended. Sit still in its pool and you go still too.
     Races with Mira, out and back round the islands. Win twice and she gives you the festival archer's bow.
     Three boat secrets behind the reeds: a drowned farmhouse (the double-barrel), a willow shrine (fire-arrows),
       the reedcutters' hut (the machete). Each comes with its memory.
     A heron at dusk on the old mooring post. Drift in without a stroke and it lets you watch.
     The narrows at the top of the marsh are jammed with flood timber: the gorge is next (v13.4).
   The marsh sits far from the valley (world z = UZ + w) with its own ground, water and current, like Kawashita.
   Debug: #tp:reedbeds (or tp=reedbeds) starts in the boat at the landing; #tp:gorge at the narrows.
     window.__mzu: tp(where), spawnStill(i), mend(i), race(n), heron(), secret(i), leave().
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
const { HOOKS, scene, camera, player, cam, S, PARAMS, makeToon, addOutline, clamp, lerp, damp, rr, rnd, G, $, SFX, INTERACTS, toast, showCardBrief } = MZ;

const UZ = 3000;
const TAU = Math.PI * 2;
const U = { on: false, built: false, gen: 0, root: new THREE.Group(), still: [], race: null, flowK: 1, area: 'The Upper Marsh', tasks: [], onBuild: [], spots: {}, onSim: [], areaExt: null, tasksExt: null };
MZ.up = U;
if (PARAMS.debug === '1' || PARAMS.debug === 'true') window.__mzu = U;
const B = () => MZ.boat;
const up = () => { S.up = S.up || {}; const u = S.up; u.still = Array.isArray(u.still) ? u.still : [0, 0, 0]; u.sec = u.sec | 0; u.races = u.races | 0; return u; };

/* ---------- noise ---------- */
function hsh(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hsh(xi, yi), hsh(xi + 1, yi), u), lerp(hsh(xi, yi + 1), hsh(xi + 1, yi + 1), u), v); }
function fbm(x, y) { return vn(x, y) * 0.55 + vn(x * 2.1 + 5.2, y * 2.1 - 1.7) * 0.3 + vn(x * 4.3 - 2.1, y * 4.3 + 7.3) * 0.15; }
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let seed = 7; const srnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const srr = (a, b) => a + (b - a) * srnd();

/* ---------- the river: a smooth line from the landing up to the narrows ---------- */
const CTRL = [[0, -40], [0, -8], [3, 24], [14, 62], [8, 100], [-18, 134], [-34, 172], [-22, 210], [8, 238], [36, 272], [40, 312], [20, 346], [-4, 376], [-14, 410], [-8, 440], [4, 470], [8, 505], [2, 540], [-6, 575], [4, 612], [20, 650], [14, 692], [-8, 730], [-14, 770], [0, 806], [10, 842], [6, 870]];
function catmull(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]); }
  }
  out.push(pts[pts.length - 1].slice()); return out;
}
function mkLine(pts) {
  const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, s, L: s[s.length - 1] };
}
function lineAt(line, st) {
  const { pts, s } = line; st = clamp(st, 0, line.L);
  let lo = 0, hi = s.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= st) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], seg = s[hi] - s[lo] || 1, t = (st - s[lo]) / seg;
  const tx = (b[0] - a[0]) / seg, tz = (b[1] - a[1]) / seg;
  return { u: lerp(a[0], b[0], t), w: lerp(a[1], b[1], t), tx, tz, nx: -tz, nz: tx };
}
const MAIN = mkLine(catmull(CTRL, 2));
const S0 = 40;                                   /* the station at w = 0: the landing is just above it */
/* the marsh, then the narrows, then the gorge's mouth */
const gk = (s) => sm(S0 + 380, S0 + 430, s);
const hwAt = (s) => lerp(10.5 + 3 * Math.sin(s * 0.031) + 1.8 * Math.sin(s * 0.013 + 1.0), 5.6 + 0.5 * Math.sin(s * 0.05), gk(s));
const depthAt = (s) => lerp(1.35, 2.3, gk(s));
const slopeAt = (s) => lerp(0.24, 1.7, gk(s));
const flowSpd = (s) => lerp(0.2, 0.75 + 0.35 * Math.sin(s * 0.045) ** 2, gk(s)) * (s < S0 + 12 ? 1.8 : 1) * (s > MAIN.L - 30 ? sm(MAIN.L, MAIN.L - 30, s) : 1);
function P(s, lat = 0) { const p = lineAt(MAIN, s); return { u: p.u + p.nx * lat, w: p.w + p.nz * lat, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz }; }
function Pf(s, f) { return P(s, f * hwAt(s)); }

/* reed islands in the marsh: [station, lateral fraction of the half-width, radius] */
const ISL = [[S0 + 70, 0.05, 4.6], [S0 + 140, -0.38, 3.8], [S0 + 178, 0.42, 3.2], [S0 + 236, 0.0, 5.6], [S0 + 300, -0.3, 4.2], [S0 + 352, 0.36, 3.4]].map(([s, f, r]) => { const p = Pf(s, f); return { s, u: p.u, w: p.w, r }; });
/* side channels to the three secrets: from a station, out to one side, ending in a hidden pool */
function sideLine(s0, side, steps) { const b = P(s0); const pts = [[b.u, b.w]];
  for (const [along, out] of steps) pts.push([b.u + b.tx * along + b.nx * out * side, b.w + b.tz * along + b.nz * out * side]);
  return mkLine(catmull(pts, 1.5)); }
const SIDES = [
  { id: 'farm', line: sideLine(S0 + 116, -1, [[2, 11], [8, 20], [16, 28], [26, 36], [34, 44]]), hw: 2.5, pool: 13, curtain: [3, 9] },
  { id: 'shrine', line: sideLine(S0 + 262, 1, [[1, 11], [5, 18], [9, 25]]), hw: 2.6, pool: 9, curtain: [2, 8] },
  { id: 'hut', line: sideLine(S0 + 370, -1, [[1, 9], [-3, 16], [-8, 23], [-11, 30]]), hw: 1.9, pool: 7.5, curtain: [2, 9] },
];
for (const sd of SIDES) { const e = sd.line.pts[sd.line.pts.length - 1]; sd.pu = e[0]; sd.pw = e[1]; }
/* the three still pools, the heron's post, the landing, the narrows */
const STILL = [S0 + 92, S0 + 206, S0 + 322].map((s, i) => { const p = Pf(s, [0.2, -0.15, 0.1][i]); return { s, u: p.u, w: p.w, r: 10 }; });
const LANDING = (() => { const p = P(S0 + 14); const side = 1; const hw = hwAt(S0 + 14); return { u: p.u + p.nx * side * (hw + 1.0), w: p.w + p.nz * side * (hw + 1.0), nx: p.nx * side, nz: p.nz * side, tx: p.tx, tz: p.tz, boat: { u: p.u + p.nx * side * (hw - 2.2), w: p.w + p.nz * side * (hw - 2.2) } }; })();
const HERON = (() => { const s = S0 + 284, hw = hwAt(s); const p = P(s, -(hw - 3.6)); return { s, u: p.u, w: p.w }; })();
/* the gorge (v13.4): gravel bars against the walls where a boat can put in, the deep pool under the falls at the top,
   and the ledge above it where the lodge stands */
const BARS = [{ id: 'tower', s: S0 + 486, side: -1, r: 5.6 }, { id: 'ferry', s: S0 + 606, side: 1, r: 5.2 }, { id: 'quarry', s: S0 + 716, side: -1, r: 5.8 }].map((b) => { const hw = hwAt(b.s); const p = P(b.s, b.side * (hw - 0.6)); return { ...b, u: p.u, w: p.w, nx: p.nx * b.side, nz: p.nz * b.side, tx: p.tx, tz: p.tz }; });
const POOL = (() => { const e = lineAt(MAIN, MAIN.L); const R = 13; const c = { u: e.u + e.tx * 7, w: e.w + e.tz * 7 }; return { u: c.u, w: c.w, R, tx: e.tx, tz: e.tz, nx: e.nx, nz: e.nz,
  beach: { u: c.u + e.nx * (R - 2.2) - e.tx * 7, w: c.w + e.nz * (R - 2.2) - e.tz * 7, r: 4.6 }, fall: { u: c.u + e.tx * (R + 1.0), w: c.w + e.tz * (R + 1.0) } }; })();
const LEDGE = { u: POOL.u + POOL.nx * (POOL.R + 4.2) + POOL.tx * 2, w: POOL.w + POOL.nz * (POOL.R + 4.2) + POOL.tz * 2, y: 7.2, hx: 4.6, hz: 5.0, ang: Math.atan2(POOL.tx, POOL.tz) };
const NARROWS = (() => { const p = P(S0 + 448); return { s: S0 + 448, u: p.u, w: p.w, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz }; })();

/* ---------- the ground: a grid, built once (1 m cells) ---------- */
const GR = { u0: 0, w0: 0, nu: 0, nw: 0, h: null, s: null, d: null, ds: null };
function buildGrid() {
  let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9;
  for (const [u, w] of MAIN.pts) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
  const M = 95; u0 = Math.floor(u0 - M); u1 = Math.ceil(u1 + M); w0 = Math.floor(w0 - 20); w1 = Math.ceil(w1 + 60);
  const nu = u1 - u0 + 1, nw = w1 - w0 + 1, N = nu * nw;
  const D = new Float32Array(N).fill(1e9), SS = new Float32Array(N), DS = new Float32Array(N).fill(1e9), SI = new Int8Array(N).fill(-1);
  const raster = (line, R, Dd, Ss, idx) => {
    const { pts, s } = line;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const iu0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - R - u0)), iu1 = Math.min(nu - 1, Math.ceil(Math.max(a[0], b[0]) + R - u0));
      const iw0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - R - w0)), iw1 = Math.min(nw - 1, Math.ceil(Math.max(a[1], b[1]) + R - w0));
      for (let j = iw0; j <= iw1; j++) { const w = w0 + j; for (let k = iu0; k <= iu1; k++) { const u = u0 + k;
        let t = ((u - a[0]) * dx + (w - a[1]) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = u - (a[0] + dx * t), ez = w - (a[1] + dz * t), d = Math.sqrt(ex * ex + ez * ez); const c = j * nu + k;
        if (d < Dd[c]) { Dd[c] = d; if (Ss) Ss[c] = s[i] + t * Math.sqrt(L2); if (idx !== undefined) SI[c] = idx; } } }
    }
  };
  raster(MAIN, M, D, SS);
  SIDES.forEach((sd, i) => raster(sd.line, 30, DS, null, i));
  const H = new Float32Array(N);
  for (let j = 0; j < nw; j++) for (let k = 0; k < nu; k++) {
    const c = j * nu + k, u = u0 + k, w = w0 + j, d = D[c], s = SS[c];
    const hw = hwAt(s), g = gk(s);
    let land = 0.5 + 0.38 * fbm(u * 0.035, w * 0.035) + 0.12 * vn(u * 0.2, w * 0.2);
    land += sm(42, 125, d) * (5 + 13 * vn(u * 0.012 + 3, w * 0.012 - 1));                         /* the valley's sides */
    if (g > 0) land += g * sm(hw + 0.6, hw + 9, d) * (14 + 7 * vn(u * 0.03, w * 0.03) + 1.6 * Math.round(vn(u * 0.07 + 2, w * 0.07) * 3) + Math.max(0, s - S0 - 440) * 0.05);   /* the gorge walls, in rough terraces */
    const dep = depthAt(s), k2 = slopeAt(s);
    let carve = d < hw ? -dep * (1 - (d / hw) ** 2) : (d - hw) * k2;
    if (s < S0 + 6) carve = Math.max(carve, -0.1);                                                /* the riffle below the landing */
    let h = Math.min(land, carve);
    const si = SI[c];
    if (si >= 0) { const sd = SIDES[si], ds = DS[c]; const cs = ds < sd.hw ? -1.0 * (1 - (ds / sd.hw) ** 2) : (ds - sd.hw) * 0.3; h = Math.min(h, cs);
      const dp = Math.hypot(u - sd.pu, w - sd.pw); const cp = dp < sd.pool ? -1.25 * (1 - (dp / sd.pool) ** 2) : (dp - sd.pool) * 0.28; h = Math.min(h, cp); }
    for (const is of ISL) { const di = Math.hypot(u - is.u, w - is.w); if (di < is.r * 1.3) h = Math.max(h, 0.42 + 0.15 * vn(u * 0.5, w * 0.5) - 1.7 * (di / is.r) ** 2); }
    /* the gorge: the deep pool, its beach, the bars, the lodge's ledge */
    { const dp = Math.hypot(u - POOL.u, w - POOL.w); if (dp < POOL.R + 30) { const cp = dp < POOL.R ? -3.0 * (1 - (dp / POOL.R) ** 2) : (dp - POOL.R) * 1.9; h = Math.min(h, cp); } }
    { const b = POOL.beach, db = Math.hypot(u - b.u, w - b.w); if (db < b.r * 1.3) h = Math.max(h, 0.32 - 1.3 * (db / b.r) ** 2); }
    for (const b of BARS) { const db = Math.hypot(u - b.u, w - b.w); if (db < b.r * 1.3) h = Math.max(h, 0.34 + 0.08 * vn(u * 0.6, w * 0.6) - 1.2 * (db / b.r) ** 2); }
    { const lu = (u - LEDGE.u) * Math.cos(LEDGE.ang) - (w - LEDGE.w) * Math.sin(LEDGE.ang), lw = (u - LEDGE.u) * Math.sin(LEDGE.ang) + (w - LEDGE.w) * Math.cos(LEDGE.ang);
      if (Math.abs(lu) < LEDGE.hx && Math.abs(lw) < LEDGE.hz) h = LEDGE.y; }
    H[c] = h;
  }
  Object.assign(GR, { u0, w0, nu, nw, h: H, s: SS, d: D, ds: DS, si: SI });
}
function grid(arr, u, w, out = 40) {
  const fu = u - GR.u0, fw = w - GR.w0; if (fu < 0 || fw < 0 || fu >= GR.nu - 1 || fw >= GR.nw - 1) return out;
  const k = Math.floor(fu), j = Math.floor(fw), a = fu - k, b = fw - j, c = j * GR.nu + k;
  return lerp(lerp(arr[c], arr[c + 1], a), lerp(arr[c + GR.nu], arr[c + GR.nu + 1], a), b);
}
function uH(u, w) { if (!GR.h) buildGrid(); return grid(GR.h, u, w, 40); }
function stAt(u, w) { if (!GR.h) buildGrid(); const fu = Math.round(u - GR.u0), fw = Math.round(w - GR.w0); if (fu < 0 || fw < 0 || fu >= GR.nu || fw >= GR.nw) return { s: 0, d: 1e9 }; const c = fw * GR.nu + fu; return { s: GR.s[c], d: GR.d[c], si: GR.si[c], ds: GR.ds[c] }; }
U.uH = uH; U.stAt = stAt;
const W = (u, w, y = 0) => new THREE.Vector3(u, y, UZ + w);

/* the far region's hooks: Kawashita's below z 2000, the marsh above it */
{ const kG = HOOKS.farGround, kD = HOOKS.farDepth, kW = HOOKS.farWalk, kS = HOOKS.farStep;
  HOOKS.farGround = (x, z) => z > 2000 ? uH(x, z - UZ) : (kG ? kG(x, z) : 0);
  HOOKS.farDepth = (x, z) => z > 2000 ? 0 - uH(x, z - UZ) : (kD ? kD(x, z) : 0);
  HOOKS.farWalk = (x, z) => z > 2000 ? Math.max(uH(x, z - UZ), deckAt(x, z - UZ)) : (kW ? kW(x, z) : 0);
  HOOKS.farStep = (fx, fz, tx, tz) => {
    if (tz <= 2000) return kS ? kS(fx, fz, tx, tz) : null;
    const w = tz - UZ;
    if (deckAt(tx, w) > -1e8) return true;
    if (0 - uH(tx, w) > 0.32) return false;                       /* the river: by boat, not on foot */
    for (const c of COLL) if (Math.abs(tx - c.u) < c.hx && Math.abs(w - c.w) < c.hz) return false;
    const h0 = uH(fx, fz - UZ), h1 = uH(tx, w); if (h1 - h0 > 0.45) return false;    /* the gorge walls */
    return true;
  };
}
const DECKS = [];
function deckAt(u, w) { for (const d of DECKS) { const lu = (u - d.u) * d.c + (w - d.w) * d.s, lw = -(u - d.u) * d.s + (w - d.w) * d.c; if (Math.abs(lu) < d.hx && Math.abs(lw) < d.hz) return d.y; } return -1e9; }
const COLL = [];

/* the current: downstream along the line, strongest mid-channel; the still pools hold it */
const _fv = new THREE.Vector2();
U.flow = (x, z, out = _fv) => {
  const w = z - UZ, st = stAt(x, w); if (st.d > 60) return out.set(0, 0);
  const s = st.s, hw = hwAt(s), p = lineAt(MAIN, s);
  let k = flowSpd(s) * clamp(1 - (st.d / (hw + 1)) ** 2, 0, 1) * U.flowK;
  for (const sp of U.still) if (sp.k > 0) { const d = Math.hypot(x - sp.x, z - sp.z); if (d < sp.r + 3) k *= 1 - sp.k * (1 - sm(sp.r - 2, sp.r + 3, d)); }
  return out.set(-p.tx * k, -p.tz * k);
};
U.waterY = () => 0;
U.dragAt = (x, z) => { const w = z - UZ, h = uH(x, w); let dr = 0; if (h > -0.65) dr += 0.9 * sm(-0.65, -0.3, h); for (const c of CURT) if (Math.hypot(x - c.x, z - c.z) < c.r) dr += 0.7; return dr; };
U.canStand = (x, z) => { const w = z - UZ; return 0 - uH(x, w) < 0.3 || deckAt(x, w) > -1e8; };

/* ---------- materials ---------- */
const tn = (c, o = {}) => makeToon(c, Object.assign({ noHeal: true, rim: 0.22 }, o));
const MT = {
  wood: tn(0x6a5038), woodDk: tn(0x4a3828), plank: tn(0x8a6a48), roof: tn(0x5a5048), thatch: tn(0xa8925a), stone: tn(0x8a8478), plaster: tn(0xc8bca4),
  bark: tn(0x5a4a3a), leaf: tn(0x5e8c42, { tag: 'upleaf' }), leaf2: tn(0x7aa04c, { tag: 'upleaf2' }), willow: tn(0x7a9c4e, { tag: 'upwillow' }),
  rope: tn(0xb89a6a), cloth: tn(0xb0402c), lily: tn(0x4f8a3c, { tag: 'lily' }), lotus: tn(0xf2b8c8, { tag: 'lotus' }), rock: tn(0x7a756c, { tag: 'uprock' }),
  paper: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.6), fog: true }),
};

/* ---------- building it (on the first visit) ---------- */
const CURT = [];       /* reed curtains in front of the secrets: thick, and they lean aside for the boat */
function build() {
  if (U.built) return; U.built = true;
  if (!GR.h) buildGrid();
  seed = 7;
  U.root.name = 'upriver'; scene.add(U.root);
  const stat = new THREE.Group(); U.root.add(stat);
  buildTerrain(); buildWater(); buildReeds(); buildLilies();
  buildTrees(stat); buildLanding(stat); buildNarrows(stat); buildSecrets(stat); buildHeronPost(stat);
  buildStill(); buildMira();
  for (const f of U.onBuild) f(stat);
  MZ.bakeStatic?.(stat);
  U.root.traverse((o) => o.layers.enable(2));
}

function buildTerrain() {
  const step = 2, nu = Math.floor((GR.nu - 1) / step) + 1, nw = Math.floor((GR.nw - 1) / step) + 1;
  const pos = new Float32Array(nu * nw * 3), col = new Float32Array(nu * nw * 3), idx = [];
  const c = new THREE.Color(), t = new THREE.Color();
  const BED = new THREE.Color(0x4c4a34), MUD = new THREE.Color(0x6e5c3c), SAND = new THREE.Color(0xb8a070), MEAD = new THREE.Color(0x86a04a), GOLD = new THREE.Color(0xb8a456), HILL = new THREE.Color(0x4f8240), FOREST = new THREE.Color(0x3a6a3c), ROCK = new THREE.Color(0x857e72), ROCK2 = new THREE.Color(0x6a655c);
  for (let j = 0; j < nw; j++) for (let k = 0; k < nu; k++) {
    const gu = k * step, gw = j * step, u = GR.u0 + gu, w = GR.w0 + gw, ci = gw * GR.nu + gu, h = GR.h[ci], s = GR.s[ci], d = GR.d[ci];
    const i = j * nu + k; pos[i * 3] = u; pos[i * 3 + 1] = h; pos[i * 3 + 2] = UZ + w;
    const n1 = fbm(u * 0.05, w * 0.05), n2 = vn(u * 0.3, w * 0.3);
    if (h < -0.3) c.copy(BED).lerp(MUD, sm(-1.2, -0.3, h) * 0.6);
    else if (h < 0.35) c.copy(MUD).lerp(SAND, sm(0.0, 0.3, h) * 0.5 * n2);
    else { c.copy(MEAD).lerp(GOLD, sm(0.35, 0.7, n1) * 0.7); c.lerp(HILL, sm(2, 8, h) * 0.8); c.lerp(FOREST, sm(8, 16, h) * 0.6 * n2 + 0.0); }
    /* the gorge: rock where it's steep */
    const hx = GR.h[Math.min(ci + 1, GR.h.length - 1)] - GR.h[Math.max(ci - 1, 0)], hz = GR.h[Math.min(ci + GR.nu, GR.h.length - 1)] - GR.h[Math.max(ci - GR.nu, 0)];
    const slope = Math.hypot(hx, hz) / 2;
    const rk = Math.max(sm(0.55, 1.2, slope), gk(s) * sm(1.2, 3.5, h)); if (rk > 0) { t.copy(ROCK).lerp(ROCK2, vn(u * 0.4, h * 0.8)); c.lerp(t, rk); }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  for (let j = 0; j < nw - 1; j++) for (let k = 0; k < nu - 1; k++) { const a = j * nu + k; idx.push(a, a + nu, a + 1, a + 1, a + nu, a + nu + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = new Float32Array(nu * nw * 2); for (let i = 0; i < nu * nw; i++) { uv[i * 2] = pos[i * 3] * 0.08; uv[i * 2 + 1] = pos[i * 3 + 2] * 0.08; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const tex = MZ.brushTexture ? MZ.brushTexture() : null;
  const m = new THREE.Mesh(g, makeToon(0xffffff, { vc: true, noHeal: true, map: tex, mapKey: tex ? 'brushUp' : undefined, rim: 0.0, tint: 'ground' }));
  m.receiveShadow = true; U.root.add(m); U.ground = m;
}

/* the water: only where there is water, with depth and the current on each vertex */
function buildWater() {
  const step = 2, nu = Math.floor((GR.nu - 1) / step) + 1, nw = Math.floor((GR.nw - 1) / step) + 1;
  const vid = new Int32Array(nu * nw).fill(-1); const pos = [], dep = [], flo = [], idx = [];
  const hAt = (k, j) => GR.h[(j * step) * GR.nu + k * step];
  const vert = (k, j) => { const i = j * nu + k; if (vid[i] >= 0) return vid[i];
    const u = GR.u0 + k * step, w = GR.w0 + j * step; vid[i] = pos.length / 3; pos.push(u, 0, UZ + w); dep.push(-hAt(k, j));
    const f = U.flow(u, UZ + w, new THREE.Vector2()); flo.push(f.x, f.y); return vid[i]; };
  for (let j = 0; j < nw - 1; j++) for (let k = 0; k < nu - 1; k++) {
    const m = Math.min(hAt(k, j), hAt(k + 1, j), hAt(k, j + 1), hAt(k + 1, j + 1)); if (m > 0.06) continue;
    const a = vert(k, j), b = vert(k + 1, j), c2 = vert(k, j + 1), d = vert(k + 1, j + 1); idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aD', new THREE.Float32BufferAttribute(dep, 1)); g.setAttribute('aF', new THREE.Float32BufferAttribute(flo, 2)); g.setIndex(idx);
  const WU = MZ.waterU || {};
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uStill: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 0)) }, uFlowK: { value: 1 }, uLights: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -99, 0, 0)) } }]);
  for (const k of ['uSunDir', 'uSunCol', 'uZen', 'uHor', 'uCloudLit', 'uNight', 'uMoonDir', 'uRip']) u[k] = WU[k] || { value: k === 'uNight' ? 0 : k === 'uRip' ? [] : new THREE.Vector3(0, 1, 0) };
  u.uTime = G.uTime;
  const GL = MZ.GLSL || {};
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, fog: true,
    vertexShader: `attribute float aD; attribute vec2 aF; varying float vD; varying vec2 vF; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vD=aD; vF=aF; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying float vD; varying vec2 vF; varying vec3 vW;
      uniform float uTime,uNight,uFlowK; uniform vec3 uSunDir,uSunCol,uZen,uHor,uCloudLit,uMoonDir; uniform vec4 uStill[4]; uniform vec4 uRip[12]; uniform vec4 uLights[4];
      ${GL.NOISE || 'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float n21(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x),u.y);}'}
      #include <fog_pars_fragment>
      void main(){
        float depth=vD; if(depth<-0.02) discard;
        vec2 p=vW.xz; float t=uTime; vec2 fl=vF*uFlowK; float sp=length(fl);
        vec2 q=p-fl*t*1.5;
        vec2 g=vec2(cos(q.x*0.9+t*1.1),sin(q.y*0.7+t*0.9))*0.03+vec2(cos((q.x+q.y)*1.7-t*1.6),sin((q.x-q.y)*1.5+t*1.3))*0.02;
        g+=(vec2(n21(q*1.3+t*0.3),n21(q*1.3-t*0.27+5.0))-0.5)*0.08;
        float foamR=0.0;
        for(int i=0;i<12;i++){ vec4 rp=uRip[i]; float age=t-rp.z; if(age<0.0||age>3.2) continue;
          vec2 dv=p-rp.xy; float d=length(dv)+1e-4; float ring=d-age*1.5; float w=exp(-ring*ring*6.0)*(1.0-age/3.2)*rp.w; g+=dv/d*w*0.22; foamR+=w*0.28; }
        /* the still pools: flat as glass, silvered */
        float glass=0.0;
        for(int i=0;i<4;i++){ vec4 s=uStill[i]; if(s.w<0.01) continue; float d=distance(p,s.xy); float k=s.w*(1.0-smoothstep(s.z-2.5,s.z+1.0,d)); glass=max(glass,k);
          float rim=exp(-pow((d-s.z)*1.6,2.0))*s.w; foamR+=rim*0.18; }
        g*=1.0-glass*0.96;
        vec3 n=normalize(vec3(-g.x,1.0,-g.y));
        vec3 v=normalize(cameraPosition-vW);
        float fres=pow(1.0-max(dot(n,v),0.0),4.0)*0.8+0.12;
        fres=mix(fres,0.72,glass*0.8);
        vec3 r=reflect(-v,n);
        vec3 skyc=mix(uHor,uZen,pow(max(r.y,0.0),0.5));
        float sd=max(dot(r,uSunDir),0.0); float spec=pow(sd,240.0)*7.0+pow(sd,40.0)*0.25;
        vec3 shallow=vec3(0.50,0.62,0.44), mid=vec3(0.20,0.40,0.36), deep=vec3(0.08,0.20,0.22);
        vec3 body=mix(shallow,mid,smoothstep(0.0,0.8,depth)); body=mix(body,deep,smoothstep(0.8,2.6,depth));
        { float bl=dot(body,vec3(0.3,0.59,0.11)); body=mix(body,vec3(bl*0.5,bl*0.6,bl*0.85),uNight*0.85)*mix(1.0,0.45,uNight); }
        fres=mix(fres,max(fres,0.62),uNight);
        vec3 col=mix(body,skyc,fres);
        col+=uSunCol*spec*(1.0-uNight*0.85);
        { float mdw=max(dot(r,uMoonDir),0.0); col+=vec3(0.95,0.92,0.8)*(pow(mdw,400.0)*4.5+pow(mdw,30.0)*0.25)*uNight; }
        /* lamps on the water at night */
        { vec3 dv=normalize(vW-cameraPosition); vec3 wl=vec3(0.0);
          for(int i=0;i<4;i++){ vec4 L=uLights[i]; if(L.w<0.01) continue; vec3 mL=vec3(L.x,-L.y,L.z); vec3 dm=normalize(mL-cameraPosition);
            vec2 a=normalize(dv.xz),b=normalize(dm.xz); float hx=abs(a.x*b.y-a.y*b.x); float vy=dv.y-dm.y; float along=clamp(1.0-abs(vy)/0.16,0.0,1.0);
            float brk=smoothstep(0.25,0.7,n21(vec2(vW.x*0.5+vW.z*0.5,(vW.x-vW.z)*3.5)+vec2(0.0,t*0.8)));
            wl+=vec3(1.0,0.66,0.3)*L.w*smoothstep(0.012,0.0,hx-0.003*along)*along*along*(0.35+0.65*brk)*step(0.0,dot(a,b)); }
          col+=wl*uNight*1.6; }
        /* the current: streaks of foam where it runs fast */
        vec2 fd=sp>0.01?fl/sp:vec2(1.0,0.0); vec2 rq=vec2(dot(p,fd),dot(p,vec2(-fd.y,fd.x)));
        float streak=smoothstep(0.66,0.92,n21(vec2(rq.x*0.35-t*sp*1.2,rq.y*2.2)))*smoothstep(0.35,0.9,sp);
        float fn=n21(p*2.5+t*0.25);
        float foam=1.0-smoothstep(0.0,0.2+0.14*fn,depth);
        foam*=0.55+0.45*sin(depth*28.0-t*2.2+fn*6.0);
        foam=clamp(foam+foamR+streak*0.5,0.0,1.0)*(1.0-glass*0.7);
        col=mix(col,vec3(0.94,0.96,1.0)*mix(1.0,0.16,uNight),foam*0.75);
        float a=mix(0.82,0.96,smoothstep(0.0,1.2,depth)); a=max(a,glass*0.95);
        a*=smoothstep(-0.02,0.08,depth);
        gl_FragColor=vec4(col,a);
        #include <fog_fragment>
        ${GL.OUT || ''}
      }` }));
  m.renderOrder = 2; m.frustumCulled = false; U.root.add(m); U.water = m; U.waterU = u;
}

/* reeds: thick along the edges and on the islands, a clear fairway down the middle */
function buildReeds() {
  if (!MZ.reedGeo) return;
  const pts = [];
  const tryAt = (u, w, sMul = 1) => { const h = uH(u, w); if (h < -0.6 || h > 0.5) return false; pts.push([u, w, srr(1.1, 1.9) * sMul, h]); return true; };
  const tier = MZ.tier?.() || 'medium', RN = { low: 1500, medium: 2400, high: 3400, ultra: 4200 }[tier] || 2400;   /* reeds are most of the marsh's triangles */
  for (let k = 0; k < 16000 && pts.length < RN; k++) {
    const s = srr(S0 + 8, S0 + 405), hw = hwAt(s), lat = srr(-hw - 7, hw + 7); const p = P(s, lat);
    const st = stAt(p.u, p.w); if (st.d < hw * 0.62 && !ISL.some((is) => Math.hypot(p.u - is.u, p.w - is.w) < is.r)) continue;
    if (vn(p.u * 0.11, p.w * 0.11) < 0.3) continue;
    if (st.si >= 0 && st.ds < SIDES[st.si].hw * 0.8) continue;
    if (Math.hypot(p.u - LANDING.u, p.w - LANDING.w) < 6) continue;
    if (Math.hypot(p.u - HERON.u, p.w - HERON.w) < 7) continue;                 /* the heron's post stands clear */
    tryAt(p.u, p.w);
  }
  /* the curtains: dense, and standing in deeper water than reeds usually do */
  const curt = [];
  for (const sd of SIDES) for (let a = sd.curtain[0]; a < sd.curtain[1]; a += 0.35) { const p = lineAt(sd.line, a);
    for (let l = -sd.hw - 1.5; l <= sd.hw + 1.5; l += 0.55) { const u = p.u + p.nx * l + srr(-0.2, 0.2), w = p.w + p.nz * l + srr(-0.2, 0.2); curt.push([u, w, srr(1.6, 2.2), uH(u, w)]); } }
  SIDES.forEach((sd) => { const a = lineAt(sd.line, (sd.curtain[0] + sd.curtain[1]) / 2); CURT.push({ x: a.u, z: UZ + a.w, r: sd.hw + 2.5 }); });
  const dummy = new THREE.Object3D();
  const mk = (list) => { const im = new THREE.InstancedMesh(MZ.reedGeo(), MZ.reedMat, Math.max(1, list.length)); im.castShadow = tier === 'high' || tier === 'ultra'; im.frustumCulled = false;
    list.forEach((q, i) => { dummy.position.set(q[0], Math.max(q[3], -0.6) - 0.05, UZ + q[1]); dummy.rotation.set(0, srnd() * TAU, 0); dummy.scale.set(q[2] * 0.9, q[2], q[2] * 0.9); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    U.root.add(im); return im; };
  U.reeds = mk(pts); U.curtain = mk(curt); U.curtData = curt;
}
const _dm = new THREE.Object3D();
function curtainStep() {
  /* the curtain reeds lean away from the boat as it pushes through */
  const b = B(); if (!U.curtain || !b?.on) return;
  let near = false; for (const c of CURT) if (Math.hypot(b.x - c.x, b.z - c.z) < c.r + 4) near = true; if (!near && !U.curtBent) return;
  U.curtBent = near;
  U.curtData.forEach((q, i) => { const x = q[0], z = UZ + q[1]; const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
    const k = near ? clamp(1 - d / 2.4, 0, 1) : 0;
    _dm.position.set(x, Math.max(q[3], -0.6) - 0.05, z); _dm.rotation.set(0, 0, 0); _dm.scale.set(q[2] * 0.9, q[2], q[2] * 0.9);
    if (k > 0) { const ax = dz / (d || 1), az = -dx / (d || 1); _dm.rotateOnWorldAxis(new THREE.Vector3(ax, 0, az), -k * 0.9); }
    _dm.updateMatrix(); U.curtain.setMatrixAt(i, _dm.matrix); });
  U.curtain.instanceMatrix.needsUpdate = true;
}
function buildLilies() {
  const pads = [], flowers = [];
  const add = (u, w) => { const h = uH(u, w); if (h > -0.25 || h < -1.3) return; pads.push([u, w, srr(0.25, 0.5), srnd() * TAU]); if (srnd() < 0.12) flowers.push([u, w]); };
  for (const sd of SIDES) for (let i = 0; i < 70; i++) { const a = srnd() * TAU, r = Math.sqrt(srnd()) * sd.pool; add(sd.pu + Math.cos(a) * r, sd.pw + Math.sin(a) * r); }
  for (let i = 0; i < 260; i++) { const s = srr(S0 + 20, S0 + 400), hw = hwAt(s); const p = P(s, (srnd() < 0.5 ? -1 : 1) * srr(hw * 0.65, hw * 0.95)); if (vn(p.u * 0.08, p.w * 0.08) > 0.5) add(p.u, p.w); }
  const pg = new THREE.CircleGeometry(1, 10, 0.25, TAU - 0.5); pg.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(pg, MT.lily, Math.max(1, pads.length)); im.receiveShadow = true;
  const d = new THREE.Object3D(); pads.forEach((q, i) => { d.position.set(q[0], 0.015, UZ + q[1]); d.rotation.set(0, q[3], 0); d.scale.setScalar(q[2]); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  U.root.add(im);
  const fg = new THREE.ConeGeometry(0.09, 0.12, 6); fg.translate(0, 0.06, 0);
  const fm = new THREE.InstancedMesh(fg, MT.lotus, Math.max(1, flowers.length));
  flowers.forEach((q, i) => { d.position.set(q[0] + 0.1, 0.02, UZ + q[1]); d.rotation.set(Math.PI, 0, 0); d.scale.setScalar(1); d.position.y = 0.14; d.updateMatrix(); fm.setMatrixAt(i, d.matrix); });
  U.root.add(fm);
}
function tree(g, u, w, s, kind) {
  const t = new THREE.Group(); t.position.set(u, uH(u, w) - 0.1, UZ + w); t.rotation.y = srnd() * TAU; g.add(t);
  if (kind === 'willow') {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.4 * s, 3.2 * s, 7), MT.bark); tr.position.y = 1.6 * s; tr.rotation.z = 0.12; tr.castShadow = true; t.add(tr);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6 * s, 10, 7, 0, TAU, 0, Math.PI / 2), MT.willow); dome.position.y = 3.2 * s; dome.scale.y = 0.55; dome.castShadow = true; t.add(dome); addOutline(dome, 0.02);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + srnd() * 0.4, r = 2.0 * s; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * s, 0.25 * s, 2.6 * s, 6, 1, true), MT.willow);
      c.material.side = THREE.DoubleSide; c.position.set(Math.cos(a) * r, 2.0 * s, Math.sin(a) * r); c.castShadow = true; t.add(c); }
  } else {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.24 * s, 2.6 * s, 6), MT.bark); tr.position.y = 1.3 * s; tr.castShadow = true; t.add(tr);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry((1.0 + srnd() * 0.5) * s, 1), i % 2 ? MT.leaf : MT.leaf2);
      b.position.set(srr(-0.8, 0.8) * s, (2.6 + srr(0, 1.4)) * s, srr(-0.8, 0.8) * s); b.castShadow = true; t.add(b); addOutline(b, 0.018); }
  }
  COLL.push({ u, w, hx: 0.5 * s, hz: 0.5 * s });
}
function buildTrees(g) {
  /* willows lean over the water; alders back the meadows; pines on the gorge rim */
  for (let i = 0; i < 26; i++) { const s = srr(S0 + 20, S0 + 400), hw = hwAt(s), side = srnd() < 0.5 ? -1 : 1; const p = P(s, side * (hw + srr(2, 5)));
    if (uH(p.u, p.w) < 0.3) continue; tree(g, p.u, p.w, srr(0.9, 1.3), 'willow'); }
  for (let i = 0; i < 70; i++) { const s = srr(S0 + 0, S0 + 470), hw = hwAt(s), side = srnd() < 0.5 ? -1 : 1; const p = P(s, side * (hw + srr(9, 50)));
    if (uH(p.u, p.w) < 0.5) continue; tree(g, p.u, p.w, srr(0.9, 1.6), 'alder'); }
  /* the willow over the shrine */
  const sh = SIDES[1]; tree(g, sh.pu + 4, sh.pw + 3, 1.5, 'willow');
}
function deck(g, u, w, ang, hx, hz, y) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = new THREE.Group(); d.position.set(u, 0, UZ + w); d.rotation.y = ang; g.add(d);
  for (let z = -hz + 0.2; z < hz; z += 0.42) { const b = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.07, 0.38), z % 0.84 < 0.42 ? MT.plank : MT.wood); b.position.set(0, y, z); b.castShadow = true; b.receiveShadow = true; d.add(b); }
  for (const sx of [-1, 1]) for (let z = -hz + 0.3; z <= hz; z += Math.max(1.4, hz)) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 6), MT.woodDk); p.position.set(sx * (hx - 0.1), y - 1.1, z); d.add(p); }
  DECKS.push({ u, w, c: Math.cos(-ang), s: Math.sin(-ang), hx, hz, y });
  /* a deck is in the hooks as an axis-aligned box in its own frame */
  DECKS[DECKS.length - 1].c = Math.cos(ang); DECKS[DECKS.length - 1].s = -Math.sin(ang);
  return d;
}
function lantern(g, x, y, z, lit = true) {
  const l = new THREE.Group(); l.position.set(x, y, z); g.add(l);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), MT.woodDk); post.position.y = 0.8; l.add(post);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), lit ? MT.paper : MT.plaster); box.position.y = 1.72; l.add(box);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 4), MT.roof); cap.position.y = 1.92; cap.rotation.y = Math.PI / 4; l.add(cap);
  return l;
}
function buildLanding(g) {
  const L = LANDING, ang = Math.atan2(L.nx, L.nz);
  const d = deck(g, L.u - L.nx * 2.4, L.w - L.nz * 2.4, ang, 1.2, 3.4, 0.42);
  lantern(g, L.u + L.tx * 1.6, uH(L.u + L.tx * 1.6, L.w + L.tz * 1.6), UZ + L.w + L.tz * 1.6);
  U.lamps = [W(L.u + L.tx * 1.6, L.w + L.tz * 1.6, uH(L.u, L.w) + 1.72)];
  /* the sign back down */
  const sg = new THREE.Group(); sg.position.set(L.u + L.nx * 1.5 - L.tx * 2, uH(L.u, L.w), UZ + L.w + L.nz * 1.5 - L.tz * 2); sg.rotation.y = ang + Math.PI; g.add(sg);
  const po = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), MT.woodDk); po.position.y = 0.65; sg.add(po);
  const bd = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.05), MT.plank); bd.position.y = 1.1; sg.add(bd); addOutline(bd, 0.01);
}
function buildNarrows(g0) {
  /* flood timber, jammed across the narrows from wall to wall (its own group: it goes when Toma and Aoi shift it) */
  const g = new THREE.Group(); U.root.add(g); U.jam = g; g.visible = !up().jam;
  const N = NARROWS, hw = hwAt(N.s) + 1.5;
  for (let i = 0; i < 26; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(srr(0.16, 0.3), srr(0.18, 0.32), srr(4, 8), 7), MT.bark);
    const lat = srr(-hw, hw), al = srr(-2.2, 2.2);
    l.position.set(N.u + N.nx * lat + N.tx * al, srr(-0.2, 1.6), UZ + N.w + N.nz * lat + N.tz * al);
    l.rotation.set(srr(-0.4, 0.4), Math.atan2(N.nx, N.nz) + srr(-0.6, 0.6), Math.PI / 2 + srr(-0.3, 0.3)); l.castShadow = true; g.add(l); }
  for (let i = 0; i < 10; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(srr(0.4, 0.9)), MT.rock); const lat = srr(-hw, hw);
    r.position.set(N.u + N.nx * lat + N.tx * srr(-3, 3), srr(-0.3, 0.3), UZ + N.w + N.nz * lat + N.tz * srr(-3, 3)); r.castShadow = true; g.add(r); }
  B()?.blockers.push((x, z) => { if (z < 2000 || up().jam) return false; const du = x - N.u, dw = z - UZ - N.w; return Math.abs(du * N.tx + dw * N.tz) < 3.2 && Math.abs(du * N.nx + dw * N.nz) < hw + 2; });
  g.children.forEach((l) => { l.userData.p0 = l.position.clone(); l.userData.r0 = l.rotation.clone(); });
}
/* the three secrets */
const SEC = [];
function buildSecrets(g) {
  /* 1 · the drowned farmhouse: walls to the sills in the pool, roof sagging, a door that opens onto water */
  { const sd = SIDES[0]; const h = new THREE.Group(); h.position.set(sd.pu + 3.5, -0.6, UZ + sd.pw - 2.5); h.rotation.y = 0.5; h.rotation.z = 0.04; g.add(h);
    const wall = (w, hh, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), MT.plaster); m.position.set(x, y, z); m.castShadow = true; h.add(m); addOutline(m, 0.015); return m; };
    wall(5.2, 2.8, 0.2, 0, 1.4, -2); wall(0.2, 2.8, 4, -2.6, 1.4, 0); wall(0.2, 2.8, 4, 2.6, 1.4, 0); wall(1.8, 2.8, 0.2, -1.7, 1.4, 2); wall(1.8, 2.8, 0.2, 1.7, 1.4, 2);
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.14, 3.0), MT.thatch); r.position.set(0, 3.4, s * 1.1); r.rotation.x = s * 0.62; r.castShadow = true; h.add(r); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.06), MT.wood); door.position.set(0.6, 1.0, 2.5); door.rotation.y = 1.1; h.add(door);
    const dark = tn(0x2a2a26); for (const [x, z, ry] of [[-1.6, 2.06, 0], [1.7, 2.06, 0], [-2.66, 0.4, Math.PI / 2], [2.66, -0.6, Math.PI / 2], [0.8, -2.06, 0]]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), dark); w.position.set(x, 1.85, z); w.rotation.y = ry; h.add(w); const sill = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.12), MT.wood); sill.position.set(x, 1.47, z); sill.rotation.y = ry; h.add(sill); }
    const stain = new THREE.Mesh(new THREE.BoxGeometry(5.26, 0.5, 4.06), tn(0x8a7c62)); stain.position.set(0, 0.85, 0); h.add(stain);
    h.updateMatrixWorld(true); const at = h.localToWorld(new THREE.Vector3(0, 1.4, 1.0));
    SEC.push({ id: 'double', where: 'the drowned farmhouse', x: at.x, z: at.z, y: 0.9, text: 'The farmhouse door, open onto water · something on the hook inside', r: 4.5 });
    COLL.push({ u: sd.pu + 3.5, w: sd.pw - 2.5, hx: 2.8, hz: 2.4 });
    B()?.blockers.push((x, z) => z > 2000 && Math.hypot(x - (sd.pu + 3.5), z - UZ - (sd.pw - 2.5)) < 2.6); }
  /* 2 · the willow shrine: a small roofed shrine on a stone footing, half in the water */
  { const sd = SIDES[1]; const s = new THREE.Group(); s.position.set(sd.pu + 2.2, -0.35, UZ + sd.pw + 1.6); s.rotation.y = -0.8; g.add(s);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), MT.stone); base.position.y = 0.3; s.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.8), MT.woodDk); body.position.y = 1.05; s.add(body); addOutline(body, 0.012);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.6, 4), MT.roof); roof.position.y = 1.8; roof.rotation.y = Math.PI / 4; s.add(roof);
    for (const x of [-0.3, 0.3]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.02), MT.cloth); r.position.set(x, 1.25, 0.42); s.add(r); }
    s.updateMatrixWorld(true); const at = s.localToWorld(new THREE.Vector3(0, 1.0, 0.6));
    SEC.push({ id: 'exarrow', where: 'the willow shrine', x: at.x, z: at.z, y: 0.9, text: 'The willow shrine · a bundle wrapped in waxed reed', r: 3.6 });
    B()?.blockers.push((x, z) => z > 2000 && Math.hypot(x - (sd.pu + 2.2), z - UZ - (sd.pw + 1.6)) < 1.3); }
  /* 3 · the reedcutters' hut, on stilts over its own pool */
  { const sd = SIDES[2]; const h = new THREE.Group(); h.position.set(sd.pu, 0, UZ + sd.pw); h.rotation.y = 0.3; g.add(h);
    for (const [x, z] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.8, 6), MT.woodDk); p.position.set(x, 0.2, z); h.add(p); }
    const fl = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 2.6), MT.plank); fl.position.y = 1.5; h.add(fl);
    const wl = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.6, 2.4), MT.wood); wl.position.y = 2.3; wl.castShadow = true; h.add(wl); addOutline(wl, 0.015);
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.8), MT.thatch); r.position.set(0, 3.45, s * 0.75); r.rotation.x = s * 0.55; r.castShadow = true; h.add(r); }
    const ld = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.6), MT.plank); ld.position.set(0, 0.75, 1.9); ld.rotation.x = 0.7; h.add(ld);
    h.updateMatrixWorld(true); const at = h.localToWorld(new THREE.Vector3(0, 1.0, 2.6));
    SEC.push({ id: 'machete', where: 'the reedcutters\' hut', x: at.x, z: at.z, y: 1.5, text: 'The reedcutters\' hut · a blade hung up by the door', r: 3.8 });
    B()?.blockers.push((x, z) => { if (z < 2000) return false; const du = x - sd.pu, dw = z - UZ - sd.pw; return Math.abs(du) < 1.9 && Math.abs(dw) < 1.7; }); }
}
function buildHeronPost(g) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 6), MT.woodDk); p.position.set(HERON.u, -0.5, UZ + HERON.w); p.rotation.z = 0.08; p.castShadow = true; g.add(p);
  HERON.top = 0.62;
  B()?.blockers.push((x, z) => z > 2000 && Math.hypot(x - HERON.u, z - UZ - HERON.w) < 0.45);
}

/* ================================================================
   Stillness
   ================================================================ */
const glassVS = `varying vec3 vN; varying vec3 vWp; varying vec3 vL;
  void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vWp=wp.xyz; vL=position; gl_Position=projectionMatrix*viewMatrix*wp; }`;
const glassFS = `varying vec3 vN; varying vec3 vWp; varying vec3 vL; uniform float uTime,uK,uRip,uSick,uNight,uFlash; uniform vec3 uHor,uZen;
  float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n21(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x),u.y);}
  void main(){
    vec3 v=normalize(cameraPosition-vWp); vec3 n=normalize(vN);
    float wob=uRip*sin(vL.y*9.0-uTime*6.0)*0.25; n=normalize(n+vec3(wob,0.0,wob*0.6));
    float fr=pow(1.0-abs(dot(n,v)),2.2);
    vec3 r=reflect(-v,n); vec3 sky=mix(uHor,uZen,clamp(r.y*0.5+0.5,0.0,1.0));
    vec3 col=mix(vec3(0.70,0.76,0.82),sky*1.1,0.6)+vec3(0.9,0.96,1.0)*fr*1.1;
    float ca=n21(vWp.xz*3.0+vec2(vWp.y*2.0,uTime*0.2))*n21(vWp.xy*2.3-uTime*0.15); col+=vec3(0.8,0.9,1.0)*smoothstep(0.35,0.6,ca)*0.25;
    /* the sickness: silt veins that creep up from the water */
    float vein=smoothstep(0.82,0.96,1.0-abs(n21(vec2(atan(vL.x,vL.z)*3.0,vL.y*2.2-uTime*0.05))*2.0-1.0));
    float sick=uSick*vein*(1.0-smoothstep(0.2,1.5,vL.y));
    col=mix(col,vec3(0.28,0.25,0.2),sick*0.85);
    col=mix(col,col*vec3(0.55,0.6,0.75),uNight*0.6);
    col+=vec3(1.0,0.9,0.7)*uFlash;
    float a=(0.2+fr*0.7)*uK; a=max(a,sick*0.75*uK);
    gl_FragColor=vec4(col,a);
  }`;
function mourner() {
  /* a kneeling figure in a veil, all water: wide where the robe spreads, a bowed hooded head */
  const prof = [[0.001, 0], [0.95, 0.02], [0.9, 0.18], [0.62, 0.42], [0.5, 0.7], [0.42, 0.95], [0.34, 1.12], [0.3, 1.24], [0.27, 1.33], [0.22, 1.48], [0.14, 1.58], [0.001, 1.62]].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(prof, 28);
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i), z = p.getZ(i); const bow = sm(1.0, 1.6, y) * 0.22; p.setZ(i, z + bow); p.setX(i, x * (1 + 0.05 * Math.sin(y * 7 + z * 3))); }
  geo.computeVertexNormals();
  const u = { uTime: G.uTime, uK: { value: 0 }, uRip: { value: 0 }, uSick: { value: 1 }, uNight: { value: 0 }, uFlash: { value: 0 }, uHor: MZ.waterU?.uHor || { value: new THREE.Color(0.7, 0.8, 0.9) }, uZen: MZ.waterU?.uZen || { value: new THREE.Color(0.4, 0.6, 0.9) } };
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: glassVS, fragmentShader: glassFS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 3; m.frustumCulled = false;
  return { m, u };
}
const FROZEN_N = 40;
function buildStill() {
  STILL.forEach((p, i) => {
    const f = mourner(); const g = new THREE.Group(); g.add(f.m); g.position.set(p.u, 0, UZ + p.w); g.visible = false; U.root.add(g);
    /* petals stopped in the air around it */
    const pg = new THREE.BufferGeometry(); const pp = new Float32Array(FROZEN_N * 3);
    for (let k = 0; k < FROZEN_N; k++) { const a = srnd() * TAU, r = srr(1.2, 5.5); pp[k * 3] = Math.cos(a) * r; pp[k * 3 + 1] = srr(0.3, 2.4); pp[k * 3 + 2] = Math.sin(a) * r; }
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf6d8e0, size: 0.09, transparent: true, opacity: 0.0, depthWrite: false })); g.add(pts);
    const sp = { i, x: p.u, z: UZ + p.w, r: p.r, g, f, pts, k: 0, rise: 0, R: 0, hp: 0, maxHp: 0, awake: false, mended: !!up().still[i], stillT: 0, drainT: 0, waveT: 4 + i, wave: -1, tipT: 0, flash: 0 };
    U.still.push(sp);
  });
  CB()?.reg.push(() => U.on ? U.still.filter((sp) => sp.awake && !sp.mended && sp.rise > 0.9).map(target) : []);
}
const CB = () => MZ.combat?.CB;
function target(sp) {
  if (!sp.t) sp.t = { type: 'stillness', still: sp, r: 0.9, get x() { return sp.x; }, get z() { return sp.z; }, y: 0.3,
    hit(dmg, dx, dz, kind) { return hitStill(sp, dmg, kind); },
    stun() { sp.R = Math.min(1, sp.R + 0.6); } };
  return sp.t;
}
function hitStill(sp, dmg, kind) {
  if (sp.R < 0.42) {
    sp.flash = 0.25; for (let k = 0; k < 4; k++) MZ.fxGlow.emit(sp.x + rr(-0.4, 0.4), 1.0 + rr(0, 0.8), sp.z + rr(-0.4, 0.4), rr(-0.3, 0.3), rr(0.2, 0.6), rr(-0.3, 0.3), _c1.setRGB(1.2, 1.4, 1.6), 0.06, 0.5, 0, 0.6, 0);
    if (sp.tipT <= 0) { sp.tipT = 4; MZ.combat?.popText?.('It doesn\'t feel it. Make the water move.'); }
    sp.R = Math.min(1, sp.R + 0.08);            /* a little: the shot rings the water */
    return false;
  }
  sp.hp -= dmg; sp.flash = 0.4; SFX.knock?.(0, 820);
  for (let k = 0; k < 8; k++) MZ.fxSoft.emit(sp.x + rr(-0.5, 0.5), 0.8 + rr(0, 0.8), sp.z + rr(-0.5, 0.5), rr(-1, 1), rr(0.5, 1.5), rr(-1, 1), _c1.setRGB(0.85, 0.92, 1.0), rr(0.06, 0.12), rr(0.5, 0.9), 2, 0.5);
  if (sp.hp <= 0) mendStill(sp);
  return true;
}
const _c1 = new THREE.Color();
const STILL_WORDS = [
  ['Someone sat on this bank every evening for years, waiting for a boat that had already come home.', 'The water let go of it.'],
  ['Someone stopped every clock in the house the day it happened, and never wound them again.', 'The water let go of it.'],
  ['Someone kept a room exactly as it was. The cup on the sill. The coat on the hook.', 'The water let go of it.'],
];
function wake(sp) {
  if (sp.awake || sp.mended) return;
  sp.awake = true; sp.g.visible = true; sp.rise = 0; sp.R = 0; sp.maxHp = Math.round(8 * (MZ.combat?.D?.().hp || 1)); sp.hp = sp.maxHp;
  SFX.moment?.(); MZ.combat?.popText?.('The water has gone still.');
  if (!up().stillTip) { up().stillTip = 1; setTimeout(() => toast('Stillness: it can\'t feel a thing while the water is flat. Paddle hard around it, throw something, make ripples. Don\'t stop in its pool.'), 1800); }
  CB() && (CB().engagedT = MZ.simTime);
}
function mendStill(sp) {
  if (sp.mended) return; sp.mended = true; sp.awake = false; up().still[sp.i] = 1; MZ.writeSave();
  const P2 = MZ.combat ? null : null;
  for (let k = 0; k < 40; k++) MZ.fxSoft.emit(sp.x + rr(-0.6, 0.6), 0.6 + rr(0, 1.4), sp.z + rr(-0.6, 0.6), rr(-2, 2), rr(1, 3), rr(-2, 2), k % 2 ? _pet : _pet2, rr(0.07, 0.12), rr(1.4, 2.4), 1.0, 0.5, 0.6, 0.6);
  for (let k = 0; k < 18; k++) MZ.fxGlow.emit(sp.x + rr(-0.5, 0.5), 0.8 + rr(0, 1.0), sp.z + rr(-0.5, 0.5), rr(-0.6, 0.6), rr(0.6, 1.8), rr(-0.6, 0.6), _c1.setRGB(2.0, 2.1, 2.4), rr(0.06, 0.11), rr(0.9, 1.6), -0.2, 0.6, 0);
  for (let k = 0; k < 4; k++) setTimeout(() => MZ.addRipple?.(sp.x + rr(-2, 2), sp.z + rr(-2, 2), 1.2), k * 260);
  SFX.get?.(); SFX.moment?.(); MZ.cam.shake = Math.max(MZ.cam.shake || 0, 0.2);
  const w = STILL_WORDS[sp.i];
  MZ.talkRun(w.map((t) => ({ who: '', text: t })), () => {
    const n = up().still.filter(Boolean).length;
    if (n >= 3) marshBreathes(); else toast(`${n} of 3 still places moving again.`);
  });
}
const _pet = new THREE.Color(1.0, 0.78, 0.84), _pet2 = new THREE.Color(0.85, 0.95, 1.0);
function marshBreathes() {
  MZ.talkRun([{ who: '', text: 'All along the marsh the water starts to move. Somewhere a frog starts up, then a hundred of them.' },
    { who: 'Aoi', text: 'Kiyo would have hated this place. Everything holding its breath.', fn: () => MZ.hero?.expr?.('sad', 0.6, 6) },
    { who: 'Aoi', text: '...She would have rowed straight through it, singing.', fn: () => MZ.hero?.expr?.('tender', 0.7, 6) }], () => {
    showCardBrief({ k: 'Chapter 2 · the Upper Marsh', t: 'The marsh breathes', s: 'Up at the narrows, the flood timber shifts a little in the current. The gorge is next.' });
    MZ.piece?.('marsh');
  });
}
function stillStep(dt) {
  const b = B(); let nearest = null, nd = 1e9;
  for (const sp of U.still) {
    const d = Math.hypot(player.pos.x - sp.x, player.pos.z - sp.z);
    if (!sp.mended && !sp.awake && d < sp.r + 12) wake(sp);
    sp.k = damp(sp.k, sp.awake && !sp.mended ? 1 : 0, sp.awake ? 0.7 : 1.5, dt);
    if (sp.mended && sp.k < 0.01 && sp.g.visible) sp.g.visible = false;
    if (!sp.awake) { sp.f.u.uK.value = damp(sp.f.u.uK.value, 0, 2, dt); continue; }
    sp.rise = Math.min(1, sp.rise + dt * 0.45);
    if (d < nd) { nd = d; nearest = sp; }
    /* ripples move it: a fast boat close by, power strokes, splashes and fire */
    const speed = b?.on ? Math.abs(b.v) : Math.hypot(player.vel.x, player.vel.z);
    if (d < sp.r + 3 && speed > 1.3) sp.R = Math.min(1, sp.R + dt * (speed - 1.1) * 0.32);
    for (const f of (MZ.arsenal?.fx || [])) if (f.zone && Math.hypot(f.p.x - sp.x, f.p.z - sp.z) < 6) sp.R = Math.min(1, sp.R + dt * 0.8);
    sp.R = Math.max(0, sp.R - dt * 0.1);
    sp.tipT = Math.max(0, sp.tipT - dt); sp.flash = Math.max(0, sp.flash - dt);
    /* in its pool and not moving: she goes still too */
    if (d < sp.r && speed < 0.55 && !MZ.talk.on && !MZ.cine) { sp.stillT += dt; } else sp.stillT = Math.max(0, sp.stillT - dt * 2);
    if (sp.stillT > 2.6) { sp.drainT -= dt; if (sp.drainT <= 0) { sp.drainT = 2.8; MZ.combat?.hurt?.(1, sp.x, sp.z, 'still'); MZ.combat?.popText?.('Don\'t stop. Keep moving.'); } } else sp.drainT = 0.6;
    /* every so often it reaches: a slow ring of glass across the water; if it catches the boat, the boat stops */
    sp.waveT -= dt; if (sp.waveT <= 0 && d < sp.r + 6) { sp.waveT = 6.5; sp.wave = 0; SFX.splash?.(); }
    if (sp.wave >= 0) { sp.wave += dt * 3.2; if (Math.abs(sp.wave - d) < 0.8 && b?.on && !sp.caught) { sp.caught = true; b.v *= 0.25; sp.stillT += 1.2; MZ.combat?.popText?.('It holds you.'); }
      if (sp.wave > sp.r + 4) { sp.wave = -1; sp.caught = false; } }
    const f = sp.f.u; f.uK.value = sp.rise; f.uRip.value = damp(f.uRip.value, sp.R > 0.42 ? 1 : sp.R * 0.6, 4, dt); f.uSick.value = 1; f.uNight.value = MZ.nightF; f.uFlash.value = sp.flash * 2;
    sp.f.m.scale.set(1, sm(0, 1, sp.rise), 1); sp.f.m.position.y = -0.3 + Math.sin(G.uTime.value * 0.4 + sp.i) * 0.03;
    sp.f.m.rotation.y = Math.atan2(player.pos.x - sp.x, player.pos.z - sp.z) * 0.15 + sp.i;
    sp.pts.material.opacity = 0.85 * sp.rise;
  }
  /* the veil on the screen, and the boat dragging in the glass */
  let st = 0, inK = 0; for (const sp of U.still) if (sp.awake) { st = Math.max(st, sm(0.4, 2.6, sp.stillT)); const d = Math.hypot(player.pos.x - sp.x, player.pos.z - sp.z); inK = Math.max(inK, sp.k * (1 - sm(sp.r - 1, sp.r + 2, d))); }
  ui.veil.style.opacity = String(st * 0.75);
  if (b) b.still = inK * 0.85;
  U.stillNear = nearest;
}

/* ================================================================
   Mira, and the races
   ================================================================ */
function smallBoat() {
  const g = new THREE.Group(); const reed = tn(0xc8a865, { tag: 'mirab' }), bind = tn(0x6a4a2a);
  for (const sx of [-0.22, 0.22]) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.9, 4, 8), reed); b.rotation.x = Math.PI / 2; b.position.set(sx, 0, 0); b.castShadow = true; g.add(b); addOutline(b, 0.01); }
  for (const z of [-0.7, 0, 0.7]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 5, 12), bind); r.position.z = z; r.scale.set(1.3, 0.7, 1); g.add(r); }
  const prow = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 7), reed); prow.rotation.x = -Math.PI / 2 + 0.5; prow.position.set(0, 0.18, 1.25); g.add(prow);
  return g;
}
function miraFigure() {
  /* the same girl as at the Reedbeds: blue smock, braid, straw hat */
  const root = new THREE.Group(); const M2 = (c) => tn(c, { rim: 0.36 });
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, ol = 0.012) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); if (ol) addOutline(m, ol); return m; };
  mesh(new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.26, 0.2), new THREE.Vector2(0.2, 0.5), new THREE.Vector2(0.16, 0.58), new THREE.Vector2(0.001, 0.6)], 16), M2(0x4f7fa8), root, 0, 0.0, 0);
  const arms = []; for (const sx of [-1, 1]) { const pv = new THREE.Group(); pv.position.set(sx * 0.21, 0.5, 0); root.add(pv); mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), M2(0x4f7fa8), pv, 0, -0.15, 0, 0.01); mesh(new THREE.SphereGeometry(0.05, 8, 6), M2(0xe8c4a2), pv, 0, -0.31, 0, 0.008); arms.push(pv); }
  const head = new THREE.Group(); head.position.set(0, 0.78, 0.01); root.add(head);
  mesh(new THREE.SphereGeometry(0.23, 24, 18), M2(0xf0cfae), head, 0, 0, 0, 0.014);
  mesh(new THREE.SphereGeometry(0.245, 20, 12, 0, TAU, 0, 1.15), M2(0x3a2418), head, 0, 0.02, -0.01, 0.01);
  const braid = mesh(new THREE.CapsuleGeometry(0.045, 0.32, 4, 6), M2(0x3a2418), head, 0, -0.22, -0.2, 0.01); braid.rotation.x = 0.4;
  for (const sx of [-1, 1]) { mesh(new THREE.SphereGeometry(0.03, 8, 6).scale(0.8, 1.2, 0.5), M2(0x21160f), head, sx * 0.085, 0, 0.2, 0); mesh(new THREE.SphereGeometry(0.035, 8, 6).scale(1, 0.5, 0.3), M2(0xf2a08e), head, sx * 0.14, -0.07, 0.17, 0); }
  const hat = new THREE.Group(); hat.position.set(0, 0.16, -0.02); hat.rotation.x = -0.2; head.add(hat);
  mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.02, 28), M2(0xe2c27a), hat, 0, 0, 0, 0.01); mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.14, 20), M2(0xe2c27a), hat, 0, 0.07, 0, 0.01);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 5), tn(0x8a6440)); pad.rotation.z = Math.PI / 2; pad.position.set(0, 0.42, 0.25); root.add(pad);
  for (const s of [-1, 1]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.1), tn(0x6a4a30)); bl.position.set(s * 0.7, 0, 0); pad.add(bl); }
  return { root, arms, head, pad };
}
const MIRA = { boat: null, fig: null, x: 0, z: 0, yaw: 0, v: 0, ph: 0, home: null, met: false };
function buildMira() {
  MIRA.boat = smallBoat(); MIRA.fig = miraFigure(); MIRA.boat.add(MIRA.fig.root); MIRA.fig.root.position.set(0, 0.12, -0.15);
  U.root.add(MIRA.boat);
  const L = LANDING.boat; const p = P(S0 + 22); const hw = hwAt(S0 + 22);
  MIRA.home = { x: p.u + p.nx * (hw - 2.6), z: UZ + p.w + p.nz * (hw - 2.6), yaw: Math.atan2(p.tx, p.tz) };
  miraHome();
}
function miraHome() { MIRA.x = MIRA.home.x; MIRA.z = MIRA.home.z; MIRA.yaw = MIRA.home.yaw; MIRA.v = 0; }
function miraPlace(dt) {
  const t = G.uTime.value; const b = MIRA.boat; if (!b) return;
  b.position.set(MIRA.x, 0.03 + Math.sin(t * 1.6 + 1) * 0.02, MIRA.z); b.rotation.set(0, MIRA.yaw, Math.sin(t * 1.2) * 0.03);
  const f = MIRA.fig; const paddling = MIRA.v > 0.3; MIRA.ph += dt * (paddling ? 1.7 : 0);
  const s = Math.sin(MIRA.ph * Math.PI);
  f.pad.rotation.set(0, s * 0.4, 0.45 * Math.sign(Math.sin(MIRA.ph * Math.PI / 2 + 0.01)) * (paddling ? 1 : 0.2));
  f.arms[0].rotation.set(-1.0 + s * 0.3, 0, -0.3); f.arms[1].rotation.set(-1.0 - s * 0.3, 0, 0.3);
  const lookAt = Math.atan2(player.pos.x - MIRA.x, player.pos.z - MIRA.z) - MIRA.yaw;
  f.head.rotation.y = U.race ? 0 : clamp(Math.atan2(Math.sin(lookAt), Math.cos(lookAt)), -0.9, 0.9);
}
/* the courses: gates as (station, lateral fraction); out round a marker, and back */
const COURSES = [
  { name: 'To the first island and back', gates: [[S0 + 34, 0.2], [S0 + 52, -0.25], [S0 + 70, 0.62], [S0 + 84, 0.2], [S0 + 70, -0.62], [S0 + 50, -0.1], [S0 + 26, 0.3]], spd: 2.55 },
  { name: 'The long way, round the heron\'s post', gates: [[S0 + 40, 0.1], [S0 + 70, -0.62], [S0 + 110, 0.0], [S0 + 140, 0.35], [S0 + 160, 0.0], [S0 + 140, -0.75], [S0 + 104, 0.3], [S0 + 70, 0.62], [S0 + 40, -0.2], [S0 + 26, 0.3]], spd: 2.95 },
];
const GATE_W = 3.6;
function courseGates(c) { return c.gates.map(([s, f], i) => { const p = Pf(s, f); const dir = i < c.gates.length - 1 ? 1 : 1; return { x: p.u, z: UZ + p.w, nx: p.nx, nz: p.nz, s }; }); }
let gateObjs = [];
function showGates(gs) {
  for (const o of gateObjs) U.root.remove(o); gateObjs = [];
  gs.forEach((g, i) => { const grp = new THREE.Group(); grp.position.set(g.x, 0, g.z); U.root.add(grp); grp.traverse((o) => o.layers.enable(2));
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), MT.woodDk); p.position.set(g.nx * s * GATE_W, 0.5, g.nz * s * GATE_W); grp.add(p);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.18), i === gs.length - 1 ? MT.lotus : MT.cloth); rib.position.set(g.nx * s * GATE_W, 1.5, g.nz * s * GATE_W); grp.add(rib); }
    grp.traverse((o) => o.layers.enable(2)); gateObjs.push(grp); g.obj = grp; });
}
function startRace(n) {
  const b = B(); if (!b?.on || U.race) return;
  const c = COURSES[n]; const gs = courseGates(c); showGates(gs);
  /* line up at the start: side by side at the landing */
  const p0 = P(S0 + 18), hw = hwAt(S0 + 18), yaw = Math.atan2(p0.tx, p0.tz);
  b.place(p0.u + p0.nx * 1.8, UZ + p0.w + p0.nz * 1.8, yaw);
  MIRA.x = p0.u - p0.nx * 1.8; MIRA.z = UZ + p0.w - p0.nz * 1.8; MIRA.yaw = yaw; MIRA.v = 0;
  cam.yaw = yaw + Math.PI;
  U.race = { n, c, gs, next: 0, mNext: 0, t: -3.2, done: false, px: b.x, pz: b.z, mx: MIRA.x, mz: MIRA.z, lineT: 0 };
  b.locked = true; ui.race.hidden = false;
}
function crossed(ax, az, bx, bz, g) {
  /* did the step a→b go through the gate's line (between its poles)? */
  const px = g.nx, pz = g.nz; const sa = (ax - g.x) * -pz + (az - g.z) * px, sb = (bx - g.x) * -pz + (bz - g.z) * px;
  if (sa * sb > 0) return false; const t = sa / ((sa - sb) || 1e-6); const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
  return Math.abs((cx - g.x) * px + (cz - g.z) * pz) < GATE_W + 0.3;
}
const MIRA_SAYS = ['Left of the post! No, your other left!', 'You paddle like Grandmother!', 'That\'s four strokes to my three. I\'m counting.', 'Don\'t look at the water. It looks back.', 'Faster! The heron\'s watching!'];
function raceStep(dt) {
  const R = U.race; if (!R) return; const b = B();
  R.t += dt;
  if (R.t < 0) { ui.race.querySelector('.big').textContent = R.t < -2 ? 'Three…' : R.t < -1 ? 'Two…' : 'One…'; return; }
  if (b.locked) { b.locked = false; ui.race.querySelector('.big').textContent = 'Go!'; SFX.moment?.(); }
  else if (R.t > 1) ui.race.querySelector('.big').textContent = '';
  /* her gates */
  const g = R.gs[R.next];
  if (g && crossed(R.px, R.pz, b.x, b.z, g)) { R.next++; SFX.knock?.(0, 700 + R.next * 30); g.obj && (g.obj.visible = false); if (R.next < R.gs.length) R.gs[R.next].obj.visible = true; }
  R.px = b.x; R.pz = b.z;
  /* Mira: steers from gate to gate, faster when she's behind, slower when she's far ahead */
  const mg = R.gs[R.mNext];
  if (mg) {
    const dx = mg.x - MIRA.x, dz = mg.z - MIRA.z; const want = Math.atan2(dx, dz); let da = want - MIRA.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); MIRA.yaw += clamp(da, -1.6 * dt, 1.6 * dt);
    const lead = (R.mNext - R.next) * 25 + (Math.hypot(b.x - (R.gs[R.next]?.x ?? b.x), b.z - (R.gs[R.next]?.z ?? b.z)) - Math.hypot(dx, dz));
    const tv = R.c.spd * (lead > 22 ? 0.8 : lead < -12 ? 1.28 : 1) * (Math.abs(da) > 0.6 ? 0.7 : 1);
    MIRA.v = damp(MIRA.v, tv, 1.2, dt);
    const fl = U.flow(MIRA.x, MIRA.z, new THREE.Vector2());
    MIRA.x += Math.sin(MIRA.yaw) * MIRA.v * dt + fl.x * dt; MIRA.z += Math.cos(MIRA.yaw) * MIRA.v * dt + fl.y * dt;
    if (Math.hypot(mg.x - MIRA.x, mg.z - MIRA.z) < 2.4) R.mNext++;
  }
  R.lineT -= dt; if (R.lineT <= 0 && R.t > 4) { R.lineT = 9 + rnd() * 5; ui.race.querySelector('.say').textContent = 'Mira: “' + MIRA_SAYS[(rnd() * MIRA_SAYS.length) | 0] + '”'; }
  ui.race.querySelector('.row').textContent = `${R.c.name} · gate ${Math.min(R.next + 1, R.gs.length)} of ${R.gs.length} · ${R.t.toFixed(1)} s`;
  if (R.next >= R.gs.length && R.youT === undefined) R.youT = R.t;
  if (R.mNext >= R.gs.length && R.herT === undefined) R.herT = R.t;
  if (R.youT !== undefined || R.herT !== undefined) endRace(R.youT !== undefined && (R.herT === undefined || R.youT <= R.herT));
}
function endRace(won) {
  const R = U.race; if (!R || R.done) return; R.done = true;
  for (const o of gateObjs) U.root.remove(o); gateObjs = [];
  ui.race.querySelector('.big').textContent = won ? 'You win!' : 'Mira wins';
  setTimeout(() => { ui.race.hidden = true; }, 2500);
  const u = up();
  const after = () => { U.race = null; MIRA.v = 0; };
  if (won) {
    const first = !(u.races & (1 << R.n)); u.races |= 1 << R.n; MZ.writeSave();
    if (R.n === 0) MZ.talkRun([{ who: 'Mira', text: first ? 'You won? You WON. That\'s one. Again, properly, the long way.' : 'Fine. FINE. Two out of three.' }, { who: 'Aoi', text: 'You said that last time.', fn: () => MZ.hero?.expr?.('happy', 0.6, 4) }], after);
    else MZ.talkRun(first ? [{ who: 'Mira', text: 'Nobody beats me the long way. Nobody.' }, { who: 'Mira', text: 'Wait here.' },
      { who: '', text: 'She paddles off into the reeds and comes back with something long, wrapped in an old festival cloth.' },
      { who: 'Mira', text: 'Grandmother\'s bow. She was the festival archer. One lit arrow over the water every summer, so the first boat would know where to go.' },
      { who: 'Mira', text: 'Nobody\'s shot it since the flood. You can. If you\'re careful.' }, { who: 'Aoi', text: 'I\'ll be careful.', fn: () => MZ.hero?.expr?.('tender', 0.7, 5) }]
      : [{ who: 'Mira', text: 'Twice. That\'s twice. I\'m telling Grandmother you cheat.' }], () => { after(); if (first) MZ.arsenal?.give?.('bow', 'Mira, the long way round'); });
  } else MZ.talkRun([{ who: 'Mira', text: ['Ha! I counted every stroke. You did forty-one. I did thirty-eight.', 'You have to pull when the ring closes. Grandmother says. Again?', 'The current helps on the way back. Use it.'][(rnd() * 3) | 0] }], after);
}

/* ================================================================
   The heron at dusk
   ================================================================ */
const HR = { g: null, state: 'away', t: 0, fly: null, seen: false };
function heronBuild() {
  if (HR.g) return; const sp = MZ.SPECIES_BY_ID?.heron; if (!sp || !MZ.makeSightModel) return;
  const m = MZ.makeSightModel(sp); HR.g = m.g; HR.g.scale.setScalar(1.5); U.root.add(HR.g); HR.g.traverse((o) => o.layers.enable(2)); HR.g.visible = false;
}
function dusk() { const h = S.hours; return h >= 17.2 && h < 20.6; }
function heronStep(dt) {
  heronBuild(); if (!HR.g) return;
  const b = B(), d = Math.hypot(player.pos.x - HERON.u, player.pos.z - UZ - HERON.w);
  if (HR.state === 'away') { if (dusk() && !up().heron || (dusk() && d > 60)) { HR.state = 'post'; HR.g.visible = true; HR.g.position.set(HERON.u, HERON.top + 0.95, UZ + HERON.w); HR.g.rotation.y = Math.atan2(-lineAt(MAIN, HERON.s).tx, -lineAt(MAIN, HERON.s).tz); } return; }
  if (HR.state === 'post') {
    if (!dusk() && d > 40) { HR.state = 'away'; HR.g.visible = false; return; }
    HR.g.rotation.y += Math.sin(G.uTime.value * 0.3) * dt * 0.05;
    /* too loud: strokes or speed inside 18 m, and it goes */
    const loud = b?.on && (Math.abs(b.v) > 1.7 || b.good > 0 || b.wake > 0.3);
    if (d < 18 && loud) { flyOff(false); return; }
    if (d < 11 && b?.on && Math.abs(b.v) < 1.0 && !up().heron && !MZ.talk.on) { heronMoment(); }
  }
  if (HR.state === 'fly') { HR.t += dt; const f = HR.fly; HR.g.position.set(f.x + f.dx * HR.t * 6, f.y + HR.t * 1.4 + Math.sin(HR.t * 4) * 0.1, f.z + f.dz * HR.t * 6); if (HR.t > 9) { HR.state = 'away'; HR.g.visible = false; } }
}
function flyOff(quiet) {
  HR.state = 'fly'; HR.t = 0; const tg = lineAt(MAIN, HERON.s + 40); const dx = tg.u - HERON.u, dz = tg.w - HERON.w, l = Math.hypot(dx, dz) || 1;
  HR.fly = { x: HR.g.position.x, y: HR.g.position.y, z: HR.g.position.z, dx: dx / l, dz: dz / l }; HR.g.rotation.y = Math.atan2(dx, dz);
  SFX.wings?.(); if (!quiet && !up().heronTip) { up().heronTip = 1; toast('Too loud. Drift in on the current next time, no strokes.'); }
}
function heronMoment() {
  const u = up(); u.heron = 1; MZ.writeSave();
  const b = B(); if (b) { b.v *= 0.3; b.locked = true; }
  const hp = new THREE.Vector3(HERON.u, 0, UZ + HERON.w), dir = new THREE.Vector3(player.pos.x - hp.x, 0, player.pos.z - hp.z).normalize();
  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
  MZ.startCine?.({ k: 'The Upper Marsh · dusk', t: 'A heron on the old post', s: 'It looks at her for a long time, the way Kiyo used to look at the river.' }, hp, { pivot: hp, dir, radius: 7.5, height: 1.3, floor: 0, lookY: -2.5 });
  setTimeout(() => MZ.talkRun([{ who: 'Aoi', text: 'Kiyo said herons are ferrymen who forgot how to stop working.', fn: () => MZ.hero?.expr?.('tender', 0.8, 8) },
    { who: 'Aoi', text: '...Go on, then. Go home.' }], () => { flyOff(true); if (b) b.locked = false; MZ.piece?.('heron'); }), 8800);
}

/* ================================================================
   The secrets
   ================================================================ */
const _ip = new THREE.Vector3();
function secretGive(i) {
  const s = SEC[i]; const u = up(); if (u.sec & (1 << i)) return; u.sec |= 1 << i; MZ.writeSave();
  const A = MZ.arsenal; const n = [0, 1, 2].filter((k) => u.sec & (1 << k)).length;
  const after = () => toast(`A boat secret: ${n} of 3 found.`);
  if (s.id === 'exarrow') {
    S.arsenal.have.exarrow = 1; if (A) A.stock.exarrow = 6; MZ.writeSave();
    A?.memory ? A.memory('exarrow', s.where).then(after) : after();
  } else { A?.give?.(s.id, s.where); setTimeout(after, 400); }
}
function regSecrets() {
  SEC.forEach((s, i) => INTERACTS.push({ x: s.x, z: s.z, r: s.r, pen: 0.1,
    state() { if (!U.on || (up().sec & (1 << i))) return null; return { ok: true, text: s.text, hold: 0.9 }; },
    done() { secretGive(i); }, pos: () => _ip.set(s.x, s.y + 0.6, s.z) }));
}

/* ================================================================
   Coming and going
   ================================================================ */
const ui = (() => {
  const st = document.createElement('style');
  st.textContent = `#upVeil{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(220,230,240,0) 35%,rgba(200,214,228,.85) 100%);opacity:0;transition:opacity .4s;z-index:4;mix-blend-mode:screen}
  #upRace{position:absolute;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);text-align:center;color:#f4ead8;text-shadow:0 1px 6px rgba(0,0,0,.85);pointer-events:none;z-index:6}
  #upRace .big{font-size:34px;font-weight:700;min-height:1.2em} #upRace .row{font-size:15px} #upRace .say{font-size:15px;font-style:italic;color:#ffe2b0;min-height:1.3em}
  body.upriver #waypoint{display:none}`;
  document.head.appendChild(st);
  const veil = document.createElement('div'); veil.id = 'upVeil'; document.body.appendChild(veil);
  const race = document.createElement('div'); race.id = 'upRace'; race.hidden = true; race.innerHTML = '<div class="big"></div><div class="row"></div><div class="say"></div>';
  (document.getElementById('hud') || document.body).appendChild(race);
  return { veil, race };
})();
const fadeEl = (() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;background:#05070a;opacity:0;pointer-events:none;transition:opacity .7s;z-index:30'; document.body.appendChild(d); return d; })();
function fadeTo(fn) { fadeEl.style.opacity = '1'; setTimeout(() => { try { fn(); } finally { setTimeout(() => { fadeEl.style.opacity = '0'; }, 350); } }, 750); }
U.fadeTo = fadeTo;
function enter(where = 'landing', opts = {}) {
  build(); regOnce();
  U.on = true; U.gen++; document.body.classList.add('upriver');
  U.root.visible = true;
  for (const o of scene.children) { const keep = o === U.root || o === player.root || o.isLight || (o.frustumCulled === false && o.renderOrder !== 0) || o.isPoints || o === B()?.g || o.userData.allLayers;
    if (keep) o.traverse((c) => c.layers.enable(2)); }
  player.root.traverse((c) => c.layers.enable(2));
  camera.layers.set(2);
  CB() && (CB().safeOverride = () => U.on ? safe() : null);
  if (CB() && !U.washReg) { U.washReg = true; CB().onWash = CB().onWash || []; CB().onWash.push(() => { if (!U.on) return; for (const sp of U.still) { sp.stillT = 0; sp.wave = -1; }
    if (U.race) endRace(false); const L = LANDING; B()?.respawn(L.boat.u, UZ + L.boat.w, Math.atan2(L.tx, L.tz)); }); }
  const u = up(); u.in = 1; if (PARAMS.nomira === '1') u.mira = 1;          /* tests: skip Mira's hello */
  tp(where, opts);
  MZ.writeSave();
}
function safe() { const p = P(S0 + 18), hw = hwAt(S0 + 18); return { x: LANDING.u, z: UZ + LANDING.w, look: { x: p.u, z: UZ + p.w } }; }
function tp(where = 'landing', opts = {}) {
  const b = B();
  const at = (s, f = 0) => { const p = Pf(s, f); return { x: p.u, z: UZ + p.w, yaw: Math.atan2(p.tx, p.tz) }; };
  const spots = { landing: at(S0 + 12, 0.45), still1: at(STILL[0].s - 26, 0), still2: at(STILL[1].s - 26, 0), still3: at(STILL[2].s - 26, 0), heron: at(HERON.s - 30, 0), narrows: at(NARROWS.s - 22, 0), gorge: up().jam ? at(NARROWS.s + 12, 0) : at(NARROWS.s - 22, 0),
    farm: { x: SIDES[0].pu - 4, z: UZ + SIDES[0].pw - 4, yaw: 0.5 }, shrine: { x: SIDES[1].pu - 3, z: UZ + SIDES[1].pw - 3, yaw: 0.8 }, hut: { x: SIDES[2].pu, z: UZ + SIDES[2].pw + 5, yaw: Math.PI } };
  const ext = U.spots[where]; const s = (ext ? ext() : null) || spots[where] || spots.landing;
  if (opts.onFoot) { player.pos.set(LANDING.u, MZ.walkH(LANDING.u, UZ + LANDING.w), UZ + LANDING.w); player.vel.set(0, 0, 0); b?.place(LANDING.boat.u, UZ + LANDING.boat.w, Math.atan2(LANDING.tx, LANDING.tz)); }
  else if (b) b.respawn(s.x, s.z, s.yaw);
  cam.yaw = s.yaw + Math.PI; cam.target.set(player.pos.x, player.pos.y + 1.25, player.pos.z);
}
function leave() {
  const b = B(); if (b?.on) b.leave(new THREE.Vector3(LANDING.u, 0, UZ + LANDING.w));
  U.on = false; document.body.classList.remove('upriver'); camera.layers.set(0); U.root.visible = false; ui.veil.style.opacity = '0'; ui.race.hidden = true; U.race = null;
  if (CB()) CB().safeOverride = null;
  const u = up(); u.in = 0;
  /* the boat goes back to Toma's dock; she walks out by the Reedbeds */
  MZ.arsenal?.tomaPlace?.(true); if (b) b.away = false;
  const r = MZ.RPATH ? MZ.RPATH[3] : [-102, -64]; MZ.teleport(r[0], r[1], MZ.RB?.x ?? -104, MZ.RB?.z ?? -70);
  MZ.writeSave();
}
U.enter = enter; U.leave = leave; U.tp = tp;
let regd = false;
function regOnce() {
  if (regd) return; regd = true; regSecrets();
  /* back down to the valley, at the landing */
  INTERACTS.push({ x: LANDING.u, z: UZ + LANDING.w, r: 3.2, pen: 0.3, state() { if (!U.on || U.race) return null; return { ok: true, text: 'Back down to the Reedbeds', hold: 0.8 }; },
    done() { fadeTo(leave); }, pos: () => _ip.set(LANDING.u, uH(LANDING.u, LANDING.w) + 1.4, UZ + LANDING.w) });
  /* Mira at the landing */
  INTERACTS.push({ x: 0, z: 0, r: 0, pen: 0.1, upd() { this.x = MIRA.x; this.z = MIRA.z; this.r = U.on && !U.race ? 6.5 : 0; },
    state() { if (!U.on || U.race || MZ.talk.on) return null; const b = B(); if (!MIRA.met) return { ok: true, text: 'Talk to Mira', hold: 0.2 };
      if (!b?.on) return { ok: true, text: 'Talk to Mira', hold: 0.2 }; const n = (up().races & 1) ? 1 : 0; return { ok: true, text: n ? 'Race Mira · the long way' : 'Race Mira', hold: 0.4 }; },
    done() { if (!MIRA.met) { miraIntro(); return; } const b = B(); if (!b?.on) { MZ.talkRun([{ who: 'Mira', text: 'Get in your boat, then. I can\'t race a person standing on a dock.' }]); return; } startRace((up().races & 1) ? 1 : 0); },
    pos: () => _ip.set(MIRA.x, 1.3, MIRA.z) });
  /* the narrows */
  INTERACTS.push({ x: NARROWS.u, z: UZ + NARROWS.w, r: 9, pen: 0.4, state() { if (!U.on || up().jam || U.jamScene) return null; return { ok: false, text: up().still.every(Boolean) ? 'The narrows · the timber is shifting. Someone could find the key log' : 'The narrows · flood timber, jammed solid. The marsh is holding its breath' }; },
    done() {}, pos: () => _ip.set(NARROWS.u, 2.2, UZ + NARROWS.w) });
}
function miraIntro() {
  MIRA.met = true; up().mira = 1; MZ.writeSave();
  MZ.talkRun([{ who: 'Mira', text: 'You came up! Nobody comes up. Grandmother says the marsh has gone still.' }, { who: 'Aoi', text: 'Still how?' },
    { who: 'Mira', text: 'Like a held breath. There are places where the water stopped moving. If you stop in them, you stop too.' },
    { who: 'Aoi', text: 'That\'s a story.', fn: () => MZ.hero?.expr?.('determined', 0.4, 4) }, { who: 'Mira', text: 'It\'s three stories. I counted. One by the first island, one past the bend, one up by the reedcutters.' },
    { who: 'Mira', text: 'Race you! Not now. When you\'re in your boat. I\'ll wait here.' }, { who: 'Aoi', text: 'You\'ll lose.', fn: () => MZ.hero?.expr?.('happy', 0.5, 4) }, { who: 'Mira', text: 'I never lose. I lose sometimes.' }]);
}

/* ---------- per frame ---------- */
HOOKS.sim.push((dt) => {
  if (!U.on) return;
  for (const f of U.onSim) f(dt);
  stillStep(dt); raceStep(dt); heronStep(dt); if (!U.race) { MIRA.v = 0; if (Math.hypot(MIRA.x - MIRA.home.x, MIRA.z - MIRA.home.z) > 0.5) { MIRA.x = damp(MIRA.x, MIRA.home.x, 0.5, dt); MIRA.z = damp(MIRA.z, MIRA.home.z, 0.5, dt); } }
  /* first time up: Mira paddles over */
  if (!MIRA.met && !up().mira && !MZ.talk.on && !MZ.cine && Math.hypot(player.pos.x - MIRA.x, player.pos.z - MIRA.z) < 14 && MZ.simTime > (U.introT || 0)) { U.introT = MZ.simTime + 1e9; setTimeout(miraIntro, 600); }
  if (up().mira) MIRA.met = true;
});
/* the marsh's small life: fish rising by day, fireflies at dusk, and frogs once the water moves again */
const _amb = new THREE.Color();
function ambience(dt) {
  if (dt <= 0) return; const t = MZ.nightF, h = S.hours, moving = up().still.filter(Boolean).length;
  const px = player.pos.x, pz = player.pos.z;
  if (rnd() < dt * 0.35 * (1 - t)) { const a = rnd() * TAU, r = rr(6, 22); const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r; if (0 - uH(x, z - UZ) > 0.5) {
    MZ.addRipple?.(x, z, 0.7); for (let k = 0; k < 4; k++) MZ.fxSoft.emit(x, 0.05, z, rr(-0.4, 0.4), rr(0.8, 1.6), rr(-0.4, 0.4), _amb.setRGB(0.9, 0.95, 1), 0.07, 0.5, 6, 0.5); } }
  const dusk = h > 18.3 || h < 5.2;
  if (dusk && rnd() < dt * 7) { const a = rnd() * TAU, r = rr(3, 20); const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r; const g = uH(x, z - UZ);
    if (g > -0.6) MZ.fxGlow.emit(x, Math.max(g, 0) + rr(0.4, 1.8), z, rr(-0.15, 0.15), rr(-0.05, 0.12), rr(-0.15, 0.15), _amb.setRGB(1.6, 2.0, 0.7), rr(0.05, 0.08), rr(2.5, 4.5), 0, 0.2, 0); }
  if (moving > 0 && rnd() < dt * 0.25 * moving * (0.4 + t)) SFX.croak?.(rr(-0.8, 0.8));
}
HOOKS.vis.push((dt) => {
  if (!U.on) return;
  miraPlace(dt); curtainStep(); ambience(dt);
  const wu = U.waterU; if (wu) { U.still.forEach((sp, i) => wu.uStill.value[i].set(sp.x, sp.z, sp.r, sp.k)); wu.uFlowK.value = U.flowK;
    (U.lamps || []).forEach((l, i) => wu.uLights.value[i].set(l.x, l.y, l.z, 0.9)); }
});
/* the HUD's place name and progress, while she's up here */
HOOKS.area = () => {
  if (!U.on) return null; if (U.areaExt) { const a = U.areaExt(); if (a) return a; }
  const u = up(); const n = u.still.filter(Boolean).length, sc = [0, 1, 2].filter((k) => u.sec & (1 << k)).length, rc = (u.races & 1 ? 1 : 0) + (u.races & 2 ? 1 : 0);
  const pct = Math.round((n * 3 + sc + rc + (u.heron ? 1 : 0)) / 15 * 100);
  return { name: U.area, pct, unit: 'moving again' };
};
HOOKS.tasksUp = () => {
  if (!U.on) return null; if (U.tasksExt) { const t = U.tasksExt(); if (t) return t; } const u = up(); const out = []; const n = u.still.filter(Boolean).length;
  const near = U.still.filter((sp) => !sp.mended).sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) - Math.hypot(b.x - player.pos.x, b.z - player.pos.z))[0];
  if (n < 3 && near) out.push({ main: true, text: `Free the still water (${n} of 3)`, x: near.x, z: near.z });
  if ((u.races & 3) !== 3) out.push({ text: (u.races & 1) ? 'Race Mira the long way' : 'Race Mira', x: MIRA.home.x, z: MIRA.home.z });
  const sc = [0, 1, 2].filter((k) => u.sec & (1 << k)).length; if (sc < 3) out.push({ text: `Boat secrets behind the reeds (${sc} of 3)` });
  if (!u.heron) out.push({ text: 'The heron, at dusk, on the old post', x: HERON.u, z: UZ + HERON.w });
  return out;
};

/* ---------- the way in: from the Reedbeds, once Toma has carried the boat up ---------- */
const open = () => !!S.arsenal?.have?.toma_bench && (MZ.rbStage ? MZ.rbStage() >= 1 : false);
U.open = open;
let beached = null;
function beachedBoat() {
  /* a second reed boat, pulled up on the Reedbeds bank: the way upriver */
  if (beached || !MZ.RB || !MZ.arsenal?.reedBoat) return;
  beached = MZ.arsenal.reedBoat.clone(true); beached.visible = false; scene.add(beached);
  /* on the bank of the stream just above the Reedbeds pool, where it goes on upriver */
  const I = MZ.INLET, c = MZ.RB; let s0 = 0; const L = 400;
  for (let st = 0; st < L; st += 0.5) { const p = MZ.polyPoint(I, st); if (Math.hypot(p.x - c.x, p.z - c.z) < 4) { s0 = st; } }
  const p = MZ.polyPoint(I, s0 + 16); const nx = -p.tz, nz = p.tx;
  let x = p.x + nx * 3.2, z = p.z + nz * 3.2; if (MZ.depthAt(x, z) > 0.1) { x = p.x - nx * 3.2; z = p.z - nz * 3.2; }
  beached.position.set(x, MZ.groundH(x, z) + 0.14, z); beached.rotation.set(0, Math.atan2(p.tx, p.tz), 0.08);
  U.beach = { x, z };
  INTERACTS.push({ x, z, r: 3.2, state() { if (U.on || !open() || !beached.visible) return null; return { ok: true, text: 'Take the reed boat up the marsh', hold: 1.0 }; },
    done() { fadeTo(() => enter('landing')); }, pos: () => _ip.set(x, MZ.groundH(x, z) + 1.0, z) });
}
HOOKS.sim.push(() => {
  if (U.on || MZ.mode !== 'play') return;
  beachedBoat(); if (!beached) return;
  const o = open(); beached.visible = o;
  if (o && !up().note && !MZ.talk.on && !MZ.cine && Math.hypot(player.pos.x - U.beach.x, player.pos.z - U.beach.z) < 16) {
    up().note = 1; MZ.writeSave();
    MZ.talkRun([{ who: '', text: 'The reed boat is pulled up on the bank, above the falls. Someone carried it all the way up.' },
      { who: '', text: 'A note is tucked under the binding, in Toma\'s square hand: "Don\'t thank me. The marsh goes on upriver. Mira says the water\'s wrong up there. — T."' },
      { who: 'Aoi', text: 'I wasn\'t going to thank you.', fn: () => MZ.hero?.expr?.('tender', 0.5, 5) }], () => showCardBrief({ k: 'Chapter 2', t: 'The Upper Marsh', s: 'Take the reed boat up past the Reedbeds. Mira is waiting at the landing.' }));
  }
});
/* a returning game that was up here when it closed comes back up here */
HOOKS.onStart.push(() => {
  const tpp = (PARAMS.tp || '').toLowerCase();
  if (tpp === 'reedbeds' || tpp === 'marsh' || tpp === 'gorge' || tpp === 'narrows' || tpp === 'lodge' || tpp === 'deep') { if (!S.arsenal.have.toma_bench) S.arsenal.have.toma_bench = 1;
    if (tpp !== 'reedbeds' && tpp !== 'marsh' && tpp !== 'narrows') up().jam = 1;            /* the debug way into the gorge: the timber's already gone */
    setTimeout(() => enter(tpp === 'reedbeds' || tpp === 'marsh' ? 'landing' : tpp), 50); return false; }
  if (up().in && !MZ.sandbox) { setTimeout(() => enter('landing'), 50); return false; }
  return false;
});
/* debug */
U.spawnStill = (i = 0) => { const sp = U.still[i]; if (!sp) return; sp.mended = false; up().still[i] = 0; sp.awake = false; wake(sp); return sp; };
U.mend = (i = 0) => { const sp = U.still[i]; if (sp) { if (!sp.awake) wake(sp); sp.R = 1; hitStill(sp, 999); } };
U.raceNow = (n = 0) => startRace(n);
U.heron = () => { S.hours = 18.5; HR.state = 'away'; up().heron = 0; };
U.secret = (i) => secretGive(i);
/* the combat debug object (window.__mzc) gets the new enemy too: __mzc.spawnStill(0..2) takes her up there if she isn't */
if (MZ.combat) MZ.combat.spawnStill = (i = 0) => { if (!U.on) enter(['still1', 'still2', 'still3'][i] || 'still1'); return U.spawnStill(i); };
Object.assign(U, { save: up, Pf, hwAt, gk, lineAt, MAIN, UZ, deck, lantern, tree, COLL, DECKS, MT, tn, srr, BARS, POOL, LEDGE, NARROWS, sm, vn, fbm, smallBoat });
U.SEC = SEC; U.STILL = STILL; U.MIRA = MIRA; U.LANDING = LANDING; U.HERONP = HERON; U.SIDES = SIDES; U.P = P; U.S0 = S0;
export { U };
