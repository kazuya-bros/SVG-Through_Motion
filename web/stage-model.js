import {defaultLook,lookAssets} from './broadcast-look.js';
// Pure stage timeline shared by player, OBS and tests. All times are seconds.
export const defaultScene=()=>({caption:{enabled:true,source:'speech',text:'',size:42,color:'#ffffff',outline:'#202535',font:'sans',x:.5,y:.84,width:.86,reveal:'instant'},overlays:[],pose:{yaw:0,pitch:0,headRoll:0,irisX:0,irisY:0,blinkL:0,blinkR:0,browL:0,browR:0,browTiltL:0,browTiltR:0},movement:1,effect:'none',effect_strength:.7,appearance:defaultLook()});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
export function blendScene(from,to,amount){
 const t=ease(amount),result=structuredClone(to),a=from||defaultScene();
 result.pose=Object.fromEntries(Object.keys(defaultScene().pose).map(k=>[k,(a.pose?.[k]||0)+((to.pose?.[k]||0)-(a.pose?.[k]||0))*t]));
 result.movement=(a.movement??1)+((to.movement??1)-(a.movement??1))*t;
 result.caption={...to.caption};for(const k of ['size','x','y','width'])result.caption[k]=a.caption[k]+(to.caption[k]-a.caption[k])*t;
 // Cross-fade whole image layers; the character pose keeps its own smooth movement.
 result.overlays=[...(a.overlays||[]).map(o=>({...o,opacity:o.opacity*(1-t)})),...(to.overlays||[]).map(o=>({...o,opacity:o.opacity*t}))].filter(o=>o.opacity>.001);
 return result;
}
export function stageFrame(state,now){
 const baseline=state?.baseline||defaultScene(),active=state?.active;
 if(!active||active.started_at==null)return {scene:baseline,phase:'idle',elapsed:0,step:0};
 const recipe=active.recipe,elapsed=Math.max(0,now-active.started_at);
 if(elapsed>=recipe.duration)return {scene:baseline,phase:'completed',elapsed,step:recipe.steps.length-1};
 let index=0;for(let i=1;i<recipe.steps.length;i++)if(recipe.steps[i].at<=elapsed)index=i;
 const step=recipe.steps[index],previous=index?recipe.steps[index-1].scene:baseline;
 let scene=blendScene(previous,step.scene,(elapsed-step.at)/recipe.transition);
 if(recipe.duration-elapsed<recipe.transition)scene=blendScene(scene,baseline,1-(recipe.duration-elapsed)/recipe.transition);
 return {scene,phase:'running',elapsed,step:index};
}
export function stagePose(pose,scene){
 const out={...pose};for(const k of ['sway','breathe','bounce','hairAngle','bodyRoll','nod'])if(Number.isFinite(out[k]))out[k]*=scene.movement;
 const limits={yaw:[-1,1],pitch:[-1,1],headRoll:[-8,8],irisX:[-20,20],irisY:[-12,12],blinkL:[0,1],blinkR:[0,1],browL:[-1,1],browR:[-1,1],browTiltL:[-1,1],browTiltR:[-1,1]};
 for(const [k,[min,max]] of Object.entries(limits))out[k]=clamp((out[k]||0)+(scene.pose[k]||0),min,max);
 return out;
}
export const recipeAssets=recipe=>[...new Set(recipe.steps.flatMap(s=>[...s.scene.overlays.map(o=>o.asset_id),...lookAssets(s.scene.appearance)]))];
export function captionPages(text,measure,width,maxLines=3){
 const pages=[];let lines=[],line='';
 for(const char of Array.from(text)){
  if(char==='\n'||(line&&measure(line+char)>width)){lines.push(line);line='';if(lines.length===maxLines){pages.push(lines);lines=[];}if(char==='\n')continue;}
  line+=char;
 }
 if(line)lines.push(line);if(lines.length)pages.push(lines);return pages;
}
export function exampleRecipes(){
 const thinking=defaultScene();thinking.pose={...thinking.pose,yaw:-.18,irisX:-8,browL:.2};thinking.movement=.45;thinking.effect='comms';thinking.effect_strength=.3;
 const happy=defaultScene();happy.pose={...happy.pose,blinkL:.2,blinkR:.2,headRoll:2};happy.effect='happy';happy.caption.color='#ffe3a1';happy.caption.size=48;
 const sleepy=defaultScene();sleepy.pose={...sleepy.pose,blinkL:.45,blinkR:.45,pitch:-.1};sleepy.movement=.35;sleepy.caption.color='#ccdfff';sleepy.caption.size=36;
 return [{name:'考えて、ひらめく',duration:10,transition:.6,until_speech_end:false,steps:[{at:0,scene:thinking},{at:4,scene:happy}]},
  {name:'嬉しそうに',duration:8,transition:.6,until_speech_end:false,steps:[{at:0,scene:happy}]},
  {name:'眠たい夜',duration:12,transition:1,until_speech_end:false,steps:[{at:0,scene:sleepy}]}];
}
