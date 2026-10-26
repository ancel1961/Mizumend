/* ================================================================
   Mizumend · combat: the mending staff, the heron lantern, dodging,
   stillwater blight (silt-wisps, shellmoths: sick spirits that are mended, never killed) and the Old Koi.
   Nothing here is ever killed: blight breaks into clean water, spirits are mended.
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const {HOOKS,scene,camera,player,cam,S,SFX,$,clamp,lerp,damp,rr,rnd,ease,angWrap,groundH,depthAt,polyPoint,makeToon,addOutline,
  toast,showCardBrief,startCine,after,sparkle,puff,addRipple,auSwell,writeSave,stage,teleport,piles,sluice,OUTLET,SLUICE_S,fxSoft,fxGlow,INTERACTS,PARAMS}=MZ;

/* ---------- difficulty ---------- */
const DIFF_KEY='rebuild-the-valley:difficulty';
const DIFF={gentle:{dmg:0,hp:0.7,tele:1.4,win:0.2,speed:0.8,fx:0.5,label:'Gentle'},standard:{dmg:1,hp:1,tele:1,win:0.13,speed:1,fx:1,label:'Standard'},brave:{dmg:1,hp:1.4,tele:0.72,win:0.085,speed:1.25,fx:1,label:'Brave'}};
let diffName='standard';try{const v=localStorage.getItem(DIFF_KEY);if(DIFF[v])diffName=v;}catch(e){}
const D=()=>DIFF[diffName];
function setDiff(v){if(!DIFF[v])return;diffName=v;try{localStorage.setItem(DIFF_KEY,v);}catch(e){}renderDiffUI();}

/* ---------- state ---------- */
const CB={max:5,breaths:5,inv:0,hurtT:-9,engagedT:-9,regen:0,down:false,
  strike:{t:-1,chain:0,next:false,cool:0,hitDone:false},flare:{charge:-1,cool:0},rollCool:0,shiftAt:-1,lastRoll:-9,
  enemies:[],globs:[],puddles:[],waves:[],pockets:new Map(),cleared:new Set(),mend:null,tips:{},reg:[],nmCool:0,sling:{cool:0,aimAt:-1,shots:[]}};
const feel=(stop,shake)=>{const f=D().fx;MZ.hitStop=stop*f;cam.shake=Math.max(cam.shake||0,shake*f);};
const _v=new THREE.Vector3(),_w=new THREE.Vector3(),_q=new THREE.Vector3();
const hasLantern=()=>MZ.hasPiece('lantern');
const active=()=>MZ.mode==='play'&&!MZ.cine&&!MZ.journalOpen&&!MZ.talk.on&&!MZ.photo.on&&!MZ.decorOn&&!CB.down;
function tip(id,text,delay=0){if(CB.tips[id])return;CB.tips[id]=true;after(delay,()=>toast(text));}
if(!S.blight||typeof S.blight!=='object')S.blight={koi:false};

/* ---------- materials ---------- */
const GLOW_TEX=(()=>{const cv=document.createElement('canvas');cv.width=cv.height=64;const g=cv.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.4,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(cv);})();
const glowMat=(r,g,b)=>new THREE.MeshBasicMaterial({color:new THREE.Color(r,g,b)});
const MUCK=makeToon(0x2e2a24,{noHeal:true,rim:0.5,tag:'muck'}),MOSS=makeToon(0x4f5d3a,{noHeal:true,tag:'moss'}),SILT=makeToon(0x5a5246,{noHeal:true,rim:0.4,tag:'silt'});
const KNOT=glowMat(1.9,1.35,0.45),KNOT_HOT=glowMat(2.6,0.9,0.3);
const ARMOR=makeToon(0xe4d8b8,{noHeal:true,rim:0.9,tag:'armor2'}),EDGE=glowMat(1.9,1.6,1.0);   /* v12.1: a pale bone plate with a lit rim: the side you can't hit */
const DROP=new THREE.Color(0.85,0.95,1.05),MUD=new THREE.Color(0.32,0.28,0.22);

/* ---------- the staff and the lantern on the player ---------- */
const gear=(()=>{
  const wood=makeToon(0x7a5a3c,{noHeal:true}),iron=makeToon(0x3a3530,{noHeal:true});
  const hand=new THREE.Group();hand.position.set(0,-0.32,0.02);player.arms[1].add(hand);
  const st=new THREE.Group();st.rotation.x=Math.PI/2;hand.add(st);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.035,1.5,6),wood);shaft.position.y=-0.35;shaft.castShadow=true;st.add(shaft);
  const hook=new THREE.Mesh(new THREE.TorusGeometry(0.08,0.02,5,10,Math.PI*1.3),iron);hook.position.set(0,-1.12,0.04);hook.rotation.y=Math.PI/2;st.add(hook);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(0.035,0.14,6),iron);tip.position.y=-1.15;tip.rotation.x=Math.PI;st.add(tip);
  const back=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.035,1.5,6),wood);back.position.set(0.05,0.62,-0.2);back.rotation.z=0.75;player.body.add(back);
  const lan=new THREE.Group();lan.position.set(-0.24,0.42,0.06);player.body.add(lan);
  const cage=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.16,0.12),iron);lan.add(cage);
  const core=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.11,0.08),glowMat(1.2,0.8,0.35));lan.add(core);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xffc070,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));halo.scale.setScalar(0.8);lan.add(halo);
  return {hand,back,lan,core,halo};
})();

/* ---------- HUD (breaths, boss bar, mend ring, touch) ---------- */
const ui=(()=>{
  const root=document.createElement('div');root.id='cbHud';root.innerHTML=`
    <div id="cbBreaths" aria-label="Breaths" hidden></div>
    <div id="cbBoss" hidden><div id="cbBossName"></div><div id="cbPips"></div><div id="cbBossSub"></div></div>
    <div id="cbMend" hidden><div class="ring"></div><div class="target"></div><div class="lbl">Mend · press E</div><div class="dots"></div></div>
    <div id="cbHurt"></div><div id="cbFade"></div><div id="cbPop"></div>
    <div id="cbTouch" hidden><div id="cbStick"><div class="nub"></div></div>
      <button id="tStrike" type="button" aria-label="Strike">Strike</button><button id="tDodge" type="button" aria-label="Dodge">Dodge</button>
      <button id="tLantern" type="button" aria-label="Lantern">Lantern</button><button id="tMend" type="button" aria-label="Interact or mend">E</button>
      <button id="tJump" type="button" aria-label="Jump">Jump</button><button id="tSling" type="button" aria-label="Sling">Sling</button></div>`;
  document.body.appendChild(root);
  return {root,breaths:$('cbBreaths'),boss:$('cbBoss'),bossName:$('cbBossName'),pips:$('cbPips'),bossSub:$('cbBossSub'),mend:$('cbMend'),hurt:$('cbHurt'),fade:$('cbFade'),pop:$('cbPop'),touch:$('cbTouch')};
})();
const DROP_SVG='<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2 C14 9 17 12 17 16 A7 7 0 0 1 3 16 C3 12 6 9 10 2Z"/></svg>';
let lastBreathKey='';
function renderBreaths(){const show=CB.breaths<CB.max||MZ.simTime-CB.engagedT<4;ui.breaths.hidden=!show||MZ.mode!=='play';
  const k=CB.breaths+'/'+CB.max+(diffName==='gentle'?'g':'');if(k===lastBreathKey)return;lastBreathKey=k;
  ui.breaths.innerHTML=Array.from({length:CB.max},(_,i)=>`<span class="${i<CB.breaths?'on':''}">${DROP_SVG}</span>`).join('')+(diffName==='gentle'?'<em>gentle</em>':'');}
function popText(t){ui.pop.textContent=t;ui.pop.classList.remove('go');void ui.pop.offsetWidth;ui.pop.classList.add('go');}

/* ---------- player actions ---------- */
function nearestTarget(range,arc){let best=null,bd=1e9;const fx=Math.sin(player.face),fz=Math.cos(player.face);
  for(const t of targets()){const dx=t.x-player.pos.x,dz=t.z-player.pos.z,d=Math.hypot(dx,dz);if(d>range||d<1e-3)continue;const a=Math.acos(clamp((dx*fx+dz*fz)/d,-1,1));if(a>arc)continue;const sc=d+a*1.2;if(sc<bd){bd=sc;best=t;}}return best;}
function strike(){
  if(!active())return;const s=CB.strike;
  if(s.t>=0){if(s.t>0.14&&s.chain<3)s.next=true;return;}
  if(s.cool>0)return;startSwing(1);
}
function startSwing(n){const s=CB.strike;s.t=0;s.chain=n;s.next=false;s.hitDone=false;CB.engagedT=Math.max(CB.engagedT,MZ.simTime-3);
  const t=nearestTarget(4.2,1.4);if(t){player.faceT=player.face=Math.atan2(t.x-player.pos.x,t.z-player.pos.z);player.faceLock=0.28;const d=Math.hypot(t.x-player.pos.x,t.z-player.pos.z);if(d>1.6&&player.roll<=0){player.vel.x=Math.sin(player.face)*6;player.vel.z=Math.cos(player.face)*6;player.kb=0.12;}}
  SFX.rustle();tip('strike','The mending staff: click (or F) to strike, three in a row for a spin. Shift-tap to dodge.',0.2);}
const SWING=[null,{dur:0.3,hit:0.12,reach:2.1,arc:1.25,dmg:1},{dur:0.3,hit:0.12,reach:2.1,arc:1.25,dmg:1},{dur:0.46,hit:0.2,reach:2.7,arc:Math.PI,dmg:2}];
function swingStep(dt){const s=CB.strike;s.cool=Math.max(0,s.cool-dt);if(s.t<0)return;s.t+=dt;const W=SWING[s.chain];
  if(!s.hitDone&&s.t>=W.hit){s.hitDone=true;doHits(W);}
  if(s.t>=W.dur){if(s.next&&s.chain<3)startSwing(s.chain+1);else{s.t=-1;if(s.chain===3)s.cool=0.35;}}}
function doHits(W){const fx=Math.sin(player.face),fz=Math.cos(player.face);let any=false,clang=false;
  for(const t of targets()){const dx=t.x-player.pos.x,dz=t.z-player.pos.z,d=Math.hypot(dx,dz);if(d>W.reach+(t.r||0))continue;
    if(Math.abs((t.y??player.pos.y)-(player.pos.y+0.6))>2.3)continue;
    const a=d<0.3?0:Math.acos(clamp((dx*fx+dz*fz)/d,-1,1));if(a>W.arc)continue;
    const res=t.hit(W.dmg,dx/(d||1),dz/(d||1));if(res==='clang')clang=true;else if(res)any=true;}
  if(any){feel(W.dmg>1?0.09:0.06,W.dmg>1?0.55:0.38);SFX.knock(0,W.dmg>1?240:320);SFX.splash();}
  else if(clang){feel(0.05,0.3);SFX.knock(0,720);SFX.knock(0.04,980);player.vel.x=-fx*6;player.vel.z=-fz*6;player.kb=0.16;popText(hasLantern()?'Clang! Flare the lantern to flip it':'Clang! Get behind it');}
}
function dodge(){if(!active()||CB.rollCool>0||!player.grounded||CB.mend)return;
  let ix=0,iz=0;const k=MZ.keyDown;if(k('KeyW')||k('ArrowUp'))iz+=1;if(k('KeyS')||k('ArrowDown'))iz-=1;if(k('KeyD')||k('ArrowRight'))ix+=1;if(k('KeyA')||k('ArrowLeft'))ix-=1;
  let mx,mz;if(ix||iz){const fwdX=-Math.sin(cam.yaw),fwdZ=-Math.cos(cam.yaw),rtX=Math.cos(cam.yaw),rtZ=-Math.sin(cam.yaw);mx=fwdX*iz+rtX*ix;mz=fwdZ*iz+rtZ*ix;}else{mx=-Math.sin(player.face);mz=-Math.cos(player.face);}
  const l=Math.hypot(mx,mz)||1;player.rollX=mx/l;player.rollZ=mz/l;player.roll=0.36;player.faceT=Math.atan2(mx,mz);
  CB.inv=Math.max(CB.inv,0.34);CB.rollCool=0.48;CB.lastRoll=MZ.simTime;CB.strike.t=-1;SFX.jump();
  if(MZ.depthAt(player.pos.x,player.pos.z)>0.05)addRipple(player.pos.x,player.pos.z,1.0);}
function flareStart(){if(!active())return;if(!hasLantern()){tip('nolantern','You have no lantern yet. Something in the debris might do.');return;}if(CB.flare.cool>0||CB.flare.charge>=0)return;CB.flare.charge=0;}
function flareRelease(){const f=CB.flare;if(f.charge<0)return;const c=f.charge;f.charge=-1;if(c<0.22||!active())return;
  f.cool=2.4;const fx=Math.sin(player.face),fz=Math.cos(player.face);const R=7.5,arc=0.95;
  for(let i=0;i<26;i++){const a=player.face+rr(-arc,arc),r=rr(0.5,R);_v.set(player.pos.x+Math.sin(a)*r,player.pos.y+rr(0.6,1.6),player.pos.z+Math.cos(a)*r);fxGlow.emit(_v.x,_v.y,_v.z,0,rr(0.1,0.4),0,new THREE.Color(2.4,1.7,0.8),rr(0.08,0.16),rr(0.3,0.7),0,0.6,0);}
  gear.halo.material.opacity=1.0;gear.halo.scale.setScalar(5);SFX.moment();cam.shake=Math.max(cam.shake||0,0.2);
  for(const t of targets()){const dx=t.x-player.pos.x,dz=t.z-player.pos.z,d=Math.hypot(dx,dz);if(d>R+(t.r||0))continue;const a=Math.acos(clamp((dx*fx+dz*fz)/(d||1),-1,1));if(a<arc+0.2&&t.stun)t.stun();}
  tip('flare','The heron lantern: hold right-click (or R) and let go to flare. Shellmoths open their wings to the light; big things flinch.',0.4);}
function hurt(n,fromX,fromZ,kind){
  if(CB.inv>0||CB.down||MZ.mode!=='play')return false;
  const dx=player.pos.x-fromX,dz=player.pos.z-fromZ,l=Math.hypot(dx,dz)||1;
  const kbk=diffName==='gentle'?0.5:1;player.vel.x=dx/l*7.5*kbk;player.vel.z=dz/l*7.5*kbk;player.kb=0.24*kbk;player.vy=Math.max(player.vy,2.2*kbk);player.grounded=false;
  CB.inv=1.0;CB.hurtT=MZ.simTime;CB.engagedT=MZ.simTime;feel(0.09,0.7);
  ui.hurt.classList.remove('go');void ui.hurt.offsetWidth;ui.hurt.classList.add('go');SFX.knock(0,140);SFX.splash();
  const dmg=D().dmg*n;if(dmg>0){CB.breaths=Math.max(0,CB.breaths-dmg);if(CB.breaths===0)washAshore();}
  return true;}
function nearMissCheck(){if(CB.inv>0&&MZ.simTime-CB.lastRoll<0.3&&MZ.timeScale===1&&CB.nmCool<=0){CB.nmCool=1.6;MZ.timeScale=0.35;popText('Close!');sparkle(player.pos.x,player.pos.y+1,player.pos.z,8);setTimeout(()=>{MZ.timeScale=1;},380);return true;}return false;}
function washAshore(){
  CB.down=true;ui.fade.classList.add('on');SFX.splash();
  setTimeout(()=>{
    const ov=CB.safeOverride&&CB.safeOverride();const near=!ov&&!koi.active&&HOOKS.safeSpot?HOOKS.safeSpot(player.pos.x,player.pos.z):null;   /* v12.1: the orchard gate, not the far side of the pond */
    const safe=ov||(koi.active?koi.safe:near||{x:2,z:60});const look=ov?ov.look:koi.active?koi.c:near?near.look:{x:0,z:0};teleport(safe.x,safe.z,look.x,look.z);
    for(const e of CB.enemies)removeEnemy(e,false);CB.enemies.length=0;CB.pockets.clear();clearHazards();
    CB.breaths=CB.max;CB.inv=2;koi.onWash();for(const f of (CB.onWash||[]))f();
    setTimeout(()=>{ui.fade.classList.remove('on');CB.down=false;toast('You wash up on the bank, soggy but fine. Nothing is lost.');},700);
  },900);}

/* ---------- targets: enemies and knots share one interface ---------- */
function targets(){const out=[];for(const e of CB.enemies)if(!e.dead&&e.up>=1)out.push(e);if(koi.active)for(const k of koi.knots)if(k.alive&&k.on)out.push(k);for(const f of CB.reg)for(const t of f())out.push(t);return out;}

/* ---------- v13: sick spirits of the still water, healed rather than killed ----------
   silt-wisps: small river spirits clouded with silt; they dart at you. Shellmoths: lantern moths whose wings closed
   into a shield; strike from behind, or flare the lantern and the light makes them open their wings.
   When mended, the silt cracks into petals and light, and the clean spirit goes home (it does not come back). */
const PETAL=new THREE.Color(1.0,0.78,0.84),PETAL2=new THREE.Color(1.0,0.93,0.82),MOTE=new THREE.Color(2.2,2.0,1.4);
const tmat=(c,o={})=>{const m=new THREE.MeshToonMaterial({color:c,transparent:o.op!==undefined,opacity:o.op??1,side:o.side??THREE.FrontSide,depthWrite:o.op===undefined});if(o.em){m.emissive=new THREE.Color(o.em);m.emissiveIntensity=o.ei??0.4;}return m;};
function petalShape(w,h){const s=new THREE.Shape();s.moveTo(0,0);s.quadraticCurveTo(w,h*0.45,0,h);s.quadraticCurveTo(-w,h*0.45,0,0);return new THREE.ShapeGeometry(s,6);}
function makeWisp(){const g=new THREE.Group();const fl=new THREE.Group();g.add(fl);
  const skin=tmat(0x7d9488,{op:0.62,em:0x2a3a30,ei:0.5});
  const b=new THREE.Mesh(new THREE.SphereGeometry(0.3,16,12),skin);b.scale.set(0.9,1.12,0.9);b.position.y=0.45;fl.add(b);
  const k=new THREE.Mesh(new THREE.SphereGeometry(0.11,10,8),KNOT);k.position.set(0,0.47,0.02);fl.add(k);
  const smudge=new THREE.Mesh(new THREE.SphereGeometry(0.17,8,6),MUCK);smudge.position.set(0.05,0.4,-0.03);smudge.scale.set(1,0.8,1);fl.add(smudge);
  const rim=new THREE.Mesh(new THREE.SphereGeometry(0.34,12,10),new THREE.MeshBasicMaterial({color:new THREE.Color(0.6,0.95,0.7),transparent:true,opacity:0.3,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false}));rim.scale.set(0.95,1.16,0.95);rim.position.y=0.45;fl.add(rim);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xa8e0a0,transparent:true,opacity:0.45,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));halo.position.set(0,0.47,0);halo.scale.setScalar(0.9);fl.add(halo);
  const petalM=tmat(0x9a8088,{side:THREE.DoubleSide,em:0x402830,ei:0.3});const crest=[];
  for(let i=0;i<3;i++){const p=new THREE.Mesh(petalGeo,petalM);p.position.set(0,0.74,0);p.rotation.set(-0.35,i/3*6.283,0);fl.add(p);crest.push(p);}
  const fins=[];for(const sx of [-1,1]){const f=new THREE.Mesh(finGeo,skin);f.position.set(sx*0.24,0.45,0);f.rotation.set(0,0,sx*-1.3);fl.add(f);fins.push(f);}
  for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.03,6,5),glowMat(1.8,1.7,1.3));e.position.set(sx*0.09,0.52,0.26);fl.add(e);}
  const beads=[];for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.12*(1-i*0.16),8,6),skin);g.add(m);beads.push(m);}
  return {g,fl,body:b,knot:k,smudge,rim,halo,crest,fins,beads,skin,petalM,hist:[]};}
const petalGeo=petalShape(0.09,0.2),finGeo=petalShape(0.12,0.26);
const WING=tmat(0xe7dcc0,{side:THREE.DoubleSide,em:0x30281a,ei:0.25}),WINGSPOT=glowMat(1.5,0.95,0.4),WINGRING=tmat(0x2a2024,{side:THREE.DoubleSide});
const wingGeo=(()=>{const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(0.25,0.32,0.72,0.42,0.86,0.12);s.bezierCurveTo(0.95,-0.12,0.6,-0.45,0.22,-0.38);s.quadraticCurveTo(0.05,-0.2,0,0);return new THREE.ShapeGeometry(s,10);})();
function makeMoth(){const g=new THREE.Group();const fl=new THREE.Group();g.add(fl);
  const fur=tmat(0x5c4a5e,{em:0x1a1018,ei:0.3});
  const sh=new THREE.Mesh(new THREE.CapsuleGeometry(0.17,0.5,4,10),fur);sh.rotation.x=Math.PI/2;sh.position.set(0,0.42,-0.05);sh.castShadow=true;fl.add(sh);addOutline(sh,0.014);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.15,10,8),fur);head.position.set(0,0.46,0.36);fl.add(head);
  for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6),glowMat(0.25,0.2,0.3));e.position.set(sx*0.09,0.5,0.45);fl.add(e);
    const pts=[new THREE.Vector3(sx*0.05,0.58,0.45),new THREE.Vector3(sx*0.16,0.8,0.6),new THREE.Vector3(sx*0.3,0.86,0.72)];
    const ant=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),8,0.012,4,false),fur);fl.add(ant);
    for(let k=1;k<5;k++){const p=new THREE.CatmullRomCurve3(pts).getPointAt(k/5);const f=new THREE.Mesh(new THREE.SphereGeometry(0.02,4,3),fur);f.position.copy(p);f.scale.set(2.2,0.4,0.6);fl.add(f);}}
  /* the wings: closed forward into a pale shield (the side you can't hit); light makes them open */
  const wings=[];for(const sx of [-1,1]){const pv=new THREE.Group();pv.rotation.order='ZYX';pv.position.set(sx*0.08,0.5,0.55);fl.add(pv);
    const w=new THREE.Mesh(wingGeo,WING);w.scale.set(sx*0.72,0.72,1);pv.add(w);
    const rim=new THREE.Mesh(wingGeo,EDGE);rim.scale.set(sx*0.78,0.78,1);rim.position.set(-sx*0.02,-0.01,-0.012);pv.add(rim);   /* a lit rim behind the wing: the pale shield reads at a glance */
    for(const zz of [0.006,-0.006]){const ring=new THREE.Mesh(new THREE.CircleGeometry(0.1,14),WINGRING);ring.position.set(sx*0.36,0.03,zz);ring.rotation.y=zz<0?Math.PI:0;pv.add(ring);
      const spot=new THREE.Mesh(new THREE.CircleGeometry(0.055,12),WINGSPOT);spot.position.set(sx*0.36,0.03,zz*1.5);spot.rotation.y=zz<0?Math.PI:0;pv.add(spot);}
    wings.push(pv);}
  const legs=[];for(let i=0;i<6;i++){const sx=i<3?-1:1;const l=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.008,0.36,4),fur);l.position.set(sx*0.16,0.24,-0.22+(i%3)*0.2);l.rotation.z=sx*0.7;fl.add(l);legs.push(l);}
  const k=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6),KNOT);k.position.set(0,0.62,-0.22);fl.add(k);
  return {g,fl,body:sh,knot:k,wings,legs,fur,open:0};}
function spawnEnemy(type,x,z,pocket){
  if(type==='mite')type='wisp';if(type==='crab')type='moth';
  const m=type==='wisp'?makeWisp():makeMoth();m.g.position.set(x,groundH(x,z)-0.6,z);scene.add(m.g);
  const e={type,...m,x,z,y:groundH(x,z),face:Math.atan2(player.pos.x-x,player.pos.z-z),hp:Math.round((type==='wisp'?1:3)*D().hp),state:'rise',t:0,up:0,stunT:0,flip:0,pocket,dead:false,vx:0,vz:0,r:type==='wisp'?0.38:0.7,ph:rnd()*6,
    stun(){if(this.type==='moth'){this.flip=3.2;this.state='flipped';this.t=0;SFX.knock(0,420);popText('Its wings open!');}else{this.stunT=2;this.state='stun';}},
    hit(dmg,dx,dz){
      if(this.type==='moth'&&this.flip<=0){const fx=Math.sin(this.face),fz=Math.cos(this.face);if(-(dx*fx+dz*fz)>Math.cos(1.15))return 'clang';}
      this.hp-=dmg*(this.flip>0?2:1);this.vx=dx*4;this.vz=dz*4;this.kbT=0.15;this.flash=0.12;
      for(let i=0;i<5;i++)fxSoft.emit(this.x,this.y+0.5,this.z,dx*2+rr(-1,1),rr(1,2.5),dz*2+rr(-1,1),MUD,rr(0.08,0.14),rr(0.4,0.7),6,0.5);
      fxGlow.emit(this.x,this.y+0.5,this.z,dx,1,dz,MOTE,0.1,0.35,0,0.6,0);
      if(this.hp<=0)popEnemy(this);else if(this.type==='wisp'){this.state='recover';this.t=0;}
      return true;}};
  CB.enemies.push(e);return e;}
/* mended: the silt cracks into petals and light, and the clean spirit goes home */
const released=[];
function popEnemy(e){e.dead=true;const y=e.y+0.5;
  for(let i=0;i<22;i++)fxSoft.emit(e.x+rr(-.3,.3),y+rr(-.1,.3),e.z+rr(-.3,.3),rr(-1.6,1.6),rr(0.8,2.6),rr(-1.6,1.6),i%2?PETAL:PETAL2,rr(0.07,0.12),rr(1.2,2.0),1.2,0.5,0.6,0.6);
  for(let i=0;i<12;i++)fxGlow.emit(e.x+rr(-.4,.4),y+rr(0,.5),e.z+rr(-.4,.4),rr(-0.5,0.5),rr(0.6,1.6),rr(-0.5,0.5),MOTE,rr(0.06,0.11),rr(0.8,1.4),-0.2,0.6,0);
  for(let i=0;i<8;i++)fxSoft.emit(e.x,y,e.z,rr(-2,2),rr(1,2.5),rr(-2,2),MUD,rr(0.08,0.14),rr(0.4,0.7),7,0.4);
  sparkle(e.x,y,e.z,10);addRipple(e.x,e.z,0.8);SFX.get();SFX.knock(0.08,980);
  if(CB.breaths<CB.max&&rnd()<(e.type==='moth'?0.6:0.25)){CB.breaths++;popText('+1 breath');}
  if(e.pocket!=null){const left=S.spirits.left[e.pocket];if(left){const k=left.indexOf(e.type);if(k>=0)left.splice(k,1);}writeSave();}
  /* the spirit itself, clean now, stays a moment and then goes */
  const i=CB.enemies.indexOf(e);if(i>=0)CB.enemies.splice(i,1);
  if(e.knot)e.knot.visible=false;if(e.smudge)e.smudge.visible=false;
  if(e.type==='wisp'){e.skin.color.setRGB(0.75,0.95,1.0);e.skin.emissive.setRGB(0.35,0.6,0.7);e.skin.opacity=0.55;e.petalM.color.setRGB(1,0.8,0.86);e.petalM.emissive.setRGB(0.5,0.3,0.35);e.halo.material.color.setRGB(0.8,0.95,1.0);e.rim.material.color.setRGB(0.6,0.9,1.0);}
  else{e.fur.color.setRGB(0.78,0.74,0.9);e.fur.emissive.setRGB(0.25,0.2,0.35);e.open=1;}
  released.push({e,t:0,x:e.x,y:e.y,z:e.z,ang:rnd()*6.28});
  after(0.05,()=>{if(e.pocket!=null&&!CB.enemies.some(o=>o.pocket===e.pocket))pocketCleared(e.pocket);});}
function releasedStep(dt){for(let i=released.length-1;i>=0;i--){const r=released[i],e=r.e;r.t+=dt;const k=r.t;
    if(e.type==='wisp'){r.ang+=dt*2.2;const rise=k*k*0.9;e.g.position.set(r.x+Math.cos(r.ang)*0.4*k,r.y+0.2+rise,r.z+Math.sin(r.ang)*0.4*k);e.g.scale.setScalar(Math.max(0.01,1-k*0.25));
      e.skin.opacity=Math.max(0,0.55*(1-k/3));e.halo.material.opacity=0.8*(1-k/3);if(rnd()<dt*14)fxGlow.emit(e.g.position.x,e.g.position.y+0.45,e.g.position.z,0,-0.2,0,MOTE,0.06,0.6,0,0.5,0);}
    else{const up=k*k*0.7+k*0.6;e.g.position.set(r.x+Math.sin(r.ang)*k*1.2,r.y+0.3+up,r.z+Math.cos(r.ang)*k*1.2);e.g.rotation.y=r.ang+Math.PI*0.5;
      for(let j=0;j<2;j++){const w=e.wings[j];const sx=j?1:-1;w.position.z=0;w.rotation.set(-1.45,0,sx*(0.2+Math.sin(r.t*18)*0.7));}
      if(rnd()<dt*10)fxGlow.emit(e.g.position.x,e.g.position.y+0.4,e.g.position.z,0,-0.3,0,MOTE,0.07,0.7,0,0.5,0);
      e.g.scale.setScalar(Math.max(0.01,1-Math.max(0,k-2)*0.8));}
    if(r.t>3.2){scene.remove(e.g);released.splice(i,1);}}}
function pocketCleared(i){if(CB.cleared.has(i))return;   /* v13: several spirits mended in one moment each asked; say it once */
  CB.pockets.delete(i);CB.cleared.add(i);if(!S.spirits.cleared.includes(i))S.spirits.cleared.push(i);delete S.spirits.left[i];writeSave();
  const p=piles[i];if(p){sparkle(p.x,groundH(p.x,p.z)+1,p.z,16);auSwell();toast('The spirits are mended and the pile is free. Hold E to clear it.');}}
function removeEnemy(e,checkPocket){scene.remove(e.g);e.dead=true;const i=CB.enemies.indexOf(e);if(i>=0)CB.enemies.splice(i,1);}
function enemyStep(e,dt){
  const sp=D().speed,tele=D().tele;e.t+=dt;e.flash=Math.max(0,(e.flash||0)-dt);const gh=groundH(e.x,e.z);
  if(e.state==='rise'){if(!e.splashed){e.splashed=true;addRipple(e.x,e.z,1.1);SFX.splash();for(let i=0;i<10;i++)fxSoft.emit(e.x,gh+0.1,e.z,rr(-1.5,1.5),rr(2,3.5),rr(-1.5,1.5),MUD,rr(0.1,0.2),rr(0.4,0.7),7,0.4);}e.up=Math.min(1,e.t/0.7);e.y=gh-0.6*(1-e.up);if(e.up>=1){e.state='seek';e.t=0;}if(rnd()<dt*12)puff(e.x,gh+0.1,e.z,1,MUD,0.2);place(e,dt);return;}
  const dx=player.pos.x-e.x,dz=player.pos.z-e.z,d=Math.hypot(dx,dz)||1;
  if(e.kbT>0){e.kbT-=dt;e.x+=e.vx*dt;e.z+=e.vz*dt;}
  if(e.type==='wisp'){
    if(e.state==='stun'){e.stunT-=dt;if(e.stunT<=0){e.state='seek';e.t=0;}}
    else if(e.state==='seek'){const want=Math.atan2(dx,dz);e.face+=angWrap(want-e.face)*Math.min(1,dt*6);if(d>3.0)move(e,Math.sin(e.face)*2.3*sp,Math.cos(e.face)*2.3*sp,dt);
      if(d<3.4&&e.t>0.5){e.state='tell';e.t=0;e.lx=dx/d;e.lz=dz/d;}}
    else if(e.state==='tell'){move(e,-e.lx*0.6,-e.lz*0.6,dt);if(e.t>0.62*tele){e.state='lunge';e.t=0;SFX.jump();}}
    else if(e.state==='lunge'){move(e,e.lx*8*sp,e.lz*8*sp,dt);if(rnd()<dt*30)fxSoft.emit(e.x,e.y+0.45,e.z,0,0.2,0,MUD,0.1,0.35,0,0.5);
      if(Math.hypot(player.pos.x-e.x,player.pos.z-e.z)<0.75&&Math.abs(player.pos.y-e.y)<1){if(!nearMissCheck())hurt(1,e.x,e.z);}if(e.t>0.42){e.state='recover';e.t=0;}}
    else if(e.state==='recover'){if(e.t>0.9/sp){e.state='seek';e.t=0;}}
    const hot=e.state==='tell'||e.state==='lunge';const tk=e.state==='tell'?Math.min(1,e.t/(0.62*tele)):0;
    e.body.scale.set(0.9*(1+tk*0.15),1.12*(1-tk*0.12),0.9*(e.state==='lunge'?1.35:1));
    e.halo.material.opacity=hot?0.95:0.4+0.15*Math.sin(MZ.simTime*5+e.ph);e.halo.scale.setScalar(hot?1.3:0.9);e.rim.material.opacity=hot?0.6:0.3;e.rim.material.color.setRGB(hot?1.0:0.6,hot?0.62:0.95,hot?0.3:0.7);
    e.knot.material=hot?KNOT_HOT:KNOT;
    for(let j=0;j<2;j++)e.fins[j].rotation.y=Math.sin(MZ.simTime*(hot?20:7)+e.ph+j*Math.PI)*0.5;
    for(let j=0;j<3;j++)e.crest[j].rotation.x=-0.35-tk*0.5+Math.sin(MZ.simTime*3+j)*0.08;
    e.hop=0.08*Math.sin(MZ.simTime*2.6+e.ph)+(e.state==='lunge'?0.15:0);
  }else{
    const op=e.flip>0?1:0;e.open=damp(e.open,op,9,dt);
    if(e.flip>0){e.flip-=dt;for(const l of e.legs)l.rotation.x=Math.sin(e.t*20+l.position.z*9)*0.6;
      if(rnd()<dt*8)fxGlow.emit(e.x+rr(-0.4,0.4),e.y+0.6,e.z+rr(-0.4,0.4),0,0.5,0,MOTE,0.05,0.5,0,0.5,0);
      if(e.flip<=0){e.state='seek';e.t=0;SFX.knock(0,300);}wingPose(e);place(e,dt);return;}
    const want=Math.atan2(dx,dz);const turn=e.state==='tell'||e.state==='snap'?0.6:2.1*sp;e.face+=clamp(angWrap(want-e.face),-turn*dt,turn*dt);
    if(e.state==='seek'){const side=Math.sin(e.t*0.9+e.ph)>0?1:-1;const tx=Math.sin(e.face),tz=Math.cos(e.face);
      if(d>4.2)move(e,tx*1.8*sp,tz*1.8*sp,dt);else move(e,-tz*side*1.4*sp,tx*side*1.4*sp,dt);
      if(d<2.6&&Math.abs(angWrap(want-e.face))<0.6&&e.t>1.0){e.state='tell';e.t=0;}}
    else if(e.state==='tell'){if(e.t>0.82*tele){e.state='snap';e.t=0;SFX.knock(0,520);
      if(d<2.0&&Math.abs(angWrap(want-e.face))<0.9){if(!nearMissCheck())hurt(1,e.x,e.z);}}}
    else if(e.state==='snap'){if(e.t>0.25){e.state='recover';e.t=0;}}
    else if(e.state==='recover'){if(e.t>0.8/sp){e.state='seek';e.t=0;}}
    e.raise=e.state==='tell'?Math.min(1,e.t/0.3):e.state==='snap'?1-e.t/0.25:0;
    for(const l of e.legs)l.rotation.x=e.state==='seek'?Math.sin(e.t*14+l.position.z*9)*0.35:0;
    e.knot.material=e.state==='tell'?KNOT_HOT:KNOT;e.hop=0.06*Math.sin(MZ.simTime*3+e.ph);wingPose(e);
  }
  place(e,dt);
}
/* closed: the wings meet in front of the face as a shield; open: spread wide, the knot on the back exposed */
function wingPose(e){const o=e.open,r=e.raise||0;for(let j=0;j<2;j++){const sx=j?1:-1;const w=e.wings[j];
  w.position.z=lerp(0.55,0.0,o);w.position.y=0.5+r*0.12;
  w.rotation.set(lerp(-0.12-r*0.4,-1.45,o),lerp(sx*0.12,0,o),o*sx*(0.15+Math.sin(MZ.simTime*16+j)*0.3)+(1-o)*Math.sin(MZ.simTime*5+e.ph)*0.03);}}
function move(e,vx,vz,dt){const nx=e.x+vx*dt,nz=e.z+vz*dt;if(MZ.depthAt(nx,nz)<0.7){e.x=nx;e.z=nz;}}
function place(e,dt){e.y=groundH(e.x,e.z)-(e.up<1?0.6*(1-e.up):0);e.g.position.set(e.x,e.y,e.z);e.fl.position.y=e.hop||0;e.g.rotation.y=e.face;e.g.visible=true;
  e.g.scale.setScalar(e.flash>0?1.12:1);
  if(e.beads){e.hist.unshift(e.x,e.y+0.45+(e.hop||0),e.z);if(e.hist.length>60)e.hist.length=60;
    for(let i=0;i<e.beads.length;i++){const j=Math.min(e.hist.length/3-1,(i+1)*2)|0;const b=e.beads[i];b.position.set(e.hist[j*3]-e.x,e.hist[j*3+1]-e.y-0.06*i,e.hist[j*3+2]-e.z);b.position.applyAxisAngle(_q.set(0,1,0),-e.face);}}}

/* ---------- blight pockets on the debris piles ---------- */
function pocketFor(i){const c=piles.filter(p=>p.cleared).length;return c===0?{m:3,c:0}:c===1?{m:4,c:0}:c<4?{m:3,c:1}:{m:2,c:2};}
if(!S.spirits||typeof S.spirits!=='object')S.spirits={cleared:[],left:{}};
const pocketDone=i=>CB.cleared.has(i)||(S.spirits&&S.spirits.cleared.includes(i));
function pocketStep(){if(stage()>=1)return;
  piles.forEach((p,i)=>{if(p.cleared||pocketDone(i)||CB.pockets.has(i))return;if(Math.hypot(player.pos.x-p.x,player.pos.z-p.z)>13)return;
    /* v13: each pile's spirits are set once and saved; mended ones never come back */
    let left=S.spirits.left[i];if(!Array.isArray(left)){const f=pocketFor(i);left=S.spirits.left[i]=[...Array(f.m).fill('wisp'),...Array(f.c).fill('moth')];writeSave();}
    if(!left.length){pocketCleared(i);return;}
    CB.pockets.set(i,true);CB.engagedT=MZ.simTime;
    left.forEach((type,k)=>{const a=rnd()*6.28,r=rr(2.6,4.8);let x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;if(MZ.depthAt(x,z)>0.6){x=p.x+Math.cos(a)*1.8;z=p.z+Math.sin(a)*1.8;}
      after(k*0.35,()=>spawnEnemy(type,x,z,i));});
    SFX.knock(0,110);SFX.knock(0.2,90);popText('Sick spirits!');
    if(!CB.tips.first){CB.tips.first=true;after(0.6,()=>toast("Silt-wisps: river spirits gone sick in the still water. Grab the old boathook from the debris, it mends now. Click or F to strike."));after(6.5,()=>toast('Mended spirits go home and stay mended. Too much? Gentle mode is in the journal, under Valley & settings.'));}});}
HOOKS.pileBlocked=(p)=>{const i=piles.indexOf(p);if(CB.pockets.has(i)||(!pocketDone(i)&&stage()<1))return {ok:false,text:'Sick spirits cling to this pile · mend them first (click or F to strike)'};return null;};

/* ---------- hazards: spit globs, muck puddles, shock rings ---------- */
const ringGeo=new THREE.RingGeometry(0.85,1.1,28).rotateX(-Math.PI/2);
function spit(fromX,fromY,fromZ,toX,toZ,dur){const m=new THREE.Mesh(new THREE.SphereGeometry(0.26,8,6),MUCK);m.position.set(fromX,fromY,fromZ);scene.add(m);
  const ring=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0x7a2a14,transparent:true,opacity:0.0,depthWrite:false}));ring.position.set(toX,groundH(toX,toZ)+0.08,toZ);ring.renderOrder=4;scene.add(ring);
  CB.globs.push({m,ring,fx:fromX,fy:fromY,fz:fromZ,tx:toX,tz:toZ,t:0,dur});}
function hazardStep(dt){
  for(let i=CB.globs.length-1;i>=0;i--){const g=CB.globs[i];g.t+=dt;const k=Math.min(1,g.t/g.dur);const ty=groundH(g.tx,g.tz)+0.2;
    g.m.position.set(lerp(g.fx,g.tx,k),lerp(g.fy,ty,k)+Math.sin(k*Math.PI)*3.2,lerp(g.fz,g.tz,k));g.ring.material.opacity=0.25+0.55*k;g.ring.scale.setScalar(1.2-0.2*k);
    if(k>=1){scene.remove(g.m);scene.remove(g.ring);CB.globs.splice(i,1);puff(g.tx,ty,g.tz,14,MUD,0.4);addRipple(g.tx,g.tz,1.0);SFX.splash();
      if(Math.hypot(player.pos.x-g.tx,player.pos.z-g.tz)<1.2&&player.pos.y-groundH(player.pos.x,player.pos.z)<1.2){if(!nearMissCheck())hurt(1,g.tx,g.tz);}
      const pm=new THREE.Mesh(new THREE.CircleGeometry(1.2,18).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x3a2e22,transparent:true,opacity:0.75,depthWrite:false}));pm.position.set(g.tx,groundH(g.tx,g.tz)+0.07,g.tz);pm.renderOrder=3;scene.add(pm);
      CB.puddles.push({m:pm,x:g.tx,z:g.tz,t:0});if(koi.phase>=2&&rnd()<0.3)spawnEnemy('mite',g.tx,g.tz,null);}}
  player.slow=1;for(let i=CB.puddles.length-1;i>=0;i--){const p=CB.puddles[i];p.t+=dt;p.m.material.opacity=0.75*Math.min(1,(6-p.t)/1.5);
    if(Math.hypot(player.pos.x-p.x,player.pos.z-p.z)<1.2)player.slow=0.55;if(p.t>6){scene.remove(p.m);CB.puddles.splice(i,1);}}
  for(let i=CB.waves.length-1;i>=0;i--){const w=CB.waves[i];w.t+=dt;const R=w.t*w.sp;w.m.scale.set(R,1,R);w.m.material.opacity=0.8*(1-R/w.max);
    const d=Math.hypot(player.pos.x-w.x,player.pos.z-w.z);const air=player.pos.y-groundH(player.pos.x,player.pos.z)>0.35;
    if(!w.hit&&Math.abs(d-R)<0.55){w.hit=true;if(air){popText('Over it!');}else if(!nearMissCheck())hurt(1,w.x,w.z);}
    if(R>=w.max){scene.remove(w.m);CB.waves.splice(i,1);}}}
function shockwave(x,z,max=9,sp=6.5){const m=new THREE.Mesh(new THREE.TorusGeometry(1,0.09,6,48).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:new THREE.Color(1.4,1.1,0.6),transparent:true,opacity:0.8,depthWrite:false}));
  m.position.set(x,Math.max(MZ.levelCur,groundH(x,z))+0.2,z);m.scale.set(0.1,1,0.1);scene.add(m);CB.waves.push({m,x,z,t:0,sp,max,hit:false});SFX.knock(0,80);}
function clearHazards(){for(const g of CB.globs){scene.remove(g.m);scene.remove(g.ring);}for(const p of CB.puddles)scene.remove(p.m);for(const w of CB.waves)scene.remove(w.m);CB.globs.length=CB.puddles.length=CB.waves.length=0;}

/* ---------- the Old Koi ---------- */
const koi=(()=>{
  const s0=SLUICE_S-5.2,c=polyPoint(OUTLET,s0);const yaw=Math.atan2(c.tx,c.tz);
  const g=new THREE.Group();g.rotation.order='YXZ';g.rotation.y=yaw;scene.add(g);
  const body=new THREE.Group();g.add(body);
  /* v12.1: a real koi under the silt. Tapered body (lathe), dorsal, pectoral and pelvic fins, a forked tail, eyes and
     barbels; the gold-and-white pattern shows dull through the muck, and comes up bright when he is mended. */
  const crust=makeToon(0x3b3a2e,{noHeal:true,rim:0.35,tag:'koiCrust'}),skin=makeToon(0xf2ece0,{noHeal:true,rim:0.45,tag:'koiSkin'}),patch=makeToon(0xe2602a,{noHeal:true,rim:0.4,tag:'koiPatch'});
  const skinDull=makeToon(0x8f8a7a,{noHeal:true,rim:0.35,tag:'koiSkinDull'}),patchDull=makeToon(0x8a5a32,{noHeal:true,rim:0.35,tag:'koiPatchDull'});
  const finMat=makeToon(0xe8dccb,{noHeal:true,rim:0.5,side:THREE.DoubleSide,tag:'koiFin'}),finDull=makeToon(0x6d6a5c,{noHeal:true,rim:0.35,side:THREE.DoubleSide,tag:'koiFinDull'});
  const PROF=[[-4.0,0.30],[-3.4,0.42],[-2.6,0.62],[-1.8,0.84],[-1.0,1.0],[-0.2,1.12],[0.6,1.18],[1.4,1.13],[2.2,0.98],[2.9,0.76],[3.4,0.52],[3.65,0.30],[3.78,0.0]];
  const R=(z)=>{if(z<=PROF[0][0])return PROF[0][1];for(let i=0;i<PROF.length-1;i++){const [z0,r0]=PROF[i],[z1,r1]=PROF[i+1];if(z<=z1)return lerp(r0,r1,(z-z0)/(z1-z0));}return 0;};
  const SX=0.95,SY=0.86;
  const lathe=new THREE.LatheGeometry(PROF.map(([z,r])=>new THREE.Vector2(r,z)),28);lathe.rotateX(Math.PI/2);lathe.computeVertexNormals();
  const torso=new THREE.Mesh(lathe,skinDull);torso.scale.set(SX,SY,1);torso.castShadow=true;body.add(torso);addOutline(torso,0.03);
  const segs=[torso];
  const onSkin=(z,ang,lift=0)=>{const r=R(z)+lift;return new THREE.Vector3(Math.sin(ang)*r*SX,Math.cos(ang)*r*SY,z);};
  /* the koi's pattern: kohaku patches of gold-orange across the back */
  const patches=[];for(const [z,a,sx,sz] of [[2.6,0.0,0.55,0.8],[1.5,-0.55,0.6,0.7],[0.9,0.7,0.5,0.9],[0.0,-0.2,0.7,0.8],[-1.0,0.5,0.55,0.7],[-1.9,-0.4,0.45,0.6],[3.2,0.35,0.3,0.35]]){
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),patchDull);m.position.copy(onSkin(z,a,-0.06));m.scale.set(sx,0.16,sz);m.lookAt(m.position.clone().add(new THREE.Vector3(Math.sin(a),Math.cos(a),0)));m.rotateX(Math.PI/2);body.add(m);patches.push(m);}
  /* silt and moss draped over him: flat plates, so the fish shape still reads */
  const lumps=[];{const gA=[],gB=[];const sr=(a,b)=>rr(a,b);
    for(let i=0;i<16;i++){const z=sr(-3.0,3.0),a=sr(-1.9,1.9);const p=onSkin(z,a,0.02);const geo=new THREE.SphereGeometry(sr(0.32,0.6),7,5);geo.scale(1,0.22,sr(0.8,1.4));
      const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.sin(a)*SY,Math.cos(a)*SX,0).normalize());geo.applyQuaternion(q);geo.translate(p.x,p.y,p.z);(i%3?gA:gB).push(geo);lumps.push({position:p});}
    for(const [arr,mat] of [[gA,crust],[gB,MOSS]]){const m=new THREE.Mesh(mergeGeometries(arr),mat);m.castShadow=true;body.add(m);lumps.push({mesh:m,position:new THREE.Vector3()});}}
  /* fins: thin painted shapes */
  const fin=(pts,mat)=>{const sh=new THREE.Shape();sh.moveTo(pts[0][0],pts[0][1]);for(const p of pts.slice(1))sh.lineTo(p[0],p[1]);return new THREE.Mesh(new THREE.ShapeGeometry(sh),mat);};
  const fins=[];
  const dorsal=fin([[0,0],[0.5,0.62],[1.5,0.72],[2.6,0.42],[3.0,0]],finDull);dorsal.rotation.y=Math.PI/2;dorsal.position.set(0,R(0.4)*SY-0.06,1.4);body.add(dorsal);fins.push(dorsal);
  const pecs=[];for(const sx of [-1,1]){const p=fin([[0,0],[0.25,0.95],[0.7,1.05],[0.95,0.6],[0.6,0.1]],finDull);const pv=new THREE.Group();pv.position.set(sx*R(2.3)*SX*0.86,-R(2.3)*SY*0.45,2.3);pv.rotation.set(0.25,sx*-0.9,sx*-1.25);pv.add(p);p.rotation.z=-Math.PI/2;body.add(pv);pecs.push(pv);fins.push(p);}
  for(const sx of [-1,1]){const p=fin([[0,0],[0.15,0.55],[0.45,0.6],[0.5,0.1]],finDull);p.position.set(sx*R(-0.6)*SX*0.6,-R(-0.6)*SY*0.8,-0.6);p.rotation.set(0.4,sx*-1.0,sx*-1.6);body.add(p);fins.push(p);}
  const tail=new THREE.Group();tail.position.set(0,0,-3.95);body.add(tail);
  {const t=fin([[0,0],[-0.9,1.35],[-1.7,1.55],[-1.25,0.55],[-1.05,0],[-1.25,-0.55],[-1.7,-1.55],[-0.9,-1.35]],finDull);t.rotation.y=Math.PI/2;tail.add(t);fins.push(t);
   const cap=new THREE.Mesh(new THREE.SphereGeometry(0.31,10,8),skinDull);cap.scale.set(SX,SY,0.8);tail.add(cap);segs.push(cap);}
  const head=new THREE.Group();head.position.set(0,0.05,3.55);body.add(head);
  const eyes=[];for(const sx of [-1,1]){const ew=new THREE.Mesh(new THREE.SphereGeometry(0.15,12,10),makeToon(0xe9e2cc,{noHeal:true,rim:0.6,tag:'koiEyeW'}));ew.position.set(sx*0.43,0.22,-0.15);head.add(ew);
    const iris=new THREE.Mesh(new THREE.SphereGeometry(0.1,10,8),glowMat(1.3,1.0,0.45));iris.position.set(sx*0.06,0.0,0.06);ew.add(iris);const pu=new THREE.Mesh(new THREE.SphereGeometry(0.055,8,6),glowMat(0.05,0.04,0.03));pu.position.set(sx*0.045,0,0.065);iris.add(pu);eyes.push(iris);
    /* two pairs of barbels from the upper lip */
    for(const [len,dz,dy] of [[0.9,0.12,-0.05],[0.55,0.02,-0.12]]){const pts=[];for(let k=0;k<=8;k++){const t2=k/8;pts.push(new THREE.Vector3(sx*(0.14+t2*0.22),dy-t2*t2*0.5,0.22+dz+t2*len*0.7));}
      const w=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),10,0.022,4,false),skinDull);head.add(w);segs.push(w);}}
  const mouth=new THREE.Mesh(new THREE.TorusGeometry(0.13,0.045,6,14),crust);mouth.position.set(0,-0.08,0.24);head.add(mouth);
  const knots=[];
  const mk=(lx,ly,lz,phase)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(0.26,10,8),KNOT);m.position.set(lx,ly,lz);body.add(m);
    const sp=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.07,5,10),MUCK);sp.rotation.x=Math.PI/2;m.add(sp);
    const k={m,lx,ly,lz,phase,hp:0,max:0,alive:true,on:false,x:0,y:0,z:0,r:0.5,flash:0,
      hit(dmg){if(!this.on)return false;this.hp-=dmg;this.flash=0.15;koi.onKnotHit(this);return true;}};knots.push(k);return k;};
  mk(1.12,0.15,1.2,1);mk(-1.12,0.15,0.2,1);mk(0,1.05,1.9,2);mk(0,1.0,-0.7,2);mk(0,0.55,0.85,3);
  knots[4].m.parent.remove(knots[4].m);head.add(knots[4].m);knots[4].m.position.set(0,0.55,0.25);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xffb060,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));glow.scale.setScalar(6);head.add(glow);
  /* the old gate wheel on the bank */
  const nx=-c.tz,nz=c.tx;const wp=polyPoint(OUTLET,SLUICE_S-0.6);const side=(sluice.south.x-sluice.x)*nx+(sluice.south.z-sluice.z)*nz>0?1:-1;
  const wx=wp.x+nx*side*3.2,wz=wp.z+nz*side*3.2;
  const wheel=new THREE.Group();wheel.position.set(wx,groundH(wx,wz),wz);scene.add(wheel);
  const wm=makeToon(0x5b4130,{noHeal:true});const post=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.15,1.2,6),wm);post.position.y=0.6;wheel.add(post);
  const wr=new THREE.Group();wr.position.y=1.25;wr.rotation.x=Math.PI/2;wheel.add(wr);
  wr.add(new THREE.Mesh(new THREE.TorusGeometry(0.55,0.06,6,18),wm));for(let i=0;i<4;i++){const sp=new THREE.Mesh(new THREE.BoxGeometry(0.06,1.1,0.06),wm);sp.rotation.z=i*Math.PI/4;wr.add(sp);}
  const wglow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xffd080,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));wglow.position.y=1.3;wglow.scale.setScalar(2.4);wheel.add(wglow);
  const sx=c.x+nx*side*9,sz=c.z+nz*side*9;
  return {g,body,segs,patches,lumps,tail,head,knots,glow,crust,skin,patch,skinDull,patchDull,finMat,finDull,fins,pecs,eyes,c:{x:c.x,z:c.z},tx:c.tx,tz:c.tz,nx,nz,yaw,wheel,wr,wglow,wx,wz,safe:{x:sx,z:sz},
    active:false,state:'asleep',phase:0,t:0,atk:null,atkT:0,next:2,stunT:0,resist:0,turns:0,gateOpen:false,window:0,slide:0,roll:0,rollT:0,mended:false,swim:0,drumT:0,lostT:0,
    onKnotHit(k){SFX.knock(0,260);if(k.hp<=0){k.alive=false;k.on=false;k.m.visible=false;MZ.hitStop=0.14;cam.shake=Math.max(cam.shake||0,0.9);
        _v.copy(k.m.position);k.m.parent.localToWorld(_v);puff(_v.x,_v.y,_v.z,22,MUD,0.5);sparkle(_v.x,_v.y,_v.z,16);for(let i=0;i<20;i++)fxSoft.emit(_v.x,_v.y,_v.z,rr(-3,3),rr(2,5),rr(-3,3),DROP,rr(0.1,0.2),rr(0.6,1.1),8,0.4);
        SFX.knock(0.05,140);SFX.knock(0.12,100);koi.checkPhase();}},
    onWash(){this.atk=null;this.next=2.5;this.stunT=0;if(this.phase===3&&!this.gateOpen)this.turns=Math.max(0,this.turns-1);}};
})();
function koiWorld(lx,ly,lz,out){out.set(lx,ly,lz);koi.body.localToWorld(out);return out;}
const dawnKoi=()=>stage()>=2&&!S.blight.koiRe&&MZ.hours>=4.6&&MZ.hours<=8;
function koiReset(){const k=koi;k.g.position.set(k.c.x,MZ.levelCur-0.15,k.c.z);k.g.visible=(!S.blight.koi&&stage()<2)||dawnKoi();
  for(const s of k.segs)s.material=k.skinDull;for(const p of k.patches)p.material=k.patchDull;for(const f of k.fins)f.material=k.finDull;for(const l of k.lumps)if(l.mesh)l.mesh.visible=true;k.mended=false;k.gateOpen=false;k.slide=0;k.turns=0;k.active=false;k.state='asleep';k.phase=0;
  for(const n of k.knots){n.alive=true;n.on=false;n.m.visible=true;}}
koiReset();
HOOKS.sluiceBlocked=()=>{if(S.blight.koi||stage()!==1)return null;return {ok:false,text:koi.state==='asleep'?'Something huge is wedged in the old gate…':'The Old Koi is jammed in the gate'};};
function koiStart(){
  const k=koi;k.active=true;k.state='intro';k.t=0;k.phase=1;const hp=Math.round(5*D().hp);
  for(const n of k.knots){n.max=n.hp=n.phase===3?Math.round(3*D().hp):hp;n.alive=true;n.on=n.phase===1;n.m.visible=true;}
  startCine(k.rematch?{k:'Mill Pond · at dawn',t:'The Old Koi',s:'The still water crept back into the outlet overnight. So did he. One more time, then.'}:{k:'Mill Pond',t:'The Old Koi',s:'Something has grown over him in the still water. Break the knots. Open the gate.'},new THREE.Vector3(k.c.x,0,k.c.z),{pivot:new THREE.Vector3(k.c.x,0,k.c.z),radius:13,height:4.5,lookY:MZ.levelCur-3,dir:new THREE.Vector3(player.pos.x-k.c.x,0,player.pos.z-k.c.z)});
  SFX.knock(0.5,70);SFX.knock(1.1,60);auSwell();cam.shake=0.6;k.next=1.2;ui.boss.hidden=false;renderBoss();}
function renderBoss(){const k=koi;ui.bossName.textContent='The Old Koi';ui.pips.innerHTML=k.knots.map(n=>`<span class="${n.alive?(n.on?'on':''):'gone'}"></span>`).join('');
  ui.bossSub.textContent=k.phase===1?'Break the knots on his flanks':k.phase===2?'Flare or dodge his slam, then strike the knots on his back':k.phase===3?(k.gateOpen?'Strike the knot on his head!':`Turn the old gate wheel (${k.turns}/3)`):'';}
koi.checkPhase=function(){const k=koi;
  if(k.phase===1&&k.knots.filter(n=>n.phase===1).every(n=>!n.alive)){k.phase=2;k.atk=null;k.next=2.2;cam.shake=1;auSwell();SFX.knock(0,60);SFX.knock(0.3,70);toast('The Old Koi heaves against the gate! The knots on his back are showing.');for(const n of k.knots)if(n.phase===2)n.on=false;shockwave(k.c.x,k.c.z,10,7);}
  else if(k.phase===2&&k.knots.filter(n=>n.phase===2).every(n=>!n.alive)){k.phase=3;k.atk=null;k.next=2.5;k.turns=0;auSwell();
    if(k.rematch||stage()>=2){k.gateOpen=true;k.window=7;k.next=7.5;toast('The new gate holds. He lunges for it, and his head knot is showing. Strike!');}else toast('He is jammed fast. Turn the old gate wheel on the bank!');}
  else if(k.phase===3&&!k.knots[4].alive){k.state='bare';k.atk=null;k.window=0;mendStart();}
  renderBoss();};
function koiAttack(){const k=koi;const lp=_q.set(player.pos.x,player.pos.y,player.pos.z);k.body.worldToLocal(lp);
  const tele=D().tele;if(k.phase===3&&!k.gateOpen&&rnd()<0.55){k.atk={kind:'spit',t:0,tell:0.75*tele,aimWheel:true};return;}
  if(lp.z<-2&&Math.abs(lp.x)<4.5){k.atk={kind:'tail',t:0,tell:0.85*tele,side:Math.sign(lp.x)||1};return;}
  const d=Math.hypot(lp.x,Math.max(0,Math.abs(lp.z)-3.5));
  if(k.phase>=2&&rnd()<0.3){k.atk={kind:'whirl',t:0,tell:1.0*tele};return;}
  if(d<4.2&&Math.abs(lp.x)>0.4){k.atk={kind:'slam',t:0,tell:1.0*tele,side:Math.sign(lp.x)};return;}
  k.atk={kind:'spit',t:0,tell:0.7*tele};}
function koiStep(dt){
  const k=koi;if(!k.active&&k.state==='asleep')k.g.visible=(!S.blight.koi&&stage()<2)||dawnKoi();if(!k.g.visible&&!k.mended)return;
  const lv=MZ.levelCur;k.g.position.y=damp(k.g.position.y,lv-0.15+(k.state==='bare'?0.25:0),3,dt);
  const pd=Math.hypot(player.pos.x-k.c.x,player.pos.z-k.c.z);
  for(let i=0;i<k.pecs.length;i++)k.pecs[i].rotation.x=0.25+Math.sin(MZ.simTime*(k.state==='swim'?5:1.6)+i*1.3)*0.18;
  if(k.state==='asleep'){k.body.rotation.z=Math.sin(MZ.simTime*0.4)*0.03;k.tail.rotation.y=Math.sin(MZ.simTime*0.5)*0.1;
    if(stage()===1&&!S.blight.koi&&pd<15&&MZ.mode==='play'&&!MZ.cine)koiStart();
    else if(dawnKoi()&&k.g.visible&&pd<14&&MZ.mode==='play'&&!MZ.cine){k.rematch=true;koiStart();}
    else if(stage()===0&&pd<12&&!CB.tips.koi0){CB.tips.koi0=true;toast('Something big is sleeping in the outlet channel. Clear the pond debris first.');}
    return;}
  if(k.state==='swim'){k.swim+=dt;const s=SLUICE_S-5.2-k.swim*3.2;const p=polyPoint(OUTLET,Math.max(0,s));k.g.position.x=p.x;k.g.position.z=p.z;k.g.rotation.y=Math.atan2(-p.tx,-p.tz);
    k.tail.rotation.y=Math.sin(MZ.simTime*6)*0.45;if(rnd()<dt*6)addRipple(p.x,p.z,1.2);k.glow.material.opacity=0.5;
    if(s<0||k.swim>9){k.g.visible=false;k.mended=false;}return;}
  if(!k.active){if(k.state==='asleep'||k.state==='mended')k.g.visible=(!S.blight.koi&&stage()<2)||dawnKoi()||k.state==='mended';return;}
  if(k.state==='intro'){if(!MZ.cine){k.state='fight';k.t=0;}return;}
  CB.engagedT=MZ.simTime;
  if(pd>34){k.lostT+=dt;if(k.lostT>4){k.active=false;k.state='asleep';ui.boss.hidden=true;for(const n of k.knots)n.on=false;toast('The Old Koi settles back into the mud. He will wait.');return;}}else k.lostT=0;
  const sp=D().speed;k.t+=dt;
  for(const n of k.knots){n.flash=Math.max(0,n.flash-dt);koiWorld(n.m.position.x,n.m.position.y,n.m.position.z,_w);if(n.m.parent===k.head){_w.copy(n.m.position);k.head.localToWorld(_w);}n.x=_w.x;n.y=_w.y;n.z=_w.z;
    n.m.material=n.flash>0||(k.atk&&k.atk.t<k.atk.tell)?KNOT_HOT:KNOT;n.m.scale.setScalar(n.on?1+0.15*Math.sin(MZ.simTime*6):0.7);}
  /* body pose */
  k.rollT=Math.max(0,k.rollT-dt);
  if(k.stunT>0){k.stunT-=dt;k.roll=damp(k.roll,1.15*(k.stunSide||1),6,dt);if(k.phase===2)for(const n of k.knots)if(n.phase===2&&n.alive)n.on=true;
    if(k.stunT<=0){for(const n of k.knots)if(n.phase===2)n.on=false;k.next=1.0;}}
  else k.roll=damp(k.roll,0,4,dt);
  k.body.rotation.z=k.roll+Math.sin(MZ.simTime*1.3)*0.04;k.resist=Math.max(0,k.resist-dt);
  k.glow.material.opacity=k.atk&&k.atk.t<k.atk.tell?0.25+0.25*Math.sin(MZ.simTime*20):0.08;
  /* phase 3: the gate */
  k.wglow.material.opacity=k.phase===3&&!k.gateOpen?0.45+0.25*Math.sin(MZ.simTime*4):0;
  if(k.gateOpen&&k.state==='fight'){k.window-=dt;k.slide=damp(k.slide,1,2,dt);k.g.position.x=k.c.x+k.tx*k.slide*1.6;k.g.position.z=k.c.z+k.tz*k.slide*1.6;
    k.head.rotation.x=damp(k.head.rotation.x,0.35,3,dt);k.knots[4].on=k.window>0;
    if(rnd()<dt*30){const gp=polyPoint(OUTLET,SLUICE_S);fxSoft.emit(gp.x+rr(-1.5,1.5),lv+rr(0,1),gp.z+rr(-1.5,1.5),rr(-1,1),rr(1,3),rr(-1,1),DROP,rr(0.2,0.4),rr(0.6,1.2),3,0.6,0.2,0.4);}
    if(k.window<=0&&!k.atk){k.window=0;k.next=Math.min(k.next,0.6);}}
  /* attacks */
  if(k.state!=='fight'){k.drumT=0;return;}
  k.drumT-=dt;if(k.drumT<=0){k.drumT=0.52/sp;SFX.knock(0,k.phase===3?78:66);}
  if(!k.atk&&k.stunT<=0){k.next-=dt*sp;if(k.next<=0)koiAttack();}
  const a=k.atk;if(!a)return;a.t+=dt;const lp=_q.set(player.pos.x,player.pos.y,player.pos.z);k.body.worldToLocal(lp);const pl=player.pos;
  if(a.kind==='tail'){k.tail.rotation.y=a.t<a.tell?-a.side*0.9*Math.min(1,a.t/0.3):lerp(-a.side*0.9,a.side*1.2,Math.min(1,(a.t-a.tell)/0.25));
    if(!a.done&&a.t>=a.tell+0.12){a.done=true;koiWorld(0,0,-4.6,_w);const d=Math.hypot(pl.x-_w.x,pl.z-_w.z);SFX.splash();addRipple(_w.x,_w.z,2.4);cam.shake=Math.max(cam.shake||0,0.3);
      if(d<4.4&&Math.sign(lp.x)===a.side){if(!nearMissCheck())hurt(1,_w.x,_w.z);}}
    if(a.t>a.tell+0.6){k.atk=null;k.next=rr(1.3,2.1);k.tail.rotation.y=0;}}
  else if(a.kind==='slam'){if(a.t<a.tell)k.roll=lerp(0,-a.side*0.55,Math.min(1,a.t/a.tell));
    else{k.roll=lerp(-a.side*0.55,a.side*0.9,Math.min(1,(a.t-a.tell)/0.18));
      if(!a.done&&a.t>=a.tell+0.16){a.done=true;cam.shake=Math.max(cam.shake||0,0.85);SFX.knock(0,70);SFX.splash();
        for(let i=0;i<5;i++){koiWorld(a.side*1.8,0,2.6-i*1.5,_w);puff(_w.x,lv+0.2,_w.z,8,MUD,0.5);addRipple(_w.x,_w.z,1.4);}
        if(Math.sign(lp.x)===a.side&&Math.abs(lp.x)>0.4&&Math.abs(lp.x)<3.8&&lp.z>-3.8&&lp.z<4.0){if(!nearMissCheck())hurt(1,k.g.position.x,k.g.position.z);}
        if(k.phase>=2){k.stunT=1.9;k.stunSide=a.side;}
        if(k.phase>=2&&rnd()<0.5){koiWorld(a.side*3.2,0,0,_w);spawnEnemy('mite',_w.x,_w.z,null);}}}
    if(a.t>a.tell+0.6){k.atk=null;k.next=rr(1.2,2.0);}}
  else if(a.kind==='spit'){k.head.rotation.x=a.t<a.tell?-0.35*Math.min(1,a.t/0.3):0;
    if(!a.done&&a.t>=a.tell){a.done=true;koiWorld(0,0.4,4.1,_w);const n=k.phase===1?3:5;const ax=a.aimWheel?k.wx:pl.x,az=a.aimWheel?k.wz:pl.z;
      for(let i=0;i<n;i++){const off=i===0?0:2.2;const ang=i*2.4;spit(_w.x,_w.y,_w.z,ax+Math.cos(ang)*off*rnd(),az+Math.sin(ang)*off*rnd(),0.95+i*0.12);}SFX.splash();}
    if(a.t>a.tell+0.5){k.atk=null;k.next=rr(1.4,2.2);}}
  else if(a.kind==='whirl'){k.body.rotation.y=a.t<a.tell?Math.sin(a.t*30)*0.06:0;if(a.t<a.tell&&rnd()<dt*20){koiWorld(rr(-1,1),0,rr(-3,3),_w);fxSoft.emit(_w.x,lv+0.1,_w.z,rr(-1,1),rr(0.5,1.5),rr(-1,1),DROP,0.2,0.6,4,0.6);}
    if(!a.done&&a.t>=a.tell){a.done=true;shockwave(k.g.position.x,k.g.position.z,10,6.5);tip('jump','Jump (Space) over the shock rings, or dodge through them.');}
    if(a.t>a.tell+1.2){k.atk=null;k.next=rr(1.2,1.8);}}
}
const KOI_PUSH_Z=[3.0,2.2,1.4,0.6,-0.2,-1.0,-1.8,-2.6,-3.4];
function koiPush(){const k=koi;if(!k.g.visible||k.state==='swim')return;for(let i=0;i<KOI_PUSH_Z.length;i++){koiWorld(0,0,KOI_PUSH_Z[i],_w);const r=1.0+0.25*(i<6?1:0);
  const dx=player.pos.x-_w.x,dz=player.pos.z-_w.z,d=Math.hypot(dx,dz);if(d<r+0.45&&d>1e-3){const push=(r+0.45-d);player.pos.x+=dx/d*push;player.pos.z+=dz/d*push;}}}
/* the gate wheel: three hand-turns under pressure */
INTERACTS.push({x:koi.wx,z:koi.wz,r:2.4,boss:true,state(){const k=koi;if(!k.active||k.phase!==3||k.gateOpen||k.state!=='fight')return null;return {ok:true,text:`Turn the old gate wheel (${k.turns}/3)`,hold:1.1};},
  done(){const k=koi;k.turns++;SFX.knock(0,180);SFX.knock(0.15,150);SFX.knock(0.3,120);cam.shake=Math.max(cam.shake||0,0.5);k.wr.rotation.z+=Math.PI/2;
    puff(k.wx,groundH(k.wx,k.wz)+1.2,k.wz,8,new THREE.Color(0.5,0.45,0.38),0.3);
    if(k.turns>=3){k.gateOpen=true;k.window=7;k.atk=null;k.next=7.5;auSwell();SFX.splash();cam.shake=1.1;MZ.hitStop=0.12;toast('The gate grinds open and the water moves! Strike the knot on his head!');
      const gp=polyPoint(OUTLET,SLUICE_S);for(let i=0;i<40;i++)fxSoft.emit(gp.x+rr(-2,2),MZ.levelCur+rr(0,1),gp.z+rr(-2,2),rr(-2,2),rr(2,5),rr(-2,2),DROP,rr(0.2,0.45),rr(0.8,1.6),5,0.5,0.2,0.5);}
    else{toast(`The wheel gives a quarter-turn (${k.turns}/3). He's fighting it!`);k.next=Math.min(k.next,0.8);}
    renderBoss();},pos:()=>_w.set(koi.wx,groundH(koi.wx,koi.wz)+2.0,koi.wz)});

/* ---------- the seed sling ---------- */
const hasSling=()=>!!S.blight.sling;
const SEED=makeToon(0x9a7a3a,{noHeal:true,tag:'seed'});
const slingables=[];/* extra things the sling can hit that strikes can't (nests, high knots); {x,y,z,r,sling(),alive} */
function slingCandidates(){const out=[];for(const t of targets())out.push(t);for(const t of slingables)if(t.alive!==false)out.push(t);return out;}
function slingPick(maxAng){camera.getWorldDirection(_v);let best=null,bs=1e9;
  for(const t of slingCandidates()){const ty=(t.y??player.pos.y)+(t.type?0.4:0);_w.set(t.x-camera.position.x,ty-camera.position.y,t.z-camera.position.z);const d=_w.length();if(d<1||Math.hypot(t.x-player.pos.x,t.z-player.pos.z)>26)continue;
    const a=Math.acos(clamp(_w.dot(_v)/d,-1,1));if(a>maxAng)continue;const sc=a*3+d*0.02;if(sc<bs){bs=sc;best=t;}}return best;}
function slingFire(t){if(!active()||!hasSling()||CB.sling.cool>0)return;CB.sling.cool=0.42;
  const sx=player.pos.x+Math.sin(player.face)*0.4,sy=player.pos.y+1.35,sz=player.pos.z+Math.cos(player.face)*0.4;
  let tx,ty,tz;if(t){tx=t.x;ty=t.y??player.pos.y+0.6;tz=t.z;player.faceT=player.face=Math.atan2(tx-player.pos.x,tz-player.pos.z);player.faceLock=0.3;}
  else{camera.getWorldDirection(_v);tx=sx+_v.x*22;ty=sy+_v.y*22+1;tz=sz+_v.z*22;player.faceT=player.face=Math.atan2(_v.x,_v.z);player.faceLock=0.3;}
  const m=new THREE.Mesh(new THREE.SphereGeometry(0.08,6,5),SEED);m.position.set(sx,sy,sz);scene.add(m);
  const d=Math.hypot(tx-sx,ty-sy,tz-sz);CB.sling.shots.push({m,sx,sy,sz,tx,ty,tz,t:0,dur:Math.max(0.12,d/34),target:t});
  SFX.knock(0,900);SFX.knock(0.03,1300);CB.strike.t=-1;CB.sling.pose=0.25;
  tip('sling','The seed sling: tap Q to shoot the nearest target, or hold Q and let go to aim at the middle of the screen.');}
function slingStep(dt){CB.sling.pose=Math.max(0,(CB.sling.pose||0)-dt);
  for(let i=CB.sling.shots.length-1;i>=0;i--){const s=CB.sling.shots[i];s.t+=dt;const k=Math.min(1,s.t/s.dur);
    s.m.position.set(lerp(s.sx,s.tx,k),lerp(s.sy,s.ty,k)+Math.sin(k*Math.PI)*0.6,lerp(s.sz,s.tz,k));
    if(k>=1){scene.remove(s.m);CB.sling.shots.splice(i,1);const t=s.target;
      if(t&&(t.alive!==false)){const dx=t.x-player.pos.x,dz=t.z-player.pos.z,l=Math.hypot(dx,dz)||1;const r=t.sling?t.sling(1):t.hit?t.hit(1,dx/l,dz/l,'sling'):false;
        if(r&&r!=='clang'){feel(0.04,0.2);SFX.knock(0,420);sparkle(s.tx,s.ty,s.tz,6);}else if(r==='clang'){SFX.knock(0,760);popText('Ping!');}}
      else puff(s.tx,s.ty,s.tz,4,new THREE.Color(0.6,0.5,0.35),0.15);}}}
const reticle=(()=>{const e=document.createElement('div');e.id='cbReticle';e.hidden=true;ui.root.appendChild(e);return e;})();
function slingAimStart(){if(!active())return;if(!hasSling()){if(MZ.oStage()>=0)tip('nosling','No sling yet. Someone left one hanging at the orchard gate.');return;}CB.sling.aimAt=MZ.simTime;}
function slingAimRelease(){const a=CB.sling.aimAt;CB.sling.aimAt=-1;reticle.hidden=true;CB.slingLock=null;if(a<0)return;const held=MZ.simTime-a;slingFire(slingPick(held<0.22?0.6:SNAP()));}
const SNAP=()=>CB.otherBoss||koi.active?0.6:0.16;   /* in boss fights the reticle snaps to a knot from well off-centre */
function slingAimUI(){const on=CB.sling.aimAt>=0&&MZ.simTime-CB.sling.aimAt>=0.22;reticle.hidden=!on;CB.slingLock=null;
  if(on){const t=slingPick(SNAP());reticle.classList.toggle('lock',!!t);CB.slingLock=t;
    if(t){_w.set(t.x,(t.y??player.pos.y)+(t.type?0.4:0),t.z).project(camera);reticle.style.left=((_w.x*0.5+0.5)*innerWidth)+'px';reticle.style.top=((-_w.y*0.5+0.5)*innerHeight)+'px';}
    else{reticle.style.left='50%';reticle.style.top='50%';}}}

/* ---------- mending: the weaving finisher ---------- */
function mendStart(spec){spec=spec||KOI_MEND;CB.mend={n:0,need:5,t:0,period:1.0*Math.max(0.8,D().tele),miss:0,spec};ui.mend.hidden=false;CB.strike.t=-1;renderMend();toast(spec.intro);SFX.moment();auSwell();}
function renderMend(){const m=CB.mend;if(!m)return;ui.mend.querySelector('.dots').innerHTML=Array.from({length:m.need},(_,i)=>`<i class="${i<m.n?'on':''}"></i>`).join('');}
function mendStep(dt){const m=CB.mend;if(!m)return;m.t+=dt;const k=m.t/m.period;const sc=2.2-1.7*k;ui.mend.querySelector('.ring').style.transform=`translate(-50%,-50%) scale(${Math.max(0.2,sc)})`;
  if(k>1.25){m.t=0;m.miss++;}
  if(m.spec.step)m.spec.step(dt,m.n/m.need);}
function mendPress(){const m=CB.mend;if(!m)return false;const sc=2.2-1.7*(m.t/m.period);const ok=Math.abs(sc-0.5)<D().win*2.6;
  if(ok){m.n++;m.t=0;SFX.knock(0,520+m.n*80);m.spec.point(m.n,_w);sparkle(_w.x,_w.y,_w.z,12);for(let i=0;i<10;i++){const k=i/10;fxGlow.emit(lerp(player.pos.x,_w.x,k),lerp(player.pos.y+1.2,_w.y,k),lerp(player.pos.z,_w.z,k),0,0.2,0,new THREE.Color(2.4,2.0,1.0),0.08,0.5,0,0.5,0);}
    renderMend();if(m.n>=m.need){CB.mend=null;ui.mend.hidden=true;m.spec.done();}}
  else{m.t=0;m.miss++;cam.shake=Math.max(cam.shake||0,0.2);popText('Steady…');SFX.knock(0,200);}
  return true;}
const KOI_MEND={intro:'His shell is broken. Mend him: press E (or Mend) as the ring meets the circle.',point:(n,out)=>koiWorld(0,0.6,2-n*0.8,out),
  step:(dt,k)=>{koi.body.rotation.z=damp(koi.body.rotation.z,0,3,dt);koi.glow.material.opacity=0.25+0.4*k;},done:()=>mendDone()};
function mendDone(){const k=koi;k.state='mended';k.active=false;ui.boss.hidden=true;clearHazards();for(const e of [...CB.enemies])popEnemy(e);
  for(const s of k.segs)s.material=k.skin;for(const p of k.patches)p.material=k.patch;for(const f of k.fins)f.material=k.finMat;for(const l of k.lumps){if(l.mesh){l.mesh.visible=false;continue;}koiWorld(l.position.x,l.position.y,l.position.z,_w);puff(_w.x,_w.y,_w.z,6,MUD,0.4);}k.glow.material.opacity=0.6;sparkle(k.g.position.x,MZ.levelCur+1.5,k.g.position.z,40);auSwell();SFX.moment();cam.shake=0.5;player.happy=8;
  const re=k.rematch;k.rematch=false;
  if(re){S.blight.koiRe=true;if(!S.cosmetics.bands)S.cosmetics.bands={};S.cosmetics.bands.koi=true;writeSave();MZ.renderValleyPane();showCardBrief({k:'Mill Pond · at dawn',t:'The Old Koi, again',s:'He remembers you, a little. He leaves a scale on the bank, gold at the edges.'});after(5,()=>toast('New in your wardrobe: the Koi-scale band (journal, Valley & settings).'));after(5,()=>{k.state='swim';k.swim=0;k.mended=true;});return;}
  S.blight.koi=true;writeSave();
  showCardBrief({k:'Mill Pond · mended',t:'The Old Koi',s:'Gold and white under all that silt. For the first time in years, the water moves.'});
  after(5,()=>{k.state='swim';k.swim=0;k.mended=true;});
  after(9,()=>toast('The way through the gate is clear. Now the sluice can be rebuilt properly.'));}

/* ---------- input ---------- */
const canvas=MZ.canvas;
canvas.addEventListener('mousedown',e=>{if(MZ.mode!=='play')return;if(e.button===0&&document.pointerLockElement===canvas){if(CB.mend){mendPress();return;}strike();}if(e.button===2){e.preventDefault();flareStart();}});
window.addEventListener('mouseup',e=>{if(e.button===2)flareRelease();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(MZ.mode!=='play'||e.repeat)return;
  if(CB.mend&&(e.code==='KeyE'||e.code==='Space')){e.preventDefault();mendPress();return;}
  if(MZ.decorOn||MZ.journalOpen||MZ.photo.on||MZ.talk.on)return;
  if(e.code==='KeyF')strike();else if(e.code==='KeyR')flareStart();else if(e.code==='KeyQ')slingAimStart();else if(e.code==='ShiftLeft'||e.code==='ShiftRight')CB.shiftAt=performance.now();});
window.addEventListener('keyup',e=>{if(e.code==='KeyR')flareRelease();if(e.code==='KeyQ')slingAimRelease();if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&CB.shiftAt>0){if(performance.now()-CB.shiftAt<190)dodge();CB.shiftAt=-1;}});
/* touch: a left stick, and buttons on the right */
const touch={on:false,id:null,ox:0,oy:0,keys:new Set()};
function setStick(dx,dy){const want=new Set();const dz=18;if(dy<-dz)want.add('KeyW');if(dy>dz)want.add('KeyS');if(dx<-dz)want.add('KeyA');if(dx>dz)want.add('KeyD');
  for(const k of touch.keys)if(!want.has(k))MZ.keys.delete(k);for(const k of want)MZ.keys.add(k);touch.keys=want;
  const l=Math.min(1,Math.hypot(dx,dy)/60);const a=Math.atan2(dy,dx);$('cbStick').querySelector('.nub').style.transform=`translate(${Math.cos(a)*l*36}px,${Math.sin(a)*l*36}px)`;}
function enableTouch(){if(touch.on)return;touch.on=true;ui.touch.hidden=false;document.body.classList.add('touchUI');}
if(window.matchMedia&&matchMedia('(pointer: coarse)').matches)enableTouch();
window.addEventListener('touchstart',()=>enableTouch(),{once:true,passive:true});
$('cbStick').addEventListener('pointerdown',e=>{touch.id=e.pointerId;touch.ox=e.clientX;touch.oy=e.clientY;$('cbStick').setPointerCapture(e.pointerId);e.preventDefault();});
$('cbStick').addEventListener('pointermove',e=>{if(e.pointerId!==touch.id)return;setStick(e.clientX-touch.ox,e.clientY-touch.oy);});
const stickEnd=e=>{if(e.pointerId!==touch.id)return;touch.id=null;setStick(0,0);};
$('cbStick').addEventListener('pointerup',stickEnd);$('cbStick').addEventListener('pointercancel',stickEnd);
const tb=(id,down,up)=>{const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();b.classList.add('down');down();});const u=e=>{b.classList.remove('down');if(up)up();};b.addEventListener('pointerup',u);b.addEventListener('pointercancel',u);b.addEventListener('pointerleave',u);};
tb('tStrike',()=>{if(CB.mend)mendPress();else strike();});tb('tDodge',()=>dodge());tb('tLantern',()=>flareStart(),()=>flareRelease());
tb('tMend',()=>{if(CB.mend){mendPress();return;}MZ.pressE(true);},()=>MZ.pressE(false));tb('tJump',()=>MZ.jump());tb('tSling',()=>slingFire(slingPick(0.9)));

/* ---------- difficulty picker in the journal ---------- */
function renderDiffUI(){let box=$('cbDiff');const host=$('pValley');if(!host)return;
  if(!box){box=document.createElement('div');box.id='cbDiff';box.className='page';host.appendChild(box);
    box.addEventListener('click',e=>{const b=e.target.closest('[data-diff]');if(b){setDiff(b.dataset.diff);SFX.page();lastBreathKey='';}});}
  box.innerHTML=`<h2>Adventure</h2><p class="qnote">How fights feel. Change it any time; nothing is lost either way.</p><div class="row">${Object.entries(DIFF).map(([k,v])=>`<button class="pbtn${k===diffName?' on':''}" type="button" data-diff="${k}" aria-pressed="${k===diffName}">${v.label}</button>`).join('')}</div>
    <p class="qnote">${diffName==='gentle'?'You can\'t be hurt, enemies are slower, and the mending ring is forgiving.':diffName==='brave'?'Faster, tougher blight and tighter mending. For the heroic.':'Real fights: watch the glow, dodge on the tell, strike the knots.'}</p>
    <p class="qnote">Strike: click or F · Dodge: tap Shift · Lantern: hold right-click or R · Sling: Q (tap, or hold to aim) · Mend: E</p>`;}
renderDiffUI();

/* ---------- the prologue's last beat ---------- */
HOOKS.project.push(n=>{if(n!==3)return;after(12.5,()=>{
  const lane=new THREE.Vector3(-62,0,-26);
  startCine({k:'End of the prologue',t:'Not everything upstream wants to wake',s:'Up the orchard lane the thorns are moving in the dark. And somewhere under the water, a bell is ringing.'},lane,{pivot:lane,radius:16,height:5,lookY:2});
  for(let i=0;i<4;i++)SFX.knock(1.5+i*1.6,62);
  CB.teaser=8;
  if(MZ.PROLOGUE)after(9.5,()=>showCardBrief({k:'Thank you for playing',t:'The Mizumend prologue',s:'The full game continues up the orchard lane: the Bramble Mother, the drowned bell, and the lamp across the water.'}));});});
function teaserStep(dt){if(!(CB.teaser>0))return;CB.teaser-=dt;if(rnd()<dt*30){const x=-62+rr(-8,8),z=-26+rr(-8,8);fxSoft.emit(x,groundH(x,z)+rr(0,1.5),z,rr(-0.3,0.3),rr(0.3,1),rr(-0.3,0.3),new THREE.Color(0.18,0.14,0.12),rr(0.3,0.6),rr(1.5,2.5),-0.05,0.4,0.2,0.6);}}

/* ---------- per-step and per-frame ---------- */
HOOKS.sim.push(dt=>{
  if(MZ.mode!=='play')return;
  CB.inv=Math.max(0,CB.inv-dt);CB.rollCool=Math.max(0,CB.rollCool-dt);CB.nmCool=Math.max(0,CB.nmCool-dt);CB.sling.cool=Math.max(0,CB.sling.cool-dt);CB.flare.cool=Math.max(0,CB.flare.cool-dt);
  if(CB.flare.charge>=0){CB.flare.charge+=dt;player.slow=Math.min(player.slow||1,0.5);}
  swingStep(dt);pocketStep();
  for(const e of [...CB.enemies])if(!e.dead)enemyStep(e,dt);
  hazardStep(dt);koiStep(dt);koiPush();mendStep(dt);teaserStep(dt);slingStep(dt);releasedStep(dt);
  if(MZ.simTime-CB.engagedT>6&&CB.breaths<CB.max){CB.regen+=dt;if(CB.regen>3.5){CB.regen=0;CB.breaths++;}}else CB.regen=0;
  if(CB.enemies.length)CB.engagedT=MZ.simTime;
});
HOOKS.pose.push(dt=>{
  const s=CB.strike,aR=player.arms[1],aL=player.arms[0];const fighting=s.t>=0||MZ.simTime-CB.engagedT<4||CB.flare.charge>=0;
  gear.hand.visible=fighting;gear.back.visible=!fighting;
  if(s.t>=0){const W=SWING[s.chain];const k=clamp(s.t/W.dur,0,1);
    if(s.chain===1){aR.rotation.x=lerp(-2.7,0.5,ease(clamp(s.t/W.hit,0,1)));aR.rotation.z=0.2;}
    else if(s.chain===2){aR.rotation.x=-1.4;aR.rotation.z=lerp(1.6,-1.0,ease(clamp(s.t/W.hit,0,1)));}
    else{aR.rotation.x=-1.5;aR.rotation.z=0.4;player.root.rotation.y=player.face+ease(k)*Math.PI*2;aL.rotation.z=-1.2;}}
  else if(fighting){aR.rotation.x=-0.9;aR.rotation.z=0.15;}
  if(CB.sling.pose>0||(CB.sling.aimAt>=0&&MZ.simTime-CB.sling.aimAt>0.2)){aL.rotation.x=-1.6;aL.rotation.z=-0.2;aR.rotation.x=-1.2;}
  if(player.roll>0){const k=1-player.roll/0.36;player.body.rotation.x=k*Math.PI*2;player.body.position.y=Math.sin(k*Math.PI)*0.25;}
  if(CB.flare.charge>=0){aL.rotation.x=-1.4;const c=Math.min(1,CB.flare.charge/0.6);gear.halo.material.opacity=0.3+0.5*c;gear.halo.scale.setScalar(0.8+c*1.4);gear.core.material.color.setRGB(1.2+c*1.6,0.8+c*0.9,0.35+c*0.3);}
  else{gear.halo.material.opacity=Math.max(0,gear.halo.material.opacity-dt*2.5);gear.halo.scale.setScalar(Math.max(0.8,gear.halo.scale.x-dt*8));gear.core.material.color.setRGB(1.2,0.8,0.35);}
  gear.lan.visible=hasLantern();
  if(CB.inv>0&&MZ.simTime-CB.hurtT<1.0)player.root.visible=Math.floor(MZ.simTime*20)%2===0;else player.root.visible=true;
});
let uiAcc=0;
const titleKoi=(()=>{   /* v12.1: a fish-shaped shadow under the water, with a flicking tail and the knot pulsing on his head */
  const mat=new THREE.MeshBasicMaterial({color:0x080a0c,transparent:true,opacity:0.34,depthWrite:false});
  const sh=new THREE.Shape();const P=[[0,2.3],[0.42,2.05],[0.62,1.4],[0.66,0.5],[1.35,0.95],[1.25,0.55],[0.62,0.1],[0.5,-0.8],[0.3,-1.6],[0.14,-2.1],[-0.14,-2.1],[-0.3,-1.6],[-0.5,-0.8],[-0.62,0.1],[-1.25,0.55],[-1.35,0.95],[-0.66,0.5],[-0.62,1.4],[-0.42,2.05]];
  sh.moveTo(P[0][0],P[0][1]);for(const p of P.slice(1))sh.lineTo(p[0],p[1]);
  const g=new THREE.Group();g.renderOrder=5;scene.add(g);
  const body=new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI/2),mat);body.renderOrder=5;g.add(body);
  const ts=new THREE.Shape();ts.moveTo(0,0);ts.lineTo(0.75,-0.9);ts.lineTo(0.45,-1.1);ts.lineTo(0,-0.55);ts.lineTo(-0.45,-1.1);ts.lineTo(-0.75,-0.9);ts.lineTo(0,0);
  const tail=new THREE.Group();tail.position.z=2.05;g.add(tail);const tm=new THREE.Mesh(new THREE.ShapeGeometry(ts).rotateX(-Math.PI/2),mat);tm.renderOrder=5;tail.add(tm);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xd8e070,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));glow.scale.setScalar(1.6);scene.add(glow);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.32,0.42,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xe8e080,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));ring.renderOrder=6;scene.add(ring);
  return {g,tail,glow,ring,m:g};})();
HOOKS.vis.push(dt=>{
  const tm=MZ.mode==='title';titleKoi.g.visible=titleKoi.glow.visible=titleKoi.ring.visible=tm;
  if(tm){const T=MZ.G.uTime.value,t=T*0.16;const ca=Math.atan2(camera.position.z,camera.position.x);const sway=Math.sin(t)*14,rad=26+Math.cos(t*0.7)*4;
    const x=Math.cos(ca)*rad-Math.sin(ca)*sway,z=Math.sin(ca)*rad+Math.cos(ca)*sway;const vx=-Math.sin(ca)*Math.cos(t),vz=Math.cos(ca)*Math.cos(t);const vl=Math.hypot(vx,vz)||1;
    titleKoi.g.position.set(x,MZ.levelCur+0.04,z);titleKoi.g.rotation.y=Math.atan2(-vx,-vz);titleKoi.g.scale.setScalar(1.25);
    titleKoi.tail.rotation.y=Math.sin(T*3.1)*0.32+Math.sin(T*0.9)*0.12;titleKoi.g.children[0].rotation.y=-titleKoi.tail.rotation.y*0.08;
    const hx=x+vx/vl*2.2,hz=z+vz/vl*2.2;const p=0.5+0.5*Math.sin(T*2.2);
    titleKoi.glow.position.set(hx,MZ.levelCur+0.2,hz);titleKoi.glow.material.opacity=0.25+0.55*p*p;titleKoi.glow.scale.setScalar(1.3+0.6*p);
    titleKoi.ring.position.set(hx,MZ.levelCur+0.06,hz);titleKoi.ring.scale.setScalar(1+((T*0.7)%1)*2.2);titleKoi.ring.material.opacity=0.5*(1-((T*0.7)%1));}
  const boss=koi.active&&koi.state!=='intro'?{x:koi.g.position.x,z:koi.g.position.z}:CB.bossFrame?CB.bossFrame():null;
  cam.frame=boss&&!MZ.cine?{x:boss.x,z:boss.z,dist:boss.dist||11,pitch:boss.pitch||0.62,lift:boss.lift||0}:null;
  slingAimUI();
});
HOOKS.vis.push(dt=>{uiAcc+=dt;if(uiAcc<0.1)return;uiAcc=0;renderBreaths();if(koi.active&&!ui.boss.hidden)renderBoss();if(!koi.active&&!CB.mend&&!CB.otherBoss)ui.boss.hidden=true;
  ui.root.classList.toggle('hidden',MZ.mode!=='play'||MZ.photo.on);ui.boss.style.visibility=MZ.cine?'hidden':'visible';});
/* keep the koi in step with saves loaded after this module ran */
HOOKS.project.push(()=>{});
let lastSync=-1;HOOKS.sim.push(()=>{const key=(S.blight&&S.blight.koi?1:0)+stage()*2;if(key===lastSync)return;lastSync=key;if(!S.blight||typeof S.blight!=='object')S.blight={koi:false};if(!koi.active&&koi.state!=='swim'&&koi.state!=='mended')koiReset();});

HOOKS.bossActive=()=>(koi.active&&koi.state!=='asleep')||!!CB.otherBoss;
MZ.combat={GLOW_TEX,CB,gear,koi,spawnEnemy,koiStart,mendPress,strike,dodge,flareStart,flareRelease,setDiff,hurt,targets,mendStart,popEnemy,feel,popText,tip,nearMissCheck,spit,shockwave,clearHazards,slingFire,slingPick,slingables,hasSling,hasLantern,D,ui,KNOT,KNOT_HOT,MUCK,MOSS,glowMat,renderBossBar:null,removeEnemy};
if(PARAMS.debug==="1"||PARAMS.debug==="true")window.__mzc=Object.assign(MZ.combat,{CB,koi,spawnEnemy,koiStart,mendPress,strike,dodge,flareStart,flareRelease,setDiff,hurt,targets,mendStart,
  koiMendNow:()=>{if(!koi.active)koiStart();mendDone();},washAshore,slingAimStart,slingAimRelease});
