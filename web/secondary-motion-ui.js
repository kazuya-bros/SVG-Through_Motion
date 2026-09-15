import {secondaryKind,secondaryKinds,normalizeSecondary} from './secondary-motion.js';

function installSecondaryGroup({project,changed,pick,prefix,parent,kinds,title,description}){
 const mount=document.createElement('section');mount.className='control-card';mount.id=prefix+'MotionControls';
 mount.innerHTML=`<h3>${title}</h3><p class="tiny">${description}</p>
 <label>動かすパーツ<select id="secondaryTarget" aria-label="小物・服・表情の対象"></select></label>
 <div id="secondaryFields"><label class="toggle-row">この動きを使う<input id="secondaryEnabled" type="checkbox"/></label>
 <p id="secondaryHint" class="tiny"></p>
 <label class="slider-label">動きの大きさ<output id="secondaryAmountOut"></output><input id="secondaryAmount" aria-label="小物・表情の動きの大きさ" type="range" min="0" max="100" step="1"/></label>
 <label class="slider-label" id="secondarySpeedRow">速さ<output id="secondaryCyclesOut"></output><input id="secondaryCycles" aria-label="小物の揺れる速さ" type="range" min="1" max="4" step="1"/></label>
 <label class="slider-label" id="secondaryRangeRow">裾から動かす範囲<output id="secondaryRangeOut"></output><input id="secondaryRange" aria-label="裾から動かす範囲" type="range" min="10" max="100" step="1"/></label>
 <button id="secondaryPivot" class="wide" type="button">画面で付け根を指定</button></div>`.replaceAll('secondary',prefix);
 document.getElementById(parent).append(mount);
 const $=id=>mount.querySelector('#'+prefix+id),selected=()=>project()?.parts.find(p=>p.id===$('Target').value);
 const hints={cloth:'付け根を固定して、裾に近い部分ほど揺らします。範囲を狭くすると裾だけが動きます。',ribbon:'結び目を固定して、先がゆっくり揺れます。',pendant:'取り付け位置を固定して、少し遅れて振り子のように揺れます。',wing:'付け根を固定して、翼をゆっくり開閉します。左右が一枚の場合は中央を支点にします。',ornament:'飾りを小さく揺らします。耳のピコピコに指定したパーツでは、耳の動きを優先します。',brow:'話しているときだけ眉が少し上がります。左右の眉に同じ設定を適用します。'};
 function fields(){
  const p=selected(),kind=p&&secondaryKind(p);$('Fields').hidden=!kind;if(!kind)return;
  const c=normalizeSecondary(p.secondaryMotion);$('Enabled').checked=c.enabled;
  for(const [key,field] of [['amount','Amount'],['cycles','Cycles'],['range','Range']]){$(field).value=c[key];$(field+'Out').value=c[key]+(key==='cycles'?'回 / ループ':'%');$(field).disabled=!c.enabled;}
  $('Hint').textContent=hints[kind];$('SpeedRow').hidden=kind==='brow';$('RangeRow').hidden=kind!=='cloth';$('Pivot').hidden=kind==='brow';
 }
 function refresh(){
  const old=$('Target').value,parts=(project()?.parts||[]).filter(p=>p.visible&&kinds.includes(secondaryKind(p))).filter((p,i,all)=>secondaryKind(p)!=='brow'||i===all.findIndex(q=>secondaryKind(q)==='brow'));mount.hidden=!parts.length;
  $('Target').replaceChildren(...parts.map(p=>new Option(secondaryKind(p)==='brow'?'左右の眉':`${p.name} · ${secondaryKinds[secondaryKind(p)]}`,p.id)));
  if(parts.some(p=>p.id===old))$('Target').value=old;fields();
 }
 $('Target').onchange=fields;
 for(const field of ['Enabled','Amount','Cycles','Range'])$(field).oninput=()=>{
  const p=selected();if(!p)return;
  const config=normalizeSecondary({enabled:$('Enabled').checked,amount:$('Amount').value,cycles:$('Cycles').value,range:$('Range').value});
  const targets=secondaryKind(p)==='brow'?project().parts.filter(p=>secondaryKind(p)==='brow'):[p];
  for(const target of targets)target.secondaryMotion={...config};
  fields();changed();
 };
 $('Pivot').onclick=()=>{const p=selected();if(p)pick([p]);};
 return {refresh};
}

export function installSecondaryMotion(api){
 const groups=[
  {prefix:'secondary',parent:'motion-clothes',kinds:['cloth','ribbon','pendant','ornament'],title:'服・小物の揺れ',description:'動かすパーツを選んで調整します。硬い帽子やズボンは、必要なときだけONにしてください。'},
  {prefix:'browMotion',parent:'motion-iris',kinds:['brow'],title:'話すときの眉',description:'左右の眉に同じ設定を適用します。'},
  {prefix:'wingMotion',parent:'motion-extra',kinds:['wing'],title:'翼の開閉',description:'翼が分離されている素材で使えます。'}
 ].map(options=>installSecondaryGroup({...api,...options}));
 const empty=document.createElement('p');empty.className='note';empty.textContent='服の裾・リボン・イヤリングなどが分離された素材で使えます。';document.getElementById('motion-clothes').append(empty);
 return {refresh(){groups.forEach(g=>g.refresh());empty.hidden=(api.project()?.parts||[]).some(p=>p.visible&&['cloth','ribbon','pendant','ornament'].includes(secondaryKind(p)));}};
}
