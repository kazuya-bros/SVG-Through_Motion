// Editing has its own navigation and viewport; it never changes broadcast inputs.
export function installEffectsEditorShell({project,view,place,editor}){
 const stage=document.getElementById('stage');let drag=null;
 document.title='SVG-Through Motion — 演出を作る — '+(project.name||'キャラクター');
 document.getElementById('preparationName').textContent=project.name||'キャラクター';
 document.getElementById('resetRuntimeView').onclick=()=>{Object.assign(view,{x:0,y:0,scale:1});place();};
 stage.addEventListener('pointerdown',e=>{if(stage.dataset.editing||!([0,1].includes(e.button))||e.target.closest('button'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...view}};stage.setPointerCapture(e.pointerId);stage.classList.add('panning');e.preventDefault();});
 stage.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;view.x=drag.start.x+(e.clientX-drag.x)/stage.clientWidth;view.y=drag.start.y+(e.clientY-drag.y)/stage.clientHeight;place();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,()=>{drag=null;stage.classList.remove('panning');});
 stage.addEventListener('wheel',e=>{if(stage.dataset.editing)return;e.preventDefault();const r=stage.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5,scale=Math.max(.25,Math.min(8,view.scale*Math.exp(-Math.max(-300,Math.min(300,e.deltaY*(e.deltaMode===1?16:1)))*.002))),ratio=scale/view.scale;Object.assign(view,{scale,x:x-(x-view.x)*ratio,y:y-(y-view.y)*ratio});place();},{passive:false});
 let leaving=false;
 document.querySelector('.brand').addEventListener('click',e=>{if(editor.dirty&&!confirm('演出の変更が保存されていません。保存せずメインメニューへ戻りますか？')){e.preventDefault();return;}leaving=true;});
 window.addEventListener('beforeunload',e=>{if(!leaving&&editor.dirty){e.preventDefault();e.returnValue='';}});
}
