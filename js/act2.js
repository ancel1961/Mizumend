/* ================================================================
   Mizumend · Act 2's turn (v13.4). Fixed beat 2: she rejects the love in front of her.
   After the gorge, back at Mill Pond:
     1. Mr. Oda, at the press, says what he should have said the first day: he sent one notice, years ago, to one
        address in Kawashita. The ferry house. Kiyo's house.
     2. That night, by the lamp, Aoi unpicks the lining Kiyo re-sewed one winter. The notice is inside, folded small.
        On the back, in Kiyo's hand: "Not yet." Kiyo knew where she came from, all along.
     3. In the morning Toma is at his bench. "Everyone who loves me lies, or leaves. Go home, Toma." This time he goes.
        He leaves the bench, oiled, and the boat. Of course he does.
   Debug: window.__mzu.act2(n) jumps to a beat (1 Oda, 2 the night, 3 the dock).
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
const { HOOKS, player, cam, S, PARAMS, clamp, lerp, damp, G, $, SFX, toast, showCardBrief } = MZ;
const U = MZ.up;
const up = () => U.save();
const st = () => up().act2 | 0;
const set = (n) => { up().act2 = n; MZ.writeSave(); };
const ax = (e, w = 0.7, s = 6) => () => MZ.hero?.expr?.(e, w, s);
let busy = false;
const talk = (lines) => new Promise((res) => MZ.talkRun(lines, res));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fade = (fn) => new Promise((res) => U.fadeTo(() => { fn?.(); setTimeout(res, 900); }));

/* 1 · Mr. Oda's confession, at the press */
async function odaBeat() {
  busy = true; const oda = MZ.oda;
  if (oda?.root) { oda.face = Math.atan2(player.pos.x - oda.root.position.x, player.pos.z - oda.root.position.z); }
  $('letterbox')?.classList.add('on');
  await talk([
    { who: 'Mr. Oda', text: 'There you are. Sit. No, sit, my knees can\'t look up that far.' },
    { who: 'Mr. Oda', text: 'I heard the gorge go quiet. Then I heard you come back down it. Then I sat here and decided I\'ve been a coward long enough.' },
    { who: 'Mr. Oda', text: MZ.STORY_TEXT?.oda?.replace(/ — K\. Oda$/, '') || 'I sent the notice. Only one, to one address in Kawashita.' },
    { who: 'Aoi', text: 'What address?', fn: ax('worried', 0.6) },
    { who: 'Mr. Oda', text: 'The ferry house. On the landing.' },
    { who: 'Aoi', text: '...Kiyo\'s house.', fn: ax('worried', 0.8) },
    { who: 'Mr. Oda', text: 'I never knew the name. Only that someone there had taken in a child the river brought down.' },
    { who: 'Aoi', text: 'She never got any notice. She\'d have told me. She\'d have—', fn: ax('sad', 0.6) },
    { who: '', text: 'She thinks of the basket. Of the lining Kiyo re-sewed one winter, and wouldn\'t let her help with.' },
    { who: 'Mr. Oda', text: 'I\'m sorry. For the years. Not for the notice.' }]);
  $('letterbox')?.classList.remove('on');
  set(2);
  await wait(600);
  showCardBrief({ k: 'Act 2', t: 'That night, at the cottage', s: 'By the lamp, with the basket.' });
  await wait(3200);
  await nightBeat();
  busy = false;
}
/* 2 · the lining */
async function nightBeat() {
  busy = true;
  /* she's inside; we see the lamp in the cottage window from the yard, the way Kiyo's window looked from the river */
  await fade(() => { const H = MZ.HOME; if (H) { MZ.teleport(H.x + Math.sin(H.ry) * 2.2, H.z + Math.cos(H.ry) * 2.2, H.x, H.z);
      const sh = U.shot; if (sh) { sh.p.set(H.x + Math.sin(H.ry + 0.35) * 10, MZ.groundH(H.x, H.z) + 2.4, H.z + Math.cos(H.ry + 0.35) * 10); sh.l.set(H.x, MZ.groundH(H.x, H.z) + 2.0, H.z); sh.on = true; sh.k = 1; } }
    S.hours = 21.6; if (MZ.hero) MZ.hero.hidden = true; });
  $('letterbox')?.classList.add('on');
  MZ.hero?.setMood?.('sad', 0.5);
  await talk([
    { who: '', text: 'That night, by the lamp, she turns the basket over in her hands for a long time.' },
    { who: '', text: 'Then she unpicks the lining, stitch by stitch.' },
    { who: '', text: 'Inside, folded small: a typed notice. THE MILL COTTAGE, free to anyone who will mend it. Addressed to the ferry house, Kawashita.' },
    { who: '', text: 'On the back, in Kiyo\'s square hand, two words: Not yet.' },
    { who: 'Aoi', text: 'Not yet.', fn: ax('sad', 0.8, 8) },
    { who: 'Aoi', text: 'You had it the whole time. You had me read you the river levels off the radio every night, and you had this.', fn: ax('anger', 0.6, 8) },
    { who: 'Aoi', text: '...When, then? When was it going to be yet?', fn: ax('sad', 0.9, 8) }]);
  $('letterbox')?.classList.remove('on');
  MZ.hero?.setMood?.(null);
  MZ.piece?.('lining', true);
  showCardBrief({ k: 'Kiyo\'s basket · the lining', t: 'Not yet', s: 'Kiyo knew where she came from. She kept the notice, and never said a word.' });
  set(3);
  await wait(3600);
  /* morning: she comes out of the door into the yard */
  await fade(() => { S.hours = 7.1; if (U.shot) { U.shot.on = false; U.shot.k = 0; } if (MZ.hero) MZ.hero.hidden = false;
    const H = MZ.HOME; if (H) MZ.teleport(H.x + Math.sin(H.ry) * 5.5, H.z + Math.cos(H.ry) * 5.5, H.x + Math.sin(H.ry) * 12, H.z + Math.cos(H.ry) * 12); });
  toast('Morning. Toma is at his bench on the dock.');
  busy = false;
}
/* 3 · the dock */
async function dockBeat() {
  busy = true; const A = MZ.arsenal; const t = A?.tomaCast?.(); A.benchBusy = true;
  const TA = A.TOMA_AT;
  if (t) { t.P.look = player.pos.clone().add(new THREE.Vector3(0, 1.4, 0)); t.P.lookK = 0.2; t.P.hold = 0.7; t.P.lean = 0.3; }
  const tx = (e, w = 0.7) => () => t?.expr(e, w, 8);
  $('letterbox')?.classList.add('on');
  if (t && U.shot) { const tp = t.g.position, pp = player.pos; const d = new THREE.Vector3(tp.x - pp.x, 0, tp.z - pp.z).normalize(), sd = new THREE.Vector3(d.z, 0, -d.x);
    U.shot.p.copy(pp).addScaledVector(d, -2.6).addScaledVector(sd, 1.4); U.shot.p.y = pp.y + 1.9; U.shot.l.copy(tp).lerp(pp, 0.4); U.shot.l.y = pp.y + 1.35; U.shot.on = true; }
  await talk([
    { who: 'Toma', text: 'You\'re up early.', fn: tx('hopeful', 0.4) },
    { who: 'Aoi', text: 'Did you know?', fn: ax('anger', 0.5) },
    { who: 'Toma', text: 'Know what?', fn: () => { if (t) { t.P.lookK = 0.9; t.P.hold = 0; t.P.lean = 0.05; } } },
    { who: 'Aoi', text: 'Kiyo had a letter. A notice about a cottage up here. About me. She kept it in the basket. Did you know?', fn: ax('anger', 0.7) },
    { who: 'Toma', text: 'I knew she had a letter she never opened in front of me. It was in the ferry box, and then one winter it wasn\'t. I didn\'t ask.', fn: tx('worried', 0.6) },
    { who: 'Aoi', text: 'You didn\'t ask.' },
    { who: 'Toma', text: 'She\'d have told me to mind my own boats.', fn: tx('sad', 0.5) },
    { who: 'Aoi', text: 'She knew where I came from. All my life. And she sat by that lamp every night and said nothing.', fn: ax('sad', 0.8) },
    { who: 'Toma', text: 'Aoi—', fn: tx('worried', 0.8) },
    { who: 'Aoi', text: 'Everyone who loves me lies, or leaves.', fn: ax('anger', 0.8) },
    { who: 'Toma', text: 'I\'m not—' },
    { who: 'Aoi', text: 'Go home, Toma.', fn: ax('sad', 0.9, 10) },
    { who: '', text: 'He looks at her for a long moment. Then he wipes his hands, folds his apron, and sets it on the bench.', fn: tx('sad', 0.9) },
    { who: 'Toma', text: 'All right.' },
    { who: 'Toma', text: 'The bench is oiled. The boat floats. It sits a little crooked.', fn: tx('tender', 0.7) },
    { who: '', text: 'He walks down the mill road with his pack, and doesn\'t look back, because he knows she\'d hate it if he did.' }]);
  $('letterbox')?.classList.remove('on'); if (U.shot) U.shot.on = false;
  /* he goes: down the road toward the south shore, then out of sight */
  if (t) { leaving = { t, x: t.g.position.x, z: t.g.position.z, k: 0 }; t.P.look = null; t.P.lookK = 0; t.P.hold = 0; t.P.lean = 0; }
  S.arsenal.have.toma_gone = 1; set(4); A.benchBusy = false;
  setTimeout(() => { MZ.hero?.expr?.('sad', 0.8, 10); toast('He left the bench. Of course he left the bench.'); }, 5200);
  setTimeout(() => showCardBrief({ k: 'End of Act 2', t: 'Go home, Toma', s: 'This time, he went.' }), 9000);
  busy = false;
}
let leaving = null;
HOOKS.vis.push((dt) => {
  if (!leaving) return; const L = leaving; L.k += dt;
  const tgt = { x: 2, z: 92 }; const dx = tgt.x - L.x, dz = tgt.z - L.z, d = Math.hypot(dx, dz);
  const step = Math.min(d, 1.25 * dt); L.x += dx / (d || 1) * step; L.z += dz / (d || 1) * step;
  L.t.place(L.x, MZ.walkH(L.x, L.z), L.z, Math.atan2(dx, dz)); L.t.P.walk = 1; L.t.update(dt);
  if (L.k > 14 || d < 1) { L.t.g.visible = false; L.t.P.walk = 0; leaving = null; }
});

HOOKS.sim.push(() => {
  if (busy || MZ.mode !== 'play' || MZ.talk.on || MZ.cine || MZ.journalOpen || U.on || MZ.kawa?.on) return;
  const n = st();
  if (n === 1) { const o = MZ.oda; if (o?.state === 'home' && o.root && Math.hypot(player.pos.x - o.root.position.x, player.pos.z - o.root.position.z) < 6) odaBeat(); }
  else if (n === 2) nightBeat();
  else if (n === 3) { const A = MZ.arsenal, T = A?.TOMA_AT; if (T && A.tomaCast?.() && Math.hypot(player.pos.x - T.x, player.pos.z - T.z) < 7) dockBeat(); }
});
/* the HUD's main task while a beat is waiting */
const prevTasks = HOOKS.tasksUp;
HOOKS.tasksUp = () => {
  const r = prevTasks ? prevTasks() : null; if (r) return r;
  if (U.on) return null; const n = st();
  if (n === 1 && MZ.oda?.root) return [{ main: true, text: 'Mr. Oda is waiting at the press', x: MZ.oda.root.position.x, z: MZ.oda.root.position.z }];
  if (n === 2) return [{ main: true, text: 'That night, at the cottage' }];
  if (n === 3 && MZ.arsenal?.TOMA_AT) return [{ main: true, text: 'Toma, at his bench on the dock', x: MZ.arsenal.TOMA_AT.x, z: MZ.arsenal.TOMA_AT.z }];
  return null;
};
U.act2 = (n) => { set(n); if (n === 1 && MZ.oda && MZ.oda.state !== 'home') toast('(Mr. Oda is away from the press in this valley state.)'); };
