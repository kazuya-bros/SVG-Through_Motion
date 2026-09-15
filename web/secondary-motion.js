// Optional motion on isolated PSD artwork. No motion is inferred on a merged body.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:a));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export const secondaryKinds={cloth:'服の裾',ribbon:'リボン・ネクタイ',pendant:'イヤリング',wing:'翼',ornament:'頭飾り',brow:'眉の表情'};
export function secondaryKind(p){
 if(/^brow-[lr]$/.test(p.role))return 'brow';
 const n=(p.sourceLayerName||p.name||'').toLowerCase();
 if(/bottomwear|スカート|服の裾/.test(n))return 'cloth';
 if(/neckwear|リボン|ネクタイ/.test(n))return 'ribbon';
 if(/earwear|イヤリング|ピアス/.test(n))return 'pendant';
 if(/wings|翼/.test(n))return 'wing';
 if(p.independentAccessory&&/headwear|頭飾り/.test(n))return 'ornament';
 return null;
}
export function normalizeSecondary(v={}){
 return {enabled:v.enabled===true,amount:clamp(v.amount??25,0,100),cycles:Math.round(clamp(v.cycles??1,1,4)),range:clamp(v.range??50,10,100)};
}
export const secondaryMesh=p=>['cloth','wing'].includes(secondaryKind(p));
export const hasSecondaryMesh=p=>p.parts.some(v=>v.visible&&secondaryMesh(v));
export function secondaryConfig(part,project){
 const owner=part.faceOverlay?(project.motionParts||project.parts).find(p=>p.role===part.faceOverlay):part;
 return normalizeSecondary(owner?.secondaryMotion);
}
export function secondaryRigid(part,pose,project){
 const kind=part.faceOverlay?'brow':secondaryKind(part),c=secondaryConfig(part,project);
 if(!c.enabled||part.earMotion===true||/^ear-[lr]$/.test(part.role))return {rotation:0,y:0};
 const a=c.amount/100,phase=(pose.secondaryPhase??pose.hairPhase??0)*c.cycles;
 if(kind==='brow')return {rotation:0,y:-Math.min(4,project.height*.004)*a*smooth(pose.mouth||0)||0};
 if(pose.secondaryPhase===undefined&&pose.hairPhase===undefined)return {rotation:0,y:0};
 const max={ribbon:10,pendant:14,ornament:6}[kind]||0;
 return {rotation:max*a*Math.sin(phase-.35),y:0};
}
export function secondaryPoint(x,y,p,pose){
 const part=p.parts.length===1?p.parts[0]:null;
 if(!part||!secondaryMesh(part))return [x,y];
 const c=normalizeSecondary(part.secondaryMotion);if(!c.enabled||!c.amount)return [x,y];
 const root={x:part.pivotX??part.x+part.width/2,y:part.pivotY??part.y,...(pose.pivotOverrides?.[part.id]?{x:pose.pivotOverrides[part.id].pivotX,y:pose.pivotOverrides[part.id].pivotY}:{})};
 const phase=(pose.secondaryPhase??pose.hairPhase??0)*c.cycles,a=c.amount/100;
 if(secondaryKind(part)==='cloth'){
  const end=part.y+part.height,start=Math.max(root.y,end-part.height*c.range/100);
  const weight=smooth((y-start)/Math.max(1,end-start));
  return [x+Math.min(24,part.width*.07)*a*weight*Math.sin(phase-.6*weight),y];
 }
 // Orthographic opening/closing, fixed at the chosen wing root. Both sides
 // of a combined wings layer open together about its central attachment.
 const reach=Math.max(1,Math.abs(part.x-root.x),Math.abs(part.x+part.width-root.x));
 const weight=clamp(Math.abs(x-root.x)/reach);
 const fold=(1-Math.cos(phase))*.5*a;
 return [x-(x-root.x)*.28*fold,y-Math.min(20,part.height*.12)*fold*weight];
}
