import {normalizeRegion,regionWeight,paintRegion} from './motion-region.js';
export function installMotionRegionUI(api){
 const art=document.getElementById('artboard'),stage=document.getElementById('stage');let state=null,canvas=null,drag=null,hover=null;
 const cursor=document.createElement('i');cursor.className='motion-brush-cursor';cursor.hidden=true;art.append(cursor);
 const bar=document.createElement('div');bar.className='chest-preview-actions motion-region-actions';bar.hidden=true;
 bar.innerHTML='<strong data-title></strong><label>ブラシの大きさ<input data-size type="range" min="10" max="200" value="60"></label><button data-erase type="button" aria-pressed="false">消す</button><button data-undo type="button">取り消す</button><button data-clear type="button">クリア</button><button data-apply type="button" class="primary">この範囲で確定</button><button data-cancel type="button">キャンセル</button>';
 stage.append(bar);bar.onpointerdown=e=>e.stopPropagation();const q=k=>bar.querySelector('[data-'+k+']');
 function refresh(){
  if(!state)return;const p=api.project();if(p!==state.project){finish();return;}
  const surface=art.querySelector('canvas.rig-preview');if(!surface)return;if(!cursor.isConnected)art.append(cursor);
  if(!canvas?.isConnected){canvas=document.createElement('canvas');canvas.className='motion-region-overlay';art.append(canvas);canvas.onpointerdown=down;canvas.onpointermove=move;canvas.onpointerup=canvas.onpointercancel=e=>{drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};}
  // Match the contained artwork, not the canvas element's letterboxed CSS box.
  const scale=Math.min(surface.clientWidth/p.width,surface.clientHeight/p.height),w=p.width*scale,h=p.height*scale;
  Object.assign(canvas.style,{left:(surface.offsetLeft+(surface.clientWidth-w)/2)+'px',top:(surface.offsetTop+(surface.clientHeight-h)/2)+'px',width:w+'px',height:h+'px'});
  canvas.style.cursor=state.mode==='brush'?'none':'crosshair';canvas.onpointerleave=()=>{hover=null;cursor.hidden=true;};
  canvas.width=p.width;canvas.height=p.height;const c=canvas.getContext('2d'),r=state.region;
  if(state.mode==='brush'){
   const small=document.createElement('canvas');small.width=small.height=64;const sc=small.getContext('2d'),im=sc.createImageData(64,64);
   for(let i=0;i<4096;i++){im.data[i*4]=83;im.data[i*4+1]=100;im.data[i*4+2]=223;im.data[i*4+3]=(r.mask?.[i]||0)*.55;}sc.putImageData(im,0,0);c.drawImage(small,0,0,p.width,p.height);
  }else{c.beginPath();c.ellipse(r.cx*p.width,r.cy*p.height,r.rx*p.width,r.ry*p.height,0,0,Math.PI*2);c.fillStyle='#6575ee44';c.fill();c.strokeStyle='#5364df';c.lineWidth=2*p.width/surface.clientWidth;c.stroke();for(const [x,y]of [[r.cx,r.cy],[r.cx+r.rx,r.cy],[r.cx,r.cy+r.ry]]){c.beginPath();c.arc(x*p.width,y*p.height,7*p.width/surface.clientWidth,0,Math.PI*2);c.fillStyle='white';c.fill();c.stroke();}}
  q('undo').disabled=!state.history.length;q('apply').disabled=state.mode==='brush'&&!state.region.mask?.some(x=>x>0);showCursor();
 }
 function showCursor(){cursor.hidden=!state||state.mode!=='brush'||!hover;if(cursor.hidden)return;const b=canvas.getBoundingClientRect(),a=art.getBoundingClientRect(),zoom=a.width/art.offsetWidth,diameter=+q('size').value*canvas.clientWidth/state.project.width;Object.assign(cursor.style,{left:((hover.x-b.left)/zoom+canvas.offsetLeft)+'px',top:((hover.y-b.top)/zoom+canvas.offsetTop)+'px',width:diameter+'px',height:diameter+'px'});cursor.classList.toggle('erasing',q('erase').getAttribute('aria-pressed')==='true');}
 const point=e=>{const b=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};};
 function down(e){if(e.button!==0)return;e.preventDefault();e.stopPropagation();state.history.push(structuredClone(state.region));if(state.history.length>12)state.history.shift();const pt=point(e),r=state.region;drag={...pt,handle:Math.abs(pt.x-r.cx-r.rx)<.025&&Math.abs(pt.y-r.cy)<.025?'rx':Math.abs(pt.y-r.cy-r.ry)<.025&&Math.abs(pt.x-r.cx)<.025?'ry':'center'};canvas.setPointerCapture(e.pointerId);move(e);}
 function move(e){if(!state)return;hover={x:e.clientX,y:e.clientY};showCursor();if(!drag)return;e.preventDefault();e.stopPropagation();const pt=point(e),r=state.region,p=state.project;
  if(state.mode==='brush'){const radius=+q('size').value/2/p.width,n=Math.max(1,Math.ceil(Math.hypot(pt.x-drag.x,(pt.y-drag.y)*p.height/p.width)/Math.max(.001,radius*.25)));for(let i=1;i<=n;i++)paintRegion(r,drag.x+(pt.x-drag.x)*i/n,drag.y+(pt.y-drag.y)*i/n,radius,q('erase').getAttribute('aria-pressed')==='true',p.height/p.width);}
  else if(drag.handle==='rx')r.rx=Math.max(.005,Math.abs(pt.x-r.cx));else if(drag.handle==='ry')r.ry=Math.max(.005,Math.abs(pt.y-r.cy));else{r.cx=pt.x;r.cy=pt.y;}
  Object.assign(drag,pt);refresh();
 }
 function finish(apply=false){if(!state)return;const old=state;state=null;drag=null;hover=null;cursor.hidden=true;canvas?.remove();canvas=null;bar.hidden=true;api.end();if(apply&&old.project===api.project())old.apply(normalizeRegion(old.region));}
 q('size').oninput=showCursor;
 q('erase').onclick=()=>{q('erase').setAttribute('aria-pressed',String(q('erase').getAttribute('aria-pressed')!=='true'));showCursor();};
 q('undo').onclick=()=>{if(state?.history.length){state.region=state.history.pop();refresh();}};
 q('clear').onclick=()=>{state.history.push(structuredClone(state.region));state.region.mask=Array(4096).fill(0);refresh();};
 q('apply').onclick=()=>finish(true);q('cancel').onclick=()=>finish();
 document.addEventListener('keydown',e=>{if(state&&e.key==='Escape'){e.preventDefault();finish();}});
 document.querySelectorAll('[data-motion-page],[data-tab]').forEach(b=>b.addEventListener('click',()=>finish()));art.addEventListener('workviewchange',refresh);window.addEventListener('resize',refresh);
 return {refresh,cancel:()=>finish(),get active(){return !!state;},start({title,mode,region,apply}){finish();const p=api.project();if(!p)return;const r=structuredClone(normalizeRegion(region)||{cx:.5,cy:.5,rx:.2,ry:.15});if(mode==='ellipse')delete r.mask;else r.mask??=Array.from({length:4096},(_,i)=>Math.round(255*regionWeight(r,(i%64)/63,Math.floor(i/64)/63)));state={project:p,mode,region:r,apply,history:[]};api.begin();bar.hidden=false;q('title').textContent=title+(mode==='brush'?'：塗った範囲を動かす':'：中心と丸印をドラッグ');for(const k of ['size','erase','clear'])q(k).closest(k==='size'?'label':'button').hidden=mode!=='brush';refresh();}};
}
