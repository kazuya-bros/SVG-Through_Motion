// Editing a visible hair control must not be defeated by a hidden master switch.
export const hairControlIds=new Set(['frontHair','backHair','frontHairMethod','backHairMethod','frontHairCycles','backHairCycles','hairBend','hairMethod','springCycles']);
export function activateHairControl(id,settings){
  if(!hairControlIds.has(id)||settings.rigEnabled)return false;
  settings.rigEnabled=true;
  return true;
}
const rigControlIds=new Set([...hairControlIds,'headIdle','headYawOffset','headRollOffset','headTilt','headYaw','headPitch','headNod','bodyFollow','pitchSway','armSwing','neckPivotPick']);
export function activateMotionControl(id,settings){
  if(!rigControlIds.has(id)||settings.rigEnabled)return false;
  settings.rigEnabled=true;
  return true;
}
