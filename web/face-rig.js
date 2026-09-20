import {coordinatedHeadPoint} from './head-coordination.js';
// Adapted from Anime2.5DRig lib/app.js deform(), MIT, hakoniwa (2026).
// Revision 7450341934a8ff77bf05b90d9f708786e3eb3996. See THIRD_PARTY_NOTICES.md.
// Local adaptation: local face weights protect merged torso artwork. Separate
// head layers share neck-pivot motion with depth, then retain their own sway.
import {secondaryKind} from './secondary-motion.js';
import {depthAmount,depthFaceOffset} from './depth-motion.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:a));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export function headAttachment(part){
 if(['front','back'].includes(part.deformGroup))return part.deformGroup;
 if(part.role==='hair')return 'back';
 if(part.earMotion===true||['ear-l','ear-r','glasses'].includes(part.role)||['ornament','pendant'].includes(secondaryKind(part)))return 'accessory';
 if(part.independentAccessory&&/headwear|eyewear|髪飾り|頭飾り|眼鏡/i.test(part.sourceLayerName||part.name||''))return 'accessory';
 return null;
}
export function headAttachmentPoint(x,y,p,pose){
 if(p.settings?.faceCoordination)return coordinatedHeadPoint(x,y,p,pose);
 const kind=headAttachment(p.parts[0]||{});if(!kind)return [x,y];
 const r=p.rig,fs=r.faceWidth/333,depth=kind==='back'?.94:kind==='front'?1.04:1.08;
 const z=(depth-1)*(1-depthAmount(p));
 x+=fs*clamp(pose.yaw??0,-1,1)*(14+40*z+(r.neckY-y)*.028);
 y-=fs*clamp(pose.pitch??0,-1,1)*(9+30*z);
 const roll=(clamp(pose.headRoll??0,-8,8)-clamp(pose.bodyRoll??0,-8,8))*Math.PI/360,dx=x-r.neckX,dy=y-r.neckY;
 return [r.neckX+dx*Math.cos(roll)-dy*Math.sin(roll),r.neckY+dx*Math.sin(roll)+dy*Math.cos(roll)+clamp(pose.nod??0,-6,6)];
}
export function headAttachmentMatrix(p,pose){
 const a=headAttachmentPoint(0,0,p,pose),b=headAttachmentPoint(1,0,p,pose),c=headAttachmentPoint(0,1,p,pose);
 return [b[0]-a[0],b[1]-a[1],c[0]-a[0],c[1]-a[1],a[0],a[1]];
}
export function facePart(part){
 if(headAttachment(part))return false;
 const kind=secondaryKind(part);if(kind&&kind!=='brow')return false;
 return part.earMotion!==true&&!part.independentAccessory&&!['front','back','arm-r','arm-l','tail'].includes(part.deformGroup)&&!['hair','ear-l','ear-r','chest','tail'].includes(part.role);
}
export function faceGroup(project){
 return !['front','back','arm-r','arm-l','tail'].includes(project.deformGroup)&&(!project.parts.length||project.parts.some(facePart));
}
export function faceWeight(x,y,p){
 const r=p.rig,f=r.faceWidth;
 const side=1-smooth((Math.abs(x-r.faceX)-f*.48)/(f*.40));
 const top=smooth((y-(r.faceY-f*.85))/(f*.35));
 const bottom=1-smooth((y-(r.faceY+f*.12))/Math.max(f*.10,r.neckY-r.faceY-f*.12));
 return side*top*bottom;
}
export function jawWeight(x,y,p){
 const part=p.parts.find(v=>v.faceBase===true);if(!part)return 0;
 const r=p.rig,f=r.faceWidth,chin=part.y+part.height,start=Math.min(chin-part.height*.1,r.faceY+f*.13);
 const side=1-smooth(Math.abs(x-r.faceX)/(f*.53));
 return side*smooth((y-start)/Math.max(1,chin-start))*(1-smooth((y-chin)/Math.max(8,f*.04)));
}
export const jawGroup=p=>faceGroup(p)&&p.parts.length===1&&p.parts[0].faceBase===true;
export function jawPoint(x,y,p,pose){
 if(!jawGroup(p))return [x,y];
 return [x,y+clamp(pose.mouth)*6*p.rig.faceWidth/333*jawWeight(x,y,p)];
}
export function faceXYPoint(x,y,p,pose){
 if(!faceGroup(p))return [x,y];
 const r=p.rig,fs=r.faceWidth/333,w=faceWeight(x,y,p);
 const [dx,dy]=depthFaceOffset(x,y,p,pose,w);
 return [x+w*fs*clamp(pose.yaw??0,-1,1)*(14+(r.neckY-y)*.028)+dx,y-w*fs*clamp(pose.pitch??0,-1,1)*9+dy];
}
export function featureParallax(part,p,pose){
 if(!p.rig||!p.settings?.rigEnabled||p.settings.faceCoordination)return {x:0,y:0,sx:1};
 let role=part.role||'static';
 if(part.blinkOverlay||part.faceOverlay){
  const owner=p.parts.find(v=>v.role===(part.faceOverlay||'lash-'+part.blinkOverlay));
  if(!owner)return {x:0,y:0,sx:1};role=owner.role;
 }
 const depth=role.startsWith('brow-')?1.14:/^(white|iris|lash)-[lr]$/.test(role)||role==='mouth'?1.08:role==='glasses'?1.15:1;
 const fs=p.rig.faceWidth/333*(1-depthAmount(p));
 return {x:clamp(pose.yaw??0,-1,1)*40*(depth-1)*fs||0,y:-clamp(pose.pitch??0,-1,1)*30*(depth-1)*fs||0,sx:1};
}
// SVG keeps each artwork only once. A smooth displacement field animates the
// merged face locally, rather than reintroducing hundreds of triangle copies.
export function faceFilterMatrix(p,pose){
 const r=p.rig,fs=r.faceWidth/333,scale=p.width*.125;
 const yaw=clamp(pose.yaw??0,-1,1),pitch=clamp(pose.pitch??0,-1,1),roll=(clamp(pose.headRoll??0,-8,8)-clamp(pose.bodyRoll??0,-8,8))*Math.PI/360;
 const a=(yaw*fs*.028+roll)*p.height/scale,b=roll*p.width/scale;
 return [-yaw*fs*14/scale,2*a,0,0,.5-a,
  (pitch*fs*9-clamp(pose.nod??0,-6,6))/scale,0,-2*b,0,.5+b,
  0,0,0,0,.5,0,0,0,0,1].map(v=>+v.toFixed(7)).join(' ');
}
export function faceFilter(p,id){
 const r=p.rig,n=48,w=p.width,h=p.height;
 const rects=[`<rect width="${w}" height="${h}" fill="rgb(0%,50%,50%)"/>`];
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const x=(i+.5)*w/n,y=(j+.5)*h/n,a=faceWeight(x,y,p);
  const box=`x="${i*w/n}" y="${j*h/n}" width="${w/n+.01}" height="${h/n+.01}"`;
  if(a>0)rects.push(`<rect ${box} fill="rgb(${100*a}%,${50+50*a*(y-r.neckY)/h}%,${50+50*a*(x-r.neckX)/w}%)"/>`);
 }
 const map=body=>encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body.join('')}</svg>`);
 return `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB">`+
  `<feImage href="data:image/svg+xml,${map(rects)}" x="0" y="0" width="${w}" height="${h}" result="raw"/><feGaussianBlur in="raw" stdDeviation="${w/192}" result="map"/>`+
  `<feColorMatrix in="map" type="matrix" values="${faceFilterMatrix(p,{})}" data-channel="svg-face-matrix" result="field"/>`+
  `<feDisplacementMap in="SourceGraphic" in2="field" xChannelSelector="R" yChannelSelector="G" scale="${w*.125}"/></filter>`;
}

export function jawFilter(p,id){
 const w=p.width,h=p.height,n=80,cells=[`<rect width="${w}" height="${h}" fill="rgb(50%,50%,50%)"/>`];
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const q=jawWeight((i+.5)*w/n,(j+.5)*h/n,p);if(!q)continue;
  cells.push(`<rect x="${i*w/n}" y="${j*h/n}" width="${w/n+.01}" height="${h/n+.01}" fill="rgb(50%,${50+50*q}%,50%)"/>`);
 }
 const map=encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${cells.join('')}</svg>`);
 return `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB"><feImage href="data:image/svg+xml,${map}" x="0" y="0" width="${w}" height="${h}" result="jawRaw"/><feGaussianBlur in="jawRaw" stdDeviation="${w/320}" result="jawMap"/><feComponentTransfer in="jawMap" result="jawField"><feFuncR type="linear" slope="0" intercept=".5"/></feComponentTransfer><feDisplacementMap in="SourceGraphic" in2="jawField" xChannelSelector="R" yChannelSelector="G" scale="0" data-channel="svg-face-jaw"/></filter>`;
}
