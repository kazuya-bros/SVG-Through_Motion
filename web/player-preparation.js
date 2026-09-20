import {outputBackground} from './runtime-input.js';

// The player, inputs and AI connection stay alive while only the layout changes.
export function installPlayerPreparation({sid,config,view,place,onVoice,enableAudio}){
 const $=id=>document.getElementById(id),base='/api/runtime/sessions/'+sid;
 let preparing=false,hoverTimer;
 function framing(){
  place();const url=new URL($('displayUrl').value||'/web/player.html',location.origin);
  for(const [key,value] of [['viewX',view.x],['viewY',view.y],['viewScale',view.scale]])url.searchParams.set(key,value);
  $('displayUrl').value=url.href;
 }
 function show(value){
  preparing=value;document.body.classList.toggle('preparing',value);document.body.classList.toggle('broadcasting',!value);
  $('preparationHeader').hidden=$('controls').hidden=$('previewTools').hidden=!value;
  $('returnPreparation').hidden=value;
  const url=new URL(location.href);url.searchParams.set('prepare',value?'1':'0');
  for(const [key,v] of [['viewX',view.x],['viewY',view.y],['viewScale',view.scale]])url.searchParams.set(key,v);
  history.replaceState(null,'',url);framing();
 }
 $('preparationName').textContent=config.project.name||'キャラクター';
 $('enterBroadcast').onclick=()=>show(false);
 $('returnPreparation').onclick=()=>{show(true);$('enterBroadcast').focus({preventScroll:true});};
 $('resetRuntimeView').onclick=()=>{Object.assign(view,{x:0,y:0,scale:1});framing();};
 const background=()=>outputBackground($('runtimeBackground').value==='custom'?$('outputColor').value:$('runtimeBackground').value);
 const saved=outputBackground(new URLSearchParams(location.search).get('background')||'#00ff00');
 $('runtimeBackground').value=['transparent','#00ff00','#0000ff'].includes(saved)?saved:'custom';
 if(saved!=='transparent')$('outputColor').value=saved;
 function changeBackground(){
  const color=background();$('outputColorLabel').hidden=$('runtimeBackground').value!=='custom';
  document.documentElement.style.background=color;
  $('stage').style.background=color==='transparent'?'repeating-conic-gradient(#e6eaf1 0% 25%,#f6f7fa 0% 50%) 50%/22px 22px':color;
  const url=new URL(location.href);url.searchParams.set('background',color);history.replaceState(null,'',url);
  try{localStorage.setItem('svg-through-output-background',color);}catch{}
 }
 $('runtimeBackground').onchange=$('outputColor').oninput=changeBackground;changeBackground();
 const stage=$('stage');let drag=null;
 stage.addEventListener('pointerdown',e=>{
  if(stage.dataset.editing||!preparing||e.button!==0||e.target.closest('button'))return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...view}};stage.setPointerCapture(e.pointerId);stage.classList.add('panning');e.preventDefault();
 });
 stage.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  view.x=Math.max(-4,Math.min(4,drag.start.x+(e.clientX-drag.x)/stage.clientWidth));
  view.y=Math.max(-4,Math.min(4,drag.start.y+(e.clientY-drag.y)/stage.clientHeight));framing();
 });
 const end=()=>{drag=null;stage.classList.remove('panning');};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,end);
 stage.addEventListener('wheel',e=>{
  if(stage.dataset.editing||!preparing)return;e.preventDefault();
  const rect=stage.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width-.5,y=(e.clientY-rect.top)/rect.height-.5;
  const scale=Math.max(.25,Math.min(8,view.scale*Math.exp(-Math.max(-300,Math.min(300,e.deltaY*(e.deltaMode===1?16:1)))*.002))),ratio=scale/view.scale;
  Object.assign(view,{scale,x:Math.max(-4,Math.min(4,x-(x-view.x)*ratio)),y:Math.max(-4,Math.min(4,y-(y-view.y)*ratio))});framing();
 },{passive:false});
 const hover=()=>{if(preparing)return;document.body.classList.add('show-return');clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>document.body.classList.remove('show-return'),1600);};
 window.addEventListener('pointermove',hover);window.addEventListener('pointerdown',hover);
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!preparing){e.preventDefault();show(true);$('enterBroadcast').focus({preventScroll:true});}
 });
 window.addEventListener('pagehide',()=>clearTimeout(hoverTimer),{once:true});
 show(new URLSearchParams(location.search).get('prepare')==='1');
 return {show,framing,
  voice(){},status(value){$('preparationStatus').textContent=value.connected?'ホットキー・背景・動かし方を設定します':'接続を確認しています…';}
 };
}
