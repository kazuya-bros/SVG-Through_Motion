import {normalizeMouthTuning,vowels} from './vowels.js';
import {closedProfile} from './closed-mouth.js';
import {mouthCapabilities} from './shape-capabilities.js';
import {tuningHistory} from './mouth-gizmo.js';
import {installMouthWorkbench} from './mouth-workbench.js';
const $=id=>document.getElementById(id);
export function installMouthEditor(api){
 const el=document.createElement('details');el.id='mouthEditor';
 const fields=[['width','横幅の倍率',.25,1.8,.02],['height','縦幅の倍率',.1,3,.02],['angle','傾き（度）',-45,45,1],['x','横位置',-30,30,.5],['y','高さ',-30,30,.5],['thickness','線の太さ',.3,3,.05],['curve','閉じ口のカーブ',-15,15,.5],['left','左の口角',-15,15,.5],['right','右の口角',-15,15,.5],['taper','線の端を細く',0,1,.05],['teethWidth','歯の横幅',.1,1,.02],['teethHeight','歯の高さ',.03,.8,.02],['teethY','歯の上下位置',0,.9,.02]];
 el.innerHTML='<summary>口の形を編集</summary><button id="mouthShow" class="primary wide">プレビューで口を直接編集</button><p id="mouthEditHint" class="tiny"></p><label>調整する形<select id="mouthShape"><option value="closed">閉じ口</option><option value="open">開いた口</option>'+vowels.map((v,i)=>`<option value="${v}">${'あいうえお'[i]}</option>`).join('')+'</select></label><details id="mouthNumbers"><summary>数値・線・歯の詳細</summary><div class="coordinate-row">'+fields.map(([k,label,min,max,step])=>`<label id="mouthField-${k}">${label}<input id="mouthEdit-${k}" type="number" min="${min}" max="${max}" step="${step}"></label>`).join('')+'</div><label id="mouthHighlightLabel" class="toggle-row">中央のハイライト<input id="mouthEdit-highlight" type="checkbox"/></label><label id="closedInkLabel">閉じ口の色<input id="closedInk" type="color"></label><label id="mouthTeethToggle" class="toggle-row">歯を重ねる<input id="mouthEdit-teeth" type="checkbox"></label><label id="mouthTeethColor">歯の色<input id="mouthEdit-teethColor" type="color"></label></details><div class="row"><button id="mouthResume">通常の口パクに戻る</button><button id="mouthShapeReset">この形を初期値に戻す</button></div><p class="tiny">編集中は口元を拡大し、口だけ更新します。調整は音声・動画・SVGに共通。ファイルへの保存は03の「プロジェクトを保存して完了」で行います。</p>';
 ($('mouthEditorMount')||$('eyeEditor').parentElement).append(el);
 let current=null,fieldBefore=null,editCheckpoint=null;
 const history=tuningHistory();
 const part=()=>api.project()?.parts.find(p=>p.role==='mouth'&&p.mouthMode==='source-open'&&!p.openSvgText);
 const shape=()=>$('mouthShape').value;
 const restore=t=>{if(!api.project())return;api.project().settings.mouthTuning=normalizeMouthTuning(t);refresh();};
 const undo=redo=>{restore(history[redo?'redo':'undo'](api.project().settings.mouthTuning));};
 const bench=installMouthWorkbench({project:api.project,part,shape,history,restore,undo,
  amount:()=>+$('mouth').value,
  ready:api.ready,begin:api.begin,end:dirty=>{api.end();if(dirty)api.rebuild();},
  choose:key=>{$('mouthShape').value=key;$('mouth').value=key==='closed'?0:1;$('mouthOut').value=key==='closed'?'0%':'100%';refresh();},enableTeeth:()=>edit('teeth',1)});
 function refresh(){
  if(current!==api.project()){bench.close({rebuild:false});current=api.project();history.clear();}
  if(current)current.settings.mouthTuning=normalizeMouthTuning(current.settings.mouthTuning);
  const enabled=false;
  if(!enabled&&vowels.includes(shape()))$('mouthShape').value='open';
  for(const o of $('mouthShape').options)o.hidden=vowels.includes(o.value)&&!enabled;
  document.querySelectorAll('[data-vowel-only]').forEach(e=>e.hidden=!enabled);
  const donor=part()?.mouthVariants;
  $('vowels').parentElement.firstChild.textContent=donor?'PSDの口を切り替える ':'母音の変形を使う ';
  $('vowelOptions').querySelector('summary').textContent=donor?'PSD差分の口を使う':'母音で形を変える（オマケ）';
  $('vowelOptions').querySelector('p').textContent=donor?'追加したPSDの口に切り替えます。未追加の母音はベースの口を使います。':'1つの口を変形する簡易表現です。まずは通常の開閉だけで使えます。';
  const p=part(),caps=mouthCapabilities(p),closed=$('mouthShape').value==='closed',t=normalizeMouthTuning(api.project()?.settings?.mouthTuning),v=closed?t.closed:shape()==='open'?t.open:t.vowels[shape()];
  for(const [k] of fields){if(k==='height'){$('mouthEdit-height').min=closed?.3:.1;$('mouthEdit-height').max=closed?3:1.8;}const show=closed?!['teethWidth','teethHeight','teethY'].includes(k):!['thickness','curve','left','right','taper'].includes(k)&&!(shape()==='open'&&k.startsWith('teeth'));const supported=closed?(['curve','left','right','taper'].includes(k)?caps.curve:k==='thickness'?caps.thickness:caps.transform):!!p;const usable=supported&&(!k.startsWith('teeth')||!!p?.mouthInteriorSvg);$('mouthField-'+k).hidden=!show||!usable;if(document.activeElement!==$('mouthEdit-'+k))$('mouthEdit-'+k).value=+(v[k]??0).toFixed(3);$('mouthEdit-'+k).disabled=!p||(closed&&!p.closedSvgText)||(k.startsWith('teeth')&&!p.mouthInteriorSvg)||(closed&&['left','right','curve','taper'].includes(k)&&!closedProfile(p.closedSvgText));}
  if($('mouthEdit-thicknessOut'))$('mouthEdit-thicknessOut').value=Math.round(v.thickness*100)+'%';
  for(const k of ['taper','curve','left','right']){const out=$('mouthField-'+k).querySelector('output');if(out)out.value=k==='taper'?Math.round(v[k]*100)+'%':v[k];}
  $('mouthTeethToggle').hidden=$('mouthTeethColor').hidden=closed||shape()==='open'||!p?.mouthInteriorSvg;
  $('closedInkLabel').hidden=!closed||!caps.color;$('closedInk').disabled=!closedProfile(p?.closedSvgText);$('closedInk').value=t.closed.color||closedProfile(p?.closedSvgText)?.color||'#403030';
  $('mouthHighlightLabel').hidden=!closed||!caps.curve;$('mouthEdit-highlight').checked=t.closed.highlight;
  $('mouthEdit-teeth').checked=!!v.teeth;$('mouthEdit-teeth').disabled=!p?.mouthInteriorSvg;$('mouthEdit-teethColor').value=v.teethColor||'#fff8ed';
  $('mouthShow').disabled=$('mouthShapeReset').disabled=!p;
  bench.redraw();
  $('mouthEditHint').textContent=!p?'元絵の開いた口がある素材を読み込んでください。':closed?'左右の口角と中央の丸をつかんで、待機中の口を整えます。':shape()==='open'?'元絵の口を基準に、開く大きさを整えます。':p.mouthInteriorSvg?'この母音の形を独立して調整します。歯は必要な母音だけ有効にできます。':'この母音の形を独立して調整します。歯を追加するには、元素材から口の内側を取得してください。';
 }
 function edit(k,value){const p=api.project();if(!p||!part())return;const before=normalizeMouthTuning(p.settings.mouthTuning),t=structuredClone(before),key=shape();const v=key==='closed'?t.closed:key==='open'?t.open:t.vowels[key];v[k]=value;p.settings.mouthTuning=normalizeMouthTuning(t);if(!fieldBefore)history.commit(before,p.settings.mouthTuning);void bench.open();bench.changed();}
 for(const [k] of fields){const input=$('mouthEdit-'+k);input.onfocus=()=>{fieldBefore=normalizeMouthTuning(api.project()?.settings.mouthTuning);};input.onblur=()=>{if(fieldBefore&&api.project())history.commit(fieldBefore,api.project().settings.mouthTuning);fieldBefore=null;refresh();bench.redraw();};input.oninput=()=>{if(input.value!==''){if(k==='thickness')fieldBefore??=normalizeMouthTuning(api.project()?.settings.mouthTuning);edit(k,+input.value);}};if(k==='thickness')input.onchange=()=>input.onblur();}
 $('mouthEdit-highlight').oninput=()=>edit('highlight',$('mouthEdit-highlight').checked);
 $('closedInk').oninput=()=>edit('color',$('closedInk').value);
 $('mouthEdit-teeth').oninput=()=>edit('teeth',+$('mouthEdit-teeth').checked);
 $('mouthEdit-teethColor').oninput=()=>edit('teethColor',$('mouthEdit-teethColor').value);
 $('mouthShape').onchange=()=>{$('mouth').value=shape()==='closed'?0:1;$('mouthOut').value=shape()==='closed'?'0%':'100%';refresh();void bench.open();bench.redraw();};
 $('mouthShow').onclick=()=>bench.open();
 $('mouthResume').onclick=()=>{bench.close();api.preview('');};
 $('mouthShapeReset').onclick=()=>{const p=api.project();if(!p)return;const before=normalizeMouthTuning(p.settings.mouthTuning),t=structuredClone(before),key=shape(),d=normalizeMouthTuning();if(part()?.mouthVariants)for(const v of Object.values(d.vowels)){v.width=1;v.height=1;}if(key==='closed')t.closed=d.closed;else if(key==='open')t.open=d.open;else t.vowels[key]=d.vowels[key];p.settings.mouthTuning=t;history.commit(before,t);refresh();void bench.open();bench.changed();};
 refresh();
 return {beginEdit(){editCheckpoint={project:api.project(),tuning:structuredClone(api.project().settings.mouthTuning),history:history.snapshot()};},cancelEdit(){if(!editCheckpoint||editCheckpoint.project!==api.project())return;fieldBefore=null;bench.close({rebuild:false});api.project().settings.mouthTuning=structuredClone(editCheckpoint.tuning);history.restore(editCheckpoint.history);editCheckpoint=null;refresh();api.rebuild();},refresh,open:bench.open,redraw:bench.redraw,zoom:bench.zoom,resetView:bench.resetView,get active(){return bench.active;},close:bench.close,flush(){bench.close();}};
}
