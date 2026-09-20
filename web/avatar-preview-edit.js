import {canvasPoint,canvasViewport} from './render-viewport.js';
import {facePart} from './broadcast-look-renderer.js';
import {defaultLook} from './broadcast-look.js';

export function installAvatarPreviewEdit({stage,canvas,project,pick}){
 let active=null,drag=null,lastGuide='';
 const tools=document.createElement('div');tools.className='avatar-preview-edit';tools.hidden=true;
 tools.innerHTML='<span role="status"></span><div data-nudge class="emotion-nudge"><button data-dx="-1" aria-label="左へ1px">←</button><button data-dy="-1" aria-label="上へ1px">↑</button><button data-dy="1" aria-label="下へ1px">↓</button><button data-dx="1" aria-label="右へ1px">→</button></div><button data-done>確定</button><button data-cancel>キャンセル</button>';
 const guide=document.createElementNS('http://www.w3.org/2000/svg','svg');guide.classList.add('emotion-position-guide');guide.setAttribute('aria-label','感情の位置と範囲ガイド');guide.setAttribute('tabindex','0');guide.style.display='none';
 stage.append(guide,tools);const label=tools.querySelector('span');
 const face=()=>project.parts.find(facePart),look=()=>({...defaultLook(),...active?.getLook?.()});
 function end(cancel=false){if(!active)return;const job=active;active=null;drag=null;tools.hidden=true;guide.style.display='none';lastGuide='';delete stage.dataset.editing;if(cancel)job.cancel?.();job.resolve?.(null);}
 function start(job,text){end(true);active=job;stage.dataset.editing=job.kind;tools.hidden=false;label.textContent=text;tools.querySelector('[data-done]').hidden=tools.querySelector('[data-nudge]').hidden=job.kind==='pick';refresh();}
 function refresh(){
  if(!active||active.kind==='pick'){guide.style.display='none';return;}const f=face();if(!f)return;
  const a=stage.getBoundingClientRect(),b=canvas.getBoundingClientRect(),v=canvasViewport(canvas,project),l=look(),k=active.kind,sx=b.width/v.width,sy=b.height/v.height;
  const x=b.left-a.left-stage.clientLeft+(f.x+f.width*((k==='blush'?.52:.5)+l[k+'_x'])-v.x)*sx,y=b.top-a.top-stage.clientTop+(f.y+f.height*((k==='blush'?.73:.5)+l[k+'_y'])-v.y)*sy;
  const r=f.width*l[k+'_scale']*sx*(k==='blush'?.22:1),gap=f.width*.27*l.blush_spacing*sx,angle=l[k+'_rotation'];
  const key=JSON.stringify([x,y,r,gap,angle,stage.clientWidth,stage.clientHeight,k]);if(key===lastGuide)return;lastGuide=key;
  guide.style.display='block';guide.setAttribute('viewBox',`0 0 ${stage.clientWidth} ${stage.clientHeight}`);
  const shapes=k==='blush'?`<circle cx="${-gap}" r="${r}"/><circle cx="${gap}" r="${r}"/><path d="M ${-gap} 0 H ${gap}"/>`:`<ellipse rx="${r*.55}" ry="${r}"/>`;
  guide.innerHTML=`<g transform="translate(${x} ${y}) rotate(${angle})" class="emotion-bounds">${shapes}</g><g transform="translate(${x} ${y})" data-emotion-handle="move"><circle r="13"/><path d="M -7 0 H 7 M 0 -7 V 7"/></g>`;
 }
 tools.querySelector('[data-cancel]').onclick=()=>end(true);tools.querySelector('[data-done]').onclick=()=>end();
 function nudge(dx,dy){if(!active||active.kind==='pick')return;const f=face(),k=active.kind,l=look();change({[k+'_x']:l[k+'_x']+dx/f.width,[k+'_y']:l[k+'_y']+dy/f.height});}
 for(const b of tools.querySelectorAll('[data-dx],[data-dy]'))b.onclick=e=>nudge((+b.dataset.dx||0)*(e.shiftKey?10:1),(+b.dataset.dy||0)*(e.shiftKey?10:1));
 const point=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
 function change(values){for(const k in values)values[k]=Math.max(-1,Math.min(1,values[k]));active.change(values);refresh();}
 function move(e){if(!active||active.kind==='pick')return;const [x,y]=canvasPoint(canvas,project,...point(e)),f=face(),k=active.kind;if(!f)return;change({[k+'_x']:(x-f.x)/f.width-(k==='blush'?.52:.5)-(drag?.dx||0),[k+'_y']:(y-f.y)/f.height-(k==='blush'?.73:.5)-(drag?.dy||0)});}
 function down(e){if(!active||e.button!==0||e.target.closest('button,input,select,.avatar-preview-edit'))return;e.preventDefault();e.stopImmediatePropagation();if(active.kind==='pick'){const job=active;try{job.resolve(pick(...point(e)));end();}catch(error){end();job.reject(error);}return;}
  const [x,y]=canvasPoint(canvas,project,...point(e)),f=face(),k=active.kind,l=look();drag=e.target.closest('[data-emotion-handle]')?{dx:(x-f.x)/f.width-(k==='blush'?.52:.5)-l[k+'_x'],dy:(y-f.y)/f.height-(k==='blush'?.73:.5)-l[k+'_y']}:{dx:0,dy:0};stage.setPointerCapture(e.pointerId);guide.focus({preventScroll:true});move(e);
 }
 const moving=e=>{if(drag){e.preventDefault();e.stopPropagation();move(e);}},up=e=>{drag=null;if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);};
 stage.addEventListener('pointerdown',down,true);stage.addEventListener('pointermove',moving);for(const t of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(t,up);
 const keys=e=>{if(!active)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();end(true);return;}if(e.target.closest('input,select,textarea'))return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(delta&&active.kind!=='pick'){e.preventDefault();e.stopImmediatePropagation();nudge(...delta.map(v=>v*(e.shiftKey?10:1)));}};window.addEventListener('keydown',keys,true);
 return {refresh,get kind(){return active?.kind},get neutral(){return active&&active.kind!=='pick'},pickColor(){return new Promise((resolve,reject)=>start({kind:'pick',resolve,reject},'色を変えたい場所をクリック'));},placeEmotion(kind,change,cancel,getLook){if(!face())throw Error('顔の下地レイヤーが見つかりません');return new Promise(resolve=>start({kind,change,cancel,getLook,resolve},'十字をドラッグして移動。矢印で1px、Shift＋矢印で10px調整'));},close(){end(true);window.removeEventListener('keydown',keys,true);stage.removeEventListener('pointerdown',down,true);stage.removeEventListener('pointermove',moving);for(const t of ['pointerup','pointercancel','lostpointercapture'])stage.removeEventListener(t,up);tools.remove();guide.remove();}};
}
