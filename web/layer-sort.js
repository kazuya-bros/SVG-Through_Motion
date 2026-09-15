// The list is front-to-back; the project's paint order is back-to-front.
export function reorderLayers(parts,id,beforeId=null){
 const front=[...parts].reverse(),from=front.findIndex(p=>p.id===id);
 if(from<0||beforeId===id||beforeId!==null&&!front.some(p=>p.id===beforeId))return false;
 const [part]=front.splice(from,1),to=beforeId===null?front.length:front.findIndex(p=>p.id===beforeId);
 front.splice(to,0,part);front.reverse();
 if(front.every((p,i)=>p===parts[i]))return false;
 parts.splice(0,parts.length,...front);return true;
}

export function installLayerSort(list,move){
 let drag=null,raf=0,suppressClick=false;
 const rows=()=>[...list.querySelectorAll('.layer')];
 function clearMarkers(){rows().forEach(r=>r.classList.remove('drop-before','drop-after'));}
 function mark(){
  clearMarkers();if(!drag?.active)return;
  const bounds=list.getBoundingClientRect();
  drag.inside=drag.x>=bounds.left&&drag.x<=bounds.right&&drag.y>=bounds.top&&drag.y<=bounds.bottom;
  if(!drag.inside)return;
  const others=rows().filter(r=>r!==drag.row);
  const next=others.find(r=>{const b=r.getBoundingClientRect();return drag.y<b.top+b.height/2;});
  drag.beforeId=next?.dataset.partId??null;
  if(next)next.classList.add('drop-before');else others.at(-1)?.classList.add('drop-after');
 }
 function scroll(){
  if(!drag?.active)return;
  const b=list.getBoundingClientRect();
  if(drag.x>=b.left&&drag.x<=b.right&&drag.y>=b.top&&drag.y<=b.bottom){
   const edge=36,dy=drag.y<b.top+edge?-Math.ceil((b.top+edge-drag.y)/4):drag.y>b.bottom-edge?Math.ceil((drag.y-b.bottom+edge)/4):0;
   if(dy){list.scrollTop+=dy;mark();}
  }
  raf=requestAnimationFrame(scroll);
 }
 function finish(commit){
  if(!drag)return;
  const done=drag;drag=null;cancelAnimationFrame(raf);clearMarkers();
  done.row.classList.remove('dragging');list.classList.remove('sorting');
  if(list.hasPointerCapture(done.pointerId))list.releasePointerCapture(done.pointerId);
  if(done.active){suppressClick=true;if(commit&&done.inside)move(done.row.dataset.partId,done.beforeId);}
 }
 list.addEventListener('pointerdown',e=>{
  suppressClick=false;
  const row=e.target.closest('.layer');
  if(!row||e.button!==0||e.target.closest('input,button,a')||rows().length<2)return;
  drag={row,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false};
 });
 list.addEventListener('pointermove',e=>{
  if(!drag||drag.pointerId!==e.pointerId)return;
  drag.x=e.clientX;drag.y=e.clientY;
  if(!drag.active){
   if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<5)return;
   drag.active=true;list.setPointerCapture(e.pointerId);drag.row.classList.add('dragging');list.classList.add('sorting');raf=requestAnimationFrame(scroll);
  }
  e.preventDefault();mark();
 });
 list.addEventListener('pointerup',e=>{if(drag?.pointerId===e.pointerId)finish(true);});
 list.addEventListener('pointercancel',()=>finish(false));
 list.addEventListener('lostpointercapture',()=>finish(false));
 list.addEventListener('pointerleave',()=>{if(drag&&!drag.active)finish(false);});
 list.addEventListener('click',e=>{if(suppressClick){suppressClick=false;if(e.detail===0)return;e.preventDefault();e.stopImmediatePropagation();}},true);
 list.addEventListener('dragstart',e=>e.preventDefault());
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();finish(false);}});
 list.addEventListener('keydown',e=>{
  if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key)||!e.target.matches('.layer'))return;
  e.preventDefault();const all=rows(),i=all.indexOf(e.target),next=i+(e.key==='ArrowUp'?-1:1);
  if(next<0||next>=all.length)return;
  move(e.target.dataset.partId,all[e.key==='ArrowUp'?next:next+1]?.dataset.partId??null);
 });
}
