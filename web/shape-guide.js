import {eyeCapabilities,mouthCapabilities} from './shape-capabilities.js';
import {EDIT_EYE_BLEND,EDIT_MOUTH_BLEND} from './work-area.js';
export function installShapeGuide(changed,project,requestAssist=()=>{},showAssistResults=()=>{},assistSessionFor=()=>null){
 const $=id=>document.getElementById(id),poses=new Map();
 for(const [step,noun,input,closed,blend] of [['eyes','目','editEyeClosure',1,EDIT_EYE_BLEND],['mouth','口','mouth',0,EDIT_MOUTH_BLEND]]){
  const eye=step==='eyes',card=document.createElement('section');card.className='shape-guide';card.id=step+'Guide';
  card.innerHTML=`<div class="stage-shape-row"><strong>閉じ${noun}</strong><button data-start>手動で編集</button><div class="correction-active"><div class="shape-tools" role="group" aria-label="補正ツール"><button data-tool="transform" class="active">↖ 移動・変形</button><button data-tool="contour">カーブ</button></div><div class="shape-history" role="group" aria-label="編集の取り消し"><button data-undo title="直前の編集を1つ取り消します">Undo（取り消す）</button><button data-redo title="取り消した編集を1つ戻します">Redo（やり直す）</button></div><div class="shape-view"><button data-pose="blend">開いた形と重ねる</button></div><div class="shape-repair"></div></div></div><p class="tool-help">${eye?'気になる目をクリックすると、その場で編集できます。':'気になる口をクリックすると、その場で編集できます。'}</p>`;
  card.classList.add('stage-shape-tools');card.dataset.shapeStep=step;
  $('edit-'+step).prepend(card);card.querySelector('.shape-repair').append($(step+'ReviewCard'));
  const numbers=$(eye?'eyeNumbers':'mouthNumbers');numbers.classList.add('shape-numbers');numbers.querySelector('summary').textContent='数値で微調整';
  if(eye)numbers.querySelector('summary').after($('lidSide').closest('label'));
  numbers.append($(eye?'lidReset':'mouthShapeReset'));card.querySelector('.shape-repair').before(numbers);
  const thickness=$(eye?'lid-thickness':'mouthEdit-thickness'),thicknessLabel=thickness.closest('label');
  thickness.type='range';thickness.setAttribute('aria-label',`閉じ${noun}の線の太さ`);thicknessLabel.removeAttribute('style');thicknessLabel.className='slider-label shape-thickness';thicknessLabel.firstChild.textContent='線の太さ ';
  const thicknessOut=document.createElement('output');thicknessOut.id=thickness.id+'Out';thicknessOut.value=Math.round(+thickness.value*100)+'%';thickness.before(thicknessOut);
  thickness.addEventListener('input',()=>thicknessOut.value=Math.round(+thickness.value*100)+'%');
  card.querySelector('.shape-tools').after(thicknessLabel);
  if(!eye)thicknessLabel.after($('mouthHighlightLabel'));

  const undoButton=card.querySelector('[data-undo]'),redoButton=card.querySelector('[data-redo]'),blendButton=card.querySelector('[data-pose=blend]');
  const startEdit=()=>{if($(step+'AdjustDonor').getAttribute('aria-pressed')!=='true')$(step+'AdjustDonor').click();else pose('blend');tool(document.body.dataset.shapeTool||'transform');};
  card.querySelector('[data-start]').onclick=startEdit;
  const ai=document.createElement('button');ai.type='button';ai.dataset.assistShape=step;ai.textContent='AIに任せる';ai.setAttribute('aria-label',`閉じ${noun}をAIに任せる`);ai.onclick=()=>assistSessionFor(step)?showAssistResults(step):requestAssist(step);card.querySelector('[data-start]').after(ai);
  undoButton.onclick=()=>$(eye?'eyeUndo':'mouthUndo').click();
  redoButton.onclick=()=>$(eye?'eyeRedo':'mouthRedo').click();
  document.addEventListener('shapeeditrequest',e=>{if(e.detail?.step===step)startEdit();});
  const preview=document.createElement('section');preview.id=step+'PreviewControl';preview.className='shape-stage-preview';preview.dataset.previewStep=step;
  preview.innerHTML=`<p>${eye?'スライダーを往復して、瞬きを確認':'スライダーを往復して、口の開閉を確認'}</p><div class="stage-slider"></div><p class="pose-help" aria-live="polite"></p>`;
  $('stage').parentElement.querySelector('.statusbar').before(preview);
  preview.querySelector('.stage-slider').before(card.querySelector('.shape-history'));
  preview.querySelector('.stage-slider').after(card.querySelector('.shape-view'));
  const slider=$(input).closest('.slider-label');preview.querySelector('.stage-slider').append(slider);
  slider.firstChild.textContent=eye?'目の閉じ具合 ':'口の開き ';
  $(input).setAttribute('aria-label',eye?'瞬きの確認：左で開く、右で閉じる':'口の開閉の確認：左で閉じる、右で開く');
  const pose=mode=>{if(step==='mouth'){$('mouthShape').value='closed';$('mouthShape').dispatchEvent(new Event('change'));}$(input).value=mode==='open'?1-closed:mode==='closed'?closed:blend;$(input).dispatchEvent(new Event('input',{bubbles:true}));};
  poses.set(step,pose);
  const update=()=>{const hasSession=!!assistSessionFor(step);ai.textContent=hasSession?'AI補正を確認':'AIに任せる';ai.setAttribute('aria-label',`閉じ${noun}の${ai.textContent}`);
   const v=+$(input).value,editing=$(step+'AdjustDonor').getAttribute('aria-pressed')==='true',editable=eye?v>.65:v<.18;
   $(input).style.setProperty('--shape-progress',Math.round(v*100)+'%');
   preview.querySelector('.pose-help').textContent=editing?(editable?'補正中：画面上の枠や丸をドラッグできます。':'開閉を確認中。「開いた形と重ねる」で編集に戻れます。'):'開閉を確認。気になる目・口は画面でクリックして編集できます。';
   blendButton.disabled=Math.abs(v-blend)<.005;blendButton.setAttribute('aria-pressed',String(blendButton.disabled));
   ai.hidden=editing;preview.querySelector('.shape-history').hidden=preview.querySelector('.shape-view').hidden=!editing;
   const part=eye?project()?.parts.find(p=>p.role==='lash-'+$('lidSide').value):project()?.parts.find(p=>p.role==='mouth'&&p.mouthMode==='source-open'&&!p.openSvgText);
   const caps=eye?eyeCapabilities(part):mouthCapabilities(part),curve=card.querySelector('[data-tool=contour]');
   curve.disabled=curve.hidden=!caps.curve;
   thicknessLabel.hidden=!caps.thickness;
   card.querySelector('[data-start]').hidden=editing||!caps.transform;
   card.querySelector('.shape-tools').dataset.single=String(!caps.curve);
   if(!caps.curve&&document.body.dataset.editStep===step&&document.body.dataset.shapeTool==='contour')tool('transform');
   if(eye){
    card.querySelector('strong').textContent='閉じ目'+(editing?($('lidSide').value==='r'?' · 画面左':' · 画面右'):'');
   }
   if(!editing)card.querySelector('.tool-help').textContent=eye?'気になる目をクリックすると、その場で編集できます。':'気になる口をクリックすると、その場で編集できます。';
   for(const [attr,id] of [['undo',eye?'eyeUndo':'mouthUndo'],['redo',eye?'eyeRedo':'mouthRedo']])(attr==='undo'?undoButton:redoButton).disabled=$(id).disabled;
  };
  const tool=kind=>{document.body.dataset.shapeTool=kind;document.querySelectorAll('[data-tool]').forEach(n=>n.classList.toggle('active',n.dataset.tool===kind));document.querySelectorAll('.tool-help').forEach(n=>n.textContent=kind==='transform'?'枠の中：移動／四角：拡大縮小／上の丸：回転':'丸をドラッグ：カーブを調整。線の太さは右のスライダーで調整。');};
  blendButton.onclick=()=>pose('blend');
  card.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool(b.dataset.tool);card.querySelectorAll('[data-fix]').forEach(n=>{n.classList.remove('active');n.setAttribute('aria-pressed','false');});});
  if(eye)$('lidSide').addEventListener('change',update);
  $(input).addEventListener('input',update);new MutationObserver(update).observe($(eye?'eyeUndo':'mouthUndo').parentElement,{subtree:true,attributes:true,attributeFilter:['disabled']});update();
 }
 return {
  pose(step,mode){document.body.dataset[step+'Stage']='closed';poses.get(step)?.(mode);},
  refresh(){for(const step of ['eyes','mouth'])$(step==='eyes'?'editEyeClosure':'mouth').dispatchEvent(new Event('input',{bubbles:true}));},
  begin(step){if(step==='parts')return;document.body.dataset[step+'Stage']='open';document.body.dataset.shapeTool='transform';$(step+'Guide').querySelectorAll('[data-fix]').forEach(n=>{n.classList.remove('active');n.setAttribute('aria-pressed','false');});document.querySelectorAll('[data-tool]').forEach(n=>n.classList.toggle('active',n.dataset.tool==='transform'));},
  reset(){document.body.dataset.eyesStage=document.body.dataset.mouthStage='open';}
 };
}
