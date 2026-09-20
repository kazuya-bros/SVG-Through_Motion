import {defaultLook} from './broadcast-look.js';
import {effectFrame} from './character-effects.js';
import {normalizeExpressions,applyExpression} from './expression-presets.js';
import {createCharacterEffectsRenderer} from './character-effects-renderer.js';

export function recipeLook(base,frame){
 if(frame.preset!=='bundle')return base;
 const a=frame.recipe.appearance,kinds=frame.recipe.components.map(c=>c.kind),look={...defaultLook(),colors:base?.colors||[],emotion_layers:[]};
 for(const key of ['outline','light'])if(kinds.includes(key))for(const [k,v]of Object.entries(a))if(k.startsWith(key))look[k]=v;
 if(kinds.includes('outline'))look.outline=true;
 look.emotion_layers=kinds.filter(k=>['blush','sweat','gloom','image'].includes(k));
 if(look.emotion_layers.length)for(const [k,v]of Object.entries(a))if(/^(blush_|sweat_|image_|emotion_)/.test(k))look[k]=v;
 return look;
}
export function recipePose(pose,project,frame){
 const c=frame.preset==='bundle'&&frame.recipe.components.find(c=>c.kind==='expression');
 return c?applyExpression(pose,normalizeExpressions(project.expressionPresets)[c.expression_index],c.strength):pose;
}
export function createAvatarEffectsRenderer(source,project){
 const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;canvas.viewport=source.viewport;
 const ctx=canvas.getContext('2d'),legacy=createCharacterEffectsRenderer(source,project),layers=[];
 return {canvas,draw(cue,time,pose,override){
  const f=effectFrame(cue,time);ctx.clearRect(0,0,canvas.width,canvas.height);
  if(f.preset!=='bundle'){legacy.draw(cue,time,pose,override);ctx.drawImage(legacy.canvas,0,0);return;}
  if(!f.recipe.visibility)return;
  // Colour/outline and facial art compose first; bounce moves their combined image.
  const effects=f.recipe.components.filter(c=>['ink','appear','dissolve','comms','happy','bounce','glitch','blocks'].includes(c.kind)).sort((a,b)=>(a.kind==='bounce')-(b.kind==='bounce'));
  let current=source;
  effects.forEach((component,i)=>{
   if(!layers[i])layers[i]=createCharacterEffectsRenderer(current,project);
   const local={...cue,preset:component.kind,recipe:null,duration:component.duration,strength:component.strength,direction:component.direction,request_id:cue.request_id+':'+i};
   let frame=effectFrame(local,local.started_at+(time-local.started_at)*(component.speed??1));
   if(f.recipe.behavior==='select'&&['comms','happy','glitch'].includes(component.kind))frame={...frame,preset:component.kind,envelope:1};
   layers[i].draw(local,time,pose,frame);current=layers[i].canvas;
  });ctx.drawImage(current,0,0);
 },dispose(){legacy.dispose();layers.forEach(r=>r.dispose());canvas.width=canvas.height=1;}};
}
