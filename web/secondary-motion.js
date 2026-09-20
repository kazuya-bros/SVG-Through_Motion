import {wingEnabled} from './accessory-targets.js';
import {normalizeRegion,regionWeight,regionDisplacementLimit} from './motion-region.js';
// Optional motion on isolated PSD artwork. No motion is inferred on a merged body.
import {motionLinkOwner} from './attachments.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:a));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export const secondaryKinds={cloth:'服の裾',ribbon:'リボン・ネクタイ',pendant:'イヤリング',wing:'翼',ornament:'頭飾り',brow:'眉の表情'};
export function secondaryKind(p){
 if(wingEnabled(p))return 'wing';
 if(/^brow-[lr]$/.test(p.role))return 'brow';
 if(p.secondaryMotion?.region)return 'cloth';
 const n=(p.sourceLayerName||p.name||'').toLowerCase();
 if(/bottomwear|スカート|服の裾/.test(n))return 'cloth';
 if(/neckwear|リボン|ネクタイ/.test(n))return 'ribbon';
 if(/earwear|イヤリング|ピアス/.test(n))return 'pendant';
 if(p.independentAccessory&&/headwear|頭飾り/.test(n))return 'ornament';
 return null;
}
export function normalizeSecondary(v={}){
 const directions=new Set(['horizontal','vertical','diag-down','diag-up']);
 return {...(normalizeRegion(v.region)?{region:normalizeRegion(v.region)}:{}),enabled:v.enabled===true,amount:clamp(v.amount??25,0,100),cycles:Math.round(clamp(v.cycles??1,1,4)),range:clamp(v.range??50,10,100),...(directions.has(v.direction)?{direction:v.direction}: {})};
}
export const secondaryMesh=p=>['cloth','wing'].includes(secondaryKind(p));
export const secondarySource=(part,project)=>secondaryMesh(part)?part:null;
export const hasSecondaryMesh=p=>p.parts.some(v=>v.visible&&(secondarySource(v,p)||(v.motionLink&&['rigid','attachment'].includes(v.motionLinkMode))));
export function secondaryConfig(part,project){
 const owner=part.faceOverlay?(project.motionParts||project.parts).find(p=>p.role===part.faceOverlay):part;
 return normalizeSecondary({enabled:/^brow-[lr]$/.test(owner?.role||part.faceOverlay||''),...owner?.secondaryMotion});
}
export function secondaryRigid(part,pose,project){
 const kind=part.faceOverlay?'brow':secondaryKind(part),c=secondaryConfig(part,project);
 if(kind==='brow'&&part.earMotion!==true&&!/^ear-[lr]$/.test(part.role)){
  const role=part.faceOverlay||part.role,side=role.endsWith('-r')?'R':'L',value=clamp(pose['brow'+side]??0,-1,1),amount=Math.min(6,project.height*.006);
  const speech=c.enabled?-Math.min(4,project.height*.004)*c.amount/100*smooth(pose.mouth||0):0;
  const owner=part.faceOverlay?(project.motionParts||project.parts).find(p=>p.role===part.faceOverlay)||part:part;
  const sign=owner.x+owner.width/2<(project.rig?.faceX??project.width/2)?-1:1;
  const tilt=pose['browTilt'+side];
  return {rotation:Number.isFinite(tilt)?clamp(tilt,-1,1)*18*sign:value*(side==='L'?-5:5)||0,y:-value*amount+speech||0};
 }
 if(!c.enabled||part.earMotion===true||/^ear-[lr]$/.test(part.role))return {rotation:0,y:0};
 const a=c.amount/100,phase=(pose.secondaryPhase??pose.hairPhase??0)*c.cycles;
 if(pose.secondaryPhase===undefined&&pose.hairPhase===undefined)return {rotation:0,y:0};
 const max={ribbon:10,pendant:14,ornament:6}[kind]||0;
 return {rotation:max*a*Math.sin(phase-.35),y:0};
}
const frameCache=Symbol('secondary-frame');
export const motionFrame=pose=>pose[frameCache]?pose:{...pose,[frameCache]:new Map()};
export function secondaryPoint(x,y,p,pose){
 if(pose.skipClothRegion)return [x,y];
 const part=p.parts.length===1?secondarySource(p.parts[0],p):null;
 if(!part)return [x,y];
 const frame=pose[frameCache];if(!frame)return secondaryField(x,y,p,pose,part);
 let points=frame.get(part);if(!points){points=new Map();frame.set(part,points);}
 const key=x+','+y;
 if(!points.has(key))points.set(key,secondaryField(x,y,p,pose,part));
 return points.get(key);
}
function secondaryField(x,y,p,pose,part){
 const c=normalizeSecondary(part.secondaryMotion);if(!c.enabled||!c.amount)return [x,y];
 const root={x:part.pivotX??part.x+part.width/2,y:part.pivotY??part.y,...(pose.pivotOverrides?.[part.id]?{x:pose.pivotOverrides[part.id].pivotX,y:pose.pivotOverrides[part.id].pivotY}:{})};
 const phase=(pose.secondaryPhase??pose.hairPhase??0)*c.cycles,a=c.amount/100;
 if(secondaryKind(part)==='cloth'){
  const direction={horizontal:[1,0],vertical:[0,1],'diag-down':[Math.SQRT1_2,Math.SQRT1_2],'diag-up':[Math.SQRT1_2,-Math.SQRT1_2]}[c.direction||'horizontal']||[1,0],[dx,dy]=direction;
  const axis=Math.abs(dy)>Math.abs(dx)?'y':'x',baseSize=Math.min(24,(axis==='y'?part.height:part.width)*.07);
  if(c.region){const weight=regionWeight(c.region,x/p.width,y/p.height);const limit=Math.min(baseSize,regionDisplacementLimit(c.region,p.width,p.height,axis))*a*weight*Math.sin(phase);return [x+limit*dx,y+limit*dy];}
  const end=part.y+part.height,start=Math.max(root.y,end-part.height*c.range/100);
  const weight=smooth((y-start)/Math.max(1,end-start));
  const limit=baseSize*a*weight*Math.sin(phase-.6*weight);return [x+limit*dx,y+limit*dy];
 }
 // Orthographic opening/closing, fixed at the chosen wing root. Both sides
 // of a combined wings layer open together about its central attachment.
 const reach=Math.max(1,Math.abs(part.x-root.x),Math.abs(part.x+part.width-root.x));
 const weight=clamp(Math.abs(x-root.x)/reach);
 const fold=(1-Math.cos(phase))*.5*a;
 return [x-(x-root.x)*.28*fold,y-Math.min(20,part.height*.12)*fold*weight];
}
