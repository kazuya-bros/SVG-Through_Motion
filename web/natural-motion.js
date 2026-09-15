import {restrainedDefaults} from './pachipaku-motion.js';
// Reset motion only: keep the user's artwork, mouth tuning and output appearance.
export function naturalMotionSettings(current={}){
 return {...current,...restrainedDefaults,duration:4,rigEnabled:true,independentHair:true,
  blink:true,talking:false,singleBounce:false,bounceHeight:28,tailSwing:8,tailCycles:1,hair:0,chest:0,ears:0,
  headPitch:0,pitchSway:0,frontHairMethod:'spring',backHairMethod:'spring',frontHairCycles:1,backHairCycles:1,
  irisX:0,irisScale:0,irisCycles:1,irisGaze:'natural',earPattern:'natural',earCycles:1};
}

export function sampleMotionSettings(current={}){
 return {...naturalMotionSettings(current),duration:6,talking:true,chest:32,
  singleBounce:true,bounceHeight:28,bounceDuration:3,irisX:2,irisScale:1,
  ears:24,earPattern:'natural',earCycles:1,frontHair:12,backHair:24,
  frontHairCycles:2,backHairCycles:1};
}
