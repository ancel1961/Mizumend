import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = (id) => document.getElementById(id);
/* Systems in other modules (combat, and later co-op) plug in here instead of reaching into this file */
const HOOKS={sim:[],vis:[],pose:[],project:[],pileBlocked:null,sluiceBlocked:null,brambleBlocked:null,cuttingsBlocked:null,boot:[]};
let showerT=0;
let hitStop=0,timeScale=1;
function showError(msg){ const el=$('err'); el.textContent=msg; el.hidden=false; }

/* ================================================================
   Utilities
   ================================================================ */
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const damp=(a,b,l,dt)=>lerp(a,b,1-Math.exp(-l*dt));
const ease=(t)=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const easeOutBack=(t)=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);};
let seed=20261022;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const rr=(a,b)=>a+(b-a)*rnd();
function hash2(x,y){let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  return lerp(lerp(hash2(xi,yi),hash2(xi+1,yi),u),lerp(hash2(xi,yi+1),hash2(xi+1,yi+1),u),v);}
function fbm(x,y,o=4){let s=0,a=.5,f=1,n=0;for(let i=0;i<o;i++){s+=a*vnoise(x*f+i*17.1,y*f-i*9.3);n+=a;f*=2.03;a*=.5;}return s/n;}
const angWrap=(a)=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;};
const fmt=(x)=>Number(x).toFixed(4);

/* URL options: the artifact viewer passes only #tokens, so both ?debug=1&state=2 and #debug-state2 work */
const PARAMS=(()=>{
  const out={};
  try{const q=new URLSearchParams(location.search);for(const [k,v] of q)out[k.toLowerCase()]=v;}catch(e){}
  try{const h=decodeURIComponent((location.hash||'').slice(1));
    for(const tok of h.split(/[-,&;+]+/)){if(!tok)continue;const kv=tok.split('=');if(kv.length===2){out[kv[0].toLowerCase()]=kv[1];continue;}
      const m=tok.match(/^([a-z]+)(\d*)$/i);if(m)out[m[1].toLowerCase()]=m[2]===''?'1':m[2];}}catch(e){}
  return out;
})();
const DEBUG=PARAMS.debug==='1'||PARAMS.debug==='true';
const STATE_PARAM=/^[0-9]$/.test(PARAMS.state||'')?Number(PARAMS.state):null;
const TIERS0=['low','medium','high','ultra'];
const Q_PARAM=TIERS0.includes(PARAMS.quality)?PARAMS.quality:(TIERS0.find(t=>PARAMS[t]==='1')||null);
const SEASON_NAMES=['spring','summer','autumn','winter'];
const SEASON_PARAM=SEASON_NAMES.includes(PARAMS.season)?PARAMS.season:(SEASON_NAMES.find(s=>PARAMS[s]==='1')||null);
const WX_NAMES=['clear','cloudy','rain','snow'];
const WEATHER_PARAM=WX_NAMES.includes(PARAMS.weather)?PARAMS.weather:(WX_NAMES.find(s=>PARAMS[s]==='1')||null);
const HOUR_WORD=['dawn','noon','golden','dusk','night'].find(w=>PARAMS[w]==='1')||null;
const HOUR_PARAM=(PARAMS.hour!==undefined&&PARAMS.hour!==''&&isFinite(+PARAMS.hour))?clamp(+PARAMS.hour,0,23.99):null;
let sandbox=STATE_PARAM!==null;

/* ================================================================
   World layout: pond, streams, paths, the Old Orchard upstream
   ================================================================ */
const INLET=[[-15,-15],[-28,-27],[-42,-36],[-56,-46],[-72,-55],[-92,-66],[-118,-78],[-150,-90]];
const OUTLET=[[19,3],[32,4],[46,3],[58,7],[72,11],[90,9],[112,14],[150,20]];
const ORCH={x:-84,z:-30};                 /* the Old Orchard plateau */
const HERO={x:-17,z:40};                  /* the great camphor */
const LANE=[[-53,-24],[-62,-27],[-70,-29],[-77,-30]];
const CH=[[-78,-57],[-80,-50],[-82,-44],[-85,-37]];  /* the old irrigation channel */
const BARRIER={x:-61,z:-26.7};
const RPATH=[[-93,-49],[-97,-55],[-100,-60],[-102,-64]];
const PATHS=[
  [[-14,70],[-4,63],[4,58],[16,51],[28,43],[38,32],[44,18],[45,10]],
  [[4,58],[-10,53],[-26,47],[-40,36],[-50,18],[-54,0],[-53,-18],[-54,-32],[-50,-42],[-44,-50],[-30,-58],[-10,-58],[10,-52],[28,-44],[44,-32],[56,-18],[63,-4],[65,9],[64,20],[56,32],[42,40],[28,43]],
  [[-53,-14],[-45,-17],[-39,-19]],
  LANE,
  RPATH
];
const POND_R=23;
const SLUICE_S=27.1;
const LEVELS=[1.5,0.72,-0.1,-0.45];
const HEALS=[0,0.42,0.75,1];
const HEALS_B=[0.15,0.42,0.66,0.84,1];
const RAIN=[0.75,0.3,0,0];
const orchDist=(x,z)=>Math.hypot(x-ORCH.x,z-ORCH.z);
/* v5: the mill cottage (home) beside the mill yard, and the Reedbeds basin upstream past the waterfall */
const HOME=(()=>{const s0=polyFindRadius(INLET,42);const p=polyPoint(INLET,s0);const nx=-p.tz,nz=p.tx;const yx=p.x-nx*16,yz=p.z-nz*16,mx=p.x-nx*8.6,mz=p.z-nz*8.6;
  const dx=yx-mx,dz=yz-mz,l=Math.hypot(dx,dz);return {x:yx+dx/l*11.5,z:yz+dz/l*11.5,ry:Math.atan2(dx/l,dz/l)};})();
const homeDist=(x,z)=>Math.hypot(x-HOME.x,z-HOME.z);
function homeW(lx,lz){const c=Math.cos(HOME.ry),s2=Math.sin(HOME.ry);return {x:HOME.x+lx*c+lz*s2,z:HOME.z-lx*s2+lz*c};}
function homeL(x,z){const c=Math.cos(HOME.ry),s2=Math.sin(HOME.ry),dx=x-HOME.x,dz=z-HOME.z;return {x:dx*c-dz*s2,z:dx*s2+dz*c};}
let HOME_H=null;
const RB={x:-104,z:-70};
const rbDist=(x,z)=>Math.hypot(x-RB.x,z-RB.z);

function polyInfo(px,pz,poly){
  let best=1e9,bestS=0,acc=0,tx=1,tz=0;
  for(let i=0;i<poly.length-1;i++){
    const ax=poly[i][0],az=poly[i][1],bx=poly[i+1][0],bz=poly[i+1][1];
    const dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz);
    let t=((px-ax)*dx+(pz-az)*dz)/(L*L); t=clamp(t,0,1);
    const cx=ax+dx*t,cz=az+dz*t,d=Math.hypot(px-cx,pz-cz);
    if(d<best){best=d;bestS=acc+t*L;tx=dx/L;tz=dz/L;}
    acc+=L;
  }
  return {d:best,s:bestS,tx,tz};
}
function polyLength(poly){let L=0;for(let i=0;i<poly.length-1;i++)L+=Math.hypot(poly[i+1][0]-poly[i][0],poly[i+1][1]-poly[i][1]);return L;}
function polyPoint(poly,s){
  let acc=0;
  for(let i=0;i<poly.length-1;i++){
    const ax=poly[i][0],az=poly[i][1],bx=poly[i+1][0],bz=poly[i+1][1];
    const dx=bx-ax,dz=bz-az,L=Math.hypot(dx,dz);
    if(acc+L>=s||i===poly.length-2){const t=clamp((s-acc)/L,0,1);return {x:ax+dx*t,z:az+dz*t,tx:dx/L,tz:dz/L};}
    acc+=L;
  }
  return {x:poly[0][0],z:poly[0][1],tx:1,tz:0};
}
function polyFindRadius(poly,r){const L=polyLength(poly);for(let s=0;s<L;s+=0.25){const p=polyPoint(poly,s);if(Math.hypot(p.x,p.z)>=r)return s;}return L;}
function pathDist(x,z){let d=1e9;for(const p of PATHS)d=Math.min(d,polyInfo(x,z,p).d);return d;}

function rawHeight(x,z){
  const ang=Math.atan2(z,x);
  const rr0=Math.hypot(x,z);
  const r=rr0*(1+0.07*Math.sin(ang*3+0.7)+0.04*Math.sin(ang*5-1.3));
  let h;
  if(r<POND_R+2){const k=r/(POND_R+2);h=-3.2+3.2*Math.pow(k,2.2);}
  else{h=2.6*smooth(POND_R+2,66,r)+(fbm(x*0.03+3.1,z*0.03-1.7,3)-0.5)*0.9*smooth(POND_R+5,42,r);}
  const hill=smooth(68,128,r);
  h+=hill*hill*(16+22*fbm(x*0.011+9,z*0.011+4,4))*(1-0.74*(1-smooth(26,78,orchDist(x,z))))*(1-0.44*(1-smooth(30,82,rbDist(x,z))));
  h+=1.3*Math.exp(-((x+14)*(x+14)+(z-74)*(z-74))/200);
  const od=orchDist(x,z);
  if(od<34){const w=1-smooth(20,31,od);const ph=4.3+(fbm(x*0.05+21,z*0.05-8,2)-0.5)*0.6;h=lerp(h,ph,w);}
  const rd=rbDist(x,z);
  if(rd<50){const ind=polyInfo(x,z,INLET).d;const inner=lerp(21,24,smooth(3,12,ind));const outer=inner+lerp(9,22,smooth(3,12,ind));const w=1-smooth(inner,outer,rd);const ph=8.6+(fbm(x*0.06+3,z*0.06+9,2)-0.5)*0.5;h=lerp(h,ph,w);}
  if(HOME_H!==null){const hd=homeDist(x,z);if(hd<14){const w=1-smooth(10.5,13.5,hd);h=lerp(h,HOME_H,w);}}
  const ci=polyInfo(x,z,CH);
  if(ci.d<2.6)h-=0.55*(1-smooth(0.8,2.3,ci.d))*smooth(0,3,ci.s);
  const a=polyInfo(x,z,INLET);
  if(a.d<9){const prof=1-smooth(1.6,5.2,a.d);const fade=smooth(POND_R-1,POND_R+6,rr0);h-=1.5*prof*fade;}
  const b=polyInfo(x,z,OUTLET);
  if(b.d<9){const prof=1-smooth(1.8,5.0,b.d);const bed=Math.min(h-1.4,lerp(-1.0-0.018*b.s,h-1.7,smooth(62,84,rr0)));const fade=smooth(POND_R-2,POND_R+3,rr0);h=lerp(h,Math.min(h,bed),prof*fade);}
  return h;
}

const WORLD=260,HALF=130,SEG=220,NV=SEG+1,CELL=WORLD/SEG;
HOME_H=rawHeight(HOME.x,HOME.z);
const HGRID=new Float32Array(NV*NV);
for(let j=0;j<NV;j++)for(let i=0;i<NV;i++)HGRID[j*NV+i]=rawHeight(-HALF+i*CELL,-HALF+j*CELL);
function groundH(x,z){
  const fx=clamp((x+HALF)/CELL,0,SEG-1e-4),fz=clamp((z+HALF)/CELL,0,SEG-1e-4);
  const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j;
  const a=HGRID[j*NV+i],b=HGRID[j*NV+i+1],c=HGRID[(j+1)*NV+i],d=HGRID[(j+1)*NV+i+1];
  return lerp(lerp(a,b,u),lerp(c,d,u),v);
}
function slopeAt(x,z){const e=0.6;const dx=groundH(x+e,z)-groundH(x-e,z),dz=groundH(x,z+e)-groundH(x,z-e);return Math.hypot(dx,dz)/(2*e);}

const BRIDGES=[];
function makeBridgeSpec(poly,r){
  const s=polyFindRadius(poly,r);const p=polyPoint(poly,s);
  const nx=-p.tz,nz=p.tx;
  const h1=groundH(p.x+nx*4.8,p.z+nz*4.8),h2=groundH(p.x-nx*4.8,p.z-nz*4.8);
  return {x:p.x,z:p.z,nx,nz,tx:p.tx,tz:p.tz,half:4.9,w:1.15,deck:Math.max(h1,h2)+0.12,s};
}
BRIDGES.push(makeBridgeSpec(INLET,66));
BRIDGES.push(makeBridgeSpec(OUTLET,66));
function bridgeDeck(x,z){
  let best=-1e9;
  for(const b of BRIDGES){
    const dx=x-b.x,dz=z-b.z;const u=dx*b.nx+dz*b.nz,v=dx*b.tx+dz*b.tz;
    if(Math.abs(u)<b.half+0.2&&Math.abs(v)<b.w){best=Math.max(best,b.deck+0.3*(1-(u/b.half)*(u/b.half)));}
  }
  return best;
}
function homeFloor(x,z){const l=homeL(x,z);return Math.abs(l.x)<3.5&&Math.abs(l.z)<2.8?HOME_H+0.26:-1e9;}
function walkH(x,z){return Math.max(groundH(x,z),bridgeDeck(x,z),homeFloor(x,z));}
function onBridge(x,z){const b=bridgeDeck(x,z);return b>-1e8&&b>groundH(x,z)-0.05;}

/* ================================================================
   Renderer, scene, quality tiers
   ================================================================ */
const canvas=$('c');
let renderer;
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
}catch(e){showError('This browser could not start WebGL, which the valley needs. Try a recent Chrome, Edge, Firefox or Safari.');throw e;}
if(!renderer.capabilities.isWebGL2){showError('The valley needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari.');}
const DEVICE_PR=window.devicePixelRatio||1;
renderer.setPixelRatio(1);
renderer.setSize(innerWidth,innerHeight,false);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;

const GPU=(()=>{
  let name='unknown';
  try{const gl=renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');name=String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)||'unknown');}catch(e){}
  const s=name.toLowerCase();
  let tier='medium',soft=false;
  if(/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/.test(s)){tier='low';soft=true;}
  else if(/nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|apple m[1-9]|apple gpu/.test(s))tier='high';
  else if(/intel|iris|uhd|hd graphics|mali|adreno|powervr|radeon\(tm\) graphics|vega/.test(s))tier='medium';
  return {name,tier,soft};
})();

const TIERS=['low','medium','high','ultra'];
const TIER_LABEL={low:'Low',medium:'Medium',high:'High',ultra:'Ultra'};
const QP={
  low:   {pr:0.6, shadow:0,   samples:0,post:false,bloom:false,taps:0, grass:0.25,flowers:0.35,cards:false,sky:3,water:0,rip:4, pollen:120,rain:400, cirrus:0},
  medium:{pr:0.85,shadow:1024,samples:0,post:true, bloom:true, taps:12,grass:0.55,flowers:0.7, cards:true, sky:4,water:1,rip:8, pollen:260,rain:900, cirrus:1},
  high:  {pr:1.25,shadow:2048,samples:4,post:true, bloom:true, taps:24,grass:1,   flowers:1,   cards:true, sky:5,water:2,rip:12,pollen:420,rain:1500,cirrus:1},
  ultra: {pr:2,   shadow:4096,samples:4,post:true, bloom:true, taps:32,grass:1,   flowers:1,   cards:true, sky:5,water:2,rip:12,pollen:420,rain:1500,cirrus:1}
};
const Q={setting:'auto',tier:'medium',pr:1,frames:[],locked:false,lastChange:0};
function loadQSetting(){try{const v=localStorage.getItem('rebuild-the-valley:quality');if(v&&(v==='auto'||TIERS.includes(v)))return v;}catch(e){}return 'auto';}
function saveQSetting(v){try{localStorage.setItem('rebuild-the-valley:quality',v);}catch(e){}}

const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0xc9ced2,40,300);
const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,0.1,2200);
camera.position.set(0,20,60);

const G={
  uTime:{value:0},uHealPrev:{value:0},uHealNext:{value:0},uSweepR:{value:1e5},
  uSweepC:{value:new THREE.Vector2(0,0)},uWaterY:{value:1.5},uWind:{value:1},
  uRimCol:{value:new THREE.Color(1,0.92,0.78)},uShadowTint:{value:new THREE.Color(0.8,0.92,1.08)},uPointScale:{value:800},
  uHealPrevB:{value:0.15},uHealNextB:{value:0.15},uSweepRB:{value:1e5},uSweepCB:{value:new THREE.Vector2(ORCH.x,ORCH.z)},uOrchC:{value:new THREE.Vector2(ORCH.x,ORCH.z)},
  uCloudOff:{value:new THREE.Vector2()},uCloudCov:{value:0.55},uCloudShadow:{value:0.5},uSat:{value:1.12},uLitTint:{value:new THREE.Color(1.05,1.04,0.9)},
  uSeasonTint:{value:new THREE.Color(1,1,1)},uGroundTint:{value:new THREE.Color(1,1,1)},uSunW:{value:new THREE.Vector3(0,1,0)},uBack:{value:0.3},
  uSnow:{value:0},uWet:{value:0},uSkyCol:{value:new THREE.Color(0.6,0.75,0.95)},uGrassH:{value:1},uDry:{value:0},uPlayerP:{value:new THREE.Vector3()},uNightRim:{value:0}
};
const G_HEAL=['uTime','uHealPrev','uHealNext','uSweepR','uSweepC','uWaterY','uWind','uHealPrevB','uHealNextB','uSweepRB','uSweepCB','uOrchC'];
const COMMON_GLSL=`
uniform float uTime; uniform float uHealPrev; uniform float uHealNext; uniform float uSweepR; uniform vec2 uSweepC; uniform float uWaterY; uniform float uWind;
uniform float uHealPrevB; uniform float uHealNextB; uniform float uSweepRB; uniform vec2 uSweepCB; uniform vec2 uOrchC;
float healAt(vec3 p){
  float a=mix(uHealPrev,uHealNext,1.0-smoothstep(uSweepR-16.0,uSweepR,distance(p.xz,uSweepC)));
  float b=mix(uHealPrevB,uHealNextB,1.0-smoothstep(uSweepRB-12.0,uSweepRB,distance(p.xz,uSweepCB)));
  return mix(a,b,1.0-smoothstep(24.0,38.0,distance(p.xz,uOrchC)));
}
float cH(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*15731.743); }
float cN(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(cH(i),cH(i+vec2(1.0,0.0)),u.x),mix(cH(i+vec2(0.0,1.0)),cH(i+vec2(1.0,1.0)),u.x),u.y); }
`;
const NOISE_GLSL=`
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n21(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x),u.y); }
float fbm5(vec2 p){ float s=0.0,a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ s+=a*n21(p); p=m*p; a*=0.5; } return s; }
`;
const OUT_GLSL=`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/* 3-step toon ramp */
const gradientMap=(()=>{const t=new THREE.DataTexture(new Uint8Array([105,180,255]),3,1,THREE.RedFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;})();

function windGLSL(amp){return `
  { float ph=ip.x*0.23+ip.z*0.19;
    float w=sin(uTime*1.7+ph)*0.5+sin(uTime*2.9+ph*1.9)*0.2+sin(uTime*0.55+ph*0.4)*0.3;
    float gust=smoothstep(0.45,1.0,sin(dot(ip.xz,vec2(0.075,0.048))-uTime*1.7)*0.5+0.5);
    #ifdef USE_INSTANCING
      mat3 rm=mat3(modelMatrix)*mat3(instanceMatrix);
    #else
      mat3 rm=mat3(modelMatrix);
    #endif
    float s2=max(dot(rm[0],rm[0]),1e-4);
    vec3 wd=transpose(rm)*vec3(0.84,0.0,0.54)/s2;
    vec3 wq=transpose(rm)*vec3(-0.54,0.0,0.84)/s2;
    float sw=aSway*uWind*${fmt(amp)};
    transformed+=wd*(w*0.10+gust*0.30+0.05)*sw+wq*cos(uTime*1.3+ph*1.3)*0.05*sw;
    transformed.y-=gust*0.07*sw;
    vGust=gust*aSway; vTip=aSway; }`;}
function growGLSL(o){return `
  { float hgr=healAt(ip);
    float above=smoothstep(uWaterY-0.05,uWaterY+0.3,ip.y);
    float gr=above*(${fmt(o.growBase??0)}+(1.0-${fmt(o.growBase??0)})*smoothstep(${fmt(o.growA??0)},${fmt(o.growB??1)},hgr));
    transformed.y*=gr; transformed.xz*=mix(0.45,1.0,gr); }`;}

const matCache=new Map();
function makeToon(color,o={}){
  const key=JSON.stringify([color,!!o.vc,!!o.wind,o.windAmp,!!o.grow,o.growBase,o.growA,o.growB,!!o.noHeal,o.rim,o.side,o.emissive,o.mapKey,o.tag,o.alphaTest,o.tint,o.back,o.snow,!!o.grassH,!!o.leaf,!!o.fade]);
  if(matCache.has(key))return matCache.get(key);
  const m=new THREE.MeshToonMaterial({color,gradientMap,vertexColors:!!o.vc,side:o.side??THREE.FrontSide,map:o.map??null,alphaMap:o.alphaMap??null,alphaTest:o.alphaTest??0});
  if(o.emissive!==undefined){m.emissive=new THREE.Color(o.emissive);m.emissiveIntensity=0;}
  const rimU={value:o.rim??0.22};
  const tint=o.tint==='season'?'uSeasonTint':o.tint==='ground'?'uGroundTint':'';
  const back=o.wind?(o.back??0.6):0;
  const snowK=o.snow??(o.noHeal?0:o.wind?0.55:1);const wet=o.tint==='ground';const grassH=!!o.grassH;const fadeK=(o.wind&&!grassH)||!!o.fade;const leaf=!!o.leaf;
  const progKey=`toon4|${!!o.wind}|${o.windAmp??1}|${!!o.grow}|${o.growBase??0}|${o.growA??0}|${o.growB??1}|${!!o.noHeal}|${tint}|${back}|${snowK}|${grassH}|${fadeK}|${leaf}`;
  m.customProgramCacheKey=()=>progKey;
  m.onBeforeCompile=(sh)=>{
    for(const k of [...G_HEAL,'uRimCol','uShadowTint','uCloudOff','uCloudCov','uCloudShadow','uSat','uLitTint','uSeasonTint','uGroundTint','uSunW','uBack','uSnow','uWet','uSkyCol','uGrassH','uDry','uPlayerP','uNightRim'])sh.uniforms[k]=G[k];
    sh.uniforms.uRim=rimU;
    let vs=sh.vertexShader,fs=sh.fragmentShader;
    vs=vs.replace('#include <common>','#include <common>\n'+COMMON_GLSL+(o.wind?'attribute float aSway;\nvarying float vGust;\nvarying float vTip;\n':'')+'varying vec3 vHW;\nuniform float uGrassH;\n');
    vs=vs.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 ip;
      #ifdef USE_INSTANCING
        ip=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
      #else
        ip=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
      #endif
      ${grassH?'transformed.y*=uGrassH;':''}
      ${o.grow?growGLSL(o):''}
      ${o.wind?windGLSL(o.windAmp??1):''}
    `);
    vs=vs.replace('#include <project_vertex>',`#include <project_vertex>
      { vec4 hw=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
        hw=instanceMatrix*hw;
        #endif
        vHW=(modelMatrix*hw).xyz; }`);
    fs=fs.replace('#include <common>','#include <common>\n'+COMMON_GLSL+'varying vec3 vHW;\nuniform vec3 uRimCol,uShadowTint,uLitTint,uSeasonTint,uGroundTint,uSunW,uSkyCol;\nuniform float uRim,uCloudCov,uCloudShadow,uSat,uBack,uSnow,uWet,uDry,uNightRim;\nuniform vec3 uPlayerP;\nuniform vec2 uCloudOff;\n'+(o.wind?'varying float vGust;\nvarying float vTip;\n':''));
    fs=fs.replace('#include <color_fragment>',`#include <color_fragment>
      ${fadeK?`{ vec3 ab=uPlayerP-cameraPosition; float L=length(ab)+1e-3; vec3 dr=ab/L; vec3 rel=vHW-cameraPosition; float tt=dot(rel,dr); float dd=length(rel-dr*clamp(tt,0.0,L));
        float f1=(1.0-smoothstep(0.9,2.2,dd))*step(0.0,tt)*step(tt,L-0.5); float f2=1.0-smoothstep(0.6,1.8,length(rel));
        float fd=clamp(max(f1*0.88,f2),0.0,1.0); float ign=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
        if(ign<fd) discard; }`:''}
      ${leaf?'diffuseColor.rgb*=mix(vec3(1.12,0.98,0.76),vec3(0.82,1.0,1.0),smoothstep(0.2,0.8,cN(vHW.xz*0.55+vec2(vHW.y*0.8,1.7))));':''}
      { ${tint?`diffuseColor.rgb*=${tint};
        { float mh=cN(vHW.xz*0.021+vec2(3.1,7.7))*0.7+cN(vHW.xz*0.067+vec2(9.2,1.3))*0.3; diffuseColor.rgb*=mix(vec3(0.8,0.98,1.12),vec3(1.16,1.06,0.8),smoothstep(0.22,0.78,mh)); }`:''}
        ${o.tint==='season'?'{ float dl=dot(diffuseColor.rgb,vec3(0.3,0.59,0.11)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(dl*1.28,dl*1.06,dl*0.66),uDry); }':''}
        float hl=${o.noHeal?'1.0':'healAt(vHW)'};
        vec3 c=diffuseColor.rgb; float l=dot(c,vec3(0.299,0.587,0.114));
        vec3 grey=vec3(l*0.78,l*0.86,l*0.96);
        vec3 warm=c*vec3(1.03,1.0,0.95);
        diffuseColor.rgb=mix(grey,warm,smoothstep(0.0,1.0,hl));
        ${o.wind?'diffuseColor.rgb*=1.0+vGust*0.22;':''} }`);
    fs=fs.replace('#include <lights_toon_fragment>',`${snowK||wet?'vec3 wNg=inverseTransformDirection(normal,viewMatrix);':''}
      ${wet?`float wetK=uWet*smoothstep(0.7,0.95,wNg.y)+smoothstep(uWaterY+0.7,uWaterY+0.05,vHW.y)*0.85;wetK=clamp(wetK,0.0,1.0)*(1.0-uSnow);
      float pud=wetK*smoothstep(0.5,0.64,cN(vHW.xz*0.3+vec2(11.0,4.0)))*smoothstep(0.86,0.97,wNg.y);
      diffuseColor.rgb*=1.0-wetK*0.32-pud*0.15; diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.95,0.98,1.06),wetK*0.5);`:''}
      ${snowK?`{ float sn=uSnow*${fmt(snowK)}*smoothstep(0.28,0.72,wNg.y)*mix(0.65,1.0,cN(vHW.xz*0.9+3.0)); sn=clamp(sn*1.3,0.0,1.0); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.9,0.93,0.98),sn); }`:''}
      #include <lights_toon_fragment>`);
    fs=fs.replace('#include <opaque_fragment>',`{ float bl=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114))+1e-3;
        float lit=dot(outgoingLight,vec3(0.299,0.587,0.114))/bl;
        float shd=1.0-smoothstep(0.3,1.0,lit);
        float cn=cN(vHW.xz*0.016+uCloudOff)*0.65+cN(vHW.xz*0.041+uCloudOff*1.7+7.3)*0.35;
        float cs=smoothstep(uCloudCov,uCloudCov+0.14,cn)*uCloudShadow*(1.0-shd);
        outgoingLight=mix(outgoingLight,outgoingLight*uShadowTint*0.6,cs);
        outgoingLight=mix(outgoingLight,outgoingLight*uShadowTint,shd);
        outgoingLight*=mix(vec3(1.0),uLitTint,(1.0-shd)*(1.0-cs));
        float ol=dot(outgoingLight,vec3(0.299,0.587,0.114)); outgoingLight=max(mix(vec3(ol),outgoingLight,uSat),0.0);
        vec3 vd=normalize(vViewPosition); float fr=pow(1.0-clamp(dot(normal,vd),0.0,1.0),3.0); outgoingLight+=uRimCol*fr*uRim;${o.noHeal?' outgoingLight+=vec3(0.5,0.62,1.0)*fr*uNightRim;':''}
        ${back?`{ vec3 tv=normalize(vHW-cameraPosition); float bk=pow(max(dot(tv,uSunW),0.0),5.0); outgoingLight+=uRimCol*vTip*bk*uBack*${fmt(back)}*(1.0-cs); }`:''}
        ${wet?`{ vec3 vdw=normalize(cameraPosition-vHW); vec3 rf=reflect(-vdw,vec3(0.0,1.0,0.0)); float frw=0.3+0.7*pow(1.0-max(vdw.y,0.0),4.0);
          float rip=0.9+0.12*cN(vHW.xz*1.3+vec2(uTime*0.15,-uTime*0.11));
          vec3 refl=uSkyCol*mix(0.75,1.15,clamp(rf.y,0.0,1.0))*rip; outgoingLight=mix(outgoingLight,refl,pud*frw*0.8+wetK*frw*0.12);
          outgoingLight+=uRimCol*pow(max(dot(rf,uSunW),0.0),70.0)*(pud*1.6+wetK*0.35); }`:''} }
      #include <opaque_fragment>`);
    sh.vertexShader=vs;sh.fragmentShader=fs;
  };
  matCache.set(key,m);
  return m;
}
/* v5: merge a group's static meshes per material, so software GL draws far fewer objects */
const STATIC_GROUPS=[];
function bakeStatic(root,skip){
  root.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(root.matrixWorld).invert();const buckets=new Map();const dead=[];const m4=new THREE.Matrix4();
  const walk=(o)=>{if(o!==root&&skip&&skip(o))return;for(const c of [...o.children])walk(c);
    if(o===root||!o.isMesh||o.isInstancedMesh||Array.isArray(o.material)||!o.visible)return;
    let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
    if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    g.applyMatrix4(m4.multiplyMatrices(inv,o.matrixWorld));
    const key=o.material.uuid+'|'+o.castShadow+'|'+o.receiveShadow+'|'+o.renderOrder;if(!buckets.has(key))buckets.set(key,{mat:o.material,cast:o.castShadow,rec:o.receiveShadow,ro:o.renderOrder,geos:[]});buckets.get(key).geos.push(g);dead.push(o);};
  walk(root);
  for(const o of dead)if(o.parent)o.parent.remove(o);
  for(const b of buckets.values()){const geo=mergeGeometries(b.geos,false);if(!geo)continue;const m=new THREE.Mesh(geo,b.mat);m.castShadow=b.cast;m.receiveShadow=b.rec;m.renderOrder=b.ro;root.add(m);}
  return root;
}
const outlineMats=new Map();
function outlineMat(color=0x2a1d16){if(!outlineMats.has(color))outlineMats.set(color,new THREE.MeshBasicMaterial({color,side:THREE.BackSide}));return outlineMats.get(color);}
function addOutline(mesh,thick=0.02,mat){
  mesh.geometry.computeBoundingSphere();
  const rad=Math.max(mesh.geometry.boundingSphere.radius,0.02);
  const o=new THREE.Mesh(mesh.geometry,mat||outlineMat());
  o.scale.setScalar(1+thick/rad);
  o.position.copy(mesh.geometry.boundingSphere.center).multiplyScalar(-(thick/rad));
  o.raycast=()=>{};o.castShadow=false;o.receiveShadow=false;
  mesh.add(o);return o;
}
function colorize(geo,hex,mul=1){
  const c=new THREE.Color(hex).multiplyScalar(mul);
  const n=geo.attributes.position.count;const arr=new Float32Array(n*3);
  for(let i=0;i<n;i++){arr[i*3]=c.r;arr[i*3+1]=c.g;arr[i*3+2]=c.b;}
  geo.setAttribute('color',new THREE.BufferAttribute(arr,3));return geo;
}
function setSway(geo,fn){
  const p=geo.attributes.position,n=p.count,arr=new Float32Array(n);
  for(let i=0;i<n;i++)arr[i]=fn(p.getX(i),p.getY(i),p.getZ(i));
  geo.setAttribute('aSway',new THREE.BufferAttribute(arr,1));return geo;
}
function prep(geo,hex,sway=0,mul=1){
  let g=geo.index?geo.toNonIndexed():geo;
  colorize(g,hex,mul);
  if(typeof sway==='function')setSway(g,sway);else setSway(g,()=>sway);
  if(!g.attributes.uv){g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));}
  return g;
}

/* painterly brush texture for the ground: wind-swept strokes with warm and cool tints */
function brushTexture(){
  const S=512;const cv=document.createElement('canvas');cv.width=cv.height=S;const g=cv.getContext('2d');
  g.fillStyle='rgb(232,232,228)';g.fillRect(0,0,S,S);
  const draw=(x,y,l,a,w,col)=>{g.strokeStyle=col;g.lineWidth=w;g.lineCap='round';
    for(const ox of [-S,0,S])for(const oy of [-S,0,S]){g.beginPath();g.moveTo(x+ox,y+oy);g.quadraticCurveTo(x+ox+Math.cos(a+0.25)*l*0.5,y+oy+Math.sin(a+0.25)*l*0.5,x+ox+Math.cos(a)*l,y+oy+Math.sin(a)*l);g.stroke();}};
  for(let i=0;i<900;i++){const v=150+rnd()*60|0;draw(rnd()*S,rnd()*S,10+rnd()*30,-0.6+rr(-0.45,0.45),3+rnd()*6,`rgba(${v},${v+6},${v-4},${0.08+rnd()*0.1})`);}
  for(let i=0;i<1300;i++){const warm=rnd()<0.55;const col=warm?`rgba(255,248,214,${0.12+rnd()*0.16})`:`rgba(200,214,232,${0.08+rnd()*0.12})`;draw(rnd()*S,rnd()*S,8+rnd()*22,-0.6+rr(-0.5,0.5),1.5+rnd()*3.5,col);}
  for(let i=0;i<500;i++){const v=110+rnd()*50|0;draw(rnd()*S,rnd()*S,4+rnd()*10,rnd()*6.28,1+rnd()*2,`rgba(${v},${v+8},${v-6},${0.1+rnd()*0.12})`);}
  const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  return t;
}
/* leaf-cluster alpha texture for Ghibli-style leaf-card trees */
function leafTexture(){
  const S=128;const cv=document.createElement('canvas');cv.width=cv.height=S;const g=cv.getContext('2d');
  g.fillStyle='#000';g.fillRect(0,0,S,S);g.fillStyle='#fff';
  for(let i=0;i<34;i++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*44;const x=64+Math.cos(a)*r,y=64+Math.sin(a)*r;
    g.save();g.translate(x,y);g.rotate(rnd()*Math.PI*2);g.beginPath();g.ellipse(0,0,7+rnd()*5,3.5+rnd()*2.5,0,0,Math.PI*2);g.fill();g.restore();}
  const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.NoColorSpace;return t;
}

/* ================================================================
   Lights
   ================================================================ */
const hemi=new THREE.HemisphereLight(0xbfdcff,0x5a6b3a,1.0);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff1d6,2.6);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
{const sc=sun.shadow.camera;sc.left=-40;sc.right=40;sc.top=40;sc.bottom=-40;sc.near=1;sc.far=240;}
sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.05;
scene.add(sun);scene.add(sun.target);

/* ================================================================
   Sky dome: gradient, layered cumulus, cirrus, sun disc through mist, stars
   ================================================================ */
const skyU={uSunDir:{value:new THREE.Vector3(0,1,0)},uMoonDir:{value:new THREE.Vector3(0,-1,0)},uZen:{value:new THREE.Color()},uMid:{value:new THREE.Color()},uHor:{value:new THREE.Color()},
  uGround:{value:new THREE.Color(0x3a4a3a)},uSunCol:{value:new THREE.Color()},uCloudLit:{value:new THREE.Color()},uCloudShade:{value:new THREE.Color()},
  uTime:G.uTime,uNight:{value:0},uDeep:{value:0},uCover:{value:0.4},uOct:{value:5},uCirrus:{value:1},uOvercast:{value:1},uBank:{value:0.7},uBankWarm:{value:0}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(1000,48,24),new THREE.ShaderMaterial({
  uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:`varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
  fragmentShader:`
    varying vec3 vDir;
    uniform vec3 uSunDir,uMoonDir,uZen,uMid,uHor,uGround,uSunCol,uCloudLit,uCloudShade; uniform float uTime,uNight,uDeep,uCover,uOct,uCirrus,uOvercast,uBank,uBankWarm;
    ${NOISE_GLSL}
    float fbmQ(vec2 p){ float s=0.0,a=0.5,n=0.0; mat2 m=mat2(1.6,1.2,-1.2,1.6);
      for(int i=0;i<5;i++){ if(float(i)>=uOct) break; s+=a*n21(p); n+=a; p=m*p; a*=0.5; } return s/n; }
    void main(){
      vec3 d=normalize(vDir);
      float y=max(d.y,0.0);
      vec3 col=mix(uHor,uMid,smoothstep(0.0,0.22,y));
      col=mix(col,uZen,smoothstep(0.12,0.85,y));
      col=mix(col,uGround,smoothstep(0.0,-0.16,d.y));
      float day=1.0-uNight;
      float sd=max(dot(d,uSunDir),0.0);
      col+=uSunCol*(pow(sd,4.0)*0.2+pow(sd,32.0)*0.5)*day;
      float disc=smoothstep(0.99935,0.99965,sd);
      vec2 cp=d.xz/(d.y+0.12)*0.7;
      vec2 w=vec2(uTime*0.004,uTime*0.0015);
      vec2 warp=vec2(fbmQ(cp*0.6+w+3.1),fbmQ(cp*0.6-w+8.7))-0.5;
      float shape=fbmQ(cp*0.78+warp*0.9+w)+smoothstep(0.42,0.0,d.y)*0.05;
      float dens=smoothstep(uCover,uCover+0.16,shape)*smoothstep(0.0,0.12,d.y);
      float toward=fbmQ((cp+uSunDir.xz*0.1)*0.78+warp*0.9+w)+smoothstep(0.42,0.0,d.y)*0.05;
      float lit=clamp(0.5+(shape-toward)*5.0,0.0,1.0);
      vec3 cc=mix(uCloudShade,uCloudLit,lit);
      cc=mix(cc,uCloudShade*0.92,smoothstep(uCover+0.12,uCover+0.4,shape)*0.35);
      float edge=smoothstep(uCover,uCover+0.06,shape)*(1.0-smoothstep(uCover+0.06,uCover+0.22,shape));
      cc+=uSunCol*(edge*1.7*pow(sd,3.0)+pow(sd,12.0)*0.5)*day;
      col=mix(col,cc,dens*mix(0.97,0.82,uOvercast));
      { float mx=max(max(col.r,col.g),col.b); if(mx>0.92) col*=(0.92+(mx-0.92)*0.3)/mx; }
      col+=uSunCol*disc*day*(26.0*(1.0-dens)+4.0*dens);
      col+=uSunCol*pow(sd,160.0)*dens*1.4*day;
      if(uBank>0.01){
        vec2 hz=normalize(d.xz+vec2(1e-4)); float hy=d.y;
        float big=fbmQ(hz*2.2+vec2(w.x*0.5,3.7));
        float prof=(0.17+0.36*smoothstep(0.3,0.75,big)+0.05*n21(hz*7.0+5.0))*mix(0.6,1.0,uBank);
        float pf=fbmQ(hz*9.0+vec2(hy*14.0,-hy*10.0)+w);
        float edge=prof-hy+(pf-0.5)*0.08;
        float body=smoothstep(0.0,0.012,edge)*smoothstep(-0.01,0.025,hy);
        float vert=clamp(hy/(prof+0.02),0.0,1.0);
        float cell=smoothstep(0.35,0.75,fbmQ(hz*22.0+vec2(hy*40.0,0.0)));
        float sa=max(dot(hz,normalize(uSunDir.xz+vec2(1e-4))),0.0);
        vec3 bot=uCloudShade*0.9;
        vec3 bc=mix(bot,uCloudLit*1.04,clamp(smoothstep(0.0,0.8,vert)*0.8+cell*0.35-0.1,0.0,1.0));
        bc+=uSunCol*day*uBankWarm*pow(sa,1.5)*(1.0-vert)*0.55;
        float rim=smoothstep(0.0,0.025,edge)*(1.0-smoothstep(0.025,0.07,edge));
        bc+=uSunCol*rim*(0.2+pow(sa,2.0))*0.8*day;
        col=mix(col,bc,body*0.97);
      }
      if(uCirrus>0.5){
        vec2 c2=d.xz/(d.y+0.35)*1.6+w*2.0;
        float ci=n21(vec2(c2.x*0.6,c2.y*3.5))*0.6+n21(vec2(c2.x*1.3,c2.y*7.0))*0.4;
        float cd=smoothstep(0.58,0.82,ci)*smoothstep(0.05,0.3,d.y)*0.4*(1.0-dens);
        col=mix(col,uCloudLit+uSunCol*pow(sd,6.0)*0.6*day,cd);
      }
      col=mix(col,mix(uHor,uCloudShade,0.35),uOvercast*0.16*smoothstep(0.0,0.6,y));
      float md=max(dot(d,uMoonDir),0.0);
      col+=vec3(0.86,0.9,1.0)*smoothstep(0.99905,0.99935,md)*3.0*uNight+vec3(0.25,0.35,0.6)*pow(md,40.0)*0.35*uNight;
      if(uNight>0.35){
        vec2 sp=d.xz/(d.y+0.35)*90.0; vec2 ci2=floor(sp); vec2 cf=fract(sp)-0.5;
        float st=step(0.985,h21(ci2))*smoothstep(0.18,0.0,length(cf))*smoothstep(0.02,0.25,d.y);
        col+=vec3(0.9,0.93,1.0)*st*smoothstep(0.35,0.9,uNight)*(0.25+0.75*uDeep)*(1.0-dens)*(0.55+0.45*sin(uTime*2.5+h21(ci2)*50.0))*1.8;
      }
      gl_FragColor=vec4(col,1.0);
      ${OUT_GLSL}
    }`
}));
sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);

const mountU=[];
function makeMountains(radius,minH,maxH,segs,seedOff){
  const pos=[],aH=[],idx=[];
  for(let i=0;i<=segs;i++){
    const a=i/segs*Math.PI*2;
    const n=fbm(Math.cos(a)*3+seedOff,Math.sin(a)*3-seedOff,5);
    const h=minH+(maxH-minH)*Math.pow(n,1.3);
    const x=Math.cos(a)*radius,z=Math.sin(a)*radius;
    pos.push(x,-40,z, x*0.985,h,z*0.985);aH.push(0,1);
    if(i<segs){const k=i*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aH',new THREE.Float32BufferAttribute(aH,1));g.setIndex(idx);
  const u={uBot:{value:new THREE.Color()},uTop:{value:new THREE.Color()},uRimC:{value:new THREE.Color()}};mountU.push(u);
  const m=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:u,side:THREE.DoubleSide,fog:false,depthWrite:true,
    vertexShader:`attribute float aH; varying float vH; void main(){ vH=aH; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader:`uniform vec3 uBot,uTop,uRimC; varying float vH; void main(){ vec3 c=mix(uBot,uTop,smoothstep(0.12,0.95,vH)); c+=uRimC*smoothstep(0.93,1.0,vH); gl_FragColor=vec4(c,1.0); ${OUT_GLSL} } `}));
  m.renderOrder=-5;m.frustumCulled=false;scene.add(m);return m;
}
const mountFar=makeMountains(780,150,330,180,11.3);
const mountMid=makeMountains(520,95,210,150,3.7);
const mountNear=makeMountains(300,34,92,140,7.9);

/* ================================================================
   Terrain
   ================================================================ */
const heightTexData=(()=>{
  const HT=256,data=new Uint16Array(HT*HT*4);const toH=THREE.DataUtils.toHalfFloat;
  for(let j=0;j<HT;j++)for(let i=0;i<HT;i++){
    const x=-HALF+i/(HT-1)*WORLD,z=-HALF+j/(HT-1)*WORLD;const k=(j*HT+i)*4;
    const o=polyInfo(x,z,OUTLET);
    const mask=(o.d<7.5&&o.s>SLUICE_S+0.6)?1:0;
    data[k]=toH(groundH(x,z));data[k+1]=toH(mask);data[k+2]=toH(0);data[k+3]=toH(1);
  }
  const t=new THREE.DataTexture(data,HT,HT,THREE.RGBAFormat,THREE.HalfFloatType);t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
})();

const terrain=(()=>{
  const pos=new Float32Array(NV*NV*3),col=new Float32Array(NV*NV*3),uv=new Float32Array(NV*NV*2);
  for(let j=0;j<NV;j++)for(let i=0;i<NV;i++){
    const k=j*NV+i,x=-HALF+i*CELL,z=-HALF+j*CELL;
    pos[k*3]=x;pos[k*3+1]=HGRID[k];pos[k*3+2]=z;uv[k*2]=i/SEG*26;uv[k*2+1]=j/SEG*26;
  }
  const idx=[];
  for(let j=0;j<SEG;j++)for(let i=0;i<SEG;i++){const a=j*NV+i,b=a+1,c=a+NV,d=c+1;idx.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);
  g.computeVertexNormals();
  const nrm=g.attributes.normal;
  const C=(h)=>new THREE.Color(h);
  const grassDeep=C(0x3c8c2c),grassLight=C(0x8fcb46),hillGreen=C(0x2f7a3c),sunny=C(0xcfe05a),teal=C(0x2f7d5e),rock=C(0x8c897c),sand=C(0xd8c48e),mud=C(0x5f4a2e),bed=C(0x4a4030),path=C(0xd9bf8c),pathEdge=C(0xa58a5e),pebble=C(0x7d7563),clover=C(0x5fae3e),
    petalA=C(0xf3e7b0),petalB=C(0xe9b7c8),orchG=C(0x8db84a),orchWarm=C(0xb0c64e),orchCool=C(0x3a8556),dirt=C(0x9c7a52);
  const c=new THREE.Color(),t=new THREE.Color();
  for(let j=0;j<NV;j++)for(let i=0;i<NV;i++){
    const k=j*NV+i,x=pos[k*3],h=pos[k*3+1],z=pos[k*3+2];
    const r=Math.hypot(x,z),slope=1-nrm.getY(k);
    const n=fbm(x*0.06,z*0.06,3),n2=vnoise(x*0.35+5,z*0.35-2),n3=fbm(x*0.018+40,z*0.018-7,3);
    c.copy(grassDeep).lerp(grassLight,smooth(0.3,0.75,n));
    c.lerp(clover,smooth(0.55,0.75,n3)*0.5);
    c.lerp(teal,smooth(0.25,0.4,1-n3)*0.25);
    c.lerp(hillGreen,smooth(70,112,r)*0.65);
    if(n2>0.7)c.lerp(sunny,(n2-0.7)*1.7);
    c.lerp(rock,smooth(0.28,0.55,slope)*0.9);
    if(r<40){ const sh=1-smooth(-0.25,0.35,h); c.lerp(sand,sh*0.85*(1-smooth(30,40,r))); }
    c.lerp(mud,1-smooth(-0.9,-0.35,h));
    c.lerp(bed,1-smooth(-2.0,-1.0,h));
    const ia=polyInfo(x,z,INLET).d,ob=polyInfo(x,z,OUTLET).d;
    const chan=Math.min(ia,ob);
    if(chan<3.2&&r>POND_R-1)c.lerp(pebble,(1-smooth(1.6,3.2,chan))*0.85);
    const fp=fbm(x*0.07+30,z*0.07-12,3);
    if(fp>0.56&&h>0.2){const sp=vnoise(x*1.7,z*1.7);c.lerp(sp>0.5?petalA:petalB,smooth(0.56,0.7,fp)*0.32*smooth(0.35,0.8,sp));}
    const od=orchDist(x,z);
    if(od<26){const on=fbm(x*0.11+5,z*0.11-3,3);t.copy(orchWarm).lerp(orchCool,smooth(0.38,0.62,on));c.lerp(t,(1-smooth(14,26,od))*0.32);const rowz=Math.abs(((z-ORCH.z)%10+15)%10-5);if(od<18&&rowz<1.2)c.lerp(dirt,(1-rowz/1.2)*0.25*(1-smooth(12,18,od)));}
    const cd=polyInfo(x,z,CH).d;if(cd<2.4)c.lerp(pebble,(1-smooth(0.9,2.4,cd))*0.8);
    const pd=pathDist(x,z);
    if(pd<2.4){const e=1-smooth(0.9+n2*0.7,2.4,pd);t.copy(pathEdge).lerp(path,smooth(0.0,1.0,1-pd/1.5));if(n2>0.62)t.lerp(dirt,0.35);c.lerp(t,e*0.96);}
    col[k*3]=c.r;col[k*3+1]=c.g;col[k*3+2]=c.b;
  }
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  const m=new THREE.Mesh(g,makeToon(0xffffff,{vc:true,map:brushTexture(),mapKey:'brush',rim:0.0,tint:'ground'}));
  m.receiveShadow=true;scene.add(m);return m;
})();

/* ================================================================
   Water: the hero material (depth gradient, sky + cloud reflection, caustics, rain rings, ripples)
   ================================================================ */
const RIP=12;
const ripples=[];for(let i=0;i<RIP;i++)ripples.push(new THREE.Vector4(0,0,-99,0));
let ripCursor=0;
function addRipple(x,z,amp=1){ripples[ripCursor].set(x,z,G.uTime.value,amp);ripCursor=(ripCursor+1)%RIP;}

const waterU=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
  tHeight:{value:null},uLevel:{value:1.5},uSunDir:{value:new THREE.Vector3()},uSunCol:{value:new THREE.Color()},uZen:{value:new THREE.Color()},uHor:{value:new THREE.Color()},uCloudLit:{value:new THREE.Color()},
  uDeep:{value:new THREE.Color(0x174f72)},uMidW:{value:new THREE.Color(0x2c8a93)},uShallow:{value:new THREE.Color(0x7fbfa6)},uMurk:{value:new THREE.Color(0x66737a)},
  uNight:{value:0},uRip:{value:[]},uQ:{value:2},uRipN:{value:12},uRain:{value:0},uLit:{value:1},uIce:{value:0},uIceN:{value:0},uMoonDir:{value:new THREE.Vector3(0,1,0)},uLights:{value:Array.from({length:8},()=>new THREE.Vector4(0,-99,0,0))}
}]);
for(const k of G_HEAL)waterU[k]=G[k];
waterU.uRip.value=ripples;waterU.tHeight.value=heightTexData;
const water=new THREE.Mesh(new THREE.PlaneGeometry(WORLD,WORLD,1,1).rotateX(-Math.PI/2),new THREE.ShaderMaterial({
  uniforms:waterU,transparent:true,depthWrite:false,fog:true,
  vertexShader:`
    varying vec3 vW;
    #include <fog_pars_vertex>
    void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader:`
    varying vec3 vW;
    uniform sampler2D tHeight; uniform float uLevel,uNight,uQ,uRipN,uRain,uLit,uIce,uIceN; uniform vec3 uMoonDir; uniform vec4 uLights[8];
    uniform vec3 uSunDir,uSunCol,uZen,uHor,uCloudLit,uDeep,uMidW,uShallow,uMurk; uniform vec4 uRip[${RIP}];
    ${COMMON_GLSL}
    ${NOISE_GLSL}
    #include <fog_pars_fragment>
    void main(){
      vec2 huv=(vW.xz+${fmt(HALF)})/${fmt(WORLD)};
      vec4 hs=texture2D(tHeight,huv);
      if(hs.g>0.5) discard;
      float depth=uLevel-hs.r;
      if(depth<-0.03) discard;
      vec2 p=vW.xz; float t=uTime;
      vec2 g=vec2(cos(p.x*0.9+t*1.1),sin(p.y*0.7+t*0.9))*0.03;
      g+=vec2(cos((p.x+p.y)*1.7-t*1.6),sin((p.x-p.y)*1.5+t*1.3))*0.02;
      if(uQ>0.5) g+=(vec2(n21(p*1.3+t*0.4),n21(p*1.3-t*0.35+5.0))-0.5)*0.08;
      float foamR=0.0;
      for(int i=0;i<${RIP};i++){
        if(float(i)>=uRipN) break;
        vec4 rp=uRip[i]; float age=t-rp.z;
        if(age<0.0||age>3.2) continue;
        vec2 dv=p-rp.xy; float d=length(dv)+1e-4; float ring=d-age*1.5;
        float w=exp(-ring*ring*6.0)*(1.0-age/3.2)*rp.w;
        g+=dv/d*w*0.22; foamR+=w*0.28;
      }
      if(uRain>0.01){
        for(int k=0;k<2;k++){
          vec2 q=p*(1.1+float(k)*0.7)+float(k)*13.7;
          vec2 cell=floor(q); vec2 f=fract(q)-0.5; float hc=h21(cell+float(k)*3.1);
          vec2 c0=(vec2(hc,h21(cell+7.1))-0.5)*0.6; float ph=fract(t*0.85+hc*7.0);
          vec2 dv=f-c0; float dd=length(dv)+1e-3;
          float ring=exp(-pow((dd-ph*0.42)*26.0,2.0))*(1.0-ph)*uRain*step(0.35,hc);
          g+=dv/dd*ring*0.1; foamR+=ring*0.18;
        }
      }
      vec3 n=normalize(vec3(-g.x,1.0,-g.y));
      vec3 v=normalize(cameraPosition-vW);
      float hl=healAt(vW);
      float fres=pow(1.0-max(dot(n,v),0.0),4.0)*0.8+mix(0.18,0.07,hl);
      vec3 r=reflect(-v,n);
      vec3 skyc=mix(uHor,uZen,pow(max(r.y,0.0),0.5));
      if(uQ>1.5){ float cl=fbm5(r.xz/(r.y+0.2)*0.8+vec2(t*0.004,t*0.0015)); skyc=mix(skyc,uCloudLit,smoothstep(0.42,0.68,cl)*0.55); }
      float sp=max(dot(r,uSunDir),0.0);
      float spec=pow(sp,240.0)*7.0+pow(sp,40.0)*0.25;
      vec3 body=mix(uShallow,uMidW,smoothstep(0.0,0.9,depth));
      body=mix(body,uDeep,smoothstep(0.8,3.0,depth));
      if(uQ>0.5){
        vec2 q=p*1.3;
        float c=sin(q.x*2.0+sin(q.y*1.6+t*0.9)*1.4+t*0.7)+sin(q.y*2.2+sin(q.x*1.8-t*0.8)*1.3-t*0.6)+sin((q.x+q.y)*1.5+t*0.5);
        float k=pow(1.0-clamp(abs(c)*0.45,0.0,1.0),5.0);
        body+=uSunCol*k*0.5*(1.0-smoothstep(0.05,1.3,depth))*(1.0-uNight);
        spec+=step(0.986,n21(p*9.0+t*0.8))*pow(sp,6.0)*2.5;
      }
      body=mix(uMurk*(1.0-0.3*smoothstep(0.0,2.0,depth)),body,smoothstep(0.0,1.0,hl));
      body*=uLit;
      { float bl=dot(body,vec3(0.3,0.59,0.11)); body=mix(body,vec3(bl*0.5,bl*0.6,bl*0.85),uNight*0.85)*mix(1.0,0.45,uNight); }
      fres=mix(fres,max(fres,0.62),uNight);
      float iceHint=uIceN;
      vec3 col=mix(body,skyc,fres);
      { float mdw=max(dot(r,uMoonDir),0.0); float gl=step(0.93,n21(p*vec2(5.0,9.0)+vec2(t*0.6,-t*0.4)));
        vec3 rf=normalize(vec3(r.x,r.y*3.0,r.z)); float mp=max(dot(rf,normalize(vec3(uMoonDir.x,uMoonDir.y*3.0,uMoonDir.z))),0.0);
        float cd=length(vW.xz-cameraPosition.xz); float dash=smoothstep(0.35,0.75,sin(cd*4.2+n21(vW.xz*vec2(0.9,0.3))*5.0+t*0.6)*0.5+0.5)*(0.55+0.45*n21(vW.xz*1.7+t*0.2));
        col+=vec3(0.95,0.92,0.8)*(pow(mdw,400.0)*4.5+pow(mdw,30.0)*0.25+pow(mp,14.0)*0.9*dash+gl*pow(mp,5.0)*0.8*dash)*uNight*(1.0-iceHint); }
      { vec3 wl=vec3(0.0); vec3 dv=normalize(vW-cameraPosition);
        for(int i=0;i<8;i++){ vec4 L=uLights[i]; if(L.w<0.01) continue;
          vec3 mL=vec3(L.x,2.0*uLevel-L.y,L.z); vec3 dm=normalize(mL-cameraPosition);
          vec2 a=normalize(dv.xz),b=normalize(dm.xz); float hx=abs(a.x*b.y-a.y*b.x);
          float vy=dv.y-dm.y; float along=clamp(1.0-abs(vy)/0.16,0.0,1.0);
          float brk=smoothstep(0.25,0.7,n21(vec2(vW.x*0.5+vW.z*0.5,(vW.x-vW.z)*3.5)+vec2(0.0,t*0.8)));
          wl+=vec3(1.0,0.66,0.3)*L.w*smoothstep(0.012,0.0,hx-0.003*along)*along*along*(0.35+0.65*brk)*step(0.0,dot(a,b)); }
        col+=wl*uNight*(1.0-iceHint)*1.6; }
      col+=uSunCol*spec*(1.0-uNight*0.85);
      float fn=n21(p*2.5+t*0.25);
      float foam=1.0-smoothstep(0.0,0.2+0.14*fn,depth);
      foam*=0.55+0.45*sin(depth*28.0-t*2.2+fn*6.0);
      foam=clamp(foam+foamR,0.0,1.0);
      col=mix(col,vec3(0.94,0.96,1.0)*mix(1.0,0.16,uNight),foam*0.8);
      float iceM=0.0;
      if(uIce>0.01){ float edge=0.5+0.45*n21(p*0.11)+0.25*n21(p*0.6); iceM=uIce*(1.0-smoothstep(edge*0.55,edge,depth)); iceM=max(iceM,uIceN*smoothstep(0.0,0.08,depth)); iceM=clamp(iceM,0.0,1.0);
        float c1=1.0-smoothstep(0.0,0.03,abs(n21(p*0.35)-0.5)); float c2=1.0-smoothstep(0.0,0.025,abs(n21(p*0.9+7.0)-0.5));
        vec3 iceC=mix(vec3(0.5,0.72,0.9),vec3(0.74,0.87,0.97),0.5+0.5*n21(p*0.18))*(0.94+0.06*n21(p*2.3));
        iceC=mix(iceC,vec3(0.42,0.6,0.78),c1*0.55+c2*0.3);
        iceC=mix(iceC,vec3(0.97,0.99,1.0),(1.0-smoothstep(0.05,0.6,depth))*0.7);
        float sheen=pow(max(dot(reflect(-v,vec3(0.0,1.0,0.0)),uSunDir),0.0),16.0)*0.3;float graze=pow(1.0-max(v.y,0.0),4.0);
        iceC=iceC*mix(0.16,1.0,uLit)*(1.0-graze*0.25)+skyc*(0.08+graze*0.3)+uSunCol*sheen*(1.0-uNight)+vec3(0.5,0.6,0.8)*graze*0.15*uNight; col=mix(col,iceC,iceM); }
      float alpha=mix(0.55,0.94,smoothstep(0.0,1.8,depth))*smoothstep(-0.03,0.05,depth);
      alpha=max(alpha,foam*0.85*smoothstep(-0.03,0.02,depth));
      alpha=mix(alpha,0.97*smoothstep(-0.03,0.03,depth),iceM);
      gl_FragColor=vec4(col,alpha);
      #include <fog_fragment>
      ${OUT_GLSL}
    }`
}));
water.renderOrder=2;water.position.y=1.5;scene.add(water);

const streams=[];
function makeStream(poly,s0,s1,halfW,dir,clip){
  const pos=[],uv=[],idx=[],steep=[];let n=0;
  for(let s=s0;s<=s1;s+=1.0){
    const p=polyPoint(poly,s);const nx=-p.tz,nz=p.tx;const y=groundH(p.x,p.z)+0.3;
    const p2=polyPoint(poly,s+1);const st=Math.abs(groundH(p2.x,p2.z)-groundH(p.x,p.z));
    pos.push(p.x-nx*halfW,y,p.z-nz*halfW, p.x+nx*halfW,y,p.z+nz*halfW);uv.push(0,s,1,s);steep.push(st,st);
    if(n>0){const a=(n-1)*2,b=a+1,c=n*2,d=c+1;idx.push(a,c,b,b,c,d);}n++;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aSteep',new THREE.Float32BufferAttribute(steep,1));g.setIndex(idx);
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uLit:{value:1},uFlow:{value:1},uDir:{value:dir},uClip:{value:clip?1:0},uLevel:{value:1.5},uS0:{value:s0},uCol:{value:new THREE.Color(0x3d8f9a)},uFoam:{value:new THREE.Color(0xeef6f6)},uSky:{value:new THREE.Color(0xa8d6ff)}}]);
  for(const k of G_HEAL)u[k]=G[k];
  const m=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true,
    vertexShader:`varying vec2 vUv; varying vec3 vW; attribute float aSteep; varying float vSteep;
      #include <fog_pars_vertex>
      void main(){ vUv=uv; vSteep=aSteep; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`varying vec2 vUv; varying vec3 vW; varying float vSteep;
      uniform float uFlow,uDir,uClip,uLevel,uS0,uLit; uniform vec3 uCol,uFoam,uSky;
      ${COMMON_GLSL}
      ${NOISE_GLSL}
      #include <fog_pars_fragment>
      void main(){
        if(uClip>0.5 && vW.y<uLevel+0.04) discard;
        float across=abs(vUv.x-0.5)*2.0;
        float fall=smoothstep(0.25,0.8,vSteep);
        float fl=vUv.y*0.6+uTime*(1.6+fall*4.0)*uDir;
        float streak=n21(vec2(vUv.x*5.0,fl))*0.6+n21(vec2(vUv.x*13.0,fl*2.3))*0.4;
        float foam=fall*(0.12+0.3*streak)+smoothstep(0.6,0.86,streak)*(1.0-fall)+smoothstep(0.7,1.0,across)*0.55+smoothstep(2.5,0.0,vUv.y-uS0)*(1.0-uClip)*0.9;
        vec3 col=mix(uCol,uSky,0.3+0.3*streak);
        col=mix(col,uFoam,clamp(foam,0.0,1.0)*0.7);
        float hl=healAt(vW); float l=dot(col,vec3(0.3,0.59,0.11));
        col=mix(vec3(l*0.85,l*0.9,l*0.95),col,hl*0.8+0.2);
        col*=mix(0.16,1.0,uLit);
        float a=(0.88-across*across*0.55)*uFlow*mix(1.0,0.5,fall);
        gl_FragColor=vec4(col,a);
        #include <fog_fragment>
        ${OUT_GLSL}
      }`}));
  m.renderOrder=3;scene.add(m);streams.push({mesh:m,u});return u;
}
const inletU=makeStream(INLET,6,polyLength(INLET)-4,1.55,1,true);
const outletU=makeStream(OUTLET,SLUICE_S+0.3,polyLength(OUTLET)-4,1.45,-1,false);
outletU.uFlow.value=0;
const chanU=makeStream(CH,0.6,polyLength(CH)-0.4,0.6,1,false);
chanU.uFlow.value=0;

/* ================================================================
   Scatter helpers
   ================================================================ */
const dummy=new THREE.Object3D();
const BUILDINGS=[];
BUILDINGS.push({x:HOME.x,z:HOME.z,r:4.8},{...homeW(7.4,0),r:3.4});
function scatterOK(x,z,opt={}){
  const r=Math.hypot(x,z);const od=orchDist(x,z);
  if(r>108&&!(opt.orch&&(od<27||rbDist(x,z)<23)))return false;
  if(!opt.orch&&od<23)return false;
  if(polyInfo(x,z,CH).d<(opt.chan??2.8)*0.8)return false;
  const h=groundH(x,z);
  if(h<(opt.minH??-0.5))return false;
  if(slopeAt(x,z)>(opt.maxSlope??0.7))return false;
  if(pathDist(x,z)<(opt.path??1.0))return false;
  if(polyInfo(x,z,INLET).d<(opt.chan??2.8)&&r>POND_R-2)return false;
  if(polyInfo(x,z,OUTLET).d<(opt.chan??2.8)&&r>POND_R-2)return false;
  for(const b of BUILDINGS)if(Math.hypot(x-b.x,z-b.z)<b.r+(opt.pad??0))return false;
  return true;
}

/* ================================================================
   Character (Hosoda-simple: big expressive eyes, readable face)
   ================================================================ */
function makePlayer(){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const M=(c)=>makeToon(c,{rim:0.38,noHeal:true});
  const mesh=(geo,mat,parent,x=0,y=0,z=0,outline=0.018)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);if(outline)addOutline(m,outline);return m;};
  const tunicGeo=new THREE.LatheGeometry([new THREE.Vector2(0.001,0),new THREE.Vector2(0.33,0.0),new THREE.Vector2(0.31,0.1),new THREE.Vector2(0.24,0.42),new THREE.Vector2(0.2,0.56),new THREE.Vector2(0.001,0.6)],18);
  mesh(tunicGeo,M(0xc4432c),body,0,0.42,0,0.016);
  const collar=mesh(new THREE.TorusGeometry(0.15,0.055,8,18),M(0xf2c14e),body,0,0.98,0,0.012);collar.rotation.x=Math.PI/2;
  const scarfTail=new THREE.Group();scarfTail.position.set(0.06,0.96,-0.13);body.add(scarfTail);
  mesh(new THREE.BoxGeometry(0.1,0.32,0.03),M(0xf2c14e),scarfTail,0,-0.15,0,0.01);
  mesh(new THREE.BoxGeometry(0.26,0.26,0.1),M(0x8a5a34),body,0,0.74,-0.28,0.014);
  const strap=mesh(new THREE.BoxGeometry(0.04,0.62,0.02),M(0x6b4428),body,0,0.74,0.25,0);strap.rotation.z=0.75;
  const legs=[];
  for(const sx of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(sx*0.11,0.46,0);body.add(pivot);
    mesh(new THREE.CapsuleGeometry(0.075,0.24,4,10),M(0x3f3a52),pivot,0,-0.2,0,0.014);
    mesh(new THREE.SphereGeometry(0.09,12,10).scale(1,0.7,1.35),M(0x4a3426),pivot,0,-0.4,0.03,0.014);
    legs.push(pivot);
  }
  const arms=[];
  for(const sx of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(sx*0.25,0.92,0);body.add(pivot);
    const a=mesh(new THREE.CapsuleGeometry(0.06,0.26,4,10),M(0xc4432c),pivot,0,-0.17,0,0.014);a.rotation.z=sx*0.12;
    mesh(new THREE.SphereGeometry(0.065,10,8),M(0xf3cfb0),pivot,sx*0.04,-0.36,0,0.012);
    arms.push(pivot);
  }
  const head=new THREE.Group();head.position.set(0,1.27,0);body.add(head);
  mesh(new THREE.SphereGeometry(0.27,28,20),M(0xf6d3b5),head,0,0,0,0.02);
  mesh(new THREE.SphereGeometry(0.29,24,12,0,Math.PI*2,0,1.02),M(0x3a271c),head,0,0.02,-0.01,0.016);
  mesh(new THREE.SphereGeometry(0.287,20,14,Math.PI/2+1.05,Math.PI*2-2.1,0,2.25),M(0x3a271c),head,0,0,-0.01,0.016);
  for(const sx of [-1,1]){const bang=mesh(new THREE.SphereGeometry(0.11,10,8).scale(1.1,0.55,0.6),M(0x3a271c),head,sx*0.09,0.17,0.2,0.01);bang.rotation.z=sx*0.35;}
  const eyeM=makeToon(0x21160f,{noHeal:true,rim:0});
  const eyes=[];
  for(const sx of [-1,1]){
    const eg=new THREE.Group();eg.position.set(sx*0.095,-0.01,0.238);head.add(eg);
    const e=new THREE.Mesh(new THREE.SphereGeometry(0.052,16,12).scale(0.78,1.25,0.45),eyeM);eg.add(e);
    const hl=new THREE.Mesh(new THREE.SphereGeometry(0.016,8,6),new THREE.MeshBasicMaterial({color:0xffffff}));hl.position.set(sx*0.006+0.012,0.022,0.024);eg.add(hl);
    const hl2=new THREE.Mesh(new THREE.SphereGeometry(0.008,6,6),new THREE.MeshBasicMaterial({color:0xffffff}));hl2.position.set(-0.012,-0.022,0.022);eg.add(hl2);
    eyes.push(eg);
    const brow=mesh(new THREE.BoxGeometry(0.075,0.014,0.012),M(0x2e1f16),head,sx*0.1,0.085,0.25,0);brow.rotation.z=-sx*0.12;
    mesh(new THREE.SphereGeometry(0.05,10,8).scale(1,0.55,0.3),M(0xf2a08e),head,sx*0.16,-0.085,0.212,0);
  }
  const mouth=new THREE.Mesh(new THREE.TorusGeometry(0.03,0.008,6,12,Math.PI),M(0x7a3326));mouth.position.set(0,-0.105,0.255);mouth.rotation.z=Math.PI;head.add(mouth);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(0.014,6,6),M(0xe8b496));nose.position.set(0,-0.045,0.268);head.add(nose);
  const hat=new THREE.Group();hat.position.set(0,0.19,-0.04);hat.rotation.x=-0.28;head.add(hat);
  mesh(new THREE.CylinderGeometry(0.44,0.46,0.025,32),M(0xe9c97d),hat,0,0,0,0.012);
  mesh(new THREE.CylinderGeometry(0.2,0.25,0.18,24),M(0xe9c97d),hat,0,0.1,0,0.012);
  mesh(new THREE.CylinderGeometry(0.254,0.254,0.055,24),M(0xb5442b),hat,0,0.04,0,0);
  /* Founder's hat: deep green felt, gold band, a little camphor sprig and a white flower */
  const fhat=new THREE.Group();fhat.position.copy(hat.position);fhat.rotation.copy(hat.rotation);head.add(fhat);fhat.visible=false;
  mesh(new THREE.CylinderGeometry(0.42,0.45,0.03,32),M(0x2f5a3c),fhat,0,0,0,0.012);
  mesh(new THREE.CylinderGeometry(0.19,0.26,0.24,24),M(0x2f5a3c),fhat,0,0.13,0,0.012);
  mesh(new THREE.CylinderGeometry(0.264,0.264,0.06,24),M(0xe2b13c),fhat,0,0.05,0,0);
  for(let i=0;i<5;i++){const pt=mesh(new THREE.SphereGeometry(0.045,8,6).scale(1,0.45,1.6),M(0xfbf6ea),fhat,0.2+Math.cos(i*1.256)*0.05,0.1,0.14+Math.sin(i*1.256)*0.05,0);pt.rotation.y=i*1.256;}
  mesh(new THREE.SphereGeometry(0.03,8,6),M(0xf2c14e),fhat,0.2,0.12,0.14,0);
  const lf=mesh(new THREE.SphereGeometry(0.06,8,6).scale(0.5,0.2,1.6),M(0x4f8a3a),fhat,0.24,0.1,0.02,0);lf.rotation.y=0.6;
  /* fishing rod, held in the right hand */
  const rod=new THREE.Group();rod.position.set(0.04,-0.36,0.02);arms[1].add(rod);rod.visible=false;
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.02,2.0,6),M(0x8a6a3e));pole.position.set(0,0.95,0);rod.add(pole);
  const reel=new THREE.Mesh(new THREE.TorusGeometry(0.045,0.015,6,12),M(0x5b4130));reel.position.set(0.03,0.2,0);reel.rotation.y=Math.PI/2;rod.add(reel);
  const rodTip=new THREE.Object3D();rodTip.position.set(0,1.95,0);rod.add(rodTip);
  root.traverse(o=>{if(o.isMesh&&o.material.type!=='MeshBasicMaterial'){o.castShadow=true;}});
  scene.add(root);
  return {root,body,legs,arms,head,hat,fhat,rod,rodTip,scarfTail,eyes,mouth};
}

/* ================================================================
   Particles
   ================================================================ */
const PT_VS=`attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying vec3 vC; varying float vA;
  void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(-mv.z,0.1); gl_Position=projectionMatrix*mv; }`;
const PT_FS=`varying vec3 vC; varying float vA; void main(){ vec2 q=gl_PointCoord-0.5; float d=length(q); float a=smoothstep(0.5,0.12,d)*vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); ${OUT_GLSL} }`;
class FX{
  constructor(max,additive){
    this.max=max;this.cursor=0;this.live=0;
    this.pos=new Float32Array(max*3);this.col=new Float32Array(max*3);this.size=new Float32Array(max);this.alpha=new Float32Array(max);
    this.vel=new Float32Array(max*3);this.life=new Float32Array(max);this.maxLife=new Float32Array(max);this.grav=new Float32Array(max);this.base=new Float32Array(max);this.drag=new Float32Array(max);this.flutter=new Float32Array(max);this.amul=new Float32Array(max);
    const g=new THREE.BufferGeometry();
    this.aPos=new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage);this.aCol=new THREE.BufferAttribute(this.col,3).setUsage(THREE.DynamicDrawUsage);
    this.aSize=new THREE.BufferAttribute(this.size,1).setUsage(THREE.DynamicDrawUsage);this.aAlpha=new THREE.BufferAttribute(this.alpha,1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position',this.aPos);g.setAttribute('aColor',this.aCol);g.setAttribute('aSize',this.aSize);g.setAttribute('aAlpha',this.aAlpha);
    this.points=new THREE.Points(g,new THREE.ShaderMaterial({uniforms:{uScale:G.uPointScale},vertexShader:PT_VS,fragmentShader:PT_FS,transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending}));
    this.points.frustumCulled=false;this.points.renderOrder=5;scene.add(this.points);
  }
  emit(x,y,z,vx,vy,vz,col,size,life,grav=0,drag=0.6,flutter=0,amul=1){
    const i=this.cursor;this.cursor=(this.cursor+1)%this.max;
    this.pos[i*3]=x;this.pos[i*3+1]=y;this.pos[i*3+2]=z;this.vel[i*3]=vx;this.vel[i*3+1]=vy;this.vel[i*3+2]=vz;
    this.col[i*3]=col.r;this.col[i*3+1]=col.g;this.col[i*3+2]=col.b;this.base[i]=size;this.life[i]=life;this.maxLife[i]=life;this.grav[i]=grav;this.drag[i]=drag;this.flutter[i]=flutter;this.amul[i]=amul;
    this.live=Math.max(this.live,1);
  }
  update(dt,t){
    if(this.live===0)return;
    let alive=0;
    for(let i=0;i<this.max;i++){
      if(this.life[i]>0){
        alive++;
        this.life[i]-=dt;
        const k=Math.max(this.life[i],0)/this.maxLife[i];
        const dr=Math.max(0,1-this.drag[i]*dt);
        this.vel[i*3]*=dr;this.vel[i*3+1]=this.vel[i*3+1]*dr-this.grav[i]*dt;this.vel[i*3+2]*=dr;
        const fl=this.flutter[i];
        this.pos[i*3]+=(this.vel[i*3]+Math.sin(t*3+i)*fl)*dt;this.pos[i*3+1]+=this.vel[i*3+1]*dt;this.pos[i*3+2]+=(this.vel[i*3+2]+Math.cos(t*2.6+i*1.7)*fl)*dt;
        this.alpha[i]=Math.min(1,(1-k)*6)*Math.min(1,k*2.2)*this.amul[i];
        this.size[i]=this.base[i]*(0.7+0.3*k);
      }else this.alpha[i]=0;
    }
    this.live=alive;
    this.aPos.needsUpdate=this.aCol.needsUpdate=this.aSize.needsUpdate=this.aAlpha.needsUpdate=true;
  }
}
const fxSoft=new FX(700,false);
const fxGlow=new FX(400,true);

const pollen=(()=>{
  const N=420,seedA=new Float32Array(N*3),pos=new Float32Array(N*3);
  for(let i=0;i<N*3;i++)seedA[i]=rnd();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seedA,3));
  const u={uTime:G.uTime,uScale:G.uPointScale,uCam:{value:new THREE.Vector3()},uAlpha:{value:0.4},uCol:{value:new THREE.Color(1.6,1.45,1.1)}};
  const p=new THREE.Points(g,new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec3 aSeed; uniform float uTime,uScale,uAlpha; uniform vec3 uCam; varying float vA;
      void main(){ vec3 box=vec3(46.0,14.0,46.0); vec3 p=aSeed*box;
        p+=vec3(uTime*0.32+sin(uTime*0.7+aSeed.z*20.0)*0.8, uTime*0.06+sin(uTime*0.5+aSeed.x*30.0)*0.5, uTime*0.2+cos(uTime*0.6+aSeed.y*20.0)*0.8);
        p=mod(p-uCam+box*0.5,box)-box*0.5+uCam;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=min((0.04+0.04*aSeed.y)*uScale/max(-mv.z,0.1),5.0);
        vA=uAlpha*(0.55+0.45*sin(uTime*2.0+aSeed.x*40.0))*smoothstep(22.0,6.0,length(mv.xyz))*smoothstep(0.5,2.0,length(mv.xyz))*smoothstep(4.0,0.5,p.y-uCam.y);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 uCol; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d)*vA; if(a<0.01) discard; gl_FragColor=vec4(uCol,a); ${OUT_GLSL} } `}));
  p.frustumCulled=false;p.renderOrder=6;scene.add(p);return {u,geo:g};
})();

const fireflies=(()=>{
  const N=220,base=new Float32Array(N*3),ph=new Float32Array(N);
  for(let i=0;i<N;i++){
    let x,z,tries=0;if(i<60){const c=i<30?{x:HOME.x,z:HOME.z}:{x:ORCH.x-12.5,z:ORCH.z-11};const a=rnd()*6.28,r=rr(3,11);x=c.x+Math.cos(a)*r;z=c.z+Math.sin(a)*r;}
    else do{const a=rnd()*Math.PI*2,r=rr(POND_R-1,58);x=Math.cos(a)*r;z=Math.sin(a)*r;tries++;}while(groundH(x,z)<-0.4&&tries<20);
    base[i*3]=x;base[i*3+1]=Math.max(groundH(x,z),-0.4)+rr(0.3,2.4);base[i*3+2]=z;ph[i]=rnd();
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(base,3));g.setAttribute('aPhase',new THREE.BufferAttribute(ph,1));
  const u={uTime:G.uTime,uScale:G.uPointScale,uFire:{value:0}};
  const p=new THREE.Points(g,new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute float aPhase; uniform float uTime,uScale,uFire; varying float vA;
      void main(){ vec3 p=position+vec3(sin(uTime*0.4+aPhase*6.0)*1.6,sin(uTime*0.7+aPhase*9.0)*0.5,cos(uTime*0.33+aPhase*4.0)*1.6);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        float blink=pow(max(0.0,sin(uTime*1.3+aPhase*20.0)),3.0);
        vA=uFire*(0.12+0.88*blink);
        gl_PointSize=0.2*uScale/max(-mv.z,0.1);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float core=smoothstep(0.18,0.0,d); float halo=smoothstep(0.5,0.0,d)*0.35; float a=(core+halo)*vA; if(a<0.01) discard; gl_FragColor=vec4(vec3(1.0,0.92,0.42)*(2.4*core+0.8),a); ${OUT_GLSL} } `}));
  p.frustumCulled=false;p.renderOrder=6;scene.add(p);return u;
})();

/* gentle rain for the flooded stages (GPU-animated line streaks) */
const rain=(()=>{
  const N=1500;const pos=new Float32Array(N*6),seedA=new Float32Array(N*6),endA=new Float32Array(N*2);
  for(let i=0;i<N;i++){const s=[rnd(),rnd(),rnd()];for(let e=0;e<2;e++){seedA.set(s,(i*2+e)*3);endA[i*2+e]=e;}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seedA,3));g.setAttribute('aEnd',new THREE.BufferAttribute(endA,1));
  const u={uTime:G.uTime,uCam:{value:new THREE.Vector3()},uRain:{value:0},uCol:{value:new THREE.Color(0.8,0.86,0.94)}};
  const m=new THREE.LineSegments(g,new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,
    vertexShader:`attribute vec3 aSeed; attribute float aEnd; uniform float uTime,uRain; uniform vec3 uCam; varying float vA;
      void main(){ vec3 box=vec3(40.0,22.0,40.0); vec3 p=aSeed*box; p.y-=uTime*10.0*(0.85+aSeed.z*0.3); p.x+=uTime*1.4;
        p=mod(p-uCam+box*0.5,box)-box*0.5+uCam;
        p-=vec3(1.4,-10.0,0.0)*0.055*aEnd;
        vA=uRain*(0.18+0.3*aSeed.x)*smoothstep(20.0,3.0,length(p-uCam));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader:`uniform vec3 uCol; varying float vA; void main(){ if(vA<0.01) discard; gl_FragColor=vec4(uCol,vA); ${OUT_GLSL} }`}));
  m.frustumCulled=false;m.renderOrder=7;scene.add(m);return {u,geo:g,N};
})();

/* seasonal drift: autumn leaves, spring petals, winter snow (GPU-animated, wraps around the camera) */
const drift=(()=>{
  const N=1500,seedA=new Float32Array(N*3),pos=new Float32Array(N*3);
  for(let i=0;i<N*3;i++)seedA[i]=rnd();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seedA,3));
  const u={uTime:G.uTime,uScale:G.uPointScale,uCam:{value:new THREE.Vector3()},uAmt:{value:0},uFall:{value:1.2},uSway:{value:1.4},uSize:{value:0.22},uLeaf:{value:1},
    uColA:{value:new THREE.Color(0xd8642a)},uColB:{value:new THREE.Color(0xe8b23a)},uLight:{value:1}};
  const p=new THREE.Points(g,new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,
    vertexShader:`attribute vec3 aSeed; uniform float uTime,uScale,uAmt,uFall,uSway,uSize; uniform vec3 uCam; varying float vA; varying float vRot; varying float vMix;
      void main(){ vec3 box=vec3(44.0,18.0,44.0); vec3 p=aSeed*box;
        float t=uTime*(0.75+aSeed.z*0.5);
        p+=vec3(t*0.6+sin(t*0.9+aSeed.y*30.0)*uSway, -t*uFall, t*0.25+cos(t*0.7+aSeed.x*20.0)*uSway);
        p=mod(p-uCam+box*0.5,box)-box*0.5+uCam;
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=min(uSize*(0.6+0.8*aSeed.y)*uScale/max(-mv.z,0.1),12.0);
        float keep=step(aSeed.x,uAmt);
        vA=keep*smoothstep(24.0,8.0,length(mv.xyz))*smoothstep(1.8,4.5,length(mv.xyz));
        vRot=t*(1.5+aSeed.x*2.0)+aSeed.z*6.28; vMix=aSeed.y;
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 uColA,uColB; uniform float uLeaf,uLight; varying float vA; varying float vRot; varying float vMix;
      void main(){ vec2 q=gl_PointCoord-0.5; float c=cos(vRot),s=sin(vRot); q=vec2(c*q.x-s*q.y,s*q.x+c*q.y);
        float d=uLeaf>0.5?length(q*vec2(1.0,2.2+1.6*abs(sin(vRot*0.7)))):length(q);
        float a=smoothstep(0.5,0.38,d)*vA; if(a<0.02) discard;
        vec3 col=mix(uColA,uColB,vMix)*uLight*(0.85+0.3*q.y);
        gl_FragColor=vec4(col,a); ${OUT_GLSL} }`}));
  p.frustumCulled=false;p.renderOrder=6;scene.add(p);return {u,geo:g,N};
})();

/* objective glow rings (pooled) */
const glowRingMat=new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,1.6,0.6),transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,side:THREE.DoubleSide});
const glowRings=[];
for(let i=0;i<10;i++){const m=new THREE.Mesh(new THREE.RingGeometry(0.92,1.08,48).rotateX(-Math.PI/2),glowRingMat);m.visible=false;m.renderOrder=4;scene.add(m);glowRings.push(m);}
const glowShellMat=new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,1.15,0.45),transparent:true,opacity:0.35,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.BackSide,fog:false});

/* ================================================================
   Props
   ================================================================ */
function boxM(w,h,d,col,parent,x,y,z,outline=0,rx=0,ry=0,rz=0,opt={}){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),makeToon(col,opt));m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;m.receiveShadow=true;parent.add(m);if(outline)addOutline(m,outline);return m;}
function cylM(rt,rb,h,col,parent,x,y,z,seg=10,outline=0,opt={}){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),makeToon(col,opt));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);if(outline)addOutline(m,outline);return m;}
function lumpy(geo,amt,sc=1.3){
  const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const n=vnoise(x*sc+11,y*sc*1.3+z*sc+3)-0.5;const l=Math.hypot(x,y,z)||1;p.setXYZ(i,x+x/l*n*amt,y+y/l*n*amt,z+z/l*n*amt);}
  p.needsUpdate=true;return geo;
}
function gableRoof(w,d,h,col,parent,x,y,z,outline=0.03){
  const shape=new THREE.Shape();shape.moveTo(-w/2-0.35,0);shape.lineTo(0,h);shape.lineTo(w/2+0.35,0);shape.lineTo(w/2+0.35,-0.14);shape.lineTo(0,h-0.18);shape.lineTo(-w/2-0.35,-0.14);shape.lineTo(-w/2-0.35,0);
  const g=new THREE.ExtrudeGeometry(shape,{depth:d+0.7,bevelEnabled:false});g.translate(0,0,-(d+0.7)/2);
  const m=new THREE.Mesh(g,makeToon(col,{}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);if(outline)addOutline(m,outline);
  const fill=new THREE.Shape();fill.moveTo(-w/2,0);fill.lineTo(0,h-0.2);fill.lineTo(w/2,0);fill.lineTo(-w/2,0);
  const fg=new THREE.ExtrudeGeometry(fill,{depth:d,bevelEnabled:false});fg.translate(0,0,-d/2);
  const f=new THREE.Mesh(fg,makeToon(0xe8dcc3,{}));f.position.set(x,y,z);f.castShadow=true;parent.add(f);
  return m;
}
const COLLIDERS=[];
function addCollider(x,z,r,on){COLLIDERS.push({x,z,r,on:on||null});}
const lanternMats=[];

const mill=(()=>{
  const s=polyFindRadius(INLET,42);const p=polyPoint(INLET,s);const nx=-p.tz,nz=p.tx;
  const cx=p.x-nx*8.6,cz=p.z-nz*8.6;
  const g=new THREE.Group();g.position.set(cx,groundH(cx,cz)-0.2,cz);
  g.rotation.y=Math.atan2(-nx,-nz);
  scene.add(g);
  boxM(6.4,1.6,5.4,0x8f8574,g,0,0.6,0,0.03);
  boxM(5.6,3.2,4.6,0xeadcc0,g,0,2.9,0,0.03);
  /* v5: dressed stone base, timber braces, lit window frames, moss, a little lean */
  {const sr=seededRnd(4411);for(let i=0;i<46;i++){const side=i%4;const u=sr()*2-1;const w=0.5+sr()*0.5,h=0.3+sr()*0.25;const y=0.15+sr()*1.15;const c=[0x8a8070,0x9b917f,0x7d7568,0xa59a86][(sr()*4)|0];
    if(side<2)boxM(w,h,0.12,c,g,u*3.0,y,(side?1:-1)*2.72,0,0,0,(sr()-0.5)*0.1);else boxM(0.12,h,w,c,g,(side===2?1:-1)*3.22,y,u*2.5,0,0,0,(sr()-0.5)*0.1);}}
  for(const sz of [-1,1])for(const [x,a] of [[-1.38,0.62],[1.38,-0.62]])boxM(0.14,2.6,0.08,0x5b4130,g,x,2.9,sz*2.34,0,0,0,a);
  for(const sx of [-1,1])for(const z of [-1.15,1.15])boxM(0.08,3.2,0.14,0x5b4130,g,sx*2.84,2.9,z);
  {const mm=makeToon(0x5f8a3e,{rim:0.15});const sr=seededRnd(51);for(let i=0;i<16;i++){const m=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.22+sr()*0.2,1),0.15,3),mm);m.scale.y=0.45;
    const side=i%4,u=sr()*2-1;if(side<2)m.position.set(u*3.0,1.42,(side?1:-1)*2.66);else m.position.set((side===2?1:-1)*3.15,1.42,u*2.4);m.castShadow=true;g.add(m);}}
  for(const x of [-2.75,0,2.75])boxM(0.18,3.2,4.7,0x5b4130,g,x,2.9,0);
  boxM(5.7,0.18,4.7,0x5b4130,g,0,4.45,0);boxM(5.7,0.18,4.7,0x5b4130,g,0,1.4,0);
  gableRoof(5.6,4.6,2.4,0x9c4a35,g,0,4.5,0);
  boxM(0.7,2.0,0.7,0x8a8478,g,1.6,6.2,-0.8,0.02);
  const winMat=makeToon(0x3a2a1c,{emissive:0xffb35c,noHeal:true});lanternMats.push(winMat);
  const glassMat=makeToon(0x58697a,{emissive:0xffb35c,noHeal:true,tag:'millglass'});lanternMats.push(glassMat);
  for(const x of [-1.4,1.4])for(const zs of [-1,1]){const z=zs*2.36;const w=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.1),glassMat);w.position.set(x,3.1,z);g.add(w);
    for(const [fw,fh,fx,fy] of [[1.08,0.1,0,0.5],[1.08,0.12,0,-0.5],[0.1,1.08,-0.5,0],[0.1,1.08,0.5,0],[0.06,0.9,0,0],[0.9,0.06,0,0]])boxM(fw,fh,0.12,0xd9c39a,g,x+fx,3.1+fy,z+zs*0.04);
    boxM(1.1,0.08,0.3,0xd9c39a,g,x,2.56,z+zs*0.12);}
  boxM(1.1,1.9,0.12,0x5b3b28,g,0,2.25,-2.36);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.16,12,10),winMat);lamp.position.set(0.9,3.0,-2.6);g.add(lamp);
  const wheel=new THREE.Group();wheel.position.set(3.55,1.9,0);g.add(wheel);
  const wm=makeToon(0x6b4c33,{});
  const rim1=new THREE.Mesh(new THREE.TorusGeometry(2.0,0.09,8,32),wm);rim1.rotation.y=Math.PI/2;rim1.position.x=-0.3;wheel.add(rim1);
  const rim2=rim1.clone();rim2.position.x=0.3;wheel.add(rim2);
  for(let i=0;i<8;i++){const sp=new THREE.Mesh(new THREE.BoxGeometry(0.08,4.0,0.12),wm);sp.rotation.x=i/8*Math.PI;wheel.add(sp);}
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2;const pd=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.08,0.5),wm);pd.position.set(0,Math.cos(a)*2.0,Math.sin(a)*2.0);pd.rotation.x=-a;wheel.add(pd);}
  wheel.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  const axle=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,1.2,8),wm);axle.rotation.z=Math.PI/2;wheel.add(axle);
  g.rotation.z=0.018;g.rotation.x=-0.012;
  BUILDINGS.push({x:cx,z:cz,r:6});
  const wp=new THREE.Vector3(3.55,0,0).applyEuler(g.rotation);
  addCollider(cx,cz,3.6);addCollider(cx+wp.x*0.6,cz+wp.z*0.6,2.2);
  return {g,wheel,x:cx,z:cz};
})();

const cottage=(()=>{
  const cx=-15,cz=76;const g=new THREE.Group();g.position.set(cx,groundH(cx,cz)-0.15,cz);g.rotation.y=Math.PI*0.88;scene.add(g);
  boxM(4.6,0.5,3.8,0x8f897c,g,0,0.2,0,0.02);
  boxM(4.2,2.6,3.4,0xf1e6cf,g,0,1.7,0,0.03);
  gableRoof(4.2,3.4,2.0,0xb4473a,g,0,3.0,0);
  boxM(0.55,1.4,0.55,0x9a9287,g,-1.2,4.2,0.5,0.02);
  boxM(0.9,1.6,0.1,0x5d3e29,g,0.6,1.25,1.72);
  const winMat=makeToon(0x3a2a1c,{emissive:0xffb35c,noHeal:true});
  const w=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.75,0.1),winMat);w.position.set(-0.95,1.9,1.72);g.add(w);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.13,12,10),winMat);lamp.position.set(1.35,2.2,1.85);g.add(lamp);
  for(let i=0;i<9;i++){const x=-3+i*0.75;boxM(0.08,0.75,0.08,0x7a5a3c,g,x,0.4,3.0);}
  boxM(6.2,0.07,0.06,0x7a5a3c,g,0,0.62,3.0);boxM(6.2,0.07,0.06,0x7a5a3c,g,0,0.32,3.0);
  BUILDINGS.push({x:cx,z:cz,r:5});addCollider(cx,cz,2.8);
  return g;
})();
const lampLights=[];
const POOL_TEX=(()=>{const S2=128;const cv=document.createElement('canvas');cv.width=cv.height=S2;const g=cv.getContext('2d');const gr=g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.45,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,S2,S2);const t=new THREE.CanvasTexture(cv);return t;})();
const poolMat=new THREE.MeshBasicMaterial({map:POOL_TEX,color:new THREE.Color(1.0,0.62,0.28),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2});
const lightPools=[];
const glowSprites=[];
function addGlow(parent,x,y,z,size,col=0xffb35c){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:POOL_TEX,color:col,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));m.position.set(x,y,z);m.scale.setScalar(size);m.renderOrder=6;parent.add(m);glowSprites.push(m);return m;}
function makeLightPool(x,z,r,parent){const m=new THREE.Mesh(new THREE.CircleGeometry(r,24).rotateX(-Math.PI/2),poolMat);m.position.set(x,groundH(x,z)+0.06,z);m.renderOrder=3;(parent||scene).add(m);lightPools.push(m);return m;}
function addLamp(g,lx,ly,lz){g.updateMatrixWorld(true);const v=g.localToWorld(new THREE.Vector3(lx,ly,lz));const L=new THREE.PointLight(0xffb35c,0,16,2);L.position.copy(v);scene.add(L);lampLights.push(L);makeLightPool(v.x,v.z,3.4);return L;}
addLamp(cottage,0.0,1.9,2.7);addLamp(mill.g,0.4,3.0,-3.4);
for(const [lx,lz] of [[-1.4,3.4],[1.4,3.4],[-1.4,-3.4],[1.4,-3.4]]){const v=mill.g.localToWorld(new THREE.Vector3(lx,0,lz));makeLightPool(v.x,v.z,2.3);}
const SIGN={x:9,z:51};
(()=>{
  const {x,z}=SIGN;const g=new THREE.Group();g.position.set(x,groundH(x,z),z);g.rotation.y=-0.5;scene.add(g);
  cylM(0.07,0.09,1.9,0x6b4c33,g,0,0.95,0,7,0.015);
  const cv=document.createElement('canvas');cv.width=512;cv.height=192;
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
  const paint=()=>{const c=cv.getContext('2d');c.fillStyle='#9a7350';c.fillRect(0,0,512,192);
    for(let i=0;i<40;i++){c.strokeStyle=`rgba(60,40,24,${0.08+rnd()*0.1})`;c.lineWidth=2+rnd()*3;c.beginPath();const y=rnd()*192;c.moveTo(0,y);c.bezierCurveTo(170,y+rr(-6,6),340,y+rr(-6,6),512,y+rr(-4,4));c.stroke();}
    c.fillStyle='#f6ecd6';c.font='88px "IM Fell DW Pica", Georgia, serif';c.textAlign='center';c.textBaseline='middle';c.fillText('Mill Pond',256,92);
    c.strokeStyle='#3a2716';c.lineWidth=8;c.strokeRect(6,6,500,180);tex.needsUpdate=true;};
  paint();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(paint).catch(()=>{});
  const wood=makeToon(0x7d5a3d,{});
  const boardMats=[wood,wood,wood,wood,new THREE.MeshToonMaterial({map:tex,gradientMap}),new THREE.MeshToonMaterial({map:tex,gradientMap})];
  const b=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.56,0.08),boardMats);b.position.set(0,1.55,0.08);b.castShadow=true;g.add(b);addOutline(b,0.02);
  addCollider(x,z,0.4);BUILDINGS.push({x,z,r:1.5});
})();

for(const b of BRIDGES){
  const g=new THREE.Group();g.position.set(b.x,b.deck,b.z);g.rotation.y=Math.atan2(-b.nz,b.nx);scene.add(g);STATIC_GROUPS.push(g);
  const wood=0x8a6a4a;
  for(let i=-6;i<=6;i++){const u=i*0.8;const y=0.3*(1-(u/b.half)*(u/b.half));boxM(0.7,0.12,2.3,i%2?wood:0x80603f,g,u,y,0,0);}
  for(const side of [-1,1]){
    for(let i=-3;i<=3;i++){const u=i*1.6;const y=0.3*(1-(u/b.half)*(u/b.half));boxM(0.1,0.8,0.1,0x6b4c33,g,u,y+0.4,side*1.1,0);}
    const rail=new THREE.Mesh(new THREE.BoxGeometry(9.8,0.08,0.08),makeToon(0x6b4c33,{}));rail.position.set(0,0.95,side*1.1);rail.castShadow=true;g.add(rail);
  }
  BUILDINGS.push({x:b.x,z:b.z,r:5.5});
}

/* Sluice gate (project 2) */
const sluice=(()=>{
  const p=polyPoint(OUTLET,SLUICE_S);const nx=-p.tz,nz=p.tx;
  const bed=groundH(p.x,p.z);
  const bankA=groundH(p.x+nx*5.5,p.z+nz*5.5),bankB=groundH(p.x-nx*5.5,p.z-nz*5.5);
  const top=Math.max(bankA,bankB)+0.7;const H=top-bed;
  const g=new THREE.Group();g.position.set(p.x,bed,p.z);g.rotation.y=Math.atan2(-nz,nx);scene.add(g);
  const stone=0x9b968a,wood=0x7a5a3c;
  boxM(1.1,H,1.4,stone,g,3.05,H/2,0,0.03);
  const builtParts=[],brokenParts=[];
  builtParts.push(boxM(1.1,H,1.4,stone,g,-3.05,H/2,0,0.03));
  brokenParts.push(boxM(1.1,H*0.62,1.4,stone,g,-3.25,H*0.28,0.1,0.03,0,0.1,-0.28));
  brokenParts.push(boxM(0.7,0.5,0.6,stone,g,-1.9,0.25,1.2,0.02,0.3,0.4,0.2));
  brokenParts.push(boxM(0.6,0.45,0.5,stone,g,-2.4,0.22,-1.4,0.02,0.1,-0.3,0.4));
  brokenParts.push(boxM(7.0,0.32,0.45,wood,g,0.2,0.45,0.9,0.02,0.1,0.35,0.22));
  brokenParts.push(boxM(4.6,0.28,0.1,wood,g,1.0,0.12,-1.5,0.015,Math.PI/2-0.1,0.6,0));
  brokenParts.push(boxM(3.2,0.28,0.1,wood,g,-0.6,0.12,1.9,0.015,Math.PI/2+0.2,-0.3,0));
  builtParts.push(boxM(7.6,0.4,0.55,wood,g,0,H+0.15,0,0.025));
  for(let i=0;i<6;i++)builtParts.push(boxM(5.0,0.3,0.12,i%2?0x84623f:wood,g,0,0.25+i*0.32,0.05,0.012));
  for(const x of [-2.45,2.45])builtParts.push(boxM(0.16,H,0.3,0x5b4130,g,x,H/2,0.05,0.012));
  const winch=new THREE.Group();winch.position.set(0,H+0.75,0);g.add(winch);
  const wm=makeToon(0x5b4130,{});
  winch.add(new THREE.Mesh(new THREE.TorusGeometry(0.45,0.05,8,20),wm));
  for(let i=0;i<4;i++){const sp=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.9,0.05),wm);sp.rotation.z=i*Math.PI/4;winch.add(sp);}
  const post=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.6,6),wm);post.position.y=-0.3;winch.add(post);
  winch.traverse(o=>{if(o.isMesh)o.castShadow=true;});builtParts.push(winch);
  for(const m of builtParts){m.userData.target=m.scale.clone();m.visible=false;m.scale.setScalar(0.001);}
  const world=(lx,lz)=>{const v=new THREE.Vector3(lx,0,lz).applyEuler(g.rotation);return {x:p.x+v.x,z:p.z+v.z};};
  const a=world(3.05,0),b=world(-3.05,0);addCollider(a.x,a.z,0.9);addCollider(b.x,b.z,0.9);
  const south=nz>0?{x:p.x+nx*4.6,z:p.z+nz*4.6}:{x:p.x-nx*4.6,z:p.z-nz*4.6};
  BUILDINGS.push({x:p.x,z:p.z,r:6});
  return {g,builtParts,brokenParts,winch,x:p.x,z:p.z,south,bed,H,anim:-1,built:false};
})();
function setSluiceBuilt(b){
  sluice.built=b;sluice.anim=-1;
  for(const m of sluice.brokenParts){m.visible=!b;m.scale.setScalar(1);}
  for(const m of sluice.builtParts){m.visible=b;m.userData.puffed=b;if(b)m.scale.copy(m.userData.target);else m.scale.setScalar(0.001);}
}

/* Debris piles (project 1) */
const PILE_ANGLES=[70,112,150,196,300,258];
const piles=PILE_ANGLES.map((deg,i)=>{
  const a=deg*Math.PI/180;let r=37;let x,z;
  do{x=Math.cos(a)*r;z=Math.sin(a)*r;r+=0.5;}while(groundH(x,z)<0.86&&r<70);
  const g=new THREE.Group();g.position.set(x,groundH(x,z),z);g.rotation.y=rnd()*Math.PI*2;scene.add(g);
  const drift=0x9c8b74,dark=0x5a4636,weed=0x4f5d3a,st=0x8d8a82;
  const parts=[];
  const log=(len,rad,col,px,py,pz,ry,rz)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(rad*0.85,rad,len,7),makeToon(col,{}));m.position.set(px,py,pz);m.rotation.set(0,ry,Math.PI/2+rz);m.castShadow=true;g.add(m);parts.push(m);return m;};
  log(rr(1.6,2.2),rr(0.14,0.2),drift,0,0.18,0,rr(0,3),rr(-0.15,0.15));
  log(rr(1.3,1.8),rr(0.12,0.16),drift,rr(-0.3,0.3),0.42,rr(-0.3,0.3),rr(0,3),rr(-0.3,0.3));
  log(rr(1.0,1.6),0.05,dark,rr(-0.4,0.4),0.55,rr(-0.4,0.4),rr(0,3),rr(-0.6,0.6));
  log(rr(0.8,1.3),0.04,dark,rr(-0.4,0.4),0.35,rr(-0.4,0.4),rr(0,3),rr(-0.6,0.6));
  if(i%2===0){const c=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.42,0.5),makeToon(0x8a6b48,{}));c.position.set(rr(-0.6,0.6),0.25,rr(-0.6,0.6));c.rotation.set(rr(-.3,.3),rr(0,3),rr(-.3,.3));c.castShadow=true;g.add(c);parts.push(c);}
  for(let k=0;k<3;k++){const w=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(rr(0.25,0.4),1),0.2,3),makeToon(weed,{}));w.scale.y=0.5;w.position.set(rr(-0.7,0.7),0.12,rr(-0.7,0.7));w.castShadow=true;g.add(w);parts.push(w);}
  for(let k=0;k<2;k++){const s=new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.18,0.26),0),makeToon(st,{}));s.position.set(rr(-0.7,0.7),0.12,rr(-0.7,0.7));s.rotation.set(rnd()*3,rnd()*3,rnd()*3);s.castShadow=true;g.add(s);parts.push(s);}
  const shells=[];
  parts.forEach(m=>{m.userData.home=m.position.clone();m.userData.rot0=m.rotation.clone();m.userData.s0=m.scale.clone();m.userData.spin=new THREE.Vector3(rr(-4,4),rr(-4,4),rr(-4,4));shells.push(addOutline(m,0.07,glowShellMat));});
  const pile={g,parts,shells,x,z,cleared:false,anim:-1,idx:i};
  addCollider(x,z,0.85,()=>!pile.cleared);
  BUILDINGS.push({x,z,r:2});
  return pile;
});
function resetPile(p){p.cleared=false;p.anim=-1;p.g.visible=true;p.parts.forEach(m=>{m.position.copy(m.userData.home);m.rotation.copy(m.userData.rot0);m.scale.copy(m.userData.s0);});}

/* Reeds */
function reedGeo(){
  const parts=[];
  for(let b=0;b<3;b++){
    const h=rr(1.1,1.6),a=b/3*Math.PI*2+rr(-.3,.3);
    const blade=new THREE.PlaneGeometry(0.06,h,1,4);blade.translate(0,h/2,0);
    const p=blade.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),t=y/h;p.setX(i,p.getX(i)*(1-t*0.9)+Math.cos(a)*t*t*0.25);p.setZ(i,Math.sin(a)*t*t*0.25);}
    blade.rotateY(a);blade.computeVertexNormals();
    const g=prep(blade,0x7b9a45,(x,y)=>Math.pow(y/h,1.5));
    const c=g.attributes.color;for(let i=0;i<c.count;i++){const t=g.attributes.position.getY(i)/h;c.setXYZ(i,c.getX(i)*lerp(0.6,1.15,t),c.getY(i)*lerp(0.6,1.15,t),c.getZ(i)*lerp(0.6,1.1,t));}
    parts.push(g);
  }
  parts.push(prep(new THREE.CylinderGeometry(0.012,0.016,1.45,4).translate(0,0.725,0),0x6f8a3c,(x,y)=>Math.pow(y/1.45,1.5)));
  parts.push(prep(new THREE.CapsuleGeometry(0.045,0.18,3,6).translate(0,1.36,0),0x6b4329,0.95));
  return mergeGeometries(parts);
}
const reedMat=makeToon(0xffffff,{vc:true,wind:true,windAmp:1.3,side:THREE.DoubleSide,rim:0.15});
const CLUMPS=[];{
  const sStart=polyFindRadius(INLET,55);
  for(let i=0;i<4;i++){const p=polyPoint(INLET,sStart+i*3.4);const nx=-p.tz,nz=p.tx;const off=2.6+(i%2)*0.6;CLUMPS.push({x:p.x-nx*off,z:p.z-nz*off,harvested:false,idx:i});}
}
const reedWild=new THREE.InstancedMesh(reedGeo(),reedMat,CLUMPS.length*12);reedWild.castShadow=true;reedWild.frustumCulled=false;scene.add(reedWild);
const reedWildData=[];
CLUMPS.forEach((c,ci)=>{for(let k=0;k<12;k++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*1.0;reedWildData.push({x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r,ry:rnd()*6.28,s:rr(0.8,1.15),clump:ci});}});
function layoutWildReeds(){
  reedWildData.forEach((d,i)=>{const c=CLUMPS[d.clump];const k=c.harvested?0.38:1;dummy.position.set(d.x,groundH(d.x,d.z)-0.05,d.z);dummy.rotation.set(0,d.ry,0);dummy.scale.set(d.s,d.s*k,d.s);dummy.updateMatrix();reedWild.setMatrixAt(i,dummy.matrix);});
  reedWild.instanceMatrix.needsUpdate=true;
}
const SPOT_ANGLES=[60,78,96,114,132,150,168,186];
const SPOTS=SPOT_ANGLES.map((deg,i)=>{const a=deg*Math.PI/180;let r=21;let x,z;do{x=Math.cos(a)*r;z=Math.sin(a)*r;r+=0.25;}while(groundH(x,z)<-0.12&&r<40);return {x,z,planted:false,grow:0,growing:false,idx:i};});
const reedPlanted=new THREE.InstancedMesh(reedGeo(),reedMat,SPOTS.length*9);reedPlanted.castShadow=true;reedPlanted.frustumCulled=false;scene.add(reedPlanted);
const reedPlantedData=[];
SPOTS.forEach((s,si)=>{for(let k=0;k<9;k++){const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*1.0;reedPlantedData.push({x:s.x+Math.cos(a)*r,z:s.z+Math.sin(a)*r,ry:rnd()*6.28,s:rr(0.85,1.2),spot:si,delay:rnd()*0.4});}});
function layoutPlantedReeds(){
  reedPlantedData.forEach((d,i)=>{const sp=SPOTS[d.spot];const gk=clamp((sp.grow-d.delay)/(1-d.delay*0.5),0,1);const k=sp.planted?Math.max(easeOutBack(gk),0.001):0.001;
    dummy.position.set(d.x,groundH(d.x,d.z)-0.06,d.z);dummy.rotation.set(0,d.ry,0);dummy.scale.setScalar(d.s*k);dummy.updateMatrix();reedPlanted.setMatrixAt(i,dummy.matrix);});
  reedPlanted.instanceMatrix.needsUpdate=true;
}
const spotMarkers=SPOTS.map(s=>{
  const g=new THREE.Group();g.position.set(s.x,groundH(s.x,s.z),s.z);scene.add(g);
  const mound=new THREE.Mesh(new THREE.SphereGeometry(0.55,14,8,0,Math.PI*2,0,Math.PI/2).scale(1,0.28,1),makeToon(0x5e4a36,{}));mound.receiveShadow=true;g.add(mound);
  const stake=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.03,0.9,5),makeToon(0xb79a63,{}));stake.position.set(0.35,0.45,0.1);stake.rotation.z=0.12;stake.castShadow=true;g.add(stake);
  const rib=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.22,0.08),makeToon(0xb5442b,{noHeal:true}));rib.position.set(0.39,0.78,0.16);rib.rotation.z=0.4;g.add(rib);
  g.visible=false;return g;
});

/* ================================================================
   The Old Orchard: barrier log, brambles, stone heaps, the channel, the old apple tree, eight stumps
   ================================================================ */
const barrier=(()=>{
  const info=polyInfo(BARRIER.x,BARRIER.z,LANE);
  const g=new THREE.Group();g.position.set(BARRIER.x,groundH(BARRIER.x,BARRIER.z)+0.38,BARRIER.z);g.rotation.y=Math.atan2(-info.tx,-info.tz);scene.add(g);
  const bark=makeToon(0x6a5040,{});
  const log=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.5,7.4,9).rotateZ(Math.PI/2),bark);log.castShadow=true;g.add(log);addOutline(log,0.03);
  for(const [x,a] of [[-2.2,0.8],[1.4,-0.6],[2.9,2.2]]){const st=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.16,1.3,6),bark);st.position.set(x,0.5,0.1);st.rotation.set(a,0,0.3);st.castShadow=true;g.add(st);}
  for(let i=0;i<5;i++){const m=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(rr(0.22,0.38),1),0.2,3),makeToon(0x5d7a3a,{}));m.scale.y=0.5;m.position.set(rr(-3,3),0.4,rr(-0.2,0.2));g.add(m);}
  const end=new THREE.Mesh(new THREE.CircleGeometry(0.42,12),makeToon(0xc9a878,{}));end.rotation.y=Math.PI/2;end.position.x=3.71;g.add(end);
  const home=g.position.clone(),perp=new THREE.Vector3(-info.tz,0,info.tx);
  return {g,home,perp,open:false,anim:-1};
})();
addCollider(BARRIER.x,BARRIER.z,1.3,()=>!barrier.open);
function setBarrierOpen(open,instant){
  barrier.open=open;
  if(instant||!open){barrier.anim=-1;barrier.g.position.copy(barrier.home);if(open)barrier.g.position.addScaledVector(barrier.perp,4.6);barrier.g.rotation.x=open?2.4:0;}
  else barrier.anim=0;
}

const BR_OFF=[[-6,0],[6,1],[0,8],[-12,9],[12,-9],[-2,-8],[14,4]];
const brambles=BR_OFF.map(([ox,oz],i)=>{
  const x=ORCH.x+ox,z=ORCH.z+oz;
  const g=new THREE.Group();g.position.set(x,groundH(x,z),z);g.rotation.y=rnd()*6.28;scene.add(g);
  const parts=[];
  for(let k=0;k<5;k++){const m=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(rr(0.45,0.72),1),0.38,2.2),makeToon(k%2?0x40502c:0x4b3c3a,{}));m.scale.y=rr(0.55,0.85);m.position.set(rr(-0.8,0.8),0.32,rr(-0.8,0.8));m.castShadow=true;g.add(m);parts.push(m);}
  for(let k=0;k<7;k++){const a=rnd()*6.28;const st=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.035,rr(1.0,1.7),4),makeToon(0x5a3a32,{}));st.position.set(Math.cos(a)*0.5,0.6,Math.sin(a)*0.5);st.rotation.set(Math.sin(a)*0.9,0,-Math.cos(a)*0.9);st.castShadow=true;g.add(st);parts.push(st);}
  for(let k=0;k<5;k++){const b=new THREE.Mesh(new THREE.SphereGeometry(0.06,6,5),makeToon(0x3a1838,{noHeal:true}));b.position.set(rr(-0.8,0.8),rr(0.5,0.95),rr(-0.8,0.8));g.add(b);parts.push(b);}
  const shells=[];
  parts.forEach((m,k)=>{m.userData.home=m.position.clone();m.userData.rot0=m.rotation.clone();m.userData.s0=m.scale.clone();m.userData.spin=new THREE.Vector3(rr(-4,4),rr(-4,4),rr(-4,4));if(k<5)shells.push(addOutline(m,0.07,glowShellMat));});
  const b={g,parts,shells,x,z,cleared:false,anim:-1,idx:i};
  addCollider(x,z,0.95,()=>!b.cleared);BUILDINGS.push({x,z,r:2.2});
  return b;
});

const ROCK_OFF=[[-17,-4],[-14,12],[17,-8],[8,15],[-5,-17]];
const stoneHeaps=ROCK_OFF.map(([ox,oz],i)=>{
  const x=ORCH.x+ox,z=ORCH.z+oz;const g=new THREE.Group();g.position.set(x,groundH(x,z),z);g.rotation.y=rnd()*6.28;scene.add(g);
  const parts=[];
  for(let k=0;k<3;k++){const m=new THREE.Mesh(lumpy(new THREE.DodecahedronGeometry(rr(0.38,0.55),0),0.15,2),makeToon(0x9a968b,{}));m.position.set(Math.cos(k*2.1)*0.55,0.25,Math.sin(k*2.1)*0.55);m.rotation.set(rnd()*3,rnd()*3,rnd()*3);m.castShadow=true;g.add(m);parts.push(m);}
  const moss=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.4,1),0.2,3),makeToon(0x6f8f45,{}));moss.scale.y=0.35;moss.position.y=0.05;g.add(moss);
  const h={g,parts,x,z,left:3,idx:i};BUILDINGS.push({x,z,r:1.6});return h;
});
function syncStoneHeap(h){h.parts.forEach((m,k)=>{m.visible=k<h.left;});}

const CH_S=[2.5,8,13.5,19];
const chanSegs=CH_S.map((s,i)=>{
  const p=polyPoint(CH,s);const nx=-p.tz,nz=p.tx;
  const g=new THREE.Group();g.position.set(p.x,groundH(p.x,p.z),p.z);g.rotation.y=Math.atan2(p.tx,p.tz);scene.add(g);
  const broken=[],fixed=[];const st=0x9b968a;
  broken.push(boxM(0.9,0.5,0.7,0x6c5a43,g,0,0.05,0,0.02,0.2,0.3,0.1));
  broken.push(boxM(0.5,0.4,0.6,st,g,0.9,0.25,0.8,0.02,0.4,0.6,0.3));
  broken.push(boxM(0.6,0.35,0.5,st,g,-0.8,0.2,-1.1,0.02,0.2,-0.4,0.5));
  for(const side of [-1,1])for(let k=-2;k<=2;k++)fixed.push(boxM(0.42,0.36,0.98,k%2?0x8f8a7e:st,g,side*0.95,0.12,k*1.0,0.012,0,rr(-0.08,0.08),0));
  fixed.forEach(m=>{m.userData.target=m.scale.clone();m.visible=false;});
  const c={g,broken,fixed,x:p.x,z:p.z,ix:p.x+nx*1.9,iz:p.z+nz*1.9,fixedOK:false,anim:-1,idx:i};
  BUILDINGS.push({x:p.x,z:p.z,r:1.8});return c;
});
function setChanFixed(c,on){c.fixedOK=on;c.anim=-1;c.broken.forEach(m=>{m.visible=!on;m.scale.setScalar(1);});c.fixed.forEach(m=>{m.visible=on;m.scale.copy(m.userData.target);});}

/* fruit trees: one shared canopy material whose colour follows the season */
const orchLeafMat=makeToon(0xffffff,{vc:true,wind:true,windAmp:0.35,rim:0.25,tag:'orchLeaf',leaf:true});
const appleMat=makeToon(0xc8352a,{rim:0.4,noHeal:true,tag:'apple',fade:true});
/* v7: canopies as clusters of faceted leaf clumps, painted light at the crown and dark underneath */
function clusterCanopyGeo(blobs,topY,rs=rnd,dens=1){
  const parts=[];const c=new THREE.Color();let lo=1e9;for(const b of blobs)lo=Math.min(lo,b[1]-b[3]*0.8);const span=Math.max(0.5,topY-lo);
  const push=(g,cx,cy,cz,jit)=>{g=g.index?g.toNonIndexed():g;const p=g.attributes.position;const cols=new Float32Array(p.count*3),sw=new Float32Array(p.count);
    for(let i=0;i<p.count;i++){const x=p.getX(i)+cx,y=p.getY(i)+cy,z=p.getZ(i)+cz;p.setXYZ(i,x,y,z);}
    g.computeVertexNormals();const n=g.attributes.normal;
    for(let i=0;i<p.count;i++){const y=p.getY(i);const t=clamp((y-lo)/span,0,1);leafShade(n.getY(i),c,jit);const gk=lerp(0.52,1.2,t*t*(3-2*t));
      cols[i*3]=c.r*gk*lerp(0.92,1.04,t);cols[i*3+1]=c.g*gk;cols[i*3+2]=c.b*gk*lerp(1.08,0.9,t);sw[i]=0.25+0.75*t;}
    g.setAttribute('color',new THREE.BufferAttribute(cols,3));g.setAttribute('aSway',new THREE.BufferAttribute(sw,1));if(g.attributes.uv)g.deleteAttribute('uv');parts.push(g);};
  for(const b of blobs){
    const core=new THREE.IcosahedronGeometry(b[3]*0.68,1);core.scale(1,0.8,1);push(core,b[0],b[1]-b[3]*0.05,b[2],0.15);
    const N=Math.round((7+9*b[3]*b[3])*dens);
    for(let k=0;k<N;k++){const u=rs()*2-1,ph=rs()*6.28;const up=clamp(u*0.9+0.15,-0.55,0.97);const rxy=Math.sqrt(1-up*up);const d=b[3]*(0.5+rs()*0.38);
      const cr=b[3]*(0.28+rs()*0.16);const g=new THREE.IcosahedronGeometry(cr,0);g.scale(1+rs()*0.3,0.62+rs()*0.2,1+rs()*0.3);g.rotateY(rs()*6.28);g.rotateX((rs()-0.5)*0.6);
      const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)*(0.85+rs()*0.3),p.getY(i),p.getZ(i)*(0.85+rs()*0.3));
      push(g,b[0]+Math.cos(ph)*rxy*d,b[1]+up*d*0.85,b[2]+Math.sin(ph)*rxy*d,rs());}}
  return mergeGeometries(parts);
}
function fruitTree(x,z,big){
  const g=new THREE.Group();g.position.set(x,groundH(x,z)-0.1,z);g.rotation.y=rnd()*6.28;scene.add(g);
  const k=big?1.7:1;const trunkH=big?2.2:1.5;
  const tr=new THREE.CylinderGeometry(0.12*k,0.22*k,trunkH,7,4);tr.translate(0,trunkH/2,0);
  {const p=tr.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);p.setX(i,p.getX(i)+Math.sin(y*2.1)*0.12*k);}}
  const trunk=new THREE.Mesh(prep(tr,0x6a4f3a,0),makeToon(0xffffff,{vc:true,rim:0.2}));trunk.castShadow=true;g.add(trunk);
  const crown=new THREE.Group();crown.position.y=trunkH;g.add(crown);
  const blobs=[];for(let i=0;i<(big?7:4);i++){const a=i/(big?7:4)*6.28+rnd()*0.5,r=i===0?0:rr(0.7,1.2)*k;blobs.push([Math.cos(a)*r,rr(0.3,1.0)*k,Math.sin(a)*r,rr(0.75,1.0)*k]);}
  const parts=[];const c=new THREE.Color();
  if(true){parts.push(clusterCanopyGeo(blobs,Math.max(...blobs.map(b=>b[1]+b[3]))));}
  else for(const b of blobs){const ico=new THREE.IcosahedronGeometry(b[3],1);const p=ico.attributes.position,n=ico.attributes.normal;const cols=new Float32Array(p.count*3),sw=new Float32Array(p.count);
    for(let i=0;i<p.count;i++){const x0=p.getX(i),y0=p.getY(i),z0=p.getZ(i);const nn=vnoise(x0*2+b[0]*3,y0*2+z0*2)-0.5;p.setXYZ(i,x0*(1+nn*0.4)+b[0],y0*(1+nn*0.4)*0.85+b[1],z0*(1+nn*0.4)+b[2]);leafShade(n.getY(i),c,vnoise(x0*4,z0*4));cols[i*3]=c.r;cols[i*3+1]=c.g;cols[i*3+2]=c.b;sw[i]=0.5;}
    ico.setAttribute('color',new THREE.BufferAttribute(cols,3));ico.setAttribute('aSway',new THREE.BufferAttribute(sw,1));parts.push(ico);}
  const canopy=new THREE.Mesh(mergeGeometries(parts),orchLeafMat);canopy.castShadow=true;crown.add(canopy);
  const apples=new THREE.Group();crown.add(apples);
  for(let i=0;i<(big?14:7);i++){const b=blobs[i%blobs.length];const d=new THREE.Vector3(rr(-1,1),rr(-0.6,0.3),rr(-1,1)).normalize().multiplyScalar(b[3]*1.1);
    const a=new THREE.Mesh(new THREE.SphereGeometry(0.1*(big?1.1:1),8,6),appleMat);a.position.set(b[0]+d.x,b[1]+d.y*0.85,b[2]+d.z);apples.add(a);}
  return {g,crown,canopy,apples,blobs};
}
const oldApple=(()=>{const x=ORCH.x,z=ORCH.z-13;const t=fruitTree(x,z,true);addCollider(x,z,0.7);BUILDINGS.push({x,z,r:3});return Object.assign(t,{x,z});})();
const STUMP_OFF=[];for(const ox of [-10.5,-3.5,3.5,10.5])for(const oz of [-5,5])STUMP_OFF.push([ox,oz]);
const stumps=STUMP_OFF.map(([ox,oz],i)=>{
  const x=ORCH.x+ox,z=ORCH.z+oz;
  const sg=new THREE.Group();sg.position.set(x,groundH(x,z),z);scene.add(sg);
  const st=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.42,0.42,9),makeToon(0x6a5040,{}));st.position.y=0.15;st.castShadow=true;sg.add(st);addOutline(st,0.02);
  const top=new THREE.Mesh(new THREE.CircleGeometry(0.31,12).rotateX(-Math.PI/2),makeToon(0xc9a878,{}));top.position.y=0.365;sg.add(top);
  const tree=fruitTree(x+0.9,z+0.4,false);tree.g.scale.setScalar(0.001);tree.g.visible=false;
  BUILDINGS.push({x,z,r:1.6});
  return {x,z,sg,tree,planted:false,grow:0,growing:false,idx:i};
});
function setStumpPlanted(s,on){s.planted=on;s.growing=false;s.grow=on?1:0;s.tree.g.visible=on;s.tree.g.scale.setScalar(on?1:0.001);if(s.dap)s.dap.visible=on&&SEASON!=='winter';}

/* tumbledown stone walls ringing the orchard */
(()=>{
  const wm=makeToon(0x958f82,{});
  for(let a=0;a<Math.PI*2;a+=0.075){
    const deg=a*180/Math.PI;if(deg>338||deg<22||(deg>233&&deg<257))continue;
    if(vnoise(a*3.1,4.2)<0.32)continue;
    const r=21.5+Math.sin(a*3)*0.6;const x=ORCH.x+Math.cos(a)*r,z=ORCH.z+Math.sin(a)*r;
    const h=0.35+vnoise(a*5,1)*0.4;
    const b=new THREE.Mesh(new THREE.BoxGeometry(1.5,h,0.6),wm);b.position.set(x,groundH(x,z)+h/2-0.08,z);b.rotation.set(rr(-0.05,0.05),-a,rr(-0.06,0.06));b.castShadow=true;b.receiveShadow=true;scene.add(b);
    if(rnd()<0.4){const c=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.3,0.5),wm);c.position.set(x+rr(-0.3,0.3),b.position.y+h/2+0.1,z+rr(-0.3,0.3));c.rotation.y=rnd()*3;c.castShadow=true;scene.add(c);}
  }
})();

/* ================================================================
   Trees (blob core + Ghibli leaf cards), bushes, rocks, grass, flowers
   ================================================================ */
/* the old cider press: the orchard's fourth project, mended with bramble wood */
const PRESS={x:ORCH.x-12.5,z:ORCH.z-11};
const PRESS_WOOD=6;
const press=(()=>{
  const g=new THREE.Group();g.position.set(PRESS.x,groundH(PRESS.x,PRESS.z),PRESS.z);g.rotation.y=0.5;scene.add(g);
  const wood=0x7a5a3c,dark=0x5b4130,stone=0x9b968a;
  boxM(3.0,0.35,2.4,stone,g,0,0.17,0,0.02);
  const built=[],broken=[];
  built.push(boxM(0.28,2.7,0.28,dark,g,-1.1,1.6,0,0.015));
  built.push(boxM(0.28,2.7,0.28,dark,g,1.1,1.6,0,0.015));
  built.push(boxM(2.7,0.34,0.4,wood,g,0,2.95,0,0.02));
  const screw=new THREE.Group();screw.position.set(0,2.1,0);g.add(screw);built.push(screw);
  const sc=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,1.5,8),makeToon(0x6b4c33,{}));sc.castShadow=true;screw.add(sc);
  const bar=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.08,0.08),makeToon(dark,{}));bar.position.y=0.4;bar.castShadow=true;screw.add(bar);
  const tub=new THREE.Mesh(new THREE.CylinderGeometry(0.75,0.7,0.7,14,1,true),makeToon(wood,{side:THREE.DoubleSide}));tub.position.y=0.7;tub.castShadow=true;g.add(tub);built.push(tub);
  for(const y of [0.48,0.92]){const band=new THREE.Mesh(new THREE.TorusGeometry(0.74,0.03,6,24).rotateX(Math.PI/2),makeToon(0x3a3530,{}));band.position.y=y;g.add(band);built.push(band);}
  const plate=new THREE.Mesh(new THREE.CylinderGeometry(0.68,0.68,0.12,14),makeToon(wood,{}));plate.position.y=1.15;plate.castShadow=true;g.add(plate);built.push(plate);
  broken.push(boxM(2.7,0.34,0.4,wood,g,0.3,0.55,1.3,0.02,0.2,0.4,0.1));
  broken.push(boxM(0.28,2.7,0.28,dark,g,-1.4,0.5,-0.6,0.015,0,0.3,1.3));
  for(let i=0;i<5;i++)broken.push(boxM(0.18,0.7,0.06,wood,g,rr(-0.9,0.9),0.42,rr(-0.9,0.9),0.01,rr(-1.4,1.4),rr(0,3),rr(-1.4,1.4)));
  broken.push(boxM(0.28,1.3,0.28,dark,g,1.1,0.95,0,0.015));
  built.forEach(m=>{m.userData.target=m.scale.clone();m.visible=false;});
  for(let i=0;i<3;i++){const j=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,0.5,10),makeToon(0xb89a6a,{}));j.position.set(-1.9+i*0.55,0.25,1.6);j.castShadow=true;g.add(j);}
  /* v7: a hanging lantern on a crook post, so the press has a warm pool of light at dusk */
  { const L=new THREE.Group();L.position.set(2.1,0,-1.1);g.add(L);
    cylM(0.07,0.09,2.9,dark,L,0,1.45,0,6,0.01);boxM(0.9,0.08,0.08,dark,L,0.4,2.82,0,0.006);boxM(0.06,0.4,0.06,dark,L,0.82,2.95,0,0,0,0,-0.6);
    cylM(0.012,0.012,0.36,0x2a2420,L,0.8,2.62,0,4);
    const lm=makeToon(0xffe6b0,{emissive:0xffb35c,noHeal:true,tag:'lantern7'});lanternMats.push(lm);
    boxM(0.26,0.06,0.26,0x2a2420,L,0.8,2.44,0,0);boxM(0.3,0.06,0.3,0x2a2420,L,0.8,2.08,0,0);
    const core=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.3,0.2),lm);core.position.set(0.8,2.26,0);L.add(core);
    for(const [x,z] of [[-0.11,-0.11],[0.11,-0.11],[-0.11,0.11],[0.11,0.11]])boxM(0.03,0.34,0.03,0x2a2420,L,0.8+x,2.26,z,0);
    const ConeR=new THREE.Mesh(new THREE.ConeGeometry(0.2,0.14,4),makeToon(0x2a2420,{}));ConeR.position.set(0.8,2.54,0);ConeR.rotation.y=Math.PI/4;L.add(ConeR);
  }
  const world=(lx,lz)=>{const v=new THREE.Vector3(lx,0,lz).applyEuler(g.rotation);return {x:PRESS.x+v.x,z:PRESS.z+v.z};};
  const front=world(0,2.5);
  addCollider(PRESS.x,PRESS.z,1.5);BUILDINGS.push({x:PRESS.x,z:PRESS.z,r:3});
  return {g,built,broken,screw,fixedOK:false,anim:-1,ix:front.x,iz:front.z,x:PRESS.x,z:PRESS.z,world};
})();
{ const Lp=addLamp(press.g,2.9,2.2,-1.1);Lp.distance=18;const v=press.world(2.6,-0.9);makeLightPool(v.x,v.z,5.2);makeLightPool(v.x,v.z,2.8);addGlow(press.g,2.9,2.26,-1.1,2.2);const c=press.world(2.1,-1.1);addCollider(c.x,c.z,0.25); }
function setPressFixed(on){press.fixedOK=on;press.anim=-1;press.broken.forEach(m=>{m.visible=!on;m.scale.setScalar(1);});press.built.forEach(m=>{m.visible=on;m.scale.copy(m.userData.target);});}
let heroCards=null;
const LEAF_TEX=leafTexture();
function seededRnd(sd){let s=sd>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
/* canopy colours are light/shade values with a slight warm-top, cool-bottom shift; each instance multiplies its season's hue */
function leafShade(up,out,j){const t=smooth(-0.7,0.9,up);const v=lerp(0.5,1.14,t)*(0.88+j*0.22);out.setRGB(v*lerp(0.84,1.02,t),v*lerp(0.95,1.0,t),v*lerp(1.1,0.82,t));return out;}
/* Four silhouettes: broad lopsided crowns, tall clumped ovals, slender columns, bushes. Never a ball on a stick. */
function treeBlobs(kind,rs){
  const B=[];let trunkH;
  if(kind===0){trunkH=2.2+rs()*0.7;const lx=(rs()-0.5)*1.4,lz=(rs()-0.5)*1.4;B.push([lx*0.3,trunkH+1.1,lz*0.3,1.9]);
    const n=6+(rs()*4|0);for(let i=0;i<n;i++){const a=i/n*6.28+rs()*0.7,r=1.2+rs()*1.3;B.push([Math.cos(a)*r+lx,trunkH+0.1+rs()*1.9,Math.sin(a)*r+lz,0.8+rs()*0.7]);}
    B.push([lx*0.6,trunkH+2.6+rs()*0.5,lz*0.6,1.05+rs()*0.3]);}
  else if(kind===1){trunkH=3.0+rs()*0.9;for(let i=0;i<5;i++){const a=rs()*6.28;B.push([Math.cos(a)*0.6,trunkH+0.3+i*0.95,Math.sin(a)*0.6,1.4-i*0.13+rs()*0.25]);}
    for(let i=0;i<3;i++){const a=rs()*6.28;B.push([Math.cos(a)*1.35,trunkH+0.6+rs()*2.2,Math.sin(a)*1.35,0.75+rs()*0.35]);}}
  else if(kind===2){trunkH=1.5;for(let i=0;i<6;i++)B.push([(rs()-0.5)*0.6,trunkH+0.4+i*1.0,(rs()-0.5)*0.6,1.0-i*0.09]);}
  else{trunkH=0;const n=4+(rs()*3|0);for(let i=0;i<n;i++){const a=rs()*6.28,r=rs()*0.95;B.push([Math.cos(a)*r,0.5+rs()*0.5,Math.sin(a)*r,0.55+rs()*0.45]);}}
  return {trunkH,blobs:B,topY:Math.max(...B.map(b=>b[1]+b[3]))};
}
function trunkGeo(trunkH,blobs,rs,thick=1,boughs=3){
  const parts=[];
  const tr=new THREE.CylinderGeometry(0.17*thick,0.36*thick,trunkH+0.8,8,6);tr.translate(0,(trunkH+0.8)/2,0);
  const p=tr.attributes.position;const ph=rs()*6;
  for(let i=0;i<p.count;i++){const y=p.getY(i);p.setX(i,p.getX(i)+Math.sin(y*1.1+ph)*0.14*thick);p.setZ(i,p.getZ(i)+Math.cos(y*0.9+ph)*0.09*thick);}
  parts.push(prep(tr,0x6a4f3a,0));
  for(let i=0;i<boughs;i++){const b=blobs[1+((rs()*(blobs.length-1))|0)]||blobs[0];
    const from=new THREE.Vector3(0,trunkH*0.7,0),to=new THREE.Vector3(b[0]*0.8,b[1]-b[3]*0.35,b[2]*0.8);const L=Math.max(0.5,from.distanceTo(to));
    const br=new THREE.CylinderGeometry(0.05*thick,0.12*thick,L,5);br.translate(0,L/2,0);
    br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize()));br.translate(from.x,from.y,from.z);
    parts.push(prep(br,0x6a4f3a,0.04));}
  return mergeGeometries(parts);
}
function canopyGeo(blobs,topY,detail=2,flat=0.3){
  const parts=[];const c=new THREE.Color();
  for(const b of blobs){
    const ico=new THREE.IcosahedronGeometry(b[3]*0.92,detail);
    const p=ico.attributes.position,n=ico.attributes.normal;const cols=new Float32Array(p.count*3),sw=new Float32Array(p.count);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const nn=vnoise(x*1.6+b[0]*3,y*1.6+z*1.6+b[2]*3)-0.5;
      let nx=x*(1+nn*0.42),ny=y*(1+nn*0.42),nz=z*(1+nn*0.42);if(ny<-b[3]*flat)ny=-b[3]*flat+(ny+b[3]*flat)*0.45;
      p.setXYZ(i,nx+b[0],ny+b[1],nz+b[2]);
      leafShade(n.getY(i),c,vnoise(x*4,z*4));{const th=clamp((ny+b[1])/topY,0,1)+(vnoise(x*3+b[0],z*3+b[2])-0.5)*0.18;const band=th<0.42?0.7:th<0.72?0.9:1.08;const under=n.getY(i)<-0.25?0.66:1;c.multiplyScalar(band*under);}
      cols[i*3]=c.r;cols[i*3+1]=c.g;cols[i*3+2]=c.b;
      sw[i]=0.25+0.75*clamp((ny+b[1])/topY,0,1);
    }
    ico.setAttribute('color',new THREE.BufferAttribute(cols,3));ico.setAttribute('aSway',new THREE.BufferAttribute(sw,1));parts.push(ico);
  }
  return mergeGeometries(parts);
}
function cardGeo(blobs,topY,density=1,rs=rnd){
  const parts=[];const o=new THREE.Object3D();const c=new THREE.Color();const dir=new THREE.Vector3();
  for(const b of blobs){
    const n=Math.round((9+b[3]*11)*density);
    for(let i=0;i<n;i++){
      dir.set(rs()*2-1,rs()*1.55-0.55,rs()*2-1).normalize();
      const size=0.7+b[3]*0.45;const q=new THREE.PlaneGeometry(size,size);
      o.position.set(b[0]+dir.x*b[3]*0.95,b[1]+dir.y*b[3]*0.95,b[2]+dir.z*b[3]*0.95);
      o.rotation.set(0,0,0);o.lookAt(o.position.x+dir.x,o.position.y+dir.y,o.position.z+dir.z);o.rotateZ(rs()*6.28);o.updateMatrix();q.applyMatrix4(o.matrix);
      const g=q.toNonIndexed();const cnt=g.attributes.position.count;
      const nrm=new Float32Array(cnt*3),cols=new Float32Array(cnt*3),sw=new Float32Array(cnt);
      leafShade(dir.y,c,rs());
      for(let v=0;v<cnt;v++){nrm[v*3]=dir.x;nrm[v*3+1]=dir.y;nrm[v*3+2]=dir.z;cols[v*3]=c.r;cols[v*3+1]=c.g;cols[v*3+2]=c.b;sw[v]=0.35+0.65*clamp(g.attributes.position.getY(v)/topY,0,1);}
      g.setAttribute('normal',new THREE.BufferAttribute(nrm,3));g.setAttribute('color',new THREE.BufferAttribute(cols,3));g.setAttribute('aSway',new THREE.BufferAttribute(sw,1));
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}
const treeMat=makeToon(0xffffff,{vc:true,wind:true,windAmp:0.32,rim:0.26,leaf:true});
const cardMat=makeToon(0xffffff,{vc:true,wind:true,windAmp:0.38,rim:0.3,side:THREE.DoubleSide,alphaMap:LEAF_TEX,alphaTest:0.5,mapKey:'leaf',back:0.9,leaf:true});
const VARIANTS=[[0,11],[0,23],[0,37],[1,41],[1,53],[2,61],[2,67],[3,71],[3,79],[3,83]].map(([kind,sd])=>{
  const rs=seededRnd(sd*7919);const tb=treeBlobs(kind,rs);
  return {kind,tb,trunk:kind===3?null:trunkGeo(tb.trunkH,tb.blobs,rs,kind===2?0.75:1,kind===2?1:3),canopy:canopyGeo(tb.blobs,tb.topY,kind===3?1:2),cards:cardGeo(tb.blobs,tb.topY,kind===3?0.7:1,rs),list:[]};
});
const VAR_BY_KIND=[[0,1,2],[3,4],[5,6],[7,8,9]];
/* groves: trees grow in families of three to seven, with bushes at their skirts */
const GROVES=[];
for(let tries=0;tries<600&&GROVES.length<15;tries++){
  const a=rnd()*Math.PI*2,r=48+rnd()*56;const x=Math.cos(a)*r,z=Math.sin(a)*r;
  if(!scatterOK(x,z,{minH:0.3,maxSlope:0.85,path:5,chan:7,pad:4}))continue;
  if(GROVES.some(g=>Math.hypot(g.x-x,g.z-z)<19))continue;
  if(Math.hypot(x-2,z-60)<15||Math.hypot(x-HERO.x,z-HERO.z)<17)continue;
  GROVES.push({x,z,n:3+(rnd()*5|0),kind:rnd()<0.6?0:rnd()<0.6?1:2});
}
const allTrees=[];
function placeTree(kind,x,z,s){const vs=VAR_BY_KIND[kind];const v=VARIANTS[vs[(rnd()*vs.length)|0]];const t={x,z,s,ry:rnd()*6.28,var:rnd(),v,ever:rnd()<0.3};v.list.push(t);allTrees.push(t);if(kind!==3)addCollider(x,z,0.42*s);return t;}
const treeTooClose=(x,z,d)=>allTrees.some(t=>t.v.kind!==3&&Math.hypot(t.x-x,t.z-z)<d);
for(const gr of GROVES){
  let placed=0;
  for(let k=0;k<40&&placed<gr.n;k++){const a=rnd()*6.28,r=placed===0?0:rr(2.8,8.5);const x=gr.x+Math.cos(a)*r,z=gr.z+Math.sin(a)*r;
    if(!scatterOK(x,z,{minH:0.25,maxSlope:0.9,path:3.2,chan:6,pad:2.5}))continue;if(treeTooClose(x,z,3.4))continue;
    const kind=rnd()<0.75?gr.kind:(rnd()<0.5?0:1);placeTree(kind,x,z,rr(0.85,1.35)*(Math.hypot(x,z)>80?1.2:1));placed++;}
  for(let k=0;k<10;k++){const a=rnd()*6.28,r=rr(6,12);const x=gr.x+Math.cos(a)*r,z=gr.z+Math.sin(a)*r;if(scatterOK(x,z,{minH:0.1,maxSlope:0.9,path:2,chan:4,pad:1})&&!treeTooClose(x,z,2.2))placeTree(3,x,z,rr(0.8,1.4));}
}
for(let tries=0;tries<500;tries++){ /* the hill ring: looser, larger trees */
  const a=rnd()*Math.PI*2,r=rr(84,108);const x=Math.cos(a)*r,z=Math.sin(a)*r;
  if(!scatterOK(x,z,{minH:0.5,maxSlope:1.0,path:3,chan:6,pad:3}))continue;if(treeTooClose(x,z,6))continue;
  placeTree(rnd()<0.55?0:1,x,z,rr(1.1,1.6));if(rnd()<0.5){const x2=x+rr(-4,4),z2=z+rr(-4,4);if(scatterOK(x2,z2,{minH:0.5,maxSlope:1.0,path:3})&&!treeTooClose(x2,z2,3))placeTree(rnd()<0.5?2:3,x2,z2,rr(0.9,1.3));}
}
for(let tries=0;tries<200;tries++){ /* bushes along the meadow, pond side */
  const a=rnd()*Math.PI*2,r=rr(30,70);const x=Math.cos(a)*r,z=Math.sin(a)*r;
  if(!scatterOK(x,z,{minH:0.15,maxSlope:0.9,path:2.2,chan:4.5,pad:1.5}))continue;if(Math.hypot(x-2,z-60)<6||treeTooClose(x,z,2.5))continue;
  placeTree(3,x,z,rr(0.7,1.3));if(VARIANTS[7].list.length+VARIANTS[8].list.length+VARIANTS[9].list.length>150)break;
}
for(let a=0;a<6.28;a+=0.21){ /* trees framing the orchard */
  if(a>4.4&&a<5.2)continue;const r=rr(25,30);const x=ORCH.x+Math.cos(a)*r,z=ORCH.z+Math.sin(a)*r;
  if(slopeAt(x,z)>1.2||pathDist(x,z)<3||polyInfo(x,z,CH).d<3||polyInfo(x,z,INLET).d<5||treeTooClose(x,z,3.5))continue;placeTree(rnd()<0.5?0:1,x,z,rr(0.9,1.3));
}
const treeMeshes=[];
for(const v of VARIANTS){
  const n=Math.max(v.list.length,1);
  const trunk=v.trunk?new THREE.InstancedMesh(v.trunk,treeMat,n):null;
  const can=new THREE.InstancedMesh(v.canopy,treeMat,n),cards=new THREE.InstancedMesh(v.cards,cardMat,n);
  for(const m of [trunk,can,cards])if(m){m.castShadow=m!==cards;m.receiveShadow=true;scene.add(m);if(!v.list.length)m.count=0;}
  v.list.forEach((t,i)=>{dummy.position.set(t.x,groundH(t.x,t.z)-0.15,t.z);dummy.rotation.set(0,t.ry,0);dummy.scale.setScalar(t.s);dummy.updateMatrix();t.mat=dummy.matrix.clone();if(trunk)trunk.setMatrixAt(i,t.mat);can.setMatrixAt(i,t.mat);cards.setMatrixAt(i,t.mat);});
  treeMeshes.push({v,trunk,can,cards});
}
const treeCards=treeMeshes.map(m=>m.cards);
const ZERO_M=new THREE.Matrix4().makeScale(0,0,0);
function colorTrees(season){
  const P=SEASONS[season];const c=new THREE.Color();
  for(const {v,can,cards} of treeMeshes){
    v.list.forEach((t,i)=>{
      const bare=season==='winter'&&!t.ever&&v.kind!==3;
      can.setMatrixAt(i,bare?ZERO_M:t.mat);cards.setMatrixAt(i,bare?ZERO_M:t.mat);
      if(t.ever&&season!=='spring')c.set(season==='winter'?0x3f6a4a:0x4c8a3c);else pickWeighted(P.leaves,t.var,c);
      c.multiplyScalar(0.92+((t.var*97.3)%1)*0.16);
      can.setColorAt(i,c);cards.setColorAt(i,c);
    });
    can.instanceMatrix.needsUpdate=cards.instanceMatrix.needsUpdate=true;if(can.instanceColor)can.instanceColor.needsUpdate=true;if(cards.instanceColor)cards.instanceColor.needsUpdate=true;
  }
}
function pickWeighted(list,u,out){let tot=0;for(const e of list)tot+=e[1];let x=u*tot;for(const e of list){x-=e[1];if(x<=0)return out.set(e[0]);}return out.set(list[list.length-1][0]);}

/* The great camphor: a buttressed trunk wrapped in a shimenawa rope, boughs, a tiered dome of leaf cards */
const hero=(()=>{
  const rs=seededRnd(4242);const g=new THREE.Group();g.position.set(HERO.x,groundH(HERO.x,HERO.z)-0.25,HERO.z);g.rotation.y=0.6;scene.add(g);
  const prof=[];for(let i=0;i<=14;i++){const t=i/14;const y=t*7.2;prof.push(new THREE.Vector2(lerp(2.2,0.8,Math.pow(t,0.55))+(t<0.1?(0.1-t)*7:0),y));}
  const tr=new THREE.LatheGeometry(prof,20);
  {const p=tr.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const a=Math.atan2(z,x);
    const fl=1+0.45*Math.pow(Math.max(0,Math.sin(a*5+0.6)),3)*Math.exp(-y*0.8)+0.08*Math.sin(a*11+y*2);p.setXYZ(i,x*fl+Math.sin(y*0.6)*0.3,y,z*fl+Math.cos(y*0.45)*0.2);}
    tr.computeVertexNormals();}
  const parts=[prep(tr,0x6b5444,0)];
  const crown=[];
  for(let i=0;i<7;i++){const a=i/7*6.28+rs()*0.4,r=rr(4.5,7.2);crown.push([Math.cos(a)*r,rr(8.2,9.6),Math.sin(a)*r,rr(2.4,3.1)]);}
  for(let i=0;i<9;i++){const a=i/9*6.28+rs()*0.5,r=rr(2.6,5.2);crown.push([Math.cos(a)*r,rr(10.2,11.8),Math.sin(a)*r,rr(2.3,3.0)]);}
  for(let i=0;i<5;i++){const a=i/5*6.28+rs(),r=rr(0.5,2.5);crown.push([Math.cos(a)*r,rr(12.4,13.6),Math.sin(a)*r,rr(2.1,2.7)]);}
  crown.push([0,14.2,0,2.2]);
  for(let i=0;i<7;i++){const b=crown[i];const from=new THREE.Vector3(0,5.6+rs()*1.2,0),to=new THREE.Vector3(b[0]*0.85,b[1]-1.2,b[2]*0.85);const L=from.distanceTo(to);
    const br=new THREE.CylinderGeometry(0.2,0.45,L,6);br.translate(0,L/2,0);br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize()));br.translate(from.x,from.y,from.z);parts.push(prep(br,0x6b5444,0.03));}
  const trunkMesh=new THREE.Mesh(mergeGeometries(parts),treeMat);trunkMesh.castShadow=true;trunkMesh.receiveShadow=true;g.add(trunkMesh);
  const topY=16.5;
  const can=canopyGeo(crown,topY,2,0.25),cards=cardGeo(crown,topY,1.25,rs);
  const tintGeo=(geo)=>{const col=geo.attributes.color,pos=geo.attributes.position;const base=new THREE.Color(0x4f9440),fresh=new THREE.Color(0x9ccf55),cc=new THREE.Color();
    for(let i=0;i<col.count;i++){const y=pos.getY(i);const n=vnoise(pos.getX(i)*0.35,pos.getZ(i)*0.35+y*0.2);cc.copy(base).lerp(fresh,smooth(0.62,0.85,n)*smooth(10,14,y));col.setXYZ(i,col.getX(i)*cc.r,col.getY(i)*cc.g,col.getZ(i)*cc.b);}col.needsUpdate=true;return geo;};
  const canM=new THREE.Mesh(tintGeo(can),treeMat);canM.castShadow=true;canM.receiveShadow=true;g.add(canM);
  const cardM=new THREE.Mesh(tintGeo(cards),cardMat);cardM.receiveShadow=true;g.add(cardM);heroCards=cardM;
  const rope=new THREE.Mesh(new THREE.TorusGeometry(2.05,0.13,8,40).rotateX(Math.PI/2),makeToon(0xd9c27c,{rim:0.3}));rope.position.y=2.1;rope.scale.set(1.06,1,1.0);rope.castShadow=true;g.add(rope);addOutline(rope,0.02);
  const shideM=makeToon(0xfbf7ee,{noHeal:true,side:THREE.DoubleSide});
  for(let i=0;i<6;i++){const a=i/6*6.28;const sh=new THREE.Group();sh.position.set(Math.cos(a)*2.2,1.95,Math.sin(a)*2.2);sh.rotation.y=-a+Math.PI/2;g.add(sh);
    for(let k=0;k<3;k++){const pc=new THREE.Mesh(new THREE.PlaneGeometry(0.16,0.17),shideM);pc.position.set(k%2?0.05:-0.05,-0.12-k*0.16,0);sh.add(pc);}}
  addCollider(HERO.x,HERO.z,2.3);BUILDINGS.push({x:HERO.x,z:HERO.z,r:3.2});
  return g;
})();

const rockGeo=(()=>{const g=lumpy(new THREE.DodecahedronGeometry(1,1),0.35,1.4);const p=g.attributes.position;const cols=new Float32Array(p.count*3);const c=new THREE.Color(),moss=new THREE.Color(0x6f8f45),st=new THREE.Color(0x9a968b);
  g.computeVertexNormals();const n=g.attributes.normal;
  for(let i=0;i<p.count;i++){c.copy(st).lerp(moss,smooth(0.5,0.9,n.getY(i))*0.7);c.multiplyScalar(0.85+vnoise(p.getX(i)*3,p.getZ(i)*3)*0.25);cols[i*3]=c.r;cols[i*3+1]=c.g;cols[i*3+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(cols,3));g.scale(1,0.62,1);return g;})();
const rockList=[];
for(let tries=0;tries<600&&rockList.length<46;tries++){
  const a=rnd()*Math.PI*2,r=rr(26,105);const x=Math.cos(a)*r,z=Math.sin(a)*r;
  if(!scatterOK(x,z,{minH:-0.6,maxSlope:1.2,path:1.8,chan:3.0,pad:1.5}))continue;
  rockList.push({x,z,s:r<40?rr(0.25,0.55):rr(0.4,1.5),ry:rnd()*6.28});
}
const rocks=new THREE.InstancedMesh(rockGeo,makeToon(0xffffff,{vc:true,rim:0.2}),Math.max(rockList.length,1));rocks.castShadow=true;rocks.receiveShadow=true;
rockList.forEach((t,i)=>{dummy.position.set(t.x,groundH(t.x,t.z)-0.15*t.s,t.z);dummy.rotation.set(rnd()*0.3,t.ry,rnd()*0.3);dummy.scale.setScalar(t.s);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);if(t.s>0.8)addCollider(t.x,t.z,t.s*0.8);});
if(!rockList.length)rocks.count=0;
scene.add(rocks);

/* the old apple: a hero tree with a leaf-card crown, dappled shade and windfalls */
const orchCardMat=makeToon(0xffffff,{vc:true,wind:true,windAmp:0.3,rim:0.3,side:THREE.DoubleSide,alphaMap:LEAF_TEX,alphaTest:0.5,mapKey:'leaf',tag:'orchCard',back:0.9,leaf:true});
const orchCardMeshes=[];
const DAPPLE_TEX=(()=>{const S2=256;const cv=document.createElement('canvas');cv.width=cv.height=S2;const g=cv.getContext('2d');const rs=seededRnd(313);
  const gr=g.createRadialGradient(128,128,10,128,128,128);gr.addColorStop(0,'rgba(0,0,0,.9)');gr.addColorStop(0.7,'rgba(0,0,0,.75)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,S2,S2);
  g.globalCompositeOperation='destination-out';for(let i=0;i<70;i++){const a=rs()*6.28,r=Math.sqrt(rs())*110;g.beginPath();g.ellipse(128+Math.cos(a)*r,128+Math.sin(a)*r,3+rs()*9,2+rs()*6,rs()*3,0,6.283);g.fillStyle=`rgba(0,0,0,${0.6+rs()*0.4})`;g.fill();}
  return new THREE.CanvasTexture(cv);})();
const dappleMat=new THREE.MeshBasicMaterial({map:DAPPLE_TEX,color:0x1b3524,transparent:true,opacity:0.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
const dapples=[];
(()=>{
  const t=oldApple;const rs=seededRnd(9091);const trunkH=2.2;
  t.crown.remove(t.canopy);t.crown.remove(t.apples);
  const blobs=[];
  for(let i=0;i<11;i++){const a=i/11*6.28+rs()*0.5,r=1.7+rs()*1.7;blobs.push([Math.cos(a)*r,0.6+rs()*1.4,Math.sin(a)*r,1.1+rs()*0.55]);}
  blobs.push([0,1.9,0,1.6],[0.6,2.9,-0.3,1.2]);
  const topY=Math.max(...blobs.map(b=>b[1]+b[3]));
  const core=new THREE.Mesh(clusterCanopyGeo(blobs,topY,rs,1.3),orchLeafMat);core.castShadow=true;core.receiveShadow=true;
  const cards=new THREE.Mesh(cardGeo(blobs,topY,1.4,rs),orchCardMat);cards.castShadow=true;cards.receiveShadow=true;orchCardMeshes.push(cards);
  const canopy=new THREE.Group();canopy.add(core,cards);t.crown.add(canopy);t.canopy=canopy;
  const trunk=new THREE.Mesh(trunkGeo(trunkH,blobs.map(b=>[b[0]*0.8,b[1]+trunkH,b[2]*0.8,b[3]]),rs,1.55,5),treeMat);trunk.castShadow=true;trunk.receiveShadow=true;t.g.add(trunk);
  const apples=new THREE.Group();t.crown.add(apples);t.apples=apples;
  for(let i=0;i<22;i++){const b=blobs[i%blobs.length];const d=new THREE.Vector3(rs()*2-1,rs()*0.9-0.6,rs()*2-1).normalize().multiplyScalar(b[3]*0.97);
    const a=new THREE.Mesh(new THREE.SphereGeometry(0.11,8,6),appleMat);a.position.set(b[0]+d.x,b[1]+d.y*0.85,b[2]+d.z);apples.add(a);}
  const fallen=new THREE.Group();scene.add(fallen);t.fallen=fallen;
  for(let i=0;i<16;i++){const a=rs()*6.28,r=1.4+rs()*3.6;const x=t.x+Math.cos(a)*r,z=t.z+Math.sin(a)*r;const m=new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6).scale(1,0.85,1),appleMat);m.position.set(x,groundH(x,z)+0.08,z);m.rotation.set(rs()*3,rs()*3,0);m.castShadow=true;fallen.add(m);}
  const dap=new THREE.Mesh(new THREE.CircleGeometry(6.2,32).rotateX(-Math.PI/2),dappleMat);dap.position.set(t.x,groundH(t.x,t.z)+0.07,t.z);dap.renderOrder=2;scene.add(dap);dapples.push(dap);
})();
for(const st of stumps){const t=st.tree;const rs=seededRnd(700+st.idx);const topY=Math.max(...t.blobs.map(b=>b[1]+b[3]));
  const cards=new THREE.Mesh(cardGeo(t.blobs,topY,1.1,rs),orchCardMat);cards.castShadow=true;cards.receiveShadow=true;t.canopy.add(cards);orchCardMeshes.push(cards);
  const dap=new THREE.Mesh(new THREE.CircleGeometry(2.6,24).rotateX(-Math.PI/2),dappleMat);dap.position.set(st.x+0.9,groundH(st.x+0.9,st.z+0.4)+0.07,st.z+0.4);dap.renderOrder=2;scene.add(dap);dapples.push(dap);st.dap=dap;}

function tuftGeo(){
  const pos=[],col=[],sway=[],nrm=[],idx=[];let base=0;
  for(let b=0;b<6;b++){
    const a=rnd()*Math.PI*2,lean=rr(0.06,0.3),h=rr(0.4,0.78),ox=rr(-0.12,0.12),oz=rr(-0.12,0.12);
    const ws=[0.06,0.048,0.028,0.0];const tint=rr(0.92,1.12);
    for(let s=0;s<4;s++){
      const t=s/3,y=h*t,w=ws[s];
      const cx=ox+Math.cos(a)*lean*t*t,cz=oz+Math.sin(a)*lean*t*t;
      const px=Math.cos(a+Math.PI/2)*w,pz=Math.sin(a+Math.PI/2)*w;
      pos.push(cx-px,y,cz-pz,cx+px,y,cz+pz);
      const sh=lerp(0.45,1.12,t)*tint;col.push(sh,sh,sh*0.96,sh,sh,sh*0.96);
      const sw=t*t;sway.push(sw,sw);nrm.push(0,1,0,0,1,0);
      if(s>0){const k=base+(s-1)*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    base+=8;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('aSway',new THREE.Float32BufferAttribute(sway,1));g.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));g.setIndex(idx);
  return g;
}
const grass=(()=>{
  const N=24000;const geo=tuftGeo();
  const im=new THREE.InstancedMesh(geo,makeToon(0xffffff,{vc:true,wind:true,windAmp:1.0,grow:true,growBase:0.38,growA:0.0,growB:1.0,side:THREE.DoubleSide,rim:0.16,tint:'season',back:1.0,snow:0.35,grassH:true}),N);
  im.receiveShadow=true;
  const cA=new THREE.Color(0x4f9a2e),cB=new THREE.Color(0xa6d24e),cC=new THREE.Color(0x2f7a30),cD=new THREE.Color(0x6aa83e),c=new THREE.Color();
  let n=0;
  for(let tries=0;tries<N*6&&n<N;tries++){
    let x,z,r;
    if(rnd()<0.1){const a=rnd()*6.28,rr0=Math.sqrt(rnd())*24;x=ORCH.x+Math.cos(a)*rr0;z=ORCH.z+Math.sin(a)*rr0;r=Math.hypot(x,z);}
    else if(rnd()<0.06){const a=rnd()*6.28,rr0=Math.sqrt(rnd())*21;x=RB.x+Math.cos(a)*rr0;z=RB.z+Math.sin(a)*rr0;r=Math.hypot(x,z);}
    else{r=Math.sqrt(rnd())*104*(rnd()<0.72?0.68:1);const a=rnd()*Math.PI*2;x=Math.cos(a)*r;z=Math.sin(a)*r;}
    const clump=fbm(x*0.09+11,z*0.09-3,3);
    if(rnd()>0.18+smooth(0.38,0.62,clump)*0.82)continue;
    if(!scatterOK(x,z,{minH:-0.48,maxSlope:0.85,path:0.9,chan:2.2,pad:-0.3,orch:true}))continue;
    const h=groundH(x,z);
    dummy.position.set(x,h-0.02,z);dummy.rotation.set(0,rnd()*6.28,0);const s=rr(0.8,1.45)*(r>70?1.25:1)*lerp(0.85,1.2,clump);dummy.scale.set(s,s*rr(0.85,1.3),s);dummy.updateMatrix();im.setMatrixAt(n,dummy.matrix);
    const nn=fbm(x*0.05+7,z*0.05,3);c.copy(cC).lerp(cA,smooth(0.25,0.55,nn)).lerp(cB,smooth(0.5,0.8,nn));c.lerp(cD,smooth(0.6,0.8,clump)*0.3);if(h<0.3)c.lerp(cC,0.4);
    im.setColorAt(n,c);n++;
  }
  im.count=n;im.frustumCulled=false;scene.add(im);return {im,total:n};
})();
const flowers=(()=>{
  /* wildflower drifts: long soft swathes of one colour, in the orchard and around the meadow */
  const ODRIFTS=(()=>{const rs=seededRnd(777);const out=[];
    for(let i=0;i<11;i++){const a=rs()*6.28,r=4+rs()*15;out.push({x:ORCH.x+Math.cos(a)*r,z:ORCH.z+Math.sin(a)*r,a:rs()*3.14,l:3+rs()*4,w:0.8+rs()*1.1,k:rs()});}
    for(let i=0;i<9;i++){const a=rs()*6.28,r=20+rs()*12;out.push({x:ORCH.x+Math.cos(a)*r,z:ORCH.z+Math.sin(a)*r,a:rs()*3.14,l:3+rs()*4,w:0.8+rs()*1.0,k:rs()});}
    for(let i=0;i<10;i++){const a=rs()*6.28,r=34+rs()*36;out.push({x:Math.cos(a)*r,z:Math.sin(a)*r,a:rs()*3.14,l:3+rs()*5,w:0.9+rs()*1.2,k:rs()});}
    return out;})();
  const N=4400;const head=new THREE.IcosahedronGeometry(0.075,0);head.scale(1,0.55,1);head.translate(0,0.36,0);
  const stem=new THREE.CylinderGeometry(0.008,0.01,0.34,3);stem.translate(0,0.17,0);
  const g=mergeGeometries([prep(head,0xffffff,0.6),prep(stem,0x5b8a3a,(x,y)=>y/0.34*0.6,1)]);
  const im=new THREE.InstancedMesh(g,makeToon(0xffffff,{vc:true,wind:true,windAmp:0.9,grow:true,growBase:0.0,growA:0.5,growB:0.95,rim:0.3}),N);
  const keys=[];let n=0;
  for(let tries=0;tries<N*6&&n<N;tries++){
    let x,z,dk=-1;
    if(rnd()<0.3){dk=(rnd()*ODRIFTS.length)|0;const D=ODRIFTS[dk];const u=rnd()*2-1,v=(rnd()*2-1)*Math.sqrt(1-u*u);x=D.x+Math.cos(D.a)*u*D.l-Math.sin(D.a)*v*D.w;z=D.z+Math.sin(D.a)*u*D.l+Math.cos(D.a)*v*D.w;}
    else if(rnd()<0.1){const a=rnd()*6.28,r0=Math.sqrt(rnd())*22;x=ORCH.x+Math.cos(a)*r0;z=ORCH.z+Math.sin(a)*r0;}
    else{const r=rr(25,84);const a=rnd()*Math.PI*2;x=Math.cos(a)*r;z=Math.sin(a)*r;}
    const patch=fbm(x*0.07+30,z*0.07-12,3);if(dk<0&&patch<0.52&&rnd()>0.08)continue;
    if(!scatterOK(x,z,{minH:-0.3,maxSlope:0.6,path:1.2,chan:3,pad:0,orch:true}))continue;
    dummy.position.set(x,groundH(x,z)-0.02,z);dummy.rotation.set(0,rnd()*6.28,0);const s=rr(0.8,1.4);dummy.scale.set(s,s*rr(0.7,1.3),s);dummy.updateMatrix();im.setMatrixAt(n,dummy.matrix);
    keys.push(dk>=0?(ODRIFTS[dk].k+rnd()*0.03)%1:(patch*97+rnd()*2.2)%1);n++;
  }
  /* shuffle so a partial count spreads evenly across the valley */
  const order=[...Array(n).keys()];for(let i=n-1;i>0;i--){const j=(rnd()*(i+1))|0;[order[i],order[j]]=[order[j],order[i]];}
  const mats=[];for(let i=0;i<n;i++){const m=new THREE.Matrix4();im.getMatrixAt(i,m);mats.push(m);}
  order.forEach((o,i)=>im.setMatrixAt(i,mats[o]));const keys2=order.map(o=>keys[o]);
  im.count=n;im.frustumCulled=false;scene.add(im);return {im,total:n,keys:keys2};
})();
function colorFlowers(season){const P=SEASONS[season];const c=new THREE.Color();flowers.keys.forEach((k,i)=>{pickWeighted(P.flowers,k,c);flowers.im.setColorAt(i,c);});if(flowers.im.instanceColor)flowers.im.instanceColor.needsUpdate=true;}
/* seedlings that sprout on the days you come back */
const seedlings=(()=>{
  const sp=new THREE.ConeGeometry(0.05,0.5,4);sp.translate(0,0.25,0);
  const l1=new THREE.SphereGeometry(0.12,6,4);l1.scale(1,0.3,0.5);l1.translate(0.1,0.45,0);const l2=l1.clone();l2.rotateY(Math.PI);
  const geo=mergeGeometries([prep(sp,0x6b8a3a,(x,y)=>y),prep(l1,0x8cc858,0.8),prep(l2,0x7ab84c,0.8)]);
  const im=new THREE.InstancedMesh(geo,makeToon(0xffffff,{vc:true,wind:true,windAmp:0.8,rim:0.3}),40);im.castShadow=true;
  let n=0;for(let tries=0;tries<800&&n<40;tries++){const gr=GROVES[n%Math.max(GROVES.length,1)];if(!gr)break;const a=rnd()*6.28,r=rr(8,13);const x=gr.x+Math.cos(a)*r,z=gr.z+Math.sin(a)*r;
    if(!scatterOK(x,z,{minH:0.2,maxSlope:0.8,path:1.6,chan:3,pad:0.5}))continue;dummy.position.set(x,groundH(x,z),z);dummy.rotation.set(0,rnd()*6.28,0);dummy.scale.setScalar(rr(1.0,1.8));dummy.updateMatrix();im.setMatrixAt(n,dummy.matrix);n++;}
  im.count=0;scene.add(im);return {im,total:n};
})();

/* ================================================================
   Creatures
   ================================================================ */
const creatures={butterflies:[],ducks:[],birds:null};
function makeButterfly(color){
  const g=new THREE.Group();
  const wm=new THREE.MeshToonMaterial({color,gradientMap,side:THREE.DoubleSide});
  const wingGeo=new THREE.PlaneGeometry(0.16,0.13);wingGeo.translate(0.08,0,0);wingGeo.rotateX(-Math.PI/2);
  const L=new THREE.Mesh(wingGeo,wm),R=new THREE.Mesh(wingGeo,wm);R.rotation.y=Math.PI;
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.012,0.08,2,4),makeToon(0x2a2018,{noHeal:true}));body.rotation.x=Math.PI/2;
  g.add(L,R,body);scene.add(g);
  return {g,L,R,pos:new THREE.Vector3(),vel:new THREE.Vector3(),target:new THREE.Vector3(),ph:rnd()*10};
}
function spawnButterflies(){
  if(creatures.butterflies.length)return;
  const cols=[0xfaf6ea,0xf6d24a,0xf2a25a,0x8fc0f0,0xfaf6ea,0xf6d24a];
  for(let i=0;i<16;i++){const b=makeButterfly(cols[i%cols.length]);const a=rnd()*6.28,r=rr(28,55);b.pos.set(Math.cos(a)*r,0,Math.sin(a)*r);b.pos.y=groundH(b.pos.x,b.pos.z)+rr(0.6,1.8);b.target.copy(b.pos);creatures.butterflies.push(b);}
}
function makeDuck(kind){
  const g=new THREE.Group();const small=kind==='baby';const sc=small?0.55:1;
  const bodyCol=kind==='drake'?0xd8d2c4:kind==='hen'?0x9a7652:0xf2d45c;
  const headCol=kind==='drake'?0x2f6b48:kind==='hen'?0x8a6646:0xf4dc6c;
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.3,14,10).scale(1,0.68,1.45),makeToon(bodyCol,{noHeal:true}));body.position.y=0.12;body.castShadow=true;g.add(body);addOutline(body,0.012);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.22,6),makeToon(bodyCol,{noHeal:true}));tail.rotation.x=-2.1;tail.position.set(0,0.24,-0.42);g.add(tail);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.15,12,10),makeToon(headCol,{noHeal:true}));head.position.set(0,0.42,0.3);head.castShadow=true;g.add(head);addOutline(head,0.01);
  const beak=new THREE.Mesh(new THREE.SphereGeometry(0.07,8,6).scale(0.8,0.4,1.4),makeToon(0xe89a3a,{noHeal:true}));beak.position.set(0,0.4,0.46);g.add(beak);
  for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.022,6,6),makeToon(0x1a1410,{noHeal:true}));e.position.set(sx*0.09,0.46,0.39);g.add(e);}
  const wingGeo=new THREE.PlaneGeometry(0.62,0.3);wingGeo.translate(0.31,0,0);wingGeo.rotateX(-Math.PI/2);
  const wm=new THREE.MeshToonMaterial({color:new THREE.Color(bodyCol).multiplyScalar(0.85),gradientMap,side:THREE.DoubleSide});
  const wL=new THREE.Mesh(wingGeo,wm),wR=new THREE.Mesh(wingGeo,wm);wR.rotation.y=Math.PI;wL.position.y=wR.position.y=0.25;wL.visible=wR.visible=false;g.add(wL,wR);
  g.scale.setScalar(sc);scene.add(g);
  return {g,wL,wR,kind,pos:new THREE.Vector3(),target:new THREE.Vector3(),state:'swim',t:0,from:new THREE.Vector3(),land:new THREE.Vector3(),heading:0,ph:rnd()*10,leader:null,offset:new THREE.Vector3(),quackT:rr(4,12),ripT:0};
}
function pondPoint(out){for(let i=0;i<40;i++){const a=rnd()*6.28,r=Math.sqrt(rnd())*(POND_R-4);const x=Math.cos(a)*r,z=Math.sin(a)*r;if(LEVELS[3]-groundH(x,z)>0.5){out.set(x,0,z);return out;}}out.set(0,0,0);return out;}
function spawnDucks(settled){
  if(creatures.ducks.length)return;
  ['drake','hen','hen','baby','baby'].forEach((k,i)=>{const d=makeDuck(k);pondPoint(d.land);
    if(k==='baby'){d.leader=creatures.ducks[1];d.offset.set((i-3.5)*0.5,0,-0.7-(i-3)*0.5);}
    if(settled){d.state='swim';d.pos.copy(d.land);d.pos.y=LEVELS[3];d.target.copy(d.land);}
    else{d.state='fly';d.t=-i*0.35;d.from.set(140+i*3,38+i,-90+i*4);d.pos.copy(d.from);}
    creatures.ducks.push(d);});
}
function makeBirds(){
  const g=new THREE.Group();const birds=[];const m=makeToon(0x2c2a30,{noHeal:true});
  for(let i=0;i<6;i++){const b=new THREE.Group();const wg=new THREE.PlaneGeometry(0.9,0.22);wg.translate(0.45,0,0);wg.rotateX(-Math.PI/2);
    const L=new THREE.Mesh(wg,new THREE.MeshBasicMaterial({color:0x2c2a30,side:THREE.DoubleSide})),R=L.clone();R.rotation.y=Math.PI;
    const bd=new THREE.Mesh(new THREE.CapsuleGeometry(0.08,0.4,2,5),m);bd.rotation.x=Math.PI/2;b.add(L,R,bd);
    const k=i===0?0:Math.ceil(i/2),side=i%2?1:-1;b.position.set(side*k*1.6,0,-k*1.4);g.add(b);birds.push({b,L,R,ph:rnd()*6});}
  g.visible=false;scene.add(g);return {g,birds,t:-1,from:new THREE.Vector3(),to:new THREE.Vector3(),next:rr(8,20)};
}
function clearCreatures(n){
  if(n<1){creatures.butterflies.forEach(b=>scene.remove(b.g));creatures.butterflies=[];}
  if(n<2){creatures.ducks.forEach(d=>scene.remove(d.g));creatures.ducks=[];if(creatures.birds){scene.remove(creatures.birds.g);creatures.birds=null;}}
}
const fish=(()=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8).scale(0.6,0.7,1.8),makeToon(0xe58a3e,{noHeal:true,rim:0.5})));
  const t=new THREE.Mesh(new THREE.ConeGeometry(0.12,0.2,4),makeToon(0xe58a3e,{noHeal:true}));t.rotation.x=Math.PI/2;t.position.z=-0.36;g.add(t);g.visible=false;scene.add(g);
  return {g,t:-1,next:rr(5,10),from:new THREE.Vector3(),dir:new THREE.Vector3()};})();

/* ================================================================
   Audio: procedural folk score + ambience + effects
   ================================================================ */
const AU={ctx:null,master:null,music:null,sfx:null,amb:null,rev:null,noise:null,muted:false,level:0,nextBar:0,bar:0,cycle:0,phrase:null,ambG:{},birdT:3,cricketT:2,frogT:4,started:false};
const mtof=(m)=>440*Math.pow(2,(m-69)/12);
const BPM=84,BEAT=60/BPM,BAR=3*BEAT;
const PROG=[[50,54,57],[47,50,54],[43,47,50],[45,49,52],[50,54,57],[43,47,50],[40,43,47],[45,49,52]];
const PHRASES={
  A:[[0,78,1.5],[1.5,76,0.5],[2,74,1],[3,71,2],[5,74,1],[6,76,1],[7,78,1],[8,79,1],[9,81,3],[12,83,1.5],[13.5,81,0.5],[14,78,1],[15,79,1],[16,78,1],[17,76,1],[18,74,1.5],[19.5,76,0.5],[20,79,1],[21,76,2],[23,73,1]],
  B:[[0,74,1],[1,76,1],[2,78,1],[3,81,2],[5,78,1],[6,79,1.5],[7.5,78,0.5],[8,76,1],[9,73,2],[11,76,1],[12,78,2],[14,74,1],[15,71,1],[16,74,1],[17,79,1],[18,78,1],[19,76,1],[20,74,1],[21,76,1.5],[22.5,74,1.5]],
  C:[[0,78,3],[3,76,3],[6,74,2],[8,71,1],[9,69,3],[12,74,3],[15,79,2],[17,78,1],[18,76,3],[21,73,3]]
};
function auInit(){
  if(AU.ctx)return;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  let ctx;try{ctx=new AC();}catch(e){return;}
  AU.ctx=ctx;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-16;comp.ratio.value=3;comp.connect(ctx.destination);
  AU.master=ctx.createGain();AU.master.gain.value=AU.muted?0:0.9;AU.master.connect(comp);
  AU.rev=ctx.createConvolver();
  const len=ctx.sampleRate*2.8|0,ib=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let c=0;c<2;c++){const d=ib.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2);}
  AU.rev.buffer=ib;const revOut=ctx.createGain();revOut.gain.value=0.55;AU.rev.connect(revOut);revOut.connect(AU.master);
  AU.music=ctx.createGain();AU.music.gain.value=0.5;AU.music.connect(AU.master);const ms=ctx.createGain();ms.gain.value=0.5;AU.music.connect(ms);ms.connect(AU.rev);
  AU.sfx=ctx.createGain();AU.sfx.gain.value=0.8;AU.sfx.connect(AU.master);const ss=ctx.createGain();ss.gain.value=0.22;AU.sfx.connect(ss);ss.connect(AU.rev);
  AU.amb=ctx.createGain();AU.amb.gain.value=1;AU.amb.connect(AU.master);const as=ctx.createGain();as.gain.value=0.15;AU.amb.connect(as);as.connect(AU.rev);
  const nb=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;AU.noise=nb;
  const loop=(type,freq,q)=>{const s=ctx.createBufferSource();s.buffer=nb;s.loop=true;s.playbackRate.value=0.7+Math.random()*0.6;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=ctx.createGain();g.gain.value=0;s.connect(f);f.connect(g);g.connect(AU.amb);s.start();return {g,f};};
  AU.ambG.wind=loop('bandpass',480,0.6);AU.ambG.water=loop('lowpass',620,0.7);AU.ambG.stream=loop('bandpass',1500,1.1);AU.ambG.rain=loop('highpass',2600,0.5);
  AU.nextBar=ctx.currentTime+0.4;AU.bar=0;AU.cycle=0;AU.started=true;
}
function auNoiseBurst(t,dur,type,freq,q,vol,out,rate=1){
  const ctx=AU.ctx;const s=ctx.createBufferSource();s.buffer=AU.noise;s.playbackRate.value=rate;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;const g=ctx.createGain();
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+Math.min(0.02,dur*0.3));g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f);f.connect(g);g.connect(out||AU.sfx);s.start(t,Math.random()*1.5);s.stop(t+dur+0.05);return f;
}
function auOsc(type,freq,t,a,dur,rel,vol,out,opts={}){
  const ctx=AU.ctx;const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(freq,t);if(opts.glideTo)o.frequency.exponentialRampToValueAtTime(opts.glideTo,t+(opts.glideT||dur));
  if(opts.detune)o.detune.value=opts.detune;
  const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(vol,t+a);
  if(opts.decay){g.gain.setTargetAtTime(vol*opts.sustain,t+a,opts.decay);}
  g.gain.setTargetAtTime(0.0001,t+a+dur,rel/3);
  let node=o;
  if(opts.lp){const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(opts.lp,t);if(opts.lpTo)f.frequency.exponentialRampToValueAtTime(opts.lpTo,t+(opts.lpT||0.4));f.Q.value=opts.q||0.7;o.connect(f);node=f;}
  if(opts.vib){const l=ctx.createOscillator();l.frequency.value=opts.vib;const lg=ctx.createGain();lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(freq*0.006,t+0.35);l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+a+dur+rel+0.1);}
  node.connect(g);
  if(opts.pan!==undefined&&ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=opts.pan;g.connect(p);p.connect(out);}else g.connect(out);
  o.start(t);o.stop(t+a+dur+rel+0.2);return o;
}
function flute(m,t,durB,vol){const f=mtof(m),d=durB*BEAT;auOsc('sine',f,t,0.07,d*0.92,0.35,vol,AU.music,{vib:5.3,lp:3200});auOsc('triangle',f*2,t,0.08,d*0.9,0.3,vol*0.12,AU.music,{lp:2600});auNoiseBurst(t,0.12,'bandpass',f*2,2,vol*0.25,AU.music);}
function pluck(m,t,vol,pan=0){const f=mtof(m);auOsc('triangle',f,t,0.004,0.02,0.9,vol,AU.music,{lp:3800,lpTo:700,lpT:0.5,decay:0.22,sustain:0.1,pan});auOsc('sine',f*2,t,0.003,0.01,0.5,vol*0.35,AU.music,{decay:0.12,sustain:0.05,pan});}
function pad(ms,t,durS,vol,attack=1.2){for(const m of ms){const f=mtof(m);auOsc('sawtooth',f,t,attack,durS,1.6,vol,AU.music,{lp:900,detune:-6});auOsc('sawtooth',f,t,attack,durS,1.6,vol,AU.music,{lp:900,detune:7});}}
function bass(m,t,durS,vol){auOsc('triangle',mtof(m),t,0.03,durS,0.4,vol,AU.music,{lp:520});auOsc('sine',mtof(m-12),t,0.03,durS,0.4,vol*0.6,AU.music,{});}
function fiddle(m,t,durS,vol){auOsc('sawtooth',mtof(m),t,0.25,durS,0.6,vol,AU.music,{lp:2400,vib:5.8,q:0.9});}
function bodhran(t,vol){auOsc('sine',120,t,0.003,0.02,0.28,vol,AU.music,{glideTo:52,glideT:0.22});auNoiseBurst(t,0.06,'lowpass',900,0.7,vol*0.25,AU.music);}
function shaker(t,vol){auNoiseBurst(t,0.06,'highpass',6500,0.7,vol,AU.music,1.4);}
function chime(m,t,vol,out){const f=mtof(m);auOsc('sine',f,t,0.004,0.05,2.6,vol,out||AU.sfx,{decay:0.6,sustain:0.3});auOsc('sine',f*2.76,t,0.004,0.02,1.2,vol*0.25,out||AU.sfx,{decay:0.25,sustain:0.1});}
function scheduleBar(t){
  const lvl=AU.level,b=AU.bar,chord=PROG[b];
  const nightK=1-0.35*nightF;
  if(b===0){AU.phrase=lvl===0?((AU.cycle%2===0)?PHRASES.C:null):(AU.cycle%2===0?PHRASES.A:PHRASES.B);}
  if(AU.phrase){for(const n of AU.phrase){if(n[0]>=b*3&&n[0]<b*3+3){flute(n[1],t+(n[0]-b*3)*BEAT,n[2],(lvl===0?0.09:0.12)*nightK);}}}
  if(lvl>=1){const arp=[chord[0]+12,chord[1]+12,chord[2]+12,chord[1]+12,chord[0]+24,chord[2]+12];arp.forEach((m,i)=>pluck(m,t+i*BEAT*0.5,(i===0?0.085:0.06)*nightK,(i%2?0.25:-0.25)));}
  if(lvl>=2){pad(chord.map(m=>m+12),t,BAR*0.95,0.012*nightK,0.8);bass(chord[0],t,BEAT*1.8,0.12*nightK);bass(chord[0]+7,t+BEAT*2,BEAT*0.8,0.07*nightK);}
  if(lvl>=3){fiddle(chord[1]+24,t+0.05,BAR*0.9,0.018*nightK);if(nightF<0.6){bodhran(t,0.18);bodhran(t+BEAT*1.5,0.06);bodhran(t+BEAT*2,0.1);for(let i=0;i<6;i++)shaker(t+i*BEAT*0.5,i%2?0.012:0.02);}}
  AU.bar=(AU.bar+1)%8;if(AU.bar===0)AU.cycle++;
}
function auSwell(){
  if(!AU.ctx)return;const t=AU.ctx.currentTime+0.05;
  [62,69,74,78,81,86].forEach((m,i)=>chime(m,t+i*0.14,0.07,AU.music));
  pad([50,57,62,66,69],t,4.5,0.02,2.4);bass(38,t+0.2,4,0.12);
  auNoiseBurst(t,3.5,'bandpass',900,0.6,0.05,AU.amb,0.6);
}
function auTick(dt){
  if(!AU.ctx||!AU.started)return;const ctx=AU.ctx,now=ctx.currentTime;
  if(AU.nextBar<now-1)AU.nextBar=now+0.1;
  while(AU.nextBar<now+0.3){scheduleBar(AU.nextBar);AU.nextBar+=BAR;}
  const t=G.uTime.value;const heal=skyHeal;
  AU.ambG.wind.g.gain.setTargetAtTime(0.025+0.035*(0.5+0.5*Math.sin(t*0.13)*Math.sin(t*0.37+1)),now,0.5);
  const dPond=Math.max(0,Math.hypot(player.pos.x,player.pos.z)-POND_R);
  AU.ambG.water.g.gain.setTargetAtTime(0.012+0.03*Math.exp(-dPond/18),now,0.5);
  const dIn=polyInfo(player.pos.x,player.pos.z,INLET).d,dOut=polyInfo(player.pos.x,player.pos.z,OUTLET).d;
  AU.ambG.stream.g.gain.setTargetAtTime(0.05*Math.exp(-dIn/12)+0.05*Math.exp(-dOut/12)*outletU.uFlow.value,now,0.4);
  AU.ambG.rain.g.gain.setTargetAtTime(rainK*0.05,now,0.6);
  AU.birdT-=dt;
  if(AU.birdT<=0){AU.birdT=rr(1.5,6)/(0.35+heal);if(nightF<0.4&&rainK<0.5&&rnd()<0.4+heal*0.6){const base=rr(2400,3600),reps=1+(rnd()*4|0),pan=rr(-0.8,0.8);for(let i=0;i<reps;i++){const tt=now+i*rr(0.09,0.16);auOsc('sine',base,tt,0.005,0.05,0.04,0.025,AU.amb,{glideTo:base*rr(1.2,1.6),glideT:0.06,pan});}}}
  AU.cricketT-=dt;
  if(AU.cricketT<=0){AU.cricketT=rr(0.7,1.8);if(nightF>0.35){const pan=rr(-0.9,0.9),f=rr(4200,4800);for(let i=0;i<5;i++)auOsc('sine',f,now+i*0.045,0.004,0.018,0.01,0.01*(0.4+heal),AU.amb,{pan});}}
  AU.frogT-=dt;
  if(AU.frogT<=0){AU.frogT=rr(2.5,7);if(nightF>0.25&&stage()>=3){auOsc('sawtooth',rr(170,230),now,0.02,0.18,0.08,0.035,AU.amb,{lp:900,glideTo:150,glideT:0.2,pan:rr(-0.7,0.7)});auOsc('sawtooth',rr(170,230),now+0.24,0.02,0.12,0.06,0.03,AU.amb,{lp:900,glideTo:140,glideT:0.14});}}
}
let stepFlip=false;
const SFX={
  step(w){if(!AU.ctx)return;const t=AU.ctx.currentTime;stepFlip=!stepFlip;if(w){auNoiseBurst(t,0.16,'bandpass',stepFlip?1200:1450,1.2,0.07);}else{auNoiseBurst(t,0.08,'lowpass',stepFlip?800:1000,0.8,0.07);auOsc('sine',stepFlip?110:95,t,0.002,0.015,0.06,0.04,AU.sfx,{glideTo:70,glideT:0.05});}},
  rustle(){if(!AU.ctx)return;auNoiseBurst(AU.ctx.currentTime,0.18,'bandpass',rr(2200,3400),0.8,0.05);},
  knock(dt=0,f=200){if(!AU.ctx)return;const t=AU.ctx.currentTime+dt;auOsc('sine',f,t,0.002,0.02,0.15,0.18,AU.sfx,{glideTo:f*0.6,glideT:0.12});auNoiseBurst(t,0.04,'bandpass',1800,1,0.06);},
  get(){if(!AU.ctx)return;const t=AU.ctx.currentTime;chime(81,t,0.06);chime(86,t+0.09,0.05);},
  plant(){if(!AU.ctx)return;const t=AU.ctx.currentTime;auOsc('sine',90,t,0.003,0.03,0.2,0.2,AU.sfx,{glideTo:55,glideT:0.15});chime(88,t+0.12,0.035);chime(93,t+0.22,0.03);},
  moment(){if(!AU.ctx)return;const t=AU.ctx.currentTime;chime(78,t,0.04);chime(83,t+0.12,0.04);chime(90,t+0.24,0.035);},
  jump(){if(!AU.ctx)return;auNoiseBurst(AU.ctx.currentTime,0.18,'bandpass',900,0.8,0.03);},
  land(){if(!AU.ctx)return;auOsc('sine',80,AU.ctx.currentTime,0.002,0.02,0.12,0.12,AU.sfx,{glideTo:50,glideT:0.1});},
  page(){if(!AU.ctx)return;const t=AU.ctx.currentTime;const f=auNoiseBurst(t,0.35,'bandpass',1200,0.7,0.06);f.frequency.exponentialRampToValueAtTime(3800,t+0.3);},
  splash(){if(!AU.ctx)return;const t=AU.ctx.currentTime;auNoiseBurst(t,0.35,'bandpass',1100,0.9,0.08);auOsc('sine',420,t,0.002,0.02,0.15,0.06,AU.sfx,{glideTo:900,glideT:0.1});},
  quack(){if(!AU.ctx)return;const t=AU.ctx.currentTime;for(let i=0;i<2;i++)auOsc('sawtooth',rr(380,460),t+i*0.17,0.01,0.08,0.05,0.035,AU.amb,{lp:1300,q:4,glideTo:300,glideT:0.1});}
};
Object.assign(SFX,{
  cast(){if(!AU.ctx)return;const t=AU.ctx.currentTime;const f=auNoiseBurst(t,0.4,'bandpass',900,1.2,0.05);f.frequency.exponentialRampToValueAtTime(3200,t+0.35);},
  plop(){if(!AU.ctx)return;const t=AU.ctx.currentTime;auOsc('sine',520,t,0.002,0.02,0.12,0.06,AU.sfx,{glideTo:1100,glideT:0.08});},
  tick(n){if(!AU.ctx)return;chime(74+n*2,AU.ctx.currentTime,0.05);},
  reel(){if(!AU.ctx)return;const t=AU.ctx.currentTime;for(let i=0;i<5;i++)auNoiseBurst(t+i*0.035,0.02,'bandpass',3200,3,0.03);},
  shutter(){if(!AU.ctx)return;const t=AU.ctx.currentTime;auNoiseBurst(t,0.04,'highpass',3000,0.7,0.12);auNoiseBurst(t+0.07,0.05,'highpass',2500,0.7,0.09);}
});
function setMuted(m){AU.muted=m;if(AU.master&&AU.ctx)AU.master.gain.setTargetAtTime(m?0:0.9,AU.ctx.currentTime,0.1);$('btnSound').textContent=m?'Sound: off':'Sound: on';}

/* ================================================================
   Game state
   ================================================================ */
const SAVE_KEY='rebuild-the-valley:mill-pond:v1';
const S={hours:8.5,inv:{wood:0,stone:0,reed:0,cut:0},sight:{butterflies:false,ducks:false,birds:false,fireflies:false,fish:false},errands:{},muted:false,
  lastDay:null,visitDays:0,daily:null,gifts:[],keepsakes:[],col:{},notes:[],cosmetics:{},wearing:'straw',gameDay:0,cutTaken:0,decor:[],stored:{},
  home:0,plots:null,crops:{},ciders:{},earned:{},gather:{},reed:{bw:[false,false,false,false,false],cut:[],woven:{},floated:false},news:0,story:null,blight:{koi:false},harvests:0,photos:0,applePick:{}};
function stage(){if(!piles.every(p=>p.cleared))return 0;if(!sluice.built)return 1;if(!SPOTS.every(s=>s.planted))return 2;return 3;}
function oStage(){if(stage()<3)return -1;if(!brambles.every(b=>b.cleared))return 0;if(!chanSegs.every(c=>c.fixedOK))return 1;if(!stumps.every(s=>s.planted))return 2;if(!press.fixedOK)return 3;return 4;}
function restorationPct(){const p=piles.filter(x=>x.cleared).length*5;const s=sluice.built?35:0;const r=SPOTS.filter(x=>x.planted).length*4.375;return Math.round(p+s+r);}
function orchardPct(){return Math.round(brambles.filter(b=>b.cleared).length*25/7+chanSegs.filter(c=>c.fixedOK).length*6.25+stumps.filter(s=>s.planted).length*3.125+(press.fixedOK?25:0));}
function inOrchard(x=player.pos.x,z=player.pos.z){return orchDist(x,z)<38;}

const player=(()=>{const m=makePlayer();return Object.assign(m,{pos:new THREE.Vector3(2,0,60),vel:new THREE.Vector3(),vy:0,grounded:true,face:Math.PI,faceT:Math.PI,phase:0,speedK:0,squash:0,ripT:0,busy:0,idle:0,blinkT:2,blink:0,wave:0,happy:0});})();
player.pos.y=walkH(player.pos.x,player.pos.z);
const CAM_PITCH=0.15;let lastLookT=-99;
const cam={yaw:0.32,pitch:CAM_PITCH,dist:7.5,target:new THREE.Vector3(),look:new THREE.Vector3()};

let levelCur=LEVELS[0];
let skyHeal=0,rainK=RAIN[0];
let nightF=0,goldF=0,deepF=0;
const sunDir=new THREE.Vector3(),moonDir=new THREE.Vector3();
const sweep={active:false,t:0,dur:6};
const sweepB={active:false,t:0,dur:5};
const timers=[];
function after(sec,fn){timers.push({t:sec,fn});}
let mode='title';
let cine=null;
let journalOpen=false;
let simTime=0;

function serialize(){
  return {v:4,pos:[player.pos.x,player.pos.y,player.pos.z],face:player.face,cam:[cam.yaw,cam.pitch,cam.dist],hours:S.hours,inv:{...S.inv},
    piles:piles.map(p=>p.cleared),sluice:sluice.built,harvested:CLUMPS.map(c=>c.harvested),planted:SPOTS.map(s=>s.planted),sight:{...S.sight},errands:{...S.errands},muted:AU.muted,started:true,
    brambles:brambles.map(b=>b.cleared),heaps:stoneHeaps.map(h=>h.left),chan:chanSegs.map(c=>c.fixedOK),stumps:stumps.map(s=>s.planted),
    lastDay:S.lastDay,visitDays:S.visitDays,daily:S.daily,gifts:S.gifts,keepsakes:S.keepsakes,col:S.col,notes:S.notes,cosmetics:S.cosmetics,wearing:S.wearing,gameDay:S.gameDay,cutTaken:S.cutTaken,
    press:press.fixedOK,oda:{met:oda.met,lastDay:oda.lastDay},decor:S.decor,stored:S.stored,
    home:S.home,plots:S.plots,crops:S.crops,ciders:S.ciders,earned:S.earned,gather:S.gather,reed:S.reed,harvests:S.harvests,photos:S.photos,applePick:S.applePick,mira:{met:mira.met,lastDay:mira.lastDay},news:S.news,story:S.story,blight:S.blight};
}
function writeSave(){if(sandbox)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(serialize()));}catch(e){}}
function validSave(d){return !!(d&&typeof d==='object'&&(d.v===1||d.v===2||d.v===3||d.v===4));}
function readSave(){try{const s=localStorage.getItem(SAVE_KEY);if(!s)return null;const d=JSON.parse(s);return validSave(d)?d:null;}catch(e){return null;}}
function clearSave(){try{localStorage.removeItem(SAVE_KEY);}catch(e){}}

function applySave(d){
  const arr=(a,n)=>Array.isArray(a)&&a.length===n;
  const num=(x,lo,hi)=>Number.isFinite(x)?clamp(x,lo,hi):null;
  if(arr(d.pos,3)&&d.pos.every(Number.isFinite)){player.pos.set(d.pos[0],d.pos[1],d.pos[2]);player.pos.y=Math.max(player.pos.y,walkH(player.pos.x,player.pos.z));}
  if(Number.isFinite(d.face)){player.face=player.faceT=d.face;}
  if(arr(d.cam,3)&&d.cam.every(Number.isFinite)){cam.yaw=d.cam[0];cam.pitch=CAM_PITCH;cam.dist=clamp(d.cam[2],3.5,13);}
  if(Number.isFinite(d.hours))S.hours=((d.hours%24)+24)%24;
  if(d.inv){for(const k of ['wood','stone','reed','cut'])if(Number.isFinite(d.inv[k]))S.inv[k]=clamp(d.inv[k]|0,0,999);}
  if(arr(d.piles,piles.length))d.piles.forEach((c,i)=>{if(c){piles[i].cleared=true;piles[i].g.visible=false;}});
  if(arr(d.harvested,CLUMPS.length))d.harvested.forEach((c,i)=>{CLUMPS[i].harvested=!!c;});
  if(d.sluice&&piles.every(p=>p.cleared))setSluiceBuilt(true);
  if(arr(d.planted,SPOTS.length)&&sluice.built)d.planted.forEach((c,i)=>{if(c){SPOTS[i].planted=true;SPOTS[i].grow=1;}});
  if(d.sight)for(const k in S.sight)S.sight[k]=!!d.sight[k];
  if(d.errands&&typeof d.errands==='object')for(const k in d.errands)S.errands[k]=!!d.errands[k];
  if(typeof d.muted==='boolean'){AU.muted=d.muted;}
  if(stage()>=3){
    if(arr(d.brambles,brambles.length))d.brambles.forEach((c,i)=>{if(c){brambles[i].cleared=true;brambles[i].g.visible=false;}});
    if(arr(d.heaps,stoneHeaps.length))d.heaps.forEach((n,i)=>{const v=num(n,0,3);if(v!==null)stoneHeaps[i].left=v|0;});
    if(arr(d.chan,chanSegs.length)&&brambles.every(b=>b.cleared))d.chan.forEach((c,i)=>{if(c)setChanFixed(chanSegs[i],true);});
    if(arr(d.stumps,stumps.length)&&chanSegs.every(c=>c.fixedOK))d.stumps.forEach((c,i)=>{if(c)setStumpPlanted(stumps[i],true);});
    if(d.press===true&&stumps.every(s=>s.planted))setPressFixed(true);
  }
  if(typeof d.lastDay==='string'&&/^\d{4}-\d\d-\d\d$/.test(d.lastDay))S.lastDay=d.lastDay;
  {const v=num(d.visitDays,0,9999);if(v!==null)S.visitDays=v|0;}
  {const v=num(d.gameDay,0,1e7);if(v!==null)S.gameDay=v|0;}
  {const v=num(d.cutTaken,0,99);if(v!==null)S.cutTaken=v|0;}
  if(d.daily&&typeof d.daily==='object'&&typeof d.daily.day==='string'&&Array.isArray(d.daily.ids))S.daily={day:d.daily.day,ids:d.daily.ids.filter(x=>typeof x==='string').slice(0,3),done:Array.isArray(d.daily.done)?d.daily.done.map(Boolean).slice(0,3):[false,false,false],prog:(d.daily.prog&&typeof d.daily.prog==='object')?d.daily.prog:{},claimed:!!d.daily.claimed};
  if(Array.isArray(d.gifts))S.gifts=d.gifts.filter(g=>g&&Number.isFinite(g.x)&&Number.isFinite(g.z)&&['drift','stone','bottle'].includes(g.type)).slice(0,12).map(g=>({x:g.x,z:g.z,type:g.type}));
  if(Array.isArray(d.keepsakes))S.keepsakes=d.keepsakes.filter(k=>typeof k==='string').slice(0,200);
  if(Array.isArray(d.notes))S.notes=d.notes.filter(n=>Number.isInteger(n)&&n>=0&&n<64).slice(0,64);
  if(d.col&&typeof d.col==='object')for(const k in d.col){if(SPECIES_BY_ID[k]&&d.col[k]&&typeof d.col[k]==='object')S.col[k]={d:String(d.col[k].d||'').slice(0,10),n:clamp(d.col[k].n|0,1,9999)};}
  if(d.cosmetics&&typeof d.cosmetics==='object'){const c=d.cosmetics;S.cosmetics={founderHat:!!c.founderHat,bands:{},band:null};if(c.bands&&typeof c.bands==='object')for(const k of ['koi','crow','tin'])if(c.bands[k])S.cosmetics.bands[k]=true;if(S.cosmetics.bands[c.band])S.cosmetics.band=c.band;}
  if(d.wearing==='founder'&&S.cosmetics.founderHat)S.wearing='founder';
  if(d.oda&&typeof d.oda==='object'){const m=num(d.oda.met,0,3),l=num(d.oda.lastDay,-1,1e7);if(m!==null)oda.met=m|0;if(l!==null)oda.lastDay=Math.floor(l);}
  if(Array.isArray(d.decor))S.decor=d.decor.filter(e=>e&&DECOR_BY_ID[e.id]&&Number.isFinite(e.x)&&Number.isFinite(e.z)).slice(0,MAX_DECOR*2).map(e=>({id:e.id,x:clamp(e.x,-130,130),z:clamp(e.z,-130,130),ry:Number.isFinite(e.ry)?e.ry:0}));
  const cnt=(o,keys)=>{const out={};if(o&&typeof o==='object')for(const k of keys){const v=num(o[k],0,9999);if(v!==null&&v>0)out[k]=v|0;}return out;};
  if(Number.isFinite(d.home))S.home=clamp(d.home|0,0,3);
  if(Array.isArray(d.plots)&&d.plots.length===6)S.plots=d.plots.map(q=>({t:q&&q.t?1:0,c:q&&['greens','berries','pumpkin','roots'].includes(q.c)?q.c:null,g:clamp((q&&q.g)|0,0,3),w:q&&q.w?1:0,wt:clamp(+((q&&q.wt)||0),0,4)}));
  S.crops=cnt(d.crops,['greens','berries','pumpkin','roots','apples']);S.ciders=cnt(d.ciders,['cider_apple','cider_berry','cider_pumpkin','cider_mulled','cordial']);
  S.harvests=num(d.harvests,0,1e6)|0;S.photos=num(d.photos,0,1e6)|0;
  if(d.earned&&typeof d.earned==='object')for(const k in d.earned)if(DECOR_BY_ID[k]&&d.earned[k])S.earned[k]=true;
  if(d.gather&&typeof d.gather==='object')for(const k in d.gather){const v=num(d.gather[k],-1,1e7);if(v!==null)S.gather[k]=v|0;}
  if(d.applePick&&typeof d.applePick==='object')for(const k in d.applePick){const v=num(d.applePick[k],-1,1e7);if(v!==null)S.applePick[k]=v|0;}
  if(d.reed&&typeof d.reed==='object'){if(Array.isArray(d.reed.bw)&&d.reed.bw.length===5)S.reed.bw=d.reed.bw.map(Boolean);if(Array.isArray(d.reed.cut))S.reed.cut=d.reed.cut.slice(0,6).map(v=>Number.isFinite(v)?v|0:-1);
    S.reed.woven={};if(d.reed.woven&&typeof d.reed.woven==='object')for(const k of ['basket','mat','boat'])if(d.reed.woven[k])S.reed.woven[k]=true;S.reed.floated=!!d.reed.floated;}
  S.news=Number.isFinite(d.news)?d.news|0:0;
  S.blight={};for(const k of ['koi','koiRe','bramble','sling','swing','tin','crow','shower'])S.blight[k]=!!(d.blight&&d.blight[k]);
  S.story=null;if(d.story&&typeof d.story==='object'){const t=d.story;S.story={f:{},seen:{},gate:!!t.gate,done:!!t.done,gc:!!t.gc,fest:Number.isFinite(t.fest)?t.fest|0:-1,pick:['a','b','c'].includes(t.pick)?t.pick:null};
    if(t.f&&typeof t.f==='object')for(const k of Object.keys(t.f))if(PIECE_BY_ID[k]&&t.f[k])S.story.f[k]=Number(t.f[k])||1;if(t.seen&&typeof t.seen==='object')for(const k of Object.keys(t.seen))S.story.seen[k]=!!t.seen[k];}
  if(d.mira&&typeof d.mira==='object'){const m=num(d.mira.met,0,3),l=num(d.mira.lastDay,-1,1e7);if(m!==null)mira.met=m|0;if(l!==null)mira.lastDay=Math.floor(l);}
  if(d.stored&&typeof d.stored==='object')for(const k in d.stored){if(DECOR_BY_ID[k]){const v=num(d.stored[k],0,99);if(v!==null)S.stored[k]=v|0;}}
}
function syncOrchard(){
  const os=oStage();
  setBarrierOpen(stage()>=3,true);
  brambles.forEach(b=>{if(b.anim<0){b.g.visible=!b.cleared;}});
  stoneHeaps.forEach(syncStoneHeap);
  chanU.uFlow.value=chanSegs.every(c=>c.fixedOK)?1:0;
  G.uHealPrevB.value=G.uHealNextB.value=HEALS_B[Math.max(os,0)];G.uSweepRB.value=1e5;
  if(os>=4){if(oda.state==='away')odaArrive(true);}else{oda.state='away';oda.root.visible=false;}
}
function syncWorldToStage(){
  const st=stage();
  levelCur=LEVELS[st];G.uWaterY.value=levelCur;water.position.y=levelCur;
  G.uHealPrev.value=G.uHealNext.value=HEALS[st];G.uSweepR.value=1e5;skyHeal=HEALS[st];rainK=Math.max(RAIN[st],W.rain);
  AU.level=st;
  outletU.uFlow.value=sluice.built?1:0;
  if(st>=1)spawnButterflies();
  if(st>=2)spawnDucks(true);
  spotMarkers.forEach((m,i)=>{m.visible=st>=2&&!SPOTS[i].planted;});
  layoutWildReeds();layoutPlantedReeds();
  syncOrchard();
  setHomeStage(S.home);S.plots.forEach((q,i)=>layoutPlot(i));layoutGather();syncReedbed();
  applyWardrobe();
}
/* jump straight to a stage: 0-3 are Mill Pond, 4-6 add the Old Orchard projects (test mode and #stateN) */
function setStageInstant(n){
  if(cine)endCine();
  if(FISH.state!=='idle')fishStop(true);
  timers.length=0;sweep.active=false;sweepB.active=false;
  const pn=Math.min(n,3),on=Math.min(4,Math.max(0,n-3));
  piles.forEach(p=>{if(pn>=1){p.cleared=true;p.anim=-1;p.g.visible=false;}else resetPile(p);});
  setSluiceBuilt(pn>=2);
  CLUMPS.forEach(c=>c.harvested=pn>=3);
  SPOTS.forEach(s=>{s.planted=pn>=3;s.grow=pn>=3?1:0;s.growing=false;});
  brambles.forEach(b=>{if(on>=1){b.cleared=true;b.anim=-1;b.g.visible=false;}else{resetPile(b);}});
  stoneHeaps.forEach(h=>{h.left=on>=2?0:3;});
  chanSegs.forEach(c=>setChanFixed(c,on>=2));
  stumps.forEach(s=>setStumpPlanted(s,on>=3));
  setPressFixed(on>=4);
  S.cutTaken=on>=3?8:0;
  S.home=n>=8?3:0;S.plots=PLOTS.map(()=>({...newPlot(),t:n>=8?1:0}));S.reed.bw=[0,1,2,3,4].map(()=>n>=9);
  S.inv=n===0?{wood:0,stone:0,reed:0,cut:0}:n===1?{wood:12,stone:6,reed:0,cut:0}:n===2?{wood:4,stone:1,reed:0,cut:0}:n===3?{wood:4,stone:1,reed:0,cut:0}:n===7?{wood:5,stone:4,reed:0,cut:0}:n>=8?{wood:6,stone:4,reed:4,cut:0}:{wood:11,stone:n===4?1:4,reed:0,cut:0};
  clearCreatures(pn);
  syncWorldToStage();
}

/* ================================================================
   HUD: restoration, three next small things, waypoint, prompts
   ================================================================ */
const hud={pct:-1,area:'',inv:'',clock:'',tasksHTML:'',todayHTML:'',season:''};
function clockText(){
  const h=Math.floor(S.hours),m=Math.floor((S.hours-h)*60/10)*10;
  const L=dayLen();
  const part=S.hours<L.rise-0.8||S.hours>=L.set+1.6?'night':S.hours<L.rise+0.8?'dawn':S.hours<11?'morning':S.hours<14?'midday':S.hours<L.set-1.6?'afternoon':S.hours<L.set+0.2?'golden hour':'dusk';
  const hh=((h+11)%12)+1;return `${hh}:${String(m).padStart(2,'0')} ${h<12?'am':'pm'} · ${part}`;
}
function bump(id){const el=$(id);el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}
function primaryTargets(){
  const st=stage(),out=[];
  if(st===0)piles.forEach(p=>{if(!p.cleared&&p.anim<0)out.push({x:p.x,z:p.z,label:'Clear a debris pile',r:1.7});});
  else if(st===1){if(sluice.anim<0)out.push({x:sluice.south.x,z:sluice.south.z,label:S.inv.wood>=8&&S.inv.stone>=5?'Rebuild the sluice gate':'Bring wood and stone to the sluice',r:2.4});}
  else if(st===2){
    const left=SPOTS.filter(s=>!s.planted).length;
    if(S.inv.reed>0)SPOTS.forEach(s=>{if(!s.planted)out.push({x:s.x,z:s.z,label:'Plant reed shoots on the shore',r:1.2});});
    if(S.inv.reed<left)CLUMPS.forEach(c=>{if(!c.harvested)out.push({x:c.x,z:c.z,label:'Divide the wild reeds upstream',r:1.4});});
  }else{
    const os=oStage();
    if(os===0){
      if(orchDist(player.pos.x,player.pos.z)>30)out.push({x:LANE[2][0],z:LANE[2][1],label:'Follow the lane up to the Old Orchard',r:1.6});
      else brambles.forEach(b=>{if(!b.cleared&&b.anim<0)out.push({x:b.x,z:b.z,label:'Cut back the brambles',r:1.8});});
    }else if(os===1){
      const need=chanSegs.filter(c=>!c.fixedOK).length*3;
      if(S.inv.stone>=3)chanSegs.forEach(c=>{if(!c.fixedOK&&c.anim<0)out.push({x:c.ix,z:c.iz,label:'Reline the old channel with stone',r:1.5});});
      if(S.inv.stone<need)stoneHeaps.forEach(h=>{if(h.left>0)out.push({x:h.x,z:h.z,label:'Gather stone from the old heaps',r:1.4});});
    }else if(os===2){
      const left=stumps.filter(s=>!s.planted).length;
      if(S.inv.cut>0)stumps.forEach(s=>{if(!s.planted)out.push({x:s.x,z:s.z,label:'Graft a cutting onto a stump',r:1.2});});
      if(S.inv.cut<left)out.push({x:oldApple.x,z:oldApple.z+2.6,label:'Take cuttings from the old apple tree',r:2.2});
    }else if(os===4){
      const rs=rbStage();
      if(rs===0){if(rbDist(player.pos.x,player.pos.z)>30)out.push({x:RPATH[1][0],z:RPATH[1][1],label:'Follow the misty path up to the Reedbeds',r:1.6});
        else{if(S.inv.reed>=2&&S.inv.wood>=1)boardwalk.forEach(b=>{if(!S.reed.bw[b.i])out.push({x:b.x,z:b.z,label:"Mend the reed-weaver's boardwalk",r:1.5});});
          if(S.inv.reed<2)RCLUMPS.forEach(c=>{if(reedAvail(c.i))out.push({x:c.x,z:c.z,label:'Cut reeds by the stream',r:1.3});});
          if(S.inv.wood<1)GATHER.forEach(G3=>{if(G3.type==='wood'&&gatherAvail(G3))out.push({x:G3.x,z:G3.z,label:'Gather fallen branches for wood',r:1.2});});}}
      else if(S.story&&S.story.gate&&!S.story.done)out.push({x:lsW(-0.2,4.2).x,z:lsW(-0.2,4.2).z,label:'Cross to the lit house on the far shore',r:1.6});
      else if(rs>=1&&boatRun)out.push({x:boatRun.x,z:boatRun.z,label:'Follow the reed boat down to Mill Pond',r:1.4});
      else if(rs>=1&&!S.reed.floated&&rbDist(player.pos.x,player.pos.z)<34){const w=nextWeave();
        if(!w)out.push({x:WEAVE.lx,z:WEAVE.lz,label:'Set the reed boat on the stream',r:1.4});
        else if(S.inv.reed>=w.cost.reed&&S.inv.wood>=(w.cost.wood||0))out.push({x:WEAVE.x,z:WEAVE.z,label:`Weave ${w.name} at the frame`,r:1.5});
        else if(S.inv.reed<w.cost.reed)RCLUMPS.forEach(c=>{if(reedAvail(c.i))out.push({x:c.x,z:c.z,label:'Cut reeds for weaving',r:1.3});});
        else GATHER.forEach(G3=>{if(G3.type==='wood'&&gatherAvail(G3))out.push({x:G3.x,z:G3.z,label:'Gather a branch for the boat',r:1.2});});}
      else if(hStage()<3&&!homeBusy)out.push({x:home.ix,z:home.iz,label:HOME_STEPS[hStage()+1].t+' by the mill yard',r:2.0});
    }else if(os===3){
      if(press.anim<0)out.push({x:press.ix,z:press.iz,label:S.inv.wood>=PRESS_WOOD?'Mend the old cider press':`Bring ${PRESS_WOOD} wood to the cider press (you have ${S.inv.wood})`,r:1.8});
    }
  }
  return out;
}
const ERRANDS=[
  {id:'sign',t:'Read the signpost by the path',x:SIGN.x,z:SIGN.z,avail:()=>true,check:()=>Math.hypot(player.pos.x-SIGN.x,player.pos.z-SIGN.z)<3.2},
  {id:'wade',t:'Wade into the shallows',x:12,z:36,avail:()=>true,check:()=>depthAt(player.pos.x,player.pos.z)>0.25&&!player.ice},
  {id:'camphor',t:'Rest under the great camphor',x:HERO.x,z:HERO.z,avail:()=>true,check:()=>Math.hypot(player.pos.x-HERO.x,player.pos.z-HERO.z)<6.5},
  {id:'mill',t:'Visit the old mill',x:mill.x,z:mill.z,avail:()=>true,check:()=>Math.hypot(player.pos.x-mill.x,player.pos.z-mill.z)<9},
  {id:'bridge',t:'Cross a footbridge',x:BRIDGES[1].x,z:BRIDGES[1].z,avail:()=>true,check:()=>onBridge(player.pos.x,player.pos.z)},
  {id:'fish',t:'Catch your first fish',avail:()=>true,check:()=>SPECIES.some(s=>s.type==='fish'&&S.col[s.id])},
  {id:'ducks',t:'Sit with the ducks a moment',avail:()=>creatures.ducks.length>0,check:()=>creatures.ducks.some(d=>d.state==='swim'&&player.pos.distanceTo(d.pos)<10)},
  {id:'dusk',t:'Watch the sun set over the water',avail:()=>stage()>=1,check:()=>goldF>0.5&&Math.hypot(player.pos.x,player.pos.z)<45},
  {id:'fireflies',t:'Find the fireflies after dark',avail:()=>stage()>=3,check:()=>fireflies.uFire.value>0.5&&Math.hypot(player.pos.x,player.pos.z)<50},
  {id:'skate',t:'Slide across the frozen pond',x:6,z:-4,avail:()=>SEASON==='winter'&&stage()>=1,check:()=>player.ice&&Math.hypot(player.vel.x,player.vel.z)>3.5},
  {id:'orchard',t:'Eat an apple in the orchard',avail:()=>oStage()>=3&&SEASON!=='winter',check:()=>orchDist(player.pos.x,player.pos.z)<14}
];
const errandHold={};
function checkErrands(dt){
  if(mode!=='play'||cine)return;
  for(const e of ERRANDS){
    if(S.errands[e.id]||!e.avail())continue;
    if(e.check()){errandHold[e.id]=(errandHold[e.id]||0)+dt;if(errandHold[e.id]>(e.id==='ducks'||e.id==='camphor'?3:0.6)){S.errands[e.id]=true;toast(`Little moment: ${e.t.toLowerCase()}`);SFX.moment();sparkle(player.pos.x,player.pos.y+1,player.pos.z,10);writeSave();}}
    else errandHold[e.id]=0;
  }
}
function nearestOf(list){let best=null,bd=1e9;for(const t of list){const d=Math.hypot(t.x-player.pos.x,t.z-player.pos.z);if(d<bd){bd=d;best=t;}}return best?{t:best,d:bd}:null;}
const ARROW='<svg viewBox="0 0 16 16" aria-hidden="true" style="transform:rotate(DEGdeg)"><path d="M8 13 L8 3"/><path d="M4 7 L8 3 L12 7"/></svg>';
const DOT='<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/></svg>';
function relAngleDeg(x,z){const dx=x-player.pos.x,dz=z-player.pos.z;const world=Math.atan2(dx,dz);const camF=Math.atan2(-Math.sin(cam.yaw),-Math.cos(cam.yaw));return Math.round(angWrap(camF-world)*180/Math.PI);}
function taskList(){
  const out=[];const prim=primaryTargets();const groups=new Map();
  for(const t of prim){if(!groups.has(t.label))groups.set(t.label,[]);groups.get(t.label).push(t);}
  for(const [label,list] of groups){const n=nearestOf(list);out.push({main:true,text:label+(list.length>1?` · ${list.length} left`:''),x:n.t.x,z:n.t.z,d:n.d});}
  if(stage()===3&&oStage()===4&&out.length===0)out.push({main:true,text:oda.met<3&&oda.state==='home'&&(oda.met===0||S.gameDay>oda.lastDay)?'Mr. Oda would like a word, up by the press':'The valley is yours. Wander, fish, sketch and decorate.',x:oda.met<3&&oda.state==='home'?oda.root.position.x:undefined,z:oda.root.position.z,d:oda.state==='home'?Math.hypot(oda.root.position.x-player.pos.x,oda.root.position.z-player.pos.z):undefined});
  if(stage()>=3&&oStage()<4&&hStage()<3&&out.length<3)out.push({main:false,text:'Optional: restore the old cottage by the mill yard',x:home.ix,z:home.iz,d:Math.hypot(home.ix-player.pos.x,home.iz-player.pos.z)});
  for(const e of ERRANDS){if(out.length>=3)break;if(S.errands[e.id]||!e.avail())continue;out.push({main:false,text:e.t,x:e.x,z:e.z,d:e.x!==undefined?Math.hypot(e.x-player.pos.x,e.z-player.pos.z):undefined});}
  return out.slice(0,3);
}
function updateTasks(){
  const html=taskList().map(t=>`<li class="${t.main?'main':'side'}">${t.x!==undefined?ARROW.replace('DEG',relAngleDeg(t.x,t.z)):DOT}<span class="t">${t.text}</span><span class="dist">${t.d!==undefined?Math.round(t.d)+' m':''}</span></li>`).join('');
  if(html!==hud.tasksHTML){hud.tasksHTML=html;$('tasks').innerHTML=html;}
  const th=dailyItems().map(d=>`<li class="${d.done?'done':''}"><span class="ck">${d.done?'✓':'·'}</span><span>${d.text}</span></li>`).join('');
  if(th!==hud.todayHTML){hud.todayHTML=th;$('today').innerHTML=th;}
}
function updateHUD(){
  const px0=player.pos.x,pz0=player.pos.z;const orch=inOrchard(),rbA=rbDist(px0,pz0)<30,hm=homeDist(px0,pz0)<12;
  const area=rbA?'The Reedbeds':orch?'Old Orchard':hm?'The mill cottage':'Mill Pond';const pct=rbA?Math.max(0,rbPct()):orch?orchardPct():hm?Math.round(hStage()*100/3):restorationPct();
  if(pct!==hud.pct||area!==hud.area){hud.pct=pct;hud.area=area;$('pctNum').textContent=pct+'%';$('meterFill').style.width=pct+'%';$('place').textContent=area;
    $('pctUnit').textContent=orch&&oStage()<0?'restored · opens after Mill Pond':rbA&&rbStage()<0?'restored · opens after the cider press':'restored';}
  const inv=`${S.inv.wood}|${S.inv.stone}|${S.inv.reed}|${S.inv.cut}`;
  if(inv!==hud.inv){const [w,s,r,c]=hud.inv?hud.inv.split('|').map(Number):[0,0,0,0];hud.inv=inv;$('invWood').textContent=S.inv.wood;$('invStone').textContent=S.inv.stone;$('invReed').textContent=S.inv.reed;$('invCut').textContent=S.inv.cut;
    if(S.inv.wood!==w)bump('slotWood');if(S.inv.stone!==s)bump('slotStone');if(S.inv.reed!==r)bump('slotReed');if(S.inv.cut!==c)bump('slotCut');
    $('slotCut').hidden=S.inv.cut===0&&oStage()<2;}
  {const cr=Object.values(S.crops).reduce((a,b)=>a+b,0);if($('invCrop').textContent!==String(cr)){$('invCrop').textContent=cr;$('slotCrop').hidden=cr===0;}}
  const c=clockText();if(c!==hud.clock){hud.clock=c;$('clock').textContent=c;}
  const sl=seasonLine();if(sl!==hud.season){hud.season=sl;$('seasonLine').textContent=sl;}
  updateTasks();
}
function toast(text){const el=document.createElement('div');el.className='toast paper';el.textContent=text;$('toasts').appendChild(el);setTimeout(()=>el.remove(),3000);while($('toasts').children.length>4)$('toasts').firstChild.remove();}
const PROJECTS=[
  {t:'Clear the floating debris',sub:()=>`${piles.filter(p=>p.cleared).length} of 6 piles cleared`},
  {t:'Rebuild the sluice gate',sub:()=>sluice.built?'The gate holds the pond at its banks':`Needs 8 driftwood and 5 stone · you carry ${S.inv.wood} and ${S.inv.stone}`},
  {t:'Replant the reeds',sub:()=>`${SPOTS.filter(s=>s.planted).length} of 8 planted · ${S.inv.reed} shoots in your satchel`}
];
const PROJECTS_B=[
  {t:'Give the orchard room to breathe',sub:()=>`${brambles.filter(b=>b.cleared).length} of 7 bramble thickets cut back`},
  {t:'Bring the water back uphill',sub:()=>`${chanSegs.filter(c=>c.fixedOK).length} of 4 channel stretches relined · 3 stone each · you carry ${S.inv.stone}`},
  {t:'Let the orchard remember',sub:()=>`${stumps.filter(s=>s.planted).length} of 8 stumps grafted · ${S.inv.cut} cuttings in your satchel`},
  {t:'Mend the old cider press',sub:()=>press.fixedOK?'The screw turns again':`Needs ${PRESS_WOOD} wood (the brambles give some) · you carry ${S.inv.wood}`}
];
const TIPS=[
  'Driftwood and junk have washed into the flooded meadow. Follow the glowing marker, wade in where it is shallow and hold E beside each pile. The north shore is reached over the footbridges.',
  'The old sluice gate stands where the stream leaves the pond, east of the signpost. You already carry enough driftwood and stone: hold E on the south bank.',
  'Wild reeds grow along the stream past the mill. Divide them for shoots, then plant them at the red-ribboned stakes along the south and west shore.',
  'The pond is whole again, and the fallen log across the west lane has rolled aside. Follow it uphill past the mill to the Old Orchard.',
  'Brambles have swallowed the orchard. Hold E beside each thicket to cut it back; every one gives a little wood.',
  'The irrigation channel from the stream has fallen in. Gather stone from the old heaps around the orchard edge and reline each broken stretch.',
  'One old apple tree survived. Take cuttings from it and graft one onto each of the eight stumps.',
  `The old cider press lies in pieces at the west edge of the orchard. Mend it with ${PRESS_WOOD} wood: bramble cuttings and driftwood from the shore both do.`,
  'Mill Pond and the Old Orchard are restored, and Mr. Oda has come home. The misty path past the orchard now leads up to the Reedbeds, and the old cottage by the mill yard could be your home: a roof, walls, a hearth, then a garden.'
];
function tipIndex(){const st=stage();if(st<3)return st;const os=oStage();return 3+Math.max(0,os)+(os>=0?1:0)-(os===0&&orchDist(player.pos.x,player.pos.z)>30?1:0);}
const CHECK='<svg viewBox="0 0 22 22"><path d="M3 3.5 C9 3 15 3.2 19 3.6 C19.2 9 19 14 18.6 19 C13 19.3 8 19.2 3.4 18.8 C3 13 3.1 8 3 3.5Z"/>';
function projectList(list,cur){return list.map((p,i)=>{const done=cur>i,locked=cur<i;return `<li class="${done?'done':''} ${locked?'locked':''}"><span class="box">${CHECK}${done?'<path d="M6 11 L9.5 15 L17 5.5" stroke="#b5442b" stroke-width="2.2"/>':''}</svg></span><div><div class="ttl">${p.t}</div><div class="sub">${locked?'Not yet: finish the step above first':p.sub()}</div></div></li>`;}).join('');}
const PROJECTS_H=[
  {t:'Re-roof the old cottage',sub:()=>`Needs 8 wood · you carry ${S.inv.wood}. Fallen branches gather under the groves each day.`},
  {t:'Mend the walls',sub:()=>`Needs 2 wood and 6 stone · river stones collect along the stream`},
  {t:'Relight the hearth',sub:()=>`Needs 5 stone · then furnish it (B) and sleep in the bed`}];
const PROJECTS_R=[{t:"Mend the reed-weaver's boardwalk",sub:()=>`${S.reed.bw.filter(Boolean).length} of 5 stretches mended · 1 wood and 2 reeds each`}];
let jPane='pJournal';
function renderJournal(){
  try{const n=PIECES.filter(p=>hasPiece(p.id)&&!S.story.seen[p.id]).length;$('piecesNew').textContent=n?`· ${n} new`:'';}catch(e){}
  $('jPct').textContent=restorationPct()+'%';
  $('jSeason').textContent=seasonLine().toLowerCase();
  $('jProjects').innerHTML=projectList(PROJECTS,stage());
  const os=oStage();
  $('jPctB').textContent=os<0?'· opens once Mill Pond is restored':`· ${orchardPct()}% restored`;
  $('jProjectsB').innerHTML=os<0?PROJECTS_B.map(p=>`<li class="locked"><span class="box">${CHECK}</svg></span><div><div class="ttl">${p.t}</div></div></li>`).join(''):projectList(PROJECTS_B,os);
  {const hs=hStage();$('jPctH').textContent=stage()<3?'· opens once Mill Pond is restored':`· ${Math.round(hs*100/3)}% restored`;$('jProjectsH').innerHTML=projectList(PROJECTS_H,stage()<3?-1:hs);
   const rs=rbStage();$('jPctR').textContent=rs<0?'· opens once the cider press turns':`· ${rbPct()}% restored`;$('jProjectsR').innerHTML=projectList(PROJECTS_R,rs<0?-1:rs);}
  $('jTip').textContent=TIPS[clamp(tipIndex(),0,TIPS.length-1)];
  $('jToday').innerHTML=dailyItems().map(d=>`<li class="${d.done?'':'unseen'}"><span class="mark">${d.done?'✓':'·'}</span>${d.text}${d.progress?` <small>(${d.progress})</small>`:''}</li>`).join('')||'<li class="unseen">Nothing today. Enjoy the quiet.</li>';
  $('jErrands').innerHTML=ERRANDS.map(e=>`<li class="${S.errands[e.id]?'':'unseen'}"><span class="mark">${S.errands[e.id]?'✓':'·'}</span>${e.t}</li>`).join('');
  $('jKeep').innerHTML=S.keepsakes.length?S.keepsakes.map(k=>`<li>${escapeHTML(k)}</li>`).join(''):'<li style="border-style:dashed;color:var(--ink-soft)">Finish today\'s three to press a keepsake here</li>';
  $('jNotes').innerHTML=S.notes.length?S.notes.map(i=>`<li>${escapeHTML(NOTES[i]||'')}</li>`).join(''):'<li style="list-style:none;margin-left:-18px">Bottles wash up on the shore while you are away.</li>';
  renderCollections();
  renderQualityUI();
  renderValleyPane();renderHudRow();renderLetters();
  $('btnDebug').textContent=$('debug').hidden?'Test panel: off':'Test panel: on';
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showPane(id){jPane=id;for(const b of document.querySelectorAll('.jtab'))b.setAttribute('aria-selected',String(b.dataset.pane===id));for(const pid of ['pJournal','pPieces','pCol','pScrap','pValley'])$(pid).hidden=pid!==id;if(id==='pValley')renderValleyPane(true);if(id==='pScrap')renderScrap();if(id==='pPieces')renderPieces(true);}
document.querySelector('.jtabs').addEventListener('click',(e)=>{const b=e.target.closest('.jtab');if(b){showPane(b.dataset.pane);SFX.page();}});
const HUD_KEY='rebuild-the-valley:hud';
let hudMode=(()=>{try{const v=localStorage.getItem(HUD_KEY);if(['compact','expanded','hidden'].includes(v))return v;}catch(e){}return 'compact';})();
let tabPeek=false;
function applyHudMode(){const t=$('tab');t.classList.toggle('expanded',hudMode==='expanded'||tabPeek);t.classList.toggle('off',hudMode==='hidden'&&!tabPeek);}
function renderHudRow(){$('hudRow').innerHTML=[['compact','Compact'],['expanded','Always full'],['hidden','Hidden']].map(([k,l])=>`<button class="pbtn" type="button" data-hud="${k}" aria-pressed="${hudMode===k}">${l}</button>`).join('');}
$('hudRow').addEventListener('click',(e)=>{const b=e.target.closest('[data-hud]');if(!b)return;hudMode=b.dataset.hud;tabPeek=false;try{localStorage.setItem(HUD_KEY,hudMode);}catch(err){}applyHudMode();renderHudRow();});
function setJournal(open,pane){
  if(open===journalOpen){if(open&&pane)showPane(pane);return;}
  journalOpen=open;$('journal').hidden=!open;
  if(open){renderJournal();showPane(pane||jPane);if(document.pointerLockElement)document.exitPointerLock();SFX.page();$('btnClose').focus({preventScroll:true});}
  else{SFX.page();canvas.focus({preventScroll:true});}
}
function sighting(k){if(!S.sight[k]){S.sight[k]=true;writeSave();}if(k==='ducks')collect('mallard',true);if(k==='fireflies')collect('firefly',true);}

/* ================================================================
   Seasons and weather, from the real calendar
   ================================================================ */
function cyrb53(str,seed=0){let h1=0xdeadbeef^seed,h2=0x41c6ce57^seed;for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return 4294967296*(2097151&h2)+(h1>>>0);}
const SEASONS={
  spring:{label:'Spring',rise:6.3,set:19.5,peak:0.9,bloom:1,grass:[1.0,1.04,0.92],ground:[1.0,1.03,0.96],
    leaves:[[0x7cc552,4],[0x9ad363,3],[0x5fa843,2],[0xf4c4d2,1.3],[0xfbe6ee,0.6]],flowers:[[0xfdfbf2,3],[0xf7d548,3],[0xe9a6c8,2],[0x9fc6f2,2],[0xf4f0e0,1]],
    drift:0.3,driftCol:[0xf6c6d6,0xfdf2f4],driftLeaf:1,fall:0.7,rainP:0.32,orch:0xf6dbe4,apples:false,pollen:1,dry:0,keep:'Pressed cherry petal'},
  summer:{label:'Summer',rise:5.7,set:20.3,peak:1.0,bloom:1,grass:[1.0,1.0,0.94],ground:[1.0,1.0,0.95],
    leaves:[[0x4f9a35,4],[0x6cb444,3],[0x3d7f34,2]],flowers:[[0xfdfbf2,2],[0xf7d548,3],[0xf29c6b,2],[0x9fc6f2,2],[0xe86aa0,1]],
    drift:0,driftCol:[0xfff2b0,0xffffff],driftLeaf:0,fall:0.5,rainP:0.2,orch:0x5f9c3c,apples:true,pollen:1.2,dry:0.04,keep:'Pressed four-leaf clover'},
  autumn:{label:'Autumn',rise:7.0,set:18.3,peak:0.72,bloom:0.85,grass:[1.07,1.0,0.8],ground:[1.05,1.0,0.86],
    leaves:[[0xd8642a,3],[0xe8a33a,3],[0xb83a24,2],[0xc9b24a,1.2],[0x5f8f3a,1.4]],flowers:[[0xe86a9a,3],[0xf4f0e0,2],[0xc4382c,2],[0xf2b13a,2],[0x8a6fc4,1]],
    drift:0.5,driftCol:[0xd8642a,0xe8b23a],driftLeaf:1,fall:1.2,rainP:0.3,orch:0xd8a23a,apples:true,pollen:0.6,dry:0.14,keep:'Pressed maple leaf'},
  winter:{label:'Winter',rise:7.3,set:17.0,peak:0.55,bloom:0.1,grass:[0.95,0.95,0.88],ground:[0.96,0.98,1.04],
    leaves:[[0x3f6a4a,1]],flowers:[[0xf4f0e0,3],[0xd890b0,1],[0xc4382c,1]],
    drift:0.14,driftCol:[0xf4f8ff,0xffffff],driftLeaf:0,fall:0.9,rainP:0.35,orch:0x6a5a4a,apples:false,pollen:0.2,dry:0.72,keep:'Sprig of hellebore'}
};
function realSeason(){const m=new Date().getMonth();return m>=2&&m<=4?'spring':m>=5&&m<=7?'summer':m>=8&&m<=10?'autumn':'winter';}
let SEASON=SEASON_PARAM||realSeason();
function hourWord(w){const L=dayLen();return {dawn:L.rise+0.35,noon:12.5,golden:L.set-0.9,dusk:L.set+0.35,night:23}[w]??12;}
function dayLen(){const P=SEASONS[SEASON];return {rise:P.rise,set:P.set};}
const WX={clear:{cloud:0.1,rain:0,snow:0,cover:0.05,over:0},cloudy:{cloud:0.55,rain:0,snow:0,cover:-0.07,over:0.22},rain:{cloud:0.85,rain:0.6,snow:0,cover:-0.15,over:0.5},snow:{cloud:0.7,rain:0,snow:1,cover:-0.1,over:0.35}};
const WX_LABEL={clear:'clear skies',cloudy:'clouds drifting',rain:'soft rain',snow:'snow falling'};
const W={type:'clear',forced:WEATHER_PARAM,cloud:0.1,rain:0,snow:0,cover:0.05,over:0};
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function seasonLine(){const d=new Date();return `${SEASONS[SEASON].label} · ${MONTHS[d.getMonth()]} ${d.getDate()} · ${WX_LABEL[W.type]}`;}
function pickWeather(instant){
  let t=W.forced;
  if(!t){const u=(cyrb53(dayKey()+'|wx|'+S.gameDay)%1000)/1000;const P=SEASONS[SEASON];t=u<P.rainP?(SEASON==='winter'?'snow':'rain'):u<P.rainP+0.3?'cloudy':'clear';}
  if(t==='snow'&&SEASON!=='winter'&&!W.forced)t='rain';
  W.type=t;if(instant)Object.assign(W,WX[t]);applyDriftLook();
}
function updateWeather(dt){const T=WX[W.type];for(const k of ['cloud','rain','snow','cover','over'])W[k]=damp(W[k],T[k],0.25,dt);}
function applyDriftLook(){
  const P=SEASONS[SEASON];const snow=W.type==='snow';
  drift.u.uColA.value.set(snow?0xf4f8ff:P.driftCol[0]);drift.u.uColB.value.set(snow?0xffffff:P.driftCol[1]);
  drift.u.uLeaf.value=snow?0:P.driftLeaf;drift.u.uFall.value=snow?0.9:P.fall;drift.u.uSize.value=snow?0.18:P.driftLeaf?0.24:0.14;drift.u.uSway.value=snow?0.6:1.4;
}
function applyFlowerCount(){flowers.im.count=Math.floor(flowers.total*QP[Q.tier].flowers*Math.min(1,0.72+0.05*S.visitDays)*SEASONS[SEASON].bloom);}
function applySeedlings(){seedlings.im.count=Math.min(seedlings.total,Math.max(0,S.visitDays-1)*3);}
function applySeason(){
  const P=SEASONS[SEASON];
  colorTrees(SEASON);colorFlowers(SEASON);
  G.uSeasonTint.value.setRGB(...P.grass);G.uGroundTint.value.setRGB(...P.ground);
  orchLeafMat.color.set(P.orch);orchCardMat.color.set(P.orch);oldApple.fallen.visible=P.apples;for(const d of dapples)d.visible=SEASON!=='winter';for(const st of stumps)st.dap.visible=SEASON!=='winter'&&st.planted;
  for(const t of [oldApple,...stumps.map(s=>s.tree)]){t.canopy.visible=SEASON!=='winter';t.apples.visible=P.apples;}
  applyDriftLook();applyFlowerCount();
}
function setSeason(s){SEASON=s;applySeason();pickWeather(true);}

/* ================================================================
   Collections: 26 species across fish, insects, birds and flowers
   ================================================================ */
const inS=(...ss)=>ss.includes(SEASON),wx=(...w)=>w.includes(W.type),hr=(a,b)=>S.hours>=a&&S.hours<b;
const SPECIES=[
  {id:'crucian',type:'fish',name:'Crucian carp',hab:'pond',rar:0,shape:'round',col:'#c8a24a',hint:'Pond · any time',note:'Round, golden-brown and unbothered. The pond\'s oldest residents.',ok:()=>true},
  {id:'minnow',type:'fish',name:'Stream minnow',hab:'stream',rar:0,shape:'slim',col:'#9fb2a8',hint:'Stream · any time',note:'A flicker of silver that schools in the current.',ok:()=>true},
  {id:'loach',type:'fish',name:'Weather loach',hab:'any',rar:1,shape:'eel',col:'#8a7a5a',hint:'Anywhere · in the rain',note:'Folk say it wriggles when a storm is coming.',ok:()=>wx('rain')},
  {id:'trout',type:'fish',name:'Brown trout',hab:'stream',rar:1,shape:'slim',col:'#b58a5a',hint:'Stream · mornings in spring and autumn',note:'Freckled red and gold. It likes cold, quick water.',ok:()=>inS('spring','autumn')&&hr(5,11)},
  {id:'pike',type:'fish',name:'Old pike',hab:'pond',rar:1,shape:'long',col:'#6f8a4a',hint:'Pond · around dusk, once the debris is gone',note:'The ambusher under the sluice. Somebody finally caught him.',ok:()=>stage()>=1&&(goldF>0.2||(nightF>0.15&&nightF<0.85))},
  {id:'eel',type:'fish',name:'Eel',hab:'any',rar:1,shape:'eel',col:'#4a4a3a',hint:'Anywhere · after dark',note:'Bites only once the lanterns are lit.',ok:()=>nightF>0.6},
  {id:'goldcarp',type:'fish',name:'Golden carp',hab:'pond',rar:2,shape:'round',col:'#f0a03a',hint:'Pond · clear middays, once the gate holds',note:'Like a coin dropped in the water.',ok:()=>stage()>=2&&wx('clear')&&hr(11,15)},
  {id:'koi',type:'fish',name:'Old koi',hab:'pond',rar:2,shape:'round',col:'#f2ece0',hint:'Pond · at night, once the pond is whole',note:'Left here for safekeeping before the flood. Still here.',ok:()=>stage()>=3&&nightF>0.6},
  {id:'boot',type:'fish',name:'An old boot',hab:'pond',rar:0,shape:'boot',col:'#5a4636',hint:'Pond · only while it is flooded',note:'Not a fish. Still counts.',ok:()=>stage()===0},
  {id:'stickleback',type:'fish',name:'Stickleback',hab:'channel',rar:0,shape:'spiny',col:'#8aa07a',hint:'Orchard channel · any time',note:'Small, spiny and very sure of itself.',ok:()=>true},
  {id:'gudgeon',type:'fish',name:'Gudgeon',hab:'channel',rar:0,shape:'slim',col:'#a89a78',hint:'Orchard channel · daytime',note:'Noses along the new stones, looking for breakfast.',ok:()=>nightF<0.5},
  {id:'bitterling',type:'fish',name:'Rosy bitterling',hab:'channel',rar:1,shape:'round',col:'#d88aa0',hint:'Orchard channel · clear days',note:'Blushes pink in the sun, and lays its eggs inside mussels.',ok:()=>wx('clear')&&nightF<0.4},
  {id:'dace',type:'fish',name:'Dace',hab:'channel',rar:1,shape:'slim',col:'#c0c8cc',hint:'Orchard channel · early mornings and evenings',note:'Quick as a thrown pebble.',ok:()=>hr(5,9)||goldF>0.2||(nightF>0.1&&nightF<0.7)},
  {id:'crayfish',type:'fish',name:'White-clawed crayfish',hab:'channel',rar:1,shape:'crayfish',col:'#8a6a4a',hint:'Orchard channel · after dark',note:'Backs away from you, claws up, very politely.',ok:()=>nightF>0.6},
  {id:'medaka',type:'fish',name:'Medaka',hab:'channel',rar:2,shape:'slim',col:'#e0c070',hint:'Orchard channel · summer and autumn days, once the trees are grafted',note:'The little rice fish. It came up the hill with the water.',ok:()=>inS('summer','autumn')&&oStage()>=3&&nightF<0.4},
  {id:'commonblue',type:'insect',name:'Common blue',hab:'meadow',rar:0,shape:'butterfly',col:'#7fb0f0',hint:'Meadow · sunny days in spring and summer',note:'Tiny and sky-coloured, never still for long.',ok:()=>inS('spring','summer')&&nightF<0.3&&!wx('rain')},
  {id:'akatombo',type:'insect',name:'Red dragonfly',hab:'shore',rar:0,shape:'dragonfly',col:'#d8452e',hint:'Shore · autumn days',note:'Akatombo. When they arrive, summer is over.',ok:()=>(inS('autumn')||(inS('summer')&&hr(16,20)))&&nightF<0.4},
  {id:'skater',type:'insect',name:'Pond skater',hab:'pond',rar:0,shape:'skater',col:'#4a4038',hint:'Pond surface · any season but winter',note:'Walks on water, mostly out of spite.',ok:()=>stage()>=1&&!inS('winter')&&nightF<0.5},
  {id:'stag',type:'insect',name:'Stag beetle',hab:'trees',rar:2,shape:'beetle',col:'#5a3020',hint:'Old trees · summer evenings',note:'Antlered and serious, out on warm evenings.',ok:()=>inS('summer')&&nightF>0.15},
  {id:'firefly',type:'insect',name:'Firefly',hab:'none',rar:1,shape:'firefly',col:'#e8e070',hint:'Around the pond after dark, once it is restored',note:'They keep their own hours.',ok:()=>false},
  {id:'cricket',type:'insect',name:'Bell cricket',hab:'meadow',rar:1,shape:'cricket',col:'#6a5a3a',hint:'Meadow · summer and autumn nights',note:'Suzumushi: the bells in the grass after dark.',ok:()=>inS('summer','autumn')&&nightF>0.5},
  {id:'mallard',type:'bird',name:'Mallard',hab:'none',rar:0,shape:'duck',col:'#2f6b48',hint:'Comes home once the sluice holds',note:'A whole family, back on the pond.',ok:()=>false},
  {id:'heron',type:'bird',name:'Grey heron',hab:'shore',rar:1,shape:'heron',col:'#9aa0a8',hint:'Shore · daylight, once the water drops',note:'Stands so still you forget it is there.',ok:()=>stage()>=1&&nightF<0.4},
  {id:'kingfisher',type:'bird',name:'Kingfisher',hab:'stream',rar:2,shape:'small',col:'#2a8ac8',hint:'Stream · dry days, once the gate holds',note:'A streak of blue so fast it leaves a colour behind.',ok:()=>stage()>=2&&!wx('rain','snow')&&nightF<0.3},
  {id:'wren',type:'bird',name:'Wren',hab:'trees',rar:0,shape:'small',col:'#8a6a4a',hint:'Trees and bushes · daytime',note:'The smallest bird with the loudest song.',ok:()=>nightF<0.35},
  {id:'owl',type:'bird',name:'Tawny owl',hab:'trees',rar:1,shape:'owl',col:'#8a6a48',hint:'Trees · at night',note:'Two calls, a question and an answer.',ok:()=>nightF>0.6},
  {id:'higanbana',type:'flower',name:'Red spider lily',hab:'shore',rar:0,shape:'lily',col:'#d8352a',hint:'By the water · autumn',note:'Higanbana. It comes up overnight at the autumn equinox.',ok:()=>inS('autumn')},
  {id:'cosmos',type:'flower',name:'Cosmos',hab:'meadow',rar:0,shape:'daisy',col:'#e88ab0',hint:'Meadow · summer and autumn',note:'Pink and white heads nodding in the wind.',ok:()=>inS('summer','autumn')},
  {id:'gentian',type:'flower',name:'Gentian',hab:'hills',rar:1,shape:'bell',col:'#4a5ac8',hint:'Hillsides · autumn',note:'A blue so deep it looks wet.',ok:()=>inS('autumn')},
  {id:'iris',type:'flower',name:'Water iris',hab:'shore',rar:1,shape:'iris',col:'#7a5ac8',hint:'Shore · spring and summer, once the reeds return',note:'Purple flags along the shallows.',ok:()=>inS('spring','summer')&&stage()>=2},
  {id:'dandelion',type:'flower',name:'Dandelion',hab:'meadow',rar:0,shape:'puff',col:'#f2d03a',hint:'Meadow · spring and summer',note:'Sun first, then a clock you can blow away.',ok:()=>inS('spring','summer')},
  {id:'hellebore',type:'flower',name:'Hellebore',hab:'orchard',rar:1,shape:'rose',col:'#e8d0d8',hint:'The orchard · winter',note:'The Christmas rose, flowering in the cold.',ok:()=>inS('winter')},
  {id:'warbler',type:'bird',name:'Reed warbler',hab:'reedbed',rar:0,shape:'small',col:'#a08a5a',hint:'The Reedbeds · daytime, spring to autumn',note:'Sings the same tune over and over, like someone humming while they work.',ok:()=>!inS('winter')&&nightF<0.35},
  {id:'reedling',type:'bird',name:'Bearded reedling',hab:'reedbed',rar:1,shape:'small',col:'#c8955a',hint:'The Reedbeds · daytime, any season',note:'They ping to each other like little bells as they move through the stems.',ok:()=>nightF<0.35},
  {id:'damselfly',type:'insect',name:'Banded damselfly',hab:'reedbed',rar:1,shape:'dragonfly',col:'#3a6ad8',hint:'The Reedbeds · sunny days, summer and autumn',note:'Folds its wings when it lands, as if it were tidying up.',ok:()=>inS('summer','autumn')&&nightF<0.3&&!wx('rain','snow')},
  {id:'emperor',type:'insect',name:'Emperor dragonfly',hab:'reedbed',rar:1,shape:'dragonfly',col:'#3a7ad0',hint:'The Reedbeds · sunny days, summer',note:'Patrols the same stretch of stream all afternoon, like a very small lifeguard.',ok:()=>inS('summer')&&nightF<0.3&&!wx('rain','snow')},
  {id:'goldring',type:'insect',name:'Golden-ringed dragonfly',hab:'reedbed',rar:2,shape:'dragonfly',col:'#d8b03a',hint:'The Reedbeds · bright mornings, spring and summer',note:'Black and gold, and it knows it.',ok:()=>inS('spring','summer')&&S.hours<13&&nightF<0.3&&!wx('rain','snow')},
  {id:'darter',type:'insect',name:'Common darter',hab:'reedbed',rar:0,shape:'dragonfly',col:'#c8582a',hint:'The Reedbeds · daytime, late summer and autumn',note:'Sits on the same reed tip, leaves, comes back. Every single time.',ok:()=>inS('summer','autumn')&&nightF<0.35},
  {id:'marshfrog',type:'critter',name:'Marsh frog',hab:'reedbed',rar:0,shape:'frog',col:'#6a9a3a',hint:'The Reedbeds · spring to autumn, loudest at dusk',note:'Laughs at everything. Mostly at you.',ok:()=>!inS('winter')},
  {id:'treefrog',type:'critter',name:'Tree frog',hab:'reedbed',rar:2,shape:'frog',col:'#8ac84a',hint:'The Reedbeds · rainy days or after dark',note:'Small enough to sit on a thumb. It would rather not.',ok:()=>!inS('winter')&&(wx('rain')||nightF>0.5)},
  {id:'nightheron',type:'bird',name:'Night heron',hab:'reedbed',rar:2,shape:'heron',col:'#5a6a7a',hint:'The Reedbeds · dusk and night, any season',note:'Hunched like it is waiting for a bus. It is not waiting for a bus.',ok:()=>nightF>0.35},
  {id:'greens',type:'crop',name:'Spring greens',hab:'none',rar:0,shape:'leafy',col:'#8fd05a',hint:'Sow and grow in spring',note:'Crisp and a little bitter. Best eaten standing in the garden.',ok:()=>false},
  {id:'berries',type:'crop',name:'Summer berries',hab:'none',rar:0,shape:'berries',col:'#c8283a',hint:'Sow and grow in summer',note:'Half of them never make it back to the cottage.',ok:()=>false},
  {id:'pumpkin',type:'crop',name:'Pumpkin',hab:'none',rar:0,shape:'pumpkin',col:'#e07a24',hint:'Sow and grow in autumn',note:'Heavier than it looks, and it looks heavy.',ok:()=>false},
  {id:'roots',type:'crop',name:'Winter roots',hab:'none',rar:0,shape:'root',col:'#b0447a',hint:'Sow and grow in winter',note:'Sweeter after a frost. Nobody is quite sure why.',ok:()=>false},
  {id:'apples',type:'crop',name:'Orchard apples',hab:'none',rar:0,shape:'apple',col:'#c8352a',hint:'Pick from the young trees in summer and autumn',note:'From cuttings of the one old tree that waited.',ok:()=>false},
  {id:'cider_apple',type:'drink',name:'First-press apple cider',hab:'none',rar:1,shape:'bottle',col:'#d8a23a',hint:'Press 3 apples',note:'Cloudy, sharp and very much alive.',ok:()=>false},
  {id:'cider_berry',type:'drink',name:'Summer berry cider',hab:'none',rar:1,shape:'bottle',col:'#a8283a',hint:'Press 3 summer berries',note:'Tastes like the hottest afternoon of the year.',ok:()=>false},
  {id:'cider_pumpkin',type:'drink',name:'Spiced pumpkin cider',hab:'none',rar:1,shape:'jar',col:'#e08a34',hint:'Press 3 pumpkins',note:"Mr. Oda says it is not proper cider. He has a second cup.",ok:()=>false},
  {id:'cider_mulled',type:'drink',name:'Mulled root cider',hab:'none',rar:2,shape:'jar',col:'#8a3a4a',hint:'Press 3 winter roots',note:'For holding in both hands by the hearth.',ok:()=>false},
  {id:'cordial',type:'drink',name:'Spring greens cordial',hab:'none',rar:1,shape:'bottle',col:'#8ac85a',hint:'Press 3 spring greens',note:'Green as new leaves. Better than it sounds.',ok:()=>false}
];
const SPECIES_BY_ID=Object.fromEntries(SPECIES.map(s=>[s.id,s]));
const TYPE_LABEL={fish:'Fish',insect:'Insects',critter:'Critters',bird:'Birds',flower:'Flowers',crop:'Crops',drink:'Drinks',furniture:'Furniture'};
const SHAPES={
  round:'<ellipse cx="54" cy="30" rx="34" ry="16"/><path d="M86 30 L110 14 L105 30 L110 46 Z"/><path d="M44 15 C52 6 62 8 66 15" fill="none"/>',
  slim:'<ellipse cx="52" cy="31" rx="40" ry="9"/><path d="M90 31 L110 20 L106 31 L110 42 Z"/>',
  long:'<path d="M8 30 C20 22 60 20 88 28 L110 18 L106 31 L110 44 L88 34 C60 40 20 38 8 30Z"/>',
  eel:'<path d="M8 30 C24 16 40 40 58 28 S90 16 112 28 L112 34 C90 22 74 38 58 36 S24 26 8 36 Z"/>',
  boot:'<path d="M40 8 L62 8 L62 36 L96 40 C104 42 104 54 96 54 L40 54 Z"/>',
  leafy:'<path d="M60 54 C34 54 26 36 34 24 C40 32 46 34 50 30 C44 20 48 8 60 6 C72 8 76 20 70 30 C74 34 80 32 86 24 C94 36 86 54 60 54Z"/><path d="M60 52 L60 20 M60 40 L46 30 M60 34 L74 26" fill="none"/>',
  berries:'<path d="M60 8 L60 22 M60 14 C70 6 80 8 84 14" fill="none"/>'+[[50,30],[64,28],[44,42],[58,42],[72,40],[52,54],[66,54]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="7"/>`).join(''),
  pumpkin:'<ellipse cx="60" cy="36" rx="34" ry="20"/><path d="M60 16 C52 26 52 46 60 56 M60 16 C68 26 68 46 60 56 M42 20 C34 30 34 44 42 54 M78 20 C86 30 86 44 78 54" fill="none"/><path d="M58 16 L56 6 L64 6 L62 16Z"/>',
  root:'<path d="M48 22 C46 34 54 50 60 58 C66 50 74 34 72 22 C66 18 54 18 48 22Z"/><path d="M56 20 L48 4 M60 20 L60 2 M64 20 L74 6" fill="none" stroke-width="3"/>',
  apple:'<path d="M60 18 C46 8 28 18 32 36 C36 52 50 58 60 52 C70 58 84 52 88 36 C92 18 74 8 60 18Z"/><path d="M60 18 L62 6 M62 10 C70 4 78 6 80 10 C72 12 66 12 62 10Z" fill="none"/>',
  bottle:'<path d="M54 4 L66 4 L66 16 C76 22 78 30 78 40 L78 56 L42 56 L42 40 C42 30 44 22 54 16Z"/><path d="M46 36 L74 36 L74 48 L46 48Z" fill="#f2e6c9"/>',
  jar:'<path d="M42 16 L78 16 L80 22 C86 28 86 50 80 56 L40 56 C34 50 34 28 40 22Z"/><path d="M40 12 L80 12 L80 18 L40 18Z" fill="#f2e6c9"/>',
  f_bed:'<path d="M14 46 L106 46 L106 54 M14 54 L14 24 L26 24 L26 36 L106 36 L106 46" fill="none"/><path d="M26 30 L46 30 L46 36 L26 36Z"/><path d="M48 32 L104 32 L104 44 L48 44Z"/>',
  f_table:'<path d="M14 24 L106 24 L106 30 L14 30Z"/><path d="M22 30 L22 56 M98 30 L98 56 M30 30 L30 52 M90 30 L90 52" fill="none"/><path d="M70 12 L80 12 L82 24 L68 24Z"/>',
  f_chair:'<path d="M40 8 L52 8 L52 34 L84 34 L84 40 L40 40Z"/><path d="M44 40 L44 58 M80 40 L80 58" fill="none"/>',
  f_rug:'<ellipse cx="60" cy="32" rx="50" ry="20"/><ellipse cx="60" cy="32" rx="34" ry="13" fill="#e2b13c"/><ellipse cx="60" cy="32" rx="18" ry="7" fill="#4f7fa8"/>',
  f_shelf:'<path d="M30 4 L90 4 L90 58 L30 58Z" fill="none"/><path d="M30 20 L90 20 M30 38 L90 38" fill="none"/>'+[34,42,50,58,66,74].map((x,i)=>`<path d="M${x} ${i%2?8:10} L${x+6} ${i%2?8:10} L${x+6} 20 L${x} 20Z"/>`).join(''),
  f_plant:'<path d="M46 40 L74 40 L70 58 L50 58Z"/><path d="M60 40 C50 30 36 28 30 18 M60 40 C70 30 84 28 90 18 M60 40 C58 26 60 12 60 4 M60 40 C48 34 42 22 44 10 M60 40 C72 34 78 22 76 10" fill="none" stroke-width="3"/>',
  f_basket:'<path d="M32 30 L88 30 L80 56 L40 56Z"/><path d="M36 30 C36 6 84 6 84 30" fill="none" stroke-width="3"/><path d="M36 40 L84 40 M38 48 L82 48" fill="none"/>',
  f_lamp:'<path d="M50 54 L70 54 L66 50 L54 50Z"/><path d="M60 50 L60 30" fill="none"/><circle cx="60" cy="22" r="10" fill="#f6d77a"/><path d="M52 12 L68 12" fill="none"/>',
  f_ciderrack:'<path d="M24 10 L96 10 L96 56 L24 56Z" fill="none"/><path d="M24 33 L96 33" fill="none"/>'+[34,52,70,88].map(x=>`<circle cx="${x}" cy="22" r="6"/><circle cx="${x}" cy="45" r="6"/>`).join(''),
  spiny:'<ellipse cx="56" cy="32" rx="32" ry="11"/><path d="M86 32 L106 22 L102 32 L106 42 Z"/><path d="M40 21 L44 10 L48 21 M54 21 L58 12 L62 21 M68 22 L71 14 L74 23" fill="none"/>',
  crayfish:'<ellipse cx="62" cy="32" rx="26" ry="9"/><path d="M38 30 L24 22 M38 34 L24 42" fill="none"/><ellipse cx="18" cy="18" rx="9" ry="6"/><ellipse cx="18" cy="46" rx="9" ry="6"/><path d="M88 32 L104 24 L106 32 L104 40 Z"/><path d="M52 40 L48 52 M62 41 L60 54 M72 40 L74 52" fill="none"/>',
  butterfly:'<path d="M60 30 C40 4 18 8 22 26 C24 34 40 34 60 30 C40 36 30 54 46 54 C54 54 58 42 60 30Z"/><path d="M60 30 C80 4 102 8 98 26 C96 34 80 34 60 30 C80 36 90 54 74 54 C66 54 62 42 60 30Z"/><path d="M60 16 L60 46" fill="none" stroke-width="3"/>',
  dragonfly:'<path d="M60 6 L60 56" fill="none" stroke-width="4"/><ellipse cx="38" cy="18" rx="22" ry="5"/><ellipse cx="82" cy="18" rx="22" ry="5"/><ellipse cx="40" cy="27" rx="19" ry="4.5"/><ellipse cx="80" cy="27" rx="19" ry="4.5"/>',
  skater:'<ellipse cx="60" cy="30" rx="6" ry="16"/><path d="M56 22 L30 8 M64 22 L90 8 M55 32 L22 34 M65 32 L98 34 M56 40 L32 56 M64 40 L88 56" fill="none"/>',
  beetle:'<ellipse cx="60" cy="36" rx="16" ry="20"/><circle cx="60" cy="14" r="7"/><path d="M56 8 C50 0 44 4 46 10 M64 8 C70 0 76 4 74 10 M46 30 L34 26 M74 30 L86 26 M46 44 L34 50 M74 44 L86 50" fill="none"/>',
  firefly:'<circle cx="60" cy="38" r="14" fill="rgba(246,215,122,.5)" stroke="none"/><ellipse cx="60" cy="28" rx="7" ry="14"/><path d="M54 18 L44 8 M66 18 L76 8" fill="none"/>',
  cricket:'<ellipse cx="62" cy="34" rx="22" ry="8"/><circle cx="36" cy="32" r="6"/><path d="M32 28 C20 10 10 8 4 8 M34 28 C30 12 24 6 18 4 M70 36 L84 54 M78 32 L100 50" fill="none"/>',
  duck:'<ellipse cx="58" cy="38" rx="30" ry="14"/><circle cx="84" cy="20" r="10"/><path d="M92 20 L108 24 L92 26 Z"/><path d="M28 34 L14 28 L20 40Z"/>',
  frog:'<ellipse cx="60" cy="38" rx="26" ry="14"/><circle cx="46" cy="22" r="7"/><circle cx="74" cy="22" r="7"/><path d="M36 46 C24 50 22 56 30 56 M84 46 C96 50 98 56 90 56" fill="none" stroke-width="3"/><path d="M50 42 Q60 48 70 42" fill="none"/>',
  heron:'<ellipse cx="50" cy="26" rx="18" ry="9"/><path d="M64 22 C74 14 66 8 72 4 L76 6" fill="none" stroke-width="3"/><path d="M76 5 L98 8" fill="none" stroke-width="2.5"/><path d="M46 34 L44 58 M54 34 L56 58" fill="none"/><path d="M32 24 L18 30 L32 30Z"/>',
  small:'<circle cx="56" cy="34" r="16"/><circle cx="72" cy="22" r="9"/><path d="M80 22 L94 24 L80 27Z"/><path d="M40 32 L24 22 L30 38Z"/>',
  owl:'<ellipse cx="60" cy="34" rx="18" ry="22"/><path d="M46 14 L44 4 L54 12 M74 14 L76 4 L66 12" fill="none"/><circle cx="53" cy="24" r="4.5" fill="#f6d77a"/><circle cx="67" cy="24" r="4.5" fill="#f6d77a"/>',
  lily:'<path d="M60 58 L60 30" fill="none"/><path d="M60 30 C44 22 36 30 30 20 M60 30 C76 22 84 30 90 20 M60 30 C52 14 46 12 42 4 M60 30 C68 14 74 12 78 4 M60 30 C58 18 60 8 60 2" fill="none" stroke-width="3"/>',
  daisy:'<path d="M60 58 L60 32" fill="none"/><g>'+[0,1,2,3,4,5,6,7].map(i=>`<ellipse cx="${60+Math.cos(i*0.785)*12}" cy="${22+Math.sin(i*0.785)*12}" rx="7" ry="4" transform="rotate(${i*45} ${60+Math.cos(i*0.785)*12} ${22+Math.sin(i*0.785)*12})"/>`).join('')+'</g><circle cx="60" cy="22" r="5" fill="#f2c14e"/>',
  bell:'<path d="M60 58 L60 30" fill="none"/><path d="M46 30 C46 12 52 4 60 4 C68 4 74 12 74 30 L68 26 L64 31 L60 26 L56 31 L52 26 Z"/>',
  iris:'<path d="M60 58 L60 34" fill="none"/><path d="M60 34 C40 34 34 22 44 16 C52 12 58 24 60 34Z M60 34 C80 34 86 22 76 16 C68 12 62 24 60 34Z M60 32 C52 18 54 4 60 2 C66 4 68 18 60 32Z"/>',
  puff:'<path d="M60 58 L60 28" fill="none"/><circle cx="60" cy="20" r="14" fill="none"/>'+[0,1,2,3,4,5,6,7,8,9,10,11].map(i=>`<path d="M60 20 L${(60+Math.cos(i*0.52)*15).toFixed(1)} ${(20+Math.sin(i*0.52)*15).toFixed(1)}" fill="none"/>`).join(''),
  rose:'<path d="M60 58 L60 34" fill="none"/>'+[0,1,2,3,4].map(i=>`<circle cx="${(60+Math.cos(i*1.256-1.57)*10).toFixed(1)}" cy="${(24+Math.sin(i*1.256-1.57)*10).toFixed(1)}" r="9"/>`).join('')+'<circle cx="60" cy="24" r="5" fill="#f2c14e"/>'
};
function silSVG(sp,found){
  const fill=found?sp.col:'rgba(92,72,52,.1)',stroke=found?'#2a2017':'#5c4834';
  return `<svg viewBox="0 0 120 60" aria-hidden="true" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${found?'':' stroke-dasharray="4 3" opacity=".75"'}><g filter="url(#rough)">${SHAPES[sp.shape]||SHAPES.round}</g></svg>`;
}
function collect(id,quiet){
  const sp=SPECIES_BY_ID[id];if(!sp)return false;
  const e=S.col[id];if(e){e.n++;writeSave();return false;}
  S.col[id]={d:dayKey(),n:1};if(!quiet)toast(`New in your journal: ${sp.name}`);writeSave();return true;
}
let colFilterSel='all';
function renderCollections(){
  const found=SPECIES.filter(s=>S.col[s.id]).length;
  $('colCount').textContent=`${found}/${SPECIES.length}`;$('colFound').textContent=`${found} of ${SPECIES.length} found`;
  const opts=[['all','All'],['fish','Fish'],['insect','Insects'],['critter','Critters'],['bird','Birds'],['flower','Flowers'],['crop','Crops'],['drink','Drinks'],['furniture','Furniture']];
  $('colFilter').innerHTML=opts.map(([k,l])=>`<button class="pbtn" type="button" data-cf="${k}" aria-pressed="${colFilterSel===k}">${l}</button>`).join('');
  if(colFilterSel==='furniture'){$('colGrid').innerHTML=DECOR.filter(f=>f.zone==='home').map(f=>{const e=!!S.earned[f.id];return `<div class="colcard ${e?'':'unfound'}"><span class="tag">Furniture</span>${silSVG({shape:'f_'+f.id,col:'#c8a46a'},e)}<div class="nm">${e?f.name:'Not yet earned'}</div><div class="wh">${e?'Yours to place in the cottage (B)':'Earned by: '+f.earn}</div></div>`;}).join('');return;}
  $('colGrid').innerHTML=SPECIES.filter(s=>colFilterSel==='all'||s.type===colFilterSel).map(s=>{const e=S.col[s.id];
    return `<div class="colcard ${e?'':'unfound'}"><span class="tag">${TYPE_LABEL[s.type]}</span>${silSVG(s,!!e)}<div class="nm">${e?s.name:'Not yet found'}</div><div class="wh">${e?`${s.note}${e.n>1?` · seen ${e.n} times`:''}`:s.hint}</div></div>`;}).join('');
}
$('colFilter').addEventListener('click',(e)=>{const b=e.target.closest('[data-cf]');if(b){colFilterSel=b.dataset.cf;renderCollections();}});
let catchTimer=null;
function showCatch(o){
  const el=$('catch');$('catchK').textContent=o.kicker;$('catchArt').innerHTML=o.art||'';$('catchName').textContent=o.name||'';$('catchNote').textContent=o.note||'';
  el.classList.remove('out');el.hidden=false;clearTimeout(catchTimer);
  catchTimer=setTimeout(()=>{el.classList.add('out');setTimeout(()=>{el.hidden=true;el.classList.remove('out');},700);},o.dur||3600);
}

/* sightings: small creatures and flowers that appear near you; hold E to sketch them */
const SIGHT={list:[],t:4};
function habitatPoint(h){
  for(let i=0;i<40;i++){
    const a=rnd()*6.28,d=rr(7,34);let x=player.pos.x+Math.cos(a)*d,z=player.pos.z+Math.sin(a)*d,y;
    const g=groundH(x,z),r=Math.hypot(x,z),lv=levelCur;
    if(h==='meadow'){if(g<lv+0.3||r<POND_R+4||slopeAt(x,z)>0.6||pathDist(x,z)<1.5||orchDist(x,z)<22)continue;y=g+0.9;}
    else if(h==='shore'){const dd=lv-g;if(dd>0.12||dd<-0.7||r>POND_R+16)continue;y=Math.max(g,lv)+0.8;}
    else if(h==='pond'){const dd=lv-g;if(dd<0.2||dd>0.85)continue;y=lv+0.02;}
    else if(h==='stream'){const pi=polyInfo(x,z,INLET);if(pi.d>3.8||pi.d<1.9||r<POND_R+6||g<lv)continue;y=g+0.9;}
    else if(h==='hills'){if(r<72||r>104||g<3||slopeAt(x,z)>1)continue;y=g+0.1;}
    else if(h==='reedbed'){if(rbStage()<0)return null;const a2=rnd()*6.28,r2=rr(3,17);x=RB.x+Math.cos(a2)*r2;z=RB.z+Math.sin(a2)*r2;if(Math.hypot(x-player.pos.x,z-player.pos.z)>45)return null;y=groundH(x,z)+0.9;}
    else if(h==='orchard'){if(oStage()<0)return null;const a2=rnd()*6.28,r2=rr(3,17);x=ORCH.x+Math.cos(a2)*r2;z=ORCH.z+Math.sin(a2)*r2;if(Math.hypot(x-player.pos.x,z-player.pos.z)>45)return null;y=groundH(x,z)+0.05;}
    else if(h==='trees'){const ts=allTrees.filter(t=>t.v.kind!==3&&Math.hypot(t.x-player.pos.x,t.z-player.pos.z)<40);if(!ts.length)return null;const tr=ts[(rnd()*ts.length)|0];
      const a2=Math.atan2(player.pos.z-tr.z,player.pos.x-tr.x)+rr(-0.8,0.8);x=tr.x+Math.cos(a2)*1.5*tr.s;z=tr.z+Math.sin(a2)*1.5*tr.s;y=groundH(tr.x,tr.z)+rr(1.5,2.3)*tr.s;}
    else return null;
    if(Math.hypot(x,z)>106&&orchDist(x,z)>25&&rbDist(x,z)>24)continue;
    return {x,y,z};
  }
  return null;
}
function smat(hex,o={}){return makeToon(hex,Object.assign({noHeal:true,rim:0.35},o));}
function flowerHead(sp,M){const h=new THREE.Group();
  if(sp.shape==='lily'){for(let i=0;i<7;i++){const a=i/7*6.28;const p=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.014,0.17),M);p.position.set(Math.cos(a)*0.06,0.03,Math.sin(a)*0.06);p.rotation.set(-0.7,-a+Math.PI/2,0);h.add(p);}}
  else if(sp.shape==='bell'){const b=new THREE.Mesh(new THREE.ConeGeometry(0.045,0.1,6),M);b.rotation.x=Math.PI;h.add(b);}
  else if(sp.shape==='puff'){h.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.05,1),M));}
  else{const n=sp.shape==='iris'?3:sp.shape==='rose'?5:8;for(let i=0;i<n;i++){const a=i/n*6.28;const p=new THREE.Mesh(new THREE.SphereGeometry(0.032,6,4).scale(1,0.3,sp.shape==='iris'?2.2:1.6),M);p.position.set(Math.cos(a)*0.045,0,Math.sin(a)*0.045);p.rotation.y=-a+Math.PI/2;if(sp.shape==='iris')p.rotation.x=0.6;h.add(p);}
    h.add(new THREE.Mesh(new THREE.SphereGeometry(0.02,6,4),smat(0xf2c14e)));}
  return h;}
function makeSightModel(sp){
  const g=new THREE.Group();const col=new THREE.Color(sp.col).getHex();const wings=[];
  const M=smat(col),dark=smat(0x2a2018);
  if(sp.type==='insect'){
    if(sp.shape==='skater'){g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.02,0.1,2,4).rotateX(Math.PI/2),dark));
      for(let i=0;i<6;i++){const l=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.006,0.006),dark);const sx=i<3?-1:1;l.position.set(sx*0.08,0,((i%3)-1)*0.05);l.rotation.y=sx*((i%3)-1)*0.4;g.add(l);}g.scale.setScalar(2.4);}
    else if(sp.shape==='beetle'||sp.shape==='cricket'){g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6).scale(0.8,0.5,1.4),M));const hd=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,5),dark);hd.position.z=0.09;g.add(hd);
      for(const sx of [-1,1]){const a=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.012,sp.shape==='beetle'?0.09:0.2),dark);a.position.set(sx*0.025,0.02,sp.shape==='beetle'?0.14:0.18);a.rotation.set(sp.shape==='beetle'?0:-0.4,-sx*0.35,0);g.add(a);}
      g.scale.setScalar(2.6);}
    else{const df=sp.shape==='dragonfly';
      g.add(new THREE.Mesh(new THREE.CapsuleGeometry(df?0.012:0.014,df?0.22:0.08,2,4).rotateX(Math.PI/2),df?M:dark));
      const wm=new THREE.MeshToonMaterial({color:df?0xeef4f6:col,gradientMap,side:THREE.DoubleSide,transparent:df,opacity:df?0.7:1});
      for(const [w,h,z] of df?[[0.17,0.035,0.035],[0.15,0.03,-0.01]]:[[0.11,0.1,0]])for(const sx of [-1,1]){const geo=new THREE.PlaneGeometry(w,h);geo.translate(w/2,0,0);geo.rotateX(-Math.PI/2);const m=new THREE.Mesh(geo,wm);m.position.z=z;if(sx<0)m.rotation.y=Math.PI;g.add(m);wings.push({m,sx});}
      g.scale.setScalar(1.9);}
  }else if(sp.shape==='frog'){
    const b=new THREE.Mesh(new THREE.SphereGeometry(0.1,10,8).scale(1,0.62,1.15),M);b.position.y=0.06;g.add(b);addOutline(b,0.008);
    for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.035,8,6),M);e.position.set(sx*0.05,0.12,0.06);g.add(e);const pu=new THREE.Mesh(new THREE.SphereGeometry(0.018,6,5),dark);pu.position.set(sx*0.058,0.13,0.085);g.add(pu);
      const lg=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,6).scale(0.7,0.45,1.3),M);lg.position.set(sx*0.09,0.03,-0.04);g.add(lg);}
    const bel=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6).scale(1,0.4,1),smat(0xe8e0a0));bel.position.set(0,0.035,0.03);g.add(bel);g.scale.setScalar(1.5);
  }else if(sp.type==='bird'){
    const sh=sp.shape;const sc=sh==='heron'?1.5:sh==='owl'?1.15:0.8;
    const body=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8).scale(0.85,sh==='owl'?1.25:0.85,sh==='owl'?0.9:1.3),M);body.position.y=sh==='heron'?0.5:0.16;g.add(body);addOutline(body,0.01);
    const head=new THREE.Mesh(new THREE.SphereGeometry(sh==='owl'?0.12:0.09,8,6),M);head.position.set(0,sh==='heron'?0.98:sh==='owl'?0.42:0.3,sh==='owl'?0.02:0.15);g.add(head);
    const beak=new THREE.Mesh(new THREE.ConeGeometry(0.025,sh==='heron'?0.3:sp.id==='kingfisher'?0.17:0.07,5).rotateX(Math.PI/2),smat(sh==='heron'?0xd8b03a:0x3a2a1a));beak.position.set(0,head.position.y,head.position.z+(sh==='heron'?0.2:0.1));g.add(beak);
    if(sh==='heron'){const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.05,0.42,6),M);neck.position.set(0,0.76,0.08);neck.rotation.x=0.3;g.add(neck);for(const sx of [-1,1]){const lg=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.42,4),smat(0x8a7a5a));lg.position.set(sx*0.05,0.21,0);g.add(lg);}}
    if(sh==='owl'){for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,6),smat(0xf2d27a));e.position.set(sx*0.05,0.44,0.12);g.add(e);const tf=new THREE.Mesh(new THREE.ConeGeometry(0.03,0.08,4),M);tf.position.set(sx*0.07,0.54,0);g.add(tf);}}
    if(sp.id==='kingfisher'){const belly=new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6),smat(0xe8843a));belly.position.set(0,0.12,0.08);g.add(belly);}
    const tail=new THREE.Mesh(new THREE.ConeGeometry(0.06,0.18,4).rotateX(-2.0),M);tail.position.set(0,body.position.y+0.02,-0.2);g.add(tail);
    g.scale.setScalar(sc);
  }else{
    const stemM=smat(0x4f8a3a);const n=sp.shape==='lily'?3:4;
    for(let k=0;k<n;k++){const h=rr(0.32,0.58);const ox=rr(-0.25,0.25),oz=rr(-0.25,0.25);
      const st=new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.014,h,4),stemM);st.position.set(ox,h/2,oz);g.add(st);
      const hd=flowerHead(sp,M);hd.position.set(ox,h,oz);g.add(hd);}
    const lf=new THREE.Mesh(new THREE.SphereGeometry(0.1,6,4).scale(0.5,0.15,1.6),stemM);lf.position.y=0.05;g.add(lf);
    g.scale.setScalar(1.5);
  }
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  return {g,wings};
}
function spawnSight(sp){
  let p=habitatPoint(sp.hab);if(!p&&sp.hab==='orchard')p=habitatPoint('trees');if(!p)return false;
  if(sp.hab==='reedbed'&&(sp.shape==='heron'||sp.shape==='frog'))p.y=groundH(p.x,p.z)+0.02;
  const m=makeSightModel(sp);m.g.position.set(p.x,p.y,p.z);m.g.rotation.y=rnd()*6.28;scene.add(m.g);
  SIGHT.list.push({sp,g:m.g,wings:m.wings,x:p.x,y:p.y,z:p.z,t:0,life:rr(70,100),ph:rnd()*10,gl:0});
  return true;
}
function spawnSightRandom(){
  const cands=SPECIES.filter(s=>s.type!=='fish'&&s.hab!=='none'&&s.ok()&&!SIGHT.list.some(x=>x.sp===s));
  if(!cands.length)return false;
  const w=cands.map(s=>(S.col[s.id]?1:4)*[1,0.6,0.35][s.rar]);let tot=w.reduce((a,b)=>a+b,0),u=rnd()*tot;
  for(let i=0;i<cands.length;i++){u-=w[i];if(u<=0)return spawnSight(cands[i]);}
  return spawnSight(cands[cands.length-1]);
}
function removeSight(i,flourish){const s=SIGHT.list[i];if(flourish)sparkle(s.x,s.y,s.z,12);scene.remove(s.g);SIGHT.list.splice(i,1);}
function sightStep(dt){
  if(mode!=='play')return;
  for(let i=SIGHT.list.length-1;i>=0;i--){const s=SIGHT.list[i];s.t+=dt;if(s.t>s.life||Math.hypot(s.x-player.pos.x,s.z-player.pos.z)>75||!s.sp.ok())removeSight(i);}
  SIGHT.t-=dt;if(SIGHT.t>0||SIGHT.list.length>=5)return;
  SIGHT.t=rr(6,10);spawnSightRandom();
}
function sightVisuals(t,dt){
  for(const s of SIGHT.list){
    const g=s.g,ty=s.sp.type;
    if(ty==='insect'&&s.sp.shape!=='skater'&&s.sp.shape!=='beetle'&&s.sp.shape!=='cricket'){g.position.set(s.x+Math.sin(t*0.9+s.ph)*0.6,s.y+Math.sin(t*2.1+s.ph)*0.15,s.z+Math.cos(t*0.7+s.ph)*0.6);g.rotation.y=t*0.9+s.ph;
      const f=s.sp.shape==='dragonfly'?Math.sin(t*40)*0.3:Math.abs(Math.sin(t*14+s.ph))*1.1+0.2;for(const w of s.wings)w.m.rotation.z=w.sx*f;}
    else if(s.sp.shape==='skater'){g.position.set(s.x+Math.sin(t*0.4+s.ph)*1.2,levelCur+0.02,s.z+Math.cos(t*0.33+s.ph)*1.2);g.rotation.y=t*0.4+s.ph;}
    else if(s.sp.shape==='frog'){const hp=Math.max(0,Math.sin(t*0.9+s.ph)-0.92)*3;g.position.set(s.x,groundH(s.x,s.z)+0.03+hp,s.z);g.rotation.y=s.ph;}
    else if(ty==='bird'){const hop=Math.max(0,Math.sin(t*3+s.ph))>0.97?0.05:0;g.position.set(s.x,s.y+hop,s.z);g.rotation.y=s.ph+Math.sin(t*0.5+s.ph)*0.7;}
    else if(ty==='flower'){g.rotation.z=Math.sin(t*1.3+s.ph)*0.06;}
    s.gl-=dt;if(s.gl<=0&&Math.hypot(s.x-player.pos.x,s.z-player.pos.z)<40){s.gl=rr(0.8,1.6);_a.setRGB(2.0,1.7,1.0);fxGlow.emit(g.position.x+rr(-0.3,0.3),g.position.y+0.25,g.position.z+rr(-0.3,0.3),0,rr(0.3,0.6),0,_a,0.07,rr(1,1.6),-0.05,0.6,0.15);}
  }
}
function sketchSight(s){
  const i=SIGHT.list.indexOf(s);if(i<0)return;
  const isNew=collect(s.sp.id,true);
  showCatch({kicker:isNew?'Sketched · new in your journal':`Sketched again · ${S.col[s.sp.id].n} times`,art:silSVG(s.sp,true),name:s.sp.name,note:s.sp.note});
  SFX.page();SFX.moment();dailyEvent('sketch');removeSight(i,true);
}

/* ================================================================
   Fishing: cast at ripples, wait for the tug, tap E in the gold
   ================================================================ */
const FISH={state:'idle',t:0,spot:null,wait:0,sp:null,need:0,pips:0,zone:0.4,zw:0.22,speed:0.6,timer:0,lastE:0,mark:0};
let ePressN=0;
const FSPOTS=[];
const bobber=(()=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8),smat(0xd8352a)));
  const top=new THREE.Mesh(new THREE.SphereGeometry(0.072,10,8,0,Math.PI*2,0,Math.PI/2),smat(0xfbf6ea));g.add(top);g.visible=false;scene.add(g);return g;})();
const fishLine=(()=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  const l=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x2a2017,transparent:true,opacity:0.65}));l.frustumCulled=false;l.visible=false;scene.add(l);return l;})();
function spotY(s){return s.kind==='pond'?levelCur:Math.max(groundH(s.x,s.z)+0.3,levelCur);}
function pickFishSpot(kind){
  const lvl=LEVELS[stage()];
  if(kind==='channel'){const L=polyLength(CH);for(let i=0;i<20;i++){const p=polyPoint(CH,rr(3,L-2));if(FSPOTS.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<5))continue;return {x:p.x,z:p.z,kind:'channel',t:0,life:rr(60,110),rip:0};}return null;}
  for(let i=0;i<60;i++){
    if(rnd()<0.62){const a=rnd()*6.28,r=rr(4,POND_R+6);const x=Math.cos(a)*r,z=Math.sin(a)*r;if(lvl-groundH(x,z)<0.75)continue;if(FSPOTS.some(s=>Math.hypot(s.x-x,s.z-z)<8))continue;return {x,z,kind:'pond',t:0,life:rr(45,90),rip:0};}
    const s=rr(10,72);const p=polyPoint(INLET,s);if(Math.hypot(p.x,p.z)<POND_R+3)continue;if(FSPOTS.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<8))continue;
    return {x:p.x,z:p.z,kind:'stream',t:0,life:rr(45,90),rip:0};
  }
  return null;
}
function fishSpotsStep(dt){
  for(let i=FSPOTS.length-1;i>=0;i--){const s=FSPOTS[i];s.t+=dt;const active=FISH.state!=='idle'&&FISH.spot===s;
    if(!active&&(s.t>s.life||(s.kind==='pond'&&levelCur-groundH(s.x,s.z)<0.55)||(s.kind==='channel'&&oStage()<2)))FSPOTS.splice(i,1);}
  for(let tries=0;FSPOTS.length<3&&tries<6;tries++){const needCh=oStage()>=2&&!FSPOTS.some(q=>q.kind==='channel');const s=pickFishSpot(needCh?'channel':null);if(s)FSPOTS.push(s);}
  for(const s of FSPOTS){s.rip-=dt;if(s.rip<=0){s.rip=rr(1.1,2.0);const y=spotY(s);
    if(s.kind==='pond'||y<=levelCur+0.01)addRipple(s.x+rr(-0.3,0.3),s.z+rr(-0.3,0.3),0.55);
    if(Math.hypot(s.x-player.pos.x,s.z-player.pos.z)<60)for(let k=0;k<3;k++)fxSoft.emit(s.x+rr(-0.4,0.4),y+0.03,s.z+rr(-0.4,0.4),0,rr(0.2,0.5),0,_a.setRGB(0.92,0.97,1),0.08,rr(0.5,0.9),0.2,1);}}
}
function setFishUI(label,sub,bar){$('fishLabel').textContent=label;$('fishSub').textContent=sub;$('fBar').hidden=!bar;if(!bar)$('fPips').innerHTML='';}
function fishStart(spot){
  FISH.state='cast';FISH.t=0;FISH.spot=spot;FISH.lastE=ePressN;spot.life=Math.max(spot.life,spot.t+60);
  player.faceT=Math.atan2(spot.x-player.pos.x,spot.z-player.pos.z);player.rod.visible=true;
  $('fishUI').hidden=false;setFishUI('Casting…','Walk away to reel in your line',false);SFX.cast();
}
function fishStop(silent){FISH.state='idle';FISH.spot=null;player.rod.visible=false;bobber.visible=false;fishLine.visible=false;$('fishUI').hidden=true;if(!silent)SFX.reel();}
function chooseFish(spot){
  const list=SPECIES.filter(s=>s.type==='fish'&&(s.hab==='any'||s.hab===spot.kind)&&s.ok());
  if(!list.length)return SPECIES_BY_ID[spot.kind==='pond'?'crucian':spot.kind==='channel'?'stickleback':'minnow'];
  const w=list.map(s=>(S.col[s.id]?1:3)*[1,0.55,0.3][s.rar]);let u=rnd()*w.reduce((a,b)=>a+b,0);
  for(let i=0;i<list.length;i++){u-=w[i];if(u<=0)return list[i];}return list[list.length-1];
}
function fishMiss(msg){FISH.state='done';FISH.t=0;setFishUI(msg,'Hold E by the ripples to try again',false);SFX.reel();}
function fishCatch(){
  const sp=FISH.sp,s=FISH.spot;const isNew=collect(sp.id,true);
  FISH.state='done';FISH.t=0;player.happy=2.5;s.life=0;
  setFishUI(`${sp.name}!`,isNew?'New in your journal':'Back into the water it goes',false);
  showCatch({kicker:isNew?'Caught · new in your journal':`Caught again · ${S.col[sp.id].n} times`,art:silSVG(sp,true),name:sp.name,note:sp.note});
  const y=spotY(s);addRipple(s.x,s.z,1.5);for(let i=0;i<10;i++)fxSoft.emit(s.x,y+0.05,s.z,rr(-1,1),rr(1.5,3),rr(-1,1),_a.setRGB(0.92,0.96,1),0.14,0.6,8,0.4);
  SFX.splash();SFX.get();dailyEvent('fish');if(s.kind==='channel')dailyEvent('fishch');
}
function fishStep(dt){
  if(FISH.state==='idle')return;
  const pressed=ePressN!==FISH.lastE;FISH.lastE=ePressN;
  if(mode!=='play'||cine||photo.on){fishStop(true);return;}
  if(journalOpen)return;
  const moving=MOVE_KEYS.some(keyDown);
  if(moving&&FISH.state!=='done'){fishStop();toast('You reel in your line');return;}
  if(moving&&FISH.state==='done'){fishStop(true);return;}
  FISH.t+=dt;const sp=FISH.spot;
  if(FISH.state==='cast'){if(FISH.t>=0.7){FISH.state='wait';FISH.t=0;FISH.wait=rr(1.5,4.5);addRipple(sp.x,sp.z,0.8);SFX.plop();setFishUI('Waiting for a nibble…','Walk away to reel in your line',false);}}
  else if(FISH.state==='wait'){if(pressed)setFishUI('Not yet…','Wait until the float dips',false);
    if(FISH.t>=FISH.wait){FISH.state='bite';FISH.t=0;addRipple(sp.x,sp.z,1.2);SFX.splash();setFishUI('A tug! Press E','',false);}}
  else if(FISH.state==='bite'){
    if(pressed){const s=chooseFish(sp);FISH.sp=s;FISH.need=3+s.rar;FISH.pips=0;FISH.zw=[0.26,0.21,0.17][s.rar];FISH.zone=rr(0.08,0.92-FISH.zw);FISH.speed=[0.55,0.7,0.85][s.rar];FISH.timer=10;FISH.state='reel';FISH.t=0;
      setFishUI('Reel it in','Press E as the marker crosses the gold',true);}
    else if(FISH.t>1.3)fishMiss('It got away');
  }else if(FISH.state==='reel'){
    FISH.timer-=dt;const ph=(FISH.t*FISH.speed)%2;FISH.mark=ph<1?ph:2-ph;
    if(pressed){if(FISH.mark>=FISH.zone-0.02&&FISH.mark<=FISH.zone+FISH.zw+0.02){FISH.pips++;SFX.tick(FISH.pips);addRipple(sp.x,sp.z,0.6);if(FISH.pips>=FISH.need){fishCatch();return;}FISH.zone=rr(0.08,0.92-FISH.zw);}else SFX.reel();}
    if(FISH.timer<=0)fishMiss('It got away. Plenty more in the water.');
  }else if(FISH.state==='done'){if(FISH.t>1.8)fishStop(true);}
}
const _tip=new THREE.Vector3();
function fishVisuals(t){
  if(FISH.state==='idle')return;
  player.rodTip.getWorldPosition(_tip);
  const s=FISH.spot;const y=spotY(s);
  bobber.visible=FISH.state!=='done';
  if(FISH.state==='cast'){const k=clamp(FISH.t/0.7,0,1);bobber.position.copy(_tip).lerp(_v.set(s.x,y,s.z),k);bobber.position.y+=Math.sin(k*Math.PI)*2.2;}
  else{let dy=Math.sin(t*2.2)*0.02;if(FISH.state==='bite')dy=-0.08+Math.sin(t*30)*0.03;if(FISH.state==='reel')dy=-0.04+Math.sin(t*18)*0.02;bobber.position.set(s.x,y+0.03+dy,s.z);}
  const a=fishLine.geometry.attributes.position;a.setXYZ(0,_tip.x,_tip.y,_tip.z);a.setXYZ(1,bobber.position.x,bobber.position.y+0.05,bobber.position.z);a.needsUpdate=true;fishLine.visible=bobber.visible;
  if(FISH.state==='reel'){$('fZone').style.left=(FISH.zone*100)+'%';$('fZone').style.width=(FISH.zw*100)+'%';$('fMark').style.left=(FISH.mark*100)+'%';
    const pips=Array.from({length:FISH.need},(_,i)=>`<i class="${i<FISH.pips?'on':''}"></i>`).join('');if($('fPips').innerHTML!==pips)$('fPips').innerHTML=pips;
    $('fishSub').textContent=`Press E as the marker crosses the gold · ${Math.ceil(FISH.timer)} s`;}
}

/* ================================================================
   Today's three small things, and gifts the water brings while you are away
   ================================================================ */
function dayKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function daysBetween(a,b){const pa=a.split('-').map(Number),pb=b.split('-').map(Number);return Math.round((Date.UTC(pb[0],pb[1]-1,pb[2])-Date.UTC(pa[0],pa[1]-1,pa[2]))/86400000);}
const DAILY_POOL=[
  {id:'fish',ev:'fish',n:1,t:'Catch a fish, any fish'},
  {id:'fish2',ev:'fish',n:2,t:'Catch two fish'},
  {id:'gift',ev:'gift',n:1,t:'Pick up something the water brought',req:()=>S.gifts.length>0},
  {id:'sketch',ev:'sketch',n:1,t:'Sketch something for your journal'},
  {id:'photo',ev:'photo',n:1,t:'Take a photo (press P)'},
  {id:'tree',ev:'camphor',n:1,t:'Sit under the great camphor'},
  {id:'mill',ev:'mill',n:1,t:'Listen to the mill wheel turn'},
  {id:'ducks',ev:'ducks',n:1,t:'Watch the ducks for a moment',req:()=>stage()>=2},
  {id:'orchard',ev:'orchard',n:1,t:'Walk among the orchard trees',req:()=>oStage()>=0},
  {id:'sunset',ev:'golden',n:1,t:'Watch the sky at golden hour'},
  {id:'oda',ev:'oda',n:1,t:'Say hello to Mr. Oda by the press',req:()=>oStage()>=4},
  {id:'decor',ev:'decor',n:1,t:'Place something in the mill yard',req:()=>S.inv.wood+S.inv.stone>=3||Object.values(S.stored).some(v=>v>0)},
  {id:'channel',ev:'fishch',n:1,t:'Catch something in the orchard channel',req:()=>oStage()>=2},
  {id:'water',ev:'water',n:1,t:'Water the cottage garden',req:()=>hStage()>=1&&S.plots.some(q=>q.c&&q.g<3)},
  {id:'harvest',ev:'harvest',n:1,t:'Harvest something you grew',req:()=>hStage()>=1},
  {id:'gather',ev:'gather',n:1,t:'Gather fallen branches or river stones'},
  {id:'mira',ev:'mira',n:1,t:'Watch the heron with Mira',req:()=>rbStage()>=1},
  {id:'drink',ev:'cider',n:1,t:'Press a seasonal drink',req:()=>press.fixedOK&&Object.values(S.crops).some(v=>v>=3)}
];
const DAILY_BY_ID=Object.fromEntries(DAILY_POOL.map(d=>[d.id,d]));
function newDaily(key,salt=''){
  const pool=DAILY_POOL.filter(d=>!d.req||d.req());let h=cyrb53(key+'|daily'+salt);const ids=[];
  while(ids.length<3&&pool.length){const i=h%pool.length;h=Math.floor(h/pool.length)+(ids.length+1)*7919;const d=pool.splice(i,1)[0];
    if((d.id==='fish2'&&ids.includes('fish'))||(d.id==='fish'&&ids.includes('fish2')))continue;ids.push(d.id);}
  S.daily={day:key,ids,done:ids.map(()=>false),prog:{},claimed:false};
}
function ensureDaily(){if(!S.daily||S.daily.day!==dayKey())newDaily(dayKey());}
function dailyItems(){
  if(!S.daily)return [];
  return S.daily.ids.map((id,i)=>{const d=DAILY_BY_ID[id];if(!d)return null;const p=S.daily.prog[id]|0;return {text:d.t,done:!!S.daily.done[i],progress:d.n>1&&!S.daily.done[i]?`${p} of ${d.n}`:''};}).filter(Boolean);
}
function dailyEvent(ev,n=1){
  if(!S.daily)return;let changed=false;
  S.daily.ids.forEach((id,i)=>{const d=DAILY_BY_ID[id];if(!d||d.ev!==ev||S.daily.done[i])return;
    S.daily.prog[id]=(S.daily.prog[id]|0)+n;changed=true;
    if(S.daily.prog[id]>=d.n){S.daily.done[i]=true;toast(`Today, done: ${d.t.toLowerCase()}`);SFX.moment();}});
  if(!changed)return;
  if(S.daily.done.every(Boolean)&&!S.daily.claimed){S.daily.claimed=true;const dt=new Date();const k=`${SEASONS[SEASON].keep} · ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
    if(!S.keepsakes.includes(k))S.keepsakes.push(k);
    after(1.2,()=>showCatch({kicker:'All three, done',name:SEASONS[SEASON].keep,note:'Pressed between the pages of your journal. Tomorrow brings three new small things.',dur:4200}));}
  hud.todayHTML='';writeSave();
}
const dHold={};
function dailyCheck(dt){
  if(mode!=='play'||cine||!S.daily)return;
  const c={camphor:Math.hypot(player.pos.x-HERO.x,player.pos.z-HERO.z)<6.5,mill:Math.hypot(player.pos.x-mill.x,player.pos.z-mill.z)<9,
    ducks:creatures.ducks.some(d=>d.state==='swim'&&player.pos.distanceTo(d.pos)<10),orchard:oStage()>=0&&orchDist(player.pos.x,player.pos.z)<14,golden:goldF>0.5};
  for(const k in c){if(c[k]){dHold[k]=(dHold[k]||0)+dt;if(dHold[k]>2){dHold[k]=-999;dailyEvent(k);}}else dHold[k]=0;}
}
const NOTES=[
  'My small one. The water is going down at last. I can see the third step of the mill again.',
  'The ducks came back this spring. You would have chased them. Everyone chases them at first.',
  'The plums came early. You would have liked the plums.',
  'If you hear bells in the grass at night, that is only the crickets. Mind where you step.',
  'It is the ninth again. I sent the boat down at dusk, the way I always do.',
  'The pike still lives under the sluice at dusk. Nobody has ever caught him. Maybe you would have.',
  'Somebody is mending the bridges. I watch from the window and do not let myself hope.',
  'The spider lilies came up overnight along the water, red as lanterns. I thought of you.',
  'Eels only bite after dark. Your father knew that. Bring a lamp and patience.',
  'I still weave a little each evening. My hands are slower. The knots are the same.',
  'The koi are still in the pond. I put them there for safekeeping the night of the rains.',
  'Thank you for coming back. I say it every year, to the water, in case.'
];
const giftPool=[];
for(let i=0;i<12;i++){
  const g=new THREE.Group();g.visible=false;scene.add(g);
  const log=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.14,1.3,7).rotateZ(Math.PI/2),makeToon(0x9c8b74,{}));log.position.y=0.1;log.castShadow=true;
  const twig=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.04,0.5,5),makeToon(0x9c8b74,{}));twig.position.set(0.25,0.22,0.1);twig.rotation.set(0.6,0,0.4);log.add(twig);
  const stone=new THREE.Mesh(lumpy(new THREE.DodecahedronGeometry(0.3,1),0.12,2),makeToon(0x9a968b,{}));stone.scale.y=0.6;stone.position.y=0.1;stone.castShadow=true;
  const bottle=new THREE.Group();bottle.rotation.z=Math.PI/2-0.15;bottle.position.y=0.1;
  bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.32,10),makeToon(0x7fbfae,{rim:0.6,noHeal:true})));
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.06,0.12,8),makeToon(0x7fbfae,{rim:0.6,noHeal:true}));neck.position.y=0.21;bottle.add(neck);
  const cork=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.05,6),makeToon(0xb08a5a,{noHeal:true}));cork.position.y=0.29;bottle.add(cork);
  g.add(log,stone,bottle);giftPool.push({g,log,stone,bottle,gl:rnd()*2});
}
function layoutGifts(){giftPool.forEach((p,i)=>{const d=S.gifts[i];p.g.visible=!!d;if(!d)return;p.g.position.set(d.x,groundH(d.x,d.z),d.z);p.g.rotation.y=(d.x*7.3+d.z*3.1)%6.28;p.log.visible=d.type==='drift';p.stone.visible=d.type==='stone';p.bottle.visible=d.type==='bottle';});}
function shorePoint(){
  const lvl=LEVELS[stage()];
  for(let k=0;k<40;k++){const a=rnd()*6.28;for(let r=6;r<55;r+=0.5){const x=Math.cos(a)*r,z=Math.sin(a)*r;if(groundH(x,z)>lvl+0.08){const rr2=r+rr(0.3,1.6);const px=Math.cos(a)*rr2,pz=Math.sin(a)*rr2;
    if(slopeAt(px,pz)>0.8||BUILDINGS.some(b=>Math.hypot(px-b.x,pz-b.z)<b.r)||S.gifts.some(g=>Math.hypot(g.x-px,g.z-pz)<3))break;return {x:px,z:pz};}}}
  return null;
}
function makeGift(){
  const p=shorePoint();if(!p)return null;
  const pending=S.gifts.filter(g=>g.type==='bottle').length;const notesLeft=NOTES.length-S.notes.length-pending>0;
  const u=rnd();const type=u<0.24&&notesLeft?'bottle':u<0.64?'drift':'stone';
  return {x:p.x,z:p.z,type};
}
let welcomeMsg='';
function arrive(){
  const today=dayKey();
  if(S.lastDay===today){ensureDaily();return;}
  const first=!S.lastDay;const away=first?1:clamp(daysBetween(S.lastDay,today),1,7);
  S.lastDay=today;S.visitDays++;
  const n=first?3:Math.min(9,3+2*(away-1));let made=0;
  for(let i=0;i<n&&S.gifts.length<12;i++){const g=makeGift();if(g){S.gifts.push(g);made++;}}
  layoutGifts();applySeedlings();applyFlowerCount();ensureDaily();
  welcomeMsg=first?'':`You were away ${away===1?'a day':away+' days'}. The water left ${made} thing${made===1?'':'s'} on the shore${S.visitDays>1?', and seedlings sprouted by the groves':''}.`;
  writeSave();
}
function pickGift(i){
  const d=S.gifts[i];if(!d)return;S.gifts.splice(i,1);
  if(d.type==='drift'){S.inv.wood++;toast('+1 driftwood');}
  else if(d.type==='stone'){S.inv.stone++;toast('+1 smooth stone');}
  else{let idx=0;while(S.notes.includes(idx)&&idx<NOTES.length)idx++;if(idx<NOTES.length){S.notes.push(idx);showCatch({kicker:'A note in a bottle',name:'',note:`“${NOTES[idx]}”`,dur:6000});after(6.5,()=>piece('notes'));}}
  SFX.get();sparkle(d.x,groundH(d.x,d.z)+0.3,d.z,8);layoutGifts();dailyEvent('gift');writeSave();
}
function giftVisuals(dt){
  giftPool.forEach((p,i)=>{if(!p.g.visible)return;p.gl-=dt;if(p.gl<=0){p.gl=rr(1.2,2.4);const d=S.gifts[i];if(d&&Math.hypot(d.x-player.pos.x,d.z-player.pos.z)<45){_a.setRGB(2,1.8,1.2);fxGlow.emit(d.x+rr(-0.3,0.3),groundH(d.x,d.z)+0.3,d.z+rr(-0.3,0.3),0,0.5,0,_a,0.07,1.2,-0.05,0.6,0.1);}}});
}

/* ================================================================
   Photo mode (P): free camera, frames, filters, postmark, PNG and postcard
   ================================================================ */
const photo={on:false,pause:false,pos:new THREE.Vector3(),yaw:0,pitch:0,fov:52,frame:'none',filter:'natural',stamp:true,shoot:false,canvas:null,kind:'photo'};
const FRAMES=[['none','None'],['paper','Paper'],['postcard','Postcard'],['film','Film']];
const FILTERS=[['natural','Natural',''],['warm','Warm film','sepia(.2) saturate(1.15) hue-rotate(-6deg) brightness(1.03)'],['shinkai','Shinkai blue','saturate(1.35) contrast(1.06) hue-rotate(4deg) brightness(1.05)'],['sepia','Sepia','sepia(.8) contrast(1.05) brightness(1.02)'],['pastel','Pastel','saturate(.72) brightness(1.1) contrast(.88)']];
let DL=null;
(async()=>{try{const cl=window.claude;if(cl&&typeof cl.use==='function')DL=await cl.use('downloads');}catch(e){DL=null;}})();
function renderPhotoBar(){
  $('pbFrames').innerHTML='<span>Frame</span>'+FRAMES.map(([k,l])=>`<button class="pbtn" type="button" data-fr="${k}" aria-pressed="${photo.frame===k}">${l}</button>`).join('');
  $('pbFilters').innerHTML='<span>Filter</span>'+FILTERS.map(([k,l])=>`<button class="pbtn" type="button" data-fi="${k}" aria-pressed="${photo.filter===k}">${l}</button>`).join('');
  canvas.style.filter=FILTERS.find(f=>f[0]===photo.filter)[2]||'';
  $('photoFrame').className=photo.frame==='none'?'':photo.frame+'-f';
}
$('photoBar').addEventListener('click',(e)=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.fr){photo.frame=b.dataset.fr;renderPhotoBar();}else if(b.dataset.fi){photo.filter=b.dataset.fi;renderPhotoBar();}
  else if(b.id==='pbShoot')photo.shoot=true;else if(b.id==='pbExit')photoExit();canvas.focus({preventScroll:true});});
$('pbStamp').addEventListener('change',e=>{photo.stamp=e.target.checked;});
$('pbPause').addEventListener('change',e=>{photo.pause=e.target.checked;});
function photoEnter(){
  if(mode!=='play'||cine||journalOpen||talk.on)return;if(decor.on)decorClose();
  if(FISH.state!=='idle')fishStop(true);
  photo.on=true;photo.pos.copy(camera.position);camera.getWorldDirection(_v);photo.yaw=Math.atan2(-_v.x,-_v.z);photo.pitch=Math.asin(clamp(_v.y,-1,1));photo.fov=52;
  document.body.classList.add('photo');$('photoBar').hidden=false;$('photoFrame').hidden=false;renderPhotoBar();SFX.page();
}
function photoExit(){
  photo.on=false;photo.pause=false;$('pbPause').checked=false;document.body.classList.remove('photo');
  $('photoBar').hidden=true;$('photoFrame').hidden=true;$('photoShot').hidden=true;canvas.style.filter='';camera.fov=52;camera.updateProjectionMatrix();canvas.focus({preventScroll:true});
}
function photoStep(dt){
  if(!$('photoShot').hidden){camera.position.copy(photo.pos);}
  else{
    const cp=Math.cos(photo.pitch);const fx=-Math.sin(photo.yaw),fz=-Math.cos(photo.yaw),rx=Math.cos(photo.yaw),rz=-Math.sin(photo.yaw);
    let mx=0,mz=0,my=0;if(keyDown('KeyW')||keyDown('ArrowUp'))mz+=1;if(keyDown('KeyS')||keyDown('ArrowDown'))mz-=1;if(keyDown('KeyD')||keyDown('ArrowRight'))mx+=1;if(keyDown('KeyA')||keyDown('ArrowLeft'))mx-=1;
    if(keyDown('KeyE'))my+=1;if(keyDown('KeyQ'))my-=1;
    const sp=(keyDown('ShiftLeft')||keyDown('ShiftRight')?14:5)*dt;
    photo.pos.x+=(fx*mz+rx*mx)*sp;photo.pos.z+=(fz*mz+rz*mx)*sp;photo.pos.y+=my*sp;
    const dx=photo.pos.x-player.pos.x,dz=photo.pos.z-player.pos.z,d=Math.hypot(dx,dz);if(d>30){photo.pos.x=player.pos.x+dx/d*30;photo.pos.z=player.pos.z+dz/d*30;}
    photo.pos.y=clamp(photo.pos.y,Math.max(groundH(photo.pos.x,photo.pos.z),levelCur)+0.3,player.pos.y+26);
  }
  camera.position.copy(photo.pos);
  const cp=Math.cos(photo.pitch);_v.set(photo.pos.x-Math.sin(photo.yaw)*cp,photo.pos.y+Math.sin(photo.pitch),photo.pos.z-Math.cos(photo.yaw)*cp);camera.lookAt(_v);
  if(camera.fov!==photo.fov){camera.fov=photo.fov;camera.updateProjectionMatrix();}
}
function drawFrame(g,w,h,frame){
  const m=Math.min(w,h);
  if(frame==='paper'){const b=m*0.035;g.fillStyle='#f2e6c9';g.fillRect(0,0,w,b);g.fillRect(0,h-b,w,b);g.fillRect(0,0,b,h);g.fillRect(w-b,0,b,h);g.strokeStyle='#5c4834';g.lineWidth=Math.max(2,m*0.003);g.strokeRect(b,b,w-2*b,h-2*b);}
  else if(frame==='postcard'){const b=m*0.028;g.fillStyle='#fbf7ee';g.fillRect(0,0,w,b);g.fillRect(0,h-b,w,b);g.fillRect(0,0,b,h);g.fillRect(w-b,0,b,h);g.strokeStyle='rgba(0,0,0,.15)';g.lineWidth=1;g.strokeRect(b,b,w-2*b,h-2*b);}
  else if(frame==='film'){const bt=h*0.055,bs=w*0.02;g.fillStyle='#121010';g.fillRect(0,0,w,bt);g.fillRect(0,h-bt,w,bt);g.fillRect(0,0,bs,h);g.fillRect(w-bs,0,bs,h);
    g.fillStyle='#e8e2d4';const hw=bt*0.38,hh=bt*0.3;for(let x=bs+hw;x<w-bs-hw;x+=hw*2.4){g.fillRect(x,bt*0.35,hw,hh);g.fillRect(x,h-bt*0.35-hh,hw,hh);}
    g.fillStyle='#d8a23a';g.font=`${Math.round(bt*0.32)}px ui-monospace,Menlo,monospace`;g.fillText('RTV 400  ▸ 12',bs+hw,h-bt*0.08);}
}
function drawStamp(g,w,h){
  const m=Math.min(w,h),r=m*0.075,cx=w-r*1.55-m*0.04,cy=h-r*1.45-m*0.04;const d=new Date();
  g.save();g.translate(cx,cy);g.rotate(-0.18);g.strokeStyle='rgba(42,32,23,.72)';g.fillStyle='rgba(42,32,23,.72)';g.lineWidth=Math.max(2,m*0.004);
  g.beginPath();g.arc(0,0,r,0,6.283);g.stroke();g.beginPath();g.arc(0,0,r*0.78,0,6.283);g.stroke();
  g.textAlign='center';g.textBaseline='middle';g.font=`${Math.round(r*0.24)}px "IM Fell DW Pica",Georgia,serif`;g.fillText('MILL POND',0,-r*0.32);
  g.font=`${Math.round(r*0.2)}px "IM Fell DW Pica",Georgia,serif`;g.fillText(`${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()} ${d.getFullYear()}`,0,r*0.02);
  g.font=`${Math.round(r*0.16)}px "IM Fell DW Pica",Georgia,serif`;g.fillText('THE VALLEY',0,r*0.34);
  for(let i=0;i<4;i++){g.beginPath();const y=-r*0.45+i*r*0.3;g.moveTo(-r*1.2,y);for(let x=-r*1.2;x>-r*3.4;x-=r*0.2)g.lineTo(x,y+Math.sin(x/r*6)*r*0.06);g.stroke();}
  g.restore();
}
function capturePhoto(){
  const src=renderer.domElement;const sc=Math.min(1,2400/src.width);const w=Math.round(src.width*sc),h=Math.round(src.height*sc);
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');
  const f=FILTERS.find(x=>x[0]===photo.filter)[2];if(f&&'filter' in g)g.filter=f;
  g.drawImage(src,0,0,w,h);if('filter' in g)g.filter='none';
  drawFrame(g,w,h,photo.frame);if(photo.stamp)drawStamp(g,w,h);
  photo.kind='photo';showShot(cv);SFX.shutter();S.photos=(S.photos|0)+1;dailyEvent('photo');
}
function makePostcard(){
  const src=photo.canvas;if(!src)return;
  const W0=1800,H0=1200;const cv=document.createElement('canvas');cv.width=W0;cv.height=H0;const g=cv.getContext('2d');
  g.fillStyle='#f6eedb';g.fillRect(0,0,W0,H0);
  for(let i=0;i<1600;i++){g.fillStyle=`rgba(120,90,50,${Math.random()*0.05})`;g.fillRect(Math.random()*W0,Math.random()*H0,2,2);}
  const px=60,py=60,pw=W0-120,ph=820;const ar=src.width/src.height,tr=pw/ph;let sx=0,sy=0,sw=src.width,sh=src.height;
  if(ar>tr){sw=src.height*tr;sx=(src.width-sw)/2;}else{sh=src.width/tr;sy=(src.height-sh)/2;}
  g.fillStyle='#fffdf7';g.fillRect(px-14,py-14,pw+28,ph+28);g.drawImage(src,sx,sy,sw,sh,px,py,pw,ph);
  g.strokeStyle='#5c4834';g.lineWidth=2;g.beginPath();g.moveTo(W0*0.62,ph+130);g.lineTo(W0*0.62,H0-60);g.stroke();
  g.fillStyle='#2a2017';g.font='54px Kalam, "Segoe Print", cursive';g.textBaseline='alphabetic';
  const os=oStage();const msg=os>=4?'The orchard is blooming again, and old Mr. Oda is home.':os>=3?'The orchard is blooming again.':stage()>=3?'The pond is back, and the ducks came home.':stage()>=1?'The water is going down at last.':'Still flooded, but not for long.';
  g.fillText('Wish you were here!',90,ph+190);g.font='40px Kalam, "Segoe Print", cursive';g.fillText(msg,90,ph+256);g.fillText(`${SEASONS[SEASON].label} in the valley.`,90,ph+312);
  g.strokeStyle='rgba(92,72,52,.5)';g.lineWidth=2;for(let i=0;i<3;i++){g.beginPath();g.moveTo(W0*0.65,ph+210+i*70);g.lineTo(W0-90,ph+210+i*70);g.stroke();}
  g.save();g.translate(W0-230,ph+110);g.fillStyle='#fbf7ee';g.fillRect(0,0,150,180);g.strokeStyle='#b5442b';g.setLineDash([6,5]);g.lineWidth=3;g.strokeRect(6,6,138,168);g.setLineDash([]);
  g.fillStyle='#58803a';g.beginPath();g.ellipse(75,90,34,58,0.5,0,6.283);g.fill();g.strokeStyle='#f2e6c9';g.lineWidth=3;g.beginPath();g.moveTo(52,130);g.lineTo(100,50);g.stroke();g.restore();
  drawStamp(g,W0,H0);
  g.fillStyle='#5c4834';g.font='26px "IM Fell DW Pica", Georgia, serif';g.fillText('Mizumend · Rebuild the Valley',90,H0-60);
  photo.kind='postcard';showShot(cv);
}
function showShot(cv){photo.canvas=cv;$('shotImg').src=cv.toDataURL('image/png');$('photoShot').hidden=false;
  $('shotNote').textContent=DL?'':'Saving needs the artifact viewer; you can also right-click (or long-press) the picture and save it.';
  if(document.pointerLockElement)document.exitPointerLock();}
$('shotClose').addEventListener('click',()=>{$('photoShot').hidden=true;canvas.focus({preventScroll:true});});
/* ================================================================
   v8: "Then and now" scrapbook: fixed-viewpoint snapshots per area at 0/25/50/100%, plus pinned photos.
   Small JPEG thumbnails in their own localStorage key, capped.
   ================================================================ */
const SCRAP_KEY='rebuild-the-valley:scrapbook';
const SCRAP_MS=[25,50,100],SCRAP_PIN_MAX=8,SCRAP_W=256,SCRAP_H=144;
const SCRAP_AREAS=[
  {id:'pond',name:'Mill Pond',on:()=>true,pct:()=>restorationPct(),view:()=>({p:[34,10.5,40],l:[0,1.2,0]})},
  {id:'orchard',name:'The Old Orchard',on:()=>oStage()>=0,pct:()=>orchardPct(),view:()=>({p:[ORCH.x+20,groundH(ORCH.x+20,ORCH.z+15)+8,ORCH.z+15],l:[ORCH.x,5,ORCH.z]})},
  {id:'home',name:'The mill cottage',on:()=>stage()>=3,pct:()=>Math.round(hStage()*100/3),view:()=>{const c=homeW(4.5,-12);return {p:[c.x,HOME_H+5.5,c.z],l:[HOME.x,HOME_H+1.6,HOME.z]};}},
  {id:'reedbed',name:'The Reedbeds',on:()=>rbStage()>=0,pct:()=>Math.max(0,rbPct()),view:()=>{const a=RPATH[2];return {p:[a[0],groundH(a[0],a[1])+7,a[1]],l:[RB.x,8,RB.z]};}}];
const scrap={data:{v:1,areas:{},pins:[]},q:[],t:0};
(function(){try{const d=JSON.parse(localStorage.getItem(SCRAP_KEY)||'null');if(d&&d.v===1&&typeof d.areas==='object'&&Array.isArray(d.pins))scrap.data=d;}catch(e){}})();
function scrapWrite(){if(sandbox)return;for(let k=0;k<6;k++){try{localStorage.setItem(SCRAP_KEY,JSON.stringify(scrap.data));return;}catch(e){if(scrap.data.pins.length)scrap.data.pins.shift();else return;}}}
function scrapThumb(src,sx=0,sy=0,sw=src.width,sh=src.height){const tr=SCRAP_W/SCRAP_H;if(sw/sh>tr){const w=sh*tr;sx+=(sw-w)/2;sw=w;}else{const h=sw/tr;sy+=(sh-h)/2;sh=h;}
  const cv=document.createElement('canvas');cv.width=SCRAP_W;cv.height=SCRAP_H;cv.getContext('2d').drawImage(src,sx,sy,sw,sh,0,0,SCRAP_W,SCRAP_H);return cv.toDataURL('image/jpeg',0.72);}
function scrapStamp(){const d=new Date();return {d:dayKey(d),s:SEASON,h:Math.round(S.hours*10)/10};}
function scrapStep(dt){
  if(mode!=='play'||cine)return;scrap.t-=dt;if(scrap.t>0)return;scrap.t=2;
  for(const A of SCRAP_AREAS){if(!A.on())continue;const list=scrap.data.areas[A.id]||(scrap.data.areas[A.id]=[]);const pct=A.pct();
    if(scrap.q.some(r=>r.area===A.id))continue;
    if(!list.length&&pct<25){scrap.q.push({area:A.id,p:0,at:simTime+4});continue;}
    const due=SCRAP_MS.filter(m=>pct>=m&&!list.some(e=>e.p>=m));if(due.length)scrap.q.push({area:A.id,p:due[due.length-1],at:simTime+9});}
}
function scrapCapture(req){
  const A=SCRAP_AREAS.find(a=>a.id===req.area);if(!A)return;const v=A.view();
  const pp=camera.position.clone(),pq=camera.quaternion.clone();
  camera.position.set(v.p[0],v.p[1],v.p[2]);camera.lookAt(v.l[0],v.l[1],v.l[2]);camera.updateMatrixWorld();
  if(QP[Q.tier].post)composer.render(0);else renderer.render(scene,camera);
  const src=renderer.domElement;const img=scrapThumb(src);
  camera.position.copy(pp);camera.quaternion.copy(pq);camera.updateMatrixWorld();
  if(QP[Q.tier].post)composer.render(0);else renderer.render(scene,camera);
  const list=scrap.data.areas[A.id]||(scrap.data.areas[A.id]=[]);list.push({p:req.p,img,...scrapStamp()});list.sort((a,b)=>a.p-b.p);while(list.length>5)list.splice(1,1);
  scrapWrite();if(req.p>0&&!sandbox)toast(`${A.name} at ${req.p}%: a new page in your scrapbook (J).`);
}
function scrapFrame(){if(scrap.want){const w=scrap.want;scrap.want=null;try{scrap.data.pins.push({img:scrapThumb(renderer.domElement),cap:w,...scrapStamp()});while(scrap.data.pins.length>SCRAP_PIN_MAX)scrap.data.pins.shift();scrapWrite();}catch(e){}}
  if(!scrap.q.length||cine||mode!=='play'||photo.on||journalOpen)return;const r=scrap.q[0];if(simTime<r.at)return;scrap.q.shift();try{scrapCapture(r);}catch(e){console.error(e);}}
function scrapPin(){const cv=photo.canvas;if(!cv)return;const near=SCRAP_AREAS.map(A=>({A,d:A.id==='pond'?Math.hypot(player.pos.x,player.pos.z)-30:A.id==='orchard'?orchDist(player.pos.x,player.pos.z):A.id==='home'?homeDist(player.pos.x,player.pos.z):rbDist(player.pos.x,player.pos.z)})).sort((a,b)=>a.d-b.d)[0].A;
  scrap.data.pins.push({img:scrapThumb(cv),cap:near.name,...scrapStamp()});while(scrap.data.pins.length>SCRAP_PIN_MAX)scrap.data.pins.shift();scrapWrite();
  $('shotNote').textContent=`Pinned to your scrapbook (${scrap.data.pins.length} of ${SCRAP_PIN_MAX}; the oldest goes when it's full).`;SFX.page();}
const escA=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function scrapLabel(e){return `${e.p===0?'Before':e.p+'%'} · ${SEASONS[e.s]?SEASONS[e.s].label:e.s} · ${escA(e.d)}`;}
function renderScrap(){
  $('scrapAreas').innerHTML=SCRAP_AREAS.map(A=>{const list=scrap.data.areas[A.id]||[];const on=A.on();
    const then=list.find(e=>e.p===0)||null,later=list.filter(e=>e.p>0),now=later.length?later[later.length-1]:null;
    const fig=(e,empty)=>e?`<figure><img alt="${escA(A.name)}, ${e.p===0?'before':e.p+'% restored'}" src="${e.img}"><figcaption>${scrapLabel(e)}</figcaption></figure>`:`<div class="scrap-empty">${empty}</div>`;
    const strip=list.length>2?`<div class="scrap-strip">${list.map(e=>`<figure><img alt="" src="${e.img}"><span>${e.p===0?'Before':e.p+'%'}</span></figure>`).join('')}</div>`:'';
    return `<div class="scrap-card"><h3>${escA(A.name)}<small>${on?A.pct()+'% restored':'not found yet'}</small></h3><div class="scrap-pair">${fig(then,!on?'Keep restoring the valley to find this place':now?'Then: from before your scrapbook began':'The first picture is taken the next time you are here')}${fig(now,'Now: taken at 25%, 50% and 100%')}</div>${strip}</div>`;}).join('');
  const pins=scrap.data.pins;$('scrapPinN').textContent=`${pins.length} of ${SCRAP_PIN_MAX}`;
  $('scrapPins').innerHTML=pins.length?pins.map((e,i)=>`<figure><img alt="Pinned photo, ${escA(e.cap)}" src="${e.img}"><figcaption>${escA(e.cap)} · ${escA(e.d)}</figcaption><button type="button" data-unpin="${i}" aria-label="Remove this photo">×</button></figure>`).join(''):'<p class="qnote">Take a photo (P), then choose "Pin to scrapbook".</p>';
}
function renderPieces(mark){
  storyInit();const st=S.story;const found=PIECES.filter(p=>hasPiece(p.id)).sort((a,b)=>(st.f[a.id]-st.f[b.id])||PIECES.indexOf(a)-PIECES.indexOf(b));
  const extra=st.done?[{id:'ren',t:rim().ren[0],w:'Lamplight Shore',x:rim().ren[1]}]:[];
  $('pcList').innerHTML=found.concat(extra).map(p=>`<li class="${st.seen[p.id]?'':'new'}"><b>${escA(p.t)}</b><small>${escA(p.w)}</small><p>${escA(p.x)}</p></li>`).join('')+(found.length<PIECES.length?`<li class="unk"><small>${PIECES.length-found.length} more somewhere in the valley…</small></li>`:'');
  $('pcBasket').textContent=st.done?rim().rim:"You've had it as long as you can remember. Lopsided, but sturdy. Something is worked into the rim, too worn to make out.";
  $('pcGate').hidden=!st.gc;
  const tags=k=>found.filter(p=>p.g.includes(k)).length;
  $('pcTheories').innerHTML=THEORIES.map(T=>`<li data-th="${T.k}" class="${st.pick===T.k?'pick':''}">${escA(T.t)}<span class="tally">${'| '.repeat(tags(T.k))||'no pieces yet'}</span></li>`).join('')+(st.gc?'<li data-th="" style="cursor:default">And who was the small one?</li>':'');
  const E=$('pcEnd');E.hidden=!st.done;if(st.done){const R=rim();E.innerHTML=`<h2 class="sp">${escA(R.page[0])}</h2>${R.page.slice(1).map(x=>`<p class="hand">${escA(x)}</p>`).join('')}<p class="hand"><i>${escA(R.theory)}</i></p>`;}
  if(mark){for(const p of found)st.seen[p.id]=true;if(st.done)st.seen.ren=true;writeSave();$('piecesNew').textContent='';}
}
$('pcTheories').addEventListener('click',e=>{const li=e.target.closest('[data-th]');if(!li||!li.dataset.th)return;storyInit();S.story.pick=S.story.pick===li.dataset.th?null:li.dataset.th;writeSave();renderPieces();SFX.page();});
$('slotBasket').addEventListener('click',()=>setJournal(true,'pPieces'));
$('scrapPins').addEventListener('click',e=>{const b=e.target.closest('[data-unpin]');if(!b)return;scrap.data.pins.splice(+b.dataset.unpin,1);scrapWrite();renderScrap();});
$('shotPin').addEventListener('click',()=>scrapPin());

$('shotCard').addEventListener('click',()=>makePostcard());
$('shotSave').addEventListener('click',()=>{
  const cv=photo.canvas;if(!cv)return;
  cv.toBlob(async(blob)=>{
    if(!blob){$('shotNote').textContent='That picture could not be prepared. Try again.';return;}
    if(!DL){$('shotNote').textContent='Right-click (or long-press) the picture and choose Save image.';return;}
    const d=new Date();const name=`${photo.kind==='postcard'?'postcard':'mill-pond'}-${dayKey(d)}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}.png`;
    try{await DL.save({filename:name,data:blob});$('shotNote').textContent='Saved.';}
    catch(err){const c=err&&err.code;$('shotNote').textContent=c==='declined'?'Not saved.':c==='rate_limited'?'One moment, then try again.':'Saving is not available here. Right-click the picture to save it.';}
  },'image/png');
});
$('shotCopy').addEventListener('click',()=>{
  const cv=photo.canvas;if(!cv)return;
  cv.toBlob(async(blob)=>{try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);$('shotNote').textContent='Copied. Paste it anywhere.';}
    catch(e){$('shotNote').textContent='Copying pictures is blocked here. Use Save PNG instead.';}},'image/png');
});

/* ================================================================
   Save code, support, founder code, wardrobe
   ================================================================ */
function b64urlEncode(str){const bytes=new TextEncoder().encode(str);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function b64urlDecode(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new TextDecoder().decode(bytes);}
function makeSaveCode(){const b=b64urlEncode(JSON.stringify(serialize()));return `RTV1.${b}.${cyrb53(b).toString(36)}`;}
function parseSaveCode(code){
  const m=String(code).replace(/\s+/g,'').match(/^RTV1\.([A-Za-z0-9_-]+)\.([a-z0-9]+)$/);
  if(!m)throw new Error('That does not look like a valley code. It should start with RTV1.');
  if(cyrb53(m[1]).toString(36)!==m[2])throw new Error('This code is incomplete or was changed. Copy it again from the original.');
  let d;try{d=JSON.parse(b64urlDecode(m[1]));}catch(e){throw new Error('This code could not be read.');}
  if(!validSave(d))throw new Error('This code is from a version the valley does not recognise.');
  return d;
}
const SUPPORT_URL='';
const FOUNDER_SALT='mill-pond-founders-2026',B32='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function founderSig(body){let h=cyrb53(FOUNDER_SALT+body);let s='';for(let i=0;i<4;i++){s+=B32[h%32];h=Math.floor(h/32);}return s;}
function checkFounder(code){const c=String(code).toUpperCase().replace(/[^A-Z0-9]/g,'');const m=c.match(/^FNDR([A-Z0-9]{4})([A-Z0-9]{4})([A-Z0-9]{4})$/);if(!m)return false;const body=m[1]+m[2];if([...body].some(ch=>!B32.includes(ch)))return false;return founderSig(body)===m[3];}
const BANDS={koi:{name:'Koi-scale band',col:0xf2ece0,c2:0xe2602a},crow:{name:"Crow's-feather band",col:0x2a3450,c2:0x5a78b0},tin:{name:'Seed-tin band',col:0x7a8a4a,c2:0xd8b03a}};
const _bandMat=(()=>{let m=null;player.hat.traverse(o=>{if(!m&&o.isMesh&&o.material&&o.material.color&&o.material.color.getHex()===0xb5442b){o.material=o.material.clone();m=o.material;}});return m;})();
function applyWardrobe(){const f=S.wearing==='founder'&&S.cosmetics.founderHat;player.hat.visible=!f;player.fhat.visible=f;
  const b=S.cosmetics.bands&&S.cosmetics.band&&S.cosmetics.bands[S.cosmetics.band]?BANDS[S.cosmetics.band]:null;if(_bandMat)_bandMat.color.setHex(b?b.col:0xb5442b);}
function renderValleyPane(fill){
  if(fill)$('saveCode').value=makeSaveCode();
  const has=!!S.cosmetics.founderHat;
  $('wardrobe').innerHTML=`<button class="pbtn" type="button" data-wear="straw" aria-pressed="${S.wearing!=='founder'}">Straw hat</button><button class="pbtn" type="button" data-wear="founder" aria-pressed="${S.wearing==='founder'&&has}" ${has?'':'disabled'}>Founder's hat${has?'':' · locked'}</button>`;
  {const own=Object.keys(BANDS).filter(k=>S.cosmetics.bands&&S.cosmetics.bands[k]);if(own.length)$('wardrobe').insertAdjacentHTML('beforeend',`<div class="row" style="margin-top:6px"><button class="pbtn" type="button" data-band="" aria-pressed="${!S.cosmetics.band}">Red band</button>${own.map(k=>`<button class="pbtn" type="button" data-band="${k}" aria-pressed="${S.cosmetics.band===k}">${BANDS[k].name}</button>`).join('')}</div>`);}
}
$('wardrobe').addEventListener('click',(e)=>{const bb=e.target.closest('[data-band]');if(bb){if(!S.cosmetics.bands)S.cosmetics.bands={};S.cosmetics.band=bb.dataset.band||null;applyWardrobe();renderValleyPane();writeSave();return;}
  const b=e.target.closest('[data-wear]');if(!b||b.disabled)return;S.wearing=b.dataset.wear;applyWardrobe();renderValleyPane();writeSave();});
$('btnCopyCode').addEventListener('click',async()=>{const ta=$('saveCode');ta.value=makeSaveCode();
  try{await navigator.clipboard.writeText(ta.value);$('saveNote').textContent='Copied. Keep it somewhere safe.';}
  catch(e){ta.focus();ta.select();let ok=false;try{ok=document.execCommand('copy');}catch(e2){}$('saveNote').textContent=ok?'Copied. Keep it somewhere safe.':'Select the code above and copy it.';}});
$('btnSaveCode').addEventListener('click',async()=>{
  const code=makeSaveCode();$('saveCode').value=code;
  if(!DL){$('saveNote').textContent='Saving files is not available here. Copy the code instead.';return;}
  try{await DL.save({filename:`mizumend-save-${dayKey()}.txt`,data:code+'\n'});$('saveNote').textContent='Saved as a text file.';}
  catch(e){$('saveNote').textContent=e&&e.code==='declined'?'Not saved.':'Saving files is not available here. Copy the code instead.';}});
let loadArm=null;
$('btnLoadCode').addEventListener('click',()=>{
  let d;try{d=parseSaveCode($('saveCode').value);}catch(e){$('saveNote').textContent=e.message;loadArm=null;return;}
  const code=$('saveCode').value.replace(/\s+/g,'');
  if(loadArm!==code){loadArm=code;const n=Array.isArray(d.planted)?d.planted.filter(Boolean).length:0;$('saveNote').textContent=`That code is valid${n?` (${n} of 8 reeds planted)`:''}. Press Load again to replace this valley with it.`;$('btnLoadCode').textContent='Load: confirm';setTimeout(()=>{loadArm=null;$('btnLoadCode').textContent='Load pasted code';},6000);return;}
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(d));}catch(e){$('saveNote').textContent='This browser is blocking storage, so the code cannot be loaded here.';return;}
  try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
  location.reload();
});
$('btnSupport').addEventListener('click',()=>{
  if(SUPPORT_URL){try{window.open(SUPPORT_URL,'_blank','noopener');}catch(e){}$('supportNote').textContent='Thank you. The support page opened in a new tab.';}
  else $('supportNote').textContent='The Founder\'s Pack opens soon on itch.io. Thank you for wanting to help the valley grow.';
});
$('btnRedeem').addEventListener('click',()=>{
  const v=$('redeemIn').value;
  if(!v.trim()){$('redeemNote').textContent='Type the code from your Founder\'s Pack email.';return;}
  if(!checkFounder(v)){$('redeemNote').textContent='That code did not match. Check for typos: codes look like FNDR-ABCD-EFGH-JKLM.';return;}
  const had=S.cosmetics.founderHat;S.cosmetics.founderHat=true;S.wearing='founder';applyWardrobe();renderValleyPane();writeSave();
  $('redeemNote').textContent=had?'This hat is already yours. Wearing it now.':'Thank you, founder. Your hat is waiting in the wardrobe, and you are wearing it.';
  if(!had){player.happy=3;sparkle(player.pos.x,player.pos.y+1.6,player.pos.z,16);SFX.moment();}
});
$('redeemIn').addEventListener('keydown',(e)=>{e.stopPropagation();if(e.key==='Enter')$('btnRedeem').click();});
$('saveCode').addEventListener('keydown',(e)=>e.stopPropagation());

/* ================================================================
   Mr. Oda, the cider-maker, who comes home when the orchard is whole
   ================================================================ */
const ODA_HOME=press.world(2.3,1.7);
const oda=(()=>{
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.visible=false;
  const M=(c)=>makeToon(c,{rim:0.32,noHeal:true});
  const mesh=(geo,mat,parent,x=0,y=0,z=0,ol=0.016)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);if(ol)addOutline(m,ol);return m;};
  mesh(new THREE.LatheGeometry([new THREE.Vector2(0.001,0),new THREE.Vector2(0.34,0),new THREE.Vector2(0.33,0.2),new THREE.Vector2(0.27,0.55),new THREE.Vector2(0.22,0.66),new THREE.Vector2(0.001,0.7)],16),M(0x5a4a3a),body,0,0.36,0);
  mesh(new THREE.BoxGeometry(0.36,0.52,0.04),M(0xd8cdb4),body,0,0.62,0.25,0.01);
  const legs=[];for(const sx of [-1,1]){const pv=new THREE.Group();pv.position.set(sx*0.11,0.42,0);body.add(pv);mesh(new THREE.CapsuleGeometry(0.075,0.22,4,8),M(0x3e3a34),pv,0,-0.18,0,0.012);mesh(new THREE.SphereGeometry(0.09,10,8).scale(1,0.7,1.35),M(0x3a2a20),pv,0,-0.37,0.03,0.012);legs.push(pv);}
  const arms=[];for(const sx of [-1,1]){const pv=new THREE.Group();pv.position.set(sx*0.26,0.95,0);body.add(pv);mesh(new THREE.CapsuleGeometry(0.06,0.26,4,8),M(0x5a4a3a),pv,0,-0.17,0,0.012);mesh(new THREE.SphereGeometry(0.06,8,6),M(0xe2b896),pv,0,-0.36,0,0.01);arms.push(pv);}
  const stick=mesh(new THREE.CylinderGeometry(0.018,0.022,1.05,6),M(0x6b4c33),arms[1],0.02,-0.55,0.12,0);stick.rotation.x=0.18;
  const head=new THREE.Group();head.position.set(0,1.27,0.03);body.add(head);
  mesh(new THREE.SphereGeometry(0.24,24,18),M(0xe6c09e),head,0,0,0,0.018);
  mesh(new THREE.SphereGeometry(0.255,20,12,Math.PI/2+0.9,Math.PI*2-1.8,0.9,1.3),M(0xe8e6e0),head,0,0,-0.01,0.012);
  mesh(new THREE.SphereGeometry(0.13,12,8).scale(1.15,0.7,0.6),M(0xeeece6),head,0,-0.16,0.13,0.01);
  for(const sx of [-1,1]){mesh(new THREE.SphereGeometry(0.022,8,6),M(0x241a12),head,sx*0.085,0.02,0.215,0);mesh(new THREE.BoxGeometry(0.08,0.022,0.02),M(0xeeece6),head,sx*0.09,0.085,0.215,0);}
  mesh(new THREE.SphereGeometry(0.03,8,6),M(0xd8a888),head,0,-0.03,0.24,0);
  mesh(new THREE.CylinderGeometry(0.235,0.25,0.09,20),M(0x4a5560),head,0,0.18,-0.01,0.012);
  const brim=mesh(new THREE.BoxGeometry(0.3,0.025,0.16),M(0x3e4852),head,0,0.15,0.2,0.008);brim.rotation.x=0.15;
  body.rotation.x=0.14;
  scene.add(root);
  return {root,body,head,arms,legs,state:'away',path:null,pi:0,met:0,lastDay:-1,face:0,phase:0,nod:0};
})();
addCollider(ODA_HOME.x,ODA_HOME.z,0.45,()=>oda.state==='home');
function odaArrive(instant){
  oda.root.visible=true;
  if(instant){oda.state='home';oda.root.position.set(ODA_HOME.x,walkH(ODA_HOME.x,ODA_HOME.z),ODA_HOME.z);oda.face=Math.atan2(ORCH.x-ODA_HOME.x,ORCH.z-ODA_HOME.z);return;}
  oda.state='walk';oda.path=[...LANE,[ODA_HOME.x,ODA_HOME.z]];oda.pi=1;oda.root.position.set(LANE[0][0],walkH(LANE[0][0],LANE[0][1]),LANE[0][1]);
  toast('Someone is walking up the lane with a stick.');
}
function odaStep(dt){
  if(oda.state!=='walk')return;
  const tgt=oda.path[oda.pi];const p=oda.root.position;const dx=tgt[0]-p.x,dz=tgt[1]-p.z,d=Math.hypot(dx,dz);
  if(d<0.3){oda.pi++;if(oda.pi>=oda.path.length){oda.state='home';hud.tasksHTML='';toast('Mr. Oda has come home to the orchard.');SFX.moment();writeSave();}return;}
  const sp=1.05*dt;p.x+=dx/d*sp;p.z+=dz/d*sp;p.y=walkH(p.x,p.z);oda.face+=angWrap(Math.atan2(dx,dz)-oda.face)*(1-Math.exp(-6*dt));oda.phase+=dt*5.5;
}
function odaPose(t,dt){
  if(!oda.root.visible)return;
  const walking=oda.state==='walk';const near=Math.hypot(player.pos.x-oda.root.position.x,player.pos.z-oda.root.position.z)<7;
  if(!walking){const want=near?Math.atan2(player.pos.x-oda.root.position.x,player.pos.z-oda.root.position.z):Math.atan2(ORCH.x-ODA_HOME.x,ORCH.z-ODA_HOME.z);oda.face+=angWrap(want-oda.face)*(1-Math.exp(-2.5*dt));}
  oda.root.rotation.y=oda.face;
  const w=walking?Math.sin(oda.phase):0;
  oda.legs[0].rotation.x=w*0.45;oda.legs[1].rotation.x=-w*0.45;oda.arms[0].rotation.x=-w*0.35;oda.arms[1].rotation.x=walking?0.1+w*0.2:0.25;
  oda.body.position.y=walking?Math.abs(w)*0.03:Math.sin(t*1.6)*0.008;
  oda.nod=Math.max(0,oda.nod-dt);oda.head.rotation.x=(talk.on?Math.sin(t*5)*0.05:0)+(oda.nod>0?Math.sin(oda.nod*8)*0.12:0)+(near&&!walking?-0.05:0.08);
  oda.head.rotation.y=walking?0:Math.sin(t*0.4)*0.15;
}
const ODA_VISITS=[
  ["Oh. So it's true. The water's back in the channel.","I'm Oda. I kept this press for forty-one autumns, until the river came up and took the lower rows.","I didn't think I'd find the trees again. My knees told me not to come up the lane. I came anyway.","Here. I wrote this before I knew who would read it."],
  ["Morning. I slept in the mill house, if that's all right. It smells the same as it did.","The young trees are doing well. Don't let them fruit too hard the first year. They wear themselves out.","This one is mostly about apples. You can skip the dull parts."],
  ["I pressed a little this morning. Only a little. The old screw still sticks in the cold.","There. Taste that. That's what this hill tastes like.","Her lamp was the only light that night. She was out on the gate, shouting over the water. And something small and pale went under the gate with the current. I told myself it was a lantern. I've told myself that for a long time.","And the barrel. I've no use for two. Put it somewhere it'll be looked at."]
];
const ODA_LETTERS=[
  "To whoever is mending the valley. I left the year the water reached the third step of the mill. I told myself it was for one season. It was eleven. The press screw sticks in the cold; tap it twice on the left and it remembers. — K. Oda",
  "My wife used to say the old variety was too sour to eat and too good to waste. We filled forty jars the last good year. I have written the measures on the back of this, in case my hands forget before my head does. P.S. I was meant to be on the hill that night, with the bell. I wasn't fast enough. I have never been fast enough since.",
  "I am not good at saying thank you, so I will write it. When I came up the lane and heard the channel running, I had to sit on the wall for a while. Keep the first jar. It is yours by rights."
];
function odaChat(){
  const L=["The ducks are louder than I remember. That's a good sign.","Mind the third step at the mill. It was loose in my father's time too.","Sit a minute, if you like. Nobody's in a hurry up here."];
  if(nightF>0.6)L.push("Go on home. The trees will still be here in the morning.");
  if(W.type==='rain')L.push("Rain's good for them. Not so good for my knees.");
  if(SEASON==='winter')L.push("We used to wrap the young trunks in straw. I'll show you, come the cold.");
  if(SEASON==='autumn')L.push("Pick from the sunny side first. They're sweeter.");
  if(SEASON==='spring')L.push("Blossom's early. Let's hope the frost forgets about us.");
  if(S.decor.length)L.push("I saw what you've done with the mill yard. It looks lived in again.");
  if(S.story&&S.story.done)L.push(...rim().oda2);
  return L[(S.gameDay+Math.floor(simTime/40))%L.length];
}
function odaVisitReady(){return oda.state==='home'&&oda.met<3&&(oda.met===0||S.gameDay>oda.lastDay);}
const talk={on:false,lines:[],i:0,onEnd:null,who:'oda'};
function talkStart(){
  if(oda.state!=='home'||talk.on)return;
  if(odaVisitReady()){const k=oda.met;talk.lines=ODA_VISITS[k].slice();talk.onEnd=()=>{
      oda.met=k+1;oda.lastDay=S.gameDay;if(k===1)after(9,()=>piece('bell'));if(k===2)after(9,()=>piece('gatelight'));
      showCatch({kicker:'A letter from Mr. Oda · kept in your journal',name:'',note:`“${ODA_LETTERS[k]}”`,dur:8000});
      if(k===2){const kp='First-press cider · from Mr. Oda';if(!S.keepsakes.includes(kp))S.keepsakes.push(kp);S.stored.barrel=(S.stored.barrel||0)+1;after(1.2,()=>toast('Mr. Oda gave you a cider barrel. Press B to place it.'));}
      else after(1.2,()=>toast('Come back tomorrow, in the valley. He likes to take things slowly.'));
      hud.tasksHTML='';writeSave();};}
  else{talk.lines=[odaChat()];talk.onEnd=null;}
  talk.who='oda';talk.on=true;talk.i=0;oda.nod=0.8;$('talk').hidden=false;$('talkWho').textContent='Mr. Oda';$('talkLine').textContent=talk.lines[0];SFX.page();dailyEvent('oda');
  if(document.pointerLockElement)document.exitPointerLock();
}
function talkNext(){talk.i++;if(talk.i>=talk.lines.length){talkEnd();return;}$('talkLine').textContent=talk.lines[talk.i];oda.nod=0.6;if(talk.who==='sachi')sachi.nod=0.6;SFX.rustle();}
function talkEnd(){if(!talk.on)return;talk.on=false;$('talk').hidden=true;const f=talk.onEnd;talk.onEnd=null;if(f)f();canvas.focus({preventScroll:true});}
$('talk').addEventListener('click',()=>talkNext());
function renderLetters(){const nm=mira.met;$('jLettersMH').hidden=nm===0;$('jLettersM').hidden=nm===0;$('jLettersM').innerHTML=MIRA_LETTERS.slice(0,nm).map(t=>`<li>${escapeHTML(t)}</li>`).join('');const n=oda.met;$('jLettersH').hidden=n===0;$('jLetters').hidden=n===0;$('jLetters').innerHTML=ODA_LETTERS.slice(0,n).concat(S.story&&S.story.done?[rim().oda]:[]).map(t=>`<li>${escapeHTML(t)}</li>`).join('');}

/* ================================================================
   Cozy decor for the mill yard: craft, place, turn, pick up again
   ================================================================ */
const DECOR=[
  {id:'bench',name:'Garden bench',cost:{wood:3}},
  {id:'lantern',name:'Stone lantern',cost:{wood:1,stone:2}},
  {id:'birdhouse',name:'Birdhouse',cost:{wood:2}},
  {id:'flowerbox',name:'Flower box',cost:{wood:2,stone:1}},
  {id:'scarecrow',name:'Scarecrow',cost:{wood:3}},
  {id:'stones',name:'Stepping stones',cost:{stone:3}},
  {id:'chime',name:'Wind chime',cost:{wood:1,stone:1}},
  {id:'barrel',name:'Cider barrel',cost:null,note:'A gift from Mr. Oda'},
  {id:'bed',name:'Quilted bed',cost:null,zone:'home',earn:'Relight the cottage hearth'},
  {id:'table',name:'Kitchen table',cost:null,zone:'home',earn:'Mend the cottage walls'},
  {id:'chair',name:'Fireside chair',cost:null,zone:'home',earn:"Hear all of Mr. Oda's letters"},
  {id:'rug',name:'Rag rug',cost:null,zone:'home',earn:'Catch 5 kinds of fish'},
  {id:'shelf',name:'Journal shelf',cost:null,zone:'home',earn:'Find 15 entries for your journal'},
  {id:'plant',name:'Potted fern',cost:null,zone:'home',earn:'Harvest 3 crops'},
  {id:'basket',name:"Mira's basket",cost:null,zone:'home',earn:"Hear all of Mira's letters"},
  {id:'reedbasket',name:'Woven reed basket',cost:null,zone:'home',earn:'Weave a basket at the Reedbeds'},
  {id:'reedmat',name:'Woven reed mat',cost:null,zone:'home',earn:'Weave a mat at the Reedbeds'},
  {id:'lamp',name:'Oil lamp',cost:null,zone:'home',earn:'Take 3 photos'},
  {id:'ciderrack',name:'Cider rack',cost:null,zone:'home',earn:'Press your first seasonal drink'}
];
for(const d of DECOR)d.zone=d.zone||'yard';
const DECOR_BY_ID=Object.fromEntries(DECOR.map(d=>[d.id,d]));
const MAX_DECOR=12;
const YARD=(()=>{const s0=polyFindRadius(INLET,42);const p=polyPoint(INLET,s0);const nx=-p.tz,nz=p.tx;return {x:p.x-nx*16,z:p.z-nz*16,r:9.5};})();
const yardRing=(()=>{const m=new THREE.Mesh(new THREE.RingGeometry(YARD.r-0.12,YARD.r+0.12,72).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,1.3,0.7),transparent:true,opacity:0.45,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  m.position.set(YARD.x,groundH(YARD.x,YARD.z)+0.25,YARD.z);m.visible=false;m.renderOrder=4;scene.add(m);return m;})();
function makeDecorModel(id,ghost){
  const g=new THREE.Group();const W2=0x8a6a4a,DK=0x5b4130,ST=0x9b968a;let swing=null;
  if(id==='bench'){boxM(1.6,0.07,0.45,W2,g,0,0.46,0,0.012);boxM(1.6,0.3,0.06,W2,g,0,0.78,-0.21,0.012,-0.12);for(const x of [-0.65,0.65])boxM(0.08,0.46,0.4,DK,g,x,0.23,0,0.01);}
  else if(id==='lantern'){cylM(0.28,0.34,0.18,ST,g,0,0.09,0,8,0.012);cylM(0.1,0.12,0.9,ST,g,0,0.63,0,8,0.012);boxM(0.5,0.08,0.5,ST,g,0,1.12,0,0.01);
    const fb=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.3,0.32),makeToon(0x3a2a1c,{emissive:0xffb35c,noHeal:true}));fb.position.y=1.31;g.add(fb);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(0.44,0.3,4),makeToon(ST,{}));roof.rotation.y=Math.PI/4;roof.position.y=1.61;roof.castShadow=true;g.add(roof);
    cylM(0.05,0.07,0.1,ST,g,0,1.8,0,6);if(!ghost){const pl=makeLightPool(0,0,2.6,g);pl.position.set(0,0.07,0);}}
  else if(id==='birdhouse'){cylM(0.05,0.06,1.6,DK,g,0,0.8,0,6,0.01);boxM(0.34,0.36,0.34,0xc9a06a,g,0,1.76,0,0.012);
    boxM(0.3,0.03,0.46,0xb4473a,g,-0.11,2.0,0,0.008,0,0,0.75);boxM(0.3,0.03,0.46,0xb4473a,g,0.11,2.0,0,0.008,0,0,-0.75);
    const hole=new THREE.Mesh(new THREE.CircleGeometry(0.055,12),makeToon(0x1e140c,{noHeal:true}));hole.position.set(0,1.8,0.172);g.add(hole);cylM(0.01,0.01,0.1,DK,g,0,1.7,0.2,4);}
  else if(id==='flowerbox'){boxM(1.0,0.32,0.36,W2,g,0,0.16,0,0.012);boxM(0.94,0.04,0.3,0x4a3a28,g,0,0.33,0);
    const cols=[0xe86a9a,0xf7d548,0xfdfbf2,0x9fc6f2,0xf29c6b];for(let i=0;i<9;i++){const x=-0.4+i*0.1;cylM(0.008,0.01,0.22,0x4f8a3a,g,x,0.44,rr(-0.06,0.06),3);
      const h=new THREE.Mesh(new THREE.IcosahedronGeometry(0.05,0),makeToon(cols[i%cols.length],{noHeal:true,rim:0.3}));h.position.set(x,0.56,rr(-0.06,0.06));h.castShadow=true;g.add(h);}}
  else if(id==='scarecrow'){swing=new THREE.Group();g.add(swing);cylM(0.05,0.06,1.9,DK,swing,0,0.95,0,6,0.01);boxM(1.3,0.06,0.06,DK,swing,0,1.45,0,0.008);
    boxM(0.55,0.6,0.25,0xb5442b,swing,0,1.2,0,0.012);for(const x of [-0.62,0.62]){const c=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.2,6),makeToon(0xd8c08a,{}));c.rotation.z=x>0?-Math.PI/2:Math.PI/2;c.position.set(x+(x>0?0.1:-0.1),1.45,0);swing.add(c);}
    const hd=new THREE.Mesh(new THREE.SphereGeometry(0.2,12,10),makeToon(0xd8c08a,{}));hd.position.y=1.75;hd.castShadow=true;swing.add(hd);addOutline(hd,0.01);
    const hat=new THREE.Mesh(new THREE.ConeGeometry(0.24,0.3,12),makeToon(0x5a4630,{}));hat.position.y=2.02;hat.castShadow=true;swing.add(hat);cylM(0.36,0.36,0.03,0x5a4630,swing,0,1.9,0,16);
    for(const x of [-0.07,0.07]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.025,6,6),makeToon(0x2a2018,{noHeal:true}));e.position.set(x,1.78,0.18);swing.add(e);}}
  else if(id==='stones'){for(const [x,z,s] of [[-0.9,0,0.36],[-0.3,0.25,0.42],[0.35,0.3,0.38],[0.95,0.1,0.33]]){const m=new THREE.Mesh(lumpy(new THREE.DodecahedronGeometry(s,1),0.08,2),makeToon(0xa09a8c,{}));m.scale.y=0.22;m.position.set(x,0.03,z);m.receiveShadow=true;g.add(m);}}
  else if(id==='chime'){cylM(0.04,0.05,1.7,DK,g,0,0.85,0,6,0.01);boxM(0.6,0.05,0.05,DK,g,0.25,1.68,0,0.006);swing=new THREE.Group();swing.position.set(0.5,1.64,0);g.add(swing);
    cylM(0.12,0.12,0.03,W2,swing,0,0,0,12);for(let i=0;i<5;i++){const a=i/5*6.28;const L=0.24+i*0.05;const r=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,L,6),makeToon(0xc8c2b0,{rim:0.5}));r.position.set(Math.cos(a)*0.08,-0.05-L/2,Math.sin(a)*0.08);swing.add(r);}}
  else if(id==='barrel'){const prof=[];for(let i=0;i<=8;i++){const t=i/8;prof.push(new THREE.Vector2(0.34+Math.sin(t*Math.PI)*0.07,t*0.9));}
    const b=new THREE.Mesh(new THREE.LatheGeometry(prof,16),makeToon(0x8a5a34,{}));b.castShadow=true;g.add(b);addOutline(b,0.012);
    for(const y of [0.12,0.45,0.78]){const band=new THREE.Mesh(new THREE.TorusGeometry(0.37+Math.sin(y/0.9*Math.PI)*0.07,0.018,6,20).rotateX(Math.PI/2),makeToon(0x3a3530,{}));band.position.y=y;g.add(band);}
    const top=new THREE.Mesh(new THREE.CircleGeometry(0.34,16).rotateX(-Math.PI/2),makeToon(0x7a5030,{}));top.position.y=0.9;g.add(top);cylM(0.025,0.025,0.12,0x5b4130,g,0,0.3,0.42,6).rotation.x=Math.PI/2;}
  else if(id==='bed'){boxM(1.0,0.32,2.0,0x8a6a4a,g,0,0.16,0,0.012);boxM(0.92,0.14,1.92,0xf0e6d0,g,0,0.39,0,0.008);boxM(0.96,0.08,1.3,0xb5442b,g,0,0.49,0.3,0.008);
    for(let k=0;k<4;k++)boxM(0.24,0.085,0.3,[0xe2b13c,0x4f7fa8,0x58803a,0xf2e6c9][k],g,-0.36+k*0.24,0.5,0.3+((k%2)?0.3:-0.3),0);boxM(0.6,0.12,0.32,0xfbf7ee,g,0,0.52,-0.72,0.008);boxM(1.0,0.75,0.08,0x7a5a3c,g,0,0.5,-1.0,0.012);}
  else if(id==='table'){boxM(1.4,0.08,0.8,0x8a6a4a,g,0,0.74,0,0.012);for(const [x,z] of [[-0.6,-0.32],[0.6,-0.32],[-0.6,0.32],[0.6,0.32]])boxM(0.08,0.72,0.08,0x5b4130,g,x,0.36,z);
    cylM(0.08,0.1,0.22,0xc8a46a,g,0.3,0.89,0.1,10);cylM(0.12,0.12,0.03,0xf2e6c9,g,-0.3,0.79,-0.1,14);}
  else if(id==='chair'){boxM(0.55,0.08,0.55,0x7a5a3c,g,0,0.45,0,0.01);boxM(0.5,0.06,0.5,0xb5442b,g,0,0.51,0,0);boxM(0.55,0.7,0.07,0x7a5a3c,g,0,0.82,-0.26,0.01,-0.12);
    for(const [x,z] of [[-0.23,-0.23],[0.23,-0.23],[-0.23,0.23],[0.23,0.23]])boxM(0.06,0.45,0.06,0x5b4130,g,x,0.22,z);}
  else if(id==='rug'){const r1=new THREE.Mesh(new THREE.CircleGeometry(0.9,28).rotateX(-Math.PI/2),makeToon(0xb5442b,{}));r1.scale.set(1.4,1,1);r1.position.y=0.015;g.add(r1);
    const r2=new THREE.Mesh(new THREE.CircleGeometry(0.65,28).rotateX(-Math.PI/2),makeToon(0xe2b13c,{}));r2.scale.set(1.4,1,1);r2.position.y=0.02;g.add(r2);
    const r3=new THREE.Mesh(new THREE.CircleGeometry(0.4,28).rotateX(-Math.PI/2),makeToon(0x4f7fa8,{}));r3.scale.set(1.4,1,1);r3.position.y=0.025;g.add(r3);}
  else if(id==='shelf'){boxM(1.2,1.6,0.08,0x7a5a3c,g,0,0.8,-0.15,0.01);for(const x of [-0.58,0.58])boxM(0.06,1.6,0.34,0x5b4130,g,x,0.8,0);for(const y of [0.05,0.55,1.05,1.55])boxM(1.2,0.05,0.34,0x5b4130,g,0,y,0);
    const bc=[0xb5442b,0x4f7fa8,0x58803a,0xe2b13c,0x8a5a34];for(const y of [0.08,0.58,1.08])for(let k=0;k<6;k++)boxM(0.1,0.32+((k*7)%3)*0.05,0.24,bc[(k+y*10|0)%5],g,-0.45+k*0.17,y+0.2,0);}
  else if(id==='plant'){cylM(0.2,0.15,0.32,0xc0643a,g,0,0.16,0,12,0.01);const f=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.34,1),0.25,3),makeToon(0x4f9a3a,{rim:0.3}));f.position.y=0.55;f.scale.y=0.9;f.castShadow=true;g.add(f);}
  else if(id==='reedbasket'){for(let k=0;k<5;k++){const b=new THREE.Mesh(new THREE.CylinderGeometry(0.27+k*0.02,0.25+k*0.02,0.07,14,1,true),makeToon(k%2?0xb89a5a:0xcfb06c,{side:THREE.DoubleSide}));b.position.y=0.04+k*0.065;b.castShadow=true;g.add(b);}
    const bt=new THREE.Mesh(new THREE.CircleGeometry(0.25,14).rotateX(-Math.PI/2),makeToon(0xb89a5a,{}));bt.position.y=0.01;g.add(bt);
    const h=new THREE.Mesh(new THREE.TorusGeometry(0.3,0.022,6,16,Math.PI),makeToon(0xa8884a,{}));h.position.y=0.34;g.add(h);}
  else if(id==='reedmat'){const W2=1.5,D2=0.9;for(let k=0;k<9;k++){const st=new THREE.Mesh(new THREE.BoxGeometry(W2,0.025,D2/9-0.008),makeToon(k%2?0xc2a462:0xd6ba78,{}));st.position.set(0,0.015,-D2/2+(k+0.5)*D2/9);st.receiveShadow=true;g.add(st);}
    for(const x of [-W2/2,W2/2]){const e=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.04,D2+0.04),makeToon(0x8a6a3a,{}));e.position.set(x,0.02,0);g.add(e);}}
  else if(id==='basket'){const b=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.24,0.3,16,1,true),makeToon(0xc8a05a,{side:THREE.DoubleSide}));b.position.y=0.15;b.castShadow=true;g.add(b);
    const h=new THREE.Mesh(new THREE.TorusGeometry(0.28,0.025,6,16,Math.PI),makeToon(0xb08a4a,{}));h.position.y=0.3;g.add(h);for(let k=0;k<3;k++){const a=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),appleMat);a.position.set((k-1)*0.13,0.3,0);g.add(a);}}
  else if(id==='lamp'){cylM(0.18,0.22,0.06,0x5b4130,g,0,0.03,0,10);cylM(0.03,0.03,1.2,0x3a3530,g,0,0.63,0,6);const gl=new THREE.Mesh(new THREE.SphereGeometry(0.14,12,10),makeToon(0x3a2a1c,{emissive:0xffb35c,noHeal:true}));gl.position.y=1.3;g.add(gl);
    if(!ghost){const pl=makeLightPool(0,0,1.8,g);pl.position.set(0,0.05,0);}}
  else if(id==='ciderrack'){boxM(1.0,0.9,0.4,0x7a5a3c,g,0,0.45,0,0.01);for(let r=0;r<2;r++)for(let k=0;k<4;k++){const b=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.3,8).rotateX(Math.PI/2),makeToon([0x5a8a4a,0xb87a2a,0x8a3a4a,0xd8b84a][k],{rim:0.5}));b.position.set(-0.33+k*0.22,0.3+r*0.36,0.12);g.add(b);}}
  if(ghost){g.traverse(o=>{if(o.isMesh){o.material=decorGhostMat;o.castShadow=false;}});}
  return {g,swing};
}
const decorGhostMat=new THREE.MeshBasicMaterial({color:0x8fe08a,transparent:true,opacity:0.45,depthWrite:false});
const decor={on:false,sel:null,ry:0,ghost:null,valid:false,why:''};
const placed=[];
function layoutDecor(){for(const p of placed)scene.remove(p.g);placed.length=0;
  for(const e of S.decor){const m=makeDecorModel(e.id,false);if(Q.tier==='low')bakeStatic(m.g,o=>o===m.swing);m.g.position.set(e.x,DECOR_BY_ID[e.id].zone==='home'?HOME_H+0.26:groundH(e.x,e.z),e.z);m.g.rotation.y=e.ry;scene.add(m.g);placed.push({...m,e,ph:rnd()*6});}}
const costText=(c)=>c?Object.entries(c).map(([k,v])=>`${v} ${k==='wood'?'wood':'stone'}`).join(' · '):'';
const canAfford=(c)=>!!c&&Object.entries(c).every(([k,v])=>(S.inv[k]||0)>=v);
function zoneCount(z){return S.decor.filter(e=>DECOR_BY_ID[e.id].zone===z).length;}
function renderDecorUI(){
  const row=(d)=>{const kept=S.stored[d.id]||0;const full=zoneCount(d.zone)>=MAX_DECOR;
    if(d.zone==='home'&&!kept&&!S.decor.some(e=>e.id===d.id))return `<li><span style="opacity:.6">${d.name}<small>Earned by: ${d.earn}</small></span><button class="pbtn" type="button" disabled>Not yet</button></li>`;
    if(d.cost===null&&d.zone==='yard'&&!kept&&!S.decor.some(e=>e.id===d.id))return '';
    const ok=!full&&(kept>0||canAfford(d.cost))&&(d.zone!=='home'||hStage()>=3);
    return `<li><span>${d.name}<small>${kept?`${kept} kept · free to place`:d.cost?costText(d.cost):d.zone==='home'?'Placed':d.note}</small></span><button class="pbtn" type="button" data-dec="${d.id}" aria-pressed="${decor.sel===d.id}" ${ok?'':'disabled'}>${decor.sel===d.id?'Chosen':kept?'Place':'Make'}</button></li>`;};
  $('decorList').innerHTML='<h3>Mill yard</h3>'+DECOR.filter(d=>d.zone==='yard').map(row).join('')+'<h3>Cottage furniture</h3>'+(hStage()<3?'<li><small>Restore the cottage (roof, walls, hearth) to furnish it.</small></li>':'')+DECOR.filter(d=>d.zone==='home').map(row).join('');
  const z=decor.sel?DECOR_BY_ID[decor.sel].zone:null;const inHome=homeInside();const dYard=Math.hypot(player.pos.x-YARD.x,player.pos.z-YARD.z);
  $('decorNote').textContent=z==='home'&&!inHome?'Furniture goes inside the cottage. Step through the door.':z==='yard'&&dYard>YARD.r+4?'Decorations go in the mill yard by the old mill. Follow the marker.':decor.sel?(z==='home'?'Furniture snaps to a half-metre grid. R turns, F places.':'Walk to the spot, R to turn, F to place. The outline turns green where it fits.'):'Choose something to make or place. Hold E on a placed thing while this panel is open to pick it up.';
  $('decorPlace').hidden=$('decorTurn').hidden=!decor.sel;
}
$('decorList').addEventListener('click',(e)=>{const b=e.target.closest('[data-dec]');if(!b||b.disabled)return;decorChoose(b.dataset.dec);canvas.focus({preventScroll:true});});
$('decorPlace').addEventListener('click',()=>{decorPlace();canvas.focus({preventScroll:true});});
$('decorTurn').addEventListener('click',()=>{decorTurn();canvas.focus({preventScroll:true});});
$('decorClose').addEventListener('click',()=>decorClose());
$('openDecor').addEventListener('click',()=>decorOpen());
function decorOpen(){if(mode!=='play'||photo.on||talk.on||cine)return;if(journalOpen)setJournal(false);decor.on=true;$('decorUI').hidden=false;yardRing.visible=true;renderDecorUI();SFX.page();}
function decorClose(){decor.on=false;decorChoose(null);$('decorUI').hidden=true;yardRing.visible=false;}
function decorChoose(id){if(decor.ghost){scene.remove(decor.ghost);decor.ghost=null;}decor.sel=id;if(id){decor.ghost=makeDecorModel(id,true).g;scene.add(decor.ghost);}if(decor.on)renderDecorUI();}
function decorTurn(){decor.ry+=decor.sel&&DECOR_BY_ID[decor.sel].zone==='home'?Math.PI/2:Math.PI/4;SFX.rustle();}
function canPlaceAt(x,z,zone='yard'){
  if(zoneCount(zone)>=MAX_DECOR)return zone==='home'?'The cottage is full':'The yard is full';
  if(zone==='home'){if(hStage()<3)return 'Restore the cottage first';const l=homeL(x,z);if(Math.abs(l.x)>2.75||Math.abs(l.z)>2.05)return 'Only inside the cottage';
    if(l.z<-1.5&&Math.abs(l.x)<0.9)return 'Keep the doorway clear';if(l.z>1.3&&Math.abs(l.x)<1.2)return 'Too close to the hearth';
    if(S.decor.some(d=>DECOR_BY_ID[d.id].zone==='home'&&Math.hypot(d.x-x,d.z-z)<0.95))return 'Too close to something else';return '';}
  if(Math.hypot(x-YARD.x,z-YARD.z)>YARD.r)return 'Only inside the mill yard';
  if(Math.hypot(x-mill.x,z-mill.z)<4.6)return 'Too close to the mill';
  if(groundH(x,z)<levelCur+0.15||polyInfo(x,z,INLET).d<2.6)return 'Too wet here';
  if(slopeAt(x,z)>0.7)return 'Too steep here';
  if(S.decor.some(d=>Math.hypot(d.x-x,d.z-z)<1.3))return 'Too close to something else';
  return '';
}
function decorStep(){
  if(!decor.on||!decor.sel||!decor.ghost)return;
  const zone=DECOR_BY_ID[decor.sel].zone;const f=player.face;let x,z;
  if(zone==='home'){const w0={x:player.pos.x+Math.sin(f)*1.4,z:player.pos.z+Math.cos(f)*1.4};const l=homeL(w0.x,w0.z);const w=homeW(Math.round(l.x*2)/2,Math.round(l.z*2)/2);x=w.x;z=w.z;
    decor.ghost.position.set(x,HOME_H+0.26,z);decor.ghost.rotation.y=HOME.ry+Math.round((decor.ry-HOME.ry)/(Math.PI/2))*(Math.PI/2);}
  else{x=Math.round((player.pos.x+Math.sin(f)*2.2)*4)/4;z=Math.round((player.pos.z+Math.cos(f)*2.2)*4)/4;decor.ghost.position.set(x,groundH(x,z),z);decor.ghost.rotation.y=decor.ry;}
  decor.why=canPlaceAt(x,z,zone);decor.valid=!decor.why;decorGhostMat.color.set(decor.valid?0x8fe08a:0xe08a7a);
}
function decorPlace(){
  if(!decor.on||!decor.sel)return;decorStep();
  if(!decor.valid){toast(decor.why||'That does not fit there');return;}
  const d=DECOR_BY_ID[decor.sel];const kept=S.stored[d.id]||0;
  if(kept>0)S.stored[d.id]=kept-1;else if(canAfford(d.cost)){for(const [k,v] of Object.entries(d.cost))S.inv[k]-=v;}else{toast('Not enough materials');return;}
  const p=decor.ghost.position;S.decor.push({id:d.id,x:p.x,z:p.z,ry:decor.ghost.rotation.y});layoutDecor();
  sparkle(p.x,p.y+0.5,p.z,12);SFX.plant();SFX.get();toast(`${d.name} placed`);dailyEvent('decor');writeSave();decorChoose(null);
}
function pickUpDecor(i){const e=S.decor[i];if(!e)return;S.decor.splice(i,1);S.stored[e.id]=(S.stored[e.id]||0)+1;layoutDecor();SFX.rustle();toast(`${DECOR_BY_ID[e.id].name} picked up · kept for later`);if(decor.on)renderDecorUI();writeSave();}
const WORLD_LANTERNS=[];
function placeWorldLanterns(){
  const spots=[];for(const b of BRIDGES)for(const sd of [-1,1])spots.push([b.x+b.nx*sd*5.9+b.tx*1.6,b.z+b.nz*sd*5.9+b.tz*1.6]);
  spots.push([SIGN.x+1.6,SIGN.z+1.2],[LANE[0][0]+0.5,LANE[0][1]+2.4]);
  for(const [x,z] of spots){const m=makeDecorModel('lantern',false);STATIC_GROUPS.push(m.g);m.g.position.set(x,groundH(x,z),z);m.g.rotation.y=rnd()*6.28;scene.add(m.g);addCollider(x,z,0.32);WORLD_LANTERNS.push({x,z});}
}
placeWorldLanterns();
function decorVisuals(t){
  for(const p of placed){if(p.swing){const wv=G.uWind.value;if(p.e.id==='chime'){p.swing.rotation.z=Math.sin(t*1.9+p.ph)*0.12*wv;p.swing.rotation.x=Math.cos(t*1.5+p.ph)*0.08*wv;
      if(mode==='play'&&rnd()<0.004*wv&&Math.hypot(player.pos.x-p.e.x,player.pos.z-p.e.z)<14&&AU.ctx)chime([81,83,86,88,90][(rnd()*5)|0],AU.ctx.currentTime,0.025);}
    else p.swing.rotation.z=Math.sin(t*0.8+p.ph)*0.025*wv;}}
}

/* ================================================================
   v5 · Home: the old mill cottage, restored in three steps (roof, walls, hearth)
   ================================================================ */
const HX=3.25,HZ=2.55,HWH=2.5;
function homeInside(x=player.pos.x,z=player.pos.z){const l=homeL(x,z);return Math.abs(l.x)<3.0&&Math.abs(l.z)<2.35;}
const home=(()=>{
  const g=new THREE.Group();g.position.set(HOME.x,HOME_H,HOME.z);g.rotation.y=HOME.ry;scene.add(g);
  const ST=0x9a917f,WD=0x5b4130,PL=0xeadcc0;
  boxM(7.0,0.3,5.6,0x8f8574,g,0,0.06,0,0.02);
  boxM(6.4,0.06,5.0,0x9a7a56,g,0,0.23,0);
  const ruin=new THREE.Group(),roofG=new THREE.Group(),walls=new THREE.Group(),hearth=new THREE.Group(),hearthRuin=new THREE.Group();g.add(ruin,roofG,walls,hearth,hearthRuin);
  const sr=seededRnd(808);
  const ruinWall=(x0,z0,x1,z1,gapA,gapB)=>{const L=Math.hypot(x1-x0,z1-z0),n=Math.round(L/0.9);for(let i=0;i<n;i++){const t=(i+0.5)/n;const u=t*L-L/2;if(u>gapA&&u<gapB)continue;if(sr()<0.18)continue;
    const h=0.4+sr()*1.4;const x=lerp(x0,x1,t),z=lerp(z0,z1,t);const along=Math.abs(x1-x0)>0.1;boxM(along?0.9:0.32,h,along?0.32:0.9,[0x958b78,0x8a8070,0xa39985][(sr()*3)|0],ruin,x,0.25+h/2,z,0.012,0,0,(sr()-0.5)*0.06);}};
  /* v7: the ruin as coursed fieldstone with mossy tops, ivy, charred timbers and slumped thatch */
  const STC=[0x8f8778,0x9d9483,0x847c6e,0xa69d8a],MOSS=[0x5f7a3a,0x6d8a40],IVY=[0x3f6a32,0x4f7d3a,0x5a8a3e],THC=[0xb08a52,0x9c7a48,0xc29b5e];
  const leafAt=(par,x,y,z,along,c)=>boxM(along?0.17:0.05,0.15,along?0.05:0.17,c,par,x,y,z,0,(sr()-0.5)*0.6,0,(sr()-0.5)*0.9);
  const stoneWall=(x0,z0,x1,z1,gapA,gapB,hMin,hMax,ph)=>{const L=Math.hypot(x1-x0,z1-z0),dx=(x1-x0)/L,dz=(z1-z0)/L,along=Math.abs(dx)>0.5;
    let nx=-dz,nz=dx;if(((x0+x1)/2)*nx+((z0+z1)/2)*nz<0){nx=-nx;nz=-nz;}
    const ROW=0.27,topAt=u=>hMin+(hMax-hMin)*clamp(0.5+0.5*Math.sin(u*1.3+ph)*Math.cos(u*0.55+ph*2)+0.25*Math.sin(u*3.7+ph),0,1);
    const P=(u,o)=>({x:(x0+x1)/2+dx*u+nx*o,z:(z0+z1)/2+dz*u+nz*o});
    for(let r=0;r<9;r++){let u=-L/2+(r%2?0.28:0);const y=0.25+ROW*r+ROW/2;
      while(u<L/2-0.1){const len=0.4+sr()*0.36;const lw=Math.min(len,L/2-u)-0.04;const uc=u+lw/2;u+=len;
        if(lw<0.14||(uc>gapA&&uc<gapB)||y+ROW/2>0.25+topAt(uc))continue;
        const c=P(uc,(sr()-0.5)*0.05);const dep=0.34+sr()*0.06;
        boxM(along?lw:dep,ROW-0.035,along?dep:lw,STC[(sr()*4)|0],ruin,c.x,y,c.z,0,0,(sr()-0.5)*0.05,0);
        if(y+ROW*1.5>0.25+topAt(uc)&&sr()<0.75)boxM(along?lw*0.92:0.44,0.07,along?0.44:lw*0.92,MOSS[(sr()*2)|0],ruin,c.x,y+ROW/2+0.025,c.z,0,0,(sr()-0.5)*0.1,0);
        else if(r<2&&sr()<0.18){const m=P(uc,0.2);boxM(along?lw*0.7:0.06,0.12,along?0.06:lw*0.7,MOSS[1],ruin,m.x,y,m.z);}}}
    for(let k=0;k<3;k++){if(sr()<0.3)continue;let uc=(sr()-0.5)*L*0.8;if(uc>gapA-0.4&&uc<gapB+0.4)continue;const top=0.25+topAt(uc);
      for(let y=0.35;y<top+0.05;y+=0.12){uc+=(sr()-0.5)*0.12;for(let j=0;j<2;j++){const q=P(uc+(sr()-0.5)*0.42,0.2+sr()*0.04);leafAt(ruin,q.x,y+(sr()-0.5)*0.08,q.z,along,IVY[(sr()*3)|0]);}}
      for(let j=0;j<4;j++){const q=P(uc+(sr()-0.5)*0.5,0);boxM(0.2,0.08,0.2,IVY[(sr()*3)|0],ruin,q.x,top+0.06,q.z,0,(sr()-0.5)*0.5,sr()*3,0);}}
  };
  stoneWall(-HX,-HZ,HX,-HZ,-0.75,0.75,0.6,2.2,0.4);stoneWall(-HX,HZ,HX,HZ,99,99,1.0,2.4,2.1);stoneWall(-HX,-HZ,-HX,HZ,99,99,0.45,2.0,4.3);stoneWall(HX,-HZ,HX,HZ,99,99,0.3,1.6,1.2);
  for(const [x,z] of [[-HX,-HZ],[HX,-HZ],[-HX,HZ],[HX,HZ]]){const qh=0.9+sr()*1.3;for(let y=0.38;y<qh;y+=0.27)boxM(0.44,0.24,0.44,STC[(sr()*4)|0],ruin,x,y,z,0,0,(sr()-0.5)*0.2,0);}
  /* a corner of roof still hanging on: two rafters, a purlin and a sagging hank of thatch */
  boxM(0.16,3.0,0.16,0x3a2e24,ruin,-2.2,1.85,1.7,0,0.25,0,0.62);boxM(0.16,3.0,0.16,0x3a2e24,ruin,-2.2,1.85,0.2,0,-0.1,0,0.62);boxM(0.14,0.14,2.2,0x3a2e24,ruin,-1.6,2.55,0.95);
  for(let k=0;k<4;k++)boxM(0.9,0.14,1.9-k*0.25,THC[k%3],ruin,-2.05+k*0.33,2.05+k*0.32,0.95+(sr()-0.5)*0.2,0,(sr()-0.5)*0.12,0,0.62+(sr()-0.5)*0.15);
  for(let k=0;k<7;k++){const a=sr()*6.28,r=0.6+sr()*2.4;boxM(0.7+sr()*0.6,0.1,0.5+sr()*0.4,THC[(sr()*3)|0],ruin,Math.cos(a)*r*1.1,0.3+sr()*0.08,Math.sin(a)*r*0.8,0,(sr()-0.5)*0.4,sr()*3,(sr()-0.5)*0.4);}
  boxM(2.0,0.2,0.22,0x2f2620,ruin,0.3,0.42,-HZ-0.7,0,0.15,0.4,0.12);boxM(0.2,0.2,2.4,0x3a2e24,ruin,1.4,0.38,0.4,0,0.1,0.25,0);
  for(let k=0;k<10;k++){const a=sr()*6.28,r=HX+0.3+sr()*0.6;boxM(0.24,0.1+sr()*0.18,0.24,MOSS[(sr()*2)|0],ruin,Math.cos(a)*r,0.12,Math.sin(a)*r*0.8,0,0,sr()*3,0);}
  for(let i=0;i<9;i++)boxM(0.3+sr()*0.4,0.2+sr()*0.2,0.3+sr()*0.4,0x8a8070,ruin,(sr()-0.5)*5.5,0.32,(sr()-0.5)*4.2,0,sr()*3,sr()*3,sr()*3);
  boxM(0.18,3.4,0.18,0x2f2620,ruin,-1.2,1.0,0.6,0,0.2,0,1.0);boxM(0.18,3.0,0.18,0x2f2620,ruin,1.5,0.7,-0.8,0,-0.4,0.6,1.2);
  for(const [x,z] of [[-HX,-HZ],[HX,-HZ],[-HX,HZ],[HX,HZ]])boxM(0.24,HWH+0.1,0.24,WD,roofG,x,0.25+HWH/2,z,0.015);
  boxM(6.8,0.2,0.2,WD,roofG,0,HWH+0.28,-HZ,0.01);boxM(6.8,0.2,0.2,WD,roofG,0,HWH+0.28,HZ,0.01);
  gableRoof(6.6,5.2,2.1,0xb08a52,roofG,0,HWH+0.3,0,0.03);
  boxM(0.3,0.25,6.2,0x8a6a3e,roofG,0,HWH+2.35,0,0.01);
  { const ang=Math.atan2(2.1,3.65),Ls=Math.hypot(2.1,3.65);
    for(const sd of [-1,1])for(let k=0;k<6;k++){const t=(k+0.5)/6;const x=sd*3.65*(1-t),y=HWH+0.3+2.1*t+0.12;
      boxM(Ls/6+0.45,0.22,6.05-(k%2)*0.14,THC[(k+(sd>0?1:0))%3],roofG,x,y-0.04,0,0,0,0,sd*ang);}
    for(const sd of [-1,1])boxM(0.5,0.3,6.2,0x8a6a3e,roofG,sd*3.55,HWH+0.2,0,0,0,0,sd*ang);
    boxM(0.5,0.34,6.3,0x6f5432,roofG,0,HWH+2.42,0,0.01);for(let k=-2;k<=2;k++)boxM(0.62,0.12,0.12,0x4a3a2a,roofG,0,HWH+2.5,k*1.35,0,0,0,Math.PI/4); }
  const wallPanel=(w,h,x,y,z,along)=>boxM(along?w:0.3,h,along?0.3:w,PL,walls,x,y,z,0.012);
  wallPanel(2.65,HWH,-1.92,0.25+HWH/2,-HZ,true);wallPanel(2.65,HWH,1.92,0.25+HWH/2,-HZ,true);wallPanel(1.3,0.55,0,0.25+HWH-0.27,-HZ,true);
  wallPanel(6.5,HWH,0,0.25+HWH/2,HZ,true);wallPanel(5.1,HWH,-HX,0.25+HWH/2,0,false);wallPanel(5.1,HWH,HX,0.25+HWH/2,0,false);
  for(const sz of [-1,1]){boxM(6.7,0.16,0.34,WD,walls,0,0.36,sz*HZ,0.008);boxM(6.7,0.16,0.34,WD,walls,0,HWH+0.18,sz*HZ,0.008);}
  for(const sx of [-1,1]){boxM(0.34,0.16,5.3,WD,walls,sx*HX,0.36,0,0.008);boxM(0.34,0.16,5.3,WD,walls,sx*HX,HWH+0.18,0,0.008);}
  for(const [x,a] of [[-2.2,0.7],[2.2,-0.7]])boxM(0.12,2.0,0.34,WD,walls,x,1.45,HZ,0,0,0,a);
  const glass=makeToon(0x58697a,{emissive:0xffb35c,noHeal:true,tag:'millglass'});
  for(const [x,z,rot] of [[HX,0.6,true],[-HX,-0.6,true],[1.6,HZ,false]]){const w=new THREE.Mesh(new THREE.BoxGeometry(rot?0.38:0.9,0.8,rot?0.9:0.38),glass);w.position.set(x,1.55,z);walls.add(w);
    boxM(rot?0.4:1.04,0.08,rot?1.04:0.4,0xd9c39a,walls,x,1.98,z);boxM(rot?0.42:1.1,0.08,rot?1.1:0.42,0xd9c39a,walls,x,1.12,z);}
  { const DK=0x4a3426;
    for(const [x,z,al] of [[-3.0,-HZ,1],[-0.9,-HZ,1],[0.65,-HZ,1],[3.0,-HZ,1],[-3.0,HZ,1],[-0.6,HZ,1],[0.6,HZ,1],[3.0,HZ,1],[-HX,-2.3,0],[-HX,0.4,0],[-HX,2.3,0],[HX,-2.3,0],[HX,-0.3,0],[HX,2.3,0]])
      boxM(al?0.2:0.36,HWH-0.1,al?0.36:0.2,DK,walls,x,0.25+HWH/2,z,0);
    for(let x=-HX;x<=HX+0.01;x+=0.55)for(const sz of [-1,1])boxM(0.5,0.3,0.42,STC[(sr()*4)|0],walls,x+(sr()-0.5)*0.05,0.2,sz*(HZ+0.04),0);
    for(let z=-HZ+0.3;z<=HZ-0.2;z+=0.55)for(const sx of [-1,1])boxM(0.42,0.3,0.5,STC[(sr()*4)|0],walls,sx*(HX+0.04),0.2,z,0);
    for(let x=-3.3;x<=3.31;x+=0.36)boxM(0.34,0.08,1.25,x%0.72<0.36?0x9a7650:0x8f6c48,walls,x,0.28,-HZ-0.85,0);
    for(const x of [-3.2,3.2,-1.4])cylM(0.07,0.08,0.4,DK,walls,x,0.15,-HZ-1.4,6);
    for(const x of [-3.2,3.2])cylM(0.08,0.09,2.3,DK,walls,x,1.55,-HZ-1.38,6);
    boxM(7.2,0.1,1.7,0x8a6a3e,walls,0,2.62,-HZ-0.9,0,-0.28,0,0);boxM(7.2,0.14,0.14,DK,walls,0,2.48,-HZ-1.4,0);
    const flowers=[0xe8708a,0xf2b84b,0xffffff,0xb28ae0];
    const winDeco=(x,z,rot)=>{const nx=rot?Math.sign(x):0,nz=rot?0:Math.sign(z);const ox=x+nx*0.26,oz=z+nz*0.26;
      for(const sd of [-1,1])boxM(rot?0.06:0.42,0.86,rot?0.42:0.06,0x6f8a8c,walls,ox+(rot?0:sd*0.72),1.55,oz+(rot?sd*0.72:0),0,0,rot?sd*0.5:-sd*0.5*nz,0);
      boxM(rot?0.3:1.0,0.2,rot?1.0:0.3,0x7a5030,walls,ox+nx*0.06,1.03,oz+nz*0.06,0);
      for(let k=0;k<6;k++){const u=(k-2.5)*0.15;boxM(0.12,0.12,0.12,flowers[(sr()*4)|0],walls,ox+nx*0.08+(rot?0:u),1.2,oz+nz*0.08+(rot?u:0),0);}
      addGlow(walls,ox+nx*0.15,1.55,oz+nz*0.15,1.7,0xffc070);const pl=makeLightPool(0,0,1.7,walls);pl.position.set(x+nx*1.5,0.3,z+nz*1.5);};
    winDeco(HX,0.6,true);winDeco(-HX,-0.6,true);winDeco(1.6,HZ,false);
    { const w=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.8,0.36),glass);w.position.set(1.95,1.55,-HZ);walls.add(w);boxM(1.04,0.08,0.4,0xd9c39a,walls,1.95,1.98,-HZ);boxM(1.1,0.08,0.42,0xd9c39a,walls,1.95,1.12,-HZ);winDeco(1.95,-HZ,false); }
    for(let k=0;k<5;k++)for(let j=0;j<4-(k>2?1:0);j++){const l=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,1.1,7).rotateX(Math.PI/2),makeToon(j%2?0x8a6440:0x9c7550,{}));l.position.set(-HX-0.55-j*0.25,0.4+k*0.23,1.0+(k%2)*0.12);l.castShadow=true;walls.add(l);}
  }
  for(let k=0;k<9;k++)boxM(0.07,0.012,0.012,0x2a2420,walls,-0.86,0.25+0.85+k*0.13,-HZ-0.17,0);boxM(0.07,0.012,0.012,0x2a2420,walls,-0.74,0.25+0.58,-HZ-0.17,0);
  const door=new THREE.Group();door.position.set(-0.6,0.25,-HZ);walls.add(door);boxM(1.1,2.0,0.08,0x7a5030,door,0.55,1.0,0,0.01);door.rotation.y=-1.25;
  boxM(1.7,1.1,0.7,0x8f8574,hearth,0,0.8,HZ-0.5,0.015);
  const fireBox=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.55,0.12),makeToon(0x1e140c,{noHeal:true}));fireBox.position.set(0,0.62,HZ-0.86);hearth.add(fireBox);
  boxM(1.9,0.14,0.85,0x7d7568,hearth,0,1.4,HZ-0.5,0.01);
  { const H2=0x2a2420;boxM(0.04,0.5,0.04,H2,hearth,0.32,1.18,HZ-0.78);boxM(0.04,0.3,0.04,H2,hearth,0.32,1.48,HZ-0.78,0,0,0,-0.6);boxM(0.14,0.035,0.03,H2,hearth,0.4,1.58,HZ-0.78,0,0,0,0.15);boxM(0.18,0.08,0.06,H2,hearth,0.25,1.05,HZ-0.78);boxM(0.025,0.25,0.025,H2,hearth,0.05,0.85,HZ-0.78,0,0,0,0.4); }
  boxM(0.9,4.6,0.8,0x8a8070,hearth,0,2.6,HZ+0.42,0.02);
  const fireMat=new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.1,0.35),transparent:true,opacity:0.95,blending:THREE.AdditiveBlending,depthWrite:false});
  const fire=new THREE.Group();fire.position.set(0,0.42,HZ-0.78);hearth.add(fire);
  for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.ConeGeometry(0.12+i*0.02,0.36-i*0.06,8),fireMat);c.position.set((i-1)*0.15,0.18,0);fire.add(c);}
  const hl=new THREE.PointLight(0xff9a48,0,9,2);hl.position.set(0,1.0,HZ-1.3);hearth.add(hl);lampLights.push(hl);
  const pool=makeLightPool(0,0,2.2,hearth);pool.position.set(0,0.3,HZ-1.6);
  for(let i=0;i<6;i++)boxM(0.3+sr()*0.3,0.2+sr()*0.2,0.3+sr()*0.3,0x7d7568,hearthRuin,(sr()-0.5)*1.4,0.35,HZ-0.6+(sr()-0.5)*0.6,0,sr()*3,sr()*3,sr()*3);
  const col=(lx,lz)=>{const w=homeW(lx,lz);addCollider(w.x,w.z,0.28);};
  for(let x=-HX;x<=HX+0.01;x+=0.42){col(x,HZ);if(Math.abs(x)>0.72)col(x,-HZ);}
  for(let z=-HZ;z<=HZ+0.01;z+=0.42){col(-HX,z);col(HX,z);}
  const door0=homeW(0,-HZ-1.5);
  return {g,ruin,roofG,walls,hearth,hearthRuin,fire,light:hl,ix:door0.x,iz:door0.z,smokeT:0,chimney:homeW(0,HZ+0.42)};
})();
function hStage(){return S.home|0;}
function setHomeStage(n){S.home=n;home.ruin.visible=n<2;home.roofG.visible=n>=1;home.walls.visible=n>=2;home.hearth.visible=n>=3;home.hearthRuin.visible=n<3;}
const HOME_STEPS=[null,
  {t:'Re-roof the old cottage',cost:{wood:8},card:{k:'Home · the mill cottage',t:'A roof again',s:'Rain on thatch instead of rain on rubble. Already it sounds like a house.'}},
  {t:'Mend the cottage walls',cost:{wood:2,stone:6},card:{k:'Home · the mill cottage',t:'Four walls and a door',s:'The light through the new windows lands on the floor in squares.'}},
  {t:'Relight the hearth',cost:{stone:5},card:{k:'Home · the mill cottage',t:'The hearth is lit',s:'Someone lives here now. Press B inside to arrange your things.'}}];
function showCardBrief(c){const card=$('card');$('cardKicker').textContent=c.k;$('cardTitle').textContent=c.t;$('cardSub').textContent=c.s;card.classList.remove('out');card.hidden=false;
  setTimeout(()=>{card.classList.add('out');setTimeout(()=>{card.hidden=true;card.classList.remove('out');},900);},4600);}
let homeBusy=false;
function buildHomeStep(){
  const n=hStage()+1;const st=HOME_STEPS[n];if(!st||homeBusy)return;homeBusy=true;
  for(const [k,v] of Object.entries(st.cost))S.inv[k]-=v;toast(`-${costText(st.cost)}`);SFX.page();for(let i=0;i<8;i++)SFX.knock(0.2+i*0.28,rr(170,260));
  const c=homeW(0,0);puff(c.x,HOME_H+1.2,c.z,26,new THREE.Color(0.66,0.6,0.5),0.5);
  after(2.4,()=>{homeBusy=false;setHomeStage(n);after(5,()=>piece(['','mobile','marks','hook'][n]));sparkle(c.x,HOME_H+2,c.z,24);auSwell();player.happy=5;showCardBrief(st.card);
    if(n===3){grantFurniture('bed',true);if(!S.decor.some(e=>e.id==='bed')){const w=homeW(2.0,1.2);S.decor.push({id:'bed',x:w.x,z:w.z,ry:HOME.ry+Math.PI/2});S.stored.bed=Math.max(0,(S.stored.bed||0)-1);layoutDecor();}}
    hud.tasksHTML='';writeSave();});
}
function homeVisuals(t,dt){
  const lit=hStage()>=3;const ins=cam.inside??0;
  home.roofG.visible=hStage()>=1&&ins<0.5;
  if(lit){const f=0.85+0.15*Math.sin(t*11)*Math.sin(t*7.3+1);home.fire.scale.set(1,f,1);home.light.intensity=(home.light.visible?1:0)*(10+4*f)*(0.6+0.4*nightF);
    home.smokeT-=dt;if(home.smokeT<=0&&Math.hypot(player.pos.x-HOME.x,player.pos.z-HOME.z)<60){home.smokeT=0.45;_a.setRGB(0.7,0.7,0.72);fxSoft.emit(home.chimney.x,HOME_H+5.0,home.chimney.z,rr(-0.1,0.1)+0.25,rr(0.5,0.8),rr(-0.1,0.1),_a,rr(0.35,0.55),rr(3,4.5),-0.04,0.3,0.2,0.35);}}
  else home.light.intensity=0;
}

/* ================================================================
   Gardening beside the cottage: till, plant, water (or let the rain), harvest. Nothing withers.
   ================================================================ */
const CROPS={spring:{id:'greens',name:'spring greens'},summer:{id:'berries',name:'summer berries'},autumn:{id:'pumpkin',name:'pumpkins'},winter:{id:'roots',name:'winter roots'}};
const CROP_NAME={greens:'spring greens',berries:'summer berries',pumpkin:'pumpkins',roots:'winter roots',apples:'apples'};
const DRINKS={apples:{id:'cider_apple',name:'First-press apple cider'},berries:{id:'cider_berry',name:'Summer berry cider'},pumpkin:{id:'cider_pumpkin',name:'Spiced pumpkin cider'},roots:{id:'cider_mulled',name:'Mulled root cider'},greens:{id:'cordial',name:'Spring greens cordial'}};
const PLOTS=[];for(const lz of [-1.0,1.0])for(const lx of [5.6,7.4,9.2])PLOTS.push(homeW(lx,lz));
function newPlot(){return {t:0,c:null,g:0,w:0,wt:0};}
if(!S.plots)S.plots=PLOTS.map(newPlot);
const garden=PLOTS.map((p,i)=>{
  const g=new THREE.Group();g.position.set(p.x,groundH(p.x,p.z),p.z);g.rotation.y=HOME.ry;scene.add(g);
  const grass=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.08,1.5),makeToon(0x6a9a44,{}));grass.position.y=0.02;grass.receiveShadow=true;g.add(grass);
  const soilMat=makeToon(0x6a5038,{tag:'plot'+i});const soil=new THREE.Group();g.add(soil);
  const base=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.14,1.5),soilMat);base.position.y=0.05;base.receiveShadow=true;soil.add(base);
  for(const z of [-0.45,0,0.45]){const r=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.08,0.18),soilMat);r.position.set(0,0.15,z);soil.add(r);}
  for(const [x,z] of [[-0.8,-0.8],[0.8,-0.8],[-0.8,0.8],[0.8,0.8]])cylM(0.03,0.04,0.35,0x8a6a4a,g,x,0.17,z,5);
  const cropG=new THREE.Group();g.add(cropG);
  return {x:p.x,z:p.z,g,grass,soil,soilMat,cropG,idx:i,key:''};
});
function cropModel(c,stage){
  const g=new THREE.Group();const LG=makeToon(0x6aae44,{rim:0.25}),DG=makeToon(0x3f7a34,{rim:0.2});
  const spots=[[-0.4,-0.4],[0.4,-0.4],[-0.4,0.4],[0.4,0.4]];
  if(stage===1){for(const [x,z] of spots)for(const sx of [-1,1]){const l=new THREE.Mesh(new THREE.SphereGeometry(0.06,6,4).scale(1,0.3,1.8),LG);l.position.set(x+sx*0.04,0.22,z);l.rotation.y=sx*0.6;g.add(l);}return g;}
  if(stage===2){for(const [x,z] of spots){const m=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.16,1),0.12,3),LG);m.scale.y=0.7;m.position.set(x,0.28,z);m.castShadow=true;g.add(m);}return g;}
  for(const [x,z] of spots){
    if(c==='greens'){const m=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.22,1),0.14,4),makeToon(0x8fd05a,{rim:0.3}));m.scale.y=0.6;m.position.set(x,0.3,z);m.castShadow=true;g.add(m);
      const c2=new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6),makeToon(0xc8ec8a,{}));c2.position.set(x,0.36,z);g.add(c2);}
    else if(c==='berries'){const b=new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.24,1),0.16,3),DG);b.scale.y=0.8;b.position.set(x,0.36,z);b.castShadow=true;g.add(b);
      for(let k=0;k<6;k++){const r=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,5),makeToon(0xc8283a,{noHeal:true,rim:0.5}));const a=k*1.05;r.position.set(x+Math.cos(a)*0.2,0.38+Math.sin(k*2.1)*0.08,z+Math.sin(a)*0.2);g.add(r);}}
    else if(c==='pumpkin'){const l=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6).scale(1.4,0.25,1),DG);l.position.set(x+0.1,0.2,z);g.add(l);
      const pm=new THREE.Mesh(new THREE.SphereGeometry(0.2,12,8).scale(1,0.72,1),makeToon(0xe07a24,{rim:0.3}));pm.position.set(x-0.05,0.3,z);pm.castShadow=true;g.add(pm);addOutline(pm,0.01);
      cylM(0.018,0.025,0.1,0x5a6a2a,g,x-0.05,0.47,z,5);}
    else if(c==='roots'){for(let k=0;k<3;k++){const l=new THREE.Mesh(new THREE.SphereGeometry(0.05,6,4).scale(0.5,2.4,0.5),LG);l.position.set(x+(k-1)*0.05,0.38,z);l.rotation.z=(k-1)*0.4;g.add(l);}
      const r=new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6).scale(1,0.8,1),makeToon(x>0?0xb0447a:0xe0862c,{rim:0.3}));r.position.set(x,0.22,z);g.add(r);}
  }
  return g;
}
function layoutPlot(i){
  const P=S.plots[i],G2=garden[i];G2.grass.visible=!P.t;G2.soil.visible=!!P.t;G2.soilMat.color.set(P.w?0x3a2818:0x6a5038);
  const key=`${P.c}|${P.g}`;if(key!==G2.key){G2.key=key;G2.cropG.clear();if(P.c&&P.g>0)G2.cropG.add(cropModel(P.c,P.g));}
}
function gardenUnlocked(){return hStage()>=1;}
function plotState(i){
  if(!gardenUnlocked())return stage()>=3?{ok:false,text:'Old garden beds · re-roof the cottage first'}:null;
  const P=S.plots[i];if(!P.t)return {ok:true,text:'Turn over the soil',hold:1.0};
  if(!P.c){const cr=CROPS[SEASON];return {ok:true,text:`Sow ${cr.name}`,hold:0.7};}
  if(P.g>=3)return {ok:true,text:`Harvest the ${CROP_NAME[P.c]}`,hold:0.8};
  if(P.w)return {ok:false,text:`${CROP_NAME[P.c]} · watered, growing (${['seed','sprout','leafing'][P.g]})`};
  if(rainK>0.45&&SEASON!=='winter')return {ok:false,text:'The rain is watering it for you'};
  return {ok:true,text:'Water the bed',hold:0.6};
}
function plotAct(i){
  const P=S.plots[i];const p=garden[i];
  if(!P.t){P.t=1;SFX.rustle();puff(p.x,groundH(p.x,p.z)+0.2,p.z,10,_dust,0.3);}
  else if(!P.c){P.c=CROPS[SEASON].id;P.g=0;P.w=0;P.wt=0;SFX.plant();sparkle(p.x,groundH(p.x,p.z)+0.3,p.z,6);}
  else if(P.g>=3){const c=P.c;S.crops[c]=(S.crops[c]||0)+2;S.harvests=(S.harvests|0)+1;Object.assign(P,{c:null,g:0,w:0,wt:0});
    const isNew=collect(c,true);showCatch({kicker:isNew?'Harvested · new in your journal':'Harvested',art:silSVG(SPECIES_BY_ID[c],true),name:`+2 ${CROP_NAME[c]}`,note:SPECIES_BY_ID[c].note,dur:3200});SFX.get();dailyEvent('harvest');}
  else{P.w=1;P.wt=0;SFX.splash();for(let k=0;k<10;k++)fxSoft.emit(p.x+rr(-0.6,0.6),groundH(p.x,p.z)+0.9,p.z+rr(-0.6,0.6),0,-2,0,_a.setRGB(0.8,0.9,1),0.06,0.5,6,0.2,0,0.7);dailyEvent('water');}
  layoutPlot(i);writeSave();
}
function gardenStep(dt){
  const gh=dt/(mode==='play'?20:60);
  S.plots.forEach((P,i)=>{if(!P.c||P.g>=3)return;
    if(!P.w&&rainK>0.45&&SEASON!=='winter'){P.w=1;P.wt=0;layoutPlot(i);}
    if(P.w){P.wt+=gh;if(P.wt>=4){P.g++;P.w=0;P.wt=0;layoutPlot(i);if(P.g>=3&&Math.hypot(player.pos.x-garden[i].x,player.pos.z-garden[i].z)<30)toast(`The ${CROP_NAME[P.c]} are ready to harvest`);}}});
}
function gardenOvernight(){S.plots.forEach((P,i)=>{if(P.c&&P.g<3&&P.w){P.g++;P.w=0;P.wt=0;}layoutPlot(i);});}
/* apples from the young orchard trees, once each in-game day per tree */
function applesInSeason(){return SEASONS[SEASON].apples&&oStage()>=3;}

/* ================================================================
   Gathering: deadfall branches and river stones come back each in-game day
   ================================================================ */
const GATHER=[];
(()=>{
  const gs=GROVES.slice(0,4);gs.forEach((gr,i)=>{for(let k=0;k<12;k++){const a=rnd()*6.28,r=rr(4,9);const x=gr.x+Math.cos(a)*r,z=gr.z+Math.sin(a)*r;if(scatterOK(x,z,{minH:0.2,maxSlope:0.7,path:1.2,chan:3,pad:0.5})){GATHER.push({id:'w'+i,type:'wood',x,z});break;}}});
  [20,30,40].forEach((s0,i)=>{const p=polyPoint(INLET,s0);const nx=-p.tz,nz=p.tx;for(const sd of [1,-1]){const x=p.x+nx*sd*3.2,z=p.z+nz*sd*3.2;if(groundH(x,z)>LEVELS[3]+0.2&&slopeAt(x,z)<0.8){GATHER.push({id:'s'+i,type:'stone',x,z});break;}}});
  for(const G3 of GATHER){const g=new THREE.Group();g.position.set(G3.x,groundH(G3.x,G3.z),G3.z);g.rotation.y=rnd()*6.28;scene.add(g);
    if(G3.type==='wood'){for(let k=0;k<3;k++){const m=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,rr(0.9,1.4),6).rotateZ(Math.PI/2),makeToon(0x7a5a3c,{}));m.position.set(0,0.08+k*0.08,(k-1)*0.15);m.rotation.y=(k-1)*0.4;m.castShadow=true;g.add(m);}}
    else{for(let k=0;k<3;k++){const m=new THREE.Mesh(lumpy(new THREE.DodecahedronGeometry(rr(0.16,0.24),1),0.08,2),makeToon(0xa8a296,{}));m.scale.y=0.6;m.position.set((k-1)*0.3,0.08,rr(-0.15,0.15));m.castShadow=true;g.add(m);}}
    G3.g=g;}
})();
function gatherAvail(G3){return (S.gather[G3.id]??-1)<S.gameDay;}
function layoutGather(){for(const G3 of GATHER)G3.g.visible=gatherAvail(G3);}

/* ================================================================
   The Reedbeds, upstream past the waterfall: misty gated path, reeds to cut, a boardwalk to mend
   ================================================================ */
const FALL=(()=>{let best=0,at=null;for(let s0=30;s0<120;s0+=0.5){const p=polyPoint(INLET,s0),q=polyPoint(INLET,s0+1);const d=Math.abs(groundH(q.x,q.z)-groundH(p.x,p.z));if(d>best){best=d;at={x:p.x,z:p.z,drop:d};}}return at;})();
/* v7: the Reedbeds waterfall as layered translucent sheets, a foam pool at its foot and drifting mist */
const FALLS=(()=>{const L=polyLength(INLET);let a=-1,b=-1;for(let s0=95;s0<L-6;s0+=0.5){const p=polyPoint(INLET,s0),q=polyPoint(INLET,s0+1);const d=groundH(q.x,q.z)-groundH(p.x,p.z);
    if(d>0.5){if(a<0)a=s0;b=s0+1;}else if(a>=0&&s0>b+2)break;}
  if(a<0)return null;const pb=polyPoint(INLET,a),pt=polyPoint(INLET,b);return {s0:a,s1:b,x:pb.x,z:pb.z,y:groundH(pb.x,pb.z),tx:pb.tx,tz:pb.tz,top:groundH(pt.x,pt.z),sheets:[],foam:null};})();
if(FALLS){
  const mkSheet=(off,hw,sp,seed,op)=>{const pos=[],uv=[],idx=[];let n=0;const sA=FALLS.s0-1.5,sB=FALLS.s1+0.6;
    for(let s0=sA;s0<=sB+0.01;s0+=0.33){const p=polyPoint(INLET,s0);const nx=-p.tz,nz=p.tx;const y=groundH(p.x,p.z)+0.32+off*0.4;const ox=-p.tx*off,oz=-p.tz*off;
      pos.push(p.x+ox-nx*hw,y,p.z+oz-nz*hw,p.x+ox+nx*hw,y,p.z+oz+nz*hw);uv.push(0,s0,1,s0);if(n>0){const q=(n-1)*2;idx.push(q,q+2,q+1,q+1,q+2,q+3);}n++;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
    const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uLit:{value:1},uSpeed:{value:sp},uSeed:{value:seed},uOp:{value:op},uS0:{value:sA},uS1:{value:sB}}]);u.uTime=G.uTime;
    const m=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true,
      vertexShader:`varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vUv=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader:`varying vec2 vUv; uniform float uTime,uLit,uSpeed,uSeed,uOp,uS0,uS1;
        ${NOISE_GLSL}
        #include <fog_pars_fragment>
        void main(){
          float across=abs(vUv.x-0.5)*2.0; float f=vUv.y*0.45+uTime*uSpeed;
          float st=n21(vec2(vUv.x*7.0+uSeed,f))*0.65+n21(vec2(vUv.x*21.0+uSeed*3.1,f*2.4))*0.35;
          vec3 col=mix(vec3(0.5,0.72,0.78),vec3(0.97,0.99,1.0),smoothstep(0.38,0.82,st));
          float a=(0.16+0.6*smoothstep(0.42,0.88,st))*(1.0-smoothstep(0.6,1.0,across))*uOp;
          a*=smoothstep(uS0,uS0+1.0,vUv.y)*(1.0-smoothstep(uS1-0.7,uS1,vUv.y));
          col*=mix(0.22,1.0,uLit);
          gl_FragColor=vec4(col,a);
          #include <fog_fragment>
          ${OUT_GLSL}
        }`}));
    m.renderOrder=4;m.frustumCulled=false;scene.add(m);FALLS.sheets.push(u);};
  mkSheet(0.12,1.45,2.2,1.3,0.9);mkSheet(0.42,1.2,3.0,7.7,0.75);mkSheet(0.78,0.95,3.9,4.2,0.6);
  const fu=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uLit:{value:1}}]);fu.uTime=G.uTime;
  const foam=new THREE.Mesh(new THREE.CircleGeometry(3.4,40).rotateX(-Math.PI/2),new THREE.ShaderMaterial({uniforms:fu,transparent:true,depthWrite:false,fog:true,
    vertexShader:`varying vec2 vP;
      #include <fog_pars_vertex>
      void main(){ vP=position.xz; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`varying vec2 vP; uniform float uTime,uLit;
      ${NOISE_GLSL}
      #include <fog_pars_fragment>
      void main(){ float r=length(vP)/3.4; float an=atan(vP.y,vP.x);
        float rings=n21(vec2(an*5.0,r*7.0-uTime*1.6))*0.6+n21(vec2(an*11.0+3.0,r*13.0-uTime*2.3))*0.4;
        float a=smoothstep(0.45,0.8,rings+0.35*(1.0-r))*(1.0-smoothstep(0.55,1.0,r))*0.85;
        gl_FragColor=vec4(vec3(0.96,0.98,1.0)*mix(0.22,1.0,uLit),a);
        #include <fog_fragment>
        ${OUT_GLSL}
      }`}));
  foam.position.set(FALLS.x-FALLS.tx*0.6,FALLS.y+0.36,FALLS.z-FALLS.tz*0.6);foam.renderOrder=5;scene.add(foam);FALLS.foam=fu;
}
function fallsVisuals(dt){
  if(!FALLS)return;const lit=inletU.uLit.value;for(const u of FALLS.sheets)u.uLit.value=lit;FALLS.foam.uLit.value=lit;
  if(dt<=0||Math.hypot(player.pos.x-FALLS.x,player.pos.z-FALLS.z)>60)return;
  const bx=FALLS.x-FALLS.tx*0.8,bz=FALLS.z-FALLS.tz*0.8;
  if(rnd()<dt*16){_a.setRGB(0.96,0.98,1).multiplyScalar(lerp(1,0.3,nightF));fxSoft.emit(bx+rr(-1.6,1.6),FALLS.y+rr(0.2,1.2),bz+rr(-1.6,1.6),rr(-0.5,0.5)-FALLS.tx*0.4,rr(0.25,0.7),rr(-0.5,0.5)-FALLS.tz*0.4,_a,rr(1.0,2.0),rr(3,5.5),-0.03,0.5,0.25,0.22);}
  if(rnd()<dt*7){const k=rnd();_a.setRGB(0.95,0.97,1).multiplyScalar(lerp(1,0.3,nightF));fxSoft.emit(bx+rr(-2.5,2.5)-FALLS.tx*rr(1,6),FALLS.y+rr(0.4,2.5),bz+rr(-2.5,2.5)-FALLS.tz*rr(1,6),rr(-0.3,0.3),rr(0.02,0.12),rr(-0.3,0.3),_a,rr(1.6,2.6),rr(6,9),-0.005,0.15,0.3,0.1);}
  if(rnd()<dt*22){_a.setRGB(1,1,1).multiplyScalar(lerp(1,0.35,nightF));fxSoft.emit(bx+rr(-1.1,1.1),FALLS.y+0.4,bz+rr(-1.1,1.1),rr(-1,1),rr(1.0,2.2),rr(-1,1),_a,rr(0.12,0.25),rr(0.5,0.9),2.4,0.4,0,0.7);}
}
const rbGate=(()=>{
  const g=new THREE.Group();const a=RPATH[0],b=RPATH[1];const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);const tx=dx/l,tz=dz/l,nx=-tz,nz=tx;
  g.position.set(a[0],groundH(a[0],a[1]),a[1]);g.rotation.y=Math.atan2(tx,tz);scene.add(g);
  const leaves=[];for(const sd of [-1,1]){cylM(0.08,0.1,1.5,0x5b4130,g,sd*1.25,0.75,0,6,0.01);const lf=new THREE.Group();lf.position.set(sd*1.2,0,0);g.add(lf);
    for(const y of [0.35,0.8,1.2])boxM(1.15,0.1,0.06,0x7a5a3c,lf,-sd*0.58,y,0,0.006);boxM(1.2,0.08,0.06,0x7a5a3c,lf,-sd*0.58,0.78,0,0,0,0,sd*0.6);leaves.push({lf,sd});}
  for(let i=0;i<RPATH.length-1;i++){const p0=RPATH[i],p1=RPATH[i+1];const ddx=p1[0]-p0[0],ddz=p1[1]-p0[1],L=Math.hypot(ddx,ddz);const ux=ddx/L,uz=ddz/L,vx=-uz,vz=ux;
    const fence=new THREE.Group();scene.add(fence);STATIC_GROUPS.push(fence);
    for(let t=1.5;t<L;t+=2.4)for(const sd of [-1,1]){const x=p0[0]+ux*t+vx*sd*1.6,z=p0[1]+uz*t+vz*sd*1.6;const post=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,1.0,5),makeToon(0x6b4c33,{}));post.position.set(x,groundH(x,z)+0.5,z);post.castShadow=true;fence.add(post);}}
  return {g,leaves,open:false,k:0};
})();
const BW=[];(()=>{const L=polyLength(INLET);let s0=0;for(;s0<L;s0+=0.5){const p=polyPoint(INLET,s0);if(rbDist(p.x,p.z)<10)break;}
  for(let i=0;i<5;i++){const p=polyPoint(INLET,s0+2+i*2.9);const nx=-p.tz,nz=p.tx;BW.push({x:p.x-nx*2.9,z:p.z-nz*2.9,ry:Math.atan2(p.tx,p.tz),i});}})();
const boardwalk=BW.map(b=>{
  const g=new THREE.Group();g.position.set(b.x,groundH(b.x,b.z),b.z);g.rotation.y=b.ry;scene.add(g);
  const fixed=new THREE.Group(),broken=new THREE.Group();g.add(fixed,broken);
  for(let k=0;k<6;k++)boxM(1.3,0.07,0.42,k%2?0x8a6a4a:0x80603f,fixed,0,0.42,-1.25+k*0.5,0.006);
  for(const sx of [-0.6,0.6])for(const sz of [-1.3,1.3])cylM(0.06,0.07,0.9,0x5b4130,fixed,sx,0.2,sz,6);
  for(let k=0;k<3;k++)boxM(1.3,0.07,0.42,0x6a5a48,broken,rr(-0.4,0.4),0.08,rr(-1.2,1.2),0.006,rr(-0.3,0.3),rr(0,3),rr(-0.3,0.3));
  cylM(0.06,0.07,0.9,0x4b3b2c,broken,0.6,0.2,1.3,6);
  return {...b,g,fixed,broken,ix:b.x,iz:b.z};
});
const RCLUMPS=[];(()=>{const L=polyLength(INLET);let s0=0;for(;s0<L;s0+=0.5){const p=polyPoint(INLET,s0);if(rbDist(p.x,p.z)<16)break;}
  for(let i=0;i<6;i++){const p=polyPoint(INLET,s0+i*4.2);const nx=-p.tz,nz=p.tx;const sd=i%2?1:-1;RCLUMPS.push({x:p.x+nx*sd*(2.6+(i%3)*0.4),z:p.z+nz*sd*(2.6+(i%3)*0.4),i});}})();
const rbReeds=(()=>{
  const pts=[];for(let k=0;k<1400&&pts.length<520;k++){const a=rnd()*6.28,r=Math.sqrt(rnd())*20;const x=RB.x+Math.cos(a)*r,z=RB.z+Math.sin(a)*r;const d=polyInfo(x,z,INLET).d;if(d<1.7||d>8.5||rnd()>1-d/12)continue;pts.push([x,z,rr(1.1,1.8)]);}
  const im=new THREE.InstancedMesh(reedGeo(),reedMat,Math.max(pts.length,1));im.castShadow=true;im.frustumCulled=false;
  pts.forEach((q,i)=>{dummy.position.set(q[0],groundH(q[0],q[1])-0.05,q[1]);dummy.rotation.set(0,rnd()*6.28,0);dummy.scale.set(q[2]*0.9,q[2],q[2]*0.9);dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix);});
  scene.add(im);
  const cl=new THREE.InstancedMesh(reedGeo(),reedMat,RCLUMPS.length*10);cl.castShadow=true;cl.frustumCulled=false;scene.add(cl);
  const data=[];RCLUMPS.forEach((c,ci)=>{for(let k=0;k<10;k++){const a=rnd()*6.28,r=Math.sqrt(rnd())*0.9;data.push({x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r,ry:rnd()*6.28,s:rr(1.2,1.7),ci});}});
  return {im,cl,data};
})();
function reedAvail(i){return (S.reed.cut[i]??-1)<S.gameDay;}
function layoutRbReeds(){rbReeds.data.forEach((d,i)=>{const k=reedAvail(d.ci)?1:0.3;dummy.position.set(d.x,groundH(d.x,d.z)-0.05,d.z);dummy.rotation.set(0,d.ry,0);dummy.scale.set(d.s*0.9,d.s*k,d.s*0.9);dummy.updateMatrix();rbReeds.cl.setMatrixAt(i,dummy.matrix);});rbReeds.cl.instanceMatrix.needsUpdate=true;}
const rbHeron=(()=>{const m=makeSightModel(SPECIES_BY_ID.heron);const last=BW[BW.length-1];const p=polyPoint(INLET,polyInfo(last.x,last.z,INLET).s+3);m.g.position.set(p.x,groundH(p.x,p.z)+0.05,p.z);m.g.rotation.y=-0.8;m.g.visible=false;scene.add(m.g);return m.g;})();
function rbStage(){if(oStage()<4)return -1;return S.reed.bw.every(Boolean)?1:0;}
function rbPct(){return S.reed.bw.filter(Boolean).length*20;}
function setBoardwalk(i,on){S.reed.bw[i]=on;boardwalk[i].fixed.visible=on;boardwalk[i].broken.visible=!on;}
function syncReedbed(){if(typeof syncWeave==='function')try{syncWeave();}catch(e){}const st=rbStage();rbGate.open=st>=0;rbHeron.visible=st>=0;boardwalk.forEach((b,i)=>setBoardwalk(i,!!S.reed.bw[i]));layoutRbReeds();
  if(st>=1){if(mira.state==='away')miraArrive(true);}else{mira.state='away';mira.root.visible=false;}}
function mendBoardwalk(b){
  S.inv.wood-=1;S.inv.reed-=2;toast('-1 wood, -2 reeds');SFX.page();for(let i=0;i<4;i++)SFX.knock(0.15+i*0.25,rr(200,280));
  setBoardwalk(b.i,true);puff(b.x,groundH(b.x,b.z)+0.5,b.z,12,_dust,0.35);sparkle(b.x,groundH(b.x,b.z)+0.6,b.z,10);
  if(rbStage()===1){after(1.0,()=>{startSweepB(new THREE.Vector3(b.x,0,b.z),G.uHealNextB.value);auSwell();player.happy=6;
    const dir=new THREE.Vector3(RPATH[0][0]-RB.x,0,RPATH[0][1]-RB.z);startCine({k:'The Reedbeds',t:'The boardwalk holds',s:'Out over the reeds, someone small is watching a heron.'},new THREE.Vector3(RB.x,0,RB.z),{pivot:new THREE.Vector3(RB.x,0,RB.z),radius:24,height:6,lookY:8.8,dir,warp:false});
    after(9.6,()=>miraArrive(false));writeSave();});}
  else writeSave();
}
function reedbedVisuals(t,dt){
  fallsVisuals(dt);lamplightVisuals(t,dt);
  if(dt>0&&waterU.uIceN.value>0.6&&nightF<0.6&&rnd()<dt*9){const a2=rnd()*6.28,r2=rr(4,POND_R-2);const x=Math.cos(a2)*r2,z=Math.sin(a2)*r2;
    if(levelCur-groundH(x,z)>0.15){tmpCol.setRGB(2.2,2.3,2.5);fxGlow.emit(x,levelCur+0.15,z,0,rr(0.05,0.2),0,tmpCol,rr(0.1,0.18),rr(0.6,1.2),0,0.5,0);}}
  reedBoatStep(t,dt);
  rbGate.k=damp(rbGate.k,rbGate.open?1:0,1.5,dt);for(const L of rbGate.leaves)L.lf.rotation.y=L.sd*rbGate.k*1.5;
  const near=Math.hypot(player.pos.x-RPATH[1][0],player.pos.z-RPATH[1][1])<45||rbDist(player.pos.x,player.pos.z)<40;
  if(near&&dt>0&&rnd()<dt*(rbGate.open?6:14)){const i=(rnd()*(RPATH.length-1))|0;const p0=RPATH[i],p1=RPATH[i+1],k=rnd();const x=lerp(p0[0],p1[0],k)+rr(-3,3),z=lerp(p0[1],p1[1],k)+rr(-3,3);
    _a.setRGB(0.92,0.94,0.96).multiplyScalar(lerp(1,0.35,nightF));fxSoft.emit(x,groundH(x,z)+rr(0.3,1.6),z,rr(-0.2,0.2),rr(0.02,0.1),rr(-0.2,0.2),_a,rr(1.2,2.2),rr(4,7),-0.01,0.2,0.3,0.16);}
  if(FALL&&dt>0&&Math.hypot(player.pos.x-FALL.x,player.pos.z-FALL.z)<50&&rnd()<dt*10){_a.setRGB(0.95,0.97,1).multiplyScalar(lerp(1,0.35,nightF));fxSoft.emit(FALL.x+rr(-1.5,1.5),groundH(FALL.x,FALL.z)+rr(0,1.5),FALL.z+rr(-1.5,1.5),rr(-0.4,0.4),rr(0.3,0.9),rr(-0.4,0.4),_a,rr(0.5,1.0),rr(1.5,2.5),-0.05,0.6,0.2,0.3);}
}

/* ================================================================
   Mira, the reed-weaver who watches the heron (three visits, three letters, a basket)
   ================================================================ */
const MIRA_HOME=(()=>{const last=BW[BW.length-1];return {x:last.x+Math.sin(last.ry)*1.9,z:last.z+Math.cos(last.ry)*1.9};})();
const mira=(()=>{
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.visible=false;
  const M=(c)=>makeToon(c,{rim:0.36,noHeal:true});
  const mesh=(geo,mat,parent,x=0,y=0,z=0,ol=0.014)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);if(ol)addOutline(m,ol);return m;};
  mesh(new THREE.LatheGeometry([new THREE.Vector2(0.001,0),new THREE.Vector2(0.3,0),new THREE.Vector2(0.26,0.2),new THREE.Vector2(0.2,0.5),new THREE.Vector2(0.16,0.58),new THREE.Vector2(0.001,0.6)],16),M(0x4f7fa8),body,0,0.36,0);
  const legs=[];for(const sx of [-1,1]){const pv=new THREE.Group();pv.position.set(sx*0.09,0.4,0);body.add(pv);mesh(new THREE.CapsuleGeometry(0.06,0.2,4,8),M(0xd8b896),pv,0,-0.16,0,0.01);mesh(new THREE.SphereGeometry(0.075,8,6).scale(1,0.7,1.3),M(0x5a3a28),pv,0,-0.34,0.03,0.01);legs.push(pv);}
  const arms=[];for(const sx of [-1,1]){const pv=new THREE.Group();pv.position.set(sx*0.21,0.86,0);body.add(pv);mesh(new THREE.CapsuleGeometry(0.05,0.22,4,8),M(0x4f7fa8),pv,0,-0.15,0,0.01);mesh(new THREE.SphereGeometry(0.05,8,6),M(0xe8c4a2),pv,0,-0.31,0,0.008);arms.push(pv);}
  const basket=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.11,0.14,10,1,true),makeToon(0xc8a05a,{side:THREE.DoubleSide,noHeal:true}));basket.position.set(0,-0.36,0.08);arms[0].add(basket);
  const head=new THREE.Group();head.position.set(0,1.14,0.01);body.add(head);
  mesh(new THREE.SphereGeometry(0.23,24,18),M(0xf0cfae),head,0,0,0,0.016);
  mesh(new THREE.SphereGeometry(0.245,20,12,0,Math.PI*2,0,1.15),M(0x3a2418),head,0,0.02,-0.01,0.012);
  const braid=mesh(new THREE.CapsuleGeometry(0.045,0.32,4,6),M(0x3a2418),head,0,-0.22,-0.2,0.01);braid.rotation.x=0.4;
  for(const sx of [-1,1]){mesh(new THREE.SphereGeometry(0.03,8,6).scale(0.8,1.2,0.5),M(0x21160f),head,sx*0.085,0.0,0.2,0);mesh(new THREE.SphereGeometry(0.035,8,6).scale(1,0.5,0.3),M(0xf2a08e),head,sx*0.14,-0.07,0.17,0);}
  const hat=new THREE.Group();hat.position.set(0,0.16,-0.02);hat.rotation.x=-0.2;head.add(hat);
  mesh(new THREE.CylinderGeometry(0.4,0.42,0.02,28),M(0xe2c27a),hat,0,0,0,0.01);mesh(new THREE.CylinderGeometry(0.17,0.22,0.14,20),M(0xe2c27a),hat,0,0.07,0,0.01);mesh(new THREE.CylinderGeometry(0.222,0.222,0.04,20),M(0x58803a),hat,0,0.03,0,0);
  scene.add(root);
  return {root,body,head,arms,legs,state:'away',met:0,lastDay:-1,face:0,nod:0};
})();
addCollider(MIRA_HOME.x,MIRA_HOME.z,0.4,()=>mira.state==='home');
function miraArrive(instant){mira.root.visible=true;mira.state='home';mira.root.position.set(MIRA_HOME.x,walkH(MIRA_HOME.x,MIRA_HOME.z),MIRA_HOME.z);mira.face=Math.atan2(rbHeron.position.x-MIRA_HOME.x,rbHeron.position.z-MIRA_HOME.z);
  if(!instant){toast('Someone is sitting at the end of the boardwalk, watching the heron.');SFX.moment();hud.tasksHTML='';}}
function miraPose(t,dt){
  if(!mira.root.visible)return;const near=Math.hypot(player.pos.x-mira.root.position.x,player.pos.z-mira.root.position.z)<5;
  const want=near?Math.atan2(player.pos.x-mira.root.position.x,player.pos.z-mira.root.position.z):Math.atan2(rbHeron.position.x-MIRA_HOME.x,rbHeron.position.z-MIRA_HOME.z);
  mira.face+=angWrap(want-mira.face)*(1-Math.exp(-2.5*dt));mira.root.rotation.y=mira.face;mira.body.position.y=Math.sin(t*1.8)*0.006;
  mira.nod=Math.max(0,mira.nod-dt);mira.head.rotation.x=(talk.on&&talk.who==='mira'?Math.sin(t*5)*0.05:0)+(mira.nod>0?Math.sin(mira.nod*8)*0.12:0);mira.head.rotation.z=Math.sin(t*0.5)*0.05;
  mira.arms[1].rotation.x=near?0:-0.3;
}
const MIRA_VISITS=[
  ["Shh. He's been standing there since breakfast.","The heron. He only fishes where the water's clean. He came back the week the boardwalk did.","I'm Mira. I weave baskets from the reeds, like my grandmother. She lived down by the pond, before.","Here. I wrote it last night. It's not very good."],
  ["You're back. He caught two fish this morning. I counted.","Grandmother says you cut reeds after the first frost, never before. I don't know why. She just says it.","Every family has its own turn in the weave, she says. Hers goes under the rim, where nobody looks.","I wrote another one. It's mostly about the heron again."],
  ["I finished it. Your basket. It took me four evenings.","You can keep apples in it. Or nothing. Grandmother keeps nothing in hers. She just likes looking at it.","And this. It's a feather he dropped. I've got three already."]
];
const MIRA_LETTERS=[
  "Dear person who fixed the boardwalk. Thank you. I can go all the way to the end now without getting my socks wet. The heron does not mind me if I am quiet. I am very quiet. — Mira",
  "Grandmother says the valley was full of baskets once. Every house had one by the door for eggs. I am going to make one for every house. That is eleven baskets. I have made two.",
  "I asked the heron if he was lonely and he did not answer, which Grandmother says means no. I think the valley is less lonely now too. Come and watch him with me sometimes. — Mira"
];
function miraChat(){const L=["He hasn't moved. I timed it.","If you stand still long enough the reed warblers forget you're there.","The water's louder up here. Grandmother says it's because it's in a hurry."];
  if(W.type==='rain')L.push("He doesn't mind the rain. I mind it a bit.");if(SEASON==='winter')L.push("The stream doesn't freeze up here. It's too quick.");if(nightF>0.6)L.push("I'm going home soon. Grandmother leaves the lamp on.");
  if(S.story&&S.story.done)L.push(...rim().mira);
  return L[(S.gameDay+Math.floor(simTime/40))%L.length];}
function miraVisitReady(){return mira.state==='home'&&mira.met<3&&(mira.met===0||S.gameDay>mira.lastDay);}
function miraTalk(){
  if(mira.state!=='home'||talk.on)return;
  if(miraVisitReady()){const k=mira.met;talk.lines=MIRA_VISITS[k].slice();talk.onEnd=()=>{mira.met=k+1;mira.lastDay=S.gameDay;if(k===1)after(9,()=>piece('weave'));
      showCatch({kicker:'A letter from Mira · kept in your journal',name:'',note:`“${MIRA_LETTERS[k]}”`,dur:8000});
      if(k===2){const kp='Heron feather · from Mira';if(!S.keepsakes.includes(kp))S.keepsakes.push(kp);grantFurniture('basket');}
      else after(1.2,()=>toast('She will be here tomorrow, in the valley. The heron keeps her hours.'));hud.tasksHTML='';writeSave();};}
  else{talk.lines=[miraChat()];talk.onEnd=null;}
  talk.who='mira';talk.on=true;talk.i=0;mira.nod=0.8;$('talk').hidden=false;$('talkWho').textContent='Mira';$('talkLine').textContent=talk.lines[0];SFX.page();dailyEvent('mira');
  if(document.pointerLockElement)document.exitPointerLock();
}

/* ================================================================
   v7: weaving at the Reedbeds (a basket, a mat, a little reed boat) and floating the boat down to Mill Pond
   ================================================================ */
const WEAVE=(()=>{const L=polyLength(INLET);let s0=0,best=1e9;for(let q=60;q<L;q+=0.5){const p=polyPoint(INLET,q);const d=rbDist(p.x,p.z);if(d<best){best=d;s0=q;}}
  const p=polyPoint(INLET,s0+5);const nx=-p.tz,nz=p.tx;return {s:s0+4,x:p.x+nx*9.5,z:p.z+nz*9.5,lx:p.x+nx*2.6,lz:p.z+nz*2.6,nx,nz,ry:Math.atan2(-nx,-nz)};})();
const WEAVES=[
  {id:'basket',name:'a reed basket',cost:{reed:3},furn:'reedbasket',card:{k:'The Reedbeds · weaving',t:'A basket, a little lopsided',s:'Mira says the lopsided ones hold the most. She does not explain.'}},
  {id:'mat',name:'a reed mat',cost:{reed:4},furn:'reedmat',card:{k:'The Reedbeds · weaving',t:'A mat for the doorstep',s:'It smells of the stream. Muddy boots will love it.'}},
  {id:'boat',name:'a little reed boat',cost:{reed:5,wood:1},furn:null,card:{k:'The Reedbeds · weaving',t:'A boat the size of a loaf',s:'Mira tucks a stub of candle in the bow. "For the pond," she says. "Grandmother always sent one down."'}}];
const reedCost=c=>Object.entries(c).map(([k,v])=>`${v} ${k==='reed'?'reeds':k}`).join(' and ');
function nextWeave(){return WEAVES.find(w=>!S.reed.woven[w.id])||null;}
function makeReedBoat(){const g=new THREE.Group();const RM=makeToon(0xcfb06c,{noHeal:true}),RD=makeToon(0xa8884a,{noHeal:true});
  for(const sx of [-1,1]){const b=new THREE.Mesh(new THREE.CapsuleGeometry(0.09,0.62,4,8).rotateX(Math.PI/2),RM);b.position.set(sx*0.08,0.06,0);b.castShadow=true;g.add(b);}
  const keel=new THREE.Mesh(new THREE.CapsuleGeometry(0.07,0.5,4,8).rotateX(Math.PI/2),RD);keel.position.set(0,0.0,0);g.add(keel);
  for(const z of [-0.26,0,0.26]){const band=new THREE.Mesh(new THREE.TorusGeometry(0.17,0.018,5,12).rotateY(Math.PI/2),RD);band.position.set(0,0.05,z);band.scale.set(1,0.7,1);g.add(band);}
  const prow=new THREE.Mesh(new THREE.TorusGeometry(0.1,0.035,5,10,Math.PI*1.2),RM);prow.position.set(0,0.16,0.42);prow.rotation.y=Math.PI/2;g.add(prow);
  const cdl=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.1,8),makeToon(0xf4ecd8,{noHeal:true}));cdl.position.set(0,0.16,0.2);g.add(cdl);
  const fl=new THREE.Mesh(new THREE.ConeGeometry(0.022,0.07,6),new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.3,0.45)}));fl.position.set(0,0.245,0.2);g.add(fl);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:POOL_TEX,color:0xffb35c,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));halo.position.set(0,0.25,0.2);halo.scale.setScalar(0.9);g.add(halo);
  g.scale.setScalar(1.3);return {g,fl,halo};}
const weaveSite=(()=>{
  const g=new THREE.Group();g.position.set(WEAVE.x,groundH(WEAVE.x,WEAVE.z),WEAVE.z);g.rotation.y=WEAVE.ry;scene.add(g);
  const DK=0x5b4130,RC=0xcfb06c;
  for(const sx of [-1,1]){boxM(0.1,1.5,0.1,DK,g,sx*0.75,0.72,0,0.008,0.12,0,0);}
  boxM(1.7,0.1,0.1,DK,g,0,1.42,-0.08,0.008);boxM(1.7,0.1,0.1,DK,g,0,0.35,0.1,0.008);
  for(let k=0;k<11;k++)boxM(0.025,1.05,0.025,RC,g,-0.62+k*0.124,0.88,0.01,0,0.12,0,0);
  for(let k=0;k<5;k++)boxM(1.36,0.05,0.04,k%2?0xb89a5a:RC,g,0,0.55+k*0.08,0.04+k*0.01,0,0.12,0,0);
  cylM(0.22,0.24,0.38,0x7a5a3c,g,0,0.19,1.0,10,0.008);
  for(let k=0;k<3;k++)cylM(0.04,0.04,1.4,RC,g,1.2+k*0.1,0.06,0.5,5,0,{}).rotation.set(Math.PI/2,0,0.3*k);
  const items={};const bk=makeDecorModel('reedbasket',false);bk.g.position.set(-1.25,0,0.7);g.add(bk.g);items.basket=bk.g;
  const mt=makeDecorModel('reedmat',false);mt.g.position.set(0,0.0,1.9);g.add(mt.g);items.mat=mt.g;
  const bt=makeReedBoat();bt.g.position.set(1.3,0.05,1.3);bt.g.rotation.y=0.6;g.add(bt.g);items.boat=bt.g;
  addCollider(WEAVE.x,WEAVE.z,0.9);
  return {g,items};
})();
const reedBoat=(()=>{const b=makeReedBoat();b.g.visible=false;scene.add(b.g);return b;})();
let boatRun=null;
const BOAT_REST=(()=>{const a=INLET[0],L=Math.hypot(a[0],a[1]);return {x:a[0]*(1-9/L),z:a[1]*(1-9/L)};})();
function syncWeave(){const sw=S.reed.woven;weaveSite.items.basket.visible=!!sw.basket;weaveSite.items.mat.visible=!!sw.mat;weaveSite.items.boat.visible=!!sw.boat&&!S.reed.floated&&!boatRun;
  if(S.reed.floated&&!boatRun){reedBoat.g.visible=true;reedBoat.g.position.set(BOAT_REST.x,levelCur+0.04,BOAT_REST.z);}else if(!boatRun)reedBoat.g.visible=false;}
function weaveNext(){
  const w=nextWeave();if(!w)return;for(const [k,v] of Object.entries(w.cost))S.inv[k]-=v;toast(`-${reedCost(w.cost)}`);
  SFX.rustle();SFX.page();for(let i=0;i<6;i++)SFX.knock(0.2+i*0.3,rr(320,420));player.busy=Math.max(player.busy,1.6);
  after(1.8,()=>{S.reed.woven[w.id]=true;syncWeave();sparkle(WEAVE.x,groundH(WEAVE.x,WEAVE.z)+1,WEAVE.z,18);auSwell();player.happy=4;showCardBrief(w.card);
    if(w.furn)grantFurniture(w.furn);
    if(w.id==='boat'){after(4.8,()=>toast('Set the boat on the stream when you are ready. It knows the way down.'));after(8,()=>piece('boats'));}
    hud.tasksHTML='';writeSave();});
}
function launchBoat(){
  if(boatRun||!S.reed.woven.boat||S.reed.floated)return;
  boatRun={s:WEAVE.s,x:WEAVE.lx,z:WEAVE.lz,phase:'stream',t:0,k:0,fx:0,fz:0};weaveSite.items.boat.visible=false;reedBoat.g.visible=true;
  SFX.splash();addRipple(WEAVE.lx,WEAVE.lz,1.2);SFX.moment();
  toast(mira.state==='home'?'Mira, softly: "Go on, little boat."':'The little boat turns once, then finds the current.');
  after(3.5,()=>toast('Follow it down to Mill Pond, if you like.'));hud.tasksHTML='';
}
function boatArrive(){
  boatRun=null;S.reed.floated=true;const x=reedBoat.g.position.x,z=reedBoat.g.position.z;
  sparkle(x,levelCur+0.5,z,26);auSwell();SFX.moment();
  if(Math.hypot(player.pos.x-x,player.pos.z-z)<45)player.happy=6;
  showCardBrief({k:'Mill Pond · a small ceremony',t:'The reed boat comes home',s:'It turns once in the still water and settles, candle and all, as if it knew the way.'});
  const kp='Reed boat · sailed down to Mill Pond';if(!S.keepsakes.includes(kp))S.keepsakes.push(kp);
  hud.tasksHTML='';writeSave();
}
function reedBoatStep(t,dt){
  const b=reedBoat;b.fl.scale.y=0.85+0.25*Math.sin(t*13)*Math.sin(t*7.7+1);b.halo.material.opacity=0.45+0.35*lerp(0.4,1,nightF);
  if(boatRun&&dt>0){const r=boatRun;r.t+=dt;
    if(r.phase==='stream'){const sp=lerp(0.6,2.2,clamp(r.t/3,0,1));r.s-=dt*sp;const p=polyPoint(INLET,r.s);const nx=-p.tz,nz=p.tx;const sway=Math.sin(r.t*0.7)*0.35;
      r.x=p.x+nx*sway;r.z=p.z+nz*sway;const y=Math.max(groundH(r.x,r.z)+0.34,levelCur+0.04);b.g.position.set(r.x,y,r.z);b.g.rotation.y=Math.atan2(-p.tx,-p.tz)+Math.sin(r.t*1.3)*0.15;
      if(rnd()<dt*3)addRipple(r.x,r.z,0.4);
      if(r.s<=4||levelCur-groundH(r.x,r.z)>0.6){r.phase='pond';r.t=0;r.fx=r.x;r.fz=r.z;}}
    else{const k=ease(clamp(r.t/12,0,1));r.x=lerp(r.fx,BOAT_REST.x,k);r.z=lerp(r.fz,BOAT_REST.z,k);b.g.position.set(r.x,levelCur+0.04,r.z);b.g.rotation.y+=dt*0.25*(1-k);
      if(rnd()<dt*1.5)addRipple(r.x,r.z,0.6);if(r.t>=12)boatArrive();}
  }else if(S.reed.floated&&b.g.visible){b.g.position.y=levelCur+0.04+Math.sin(t*1.1)*0.015;b.g.rotation.y+=dt*0.04;b.g.rotation.z=Math.sin(t*0.9)*0.04;}
}

/* ================================================================
   v9: pieces of the valley's past (journal "Pieces"), theories, and Lamplight Shore
   ================================================================ */
const STORY_TEXT={
 "talk": [
  "Mira said someone sent a boat down. Nobody has sent one but me. Not in thirty-one years.",
  "That basket you carry. May I? ... It's so worn.",
  "There. Under the rim, where nobody looks. My turn in the weave. And one blue strand.",
  "I wove a blue strand in for my second. Ren had green.",
  "I left the lamp on so you could find the way. You took your time.",
  "I made it lopsided on purpose. So it would float."
 ],
 "card": [
  "Lamplight Shore",
  "The lamp",
  "Thirty-one years she left it burning. Tonight she lets it go out."
 ],
 "page": [
  "The last page",
  "The night the river came, the miller opened the gate by hand to spare the village below, and the water went through her own house instead. She put her youngest in a reed cradle she had woven lopsided, so it would float. The current took it through the open gate and away downstream. The village said the baby was lost. She never said so. She sent a boat down every year, and wrote, and left the lamp on.",
  "The cradle was found far downstream, in Kawashita, and the baby grew up there with no name but the one they were given. The cottage I mended was the house I was born in. The short column on the doorframe is mine. There is room above it."
 ],
 "oda": "I sent the notice. Only one, to one address in Kawashita. Years ago I heard of a foundling taken in there the summer of the flood, and I was never sure, and I was too much of a coward to ask. I wasn't sure. I'm sure now. — K. Oda",
 "rim": "Under the worn rim: a small turned knot, and one blue strand. Your mother's turn in the weave.",
 "theory": "None of my guesses were right. It wasn't a grandmother at the gate. It was my mother. And the small one was me.",
 "ren": [
  "A letter to Ren, started four times",
  "The tall column on the doorframe is Ren's: your brother, Mira's father, who writes from the city every winter. On Sachi's table is a letter to him she has started four times. \"He'll want to come home,\" she says. \"He'll want to see you.\""
 ],
 "mira": [
  "Grandmother laughed at breakfast. Twice. I counted.",
  "So you're my aunt. Or my uncle. Grandmother says I can just use your name.",
  "The heron didn't even look up. I think he knew already."
 ],
 "oda2": [
  "She let the lamp go out last night. First time in thirty-one years. I sat on the wall a while.",
  "Your mother makes terrible tea. Don't tell her I said so."
 ],
 "sachi": [
  "Sit. The kettle's on.",
  "Ren will want to know. I've started the letter four times.",
  "You walk like your father did. Too fast on the stairs.",
  "I don't need the lamp now. I sleep with the window open instead."
 ],
 "fest": "Tonight is the boat festival. Little lit boats on the water, for everyone who ever came home."
};
const PIECES=[
  {id:'notice',t:'The notice',w:'You arrived with it',x:'THE MILL COTTAGE, free to anyone who will mend it. Typed, unsigned, and posted to you at your rooms in Kawashita. Nobody else in Kawashita seems to have had one.',g:''},
  {id:'lantern',t:'A soot-black lantern',w:'Mill Pond · in the flood debris',x:'The handle is a heron, its neck bent to hold the ring. The glass is cracked, but someone had trimmed the wick short, as if they meant to light it again.',g:'a'},
  {id:'gate',t:'Scratches on the gate wheel',w:'Mill Pond · the rebuilt sluice',x:'Knife marks gouged into the old sluice wheel, deep and hurried, and a date: 9 · VI. The wheel was turned by hand, from the gate itself.',g:'ac'},
  {id:'notes',t:'The bottle notes',w:'Mill Pond · washed up on the shore',x:'They are never signed. Most are written to "my small one". Whoever writes them sends them down from somewhere upstream.',g:'b'},
  {id:'mobile',t:'Reed birds in the rafters',w:'The mill cottage · under the old thatch',x:'Tangled in the rafters: a mobile of tiny woven reed birds, the kind you hang over a cradle. Five birds. One is missing a wing.',g:'b'},
  {id:'marks',t:'Pencil marks on the doorframe',w:'The mill cottage · by the door',x:'Two columns of height marks. One climbs, year after year, to the height of a grown person. The other stops at the very first mark.',g:'b'},
  {id:'hook',t:'The heron on the hearth',w:'The mill cottage · the hearth',x:'The kettle hook is carved as a heron, the same heron as the lantern handle. Whoever lived here had a heron for a sign.',g:'a'},
  {id:'bell',t:"Mr. Oda's postscript",w:'Old Orchard · a letter from Mr. Oda',x:'"P.S. I was meant to be on the hill that night, with the bell. I wasn\'t fast enough. I have never been fast enough since."',g:'c'},
  {id:'gatelight',t:'What Mr. Oda saw',w:'Old Orchard · by the press',x:'"Her lamp was the only light that night. She was out on the gate, shouting over the water. Something small and pale went under the gate with the current. I told myself it was a lantern." He would not say who she was.',g:'ab'},
  {id:'weave',t:'Every family has its own turn',w:'The Reedbeds · Mira',x:'"Every family has its own turn in the weave, Grandmother says. Hers goes under the rim, where nobody looks."',g:''},
  {id:'boats',t:'A boat sent down',w:'The Reedbeds · Mira',x:'"Grandmother always sent one down." Every year, Mira says. She doesn\'t know what for. She has never asked.',g:'b'},
  {id:'window',t:'The lit window',w:'Across the water, at night',x:'On the far shore one window is always lit, every night, in every weather. Mira: "Grandmother leaves the lamp on."',g:'b'},
  {id:'postcard',t:'A postcard behind a loose board',w:'The old mill',x:'A faded postcard of a river town: Kawashita. The message has washed out except for one word, "...well...", and a year long gone.',g:''}];
const PIECE_BY_ID=Object.fromEntries(PIECES.map(p=>[p.id,p]));
const THEORIES=[{k:'a',t:'Was it my grandmother at the gate? Someone from this cottage opened it, I\'m sure of that.'},
  {k:'b',t:'Did someone small drown in the flood? The notes, the marks, the boats...'},
  {k:'c',t:'Did Mr. Oda let it happen? He keeps saying he wasn\'t fast enough.'}];
function storyInit(){if(!S.story||typeof S.story!=='object')S.story={};const s=S.story;if(!s.f||typeof s.f!=='object')s.f={};if(!s.seen||typeof s.seen!=='object')s.seen={};s.gate=!!s.gate;s.done=!!s.done;s.gc=!!s.gc;if(!Number.isFinite(s.fest))s.fest=-1;if(!('pick' in s))s.pick=null;s.f.notice=s.f.notice||1;s.seen.notice=true;}
function hasPiece(id){return !!(S.story&&S.story.f[id]);}
function piece(id,quiet){storyInit();if(hasPiece(id)||!PIECE_BY_ID[id])return false;S.story.f[id]=(S.gameDay|0)+1;S.story.seen[id]=false;
  if(!quiet){after(quiet===false?0:1.2,()=>{toast(`A new piece for your journal: ${PIECE_BY_ID[id].t} (J)`);SFX.page();});}
  storyGateClimax(quiet);writeSave();if(journalOpen&&jPane==='pPieces')renderPieces();return true;}
function storyGateClimax(quiet){const s=S.story;if(s.gc||!hasPiece('gate')||!hasPiece('bell'))return;s.gc=true;
  if(!quiet)after(5,()=>{showCardBrief({k:'Pieces',t:'What happened at the gate',s:'Someone turned the sluice by hand that night, and the village below was spared. But who were the bottle notes written to?'});SFX.moment();auSwell();});}
function storyRetro(){storyInit();const q=true;
  if(piles.filter(p=>p.cleared).length>=2)piece('lantern',q);if(stage()>=2)piece('gate',q);if(S.notes.length)piece('notes',q);
  if(hStage()>=1)piece('mobile',q);if(hStage()>=2)piece('marks',q);if(hStage()>=3)piece('hook',q);
  if(oda.met>=2)piece('bell',q);if(oda.met>=3)piece('gatelight',q);if(mira.met>=2)piece('weave',q);if(S.reed.woven&&S.reed.woven.boat)piece('boats',q);
  syncLamplight();}
function storyReady(){return restorationPct()>=100&&orchardPct()>=100&&hStage()>=3&&rbPct()>=100&&mira.met>=3&&!!S.reed.floated;}
/* Lamplight Shore: a small house across the water from the cottage */
const LS={x:37,z:-8};LS.ry=Math.atan2(-LS.x,-LS.z);
const lsDist=(x,z)=>Math.hypot(x-LS.x,z-LS.z);
function lsW(lx,lz){const c=Math.cos(LS.ry),s2=Math.sin(LS.ry);return {x:LS.x+lx*c+lz*s2,z:LS.z-lx*s2+lz*c};}
const lamplight=(()=>{
  const g=new THREE.Group();g.position.set(LS.x,groundH(LS.x,LS.z),LS.z);g.rotation.y=LS.ry;scene.add(g);
  const WD=0x5b4130,PL=0xe6d6b8,ST=[0x8f8778,0x9d9483,0x847c6e];
  boxM(4.8,0.9,4.0,0x8f8574,g,0,-0.15,0,0.02);
  boxM(4.3,2.3,3.5,PL,g,0,1.45,0,0.015);
  for(const [x,z] of [[-2.15,-1.75],[2.15,-1.75],[-2.15,1.75],[2.15,1.75]])boxM(0.2,2.4,0.2,WD,g,x,1.5,z,0.01);
  boxM(4.5,0.16,0.24,WD,g,0,2.62,1.75,0.008);boxM(4.5,0.16,0.24,WD,g,0,2.62,-1.75,0.008);
  gableRoof(4.3,3.5,1.7,0xa8844e,g,0,2.7,0,0.03);
  boxM(0.7,2.6,0.6,0x8a8070,g,-1.3,3.6,-1.0,0.015);
  const door=boxM(0.9,1.8,0.08,0x7a5030,g,-0.9,1.2,1.79,0.01);
  const glassM=new THREE.MeshToonMaterial({color:0x3a2a1c,gradientMap,emissive:new THREE.Color(0xffb35c),emissiveIntensity:0});
  const win=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.85,0.1),glassM);win.position.set(0.9,1.55,1.77);g.add(win);
  boxM(1.14,0.08,0.16,0xd9c39a,g,0.9,2.02,1.78);boxM(1.2,0.08,0.22,0xd9c39a,g,0.9,1.1,1.8);boxM(0.06,0.85,0.12,0xd9c39a,g,0.9,1.55,1.8);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:POOL_TEX,color:0xffb35c,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));halo.position.set(0.9,1.55,2.05);halo.scale.setScalar(3.4);halo.renderOrder=6;g.add(halo);
  const pool=new THREE.Mesh(new THREE.CircleGeometry(2.6,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:POOL_TEX,color:new THREE.Color(1.0,0.62,0.28),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));pool.position.set(0.9,0.33,3.2);pool.renderOrder=3;g.add(pool);
  const fence=new THREE.Group();g.add(fence);const R=6.6;
  for(let k=0;k<26;k++){const a=k/26*6.283;if(Math.abs(angWrap(a-Math.PI/2))<0.3)continue;const x=Math.cos(a)*R,z=Math.sin(a)*R;cylM(0.05,0.06,1.0,0x6b4c33,fence,x,0.45,z,5);}
  for(let k=0;k<26;k++){const a=(k+0.5)/26*6.283;if(Math.abs(angWrap(a-Math.PI/2))<0.4)continue;const x=Math.cos(a)*R,z=Math.sin(a)*R;boxM(1.55,0.06,0.05,0x7a5a3c,fence,x,0.75,z,0,0,-a+Math.PI/2,0);}
  const leaves=[];for(const sd of [-1,1]){const lf=new THREE.Group();lf.position.set(sd*1.0,0,R);g.add(lf);for(const y of [0.35,0.75])boxM(0.95,0.08,0.05,0x7a5a3c,lf,-sd*0.48,y,0);leaves.push({lf,sd});}
  for(let k=0;k<5;k++)boxM(0.6+Math.random()*0.3,0.08,0.45,ST[k%3],g,0.2+(k%2)*0.2,0.05,2.6+k*0.8);
  const bench=new THREE.Group();bench.position.set(2.4,0,2.6);g.add(bench);boxM(1.3,0.08,0.4,0x8a6a4a,bench,0,0.45,0);for(const x of [-0.5,0.5])boxM(0.08,0.45,0.35,WD,bench,x,0.22,0);
  for(let k=0;k<6;k++){const a=k*1.05+0.4,r=4.4;cylM(0.18,0.22,0.2,0x9c8b74,g,Math.cos(a)*r,0.1,Math.sin(a)*r-0.6,8);}
  addCollider(LS.x,LS.z,2.6);BUILDINGS.push({x:LS.x,z:LS.z,r:7});
  return {g,glassM,halo,pool,leaves,gk:0,lamp:0,door};
})();
const sachi=(()=>{
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);root.visible=false;
  const M=(c)=>makeToon(c,{rim:0.36,noHeal:true});
  const mesh=(geo,mat,parent,x=0,y=0,z=0,ol=0.014)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);if(ol)addOutline(m,ol);return m;};
  mesh(new THREE.LatheGeometry([new THREE.Vector2(0.001,0),new THREE.Vector2(0.34,0),new THREE.Vector2(0.3,0.3),new THREE.Vector2(0.24,0.7),new THREE.Vector2(0.18,0.8),new THREE.Vector2(0.001,0.82)],16),M(0x6a5a7a),body,0,0.02,0);
  mesh(new THREE.TorusGeometry(0.2,0.07,6,14).rotateX(Math.PI/2),M(0xc8a46a),body,0,0.8,0,0.01);
  const arms=[];for(const sx of [-1,1]){const pv=new THREE.Group();pv.position.set(sx*0.22,0.76,0);body.add(pv);mesh(new THREE.CapsuleGeometry(0.055,0.24,4,8),M(0x6a5a7a),pv,0,-0.16,0.04,0.01);mesh(new THREE.SphereGeometry(0.05,8,6),M(0xe0bc98),pv,0,-0.33,0.06,0.008);arms.push(pv);}
  const head=new THREE.Group();head.position.set(0,1.07,0.02);body.add(head);
  mesh(new THREE.SphereGeometry(0.22,22,16),M(0xecc8a6),head,0,0,0,0.016);
  mesh(new THREE.SphereGeometry(0.235,20,12,0,Math.PI*2,0,1.2),M(0xd8d4cc),head,0,0.02,-0.01,0.012);
  mesh(new THREE.SphereGeometry(0.1,10,8),M(0xd8d4cc),head,0,0.12,-0.2,0.01);
  for(const sx of [-1,1]){mesh(new THREE.SphereGeometry(0.026,8,6).scale(1,0.6,0.5),M(0x21160f),head,sx*0.08,0.0,0.19,0);mesh(new THREE.SphereGeometry(0.035,8,6).scale(1,0.5,0.3),M(0xf2a08e),head,sx*0.13,-0.07,0.16,0);}
  scene.add(root);const p=lsW(-0.2,3.0);root.position.set(p.x,groundH(p.x,p.z),p.z);
  return {root,body,head,arms,face:0,nod:0};
})();
function syncLamplight(){sachi.root.visible=!!(S.story&&S.story.gate);}
function lamplightVisuals(t,dt){
  const s=S.story||{};const L=lamplight;L.gk=damp(L.gk,s.gate?1:0,1.2,dt);for(const lf of L.leaves)lf.lf.rotation.y=-lf.sd*L.gk*1.4;
  const want=s.done?0:smooth(0.1,0.5,nightF+(1-skyHeal)*0.1);L.lamp=damp(L.lamp,want,s.done?0.5:2,dt);
  const fl=1+0.05*Math.sin(t*7.1)*Math.sin(t*3.3);L.glassM.emissiveIntensity=L.lamp*3.2*fl;L.halo.material.opacity=L.lamp*0.9;L.pool.material.opacity=L.lamp*0.55;
  if(sachi.root.visible){const near=Math.hypot(player.pos.x-sachi.root.position.x,player.pos.z-sachi.root.position.z)<7;const want2=near?Math.atan2(player.pos.x-sachi.root.position.x,player.pos.z-sachi.root.position.z):LS.ry;
    sachi.face+=angWrap(want2-sachi.face)*(1-Math.exp(-2*dt));sachi.root.rotation.y=sachi.face;sachi.nod=Math.max(0,sachi.nod-dt);sachi.head.rotation.x=(talk.on&&talk.who==='sachi'?Math.sin(t*4)*0.05:0)+(sachi.nod>0?Math.sin(sachi.nod*8)*0.12:0);}
  if(!s.gate&&storyReady()&&mode==='play'&&!cine){s.gate=true;syncLamplight();after(1.5,()=>{showCardBrief({k:'Lamplight Shore',t:'The gate is open',s:'Mira left word: "Grandmother wants to meet the one who sent the boat."'});SFX.moment();auSwell();});hud.tasksHTML='';writeSave();}
  if(!hasPiece('window')&&L.lamp>0.6&&mode==='play'&&lsDist(player.pos.x,player.pos.z)<110){_v.set(LS.x-camera.position.x,0,LS.z-camera.position.z).normalize();camera.getWorldDirection(_v2);_v2.y=0;_v2.normalize();if(_v.dot(_v2)>0.88)piece('window');}
  festVisuals(t,dt);
}
/* the far shore */
const rim=()=>STORY_TEXT;
function lampTalk(){
  if(talk.on)return;const s=S.story;
  if(s.done){const L=rim().sachi;talk.lines=[L[(S.gameDay+Math.floor(simTime/40))%L.length]];talk.onEnd=null;}
  else{talk.lines=rim().talk.slice();talk.onEnd=lampEnd;}
  talk.who='sachi';talk.on=true;talk.i=0;sachi.nod=0.8;$('talk').hidden=false;$('talkWho').textContent='Sachi';$('talkLine').textContent=talk.lines[0];SFX.page();
  if(document.pointerLockElement)document.exitPointerLock();
}
function lampEnd(){
  const s=S.story,R=rim();s.done=true;s.fest=(S.gameDay|0)+1;s.seen.end=false;
  const c=lsW(0.9,2.5);sparkle(c.x,groundH(c.x,c.z)+1.5,c.z,30);auSwell();SFX.moment();player.happy=8;
  showCardBrief({k:R.card[0],t:R.card[1],s:R.card[2]});
  const kp='Your old basket · from Lamplight Shore';if(!S.keepsakes.includes(kp))S.keepsakes.push(kp);
  after(6.5,()=>{showCatch({kicker:'A letter from Mr. Oda · kept in your journal',name:'',note:`“${R.oda}”`,dur:11000});SFX.page();});
  after(18,()=>toast('Your journal has a last page (J).'));
  hud.tasksHTML='';writeSave();
}
/* the yearly boat festival on the pond */
const festBoats=[];for(let i=0;i<12;i++){const b=makeReedBoat();b.g.visible=false;b.g.scale.setScalar(1.0);scene.add(b.g);festBoats.push({b,a:i/12*6.283,r:7+(i%4)*3.2,sp:0.03+0.01*(i%3)});}
let festShown=-1;
function festOn(){const s=S.story;if(!s||!s.done)return false;const d=new Date();return (S.gameDay|0)===s.fest||(d.getMonth()===5&&d.getDate()===9);}
function festVisuals(t,dt){
  const on=festOn()&&nightF>0.45&&SEASON!=='winter';
  for(const f of festBoats){f.b.g.visible=on;if(!on)continue;f.a+=dt*f.sp;const x=Math.cos(f.a)*f.r,z=Math.sin(f.a)*f.r;f.b.g.position.set(x,levelCur+0.04+Math.sin(t*1.2+f.a*3)*0.015,z);f.b.g.rotation.y=-f.a;f.b.fl.scale.y=0.85+0.25*Math.sin(t*13+f.a*5);}
  if(on&&festShown!==S.gameDay&&mode==='play'){festShown=S.gameDay;toast(rim().fest);}
}

/* ================================================================
   Furniture, earned by playing (cosmetic variants later); sleeping in the bed
   ================================================================ */
function grantFurniture(id,quiet){if(S.earned[id])return;S.earned[id]=true;S.stored[id]=(S.stored[id]||0)+1;collectFurn(id);if(!quiet)toast(`Earned for the cottage: ${DECOR_BY_ID[id].name}. Press B inside to place it.`);if(decor.on)renderDecorUI();writeSave();}
function collectFurn(id){}
function checkEarned(){
  if(mode!=='play')return;
  const fishKinds=SPECIES.filter(s=>s.type==='fish'&&S.col[s.id]).length,found=SPECIES.filter(s=>S.col[s.id]).length;
  if(hStage()>=2)grantFurniture('table');if(hStage()>=3)grantFurniture('bed');if(oda.met>=3)grantFurniture('chair');if(fishKinds>=5)grantFurniture('rug');
  if(found>=15)grantFurniture('shelf');if((S.harvests|0)>=3)grantFurniture('plant');if(mira.met>=3)grantFurniture('basket');if((S.photos|0)>=3)grantFurniture('lamp');
  if(Object.values(S.ciders).some(v=>v>0))grantFurniture('ciderrack');
}
function canSleep(){const L=dayLen();return S.hours>=L.set-0.6||S.hours<L.rise;}
function bakeWorld(){
  bakeStatic(mill.g,o=>o===mill.wheel);bakeStatic(cottage);
  bakeStatic(home.g,o=>[home.ruin,home.roofG,home.walls,home.hearth,home.hearthRuin].includes(o));
  for(const gr of [home.ruin,home.roofG,home.walls,home.hearthRuin])bakeStatic(gr);bakeStatic(home.hearth,o=>o===home.fire);
  for(const b of boardwalk){bakeStatic(b.fixed);bakeStatic(b.broken);}
  bakeStatic(weaveSite.g,o=>Object.values(weaveSite.items).includes(o));for(const it of Object.values(weaveSite.items))bakeStatic(it);
  for(const g of STATIC_GROUPS)bakeStatic(g);
}
bakeWorld();
function sleepUntilMorning(){
  if(!canSleep()){toast('You rest a moment. It is still light out.');return;}
  const f=$('sleepFade');f.hidden=false;requestAnimationFrame(()=>f.classList.add('on'));SFX.page();
  after(1.3,()=>{S.hours=dayLen().rise+0.6;S.gameDay++;pickWeather();gardenOvernight();layoutGather();layoutRbReeds();toast('You slept until morning. The fire kept the cottage warm.');dailyEvent('sleep');writeSave();
    after(0.3,()=>{f.classList.remove('on');setTimeout(()=>{f.hidden=true;},1200);});});
}

/* ================================================================
   Interactions
   ================================================================ */
const _ip=new THREE.Vector3();
const INTERACTS=[];
piles.forEach(p=>INTERACTS.push({x:p.x,z:p.z,r:2.9,state(){if(p.cleared||p.anim>=0)return null;const bl=HOOKS.pileBlocked&&HOOKS.pileBlocked(p);if(bl)return bl;return {ok:true,text:'Clear the debris pile',hold:1.4};},done(){clearPile(p);},pos:()=>_ip.set(p.x,groundH(p.x,p.z)+1.0,p.z)}));
INTERACTS.push({x:sluice.south.x,z:sluice.south.z,r:5.2,state(){
  if(sluice.built||sluice.anim>=0)return null;
  if(stage()<1)return {ok:false,text:'Old sluice gate · clear the pond debris first'};
  {const bl=HOOKS.sluiceBlocked&&HOOKS.sluiceBlocked();if(bl)return bl;}
  if(S.inv.wood<8||S.inv.stone<5)return {ok:false,text:`Sluice gate · needs 8 driftwood, 5 stone (you have ${S.inv.wood}, ${S.inv.stone})`};
  return {ok:true,text:'Rebuild the sluice gate',hold:3.0};},done(){buildSluice();},pos:()=>_ip.set(sluice.x,sluice.bed+sluice.H+0.6,sluice.z)});
CLUMPS.forEach(c=>INTERACTS.push({x:c.x,z:c.z,r:2.6,state(){if(c.harvested)return null;if(stage()<2)return {ok:false,text:'Wild reeds · divide them once the pond settles'};return {ok:true,text:'Divide the wild reeds',hold:1.0};},done(){harvestClump(c);},pos:()=>_ip.set(c.x,groundH(c.x,c.z)+1.6,c.z)}));
SPOTS.forEach(s=>INTERACTS.push({x:s.x,z:s.z,r:2.3,state(){if(s.planted||stage()<2)return null;if(S.inv.reed<1)return {ok:false,text:'Planting spot · gather reed shoots upstream past the mill'};return {ok:true,text:'Plant reed shoots',hold:1.0};},done(){plantSpot(s);},pos:()=>_ip.set(s.x,groundH(s.x,s.z)+1.0,s.z)}));
/* the Old Orchard */
brambles.forEach(b=>INTERACTS.push({x:b.x,z:b.z,r:2.9,state(){if(b.cleared||b.anim>=0)return null;if(oStage()<0)return {ok:false,text:'Bramble thicket · restore Mill Pond first'};{const bl=HOOKS.brambleBlocked&&HOOKS.brambleBlocked(b);if(bl)return bl;}return {ok:true,text:'Cut back the brambles',hold:1.6};},done(){clearBramble(b);},pos:()=>_ip.set(b.x,groundH(b.x,b.z)+1.1,b.z)}));
stoneHeaps.forEach(h=>INTERACTS.push({x:h.x,z:h.z,r:2.5,state(){if(h.left<=0)return null;const os=oStage();if(os<0||os>1)return null;if(os<1)return {ok:false,text:'Old stone heap · cut back the brambles first'};return {ok:true,text:`Gather stone · ${h.left} left here`,hold:0.8};},
  done(){h.left--;syncStoneHeap(h);S.inv.stone++;toast('+1 stone');SFX.knock(0,240);SFX.get();puff(h.x,groundH(h.x,h.z)+0.3,h.z,8,_dust,0.3);writeSave();},pos:()=>_ip.set(h.x,groundH(h.x,h.z)+0.9,h.z)}));
chanSegs.forEach(c=>INTERACTS.push({x:c.ix,z:c.iz,r:2.7,state(){if(c.fixedOK||c.anim>=0)return null;const os=oStage();if(os<0)return null;if(os<1)return {ok:false,text:'A broken stretch of channel · cut back the brambles first'};
  if(S.inv.stone<3)return {ok:false,text:`Broken channel · needs 3 stone (you have ${S.inv.stone})`};return {ok:true,text:'Reline the channel with stone',hold:2.0};},done(){fixChannel(c);},pos:()=>_ip.set(c.x,groundH(c.x,c.z)+0.9,c.z)}));
INTERACTS.push({x:oldApple.x,z:oldApple.z,r:3.8,state(){const os=oStage();if(os<0)return null;if(os<2)return {ok:false,text:'The old apple tree · it will share cuttings once water returns'};if(os>2)return null;
  const need=stumps.filter(s=>!s.planted).length-S.inv.cut;if(need<=0)return null;{const bl=HOOKS.cuttingsBlocked&&HOOKS.cuttingsBlocked();if(bl)return bl;}return {ok:true,text:'Take cuttings from the old apple tree',hold:1.2};},done(){takeCuttings();},pos:()=>_ip.set(oldApple.x,groundH(oldApple.x,oldApple.z)+2.4,oldApple.z)});
INTERACTS.push({x:press.ix,z:press.iz,r:3.0,state(){if(press.fixedOK||press.anim>=0)return null;const os=oStage();if(os<0)return null;if(os<3)return {ok:false,text:'An old cider press · the orchard needs its trees first'};
  if(S.inv.wood<PRESS_WOOD)return {ok:false,text:`Cider press · needs ${PRESS_WOOD} wood (you have ${S.inv.wood})`};return {ok:true,text:'Mend the cider press with bramble wood',hold:2.8};},done(){fixPress();},pos:()=>_ip.set(press.x,groundH(press.x,press.z)+2.2,press.z)});
stumps.forEach(s=>INTERACTS.push({x:s.x,z:s.z,r:2.3,state(){if(s.planted||oStage()<2)return null;if(S.inv.cut<1)return {ok:false,text:'Old stump · take a cutting from the old apple tree'};return {ok:true,text:'Graft a cutting onto the stump',hold:1.0};},done(){graftStump(s);},pos:()=>_ip.set(s.x,groundH(s.x,s.z)+0.9,s.z)}));
{const it={x:0,z:0,r:2.8,upd(){if(oda.state==='home'){it.x=oda.root.position.x;it.z=oda.root.position.z;}else it.x=1e6;},
  state(){if(oda.state!=='home'||talk.on)return null;return {ok:true,text:odaVisitReady()?'Talk with Mr. Oda':'Chat with Mr. Oda',hold:0.35};},done(){talkStart();},pos:()=>_ip.set(oda.root.position.x,oda.root.position.y+2.0,oda.root.position.z)};INTERACTS.push(it);}
for(let i=0;i<MAX_DECOR*2;i++){const it={x:0,z:0,r:1.9,pen:0.5,upd(){const e=S.decor[i];if(e&&!decor.sel&&(decor.on||e.id==='bed')){it.x=e.x;it.z=e.z;}else it.x=1e6;},
  state(){const e=S.decor[i];if(!e)return null;if(!decor.on)return e.id==='bed'?{ok:true,text:canSleep()?'Sleep until morning':'Lie down for a moment',hold:0.8}:null;return {ok:true,text:`Pick up the ${DECOR_BY_ID[e.id].name.toLowerCase()}`,hold:0.9};},done(){const e=S.decor[i];if(!decor.on&&e&&e.id==='bed')sleepUntilMorning();else pickUpDecor(i);},pos:()=>{const e=S.decor[i];return e?_ip.set(e.x,groundH(e.x,e.z)+1.2,e.z):_ip.set(0,0,0);}};INTERACTS.push(it);}
/* v5: the cottage, the garden, apples, drinks at the press, gathering, the Reedbeds and Mira */
INTERACTS.push({x:home.ix,z:home.iz,r:3.2,state(){if(stage()<3)return {ok:false,text:'A ruined cottage · restore Mill Pond first'};const h=hStage();if(h>=3||homeBusy)return null;const st=HOME_STEPS[h+1];
  if(!canAfford(st.cost))return {ok:false,text:`${st.t} · needs ${costText(st.cost)} (you have ${S.inv.wood} wood, ${S.inv.stone} stone)`};return {ok:true,text:st.t,hold:2.6};},done(){buildHomeStep();},pos:()=>_ip.set(home.ix,HOME_H+2.2,home.iz)});
garden.forEach((G2,i)=>INTERACTS.push({x:G2.x,z:G2.z,r:1.7,state(){return plotState(i);},done(){plotAct(i);},pos:()=>_ip.set(G2.x,groundH(G2.x,G2.z)+0.9,G2.z)}));
stumps.forEach((st,i)=>INTERACTS.push({x:st.x+0.9,z:st.z+0.4,r:2.2,pen:0.3,state(){if(!st.planted||!applesInSeason()||S.applePick[i]===S.gameDay)return null;return {ok:true,text:'Pick apples',hold:0.8};},
  done(){S.applePick[i]=S.gameDay;S.crops.apples=(S.crops.apples||0)+2;const isNew=collect('apples',true);toast(isNew?'+2 apples · new in your journal':'+2 apples');SFX.rustle();SFX.get();sparkle(st.x+0.9,groundH(st.x,st.z)+1.8,st.z+0.4,8);dailyEvent('harvest');writeSave();},pos:()=>_ip.set(st.x+0.9,groundH(st.x,st.z)+2.0,st.z+0.4)}));
INTERACTS.push({x:press.ix,z:press.iz,r:3.0,state(){if(!press.fixedOK)return null;const c=Object.keys(DRINKS).find(k=>(S.crops[k]||0)>=3);if(c)return {ok:true,text:`Press 3 ${CROP_NAME[c]} into ${DRINKS[c].name.toLowerCase()}`,hold:2.2};
  if(Object.values(S.crops).some(v=>v>0))return {ok:false,text:'Cider press · bring 3 of one crop'};return null;},done(){pressDrink();},pos:()=>_ip.set(press.x,groundH(press.x,press.z)+2.2,press.z)});
function pressDrink(){const c=Object.keys(DRINKS).find(k=>(S.crops[k]||0)>=3);if(!c)return;S.crops[c]-=3;const dk=DRINKS[c];S.ciders[dk.id]=(S.ciders[dk.id]||0)+1;const isNew=collect(dk.id,true);
  showCatch({kicker:isNew?'Pressed · new in your journal':'Pressed',art:silSVG(SPECIES_BY_ID[dk.id],true),name:dk.name,note:SPECIES_BY_ID[dk.id].note,dur:4000});SFX.knock(0,200);SFX.get();press.screwSpin=2.2;dailyEvent('cider');writeSave();}
GATHER.forEach(G3=>INTERACTS.push({x:G3.x,z:G3.z,r:2.0,state(){if(!gatherAvail(G3))return null;return {ok:true,text:G3.type==='wood'?'Gather fallen branches':'Gather river stones',hold:0.9};},
  done(){S.gather[G3.id]=S.gameDay;S.inv[G3.type]+=2;toast(G3.type==='wood'?'+2 wood':'+2 stone');SFX.rustle();SFX.get();layoutGather();dailyEvent('gather');writeSave();},pos:()=>_ip.set(G3.x,groundH(G3.x,G3.z)+0.8,G3.z)}));
RCLUMPS.forEach(c=>INTERACTS.push({x:c.x,z:c.z,r:2.4,state(){if(rbStage()<0||!reedAvail(c.i))return null;return {ok:true,text:'Cut an armful of reeds',hold:1.0};},
  done(){S.reed.cut[c.i]=S.gameDay;S.inv.reed+=2;toast('+2 reeds');SFX.rustle();SFX.get();layoutRbReeds();writeSave();},pos:()=>_ip.set(c.x,groundH(c.x,c.z)+1.6,c.z)}));
(()=>{const l=Math.hypot(mill.x,mill.z)||1;const x=mill.x-mill.x/l*6.5,z=mill.z-mill.z/l*6.5;
  INTERACTS.push({x,z,r:2.6,state(){if(stage()<2||hasPiece('postcard'))return null;return {ok:true,text:'A board on the mill wall is loose',hold:0.9};},
    done(){SFX.rustle();piece('postcard',false);},pos:()=>_ip.set(x,groundH(x,z)+1.4,z)});})();
(()=>{const w=lsW(-0.2,4.0);INTERACTS.push({x:w.x,z:w.z,r:2.6,state(){if(!(S.story&&S.story.gate)||talk.on)return null;return S.story.done?{ok:true,text:'Sit with Sachi a while',hold:0.4}:{ok:true,text:'Show her your old basket',hold:1.4};},
  done(){lampTalk();},pos:()=>_ip.set(sachi.root.position.x,sachi.root.position.y+1.7,sachi.root.position.z)});})();
/* v8: a small "Slide" prompt around the frozen pond's edge */
(()=>{const lv=LEVELS[3];for(let k=0;k<14;k++){const a=k/14*6.283;let r=6;for(;r<70;r+=0.5)if(groundH(Math.cos(a)*r,Math.sin(a)*r)>lv+0.05)break;if(r>=70)continue;
  const x=Math.cos(a)*(r-1.2),z=Math.sin(a)*(r-1.2);
  INTERACTS.push({x,z,r:4.2,state(){if(SEASON!=='winter'||waterU.uIceN.value<0.6||player.ice||onBridge(player.pos.x,player.pos.z))return null;return {ok:false,verb:'Slide',text:'The pond is frozen · walk out onto the ice (Shift to glide faster)'};},
    done(){},pos:()=>_ip.set(x,levelCur+1.0,z)});}})();
INTERACTS.push({x:WEAVE.x,z:WEAVE.z,r:2.8,state(){if(rbStage()<1)return null;const w=nextWeave();if(!w)return null;
    if(Object.entries(w.cost).some(([k,v])=>S.inv[k]<v))return {ok:false,text:`Weaving frame · ${w.name} needs ${reedCost(w.cost)} (you have ${S.inv.reed} reeds${w.cost.wood?`, ${S.inv.wood} wood`:''})`};
    return {ok:true,text:`Weave ${w.name}`,hold:2.0};},
  done(){weaveNext();},pos:()=>_ip.set(WEAVE.x,groundH(WEAVE.x,WEAVE.z)+1.7,WEAVE.z)});
INTERACTS.push({x:WEAVE.lx,z:WEAVE.lz,r:2.4,state(){if(!S.reed.woven.boat||S.reed.floated||boatRun)return null;return {ok:true,text:'Set the reed boat on the stream',hold:1.2};},
  done(){launchBoat();},pos:()=>_ip.set(WEAVE.lx,groundH(WEAVE.lx,WEAVE.lz)+1.0,WEAVE.lz)});
boardwalk.forEach(b=>INTERACTS.push({x:b.ix,z:b.iz,r:2.6,state(){if(rbStage()<0||S.reed.bw[b.i])return null;if(S.inv.wood<1||S.inv.reed<2)return {ok:false,text:`Broken boardwalk · needs 1 wood and 2 reeds (you have ${S.inv.wood}, ${S.inv.reed})`};return {ok:true,text:'Mend this stretch of boardwalk',hold:1.8};},
  done(){mendBoardwalk(b);},pos:()=>_ip.set(b.x,groundH(b.x,b.z)+1.0,b.z)}));
{const it={x:0,z:0,r:2.6,upd(){if(mira.state==='home'){it.x=mira.root.position.x;it.z=mira.root.position.z;}else it.x=1e6;},state(){if(mira.state!=='home'||talk.on)return null;return {ok:true,text:miraVisitReady()?'Talk with Mira':'Watch the heron with Mira',hold:0.35};},done(){miraTalk();},pos:()=>_ip.set(mira.root.position.x,mira.root.position.y+1.7,mira.root.position.z)};INTERACTS.push(it);}
/* fishing at the ripples (cast range), sketching sightings, picking up gifts */
for(let i=0;i<3;i++){const it={x:0,z:0,r:11,pen:4,upd(){const s=FSPOTS[i];if(s){it.x=s.x;it.z=s.z;}else{it.x=1e6;}},
  state(){const s=FSPOTS[i];if(!s||FISH.state!=='idle'||depthAt(player.pos.x,player.pos.z)>0.75)return null;if(s.kind==='pond'&&waterU.uIceN.value>0.6)return {ok:true,text:'Fish through a hole in the ice',hold:0.35};return {ok:true,text:'Cast your line at the ripples',hold:0.35};},
  done(){if(FSPOTS[i])fishStart(FSPOTS[i]);},pos:()=>{const s=FSPOTS[i];return s?_ip.set(s.x,spotY(s)+0.8,s.z):_ip.set(0,0,0);}};INTERACTS.push(it);}
for(let i=0;i<5;i++){const it={x:0,z:0,r:2.8,upd(){const s=SIGHT.list[i];if(s){it.x=s.g.position.x;it.z=s.g.position.z;}else it.x=1e6;},
  state(){const s=SIGHT.list[i];if(!s)return null;const known=!!S.col[s.sp.id];const word={insect:'little creature',bird:'bird',flower:'flower'}[s.sp.type];return {ok:true,text:known?`Sketch the ${s.sp.name.toLowerCase()}`:`Sketch this ${word}`,hold:1.2};},
  done(){const s=SIGHT.list[i];if(s)sketchSight(s);},pos:()=>{const s=SIGHT.list[i];return s?_ip.copy(s.g.position).add(_v2.set(0,0.6,0)):_ip.set(0,0,0);}};INTERACTS.push(it);}
for(let i=0;i<12;i++){const it={x:0,z:0,r:2.2,upd(){const d=S.gifts[i];if(d){it.x=d.x;it.z=d.z;}else it.x=1e6;},
  state(){const d=S.gifts[i];if(!d)return null;return {ok:true,text:d.type==='drift'?'Pick up the driftwood':d.type==='stone'?'Pick up the smooth stone':'Pick up the bottle',hold:0.6};},
  done(){pickGift(i);},pos:()=>{const d=S.gifts[i];return d?_ip.set(d.x,groundH(d.x,d.z)+0.8,d.z):_ip.set(0,0,0);}};INTERACTS.push(it);}

const interact={cur:null,st:null,hold:0,needRelease:false};
const keys=new Set();
const tapUntil={};
let jumpQ=-1;
function keyDown(code){return keys.has(code)||(tapUntil[code]!==undefined&&simTime<tapUntil[code]);}
function findInteract(){
  let best=null,bd=1e9;
  const fx=Math.sin(player.face),fz=Math.cos(player.face);
  for(const it of INTERACTS){
    if(it.upd)it.upd();
    const dx=it.x-player.pos.x,dz=it.z-player.pos.z;const d=Math.hypot(dx,dz);if(d>it.r)continue;
    const st=it.state();if(!st)continue;
    const facing=(dx*fx+dz*fz)/(d+1e-4);const score=d-facing*0.6+(it.pen||0);
    if(score<bd){bd=score;best={it,st};}
  }
  return best;
}
const _dust=new THREE.Color(0.55,0.47,0.36);
function interactStep(dt){
  if(mode!=='play'||cine||journalOpen||photo.on||talk.on||FISH.state!=='idle'){interact.cur=null;interact.st=null;interact.hold=0;return;}
  const f=findInteract();
  if(!f){interact.cur=null;interact.st=null;interact.hold=0;return;}
  if(interact.cur!==f.it){interact.cur=f.it;interact.hold=0;}
  interact.st=f.st;
  const held=keyDown('KeyE');
  if(!held)interact.needRelease=false;
  if(f.st.ok&&held&&!interact.needRelease){
    interact.hold+=dt;player.busy=0.2;
    const tp=f.it.pos();player.faceT=Math.atan2(tp.x-player.pos.x,tp.z-player.pos.z);
    if(rnd()<dt*4)SFX.rustle();
    if(rnd()<dt*14)fxSoft.emit(tp.x+rr(-0.5,0.5),tp.y-0.6+rr(-0.2,0.3),tp.z+rr(-0.5,0.5),rr(-0.5,0.5),rr(0.6,1.4),rr(-0.5,0.5),_dust,0.18,rr(0.5,0.9),2.0,1.2);
    if(interact.hold>=f.st.hold){interact.hold=0;interact.needRelease=true;interact.st=null;f.it.done();promptKey='';}
  }else interact.hold=Math.max(0,interact.hold-dt*3);
}
const promptEl=$('prompt'),promptText=$('promptText'),promptVerb=$('promptVerb'),ringFill=$('ringFill');
let promptKey='';
const _proj=new THREE.Vector3();
function screenOf(v){_proj.copy(v).project(camera);return {x:(_proj.x*0.5+0.5)*innerWidth,y:(-_proj.y*0.5+0.5)*innerHeight,behind:_proj.z>1};}
function interactUI(){
  if(!interact.cur||!interact.st){promptEl.hidden=true;return;}
  const st=interact.st;
  const key=st.text+st.ok;
  if(key!==promptKey){promptKey=key;promptText.textContent=st.text;promptVerb.textContent=st.verb||(st.ok?'Hold E':'Not yet');promptEl.classList.toggle('locked',!st.ok);}
  promptEl.hidden=false;
  const sp=screenOf(interact.cur.pos());
  let x=sp.x,y=sp.y;
  if(sp.behind||x<60||x>innerWidth-60||y<80||y>innerHeight-40){x=innerWidth/2;y=innerHeight*0.72;}
  promptEl.style.left=x+'px';promptEl.style.top=(y-8)+'px';
  const k=st.ok?clamp(interact.hold/(st.hold||1),0,1):0;
  ringFill.style.strokeDashoffset=String(113.1*(1-k));
}
const wpEl=$('waypoint'),wpText=$('wpText');
function waypointUI(){
  if(mode!=='play'||cine||journalOpen||photo.on){wpEl.hidden=true;return;}
  let target=null;
  const n=decor.on?{t:YARD,d:Math.hypot(YARD.x-player.pos.x,YARD.z-player.pos.z)-YARD.r+4}:nearestOf(primaryTargets());
  if(n)target=n;else{const e=ERRANDS.find(e=>!S.errands[e.id]&&e.avail()&&e.x!==undefined);if(e)target={t:e,d:Math.hypot(e.x-player.pos.x,e.z-player.pos.z)};}
  if(!target||target.d<4.5){wpEl.hidden=true;return;}
  wpEl.hidden=false;
  const tx=target.t.x,tz=target.t.z;const ty=Math.max(groundH(tx,tz),levelCur)+2.4;
  const sp=screenOf(_v.set(tx,ty,tz));
  const m=48;let x=sp.x,y=sp.y;let edge=false;
  if(sp.behind){x=innerWidth-x;y=innerHeight-y;edge=true;}
  if(x<m||x>innerWidth-m||y<m+20||y>innerHeight-m)edge=true;
  if(edge){
    const cx=innerWidth/2,cy=innerHeight/2;let dx=x-cx,dy=y-cy;if(Math.abs(dx)<1&&Math.abs(dy)<1)dy=1;
    const s=Math.min((innerWidth/2-m)/Math.max(Math.abs(dx),1e-3),(innerHeight/2-m)/Math.max(Math.abs(dy),1e-3));
    x=cx+dx*s;y=cy+dy*s;
    wpEl.querySelector('.arrow').style.transform=`rotate(${Math.atan2(dy,dx)*180/Math.PI+90}deg)`;
  }
  wpEl.classList.toggle('edge',edge);
  wpEl.style.left=x+'px';wpEl.style.top=y+'px';
  wpText.textContent=`${Math.round(target.d)} m`;
}
function glowUI(t){
  const prim=mode==='title'?[]:primaryTargets();
  glowRingMat.opacity=0.35+0.25*Math.sin(t*2.4);
  glowShellMat.opacity=0.22+0.16*Math.sin(t*2.4);
  glowRings.forEach((m,i)=>{const p=prim[i];if(!p){m.visible=false;return;}m.visible=true;
    const y=Math.max(groundH(p.x,p.z),levelCur)+0.06;m.position.set(p.x,y,p.z);const s=p.r*(1+0.06*Math.sin(t*2.4+i));m.scale.set(s,1,s);});
  for(const p of piles){const on=stage()===0&&!p.cleared&&p.anim<0;for(const s of p.shells)s.visible=on;}
  for(const b of brambles){const on=oStage()===0&&!b.cleared&&b.anim<0;for(const s of b.shells)s.visible=on;}
  if(prim.length&&rnd()<0.25){const p=prim[(rnd()*prim.length)|0];if(Math.hypot(p.x-player.pos.x,p.z-player.pos.z)<45){const y=Math.max(groundH(p.x,p.z),levelCur);_a.setRGB(2.0,1.6,0.8);fxGlow.emit(p.x+rr(-p.r,p.r),y+0.2,p.z+rr(-p.r,p.r),0,rr(0.5,1.1),0,_a,rr(0.05,0.09),rr(1.2,2.2),-0.05,0.5,0.25);}}
}
const lookEl=$('lookHint');let everLocked=false,lookQuietT=0;
function lookHintUI(dt){
  const show=mode==='play'&&!cine&&!journalOpen&&!photo.on&&document.pointerLockElement!==canvas&&!dragging;
  lookEl.hidden=!show;
  if(show){lookQuietT+=dt;lookEl.classList.toggle('quiet',everLocked||lookQuietT>8);}
}

const tmpCol=new THREE.Color();
function puff(x,y,z,n,col,size=0.3){for(let i=0;i<n;i++)fxSoft.emit(x+rr(-0.6,0.6),y+rr(0,0.5),z+rr(-0.6,0.6),rr(-1.2,1.2),rr(0.5,2),rr(-1.2,1.2),col,size*rr(0.7,1.3),rr(0.7,1.4),0.6,1.6);}
function sparkle(x,y,z,n){for(let i=0;i<n;i++){tmpCol.setRGB(2.2,1.9,1.1);fxGlow.emit(x+rr(-0.7,0.7),y+rr(0,0.8),z+rr(-0.7,0.7),rr(-0.4,0.4),rr(0.4,1.4),rr(-0.4,0.4),tmpCol,rr(0.06,0.12),rr(0.8,1.6),-0.1,1.0,0.3);}}

function clearPile(p){
  p.anim=0;if(piles.filter(q=>q.cleared||q===p).length>=2)piece('lantern');
  S.inv.wood+=2;S.inv.stone+=1;
  toast('+2 driftwood, +1 stone');SFX.knock(0,220);SFX.knock(0.12,180);SFX.get();
  puff(p.x,groundH(p.x,p.z)+0.2,p.z,18,new THREE.Color(0.62,0.55,0.44),0.4);
  sparkle(p.x,groundH(p.x,p.z)+0.3,p.z,10);
  addRipple(p.x,p.z,1.2);
  after(0.95,()=>{p.cleared=true;p.g.visible=false;p.anim=-1;
    if(piles.every(q=>q.cleared))completeProject(1,new THREE.Vector3(p.x,0,p.z));else writeSave();});
}
function buildSluice(){
  sluice.anim=0;S.inv.wood-=8;S.inv.stone-=5;
  toast('-8 driftwood, -5 stone');SFX.page();
  puff(sluice.x,sluice.bed+1.0,sluice.z,26,new THREE.Color(0.66,0.6,0.5),0.5);
  for(let i=0;i<10;i++)SFX.knock(0.25+i*0.26,rr(170,260));
  after(3.0,()=>{sluice.built=true;sluice.anim=-1;completeProject(2,new THREE.Vector3(sluice.x,0,sluice.z));});
}
function harvestClump(c){c.harvested=true;S.inv.reed+=2;layoutWildReeds();toast('+2 reed shoots');SFX.rustle();SFX.get();puff(c.x,groundH(c.x,c.z)+0.4,c.z,10,new THREE.Color(0.45,0.55,0.3),0.25);writeSave();}
function plantSpot(s){
  s.planted=true;s.growing=true;s.grow=0;S.inv.reed-=1;spotMarkers[s.idx].visible=false;
  SFX.plant();sparkle(s.x,groundH(s.x,s.z)+0.2,s.z,14);addRipple(s.x,s.z,0.8);
  if(SPOTS.every(q=>q.planted))after(1.4,()=>completeProject(3,new THREE.Vector3(s.x,0,s.z)));else writeSave();
}

function clearBramble(b){
  b.anim=0;S.inv.wood+=1;toast('+1 wood');SFX.rustle();SFX.knock(0.1,200);SFX.get();
  puff(b.x,groundH(b.x,b.z)+0.3,b.z,16,new THREE.Color(0.42,0.38,0.3),0.4);sparkle(b.x,groundH(b.x,b.z)+0.4,b.z,8);
  after(0.95,()=>{b.cleared=true;b.g.visible=false;b.anim=-1;if(brambles.every(q=>q.cleared))completeOrchard(1,new THREE.Vector3(b.x,0,b.z));else writeSave();});
}
function fixChannel(c){
  c.anim=0;S.inv.stone-=3;toast('-3 stone');SFX.page();for(let i=0;i<6;i++)SFX.knock(0.2+i*0.25,rr(200,280));
  puff(c.x,groundH(c.x,c.z)+0.4,c.z,14,new THREE.Color(0.66,0.6,0.5),0.4);
  after(2.0,()=>{c.fixedOK=true;c.anim=-1;if(chanSegs.every(q=>q.fixedOK))completeOrchard(2,new THREE.Vector3(c.x,0,c.z));else writeSave();});
}
function takeCuttings(){const need=stumps.filter(s=>!s.planted).length-S.inv.cut;const n=Math.max(1,Math.min(2,need));S.inv.cut+=n;S.cutTaken+=n;toast(`+${n} apple cutting${n>1?'s':''}`);SFX.rustle();SFX.get();sparkle(oldApple.x,groundH(oldApple.x,oldApple.z)+2.2,oldApple.z,10);writeSave();}
function fixPress(){
  press.anim=0;S.inv.wood-=PRESS_WOOD;toast(`-${PRESS_WOOD} wood`);SFX.page();for(let i=0;i<8;i++)SFX.knock(0.2+i*0.3,rr(170,260));
  puff(press.x,groundH(press.x,press.z)+0.8,press.z,20,new THREE.Color(0.62,0.55,0.44),0.45);
  after(3.0,()=>{press.fixedOK=true;press.anim=-1;completeOrchard(4,new THREE.Vector3(press.x,0,press.z));});
}
function graftStump(s){
  s.planted=true;s.growing=true;s.grow=0;s.tree.g.visible=true;if(s.dap)s.dap.visible=SEASON!=='winter';S.inv.cut--;SFX.plant();sparkle(s.x,groundH(s.x,s.z)+0.4,s.z,14);
  if(stumps.every(q=>q.planted))after(2.6,()=>completeOrchard(3,new THREE.Vector3(s.x,0,s.z)));else writeSave();
}
const CARDS_B=[null,
  {k:'Restoration · Old Orchard',t:'Room to breathe',s:'With the brambles cut back, the old rows show through the grass again.'},
  {k:'Restoration · Old Orchard',t:'The channel runs again',s:'Water from the stream finds its old way into the orchard.'},
  {k:'Restoration · Old Orchard',t:'The orchard remembers',s:'Eight young trees from one old one. Come back in every season.'},
  {k:'Restoration · Old Orchard',t:'The press turns again',s:'Somewhere down the lane, someone has heard the old screw creak.'}];
function startSweepB(center,heal){G.uHealPrevB.value=G.uHealNextB.value;G.uHealNextB.value=heal;G.uSweepCB.value.set(center.x,center.z);G.uSweepRB.value=0;sweepB.active=true;sweepB.t=0;}
function completeOrchard(n,center){
  startSweepB(center,HEALS_B[n]);auSwell();player.happy=6;
  startCine(CARDS_B[n],center,{pivot:new THREE.Vector3(ORCH.x,0,ORCH.z),radius:27,height:6,lookY:3.5,warp:n===4,dir:new THREE.Vector3(1,0,0.35)});
  if(n===4)after(9.6,()=>odaArrive(false));
  writeSave();
}
const CARDS=[null,
  {k:'Restoration · Mill Pond',t:'The water finds its way',s:'With the debris cleared, the flood begins to drain and the meadow breathes again.'},
  {k:'Restoration · Mill Pond',t:'The old gate holds',s:'The pond settles back to its banks. Listen: the ducks are coming home.'},
  {k:'Restoration · Mill Pond',t:'Life returns to Mill Pond',s:'Reeds take root along the shore. Stay a while; the fireflies come out at dusk.'}];
function startSweep(center,heal){
  G.uHealPrev.value=G.uHealNext.value;G.uHealNext.value=heal;G.uSweepC.value.set(center.x,center.z);G.uSweepR.value=0;sweep.active=true;sweep.t=0;
}
function completeProject(n,center){
  AU.level=n;for(const f of HOOKS.project)f(n);if(n>=2)after(9,()=>piece('gate'));
  startSweep(center,HEALS[n]);
  auSwell();
  player.happy=6;
  if(n===1){spawnButterflies();after(4,()=>sighting('butterflies'));}
  if(n===2){spawnDucks(false);after(5.5,()=>{sighting('ducks');toast('New in your journal: Mallard');});spotMarkers.forEach((m,i)=>m.visible=!SPOTS[i].planted);}
  if(n===3&&PARAMS.edition!=='prologue')after(9.4,()=>{setBarrierOpen(true);toast('The fallen log across the west lane has rolled aside.');hud.tasksHTML='';});
  startCine(CARDS[n],center,{warp:n===3,floor:LEVELS[n],lookY:LEVELS[n],height:8});
  writeSave();
}
function startCine(card,center,opt={}){
  const pv=opt.pivot||new THREE.Vector3(0,0,0);
  const dir=opt.dir?opt.dir.clone():new THREE.Vector3(center.x-pv.x,0,center.z-pv.z);if(dir.lengthSq()<1)dir.set(0,0,1);dir.normalize();
  const R=opt.radius||44;
  const to=new THREE.Vector3(pv.x+dir.x*R,0,pv.z+dir.z*R);to.y=Math.max(groundH(to.x,to.z),opt.floor??-9)+(opt.height||8);
  const startH=S.hours;const L=dayLen();const warp=!!opt.warp&&startH>L.rise-0.5&&startH<L.set-1.2;
  if(FISH.state!=='idle')fishStop(true);
  cine={t:0,dur:8.5,from:camera.position.clone(),fromLook:cam.look.clone(),to,pivot:pv.clone(),toLook:new THREE.Vector3(pv.x,(opt.lookY??2)+4,pv.z),warp,startH,warpTo:L.set-0.6,card,cardShown:false};
  $('letterbox').classList.add('on');$('hud').classList.add('dim');
  if(document.pointerLockElement)document.exitPointerLock();
}
function endCine(){
  $('letterbox').classList.remove('on');$('hud').classList.remove('dim');
  const card=$('card');card.classList.add('out');setTimeout(()=>{card.hidden=true;card.classList.remove('out');},900);
  cine=null;
}

/* ================================================================
   Input (taps are latched so short presses always register)
   ================================================================ */
let dragging=false,lastX=0,lastY=0;
canvas.addEventListener('pointerdown',(e)=>{
  if(mode!=='play'||journalOpen)return;
  if(cine){cine.t=Math.max(cine.t,cine.dur-1.4);return;}
  dragging=true;lastX=e.clientX;lastY=e.clientY;
  if(e.pointerType==='mouse'&&!document.pointerLockElement){try{const r=canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(err){}}
});
window.addEventListener('pointerup',()=>{dragging=false;});
document.addEventListener('pointerlockchange',()=>{const l=document.pointerLockElement===canvas;canvas.classList.toggle('locked',l);if(l)everLocked=true;});
window.addEventListener('pointermove',(e)=>{
  if(mode!=='play'||journalOpen||cine)return;
  let dx=0,dy=0;
  if(document.pointerLockElement===canvas){dx=e.movementX;dy=e.movementY;}
  else if(dragging){dx=e.clientX-lastX;dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;}
  else return;
  if(photo.on){photo.yaw-=dx*0.0024;photo.pitch=clamp(photo.pitch-dy*0.002,-1.4,1.4);return;}
  cam.yaw-=dx*0.0026;cam.pitch=clamp(cam.pitch+dy*0.0022,-0.35,1.2);lastLookT=simTime;
});
canvas.addEventListener('wheel',(e)=>{if(mode!=='play')return;e.preventDefault();
  if(photo.on){photo.fov=clamp(photo.fov*(1+Math.sign(e.deltaY)*0.06),18,80);return;}
  cam.dist=clamp(cam.dist*(1+Math.sign(e.deltaY)*0.08),3.5,13);},{passive:false});
const MOVE_KEYS=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
window.addEventListener('keydown',(e)=>{
  if(mode!=='play')return;
  if(e.code==='KeyP'&&!e.repeat&&!journalOpen&&!cine){if(photo.on)photoExit();else photoEnter();return;}
  if(photo.on){
    if(!$('photoShot').hidden){if(e.code==='Escape')$('photoShot').hidden=true;return;}
    if(e.code==='Escape'){photoExit();return;}
    if(e.code==='Space'){e.preventDefault();if(!e.repeat)photo.shoot=true;return;}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    keys.add(e.code);return;
  }
  if(talk.on){if(['KeyE','Space','Enter'].includes(e.code)&&!e.repeat){e.preventDefault();talkNext();}else if(e.code==='Escape')talkEnd();return;}
  if(e.code==='Tab'){e.preventDefault();if(!e.repeat){tabPeek=!tabPeek;applyHudMode();}return;}
  if(e.code==='KeyJ'){e.preventDefault();if(!e.repeat){if(decor.on)decorClose();setJournal(!journalOpen);}return;}
  if(e.code==='KeyB'&&!e.repeat&&!journalOpen&&!cine){if(decor.on)decorClose();else decorOpen();return;}
  if(decor.on&&!journalOpen){if(e.code==='KeyR'&&!e.repeat){decorTurn();return;}if((e.code==='KeyF'||e.code==='Enter')&&!e.repeat){decorPlace();return;}if(e.code==='Escape'){decorClose();return;}}
  if(e.code==='Escape'&&journalOpen){setJournal(false);return;}
  if(e.code==='KeyM'&&!e.repeat){setMuted(!AU.muted);writeSave();return;}
  if(e.code==='Backquote'&&!e.repeat){toggleDebug();return;}
  if(journalOpen)return;
  if(cine&&(e.code==='KeyE'||e.code==='Space'||e.code==='Escape')){cine.t=Math.max(cine.t,cine.dur-1.4);interact.needRelease=true;e.preventDefault();return;}
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);
  if(!e.repeat){tapUntil[e.code]=simTime+0.12;if(e.code==='Space')jumpQ=simTime+0.2;if(e.code==='KeyE')ePressN++;}
  if(MOVE_KEYS.includes(e.code))hideHintSoon();
});
window.addEventListener('keyup',(e)=>{keys.delete(e.code);});
window.addEventListener('blur',()=>{keys.clear();});
let hintTimer=null;
function hideHintSoon(){if(hintTimer)return;hintTimer=setTimeout(()=>$('hint').classList.add('gone'),9000);}
$('openJournal').addEventListener('click',()=>setJournal(true));
$('btnClose').addEventListener('click',()=>setJournal(false));
$('btnSound').addEventListener('click',()=>{setMuted(!AU.muted);writeSave();});
$('btnDebug').addEventListener('click',()=>{toggleDebug();renderJournal();});
let resetArm=false;
$('btnReset').addEventListener('click',()=>{
  if(!resetArm){resetArm=true;$('btnReset').textContent='Tap again to erase this valley';$('btnReset').classList.add('warn');setTimeout(()=>{resetArm=false;$('btnReset').textContent='Start the valley over';$('btnReset').classList.remove('warn');},4000);return;}
  clearSave();location.reload();
});
$('journal').addEventListener('pointerdown',(e)=>{if(e.target===$('journal'))setJournal(false);});

/* ================================================================
   Day, light and palette
   ================================================================ */
const C=(h)=>new THREE.Color(h);
const PAL={
  dayZen:[C(0x1a5ad0),C(0x4f6a8e)],dayMid:[C(0x3f8ee8),C(0x8ea4bc)],dayHor:[C(0x9fd2f6),C(0xdcd8cc)],
  goldZen:[C(0x3a4fa0),C(0x4c5a86)],goldMid:[C(0xe08aa0),C(0xb7949e)],goldHor:[C(0xffa860),C(0xe8b894)],
  twiZen:[C(0x1a2e66),C(0x1e2b4e)],twiMid:[C(0x4a4f8a),C(0x45506e)],twiHor:[C(0xd88a6a),C(0x9a8a8a)],
  nightZen:[C(0x081638),C(0x0b1428)],nightMid:[C(0x12285a),C(0x15233e)],nightHor:[C(0x24427a),C(0x26365a)],
  sunDay:[C(0xfff1d2),C(0xf4e2c8)],sunGold:[C(0xff9a3c),C(0xf6b07a)],
  cLitDay:[C(0xffffff),C(0xf2efe8)],cShDay:[C(0xa6bde0),C(0x8d9bb0)],
  cLitGold:[C(0xffc890),C(0xf4cfae)],cShGold:[C(0xb07090),C(0x8f8296)],
  cLitTwi:[C(0xe0a090),C(0x9a8f9a)],cShTwi:[C(0x404878),C(0x3a4058)],
  cLitNight:[C(0x3a4c7a),C(0x34405c)],cShNight:[C(0x111c3a),C(0x141c30)],
  mtFar:[C(0xa6bfe0),C(0xb0bccb)],mtMid:[C(0x7e9fc6),C(0x93a3b4)],mtNear:[C(0x4f7f86),C(0x76878f)]
};
const _a=new THREE.Color(),_b=new THREE.Color(),_c=new THREE.Color(),_d=new THREE.Color();
function pal(name,out){return out.copy(PAL[name][1]).lerp(PAL[name][0],skyHeal);}
function mixSky(day,gold,twi,night,out){pal(day,_a);pal(gold,_b);_a.lerp(_b,goldF);pal(twi,_c);pal(night,_d);_c.lerp(_d,deepF);return out.copy(_a).lerp(_c,nightF);}
const zen=new THREE.Color(),mid=new THREE.Color(),hor=new THREE.Color(),sunC=new THREE.Color();
const SH_FLOOD=new THREE.Color(0.8,0.9,1.08),SH_DAY=new THREE.Color(0.82,0.87,1.16),SH_GOLD=new THREE.Color(0.78,0.8,1.22),SH_NIGHT=new THREE.Color(0.86,0.9,1.12);
const LIT_FLOOD=new THREE.Color(1.0,1.0,0.98),LIT_DAY=new THREE.Color(1.05,1.04,0.9),LIT_GOLD=new THREE.Color(1.16,0.98,0.76),LIT_NIGHT=new THREE.Color(0.84,0.93,1.14);
const MOON=new THREE.Color(0.55,0.66,1.0),NIGHT_AMB=new THREE.Color(0.3,0.42,0.82),GREY=new THREE.Color(0.52,0.6,0.74);

function advanceClock(dt){
  if(cine&&cine.warp)return;
  const h=S.hours+dt/(mode==='play'?20:60);
  if(h>=24){S.hours=h-24;S.gameDay++;pickWeather();layoutGather();layoutRbReeds();}else S.hours=h;
}
/* the sun rises and sets at the season's real-ish hours; night runs the other half of the circle */
function sunAngle(h){const L=dayLen();if(h>=L.rise&&h<=L.set)return (h-L.rise)/(L.set-L.rise)*Math.PI;const nl=24-L.set+L.rise;const k=h>L.set?h-L.set:h+24-L.set;return Math.PI+k/nl*Math.PI;}
let useMoon=false;
function updateDay(dt){
  if(cine&&cine.warp){S.hours=lerp(cine.startH,cine.warpTo,ease(clamp(cine.t/(cine.dur-1),0,1)));}
  const P=SEASONS[SEASON];
  const ang=sunAngle(S.hours);
  sunDir.set(Math.cos(ang)*0.82,Math.sin(ang)*P.peak,-0.48).normalize();
  moonDir.set(-sunDir.x*0.6+0.15,Math.abs(sunDir.y)*0.8+0.3,-0.55).normalize();
  const elev=sunDir.y;
  nightF=1-smooth(-0.2,0.04,elev);
  deepF=smooth(-0.14,-0.5,elev);
  goldF=smooth(-0.1,0.05,elev)*(1-smooth(0.12,0.4,elev));
  updateWeather(dt);
  skyHeal=damp(skyHeal,G.uHealNext.value,0.6,dt);
  if(showerT>0)showerT-=dt;
  rainK=damp(rainK,Math.max(RAIN[stage()],W.rain,showerT>0?0.85:0),showerT>0?1.2:0.5,dt);
  mixSky('dayZen','goldZen','twiZen','nightZen',zen);mixSky('dayMid','goldMid','twiMid','nightMid',mid);mixSky('dayHor','goldHor','twiHor','nightHor',hor);
  pal('sunDay',_a);pal('sunGold',_b);sunC.copy(_a).lerp(_b,goldF);
  const grey=W.cloud*W.cloud*0.42;
  if(grey>0.01){_a.copy(GREY).multiplyScalar(lerp(1,0.22,nightF));zen.lerp(_a,grey*0.7);mid.lerp(_a,grey);hor.lerp(_a,grey*0.6);}
  const wetSky=Math.max(W.cloud,rainK*0.9);
  if(wetSky>0.3&&goldF>0.01){_b.setRGB(1.0,0.82,0.68).multiplyScalar(lerp(0.95,0.5,nightF));hor.lerp(_b,goldF*0.5*wetSky);mid.lerp(_b.setRGB(0.66,0.7,0.82),goldF*0.35*wetSky);}
  skyU.uZen.value.copy(zen);skyU.uMid.value.copy(mid);skyU.uHor.value.copy(hor);skyU.uSunCol.value.copy(sunC);
  skyU.uSunDir.value.copy(sunDir);skyU.uMoonDir.value.copy(moonDir);skyU.uNight.value=nightF;skyU.uDeep.value=deepF;
  skyU.uCover.value=lerp(0.33,0.46,skyHeal)+W.cover;skyU.uOvercast.value=clamp(Math.max((1-skyHeal)*0.75,W.over),0,1);
  skyU.uBank.value=clamp((0.55+0.4*goldF+0.15*nightF)*(1-W.cloud*0.35)*(rainK>0.5?0.5:1),0,1);skyU.uBankWarm.value=clamp(goldF+nightF*(1-deepF)*0.8,0,1);
  mixSky('cLitDay','cLitGold','cLitTwi','cLitNight',skyU.uCloudLit.value);mixSky('cShDay','cShGold','cShTwi','cShNight',skyU.uCloudShade.value);
  skyU.uGround.value.copy(hor).multiplyScalar(0.6).lerp(_a.setRGB(0.2,0.3,0.22),0.45).multiplyScalar(1-nightF*0.5);
  /* three mountain ridges: the farther, the paler and bluer */
  const mDark=lerp(1,lerp(0.5,0.3,deepF),nightF);
  [['mtFar',0.64],['mtMid',0.4],['mtNear',0.16]].forEach(([nm,haze],i)=>{const u=mountU[i];pal(nm,_a).multiplyScalar(mDark);
    u.uTop.value.copy(_a).lerp(hor,haze);u.uBot.value.copy(hor).lerp(u.uTop.value,(1-haze)*0.45);u.uRimC.value.copy(sunC).multiplyScalar(goldF*(0.18+0.12*i)*(1-nightF));});
  scene.fog.color.copy(hor).lerp(mid,0.18).lerp(_c.setRGB(0.62,0.68,0.76).multiplyScalar(lerp(1,0.2,nightF)),wetSky*0.35);
  scene.fog.near=lerp(34,70,skyHeal)*(1-W.cloud*0.25)*(rbDist(player.pos.x,player.pos.z)<34?0.5:1);scene.fog.far=lerp(280,400,skyHeal)*(1-nightF*0.2)*(1-rainK*0.3);
  const sunI=(1-nightF)*lerp(2.1,3.1,skyHeal)*smooth(-0.04,0.07,elev)*(1-W.cloud*0.4);
  const moonI=nightF*lerp(0.55,0.28,deepF)*(1-W.cloud*0.5);
  useMoon=moonI>sunI;
  const ld=useMoon?moonDir:sunDir;
  sun.intensity=Math.max(sunI,moonI);sun.color.copy(useMoon?MOON:sunC);
  hemi.intensity=(lerp(1.05+0.2*skyHeal,lerp(0.8,0.46,deepF),nightF)*(1-goldF*0.2)+W.cloud*0.15*(1-nightF))*(1+G.uSnow.value*0.4*nightF);
  hemi.color.copy(hor).lerp(zen,0.4).lerp(NIGHT_AMB,nightF);
  hemi.groundColor.setRGB(0.22,0.32,0.2).lerp(_a.setRGB(0.18,0.24,0.28),1-skyHeal).lerp(_b.setRGB(0.08,0.1,0.15),nightF);
  { const duskF=nightF*(1-deepF)+goldF*0.35;hemi.groundColor.lerp(_b.setRGB(0.42,0.3,0.17),clamp(duskF,0,1)*0.6);hemi.intensity+=0.32*clamp(nightF*(1-deepF),0,1); }
  G.uShadowTint.value.copy(SH_FLOOD).lerp(SH_DAY,skyHeal).lerp(SH_GOLD,goldF).lerp(SH_NIGHT,nightF).lerp(_c.setRGB(0.76,0.86,1.2),wetSky*0.5);
  G.uLitTint.value.copy(LIT_FLOOD).lerp(LIT_DAY,skyHeal).lerp(LIT_GOLD,goldF*(1-wetSky*0.55)).lerp(LIT_NIGHT,nightF).lerp(_c.setRGB(0.99,1.0,1.02),wetSky*0.4);
  G.uSat.value=lerp(0.88,1.08,skyHeal)+goldF*0.16-nightF*0.2;
  G.uSunW.value.copy(sunDir);G.uBack.value=(0.25+goldF*1.5)*(1-nightF)*(1-W.cloud*0.6);
  G.uCloudOff.value.x+=dt*0.035;G.uCloudOff.value.y+=dt*0.014;
  G.uCloudCov.value=lerp(0.5,0.6,skyHeal)-W.cloud*0.22;
  G.uCloudShadow.value=lerp(0.62,0.42,skyHeal)*(1-nightF)*(1-rainK*0.4)*(1-W.cloud*0.3);
  const px=player.pos.x,pz=player.pos.z,texel=80/Math.max(sun.shadow.mapSize.x,512);
  const cx=Math.round(px/texel)*texel,cz=Math.round(pz/texel)*texel;
  sun.target.position.set(cx,player.pos.y,cz);sun.position.set(cx+ld.x*110,player.pos.y+ld.y*110,cz+ld.z*110);
  G.uRimCol.value.copy(sunC).lerp(MOON,nightF).multiplyScalar((0.85+goldF*0.9+(1-skyHeal)*0.2)*(1-nightF*0.55));
  waterU.uSunDir.value.copy(ld);waterU.uSunCol.value.copy(useMoon?MOON:sunC).multiplyScalar(useMoon?0.4:1);
  waterU.uZen.value.copy(zen);waterU.uHor.value.copy(hor).lerp(mid,0.3);waterU.uNight.value=nightF;waterU.uCloudLit.value.copy(skyU.uCloudLit.value);
  waterU.uRain.value=rainK;
  try{ const Lv=waterU.uLights.value;let li=0;const put=(x,y,z,w)=>{if(li<8&&w>0.01)Lv[li++].set(x,y,z,w);};
    const lk=smooth(0.12,0.6,nightF+(1-skyHeal)*0.2);
    if(hStage()>=2)for(const [lx,lz] of [[HX+0.3,0.6],[1.6,HZ+0.3],[1.95,-HZ-0.3]]){const w=homeW(lx,lz);put(w.x,HOME_H+1.55,w.z,lk*0.9);}
    {const w=lsW(0.9,2.0);put(w.x,groundH(LS.x,LS.z)+1.55,w.z,lamplight.lamp*1.2);}
    for(const L of lampLights){if(li>=8)break;put(L.position.x,L.position.y,L.position.z,lk*0.7);}
    while(li<8)Lv[li++].set(0,-99,0,0); }catch(e){}
  const litK=lerp(1,lerp(0.32,0.09,deepF),nightF);waterU.uLit.value=litK;waterU.uMoonDir.value.copy(moonDir);for(const st of streams)st.u.uLit.value=litK;
  waterU.uIce.value=damp(waterU.uIce.value,SEASON==='winter'?1:0,0.8,dt);waterU.uIceN.value=simTime<4?(SEASON==='winter'?1:0):damp(waterU.uIceN.value,SEASON==='winter'?1:0,0.15,dt);if(simTime<4)waterU.uIce.value=SEASON==='winter'?1:0;
  G.uNightRim.value=nightF*0.55;G.uPlayerP.value.set(player.pos.x,player.pos.y+1.0,player.pos.z);
  for(const s of streams){s.u.uSky.value.copy(hor).lerp(zen,0.3);}
  const lampK=smooth(0.12,0.6,nightF+(1-skyHeal)*0.2+W.cloud*0.12);
  for(const m of lanternMats)m.emissiveIntensity=Math.max(lampK,(1-skyHeal)*0.45)*2.8;
  poolMat.opacity=lampK*(0.3+0.16*nightF+0.45*G.uSnow.value);
  for(const gs of glowSprites)gs.material.opacity=lampK*0.92;
  G.uSnow.value=damp(G.uSnow.value,SEASON==='winter'?lerp(0.84,1,W.snow):0,1.5,dt);
  G.uGrassH.value=damp(G.uGrassH.value,SEASON==='winter'?0.42:1,1.5,dt);
  G.uDry.value=damp(G.uDry.value,P.dry||0,1.5,dt);
  G.uWet.value=clamp(rainK*1.25,0,1);
  G.uSkyCol.value.copy(hor).lerp(zen,0.35);
  lampLights.forEach((L,i)=>{L.intensity=lampK*24*(1+0.06*Math.sin(G.uTime.value*7.3+i*2.1)*Math.sin(G.uTime.value*3.1+i));});
  pollen.u.uAlpha.value=(0.15+0.35*skyHeal+goldF*0.4)*(1-nightF*0.85)*(1-rainK*0.6)*P.pollen;
  pollen.u.uCam.value.copy(camera.position);
  rain.u.uRain.value=rainK*(1-nightF*0.3);rain.u.uCam.value.copy(camera.position);
  drift.u.uAmt.value=W.type==='snow'?lerp(P.drift,0.95,W.snow):P.drift*(1+W.cloud*0.3);drift.u.uLight.value=W.type==='snow'?lerp(1,0.72,nightF):lerp(1,0.32,nightF)*(1-deepF*0.3);drift.u.uCam.value.copy(camera.position);
  const dusk=1-smooth(0.0,0.2,elev);
  fireflies.uFire.value=damp(fireflies.uFire.value,(stage()>=3?1:stage()>=1?0.55:0)*(SEASON!=='winter'?1:0)*dusk*(1-rainK*0.7),0.8,dt);
  if(stage()>=3&&fireflies.uFire.value>0.4&&!S.col.firefly){sighting('fireflies');toast('New in your journal: Firefly');}
  G.uWind.value=0.75+0.35*Math.sin(G.uTime.value*0.21)*Math.sin(G.uTime.value*0.13+1.0)+0.15+rainK*0.2+W.cloud*0.15+(showerT>0?0.7:0);
}

/* ================================================================
   Player physics (fixed step)
   ================================================================ */
let gateHintT=-99;
function blocked(x,z){
  if(Math.hypot(x,z)>106&&orchDist(x,z)>25&&rbDist(x,z)>26)return true;
  for(const c of COLLIDERS){if(c.on&&!c.on())continue;if(Math.hypot(x-c.x,z-c.z)<c.r+0.32)return true;}
  return false;
}
function onIce(x,z){return waterU.uIceN.value>0.6&&!onBridge(x,z)&&levelCur-groundH(x,z)>0.02;}
function depthAt(x,z){if(onBridge(x,z))return 0;return levelCur-groundH(x,z);}
function canStep(fx,fz,tx,tz){
  if(blocked(tx,tz))return false;
  if(oStage()<4&&rbDist(tx,tz)<27&&rbDist(fx,fz)>=27){if(simTime-gateHintT>8){gateHintT=simTime;toast('A fence and thick mist close the path upstream. Perhaps once the cider press turns again.');}return false;}
  if(stage()<3&&orchDist(tx,tz)<24&&orchDist(fx,fz)>=24){if(simTime-gateHintT>8){gateHintT=simTime;toast('Brambles choke the way up to the old orchard. Restore Mill Pond first.');}return false;}
  if(!(S.story&&S.story.gate)&&lsDist(tx,tz)<7.0&&lsDist(fx,fz)>=7.0){if(simTime-gateHintT>8){gateHintT=simTime;toast(hasPiece('window')?'The garden gate is latched. Inside, the lamp is burning, as it always is.':'A low garden gate, latched. A lamp burns in the window.');}return false;}
  const d1=depthAt(tx,tz),d0=depthAt(fx,fz);
  if(d1>1.0&&d1>d0-0.005&&!onIce(tx,tz))return false;
  const iH=(x,z)=>onIce(x,z)?Math.max(walkH(x,z),levelCur+0.03):walkH(x,z);const h0=iH(fx,fz),h1=iH(tx,tz),run=Math.hypot(tx-fx,tz-fz)+1e-5;
  if((h1-h0)/run>1.05&&player.grounded&&!(h1-h0<0.34&&homeFloor(tx,tz)>-1e8))return false;
  return true;
}
function hs0(p){return Math.hypot(p.vel.x,p.vel.z);}
function playerStep(dt){
  const p=player;
  let ix=0,iz=0;
  const control=mode==='play'&&!cine&&!journalOpen&&!photo.on&&FISH.state==='idle'&&!talk.on;
  if(control){
    if(keyDown('KeyW')||keyDown('ArrowUp'))iz+=1;if(keyDown('KeyS')||keyDown('ArrowDown'))iz-=1;
    if(keyDown('KeyD')||keyDown('ArrowRight'))ix+=1;if(keyDown('KeyA')||keyDown('ArrowLeft'))ix-=1;
  }
  const fwdX=-Math.sin(cam.yaw),fwdZ=-Math.cos(cam.yaw),rtX=Math.cos(cam.yaw),rtZ=-Math.sin(cam.yaw);
  let mx=fwdX*iz+rtX*ix,mz=fwdZ*iz+rtZ*ix;const ml=Math.hypot(mx,mz);if(ml>0){mx/=ml;mz/=ml;}
  const ice=onIce(p.pos.x,p.pos.z);p.ice=ice;
  const depth=ice?0:Math.max(0,depthAt(p.pos.x,p.pos.z));
  const wade=lerp(1,0.5,clamp(depth/0.9,0,1));
  const run=keyDown('ShiftLeft')||keyDown('ShiftRight');
  const busy=p.busy>0;p.busy=Math.max(0,p.busy-dt);
  const speed=(run?6.2:3.4)*wade*(busy?0:1)*(ice?1.25:1);
  const accel=p.grounded?(ice?(ml>0?1.7:0.45):14):3;
  if(p.roll>0){p.roll-=dt;const k=clamp(p.roll/0.36,0,1);p.vel.x=p.rollX*(4+8*k);p.vel.z=p.rollZ*(4+8*k);}
  else if(p.kb>0){p.kb-=dt;}
  else{p.vel.x=damp(p.vel.x,mx*speed*(p.slow||1),accel,dt);p.vel.z=damp(p.vel.z,mz*speed*(p.slow||1),accel,dt);}
  const nx=p.pos.x+p.vel.x*dt,nz=p.pos.z+p.vel.z*dt;
  if(canStep(p.pos.x,p.pos.z,nx,nz)){p.pos.x=nx;p.pos.z=nz;}
  else if(canStep(p.pos.x,p.pos.z,nx,p.pos.z)){p.pos.x=nx;p.vel.z*=0.5;}
  else if(canStep(p.pos.x,p.pos.z,p.pos.x,nz)){p.pos.z=nz;p.vel.x*=0.5;}
  else{p.vel.x*=0.2;p.vel.z*=0.2;}
  const gh=onIce(p.pos.x,p.pos.z)?Math.max(walkH(p.pos.x,p.pos.z),levelCur+0.03):walkH(p.pos.x,p.pos.z);
  if(ice&&hs0(p)>2.2&&dt>0&&rnd()<dt*14)fxSoft.emit(p.pos.x+rr(-.2,.2),levelCur+0.08,p.pos.z+rr(-.2,.2),-p.vel.x*0.1+rr(-.3,.3),rr(0.3,0.8),-p.vel.z*0.1+rr(-.3,.3),_a.setRGB(0.95,0.97,1.0),0.09,0.45,4,0.5);
  if(control&&jumpQ>simTime&&p.grounded&&!busy){p.vy=6.0;p.grounded=false;p.squash=-0.12;jumpQ=-1;SFX.jump();}
  p.vy-=18*dt;p.pos.y+=p.vy*dt;
  if(p.pos.y<=gh){if(!p.grounded&&p.vy<-3){p.squash=0.16;SFX.land();if(depth>0.05){SFX.splash();addRipple(p.pos.x,p.pos.z,1.4);}}p.pos.y=gh;p.vy=0;p.grounded=true;}
  else if(p.pos.y-gh>0.25)p.grounded=false;
  else if(p.grounded){p.pos.y=gh;}
  const hs=Math.hypot(p.vel.x,p.vel.z);
  if(p.faceLock>0){p.faceLock-=dt;p.idle=0;}
  else if(hs>0.3&&!busy){p.faceT=Math.atan2(p.vel.x,p.vel.z);p.idle=0;}
  else if(!busy&&control){p.idle+=dt;}
  if(busy)p.idle=0;
  if(p.idle>5&&p.idle-dt<=5){p.faceT=Math.atan2(camera.position.x-p.pos.x,camera.position.z-p.pos.z);p.wave=1.6;}
  p.face+=angWrap(p.faceT-p.face)*(1-Math.exp(-(p.idle>5?4:12)*dt));
  p.speedK=damp(p.speedK,clamp(hs/6.2,0,1),10,dt);
  const prevPhase=p.phase;
  p.phase+=dt*(4+hs*2.1);
  if(p.grounded&&hs>0.6&&Math.floor(prevPhase/Math.PI)!==Math.floor(p.phase/Math.PI)){SFX.step(depth>0.05);}
  if(depth>0.05&&hs>0.5){p.ripT-=dt;if(p.ripT<=0){p.ripT=0.32;addRipple(p.pos.x,p.pos.z,0.7);if(rnd()<0.5)fxSoft.emit(p.pos.x,levelCur+0.05,p.pos.z,rr(-.6,.6),rr(1,2),rr(-.6,.6),_a.setRGB(0.9,0.95,1.0),0.12,0.5,6,0.5);}}
  p.squash=damp(p.squash,0,8,dt);
  p.wave=Math.max(0,p.wave-dt);p.happy=Math.max(0,p.happy-dt);
  p.blinkT-=dt;if(p.blinkT<=0){p.blink=0.13;p.blinkT=rr(2.2,5);}p.blink=Math.max(0,p.blink-dt);
}
function playerPose(){
  const p=player,t=G.uTime.value,k=p.speedK,walk=Math.sin(p.phase),busy=p.busy>0;
  p.root.position.copy(p.pos);p.root.rotation.y=p.face;
  const bob=p.grounded?Math.abs(Math.sin(p.phase))*0.06*k:0;
  const breathe=Math.sin(t*2.2)*0.012*(1-k);
  p.body.position.y=bob+breathe;
  p.body.rotation.x=k*0.16+(busy?0.35:0);
  p.body.rotation.z=(1-k)*Math.sin(t*0.9)*0.025;
  p.body.scale.set(1+p.squash*0.5,1-p.squash+breathe*0.5,1+p.squash*0.5);
  const [aL,aR]=p.arms,[lL,lR]=p.legs;
  if(!p.grounded){lL.rotation.x=-0.5;lR.rotation.x=0.3;aL.rotation.x=-1.2;aR.rotation.x=-1.0;aL.rotation.z=-0.5;aR.rotation.z=0.5;}
  else if(FISH.state!=='idle'){aR.rotation.x=-0.95+(FISH.state==='reel'?Math.sin(t*16)*0.12:Math.sin(t*1.6)*0.04);aR.rotation.z=-0.1;aL.rotation.x=-0.5;aL.rotation.z=0.2;lL.rotation.x=0;lR.rotation.x=0;}
  else if(busy){const w=Math.sin(t*12);aL.rotation.x=-1.25+w*0.3;aR.rotation.x=-1.25-w*0.3;aL.rotation.z=0.15;aR.rotation.z=-0.15;lL.rotation.x=0.35;lR.rotation.x=-0.1;}
  else if(p.ice&&k>0.25){const g2=Math.sin(p.phase*0.35);lL.rotation.x=g2*0.45;lR.rotation.x=-g2*0.45;aL.rotation.x=-0.3;aR.rotation.x=-0.3;aL.rotation.z=-1.15+g2*0.15;aR.rotation.z=1.15+g2*0.15;p.body.rotation.z=g2*0.12;}
  else{lL.rotation.x=walk*0.75*k;lR.rotation.x=-walk*0.75*k;aL.rotation.x=-walk*0.7*k;aR.rotation.x=walk*0.7*k;aL.rotation.z=-0.08-0.05*Math.sin(t*2.2)*(1-k);aR.rotation.z=0.08+0.05*Math.sin(t*2.2)*(1-k);
    if(p.wave>0&&k<0.2){aR.rotation.x=-0.2;aR.rotation.z=2.5+Math.sin(t*14)*0.35;}
    else if(p.happy>0&&k<0.2){aL.rotation.z=-2.4;aR.rotation.z=2.4;}}
  const look=p.idle>2.5?Math.sin(t*0.6)*0.5+Math.sin(t*0.23)*0.3:0;
  p.head.rotation.y=look*(1-k);
  p.head.rotation.z=Math.sin(t*1.3)*0.04*(1-k);p.head.rotation.x=busy?0.3:-0.05*k-(p.happy>0?0.15:0);
  p.hat.rotation.z=Math.sin(p.phase*2)*0.04*k;
  p.scarfTail.rotation.x=0.35+k*0.9+Math.sin(t*6+p.phase)*0.12*(0.3+k);p.scarfTail.rotation.z=Math.sin(t*3.1)*0.15;
  const eyeY=p.blink>0?0.12:(p.happy>0?0.45:1);
  for(const e of p.eyes)e.scale.y=eyeY;
  p.mouth.scale.set(p.happy>0?1.5:1,p.happy>0?1.6:1,1);
}

/* ================================================================
   Camera
   ================================================================ */
const _v=new THREE.Vector3(),_v2=new THREE.Vector3(),_v3=new THREE.Vector3(),_v4=new THREE.Vector3(),camLookTmp=new THREE.Vector3();
function updateCamera(dt){
  const t=G.uTime.value;
  if(mode==='title'){
    const a=t*0.03+0.6;camera.position.set(Math.cos(a)*56,9.5+Math.sin(t*0.05)*1.2,Math.sin(a)*56);
    cam.look.set(0,6.5,0);camera.lookAt(cam.look);return;
  }
  cam.target.x=damp(cam.target.x,player.pos.x,10,dt);cam.target.z=damp(cam.target.z,player.pos.z,10,dt);cam.target.y=damp(cam.target.y,player.pos.y+1.25,6,dt);
  cam.inside=damp(cam.inside??0,homeInside()?1:0,4,dt);
  const fr=cam.frame;cam.frameK=damp(cam.frameK||0,fr?1:0,2.5,dt);
  if(fr){cam.target.x=lerp(cam.target.x,lerp(player.pos.x,fr.x,0.32),cam.frameK);cam.target.z=lerp(cam.target.z,lerp(player.pos.z,fr.z,0.32),cam.frameK);
    if(simTime-lastLookT>1.2){const want=Math.atan2(player.pos.x-fr.x,player.pos.z-fr.z);cam.yaw+=angWrap(want-cam.yaw)*(1-Math.exp(-1.6*dt));}}
  const pitchE=lerp(lerp(cam.pitch,0.9,cam.inside),Math.max(cam.pitch,fr?fr.pitch:0.5),cam.frameK),distE=lerp(lerp(cam.dist,5.4,cam.inside),Math.max(cam.dist,fr?fr.dist:10),cam.frameK);
  const cp=Math.cos(pitchE),sp=Math.sin(pitchE);
  const want=_v3.set(cam.target.x+Math.sin(cam.yaw)*cp*distE,cam.target.y+sp*distE+0.4,cam.target.z+Math.cos(cam.yaw)*cp*distE);
  { const tx=cam.target.x,tz=cam.target.z,dx=want.x-tx,dz=want.z-tz,aa=dx*dx+dz*dz;let best=1;
    if(aa>1e-4)for(const c of COLLIDERS){if(c.r<0.3||(c.on&&!c.on()))continue;const fx=tx-c.x,fz=tz-c.z,rad=c.r+0.4;const cc=fx*fx+fz*fz-rad*rad;if(cc<0)continue;
      const bb=2*(fx*dx+fz*dz),disc=bb*bb-4*aa*cc;if(disc<0)continue;const t1=(-bb-Math.sqrt(disc))/(2*aa);if(t1>0&&t1<best)best=t1;}
    best=Math.max(best,1.4/cam.dist,cam.frameK*0.8);cam.pull=damp(cam.pull??1,best,best<(cam.pull??1)?18:2.5,dt);
    want.x=tx+dx*cam.pull;want.z=tz+dz*cam.pull;want.y=cam.target.y+(want.y-cam.target.y)*(0.55+0.45*cam.pull); }
  { const tx=cam.target.x,ty=cam.target.y,tz=cam.target.z;let tb=1;
    for(let i=2;i<=10;i++){const k=i/10;if(groundH(tx+(want.x-tx)*k,tz+(want.z-tz)*k)+0.55>ty+(want.y-ty)*k){tb=Math.max(0.3,(i-1.5)/10);break;}}
    tb=Math.max(tb,cam.frameK*0.7);cam.tpull=damp(cam.tpull??1,tb,tb<(cam.tpull??1)?12:1.8,dt);
    if(cam.tpull<0.999){const k=cam.tpull;want.x=tx+(want.x-tx)*k;want.z=tz+(want.z-tz)*k;want.y=ty+(want.y-ty)*k+(1-k)*1.1;} }
  const floor=Math.max(groundH(want.x,want.z)+0.5,levelCur+0.35);if(want.y<floor)want.y=floor;
  camLookTmp.copy(cam.target).add(_v.set(0,0.35,0));
  if(cine){
    const c=cine;
    const kIn=ease(clamp(c.t/2.6,0,1));
    const orbit=c.t*0.05;const ox=c.to.x-c.pivot.x,oz=c.to.z-c.pivot.z;
    const tp=_v2.set(c.pivot.x+ox*Math.cos(orbit)-oz*Math.sin(orbit),c.to.y,c.pivot.z+ox*Math.sin(orbit)+oz*Math.cos(orbit));
    const camP=_v4.copy(c.from).lerp(tp,kIn);const lookP=_v.copy(c.fromLook).lerp(c.toLook,kIn);
    const kOut=ease(clamp((c.t-(c.dur-1.4))/1.4,0,1));
    camP.lerp(want,kOut);lookP.lerp(camLookTmp,kOut);
    camera.position.copy(camP);cam.look.copy(lookP);camera.lookAt(cam.look);
    if(!c.cardShown&&c.t>1.3){c.cardShown=true;const card=$('card');$('cardKicker').textContent=c.card.k;$('cardTitle').textContent=c.card.t;$('cardSub').textContent=c.card.s;card.classList.remove('out');card.hidden=false;}
    return;
  }
  if(simTime-lastLookT>3.5&&player.speedK>0.15)cam.pitch=damp(cam.pitch,CAM_PITCH,0.9,dt);
  camera.position.copy(want);cam.look.copy(camLookTmp);
  if(cam.shake>0){cam.shake=Math.max(0,cam.shake-dt*2.6);const k=cam.shake*cam.shake*0.5;camera.position.x+=(Math.random()-0.5)*k;camera.position.y+=(Math.random()-0.5)*k;camera.position.z+=(Math.random()-0.5)*k;}
  camera.lookAt(cam.look);
}

/* ================================================================
   World simulation (fixed step) and visuals (per frame)
   ================================================================ */
function worldStep(dt){
  const t=G.uTime.value;
  for(let i=timers.length-1;i>=0;i--){timers[i].t-=dt;if(timers[i].t<=0){const f=timers[i].fn;timers.splice(i,1);f();}}
  if(cine){cine.t+=dt;if(cine.t>=cine.dur)endCine();}
  const st=stage();
  levelCur=damp(levelCur,LEVELS[st],0.32,dt);
  G.uWaterY.value=levelCur;water.position.y=levelCur;waterU.uLevel.value=levelCur;
  for(const s of streams)s.u.uLevel.value=levelCur;
  outletU.uFlow.value=damp(outletU.uFlow.value,sluice.built||sluice.anim>2.2?1:0,0.8,dt);
  if(sweep.active){sweep.t+=dt;G.uSweepR.value=ease(clamp(sweep.t/sweep.dur,0,1))*240;
    if(sweep.t>=sweep.dur){sweep.active=false;G.uHealPrev.value=G.uHealNext.value;G.uSweepR.value=1e5;}}
  mill.wheel.rotation.x-=(st===0?0.06:st===1?0.3:0.7)*dt;
  if(st>=2)sluice.winch.rotation.z=Math.sin(t*0.4)*0.05;
  for(const p of piles){if(p.anim>=0){p.anim+=dt;const k=clamp(p.anim/0.9,0,1);
    p.parts.forEach(m=>{const h=m.userData.home;m.position.set(h.x,h.y+k*k*2.5+Math.sin(k*3.14)*0.4,h.z);m.rotation.x+=m.userData.spin.x*dt;m.rotation.y+=m.userData.spin.y*dt;m.scale.setScalar(Math.max(0.001,1-k*k));});}}
  if(sluice.anim>=0){sluice.anim+=dt;const a=sluice.anim;
    sluice.brokenParts.forEach((m,i)=>{const k=clamp((a-i*0.12)/0.6,0,1);m.scale.setScalar(Math.max(0.001,1-k));if(k>=1)m.visible=false;});
    sluice.builtParts.forEach((m,i)=>{const k=clamp((a-0.5-i*0.2)/0.45,0,1);if(k>0){m.visible=true;m.scale.copy(m.userData.target).multiplyScalar(Math.max(0.001,easeOutBack(k)));
      if(!m.userData.puffed){m.userData.puffed=true;const wp=m.getWorldPosition(_v);puff(wp.x,wp.y,wp.z,5,_a.setRGB(0.68,0.62,0.52),0.3);}}});}
  if(sweepB.active){sweepB.t+=dt;G.uSweepRB.value=ease(clamp(sweepB.t/sweepB.dur,0,1))*70;
    if(sweepB.t>=sweepB.dur){sweepB.active=false;G.uHealPrevB.value=G.uHealNextB.value;G.uSweepRB.value=1e5;}}
  for(const b of brambles){if(b.anim>=0){b.anim+=dt;const k=clamp(b.anim/0.9,0,1);
    b.parts.forEach(m=>{const h=m.userData.home;m.position.set(h.x,h.y+k*k*2.2+Math.sin(k*3.14)*0.4,h.z);m.rotation.x+=m.userData.spin.x*dt;m.rotation.y+=m.userData.spin.y*dt;m.scale.copy(m.userData.s0).multiplyScalar(Math.max(0.001,1-k*k));});}}
  for(const c of chanSegs){if(c.anim>=0){c.anim+=dt;const a=c.anim;
    c.broken.forEach((m,i)=>{const k=clamp((a-i*0.1)/0.5,0,1);m.scale.setScalar(Math.max(0.001,1-k));if(k>=1)m.visible=false;});
    c.fixed.forEach((m,i)=>{const k=clamp((a-0.4-i*0.12)/0.4,0,1);if(k>0){m.visible=true;m.scale.copy(m.userData.target).multiplyScalar(Math.max(0.001,easeOutBack(k)));}});}}
  if(press.anim>=0){press.anim+=dt;const a=press.anim;
    press.broken.forEach((m,i)=>{const k=clamp((a-i*0.1)/0.5,0,1);m.scale.setScalar(Math.max(0.001,1-k));if(k>=1)m.visible=false;});
    press.built.forEach((m,i)=>{const k=clamp((a-0.5-i*0.22)/0.45,0,1);if(k>0){m.visible=true;m.scale.copy(m.userData.target).multiplyScalar(Math.max(0.001,easeOutBack(k)));}});}
  if(press.fixedOK)press.screw.rotation.y+=dt*(oda.state==='home'&&nightF<0.5?0.4:0);
  odaStep(dt);gardenStep(dt);
  for(const s of stumps){if(s.growing){s.grow=Math.min(1,s.grow+dt/2.4);s.tree.g.scale.setScalar(Math.max(0.001,easeOutBack(s.grow)));if(s.grow>=1)s.growing=false;}}
  if(barrier.anim>=0){barrier.anim+=dt;const k=ease(clamp(barrier.anim/2.5,0,1));barrier.g.position.copy(barrier.home).addScaledVector(barrier.perp,4.6*k);barrier.g.rotation.x=2.4*k;if(k>=1)barrier.anim=-1;}
  chanU.uFlow.value=damp(chanU.uFlow.value,chanSegs.every(c=>c.fixedOK)?1:0,0.6,dt);
  fishSpotsStep(dt);sightStep(dt);dailyCheck(dt);scrapStep(dt);
  let regrow=false;for(const s of SPOTS){if(s.growing){s.grow=Math.min(1,s.grow+dt/1.6);regrow=true;if(s.grow>=1)s.growing=false;}}
  if(regrow)layoutPlantedReeds();
  for(const b of creatures.butterflies){
    if(b.pos.distanceTo(b.target)<0.6||rnd()<dt*0.15){
      const near=rnd()<0.6;const cx=near?player.pos.x:0,cz=near?player.pos.z:0;const rad=near?12:55;
      let x=cx+rr(-rad,rad),z=cz+rr(-rad,rad);if(Math.hypot(x,z)<POND_R+2){x*=1.4;z*=1.4;}
      b.target.set(x,Math.max(groundH(x,z),levelCur)+rr(0.5,2.0),z);}
    _v.copy(b.target).sub(b.pos).normalize().multiplyScalar(1.6);
    b.vel.lerp(_v,1-Math.exp(-1.5*dt));b.pos.addScaledVector(b.vel,dt);
  }
  for(const d of creatures.ducks){
    if(d.state==='fly'){
      d.t+=dt;const k=clamp(d.t/6.5,0,1);if(d.t<0)continue;
      const e=ease(k);_v.copy(d.from).lerp(d.land,e);_v.y=lerp(d.from.y,levelCur+0.02,e)+Math.sin(k*Math.PI)*10*(1-k);
      _v2.copy(_v).sub(d.pos);if(_v2.lengthSq()>1e-6)d.heading=Math.atan2(_v2.x,_v2.z);d.pos.copy(_v);
      if(k>=1){d.state='swim';addRipple(d.pos.x,d.pos.z,1.6);SFX.splash();d.target.copy(d.pos);}
    }else{
      if(d.leader&&d.leader.state==='swim'){const L=d.leader;_v.set(d.offset.x,0,d.offset.z).applyAxisAngle(_v4.set(0,1,0),L.heading);d.target.set(L.pos.x+_v.x,0,L.pos.z+_v.z);}
      else if(Math.hypot(d.target.x-d.pos.x,d.target.z-d.pos.z)<0.5||rnd()<dt*0.04){pondPoint(d.target);}
      const dx=d.target.x-d.pos.x,dz=d.target.z-d.pos.z,dd=Math.hypot(dx,dz);
      if(dd>0.2){const want=Math.atan2(dx,dz);d.heading+=angWrap(want-d.heading)*(1-Math.exp(-2*dt));const sp=Math.min(0.75,dd*0.6)*(d.leader?1.4:1);d.pos.x+=Math.sin(d.heading)*sp*dt;d.pos.z+=Math.cos(d.heading)*sp*dt;
        d.ripT-=dt;if(d.ripT<=0){d.ripT=1.1;addRipple(d.pos.x,d.pos.z,0.45);}}
      if(levelCur-groundH(d.pos.x,d.pos.z)<0.25)pondPoint(d.target);
      d.pos.y=levelCur+0.02;
      if(d.kind==='drake'){d.quackT-=dt;if(d.quackT<=0){d.quackT=rr(7,16);if(player.pos.distanceTo(d.pos)<35)SFX.quack();}}
    }
  }
  if(st>=2){
    if(!creatures.birds)creatures.birds=makeBirds();const B=creatures.birds;
    if(B.t<0){B.next-=dt;if(B.next<=0&&nightF<0.4){B.t=0;const a=rnd()*6.28;B.from.set(Math.cos(a)*160,rr(32,48),Math.sin(a)*160);B.to.set(-Math.cos(a)*160+rr(-40,40),B.from.y+rr(-6,6),-Math.sin(a)*160+rr(-40,40));B.g.visible=true;sighting('birds');}}
    else{B.t+=dt;if(B.t/34>=1){B.t=-1;B.next=rr(25,55);B.g.visible=false;}}
  }
  if(st>=3){
    const F=fish;
    if(F.t<0){F.next-=dt;if(F.next<=0){F.t=0;pondPoint(F.from);const a=rnd()*6.28;F.dir.set(Math.cos(a),0,Math.sin(a));F.g.visible=true;addRipple(F.from.x,F.from.z,1.2);if(player.pos.distanceTo(F.from)<40)SFX.splash();}}
    else{F.t+=dt;const k=F.t/0.9;
      if(k>=1){F.t=-1;F.next=rr(4,11);F.g.visible=false;const ex=F.from.x+F.dir.x*1.6,ez=F.from.z+F.dir.z*1.6;addRipple(ex,ez,1.3);for(let i=0;i<8;i++)fxSoft.emit(ex,levelCur+0.05,ez,rr(-1,1),rr(1.5,3),rr(-1,1),_a.setRGB(0.92,0.96,1),0.14,0.6,8,0.4);
        if(Math.hypot(player.pos.x-ex,player.pos.z-ez)<30)sighting('fish');}}
  }else{fish.t=-1;fish.g.visible=false;}
  checkErrands(dt);
}
let breathT=1;
function worldVisuals(dt){
  const t=G.uTime.value;
  if(sweep.active&&rnd()<dt*40){const a=rnd()*6.28,r=G.uSweepR.value;const x=G.uSweepC.value.x+Math.cos(a)*r,z=G.uSweepC.value.y+Math.sin(a)*r;
    if(Math.hypot(x-camera.position.x,z-camera.position.z)<70&&Math.hypot(x,z)<105){const gy=Math.max(groundH(x,z),levelCur);
      const pc=[[1.8,1.5,1.6],[1.9,1.8,1.2],[1.6,1.7,1.9],[1.9,1.4,1.0]][rnd()*4|0];tmpCol.setRGB(pc[0]*0.55,pc[1]*0.55,pc[2]*0.55);
      for(let i=0;i<4;i++)fxSoft.emit(x+rr(-2,2),gy+rr(0.2,1.0),z+rr(-2,2),rr(-0.5,0.5),rr(0.6,1.8),rr(-0.5,0.5),tmpCol,rr(0.1,0.18),rr(2,3.5),-0.05,0.4,0.8);}}
  for(const b of creatures.butterflies){
    b.g.visible=nightF<0.55&&rainK<0.6&&SEASON!=='winter';
    b.g.position.copy(b.pos);b.g.position.y+=Math.sin(t*5+b.ph)*0.06;b.g.rotation.y=Math.atan2(b.vel.x,b.vel.z);
    const flap=Math.sin(t*20+b.ph);b.L.rotation.z=0.2+Math.abs(flap)*1.1;b.R.rotation.z=-(0.2+Math.abs(flap)*1.1);
  }
  for(const d of creatures.ducks){
    d.g.visible=!(d.state==='fly'&&d.t<0);
    d.g.position.copy(d.pos);if(d.state==='swim')d.g.position.y+=Math.sin(t*2+d.ph)*0.02;
    d.g.rotation.y=d.heading;d.g.rotation.z=d.state==='swim'?Math.sin(t*1.7+d.ph)*0.05:0;
    const fly=d.state==='fly';d.wL.visible=d.wR.visible=fly;if(fly){const fl=Math.sin(t*16+d.ph)*0.9;d.wL.rotation.z=fl;d.wR.rotation.z=-fl;}
  }
  const B=creatures.birds;
  if(B&&B.t>=0){const k=B.t/34;B.g.position.copy(B.from).lerp(B.to,k);_v.copy(B.to).sub(B.from);B.g.rotation.y=Math.atan2(_v.x,_v.z);
    for(const b of B.birds){const f=Math.sin(t*9+b.ph);b.L.rotation.z=f*0.7;b.R.rotation.z=-f*0.7;}}
  if(fish.t>=0){const F=fish,k=F.t/0.9;F.g.position.set(F.from.x+F.dir.x*k*1.6,levelCur+Math.sin(k*Math.PI)*1.0-0.1,F.from.z+F.dir.z*k*1.6);F.g.rotation.y=Math.atan2(F.dir.x,F.dir.z);F.g.rotation.x=lerp(-0.9,0.9,k);}
  sightVisuals(t,dt);giftVisuals(dt);fishVisuals(t);odaPose(t,dt);decorVisuals(t);decorStep();homeVisuals(t,dt);reedbedVisuals(t,dt);miraPose(t,dt);if(press.screwSpin>0){press.screwSpin-=dt;press.screw.rotation.y+=dt*3;}
  if(mode==='play'&&(SEASON==='winter'||(SEASON==='autumn'&&nightF>0.7))){breathT-=dt;if(breathT<=0){breathT=rr(2.0,2.8);const f=player.face;_a.setRGB(0.95,0.97,1.0).multiplyScalar(lerp(1,0.55,nightF));
    for(let i=0;i<3;i++)fxSoft.emit(player.pos.x+Math.sin(f)*0.45,player.pos.y+1.16,player.pos.z+Math.cos(f)*0.45,Math.sin(f)*rr(0.35,0.55)+rr(-0.08,0.08),rr(0.06,0.18),Math.cos(f)*rr(0.35,0.55)+rr(-0.08,0.08),_a,rr(0.045,0.075),rr(0.7,1.1),-0.06,1.6,0,0.32);}}
  fxSoft.update(dt,t);fxGlow.update(dt,t);
}

/* ================================================================
   Post-processing: god rays through mist, grade, vignette
   ================================================================ */
const rt=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,samples:0});
const composer=new EffectComposer(renderer,rt);
composer.setPixelRatio(1);composer.setSize(innerWidth,innerHeight);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.5,0.55,0.85);
composer.addPass(bloom);
const grade=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uSun:{value:new THREE.Vector2(0.5,0.5)},uRay:{value:0},uTaps:{value:24},uTh:{value:0.95},uSat:{value:1},uWarm:{value:0},uVig:{value:0.85},uSeed:{value:0}},
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader:`uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uRay,uTaps,uTh,uSat,uWarm,uVig,uSeed; varying vec2 vUv;
    float hh(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec3 col=texture2D(tDiffuse,vUv).rgb;
      if(uRay>0.002&&uTaps>0.5){
        vec2 dl=(vUv-uSun)*(0.9/uTaps); vec2 uv=vUv-dl*hh(vUv*vec2(1717.0,931.0)); float il=1.0; vec3 acc=vec3(0.0);
        float decay=pow(0.95,24.0/uTaps);
        for(int i=0;i<32;i++){ if(float(i)>=uTaps) break; uv-=dl; vec3 s=texture2D(tDiffuse,clamp(uv,0.001,0.999)).rgb; float l=dot(s,vec3(0.3,0.59,0.11)); acc+=s*smoothstep(uTh,uTh+1.2,l)*il; il*=decay; }
        col+=acc*uRay*0.075*(24.0/uTaps);
      }
      float l=dot(col,vec3(0.299,0.587,0.114));
      col=max(mix(vec3(l),col,uSat),0.0);
      col*=mix(vec3(1.0),vec3(1.07,1.0,0.88),uWarm);
      vec2 q=vUv-0.5; col*=1.0-dot(q,q)*uVig;
      col+=(hh(vUv*vec2(1923.0,1213.0)+uSeed)-0.5)*0.012;
      gl_FragColor=vec4(col,1.0);
    }`
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function updatePost(){
  const sp=_v.copy(camera.position).addScaledVector(sunDir,500).project(camera);
  grade.uniforms.uSun.value.set(sp.x*0.5+0.5,sp.y*0.5+0.5);
  camera.getWorldDirection(_v2);
  const facing=smooth(0.25,0.9,_v2.dot(sunDir));
  grade.uniforms.uRay.value=(1-nightF)*(0.75+0.6*skyHeal+goldF*1.0)*facing*(sp.z<1?1:0)*smooth(-0.03,0.06,sunDir.y)*(1-W.cloud*0.45)*(1-smooth(0.45,0.85,sunDir.y)*0.6);
  grade.uniforms.uTh.value=lerp(0.55,0.95,skyHeal)-goldF*0.15;
  grade.uniforms.uSat.value=lerp(0.94,1.06,skyHeal);
  grade.uniforms.uWarm.value=(goldF*0.4+skyHeal*0.12+(1-skyHeal)*0.06)*(1-Math.max(W.cloud,rainK*0.9)*0.6);
  grade.uniforms.uSeed.value=(G.uTime.value*7.13)%1;
  bloom.strength=0.36+0.25*goldF+0.15*skyHeal+0.3*nightF;
  renderer.toneMappingExposure=Math.min(1.04,lerp(1.0,1.04,skyHeal)*(1-deepF*0.1)*(1+goldF*0.05)*(1-smooth(0.5,0.9,sunDir.y)*0.06)*(1-G.uSnow.value*0.08*(1-nightF)));
}

/* ================================================================
   Adaptive quality
   ================================================================ */
function applyQuality(tier,pr){
  const q=QP[tier];Q.tier=tier;
  const capPR=tier==='low'||tier==='medium'?q.pr:Math.min(q.pr,DEVICE_PR);
  Q.pr=pr!==undefined?pr:capPR;
  renderer.setPixelRatio(Q.pr);composer.setPixelRatio(Q.pr);
  if(q.shadow){sun.castShadow=true;if(sun.shadow.mapSize.x!==q.shadow){sun.shadow.mapSize.set(q.shadow,q.shadow);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}}
  else sun.castShadow=false;
  for(const t of [composer.renderTarget1,composer.renderTarget2]){if(t.samples!==q.samples){t.samples=q.samples;t.dispose();}}
  bloom.enabled=q.bloom;
  grade.uniforms.uTaps.value=q.taps;
  grass.im.count=Math.floor(grass.total*q.grass);applyFlowerCount();
  for(const L of lampLights)L.visible=tier!=='low';drift.geo.setDrawRange(0,tier==='low'?300:drift.N);
  for(const cm of treeCards)cm.visible=q.cards;if(heroCards)heroCards.visible=q.cards;for(const m of orchCardMeshes)m.visible=q.cards;dappleMat.opacity=q.shadow?0.16:0.3;
  skyU.uOct.value=q.sky;skyU.uCirrus.value=q.cirrus;
  waterU.uQ.value=q.water;waterU.uRipN.value=q.rip;
  pollen.geo.setDrawRange(0,q.pollen);rain.geo.setDrawRange(0,q.rain*2);
  onResize();
  Q.frames.length=0;Q.lastChange=performance.now();
  renderQualityUI();
}
function autoStartTier(){
  if(Q_PARAM)return Q_PARAM;
  if(Q.setting!=='auto')return Q.setting;
  let t=GPU.tier;
  if(innerWidth*innerHeight*DEVICE_PR*DEVICE_PR>3840*2160*0.9&&t==='high')t='medium';
  return t;
}
function setQualitySetting(v){
  Q.setting=v;saveQSetting(v);Q.locked=v!=='auto';
  applyQuality(v==='auto'?GPU.tier:v);
}
function perfMonitor(realDt){
  if(Q.locked||Q_PARAM)return;
  const now=performance.now();
  if(now-Q.lastChange<1500)return;
  Q.frames.push(realDt*1000);
  const span=Q.frames.reduce((a,b)=>a+b,0);
  if(span<3000&&Q.frames.length<240)return;
  const sorted=[...Q.frames].sort((a,b)=>a-b);const med=sorted[sorted.length>>1];
  Q.frames.length=0;
  const i=TIERS.indexOf(Q.tier);
  if(med>38){
    if(i>0)applyQuality(TIERS[i-1]);
    else if(Q.pr>0.5)applyQuality('low',Math.max(0.5,Q.pr-0.1));
  }else if(med<11&&!GPU.soft&&i<TIERS.indexOf(GPU.tier==='high'?'ultra':'high')){
    applyQuality(TIERS[i+1]);
  }
}
function renderQualityUI(){
  const opts=['auto',...TIERS];
  const html=opts.map(o=>`<button class="pbtn" type="button" data-q="${o}" aria-pressed="${Q.setting===o}">${o==='auto'?'Auto':TIER_LABEL[o]}</button>`).join('');
  for(const id of ['qRow','dbgQ']){const el=$(id);if(el&&el.innerHTML!==html)el.innerHTML=html;}
  const note=$('qNote');if(note)note.textContent=`Running ${TIER_LABEL[Q.tier]} at ${Q.pr.toFixed(2)}× resolution${Q.setting==='auto'?', adjusting to your computer':''}. Graphics: ${GPU.name}.`;
}
for(const id of ['qRow','dbgQ'])$(id).addEventListener('click',(e)=>{const b=e.target.closest('[data-q]');if(b){setQualitySetting(b.dataset.q);}});

/* ================================================================
   Test panel (#debug, #state0-6, #spring/#summer/#autumn/#winter, #clear/#cloudy/#rain/#snow, #hour=19.5)
   ================================================================ */
function markSandbox(){sandbox=true;$('sandbox').hidden=false;}
function teleport(x,z,lookX=0,lookZ=0){
  if(FISH.state!=='idle')fishStop(true);
  player.pos.set(x,walkH(x,z),z);player.vel.set(0,0,0);player.vy=0;
  cam.yaw=Math.atan2(x-lookX,z-lookZ);cam.target.set(x,player.pos.y+1.25,z);player.face=player.faceT=Math.atan2(lookX-x,lookZ-z);player.idle=0;
}
function outward(x,z,d){const l=Math.hypot(x,z)||1;return [x+x/l*d,z+z/l*d];}
const TP={
  spawn:()=>teleport(2,60,0,0),
  debris:()=>{const p=piles.find(p=>!p.cleared)||piles[0];const [x,z]=outward(p.x,p.z,2.6);teleport(x,z,p.x,p.z);},
  sluice:()=>teleport(sluice.south.x,sluice.south.z+1.5,sluice.x,sluice.z),
  mill:()=>{const [x,z]=outward(mill.x,mill.z,-9);teleport(x,z,mill.x,mill.z);},
  reeds:()=>{const c=CLUMPS[0];teleport(c.x+2.2,c.z+2.2,c.x,c.z);},
  shore:()=>{const s=SPOTS[3];const [x,z]=outward(s.x,s.z,3);teleport(x,z,0,0);},
  hero:()=>teleport(HERO.x+9,HERO.z+6,HERO.x,HERO.z),
  fishing:()=>{if(!FSPOTS.length)fishSpotsStep(0);const s=FSPOTS.find(q=>q.kind==='pond')||FSPOTS[0];if(!s)return;
    const a=Math.atan2(s.z,s.x);let r=Math.hypot(s.x,s.z);while(r<60&&depthAt(Math.cos(a)*r,Math.sin(a)*r)>0.4)r+=0.5;
    if(s.kind==='stream'){const p=polyInfo(s.x,s.z,INLET);teleport(s.x-p.tz*4,s.z+p.tx*4,s.x,s.z);}else teleport(Math.cos(a)*(r+0.6),Math.sin(a)*(r+0.6),s.x,s.z);},
  orchard:()=>teleport(ORCH.x+13,ORCH.z+3,ORCH.x,ORCH.z),
  home:()=>teleport(home.ix,home.iz,HOME.x,HOME.z),
  garden:()=>{const w=homeW(7.4,-2.7),c=homeW(7.4,0);teleport(w.x,w.z,c.x,c.z);},
  reedbed:()=>teleport(RPATH[3][0],RPATH[3][1],RB.x,RB.z),
  lamp:()=>{const w=lsW(0,9);teleport(w.x,w.z,LS.x,LS.z);},
  press:()=>teleport(press.ix+(press.ix-press.x)*0.3,press.iz+(press.iz-press.z)*0.3,press.x,press.z),
  yard:()=>teleport(YARD.x+(YARD.x-mill.x)*0.25,YARD.z+(YARD.z-mill.z)*0.25,YARD.x,YARD.z)
};
function debugComplete(n){
  markSandbox();if(!S.blight)S.blight={};if(n===2)S.blight.koi=true;if(n===6)S.blight.bramble=true;
  const oc=new THREE.Vector3(ORCH.x,0,ORCH.z);
  if(n===1){setStageInstant(0);TP.debris();piles.forEach(p=>{p.cleared=true;p.g.visible=false;});S.inv={wood:12,stone:6,reed:0,cut:0};completeProject(1,new THREE.Vector3(piles[0].x,0,piles[0].z));}
  else if(n===2){setStageInstant(1);TP.sluice();buildSluice();}
  else if(n===3){setStageInstant(2);TP.shore();CLUMPS.forEach(c=>c.harvested=true);layoutWildReeds();setBarrierOpen(false,true);SPOTS.forEach(s=>{s.planted=true;s.growing=true;s.grow=0;spotMarkers[s.idx].visible=false;});after(1.2,()=>completeProject(3,new THREE.Vector3(SPOTS[3].x,0,SPOTS[3].z)));}
  else if(n===4){setStageInstant(3);TP.orchard();brambles.forEach(b=>{b.cleared=true;b.g.visible=false;});completeOrchard(1,oc);}
  else if(n===5){setStageInstant(4);TP.orchard();chanSegs.forEach(c=>setChanFixed(c,true));S.inv.stone=1;completeOrchard(2,oc);}
  else if(n===6){setStageInstant(5);TP.orchard();stumps.forEach(s=>{s.planted=true;s.growing=true;s.grow=0;s.tree.g.visible=true;});after(1.2,()=>completeOrchard(3,oc));}
  else if(n===7){setStageInstant(6);TP.press();press.fixedOK=true;setPressFixed(true);completeOrchard(4,new THREE.Vector3(press.x,0,press.z));}
  else if(n===8){if(stage()<3)setStageInstant(3);TP.home();const st=HOME_STEPS[hStage()+1];if(st){for(const [k,v] of Object.entries(st.cost))S.inv[k]=Math.max(S.inv[k],v);buildHomeStep();}}
  else{setStageInstant(8);TP.reedbed();S.inv.wood=Math.max(S.inv.wood,1);S.inv.reed=Math.max(S.inv.reed,2);for(const b of boardwalk.slice(0,4))setBoardwalk(b.i,true);mendBoardwalk(boardwalk[4]);}
}
if(DEBUG)window.__mz={piece,storyRetro,lampTalk,lampEnd,storyReady,LS,lsW,get story(){return S.story;},renderPieces,HOME,ORCH,HERO,mill,BRIDGES,SIGN,PATHS,BUILDINGS,POND_R,setStageInstant,setJ:(o,p)=>setJournal(o,p),scrap,renderScrap,showPane:typeof showPane==='function'?showPane:null,get boatRun(){return boatRun;},WEAVE,weaveNext,launchBoat,reedBoat,spawnSight,SPECIES_BY_ID,setJournal:typeof setJournal==="function"?setJournal:null,scene,FALLS,TP,S,cam,player,teleport,setHomeStage,groundH,polyPoint,INLET,FALL,RB,get mode(){return mode;}};
function toggleDebug(force){
  const el=$('debug');const on=force!==undefined?force:el.hidden;el.hidden=!on;$('fps').hidden=!on;
  if(on)renderQualityUI();
}
$('debug').addEventListener('click',(e)=>{
  const b=e.target.closest('button');if(!b||b.dataset.q)return;
  const a=b.dataset.act;
  if(b.dataset.tp){TP[b.dataset.tp]();}
  else if(a==='give'){markSandbox();S.inv.wood+=12;S.inv.stone+=12;S.inv.reed+=8;S.inv.cut+=8;toast('Test: +12 wood, +12 stone, +8 reed shoots, +8 cuttings');}
  else if(a==='hat'){markSandbox();S.cosmetics.founderHat=true;S.wearing='founder';applyWardrobe();toast('Test: founder hat on');}
  else if(a==='away'){markSandbox();S.lastDay=dayKey(new Date(Date.now()-3*86400000));arrive();if(welcomeMsg)toast(welcomeMsg);}
  else if(a==='sight'){for(let i=0;i<3;i++)spawnSightRandom();toast(`Test: ${SIGHT.list.length} sightings nearby`);}
  else if(a==='reveal'){markSandbox();SPECIES.forEach(s=>{if(!S.col[s.id])S.col[s.id]={d:dayKey(),n:1};});toast('Test: every species revealed');}
  else if(a==='miranext'){mira.lastDay=-1;toast('Test: Mira has something to say');}
  else if(a==='earnall'){markSandbox();for(const f of DECOR)if(f.zone==='home')grantFurniture(f.id,true);toast('Test: all furniture earned');}
  else if(a==='grow'){markSandbox();S.plots.forEach((q,i)=>{if(!q.t)q.t=1;if(!q.c)q.c=CROPS[SEASON].id;q.g=3;layoutPlot(i);});toast('Test: the garden is ripe');}
  else if(a==='sleep'){S.hours=22;sleepUntilMorning();}
  else if(a==='odanext'){oda.lastDay=-1;toast('Test: Mr. Oda has something to say');}
  else if(a==='decorgive'){markSandbox();for(const it of DECOR)S.stored[it.id]=(S.stored[it.id]||0)+1;toast('Test: one of each decoration kept');if(decor.on)renderDecorUI();}
  else if(a==='newday'){markSandbox();newDaily(dayKey(),String(Math.random()));hud.todayHTML='';toast('Test: a new three small things');}
  else if(a&&a[0]==='c'){debugComplete(Number(a.slice(1)));}
  else if(b.dataset.st!==undefined){markSandbox();setStageInstant(Number(b.dataset.st));}
  else if(b.dataset.h!==undefined){S.hours=Number(b.dataset.h);}
  else if(b.dataset.hrel){S.hours=hourWord(b.dataset.hrel);}
  else if(b.dataset.season){setSeason(b.dataset.season);toast(`Test: ${SEASONS[SEASON].label.toLowerCase()}`);}
  else if(b.dataset.wx){W.forced=b.dataset.wx==='auto'?null:b.dataset.wx;pickWeather();toast(`Test: ${WX_LABEL[W.type]}`);}
  hud.season='';canvas.focus({preventScroll:true});
});
const fpsEl=$('fps');let fpsAcc=0,fpsN=0,fpsMs=0;
function fpsUI(realDt){
  if(fpsEl.hidden)return;fpsAcc+=realDt;fpsN++;fpsMs+=realDt*1000;
  if(fpsAcc>0.5){const fps=fpsN/fpsAcc,ms=fpsMs/fpsN;fpsEl.textContent=`${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms\n${TIER_LABEL[Q.tier]} · ${Q.pr.toFixed(2)}× · pond ${stage()} · orchard ${oStage()} · oda ${oda.met}\n${clockText()}\n${SEASON} · ${W.type}${W.forced?' (forced)':''}`;fpsAcc=0;fpsN=0;fpsMs=0;}
}

function onResize(){
  const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
  G.uPointScale.value=h*Q.pr/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2));
}
window.addEventListener('resize',onResize);

/* ================================================================
   Boot, title, loop
   ================================================================ */
let saveAcc=0;
function startGame(){
  auInit();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  setMuted(AU.muted);
  mode='play';$('title').classList.add('out');setTimeout(()=>{$('title').hidden=true;},1300);
  $('hud').classList.remove('dim');
  cam.target.copy(player.pos);cam.target.y+=1.25;
  canvas.focus({preventScroll:true});
  setTimeout(()=>{$('hint').classList.add('gone');},30000);
  if(!sandbox&&(S.news|0)<12){const back=S.visitDays>1||stage()>0;S.news=12;if(back)setTimeout(()=>toast('The valley fights back now, and the Old Orchard has a story of its own. See What\'s new in your journal (J).'),6500);}
  if(welcomeMsg)setTimeout(()=>toast(welcomeMsg),1800);
  else if(S.visitDays<=1&&S.gifts.length&&!sandbox)setTimeout(()=>toast('The flood left a few things on the shore. Look for the glints.'),2200);
  writeSave();
}
function boot(hotData){
  Q.setting=loadQSetting();Q.locked=Q.setting!=='auto';
  applyQuality(autoStartTier());
  let saved=null;
  pickWeather(true);
  if(STATE_PARAM!==null){setStageInstant(STATE_PARAM);$('sandbox').hidden=false;
    if(STATE_PARAM>=1)S.hours=STATE_PARAM===3?dayLen().set-1.3:11;
    if(STATE_PARAM>=4)teleport(ORCH.x+13,ORCH.z+3,ORCH.x,ORCH.z);
    if(STATE_PARAM===8)TP.home();if(STATE_PARAM===9)TP.reedbed();
    try{storyRetro();}catch(e){}
    S.lastDay=dayKey();S.visitDays=1;newDaily(dayKey());S.gifts=[];for(let i=0;i<3;i++){const g=makeGift();if(g)S.gifts.push(g);}layoutGifts();}
  else{
    saved=(hotData&&validSave(hotData))?hotData:readSave();
    if(saved)applySave(saved);else{cam.yaw=0.32;player.face=player.faceT=Math.PI;}
    syncWorldToStage();try{storyRetro();}catch(e){console.error(e);}
    layoutGifts();arrive();applySeedlings();
  }
  if(HOUR_PARAM!==null)S.hours=HOUR_PARAM;else if(HOUR_WORD)S.hours=hourWord(HOUR_WORD);
  applySeason();applyFlowerCount();layoutDecor();applyHudMode();
  for(let i=0;i<3;i++)fishSpotsStep(0);
  if(DEBUG)toggleDebug(true);
  updateHUD();
  const b=$('btnStart');b.disabled=false;b.textContent=STATE_PARAM!==null?`Begin at stage ${STATE_PARAM}`:saved?'Continue':'New Game';
  if(saved){
    const nb=$('btnNew');nb.hidden=false;let arm=false;
    nb.addEventListener('click',()=>{if(!arm){arm=true;nb.textContent='Tap again to erase this valley';nb.classList.add('warn');setTimeout(()=>{arm=false;nb.textContent='Start over';nb.classList.remove('warn');},4000);return;}clearSave();location.reload();});
    $('titleNote').textContent=`Mill Pond is ${restorationPct()}% restored${oStage()>=0?` · the Old Orchard ${orchardPct()}%`:''} · ${seasonLine().toLowerCase()}`;
  }
  if(STATE_PARAM!==null)$('titleNote').textContent='Test start · progress in this run is not saved';
  b.addEventListener('click',startGame);
  b.focus({preventScroll:true});
}

window.claude?.hot?.snapshot?.(()=>serialize());
try{
  const hot=window.claude?.hot;
  if(hot&&typeof hot.ready==='function')hot.ready(boot);else boot(hot?.data??null);
}catch(e){console.error(e);boot(null);}

document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='play')writeSave();});
window.addEventListener('pagehide',()=>{if(mode==='play')writeSave();});

const STEP=1/60,MAX_FRAME=1.0;
let last=performance.now(),acc=0,hudAcc=0;
function simStep(dt){
  simTime+=dt;G.uTime.value+=dt;
  advanceClock(dt);
  interactStep(dt);
  fishStep(dt);
  playerStep(dt);
  for(const f of HOOKS.sim)f(dt);
  worldStep(dt);
}
let dayCheckAcc=0;
function frame(now){
  const realDt=Math.max(0,(now-last)/1000);last=now;
  const frameDt=Math.min(realDt,MAX_FRAME);
  const paused=photo.on&&photo.pause;
  if(hitStop>0){hitStop-=frameDt;}
  else if(!paused){acc+=frameDt*timeScale;let steps=0;
    while(acc>=STEP&&steps<70){simStep(STEP);acc-=STEP;steps++;}
    if(steps>=70)acc=0;}else acc=0;
  const vdt=Math.min(frameDt,0.25);
  updateDay(vdt);
  playerPose();for(const f of HOOKS.pose)f(vdt);
  if(photo.on)photoStep(vdt);else updateCamera(vdt);
  interactUI();waypointUI();glowUI(G.uTime.value);lookHintUI(vdt);
  worldVisuals(paused?0:vdt);for(const f of HOOKS.vis)f(paused?0:vdt);
  dayCheckAcc+=frameDt;if(dayCheckAcc>30){dayCheckAcc=0;if(mode==='play'&&!sandbox&&S.lastDay!==dayKey()){arrive();if(welcomeMsg)toast(welcomeMsg);}}
  auTick(vdt);
  sky.position.copy(camera.position);
  for(const m of [mountFar,mountMid,mountNear])m.position.set(camera.position.x,0,camera.position.z);
  updatePost();
  hudAcc+=frameDt;if(hudAcc>0.25){hudAcc=0;updateHUD();checkEarned();}
  if(mode==='play'){saveAcc+=frameDt;if(saveAcc>5){saveAcc=0;writeSave();}}
  if(QP[Q.tier].post)composer.render(vdt);else renderer.render(scene,camera);
  if(photo.shoot){photo.shoot=false;try{capturePhoto();}catch(e){console.error(e);}}
  scrapFrame();
  perfMonitor(realDt);fpsUI(realDt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ================================================================
   The shared context other modules use (combat now; co-op later)
   ================================================================ */
export const MZ={THREE,HOOKS,scene,camera,renderer,canvas,player,cam,S,keys,INTERACTS,piles,sluice,OUTLET,SLUICE_S,LEVELS,PARAMS,G,SFX,AU,
  fxSoft,fxGlow,hud,talk,photo,
  $,clamp,lerp,smooth,damp,rr,rnd,ease,angWrap,
  groundH,walkH,depthAt,polyPoint,polyInfo,makeToon,boxM,cylM,addOutline,toast,showCardBrief,startCine,after,sparkle,puff,addRipple,auSwell,
  writeSave,stage,teleport,completeProject,piece,hasPiece,setBarrierOpen,keyDown,ORCH,oldApple,brambles,stumps,oStage,press,oda,W,applyWardrobe,renderValleyPane,BANDS,scrap,
  shower(sec){showerT=Math.max(showerT,sec);},
  get mode(){return mode;},get cine(){return cine;},get simTime(){return simTime;},get journalOpen(){return journalOpen;},get sandbox(){return sandbox;},
  get nightF(){return nightF;},get goldF(){return goldF;},get hours(){return S.hours;},get SEASON(){return SEASON;},get levelCur(){return levelCur;},get decorOn(){return decor.on;},
  set hitStop(v){hitStop=Math.max(hitStop,v);},set timeScale(v){timeScale=v;},get timeScale(){return timeScale;},
  pressE(down){if(down){keys.add('KeyE');tapUntil.KeyE=simTime+0.12;ePressN++;}else keys.delete('KeyE');},
  jump(){jumpQ=simTime+0.2;},
  tier(){return Q.tier;}};
