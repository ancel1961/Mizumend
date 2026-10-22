/* ================================================================
   Mizumend · combat: the mending staff, the heron lantern, dodging,
   stillwater blight (muck-mites, silt-crabs) and the Old Koi.
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
const ARMOR=makeToon(0x8a8272,{noHeal:true,rim:0.6,tag:'armor'}),EDGE=makeToon(0xe2d2a8,{noHeal:true,rim:0.8,tag:'armorEdge'});
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
  tip('flare','The heron lantern: hold right-click (or R) and let go to flare. Silt-crabs flip over; big things flinch.',0.4);}
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
    const ov=CB.safeOverride&&CB.safeOverride();const safe=ov||(koi.active?koi.safe:{x:2,z:60});const look=ov?ov.look:koi.active?koi.c:{x:0,z:0};teleport(safe.x,safe.z,look.x,look.z);
    for(const e of CB.enemies)removeEnemy(e,false);CB.enemies.length=0;CB.pockets.clear();clearHazards();
    CB.breaths=CB.max;CB.inv=2;koi.onWash();for(const f of (CB.onWash||[]))f();
    setTimeout(()=>{ui.fade.classList.remove('on');CB.down=false;toast('You wash up on the bank, soggy but fine. Nothing is lost.');},700);
  },900);}

/* ---------- targets: enemies and knots share one interface ---------- */
function targets(){const out=[];for(const e of CB.enemies)if(!e.dead&&e.up>=1)out.push(e);if(koi.active)for(const k of koi.knots)if(k.alive&&k.on)out.push(k);for(const f of CB.reg)for(const t of f())out.push(t);return out;}

/* ---------- muck-mites and silt-crabs ---------- */
function makeMite(){const g=new THREE.Group();const b=new THREE.Mesh(new THREE.SphereGeometry(0.32,10,8),MUCK);b.scale.set(1,0.8,1);b.position.y=0.26;b.castShadow=true;g.add(b);addOutline(b,0.012);
  for(let i=0;i<3;i++){const d=new THREE.Mesh(new THREE.SphereGeometry(0.09,6,5),MUCK);d.position.set(Math.cos(i*2.1)*0.26,0.08,Math.sin(i*2.1)*0.26);g.add(d);}
  const k=new THREE.Mesh(new THREE.SphereGeometry(0.11,8,6),KNOT);k.position.set(0,0.42,0.18);g.add(k);
  const rim=new THREE.Mesh(new THREE.SphereGeometry(0.36,10,8),new THREE.MeshBasicMaterial({color:new THREE.Color(0.75,0.95,0.3),transparent:true,opacity:0.32,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false}));rim.scale.set(1.05,0.86,1.05);rim.position.y=0.26;g.add(rim);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xc8e060,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));halo.position.set(0,0.42,0.18);halo.scale.setScalar(0.7);g.add(halo);
  for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,5),glowMat(1.6,1.5,1.2));e.position.set(sx*0.1,0.32,0.26);g.add(e);}
  return {g,body:b,knot:k,rim,halo};}
function makeCrab(){const g=new THREE.Group();const sh=new THREE.Mesh(new THREE.SphereGeometry(0.55,12,8),SILT);sh.scale.set(1.3,0.55,1.05);sh.position.y=0.38;sh.castShadow=true;g.add(sh);addOutline(sh,0.014);
  const plate=new THREE.Mesh(new THREE.BoxGeometry(1.15,0.42,0.14),ARMOR);plate.position.set(0,0.42,0.56);plate.rotation.x=-0.35;g.add(plate);addOutline(plate,0.02);
  const edge=new THREE.Mesh(new THREE.BoxGeometry(1.22,0.06,0.18),EDGE);edge.position.set(0,0.64,0.5);edge.rotation.x=-0.35;g.add(edge);
  for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.14,6,5),MOSS);m.position.set(-0.4+i*0.4,0.62,0.46);m.scale.y=0.5;g.add(m);}
  const claws=[];for(const sx of [-1,1]){const c=new THREE.Group();c.position.set(sx*0.62,0.4,0.42);g.add(c);const a=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.14,0.42),SILT);a.position.z=0.2;c.add(a);
    const p1=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.3,5),MUCK);p1.rotation.x=Math.PI/2;p1.position.set(sx*0.05,0.04,0.48);c.add(p1);claws.push(c);}
  const legs=[];for(let i=0;i<6;i++){const sx=i<3?-1:1;const l=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.05,0.05),MUCK);l.position.set(sx*0.62,0.18,-0.2+(i%3)*0.22);l.rotation.z=sx*0.5;g.add(l);legs.push(l);}
  const k=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6),KNOT);k.position.set(0,0.58,-0.42);g.add(k);
  for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.045,6,5),glowMat(1.6,1.5,1.2));e.position.set(sx*0.2,0.62,0.5);g.add(e);}
  return {g,body:sh,knot:k,claws,legs};}
function spawnEnemy(type,x,z,pocket){
  const m=type==='mite'?makeMite():makeCrab();m.g.position.set(x,groundH(x,z)-0.6,z);scene.add(m.g);
  const e={type,...m,x,z,y:groundH(x,z),face:Math.atan2(player.pos.x-x,player.pos.z-z),hp:Math.round((type==='mite'?1:3)*D().hp),state:'rise',t:0,up:0,stunT:0,flip:0,pocket,dead:false,vx:0,vz:0,r:type==='mite'?0.35:0.7,ph:rnd()*6,
    stun(){if(this.type==='crab'){this.flip=3.2;this.state='flipped';this.t=0;SFX.knock(0,420);}else{this.stunT=2;this.state='stun';}},
    hit(dmg,dx,dz){
      if(this.type==='crab'&&this.flip<=0){const fx=Math.sin(this.face),fz=Math.cos(this.face);if(-(dx*fx+dz*fz)>Math.cos(1.15))return 'clang';}
      this.hp-=dmg*(this.flip>0?2:1);this.vx=dx*4;this.vz=dz*4;this.kbT=0.15;this.flash=0.12;
      puff(this.x,this.y+0.4,this.z,6,MUD,0.18);fxSoft.emit(this.x,this.y+0.6,this.z,dx*2,2,dz*2,DROP,0.12,0.5,6,0.5);
      if(this.hp<=0)popEnemy(this);else if(this.type==='mite'){this.state='recover';this.t=0;}
      return true;}};
  CB.enemies.push(e);return e;}
function popEnemy(e){e.dead=true;for(let i=0;i<14;i++)fxSoft.emit(e.x+rr(-.3,.3),e.y+0.4,e.z+rr(-.3,.3),rr(-2,2),rr(1.5,3.5),rr(-2,2),DROP,rr(0.08,0.16),rr(0.5,0.9),7,0.4);
  sparkle(e.x,e.y+0.5,e.z,8);addRipple(e.x,e.z,0.8);SFX.get();
  if(CB.breaths<CB.max&&rnd()<(e.type==='crab'?0.6:0.25)){CB.breaths++;popText('+1 breath');}
  after(0.05,()=>removeEnemy(e,true));}
function removeEnemy(e,checkPocket){scene.remove(e.g);e.dead=true;const i=CB.enemies.indexOf(e);if(i>=0)CB.enemies.splice(i,1);
  if(checkPocket&&e.pocket!=null&&!CB.enemies.some(o=>o.pocket===e.pocket)){CB.pockets.delete(e.pocket);CB.cleared.add(e.pocket);const p=piles[e.pocket];
    if(p){sparkle(p.x,groundH(p.x,p.z)+1,p.z,16);auSwell();toast('The blight lets go of the pile. Hold E to clear it.');}}}
function enemyStep(e,dt){
  const sp=D().speed,tele=D().tele;e.t+=dt;e.flash=Math.max(0,(e.flash||0)-dt);const gh=groundH(e.x,e.z);
  if(e.state==='rise'){if(!e.splashed){e.splashed=true;addRipple(e.x,e.z,1.1);SFX.splash();for(let i=0;i<10;i++)fxSoft.emit(e.x,gh+0.1,e.z,rr(-1.5,1.5),rr(2,3.5),rr(-1.5,1.5),MUD,rr(0.1,0.2),rr(0.4,0.7),7,0.4);}e.up=Math.min(1,e.t/0.7);e.y=gh-0.6*(1-e.up);if(e.up>=1){e.state='seek';e.t=0;}if(rnd()<dt*12)puff(e.x,gh+0.1,e.z,1,MUD,0.2);place(e);return;}
  const dx=player.pos.x-e.x,dz=player.pos.z-e.z,d=Math.hypot(dx,dz)||1;
  if(e.kbT>0){e.kbT-=dt;e.x+=e.vx*dt;e.z+=e.vz*dt;}
  if(e.type==='mite'){
    if(e.state==='stun'){e.stunT-=dt;if(e.stunT<=0){e.state='seek';e.t=0;}}
    else if(e.state==='seek'){const want=Math.atan2(dx,dz);e.face+=angWrap(want-e.face)*Math.min(1,dt*6);if(d>3.0)move(e,Math.sin(e.face)*2.3*sp,Math.cos(e.face)*2.3*sp,dt);
      if(d<3.4&&e.t>0.5){e.state='tell';e.t=0;e.lx=dx/d;e.lz=dz/d;}}
    else if(e.state==='tell'){if(e.t>0.62*tele){e.state='lunge';e.t=0;SFX.jump();}}
    else if(e.state==='lunge'){move(e,e.lx*8*sp,e.lz*8*sp,dt);if(Math.hypot(player.pos.x-e.x,player.pos.z-e.z)<0.75&&Math.abs(player.pos.y-e.y)<1){if(!nearMissCheck())hurt(1,e.x,e.z);}if(e.t>0.42){e.state='recover';e.t=0;}}
    else if(e.state==='recover'){if(e.t>0.9/sp){e.state='seek';e.t=0;}}
    const sq=e.state==='tell'?1+0.3*Math.min(1,e.t/(0.62*tele)):1;const st=e.state==='lunge'?1.45:1;e.body.scale.set(sq*1.05/Math.sqrt(st),0.8/sq,sq*1.05*st);
    const hot=e.state==='tell'||e.state==='lunge';e.halo.material.opacity=hot?0.9:0.4+0.15*Math.sin(MZ.simTime*5+e.ph);e.halo.scale.setScalar(hot?1.2:0.7);e.rim.material.opacity=hot?0.6:0.3;e.rim.material.color.setRGB(hot?1.0:0.75,hot?0.7:0.95,0.3);
    e.knot.material=e.state==='tell'||e.state==='lunge'?KNOT_HOT:KNOT;
    e.hop=e.state==='lunge'?Math.sin(clamp(e.t/0.42,0,1)*Math.PI)*0.7:e.state==='seek'?Math.abs(Math.sin(e.t*9+e.ph))*0.12:0;
  }else{
    if(e.flip>0){e.flip-=dt;e.g.rotation.z=lerp(e.g.rotation.z,Math.PI,Math.min(1,dt*10));for(const l of e.legs)l.rotation.x=Math.sin(e.t*20+l.position.z*9)*0.6;
      if(e.flip<=0){e.state='seek';e.t=0;SFX.knock(0,300);}place(e);return;}
    e.g.rotation.z=lerp(e.g.rotation.z,0,Math.min(1,dt*10));
    const want=Math.atan2(dx,dz);const turn=e.state==='tell'||e.state==='snap'?0.6:2.1*sp;e.face+=clamp(angWrap(want-e.face),-turn*dt,turn*dt);
    if(e.state==='seek'){const side=Math.sin(e.t*0.9+e.ph)>0?1:-1;const tx=Math.sin(e.face),tz=Math.cos(e.face);
      if(d>4.2)move(e,tx*1.8*sp,tz*1.8*sp,dt);else move(e,-tz*side*1.4*sp,tx*side*1.4*sp,dt);
      if(d<2.6&&Math.abs(angWrap(want-e.face))<0.6&&e.t>1.0){e.state='tell';e.t=0;}}
    else if(e.state==='tell'){if(e.t>0.82*tele){e.state='snap';e.t=0;SFX.knock(0,520);
      if(d<2.0&&Math.abs(angWrap(want-e.face))<0.9){if(!nearMissCheck())hurt(1,e.x,e.z);}}}
    else if(e.state==='snap'){if(e.t>0.25){e.state='recover';e.t=0;}}
    else if(e.state==='recover'){if(e.t>0.8/sp){e.state='seek';e.t=0;}}
    const raise=e.state==='tell'?Math.min(1,e.t/0.3):e.state==='snap'?1-e.t/0.25:0;for(const c of e.claws){c.rotation.x=-raise*0.9;c.position.y=0.4+raise*0.2;}
    for(const l of e.legs)l.rotation.x=e.state==='seek'?Math.sin(e.t*14+l.position.z*9)*0.35:0;
    e.knot.material=e.state==='tell'?KNOT_HOT:KNOT;e.hop=0;
  }
  place(e);
}
function move(e,vx,vz,dt){const nx=e.x+vx*dt,nz=e.z+vz*dt;if(MZ.depthAt(nx,nz)<0.7){e.x=nx;e.z=nz;}}
function place(e){e.y=groundH(e.x,e.z)-(e.up<1?0.6*(1-e.up):0);e.g.position.set(e.x,e.y+(e.hop||0),e.z);e.g.rotation.y=e.face;e.g.visible=true;
  if(e.flash>0)e.g.scale.setScalar(1.12);else e.g.scale.setScalar(1);}

/* ---------- blight pockets on the debris piles ---------- */
function pocketFor(i){const c=piles.filter(p=>p.cleared).length;return c===0?{m:3,c:0}:c===1?{m:4,c:0}:c<4?{m:3,c:1}:{m:2,c:2};}
function pocketStep(){if(stage()>=1)return;
  piles.forEach((p,i)=>{if(p.cleared||CB.cleared.has(i)||CB.pockets.has(i))return;if(Math.hypot(player.pos.x-p.x,player.pos.z-p.z)>13)return;
    const f=pocketFor(i);const n=f.m+f.c;CB.pockets.set(i,true);CB.engagedT=MZ.simTime;
    for(let k=0;k<n;k++){const a=rnd()*6.28,r=rr(2.6,4.8);let x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;if(MZ.depthAt(x,z)>0.6){x=p.x+Math.cos(a)*1.8;z=p.z+Math.sin(a)*1.8;}
      after(k*0.35,()=>spawnEnemy(k<f.m?'mite':'crab',x,z,i));}
    SFX.knock(0,110);SFX.knock(0.2,90);popText('Blight!');
    if(!CB.tips.first){CB.tips.first=true;after(0.6,()=>toast("Muck-mites! Grab the old boathook from the debris: it's a mending staff now. Click or F to strike."));after(6,()=>toast('Too much? Gentle mode is in the journal, under Valley & settings.'));}});}
HOOKS.pileBlocked=(p)=>{const i=piles.indexOf(p);if(CB.pockets.has(i)||(!CB.cleared.has(i)&&stage()<1))return {ok:false,text:'Blight clings to this pile · break it first (click or F to strike)'};return null;};

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
  const crust=makeToon(0x3b3a2e,{noHeal:true,rim:0.35,tag:'koiCrust'}),skin=makeToon(0xf2ece0,{noHeal:true,rim:0.45,tag:'koiSkin'}),patch=makeToon(0xe2602a,{noHeal:true,rim:0.4,tag:'koiPatch'});
  const RAD=[0.62,0.95,1.12,1.18,1.12,1.0,0.82,0.62,0.44],segs=[];
  RAD.forEach((r,i)=>{const z=3.0-i*0.8;const m=new THREE.Mesh(new THREE.SphereGeometry(r,14,10),crust);m.scale.set(1,0.82,0.95);m.position.set(0,0,z);m.castShadow=true;body.add(m);segs.push(m);});
  const patches=[];for(let i=0;i<7;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.45,10,8),patch);const zi=1+(i%6);m.position.set((i%2?1:-1)*0.45,0.42,3.0-zi*0.8);m.scale.set(1,0.45,1.3);m.visible=false;body.add(m);patches.push(m);}
  const lumps=[];{const gA=[],gB=[];for(let i=0;i<22;i++){const zi=(i*7)%9;const r=RAD[zi];const a=rr(-1.2,1.2)+(i%2?0:Math.PI*0.5);const geo=new THREE.DodecahedronGeometry(rr(0.22,0.42),0);
    const pos=new THREE.Vector3(Math.sin(a)*r*0.85,Math.cos(a)*r*0.7,3.0-zi*0.8+rr(-0.3,0.3));geo.rotateX(rnd()*3);geo.rotateY(rnd()*3);geo.translate(pos.x,pos.y,pos.z);(i%3?gA:gB).push(geo);lumps.push({position:pos});}
    for(const [arr,mat] of [[gA,crust],[gB,MOSS]]){const m=new THREE.Mesh(mergeGeometries(arr),mat);m.castShadow=true;body.add(m);lumps.push({mesh:m,position:new THREE.Vector3()});}}
  const tail=new THREE.Group();tail.position.set(0,0,-4.3);body.add(tail);
  for(const sy of [-1,1]){const f=new THREE.Mesh(new THREE.ConeGeometry(0.75,1.5,4),crust);f.scale.set(0.15,1,1);f.rotation.x=sy>0?-2.2:-0.95;f.position.set(0,sy*0.45,-0.55);tail.add(f);}
  for(const sx of [-1,1]){const f=new THREE.Mesh(new THREE.ConeGeometry(0.5,1.1,4),crust);f.scale.set(1,0.12,1);f.position.set(sx*1.1,-0.35,1.9);f.rotation.set(-1.9,0,sx*0.6);body.add(f);}
  const head=new THREE.Group();head.position.set(0,0.05,3.55);body.add(head);
  for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.11,8,6),glowMat(1.3,1.1,0.6));e.position.set(sx*0.5,0.18,0.1);head.add(e);
    const w=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.012,0.9,4),crust);w.position.set(sx*0.35,-0.25,0.55);w.rotation.set(1.2,0,sx*0.6);head.add(w);}
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
  return {g,body,segs,patches,lumps,tail,head,knots,glow,crust,skin,patch,c:{x:c.x,z:c.z},tx:c.tx,tz:c.tz,nx,nz,yaw,wheel,wr,wglow,wx,wz,safe:{x:sx,z:sz},
    active:false,state:'asleep',phase:0,t:0,atk:null,atkT:0,next:2,stunT:0,resist:0,turns:0,gateOpen:false,window:0,slide:0,roll:0,rollT:0,mended:false,swim:0,drumT:0,lostT:0,
    onKnotHit(k){SFX.knock(0,260);if(k.hp<=0){k.alive=false;k.on=false;k.m.visible=false;MZ.hitStop=0.14;cam.shake=Math.max(cam.shake||0,0.9);
        _v.copy(k.m.position);k.m.parent.localToWorld(_v);puff(_v.x,_v.y,_v.z,22,MUD,0.5);sparkle(_v.x,_v.y,_v.z,16);for(let i=0;i<20;i++)fxSoft.emit(_v.x,_v.y,_v.z,rr(-3,3),rr(2,5),rr(-3,3),DROP,rr(0.1,0.2),rr(0.6,1.1),8,0.4);
        SFX.knock(0.05,140);SFX.knock(0.12,100);koi.checkPhase();}},
    onWash(){this.atk=null;this.next=2.5;this.stunT=0;if(this.phase===3&&!this.gateOpen)this.turns=Math.max(0,this.turns-1);}};
})();
function koiWorld(lx,ly,lz,out){out.set(lx,ly,lz);koi.body.localToWorld(out);return out;}
const dawnKoi=()=>stage()>=2&&!S.blight.koiRe&&MZ.hours>=4.6&&MZ.hours<=8;
function koiReset(){const k=koi;k.g.position.set(k.c.x,MZ.levelCur-0.15,k.c.z);k.g.visible=(!S.blight.koi&&stage()<2)||dawnKoi();
  for(const s of k.segs)s.material=k.crust;for(const p of k.patches)p.visible=false;for(const l of k.lumps)if(l.mesh)l.mesh.visible=true;k.tail.traverse(o=>{if(o.isMesh)o.material=k.crust;});k.mended=false;k.gateOpen=false;k.slide=0;k.turns=0;k.active=false;k.state='asleep';k.phase=0;
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
function koiPush(){const k=koi;if(!k.g.visible||k.state==='swim')return;for(let i=0;i<k.segs.length;i++){koiWorld(0,0,k.segs[i].position.z,_w);const r=1.0+0.25*(i<6?1:0);
  const dx=player.pos.x-_w.x,dz=player.pos.z-_w.z,d=Math.hypot(dx,dz);if(d<r+0.45&&d>1e-3){const push=(r+0.45-d);player.pos.x+=dx/d*push;player.pos.z+=dz/d*push;}}}
/* the gate wheel: three hand-turns under pressure */
INTERACTS.push({x:koi.wx,z:koi.wz,r:2.4,state(){const k=koi;if(!k.active||k.phase!==3||k.gateOpen||k.state!=='fight')return null;return {ok:true,text:`Turn the old gate wheel (${k.turns}/3)`,hold:1.1};},
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
function slingAimRelease(){const a=CB.sling.aimAt;CB.sling.aimAt=-1;reticle.hidden=true;if(a<0)return;const held=MZ.simTime-a;slingFire(slingPick(held<0.22?0.6:0.14));}
function slingAimUI(){const on=CB.sling.aimAt>=0&&MZ.simTime-CB.sling.aimAt>=0.22;reticle.hidden=!on;if(on){const t=slingPick(0.14);reticle.classList.toggle('lock',!!t);}}

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
  for(const s of k.segs)s.material=k.skin;for(const p of k.patches)p.visible=true;for(const l of k.lumps){if(l.mesh){l.mesh.visible=false;continue;}koiWorld(l.position.x,l.position.y,l.position.z,_w);puff(_w.x,_w.y,_w.z,6,MUD,0.4);}
  k.tail.traverse(o=>{if(o.isMesh)o.material=k.skin;});k.glow.material.opacity=0.6;sparkle(k.g.position.x,MZ.levelCur+1.5,k.g.position.z,40);auSwell();SFX.moment();cam.shake=0.5;player.happy=8;
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
  if(PARAMS.edition==='prologue')after(9.5,()=>showCardBrief({k:'Thank you for playing',t:'The Mizumend prologue',s:'The full game continues up the orchard lane: the Bramble Mother, the drowned bell, and the lamp across the water.'}));});});
function teaserStep(dt){if(!(CB.teaser>0))return;CB.teaser-=dt;if(rnd()<dt*30){const x=-62+rr(-8,8),z=-26+rr(-8,8);fxSoft.emit(x,groundH(x,z)+rr(0,1.5),z,rr(-0.3,0.3),rr(0.3,1),rr(-0.3,0.3),new THREE.Color(0.18,0.14,0.12),rr(0.3,0.6),rr(1.5,2.5),-0.05,0.4,0.2,0.6);}}

/* ---------- per-step and per-frame ---------- */
HOOKS.sim.push(dt=>{
  if(MZ.mode!=='play')return;
  CB.inv=Math.max(0,CB.inv-dt);CB.rollCool=Math.max(0,CB.rollCool-dt);CB.nmCool=Math.max(0,CB.nmCool-dt);CB.sling.cool=Math.max(0,CB.sling.cool-dt);CB.flare.cool=Math.max(0,CB.flare.cool-dt);
  if(CB.flare.charge>=0){CB.flare.charge+=dt;player.slow=Math.min(player.slow||1,0.5);}
  swingStep(dt);pocketStep();
  for(const e of [...CB.enemies])if(!e.dead)enemyStep(e,dt);
  hazardStep(dt);koiStep(dt);koiPush();mendStep(dt);teaserStep(dt);slingStep(dt);
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
const titleKoi=(()=>{const m=new THREE.Mesh(new THREE.CircleGeometry(1,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x080a0c,transparent:true,opacity:0.32,depthWrite:false}));m.scale.set(1.1,1,3.4);m.renderOrder=5;scene.add(m);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:0xd8e070,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));glow.scale.setScalar(2.2);scene.add(glow);return {m,glow};})();
HOOKS.vis.push(dt=>{
  const tm=MZ.mode==='title';titleKoi.m.visible=titleKoi.glow.visible=tm;
  if(tm){const t=MZ.G.uTime.value*0.16;const ca=Math.atan2(camera.position.z,camera.position.x);const sway=Math.sin(t)*14,rad=26+Math.cos(t*0.7)*4;
    const x=Math.cos(ca)*rad-Math.sin(ca)*sway,z=Math.sin(ca)*rad+Math.cos(ca)*sway;const vx=-Math.sin(ca)*Math.cos(t),vz=Math.cos(ca)*Math.cos(t);
    titleKoi.m.position.set(x,MZ.levelCur+0.04,z);titleKoi.m.rotation.y=Math.atan2(vx,vz);titleKoi.m.scale.set(1.7,1,4.6);
    titleKoi.glow.position.set(x+vx*3.2,MZ.levelCur+0.15,z+vz*3.2);const p=0.5+0.5*Math.sin(MZ.G.uTime.value*2.2);titleKoi.glow.material.opacity=0.15+0.35*p*p;}
  const boss=koi.active&&koi.state!=='intro'?{x:koi.g.position.x,z:koi.g.position.z}:CB.bossFrame?CB.bossFrame():null;
  cam.frame=boss&&!MZ.cine?{x:boss.x,z:boss.z,dist:boss.dist||11,pitch:boss.pitch||0.62}:null;
  slingAimUI();
});
HOOKS.vis.push(dt=>{uiAcc+=dt;if(uiAcc<0.1)return;uiAcc=0;renderBreaths();if(koi.active&&!ui.boss.hidden)renderBoss();if(!koi.active&&!CB.mend&&!CB.otherBoss)ui.boss.hidden=true;
  ui.root.classList.toggle('hidden',MZ.mode!=='play'||MZ.photo.on);ui.boss.style.visibility=MZ.cine?'hidden':'visible';});
/* keep the koi in step with saves loaded after this module ran */
HOOKS.project.push(()=>{});
let lastSync=-1;HOOKS.sim.push(()=>{const key=(S.blight&&S.blight.koi?1:0)+stage()*2;if(key===lastSync)return;lastSync=key;if(!S.blight||typeof S.blight!=='object')S.blight={koi:false};if(!koi.active&&koi.state!=='swim'&&koi.state!=='mended')koiReset();});

MZ.combat={GLOW_TEX,CB,koi,spawnEnemy,koiStart,mendPress,strike,dodge,flareStart,flareRelease,setDiff,hurt,targets,mendStart,popEnemy,feel,popText,tip,nearMissCheck,spit,shockwave,clearHazards,slingFire,slingPick,slingables,hasSling,hasLantern,D,ui,KNOT,KNOT_HOT,MUCK,MOSS,glowMat,renderBossBar:null,removeEnemy};
if(PARAMS.debug==="1"||PARAMS.debug==="true")window.__mzc=Object.assign(MZ.combat,{CB,koi,spawnEnemy,koiStart,mendPress,strike,dodge,flareStart,flareRelease,setDiff,hurt,targets,mendStart});
