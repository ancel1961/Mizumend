/* ================================================================
   Mizumend · pond wildlife (v13). Life comes back to Mill Pond as you mend it:
   - after the first project: fish moving under the surface and dragonflies over the shallows
   - after the second: frogs at the water's edge and turtles basking on the old log
   - when the pond is whole: a grey heron wading the shallows at dawn and dusk, koi among the fish
   Everything shies away from Aoi: frogs hop in, turtles slide off, the heron lifts off and lands further along.
   Seasons matter: no frogs, turtles or dragonflies in winter, and nothing moves under the ice.
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
const {scene,player,S,PARAMS,makeToon,addOutline,addRipple,SFX,clamp,lerp,damp,rr,rnd,G,groundH,stage} = MZ;
const POND_R = MZ.POND_R || 23;
const TAU = Math.PI * 2;
const toon = (c, o = {}) => makeToon(c, Object.assign({ noHeal: true, rim: 0.35 }, o));
const lv = () => MZ.levelCur;
const lvT = () => (MZ.LEVELS ? MZ.LEVELS[Math.max(0, Math.min(3, stage()))] : MZ.levelCur);   /* where the water is settling to */
const depth = (x, z) => lvT() - groundH(x, z);
const frozen = () => MZ.SEASON === 'winter' && (MZ.iceN || 0) > 0.6;
const day = () => MZ.nightF < 0.5;
const warm = () => MZ.SEASON !== 'winter';
const pd = (p) => Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, ol = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); if (ol) addOutline(m, ol); return m; }
/* a point in the pond whose water depth is between a and b */
function pondAt(a, b, out, rMin = 0, rMax = POND_R) {
  for (let i = 0; i < 60; i++) {
    const ang = rnd() * TAU, r = rMin + Math.sqrt(rnd()) * (rMax - rMin), x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const d = depth(x, z); if (d > a && d < b && !(MZ.onBridge && MZ.onBridge(x, z))) { out.set(x, 0, z); return true; }
  }
  return false;
}
const W = { fish: [], flies: [], frogs: [], turtles: [], heron: null, log: null, built: false, stage: -1 };

/* ---------- fish: soft dark shapes under the water; koi (white, orange) once the pond is whole ---------- */
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x14202a, transparent: true, opacity: 0.42, depthWrite: false });
function makeFish(koi) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6).scale(0.55, 0.32, 1.6), koi ? toon(koi, { rim: 0.5 }) : shadowMat);
  g.add(body);
  const tail = new THREE.Group(); tail.position.z = -0.25; g.add(tail);
  const tg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.09, 0, -0.16), new THREE.Vector3(0.09, 0, -0.16)]);
  tg.setIndex([0, 1, 2, 0, 2, 1]); tg.computeVertexNormals();
  mesh(tg, koi ? toon(koi) : shadowMat, tail);
  if (koi === 0xf4efe6) { const patch = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6).scale(0.8, 0.5, 1.2), toon(0xe0602a)); patch.position.set(0, 0.035, 0.08); g.add(patch); }
  g.scale.setScalar(1.4); g.visible = false; scene.add(g);
  return { g, tail, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), sp: rr(0.3, 0.6), head: rnd() * TAU, ph: rnd() * 9, flee: 0, koi: !!koi };
}
function fishStep(f, dt, t) {
  const want = f.flee > 0 ? 2.4 : f.sp;
  f.flee = Math.max(0, f.flee - dt);
  const dx = f.tgt.x - f.pos.x, dz = f.tgt.z - f.pos.z, L = Math.hypot(dx, dz);
  if (L < 0.6 || depth(f.pos.x, f.pos.z) < 0.35) pondAt(0.55, 9, f.tgt, 0, POND_R - 3);
  const ph = pd(f.pos);
  if (ph < 2.2 && depth(player.pos.x, player.pos.z) > -0.2 && f.flee <= 0) { f.flee = 1.4; f.tgt.set(f.pos.x + (f.pos.x - player.pos.x) * 3, 0, f.pos.z + (f.pos.z - player.pos.z) * 3); }
  const a = Math.atan2(dx, dz); let da = a - f.head; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  f.head += clamp(da, -2.2 * dt, 2.2 * dt);
  f.pos.x += Math.sin(f.head) * want * dt; f.pos.z += Math.cos(f.head) * want * dt;
  f.g.position.set(f.pos.x, lv() - (f.koi ? 0.16 : 0.3) - Math.sin(t * 0.7 + f.ph) * 0.04, f.pos.z);
  f.g.rotation.y = f.head;
  f.tail.rotation.y = Math.sin(t * (f.flee > 0 ? 18 : 6) + f.ph) * 0.45;
}

/* ---------- dragonflies: dart, hover, dart ---------- */
const wingMat = new THREE.MeshBasicMaterial({ color: 0xdfeaf2, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
function makeFly(col) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.15, 5).rotateX(Math.PI / 2).translate(0, 0, -0.03), toon(col, { rim: 0.6 }), g);
  mesh(new THREE.SphereGeometry(0.018, 6, 5), toon(col), g, 0, 0, 0.055);
  const wings = new THREE.Group(); g.add(wings);
  const wg = new THREE.PlaneGeometry(0.1, 0.022).translate(0.05, 0, 0).rotateX(-Math.PI / 2);
  for (const [sx, z] of [[1, 0.02], [-1, 0.02], [1, -0.01], [-1, -0.01]]) { const w = new THREE.Mesh(wg, wingMat); w.position.z = z; w.rotation.y = sx > 0 ? 0 : Math.PI; wings.add(w); }
  g.scale.setScalar(1.8); g.visible = false; scene.add(g);
  return { g, wings, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), hover: rr(0.5, 2), head: 0, ph: rnd() * 9 };
}
function flyStep(f, dt, t) {
  f.hover -= dt;
  const dx = f.tgt.x - f.pos.x, dy = f.tgt.y - f.pos.y, dz = f.tgt.z - f.pos.z, L = Math.hypot(dx, dy, dz);
  if (f.hover <= 0 && L < 0.15) {
    /* a new spot over the shallows, a few metres along */
    for (let i = 0; i < 12; i++) {
      const a = Math.atan2(f.pos.z, f.pos.x) + rr(-0.35, 0.35), r = clamp(Math.hypot(f.pos.x, f.pos.z) + rr(-3, 3), 6, POND_R + 1);
      const x = Math.cos(a) * r, z = Math.sin(a) * r, d = depth(x, z);
      if (d > -0.1 && d < 1.2) { f.tgt.set(x, lv() + rr(0.35, 1.3), z); break; }
    }
    f.hover = rr(0.8, 3.5);
  }
  if (pd(f.pos) < 1.2) { f.tgt.x += (f.pos.x - player.pos.x) * 2; f.tgt.z += (f.pos.z - player.pos.z) * 2; f.hover = 0.5; }
  if (L > 0.02) { const sp = Math.min(L, 7 * dt); f.pos.x += dx / L * sp; f.pos.y += dy / L * sp; f.pos.z += dz / L * sp; f.head = Math.atan2(dx, dz); }
  f.g.position.set(f.pos.x, f.pos.y + Math.sin(t * 9 + f.ph) * 0.015, f.pos.z);
  f.g.rotation.y = damp(f.g.rotation.y, f.head, 10, dt);
  f.wings.rotation.z = Math.sin(t * 60 + f.ph) * 0.35;
  f.wings.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(t * 47 + f.ph));
}

/* ---------- frogs: sit at the edge, croak, hop in when you come close, come back out later ---------- */
function makeFrog(col) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const M = toon(col, { rim: 0.4 }), B = toon(new THREE.Color(col).multiplyScalar(0.7).getHex());
  mesh(new THREE.SphereGeometry(0.09, 10, 8).scale(1, 0.62, 1.25), M, body, 0, 0.055, 0, 0.008);
  const throat = mesh(new THREE.SphereGeometry(0.05, 8, 6).scale(1.1, 0.7, 0.8), toon(0xe8dca0), body, 0, 0.035, 0.07);
  for (const sx of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.03, 8, 6), M, body, sx * 0.045, 0.105, 0.065);
    mesh(new THREE.SphereGeometry(0.016, 6, 5), toon(0x121010, { rim: 0 }), body, sx * 0.05, 0.115, 0.085);
    mesh(new THREE.SphereGeometry(0.035, 6, 5).scale(0.7, 0.5, 1.6), B, body, sx * 0.075, 0.025, -0.06);
    mesh(new THREE.SphereGeometry(0.02, 6, 5).scale(0.8, 0.5, 1.4), B, body, sx * 0.06, 0.015, 0.07);
  }
  g.scale.setScalar(1.8); g.visible = false; scene.add(g);
  return { g, body, throat, pos: new THREE.Vector3(), state: 'gone', t: rr(1, 8), from: new THREE.Vector3(), to: new THREE.Vector3(), croak: rr(3, 9), face: 0 };
}
function edgeSpot(out) {   /* water's edge: dry ground right next to water */
  for (let i = 0; i < 80; i++) {
    const a = rnd() * TAU, r = rr(POND_R - 6, POND_R + 3), x = Math.cos(a) * r, z = Math.sin(a) * r, d = depth(x, z);
    if (d < -0.02 && d > -0.22 && pd({ x, z }) > 6) { out.set(x, groundH(x, z), z); return true; }
  }
  return false;
}
function frogStep(f, dt, t) {
  if (f.state !== 'hop') f.t -= dt;
  if (f.state === 'gone') { f.g.visible = false; if (f.t <= 0 && edgeSpot(f.pos)) { f.state = 'sit'; f.face = Math.atan2(-f.pos.x, -f.pos.z) + rr(-0.8, 0.8); f.t = 0; } return; }
  f.g.visible = true;
  if (f.state === 'sit') {
    f.g.position.copy(f.pos); f.g.rotation.y = f.face;
    const pulse = Math.max(0, Math.sin(t * 7)) * (f.croak < 0.6 ? 1 : 0.15);
    f.throat.scale.setScalar(1 + pulse * 0.9);
    f.croak -= dt; if (f.croak <= 0) { f.croak = rr(4, 12); if (pd(f.pos) < 28 && MZ.mode === 'play') SFX.croak?.(clamp((f.pos.x - player.pos.x) / 20, -0.8, 0.8)); }
    if (pd(f.pos) < 2.6) {   /* hop into the water, away from her */
      f.state = 'hop'; f.t = 0; f.from.copy(f.pos);
      const ax = f.pos.x - player.pos.x, az = f.pos.z - player.pos.z, L = Math.hypot(ax, az) || 1;
      let tx = f.pos.x + ax / L * 0.6 - f.pos.x / Math.hypot(f.pos.x, f.pos.z) * 1.4, tz = f.pos.z + az / L * 0.6 - f.pos.z / Math.hypot(f.pos.x, f.pos.z) * 1.4;
      f.to.set(tx, lv(), tz); f.face = Math.atan2(tx - f.pos.x, tz - f.pos.z);
    }
  } else if (f.state === 'hop') {
    f.t += dt; const k = clamp(f.t / 0.42, 0, 1);
    f.g.position.lerpVectors(f.from, f.to, k); f.g.position.y = lerp(f.from.y, f.to.y, k) + Math.sin(k * Math.PI) * 0.45;
    f.g.rotation.y = f.face; f.body.rotation.x = -0.5 + k;
    if (k >= 1) { addRipple(f.to.x, f.to.z, 0.6); SFX.plop?.(); f.state = 'gone'; f.t = rr(10, 22); f.body.rotation.x = 0; }
  }
}

/* ---------- turtles on the old log ---------- */
function makeLog() {
  const g = new THREE.Group();
  const log = mesh(new THREE.CylinderGeometry(0.2, 0.24, 3.0, 9).rotateZ(Math.PI / 2), toon(0x6a5238, { rim: 0.25 }), g, 0, 0, 0, 0.012);
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6).rotateZ(0.9), toon(0x5c4630), g, 0.6, 0.18, 0.05);
  mesh(new THREE.SphereGeometry(0.26, 8, 5).scale(1.3, 0.25, 1), toon(0x5a7a3a), g, -0.6, 0.18, 0.02);   /* a cap of moss */
  log.castShadow = true; scene.add(g); return g;
}
function makeTurtle() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  mesh(new THREE.SphereGeometry(0.16, 12, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1.25), toon(0x4a5a38, { rim: 0.45 }), body, 0, 0.0, 0, 0.008);
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12).scale(1, 1, 1.25), toon(0xc8b070), body, 0, 0.0, 0);
  const head = mesh(new THREE.SphereGeometry(0.045, 8, 6).scale(0.9, 0.8, 1.3), toon(0x5a6a40), body, 0, 0.02, 0.22);
  for (const sx of [-1, 1]) { mesh(new THREE.SphereGeometry(0.012, 5, 4), toon(0x101010, { rim: 0 }), head, sx * 0.025, 0.015, 0.03); mesh(new THREE.SphereGeometry(0.035, 6, 4).scale(1.2, 0.4, 0.8), toon(0x5a6a40), body, sx * 0.13, -0.01, 0.12); }
  g.scale.setScalar(1.5); g.visible = false; scene.add(g);
  return { g, body, head, state: 'gone', t: rr(2, 6), slot: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
}
const LOG = { x: 0, z: 0, y: 0, rot: 0 };
function turtleStep(tu, dt, t) {
  if (tu.state !== 'slide') tu.t -= dt;
  const sx = LOG.x + Math.cos(LOG.rot) * (tu.slot ? 0.55 : -0.25), sz = LOG.z - Math.sin(LOG.rot) * (tu.slot ? 0.55 : -0.25), sy = LOG.y + 0.2;
  if (tu.state === 'gone') { tu.g.visible = false; if (tu.t <= 0 && pd({ x: sx, z: sz }) > 7 && day()) { tu.state = 'bask'; tu.g.visible = true; } return; }
  tu.g.visible = true;
  if (tu.state === 'bask') {
    tu.g.position.set(sx, sy, sz); tu.g.rotation.set(0, -LOG.rot + (tu.slot ? 0.3 : Math.PI - 0.2), 0);
    tu.head.position.z = 0.2 + Math.sin(t * 0.4 + tu.slot) * 0.025;
    if (pd(tu.g.position) < 4.5 || !day()) { tu.state = 'slide'; tu.t = 0; tu.from.copy(tu.g.position); tu.to.set(sx + Math.sin(LOG.rot) * (tu.slot ? 0.5 : -0.5), lv() - 0.15, sz + Math.cos(LOG.rot) * (tu.slot ? 0.5 : -0.5)); }
  } else if (tu.state === 'slide') {
    tu.t += dt; const k = clamp(tu.t / 0.7, 0, 1);
    tu.g.position.lerpVectors(tu.from, tu.to, k * k); tu.body.rotation.x = k * 0.6;
    if (k >= 1) { addRipple(tu.to.x, tu.to.z, 0.7); SFX.plop?.(); tu.state = 'gone'; tu.t = rr(18, 34); tu.body.rotation.x = 0; }
  }
}

/* ---------- the heron: wades at dawn and dusk; lifts off if you come close ---------- */
function makeHeron() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const grey = toon(0x8f9aa6, { rim: 0.5 }), dark = toon(0x3a4048), pale = toon(0xe8eaec), bill = toon(0xd8b040);
  mesh(new THREE.SphereGeometry(0.2, 12, 8).scale(0.85, 0.8, 1.7), grey, body, 0, 0.92, 0, 0.012);
  mesh(new THREE.ConeGeometry(0.12, 0.42, 6).rotateX(-Math.PI / 2 - 0.25), dark, body, 0, 0.94, -0.42);
  const neck = new THREE.Group(); neck.position.set(0, 1.02, 0.26); body.add(neck);
  const n1 = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 6), pale, neck, 0, 0.16, 0.03); n1.rotation.x = 0.35;
  const head = new THREE.Group(); head.position.set(0, 0.34, 0.1); neck.add(head);
  mesh(new THREE.SphereGeometry(0.055, 8, 6).scale(0.9, 0.9, 1.2), pale, head, 0, 0, 0, 0.006);
  mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.18, 4).translate(0, 0.08, 0).rotateZ(0.0), dark, head, 0, 0.04, -0.05).rotation.x = -2.2;   /* the black crest plume */
  const b = mesh(new THREE.ConeGeometry(0.018, 0.2, 5), bill, head, 0, -0.005, 0.13); b.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.01, 5, 4), toon(0x121010, { rim: 0 }), head, 0.04, 0.012, 0.03);
  mesh(new THREE.SphereGeometry(0.01, 5, 4), toon(0x121010, { rim: 0 }), head, -0.04, 0.012, 0.03);
  const legs = [];
  for (const sx of [-1, 1]) { const L = new THREE.Group(); L.position.set(sx * 0.06, 0.8, 0.02); body.add(L); mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4).translate(0, -0.4, 0), toon(0xb89a40), L); legs.push(L); }
  const wings = [];
  for (const sx of [-1, 1]) { const wg = new THREE.Group(); wg.position.set(sx * 0.12, 1.0, 0); body.add(wg);
    const w = mesh(new THREE.PlaneGeometry(0.85, 0.42).translate(0.42, 0, 0).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x7f8a96, side: THREE.DoubleSide }), wg); w.rotation.y = sx > 0 ? 0 : Math.PI; wg.visible = false; wings.push(wg); }
  g.visible = false; scene.add(g);
  return { g, body, neck, head, legs, wings, state: 'away', t: rr(2, 5), pos: new THREE.Vector3(), tgt: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), face: 0, strike: 0, call: 0 };
}
const heronHours = () => { const h = MZ.hours; return (h > 5.2 && h < 8.5) || (h > 16.8 && h < 20.2); };
function heronStep(h, dt, t) {
  if (h.state !== 'land' && h.state !== 'fly') h.t -= dt;
  const wingsOn = (on) => { for (const w of h.wings) w.visible = on; };
  if (h.state === 'away') { h.g.visible = false; if (h.t <= 0 && heronHours() && !frozen()) { if (pondAt(0.08, 0.32, h.to, POND_R - 9, POND_R + 1) && pd(h.to) > 12) { h.state = 'land'; h.t = 0; h.from.set(h.to.x * 2.4, lv() + 14, h.to.z * 2.4); h.to.y = groundH(h.to.x, h.to.z); h.face = Math.atan2(h.to.x - h.from.x, h.to.z - h.from.z); } } return; }
  h.g.visible = true;
  if (h.state === 'land' || h.state === 'fly') {
    h.t += dt; const dur = h.state === 'land' ? 5 : 6, k = clamp(h.t / dur, 0, 1);
    const e = h.state === 'land' ? 1 - Math.pow(1 - k, 2) : k * k;
    h.g.position.lerpVectors(h.from, h.to, e); h.g.rotation.y = h.face; wingsOn(true);
    const flap = Math.sin(t * (h.state === 'land' && k > 0.8 ? 9 : 5)) * 0.6;
    h.wings[0].rotation.z = flap; h.wings[1].rotation.z = -flap;
    h.body.rotation.x = 0.35 * (1 - (h.state === 'land' ? k * k : 0)); for (const L of h.legs) L.rotation.x = 1.2 * (h.state === 'land' ? 1 - k : 1);
    h.neck.rotation.x = 0.8;
    if (k >= 1) {
      if (h.state === 'land') { h.state = 'wade'; h.t = rr(3, 7); h.pos.copy(h.to); h.tgt.copy(h.to); wingsOn(false); h.body.rotation.x = 0; h.neck.rotation.x = 0; for (const L of h.legs) L.rotation.x = 0; addRipple(h.to.x, h.to.z, 0.5); }
      else { h.state = 'away'; h.t = rr(40, 90); wingsOn(false); }
    }
    return;
  }
  /* wading */
  if (!heronHours() || frozen()) { takeOff(h, false); return; }
  if (pd(h.pos) < 7.5) { takeOff(h, true); return; }
  const dx = h.tgt.x - h.pos.x, dz = h.tgt.z - h.pos.z, L = Math.hypot(dx, dz);
  if (h.strike > 0) {
    h.strike -= dt; const k = 1 - h.strike / 0.6;
    h.neck.rotation.x = Math.sin(k * Math.PI) * 1.3; if (k > 0.45 && k < 0.5) addRipple(h.pos.x + Math.sin(h.face) * 0.6, h.pos.z + Math.cos(h.face) * 0.6, 0.4);
  } else if (L > 0.1 && h.t <= 0) {
    const sp = 0.35 * dt; h.pos.x += dx / L * sp; h.pos.z += dz / L * sp; h.face = Math.atan2(dx, dz);
    const st = Math.sin(t * 2.2); h.legs[0].rotation.x = st * 0.35; h.legs[1].rotation.x = -st * 0.35;
    h.neck.rotation.x = Math.sin(t * 2.2) * 0.06;
  } else {
    for (const L2 of h.legs) L2.rotation.x = damp(L2.rotation.x, 0, 6, dt);
    if (h.t <= 0) { h.t = rr(4, 10); if (rnd() < 0.4) h.strike = 0.6; else { const a = rr(0, TAU); const x = h.pos.x + Math.cos(a) * 2.5, z = h.pos.z + Math.sin(a) * 2.5, d = depth(x, z); if (d > 0.06 && d < 0.36) h.tgt.set(x, 0, z); } }
  }
  h.g.position.set(h.pos.x, groundH(h.pos.x, h.pos.z), h.pos.z);
  h.g.rotation.y = damp(h.g.rotation.y, h.face, 3, dt);
  h.head.rotation.y = Math.sin(t * 0.5) * 0.3;
}
function takeOff(h, startled) {
  h.state = 'fly'; h.t = 0; h.from.copy(h.g.position);
  const a = Math.atan2(h.pos.z - player.pos.z, h.pos.x - player.pos.x);
  h.to.set(h.pos.x + Math.cos(a) * 40, lv() + 18, h.pos.z + Math.sin(a) * 40); h.face = Math.atan2(h.to.x - h.from.x, h.to.z - h.from.z);
  if (startled) { SFX.heron?.(clamp((h.pos.x - player.pos.x) / 20, -0.8, 0.8)); SFX.wings?.(); }
}

/* the basking log: half in the water on a shallow shelf, away from the south shore where she arrives; it moves
   with the water line as the pond settles */
function placeLog() {
  const p = new THREE.Vector3(); let ok = false;
  for (let i = 0; i < 300 && !ok; i++) ok = pondAt(0.14, 0.3, p, POND_R - 9, POND_R + 1) && Math.abs(Math.atan2(p.z, p.x) - 1.57) > 0.8;
  LOG.x = p.x; LOG.z = p.z; LOG.y = lvT() - 0.03; LOG.rot = Math.atan2(p.z, p.x) + Math.PI / 2;
  W.log.position.set(LOG.x, LOG.y, LOG.z); W.log.rotation.y = -LOG.rot; W.logStage = stage();
}
/* ---------- build and populate by stage ---------- */
function build() {
  W.built = true;
  for (let i = 0; i < 4; i++) W.fish.push(makeFish(null));
  W.fish.push(makeFish(0xf4efe6), makeFish(0xe8742c), makeFish(0xf2f0ea));
  const flyCols = [0x3a72d0, 0xd8452e, 0x3a72d0, 0xc8582a, 0x2f8a6a];
  for (const c of flyCols) W.flies.push(makeFly(c));
  for (const c of [0x6a9a3a, 0x7aa848, 0x5a8a34, 0x8ab048]) W.frogs.push(makeFrog(c));
  W.log = makeLog(); placeLog();
  W.turtles.push(makeTurtle(), makeTurtle()); W.turtles[1].slot = 1;
  W.heron = makeHeron();
  for (const f of W.fish) { pondAt(0.6, 9, f.pos, 0, POND_R - 3); f.tgt.copy(f.pos); }
  for (const f of W.flies) { pondAt(0, 1, f.pos, 8, POND_R); f.pos.y = 1; f.tgt.copy(f.pos); }
}
/* creatures move on game time (the fixed-step sim), drawn once per frame */
let acc = 0;
MZ.HOOKS.sim.push((dt) => { acc += dt; });
MZ.HOOKS.vis.push((vdt) => {
  const dt = Math.min(acc, 1.0); acc = 0;
  if (!dt) return;
  const st = stage(), t = G.uTime.value;
  if (st < 1) { if (W.built) for (const k of ['fish', 'flies', 'frogs', 'turtles']) for (const c of W[k]) c.g.visible = false; if (W.heron) W.heron.g.visible = false; if (W.log) W.log.visible = false; return; }
  if (!W.built) build();
  const near = Math.hypot(player.pos.x, player.pos.z) < POND_R + 45;     /* skip the work when she's far up the valley */
  W.log.visible = st >= 2; if (W.logStage !== st) placeLog();
  const ice = frozen();
  const nFish = ice ? 0 : st >= 3 ? 7 : st >= 2 ? 5 : 3;
  W.fish.forEach((f, i) => { const on = near && i < nFish && (i < 4 || st >= 3); f.g.visible = on; if (on) fishStep(f, dt, t); });
  const flyOn = near && warm() && day() && !(MZ.W && MZ.W.rain > 0.3);
  const nFly = st >= 3 ? 5 : st >= 2 ? 4 : 2;
  W.flies.forEach((f, i) => { const on = flyOn && i < nFly; f.g.visible = on; if (on) flyStep(f, dt, t); });
  const frogOn = near && warm() && st >= 2;
  W.frogs.forEach((f, i) => { if (frogOn && i < (st >= 3 ? 4 : 2)) frogStep(f, dt, t); else f.g.visible = false; });
  const turtOn = near && warm() && st >= 2;
  W.turtles.forEach((tu, i) => { if (turtOn && i < (st >= 3 ? 2 : 1)) turtleStep(tu, dt, t); else tu.g.visible = false; });
  if (st >= 3 && near) heronStep(W.heron, dt, t); else W.heron.g.visible = false;
});
MZ.wild = W;
if (PARAMS.debug === '1' || PARAMS.debug === 'true') window.__mzw = W;
