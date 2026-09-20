import {createExpressionSelection} from './expression-selection.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
export const defaultExpressions=[{name:'通常',pose:{}},{name:'笑顔',pose:{blinkL:.35,blinkR:.35,browL:.2,browR:.2}},{name:'驚き',pose:{blinkL:0,blinkR:0,irisScale:.85,browL:.8,browR:.8}},{name:'困り顔',pose:{blinkL:.15,blinkR:.15,browL:-.2,browR:-.2,browTiltL:.7,browTiltR:.7}},{name:'ウインク',pose:{blinkL:1,blinkR:0,browL:.2}}];
const ranges={blinkL:[0,1],blinkR:[0,1],irisX:[-20,20],irisY:[-12,12],irisScale:[.6,1.4],browL:[-1,1],browR:[-1,1],browTiltL:[-1,1],browTiltR:[-1,1]};
export function normalizeExpressions(values){if(!Array.isArray(values))return structuredClone(defaultExpressions);return values.slice(0,12).map((v,i)=>({name:String(v?.name||'表情 '+(i+1)).slice(0,40),pose:Object.fromEntries(Object.entries(v?.pose||{}).filter(([k,x])=>ranges[k]&&Number.isFinite(x)).map(([k,x])=>[k,clamp(x,...ranges[k])]))}));}
export function applyExpression(pose,expression,strength=1){const result={...pose},weight=clamp(strength,0,1);for(const [key,value] of Object.entries(expression?.pose||{}))if(ranges[key]){const base=result[key]??(key==='irisScale'?1:0);result[key]=base+(clamp(value,...ranges[key])-base)*weight;}return result;}
export const reviewSteps=[['正面',{}],['左を向く',{yaw:-.3}],['右を向く',{yaw:.3}],['上を向く',{pitch:.25}],['下を向く',{pitch:-.25}],['目を閉じる',{blinkL:1,blinkR:1}],['口を開く',{mouth:1}]];
export function reviewPose(index){const step=reviewSteps[Math.max(0,Math.min(reviewSteps.length-1,index))];return {sway:0,breathe:0,bounce:0,headRoll:0,bodyRoll:0,yaw:0,pitch:0,nod:0,hairBend:0,hairPhase:0,secondaryPhase:0,mouth:0,blinkL:0,blinkR:0,irisX:0,irisY:0,irisScale:1,browL:0,browR:0,...step[1]};}

export function installExpressionControls({host,project,changed=()=>{},active=()=>true,review=false,shortcuts=true}){
 const section=document.createElement('section');section.className='control-card expression-controls';section.innerHTML='<h2>表情</h2><div class="expression-buttons"></div><label>表情の強さ<input class="expression-strength" type="range" min="0" max="1" step=".05" value="1"></label><p class="tiny">口パクは入力に追従します。数字キー1〜9で切り替え。Shiftを押しながらで、押している間だけ。</p>';
 if(!document.querySelector('link[data-expressions]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/web/expression-presets.css';css.dataset.expressions='';document.head.append(css);}
 host.append(section);const selection=createExpressionSelection();let expressions=[],currentProject=null,reviewIndex=null,started=null,draft=null,editSelection=-1,syncEditor=()=>{};
 const buttons=section.querySelector('.expression-buttons'),strength=section.querySelector('.expression-strength');
 function refresh(){const p=project();if(!p)return;if(p!==currentProject){currentProject=p;selection.select(0);reviewIndex=null;started=null;draft=null;editSelection=-1;}expressions=normalizeExpressions(p.expressionPresets);buttons.replaceChildren(...expressions.map((entry,i)=>{const b=document.createElement('button');b.type='button';b.textContent=entry.name;b.setAttribute('aria-pressed',String(i===selection.current));b.onclick=()=>{selection.select(i);reviewIndex=null;started=null;refresh();};return b;}));if(editSelection!==selection.current){editSelection=selection.current;draft=null;syncEditor();}}
 function key(e){if(!shortcuts)return;if(!active()||e.repeat||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable)return;const index=Number(e.code.replace('Digit',''))-1;if(!/^Digit[1-9]$/.test(e.code)||!expressions[index])return;e.preventDefault();if(e.shiftKey)selection.hold('local:'+e.code,index);else selection.select(index);reviewIndex=null;started=null;refresh();}
 function release(e){if(e)selection.release('local:'+e.code);else for(let i=1;i<=9;i++)selection.release('local:Digit'+i);refresh();}
 const blur=()=>release();window.addEventListener('keydown',key);window.addEventListener('keyup',release);window.addEventListener('blur',blur);
 if(review){
  const custom=document.createElement('details');custom.open=true;custom.className='expression-editor';custom.innerHTML='<summary>表情を調整して保存</summary><label>名前<input class="expression-name" maxlength="40"></label><p class="tiny">スライダーを動かすとプレビューに反映します。眉の傾きは、＋で内側が上がる困り眉、−で内側が下がる怒り眉になります。</p><div class="expression-fields"></div><div class="row"><button type="button" class="expression-update">この表情を更新</button><button type="button" class="expression-save">別の表情として追加</button></div><p class="tiny expression-message" role="status"></p>';
  const controls={};for(const [key,label,min,max,initial] of [['blinkL','左側の目を閉じる',0,1,0],['blinkR','右側の目を閉じる',0,1,0],['browL','左眉の高さ',-1,1,0],['browR','右眉の高さ',-1,1,0],['browTiltL','左眉の傾き',-1,1,0],['browTiltR','右眉の傾き',-1,1,0],['irisScale','瞳の大きさ',.6,1.4,1]]){
    const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');Object.assign(input,{type:'range',min,max,step:.05,value:initial});input.dataset.expressionField=key;input.setAttribute('aria-label',label);l.append(input);custom.querySelector('.expression-fields').append(l);controls[key]=input;
    input.oninput=()=>{draft={name:custom.querySelector('.expression-name').value,pose:Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,Number(v.value)]))};reviewIndex=null;started=null;changed();custom.querySelector('.expression-message').textContent='調整中。「更新」か「追加」で表情に保存します。';};
  }
  syncEditor=()=>{const entry=expressions[selection.current];if(!entry)return;custom.querySelector('.expression-name').value=entry.name;for(const [key,input]of Object.entries(controls))input.value=entry.pose[key]??(key==='irisScale'?1:0);custom.querySelector('.expression-message').textContent='';};
  const save=add=>{const p=project();if(!p)return;const list=normalizeExpressions(p.expressionPresets);if(add&&list.length>=12){custom.querySelector('.expression-message').textContent='表情は12個までです。';return;}
    const entry={name:custom.querySelector('.expression-name').value||'新しい表情',pose:{...expressions[selection.current]?.pose,...Object.fromEntries(Object.entries(controls).map(([k,input])=>[k,Number(input.value)]))}};
    const index=add?list.length:selection.current;list[index]=entry;p.expressionPresets=normalizeExpressions(list);selection.select(index);draft=null;changed();refresh();custom.querySelector('.expression-message').textContent='表情に保存しました。プロジェクトを保存すると次回も使えます。';
  };
  custom.querySelector('.expression-save').onclick=()=>save(true);custom.querySelector('.expression-update').onclick=()=>save(false);
  custom.addEventListener('toggle',()=>{if(!custom.open){draft=null;syncEditor();changed();}});section.append(custom);
  const checks=document.createElement('details');checks.className='pose-review';checks.innerHTML='<summary>補修後のチェック（任意）</summary><p class="tiny">普段の調整では使わなくて大丈夫です。パーツを補修した後、顔の向き・閉じ目・開いた口で隙間や重なりを確認したいときだけ使います。確認ポーズは保存されません。</p><button type="button" class="review-run">一巡を再生</button> <button type="button" class="review-stop">ここで止める</button><div class="review-steps"></div><p class="tiny review-label" role="status"></p><button type="button" class="review-end">確認を終える</button>';
  for(const [i,[name]] of reviewSteps.entries()){const b=document.createElement('button');b.textContent=name;b.type='button';b.onclick=()=>{reviewIndex=i;started=null;};checks.querySelector('.review-steps').append(b);}
  checks.querySelector('.review-run').onclick=()=>{reviewIndex=0;started=performance.now();};checks.querySelector('.review-stop').onclick=()=>{started=null;};checks.querySelector('.review-end').onclick=()=>{reviewIndex=null;started=null;checks.querySelector('.review-label').textContent='';};checks.addEventListener('toggle',()=>{if(!checks.open){reviewIndex=null;started=null;checks.querySelector('.review-label').textContent='';}});// Retain programmatic review helpers; omit the optional review section from the UI.
 }
 refresh();
 return {refresh,get state(){return {index:selection.current,strength:Number(strength.value)};},command(message){
  if(Number.isFinite(message.strength))strength.value=String(clamp(message.strength,0,1));
  if(message.action==='release_all')selection.releaseAll();
  else if(message.action==='release')selection.release('native:'+message.key);
  else if(Number.isInteger(message.index)&&expressions[message.index]){
   if(message.action==='hold')selection.hold('native:'+message.key,message.index);
   else if(message.action==='select')selection.select(message.index);
   reviewIndex=null;started=null;
  }
  refresh();
 },apply(pose){if(!active())return pose;if(reviewIndex!==null){if(started!==null){const index=Math.floor((performance.now()-started)/1400);if(index>=reviewSteps.length){started=null;reviewIndex=0;}else reviewIndex=index;}const label=section.querySelector('.review-label');if(label)label.textContent=reviewSteps[reviewIndex][0];return reviewPose(reviewIndex);}return applyExpression(pose,draft||expressions[selection.current],Number(strength.value));},close(){window.removeEventListener('keydown',key);window.removeEventListener('keyup',release);window.removeEventListener('blur',blur);section.remove();}};
}
