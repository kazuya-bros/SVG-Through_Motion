const $=id=>document.getElementById(id);
const invoke=window.__TAURI__.core.invoke;
let config=null,sessions=[],running=false,dirty=false,busy=false,starting=false;
let settingsRevision=-1;
const defaults=['通常','笑顔','驚き','困り顔','ウインク'];
function status(text){$('status').textContent=text;}
function expressionNames(){return sessions.find(s=>s.id===$('target').value)?.expressions||defaults;}
function readBindings(){return [...$('bindings').rows].map(row=>{const value=row.querySelector('.expression').value,cue=value.startsWith('cue:');return {character_id:row.querySelector('.character')?.value||'',index:cue?0:Number(value),cue_id:cue?value.slice(4):'',shortcut:row.querySelector('.shortcut').value.trim(),mode:cue?'select':row.querySelector('.mode').value}});}

function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function renderBindings(bindings){
 const session=sessions.find(s=>s.id===$('target').value),names=expressionNames();$('bindings').replaceChildren();
 for(const binding of bindings){
  const row=document.createElement('tr'),character=document.createElement('select');character.className='character';character.setAttribute('aria-label','切り替えるキャラクター');character.append(option('','表示中のキャラクター'));for(const c of session?.characters||[])character.append(option(c.id,c.name));if(binding.character_id&&!(session?.characters||[]).some(c=>c.id===binding.character_id))character.append(option(binding.character_id,'未追加のキャラクター'));character.value=binding.character_id||'';const actions=(character.value?session?.characters?.find(c=>c.id===character.value)?.actions:session?.actions)||[];
  const expression=document.createElement('select');expression.className='expression';expression.setAttribute('aria-label','切り替える表情・演出');
  if(!character.value)names.forEach((name,i)=>expression.append(option(i,`${i+1} · ${name}`)));
  if(!character.value&&binding.index>=names.length)expression.append(option(binding.index,`${binding.index+1} · この出力にない表情`));actions.forEach(a=>expression.append(option('cue:'+a.id,'演出 · '+a.name)));if(binding.cue_id&&!actions.some(a=>a.id===binding.cue_id))expression.append(option('cue:'+binding.cue_id,'演出 · '+binding.cue_id.slice(0,6)));expression.value=binding.cue_id?'cue:'+binding.cue_id:character.value?'cue:'+'0'.repeat(31)+'1':binding.index;character.onchange=()=>{const list=readBindings();const item=list[Array.from($('bindings').rows).indexOf(row)];if(character.value&&!item.cue_id){item.cue_id='0'.repeat(31)+'1';item.mode='select';}renderBindings(list);dirty=true;};
  const key=document.createElement('input');key.className='shortcut';key.value=binding.shortcut;key.placeholder='Ctrl+Alt+1';key.setAttribute('aria-label','グローバルキー');
  key.onkeydown=e=>{if(e.key==='Tab'||e.key==='Backspace'||e.key==='Delete'||!e.ctrlKey&&!e.altKey)return;if(['Control','Alt','Shift','Meta'].includes(e.key))return;e.preventDefault();const name=e.code.startsWith('Key')?e.code.slice(3):e.code.startsWith('Digit')?e.code.slice(5):e.code;if(e.metaKey)return;key.value=[e.ctrlKey?'Ctrl':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,name].filter(Boolean).join('+');dirty=true;};
  const mode=document.createElement('select');mode.className='mode';mode.setAttribute('aria-label','切り替え方');mode.append(option('select','選んだ表情を維持'),option('hold','押している間だけ'));mode.value=binding.mode;const change=()=>{const cue=expression.value.startsWith('cue:');mode.disabled=cue;if(cue)mode.value='select';mode.options[0].textContent=cue?'保存した設定で実行':'選んだ表情を維持';};expression.onchange=change;change();
  const remove=document.createElement('button');remove.textContent='×';remove.className='remove';remove.setAttribute('aria-label','この割り当てを削除');remove.onclick=()=>{row.remove();dirty=true;};
  for(const el of [character,expression,key,mode,remove]){const td=document.createElement('td');td.append(el);row.append(td);}
  $('bindings').append(row);
 }
}
async function refreshState(initial=false){
 const state=await invoke('desktop_state');running=state.running;starting=state.starting;
 if(initial){config=state.config;$('dataDir').value=config.data_dir;$('seeThrough').value=config.see_through_dir;$('port').value=config.port;$('enabled').checked=config.enabled;renderBindings(config.bindings);}
 $('connection').textContent=starting?'起動しています…':running?'接続中':'起動できませんでした';$('serverUrl').textContent=state.url||'';
 $('start').hidden=running;$('saveConnection').hidden=$('restartHint').hidden=!running;$('home').disabled=!running;
 $('startupError').textContent=state.startup_error||(!running&&!starting?state.errors.join(' '):'');$('startupError').hidden=!$('startupError').textContent;
 for(const id of ['dataDir','seeThrough','port','pickData','pickSee','start','saveConnection','save','refresh','add'])$(id).disabled=starting||busy;
 $('registered').textContent=state.registered?`${state.registered}個のホットキーが有効です。`:state.config.enabled?'操作対象を選んで保存すると有効になります。':'ホットキーは停止中です。';
 if(state.settings_revision!==settingsRevision){
  settingsRevision=state.settings_revision;
  const hotkeys=state.settings_target!==null;
  $('connectionSettings').hidden=hotkeys;$('hotkeySettings').hidden=!hotkeys;$('home').hidden=hotkeys;
  $('settingsTitle').textContent=hotkeys?'ホットキー設定':'保存先と接続';
  if(hotkeys&&running){await refreshSessions(state.settings_target);status('操作対象を確認して「設定を保存・適用」を押してください。');}
  else status('');
 }
 $('errors').replaceChildren(...state.errors.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('lastEvent').textContent=state.last_event;
 return state;
}
async function refreshSessions(requestedTarget=null){
 const selected=requestedTarget??$('target').value;const bindings=readBindings();sessions=await invoke('desktop_sessions');
 $('target').replaceChildren(option('','出力を選んでください'));
 for(const s of sessions.filter(s=>s.connected))$('target').append(option(s.id,`${s.name} · ${s.id.slice(0,6)}`));
 $('target').value=selected;
 if(!$('target').value)$('target').value='';renderBindings(bindings);
}
function guarded(work){return async()=>{if(busy||starting)return;busy=true;for(const id of ['start','saveConnection','save','refresh','add'])$(id).disabled=true;try{await work();}catch(e){status(String(e));}finally{busy=false;await refreshState();}};}
$('home').onclick=()=>invoke('desktop_home').catch(e=>status(String(e)));
$('saveConnection').onclick=guarded(async()=>{await invoke('save_connection',{dataDir:$('dataDir').value.trim(),seeThroughDir:$('seeThrough').value.trim(),port:Number($('port').value)});config=(await refreshState()).config;status('保存しました。変更は次回の起動から反映されます。');});
$('start').onclick=guarded(async()=>{
 status('アプリを起動しています…');
 await invoke('desktop_start',{config:{...config,data_dir:$('dataDir').value.trim(),see_through_dir:$('seeThrough').value.trim(),port:Number($('port').value),enabled:$('enabled').checked,bindings:readBindings()}});
 config=(await refreshState()).config;status('制作画面を開きました。');await refreshSessions();
});
$('save').onclick=guarded(async()=>{await invoke('save_hotkeys',{enabled:$('enabled').checked,bindings:readBindings(),target:$('target').value});config=(await refreshState()).config;dirty=false;status('ホットキー設定を保存・適用しました。');});
$('refresh').onclick=guarded(refreshSessions);
$('add').onclick=()=>{const list=readBindings();if(list.length>=32){status('割り当ては32個までです。');return;}list.push({shortcut:'',index:0,mode:'select'});renderBindings(list);dirty=true;};
$('target').onchange=()=>{renderBindings(readBindings());dirty=true;};
$('bindings').oninput=$('enabled').onchange=()=>{dirty=true;};
for(const [button,input]of [['pickData','dataDir'],['pickSee','seeThrough']])$(button).onclick=guarded(async()=>{const path=await invoke('choose_folder');if(path)$(input).value=path;});
$('exit').onclick=()=>invoke('desktop_exit');
await window.__TAURI__.event.listen('desktop-status',()=>refreshState().catch(e=>status(String(e))));
await refreshState(true);
if(running)await refreshSessions();
setInterval(()=>{if(running&&!busy&&!dirty)refreshSessions().catch(()=>{});},5000);
