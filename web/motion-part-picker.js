import {partLabel} from './part-label.js';

export function partThumbnail(part){
 const img=document.createElement('img');img.alt='';img.draggable=false;img.loading='lazy';
 img.src=part.rasterSourceUrl||part.originalUrl||'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${part.width} ${part.height}">${part.svgText||''}</svg>`);
 return img;
}

// Retain the select as the shared selection state; show actual artwork for each choice.
export function installMotionPartPicker(select){
 const host=document.createElement('details');host.className='motion-part-picker';
 const summary=document.createElement('summary'),grid=document.createElement('div');grid.className='motion-part-options';grid.setAttribute('role','group');grid.setAttribute('aria-label','動かすパーツの一覧');host.append(summary,grid);select.after(host);select.hidden=true;
 let parts=[];
 function show(){const current=parts.find(p=>p.id===select.value);summary.replaceChildren();if(current){summary.append(partThumbnail(current),document.createTextNode(partLabel(current)));}else summary.textContent='対象レイヤーなし';for(const button of grid.children)button.setAttribute('aria-pressed',String(button.dataset.part===select.value));}
 select.addEventListener('change',show);
 return {refresh(values){parts=values;grid.replaceChildren(...parts.map(p=>{const b=document.createElement('button');b.type='button';b.dataset.part=p.id;const name=document.createElement('span');name.textContent=partLabel(p);b.append(partThumbnail(p),name);b.onclick=()=>{select.value=p.id;select.dispatchEvent(new Event('change',{bubbles:true}));host.open=false;summary.focus();};return b;}));show();}};
}
