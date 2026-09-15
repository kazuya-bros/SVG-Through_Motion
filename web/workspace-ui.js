import {installShapeGuide} from './shape-guide.js';
import {usesClosedDonor,editGuidance} from './edit-guidance.js';
const $=id=>document.getElementById(id);
export function updateSliderTracks(){
 for(const input of document.querySelectorAll('.right-panel input[type=range]')){
  const min=Number(input.min)||0,max=input.max===''?100:Number(input.max);
  input.style.setProperty('--range-progress',`${max>min?Math.max(0,Math.min(100,(Number(input.value)-min)/(max-min)*100)):0}%`);
 }
}
const tasks={
 edit:['01 / 編集','形を整える','目、口の順に形を整えます。'],
 motion:['02 / モーション','動きをつける','自然な待機をもとに、動きの大きさや速さを調整します。'],
 voice:['音声','音声を合わせる','音声を作るか読み込んで、口パクを確認します。'],
 mic:['キャラクター','マイクで動かす','マイクの声に合わせて口を動かします。'],
 tracking:['キャラクター','カメラで動かす','カメラで瞬きと口の開きを操作。'],
 live:['','キャラクターを動かす','声と背景を設定し、使い方を選んでください。別ウィンドウで操作できます。'],
 export:['03 / 書き出し','素材を書き出す','画像・動画や、他のツールで使う素材を保存します。編集を続けるためのプロジェクト保存もできます。'],
};
export function installWorkspaceUI(api){
 let active='edit',editStep='eyes';const scrollPositions=new Map(),adjustingSteps=new Set();
 const liveTasks=new Set(['live','mic','tracking']);
 function group(attr,prefix,key){
  const buttons=[...document.querySelectorAll(`[${attr}]`)];
  buttons.forEach((b,i)=>{const on=b.getAttribute(attr)===key;b.classList.toggle('active',on);if(b.getAttribute('role')==='tab'){b.setAttribute('aria-selected',String(on));b.tabIndex=on||(!buttons.some(n=>n.getAttribute(attr)===key)&&i===0)?0:-1;}else b.setAttribute('aria-pressed',String(on));});
  document.querySelectorAll(`[id^="${prefix}"]`).forEach(p=>p.hidden=p.id!==prefix+key);
 }
 function show(name){
  if(['mic','tracking'].includes(name))name='live';
  if(!tasks[name])return;
  scrollPositions.set(active,document.querySelector('.inspector-scroll')?.scrollTop||0);
  const previous=active;if(name!=='edit')api.closeMouth();active=name;api.task?.(name,previous);
  const live=liveTasks.has(name),auxiliary=name==='voice';
  $('workflowNav').hidden=live||auxiliary;$('liveNav').hidden=true;$('creationReturn').hidden=!auxiliary;
  $('creationPageName').textContent=tasks[name][1];
  document.body.dataset.workspaceMode=live?'live':'create';
  $('workflowActions').hidden=live||auxiliary;
  $('editNext').hidden=name!=='edit';$('exportTop').hidden=name!=='motion';$('projectFinish').hidden=name!=='export';
  $('projectFinishStatus').hidden=name!=='export'||!$('projectFinishStatus').textContent;
  $('legacy-voice').hidden=name==='mic';$('microphoneMount').hidden=name!=='mic';
  for(const key of Object.keys(tasks).filter(key=>key!=='mic'))$('tab-'+key).hidden=key!==(name==='mic'?'voice':name);
  for(const b of document.querySelectorAll('#workflowNav [data-tab]')){
   const on=b.dataset.tab===(name==='tracking'?'voice':name);b.classList.toggle('active',on);b.setAttribute('aria-current',on?'step':'false');
   b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;
  }
  for(const b of document.querySelectorAll('#liveNav [data-live-page]')){const on=b.dataset.livePage===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
  const [step,title,description]=tasks[name];$('taskEyebrow').hidden=live;$('taskEyebrow').textContent=step;$('taskTitle').textContent=title;$('taskDescription').textContent=description;
  $('layerPalette').hidden=name!=='edit';document.body.dataset.task=name;
  $('editorGuide').hidden=true;
  if(name==='edit')describeStep();
  updateSliderTracks();
  const scroller=document.querySelector('.inspector-scroll');if(scroller)scroller.scrollTop=scrollPositions.get(name)||0;
 }
 const right=document.querySelector('.right-panel'),scroll=document.createElement('div');scroll.className='inspector-scroll';
 right.querySelectorAll(':scope > .task-panel').forEach(p=>scroll.append(p));right.append(scroll);
 const actions=document.createElement('footer');actions.id='workflowActions';actions.className='workflow-actions';
 const editActions=$('editNext').parentElement;actions.append($('editNext'));editActions.remove();
 actions.insertAdjacentHTML('beforeend','<button id="exportTop" class="primary wide" type="button" hidden>次へ：書き出し</button><p id="projectFinishStatus" role="status" hidden></p><button id="projectFinish" class="primary wide" type="button" hidden>プロジェクトを保存して完了</button>');
 right.append(actions);
 $('exportTop').onclick=()=>show('export');
 $('projectFinish').onclick=()=>api.finishProject?.();
 document.querySelectorAll('#workflowNav [data-tab]').forEach(b=>b.onclick=()=>show(b.dataset.tab));
 document.querySelectorAll('#liveNav [data-live-page]').forEach(b=>b.onclick=()=>show(b.dataset.livePage));
 $('backToMotion').onclick=()=>show('motion');
 right.addEventListener('input',e=>{if(e.target.matches('input[type=range]'))updateSliderTracks();});
 function tabKeys(e){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const tabs=[...e.currentTarget.querySelectorAll('[role=tab]')],i=tabs.indexOf(e.target);if(i<0)return;
  e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].click();tabs[next].focus();
 }
 $('workflowNav').addEventListener('keydown',tabKeys);
 $('liveNav').addEventListener('keydown',tabKeys);
 $('editTabs').addEventListener('keydown',tabKeys);
 document.querySelectorAll('[data-edit-page]').forEach(b=>b.onclick=()=>editPage(b.dataset.editPage));
 for(const [step,mount,noun] of [['eyes','eyeEditorMount','目'],['mouth','mouthEditorMount','口']]){
  const card=document.createElement('div');card.id=step+'ReviewCard';card.className='donor-review-card';card.hidden=true;
  card.innerHTML=`<p class="shape-source"></p><button class="wide" id="${step}AdjustDonor" aria-pressed="false">完了</button><button id="${step}CancelEdit" type="button">キャンセル</button>`;
  $(mount).before(card);
  $(step+'AdjustDonor').onclick=()=>{const editing=!adjustingSteps.has(step);if(editing){api.beginShapeEdit?.(step);adjustingSteps.add(step);}else adjustingSteps.delete(step);shapeGuide.pose(step,editing?'blend':'closed');describeStep();$('artboard').dispatchEvent(new Event('workviewchange'));};
 }
 for(const step of ['eyes','mouth'])$(step+'CancelEdit').onclick=()=>{api.cancelShapeEdit?.(step);adjustingSteps.delete(step);shapeGuide.pose(step,'closed');describeStep();$('artboard').dispatchEvent(new Event('workviewchange'));};
 const shapeGuide=installShapeGuide(()=>describeStep(),api.project,step=>api.requestAssist?.(step),step=>api.showAssistResults?.(step),step=>api.assistSessionFor?.(step));
 function describeStep(){
  document.body.dataset.editStep=editStep;
  for(const [page,key] of [['eyes','eyeReview'],['mouth','mouthReview']]){const donor=usesClosedDonor(api.project(),page),editing=adjustingSteps.has(page),button=$(page+'AdjustDonor');$(page+'ReviewCard').hidden=false;document.body.dataset[key]=String(!editing);button.setAttribute('aria-pressed',String(editing));$(page+'ReviewCard').querySelector('.shape-source').textContent=donor?'閉じ形：読み込んだPSD':'閉じ形：元の絵から作った下書き';}
  shapeGuide.refresh();
  const [step,title,description]=editGuidance(api.project(),editStep,adjustingSteps.has(editStep),document.body.dataset[editStep+'Stage']==='open');$('taskEyebrow').hidden=editStep==='eyes'||editStep==='mouth';$('taskEyebrow').textContent=step;$('taskTitle').textContent=title;$('taskDescription').textContent=description;
 }
 function editPage(page,force=false){const changed=editStep!==page;if(changed||force){adjustingSteps.delete(page);shapeGuide.begin(page);}editStep=page;show('edit');if(page!=='mouth')api.closeMouth();group('data-edit-page','edit-',page);describeStep();if(changed||force)api.step?.(page);}
 $('editNext').onclick=()=>show('motion');
 const sizeMotionPage=()=>scroll.style.setProperty('--motion-page-height',Math.max(0,scroll.clientHeight-44)+'px');
 new ResizeObserver(sizeMotionPage).observe(scroll);sizeMotionPage();
 document.querySelectorAll('[data-motion-page]').forEach(b=>b.onclick=()=>{sizeMotionPage();group('data-motion-page','motion-',b.dataset.motionPage);scroll.scrollTop=0;});
 document.querySelectorAll('[data-output-page]').forEach(b=>b.onclick=()=>group('data-output-page','output-',b.dataset.outputPage));
 function sourcePage(page){
  for(const key of ['new','resume'])$('source-'+key).hidden=key!==page;
  document.querySelectorAll('[data-source-page]').forEach(b=>{const on=b.dataset.sourcePage===page;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 }
 document.querySelectorAll('[data-source-page]').forEach(b=>b.onclick=()=>sourcePage(b.dataset.sourcePage));sourcePage('new');
 for(const b of document.querySelectorAll('[data-open-source]'))b.onclick=()=>{
  if(!api.project())return;
  $('sourceStatus').hidden=true;$('sourceDialog').append($('sourceContent'));$('sourceDialog').showModal();
 };
 $('closeSource').onclick=()=>$('sourceDialog').close();
 $('sourceDialog').addEventListener('click',e=>{if(e.target===$('sourceDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
 // Advanced technical controls are a secondary route; primary edit actions stay exposed.
 for(const id of ['mouthEditor','eyeEditor','partEditor','microphoneControls']){const node=$(id);if(node){node.open=true;const summary=node.querySelector(':scope > summary');summary.tabIndex=-1;summary.onclick=e=>e.preventDefault();}}
 group('data-edit-page','edit-','eyes');group('data-motion-page','motion-','head');group('data-output-page','output-','image');
 show('edit');
 function imported(){
  $('projectFinishStatus').textContent='';
  adjustingSteps.clear();api.refreshAssist?.();
  $('vowelOptions').open=false;shapeGuide.reset();
  $('sourceDialog').close();$('startScreen').hidden=true;$('editingWorkspace').hidden=false;document.body.classList.remove('starting');
  $('editorGuide').hidden=true;api.task?.('edit',null);editPage('eyes',true);
 }
 if(api.project())imported();
 return {show,editPage,imported,refreshAssist:()=>shapeGuide.refresh(),get active(){return active;}};
}
