/* ================================================================
   Mizumend · Chapter 2, the Gorge (v13.4).
   Above the narrows the river runs fast between walls of rock. When the marsh breathes again, Toma comes up and the
   two of them find the key log in the flood timber. Past it, the gorge: the flood-watch tower (the flood-watch
   rifle), the old ferry crossing (the ferryman's bolt-action), the quarry ledge (blasting-cap traps), and at the top,
   in the spray of a waterfall, the hunting lodge where Isamu's rifle hangs above a crooked toy boat.
   Taking it down wakes the silt serpent, and the river carries her back down with it behind.
     The chase: downstream, with checkpoints at the three lanterns. Pull on the beat to stay ahead; when it rears and
       the water darkens ahead, steer out of the line. Washed up, you start again at the last lantern you passed.
     The finale: at the narrows it jams. Three knots of silt on its head: break them and the river spirit underneath
       goes home up the gorge, clean.
   Debug: window.__mzc.serpentStart(), window.__mzu.tp('gorge'|'tower'|'ferry'|'quarry'|'deep'|'lodge'),
     window.__mzu.jamNow() (Toma and the logjam), window.__mzg (the serpent's state).
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
import { loadCast } from './cast.js';
const { HOOKS, scene, camera, player, cam, S, PARAMS, makeToon, addOutline, clamp, lerp, damp, rr, rnd, G, $, SFX, INTERACTS, toast, showCardBrief } = MZ;
const U = MZ.up, B = () => MZ.boat, TAU = Math.PI * 2;
const up = () => { const u = U.save(); u.gorge = u.gorge || {}; return u; };
const UZ = U.UZ, S0 = U.S0;
const W = (u, w, y = 0) => new THREE.Vector3(u, y, UZ + w);
const _ip = new THREE.Vector3();
const DIFF = () => MZ.combat?.D?.() || { speed: 1, hp: 1, label: 'Standard' };

/* ================================================================
   Building the gorge (with the rest of the marsh, on the first visit)
   ================================================================ */
const MT = {};
const GZ = { rocks: [], lanterns: [], lodge: null, fall: null };
U.onBuild.push((stat) => {
  const tn = U.tn, srr = U.srr;
  Object.assign(MT, { stone: tn(0x8a8478), stoneDk: tn(0x5e5a54), wood: tn(0x6a5038), woodDk: tn(0x45352a), plank: tn(0x8a6a48), roof: tn(0x4e4640), rope: tn(0xa88a5a), iron: tn(0x3a3a3e), log: tn(0x6e5236), moss: tn(0x5a7a3a), paper: U.MT.paper,
    sand: tn(0xa89a7a) });
  const box = (g, w, h, d, m, x, y, z, ry = 0, ol = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); if (ol) addOutline(o, ol); return o; };
  const cyl = (g, r0, r1, h, m, x, y, z, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  /* boulders in the stream: the rapids are a slalom */
  for (let i = 0; i < 16; i++) {
    const s = S0 + 470 + i * 24 + srr(-6, 6), hw = U.hwAt(s), lat = srr(-hw + 1.2, hw - 1.2), p = U.P(s, lat), r = srr(0.7, 1.4);
    if (U.BARS.some((b) => Math.hypot(p.u - b.u, p.w - b.w) < b.r + 3)) continue;
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), MT.stoneDk); rk.position.set(p.u, srr(-0.2, 0.25), UZ + p.w); rk.rotation.set(srr(0, 3), srr(0, 3), 0); rk.scale.set(1, 0.7, 1.2); rk.castShadow = true; stat.add(rk);
    GZ.rocks.push({ x: p.u, z: UZ + p.w, r: r * 1.05 });
  }
  B()?.blockers.push((x, z) => { if (z < 2000) return false; for (const r of GZ.rocks) if (Math.hypot(x - r.x, z - r.z) < r.r) return true; return false; });
  /* the checkpoint lanterns, one on each bar: lit once she's passed them on the way down */
  for (const b of U.BARS) {
    const L = U.lantern(stat, b.u - b.nx * 1.8 + b.tx * 2.2, U.uH(b.u, b.w), UZ + b.w - b.nz * 1.8 + b.tz * 2.2, true);
    GZ.lanterns.push({ id: b.id, x: L.position.x, z: L.position.z });
  }
  /* 1 · the flood-watch tower on its bar */
  { const b = U.BARS[0], g = new THREE.Group(); g.position.set(b.u + b.nx * 1.8, U.uH(b.u, b.w) - 0.2, UZ + b.w + b.nz * 1.8); g.rotation.y = Math.atan2(-b.nx, -b.nz); stat.add(g);
    cyl(g, 1.6, 1.9, 7.5, MT.stone, 0, 3.75, 0, 10); cyl(g, 2.0, 2.0, 0.3, MT.stoneDk, 0, 7.6, 0, 10);
    const top = cyl(g, 1.3, 1.3, 1.6, MT.woodDk, 0, 8.5, 0, 8); const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.4, 8), MT.roof); cone.position.y = 10.0; g.add(cone);
    box(g, 0.9, 1.8, 0.1, MT.wood, 0, 0.9, 1.88, 0, 0.012);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), MT.paper); win.position.set(0, 8.6, 1.32); g.add(win);
    g.updateMatrixWorld(true); const door = g.localToWorld(new THREE.Vector3(0, 0, 2.6));
    GZ.tower = { x: door.x, z: door.z, y: door.y };
    U.COLL.push({ u: g.position.x, w: g.position.z - UZ, hx: 2.0, hz: 2.0 }); }
  /* 2 · the old ferry crossing: a cable from wall to wall, the ferryman's hut and his raft */
  { const b = U.BARS[1], p = U.P(b.s), hw = U.hwAt(b.s) + 6;
    const A = W(p.u + p.nx * hw, p.w + p.nz * hw, 6.5), Bp = W(p.u - p.nx * hw, p.w - p.nz * hw, 6.5);
    for (const q of [A, Bp]) { const post = cyl(stat, 0.12, 0.15, 3, MT.woodDk, q.x, U.uH(q.x, q.z - UZ) + 1.5, q.z, 6); }
    const mid = A.clone().add(Bp).multiplyScalar(0.5); const len = A.distanceTo(Bp);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), MT.iron); cable.position.copy(mid); cable.position.y = 7.5; cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bp.clone().sub(A).normalize()); stat.add(cable);
    /* crows on the cable, as the ferryman said */
    for (let i = 0; i < 4; i++) { const t = 0.3 + i * 0.12; const c = A.clone().lerp(Bp, t); const cr = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), MT.iron); cr.scale.set(0.8, 0.9, 1.4); cr.position.set(c.x, 7.65, c.z); cr.rotation.y = srr(0, 6); stat.add(cr); }
    const g = new THREE.Group(); g.position.set(b.u + b.nx * 1.6, U.uH(b.u, b.w), UZ + b.w + b.nz * 1.6); g.rotation.y = Math.atan2(-b.nx, -b.nz); stat.add(g);
    box(g, 2.6, 2.0, 2.2, MT.wood, 0, 1.0, 0, 0, 0.014); for (const s of [-1, 1]) { const r = box(g, 3.0, 0.1, 1.5, MT.roof, 0, 2.25, s * 0.6); r.rotation.x = s * 0.5; }
    box(g, 0.8, 1.6, 0.06, MT.woodDk, 0.4, 0.8, 1.12);
    const raft = new THREE.Group(); raft.position.set(b.u - b.nx * 1.2 - b.tx * 3, 0.05, UZ + b.w - b.nz * 1.2 - b.tz * 3); raft.rotation.y = Math.atan2(b.tx, b.tz); stat.add(raft);
    for (let i = -2; i <= 2; i++) cyl(raft, 0.18, 0.18, 3.2, MT.log, i * 0.37, 0, 0, 7).rotation.x = Math.PI / 2;
    g.updateMatrixWorld(true); const d = g.localToWorld(new THREE.Vector3(0.4, 0, 1.8)); GZ.ferry = { x: d.x, z: d.z };
    U.COLL.push({ u: g.position.x, w: g.position.z - UZ, hx: 1.6, hz: 1.6 }); }
  /* 3 · the quarry ledge: cut blocks, an A-frame crane, a crate packed in sawdust */
  { const b = U.BARS[2], g = new THREE.Group(); g.position.set(b.u + b.nx * 1.5, U.uH(b.u, b.w), UZ + b.w + b.nz * 1.5); g.rotation.y = Math.atan2(-b.nx, -b.nz); stat.add(g);
    for (const [x, y, z, w, h, d] of [[-1.6, 0.4, 0.4, 1.2, 0.8, 0.9], [-0.3, 0.35, 0.8, 1.0, 0.7, 0.8], [-1.0, 1.05, 0.5, 0.9, 0.6, 0.7], [1.4, 0.45, -0.2, 1.4, 0.9, 1.0]]) box(g, w, h, d, MT.stone, x, y, z, 0.1, 0.012);
    /* the last block they cut, marked for a gate */
    const mk = box(g, 1.6, 0.9, 1.0, MT.stone, 0.4, 0.45, 1.9, -0.2, 0.012); const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), MT.woodDk); mark.position.set(0.4, 0.55, 2.41); mark.rotation.y = -0.2; g.add(mark);
    for (const s of [-1, 1]) { const l = cyl(g, 0.08, 0.1, 4.2, MT.wood, s * 0.9, 2.0, -0.8, 6); l.rotation.z = -s * 0.25; }
    const beam = cyl(g, 0.07, 0.07, 3.4, MT.wood, 0, 3.9, -0.4, 6); beam.rotation.x = Math.PI / 2 - 0.5;
    const crate = box(g, 0.7, 0.5, 0.5, MT.plank, 1.6, 1.15, -0.2, 0.3, 0.01);
    g.updateMatrixWorld(true); const c = g.localToWorld(new THREE.Vector3(1.6, 0.9, 0.6)); GZ.quarry = { x: c.x, z: c.z };
    U.COLL.push({ u: g.position.x, w: g.position.z - UZ, hx: 1.8, hz: 1.4 }); }
  /* 4 · the deep pool: the falls, the beach, the stair up the wall, and the lodge on its ledge */
  { const P0 = U.POOL;
    const fallSheet = (off, wd, sp, seed, op) => {
      const geo = new THREE.PlaneGeometry(wd, 22, 1, 20); const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSp: { value: sp }, uSeed: { value: seed }, uOp: { value: op }, uNight: { value: 0 } }]),
        vertexShader: `varying vec2 vUv;
          #include <fog_pars_vertex>
          void main(){ vUv=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: `varying vec2 vUv; uniform float uTime,uSp,uSeed,uOp,uNight;
          float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float n21(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x),u.y);}
          #include <fog_pars_fragment>
          void main(){ float across=abs(vUv.x-0.5)*2.0; float f=vUv.y*6.0+uTime*uSp;
            float st=n21(vec2(vUv.x*9.0+uSeed,f))*0.65+n21(vec2(vUv.x*25.0+uSeed*3.1,f*2.3))*0.35;
            vec3 col=mix(vec3(0.55,0.72,0.78),vec3(0.97,0.99,1.0),smoothstep(0.35,0.8,st))*mix(1.0,0.3,uNight);
            float a=(0.18+0.65*smoothstep(0.4,0.86,st))*(1.0-smoothstep(0.55,1.0,across))*uOp;
            gl_FragColor=vec4(col,a);
            #include <fog_fragment>
          }` }));
      m.material.uniforms.uTime = G.uTime; m.renderOrder = 4; m.frustumCulled = false;
      m.position.set(P0.fall.u - P0.tx * off, 11, UZ + P0.fall.w - P0.tz * off); m.rotation.y = Math.atan2(P0.tx, P0.tz); U.root.add(m); return m; };
    GZ.fall = [fallSheet(0.2, 5.2, -2.6, 1.3, 0.95), fallSheet(0.6, 4.2, -3.4, 7.7, 0.8), fallSheet(1.0, 3.0, -4.2, 4.1, 0.6)];
    GZ.fallBase = W(P0.fall.u - P0.tx * 1.6, P0.fall.w - P0.tz * 1.6, 0.1);
    /* the stair: planks pinned to the wall from the beach up to the ledge */
    const L = U.LEDGE, bch = P0.beach; const st = new THREE.Group(); stat.add(st);
    const a = W(bch.u, bch.w, U.uH(bch.u, bch.w)), bpt = W(L.u - Math.sin(L.ang) * 0, L.w, L.y);
    const n = 14; for (let i = 0; i < n; i++) { const t = i / (n - 1); const q = a.clone().lerp(new THREE.Vector3(L.u + P0.nx * -4.0, L.y, UZ + L.w + P0.nz * -4.0), t); q.y = lerp(a.y + 0.2, L.y, t);
      box(st, 1.0, 0.08, 0.5, MT.plank, q.x, q.y, q.z, Math.atan2(P0.tx, P0.tz)); if (i % 3 === 0) cyl(st, 0.04, 0.04, 1.0, MT.woodDk, q.x, q.y + 0.5, q.z, 5); }
    GZ.stairFoot = { x: bch.u, z: UZ + bch.w }; GZ.stairTop = { x: L.u - P0.nx * 3.6, z: UZ + L.w - P0.nz * 3.6 };
    /* the lodge: a log cabin with a porch, a lamp in the window, the pegs inside */
    const lg = new THREE.Group(); lg.position.set(L.u + P0.nx * 0.8, L.y, UZ + L.w + P0.nz * 0.8); lg.rotation.y = Math.atan2(-P0.nx, -P0.nz); stat.add(lg);
    for (let r = 0; r < 7; r++) { const y = 0.2 + r * 0.32; for (const [x, z, len, rot] of [[0, -1.8, 4.6, 0], [0, 1.8, 4.6, 0], [-2.2, 0, 3.8, 1], [2.2, 0, 3.8, 1]]) { if (r < 6 && z > 0 && x === 0) { for (const [sx, l2] of [[-1.4, 1.6], [1.3, 1.8]]) { const lgm = cyl(lg, 0.16, 0.16, l2, MT.log, sx, y, z, 7); lgm.rotation.z = Math.PI / 2; } continue; }
      const lgm = cyl(lg, 0.16, 0.16, len, MT.log, x, y, z, 7); if (rot) lgm.rotation.x = Math.PI / 2; else lgm.rotation.z = Math.PI / 2; } }
    for (const s of [-1, 1]) { const r = box(lg, 5.4, 0.14, 2.6, MT.roof, 0, 2.95, s * 1.05); r.rotation.x = s * 0.55; }
    box(lg, 1.0, 2.0, 0.08, MT.woodDk, -0.1, 1.0, 1.85, 0, 0.01);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55), MT.paper); win.position.set(1.4, 1.5, 1.98); lg.add(win);
    const chim = box(lg, 0.5, 1.6, 0.5, MT.stone, 1.6, 3.2, -1.0);
    box(lg, 4.4, 0.1, 1.3, MT.plank, 0, 0.05, 2.5, 0, 0.01);                              /* the porch */
    for (const x of [-2.0, 2.0]) cyl(lg, 0.07, 0.08, 2.4, MT.woodDk, x, 1.2, 3.05, 6);
    lg.updateMatrixWorld(true); const door = lg.localToWorld(new THREE.Vector3(-0.1, 0, 2.6)); GZ.lodge = { x: door.x, z: door.z, g: lg };
    GZ.lodgeLamp = lg.localToWorld(new THREE.Vector3(1.4, 1.5, 2.2));
    U.COLL.push({ u: lg.position.x, w: lg.position.z - UZ, hx: 2.5, hz: 2.5 });
    /* inside, for the memory: a table, the lamp, a stool, the pegs */
    const room = new THREE.Group(); room.position.copy(lg.position); room.rotation.y = lg.rotation.y; room.visible = false; U.root.add(room); GZ.room = room;
    box(room, 1.1, 0.06, 0.7, MT.plank, 0.4, 0.78, -0.6); for (const [x, z] of [[-0.1, -0.85], [0.9, -0.85], [-0.1, -0.35], [0.9, -0.35]]) box(room, 0.06, 0.78, 0.06, MT.woodDk, x, 0.39, z);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8), MT.paper); lamp.position.set(0.75, 0.92, -0.55); room.add(lamp);
    const fl = new THREE.PointLight(0xffb060, 2.2, 7, 2); fl.position.set(0.75, 1.15, -0.5); room.add(fl); GZ.roomLight = fl;
    const toy = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 6), tn(0xd8c49a)); toy.rotation.z = Math.PI / 2 + 0.12; toy.position.set(0.25, 0.84, -0.6); room.add(toy);
    box(room, 0.05, 0.05, 0.3, MT.woodDk, 0.3, 1.9, -1.6); box(room, 0.05, 0.05, 0.3, MT.woodDk, -0.5, 1.9, -1.6);
    room.traverse((o) => o.layers.enable(2));
    /* the beach landing and the climb */
    U.COLL.push({ u: L.u, w: L.w, hx: 0.01, hz: 0.01 }); }
  stat.traverse((o) => o.layers.enable(2));
});

/* ================================================================
   Where things are (tp spots) and the pickups
   ================================================================ */
const atBar = (i, off = -5) => () => { const b = U.BARS[i]; const p = U.P(b.s + off, 0); return { x: p.u, z: UZ + p.w, yaw: Math.atan2(p.tx, p.tz) }; };
U.spots.tower = atBar(0); U.spots.ferry = atBar(1); U.spots.quarry = atBar(2);
U.spots.deep = () => { const P0 = U.POOL; return { x: P0.u - P0.tx * 6, z: UZ + P0.w - P0.tz * 6, yaw: Math.atan2(P0.tx, P0.tz) }; };
U.spots.lodge = () => U.spots.deep();
function pickup(id, where) { const A = MZ.arsenal; if (!A || S.arsenal.have[id]) return; A.give(id, where); }      /* the memories are in js/arsenal.js */
let regd = false;
function reg() {
  if (regd) return; regd = true;
  const spot = (o) => INTERACTS.push(Object.assign({ r: 3.2, pen: 0.1 }, o));
  spot({ x: 0, z: 0, upd() { if (GZ.tower) { this.x = GZ.tower.x; this.z = GZ.tower.z; } }, state() { if (!U.on || !GZ.tower || S.arsenal.have.semi) return null; return { ok: true, text: 'The flood-watch tower · the rifle racked inside the door', hold: 1.0 }; }, done() { pickup('semi', 'the flood-watch tower'); }, pos: () => _ip.set(GZ.tower.x, 1.5, GZ.tower.z) });
  spot({ x: 0, z: 0, upd() { if (GZ.ferry) { this.x = GZ.ferry.x; this.z = GZ.ferry.z; } }, state() { if (!U.on || !GZ.ferry || S.arsenal.have.bolt) return null; return { ok: true, text: 'The ferryman\'s hut · a rifle over the bunk', hold: 1.0 }; }, done() { pickup('bolt', 'the ferryman\'s hut'); }, pos: () => _ip.set(GZ.ferry.x, 1.5, GZ.ferry.z) });
  spot({ x: 0, z: 0, upd() { if (GZ.quarry) { this.x = GZ.quarry.x; this.z = GZ.quarry.z; } }, state() { if (!U.on || !GZ.quarry || S.arsenal.have.trap) return null; return { ok: true, text: 'The quarry crate · blasting caps in sawdust', hold: 1.0 }; }, done() { pickup('trap', 'the quarry ledge'); }, pos: () => _ip.set(GZ.quarry.x, 1.4, GZ.quarry.z) });
  /* the climb, both ways (the stair is too steep to walk in the game; the fade covers it) */
  spot({ x: 0, z: 0, r: 3.0, upd() { if (GZ.stairFoot) { this.x = GZ.stairFoot.x; this.z = GZ.stairFoot.z; } }, state() { if (!U.on || !GZ.stairFoot || B()?.on || SER.phase === 'chase') return null; return { ok: true, text: 'Climb the stair to the lodge', hold: 0.6 }; },
    done() { U.fadeTo(() => { const t = GZ.stairTop; player.pos.set(t.x, MZ.walkH(t.x, t.z), t.z); player.vel.set(0, 0, 0); player.face = player.faceT = Math.atan2(GZ.lodge.x - t.x, GZ.lodge.z - t.z); cam.yaw = player.face + Math.PI; }); }, pos: () => _ip.set(GZ.stairFoot.x, 1.4, GZ.stairFoot.z) });
  spot({ x: 0, z: 0, r: 2.6, upd() { if (GZ.stairTop) { this.x = GZ.stairTop.x; this.z = GZ.stairTop.z; } }, state() { if (!U.on || !GZ.stairTop) return null; return { ok: true, text: 'Down the stair to the pool', hold: 0.5 }; },
    done() { U.fadeTo(() => { const f = GZ.stairFoot; player.pos.set(f.x, MZ.walkH(f.x, f.z), f.z); player.vel.set(0, 0, 0); after_descend(); }); }, pos: () => _ip.set(GZ.stairTop.x, U.LEDGE.y + 1.2, GZ.stairTop.z) });
  /* the lodge */
  spot({ x: 0, z: 0, r: 2.8, upd() { if (GZ.lodge) { this.x = GZ.lodge.x; this.z = GZ.lodge.z; } }, state() { if (!U.on || !GZ.lodge || S.arsenal.have.scoped) return null; return { ok: true, text: 'The hunting lodge · a rifle on pegs above the table', hold: 1.2 }; }, done() { lodgeMemory(); }, pos: () => _ip.set(GZ.lodge.x, U.LEDGE.y + 1.6, GZ.lodge.z) });
}

/* ================================================================
   The lodge memory: Isamu, by lamplight, carving a boat that sits crooked
   ================================================================ */
let isamu = null;
async function isamuLoad() { if (isamu) return isamu; try { isamu = await loadCast('isamu'); isamu.g.traverse((o) => o.layers.enableAll()); isamu.g.visible = false; } catch (e) { console.warn('isamu', e); isamu = null; } return isamu; }
const shot = { on: false, p: new THREE.Vector3(), l: new THREE.Vector3(), k: 0 };
HOOKS.vis.push((dt) => {
  shot.k = damp(shot.k, shot.on ? 1 : 0, 3, dt); if (shot.k < 0.01) return;
  camera.position.lerp(shot.p, shot.k); const cur = new THREE.Vector3(); camera.getWorldDirection(cur); cur.multiplyScalar(4).add(camera.position); camera.lookAt(cur.lerp(shot.l, shot.k));
  if (isamu && isamu.g.visible) isamu.update(dt);
});
async function lodgeMemory() {
  if (S.arsenal.have.scoped) return;
  const lg = GZ.lodge.g; const room = GZ.room;
  const i = await isamuLoad();
  const memEl = $('arMem'), lb = $('letterbox');
  U.fadeTo(() => {
    room.visible = true; if (MZ.hero) MZ.hero.hidden = true;
    lg.updateMatrixWorld(true);
    if (i) { const seat = lg.localToWorld(new THREE.Vector3(0.4, 0, -0.05)); i.g.visible = true; i.place(seat.x, seat.y + 0.02, seat.z, lg.rotation.y + Math.PI); i.P.sit = 1; i.P.hold = 0.8; i.P.lean = 0.35; i.P.look = lg.localToWorld(new THREE.Vector3(0.25, 0.84, -0.6)); i.P.lookK = 0.9; }
    shot.p.copy(lg.localToWorld(new THREE.Vector3(1.5, 1.35, -1.35))); shot.l.copy(lg.localToWorld(new THREE.Vector3(0.35, 1.0, -0.05))); shot.on = true;
    memEl?.classList.add('on'); lb?.classList.add('on');
  });
  await new Promise((r) => setTimeout(r, 1600));
  const L = [{ who: '', text: 'Lamplight. A young man at the table in this room, carving something small out of pale wood.' },
    { who: 'A voice, from the door', text: 'You\'ll go blind doing that by lamplight.' },
    { who: 'The young man', text: 'It\'s a boat. For the baby. It sits a little crooked. I can\'t get it right.', fn: () => i?.expr('happy', 0.5, 6) },
    { who: 'A voice, from the door', text: 'Leave it crooked. Crooked ones float better.' },
    { who: '', text: 'He laughs, and hangs the rifle on its pegs, and doesn\'t take it down again.' }];
  await new Promise((res) => MZ.talkRun(L, res));
  U.fadeTo(() => {
    room.visible = false; if (i) i.g.visible = false; shot.on = false; shot.k = 0; if (MZ.hero) MZ.hero.hidden = false;
    memEl?.classList.remove('on'); lb?.classList.remove('on');
  });
  await new Promise((r) => setTimeout(r, 1400));
  S.arsenal.have.scoped = 1; const A = MZ.arsenal; if (A) { A.mag.scoped = A.stat('scoped').mag; }
  if (!S.keepsakes.includes('A crooked toy boat · the hunting lodge')) S.keepsakes.push('A crooked toy boat · the hunting lodge');
  MZ.writeSave();
  showCardBrief({ k: 'Found · the hunting lodge', t: 'Isamu\'s hunting rifle', s: 'A name burned into the stock: ISAMU. Press 4 to hold it; right-click looks down the scope.' });
  setTimeout(() => MZ.talkRun([{ who: 'Aoi', text: 'Isamu.', fn: () => MZ.hero?.expr?.('worried', 0.6, 6) }, { who: 'Aoi', text: '...Whoever you were, your boat floats.', fn: () => MZ.hero?.expr?.('tender', 0.5, 6) }], () => MZ.piece?.('lodge')), 3200);
  up().gorge.rifle = 1; MZ.writeSave();
}
function after_descend() { if (up().gorge.rifle && !up().serpent && SER.phase === 'sleep') serpentWake(); }

/* ================================================================
   The silt serpent
   ================================================================ */
const N_SEG = 26, SPACING = 0.9;
const SER = { whisk: [], phase: 'sleep', s: 0, lat: 0, y: -3, v: 0, hist: [], segs: [], head: null, knots: [], built: false, lunge: null, lcool: 3, cp: -1, grace: 0, t: 0, hitCool: 0, root: null, eyes: [], spirit: 0 };
if (PARAMS.debug === '1' || PARAMS.debug === 'true') window.__mzg = SER;
const siltVS = `varying vec3 vN; varying vec3 vWp; varying vec2 vUv;
  void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vWp=wp.xyz; vUv=uv; gl_Position=projectionMatrix*viewMatrix*wp; }`;
const siltFS = `varying vec3 vN; varying vec3 vWp; varying vec2 vUv; uniform float uTime,uClean,uNight,uFlash; uniform vec3 uSunDir,uHor;
  float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n21(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x),u.y);}
  void main(){ vec3 n=normalize(vN); vec3 v=normalize(cameraPosition-vWp);
    float lit=0.5+0.5*max(dot(n,normalize(uSunDir)),0.0);
    float fr=pow(1.0-abs(dot(n,v)),2.4);
    /* silt: wet grey-brown mud in slow bands down its length, darker streaks, a paler belly */
    float m=n21(vec2(vUv.x*40.0,vUv.y*6.0))*0.6+n21(vec2(vUv.x*120.0,vUv.y*14.0))*0.4;
    vec3 mud=mix(vec3(0.36,0.34,0.28),vec3(0.52,0.49,0.40),m)*lit;
    float band=smoothstep(0.6,0.95,sin(vUv.x*70.0+n21(vec2(vUv.y*5.0,vUv.x*9.0))*3.0)*0.5+0.5);
    mud=mix(mud,vec3(0.2,0.17,0.13),band*0.45);
    float belly=smoothstep(0.35,0.0,abs(vUv.y-0.75)); mud=mix(mud,vec3(0.62,0.58,0.5)*lit,belly*0.35);
    /* the river underneath shows in the seams and the edges; all of it once it's clean */
    float seam=smoothstep(0.58,0.64,n21(vec2(vUv.x*30.0-uTime*0.2,vUv.y*8.0)));
    vec3 water=mix(vec3(0.55,0.82,0.92),vec3(0.95,1.0,1.0),fr)+uHor*0.25;
    vec3 col=mud+vec3(0.35,0.7,0.8)*seam*0.12+vec3(0.6,0.88,0.98)*fr*0.55;
    col=mix(col,water*1.3,uClean);
    col=mix(col,col*vec3(0.5,0.58,0.75),uNight*0.6)+vec3(1.0,0.85,0.6)*uFlash;
    gl_FragColor=vec4(col,mix(1.0,0.55+fr*0.4,uClean)); }`;
const RING = 12;
const GLOWTEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function radiusAt(i) { const t = i / (N_SEG - 1); return (t < 0.12 ? lerp(0.78, 1.0, t / 0.12) : lerp(1.0, 0.16, ((t - 0.12) / 0.88) ** 0.9)) * 0.8; }
function buildSerpent() {
  if (SER.built) return; SER.built = true;
  const u = { uTime: G.uTime, uClean: { value: 0 }, uNight: { value: 0 }, uFlash: { value: 0 }, uSunDir: MZ.waterU?.uSunDir || { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uHor: MZ.waterU?.uHor || { value: new THREE.Color(0.7, 0.8, 0.9) } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: siltVS, fragmentShader: siltFS, transparent: true });
  SER.u = u; const root = new THREE.Group(); U.root.add(root); SER.root = root;
  const finMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 0.95), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }); SER.finMat = finMat;
  /* the spine: points the body is drawn through */
  for (let i = 0; i < N_SEG; i++) { const o = new THREE.Object3D(); root.add(o); SER.segs.push(o); }
  /* the body: one smooth tube along the spine, rebuilt each frame */
  { const nv = N_SEG * (RING + 1); const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = [];
    for (let i = 0; i < N_SEG; i++) for (let j = 0; j <= RING; j++) { const k = i * (RING + 1) + j; uv[k * 2] = i / (N_SEG - 1); uv[k * 2 + 1] = j / RING; }
    for (let i = 0; i < N_SEG - 1; i++) for (let j = 0; j < RING; j++) { const a = i * (RING + 1) + j, b = a + RING + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    const body = new THREE.Mesh(g, mat); body.frustumCulled = false; body.castShadow = true; root.add(body); SER.body = body; }
  /* a fin of clear water along its back: the river spirit showing through the silt */
  { const n = N_SEG - 5; const pos = new Float32Array(n * 2 * 3), idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setIndex(idx);
    const fin = new THREE.Mesh(g, finMat); fin.frustumCulled = false; root.add(fin); SER.fin = fin; }
  /* the head: broad and low, two dim eyes like lamps under water, whiskers, three knots of silt on its crown */
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat); head.scale.set(0.86, 0.6, 1.2); head.castShadow = true; SER.segs[0].add(head); SER.head = SER.segs[0];
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), mat); snout.scale.set(1.0, 0.6, 1.2); snout.position.set(0, -0.1, 1.15); SER.segs[0].add(snout);
  for (const s of [-1, 1]) { const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOWTEX, color: 0xffd9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); e.position.set(s * 0.62, 0.22, 0.8); e.scale.setScalar(0.45); SER.segs[0].add(e); SER.eyes.push(e); }
  for (const sx of [-1, 1]) { const pts = []; for (let k = 0; k < 9; k++) pts.push(new THREE.Vector3(sx * (0.45 + k * 0.16), -0.25 - k * 0.04, 1.5 - k * 0.42));
    const wh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 5, false), finMat); SER.segs[0].add(wh); SER.whisk.push(wh); }
  const kmat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.35) });
  for (const [x, z] of [[0, 0.3], [-0.42, -0.3], [0.42, -0.3]]) {
    const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), kmat()); k.position.set(x * 0.85, 0.55, z * 0.85); SER.segs[0].add(k);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOWTEX, color: 0xffb060, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.setScalar(0.55); k.add(gl);
    const kn = { m: k, hp: 3, alive: true, flash: 0 }; SER.knots.push(kn);
  }
  root.traverse((o) => o.layers.enable(2)); root.visible = false;
  /* the knots are targets only while it's stuck in the narrows */
  MZ.combat?.CB?.reg.push(() => SER.phase === 'stuck' ? SER.knots.filter((k) => k.alive).map(knotTarget) : []);
}
const _T = new THREE.Vector3(), _N2 = new THREE.Vector3(), _B2 = new THREE.Vector3(), _UPV = new THREE.Vector3(0, 1, 0);
function bodyStep() {
  const P = SER.body.geometry.attributes.position, Nn = SER.body.geometry.attributes.normal;
  for (let i = 0; i < N_SEG; i++) {
    const c = SER.segs[i].position, a = SER.segs[Math.max(0, i - 1)].position, b = SER.segs[Math.min(N_SEG - 1, i + 1)].position;
    _T.copy(a).sub(b); if (_T.lengthSq() < 1e-6) _T.set(0, 0, 1); _T.normalize();
    _B2.crossVectors(_UPV, _T); if (_B2.lengthSq() < 1e-6) _B2.set(1, 0, 0); _B2.normalize(); _N2.crossVectors(_T, _B2).normalize();
    const r = radiusAt(i) * (i === 0 ? 0.9 : 1);
    for (let j = 0; j <= RING; j++) { const ang = j / RING * TAU; const cx = Math.cos(ang), cy = Math.sin(ang);
      const k = i * (RING + 1) + j; const ox = _B2.x * cx * r * 1.12 + _N2.x * cy * r * 0.82, oy = _B2.y * cx * r * 1.12 + _N2.y * cy * r * 0.82, oz = _B2.z * cx * r * 1.12 + _N2.z * cy * r * 0.82;
      P.setXYZ(k, c.x + ox, c.y + oy, c.z + oz); const l = Math.hypot(ox, oy, oz) || 1; Nn.setXYZ(k, ox / l, oy / l, oz / l); }
  }
  P.needsUpdate = true; Nn.needsUpdate = true; SER.body.geometry.computeBoundingSphere();
  /* the fin: along the top of the back, rippling */
  const F = SER.fin.geometry.attributes.position;
  for (let i = 2; i < N_SEG - 3; i++) { const q = i - 2; const c = SER.segs[i].position; const r = radiusAt(i);
    const h = (0.35 + 0.65 * Math.sin(Math.PI * (i - 2) / (N_SEG - 5))) * (0.55 + 0.25 * Math.sin(SER.t * 4 - i * 0.7)) * 1.1;
    F.setXYZ(q * 2, c.x, c.y + r * 0.8, c.z); F.setXYZ(q * 2 + 1, c.x, c.y + r * 0.8 + h, c.z); }
  F.needsUpdate = true;
}
const _kp = new THREE.Vector3();
function knotTarget(k) {
  if (!k.t) k.t = { r: 0.32, get x() { k.m.getWorldPosition(_kp); return _kp.x; }, get y() { k.m.getWorldPosition(_kp); return _kp.y; }, get z() { k.m.getWorldPosition(_kp); return _kp.z; },
    hit(dmg) { if (!k.alive) return false; k.hp -= 1; k.flash = 0.3; SFX.knock?.(0, 900); k.m.getWorldPosition(_kp);
      for (let i = 0; i < 8; i++) MZ.fxGlow.emit(_kp.x, _kp.y, _kp.z, rr(-1.5, 1.5), rr(0.5, 2), rr(-1.5, 1.5), _c.setRGB(2.2, 1.6, 0.8), rr(0.05, 0.1), rr(0.4, 0.8), 2, 0.5, 0);
      if (k.hp <= 0) { k.alive = false; k.m.visible = false; MZ.combat?.popText?.(['One knot gone.', 'Two.', 'The last one!'][3 - SER.knots.filter((q) => q.alive).length - 1] || ''); SER.writhe = 1.2; if (SER.knots.every((q) => !q.alive)) serpentMended(); }
      return true; } };
  return k.t;
}
const _c = new THREE.Color();
/* the path: positions by station along the river, so it always swims the channel */
function serPos(s, lat, y, out) { const p = U.P(s, lat); return out.set(p.u, y, UZ + p.w); }
const _hp = new THREE.Vector3(), _q = new THREE.Vector3();
function serpentWake() {
  buildSerpent(); if (up().serpent) return;
  const L = U.MAIN.L; SER.s = L - 2; SER.lat = 0; SER.y = -1.5; SER.v = 0; SER.hist = []; SER.phase = 'rise'; SER.t = 0; SER.cp = -1; SER.knots.forEach((k) => { k.alive = true; k.hp = 3; k.m.visible = true; }); SER.u.uClean.value = 0;
  coil();
  SER.root.visible = true; MZ.cam.shake = Math.max(MZ.cam.shake || 0, 0.6); SFX.splash?.(); MZ.auSwell?.();
  setTimeout(() => { if (SER.phase !== 'rise') return; MZ.talkRun([{ who: '', text: 'The pool heaves. Something long and heavy with silt lifts out of the deep water under the falls.' }, { who: 'Aoi', text: 'Oh, no you don\'t.', fn: () => MZ.hero?.expr?.('determined', 0.8, 6) }],
    () => { if (!B()?.on) toast('Get in the boat. Then paddle, downriver, and don\'t stop.'); }); }, 1200);
}
function coil() {
  /* coiled round the bottom of the deep pool */
  const P0 = U.POOL; SER.hist = [];
  for (let i = 0; i < 90; i++) { const a = i * 0.16, r = 3.0 + i * 0.07; SER.hist.push(new THREE.Vector3(P0.u + Math.cos(a) * r, -1.6 - i * 0.004, UZ + P0.w + Math.sin(a) * r)); }
}
function straighten() { SER.hist = []; for (let i = 0; i < 90; i++) SER.hist.push(serPos(Math.min(SER.s + i * 0.3, U.MAIN.L), SER.lat, SER.y - i * 0.01, new THREE.Vector3())); }
SER.straighten = straighten;
function serpentStart() {
  /* debug: in the boat at the pool, the rifle taken, the serpent up */
  if (!U.on) U.enter('deep'); else U.tp('deep');
  up().gorge.rifle = 1; up().jam = 1; if (U.jam) U.jam.visible = false; up().serpent = 0; SER.phase = 'sleep';
  setTimeout(() => { serpentWake(); }, 300);
}
U.jamNow = () => jamScene(true);
if (MZ.combat) MZ.combat.serpentStart = serpentStart;
const CPS = () => U.BARS.map((b) => b.s).sort((a, b) => b - a);           /* stations, from the top down: quarry, ferry, tower */
function boatS() { const b = B(); const st = U.stAt(b?.on ? b.x : player.pos.x, (b?.on ? b.z : player.pos.z) - UZ); return st.s; }
function serStep(dt) {
  if (SER.phase === 'sleep' || SER.phase === 'gone' || !SER.built) return;
  SER.t += dt; const b = B(); const bs = boatS();
  const D = DIFF(); const hwS = U.hwAt(SER.s);
  if (SER.phase === 'rise') {
    SER.y = damp(SER.y, 1.2, 1.0, dt); SER.lat = Math.sin(SER.t * 0.8) * 3;
    if (SER.t > 3 && b?.on && !MZ.talk.on) { SER.phase = 'chase'; SER.grace = 2.5; toast('Paddle! Downriver, and keep pulling on the beat.'); }
  } else if (SER.phase === 'chase') {
    SER.grace = Math.max(0, SER.grace - dt);
    /* checkpoints: the lanterns she passes on the way down */
    const cps = CPS(); for (let i = 0; i < cps.length; i++) if (bs < cps[i] - 2 && SER.cp < i) { SER.cp = i; SFX.knock?.(0, 600); MZ.combat?.popText?.('A lantern passed. If it catches you, you start here.'); }
    const gap = SER.s - bs;
    const fl = U.flow(b.x, b.z, new THREE.Vector2()); const pd = U.P(bs); const along = -(Math.sin(b.yaw) * b.v + fl.x) * pd.tx - (Math.cos(b.yaw) * b.v + fl.y) * pd.tz;   /* her speed downstream */
    let tv = Math.max(along, 1.5) + (gap > 24 ? 1.8 : gap > 14 ? 0.35 : gap < 8 ? -0.6 : 0.1);
    if (gap < 3) tv = -1.2;                                   /* never past her: if she turns back, it backs off */
    tv *= D.speed ?? 1; if (SER.grace > 0) tv = Math.min(tv, 1.2);
    SER.v = damp(SER.v, tv, 1.6, dt); SER.s -= SER.v * dt;
    SER.y = 0.15 + Math.sin(SER.t * 1.3) * 0.35; SER.lat = clamp(Math.sin(SER.t * 0.9) * (hwS - 1.8), -hwS + 1.2, hwS - 1.2);
    /* the lunge: it rears, the water darkens along a line toward her; then it strikes down that line */
    SER.lcool -= dt;
    if (!SER.lunge && SER.lcool <= 0 && gap < 11 && gap > 3 && SER.grace <= 0) {
      const st = U.stAt(b.x, b.z - UZ), p = U.P(st.s); const blat = (b.x - p.u) * p.nx + (b.z - UZ - p.w) * p.nz;
      SER.lunge = { t: 0, lat: blat, s0: SER.s, warned: false }; SFX.splash?.(); MZ.combat?.popText?.('It rears!');
    }
    if (SER.lunge) {
      const L = SER.lunge; L.t += dt; const tele = 1.4 / Math.max(0.7, D.speed ?? 1);
      if (L.t < tele) { SER.y = lerp(SER.y, 1.6, 0.1); SER.lat = lerp(SER.lat, L.lat, 0.08); if (rnd() < dt * 20) { const q = serPos(SER.s - rr(2, 10), L.lat + rr(-1, 1), 0.05, _q); MZ.addRipple?.(q.x, q.z, 0.9); } }
      else if (L.t < tele + 0.5) { SER.s -= dt * 22; SER.lat = L.lat; SER.y = lerp(SER.y, 0.0, 0.3);
        serPos(SER.s, SER.lat, 0, _hp); if (b?.on && Math.hypot(_hp.x - b.x, _hp.z - b.z) < 1.7 && SER.hitCool <= 0) {
          SER.hitCool = 3; MZ.combat?.hurt?.(1, _hp.x, _hp.z, 'serpent'); b.v *= 0.35; b.vs = (rnd() < 0.5 ? -1 : 1) * 2.5; MZ.cam.shake = Math.max(MZ.cam.shake || 0, 0.5); SFX.splash?.(); SER.s += 10; } }
      else { SER.lunge = null; SER.lcool = rr(2.6, 4.2) / Math.max(0.7, D.speed ?? 1); }
    }
    SER.hitCool = Math.max(0, SER.hitCool - dt);
    /* the end of the gorge: past the narrows it can't follow, and jams */
    if (bs < U.NARROWS.s - 8) { SER.phase = 'stuck'; SER.t = 0; toast('It\'s stuck in the narrows! The knots on its head: break them.'); }
  } else if (SER.phase === 'stuck') {
    SER.s = damp(SER.s, U.NARROWS.s + 1.5, 2, dt); SER.v = 0;
    SER.writhe = Math.max(0, (SER.writhe || 0) - dt);
    SER.y = 1.4 + Math.sin(SER.t * 1.7) * 0.5 + SER.writhe * Math.sin(SER.t * 20) * 0.3; SER.lat = Math.sin(SER.t * 0.8) * 1.6;
    /* now and then it slams the water and the wave shoves her back */
    SER.lcool -= dt; if (SER.lcool <= 0) { SER.lcool = rr(4, 6); MZ.cam.shake = Math.max(MZ.cam.shake || 0, 0.3); SFX.splash?.(); for (let k = 0; k < 5; k++) setTimeout(() => { serPos(U.NARROWS.s - 2 - k * 2, rr(-3, 3), 0, _q); MZ.addRipple?.(_q.x, _q.z, 1.2); }, k * 120);
      if (b?.on && boatS() > U.NARROWS.s - 22) { const p = U.P(boatS()); b.v = -1.6; } }
  } else if (SER.phase === 'mended') {
    SER.t += 0; SER.s += dt * 3.5; SER.y = damp(SER.y, -0.2, 0.6, dt); SER.lat = Math.sin(SER.t * 0.7) * 2;
    SER.u.uClean.value = Math.min(1, SER.u.uClean.value + dt * 0.5);
    if (SER.s > U.NARROWS.s + 70) { SER.phase = 'gone'; SER.root.visible = false; }
  }
  /* the body follows the head's path */
  serPos(SER.s, SER.lat, SER.y, _hp);
  const last = SER.hist[0]; if (!last || last.distanceTo(_hp) > 0.25) { SER.hist.unshift(_hp.clone()); if (SER.hist.length > 200) SER.hist.pop(); }
  let acc = 0, hi = 0;
  for (let i = 0; i < N_SEG; i++) {
    const want = i * SPACING; while (hi < SER.hist.length - 1 && acc + SER.hist[hi].distanceTo(SER.hist[hi + 1]) < want) { acc += SER.hist[hi].distanceTo(SER.hist[hi + 1]); hi++; }
    const a = SER.hist[hi], bq = SER.hist[Math.min(hi + 1, SER.hist.length - 1)]; const seg = a.distanceTo(bq) || 1; const t = clamp((want - acc) / seg, 0, 1);
    const m = SER.segs[i]; m.position.copy(a).lerp(bq, t);
    m.position.y += Math.sin(SER.t * 2.2 - i * 0.55) * 0.18 - i * 0.03;
    if (i === 0) { const ah = U.P(SER.s + (SER.phase === 'mended' ? 2 : -2), SER.lat); m.lookAt(ah.u, SER.y + (SER.lunge ? -0.4 : 0.1), UZ + ah.w); }
  }
  bodyStep();
  SER.finMat.opacity = 0.22 + 0.1 * Math.sin(SER.t * 3) + SER.u.uClean.value * 0.4;
  SER.whisk.forEach((w, i) => { w.rotation.y = Math.sin(SER.t * 2.1 + i * 2) * 0.25; w.rotation.x = Math.sin(SER.t * 1.7 + i) * 0.15; });
  for (const k of SER.knots) { k.flash = Math.max(0, k.flash - dt); k.m.scale.setScalar(1 + k.flash * 1.5 + Math.sin(SER.t * 5) * 0.08); }
  SER.u.uNight.value = MZ.nightF; SER.u.uFlash.value = SER.knots.reduce((a, k) => Math.max(a, k.flash), 0);
  /* churn where it swims */
  if (rnd() < dt * 12 && SER.y > -0.6) { const q = SER.segs[(rnd() * N_SEG) | 0].position; MZ.fxSoft.emit(q.x + rr(-0.5, 0.5), 0.1, q.z + rr(-0.5, 0.5), rr(-0.6, 0.6), rr(0.8, 1.8), rr(-0.6, 0.6), _c.setRGB(0.55, 0.5, 0.42), rr(0.1, 0.2), rr(0.6, 1.0), 4, 0.5); }
}
function serpentMended() {
  SER.phase = 'mended'; SER.t = 0; up().serpent = 1; MZ.writeSave();
  serPos(SER.s, SER.lat, SER.y, _hp);
  for (let k = 0; k < 60; k++) MZ.fxSoft.emit(_hp.x + rr(-1.5, 1.5), _hp.y + rr(0, 1.5), _hp.z + rr(-1.5, 1.5), rr(-2.5, 2.5), rr(1, 3.5), rr(-2.5, 2.5), k % 2 ? _pet : _pet2, rr(0.07, 0.13), rr(1.6, 2.8), 0.8, 0.5, 0.6, 0.6);
  for (let k = 0; k < 30; k++) MZ.fxGlow.emit(_hp.x + rr(-1, 1), _hp.y + rr(0, 1.5), _hp.z + rr(-1, 1), rr(-0.8, 0.8), rr(0.6, 2.2), rr(-0.8, 0.8), _c.setRGB(2.0, 2.2, 2.5), rr(0.06, 0.12), rr(1.0, 1.8), -0.2, 0.6, 0);
  MZ.cam.shake = Math.max(MZ.cam.shake || 0, 0.4); SFX.get?.(); SFX.moment?.();
  setTimeout(() => MZ.talkRun([{ who: '', text: 'The silt cracks and slides away in sheets. Underneath it is only the river: long and clear and cold, and lit from inside.' },
    { who: '', text: 'It turns once in the narrows, and goes home up the gorge.' },
    { who: 'Aoi', text: 'It was carrying all of that. All the way down.', fn: () => MZ.hero?.expr?.('tender', 0.7, 6) }], () => {
    showCardBrief({ k: 'Chapter 2 · the Gorge', t: 'The river\'s own', s: 'The silt serpent was the river\'s own spirit, choked. It went home clean.' });
    MZ.piece?.('serpent');
    setTimeout(() => toast('Back at Mill Pond, Mr. Oda is waiting at the press. He says it can\'t wait.'), 4500);
    up().act2 = Math.max(up().act2 | 0, 1); MZ.writeSave();
  }), 900);
}
const _pet = new THREE.Color(1.0, 0.78, 0.84), _pet2 = new THREE.Color(0.85, 0.95, 1.0);
/* washed up in the chase: back at the last lantern, with it behind */
MZ.combat?.CB && (MZ.combat.CB.onWash = MZ.combat.CB.onWash || []);
MZ.combat?.CB?.onWash.push(() => {
  if (!U.on || SER.phase !== 'chase') return;
  const cps = CPS(); const s = SER.cp >= 0 ? cps[SER.cp] - 4 : U.MAIN.L - 6;
  setTimeout(() => { const p = U.P(s, 0); B()?.respawn(p.u, UZ + p.w, Math.atan2(-p.tx, -p.tz)); SER.s = s + 30; SER.lunge = null; SER.grace = 3; SER.hist = []; }, 50);
});

/* ================================================================
   Toma and the logjam
   ================================================================ */
let toma = null;
async function tomaLoad() { if (toma) return toma; try { toma = await loadCast('toma'); toma.g.traverse((o) => o.layers.enableAll()); toma.g.visible = false; } catch (e) { console.warn('toma', e); } return toma; }
U.jamScene = false;
async function jamScene(force) {
  if (U.jamScene || (up().jam && !force)) return; U.jamScene = true;
  const t = await tomaLoad(); const N = U.NARROWS, hw = U.hwAt(N.s);
  /* he's standing on the jammed timber itself, a pry bar over his shoulder */
  const on = U.P(N.s - 2.2, 1.6); const tx = on.u, tz = UZ + on.w;
  if (t) { t.g.visible = true; t.place(tx, 0.55, tz, Math.atan2(player.pos.x - tx, player.pos.z - tz)); t.P.look = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0)); t.P.lookK = 0.8; t.P.hold = 0.4;
    if (!t.bar && t.anchors?.handR) { t.bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.5, 6), U.MT.woodDk); t.bar.position.set(0, -0.45, 0.05); t.anchors.handR.add(t.bar); t.bar.layers.enableAll(); } }
  /* bring her in close and frame the two of them */
  const b = B(); if (b?.on) { const q = U.P(N.s - 7, 0.4); b.place(q.u, UZ + q.w, Math.atan2(q.tx, q.tz)); }
  const bp = b?.on ? new THREE.Vector3(b.x, 0, b.z) : player.pos.clone();
  const dir = new THREE.Vector3(tx - bp.x, 0, tz - bp.z).normalize(), side = new THREE.Vector3(dir.z, 0, -dir.x);
  shot.p.copy(bp).addScaledVector(dir, -3.4).addScaledVector(side, 1.6).setY(2.1); shot.l.set(tx, 1.4, tz).lerp(bp, 0.35).setY(1.3); shot.on = true;
  const ex = (e, w = 0.7) => () => t?.expr(e, w, 6), ax = (e, w = 0.7) => () => MZ.hero?.expr?.(e, w, 6);
  await new Promise((res) => MZ.talkRun([
    { who: 'Toma', text: 'You made the whole marsh croak. I heard it from the Reedbeds.', fn: ex('happy', 0.5) },
    { who: 'Aoi', text: 'You followed me again.', fn: ax('determined', 0.5) },
    { who: 'Toma', text: 'I followed the frogs.', fn: ex('tender', 0.5) },
    { who: '', text: 'He looks at the timber jammed across the narrows the way Kiyo used to look at a knot in a net.' },
    { who: 'Toma', text: 'Kiyo showed me once. A jam is like a knot. One log is holding all the rest. Find that one.', fn: ex('hopeful', 0.5) },
    { who: 'Aoi', text: 'And then?' }, { who: 'Toma', text: 'And then get out of the way.' }], res));
  shot.on = false;
  U.jamPull = true; toast('Find the key log with Toma: hold E at the jam.');
}
U.onSim.push((dt) => {
  /* Toma comes up once the marsh breathes */
  const u = up();
  if (!u.jam && !U.jamScene && u.still.every(Boolean) && !MZ.talk.on && !MZ.cine && Math.hypot(player.pos.x - U.NARROWS.u, player.pos.z - UZ - U.NARROWS.w) < 30) jamScene();
  serStep(dt);
  jamAnim(dt);
});
INTERACTS.push({ x: 0, z: 0, r: 0, pen: 0, upd() { this.x = U.NARROWS.u; this.z = UZ + U.NARROWS.w; this.r = U.jamPull ? 9 : 0; },
  state() { if (!U.on || !U.jamPull || up().jam) return null; return { ok: true, text: 'The key log · pull while Toma levers', hold: 2.4 }; },
  done() { jamBreak(); }, pos: () => _ip.set(U.NARROWS.u, 1.6, UZ + U.NARROWS.w) });
let jamT = -1;
function jamBreak() {
  U.jamPull = false; up().jam = 1; MZ.writeSave(); jamT = 0;
  MZ.cam.shake = Math.max(MZ.cam.shake || 0, 0.6); SFX.splash?.(); SFX.knock?.(0, 160); SFX.knock?.(0.2, 120);
  setTimeout(() => MZ.talkRun([{ who: '', text: 'The key log rolls. Then all of it goes at once, down the narrows in a roar of white water, and the gorge is open.' },
    { who: 'Toma', text: '...There.', fn: () => toma?.expr('happy', 0.6, 6) }, { who: 'Aoi', text: 'Toma...', fn: () => MZ.hero?.expr?.('tender', 0.6, 6) },
    { who: 'Toma', text: 'Don\'t.' }, { who: 'Aoi', text: 'I wasn\'t going to.', fn: () => MZ.hero?.expr?.('happy', 0.4, 4) },
    { who: 'Toma', text: 'I\'ll be at the dock. The bench needs oiling. Go on up. Mind the water, it\'s quick in there.' }], () => {
    if (toma) U.fadeTo(() => { toma.g.visible = false; });
    showCardBrief({ k: 'Chapter 2', t: 'The Gorge', s: 'Up past the narrows: a tower, a ferry crossing, a quarry, and a lodge under the falls.' });
  }), 1600);
}
function jamAnim(dt) {
  if (jamT < 0 || !U.jam) return; jamT += dt; const N = U.NARROWS;
  U.jam.children.forEach((l, i) => { const p0 = l.userData.p0; if (!p0) return; const k = clamp((jamT - i * 0.03) / 3.5, 0, 1);
    l.position.set(p0.x - N.tx * k * 30, p0.y * (1 - k) + Math.sin(k * 6 + i) * 0.2 * (1 - k), p0.z - N.tz * k * 30); l.rotation.y = l.userData.r0.y + k * (i % 2 ? 1.5 : -1.2); });
  if (jamT > 4) { U.jam.visible = false; jamT = -1; }
}
U.onSim.push((dt) => { if (toma && toma.g.visible) toma.update(dt);
  /* the rifle taken in an earlier session: it wakes when she comes back to the pool in the boat */
  const u = up(); if (u.gorge.rifle && !u.serpent && SER.phase === 'sleep' && B()?.on && Math.hypot(B().x - U.POOL.u, B().z - UZ - U.POOL.w) < U.POOL.R + 4) serpentWake(); });

/* ================================================================
   The HUD in the gorge, and a lit window at the lodge
   ================================================================ */
U.areaExt = () => {
  const s = boatS(); if (s < U.NARROWS.s - 6) return null; const u = up(); const h = S.arsenal.have;
  const n = (u.jam ? 1 : 0) + (h.semi ? 1 : 0) + (h.bolt ? 1 : 0) + (h.trap ? 1 : 0) + (h.scoped ? 2 : 0) + (u.serpent ? 3 : 0);
  return { name: 'The Gorge', pct: Math.round(n / 9 * 100), unit: 'found' };
};
U.tasksExt = () => {
  const s = boatS(); if (s < U.NARROWS.s - 6) return null; const u = up(); const h = S.arsenal.have; const out = [];
  if (SER.phase === 'chase') out.push({ main: true, text: 'Downriver! Keep ahead of it', x: U.NARROWS.u, z: UZ + U.NARROWS.w });
  else if (SER.phase === 'stuck') out.push({ main: true, text: 'Break the three knots on its head' });
  else if (!h.scoped) out.push({ main: true, text: 'Up the gorge, to the lodge under the falls', x: U.POOL.u, z: UZ + U.POOL.w });
  if (!h.semi) out.push({ text: 'The flood-watch tower', x: GZ.tower?.x, z: GZ.tower?.z });
  if (!h.bolt) out.push({ text: 'The old ferry crossing', x: GZ.ferry?.x, z: GZ.ferry?.z });
  if (!h.trap) out.push({ text: 'The quarry ledge', x: GZ.quarry?.x, z: GZ.quarry?.z });
  return out.filter((t) => t.x === undefined || Number.isFinite(t.x));
};
HOOKS.vis.push((dt) => {
  if (!U.on) return;
  /* spray and mist at the foot of the falls */
  if (GZ.fallBase && dt > 0 && Math.hypot(player.pos.x - GZ.fallBase.x, player.pos.z - GZ.fallBase.z) < 70) {
    if (rnd() < dt * 18) MZ.fxSoft.emit(GZ.fallBase.x + rr(-2, 2), 0.3 + rr(0, 1), GZ.fallBase.z + rr(-2, 2), rr(-0.8, 0.8), rr(0.6, 1.8), rr(-0.8, 0.8), _c.setRGB(0.95, 0.97, 1), rr(0.6, 1.2), rr(1.5, 3), -0.05, 0.4, 0.3, 0.25);
    if (rnd() < dt * 6) MZ.addRipple?.(GZ.fallBase.x + rr(-3, 3), GZ.fallBase.z + rr(-3, 3), 1.0);
    for (const f of GZ.fall) f.material.uniforms.uNight.value = MZ.nightF;
  }
});
U.onBuild.push(() => { reg(); if (up().jam && U.jam) U.jam.visible = false; });
/* the serpent, if she was mid-chase when the game closed, is back asleep (the rifle stays taken; it wakes again on the way down) */
if (!U.save().serpent) SER.phase = 'sleep';
U.GZ = GZ; U.lodgeMemory = lodgeMemory; U.shot = shot;      /* a camera shot other scenes can use (js/act2.js) */
SER.breakKnots = () => SER.knots.forEach((k) => { const t = knotTarget(k); for (let i = 0; i < 3; i++) t.hit(1); });
export { SER };
