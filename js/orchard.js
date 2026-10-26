/* ================================================================
   Mizumend · Chapter 1, the Old Orchard: the seed sling, thorn-knots,
   the Bramble Mother, three hidden places, the seed-spirits and a summer shower.
   ================================================================ */
import * as THREE from 'three';
import { MZ } from './game.js';
const {HOOKS,scene,camera,player,cam,S,SFX,$,clamp,lerp,damp,rr,rnd,ease,angWrap,groundH,makeToon,addOutline,toast,showCardBrief,startCine,after,sparkle,puff,addRipple,auSwell,writeSave,stage,teleport,fxSoft,fxGlow,INTERACTS,PARAMS,ORCH,oldApple,brambles,oStage}=MZ;
const C=MZ.combat,CB=C.CB;
const _v=new THREE.Vector3(),_w=new THREE.Vector3();
const D=()=>C.D();
const active=()=>MZ.mode==='play'&&!MZ.cine&&!MZ.journalOpen&&!MZ.talk.on&&!MZ.photo.on;
const BRIAR=makeToon(0x4b3c3a,{noHeal:true,rim:0.35,tag:'briar'}),BRIAR2=makeToon(0x40502c,{noHeal:true,tag:'briar2'}),THORN=makeToon(0x2e2420,{noHeal:true,tag:'thorn'});
const HIP=C.glowMat(2.2,0.7,0.35),SEEDGLOW=C.glowMat(1.8,1.5,0.6);
const BURR=makeToon(0x4a3a22,{noHeal:true,rim:0.6,tag:'burr'});
/* v12.1 readability: dark bramble, warm bright cores */
const COIL=makeToon(0x2a1c1e,{noHeal:true,rim:0.55,tag:'coil'}),COIL2=makeToon(0x34261c,{noHeal:true,rim:0.5,tag:'coil2'}),SPIKE=makeToon(0x1a1210,{noHeal:true,rim:0.4,tag:'spike'});
const CORE=C.glowMat(2.9,1.65,0.55),CORE_HOT=C.glowMat(3.2,1.0,0.35);
const BURRGLOW=C.glowMat(2.2,1.2,0.4);
const spike=(h,r,mat=SPIKE)=>new THREE.Mesh(new THREE.ConeGeometry(r,h,5),mat);
function outwardSpike(parent,pos,dir,h,r){const c=spike(h,r);c.position.copy(pos).addScaledVector(dir,h*0.45);c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);parent.add(c);return c;}
const MUD=new THREE.Color(0.32,0.28,0.22),LEAF=new THREE.Color(0.45,0.55,0.3);
const thornCone=(h=0.3,r=0.05)=>new THREE.Mesh(new THREE.ConeGeometry(r,h,5),THORN);
if(!S.blight||typeof S.blight!=='object')S.blight={koi:false};

/* ---------- the seed sling, hanging on the orchard gatepost ---------- */
const SLING_AT={x:-69,z:-26.2};
const slingPost=(()=>{const g=new THREE.Group();g.position.set(SLING_AT.x,groundH(SLING_AT.x,SLING_AT.z),SLING_AT.z);scene.add(g);
  const wood=makeToon(0x6b4c33,{});const post=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,1.6,6),wood);post.position.y=0.8;post.castShadow=true;g.add(post);
  const sl=new THREE.Group();sl.position.set(0.12,1.25,0);g.add(sl);
  const fork=new THREE.Mesh(new THREE.TorusGeometry(0.12,0.025,5,10,Math.PI),makeToon(0x8a6a4a,{noHeal:true}));fork.rotation.z=Math.PI;sl.add(fork);
  const grip=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.25,5),makeToon(0x8a6a4a,{noHeal:true}));grip.position.y=-0.24;sl.add(grip);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.3,4),makeToon(0x3a2a1a,{noHeal:true}));band.position.set(0,0.02,0.02);band.rotation.z=Math.PI/2;sl.add(band);
  return {g,sl};})();
INTERACTS.push({x:SLING_AT.x,z:SLING_AT.z,r:2.4,state(){if(S.blight.sling||oStage()<0)return null;return {ok:true,text:'Take the old seed sling from the gatepost',hold:0.6};},
  done(){S.blight.sling=true;slingPost.sl.visible=false;SFX.get();sparkle(SLING_AT.x,groundH(SLING_AT.x,SLING_AT.z)+1.3,SLING_AT.z,10);writeSave();
    showCardBrief({k:'The Old Orchard',t:'A seed sling',s:'Somebody carved a heron on the grip. Q to shoot: tap for the nearest target, hold to aim.'});},
  pos:()=>_v.set(SLING_AT.x,groundH(SLING_AT.x,SLING_AT.z)+1.9,SLING_AT.z)});

/* ---------- burrs: seed projectiles from thorn-knots and the Bramble Mother ---------- */
const burrs=[];
const BURR_DIRS=new THREE.IcosahedronGeometry(1,0).attributes.position;
function fireBurr(x,y,z,tx,ty,tz,speed=9){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(0.15,0),BURR);
  for(let i=0;i<BURR_DIRS.count;i+=3){const d=new THREE.Vector3().fromBufferAttribute(BURR_DIRS,i).normalize();outwardSpike(m,d.clone().multiplyScalar(0.12),d,0.2,0.035);}
  const seed=new THREE.Mesh(new THREE.SphereGeometry(0.07,6,5),BURRGLOW);m.add(seed);
  m.position.set(x,y,z);scene.add(m);const dx=tx-x,dy=ty-y,dz=tz-z,l=Math.hypot(dx,dy,dz)||1;burrs.push({m,vx:dx/l*speed,vy:dy/l*speed,vz:dz/l*speed,t:0});SFX.knock(0,640);}
const TRAIL=new THREE.Color(0.9,0.55,0.25);
function burrStep(dt){for(let i=burrs.length-1;i>=0;i--){const b=burrs[i];b.t+=dt;b.m.position.x+=b.vx*dt;b.m.position.y+=b.vy*dt;b.m.position.z+=b.vz*dt;b.m.rotation.x+=dt*9;b.m.rotation.y+=dt*7;
  if(rnd()<dt*40)fxGlow.emit(b.m.position.x,b.m.position.y,b.m.position.z,-b.vx*0.05,-b.vy*0.05,-b.vz*0.05,TRAIL,rr(0.05,0.09),rr(0.18,0.32),0,0.6,0);
  const p=b.m.position;const hit=Math.hypot(p.x-player.pos.x,p.z-player.pos.z)<0.55&&p.y>player.pos.y-0.1&&p.y<player.pos.y+1.7;
  if(hit){if(!C.nearMissCheck())C.hurt(1,p.x-b.vx,p.z-b.vz);}
  if(hit||b.t>3||p.y<groundH(p.x,p.z)){puff(p.x,p.y,p.z,5,LEAF,0.15);scene.remove(b.m);burrs.splice(i,1);}}}
function clearBurrs(){for(const b of burrs)scene.remove(b.m);burrs.length=0;}

/* ---------- thorn-knots: turrets that open to fire; light makes the thorns pull back ---------- */
const thorns=[];
function spawnThorn(x,z,guard){
  const g=new THREE.Group();g.position.set(x,groundH(x,z),z);scene.add(g);
  g.scale.setScalar(1.5);
  const base=new THREE.Mesh(new THREE.IcosahedronGeometry(0.62,1),COIL);base.scale.set(1,0.55,1);base.position.y=0.25;base.castShadow=true;g.add(base);addOutline(base,0.02);
  const core=new THREE.Mesh(new THREE.SphereGeometry(0.26,12,10),CORE);core.position.y=0.78;g.add(core);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:C.GLOW_TEX,color:0xffb048,transparent:true,opacity:0.55,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));halo.position.y=0.78;halo.scale.setScalar(1.6);g.add(halo);
  const cage=[];for(let i=0;i<8;i++){const pv=new THREE.Group();const a=i/8*6.283;pv.position.set(Math.cos(a)*0.32,0.45,Math.sin(a)*0.32);pv.rotation.y=-a;g.add(pv);
    const c=thornCone(0.75,0.09);c.position.y=0.36;pv.add(c);const s2=thornCone(0.22,0.04);s2.position.set(0.05,0.3,0);s2.rotation.z=-1.2;pv.add(s2);cage.push(pv);}
  const t={g,core,halo,cage,x,z,y:groundH(x,z)+0.78*1.5,r:0.65,hp:Math.round(3*D().hp),alive:true,state:'closed',t:rr(0,1.5),open:0,lit:0,guard,
    stun(){this.lit=3.4;this.state='lit';SFX.knock(0,380);},
    hit(dmg,dx,dz,src){if(!this.alive)return false;if(this.open<0.55)return 'clang';this.hp-=dmg;this.flash=0.15;puff(this.x,this.y,this.z,6,LEAF,0.2);
      if(this.hp<=0){this.alive=false;popThorn(this);}return true;},
    sling(d){return this.hit(d,0,0,'sling');}};
  thorns.push(t);return t;}
function popThorn(t){for(let i=0;i<16;i++)fxSoft.emit(t.x,t.y,t.z,rr(-2.5,2.5),rr(1.5,4),rr(-2.5,2.5),LEAF,rr(0.1,0.18),rr(0.6,1.0),7,0.4);sparkle(t.x,t.y,t.z,12);SFX.get();C.feel(0.08,0.4);
  t.core.visible=false;t.halo.visible=false;for(const pv of t.cage)pv.rotation.z=-1.4;if(CB.breaths<CB.max&&rnd()<0.4){CB.breaths++;C.popText('+1 breath');}
  if(t.guard!=null&&!thorns.some(o=>o.alive&&o.guard===t.guard))after(0.6,()=>toast('The thorn-knots are broken. The thicket can be cut back now.'));
  after(4,()=>{scene.remove(t.g);const i=thorns.indexOf(t);if(i>=0)thorns.splice(i,1);});}
function thornStep(t,dt){if(!t.alive)return;const tele=D().tele,sp=D().speed;t.t+=dt;t.flash=Math.max(0,(t.flash||0)-dt);
  const d=Math.hypot(player.pos.x-t.x,player.pos.z-t.z);
  if(t.state==='lit'){t.lit-=dt;if(t.lit<=0){t.state='closed';t.t=0;}}
  else if(t.state==='closed'){if(d<15&&t.t>2.0/sp&&MZ.mode==='play'){t.state='tell';t.t=0;}}
  else if(t.state==='tell'){if(t.t>1.0*tele){t.state='fire';t.t=0;const n=3;for(let i=0;i<n;i++){const a=Math.atan2(player.pos.x-t.x,player.pos.z-t.z)+(i-1)*0.18;
      fireBurr(t.x,t.y+0.1,t.z,t.x+Math.sin(a)*10,player.pos.y+1.0,t.z+Math.cos(a)*10,8.5*sp);}}}
  else if(t.state==='fire'){if(t.t>1.3){t.state='closed';t.t=0;}}
  const want=t.state==='lit'?1.25:t.state==='tell'?Math.min(1,t.t/(0.8*tele)):t.state==='fire'?1:0;t.open=damp(t.open,want,t.state==='lit'?10:5,dt);
  for(const pv of t.cage)pv.rotation.z=-t.open*1.1;
  const hot=t.state==='tell';t.core.material=hot||t.flash>0?CORE_HOT:CORE;const lock=C.CB.slingLock===t;t.halo.material.opacity=lock?1:t.open>0.55?0.85:0.5;t.halo.scale.setScalar(lock?2.4:hot?2.0+0.3*Math.sin(t.t*20):1.6);
  if(d<16)CB.engagedT=MZ.simTime;}
CB.reg.push(()=>thorns.filter(t=>t.alive));
/* thickets are guarded by thorn-knots until the orchard is open */
const GUARD=[0,2,4,6];let guardsUp=false;
function guardStep(){if(oStage()!==0||MZ.PROLOGUE){return;}if(guardsUp)return;if(Math.hypot(player.pos.x-ORCH.x,player.pos.z-ORCH.z)>30)return;guardsUp=true;
  for(const gi of GUARD){const b=brambles[gi];if(!b||b.cleared)continue;const a=rnd()*6.28;const x=b.x+Math.cos(a)*2.6,z=b.z+Math.sin(a)*2.6;spawnThorn(x,z,gi);}
  if(thorns.length){C.popText('Thorn-knots!');after(0.5,()=>toast('Thorn-knots guard the thickets. Flare your lantern to make the thorns pull back, then strike the core, or shoot it with the sling while it opens to fire.'));}}
HOOKS.brambleBlocked=(b)=>{if(thorns.some(t=>t.alive&&t.guard===b.idx))return {ok:false,text:'A thorn-knot guards this thicket · break it first'};return null;};

/* ---------- the Bramble Mother, wrapped around the old apple ---------- */
const BM_R=6.4;
const bm=(()=>{
  const cx=oldApple.x,cz=oldApple.z,gy=groundH(cx,cz);
  const g=new THREE.Group();g.position.set(cx,gy,cz);scene.add(g);g.visible=false;
  const ropes=new THREE.Group();g.add(ropes);
  for(let i=0;i<7;i++){const pts=[];const a0=i/7*6.283,turns=rr(0.6,1.2),top=rr(3.4,5.2);
    for(let k=0;k<=12;k++){const t=k/12;const a=a0+t*turns*6.283;const r=lerp(1.6,0.45+0.9*Math.sin(t*3.1),t);pts.push(new THREE.Vector3(Math.cos(a)*r,t*top,Math.sin(a)*r));}
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),40,rr(0.08,0.14),6,false),i%2?BRIAR:BRIAR2);tube.castShadow=true;ropes.add(tube);
    for(let k=0;k<10;k++){const p=pts[1+(k%11)];const c=thornCone(0.22,0.04);c.position.copy(p);c.rotation.set(rnd()*3,rnd()*3,rnd()*3);ropes.add(c);}}
  const mound=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5,1),BRIAR);mound.scale.set(1.3,0.75,1.1);mound.position.set(0,0.55,0);mound.castShadow=true;g.add(mound);addOutline(mound,0.02);
  const hood=new THREE.Mesh(new THREE.IcosahedronGeometry(1.0,1),BRIAR2);hood.scale.set(1.1,0.9,0.8);hood.position.set(0,1.55,0.55);g.add(hood);addOutline(hood,0.02);
  const eyes=[];for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6),HIP);e.position.set(sx*0.35,1.6,1.25);g.add(e);eyes.push(e);}
  for(let k=0;k<18;k++){const c=thornCone(rr(0.3,0.55),0.07);const a=rnd()*6.28;c.position.set(Math.cos(a)*1.4,rr(0.4,1.9),Math.sin(a)*1.1);c.lookAt(c.position.clone().multiplyScalar(3));c.rotateX(Math.PI/2);g.add(c);}
  const buds=[];for(const sx of [-1,1]){const b=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6),C.KNOT);b.position.set(sx*1.15,1.9,0.9);g.add(b);buds.push(b);}
  const knots=[];
  const mk=(lx,ly,lz,phase,hp)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(phase===1?0.44:0.38,12,10),CORE);m.position.set(lx,ly,lz);g.add(m);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(phase===1?0.55:0.45,0.08,5,12),COIL);ring.rotation.x=Math.PI/2;m.add(ring);
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:C.GLOW_TEX,color:0xffb048,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));halo.scale.setScalar(phase===1?2.2:1.6);m.add(halo);
    const k={m,halo,phase,hp,max:hp,alive:true,on:false,x:0,y:0,z:0,r:0.5,flash:0,
      hit(dmg,dx,dz,src){if(!this.on||!this.alive)return false;if(this.phase===1&&src!=='sling')return 'clang';this.hp-=dmg;this.flash=0.15;bmKnotHit(this);return true;},
      sling(dmg){return this.hit(dmg,0,0,'sling');}};knots.push(k);return k;};
  const HIGH=[[3.5,5.3,1.0],[-3.3,5.6,-1.1],[0.8,6.0,-3.4]];
  for(const [hx,hy,hz] of HIGH){mk(hx,hy,hz,1,3);
    /* a long thorny branch from the trunk out to the knot, so it sits clear of the canopy, against the sky */
    const pts=[new THREE.Vector3(0,3.0,0),new THREE.Vector3(hx*0.35,4.3,hz*0.35),new THREE.Vector3(hx*0.75,5.4,hz*0.75),new THREE.Vector3(hx,hy-0.35,hz)];
    const cv=new THREE.CatmullRomCurve3(pts);const br=new THREE.Mesh(new THREE.TubeGeometry(cv,24,0.11,6,false),COIL);br.castShadow=true;ropes.add(br);
    for(let k=1;k<12;k++){const p=cv.getPointAt(k/12),tn=cv.getTangentAt(k/12);const side=new THREE.Vector3(rnd()-0.5,rnd()-0.5,rnd()-0.5).cross(tn).normalize();outwardSpike(ropes,p.clone().addScaledVector(side,0.08),side,0.28,0.05);}}
  const r1=mk(0,0.4,0,2,4),r2=mk(0,0.4,0,2,4);r1.m.parent.remove(r1.m);r2.m.parent.remove(r2.m);scene.add(r1.m);scene.add(r2.m);r1.m.visible=r2.m.visible=false;
  const heart=mk(0,0.7,1.45,3,4);
  const cage=[];for(let i=0;i<7;i++){const pv=new THREE.Group();const a=-1.2+i*0.4;pv.position.set(Math.sin(a)*0.55,0.3,1.45+Math.cos(a)*0.25);g.add(pv);const c=thornCone(1.0,0.1);c.position.y=0.45;pv.add(c);cage.push(pv);}
  /* thorn walls that ring the arena; light pushes a section back */
  const walls=[];const WN=14;for(let i=0;i<WN;i++){const a=i/WN*6.283;const wg=new THREE.Group();const x=cx+Math.cos(a)*BM_R,z=cz+Math.sin(a)*BM_R;wg.position.set(x,groundH(x,z)-1.6,z);wg.rotation.y=-a;scene.add(wg);
    for(let k=0;k<3;k++){const pts=[];const ph=rnd()*6.28,turns=rr(2.2,3.2),rad=rr(0.32,0.48),y0=0.3+k*0.45;
      for(let q=0;q<=28;q++){const t=q/28;const a=ph+t*turns*6.283;pts.push(new THREE.Vector3(Math.cos(a)*rad*0.7,y0+Math.sin(a)*rad,(t-0.5)*2.6));}
      const cv=new THREE.CatmullRomCurve3(pts);const tube=new THREE.Mesh(new THREE.TubeGeometry(cv,56,rr(0.07,0.1),5,false),k%2?COIL:COIL2);tube.castShadow=true;wg.add(tube);
      for(let q=0;q<14;q++){const p=cv.getPointAt((q+0.5)/14);const out=new THREE.Vector3(p.x>0?1:-1,rr(0.1,0.9),rr(-0.4,0.4)).normalize();outwardSpike(wg,p,out,rr(0.32,0.5),0.06);}}
    walls.push({g:wg,a,x,z,up:0,lit:0,h0:groundH(x,z)});}
  const safeA=Math.atan2(cz-ORCH.z,cx-ORCH.x);
  return {g,ropes,mound,hood,eyes,buds,knots,heart,r1,r2,cage,walls,cx,cz,gy,active:false,state:'asleep',phase:0,t:0,atk:null,next:2,cageOpen:0,roots:[],lines:[],sweepT:6,mended:false,
    safe:{x:cx+Math.cos(safeA)*-11,z:cz+Math.sin(safeA)*-11}};
})();
const duskBM=()=>oStage()>=3&&!S.blight.bramble&&MZ.hours>=17.5&&MZ.hours<=21;
/* v12.1: the old apple's crown gets its own material and thins out while she fights, so nothing hides her */
const appleLeaf=makeToon(0xffffff,{vc:true,wind:true,windAmp:0.35,rim:0.25,tag:'orchLeafBM',leaf:true});appleLeaf.transparent=true;
const canopyMeshes=[];oldApple.canopy.traverse(o=>{if(o.isMesh)canopyMeshes.push(o);});
for(const m of canopyMeshes)if(m.material===MZ.orchLeafMat)m.material=appleLeaf;let canopyK=1;
function canopyStep(dt){const fight=bm.active||bm.state==='intro';canopyK=damp(canopyK,fight?0.14:1,3,dt);appleLeaf.opacity=canopyK;appleLeaf.depthWrite=canopyK>0.9;if(MZ.orchLeafMat)appleLeaf.color.copy(MZ.orchLeafMat.color);
  for(const m of canopyMeshes)if(m.material!==appleLeaf)m.visible=canopyK>0.6;}
function bmEligible(){return !MZ.PROLOGUE&&!S.blight.bramble&&(oStage()===2||duskBM());}
HOOKS.cuttingsBlocked=()=>{if(S.blight.bramble||oStage()!==2)return null;return {ok:false,text:'Thorns have wound themselves around the old apple…'};};
function bmKnotHit(k){SFX.knock(0,300);if(k.hp>0)return;k.alive=false;k.on=false;k.m.visible=false;C.feel(0.14,0.9);_w.copy(k.m.position);if(k.m.parent!==scene)k.m.parent.localToWorld(_w);
  puff(_w.x,_w.y,_w.z,18,LEAF,0.45);sparkle(_w.x,_w.y,_w.z,14);SFX.knock(0.06,140);bmCheck();}
function bmStart(){const b=bm;b.active=true;b.state='intro';b.phase=1;b.atk=null;b.next=1.5;CB.otherBoss=true;
  for(const k of b.knots){k.alive=true;k.hp=Math.round(k.max*D().hp);k.on=k.phase===1;k.m.visible=k.phase!==2;}
  startCine({k:'The Old Orchard',t:'The Bramble Mother',s:'She has wound herself around the last old tree to keep the light out. Shoot her high knots. Light opens the thorns.'},new THREE.Vector3(b.cx,0,b.cz),
    {pivot:new THREE.Vector3(b.cx,0,b.cz),radius:14,height:5,lookY:b.gy-2.5,dir:new THREE.Vector3(player.pos.x-b.cx,0,player.pos.z-b.cz)});
  SFX.knock(0.4,70);SFX.knock(1.0,60);auSwell();cam.shake=0.5;C.ui.boss.hidden=false;renderBM();
  {const dx=player.pos.x-b.cx,dz=player.pos.z-b.cz,d=Math.hypot(dx,dz)||1;if(d>BM_R-1.2)after(0.3,()=>teleport(b.cx+dx/d*(BM_R-1.6),b.cz+dz/d*(BM_R-1.6),b.cx,b.cz));}
  if(!S.blight.sling)after(9,()=>toast('Her high knots are out of reach of the staff. The seed sling hangs on the orchard gatepost.'));}
function renderBM(){const b=bm,ui=C.ui;ui.bossName.textContent='The Bramble Mother';ui.pips.innerHTML=b.knots.map(n=>`<span class="${n.alive?(n.on?'on':''):'gone'}"></span>`).join('');
  ui.bossSub.textContent=b.phase===1?'Sling the knots high in her branches (Q)':b.phase===2?'Dodge the roots, then break the knots they leave':b.phase===3?'Flare the lantern to open the thorns over her heart':'';}
function bmCheck(){const b=bm;
  if(b.phase===1&&b.knots.filter(k=>k.phase===1).every(k=>!k.alive)){b.phase=2;b.atk=null;b.next=2;b.uproot=0;b.lurchT=1.4;for(let i=0;i<30;i++)puff(b.cx+rr(-2.2,2.2),b.gy+0.2,b.cz+rr(-2.2,2.2),2,MUD,0.5);cam.shake=1;auSwell();SFX.knock(0,55);toast('Her roots tear loose under the orchard!');C.shockwave(b.cx,b.cz,BM_R+1,6);}
  else if(b.phase===2&&!b.r1.alive&&!b.r2.alive){b.phase=3;b.atk=null;b.next=2;auSwell();toast('The thorns over her heart are thinning. Flare the lantern close to her, then strike!');}
  else if(b.phase===3&&!b.heart.alive){b.state='bare';b.atk=null;C.mendStart(BM_MEND);}
  renderBM();}
const BM_MEND={intro:'Her thorns let go. Mend her: press E (or Mend) as the ring meets the circle.',point:(n,out)=>out.set(bm.cx,bm.gy+0.6+n*0.75,bm.cz),
  step:(dt,k)=>{bm.ropes.scale.setScalar(1-k*0.25);},done:()=>bmDone()};
function bmDone(){const b=bm;b.state='mended';b.active=false;CB.otherBoss=false;C.ui.boss.hidden=true;clearBurrs();clearRoots();for(const w of b.walls)w.up=0;
  sparkle(b.cx,b.gy+3,b.cz,50);auSwell();SFX.moment();cam.shake=0.5;player.happy=8;b.mended=true;
  for(let i=0;i<40;i++)fxSoft.emit(b.cx+rr(-2,2),b.gy+rr(0.5,5),b.cz+rr(-2,2),rr(-2,2),rr(1,3),rr(-2,2),new THREE.Color(0.95,0.85,0.9),rr(0.08,0.15),rr(1,2),2,0.3,0.6,0.6);
  S.blight.bramble=true;writeSave();
  showCardBrief({k:'The Old Orchard · mended',t:'The Bramble Mother',s:'Under all those thorns, an old tree that only wanted the light. Something small is rattling in the leaves.'});
  after(5,()=>{spiritsSpawn(true);toast('Three seed-spirits shook loose from her branches. They seem to like you.');});
  after(10,()=>toast(oStage()===2?'The old apple will share its cuttings now.':'The orchard breathes easier.'));}
/* the furrow a digging root tears through the turf: torn clods that sink back after a few seconds */
const furrows=[];const CLOD=makeToon(0x4a3626,{noHeal:true,rim:0.3,tag:'clod'}),TURF=makeToon(0x5a6a34,{noHeal:true,tag:'turf'});
function furrow(x,z,a){const g=new THREE.Group();g.position.set(x,groundH(x,z),z);g.rotation.y=a;scene.add(g);
  const trench=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.08,0.42),CLOD);trench.position.y=0.02;g.add(trench);
  for(const sx of [-1,1])for(let k=0;k<2;k++){const c=new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.09,0.16),0),k?TURF:CLOD);c.position.set(sx*rr(0.32,0.45),rr(0.04,0.12),rr(-0.15,0.15));c.rotation.set(rnd()*3,rnd()*3,rnd()*3);g.add(c);}
  furrows.push({g,t:0});}
function furrowStep(dt){for(let i=furrows.length-1;i>=0;i--){const f=furrows[i];f.t+=dt;if(f.t>3.5){f.g.position.y-=dt*0.25;if(f.t>5){scene.remove(f.g);furrows.splice(i,1);}}}}
function clearRoots(){for(const f of furrows)scene.remove(f.g);furrows.length=0;for(const r of bm.roots)scene.remove(r.m);bm.roots.length=0;for(const l of bm.lines)scene.remove(l.m);bm.lines.length=0;}
const lineMat=new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,0.7,0.3),transparent:true,opacity:0.0,depthWrite:false});
function bmAttack(){const b=bm,tele=D().tele;const d=Math.hypot(player.pos.x-b.cx,player.pos.z-b.cz);
  if(b.phase>=2&&b.sweepT<=0){b.sweepT=rr(7,10);b.atk={kind:'sweep',t:0,tell:1.0*tele};return;}
  if(b.phase===2&&b.roots.length<2&&rnd()<0.6){b.atk={kind:'roots',t:0,tell:0.6*tele};b.lurchT=0.9;SFX.knock(0,58);cam.shake=Math.max(cam.shake||0,0.35);return;}
  if(rnd()<0.5||b.phase===3){b.atk={kind:'burrs',t:0,tell:0.85*tele};return;}
  b.atk={kind:'lash',t:0,tell:1.0*tele,a:Math.atan2(player.pos.x-b.cx,player.pos.z-b.cz)};}
function bmStep(dt){
  const b=bm;const show=!S.blight.bramble&&(oStage()===2||duskBM()||b.active)||b.state==='mended'&&b.ropes.scale.x>0.05;
  if(b.state==='mended'){b.ropes.scale.setScalar(Math.max(0,b.ropes.scale.x-dt*0.25));b.mound.scale.multiplyScalar(1-dt*0.3);b.hood.scale.multiplyScalar(1-dt*0.3);if(b.ropes.scale.x<=0.05){b.g.visible=false;}
    for(const w of b.walls){w.g.position.y=damp(w.g.position.y,w.h0-1.8,2,dt);}return;}
  b.g.visible=show;for(const w of b.walls)w.g.visible=show;
  if(!show)return;
  const pd=Math.hypot(player.pos.x-b.cx,player.pos.z-b.cz);
  if(b.state==='asleep'){b.ropes.rotation.y=Math.sin(MZ.simTime*0.3)*0.02;for(const w of b.walls)w.g.position.y=w.h0-1.6;
    if(bmEligible()&&pd<13&&MZ.mode==='play'&&!MZ.cine)bmStart();return;}
  if(b.state==='intro'){for(const w of b.walls){w.up=1;}wallStep(dt);if(!MZ.cine){b.state='fight';b.t=0;}return;}
  if(!b.active)return;
  CB.engagedT=MZ.simTime;
  if(pd>30){b.lost=(b.lost||0)+dt;if(b.lost>4){b.active=false;b.state='asleep';b.g.position.y=b.gy;b.g.rotation.set(0,0,0);b.uproot=0;CB.otherBoss=false;C.ui.boss.hidden=true;clearRoots();clearBurrs();toast('The Bramble Mother draws her thorns back in. She will wait.');return;}}else b.lost=0;
  const sp=D().speed;b.t+=dt;b.sweepT-=dt;
  wallStep(dt);
  for(const k of b.knots){k.flash=Math.max(0,k.flash-dt);_w.copy(k.m.position);if(k.m.parent!==scene)k.m.parent.localToWorld(_w);k.x=_w.x;k.y=_w.y;k.z=_w.z;
    k.m.material=k.flash>0?CORE_HOT:CORE;if(k.on)k.m.scale.setScalar(1+0.15*Math.sin(MZ.simTime*6));const lock=C.CB.slingLock===k;k.halo.material.opacity=lock?1:k.on?0.75:0.15;k.halo.scale.setScalar((k.phase===1?2.2:1.6)*(lock?1.5:1));}
  /* heart cage: lantern light opens it */
  b.cageOpen=Math.max(0,b.cageOpen-dt);const co=b.cageOpen>0?1:0;for(const pv of b.cage)pv.rotation.x=damp(pv.rotation.x,co*1.3,8,dt);b.heart.on=b.phase===3&&b.cageOpen>0;
  for(const e of b.eyes)e.material=b.atk&&b.atk.t<b.atk.tell?C.KNOT_HOT:HIP;
  b.hood.rotation.x=Math.sin(MZ.simTime*0.8)*0.05+(b.atk&&b.atk.t<b.atk.tell?-0.15:0);
  /* phase 2+: she has torn half out of the ground; each root attack throws her body toward you */
  if(b.phase>=2){b.uproot=Math.min(1,(b.uproot||0)+dt*0.8);b.lurchT=Math.max(0,(b.lurchT||0)-dt);const la=Math.atan2(player.pos.x-b.cx,player.pos.z-b.cz),lk=Math.sin(Math.min(1,b.lurchT/0.6)*Math.PI)*0.22;
    b.g.position.y=b.gy+0.45*b.uproot+Math.sin(MZ.simTime*1.7)*0.05;b.g.rotation.x=Math.cos(la)*lk;b.g.rotation.z=-Math.sin(la)*lk;b.mound.scale.y=0.75*(1+0.25*b.uproot);}
  /* roots in the ground */
  for(let i=b.roots.length-1;i>=0;i--){const r=b.roots[i];r.t+=dt;
    if(r.state==='dig'){const dx=player.pos.x-r.x,dz=player.pos.z-r.z,dd=Math.hypot(dx,dz)||1;const v=3.4*sp;r.x+=dx/dd*v*dt;r.z+=dz/dd*v*dt;r.m.position.set(r.x,groundH(r.x,r.z)+0.05,r.z);
      if(rnd()<dt*14)puff(r.x,groundH(r.x,r.z)+0.1,r.z,2,MUD,0.25);
      r.fd=(r.fd||0)+v*dt;if(r.fd>0.35){r.fd=0;furrow(r.x,r.z,Math.atan2(dx,dz));}
      if(dd<0.9||r.t>2.6){r.state='tell';r.t=0;r.ring=new THREE.Mesh(new THREE.RingGeometry(1.0,1.3,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xb04020,transparent:true,opacity:0.7,depthWrite:false}));r.ring.position.set(r.x,groundH(r.x,r.z)+0.08,r.z);scene.add(r.ring);}}
    else if(r.state==='tell'){r.ring.material.opacity=0.4+0.4*Math.sin(r.t*25);if(r.t>0.75*D().tele){r.state='up';r.t=0;scene.remove(r.ring);SFX.knock(0,90);C.feel(0.03,0.45);
        for(let k=0;k<7;k++){const c=thornCone(1.1,0.12);const a=k/7*6.28;c.position.set(Math.cos(a)*0.5,0.5,Math.sin(a)*0.5);c.rotation.set(Math.sin(a)*0.4,0,-Math.cos(a)*0.4);r.m.add(c);}
        puff(r.x,groundH(r.x,r.z)+0.3,r.z,14,MUD,0.4);if(Math.hypot(player.pos.x-r.x,player.pos.z-r.z)<1.35&&player.pos.y-groundH(player.pos.x,player.pos.z)<0.8){if(!C.nearMissCheck())C.hurt(1,r.x,r.z);}
        const k=!b.r1.alive||b.r1.used?(!b.r2.alive||b.r2.used?null:b.r2):b.r1;if(k&&k.alive){k.used=true;k.m.visible=true;k.on=true;k.m.position.set(r.x,groundH(r.x,r.z)+0.9,r.z);r.knot=k;}}}
    else if(r.state==='up'){if(r.t>3.6){if(r.knot&&r.knot.alive){r.knot.on=false;r.knot.m.visible=false;r.knot.used=false;}scene.remove(r.m);b.roots.splice(i,1);}}}
  for(let i=b.lines.length-1;i>=0;i--){const l=b.lines[i];l.t+=dt;l.m.material.opacity=l.t<l.tell?0.25+0.5*Math.min(1,l.t/l.tell):Math.max(0,0.8-(l.t-l.tell)*2);
    if(!l.done&&l.t>=l.tell){l.done=true;SFX.knock(0,110);C.feel(0.03,0.4);for(let k=0;k<9;k++){const x=b.cx+Math.sin(l.a)*(1.5+k),z=b.cz+Math.cos(l.a)*(1.5+k);puff(x,groundH(x,z)+0.2,z,3,MUD,0.3);const c=thornCone(0.9,0.1);c.position.set(x,groundH(x,z)+0.4,z);scene.add(c);after(0.9,()=>scene.remove(c));}
      const px=player.pos.x-b.cx,pz=player.pos.z-b.cz;const along=px*Math.sin(l.a)+pz*Math.cos(l.a),across=Math.abs(px*Math.cos(l.a)-pz*Math.sin(l.a));if(along>1&&along<10.5&&across<0.85){if(!C.nearMissCheck())C.hurt(1,b.cx,b.cz);}}
    if(l.t>l.tell+0.5){scene.remove(l.m);b.lines.splice(i,1);}}
  if(b.state!=='fight')return;
  b.drum=(b.drum||0)-dt;if(b.drum<=0){b.drum=0.55/sp;SFX.knock(0,b.phase===3?80:68);}
  if(!b.atk){b.next-=dt*sp;if(b.next<=0)bmAttack();return;}
  const a=b.atk;a.t+=dt;
  if(a.kind==='burrs'){for(const bd of b.buds)bd.scale.setScalar(a.t<a.tell?1+0.4*Math.min(1,a.t/a.tell):1);
    if(!a.done&&a.t>=a.tell){a.done=true;const n=b.phase===1?3:5;for(const bd of b.buds){bd.getWorldPosition(_w);for(let i=0;i<Math.ceil(n/2);i++){const ang=Math.atan2(player.pos.x-_w.x,player.pos.z-_w.z)+(i-0.5)*0.22;fireBurr(_w.x,_w.y,_w.z,_w.x+Math.sin(ang)*12,player.pos.y+0.9,_w.z+Math.cos(ang)*12,9*sp);}}}
    if(a.t>a.tell+0.6){b.atk=null;b.next=rr(1.4,2.2);}}
  else if(a.kind==='lash'){if(!a.line){const len=9.5;const m=new THREE.Mesh(new THREE.PlaneGeometry(0.9,len).rotateX(-Math.PI/2),lineMat.clone());const mx=b.cx+Math.sin(a.a)*(1.5+len/2),mz=b.cz+Math.cos(a.a)*(1.5+len/2);m.position.set(mx,groundH(mx,mz)+0.09,mz);m.rotation.y=a.a;m.renderOrder=4;scene.add(m);a.line={m,a:a.a,t:0,tell:a.tell};b.lines.push(a.line);}
    if(a.t>a.tell+0.7){b.atk=null;b.next=rr(1.2,2.0);}}
  else if(a.kind==='roots'){if(!a.done&&a.t>=a.tell){a.done=true;const m=new THREE.Group();const ang=rnd()*6.28;const x=b.cx+Math.sin(ang)*1.6,z=b.cz+Math.cos(ang)*1.6;scene.add(m);
      const hump=new THREE.Mesh(new THREE.SphereGeometry(0.45,8,6),new THREE.MeshToonMaterial({color:0x5a4836}));hump.scale.set(1,0.35,1.4);m.add(hump);b.roots.push({m,x,z,t:0,state:'dig'});SFX.knock(0,75);}
    if(a.t>a.tell+0.4){b.atk=null;b.next=rr(1.0,1.6);}}
  else if(a.kind==='sweep'){b.ropes.rotation.y=a.t<a.tell?Math.sin(a.t*30)*0.05:b.ropes.rotation.y;if(!a.done&&a.t>=a.tell){a.done=true;C.shockwave(b.cx,b.cz,BM_R-0.3,6.2);C.tip('jump2','Jump (Space) over her thorn sweep.');}
    if(a.t>a.tell+1.0){b.atk=null;b.next=rr(1.0,1.6);}}
}
function wallStep(dt){const b=bm;for(const w of b.walls){w.lit=Math.max(0,w.lit-dt);const want=b.active&&w.lit<=0?1:0;w.up=damp(w.up,want,w.lit>0?7:2.5,dt);w.g.position.y=w.h0-1.6+w.up*1.6;
    if(w.up>0.6){const dx=player.pos.x-b.cx,dz=player.pos.z-b.cz,d=Math.hypot(dx,dz);const a=Math.atan2(dz,dx);if(Math.abs(angWrap(a-w.a))<6.283/28+0.08&&Math.abs(d-BM_R)<0.9){const push=d<BM_R?-1:1;player.pos.x=b.cx+dx/d*(BM_R+push*0.95);player.pos.z=b.cz+dz/d*(BM_R+push*0.95);}}}}
/* the lantern opens walls and her heart cage */
const origFlare=C.flareRelease;
function flareHook(){const b=bm;if(!b.g.visible)return;const fx=Math.sin(player.face),fz=Math.cos(player.face);
  for(const w of b.walls){const dx=w.x-player.pos.x,dz=w.z-player.pos.z,d=Math.hypot(dx,dz);if(d<7.5&&(dx*fx+dz*fz)/(d||1)>0.35){w.lit=6;}}
  const hx=b.cx+0,hz=b.cz+1.45,dh=Math.hypot(hx-player.pos.x,hz-player.pos.z);if(b.phase===3&&dh<8){b.cageOpen=4.5;SFX.knock(0,420);C.popText('The thorns open!');}}
const flareWatch={last:0};
HOOKS.sim.push(()=>{if(CB.flare.cool>2.3&&MZ.simTime-flareWatch.last>0.5){flareWatch.last=MZ.simTime;flareHook();}});
CB.reg.push(()=>bm.active?bm.knots.filter(k=>k.alive&&k.on):[]);
CB.bossFrame=()=>bm.active&&bm.state!=='intro'?{x:bm.cx,z:bm.cz,dist:15,pitch:0.45,lift:bm.phase===1?2.4:0.8}:null;   /* v12.1: lower and further out, so her body and high knots are in view */
CB.safeOverride=()=>bm.active?{x:bm.safe.x,z:bm.safe.z,look:{x:bm.cx,z:bm.cz}}:null;
(CB.onWash||(CB.onWash=[])).push(()=>{if(!bm.active)return;bm.atk=null;bm.next=2.5;clearRoots();clearBurrs();for(const w of bm.walls)w.lit=4;});

/* ---------- seed-spirits: little companions that rattle near secrets ---------- */
const spirits=[];
function makeSpirit(i){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8),makeToon([0x8a6a3a,0x9a7a44,0x7a5a30][i%3],{noHeal:true,rim:0.5}));body.scale.set(0.9,1.15,0.9);body.position.y=0.26;g.add(body);addOutline(body,0.01);
  for(const sx of [-1,1]){const ear=new THREE.Mesh(new THREE.SphereGeometry(0.08,6,5),makeToon(0x6aa03a,{noHeal:true}));ear.scale.set(0.35,1,0.7);ear.position.set(sx*0.1,0.46,0);ear.rotation.z=sx*0.5;g.add(ear);
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.14,4),makeToon(0x3a2a1a,{noHeal:true}));leg.position.set(sx*0.06,0.07,0);g.add(leg);
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.022,6,5),makeToon(0x1a120a,{noHeal:true}));eye.position.set(sx*0.06,0.3,0.14);g.add(eye);}
  const st=new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.015,0.1,4),makeToon(0x4a3a20,{noHeal:true}));st.position.y=0.48;g.add(st);
  scene.add(g);return {g,body,x:player.pos.x,z:player.pos.z,ph:rnd()*6,hop:0,rat:0};}
function spiritsSpawn(fromTree){if(spirits.length)return;for(let i=0;i<3;i++){const s=makeSpirit(i);if(fromTree){s.x=bm.cx+rr(-1,1);s.z=bm.cz+rr(-1,1);}else{s.x=player.pos.x+rr(-2,2);s.z=player.pos.z+rr(-2,2);}spirits.push(s);}}
function spiritsStep(dt){if(!spirits.length){if(S.blight.bramble&&MZ.mode==='play')spiritsSpawn(false);return;}
  const sec=nearestSecret();const sniff=sec&&sec.d<22;
  spirits.forEach((s,i)=>{const lead=i===0?{x:player.pos.x-Math.sin(player.face)*1.2,z:player.pos.z-Math.cos(player.face)*1.2}:{x:spirits[i-1].x,z:spirits[i-1].z};
    let tx=lead.x,tz=lead.z;if(sniff&&i===0){tx=lerp(player.pos.x,sec.x,0.35);tz=lerp(player.pos.z,sec.z,0.35);}
    const dx=tx-s.x,dz=tz-s.z,d=Math.hypot(dx,dz);if(d>25){s.x=player.pos.x+rr(-1,1);s.z=player.pos.z+rr(-1,1);}
    else if(d>(i===0?0.6:0.75)){const v=Math.min(d*2.4,7);s.x+=dx/d*v*dt;s.z+=dz/d*v*dt;s.hop+=dt*14;}
    const y=groundH(s.x,s.z)+Math.abs(Math.sin(s.hop))*0.12;s.g.position.set(s.x,Math.max(y,MZ.levelCur),s.z);s.g.rotation.y=Math.atan2(dx,dz);
    s.rat-=dt;if(s.rat<=0){s.rat=sniff?rr(0.25,0.6):rr(3,7);if(Math.hypot(s.x-player.pos.x,s.z-player.pos.z)<14){SFX.knock(0,1400+i*120);SFX.knock(0.05,1600+i*90);}s.g.rotation.z=0.4;}
    s.g.rotation.z=damp(s.g.rotation.z,0,10,dt);if(sniff&&i===0&&sec.d<9&&rnd()<dt*4)fxGlow.emit(sec.x+rr(-0.4,0.4),sec.y+rr(0,0.6),sec.z+rr(-0.4,0.4),0,0.4,0,new THREE.Color(2,1.8,1.0),0.08,0.8,0,0.5,0);});
  if(sniff&&!CB.tips.sniff){CB.tips.sniff=true;toast('The seed-spirits are rattling. Something is hidden near here.');}}

/* ---------- three hidden places ---------- */
const SECRETS=[];
function nearestSecret(){let best=null;for(const s of SECRETS){if(S.blight[s.id])continue;const d=Math.hypot(s.x-player.pos.x,s.z-player.pos.z);if(!best||d<best.d)best={...s,d};}return best;}
const OW=(ox,oz)=>({x:ORCH.x+ox,z:ORCH.z+oz});
/* the old swing on a bent oak at the orchard's far corner */
(()=>{const p=OW(-17,13);const gy=groundH(p.x,p.z);const g=new THREE.Group();g.position.set(p.x,gy,p.z);g.rotation.y=0.8;scene.add(g);const bark=makeToon(0x5a4636,{});
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.55,4.2,8),bark);trunk.position.y=2.1;trunk.rotation.z=0.12;trunk.castShadow=true;g.add(trunk);
  const limb=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.24,3.4,6),bark);limb.position.set(1.4,3.7,0);limb.rotation.z=1.35;g.add(limb);
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2.4,1),makeToon(0x4a7a36,{}));crown.position.set(0.6,5.2,0);crown.scale.set(1.2,0.8,1.1);crown.castShadow=true;g.add(crown);
  const rope=makeToon(0xb89a6a,{noHeal:true});const sw=new THREE.Group();sw.position.set(2.3,3.6,0);g.add(sw);
  for(const sz of [-0.32,0.32]){const r=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,2.7,4),rope);r.position.set(0,-1.35,sz);sw.add(r);}
  const seat=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.06,0.8),makeToon(0x7a5a3c,{noHeal:true}));seat.position.y=-2.7;sw.add(seat);
  for(let k=0;k<5;k++){const v=new THREE.Mesh(new THREE.IcosahedronGeometry(0.7,0),makeToon(0x3f6a32,{}));v.position.set(rr(1.2,3.2),rr(0.3,0.9),rr(-1.2,1.2));g.add(v);}
  g.updateMatrixWorld(true);const seatW=new THREE.Vector3(2.3,0.9,0);g.localToWorld(seatW);
  const sec={id:'swing',x:seatW.x,z:seatW.z,y:gy+1};SECRETS.push(sec);let swingT=-1;
  INTERACTS.push({x:seatW.x,z:seatW.z,r:2.0,state(){if(swingT>=0)return null;return {ok:true,text:S.blight.swing?'Sit on the old swing':'An old swing, hidden in the vines',hold:0.7};},
    done(){swingT=0;teleport(seatW.x,seatW.z,ORCH.x,ORCH.z);player.busy=6.5;SFX.rustle();}});
  HOOKS.sim.push(dt=>{if(swingT<0)return;swingT+=dt;sw.rotation.z=Math.sin(swingT*2.1)*0.5*Math.min(1,swingT)*(swingT>5.5?Math.max(0,6.5-swingT):1);
    _v.set(0,-2.65,0);sw.localToWorld(_v);player.pos.set(_v.x,_v.y-0.35,_v.z);player.vel.set(0,0,0);
    if(swingT>3&&!S.blight.swing){S.blight.swing=true;MZ.scrap.want='The old swing';const kp='The old swing still holds';if(!S.keepsakes.includes(kp))S.keepsakes.push(kp);writeSave();
      after(0.5,()=>showCardBrief({k:'The Old Orchard · a hidden place',t:'The old swing',s:'It still holds. From up here the whole orchard leans with the wind. A page for your scrapbook.'}));SFX.moment();}
    if(swingT>6.5){swingT=-1;teleport(seatW.x+1.2,seatW.z,ORCH.x,ORCH.z);}});})();
/* the buried tin under the orchard wall */
(()=>{const p=OW(15,13);const gy=groundH(p.x,p.z);const mound=new THREE.Mesh(new THREE.SphereGeometry(0.6,10,6),makeToon(0x5a4a36,{}));mound.scale.set(1,0.25,0.8);mound.position.set(p.x,gy,p.z);scene.add(mound);
  const stake=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.04,0.7,5),makeToon(0x6b4c33,{}));stake.position.set(p.x+0.5,gy+0.3,p.z);stake.rotation.z=0.3;scene.add(stake);
  SECRETS.push({id:'tin',x:p.x,z:p.z,y:gy+0.3});
  INTERACTS.push({x:p.x,z:p.z,r:1.9,state(){if(S.blight.tin)return null;return {ok:true,text:'The soil here is soft. Dig?',hold:1.6};},
    done(){S.blight.tin=true;mound.visible=false;puff(p.x,gy+0.2,p.z,16,MUD,0.4);SFX.get();if(!S.cosmetics.bands)S.cosmetics.bands={};S.cosmetics.bands.tin=true;
      const kp='A buried seed tin: plum, pear, and one packet marked only with a heron';if(!S.keepsakes.includes(kp))S.keepsakes.push(kp);writeSave();MZ.renderValleyPane();
      showCardBrief({k:'The Old Orchard · a hidden place',t:'A buried seed tin',s:'Plum, pear, and one packet marked only with a heron. Its ribbon would look well on a hat.'});
      after(5,()=>toast('New in your wardrobe: the Seed-tin band (journal, Valley & settings).'));}});})();
/* the crow's stash, high in a lone poplar: knock it down with the sling */
(()=>{const p=OW(-9,-21);const gy=groundH(p.x,p.z);const g=new THREE.Group();g.position.set(p.x,gy,p.z);scene.add(g);const bark=makeToon(0x6a5a46,{});
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.32,7,7),bark);trunk.position.y=3.5;trunk.castShadow=true;g.add(trunk);
  for(let k=0;k<4;k++){const c=new THREE.Mesh(new THREE.IcosahedronGeometry(1.0-k*0.15,1),makeToon(0x557a3a,{}));c.position.y=4.2+k*0.9;c.scale.set(1,1.3,1);c.castShadow=true;g.add(c);}
  const nest=new THREE.Group();nest.position.set(0.6,5.4,0.4);g.add(nest);const nm=new THREE.Mesh(new THREE.TorusGeometry(0.28,0.12,6,12),makeToon(0x7a6040,{noHeal:true}));nm.rotation.x=Math.PI/2;nest.add(nm);
  const glint=new THREE.Mesh(new THREE.SphereGeometry(0.06,6,5),C.glowMat(2.4,2.1,1.2));glint.position.y=0.12;nest.add(glint);
  g.updateMatrixWorld(true);const nw=new THREE.Vector3();nest.getWorldPosition(nw);
  const sec={id:'crow',x:nw.x,z:nw.z,y:nw.y};SECRETS.push(sec);let fall=-1;
  const target={x:nw.x,y:nw.y,z:nw.z,r:0.5,get alive(){return !S.blight.crow&&fall<0;},sling(){fall=0;SFX.knock(0,500);return true;}};
  C.slingables.push(target);
  HOOKS.sim.push(dt=>{if(!S.blight.crow&&fall<0)glint.visible=Math.sin(MZ.simTime*3)>0.6;if(fall<0)return;fall+=dt;nest.position.y=Math.max(0.15,5.4-fall*fall*9);nest.rotation.z=fall*4;
    if(nest.position.y<=0.15&&!S.blight.crow){S.blight.crow=true;nest.getWorldPosition(_v);puff(_v.x,_v.y+0.2,_v.z,12,LEAF,0.3);sparkle(_v.x,_v.y+0.4,_v.z,12);SFX.get();
      if(!S.cosmetics.bands)S.cosmetics.bands={};S.cosmetics.bands.crow=true;const kp="A crow's hoard: a button, a bottle cap, and a small brass clapper from a bell";if(!S.keepsakes.includes(kp))S.keepsakes.push(kp);writeSave();MZ.renderValleyPane();
      showCardBrief({k:'The Old Orchard · a hidden place',t:"The crow's stash",s:'A button, a bottle cap, and a small brass clapper from a bell. And one blue-black feather, just right for a hatband.'});
      after(5,()=>toast("New in your wardrobe: the Crow's-feather band."));}});})();

/* ---------- a sudden summer shower under the old apple ---------- */
HOOKS.sim.push(dt=>{if(!S.blight.bramble||S.blight.shower||MZ.mode!=='play'||MZ.cine||bm.state==='mended'&&bm.ropes.scale.x>0.05)return;if(MZ.SEASON==='winter'||MZ.nightF>0.4)return;
  if(Math.hypot(player.pos.x-bm.cx,player.pos.z-bm.cz)<5.5){S.blight.shower=true;writeSave();MZ.shower(45);SFX.rustle();
    after(1.5,()=>toast('A sudden shower. Under the old apple it stays dry, and the whole orchard smells of rain.'));after(30,()=>toast('The rain moves off over the hill. The long grass is still nodding.'));}});

/* ---------- hooks ---------- */
HOOKS.sim.push(dt=>{if(MZ.mode!=='play'&&MZ.mode!=='title')return;
  slingPost.sl.visible=!S.blight.sling;guardStep();for(const t of thorns)thornStep(t,dt);burrStep(dt);bmStep(dt);furrowStep(dt);canopyStep(dt);if(MZ.mode==='play')spiritsStep(dt);});
HOOKS.vis.push(()=>{if(bm.active&&!C.ui.boss.hidden)renderBM();});
C.brambleStart=()=>{bm.state='asleep';bmStart();};
C.spawnThorn=(x,z)=>spawnThorn(x??player.pos.x+Math.sin(player.face)*6,z??player.pos.z+Math.cos(player.face)*6,null);
C.orchard={bm,thorns,spirits,SECRETS,burrs,spiritsSpawn};
