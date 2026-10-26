/* ================================================================
   Mizumend · Aoi in the game (v13).
   Her model is the r18 MPFB2 build (assets/aoi.glb, made by heroine_v2_mpfb.py with MZ_BAKE_RES=1024 MZ_IMG=WEBP).
   - Toon-shaded from her baked maps, with a constant-width outline like the rest of the valley.
   - Driven by the game's existing pose: the old figure stays as an invisible proxy rig (its arms, legs, head and body
     rotations), and every frame those are mapped onto her bones, mirrored so she holds things in her right hand,
     with knees, elbows and a little torso counter-twist added for a real gait.
   - Hair cards sway in the wind from the roots and stream behind her when she runs.
   - Authored expressions (sad, worried, happy, determined, hopeful, tender...) for story beats: MZ.hero.expr(name, weight, secs).
   #chibi brings back the old figure.
   ================================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MZ } from './game.js';
const {HOOKS,player,S,PARAMS,makeToon,clamp,damp,G,renderer} = MZ;

const URL_GLB = 'assets/aoi.glb';
const URL_B64 = 'assets/aoi.b64.txt';   /* the same file as base64 text, for hosts that don't serve .glb (the claude.ai artifact) */
async function loadModel() {
  try { const r = await fetch(URL_GLB); if (r.ok) { const b = await r.arrayBuffer(); if (b.byteLength > 1000 && new DataView(b).getUint32(0, true) === 0x46546C67) return b; } } catch (e) {}
  const r = await fetch(URL_B64); if (!r.ok) throw new Error('no model (' + r.status + ')');
  const txt = (await r.text()).replace(/\s+/g, ''), bin = atob(txt), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
const SCALE = 0.94;            /* 1.58 m: she stands a little taller than the villagers without towering over the props */
const OFF = PARAMS.chibi === '1' || PARAMS.hero === '0';
const HERO = { ready: false, failed: false, off: OFF, root: null, wrap: null, bones: {}, morphs: [], anchors: {}, ex: {}, one: null, mood: null };
MZ.hero = HERO;
if (PARAMS.debug === '1' || PARAMS.debug === 'true') { window.__mzhero = HERO; HERO.MZ = MZ; }

/* ---------- materials ---------- */
const uRes = { value: new THREE.Vector2(1280, 720) };
/* a soft cel ramp: the valley's hard three-step ramp posterizes a detailed face into patches, so she gets a smooth one */
const softRamp = (() => { const t = new THREE.DataTexture(new Uint8Array([92, 150, 215, 255]), 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; })();
const outlineMat = (() => {
  const m = new THREE.MeshBasicMaterial({ color: 0x17110d, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRes = uRes;
    sh.vertexShader = 'uniform vec2 uRes;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      { vec3 nv = normalMatrix * objectNormal; vec4 cn = projectionMatrix * vec4(nv, 0.0);
        vec2 d = cn.xy; float L = length(d); if (L > 1e-5) gl_Position.xy += d / L * 1.35 * gl_Position.w * 2.0 / uRes; }`);
  };
  m.customProgramCacheKey = () => 'heroOutline';
  return m;
})();
const uHair = { uHT: { value: 0 }, uHW: { value: 1 }, uHMove: { value: new THREE.Vector3() }, uHWind: { value: new THREE.Vector3(0, 0, 1) } };
function hairify(m, band) {
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    Object.assign(sh.uniforms, uHair);
    sh.vertexShader = 'uniform float uHT,uHW;\nuniform vec3 uHMove,uHWind;\nvarying float vHairV;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vHairV = uv.y;
      { float hk = pow(clamp(1.0 - uv.y, 0.0, 1.0), 1.6);          /* glTF flips v: uv.y is 1 at the root */
        float gust = 0.6 + 0.4 * sin(uHT * 0.37);
        float wa = uHW * gust * hk;
        transformed.xz += uHWind.xz * wa * 0.045 * (0.55 + 0.45 * sin(uHT * 0.9 + position.y * 1.6));
        transformed.x += wa * 0.022 * sin(uHT * 1.3 + position.y * 2.0);
        transformed.xz += hk * hk * 0.006 * vec2(sin(uHT * 5.0 + position.x * 40.0 + position.y * 30.0), cos(uHT * 4.3 + position.z * 37.0));
        transformed += hk * uHMove; }`);
    /* a soft blue sheen band across the crown, like painted hair */
    sh.fragmentShader = 'varying float vHairV;\n' + sh.fragmentShader;
    if (band) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{ float band = smoothstep(0.80, 0.86, vHairV) * (1.0 - smoothstep(0.90, 0.96, vHairV));
        vec3 vdn = normalize(vViewPosition); float face = clamp(dot(normal, vdn), 0.0, 1.0);
        outgoingLight += vec3(0.03, 0.04, 0.07) * band * face * face * face; }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => baseKey + '|heroHair' + (band ? 'B' : '');
  return m;
}
function toonFor(src, mesh) {
  const n = src.name || 'x', map = src.map || null;
  if (map) { map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); }
  const o = { noHeal: true, rim: 0.32, map, mapKey: 'hero_' + n, tag: 'hero_' + n, side: THREE.FrontSide };
  let col = map ? new THREE.Color(1, 1, 1) : (src.color ? src.color.clone() : new THREE.Color(0.5, 0.5, 0.5));
  let m;
  switch (n) {
    case 'SkinBaked': col = new THREE.Color(1.62, 1.50, 1.40); o.rim = 0.26; break;      /* the PBR albedo is darker than a painted skin tone needs to be */
    case 'EyeBaked': col = new THREE.Color(1.15, 1.15, 1.15); o.rim = 0; break;
    case 'LaceBaked': col = new THREE.Color(3.0, 2.9, 3.3); o.rim = 0.55; break;        /* black lace, lifted to a soft charcoal so her shape reads */
    case 'LaceTrimBaked': col = new THREE.Color(3.0, 2.9, 3.3); o.rim = 0.5; o.alphaTest = 0.45; o.side = THREE.DoubleSide; break;
    case 'LaceSheerBaked': col = new THREE.Color(2.6, 2.5, 2.9); o.rim = 0.4; o.side = THREE.DoubleSide; break;
    case 'HairCardsBaked': col = new THREE.Color(2.3, 2.45, 3.3); o.rim = 0.6; o.alphaTest = 0.42; o.side = THREE.DoubleSide; break;
    case 'HairUnderBaked': col = new THREE.Color(0.012, 0.012, 0.02); o.rim = 0.4; o.side = THREE.DoubleSide; break;
    case 'HairCapBaked': col = new THREE.Color(0.014, 0.013, 0.02); o.rim = 0.2; break;
    case 'Brow': col = new THREE.Color(0.03, 0.022, 0.017); o.rim = 0; o.alphaTest = 0.3; break;
    case 'Lashes': col = new THREE.Color(0.012, 0.01, 0.01); o.rim = 0; o.alphaTest = 0.3; o.side = THREE.DoubleSide; break;
    case 'Flats': col = new THREE.Color(0.03, 0.03, 0.034); o.rim = 0.5; break;
    case 'Sash': col = new THREE.Color(0.04, 0.04, 0.046); o.rim = 0.5; break;
    case 'Gold': col = new THREE.Color(1.0, 0.72, 0.32); o.rim = 0.7; break;
    case 'Pearl': col = new THREE.Color(1.05, 1.0, 0.94); o.rim = 0.8; break;
  }
  m = makeToon(col, o);
  m.gradientMap = softRamp;
  if (n === 'LaceSheerBaked') { m.transparent = true; m.depthWrite = false; m.opacity = 1; }
  if (n === 'HairCardsBaked') hairify(m, true);
  if (n === 'HairUnderBaked') hairify(m, false);     /* the under-layer sways with the cards, so the sheet moves as one mass */
  return m;
}

/* ---------- pose helpers ---------- */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const REST = {};        /* per bone: L = relaxed local quaternion, Rp = parent's relaxed model-space quaternion */
function inc(name, x, y, z, order = 'XYZ') {   /* rotate a bone by (x,y,z) about the model's rest axes, relative to its parent */
  const b = HERO.bones[name], r = REST[name]; if (!b || !r) return;
  _q.setFromEuler(_e.set(x, y, z, order));
  _q2.copy(r.Rp).invert().multiply(_q).multiply(r.Rp);   /* conjugate into the parent's frame */
  b.quaternion.copy(_q2).multiply(r.L);
}
function restBone(name) { const b = HERO.bones[name], r = REST[name]; if (b && r) b.quaternion.copy(r.L); }

function setup(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const bones = HERO.bones;
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  /* relaxed pose: arms down by the sides (the file is in the MakeHuman A-pose), as in the viewer */
  const aim = (name, child, dir) => {
    const bn = bones[name], ch = bones[child]; if (!bn || !ch) return;
    const a = new THREE.Vector3(), c = new THREE.Vector3(); bn.getWorldPosition(a); ch.getWorldPosition(c);
    const q = new THREE.Quaternion().setFromUnitVectors(c.sub(a).normalize(), dir.clone().normalize());
    const wq = new THREE.Quaternion(); bn.getWorldQuaternion(wq); const pq = new THREE.Quaternion(); bn.parent.getWorldQuaternion(pq);
    bn.quaternion.copy(pq.invert().multiply(q.multiply(wq))); root.updateMatrixWorld(true);
  };
  for (const [s, n] of [[1, 'l'], [-1, 'r']]) { aim('upperarm_' + n, 'lowerarm_' + n, new THREE.Vector3(s * 0.17, -1, -0.04)); aim('lowerarm_' + n, 'hand_' + n, new THREE.Vector3(s * 0.08, -1, 0.12)); }
  for (const [name, b] of Object.entries(bones)) {
    const pq = new THREE.Quaternion(); if (b.parent) b.parent.getWorldQuaternion(pq);
    REST[name] = { L: b.quaternion.clone(), Rp: pq };
  }
  /* materials, outlines, shadows; merge the small rigid jewellery per bone and material */
  const morphs = [], rigid = new Map(), drop = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const src = o.material;
    o.material = toonFor(src, o);
    if (o.morphTargetDictionary) morphs.push(o);
    const big = /^(Body|Dress|Hair|Sleeves)/.test(o.name) || o.parent?.name === 'Hair';
    o.castShadow = big; o.receiveShadow = false;
    if (!o.isSkinnedMesh && o.parent && o.parent.isBone && !src.map) {
      const key = o.parent.name + '|' + src.name;
      if (!rigid.has(key)) rigid.set(key, { bone: o.parent, mat: o.material, geos: [] });
      const g = o.geometry.clone(); g.applyMatrix4(o.matrix);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      rigid.get(key).geos.push(g); drop.push(o);
    }
  });
  for (const o of drop) o.parent.remove(o);
  for (const { bone, mat, geos } of rigid.values()) {
    const g = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (!g) continue;
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; bone.add(m);
  }
  /* constant-width outline on her silhouette pieces (skinned, so it bends with her) */
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !/^(Body|Dress|Sleeves)$/.test(o.name)) return;
    const ol = new THREE.SkinnedMesh(o.geometry, outlineMat);
    ol.bind(o.skeleton, o.bindMatrix);
    if (o.morphTargetInfluences) { ol.morphTargetInfluences = o.morphTargetInfluences; ol.morphTargetDictionary = o.morphTargetDictionary; }
    ol.frustumCulled = false; ol.castShadow = false; ol.raycast = () => {};
    ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
    o.parent.add(ol);
  });
  HERO.morphs = morphs;
  HERO.eyes = [];
  for (const n of ['Eye.l', 'Eye.r']) { const e = root.getObjectByName(n); if (!e) continue; const pq = new THREE.Quaternion(); e.parent.getWorldQuaternion(pq); HERO.eyes.push({ o: e, L: e.quaternion.clone(), Rp: pq }); }
  const names = new Set(); for (const m of morphs) for (const k of Object.keys(m.morphTargetDictionary)) names.add(k);
  HERO.names = [...names];
  for (const n of HERO.names) HERO.ex[n] = 0;
  try { HERO.pose = JSON.parse(root.getObjectByName('Rig')?.userData?.expression_pose || '{}'); } catch (e) { HERO.pose = {}; }

  /* anchors: points on her bones whose orientation matches the character's own frame at rest, for props */
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4();
  const anchor = (bone, x, y, z) => {
    const b = bones[bone]; const a = new THREE.Object3D();
    inv.copy(b.matrixWorld).invert();
    a.position.set(x, y, z).applyMatrix4(inv);
    const wq = new THREE.Quaternion(); b.getWorldQuaternion(wq); a.quaternion.copy(wq.invert());
    b.add(a); return a;
  };
  const hp = (n) => { const v = new THREE.Vector3(); bones[n].getWorldPosition(v); return v; };
  const handR = hp('hand_r'), midR = hp('middle_01_r'), handL = hp('hand_l'), midL = hp('middle_01_l');
  HERO.anchors.handR = anchor('hand_r', (handR.x + midR.x) / 2, (handR.y + midR.y) / 2, (handR.z + midR.z) / 2 + 0.01);
  HERO.anchors.handL = anchor('hand_l', (handL.x + midL.x) / 2, (handL.y + midL.y) / 2, (handL.z + midL.z) / 2 + 0.01);
  HERO.anchors.head = anchor('head', 0, 1.655, -0.005);
  HERO.anchors.back = anchor('spine_03', 0, 1.16, -0.14);
  HERO.anchors.hip = anchor('pelvis', 0.2, 0.86, 0.03);
  HERO.anchors.chest = anchor('spine_03', 0, 1.25, 0.13);

  /* her place in the world: a wrapper under the player root (which the game moves and turns) */
  const wrap = new THREE.Group(), inner = new THREE.Group();
  wrap.add(inner); inner.add(root);
  wrap.scale.setScalar(SCALE);
  player.root.add(wrap);
  HERO.root = root; HERO.wrap = wrap; HERO.inner = inner;

  /* move the props from the old figure onto her, then hide the old figure */
  const reparent = (obj, anc, pos, rot) => { if (!obj || !anc) return; anc.add(obj); obj.position.copy(pos); if (rot) obj.rotation.copy(rot); };
  reparent(player.rod, HERO.anchors.handR, new THREE.Vector3(0, 0, 0.0));
  for (const h of [player.hat, player.fhat]) reparent(h, HERO.anchors.head, new THREE.Vector3(0, 0, 0), new THREE.Euler(-0.22, 0, 0));
  player.hat.scale.setScalar(0.42); player.fhat.scale.setScalar(0.42);
  const gear = MZ.combat?.gear;
  if (gear) {
    reparent(gear.hand, HERO.anchors.handR, new THREE.Vector3(0, 0.02, 0.0));
    reparent(gear.back, HERO.anchors.back, new THREE.Vector3(0, 0, -0.02), new THREE.Euler(0, 0, -0.75));
    reparent(gear.lan, HERO.anchors.hip, new THREE.Vector3(0.02, 0, 0));
  }
  const keep = new Set();
  for (const o of [player.rod, player.hat, player.fhat, gear?.hand, gear?.back, gear?.lan, wrap]) if (o) o.traverse((c) => keep.add(c));
  player.root.traverse((o) => { if (o.isMesh && !keep.has(o)) o.visible = false; });
  HERO.ready = true;
}

/* ---------- per-frame: map the proxy rig's pose onto her bones ---------- */
const lastPos = new THREE.Vector3(); let lastFace = 0, turnV = 0, hasLast = false;
const move = new THREE.Vector3(), moveS = new THREE.Vector3();
function heroPose(dt) {
  if (!HERO.ready) return;
  const p = player, t = G.uTime.value, k = p.speedK || 0;
  const body = p.body, [aR0, aL0] = [p.arms[1], p.arms[0]], [lL0, lR0] = [p.legs[0], p.legs[1]];
  /* the old figure's arms[1] (+x) held the staff and the rod: mirrored, that's her right hand */
  HERO.wrap.visible = !HERO.hidden;            /* a scene can hide her (a memory she isn't in) */
  player.hat.visible = false;
  player.fhat.visible = S.wearing === 'founder' && !!S.cosmetics?.founderHat;
  /* body: bob, squash and the dodge roll go on the wrapper (the roll pivots at her hips); lean goes into her spine */
  const rolling = (p.roll || 0) > 0;
  HERO.wrap.position.y = body.position.y * SCALE;
  HERO.wrap.scale.set(body.scale.x * SCALE, body.scale.y * SCALE, body.scale.z * SCALE);
  if (rolling) { HERO.inner.position.y = -0.8; HERO.wrap.position.y += 0.8 * SCALE; HERO.wrap.rotation.set(body.rotation.x, 0, -body.rotation.z); }
  else { HERO.inner.position.y = 0; HERO.wrap.rotation.set(0, 0, 0); }
  const lean = rolling ? 0 : body.rotation.x, sway = rolling ? 0 : -body.rotation.z;
  const walk = Math.sin(p.phase || 0), cw = Math.cos(p.phase || 0), grounded = p.grounded !== false;
  const twist = grounded ? walk * k : 0;
  inc('pelvis', 0, twist * 0.10, sway * 0.4);
  inc('spine_01', lean * 0.28, 0, sway * 0.2);
  inc('spine_02', lean * 0.30, -twist * 0.06, sway * 0.2);
  const breathe = Math.sin(t * 2.2) * 0.012 * (1 - k);
  /* head: the proxy's look, nod and tilt, shared between neck and head; tender adds its authored tilt */
  /* her long hair is skinned to both head and shoulders, so a big head turn shears it: she turns her head less than
     the old figure did, lets her shoulders follow a little, and looks the rest of the way with her eyes */
  const hx = p.head.rotation.x, hyAll = -p.head.rotation.y, hz = -p.head.rotation.z;
  const hy = clamp(hyAll, -0.32, 0.32), gaze = clamp(hyAll - hy, -0.3, 0.3);
  const roll = (HERO.pose.tender?.head_roll_deg || 0) * Math.PI / 180 * (HERO.ex.tender || 0);
  inc('spine_03', lean * 0.36 - breathe, -twist * 0.10 + hy * 0.18, sway * 0.2);
  inc('neck_01', hx * 0.35 - lean * 0.25, hy * 0.3, hz * 0.35);
  inc('head', hx * 0.65 - lean * 0.2, hy * 0.52, hz * 0.65 + roll, 'YXZ');
  for (const e of HERO.eyes) { _q.setFromAxisAngle(_v.set(0, 1, 0), gaze * 0.9); _q2.copy(e.Rp).invert().multiply(_q).multiply(e.Rp); e.o.quaternion.copy(_q2).multiply(e.L); }
  /* legs, with knees: a leg bends at the knee while it swings forward */
  const legs = [[lL0, 'l', -cw], [lR0, 'r', cw]];
  for (const [L, s, sw] of legs) {
    const x = L.rotation.x;
    let knee;
    if (!grounded) knee = s === 'l' ? 0.75 : 0.45;
    else if (p.busy > 0) knee = 0.35;
    else knee = 0.05 + k * (0.08 + 0.95 * Math.max(0, sw));
    inc('thigh_' + s, x - knee * 0.25, 0, 0);
    inc('calf_' + s, knee, 0, 0);
    inc('foot_' + s, -knee * 0.45 + Math.max(0, -x) * 0.25, 0, 0);
  }
  /* arms, mirrored, with elbows */
  for (const [A, s] of [[aR0, 'r'], [aL0, 'l']]) {
    const x = A.rotation.x, y = -A.rotation.y, z = -A.rotation.z;
    const up = Math.abs(z) > 1.4 || x < -2.0;
    const elbow = up ? 0.12 : 0.16 + Math.max(0, -x) * 0.42 + k * 0.25;
    inc('upperarm_' + s, x, y, z);
    inc('lowerarm_' + s, -elbow, 0, 0);
    restBone('hand_' + s);
  }
  expressions(dt);
  hair(dt);
}
/* ---------- expressions ---------- */
function moodNow() {
  const p = player, CB = MZ.combat?.CB, sim = MZ.simTime;
  if (HERO.one && sim < HERO.one.until) return HERO.one;
  HERO.one = null;
  if (HERO.mood) return HERO.mood;
  if (MZ.talk?.on) return MZ.talk.who === 'mira' ? { name: 'tender', w: 0.75 } : MZ.talk.who === 'sachi' ? { name: 'tender', w: 0.5 } : { name: 'hopeful', w: 0.45 };
  if (p.happy > 0) return { name: 'happy', w: 0.9 };
  if (CB) {
    if (sim - CB.hurtT < 1.4) return { name: 'worried', w: 0.85 };
    if (CB.breaths <= 1 && sim - CB.engagedT < 4) return { name: 'worried', w: 0.6 };
    if (sim - CB.engagedT < 4 || (HOOKS.bossActive && HOOKS.bossActive())) return { name: 'determined', w: 0.7 };
  }
  return null;
}
function expressions(dt) {
  const want = moodNow();
  for (const n of HERO.names) {
    if (n === 'blink' || n === 'blink_L' || n === 'blink_R') continue;
    const tg = want && want.name === n ? want.w : 0;
    HERO.ex[n] = damp(HERO.ex[n], tg, tg > HERO.ex[n] ? 7 : 4, dt);
  }
  HERO.ex.blink = player.blink > 0 ? 1 : damp(HERO.ex.blink || 0, 0, 30, dt);
  for (const m of HERO.morphs) {
    const d = m.morphTargetDictionary, inf = m.morphTargetInfluences;
    for (const n in d) inf[d[n]] = HERO.ex[n] || 0;
  }
}
/* a one-off expression for a story beat (it fades back after secs); mood(name, w) holds one until mood(null) */
HERO.expr = (name, w = 1, secs = 3) => { HERO.one = { name, w, until: MZ.simTime + secs }; };
HERO.setMood = (name, w = 1) => { HERO.mood = name ? { name, w } : null; };

/* ---------- hair: wind from the world, and drag when she moves or turns ---------- */
function hair(dt) {
  const p = player;
  uHair.uHT.value = G.uTime.value;
  uHair.uHW.value = 0.55 + (G.uWind?.value || 1) * 0.5;
  /* world wind direction into her own frame */
  const f = p.root.rotation.y, c = Math.cos(-f), s = Math.sin(-f);
  uHair.uHWind.value.set(0.84 * c + 0.54 * s, 0, -0.84 * s + 0.54 * c);
  if (hasLast && dt > 0) {
    const vx = (p.pos.x - lastPos.x) / dt, vz = (p.pos.z - lastPos.z) / dt, vy = (p.pos.y - lastPos.y) / dt;
    const lx = vx * c + vz * s, lz = -vx * s + vz * c;
    let dTurn = f - lastFace; while (dTurn > Math.PI) dTurn -= 2 * Math.PI; while (dTurn < -Math.PI) dTurn += 2 * Math.PI;
    turnV = damp(turnV, clamp(dTurn / dt, -8, 8), 6, dt);
    move.set(clamp(-lx * 0.012 + turnV * 0.012, -0.09, 0.09), clamp(-vy * 0.01, -0.05, 0.05), clamp(-lz * 0.014, -0.11, 0.06));
    if (!p.grounded) move.y += 0.02;
  }
  moveS.x = damp(moveS.x, move.x, 5, dt); moveS.y = damp(moveS.y, move.y, 5, dt); moveS.z = damp(moveS.z, move.z, 5, dt);
  uHair.uHMove.value.copy(moveS);
  lastPos.copy(p.pos); lastFace = f; hasLast = true;
}

/* test hook: a fixed close-up camera relative to her (forward, up, side in her frame), used by the headless review */
HOOKS.vis.push(() => {
  const dc = HERO.debugCam; if (!dc || !HERO.ready) return;
  const f = player.root.rotation.y, c = Math.cos(f), s = Math.sin(f), P = player.pos;
  const at = (fw, up, sd) => new THREE.Vector3(P.x + s * fw + c * sd, P.y + up, P.z + c * fw - s * sd);
  MZ.camera.position.copy(at(dc.fw, dc.up, dc.side || 0)); MZ.camera.lookAt(at(dc.lfw || 0, dc.lup, 0));
});
HOOKS.pose.push((dt) => { if (HERO.ready) { renderer.getDrawingBufferSize(uRes.value); heroPose(dt); } });

if (!OFF) {
  HOOKS.bootWait.push(new Promise((res) => {
    const done = (ok) => { clearTimeout(timer); res(ok); };
    const timer = setTimeout(() => { HERO.failed = true; console.warn('Aoi took too long to load; using the old figure'); res(false); }, 45000);
    const fail = (e) => { console.warn('Aoi could not load (' + (e?.message || e) + '); using the old figure'); HERO.failed = true; done(false); };
    loadModel().then((buf) => new GLTFLoader().parse(buf, '', (g) => { try { setup(g); done(true); } catch (e) { console.error(e); HERO.failed = true; done(false); } }, fail)).catch(fail);
  }));
}
