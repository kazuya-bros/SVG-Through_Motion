// Motion-only controls available to the from-inputs workflow. Voice/output settings are excluded.
const range=(min,max)=>({type:'number',min,max});
export const motionFields={tailSwing:range(0,30),tailCycles:{type:"integer",min:1,max:4},irisGaze:{type:'enum',options:['natural','sweep']},earPattern:{type:'enum',options:['twitch','double','alternate','droop','up','natural']},earCycles:{type:'integer',min:1,max:6},independentHair:{type:'boolean'},frontHairMethod:{type:'enum',options:['wave','spring','off']},backHairMethod:{type:'enum',options:['wave','spring','off']},frontHairCycles:{type:'integer',min:1,max:4},backHairCycles:{type:'integer',min:1,max:4},irisX:range(0,20),irisScale:range(0,10),irisCycles:{type:"integer",min:1,max:4},duration:range(1,30),sway:range(0,12),breathe:range(0,40),
 blink:{type:'boolean'},talking:{type:'boolean'},rigEnabled:{type:'boolean'},
 headPitch:range(-1,1),pitchSway:range(0,1),headYaw:range(0,1),headTilt:range(0,8),headNod:range(0,6),bodyFollow:range(0,1),
 frontHair:range(0,40),backHair:range(0,70),hairTip:range(1,3),armSwing:range(0,10),hairBend:range(0,30),
 hairMethod:{type:'enum',options:['wave','spring','off']},springCycles:{type:'integer',min:1,max:4},springSoftness:range(0,1),
 singleBounce:{type:'boolean'},bounceHeight:range(0,160),hair:range(0,25),chest:range(0,40),ears:range(0,30)};
export function motionValues(settings={}){return Object.fromEntries(Object.keys(motionFields).filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]]));}
export function validateMotion(values){
 if(!values||Array.isArray(values)||typeof values!=='object'||!Object.keys(values).length)throw Error('動きの設定を指定してください');
 for(const [key,v]of Object.entries(values)){
  const f=motionFields[key];if(!f)throw Error('動きの対象外です: '+key);
  const valid=f.type==='boolean'?typeof v==='boolean':f.type==='enum'?f.options.includes(v):typeof v==='number'&&Number.isFinite(v)&&v>=f.min&&v<=f.max&&(f.type!=='integer'||Number.isInteger(v));
  if(!valid)throw Error('動きの値が範囲外です: '+key);
 }return values;
}
export function applyMotionEdit(project,values){validateMotion(values);const copy=structuredClone(project);copy.settings={...copy.settings,...values};return copy;}
