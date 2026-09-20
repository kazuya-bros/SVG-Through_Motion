import {chestRegion,chestSettings} from './chest-motion.js';
import {validateMotion} from './assist-motion.js';
const ns='http://www.w3.org/2000/svg';

export function installChestRegionUI(api){
 const $=id=>document.getElementById(id),art=$('artboard');
 const host=document.createElement('div');host.className='chest-region-controls';
 host.innerHTML=`<button type="button" class="wide" id="chestRegionPick">楕円で大まかに指定</button><button type="button" class="wide" id="chestRegionBrush">ブラシで詳しく指定</button>
 <p class="tiny" id="chestRegionSummary"></p>
 <section id="chestRegionEditor" hidden aria-label="胸揺れの位置と範囲">
 <p class="note">中心を胸元に合わせ、楕円で揺らす範囲を囲んでください。中心付近ほど強く動きます。調整中は動きを止めています。</p>
 <p class="tiny">画面をクリックして中心を移動。楕円の丸いハンドルで幅・高さを変更できます。</p>
 ${[['cx','中心の横位置',0,100],['cy','中心の縦位置',0,100],['rx','横幅',2,100],['ry','縦幅',2,100]].map(([id,label,min,max])=>`<label class="slider-label">${label}<output id="chestGuide${id}Out"></output><input id="chestGuide${id}" aria-label="胸揺れ：${label}" type="range" min="${min}" max="${max}" step=".1"></label>`).join('')}
 </section><button type="button" class="wide" id="chestRegionReset">自動推定に戻す</button>`;
 $('chestMotionControls').append(host);
 const actions=document.createElement('div');actions.className='chest-preview-actions';actions.hidden=true;
 actions.innerHTML='<span>胸の揺れる範囲を調整中</span><button type="button" class="primary" id="chestRegionApply">この範囲で確定</button><button type="button" id="chestRegionCancel">キャンセル</button>';
 actions.addEventListener('pointerdown',e=>e.stopPropagation());$('stage').append(actions);
 let state=null,overlay=null,drag=null;
 function eligible(p){return p?.rig&&!p.parts.some(v=>v.visible&&v.role==='chest')&&p.parts.some(v=>v.visible&&v.role==='static'&&!v.faceBase&&!v.independentAccessory&&(!v.deformGroup||v.deformGroup==='core'));}
 function refresh(){
  const p=api.project();$('chestRegionPick').disabled=$('chestRegionBrush').disabled=!eligible(p)||!!state;
  $('chestRegionReset').hidden=!p?.settings?.chestRegionManual||!!state;
  $('chestRegionSummary').textContent=p?.parts.some(v=>v.visible&&v.role==='chest')?'独立した胸パーツを使用中です。揺れる範囲はパーツの形で決まります。':p?.settings?.chestRegionManual?'補正した位置・範囲を使用中。プロジェクトの保存で保持できます。':'位置がずれているときは、画面上で揺れる範囲を指定できます。';
  if(!state)return;
  if(p!==state.project){finish();return;}
  const surface=art.querySelector('canvas.rig-preview');if(!surface)return;
  if(!overlay?.isConnected){
   overlay=document.createElementNS(ns,'svg');overlay.id='chestRegionGuide';overlay.setAttribute('aria-label','胸揺れの範囲ガイド');overlay.setAttribute('tabindex','0');
   overlay.innerHTML='<rect width="100%" height="100%" fill="transparent"/><ellipse fill="#6575ee25" stroke="#5364df" stroke-width="2" vector-effect="non-scaling-stroke"/><path stroke="#5364df" stroke-width="2" vector-effect="non-scaling-stroke"/>'+['cx','rx','ry'].map(key=>`<circle data-handle="${key}" fill="white" stroke="#5364df" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('');art.append(overlay);
   const move=e=>{
    const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(overlay.getScreenCTM().inverse()),r=state.region;
    if(drag==='rx')r.rx=Math.max(p.width*.01,Math.min(p.width*.5,Math.abs(point.x-r.cx)));
    else if(drag==='ry')r.ry=Math.max(p.height*.01,Math.min(p.height*.5,Math.abs(point.y-r.cy)));
    else {r.cx=Math.max(0,Math.min(p.width,point.x));r.cy=Math.max(0,Math.min(p.height,point.y));}
    sync();
   };
   overlay.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();drag=e.target.dataset.handle||'cx';overlay.setPointerCapture(e.pointerId);move(e);};
   overlay.onpointermove=e=>{if(!drag)return;e.preventDefault();e.stopPropagation();move(e);};
   overlay.onpointerup=overlay.onpointercancel=e=>{drag=null;if(overlay.hasPointerCapture(e.pointerId))overlay.releasePointerCapture(e.pointerId);};
   overlay.onlostpointercapture=()=>{drag=null;};
   overlay.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();const n=e.shiftKey?10:1,r=state.region;r.cx=Math.max(0,Math.min(p.width,r.cx+(e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0)));r.cy=Math.max(0,Math.min(p.height,r.cy+(e.key==='ArrowDown'?n:e.key==='ArrowUp'?-n:0)));sync();};
  }
  overlay.setAttribute('viewBox',`0 0 ${p.width} ${p.height}`);
  Object.assign(overlay.style,{left:surface.offsetLeft+'px',top:surface.offsetTop+'px',width:surface.clientWidth+'px',height:surface.clientHeight+'px'});
  const r=state.region,ellipse=overlay.querySelector('ellipse');
  for(const [k,v]of Object.entries(r))ellipse.setAttribute(k,v);
  const matrix=overlay.getScreenCTM(),unit=1/Math.max(.01,Math.hypot(matrix.a,matrix.b)),d=12*unit;
  overlay.querySelector('path').setAttribute('d',`M${r.cx-d} ${r.cy}H${r.cx+d}M${r.cx} ${r.cy-d}V${r.cy+d}`);
  for(const [i,[x,y]]of [[r.cx,r.cy],[r.cx+r.rx,r.cy],[r.cx,r.cy+r.ry]].entries()){
   const c=overlay.querySelectorAll('circle')[i];c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',(i?7:5)*unit);
  }
 }
 function sync(){if(!state)return;for(const k of ['cx','cy','rx','ry']){const value=state.region[k]/(k.endsWith('x')?state.project.width:state.project.height)*(k.startsWith('r')?200:100);$('chestGuide'+k).value=value;$('chestGuide'+k+'Out').value=value.toFixed(1)+'%';}refresh();}
 function finish(apply=false){
  if(!state)return;const old=state;state=null;drag=null;overlay?.remove();overlay=null;$('chestRegionEditor').hidden=true;actions.hidden=true;
  if(apply&&old.project===api.project()){
   const r=old.region,p=old.project;
   api.changed(validateMotion({chestMotionRegion:null,chestRegionManual:true,chestCenterX:r.cx/p.width,chestCenterY:r.cy/p.height,chestRadiusX:r.rx/p.width,chestRadiusY:r.ry/p.height}));
  }
  api.end();refresh();
 }
 $('chestRegionPick').onclick=()=>{
  const p=api.project();if(!eligible(p))return;
  const s=chestSettings(p.settings),region=chestRegion(p)||{cx:s.chestCenterX*p.width,cy:s.chestCenterY*p.height,rx:s.chestRadiusX*p.width,ry:s.chestRadiusY*p.height};
  region.rx=Math.max(p.width*.01,Math.min(p.width*.5,region.rx));region.ry=Math.max(p.height*.01,Math.min(p.height*.5,region.ry));
  state={project:p,region,task:document.body.dataset.task};$('chestRegionEditor').hidden=false;actions.hidden=false;api.begin();sync();overlay?.focus();
 };
 for(const k of ['cx','cy','rx','ry'])$('chestGuide'+k).oninput=()=>{if(!state)return;state.region[k]=+$('chestGuide'+k).value*(k.endsWith('x')?state.project.width:state.project.height)/(k.startsWith('r')?200:100);sync();};
 $('chestRegionApply').onclick=()=>finish(true);$('chestRegionCancel').onclick=()=>finish();
 $('chestRegionReset').onclick=()=>{api.changed({chestRegionManual:false,chestMotionRegion:null});refresh();};
 $('chestRegionBrush').onclick=()=>{const p=api.project(),r=chestRegion(p);if(!r)return;api.brush({title:'胸揺れの範囲',mode:'brush',region:p.settings.chestMotionRegion||{cx:r.cx/p.width,cy:r.cy/p.height,rx:r.rx/p.width,ry:r.ry/p.height},apply:region=>{api.changed({chestRegionManual:true,chestMotionRegion:region});refresh();}});};
 document.addEventListener('keydown',e=>{if(state&&e.key==='Escape'){e.preventDefault();finish();}});
 document.querySelectorAll('[data-motion-page],[data-edit-page]').forEach(b=>b.addEventListener('click',()=>finish()));
 new MutationObserver(()=>{if(state&&state.task!==document.body.dataset.task)finish();}).observe(document.body,{attributes:true,attributeFilter:['data-task']});
 art.addEventListener('workviewchange',refresh);window.addEventListener('resize',refresh);
 return {refresh,cancel:()=>finish(),get active(){return !!state;}};
}
