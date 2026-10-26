/* ================================================================
   Mizumend · the reed boat (v13.3).
   Toma's lopsided reed boat, and Aoi in it. Once he has brought it to Mill Pond she can take it out on the pond;
   in Chapter 2 it carries her up the marsh (js/upriver.js).
     W paddles (the strokes alternate sides), A and D steer, S backs water.
     Space is a power stroke. Pull it as the ring closes and it's a good one.
     Hold E to step ashore where it's shallow, or at a landing. Right-click still aims, so she can shoot from the boat.
   The water decides everything: its level, the bed under it, and the current.
   Debug: window.__mzb (board(), leave(), place(x, z, yaw)).
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
const { HOOKS, scene, camera, player, cam, S, PARAMS, makeToon, addOutline, clamp, lerp, damp, rr, rnd, G, $, SFX, INTERACTS, toast } = MZ;
const TAU = Math.PI * 2;

const B = {
  on: false, g: null, x: 0, z: 0, yaw: 0, v: 0, vs: 0, wy: 0, ph: 0, side: 1, cool: 0, good: 0, power: 0,
  away: false, locked: false, maxV: 2.7, drag: 0, still: 0, bump: 0, wake: 0, hint: 0, onStep: [], blockers: [],
};
MZ.boat = B;
if (PARAMS.debug === '1' || PARAMS.debug === 'true') window.__mzb = B;

/* where the water is: Mill Pond's level in the valley; upriver (z > 2000) the river sets its own */
const FAR = 2000;
function waterY(x, z) { return z > FAR ? (MZ.up?.waterY ? MZ.up.waterY(x, z) : 0) : MZ.levelCur; }
function bedY(x, z) { return MZ.groundH(x, z); }
const _fl = new THREE.Vector2();
function flowAt(x, z) { if (z > FAR && MZ.up?.flow) return MZ.up.flow(x, z, _fl); return _fl.set(0, 0); }
function drag(x, z) { return z > FAR && MZ.up?.dragAt ? MZ.up.dragAt(x, z) : 0; }
B.waterY = waterY; B.flowAt = flowAt;

/* ---------- the boat: Toma's (js/arsenal.js builds it for his arrival); a paddle for her ---------- */
let paddle = null, wakeM = null;
function ensure() {
  if (B.g) return true;
  const rb = MZ.arsenal?.reedBoat; if (!rb) return false;
  B.g = rb; rb.traverse((o) => o.layers.enableAll());           /* seen from the marsh's camera layer too */
  const wood = makeToon(0x8a6440, { noHeal: true, tag: 'paddle' }), blade = makeToon(0x6a4a30, { noHeal: true, tag: 'paddle2' });
  paddle = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.9, 6), wood); shaft.rotation.z = Math.PI / 2; shaft.castShadow = true; paddle.add(shaft);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.13), blade); b.position.x = s * 1.02; b.rotation.x = s * 0.35; b.castShadow = true; paddle.add(b); addOutline(b, 0.008); }
  paddle.position.set(0, 0.72, 0.05); paddle.visible = false; B.g.add(paddle); paddle.traverse((o) => o.layers.enableAll());
  return true;
}

/* ---------- getting in and out ---------- */
function seatWorld(out) { B.g.updateMatrixWorld(true); return B.g.localToWorld(out.set(0, B.seatY ?? 0.06, -0.3)); }
B.seatY = 0.06;
function board() {
  if (!ensure()) return;
  B.on = true; B.away = true; B.v = 0; B.vs = 0; B.wy = 0; B.x = B.g.position.x; B.z = B.g.position.z; B.yaw = B.g.rotation.y;
  paddle.visible = true;
  if (MZ.arsenal && MZ.arsenal.eq !== 'staff' && MZ.arsenal.WEAP[MZ.arsenal.eq]?.kind === 'melee') MZ.arsenal.equip?.('staff');
  cam.yaw = B.yaw + Math.PI;
  document.body.classList.add('boating'); ui.hud.hidden = false; B.hint = 7;
  SFX.splash?.();
  if (!S.boatTip) { S.boatTip = 1; setTimeout(() => toast('W to paddle, A and D to steer. Space is a power stroke: pull it as the ring closes.'), 900); }
  for (const f of B.onStep) f('board');
}
B.board = board;
function shoreNear(out) {
  /* the nearest place beside the boat where she can stand: shallow, or dry */
  let best = null, bd = 1e9; const fx = Math.sin(B.yaw), fz = Math.cos(B.yaw);
  for (let a = 0; a < 16; a++) { const ang = a / 16 * TAU; for (const r of [1.4, 2.0, 2.7]) {
    const x = B.x + Math.cos(ang) * r, z = B.z + Math.sin(ang) * r;
    const d = waterY(x, z) - MZ.walkH(x, z); if (d > 0.35) continue;
    if (z > FAR && MZ.up?.canStand && !MZ.up.canStand(x, z)) continue;
    const sc = r - ((x - B.x) * fx + (z - B.z) * fz) * 0.1; if (sc < bd) { bd = sc; best = [x, z]; } } }
  if (!best) return null; return out.set(best[0], 0, best[1]);
}
const _sh = new THREE.Vector3();
function leave(to) {
  if (!B.on) return;
  B.on = false; paddle.visible = false; document.body.classList.remove('boating'); ui.hud.hidden = true;
  const p = to || shoreNear(_sh) || new THREE.Vector3(B.x + 1.5, 0, B.z);
  player.pos.set(p.x, MZ.walkH(p.x, p.z), p.z); player.vel.set(0, 0, 0); player.vy = 0; player.grounded = true;
  player.face = player.faceT = Math.atan2(p.x - B.x, p.z - B.z);
  B.v = B.vs = B.wy = 0;
  for (const f of B.onStep) f('leave');
}
B.leave = leave;
function place(x, z, yaw) { if (!ensure()) return; B.x = x; B.z = z; B.yaw = yaw; B.v = B.vs = B.wy = 0; B.g.visible = true; B.g.position.set(x, waterY(x, z) + 0.05, z); B.g.rotation.set(0, yaw, 0.05); B.away = true; }
B.place = place;
/* in the boat, then sitting: a respawn (a chase checkpoint, or washing up) */
B.respawn = (x, z, yaw) => { place(x, z, yaw); if (!B.on) board(); cam.yaw = yaw + Math.PI; };

/* get in: wherever it's moored */
const _ip = new THREE.Vector3();
INTERACTS.push({ x: 0, z: 0, r: 0, pen: 0.2,
  upd() { if (B.g && B.g.visible && !B.on) { this.x = B.g.position.x; this.z = B.g.position.z; this.r = 3.0; } else this.r = 0; },
  state() {
    if (B.on || !B.g || !B.g.visible || !MZ.arsenal?.reedBoat || !(S.arsenal?.have?.toma_bench)) return null;
    if (B.g.position.z < FAR && MZ.iceN > 0.6) return { ok: false, text: 'The reed boat · frozen in' };
    if (MZ.up?.boardBlock?.()) return null;
    return { ok: true, text: 'Get in the reed boat', hold: 0.5 }; },
  done() { board(); }, pos: () => _ip.set(B.g.position.x, B.g.position.y + 0.6, B.g.position.z) });
/* step ashore */
INTERACTS.push({ x: 0, z: 0, r: 0, pen: 0.8,
  upd() { if (B.on) { this.x = B.x; this.z = B.z; this.r = 3.5; } else this.r = 0; },
  state() { if (!B.on || B.locked) return null; if (MZ.up?.leaveBlock?.()) return null; const p = shoreNear(_sh); if (!p) return null; return { ok: true, text: 'Step ashore', hold: 0.45 }; },
  done() { leave(); }, pos: () => { const p = shoreNear(_sh); return _ip.set(p ? p.x : B.x, waterY(B.x, B.z) + 0.6, p ? p.z : B.z); } });

/* ---------- the ride: replaces her walking while she's in the boat ---------- */
const STROKE = 0.62;                         /* one stroke, one side */
const _n = new THREE.Vector3();
function grounded(x, z) { const w = waterY(x, z); if (bedY(x, z) > w - 0.24) return true; for (const f of B.blockers) if (f(x, z)) return true; return false; }
function hullHit(x, z, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  const pts = [[1.45, 0], [-1.35, 0], [0.4, 0.5], [0.4, -0.5], [-0.6, 0.5], [-0.6, -0.5]];
  for (const [f, r] of pts) if (grounded(x + fx * f + rx * r, z + fz * f + rz * r)) return [f, r];
  return null;
}
function rideStep(dt) {
  if (!B.on) return false;
  const p = player, A = MZ.arsenal;
  const control = MZ.mode === 'play' && !MZ.cine && !MZ.journalOpen && !MZ.photo.on && !MZ.talk.on && !B.locked;
  const aiming = A && A.aimK > 0.5;
  const K = MZ.keyDown;
  let fw = 0, turn = 0;
  if (control && !aiming) {
    if (K('KeyW') || K('ArrowUp')) fw += 1; if (K('KeyS') || K('ArrowDown')) fw -= 1;
    if (K('KeyA') || K('ArrowLeft')) turn += 1; if (K('KeyD') || K('ArrowRight')) turn -= 1;
  }
  if (B.auto) { const a = B.auto(dt); fw = a.fw; turn = a.turn; }
  const paddling = fw !== 0 || turn !== 0;
  /* the stroke cycle: each half is a pull on one side */
  if (paddling) { const prev = B.ph; B.ph += dt / STROKE; if (Math.floor(prev) !== Math.floor(B.ph)) { B.side = -B.side; if (rnd() < 0.8) SFX.splash?.(); B.wake = 0.35; } }
  else B.ph = damp(B.ph, Math.round(B.ph), 3, dt);
  const ph = B.ph % 1, pull = Math.sin(Math.PI * ph) ** 2;
  /* thrust, turning, drag, the current */
  const still = B.still || 0, extra = drag(B.x, B.z) + still * 1.6;
  if (fw > 0) B.v += pull * 4.4 * dt * (1 - still * 0.6);
  else if (fw < 0) B.v = damp(B.v, -0.9, 1.4, dt);
  B.v -= B.v * (0.6 + extra) * dt;
  B.v = clamp(B.v, -1.2, B.maxV + B.power);
  B.power = Math.max(0, B.power - dt * 0.55);
  const tgtW = turn * (0.75 + Math.min(Math.abs(B.v), 3) * 0.12) + (fw > 0 ? B.side * pull * 0.08 : 0);
  B.wy = damp(B.wy, tgtW, turn ? 3.2 : 2.2, dt);
  B.yaw += B.wy * dt;
  B.vs = damp(B.vs, 0, 2.4, dt);
  const fl = flowAt(B.x, B.z), fk = 1 - still;
  const fx = Math.sin(B.yaw), fz = Math.cos(B.yaw), rx = fz, rz = -fx;
  let vx = fx * B.v + rx * B.vs + fl.x * fk, vz = fz * B.v + rz * B.vs + fl.y * fk;
  let nx = B.x + vx * dt, nz = B.z + vz * dt;
  const hit = hullHit(nx, nz, B.yaw);
  if (hit) {
    /* push off the bank: back along the bed's slope, and turn along it */
    const e = 0.6, gx = bedY(nx + e, nz) - bedY(nx - e, nz), gz = bedY(nx, nz + e) - bedY(nx, nz - e); const gl = Math.hypot(gx, gz) || 1;
    _n.set(-gx / gl, 0, -gz / gl);
    if (!hullHit(B.x, B.z, B.yaw)) { nx = B.x; nz = B.z; }
    else { nx = B.x + _n.x * 0.6 * dt * 4; nz = B.z + _n.z * 0.6 * dt * 4; }
    const into = vx * -_n.x + vz * -_n.z;
    if (into > 0.6 && B.bump <= 0) { SFX.knock?.(0, 180); B.bump = 0.5; MZ.cam.shake = Math.max(MZ.cam.shake || 0, 0.12); }
    B.v *= 0.55; B.wy += (hit[1] > 0 ? -1 : 1) * 0.4 * dt * 8 * Math.sign(B.v || 1);
  }
  B.bump = Math.max(0, B.bump - dt);
  B.x = nx; B.z = nz;
  /* power strokes cool down */
  B.cool = Math.max(0, B.cool - dt); B.good = Math.max(0, B.good - dt);
  /* place the boat and her */
  const t = G.uTime.value, wy = waterY(B.x, B.z);
  const roll = Math.sin(t * 1.3) * 0.025 + B.wy * -0.06 + (fw > 0 ? B.side * pull * 0.03 : 0), pitch = Math.sin(t * 1.1) * 0.015 - Math.min(B.v, 4) * 0.008;
  B.g.position.set(B.x, wy + 0.05 + Math.sin(t * 1.7) * 0.02, B.z); B.g.rotation.set(pitch, B.yaw, 0.05 + roll, 'YXZ');
  seatWorld(p.pos); p.vel.set(0, 0, 0); p.vy = 0; p.grounded = true; p.busy = 0; p.speedK = 0;
  if (!aiming) { p.face = p.faceT = B.yaw; } p.idle = 0;
  /* the wake */
  B.wake = Math.max(0, B.wake - dt);
  if (Math.abs(B.v) > 0.6 && rnd() < dt * (2 + Math.abs(B.v) * 2)) { MZ.addRipple?.(B.x - fx * 1.4, B.z - fz * 1.4, 0.5); MZ.fxSoft.emit(B.x - fx * 1.2 + rr(-0.3, 0.3), wy + 0.04, B.z - fz * 1.2 + rr(-0.3, 0.3), rr(-0.3, 0.3), rr(0.2, 0.6), rr(-0.3, 0.3), _wc.setRGB(0.92, 0.96, 1), 0.12, 0.6, 2, 0.4); }
  if (B.wake > 0.3 && rnd() < 0.5) { const px = B.x + rx * B.side * 1.1, pz = B.z + rz * B.side * 1.1; MZ.addRipple?.(px, pz, 0.6); }
  for (const f of B.onStep) f('step', dt);
  B.hint = Math.max(0, B.hint - dt);
  return true;
}
const _wc = new THREE.Color();
HOOKS.ride = rideStep;
function powerStroke() {
  if (!B.on || B.cool > 0 || B.locked || MZ.talk.on || MZ.cine) return;
  const ph = B.ph % 1; const off = Math.min(ph, 1 - ph);
  const good = off < 0.2;
  B.v = Math.min(B.v + (good ? 1.15 : 0.45), B.maxV + 2.0); B.power = good ? Math.min(B.power + 0.7, 1.8) : B.power;
  B.cool = 0.32; B.good = good ? 0.6 : 0; ui.hit.textContent = good ? 'Good stroke' : 'Steady…'; ui.hitT = 0.9;
  SFX.splash?.(); B.wake = 0.4; if (good) SFX.knock?.(0, 660);
  B.ph = Math.round(B.ph) + 0.05;          /* a power stroke resets the rhythm onto its catch */
  for (const f of B.onStep) f(good ? 'good' : 'power');
}
B.powerStroke = powerStroke;
addEventListener('keydown', (e) => { if (!B.on || e.repeat) return; if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); powerStroke(); } }, true);

/* ---------- her pose in the boat (before Aoi's bones are set, after the arsenal's arms) ---------- */
HOOKS.pose.push((dt) => {
  if (!B.on || !B.g) return;
  const p = player, A = MZ.arsenal;
  const ph = B.ph % 1, s = B.side, pull = Math.sin(Math.PI * ph);
  p.body.position.y = -0.72; p.body.rotation.x = 0.08 + pull * 0.1; p.body.rotation.z = -s * pull * 0.06;
  p.legs[0].rotation.x = -1.45; p.legs[1].rotation.x = -1.45;
  const aiming = A && (A.aimK > 0.3 || (A.ranged && A.ranged() && A.aim));
  const swinging = (MZ.combat?.CB?.strike?.t ?? -1) >= 0;            /* a staff swing from the boat keeps its arms */
  if (!aiming && !swinging) {
    /* both hands on the paddle shaft; it dips on one side, then the other */
    const r = -1.05 - s * pull * 0.35, l = -1.05 + s * pull * 0.35;
    p.arms[1].rotation.set(r, 0, -0.18 + s * pull * 0.1); p.arms[0].rotation.set(l, 0, 0.18 + s * pull * 0.1);
    if (MZ.hero) MZ.hero.aimElbow = [0.7, 0.7];
  }
  if (paddle) {
    paddle.visible = !aiming;
    paddle.rotation.set(0, Math.sin(ph * Math.PI) * 0.45 * s, s * (0.42 + pull * 0.2));
    paddle.position.set(0, 0.62, 0.32);
  }
  const gear = MZ.combat?.gear; if (gear && !aiming) { gear.hand.visible = false; }
});

/* ---------- the HUD: the stroke ring and the keys ---------- */
const ui = (() => {
  const st = document.createElement('style');
  st.textContent = `#boatHud{position:absolute;left:50%;bottom:calc(16vh + 26px);transform:translateX(-50%);display:flex;align-items:center;gap:12px;color:#f4ead8;font-size:15px;text-shadow:0 1px 6px rgba(0,0,0,.85);pointer-events:none;z-index:6}
  #boatHud .ring{width:40px;height:40px;border-radius:50%;border:3px solid rgba(255,220,160,.9);box-shadow:0 0 16px rgba(255,190,110,.55);transform:scale(var(--s,1));transition:border-color .2s}
  #boatHud .ring.good{border-color:#ffe9a8}
  #boatHud .hit{color:#ffd9a0;font-weight:700;min-height:1.2em}
  #boatHud .keys{opacity:.85;font-size:13px}
  body.boating #hint{opacity:0}`;
  document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'boatHud'; d.hidden = true;
  d.innerHTML = '<div class="ring"></div><div><div class="hit"></div><div class="keys">W paddle · A D steer · S back · Space power stroke · hold E to step ashore</div></div>';
  (document.getElementById('hud') || document.body).appendChild(d);
  return { hud: d, ring: d.querySelector('.ring'), hit: d.querySelector('.hit'), keys: d.querySelector('.keys'), hitT: 0 };
})();
HOOKS.vis.push((dt) => {
  if (!B.on) return;
  const ph = B.ph % 1; ui.ring.style.setProperty('--s', String(1 + 0.3 * Math.max(0, Math.cos(ph * TAU)) ** 6));
  ui.ring.classList.toggle('good', B.good > 0);
  ui.hitT = Math.max(0, ui.hitT - dt); if (ui.hitT <= 0) ui.hit.textContent = '';
  ui.keys.style.opacity = B.hint > 0 || B.locked ? '0.9' : '0.45';
});

/* washing up out of the boat: she comes back to it, not to the far bank */
MZ.combat?.CB && (MZ.combat.CB.onWash = MZ.combat.CB.onWash || []);
MZ.combat?.CB?.onWash.push(() => { if (B.on && !(MZ.up?.on)) leave(); });
export { B };
