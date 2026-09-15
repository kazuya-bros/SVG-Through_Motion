import {secondaryKind,secondaryMesh,secondaryPoint} from './secondary-motion.js';
import {normalizeDepth,depthHairPoint} from './depth-motion.js';
import {earDeformPart,naturalEarPoint} from './natural-ears.js';
import {earEnabled} from './idle-expression.js';
// One continuous deformation field for preview, frame exports, and vector meshes.
import {normalizedSpring,rootedWave} from './pachipaku-motion.js?v=voice-2';
import {blendStrands} from './hair-strands.js';
import {chestPoint} from './chest-motion.js';
import {facePart,faceGroup,faceWeight,jawGroup,jawPoint,faceXYPoint,featureParallax} from './face-rig.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:a));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const rad=Math.PI/180;
export function normalizeRig(r={},p) {
  const w=p.width,h=p.height;
  const defaults={neckX:w*.5,neckY:h*.5,faceX:w*.5,faceY:h*.35,faceWidth:w*.3,headTop:h*.05};
  const out={};for(const [k,v] of Object.entries(defaults))out[k]=clamp(r[k]??v,0,k.endsWith('Y')||k==='headTop'?h:w);
  const depth=normalizeDepth(r.depth);if(depth)out.depth=depth;
  out.faceWidth=Math.max(w*.08,out.faceWidth);
  if(Number.isInteger(r.hairGridSize)&&r.hairGridSize>=2&&r.hairGridSize<=65&&Array.isArray(r.hairWeights)&&r.hairWeights.length===r.hairGridSize**2){out.hairGridSize=r.hairGridSize;out.hairWeights=r.hairWeights.map(v=>clamp(v));}
  if(r.segmented){out.segmented=true;out.arms={};for(const side of ['arm-r','arm-l'])if(r.arms?.[side])out.arms[side]={x:clamp(r.arms[side].x,0,w),y:clamp(r.arms[side].y,0,h)};}
  const sw=r.seamWeights;
  if(sw&&Number.isInteger(sw.size)&&sw.size>=2&&sw.size<=65&&['front','back','arm-r','arm-l'].every(k=>Array.isArray(sw[k])&&sw[k].length===sw.size**2&&sw[k].every(Number.isFinite))){out.seamWeights={size:sw.size};for(const k of ['front','back','arm-r','arm-l'])out.seamWeights[k]=sw[k].map(v=>clamp(v));}
  return out;
}
const groupsCache=new WeakMap();
export function rigGroups(p) {
  if(p.renderGroup||p.deformGroup)return null;
  const localEars=p.parts.some(v=>v.visible&&(earEnabled(v)||v.role==='tail'||secondaryKind(v)));
  if(!localEars&&(!p.rig?.segmented||(p.rig.seamWeights&&!p.settings?.independentHair)||p.rig.seamPending))return null;
  const key=p.parts.map(x=>x.id+':'+(x.deformGroup||'core')+':'+x.role+':'+x.visible+':'+facePart(x)+':'+earEnabled(x)+':'+!!x.faceBase).join('|');
  if(groupsCache.get(p)?.key===key)return groupsCache.get(p).groups;
  const groups=[];
  for(const part of p.parts){const kind=part.deformGroup||'core';let last=groups.at(-1);
    if(!last||last.deformGroup!==kind||facePart(last.parts[0])!==facePart(part)||earEnabled(part)||earEnabled(last.parts[0])||secondaryMesh(part)||secondaryMesh(last.parts[0])||!!last.parts[0].faceBase!==!!part.faceBase){last={...p,renderGroup:true,motionParts:p.parts,chestSeparated:p.parts.some(p=>p.visible&&p.role==='chest'),deformGroup:kind,parts:[]};Object.defineProperty(last,'settings',{get:()=>({...p.settings,background:'transparent'})});Object.defineProperty(last,'rig',{get:()=>p.rig});groups.push(last);}
    last.parts.push(part);
  }
  groupsCache.set(p,{key,groups});return groups;
}
export const rigActive=(p,s=p.settings)=>!!p.rig&&!!s?.rigEnabled;
export function rigPose(t,s) {
  const duration=clamp(s.duration,1,30),phase=((t%duration)+duration)%duration/duration*Math.PI*2;
  return {headRoll:Math.sin(phase)*clamp(s.headTilt,0,8),bodyRoll:Math.sin(phase-.28)*clamp(s.headTilt,0,8)*clamp(s.bodyFollow),
    yaw:Math.sin(phase+.45)*clamp(s.headYaw,0,1),nod:Math.sin(phase*2)*clamp(s.headNod,0,6),
    pitch:clamp((s.headPitch||0)+Math.sin(phase)*clamp(s.pitchSway||0),-1,1),
    hairPhase:phase,hairBend:clamp(s.hairBend,0,30)};
}
function hairWeight(x,y,p,r) {
  if(!r.hairWeights)return 0; // No guessed hair deformation on clothing.
  const n=r.hairGridSize,gx=clamp(x/p.width)*(n-1),gy=clamp(y/p.height)*(n-1),ix=Math.min(n-2,Math.floor(gx)),iy=Math.min(n-2,Math.floor(gy)),fx=gx-ix,fy=gy-iy;
  const a=r.hairWeights;
  return (a[iy*n+ix]*(1-fx)+a[iy*n+ix+1]*fx)*(1-fy)+(a[(iy+1)*n+ix]*(1-fx)+a[(iy+1)*n+ix+1]*fx)*fy;
}
export function warpPoint(x,y,p,pose) {
  if(pose.neckPivot&&p.rig)p={...p,rig:{...p.rig,neckX:clamp(pose.neckPivot.x,0,p.width),neckY:clamp(pose.neckPivot.y,0,p.height)}};
  [x,y]=chestPoint(x,y,p,pose);
  [x,y]=naturalEarPoint(x,y,p,pose);
  [x,y]=secondaryPoint(x,y,p,pose);
  if(!rigActive(p))return [x,y];
  [x,y]=depthHairPoint(x,y,p,pose);
  [x,y]=jawPoint(x,y,p,pose);
  if(p.rig.segmented&&p.rig.seamWeights&&!p.settings?.independentHair&&!p.parts.some(v=>v.role==='tail'||v.independentAccessory)){const [dx,dy]=sharedOffset(x,y,p,pose);return stablePoint(x+dx,y+dy,p,pose);}
  if(p.rig.segmented&&p.deformGroup){
    const [dx,dy]=segmentOffset(x,y,p,pose);
    return stablePoint(x+dx,y+dy,p,pose);
  }
  if(p.settings?.rigMode!=='soft')return stablePoint(x,y,p,pose);
  [x,y]=headOrientationPoint(x,y,p,pose);
  const r=p.rig,w=p.width,h=p.height;
  const head=faceGroup(p)?faceWeight(x,y,p):0;
  const angle=((pose.headRoll||0)*.5*head+(pose.bodyRoll||0)*(1-head))*rad;
  const px=r.neckX,py=r.neckY*head+h*.8*(1-head),dx=x-px,dy=y-py;
  let ox=px+dx*Math.cos(angle)-dy*Math.sin(angle),oy=py+dx*Math.sin(angle)+dy*Math.cos(angle);
  oy+=(pose.nod||0)*head*smooth((r.neckY-y)/(h*.16));
  const tip=clamp((y-r.headTop)/(h-r.headTop));
  const hair=hairWeight(x,y,p,r)*tip**1.8;
  const s=p.settings||{},limit=pose.hairBend||0,phase=pose.hairPhase||0;
  const response=s.hairMethod==='off'?0:s.hairMethod==='wave'?rootedWave(phase*(s.springCycles??1),tip,x<r.faceX?0:.32,s.duration||4)*limit:normalizedSpring(phase-tip*.5,tip,s.duration||4,s.springCycles??1,s.springSoftness??.5)*limit;
  ox+=hair*response;
  return [ox,oy];
}
export function sharedOffset(x,y,p,pose){
  const sw=p.rig.seamWeights,n=sw.size,gx=clamp(x/p.width)*(n-1),gy=clamp(y/p.height)*(n-1),ix=Math.min(n-2,Math.floor(gx)),iy=Math.min(n-2,Math.floor(gy)),fx=gx-ix,fy=gy-iy;
  let dx=0,dy=0,total=0;
  for(const kind of ['front','back','arm-r','arm-l']){
    const a=sw[kind],weight=(a[iy*n+ix]*(1-fx)+a[iy*n+ix+1]*fx)*(1-fy)+(a[(iy+1)*n+ix]*(1-fx)+a[(iy+1)*n+ix+1]*fx)*fy;
    if(!weight)continue;
    const part=(p.motionParts||p.parts).find(v=>v.deformGroup===kind);if(!part)continue;
    const offset=segmentOffset(x,y,{width:p.width,height:p.height,rig:p.rig,settings:p.settings,deformGroup:kind,parts:[part]},pose);
    dx+=offset[0]*weight;dy+=offset[1]*weight;total+=weight;
  }
  return [dx/Math.max(1,total),dy/Math.max(1,total)];
}
// Local face XYZ projection, with neck falloff and separate feature depth.
export function headOrientationPoint(x,y,p,pose) {return faceXYPoint(x,y,p,pose);}
export function stablePoint(x,y,p,pose) {
  [x,y]=headOrientationPoint(x,y,p,pose);
  const r=p.rig,h=p.height,w=p.width,s=p.settings||{};
  // Face roll follows the upstream restrained range, blending into the neck.
  const head=faceGroup(p)?faceWeight(x,y,p):0;
  const roll=(clamp(pose.headRoll||0,-8,8)-clamp(pose.bodyRoll||0,-8,8))*rad*.5,dx=x-r.neckX,dy=y-r.neckY;
  let ox=x+head*(dx*(Math.cos(roll)-1)-dy*Math.sin(roll));
  let oy=y+head*(dx*Math.sin(roll)+dy*(Math.cos(roll)-1)+clamp(pose.nod||0,-6,6));
  // Protect face contours and the central garment from the coarse hair mask.
  const lateral=smooth((Math.abs(x-r.faceX)-r.faceWidth*.52)/(r.faceWidth*.28));
  const belowFace=smooth((y-r.neckY+h*.025)/(h*.12));
  const u=clamp((y-(r.neckY-h*.08))/(h-r.neckY+h*.08));
  const weight=r.segmented?0:hairWeight(x,y,p,r)*lateral*belowFace;
  const limit=clamp(pose.hairBend||0,0,30)*w/1024;
  if(weight&&limit){
    const phase=pose.hairPhase||0;
    const lag=u*u*normalizedSpring(phase-u*.5,u,clamp(s.duration||4,1,30),s.springCycles??1,s.springSoftness??.5)*limit;
    const wave=rootedWave(phase*(s.springCycles??1),u,x<r.faceX?0:.32,clamp(s.duration||4,1,30))*limit;
    ox+=weight*clamp(s.hairMethod==='off'?0:s.hairMethod==='wave'?wave:lag,-limit,limit);
  }
  const body=clamp(pose.bodyRoll||0,-8,8)*rad,bx=ox-r.neckX,by=oy-h*.8;
  return [r.neckX+bx*Math.cos(body)-by*Math.sin(body),h*.8+bx*Math.sin(body)+by*Math.cos(body)];
}
export function segmentOffset(x,y,p,pose) {
  const s=p.settings||{},r=p.rig,h=p.height,w=p.width,g=p.deformGroup,phase=pose.hairPhase||0;
  if(!Number.isFinite(pose.hairPhase))return [0,0];
  if(g.startsWith('arm-')){
    const part=p.parts[0],override=pose.pivotOverrides?.[part?.id],saved=r.arms?.[g];if(!saved)return [0,0];
    const pivot={x:clamp(override?.pivotX??part?.pivotX??saved.x,0,w),y:clamp(override?.pivotY??part?.pivotY??saved.y,0,h)};
    const a=clamp((s.armSwing??0)*(part?.motionStrength??1),0,10)*rad*Math.sin(phase-.35)*(g==='arm-r'?1:-1);
    const dx=x-pivot.x,dy=y-pivot.y;
    return [dx*(Math.cos(a)-1)-dy*Math.sin(a),dx*Math.sin(a)+dy*(Math.cos(a)-1)];
  }
  if(!['front','back'].includes(g))return [0,0];
  const front=g==='front',method=s[front?'frontHairMethod':'backHairMethod']??s.hairMethod??'spring',cycles=s[front?'frontHairCycles':'backHairCycles']??s.springCycles??1;
  if(method==='off')return [0,0];
  const control=p.parts[0]?.hairControl;
  const strands=p.parts[0]?.hairStrands;
  const strength=s.independentHair?1:(p.parts[0]?.motionStrength??1);
  if(strands?.length){
    const limit=clamp((front?(s.frontHair??4):(s.backHair??9))*strength,0,front?40:70)*w/1024;
    const response=(u,gain,delay)=>{
      const envelope=u**clamp(s.hairTip??2,1,3),ph=phase-delay-(front?0:.65),duration=clamp(s.duration||4,1,30);
      const wave=method==='wave'?(u?rootedWave(ph*cycles,u,0,duration)/Math.max(.000001,clamp(u*1.25)*u):0):normalizedSpring(ph-u*.7,u,duration,cycles,s.springSoftness??.5);
      return envelope*limit*gain*wave;
    };
    return [clamp(blendStrands(x,y,strands,response),-limit,limit),0];
  }
  const root=control?clamp(control.rootY,0,h):r.headTop+(front?h*.04:0),end=control?clamp(control.tipY,root+h*.1,h):front?frontHairEnd(p):h;
  const u=clamp((y-root)/Math.max(h*.1,end-root));
  const envelope=u**clamp(s.hairTip??2,1,3);
  const limit=clamp((front?(s.frontHair??2):(s.backHair??9))*strength,0,front?40:70)*w/1024;
  const delay=front?0:.65,seed=.32*smooth((x-r.faceX+r.faceWidth*.5)/r.faceWidth),duration=clamp(s.duration||4,1,30);
  let shift=0;
  if(method==='wave'){
    // rootedWave already supplies a quadratic root envelope; replace it with UI exponent.
    shift=u>0?rootedWave((phase-delay)*cycles,u,seed,duration)/Math.max(.000001,clamp(u*1.25)*u)*envelope*limit:0;
  }else{
    const softness=clamp(s.springSoftness??.5);
    shift=envelope*limit*normalizedSpring(phase-delay-u*(.35+softness*.65),u,duration,cycles,softness);
  }
  const region=control?1-smooth(Math.abs(x-control.centerX)/Math.max(w*.08,control.radius)):1;
  return [clamp(shift,-limit,limit)*region||0,0];
}
export function frontHairEnd(p){
  // Bangs end around the eye line, not the neck. The neck endpoint suppressed
  // their motion twice: first by the root envelope, then by the seam weights.
  const r=p.rig;
  return clamp(r.faceY-r.faceWidth*.12,r.headTop+p.height*.14,r.neckY);
}
export function faceMotion(part,p,pose) {
  return featureParallax(part,p,pose);
}
export function mesh(p,columns=12,rows=18) {
  const result=[];
  const secondary=p.parts.length===1&&secondaryMesh(p.parts[0])?p.parts[0]:null;
  if(secondary){
    // Keep the attachment on mesh edges so interpolation cannot pull the root.
    const xs=[0,p.width,clamp(secondary.pivotX??secondary.x+secondary.width/2,0,p.width)];
    const ys=[0,p.height,clamp(secondary.pivotY??secondary.y,0,p.height)];
    for(let i=0;i<=16;i++){
      xs.push(clamp(secondary.x+(secondary.width*i/16),0,p.width));
      ys.push(clamp(secondary.y+(secondary.height*i/16),0,p.height));
    }
    const X=[...new Set(xs)].sort((a,b)=>a-b),Y=[...new Set(ys)].sort((a,b)=>a-b);
    for(let j=0;j<Y.length-1;j++)for(let i=0;i<X.length-1;i++){const a=[X[i],Y[j]],b=[X[i+1],Y[j]],c=[X[i],Y[j+1]],d=[X[i+1],Y[j+1]];result.push([a,b,c],[b,d,c]);}
    return result;
  }
  const ear=earDeformPart(p);
  if(ear){
    const xs=[0,p.width],ys=[0,p.height],pad=24;
    for(let i=0;i<=16;i++)xs.push(clamp(ear.x-pad+(ear.width+pad*2)*i/16,0,p.width));
    for(let i=0;i<=14;i++)ys.push(clamp(ear.y-pad+(ear.height+pad*2)*i/14,0,p.height));
    const X=[...new Set(xs)].sort((a,b)=>a-b),Y=[...new Set(ys)].sort((a,b)=>a-b);
    for(let j=0;j<Y.length-1;j++)for(let i=0;i<X.length-1;i++){const a=[X[i],Y[j]],b=[X[i+1],Y[j]],c=[X[i],Y[j+1]],d=[X[i+1],Y[j+1]];result.push([a,b,c],[b,d,c]);}
    return result;
  }
  const levels=Array.from({length:rows+1},(_,y)=>y*p.height/rows);
  if(p.deformGroup&&p.rig&&faceGroup(p)){
    // Two local jaw rows preserve the small speech motion without increasing
    // mesh density on every hair/sleeve group.
    for(const y of [p.rig.faceY+p.rig.faceWidth*.16,jawGroup(p)?p.parts[0].y+p.parts[0].height:p.rig.neckY-p.rig.faceWidth*.10])if(y>0&&y<p.height&&!levels.some(v=>Math.abs(v-y)<2))levels.push(y);
    levels.sort((a,b)=>a-b);
  }
  for(let y=0;y<levels.length-1;y++)for(let x=0;x<columns;x++){
    const a=[x*p.width/columns,levels[y]],b=[(x+1)*p.width/columns,a[1]],c=[a[0],levels[y+1]],d=[b[0],c[1]];
    result.push([a,b,c],[b,d,c]);
  }
  if(p.deformGroup&&!p.parts.some(p=>p.role==='tail')){const parts=p.parts.filter(p=>p.visible);return result.filter(t=>parts.some(p=>Math.max(...t.map(v=>v[0]))>=p.x-24&&Math.min(...t.map(v=>v[0]))<=p.x+p.width+24&&Math.max(...t.map(v=>v[1]))>=p.y-24&&Math.min(...t.map(v=>v[1]))<=p.y+p.height+24));}
  return result;
}
export function triangleMatrix(t,p,pose) {
  const q=t.map(([x,y])=>warpPoint(x,y,p,pose));
  const ux=t[1][0]-t[0][0],uy=t[1][1]-t[0][1],vx=t[2][0]-t[0][0],vy=t[2][1]-t[0][1],det=ux*vy-uy*vx;
  const ex=q[1][0]-q[0][0],ey=q[1][1]-q[0][1],fx=q[2][0]-q[0][0],fy=q[2][1]-q[0][1];
  const a=(ex*vy-fx*uy)/det,b=(ey*vy-fy*uy)/det,c=(fx*ux-ex*vx)/det,d=(fy*ux-ey*vx)/det;
  return [a,b,c,d,q[0][0]-a*t[0][0]-c*t[0][1],q[0][1]-b*t[0][0]-d*t[0][1]];
}
export function decompose([a,b,c,d,e,f]) {
  const sx=Math.hypot(a,b),det=a*d-b*c;
  return {translate:[e,f],rotate:[Math.atan2(b,a)/rad],skewX:[Math.atan2(a*c+b*d,det)/rad],scale:[sx,det/sx]};
}
export function expandedTriangle(t,amount=2) {
  const cx=t.reduce((s,v)=>s+v[0],0)/3,cy=t.reduce((s,v)=>s+v[1],0)/3;
  return t.map(([x,y])=>{const l=Math.hypot(x-cx,y-cy);return [x+(x-cx)/l*amount,y+(y-cy)/l*amount];});
}
