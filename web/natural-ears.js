// Adapted from the user's black-hair-lashfix.html: quiet sway, brief damped
// twitches, independent sides and motion weighted away from the attachments.
import {earEnabled} from './idle-expression.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:a));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function naturalEarPose(phase,settings){
 const count=Math.round(clamp(settings.earCycles??1,1,6)),u=((phase*count)%1+1)%1;
 const burst=(center,delay=0)=>{const d=((u-center-delay+.5)%1+1)%1-.5;return Math.exp(-((d/.095)**2))*Math.sin(d*72);};
 // Natural motion bends only part of the artwork, so it needs more drive
 // than the full-layer patterns for a comparable visible tip movement.
 const amount=clamp(settings.ears??0,0,30)*.5;
 return {earNaturalL:amount*(.3*Math.sin(u*Math.PI*2-.5)+.7*burst(.36)),
  earNaturalR:amount*(.29*Math.sin(u*Math.PI*2-1)-.65*burst(.36,.035))};
}
export function earRegions(part,project,pose={}){
 const q={...part,...pose.pivotOverrides?.[part.id]},w=q.width,h=q.height;
 if(!earEnabled(q)||q.visible===false||!(w>0&&h>0))return [];
 // A wide layer straddling the character's center can hold both ears.
 const pair=!(q.role||'').startsWith('ear-')&&w>h*1.45&&q.x<project.width*.5&&q.x+w>project.width*.5;
 const px=q.pivotX??q.x+w*.5,py=q.pivotY??q.y+h*.9;
 return (pair?[0,1]:[q.x+w*.5<project.width*.5?0:1]).map(side=>({side,
  px:px+(pair?(side?1:-1)*w*.23:0),py,top:q.y,
  cx:pair?q.x+w*(side?.77:.23):q.x+w*.5,rx:w*(pair?.30:.65),height:h,bottom:q.y+h}));
}
export function earField(x,y,r){
 const weight=smooth(Math.hypot(x-r.px,y-r.py)/Math.max(1,r.height*.65))*(1-smooth((Math.abs(x-r.cx)/r.rx-.35)/.65))*(1-smooth((r.top-y)/(r.height*.3)))*(1-smooth((y-r.bottom)/(r.height*.3)));
 return {dx:-(y-r.py)*weight,dy:(x-r.px)*weight,weight};
}
export function earDeformPart(project){return project.parts.length===1&&earEnabled(project.parts[0])&&project.parts[0].visible!==false?project.parts[0]:null;}
export const naturalEarsActive=p=>p.settings?.earPattern==='natural'&&!!earDeformPart(p);
export function earCoefficients(part,pose,region){
 const strength=clamp(part.motionStrength??1,0,2);
 // Tall, narrow ears need a lower angle to keep the sides from folding.
 const limit=Math.min(15,20*region.rx/region.height);
 return {angle:clamp((pose[region.side?'earNaturalR':'earNaturalL']??0)*strength,-limit,limit)*Math.PI/180,
  lift:clamp((pose.earNaturalFollow??0)*strength,-region.height*.04,region.height*.04)};
}
export function naturalEarPoint(x,y,project,pose){
 if(!naturalEarsActive(project))return [x,y];
 const part=earDeformPart(project);let dx=0,dy=0;
 for(const r of earRegions(part,project,pose)){const f=earField(x,y,r),c=earCoefficients(part,pose,r);dx+=f.dx*c.angle;dy+=f.dy*c.angle+f.weight*c.lift;}
 return [x+dx,y+dy];
}
export function earFilterMatrix(part,project,pose,index){
 const r=earRegions(part,project)[index],range=Math.max(part.width,part.height),c=r?earCoefficients(part,pose,r):{angle:0,lift:0};
 const a=c.angle,l=c.lift/range;
 return [a,0,0,0,.5-.5*a,0,a,l,0,.5-.5*a-.5*l,0,0,0,0,0,0,0,0,1,0].map(v=>+v.toFixed(7)).join(' ');
}
export function naturalEarFilter(part,project,id){
 const range=Math.max(part.width,part.height),pad=range*.4,x=part.x-pad,y=part.y-pad,w=part.width+2*pad,h=part.height+2*pad;
 const regions=earRegions(part,project),n=40;
 const stages=regions.map((r,index)=>{
  let cells='';
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const f=earField(x+(i+.5)*w/n,y+(j+.5)*h/n,r);if(!f.weight)continue;
   const rgb=[.5+f.dx/(2*range),.5+f.dy/(2*range),.5+.5*f.weight].map(v=>(clamp(v)*100).toFixed(4)+'%');
   cells+=`<rect x="${i*w/n}" y="${j*h/n}" width="${w/n+.01}" height="${h/n+.01}" fill="rgb(${rgb.join(',')})"/>`;
  }
  const map=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="rgb(50%,50%,50%)"/>${cells}</svg>`;
  return `<feImage href="data:image/svg+xml,${encodeURIComponent(map)}" x="${x}" y="${y}" width="${w}" height="${h}" result="map${index}"/><feGaussianBlur in="map${index}" stdDeviation="${w/n*.4}" result="soft${index}"/><feColorMatrix in="soft${index}" type="matrix" values="${earFilterMatrix(part,project,{},index)}" data-channel="svg-ear-field-${index}-${part.id}" result="field${index}"/><feDisplacementMap in="${index?'ear'+(index-1):'SourceGraphic'}" in2="field${index}" xChannelSelector="R" yChannelSelector="G" scale="${-2*range}" result="ear${index}"/>`;
 }).join('');
 return `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB">${stages}</filter>`;
}
