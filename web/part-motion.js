import {tailEnabled} from './accessory-targets.js';
import {attachmentOwner} from './attachments.js';
import {secondaryRigid} from './secondary-motion.js';
import {earEnabled} from './idle-expression.js';
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(+v)?+v:lo));
export function partMotion(part,pose,project) {
  if(part.motionLink&&part.motionLinkMode==='rigid')return {x:0,y:0,rotation:0,pivotX:0,pivotY:0};
  if(part.followPart){const owner=attachmentOwner(part,project.motionParts||project.parts);if(owner!==part)return partMotion({...owner,followPart:null},pose,project);}
  if(pose.pivotOverrides?.[part.id])part={...part,...pose.pivotOverrides[part.id]};
  const sign=part.role==='ear-r'?-1:part.role==='ear-l'?1:part.x+part.width/2<project.width/2?-1:1;
  const strength=clamp(part.motionStrength??1,0,2);
  const secondary=secondaryRigid(part,pose,project);
  const browOwner=part.faceOverlay?(project.motionParts||project.parts).find(p=>p.role===part.faceOverlay)||part:part;
  const tiltedBrow=(/^brow-[lr]$/.test(part.role)||part.faceOverlay)&&Number.isFinite(pose['browTilt'+(part.faceOverlay||part.role).slice(-1).toUpperCase()]);
  return {x:0,y:secondary.y+((part.role==='chest'?(pose.chestOffset||0):0)-(earEnabled(part)?(pose.earLift||0):0))*strength,
    rotation:earEnabled(part)?(pose[part.role==='ear-l'?'earAngleL':part.role==='ear-r'?'earAngleR':'earAngle']??pose.earAngle??0)*sign*strength:tailEnabled(part)?(pose.tailAngle||0)*strength:part.role==='hair'?(pose.hairAngle||0)*sign*strength:secondary.rotation,
    pivotX:tiltedBrow?browOwner.pivotX??browOwner.x+browOwner.width/2:part.pivotX??part.x+part.width/2,pivotY:tiltedBrow?browOwner.pivotY??browOwner.y+browOwner.height*.5:part.pivotY??part.y+part.height*(earEnabled(part)?.9:.08)};
}
