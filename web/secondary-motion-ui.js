import {applyLayerEdit} from './svg-layer-edit.js';
import {partLabel} from './part-label.js';
import {installMotionPartPicker,partThumbnail} from './motion-part-picker.js';
import {secondaryKind,secondaryKinds,normalizeSecondary,secondaryConfig} from './secondary-motion.js';

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
  const c=secondaryConfig(p,project());$('Enabled').checked=c.enabled;
  for(const [key,field] of [['amount','Amount'],['cycles','Cycles'],['range','Range']]){$(field).value=c[key];$(field+'Out').value=c[key]+(key==='cycles'?'回 / ループ':'%');$(field).disabled=!c.enabled;}
  $('Hint').textContent=hints[kind];$('SpeedRow').hidden=kind==='brow';$('RangeRow').hidden=kind!=='cloth'||!!c.region;$('Pivot').hidden=kind==='brow';
 }
 function refresh(){
  const old=$('Target').value,parts=(project()?.parts||[]).filter(p=>p.visible&&kinds.includes(secondaryKind(p))).filter((p,i,all)=>secondaryKind(p)!=='brow'||i===all.findIndex(q=>secondaryKind(q)==='brow'));mount.hidden=prefix==='wingMotion'?false:!parts.length;
  $('Target').closest('label').hidden=prefix==='browMotion';
  $('Target').replaceChildren(...parts.map(p=>new Option(secondaryKind(p)==='brow'?'左右の眉':partLabel(p),p.id)));
  if(!parts.length&&prefix==='wingMotion'){$('Target').append(new Option('対象レイヤーなし',''));$('Target').disabled=true;}else $('Target').disabled=false;
  if(parts.some(p=>p.id===old))$('Target').value=old;fields();
 }
 $('Target').onchange=fields;
 for(const field of ['Enabled','Amount','Cycles','Range'])$(field).oninput=()=>{
  const p=selected();if(!p)return;
  const config=normalizeSecondary({...p.secondaryMotion,enabled:$('Enabled').checked,amount:$('Amount').value,cycles:$('Cycles').value,range:$('Range').value});
  const targets=secondaryKind(p)==='brow'?project().parts.filter(p=>secondaryKind(p)==='brow'):[p];
  for(const target of targets)target.secondaryMotion={...config};
  fields();changed();
 };
 $('Pivot').onclick=()=>{const p=selected();if(p)pick([p]);};
 return {refresh};
}

function installClothes(api){
 const mount=document.createElement('section');mount.id='secondaryMotionControls';mount.className='control-card';
 mount.innerHTML='<h3>服・小物の揺れ</h3><p class="tiny">動かすパーツを追加して、揺らす範囲を指定します。</p><label>動かすパーツ<select id="secondaryAddTarget"></select></label><button id="secondaryAdd" class="wide primary" type="button">＋ 揺れを追加</button><div class="row" hidden><button id="secondaryAddEllipse" type="button">楕円で指定</button><button id="secondaryAddBrush" type="button">ブラシで指定</button></div><p id="secondaryAddHint" class="tiny"></p><div id="secondaryAdded"></div>';
 document.getElementById('motion-clothes').append(mount);const select=mount.querySelector('select'),list=mount.querySelector('#secondaryAdded'),picker=installMotionPartPicker(select);
 const candidates=()=> (api.project()?.parts||[]).filter(p=>p.visible&&!p.followPart&&!/^(lash|iris|white|brow)-/.test(p.role)&&p.role!=='mouth'&&secondaryKind(p)!=='wing');
 const added=p=>normalizeSecondary(p.secondaryMotion).enabled&&['cloth','ribbon','pendant','ornament'].includes(secondaryKind(p));
 const initialRegion=p=>{const project=api.project();return {cx:Math.max(0,Math.min(1,(p.x+p.width/2)/project.width)),cy:Math.max(0,Math.min(1,(p.y+p.height*.65)/project.height)),rx:Math.min(1,Math.max(.01,p.width*.48/project.width)),ry:Math.min(1,Math.max(.01,p.height*.35/project.height))};};
 function pick(p,mode){const project=api.project();if(!p)return;api.region({title:partLabel(p),mode,region:p.secondaryMotion?.region||{cx:Math.max(0,Math.min(1,(p.x+p.width/2)/project.width)),cy:Math.max(0,Math.min(1,(p.y+p.height*.65)/project.height)),rx:Math.min(1,Math.max(.01,p.width*.48/project.width)),ry:Math.min(1,Math.max(.01,p.height*.35/project.height))},apply:region=>{applyLayerEdit(project,{operation:'secondary',part_id:p.id,secondary:{enabled:true,region}});api.changed(true);refresh();}});}
 function refresh(){const old=select.value,parts=candidates(),available=parts.filter(p=>!added(p));
  select.replaceChildren(...available.map(p=>new Option(partLabel(p),p.id)));
  if(available.some(p=>p.id===old))select.value=old;else if(available.some(p=>secondaryKind(p)==='cloth'))select.value=available.find(p=>secondaryKind(p)==='cloth').id;
  picker.refresh(available);mount.querySelector('#secondaryAdd').disabled=!available.length;
  mount.querySelector('#secondaryAddHint').textContent=available.length?'追加した揺れは下で個別に調整できます。':'追加できるパーツはありません。';
  for(const b of mount.querySelectorAll('#secondaryAddEllipse,#secondaryAddBrush'))b.disabled=!available.length;list.replaceChildren();
  for(const p of parts.filter(added)){

   const card=document.createElement('section');card.className='control-card';card.dataset.motionPart=p.id;const name=document.createElement('strong');name.className='motion-part-heading';name.textContent=partLabel(p);name.prepend(partThumbnail(p));card.append(name);
   const c=normalizeSecondary(p.secondaryMotion);
   if(['cloth','ribbon','pendant','ornament'].includes(secondaryKind(p))){const row=document.createElement('label');row.className='secondary-direction';row.textContent='揺れ方向';const direction=document.createElement('select');direction.innerHTML='<option value="horizontal">横</option><option value="vertical">縦</option><option value="diag-down">斜め（左上→右下）</option><option value="diag-up">斜め（左下→右上）</option>';direction.value=c.direction||'horizontal';direction.onchange=()=>{applyLayerEdit(api.project(),{operation:'secondary',part_id:p.id,secondary:{direction:direction.value}});api.changed();};row.append(direction);card.append(row);}
   for(const [key,label,max]of [['amount','揺れの大きさ',100],['cycles','速さ',4]]){const row=document.createElement('label');row.className='slider-label';row.textContent=label;const out=document.createElement('output'),input=document.createElement('input');input.type='range';input.min=key==='amount'?0:1;input.max=max;input.step=1;input.value=c[key];out.value=c[key]+(key==='amount'?'%':'回 / ループ');input.oninput=()=>{applyLayerEdit(api.project(),{operation:'secondary',part_id:p.id,secondary:{[key]:+input.value}});out.value=input.value+(key==='amount'?'%':'回 / ループ');api.changed();};row.append(out,input);card.append(row);}
   const row=document.createElement('div');row.className='row';for(const [mode,label]of [['ellipse','楕円で補正'],['brush','ブラシで補正'],['remove','揺れを外す']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{if(mode==='remove'){applyLayerEdit(api.project(),{operation:'secondary',part_id:p.id,secondary:{enabled:false}});api.changed(true);refresh();}else pick(p,mode);};row.append(b);}card.append(row);list.append(card);
  }
 }
 mount.querySelector('#secondaryAdd').onclick=()=>{const p=candidates().find(p=>p.id===select.value);if(!p||added(p))return;applyLayerEdit(api.project(),{operation:'secondary',part_id:p.id,secondary:{enabled:true,region:p.secondaryMotion?.region||initialRegion(p)}});api.changed(true);refresh();list.querySelector(`[data-motion-part="${p.id}"]`)?.scrollIntoView({block:'nearest'});};
 mount.querySelector('#secondaryAddEllipse').onclick=()=>pick(candidates().find(p=>p.id===select.value),'ellipse');mount.querySelector('#secondaryAddBrush').onclick=()=>pick(candidates().find(p=>p.id===select.value),'brush');return {refresh};
}
export function installSecondaryMotion(api){
 const groups=[installClothes(api),...[
  {prefix:'browMotion',parent:'motion-iris',kinds:['brow'],title:'話すときの眉',description:'左右の眉に同じ設定を適用します。'}
 ].map(options=>installSecondaryGroup({...api,...options}))];
 return {refresh(){groups.forEach(g=>g.refresh());}};
}
