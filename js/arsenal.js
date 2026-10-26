/* ================================================================
   Mizumend · the arsenal (v13.2). The fixed sheet: every piece is found somewhere with a history, comes with a short
   memory of its owner and what they lost, and is upgraded at Toma's bench. Nothing is ever killed: the shots are
   lamp-shots, a warm light that breaks the silt off a sick spirit, which then goes home (Teen).
     1 melee      the mending staff · Kiyo's net knife · the mill's axe · a length of sluice pipe · Toma's hammer · (the reedcutters' machete)
     2 sidearms   Kiyo's revolver · Oda's pistol · the gamekeeper's quiet pistol · (Toma's flare gun)
     3 shotguns   the storm-locker pump · (the farmhouse double-barrel)
     4 rifles     (the ferryman's bolt-action · the flood-watch rifle · Isamu's hunting rifle, scoped)
     5 bow        (the festival archer's bow, explosive arrows)
     6 throwables lamp-oil bottles · Toma's smoke and stun bombs · (blasting-cap traps)
   (in brackets: upriver, Chapter 2)
   Keys: 1-6 choose (press again to cycle within the slot), right-click aims, left-click fires, R reloads.
   With the staff in hand everything works as before (click to strike, right-click for the lantern).
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
import { loadCast } from './cast.js';
const { HOOKS, scene, camera, player, cam, S, PARAMS, makeToon, addOutline, clamp, lerp, damp, rr, rnd, G, $, SFX, AU, INTERACTS, toast, showCardBrief, groundH, canvas } = MZ;

/* ---------- the sheet ---------- */
const WEAP = {
  staff:   { slot: 1, name: 'The mending staff', kind: 'melee' },
  knife:   { slot: 1, name: "Kiyo's net knife", kind: 'melee', swing: [0.22, 0.08, 1.8, 1.1, 1], spin: 2 },
  axe:     { slot: 1, name: "The mill's axe", kind: 'melee', swing: [0.44, 0.2, 2.2, 1.3, 3], spin: 4 },
  pipe:    { slot: 1, name: 'A length of sluice pipe', kind: 'melee', swing: [0.34, 0.14, 2.6, 1.45, 2], spin: 3 },
  hammer:  { slot: 1, name: "Toma's hammer", kind: 'melee', swing: [0.4, 0.18, 1.9, 1.2, 3], spin: 4 },
  machete: { slot: 1, name: "The reedcutters' machete", kind: 'melee', swing: [0.28, 0.1, 2.3, 1.55, 2], spin: 3 },
  revolver:{ slot: 2, name: "Kiyo's revolver", kind: 'gun', dmg: 3, rate: 0.42, mag: 6, reload: 2.1, spread: 0.012, range: 45, snd: 'revolver' },
  pistol:  { slot: 2, name: "Oda's pistol", kind: 'gun', dmg: 2, rate: 0.2, mag: 10, reload: 1.4, spread: 0.02, range: 38, snd: 'pistol' },
  silenced:{ slot: 2, name: "The gamekeeper's quiet pistol", kind: 'gun', dmg: 2, rate: 0.28, mag: 8, reload: 1.6, spread: 0.016, range: 36, snd: 'quiet' },
  flaregun:{ slot: 2, name: "Toma's flare gun", kind: 'gun', dmg: 2, rate: 1.4, mag: 1, reload: 2.4, spread: 0.02, range: 40, snd: 'flare', flare: true },
  pump:    { slot: 3, name: 'The storm-locker shotgun', kind: 'gun', dmg: 1.1, pellets: 8, rate: 0.85, mag: 5, reload: 2.8, spread: 0.085, range: 16, snd: 'shotgun', two: true },
  double:  { slot: 3, name: 'The farmhouse double-barrel', kind: 'gun', dmg: 1.3, pellets: 9, rate: 0.28, mag: 2, reload: 2.0, spread: 0.1, range: 13, snd: 'shotgun', two: true },
  bolt:    { slot: 4, name: "The ferryman's bolt-action", kind: 'gun', dmg: 7, rate: 1.1, mag: 5, reload: 3.0, spread: 0.003, range: 90, snd: 'rifle', two: true },
  semi:    { slot: 4, name: 'The flood-watch rifle', kind: 'gun', dmg: 3.5, rate: 0.32, mag: 10, reload: 2.4, spread: 0.008, range: 75, snd: 'rifle', two: true },
  scoped:  { slot: 4, name: "Isamu's hunting rifle", kind: 'gun', dmg: 9, rate: 1.3, mag: 4, reload: 3.2, spread: 0, range: 130, snd: 'rifle', two: true, scope: true },
  bow:     { slot: 5, name: "The festival archer's bow", kind: 'bow', dmg: 4, draw: 0.7, range: 70, two: true },
  molotov: { slot: 6, name: 'Lamp-oil bottle', kind: 'throw', fx: 'fire', stock: 3 },
  smoke:   { slot: 6, name: 'Smoke bomb', kind: 'throw', fx: 'smoke', stock: 3 },
  stun:    { slot: 6, name: 'Stun bomb', kind: 'throw', fx: 'stun', stock: 3 },
  trap:    { slot: 6, name: 'Blasting-cap trap', kind: 'throw', fx: 'trap', stock: 2 },
};
/* each piece's memory: where it was, who it belonged to, what they lost (plain, short) */
const MEM = {
  revolver: ['Kiyo fired it once, into the air, the winter a bear came down to the landing.', 'Then she laughed at herself for an hour.'],
  knife: ['Kiyo mended nets on the landing with this, and sang the counting song wrong on purpose,', 'so that a small girl would shout the right words back at her.'],
  axe: ['Someone split the mill\'s kindling every autumn, left-handed.', 'The handle is worn to the shape of one hand. Nobody has held it since the flood.'],
  pump: ['Kept in the storm locker for the flood signal: three shots meant open the gate.', 'Nobody fired them that night. The three shells are still in the box.'],
  molotov: ['Lamp oil from the mill. A lamp across the water has burned through thirty-one years of it.', 'It burns with a clean blue flame that loosens silt.'],
  pipe: ['A length of the old sluice. It still hums when you swing it, low, like the gate did.'],
  pistol: ['Mr. Oda carried it on the mail road through the bad years and never once drew it.', '"The heaviest letter I ever carried," he says, and won\'t say which letter.'],
  silenced: ['The orchard\'s gamekeeper kept the crows off the young trees without waking the house.', 'The trees grew. The house is gone.'],
  hammer: ['Toma swears he lost this hammer in Kawashita.', 'He didn\'t lose it. He left it where you would find it.'],
  smoke: ['Toma\'s signal kit: smoke for "come and find me", a flash for "stay where you are".'],
  /* Chapter 2, the Upper Marsh */
  double: ['The farmhouse on the marsh kept it by the door for foxes, and fired it once a year at New Year, to wake the ducks.', 'The ducks came back every spring. The farmhouse didn\'t.'],
  machete: ['The reedcutters cleared the channels every autumn, singing the cutting song in two parts across the water.', 'One boat sang the question and the other sang the answer. There is nobody left to sing the answer.'],
  exarrow: ['Fire-arrows for the festival, wrapped in waxed reed and kept dry in the shrine under the willow.', 'One went up every summer, so the first boat would know where to go.'],
  semi: ['The flood-watch rifle. One shot from the tower meant rising water.', 'The night of the flood the watchman fired it until his hands shook. The rain was louder.'],
  bolt: ['The gorge ferryman kept it for the crows that stole his bait, and never once hit one.', 'He said he liked them too much to aim properly. They still sit on his cable in the evenings.'],
  trap: ['Blasting caps from the quarry, packed in sawdust. The quarrymen cut the stone for the mill\'s gate here.', 'The last block they cut is still on the ledge, marked for a gate that was never rebuilt.'],
  bow: ['Mira\'s grandmother was the festival archer. Every summer she stood on the reed island and sent one lit arrow out over the water.', 'The first boat followed it home. Nobody has drawn this bow since the flood.'],
};
/* things that aren't held but change what is held */
const FIRE_ARROWS = 6;
const EXTRA = { exarrow: { name: 'Festival fire-arrows', kind: 'ammo', card: 'Your arrows burst into light now. The bow is on 5.' } };
const A = { eq: 'staff', slotPick: {}, mag: {}, stock: {}, cool: 0, reloadT: -1, aim: false, aimK: 0, draw: -1, fovBase: null, tipShown: {}, shots: [], fx: [], traps: [] };
MZ.arsenal = A;
if (PARAMS.debug === '1' || PARAMS.debug === 'true') window.__mza = A;
const ar = () => { S.arsenal = S.arsenal || { have: {}, up: {} }; S.arsenal.have = S.arsenal.have || {}; S.arsenal.up = S.arsenal.up || {}; return S.arsenal; };
const has = (id) => id === 'staff' || !!(ar().have[id]);
const up = (id, k) => (ar().up[id] && ar().up[id][k]) | 0;
const W_ = (id) => WEAP[id];
A.ranged = () => { const w = WEAP[A.eq]; return !!w && w.kind !== 'melee' && MZ.mode === 'play'; };
/* stats after Toma's upgrades */
function stat(id) {
  const w = WEAP[id]; const d = up(id, 'dmg'), m = up(id, 'mag'), r = up(id, 'rel'), s = up(id, 'stab');
  return { dmg: (w.dmg || 1) * (1 + 0.25 * d), mag: (w.mag || 1) + Math.ceil((w.mag || 1) * 0.34 * m), reload: (w.reload || 1) * (1 - 0.15 * r), spread: (w.spread || 0) * (1 - 0.25 * s), kick: 1 - 0.2 * s, rate: w.rate || 0.5 };
}

/* ---------- models (simple, readable shapes; the barrel runs along local -y, as the hand hangs) ---------- */
const MT = { steel: makeToon(0x3a3a40, { noHeal: true, rim: 0.6 }), dark: makeToon(0x24242a, { noHeal: true, rim: 0.5 }), wood: makeToon(0x7a5232, { noHeal: true, rim: 0.4 }),
  brass: makeToon(0xb8913c, { noHeal: true, rim: 0.7 }), cloth: makeToon(0xb04a30, { noHeal: true }), glass: makeToon(0x8ab0a0, { noHeal: true, rim: 0.9 }), blade: makeToon(0xb8bcc4, { noHeal: true, rim: 0.9 }), paper: makeToon(0xe8d8b8, { noHeal: true }) };
function part(g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; }
const cyl = (r1, r2, h, n = 8) => new THREE.CylinderGeometry(r1, r2, h, n);
const bx = (a, b, c) => new THREE.BoxGeometry(a, b, c);
function model(id) {
  const g = new THREE.Group(); const muzzle = new THREE.Object3D(); g.add(muzzle);
  const barrel = (len, r, z = 0.015) => { part(g, cyl(r, r, len), MT.steel, 0, -len / 2 - 0.03, z); muzzle.position.set(0, -len - 0.04, z); };
  switch (id) {
    case 'revolver': part(g, bx(0.035, 0.11, 0.05), MT.wood, 0, 0.045, -0.02, -0.35); part(g, cyl(0.026, 0.026, 0.05, 6), MT.steel, 0, -0.02, 0.015); barrel(0.13, 0.009); break;
    case 'pistol': case 'silenced': part(g, bx(0.032, 0.1, 0.045), MT.dark, 0, 0.04, -0.02, -0.3); part(g, bx(0.03, 0.17, 0.04), MT.steel, 0, -0.06, 0.02); muzzle.position.set(0, -0.15, 0.02);
      if (id === 'silenced') { part(g, cyl(0.016, 0.016, 0.12), MT.dark, 0, -0.21, 0.02); muzzle.position.set(0, -0.28, 0.02); } break;
    case 'flaregun': part(g, bx(0.035, 0.1, 0.05), MT.cloth, 0, 0.04, -0.02, -0.3); part(g, cyl(0.022, 0.022, 0.14), MT.cloth, 0, -0.06, 0.02); muzzle.position.set(0, -0.14, 0.02); break;
    case 'pump': case 'double': case 'bolt': case 'semi': case 'scoped': {
      const len = id === 'double' ? 0.62 : id === 'pump' ? 0.58 : 0.78;
      part(g, bx(0.045, 0.34, 0.07), MT.wood, 0, 0.2, -0.01);                                   /* stock, toward the shoulder */
      part(g, bx(0.04, 0.2, 0.05), MT.steel, 0, -0.02, 0.01);
      if (id === 'double') { for (const x of [-0.012, 0.012]) part(g, cyl(0.011, 0.011, len), MT.steel, x, -len / 2 - 0.1, 0.02); muzzle.position.set(0, -len - 0.1, 0.02); }
      else { barrel(len, id === 'pump' ? 0.014 : 0.009, 0.02); muzzle.position.y -= 0.1; g.children[g.children.length - 1].position.y -= 0.1; }
      if (id === 'pump') part(g, cyl(0.02, 0.02, 0.14), MT.wood, 0, -0.32, 0.0);
      if (id === 'semi') part(g, bx(0.025, 0.07, 0.08), MT.dark, 0, -0.08, -0.05);
      if (id === 'bolt' || id === 'scoped') part(g, cyl(0.006, 0.006, 0.06), MT.steel, 0.035, 0.0, 0.03, 0, 0, Math.PI / 2);
      if (id === 'scoped') part(g, cyl(0.016, 0.016, 0.22), MT.dark, 0, -0.1, 0.06);
      break; }
    case 'bow': { const arc = new THREE.TorusGeometry(0.52, 0.012, 5, 18, Math.PI * 0.78); const b = part(g, arc, MT.wood, 0, 0, 0.0, Math.PI / 2, 0, -Math.PI * 0.39 + Math.PI / 2);
      A.bowString = part(g, cyl(0.002, 0.002, 0.95, 3), MT.paper, 0, 0.0, -0.18, Math.PI / 2); muzzle.position.set(0, 0, 0.3); break; }
    case 'molotov': part(g, cyl(0.03, 0.035, 0.12, 8), MT.glass, 0, -0.03, 0); part(g, cyl(0.01, 0.012, 0.06, 6), MT.glass, 0, -0.12, 0); part(g, bx(0.02, 0.05, 0.02), MT.cloth, 0, -0.16, 0); muzzle.position.set(0, -0.05, 0); break;
    case 'smoke': case 'stun': case 'trap': part(g, new THREE.SphereGeometry(0.045, 10, 8), id === 'stun' ? MT.paper : id === 'trap' ? MT.brass : MT.dark, 0, -0.03, 0); part(g, cyl(0.004, 0.004, 0.05, 4), MT.paper, 0, -0.08, 0); muzzle.position.set(0, -0.03, 0); break;
    case 'knife': part(g, bx(0.025, 0.09, 0.03), MT.wood, 0, 0.0, 0); part(g, bx(0.006, 0.16, 0.03), MT.blade, 0, -0.12, 0.004); break;
    case 'axe': part(g, cyl(0.018, 0.02, 0.62), MT.wood, 0, -0.2, 0); part(g, bx(0.02, 0.12, 0.16), MT.blade, 0, -0.48, 0.07); break;
    case 'pipe': part(g, cyl(0.025, 0.025, 0.8), MT.steel, 0, -0.3, 0); break;
    case 'hammer': part(g, cyl(0.016, 0.018, 0.4), MT.wood, 0, -0.12, 0); part(g, bx(0.05, 0.05, 0.14), MT.steel, 0, -0.33, 0.02); break;
    case 'machete': part(g, bx(0.03, 0.12, 0.035), MT.wood, 0, 0.0, 0); part(g, bx(0.006, 0.5, 0.06), MT.blade, 0, -0.3, 0.012); break;
  }
  if (WEAP[id]?.kind === 'gun' && !WEAP[id].two) g.scale.setScalar(1.35);      /* handguns read better a touch large */
  g.traverse((o) => o.layers.enableAll());                                         /* seen in the prologue's and the marsh's camera layers too */
  return { g, muzzle };
}
const MODELS = {};
/* the long guns sit in her shoulder and point where she looks, rather than hanging off her hand */
function shouldered(id) { return !!(WEAP[id]?.two && WEAP[id].kind === 'gun' && MZ.hero?.ready); }
const _sp = new THREE.Vector3(), _sd = new THREE.Vector3(), _sa = new THREE.Vector3(), _Y = new THREE.Vector3(0, -1, 0);
function shoulderStep() {
  const m = MODELS[A.eq]; if (!m || !shouldered(A.eq) || !m.g.visible) return;
  const ch = MZ.hero.anchors.chest; ch.updateWorldMatrix(true, false); ch.getWorldPosition(_sp);
  const f = player.face, rx = -Math.cos(f), rz = Math.sin(f), fx = Math.sin(f), fz = Math.cos(f);
  _sp.x += rx * 0.16 + fx * 0.02; _sp.z += rz * 0.16 + fz * 0.02; _sp.y += 0.05;
  /* aiming: at the point under the reticle; holding: muzzle down toward the ground ahead; reloading: lower still */
  const low = A.reloadT >= 0 ? 0.9 : 0.6;
  _sd.set(fx * Math.cos(low), -Math.sin(low), fz * Math.cos(low));
  if (A.aimK > 0.05) { camera.getWorldDirection(_sa); _sa.multiplyScalar(25).add(camera.position).sub(_sp).normalize(); _sd.lerp(_sa, clamp(A.aimK, 0, 1)).normalize(); }
  _sd.y += (A.kick || 0) * 0.8; _sd.normalize();
  m.g.quaternion.setFromUnitVectors(_Y, _sd);
  m.g.position.copy(_sp).addScaledVector(_sd, 0.3);
}
function hand(id) { if (id && WEAP[id]?.kind === 'bow' && MZ.hero?.ready) return MZ.hero.anchors.handL; return MZ.hero?.ready ? MZ.hero.anchors.handR : (player.arms[1].children[0] || player.arms[1]); }
function showModel() {
  for (const [id, m] of Object.entries(MODELS)) m.g.visible = false;
  const gear = MZ.combat?.gear;
  const w = WEAP[A.eq];
  if (gear) gear.hand.userData.arsenalHide = A.eq !== 'staff';
  if (A.eq === 'staff') return;
  const long = shouldered(A.eq), par = long ? scene : hand(A.eq);
  if (!MODELS[A.eq]) { MODELS[A.eq] = model(A.eq); par.add(MODELS[A.eq].g); }
  const m = MODELS[A.eq]; if (m.g.parent !== par) par.add(m.g);
  m.g.visible = true;
}

/* ---------- the HUD: what she holds, and the shots left ---------- */
const ui = (() => {
  const st = document.createElement('style');
  st.textContent = `#arHud{position:absolute;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(150px + env(safe-area-inset-bottom,0px));padding:8px 14px;min-width:190px;pointer-events:none;transition:opacity .4s}
  #arHud .nm{font-family:var(--f-display);font-size:17px} #arHud .am{font-size:15px;color:var(--ink-soft)} #arHud .sl{display:flex;gap:4px;margin-top:5px}
  #arHud .sl i{width:20px;height:20px;border-radius:5px;border:1.5px solid rgba(60,40,20,.35);font-style:normal;font-size:12px;display:grid;place-items:center;color:rgba(60,40,20,.5)}
  #arHud .sl i.own{color:var(--ink);border-color:rgba(60,40,20,.7)} #arHud .sl i.on{background:rgba(212,160,70,.45)}
  #arRet{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;pointer-events:none;border:2px solid rgba(255,236,200,.9);border-radius:50%;box-shadow:0 0 8px rgba(0,0,0,.5)}
  #arRet:after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;background:#ffe9c0;border-radius:50%}
  #arRet.hit{border-color:#ffd070} #arRet.scope{width:min(70vh,70vw);height:min(70vh,70vw);margin:calc(min(70vh,70vw)/-2) 0 0 calc(min(70vh,70vw)/-2);border:3px solid rgba(20,16,12,.9);box-shadow:0 0 0 100vmax rgba(8,6,4,.82)}
  #arBench{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 80px);overflow:auto;padding:18px 22px;pointer-events:auto}
  #arBench h2{margin:0 0 4px} #arBench .w{border-top:1px solid rgba(60,40,20,.2);padding:8px 0} #arBench .w b{font-family:var(--f-display);font-weight:400;font-size:17px}
  #arBench .row{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px} #arBench button.pbtn[disabled]{opacity:.45}
  #arMem{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(150,110,60,.18) 30%,rgba(70,45,20,.7) 100%);opacity:0;transition:opacity 1s} #arMem.on{opacity:1}`;
  document.head.appendChild(st);
  const hud = document.createElement('div'); hud.id = 'arHud'; hud.className = 'paper note'; hud.hidden = true; $('hud').appendChild(hud);
  const ret = document.createElement('div'); ret.id = 'arRet'; ret.hidden = true; $('hud').appendChild(ret);
  const bench = document.createElement('section'); bench.id = 'arBench'; bench.className = 'paper'; bench.hidden = true; $('app').appendChild(bench);
  const mem = document.createElement('div'); mem.id = 'arMem'; $('app').appendChild(mem);
  return { hud, ret, bench, mem };
})();
let hudKey = '', hudShowT = 0;
function hudStep(dt) {
  const w = WEAP[A.eq]; hudShowT = Math.max(0, hudShowT - dt);
  const show = MZ.mode === 'play' && !MZ.kawa?.on && (A.eq !== 'staff' || hudShowT > 0) && !MZ.cine;
  ui.hud.hidden = !show; if (!show) return;
  const st = stat(A.eq);
  const ammo = w.kind === 'gun' ? (A.reloadT >= 0 ? 'Reloading…' : `${A.mag[A.eq] ?? st.mag} / ${st.mag}`) : w.kind === 'throw' ? `${A.stock[A.eq] ?? 0} left` : w.kind === 'bow' ? (A.draw >= 0 ? 'Drawing…' : 'Hold click to draw') + (ar().have.exarrow ? ` · ${A.stock.exarrow | 0} fire-arrows` : '') : 'Click to strike';
  const slots = [1, 2, 3, 4, 5, 6].map((n) => { const own = Object.keys(WEAP).some((id) => WEAP[id].slot === n && has(id)); return `<i class="${own ? 'own' : ''}${WEAP[A.eq].slot === n ? ' on' : ''}">${n}</i>`; }).join('');
  const k = A.eq + '|' + ammo + '|' + slots;
  if (k !== hudKey) { hudKey = k; ui.hud.innerHTML = `<div class="nm">${w.name}</div><div class="am">${ammo}</div><div class="sl">${slots}</div>`; }
}

/* ---------- choosing ---------- */
function pick(slot) {
  const ids = Object.keys(WEAP).filter((id) => WEAP[id].slot === slot && has(id));
  if (!ids.length) { if (slot !== 1) toast(['', 'The mending staff', 'Nothing here yet. Kiyo kept a revolver in her ferry box.', 'Nothing here yet. The mill had a storm locker, once.', 'Nothing here yet. Rifles are upriver.', 'Nothing here yet. There was an archer\'s shrine upriver.', 'Nothing to throw yet. There\'s lamp oil at the mill.'][slot]); return; }
  let id;
  if (WEAP[A.eq].slot === slot && ids.length > 1) id = ids[(ids.indexOf(A.eq) + 1) % ids.length];
  else id = A.slotPick[slot] && ids.includes(A.slotPick[slot]) ? A.slotPick[slot] : ids[0];
  equip(id);
}
function equip(id) {
  if (!has(id)) return;
  A.eq = id; A.slotPick[WEAP[id].slot] = id; A.reloadT = -1; A.draw = -1; A.aim = false;
  const w = WEAP[id];
  if (w.kind === 'gun' && A.mag[id] === undefined) A.mag[id] = stat(id).mag;
  applyMelee(); showModel(); hudShowT = 2.5; SFX.rustle();
  if (w.kind !== 'melee' && !A.tipShown.ranged) { A.tipShown.ranged = true; toast('Right-click to aim, left-click to fire, R to reload. 1 puts the staff back in your hand.'); }
}
/* melee pieces change the staff's swing (reach, speed, weight); the staff itself stays the mending staff */
const SWING0 = [];
function applyMelee() {
  const SW = MZ.combat?.SWING; if (!SW) return;
  if (!SWING0.length) for (let i = 1; i < 4; i++) SWING0[i] = { ...SW[i] };
  const w = WEAP[A.eq];
  for (let i = 1; i < 4; i++) Object.assign(SW[i], SWING0[i]);
  if (w.kind === 'melee' && w.swing) {
    const [dur, hit, reach, arc, dmg] = w.swing; const d = up(A.eq, 'dmg');
    for (let i = 1; i < 3; i++) Object.assign(SW[i], { dur, hit, reach, arc, dmg: dmg * (1 + 0.3 * d) });
    Object.assign(SW[3], { dur: dur * 1.5, hit: hit * 1.6, reach: reach * 1.2, arc: Math.PI, dmg: (w.spin || dmg * 2) * (1 + 0.3 * d) });
  }
}
addEventListener('keydown', (e) => {
  if (MZ.mode !== 'play' || e.repeat || MZ.talk.on || MZ.journalOpen || MZ.photo.on || MZ.decorOn || MZ.kawa?.on || !ui.bench.hidden) return;
  const m = /^Digit([1-6])$/.exec(e.code); if (m) { pick(+m[1]); return; }
  if (e.code === 'KeyR' && A.ranged()) reload();
});
canvas.addEventListener('mousedown', (e) => {
  if (!A.ranged() || MZ.kawa?.on || MZ.cine) return;
  if (e.button === 2) { e.preventDefault(); A.aim = true; }
  if (e.button === 0 && document.pointerLockElement === canvas) { A.trigger = true; if (WEAP[A.eq].kind === 'bow') A.draw = 0; else fire(); }
});
addEventListener('mouseup', (e) => { if (e.button === 2) A.aim = false; if (e.button === 0) { A.trigger = false; if (WEAP[A.eq]?.kind === 'bow' && A.draw >= 0) loose(); } });

/* ---------- sound ---------- */
function bang(kind) {
  const ctx = AU.ctx; if (!ctx || !AU.sfx) return; const t = ctx.currentTime;
  const len = ctx.sampleRate * 0.6 | 0, buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, kind === 'shotgun' ? 2.2 : 3.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = { revolver: 2600, pistol: 3200, quiet: 900, shotgun: 1800, rifle: 4200, flare: 1400, throw: 700, boom: 1100 }[kind] || 2400;
  const gn = ctx.createGain(); const v = { quiet: 0.12, flare: 0.35, throw: 0.2, boom: 0.9, shotgun: 0.95, rifle: 0.8 }[kind] || 0.7;
  gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'quiet' ? 0.12 : kind === 'boom' ? 0.9 : 0.45));
  src.connect(f); f.connect(gn); gn.connect(AU.sfx); src.start(t);
  if (kind !== 'quiet') { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(kind === 'boom' ? 70 : 120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(kind === 'shotgun' || kind === 'boom' ? 0.7 : 0.4, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g2); g2.connect(AU.sfx); o.start(t); o.stop(t + 0.35); }
}
function click(n = 2, gap = 0.12) { const ctx = AU.ctx; if (!ctx) return; for (let i = 0; i < n; i++) { const t = ctx.currentTime + i * gap; const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1800 + i * 300;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04); o.connect(g); g.connect(AU.sfx); o.start(t); o.stop(t + 0.05); } }

/* ---------- shooting: a ray from the eye, a lamp-light tracer from the muzzle ---------- */
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const traceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 0.9), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const flashMat = new THREE.SpriteMaterial({ map: null, color: 0xffd8a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const flashL = new THREE.PointLight(0xffc880, 0, 9, 2); scene.add(flashL);
function targetsList() { return MZ.combat?.targets ? MZ.combat.targets() : []; }
/* a spirit's body floats half a metre over its feet; over the shallows its feet are under water, so the body sits on the surface */
function center(t, out) { let y = (t.y ?? player.pos.y) + (t.type ? 0.5 : 0); if (t.type && t.z < 600) y = Math.max(y, MZ.levelCur + 0.32); return out.set(t.x, y, t.z); }
function raycastTargets(o, d, range) {
  let best = null, bt = range;
  for (const t of targetsList()) {
    center(t, _c); const r = (t.r || 0.5) + 0.15;
    _t.copy(_c).sub(o); const b = _t.dot(d); if (b < 0) continue; const c2 = _t.lengthSq() - b * b; if (c2 > r * r) continue;
    const th = b - Math.sqrt(r * r - c2); if (th < bt) { bt = th; best = t; }
  }
  /* the ground (and the water) stop a shot */
  let gt = range;
  for (let s = 0.5; s < Math.min(range, bt); s += 0.5) { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s; if (y < Math.max(groundH(x, z), z > 600 ? -9 : MZ.levelCur - 0.15)) { gt = s; break; } }
  if (gt < bt) return { t: null, dist: gt };
  return { t: best, dist: best ? bt : range };
}
function aimRay() {
  if (A.aimK > 0.5) {
    camera.getWorldDirection(_d); _o.copy(camera.position);
    /* a little help: a target within a few degrees of the reticle pulls the shot onto it (more on Gentle) */
    const lim = (MZ.combat?.D?.().label === 'Gentle' ? 0.09 : 0.055); let best = null, ba = lim;
    for (const t of targetsList()) { center(t, _c); _t.copy(_c).sub(_o); const L = _t.length(); if (L < 1 || L > 60) continue; const a = Math.acos(clamp(_t.dot(_d) / L, -1, 1)) - Math.atan((t.r || 0.5) / L); if (a < ba) { ba = a; best = t; } }
    if (best) { center(best, _c); _d.copy(_c).sub(_o).normalize(); }
    return; }
  /* from the hip: toward the nearest target in front of her, or straight ahead */
  const fx = Math.sin(player.face), fz = Math.cos(player.face); let best = null, bs = 1e9;
  for (const t of targetsList()) { const dx = t.x - player.pos.x, dz = t.z - player.pos.z, dd = Math.hypot(dx, dz); if (dd > 26 || dd < 0.5) continue;
    const a = Math.acos(clamp((dx * fx + dz * fz) / dd, -1, 1)); if (a > 0.7) continue; const sc = a * 4 + dd * 0.05; if (sc < bs) { bs = sc; best = t; } }
  _o.set(player.pos.x, player.pos.y + 1.35, player.pos.z);
  if (best) { center(best, _c); _d.copy(_c).sub(_o).normalize(); player.faceT = player.face = Math.atan2(_d.x, _d.z); player.faceLock = 0.35; }
  else _d.set(fx, 0, fz);
}
function muzzleWorld(out) { const m = MODELS[A.eq]; if (m && m.g.visible) { m.g.updateMatrixWorld(true); return m.muzzle.getWorldPosition(out); } return out.set(player.pos.x + Math.sin(player.face) * 0.5, player.pos.y + 1.3, player.pos.z + Math.cos(player.face) * 0.5); }
function tracer(a, b, w = 0.012) {
  const len = a.distanceTo(b); if (len < 0.05) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 0.6, len, 4, 1, true), traceMat.clone());
  m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _t.copy(b).sub(a).normalize());
  m.renderOrder = 8; scene.add(m); A.fx.push({ m, t: 0, life: 0.09 });
}
function fire() {
  const w = WEAP[A.eq]; if (!w || !MZ.combat?.active?.()) return;
  if (w.kind === 'throw') { throwIt(); return; }
  if (w.kind !== 'gun' || A.cool > 0 || A.reloadT >= 0) return;
  const st = stat(A.eq);
  if ((A.mag[A.eq] ?? st.mag) <= 0) { click(1); reload(); return; }
  A.mag[A.eq] = (A.mag[A.eq] ?? st.mag) - 1; A.cool = st.rate;
  aimRay(); muzzleWorld(_m);
  const n = w.pellets || 1; let any = false, clang = false;
  for (let i = 0; i < n; i++) {
    const d = _d.clone(); const sp = st.spread * (A.aimK > 0.5 ? 1 : 1.6) + (n > 1 ? 0 : 0);
    if (sp > 0) { d.x += (Math.random() - 0.5) * 2 * sp; d.y += (Math.random() - 0.5) * 2 * sp; d.z += (Math.random() - 0.5) * 2 * sp; d.normalize(); }
    const r = raycastTargets(_o, d, w.range);
    const end = _o.clone().addScaledVector(d, r.dist);
    tracer(_m, end, n > 1 ? 0.006 : 0.012);
    if (r.t) {
      const t = r.t; const dmg = t.type ? st.dmg : Math.min(1, st.dmg);                   /* knots on the big ones only ever take one at a time */
      const dx = t.x - player.pos.x, dz = t.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
      if (w.flare && t.stun) t.stun();
      const res = t.hit ? t.hit(dmg, dx / l, dz / l, 'lamp') : false;
      if (res === 'clang') { clang = true; MZ.sparkle?.(end.x, end.y, end.z, 4); } else if (res) { any = true; for (let k = 0; k < 4; k++) MZ.fxGlow.emit(end.x, end.y, end.z, rr(-1, 1), rr(0.5, 1.5), rr(-1, 1), new THREE.Color(2.4, 1.9, 1.0), 0.07, 0.4, 0, 0.6, 0); }
    } else { MZ.fxSoft.emit(end.x, end.y + 0.05, end.z, rr(-0.5, 0.5), rr(0.5, 1.2), rr(-0.5, 0.5), new THREE.Color(0.7, 0.62, 0.5), 0.1, 0.5, 4, 0.6); if (end.y < MZ.levelCur + 0.1 && end.z < 600) MZ.addRipple(end.x, end.z, 0.6); }
  }
  bang(w.snd); MZ.combat.CB.engagedT = MZ.simTime; A.lastFireT = MZ.simTime;
  flashL.position.copy(_m); flashL.intensity = w.snd === 'quiet' ? 1.2 : 6; A.flashT = 0.06;
  A.kick = (w.two ? 0.11 : 0.08) * st.kick; cam.pitch = clamp(cam.pitch - A.kick * 0.35, -0.35, 1.2); cam.shake = Math.max(cam.shake || 0, w.snd === 'shotgun' ? 0.35 : 0.15);
  if (clang && !any) { MZ.combat.popText?.('Ping! From behind, or flare it open'); }
  if (w.flare) { MZ.fxGlow.emit(_m.x, _m.y, _m.z, _d.x * 30, _d.y * 30 + 2, _d.z * 30, new THREE.Color(3, 0.6, 0.3), 0.3, 1.2, -6, 0.9, 0); }
  if (A.mag[A.eq] <= 0) setTimeout(() => { if (A.eq && WEAP[A.eq].kind === 'gun') reload(); }, 350);
}
function reload() {
  const w = WEAP[A.eq]; if (!w || w.kind !== 'gun' || A.reloadT >= 0) return; const st = stat(A.eq);
  if ((A.mag[A.eq] ?? st.mag) >= st.mag) return;
  A.reloadT = 0; click(3, 0.25);
}
/* ---------- the bow: hold to draw, let go ---------- */
function loose() {
  const w = WEAP.bow; const k = clamp(A.draw / w.draw, 0.2, 1); A.draw = -1; if (!MZ.combat?.active?.()) return;
  aimRay(); muzzleWorld(_m);
  /* fly from her hand to the point under the reticle (the camera is off to one side of her hand) */
  const hitR = raycastTargets(_o, _d, 60); const aimPt = _o.clone().addScaledVector(_d, Math.min(hitR.dist, 60));
  const v = aimPt.sub(_m).normalize().multiplyScalar(18 + 30 * k); v.y += 0.6;
  /* fire-arrows from the shrine burst into light where they land; there are only so many (Toma's bench refills them) */
  const ex = !!ar().have.exarrow && (A.stock.exarrow | 0) > 0; if (ex) A.stock.exarrow--;
  const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), MT.wood); arrow.castShadow = true; scene.add(arrow); arrow.layers.enableAll();
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), ex ? MT.cloth : MT.steel); tip.position.y = 0.37; arrow.add(tip); tip.layers.enableAll();
  A.shots.push({ kind: 'arrow', m: arrow, p: _m.clone(), v, dmg: stat('bow').dmg * k, ex, t: 0 });
  bang('throw');
}
/* ---------- throwing ---------- */
function throwIt() {
  const id = A.eq, w = WEAP[id]; if ((A.stock[id] | 0) <= 0) { toast('None left. Toma can fill your satchel at his bench.'); return; } if (A.cool > 0) return;
  A.stock[id]--; A.cool = 0.7;
  aimRay(); muzzleWorld(_m);
  /* aim at the ground where the ray lands (or 14 m ahead) */
  const r = raycastTargets(_o, _d, 22); const land = _o.clone().addScaledVector(_d, Math.min(r.dist, 22)); land.y = groundH(land.x, land.z);
  const T = 0.9, v = land.clone().sub(_m).divideScalar(T); v.y += 0.5 * 18 * T;
  const m = model(id).g; m.scale.setScalar(1.3); scene.add(m);
  A.shots.push({ kind: 'throw', fx: w.fx, m, p: _m.clone(), v, t: 0, T });
  bang('throw');
}
function effectAt(fx, p) {
  if (fx === 'trap') { const m = model('trap').g; m.position.copy(p); m.position.y = groundH(p.x, p.z) + 0.05; scene.add(m); A.traps.push({ m, p: p.clone(), arm: 0.8 }); toast('The trap is set.'); return; }
  const life = fx === 'fire' ? 5 : fx === 'smoke' ? 8 : 0.4;
  A.fx.push({ zone: fx, p: p.clone(), t: 0, life, tick: 0 });
  if (fx === 'stun' || fx === 'fire') { flashL.position.copy(p).add(new THREE.Vector3(0, 0.8, 0)); flashL.intensity = fx === 'stun' ? 14 : 5; A.flashT = 0.15; bang(fx === 'stun' ? 'boom' : 'throw'); }
  if (fx === 'stun') for (const t of targetsList()) { center(t, _c); if (_c.distanceTo(p) < 5 && t.stun) t.stun(); }
  if (fx === 'smoke') SFX.splash?.();
}
function boom(p, dmg, r) {
  flashL.position.copy(p).add(new THREE.Vector3(0, 0.6, 0)); flashL.intensity = 16; A.flashT = 0.18; bang('boom'); cam.shake = Math.max(cam.shake || 0, 0.6);
  for (let i = 0; i < 24; i++) MZ.fxGlow.emit(p.x, p.y + 0.4, p.z, rr(-4, 4), rr(1, 5), rr(-4, 4), new THREE.Color(2.6, 1.6, 0.7), rr(0.1, 0.2), rr(0.4, 0.9), 3, 0.7, 0);
  for (const t of targetsList()) { center(t, _c); const d = _c.distanceTo(p); if (d < r && t.hit) { const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz) || 1; t.hit(t.type ? dmg : 1, dx / l, dz / l, 'lamp'); if (t.stun) t.stun(); } }
}

/* ---------- per frame ---------- */
HOOKS.sim.push((dt) => {
  A.cool = Math.max(0, A.cool - dt);
  const w = WEAP[A.eq];
  if (A.reloadT >= 0) { A.reloadT += dt; if (A.reloadT >= stat(A.eq).reload) { A.reloadT = -1; A.mag[A.eq] = stat(A.eq).mag; click(1); } }
  if (A.draw >= 0) A.draw += dt;
  /* full-auto feel for the semi-automatics: holding the trigger keeps firing at their rate */
  if (A.trigger && w && w.kind === 'gun' && (A.eq === 'pistol' || A.eq === 'semi') && A.cool <= 0) fire();
  /* projectiles */
  for (let i = A.shots.length - 1; i >= 0; i--) {
    const s = A.shots[i]; s.t += dt;
    if (s.kind === 'arrow') {
      s.v.y -= 9.8 * dt; const step = s.v.clone().multiplyScalar(dt); const L = step.length();
      const r = raycastTargets(s.p, step.clone().normalize(), L);
      if (r.t || r.dist < L || s.t > 3) {
        const end = s.p.clone().addScaledVector(step.normalize(), r.dist);
        if (s.ex) boom(end, 4, 3.2);
        else if (r.t && r.t.hit) { const dx = r.t.x - player.pos.x, dz = r.t.z - player.pos.z, l = Math.hypot(dx, dz) || 1; r.t.hit(r.t.type ? s.dmg : 1, dx / l, dz / l, 'lamp'); }
        scene.remove(s.m); A.shots.splice(i, 1); continue;
      }
      s.p.add(step.multiplyScalar(1)); s.m.position.copy(s.p); s.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.v.clone().normalize());
    } else {
      const k = s.t / s.T; const p = s.p.clone().addScaledVector(s.v, s.t); p.y -= 0.5 * 18 * s.t * s.t;
      s.m.position.copy(p); s.m.rotation.x += dt * 9;
      if (k >= 1 || p.y < groundH(p.x, p.z)) { p.y = groundH(p.x, p.z); scene.remove(s.m); A.shots.splice(i, 1); effectAt(s.fx, p); }
    }
  }
  /* zones: the blue lamp-oil flame mends what stands in it; smoke hides her */
  for (let i = A.fx.length - 1; i >= 0; i--) {
    const f = A.fx[i]; f.t += dt;
    if (f.m) { f.m.material.opacity = 0.9 * (1 - f.t / f.life); if (f.t >= f.life) { scene.remove(f.m); f.m.geometry.dispose(); A.fx.splice(i, 1); } continue; }
    if (f.zone) {
      f.tick -= dt;
      if (f.zone === 'fire' && Math.random() < dt * 30) MZ.fxGlow.emit(f.p.x + rr(-2, 2), f.p.y + 0.1, f.p.z + rr(-2, 2), 0, rr(0.6, 1.6), 0, new THREE.Color(0.8, 1.4, 2.6), rr(0.1, 0.2), rr(0.5, 1.0), -0.5, 0.7, 0);
      if (f.zone === 'smoke' && Math.random() < dt * 24) MZ.fxSoft.emit(f.p.x + rr(-3, 3), f.p.y + rr(0.2, 1.5), f.p.z + rr(-3, 3), rr(-0.3, 0.3), rr(0.2, 0.6), rr(-0.3, 0.3), new THREE.Color(0.78, 0.78, 0.8), rr(0.5, 0.9), rr(1.5, 2.5), 1, 0.4);
      if (f.tick <= 0) { f.tick = 0.8; for (const t of targetsList()) { center(t, _c); const d = _c.distanceTo(f.p);
        if (f.zone === 'fire' && d < 2.8 && t.hit) { const dx = t.x - f.p.x, dz = t.z - f.p.z, l = Math.hypot(dx, dz) || 1; t.hit(t.type ? 1 : 0.5, dx / l, dz / l, 'lamp'); }
        if (f.zone === 'smoke' && d < 4.5 && t.stun) t.stun(); } }
      if (f.t >= f.life) A.fx.splice(i, 1);
    }
  }
  for (let i = A.traps.length - 1; i >= 0; i--) { const tr = A.traps[i]; tr.arm -= dt; if (tr.arm > 0) continue;
    for (const t of targetsList()) { center(t, _c); if (_c.distanceTo(tr.p) < 1.8) { scene.remove(tr.m); A.traps.splice(i, 1); boom(tr.p, 4, 3.4); break; } } }
  if (A.flashT > 0) { A.flashT -= dt; if (A.flashT <= 0) flashL.intensity = 0; }
});
/* her pose while she holds something: arms up to aim, both hands on the long guns */
HOOKS.pose.push((dt) => {
  const gear = MZ.combat?.gear; if (gear && A.eq !== 'staff' && !MZ.kawa?.on) { gear.hand.visible = false; if (A.aimK > 0.3) gear.back.visible = false; }   /* the staff on her back crosses the shoulder view */
  const w = WEAP[A.eq];
  const aiming = A.ranged() && (A.aim || A.draw >= 0 || (MZ.simTime - (A.lastFireT || -9) < 0.6)) && !MZ.cine && !MZ.talk.on;
  A.aimK = damp(A.aimK, A.ranged() && A.aim && !MZ.cine && !MZ.talk.on && !MZ.kawa?.on ? 1 : 0, 10, dt);
  if (MZ.hero) MZ.hero.aimK = A.ranged() ? Math.max(A.aimK, A.reloadT >= 0 ? 0 : 0.6) : 0;
  if (!A.ranged() || MZ.kawa?.on) { if (MZ.hero) MZ.hero.aimElbow = null; return; }
  const aR = player.arms[1], aL = player.arms[0];
  camera.getWorldDirection(_d);
  const pitch = A.aimK > 0.3 ? Math.asin(clamp(_d.y, -0.9, 0.9)) : 0;
  const up = -Math.acos(clamp(-Math.sin(pitch), -1, 1));
  if (A.reloadT >= 0) { aR.rotation.set(-0.9, 0, 0.2); aL.rotation.set(-0.8 + Math.sin(A.reloadT * 14) * 0.15, 0, -0.5); return; }
  if (w.kind === 'throw') { aR.rotation.set(A.aimK > 0.5 ? -2.4 : -0.5, 0, 0.3); return; }
  const raise = aiming || A.aimK > 0.2 ? 1 : 0.35;
  /* arms[1] is the hand that holds (mirrored onto her right); a small inward turn brings both hands to the grip */
  const hero = MZ.hero;
  if (w.kind === 'bow') {
    /* the bow in her left hand, arm out straight; her right hand draws back to her cheek */
    const dk = A.draw >= 0 ? clamp(A.draw / WEAP.bow.draw, 0, 1) : 0;
    aL.rotation.set(lerp(-0.45, up, raise), 0, lerp(-0.2, 0.22, raise));
    aR.rotation.set(lerp(-0.45, up + 0.12, raise), 0, lerp(0.15, -0.32, raise));
    if (hero) hero.aimElbow = [0.35 + 1.75 * dk, 0.06];
  } else if (w.two) {
    /* a long gun at the shoulder: right hand at her chest on the grip, left arm out along the fore-end */
    aR.rotation.set(lerp(-0.45, up + 0.5, raise) - (A.kick || 0), 0, lerp(0.15, -0.1, raise));
    aL.rotation.set(lerp(-0.45, up + 0.1, raise) - (A.kick || 0) * 0.6, 0, lerp(-0.2, 0.45, raise));
    if (hero) hero.aimElbow = [1.0, 0.3];
  } else {
    aR.rotation.set(lerp(-0.45, up, raise) - (A.kick || 0), 0, lerp(0.15, -0.12, raise));
    aL.rotation.set(lerp(-0.2, up + 0.15, raise * 0.8), 0, lerp(-0.1, 0.42, raise * 0.8));
    if (hero) hero.aimElbow = null;
  }
  A.kick = Math.max(0, (A.kick || 0) - dt * 0.8);
  if (A.aimK > 0.3) { player.faceT = player.face = cam.yaw + Math.PI; player.faceLock = 0.1; player.slow = 0.55; } else if (player.slow === 0.55) player.slow = 1;
  if (w.kind === 'bow' && A.bowString) A.bowString.position.z = -0.18 - clamp(A.draw / WEAP.bow.draw, 0, 1) * 0.25 * (A.draw >= 0 ? 1 : 0);
});
/* the over-the-shoulder camera while aiming (and the scope) */
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _ro = new THREE.Vector3(), _cur = new THREE.Vector3();
HOOKS.vis.push((dt) => {
  hudStep(dt); shoulderStep();
  const k = A.aimK; const w = WEAP[A.eq];
  ui.ret.hidden = !(A.ranged() && k > 0.5) || MZ.kawa?.on;
  ui.ret.classList.toggle('scope', !!(w && w.scope && k > 0.8));
  if (A.fovBase === null) A.fovBase = camera.fov;
  const wantFov = w && w.scope && k > 0.5 ? 18 : A.fovBase;
  if (Math.abs(camera.fov - wantFov) > 0.05 && !MZ.photo.on) { camera.fov = damp(camera.fov, wantFov, 10, dt); camera.updateProjectionMatrix(); }
  if (k < 0.01 || MZ.kawa?.on) return;
  const y = cam.yaw, p = cam.pitch, cp = Math.cos(p), sp = Math.sin(p);
  const dir = _d.set(-Math.sin(y) * cp, -sp, -Math.cos(y) * cp);
  const head = _c.set(player.pos.x, player.pos.y + 1.42, player.pos.z);
  const side = 0.82 * clamp(camera.aspect / 1.78, 0.5, 1);          /* narrower screens: closer to her shoulder, or she leaves the frame */
  _cp.copy(head).addScaledVector(dir, -2.5).add(_ro.set(Math.cos(y) * side, 0.24, -Math.sin(y) * side));   /* over her right shoulder, far enough that she sits left of the reticle */
  if (_cp.y < groundH(_cp.x, _cp.z) + 0.3) _cp.y = groundH(_cp.x, _cp.z) + 0.3;
  _cl.copy(_cp).addScaledVector(dir, 12);
  camera.position.lerp(_cp, k);
  camera.getWorldDirection(_cur); _cur.multiplyScalar(12).add(camera.position);
  camera.lookAt(_cur.lerp(_cl, k));
  /* the reticle turns gold when it's over something */
  if (k > 0.5) { camera.getWorldDirection(_t); const r = raycastTargets(camera.position, _t, w.range || 30); ui.ret.classList.toggle('hit', !!r.t); }
});

/* ---------- memories ---------- */
async function memory(id, where) {
  const lines = MEM[id] || [];
  ui.mem.classList.add('on'); $('letterbox').classList.add('on');
  await new Promise((res) => MZ.talkRun(lines.map((t) => ({ who: '', text: t })), res));
  ui.mem.classList.remove('on'); $('letterbox').classList.remove('on');
  const w = WEAP[id] || EXTRA[id];
  showCardBrief({ k: 'Found · ' + where, t: w.name, s: w.card || (w.kind === 'throw' ? 'In your satchel. Press 6 to hold it.' : `Press ${w.slot} to hold it.`) });
}
function give(id, where, silent) {
  const a = ar(); if (a.have[id]) return false; a.have[id] = 1;
  if (WEAP[id].kind === 'throw') A.stock[id] = (A.stock[id] | 0) + WEAP[id].stock;
  if (WEAP[id].kind === 'gun') A.mag[id] = stat(id).mag;
  MZ.writeSave(); hudShowT = 3;
  if (!silent) memory(id, where);
  return true;
}
A.give = give;

/* ---------- where things are found (this round: Mill Pond, the mill, the sluice, Oda's, the orchard) ---------- */
const _ip = new THREE.Vector3();
function spot(def) { INTERACTS.push(Object.assign({ r: 2.4 }, def)); }
const mill = MZ.mill, sl = MZ.sluice;
function millPt(lx, lz) { mill.g.updateMatrixWorld(true); return mill.g.localToWorld(new THREE.Vector3(lx, 0, lz)); }
const AXE = millPt(3.1, 1.5), LOCKER = millPt(-2.0, 3.3), OIL = millPt(1.2, 3.4);
spot({ x: AXE.x, z: AXE.z, state() { if (has('axe')) return null; return { ok: true, text: 'The mill\'s axe, left in the chopping block', hold: 0.8 }; }, done() { give('axe', 'the mill\'s woodpile'); }, pos: () => _ip.set(AXE.x, groundH(AXE.x, AXE.z) + 0.8, AXE.z) });
spot({ x: LOCKER.x, z: LOCKER.z, state() { if (has('pump')) return null; if (MZ.stage() < 1) return { ok: false, text: 'The mill\'s storm locker · rusted shut until the water goes down' }; return { ok: true, text: 'Open the mill\'s storm locker', hold: 1.2 }; }, done() { give('pump', 'the mill\'s storm locker'); }, pos: () => _ip.set(LOCKER.x, groundH(LOCKER.x, LOCKER.z) + 1.3, LOCKER.z) });
spot({ x: OIL.x, z: OIL.z, state() { if (has('molotov')) return null; if (MZ.stage() < 1) return null; return { ok: true, text: 'Lamp oil, by the mill door', hold: 0.8 }; }, done() { give('molotov', 'the mill door'); }, pos: () => _ip.set(OIL.x, groundH(OIL.x, OIL.z) + 0.7, OIL.z) });
spot({ x: sl.x, z: sl.z, r: 4.2, state() { if (has('pipe') || !sl.built) return null; return { ok: true, text: 'A loose length of the old sluice pipe', hold: 0.8 }; }, done() { give('pipe', 'the sluice'); }, pos: () => _ip.set(sl.x, sl.bed + sl.H + 0.4, sl.z) });
const ODAB = MZ.press.world(3.4, 0.6);
spot({ x: ODAB.x, z: ODAB.z, state() { if (has('pistol') || MZ.oda.state !== 'home' || MZ.oda.met < 1) return null; return { ok: true, text: 'Mr. Oda\'s postal strongbox · he said you could look', hold: 1.0 }; }, done() { give('pistol', 'Mr. Oda\'s strongbox'); }, pos: () => _ip.set(ODAB.x, groundH(ODAB.x, ODAB.z) + 0.6, ODAB.z) });
/* the gamekeeper's hut, at the orchard's east wall */
const HUT = { x: MZ.ORCH.x + 21, z: MZ.ORCH.z + 13 };
const hut = (() => {
  const g = new THREE.Group(); g.position.set(HUT.x, groundH(HUT.x, HUT.z), HUT.z); g.rotation.y = -0.9; scene.add(g);
  const wood = makeToon(0x6a5038, { tag: 'hutwood' }), roof = makeToon(0x5a4a3a, { tag: 'hutroof' });
  const box = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; o.receiveShadow = true; g.add(o); addOutline(o, 0.015); return o; };
  box(2.4, 1.9, 2.0, wood, 0, 0.95, 0); box(2.8, 0.1, 1.4, roof, 0, 2.15, -0.5, 0.45); box(2.8, 0.1, 1.4, roof, 0, 2.15, 0.5, -0.45);
  box(0.7, 1.4, 0.05, makeToon(0x3a2c20, { tag: 'hutdoor' }), 0, 0.7, 1.01);
  MZ.bakeStatic?.(g);
  return g;
})();
spot({ x: HUT.x + Math.sin(-0.9) * 1.6, z: HUT.z + Math.cos(-0.9) * 1.6, state() { if (has('silenced') || MZ.oStage() < 1) return null; return { ok: true, text: 'The gamekeeper\'s hut · a cupboard behind the door', hold: 1.0 }; }, done() { give('silenced', 'the gamekeeper\'s hut'); }, pos: () => _ip.set(HUT.x, groundH(HUT.x, HUT.z) + 1.6, HUT.z) });

/* ---------- Toma at Mill Pond: his reed boat, his bench on the old dock ---------- */
const DOCK = MZ.dock;
const BENCH = { x: DOCK.g.position.x + 1.9, z: DOCK.g.position.z + 1.4 };
const TOMA_AT = { x: BENCH.x + 0.2, z: BENCH.z + 1.0 };
let toma = null, tomaArrive = false;
const reedBoat = (() => {
  const g = new THREE.Group(); scene.add(g); g.visible = false;
  const reed = makeToon(0x9a8558, { noHeal: true, rim: 0.16, tag: 'reedboat' }), bind = makeToon(0x5a3e24, { noHeal: true });   /* dried reed, not straw-yellow */
  for (const sx of [-0.32, 0, 0.32]) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 2.6, 4, 8), reed); b.rotation.x = Math.PI / 2; b.position.set(sx, sx === 0 ? -0.08 : 0, 0); b.scale.set(1, 1, 0.8); b.castShadow = true; g.add(b); addOutline(b, 0.012); }
  for (const z of [-1.0, -0.3, 0.4, 1.1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 5, 14), bind); r.position.z = z; r.scale.set(1.2, 0.7, 1); g.add(r); }
  const prow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 7), reed); prow.rotation.x = -Math.PI / 2 + 0.5; prow.position.set(0, 0.25, 1.8); g.add(prow);
  g.rotation.z = 0.05;                                    /* it sits a little crooked */
  return g;
})();
const bench = (() => {
  const g = new THREE.Group(); g.position.set(BENCH.x, groundH(BENCH.x, BENCH.z), BENCH.z); g.rotation.y = 0.4; scene.add(g); g.visible = false;
  const wood = makeToon(0x8a6440, { tag: 'tomabench' }), dark = makeToon(0x4a3626, { tag: 'tomabench2' }), steel = MT.steel;
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); addOutline(o, 0.012); return o; };
  box(1.8, 0.1, 0.7, wood, 0, 0.88, 0); for (const [x, z] of [[-0.8, -0.28], [0.8, -0.28], [-0.8, 0.28], [0.8, 0.28]]) box(0.08, 0.88, 0.08, dark, x, 0.44, z);
  box(0.18, 0.16, 0.16, steel, 0.7, 1.0, -0.15); box(0.6, 0.04, 0.12, wood, -0.3, 0.96, 0.1); box(0.06, 0.06, 0.3, steel, -0.6, 0.96, -0.12);
  const lan = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), makeToon(0xffe6b0, { emissive: 0xffb35c, noHeal: true, tag: 'benchlan' })); lan.position.set(0.85, 1.2, 0.2); g.add(lan);
  return g;
})();
function tomaPlace(force) {
  if (!ar().have.toma_bench) return;
  bench.visible = true; reedBoat.visible = true;
  /* the boat stays where she left it (js/boat.js), unless it's being sent home */
  if (force || !MZ.boat?.away) {
    /* moored off the end of the dock, wherever the water is deep enough for it at the pond's current level */
    let bx = DOCK.g.position.x + 1.5, bz = DOCK.g.position.z - 5.5;
    for (let i = 0; i < 60 && MZ.depthAt(bx, bz) < 0.6; i++) { const l = Math.hypot(bx, bz) || 1; bx -= bx / l * 0.5; bz -= bz / l * 0.5; }
    reedBoat.position.set(bx, MZ.levelCur + 0.05, bz); reedBoat.rotation.set(0, 0.1, 0.05); if (MZ.boat) { MZ.boat.away = false; MZ.boat.x = reedBoat.position.x; MZ.boat.z = reedBoat.position.z; MZ.boat.yaw = 0.1; } }
  if (toma) { toma.g.visible = !ar().have.toma_gone && !A.tomaAway; toma.place(TOMA_AT.x, MZ.walkH(TOMA_AT.x, TOMA_AT.z), TOMA_AT.z, Math.atan2(BENCH.x - TOMA_AT.x, BENCH.z - TOMA_AT.z)); toma.P.hold = 0.7; toma.P.lean = 0.25; }   /* Act 2: once she sends him home, he's gone (js/act2.js) */
}
async function tomaLoad() { if (toma) return toma; try { toma = await loadCast('toma'); } catch (e) { console.warn('toma', e); } return toma; }
const TOMA_LINES = [
  [['Toma', 'The boat sits crooked. I\'ve stopped trying to fix it. It floats better that way.'], ['Aoi', 'That makes no sense.'], ['Toma', 'No. It doesn\'t.']],
  [['Toma', 'Kiyo used to say you row like you\'re angry at the river.'], ['Aoi', 'I\'m not angry at the river.'], ['Toma', 'I know who you\'re angry at.']],
  [['Toma', 'If it squeaks, bring it here. If it doesn\'t squeak, bring it anyway.']],
  [['Aoi', 'You could go back, you know. Nobody would blame you.'], ['Toma', 'You would. You\'d blame me for going and for staying. I\'ve made my peace with it.']],
];
async function tomaArrival() {
  if (tomaArrive) return; tomaArrive = true;
  const t = await tomaLoad();
  const a = ar();
  $('letterbox').classList.add('on');
  reedBoat.visible = true; const startZ = DOCK.g.position.z - 22, endZ = DOCK.g.position.z - 5.5;
  if (t) { t.g.visible = true; t.P.hold = 0.8; t.P.lean = 0.1; }
  for (let i = 0; i <= 60; i++) { const k = i / 60, e = 1 - Math.pow(1 - k, 2); reedBoat.position.set(DOCK.g.position.x + 1.5, MZ.levelCur + 0.05, lerp(startZ, endZ, e)); if (t) t.place(reedBoat.position.x, reedBoat.position.y + 0.1, reedBoat.position.z - 0.4, 0); await new Promise((r) => setTimeout(r, 60)); }
  if (t) { t.place(TOMA_AT.x, MZ.walkH(TOMA_AT.x, TOMA_AT.z), TOMA_AT.z, Math.atan2(player.pos.x - TOMA_AT.x, player.pos.z - TOMA_AT.z)); t.P.hold = 0; t.P.look = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)); }
  const lines = [['Toma', 'Don\'t say it.', 'sad'], ['Aoi', 'I told you to go home.', 'anger'], ['Toma', 'You did. I went. It was very quiet.', 'tender'], ['Aoi', 'So you came back.', 'worried'],
    ['Toma', 'I came up. It\'s different.', 'hopeful'], ['Aoi', 'You followed me up a river in a boat.', 'anger'], ['Toma', 'It sits a little crooked. I couldn\'t get it right.', 'sad'],
    ['', 'Aoi looks at the boat for a long time.', null], ['Aoi', '...It\'s a good boat.', 'tender'], ['Toma', 'It\'s a good boat.', 'happy'],
    ['', 'He carries a workbench up onto the old dock as if he has always worked there.', null],
    ['Toma', 'If anything you carry needs mending, bring it here. Kiyo\'s revolver too. She\'d want it oiled.', 'tender']];
  if (!a.have.revolver) lines.push(['Toma', 'You left these on the landing. Her revolver, and her net knife.', 'sad']);
  await new Promise((res) => MZ.talkRun(lines.map(([who, text, ex]) => ({ who, text, fn: ex ? () => { if (who === 'Aoi') MZ.hero?.expr?.(ex, 0.8, 6); else t?.expr(ex, 0.8, 6); } : null })), res));
  $('letterbox').classList.remove('on');
  a.have.toma_bench = 1; if (!a.have.revolver) { a.have.revolver = 1; } a.have.knife = 1; a.have.hammer = 1;
  A.stock.smoke = (A.stock.smoke | 0) + 3; A.stock.stun = (A.stock.stun | 0) + 3; a.have.smoke = 1; a.have.stun = 1;
  MZ.writeSave(); tomaPlace();
  showCardBrief({ k: 'Mill Pond · the old dock', t: 'Toma\'s bench', s: 'Upgrades for what you carry, and a fresh satchel of throwables. He gave you his hammer, and his signal kit.' });
  setTimeout(() => toast('Hold E at Toma\'s bench to upgrade. 1 to 6 choose what you hold.'), 5200);
}
spot({ x: BENCH.x, z: BENCH.z, r: 2.4, state() { if (!ar().have.toma_bench || A.benchBusy) return null; return { ok: true, text: ar().have.toma_gone ? 'Toma\'s bench · he left it oiled' : 'Toma\'s bench · upgrades', hold: 0.5 }; }, done() { openBench(); }, pos: () => _ip.set(BENCH.x, groundH(BENCH.x, BENCH.z) + 1.3, BENCH.z) });
let tomaLine = 0;
spot({ x: TOMA_AT.x, z: TOMA_AT.z, r: 2.6, pen: 0.3, state() { if (!ar().have.toma_bench || !toma || ar().have.toma_gone || A.benchBusy || !toma.g.visible) return null; return { ok: true, text: 'Talk to Toma', hold: 0.2 }; }, done() {
  const L = TOMA_LINES[tomaLine++ % TOMA_LINES.length]; if (toma) toma.P.look = player.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
  MZ.talkRun(L.map(([who, text]) => ({ who, text })), () => { if (toma) toma.P.look = null; }); }, pos: () => _ip.set(TOMA_AT.x, groundH(TOMA_AT.x, TOMA_AT.z) + 2.0, TOMA_AT.z) });
HOOKS.sim.push((dt) => {
  if (MZ.mode !== 'play' || MZ.kawa?.on) return;
  const a = ar();
  const CB = MZ.combat?.CB;
  const calm = CB && !CB.enemies.length && MZ.simTime - CB.engagedT > 6 && !(HOOKS.bossActive && HOOKS.bossActive());
  if (!a.have.toma_bench && !tomaArrive && PARAMS.notoma !== '1' && MZ.stage() >= 1 && MZ.simTime > 30 && calm && !MZ.cine && !MZ.talk.on && !MZ.journalOpen && Math.hypot(player.pos.x - DOCK.g.position.x, player.pos.z - DOCK.g.position.z) < 16) tomaArrival();
  if (a.have.toma_bench && !toma && !A.tomaLoading) { A.tomaLoading = true; tomaLoad().then(() => tomaPlace()); }
  if (toma && toma.g.visible) { const d = Math.hypot(player.pos.x - TOMA_AT.x, player.pos.z - TOMA_AT.z); if (d > 6 && !MZ.talk.on) { toma.P.look = null; toma.P.hold = 0.7; toma.P.lean = 0.25; } }
});
HOOKS.vis.push((dt) => { if (toma && toma.g.visible && !MZ.kawa?.on) toma.update(dt); if (reedBoat.visible && ar().have.toma_bench && !MZ.boat?.on && !(MZ.boat?.away && reedBoat.position.z > 2000)) { reedBoat.position.y = MZ.levelCur + 0.05 + Math.sin(G.uTime.value * 1.1) * 0.02; } });

/* ---------- the bench ---------- */
const TRACKS = { gun: [['dmg', 'Lamp-shot strength'], ['mag', 'Holds more'], ['rel', 'Quicker reload'], ['stab', 'Steadier']], melee: [['dmg', 'Heavier']], bow: [['dmg', 'A stronger draw']], throw: [] };
function cost(L) { return { wood: 2 + 2 * L, stone: 1 + L, reed: L }; }
function openBench() {
  if (document.pointerLockElement) document.exitPointerLock();
  const a = ar(); const owned = Object.keys(WEAP).filter((id) => id !== 'staff' && a.have[id] && WEAP[id].kind !== 'throw');
  const inv = S.inv;
  const rows = owned.map((id) => { const w = WEAP[id]; const tr = TRACKS[w.kind] || [];
    return `<div class="w"><b>${w.name}</b><div class="row">${tr.map(([k, label]) => { const L = up(id, k); const c = cost(L); const can = L < 3 && inv.wood >= c.wood && inv.stone >= c.stone && (inv.reed | 0) >= c.reed;
      return `<button class="pbtn" type="button" data-up="${id}|${k}" ${can ? '' : 'disabled'}>${label} ${'●'.repeat(L)}${'○'.repeat(3 - L)}${L < 3 ? ` · ${c.wood} wood, ${c.stone} stone${c.reed ? `, ${c.reed} reed` : ''}` : ' · done'}</button>`; }).join('')}</div></div>`; }).join('');
  ui.bench.innerHTML = `<h2>Toma's bench</h2><p class="qnote">"Bring me wood and stone and I'll make it better. Reed for the fiddly bits." · You have ${inv.wood} wood, ${inv.stone} stone, ${inv.reed | 0} reed.</p>
    ${rows || '<p class="qnote">Nothing to work on yet.</p>'}
    <div class="w"><b>Throwables</b><p class="qnote">Lamp oil ${A.stock.molotov | 0} · smoke ${A.stock.smoke | 0} · stun ${A.stock.stun | 0}${ar().have.exarrow ? ` · fire-arrows ${A.stock.exarrow | 0}` : ''}</p><div class="row"><button class="pbtn" type="button" data-refill="1">Fill the satchel (free)</button></div></div>
    <div class="row" style="margin-top:10px"><button class="pbtn" type="button" data-close="1">Done · Esc</button></div>`;
  ui.bench.hidden = false; A.benchOpen = true;
}
ui.bench.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.close) { closeBench(); return; }
  if (b.dataset.refill) { for (const id of ['molotov', 'smoke', 'stun', 'trap']) if (ar().have[id]) A.stock[id] = WEAP[id].stock; if (ar().have.exarrow) A.stock.exarrow = FIRE_ARROWS; SFX.get?.(); openBench(); return; }
  if (b.dataset.up) { const [id, k] = b.dataset.up.split('|'); const L = up(id, k); const c = cost(L); const inv = S.inv;
    if (L >= 3 || inv.wood < c.wood || inv.stone < c.stone || (inv.reed | 0) < c.reed) return;
    inv.wood -= c.wood; inv.stone -= c.stone; inv.reed = (inv.reed | 0) - c.reed;
    const a = ar(); a.up[id] = a.up[id] || {}; a.up[id][k] = L + 1; SFX.knock?.(0, 520); SFX.knock?.(0.12, 640); applyMelee(); MZ.writeSave(); openBench(); }
});
function closeBench() { ui.bench.hidden = true; A.benchOpen = false; MZ.canvas.focus({ preventScroll: true }); }
addEventListener('keydown', (e) => { if (!ui.bench.hidden && e.code === 'Escape') { e.preventDefault(); closeBench(); } }, true);
HOOKS.sim.push(() => { if (!ui.bench.hidden && Math.hypot(player.pos.x - BENCH.x, player.pos.z - BENCH.z) > 4) closeBench(); });

/* ---------- start-up ---------- */
setTimeout(() => {
  const a = ar();
  if (a.have.revolver && !a.have.knife) a.have.knife = 1;                     /* both were in Kiyo's ferry box */
  for (const id of ['molotov', 'smoke', 'stun', 'trap']) if (a.have[id] && A.stock[id] === undefined) A.stock[id] = WEAP[id].stock;
  if (a.have.exarrow && A.stock.exarrow === undefined) A.stock.exarrow = FIRE_ARROWS;
  if (a.have.toma_bench) { tomaLoad().then(() => tomaPlace()); }
}, 0);
/* the prologue's ferry box gave the revolver; it also held her net knife */
HOOKS.sim.push(() => { const a = ar(); if (a.have.revolver && !a.have.knife) { a.have.knife = 1; } });
A.loose = loose; A.memory = memory; A.closeBench = closeBench; A.reedBoat = reedBoat; A.tomaPlace = tomaPlace; A.MEM = MEM;
A.tomaCast = () => toma; A.TOMA_AT = TOMA_AT; A.BENCH = BENCH;
A.equip = equip; A.pick = pick; A.fire = fire; A.reload = reload; A.WEAP = WEAP; A.stat = stat; A.tomaArrival = tomaArrival; A.openBench = openBench; A.effectAt = effectAt;
