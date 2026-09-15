import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {sceneSvg,applyPose,cloneIds} from './motion.js?v=mouth-editor-9';
import {mouthFrame,transformPoint,dragMouth} from './mouth-gizmo.js';
import {transformBox,artworkBounds} from './transform-box.js';
import {closedMouthArtwork} from './mouth-controls.js';
import {closedProfile,closedPoints} from './closed-mouth.js';

const ns='http://www.w3.org/2000/svg';
export function installMouthWorkbench(api){
 const box=document.createElement('div');box.id='mouthWorkbench';box.hidden=true;
 box.innerHTML=`<header><div><strong>口を直接編集</strong><span class="mouth-mode-caption">輪郭をつかんで調整</span></div><button id="mouthDone" class="primary">編集を終える</button></header>
 <div class="mouth-tool-row"><div class="mouth-shape-chips" role="group" aria-label="編集する口形">${['closed','open','a','i','u','e','o'].map((k,i)=>`<button data-shape="${k}">${['閉じ口','開いた口','あ','い','う','え','お'][i]}</button>`).join('')}</div><div class="mouth-history"><button id="mouthUndo" aria-label="口の編集を元に戻す">↶ 元に戻す</button><button id="mouthRedo" aria-label="口の編集をやり直す">↷</button></div></div>
 <div class="mouth-tool-row"><div class="mouth-targets"><button id="mouthTarget" class="active">口の形</button><button id="teethTarget">歯の位置・大きさ</button></div><label class="mouth-zoom-label">表示<select id="mouthZoom"><option value="mouth">口元を拡大</option><option value="face">顔全体</option><option value="full">全身</option></select></label></div>
 <div class="mouth-viewport" id="mouthViewport"><canvas aria-label="編集するキャラクターの背景"></canvas><svg xmlns="${ns}" id="mouthDirectSvg" aria-label="口の直接編集キャンバス" tabindex="0"><g id="mouthDirectArt"></g><g id="mouthDirectHandles"></g></svg><div id="mouthPreparing" role="status">顔のプレビューを準備中…</div></div>
 <footer><span id="mouthGestureHint">中央：移動　左右：幅　下：開き　上の丸：傾き</span><span id="mouthEditTiming"></span></footer>`;
 document.getElementById('stage').append(box);
 const $=id=>box.querySelector('#'+id),surface=$('mouthDirectSvg'),art=$('mouthDirectArt'),handles=$('mouthDirectHandles'),canvas=box.querySelector('canvas');
 let active=false,background=null,token=0,drag=null,scheduled=0,target='mouth',crop=null,dirty=false,manualCrop=null,pan=null,boxBounds=null;
 const reviewing=()=>document.body.dataset.task==='edit'&&(document.body.dataset.mouthReview==='true'||document.body.dataset.mouthStage==='open');
 const settings=()=>({...api.project().settings,previewAmount:api.amount(),background:'transparent',rigEnabled:false,vowels:!['closed','open'].includes(api.shape()),imageWidth:api.project().width});
 const point=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(surface.getScreenCTM().inverse());
 const history=()=>{$('mouthUndo').disabled=!api.history.canUndo;$('mouthRedo').disabled=!api.history.canRedo;};
 function cropBox(){
  if(manualCrop){const r=$('mouthViewport').getBoundingClientRect();return {...manualCrop,h:manualCrop.w*r.height/Math.max(1,r.width)};}
  const p=api.project(),m=api.part(),r=$('mouthViewport').getBoundingClientRect(),ratio=r.width/Math.max(1,r.height),mode=$('mouthZoom').value;
  const w=mode==='full'?Math.max(p.width,p.height*ratio):mode==='face'?Math.max(m.width*10,p.width*.42):Math.max(m.width*4.6,p.width*.18);
  const h=w/ratio,cx=mode==='full'?p.width/2:m.x+m.width/2,cy=mode==='full'?p.height/2:mode==='face'?m.y+m.height/2-p.height*.065:m.y+m.height/2;
  return {x:cx-w/2,y:cy-h/2,w,h};
 }
 function drawBackground(){
  if(!active)return;crop=cropBox();const rect=$('mouthViewport').getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
  surface.setAttribute('viewBox',`${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
  document.getElementById('zoomValue').textContent=Math.round(api.project().width/crop.w*100)+'%';
  if(background){const p=api.project(),scale=background.canvas.width/p.width;
   canvas.getContext('2d').drawImage(background.canvas,crop.x*scale,crop.y*scale,crop.w*scale,crop.h*scale,0,0,canvas.width,canvas.height);}
 }
 function draw(){
  scheduled=0;if(!active||!api.part())return;const started=performance.now(),p=api.project(),part=api.part(),key=api.shape(),s=settings();
  const amount=api.amount(),scene={name:'口の形',width:p.width,height:p.height,parts:[part],settings:s},pose={mouth:amount,vowel:key==='closed'?'a':key,blinkL:0,blinkR:0};
  handles.style.display=reviewing()||(key==='closed'?amount>=.18:amount<1)?'none':'';
  const root=new DOMParser().parseFromString(cloneIds(sceneSvg(scene,s,false),'direct-mouth-'),'image/svg+xml').documentElement;
  art.replaceChildren(...root.childNodes);applyPose(surface,pose,scene,s);
  box.querySelectorAll('[data-shape]').forEach(b=>{const on=b.dataset.shape===key;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);b.hidden=!['closed','open'].includes(b.dataset.shape)&&!(api.project().settings.vowels&&(api.part().mouthVariants||document.getElementById('vowelOptions').open));});
  $('teethTarget').hidden=['closed','open'].includes(key);
  $('teethTarget').disabled=['closed','open'].includes(key)||!part.mouthInteriorSvg;
  if($('teethTarget').disabled)target='mouth';
  $('mouthTarget').classList.toggle('active',target==='mouth');$('teethTarget').classList.toggle('active',target==='teeth');
  if(!crop)drawBackground();
  const f=mouthFrame(part,s,key),v=f.value,r=Math.max(2,crop.w/Math.max(1,surface.clientWidth)*7),gap=r*5;
  const at=(x,y)=>transformPoint(f.matrix,{x,y});
  const circle=(name,x,y,label)=>{const q=at(x,y);return `<circle data-handle="${name}" cx="${q.x}" cy="${q.y}" r="${r}" tabindex="0" role="button" aria-label="${label}"><title>${label}</title></circle>`;};
  const path=points=>points.map((q,i)=>`${i?'L':'M'}${q.x} ${q.y}`).join(' ')+'Z';
  let width=part.width/2,height=f.closed?Math.max(3,part.height*.09):part.height/2,top=-height,bottom=height;
  if(target==='teeth'){
   width=part.width*v.teethWidth/2;top=part.height*(v.teethY-.5);bottom=top+part.height*v.teethHeight;
   handles.innerHTML=`<path data-handle="teeth-move" class="mouth-drag-area teeth" d="${path([at(-width,top),at(width,top),at(width,bottom),at(-width,bottom)])}"/><g class="mouth-knobs teeth">${circle('teeth-width',width,(top+bottom)/2,'歯の横幅')}${circle('teeth-height',0,bottom,'歯の高さ')}</g>`;
   $('mouthGestureHint').textContent='歯の枠：上下移動　右：幅　下：高さ（口内で切り抜き）';
  }else{
   const stem=at(0,top),turn=at(0,top-gap/Math.max(.1,f.closed?1:v.height));
   handles.innerHTML=`<path data-handle="move" class="mouth-drag-area" d="${path([at(-width,top),at(width,top),at(width,bottom),at(-width,bottom)])}"/><path class="mouth-stem" d="M${stem.x} ${stem.y} L${turn.x} ${turn.y}"/><g class="mouth-knobs">${circle('width',-width,0,'口の横幅（左）')}${circle('width',width,0,'口の横幅（右）')}${circle(f.closed?'thickness':'height',0,bottom,f.closed?'閉じ口の線の太さ':'口の開き')}<circle data-handle="rotate" cx="${turn.x}" cy="${turn.y}" r="${r}" tabindex="0" role="button" aria-label="口の傾き"><title>傾き</title></circle></g>`;
   const profile=f.closed&&closedProfile(part.closedSvgText);
   if(document.body.dataset.shapeTool!=='contour'||!profile){
    const source=f.closed?closedMouthArtwork(part,{...s,mouthTuning:{...s.mouthTuning,closed:{...v,x:0,y:0,angle:0,width:1,height:1}}}):part.svgText;
    boxBounds=artworkBounds(source,part.width/2,part.height/2,{left:-width,right:width,top,bottom});
    const unit=crop.w/Math.max(1,surface.clientWidth);if(boxBounds.bottom-boxBounds.top<28*unit){const cy=(boxBounds.top+boxBounds.bottom)/2;boxBounds.top=cy-14*unit;boxBounds.bottom=cy+14*unit;}
    handles.innerHTML=transformBox(f.matrix,boxBounds,unit);
   }else if(profile){
    const points=closedPoints(profile,v),c=points[Math.floor(points.length/2)];
    handles.innerHTML=`<g class="mouth-knobs">${circle('curve',c.x-part.width/2,c.y-part.height/2,'閉じ口のカーブ')}</g>`;
   }
   $('mouthGestureHint').textContent=document.body.dataset.shapeTool!=='contour'||!profile?'枠内：移動　四角：拡大縮小　上の丸：回転　Shift：自由な比率　Alt：中心から':profile?'線上の丸：カーブ　線の太さは右のスライダー':f.closed?'枠：移動　左右：幅　下：線の太さ　上の丸：傾き':'枠：移動　左右：幅　下：開き　上の丸：傾き';
  }
  if(reviewing())$('mouthGestureHint').textContent='口の位置・横幅・傾きを確認　ホイール：拡大縮小　ドラッグ：表示を移動';
  history();box.dataset.drawMs=(performance.now()-started).toFixed(1);$('mouthEditTiming').textContent=(document.body.dataset.task==='edit'&&document.body.dataset.mouthStage==='open'?'開いた口':key==='closed'?'閉じ口':key==='open'?'開いた口':'「'+({'a':'あ','i':'い','u':'う','e':'え','o':'お'})[key]+'」')+(reviewing()?'を確認中':'を編集中');
 }
 function redraw(){if(active&&!scheduled)scheduled=requestAnimationFrame(draw);}
 async function open(){
  if(active){redraw();return;}if(!api.part())return;
  if(api.shape()==='closed'&&!api.part().closedSvgText)api.choose('open');
  active=true;box.hidden=false;const generation=++token;api.begin();drawBackground();redraw();
  $('mouthPreparing').hidden=false;$('mouthPreparing').textContent='顔のプレビューを準備中…';
  try{
   await api.ready();if(!active||generation!==token)return;
   const p=api.project(),base={...p,rig:null,parts:p.parts.filter(q=>q!==api.part()),settings:{...p.settings,rigEnabled:false}};
   const renderer=await prepareCanvasRenderer(base,1024);
   if(!active||generation!==token){renderer.dispose();return;}
   renderer.draw({mouth:0,blinkL:0,blinkR:0});background=renderer;drawBackground();$('mouthPreparing').hidden=true;
  }catch(e){if(active&&generation===token)$('mouthPreparing').textContent='背景を準備できませんでした: '+e.message;}
 }
 function close({rebuild=true}={}){if(!active)return;cancelDrag();pan=null;active=false;token++;box.hidden=true;background?.dispose();background=null;crop=null;manualCrop=null;api.end(rebuild&&dirty);dirty=false;}
 function cancelDrag(){if(!drag)return;const before=drag.before;drag=null;api.restore(before);redraw();}
 surface.onpointerdown=e=>{
  if(e.button===0&&reviewing()&&e.target.closest('#mouthDirectArt')){e.preventDefault();document.dispatchEvent(new CustomEvent('shapeeditrequest',{detail:{step:'mouth'}}));return;}
  const handle=reviewing()?null:e.target.closest('[data-handle]');if(e.button!==0)return;
  if(!handle){pan={id:e.pointerId,x:e.clientX,y:e.clientY,crop:{...crop}};surface.setPointerCapture(e.pointerId);e.preventDefault();return;}
  drag={handle:handle.dataset.handle,start:point(e),before:structuredClone(api.project().settings.mouthTuning),settings:structuredClone(settings()),shape:api.shape(),bounds:boxBounds,id:e.pointerId};
  surface.setPointerCapture(e.pointerId);surface.focus();e.preventDefault();
 };
 surface.onpointermove=e=>{
  if(pan&&pan.id===e.pointerId){const scale=pan.crop.w/surface.clientWidth;manualCrop={...pan.crop,x:pan.crop.x-(e.clientX-pan.x)*scale,y:pan.crop.y-(e.clientY-pan.y)*scale};drawBackground();redraw();return;}
  if(!drag||drag.id!==e.pointerId)return;
  const tuning=dragMouth(api.part(),drag.settings,drag.shape,drag.handle,drag.start,point(e),{bounds:drag.bounds,free:e.shiftKey,center:e.altKey});api.restore(tuning);dirty=true;redraw();
 };
 surface.onpointerup=e=>{pan=null;if(!drag||drag.id!==e.pointerId)return;api.history.commit(drag.before,api.project().settings.mouthTuning);drag=null;history();};
 surface.onpointercancel=surface.onlostpointercapture=()=>{pan=null;cancelDrag();};
 box.onkeydown=e=>{if(reviewing())return;if(e.key==='Escape'){e.preventDefault();if(drag)cancelDrag();else if(document.body.dataset.task!=='edit')close();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!/INPUT|SELECT/.test(e.target.tagName)){e.preventDefault();api.undo(e.shiftKey);dirty=true;redraw();}
  if(surface.contains(e.target)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
   e.preventDefault();const n=e.shiftKey?5:.5,before=structuredClone(api.project().settings.mouthTuning),d={x:e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0,y:e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0};
   api.restore(dragMouth(api.part(),settings(),api.shape(),'move',{x:0,y:0},d));api.history.commit(before,api.project().settings.mouthTuning);dirty=true;redraw();
  }
 };
 box.querySelectorAll('[data-shape]').forEach(b=>b.onclick=()=>{cancelDrag();api.choose(b.dataset.shape);redraw();});
 $('mouthDone').onclick=()=>close();$('mouthUndo').onclick=()=>{api.undo(false);dirty=true;redraw();};$('mouthRedo').onclick=()=>{api.undo(true);dirty=true;redraw();};
 $('mouthTarget').onclick=()=>{target='mouth';redraw();};$('teethTarget').onclick=()=>{target='teeth';api.enableTeeth();dirty=true;redraw();};
 function resetView(){manualCrop=null;$('mouthZoom').value='full';drawBackground();redraw();document.getElementById('zoomValue').textContent='100%';}
 function zoom(factor,at){
  if(!active||!crop||drag||pan)return;
  const r=surface.getBoundingClientRect(),u=at?(at.clientX-r.left)/r.width:.5,v=at?(at.clientY-r.top)/r.height:.5;
  const w=Math.max(api.project().width*.035,Math.min(api.project().width*4,crop.w/factor)),h=w*r.height/r.width;
  manualCrop={x:crop.x+crop.w*u-w*u,y:crop.y+crop.h*v-h*v,w,h};drawBackground();redraw();
  document.getElementById('zoomValue').textContent=Math.round(api.project().width/w*100)+'%';
 }
 surface.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();zoom(Math.exp(-Math.max(-300,Math.min(300,e.deltaY*(e.deltaMode===1?16:1)))*.002),e);},{passive:false});
 $('mouthZoom').onchange=()=>{manualCrop=null;drawBackground();redraw();};
 document.getElementById('vowelOptions').addEventListener('toggle',()=>{if(!document.getElementById('vowelOptions').open&&!['closed','open'].includes(api.shape()))api.choose('closed');redraw();});
 const observer=new ResizeObserver(()=>{if(active){drawBackground();redraw();}});observer.observe($('mouthViewport'));
 new MutationObserver(()=>{if(reviewing())cancelDrag();redraw();}).observe(document.body,{attributes:true,attributeFilter:['data-mouth-review','data-task','data-mouth-stage','data-shape-tool']});
 return {open,close,redraw,zoom,resetView,changed(){dirty=true;redraw();},get active(){return active;}};
}
