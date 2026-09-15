import {eyeFrame,dragEye} from './eye-gizmo.js';
import {transformBox,artworkBounds} from './transform-box.js';
import {normalizeLid,closedLashArtwork} from './eyelid-controls.js';
import {tuningHistory} from './mouth-gizmo.js';
const ns='http://www.w3.org/2000/svg';
export function installEyeWorkbench(api){
 const art=document.getElementById('artboard');let overlay,drag,current,editCheckpoint;const bounds=new Map();const histories=new Map();
 const visible=()=>document.body.dataset.task==='edit'&&document.body.dataset.editStep==='eyes';
 const enabled=()=>document.body.dataset.task==='edit'&&document.body.dataset.editStep==='eyes'&&document.body.dataset.eyeReview!=='true'&&document.body.dataset.eyesStage!=='open'&&+document.getElementById('editEyeClosure').value>.65;
 const history=()=>{const id=api.part()?.id;if(!histories.has(id))histories.set(id,tuningHistory());return histories.get(id);};
 function changed(part){api.changed(part);api.refresh();refresh();}
 function finish(cancel=false){if(!drag)return;const d=drag;drag=null;if(cancel){d.part.lidAdjust=d.before;changed(d.part);}else history().commit(d.before,normalizeLid(d.part.lidAdjust));refresh();}
 function refresh(){
  if(current!==api.project()){current=api.project();drag=null;histories.clear();}
  if(!visible()||!current){overlay?.remove();return;}
  const surface=art.querySelector('canvas.rig-preview');if(!surface)return;
  if(!overlay?.isConnected){
   overlay=document.createElementNS(ns,'svg');overlay.id='eyeDirectSvg';overlay.classList.add('eye-gizmo');overlay.setAttribute('aria-label','閉じ目を直接編集');art.append(overlay);
   const begin=side=>{api.select(side);document.dispatchEvent(new CustomEvent('shapeeditrequest',{detail:{step:'eyes'}}));refresh();};
   overlay.onkeydown=e=>{if(e.target.dataset.eye&&['Enter',' '].includes(e.key)){e.preventDefault();begin(e.target.dataset.eye);}};
   overlay.onpointerdown=e=>{const hit=e.target.closest('[data-eye]');if(!hit||e.button!==0)return;e.stopPropagation();e.preventDefault();if(!enabled()){begin(hit.dataset.eye);return;}api.select(hit.dataset.eye);if(document.body.dataset.shapeTool==='contour'&&(!hit.dataset.handle||hit.dataset.handle==='move')){refresh();return;}const p=api.part();if(!p)return;const start=new DOMPoint(e.clientX,e.clientY).matrixTransform(overlay.getScreenCTM().inverse());drag={part:p,before:normalizeLid(p.lidAdjust),start,handle:hit.dataset.handle||'move',bounds:bounds.get(p.id),id:e.pointerId};overlay.setPointerCapture(e.pointerId);refresh();};
   overlay.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(overlay.getScreenCTM().inverse());drag.part.lidAdjust=dragEye({...drag.part,lidAdjust:drag.before},drag.handle,drag.start,point,{bounds:drag.bounds,free:e.shiftKey,center:e.altKey});changed(drag.part);};
   overlay.onpointerup=()=>finish();overlay.onpointercancel=()=>finish(true);overlay.onlostpointercapture=()=>finish();
  }
  overlay.setAttribute('viewBox',`0 0 ${current.width} ${current.height}`);
  Object.assign(overlay.style,{left:surface.offsetLeft+'px',top:surface.offsetTop+'px',width:surface.clientWidth+'px',height:surface.clientHeight+'px'});
  const matrix=overlay.getScreenCTM(),unit=1/Math.max(.01,Math.hypot(matrix.a,matrix.b)),r=6*unit;
  const contour=document.body.dataset.shapeTool==='contour';
  if(!enabled()){
   overlay.innerHTML=current.parts.filter(p=>p.visible&&/^lash-[lr]$/.test(p.role)&&p.closedSvgText).map(p=>{const white=current.parts.find(v=>v.role==='white-'+p.role.slice(-1))||p;const pad=8*unit;return `<rect class="eye-pick" data-eye="${p.role.slice(-1)}" data-handle="pick" x="${white.x-pad}" y="${Math.min(white.y,p.y)-pad}" width="${white.width+pad*2}" height="${Math.max(white.height,p.height)+pad*2}" rx="${6*unit}" tabindex="0" role="button" aria-label="${p.role.endsWith('r')?'画面左':'画面右'}の閉じ目を編集"><title>クリックして閉じ目を編集</title></rect>`;}).join('');
   return;
  }
  overlay.innerHTML=current.parts.filter(p=>p.visible&&/^lash-[lr]$/.test(p.role)&&p.closedSvgText).map(p=>{
   const f=eyeFrame(p),side=p.role.slice(-1),selected=p===api.part(),[left,center,right]=f.world;
   const raw=closedLashArtwork({...p,lidAdjust:{...f.v,x:0,y:0,angle:0,width:1,height:1,thickness:f.profile?f.v.thickness:1}});
   const b=artworkBounds(raw,p.width/2,p.height*.75,{left:-p.width/2,right:p.width/2,top:-5,bottom:5});
   if(b.bottom-b.top<28*unit){const cy=(b.top+b.bottom)/2;b.top=cy-14*unit;b.bottom=cy+14*unit;}bounds.set(p.id,b);
   if(!contour||!f.profile)return selected?transformBox(f.matrix,b,unit,`data-eye="${side}"`):`<path class="eye-hit" data-eye="${side}" data-handle="move" d="M${left.x} ${left.y}L${right.x} ${right.y}" stroke-width="${18*unit}"><title>クリックしてもう片方の目を選択</title></path>`;
   const handle=(name,point,label)=>`<circle data-eye="${side}" data-handle="${name}" cx="${point.x}" cy="${point.y}" r="${r}" aria-label="${label}"><title>${label}</title></circle>`;
   return `<g class="${selected?'selected':''}"><path class="eye-hit" data-eye="${side}" data-handle="move" d="M${left.x} ${left.y} Q${center.x} ${2*center.y-(left.y+right.y)/2} ${right.x} ${right.y}" stroke-width="${18*unit}"><title>閉じ目を移動</title></path>${selected?handle('curve',center,'中央をつかんでカーブを調整'):''}</g>`;
  }).join('');
  api.history?.(history());
 }
 new MutationObserver(()=>{if(!enabled())finish();refresh();}).observe(document.body,{attributes:true,attributeFilter:['data-task','data-edit-step','data-eye-review','data-eyes-stage','data-shape-tool']});
 document.getElementById('editEyeClosure').addEventListener('input',()=>{if(drag)finish();refresh();});
 art.addEventListener('workviewchange',refresh);window.addEventListener('resize',refresh);
 document.addEventListener('keydown',e=>{if(!enabled()||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='Escape')finish(true);if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const p=api.part();if(!p)return;const before=normalizeLid(p.lidAdjust),n=e.shiftKey?5:.5;p.lidAdjust=dragEye(p,'move',{x:0,y:0},{x:e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0,y:e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0});history().commit(before,p.lidAdjust);changed(p);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}});
 function undo(redo=false){const p=api.part();if(!p)return;finish();p.lidAdjust=history()[redo?'redo':'undo'](normalizeLid(p.lidAdjust));changed(p);}
 return {refresh,undo,
 beginEdit(){finish();editCheckpoint={project:api.project(),parts:api.project().parts.filter(p=>/^lash-[lr]$/.test(p.role)).map(p=>({id:p.id,value:structuredClone(p.lidAdjust)})),histories:new Map([...histories].map(([id,h])=>[id,h.snapshot()]))};},
 cancelEdit(){finish(true);if(!editCheckpoint||editCheckpoint.project!==api.project())return;for(const saved of editCheckpoint.parts){const p=api.project().parts.find(p=>p.id===saved.id);if(saved.value===undefined)delete p.lidAdjust;else p.lidAdjust=structuredClone(saved.value);api.changed(p);}histories.clear();for(const [id,saved] of editCheckpoint.histories){const h=tuningHistory();h.restore(saved);histories.set(id,h);}editCheckpoint=null;api.refresh();refresh();},
 commit(before){if(api.part())history().commit(before,normalizeLid(api.part().lidAdjust));refresh();}};
}
