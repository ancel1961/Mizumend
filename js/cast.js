/* ================================================================
   Mizumend · the cast (v13). Kiyo, Toma and later the rest of the village, built by npc_mpfb.py from the same
   MPFB2 pipeline as Aoi and drawn the same way: toon shading from their baked maps on a soft ramp, a thin outline,
   and authored expressions. Each one gets a small procedural body: stand, walk, sit, lie, kneel, hold, look at.
   ================================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MZ } from './game.js';
const { scene, makeToon, clamp, lerp, damp, G, renderer } = MZ;

const softRamp = (() => { const t = new THREE.DataTexture(new Uint8Array([92, 150, 215, 255]), 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; })();
const uRes = { value: new THREE.Vector2(1280, 720) };
const outlineMat = (() => {
  const m = new THREE.MeshBasicMaterial({ color: 0x17110d, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRes = uRes;
    sh.vertexShader = 'uniform vec2 uRes;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      { vec3 nv = normalMatrix * objectNormal; vec4 cn = projectionMatrix * vec4(nv, 0.0);
        vec2 d = cn.xy; float L = length(d); if (L > 1e-5) gl_Position.xy += d / L * 1.25 * gl_Position.w * 2.0 / uRes; }`);
  };
  m.customProgramCacheKey = () => 'castOutline';
  return m;
})();
MZ.HOOKS.vis.push(() => renderer.getDrawingBufferSize(uRes.value));

/* the model file, or the same file as base64 text where .glb isn't served */
async function loadBuf(name) {
  try { const r = await fetch('assets/' + name + '.glb'); if (r.ok) { const b = await r.arrayBuffer(); if (b.byteLength > 1000 && new DataView(b).getUint32(0, true) === 0x46546C67) return b; } } catch (e) {}
  const r = await fetch('assets/' + name + '.b64.txt'); if (!r.ok) throw new Error(name + ': no model (' + r.status + ')');
  const txt = (await r.text()).replace(/\s+/g, ''), bin = atob(txt), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
const MUL = { SkinBaked: [1.18, 1.12, 1.08], EyeBaked: [1.1, 1.1, 1.1], HairBaked: [1.25, 1.25, 1.3], HairBunBaked: [1.25, 1.25, 1.3] };
function toonFor(src, who) {
  const n = src.name || 'x', map = src.map || null;
  const o = { noHeal: true, rim: 0.3, map, mapKey: 'cast_' + who + '_' + n, tag: 'cast_' + who + '_' + n };
  const mul = MUL[n] || (map ? [1.3, 1.3, 1.3] : null);
  const col = map ? new THREE.Color(...(mul || [1, 1, 1])) : (src.color ? src.color.clone() : new THREE.Color(0.5, 0.5, 0.5));
  if (n === 'EyeBaked' || n === 'Brow' || n === 'Lashes') o.rim = 0;
  if (n === 'Brow' || n === 'Lashes') { o.alphaTest = 0.3; }
  const m = makeToon(col, o); m.gradientMap = softRamp;
  return m;
}
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();

export class Cast {
  constructor(name, gltf, scale = 1) {
    this.name = name; this.ready = true;
    const root = gltf.scene; root.updateMatrixWorld(true);
    const bones = this.bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const aim = (bn_, ch_, dir) => {
      const bn = bones[bn_], ch = bones[ch_]; if (!bn || !ch) return;
      const a = new THREE.Vector3(), c = new THREE.Vector3(); bn.getWorldPosition(a); ch.getWorldPosition(c);
      const q = new THREE.Quaternion().setFromUnitVectors(c.sub(a).normalize(), dir.clone().normalize());
      const wq = new THREE.Quaternion(); bn.getWorldQuaternion(wq); const pq = new THREE.Quaternion(); bn.parent.getWorldQuaternion(pq);
      bn.quaternion.copy(pq.invert().multiply(q.multiply(wq))); root.updateMatrixWorld(true);
    };
    for (const [s, n] of [[1, 'l'], [-1, 'r']]) { aim('upperarm_' + n, 'lowerarm_' + n, new THREE.Vector3(s * 0.17, -1, -0.04)); aim('lowerarm_' + n, 'hand_' + n, new THREE.Vector3(s * 0.08, -1, 0.12)); }
    this.REST = {};
    for (const [n, b] of Object.entries(bones)) { const pq = new THREE.Quaternion(); if (b.parent) b.parent.getWorldQuaternion(pq); this.REST[n] = { L: b.quaternion.clone(), Rp: pq }; }
    this.morphs = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.material = toonFor(o.material, name);
      o.castShadow = /^(Body|Jacket|Trousers|HairCap)/.test(o.name); o.receiveShadow = false;
      if (o.morphTargetDictionary) this.morphs.push(o);
    });
    root.traverse((o) => {
      if (!o.isSkinnedMesh || !/^(Body|Jacket|JacketSleeves|Trousers|HairCap)$/.test(o.name)) return;
      const ol = new THREE.SkinnedMesh(o.geometry, outlineMat); ol.bind(o.skeleton, o.bindMatrix);
      if (o.morphTargetInfluences) { ol.morphTargetInfluences = o.morphTargetInfluences; ol.morphTargetDictionary = o.morphTargetDictionary; }
      ol.frustumCulled = false; ol.raycast = () => {}; ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale); o.parent.add(ol);
    });
    this.ex = {}; for (const m of this.morphs) for (const k of Object.keys(m.morphTargetDictionary)) this.ex[k] = 0;
    this.want = null; this.one = null;
    this.g = new THREE.Group(); this.inner = new THREE.Group(); this.g.add(this.inner); this.inner.add(root); this.g.scale.setScalar(scale);
    this.scale = scale; scene.add(this.g);
    /* the pose the game asks for; update() eases towards it */
    this.P = { walk: 0, phase: 0, sit: 0, floor: 0, lie: 0, kneel: 0, lean: 0, look: null, lookK: 0, hold: 0, wave: 0, armR: null, armL: null, cough: 0, headTilt: 0 };
    this.S = { walk: 0, sit: 0, floor: 0, lie: 0, kneel: 0, lean: 0, hold: 0, yaw: 0, pitch: 0 };
    this.blinkT = 2; this.blink = 0; this.t = Math.random() * 10;
    this.anchors = {};
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4();
    const anchor = (bone, x, y, z) => { const b = bones[bone]; const a = new THREE.Object3D(); inv.copy(b.matrixWorld).invert(); a.position.set(x, y, z).applyMatrix4(inv);
      const wq = new THREE.Quaternion(); b.getWorldQuaternion(wq); a.quaternion.copy(wq.invert()); b.add(a); return a; };
    const hp = (n) => { const v = new THREE.Vector3(); bones[n].getWorldPosition(v); return v; };
    const hR = hp('hand_r'), mR = hp('middle_01_r'), hL = hp('hand_l'), mL = hp('middle_01_l');
    this.anchors.handR = anchor('hand_r', (hR.x + mR.x) / 2, (hR.y + mR.y) / 2, (hR.z + mR.z) / 2 + 0.01);
    this.anchors.handL = anchor('hand_l', (hL.x + mL.x) / 2, (hL.y + mL.y) / 2, (hL.z + mL.z) / 2 + 0.01);
    this.anchors.back = anchor('spine_03', 0, hp('spine_03').y + 0.05, -0.15);
  }
  inc(name, x, y, z, order = 'XYZ') {
    const b = this.bones[name], r = this.REST[name]; if (!b || !r) return;
    _q.setFromEuler(_e.set(x, y, z, order)); _q2.copy(r.Rp).invert().multiply(_q).multiply(r.Rp); b.quaternion.copy(_q2).multiply(r.L);
  }
  expr(name, w = 1, secs = 3) { this.one = { name, w, until: G.uTime.value + secs }; }
  mood(name, w = 1) { this.want = name ? { name, w } : null; }
  place(x, y, z, face) { this.g.position.set(x, y, z); if (face !== undefined) this.g.rotation.y = face; }
  update(dt) {
    const P = this.P, S = this.S; this.t += dt; const t = this.t;
    for (const k of ['walk', 'sit', 'floor', 'lie', 'kneel', 'lean', 'hold']) S[k] = damp(S[k], P[k], 6, dt);
    P.phase += dt * (3.4 + 3 * S.walk) * (S.walk > 0.02 ? 1 : 0);
    const w = Math.sin(P.phase) * S.walk, cw = Math.cos(P.phase);
    const breathe = Math.sin(t * 2.0) * 0.012 * (1 - S.walk) + (P.cough > 0 ? Math.sin(t * 30) * 0.04 * P.cough : 0);
    P.cough = Math.max(0, P.cough - dt);
    /* sitting lowers the hips; lying turns the whole body onto its back */
    const sitDrop = S.sit * 0.44 + S.kneel * 0.46 + S.floor * 0.72;
    this.inner.position.y = -sitDrop + Math.abs(w) * 0.03;
    this.inner.rotation.x = -S.lie * Math.PI / 2; this.inner.position.z = S.lie * 0.0; if (S.lie > 0.01) this.inner.position.y = 0.12 * S.lie;
    this.inc('pelvis', 0, w * 0.08, 0);
    const lean = S.lean + S.sit * 0.12 + S.kneel * 0.08;
    this.inc('spine_01', lean * 0.3, 0, 0); this.inc('spine_02', lean * 0.3, -w * 0.05, 0); this.inc('spine_03', lean * 0.35 - breathe, -w * 0.08, 0);
    /* head: looks toward a world point (eased), plus an authored tilt */
    let yaw = 0, pitch = 0;
    if (P.look) {
      this.g.updateMatrixWorld(true);
      const hp = this.bones.head.getWorldPosition(_v); const dx = P.look.x - hp.x, dz = P.look.z - hp.z, dy = P.look.y - hp.y;
      yaw = Math.atan2(dx, dz) - this.g.rotation.y; while (yaw > Math.PI) yaw -= 2 * Math.PI; while (yaw < -Math.PI) yaw += 2 * Math.PI;
      yaw = clamp(yaw, -1.0, 1.0) * (P.lookK ?? 1); pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.5) * (P.lookK ?? 1);
    }
    S.yaw = damp(S.yaw, yaw, 4, dt); S.pitch = damp(S.pitch, pitch, 4, dt);
    this.inc('neck_01', S.pitch * 0.4 - lean * 0.2, S.yaw * 0.4, P.headTilt * 0.4);
    this.inc('head', S.pitch * 0.6 - lean * 0.15, S.yaw * 0.6, P.headTilt * 0.6 + Math.sin(t * 0.7) * 0.02, 'YXZ');
    /* legs */
    for (const [s, sw, ph] of [['l', -cw, 1], ['r', cw, -1]]) {
      let thigh = ph * w * 0.6, knee = 0.05 + S.walk * (0.08 + 0.9 * Math.max(0, sw));
      thigh = lerp(thigh, -1.45, S.sit); knee = lerp(knee, 1.5, S.sit);
      thigh = lerp(thigh, -0.1, S.kneel); knee = lerp(knee, 2.5, S.kneel);
      thigh = lerp(thigh, -1.5 + (s === 'l' ? 0.05 : -0.05), S.floor); knee = lerp(knee, 0.25, S.floor);
      this.inc('thigh_' + s, thigh - knee * 0.2, 0, 0); this.inc('calf_' + s, knee, 0, 0); this.inc('foot_' + s, -knee * 0.4 * (1 - S.kneel) + S.kneel * 0.9, 0, 0);
    }
    /* arms: swing, hold something in front (a basket, an oar), wave, or a pose set by the scene */
    for (const [s, ph] of [['r', 1], ['l', -1]]) {
      const set = s === 'r' ? P.armR : P.armL;
      let x = -ph * w * 0.6, z = (s === 'r' ? -1 : 1) * 0.06, elbow = 0.18 + S.walk * 0.25;
      x = lerp(x, -0.55, S.hold); elbow = lerp(elbow, 1.25, S.hold); z = lerp(z, (s === 'r' ? 1 : -1) * 0.25, S.hold);
      if ((S.sit > 0.5 || S.floor > 0.5) && !set) { const f_ = Math.max(S.sit, S.floor); x = lerp(x, -0.5, f_); elbow = lerp(elbow, 1.1, f_); }
      if (set) { x = set[0]; z = set[1] * (s === 'r' ? -1 : 1); elbow = set[2]; }
      if (P.wave > 0 && s === 'r') { x = -0.3; z = -2.3 + Math.sin(t * 12) * 0.3; elbow = 0.4; }
      this.inc('upperarm_' + s, x, 0, z); this.inc('lowerarm_' + s, -elbow, 0, 0);
    }
    P.wave = Math.max(0, P.wave - dt);
    /* expressions and blinks */
    const one = this.one && G.uTime.value < this.one.until ? this.one : (this.one = null, this.want);
    for (const n in this.ex) { if (n.startsWith('blink')) continue; const tg = one && one.name === n ? one.w : 0; this.ex[n] = damp(this.ex[n], tg, tg > this.ex[n] ? 6 : 3, dt); }
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 2 + Math.random() * 3.5; }
    this.blink = Math.max(0, this.blink - dt); this.ex.blink = this.blink > 0 ? 1 : (P.eyesClosed ? 1 : 0);
    for (const m of this.morphs) { const d = m.morphTargetDictionary, inf = m.morphTargetInfluences; for (const n in d) inf[d[n]] = this.ex[n] || 0; }
  }
}
const CACHE = {};
export function loadCast(name, scale = 1) {
  if (!CACHE[name]) CACHE[name] = loadBuf(name).then((buf) => new Promise((res, rej) => new GLTFLoader().parse(buf, '', (g) => res(new Cast(name, g, scale)), rej)));
  return CACHE[name];
}
MZ.loadCast = loadCast;
