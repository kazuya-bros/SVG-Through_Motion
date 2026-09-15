const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
export const EDIT_EYE_BLEND=.78,EDIT_MOUTH_BLEND=.06;
// Editing uses neutral geometry, independent of timeline, tracking and audio.
export function editingPose(eye=0,mouth=0){return {blinkL:clamp(eye,0,1),blinkR:clamp(eye,0,1),mouth:clamp(mouth,0,1)};}
export function zoomAt(view,factor,point={x:0,y:0}){
 const scale=clamp(view.scale*factor,.25,8),ratio=scale/view.scale;
 return {scale,x:point.x-(point.x-view.x)*ratio,y:point.y-(point.y-view.y)*ratio};
}
export function installWorkArea(api){
 const stage=document.getElementById('stage'),art=document.getElementById('artboard');let view={scale:1,x:0,y:0},drag=null;
 function apply(){const transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;art.style.transform=transform;document.getElementById('originalImage').style.transform=transform;document.getElementById('zoomValue').textContent=Math.round(view.scale*100)+'%';art.dispatchEvent(new Event('workviewchange'));}
 const local=e=>{const r=stage.getBoundingClientRect();return {x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2};};
 function zoom(factor,point){view=zoomAt(view,factor,point);apply();}
 stage.addEventListener('wheel',e=>{if(!api.enabled()||e.target.closest('#mouthWorkbench'))return;e.preventDefault();zoom(Math.exp(-clamp(e.deltaY*(e.deltaMode===1?16:1),-300,300)*.002),local(e));},{passive:false});
 stage.addEventListener('pointerdown',e=>{if(!api.enabled()||e.target.closest('#pivotPicker,#mouthWorkbench,[data-handle],button,input,select')||e.button!==0)return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,view:{...view}};stage.classList.add('panning');stage.setPointerCapture(e.pointerId);e.preventDefault();});
 stage.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;view={...view,x:drag.view.x+e.clientX-drag.x,y:drag.view.y+e.clientY-drag.y};apply();});
 const end=()=>{drag=null;stage.classList.remove('panning');};
 stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('lostpointercapture',end);
 return {zoom,apply,focus(project,point,scale=2){
  const fit=Math.min((art.clientWidth-24)/project.width,(art.clientHeight-52)/project.height);
  view={scale,x:-(point.x-project.width/2)*fit*scale,y:-(point.y-project.height/2)*fit*scale};apply();
 },reset(){view={scale:1,x:0,y:0};apply();}};
}
