import {frontHairEnd} from './rig.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,+v));
export const hairParts=(project,kind)=>project?.parts.filter(p=>p.visible&&p.deformGroup===kind)||[];
export function hairRegion(project,part){
 return part.hairControl||{rootY:project.rig.headTop+(part.deformGroup==='front'?project.height*.04:0),tipY:part.deformGroup==='front'?frontHairEnd(project):project.height,centerX:part.x+part.width/2,radius:part.width};
}
export function setHairRegion(project,kind,region){
 const rootY=clamp(region.rootY,0,project.height*.85);
 const normalized={rootY,tipY:clamp(region.tipY,rootY+project.height*.1,project.height),centerX:clamp(region.centerX,0,project.width),radius:clamp(region.radius,project.width*.08,project.width*2)};
 for(const part of hairParts(project,kind))part.hairControl={...normalized};
 return normalized;
}
export function syncHairShape(project,source){
 for(const part of hairParts(project,source.deformGroup))if(part!==source){
  for(const key of ['hairControl','hairStrands','savedHairStrands']){
   if(source[key])part[key]=structuredClone(source[key]);else delete part[key];
  }
 }
}
