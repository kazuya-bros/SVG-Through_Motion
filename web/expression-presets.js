import {createExpressionSelection} from './expression-selection.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
export const defaultExpressions=[{name:'通常',pose:{}},{name:'笑顔',pose:{blinkL:.35,blinkR:.35,browL:.2,browR:.2}},{name:'驚き',pose:{blinkL:0,blinkR:0,irisScale:.85,browL:.8,browR:.8}},{name:'困り顔',pose:{blinkL:.15,blinkR:.15,browL:-.5,browR:-.5}},{name:'ウインク',pose:{blinkL:1,blinkR:0,browL:.2}}];
const ranges={blinkL:[0,1],blinkR:[0,1],irisX:[-20,20],irisY:[-12,12],irisScale:[.6,1.4],browL:[-1,1],browR:[-1,1]};
export function normalizeExpressions(values){if(!Array.isArray(values))return structuredClone(defaultExpressions);return values.slice(0,12).map((v,i)=>({name:String(v?.name||'表情 '+(i+1)).slice(0,40),pose:Object.fromEntries(Object.entries(v?.pose||{}).filter(([k,x])=>ranges[k]&&Number.isFinite(x)).map(([k,x])=>[k,clamp(x,...ranges[k])]))}));}
export function applyExpression(pose,expression,strength=1){const result={...pose},weight=clamp(strength,0,1);for(const [key,value] of Object.entries(expression?.pose||{}))if(ranges[key]){const base=result[key]??(key==='irisScale'?1:0);result[key]=base+(clamp(value,...ranges[key])-base)*weight;}return result;}
export const reviewSteps=[['正面',{}],['左を向く',{yaw:-.3}],['右を向く',{yaw:.3}],['上を向く',{pitch:.25}],['下を向く',{pitch:-.25}],['目を閉じる',{blinkL:1,blinkR:1}],['口を開く',{mouth:1}]];
export function reviewPose(index){const step=reviewSteps[Math.max(0,Math.min(reviewSteps.length-1,index))];return {sway:0,breathe:0,bounce:0,headRoll:0,bodyRoll:0,yaw:0,pitch:0,nod:0,hairBend:0,hairPhase:0,secondaryPhase:0,mouth:0,blinkL:0,blinkR:0,irisX:0,irisY:0,irisScale:1,browL:0,browR:0,...step[1]};}

export function installExpressionControls({host,project,changed=()=>{},active=()=>true,review=false}){
 const section=document.createElement('section');section.className='control-card expression-controls';section.innerHTML='<h2>表情</h2><div class="expression-buttons"></div><label>表情の強さ<input class="expression-strength" type="range" min="0" max="1" step=".05" value="1"></label><p class="tiny">口パクは入力に追従します。数字キー1〜9で切り替え。Shiftを押しながらで、押している間だけ。</p>';
 if(!document.querySelector('link[data-expressions]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/web/expression-presets.css';css.dataset.expressions='';document.head.append(css);}
 host.append(section);const selection=createExpressionSelection();let expressions=[],currentProject=null,reviewIndex=null,started=null;
 const buttons=section.querySelector('.expression-buttons'),strength=section.querySelector('.expression-strength');
 function refresh(){const p=project();if(!p)return;if(p!==currentProject){currentProject=p;selection.select(0);reviewIndex=null;started=null;}expressions=normalizeExpressions(p.expressionPresets);buttons.replaceChildren(...expressions.map((entry,i)=>{const b=document.createElement('button');b.type='button';b.textContent=entry.name;b.setAttribute('aria-pressed',String(i===selection.current));b.onclick=()=>{selection.select(i);reviewIndex=null;started=null;refresh();};return b;}));}
 function key(e){if(!active()||e.repeat||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable)return;const index=Number(e.code.replace('Digit',''))-1;if(!/^Digit[1-9]$/.test(e.code)||!expressions[index])return;e.preventDefault();if(e.shiftKey)selection.hold('local:'+e.code,index);else selection.select(index);reviewIndex=null;started=null;refresh();}
 function release(e){if(e)selection.release('local:'+e.code);else for(let i=1;i<=9;i++)selection.release('local:Digit'+i);refresh();}
 const blur=()=>release();window.addEventListener('keydown',key);window.addEventListener('keyup',release);window.addEventListener('blur',blur);
 if(review){
  const custom=document.createElement('details');custom.innerHTML='<summary>表情を調整して保存</summary><label>名前<input class="expression-name" maxlength="40" value="新しい表情"></label><div class="expression-fields"></div><button type="button" class="expression-save">表情を追加</button><p class="tiny expression-message" role="status"></p>';
  const controls={};for(const [key,label,min,max,initial] of [['blinkL','左側の目を閉じる',0,1,0],['blinkR','右側の目を閉じる',0,1,0],['browL','左側の眉',-1,1,0],['browR','右側の眉',-1,1,0],['irisScale','瞳の大きさ',.6,1.4,1]]){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');Object.assign(input,{type:'range',min,max,step:.05,value:initial});l.append(input);custom.querySelector('.expression-fields').append(l);controls[key]=input;}
  custom.querySelector('.expression-save').onclick=()=>{const p=project();if(!p)return;const list=normalizeExpressions(p.expressionPresets);if(list.length>=12){custom.querySelector('.expression-message').textContent='表情は12個までです。';return;}list.push({name:custom.querySelector('.expression-name').value||'新しい表情',pose:Object.fromEntries(Object.entries(controls).map(([k,input])=>[k,Number(input.value)]))});p.expressionPresets=list;selection.select(list.length-1);changed();refresh();custom.querySelector('.expression-message').textContent='追加しました。プロジェクトを保存すると次回も使えます。';};
  section.append(custom);
  const checks=document.createElement('div');checks.className='pose-review';checks.innerHTML='<h2>動作確認</h2><p class="tiny">各方向・目・口を順に確認します。補修の隙間や重なりを見てください。</p><button type="button" class="review-run">一巡を再生</button> <button type="button" class="review-stop">ここで止める</button><div class="review-steps"></div><p class="tiny review-label" role="status"></p><button type="button" class="review-end">確認を終える</button>';
  for(const [i,[name]] of reviewSteps.entries()){const b=document.createElement('button');b.textContent=name;b.type='button';b.onclick=()=>{reviewIndex=i;started=null;};checks.querySelector('.review-steps').append(b);}
  checks.querySelector('.review-run').onclick=()=>{reviewIndex=0;started=performance.now();};checks.querySelector('.review-stop').onclick=()=>{started=null;};checks.querySelector('.review-end').onclick=()=>{reviewIndex=null;started=null;checks.querySelector('.review-label').textContent='';};section.append(checks);
 }
 refresh();
 return {refresh,command(message){
  if(message.action==='release_all')selection.releaseAll();
  else if(message.action==='release')selection.release('native:'+message.key);
  else if(Number.isInteger(message.index)&&expressions[message.index]){
   if(message.action==='hold')selection.hold('native:'+message.key,message.index);
   else if(message.action==='select')selection.select(message.index);
   reviewIndex=null;started=null;
  }
  refresh();
 },apply(pose){if(!active())return pose;if(reviewIndex!==null){if(started!==null){const index=Math.floor((performance.now()-started)/1400);if(index>=reviewSteps.length){started=null;reviewIndex=0;}else reviewIndex=index;}const label=section.querySelector('.review-label');if(label)label.textContent=reviewSteps[reviewIndex][0];return reviewPose(reviewIndex);}return applyExpression(pose,expressions[selection.current],Number(strength.value));},close(){window.removeEventListener('keydown',key);window.removeEventListener('keyup',release);window.removeEventListener('blur',blur);section.remove();}};
}
