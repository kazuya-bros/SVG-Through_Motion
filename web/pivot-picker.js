import {warpPoint,normalizeRig} from './rig.js?v=mouth-editor-9';
const ns='http://www.w3.org/2000/svg';
export function pivotScreenPoint(point,project,part,pose){
 const owner=part?{...project,deformGroup:part.deformGroup,parts:[part]}:{...project,deformGroup:'core'};
 const preview=part?{...pose,pivotOverrides:{...pose.pivotOverrides,[part.id]:{pivotX:point.x,pivotY:point.y}}}:{...pose,neckPivot:point};
 const [x,y]=warpPoint(point.x,point.y,owner,preview),cx=project.width/2,cy=project.height*.75;
 const angle=(pose.sway||0)*Math.PI/180,dy=y+(pose.bounce||0)-(pose.breathe||0)-cy,dx=x-cx;
 return {x:cx+dx*Math.cos(angle)-dy*Math.sin(angle),y:cy+dx*Math.sin(angle)+dy*Math.cos(angle)};
}
export function pivotFromScreen(target,project,part,pose){
 // DOMPoint coordinates are prototype accessors, so object spread loses them.
 let point={x:target.x,y:target.y};
 for(let i=0;i<10;i++){
  const p=pivotScreenPoint(point,project,part,pose),dx=target.x-p.x,dy=target.y-p.y;
  if(Math.hypot(dx,dy)<.001)break;
  const px=pivotScreenPoint({x:point.x+.5,y:point.y},project,part,pose),py=pivotScreenPoint({x:point.x,y:point.y+.5},project,part,pose);
  const a=(px.x-p.x)*2,b=(px.y-p.y)*2,c=(py.x-p.x)*2,d=(py.y-p.y)*2,det=a*d-b*c;
  if(Math.abs(det)<.01)break;
  point={x:point.x+(d*dx-c*dy)/det,y:point.y+(a*dy-b*dx)/det};
 }
 return boundedPivot(point,project);
}
export function boundedPivot(point,project){return {x:Math.max(0,Math.min(project.width,point.x)),y:Math.max(0,Math.min(project.height,point.y))};}
export function applyPivot(project,parts,point){
 const p=boundedPivot(point,project);
 for(const part of parts){part.pivotX=p.x;part.pivotY=p.y;}
 const group=parts[0]?.deformGroup;
 if(group?.startsWith('arm-')&&project.rig?.arms?.[group])project.rig.arms[group]={...p};
}
export function applyNeckPivot(project,point){
 const p=boundedPivot(point,project);
 project.rig=normalizeRig({...project.rig,neckX:p.x,neckY:p.y},project);
}
export function installPivotPicker(api){
 const art=document.getElementById('artboard'),stage=document.getElementById('stage');
 let state=null,overlay=null,bar=null,drag=null;
 function finish(commit=false){
  if(!state)return;
  const old=state;state=null;drag=null;overlay?.remove();bar?.remove();
  if(commit&&old.project===api.project()){
   if(old.neck)applyNeckPivot(old.project,old.point);else applyPivot(old.project,old.parts,old.point);
   api.changed();
  }
  api.end();
 }
 function refresh(){
  if(!state)return;
  if(state.project!==api.project()){finish();return;}
  const surface=art.querySelector('canvas.rig-preview');if(!surface)return;
  if(!overlay?.isConnected){
   overlay=document.createElementNS(ns,'svg');overlay.id='pivotPicker';overlay.setAttribute('aria-label','揺れの支点を指定');overlay.setAttribute('tabindex','0');art.append(overlay);
   overlay.onpointerdown=e=>{
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();
    const m=overlay.getScreenCTM(),point=pivotScreenPoint(state.point,state.project,state.parts[0],api.pose());
    const marker=new DOMPoint(point.x,point.y).matrixTransform(m),near=Math.hypot(marker.x-e.clientX,marker.y-e.clientY)<=24;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:near?marker.x-e.clientX:0,dy:near?marker.y-e.clientY:0};
    overlay.setPointerCapture(e.pointerId);refresh();
   };
   overlay.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();drag.x=e.clientX;drag.y=e.clientY;refresh();};
   const release=e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();refresh();drag=null;if(overlay.hasPointerCapture(e.pointerId))overlay.releasePointerCapture(e.pointerId);};
   overlay.onpointerup=release;overlay.onpointercancel=release;overlay.onlostpointercapture=()=>{drag=null;};
   overlay.ondragstart=e=>e.preventDefault();
   overlay.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();const n=e.shiftKey?10:1;state.point=boundedPivot({x:state.point.x+(e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0),y:state.point.y+(e.key==='ArrowDown'?n:e.key==='ArrowUp'?-n:0)},state.project);refresh();};
  }
  overlay.setAttribute('viewBox',`0 0 ${state.project.width} ${state.project.height}`);
  Object.assign(overlay.style,{left:surface.offsetLeft+'px',top:surface.offsetTop+'px',width:surface.clientWidth+'px',height:surface.clientHeight+'px'});
  if(drag){const target=new DOMPoint(drag.x+drag.dx,drag.y+drag.dy).matrixTransform(overlay.getScreenCTM().inverse());state.point=pivotFromScreen(target,state.project,state.parts[0],api.pose());}
  const {x,y}=pivotScreenPoint(state.point,state.project,state.parts[0],api.pose());
  const matrix=overlay.getScreenCTM(),unit=1/Math.max(.01,Math.hypot(matrix.a,matrix.b)),r=8*unit,d=13*unit;
  if(!overlay.firstChild)overlay.innerHTML='<rect width="100%" height="100%" fill="transparent"/><circle fill="white" stroke="#5364df"/><path stroke="#5364df"/>';
  const circle=overlay.querySelector('circle'),cross=overlay.querySelector('path');
  for(const [key,value] of Object.entries({cx:x,cy:y,r,'stroke-width':2*unit}))circle.setAttribute(key,value);
  cross.setAttribute('d',`M${x-d} ${y}H${x+d}M${x} ${y-d}V${y+d}`);cross.setAttribute('stroke-width',2*unit);
 }
 function start(parts,{neck=false}={}){
  finish();const project=api.project();if(!project||(!neck&&!parts.length)||(neck&&!project.rig))return;
  const p=parts[0],arm=project.rig?.arms?.[p?.deformGroup];
  const point=neck?{x:project.rig.neckX,y:project.rig.neckY}:{x:p.pivotX??arm?.x??p.x+p.width/2,y:p.pivotY??arm?.y??p.y+p.height*.9};
  state={project,parts,neck,task:document.body.dataset.task,point:boundedPivot(point,project)};
  bar=document.createElement('div');bar.className='pivot-picker-actions';bar.innerHTML=`<span>${neck?'印を首の付け根に合わせてください':'支点をクリックで移動・ドラッグで調整'}<br><small>ドラッグ・矢印キーで調整できます</small></span><button type="button" class="primary">決定</button><button type="button">キャンセル</button>`;
  bar.querySelectorAll('button')[0].onclick=()=>finish(true);bar.querySelectorAll('button')[1].onclick=()=>finish();stage.append(bar);api.begin();refresh();overlay?.focus();
 }
 document.addEventListener('keydown',e=>{if(state&&e.key==='Escape'){e.preventDefault();finish();}});
 document.querySelectorAll('[data-motion-page],[data-edit-page]').forEach(button=>button.addEventListener('click',()=>finish()));
 new MutationObserver(()=>{if(state&&state.task!==document.body.dataset.task)finish();}).observe(document.body,{attributes:true,attributeFilter:['data-task']});
 art.addEventListener('workviewchange',refresh);window.addEventListener('resize',refresh);
 return {start,startNeck:()=>start([],{neck:true}),refresh,cancel:()=>finish(),get neckOverride(){return state?.neck?state.point:undefined;},get overrides(){return state&&!state.neck?Object.fromEntries(state.parts.map(p=>[p.id,{pivotX:state.point.x,pivotY:state.point.y}])):undefined;},get active(){return !!state;}};
}
