const $=id=>document.getElementById(id);
const invoke=window.__TAURI__.core.invoke;
let config=null,sessions=[],running=false,dirty=false,busy=false;
const defaults=['通常','笑顔','驚き','困り顔','ウインク'];
function status(text){$('status').textContent=text;}
function expressionNames(){return sessions.find(s=>s.id===$('target').value)?.expressions||defaults;}
function readBindings(){return [...$('bindings').rows].map(row=>({index:Number(row.querySelector('.expression').value),shortcut:row.querySelector('.shortcut').value.trim(),mode:row.querySelector('.mode').value}));}
function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function renderBindings(bindings){
 const names=expressionNames();$('bindings').replaceChildren();
 for(const binding of bindings){
  const row=document.createElement('tr');
  const expression=document.createElement('select');expression.className='expression';expression.setAttribute('aria-label','切り替える表情');
  names.forEach((name,i)=>expression.append(option(i,`${i+1} · ${name}`)));
  if(binding.index>=names.length)expression.append(option(binding.index,`${binding.index+1} · この出力にない表情`));expression.value=binding.index;
  const key=document.createElement('input');key.className='shortcut';key.value=binding.shortcut;key.placeholder='Ctrl+Alt+1';key.setAttribute('aria-label','グローバルキー');
  key.onkeydown=e=>{if(e.key==='Tab'||e.key==='Backspace'||e.key==='Delete'||!e.ctrlKey&&!e.altKey)return;if(['Control','Alt','Shift','Meta'].includes(e.key))return;e.preventDefault();const name=e.code.startsWith('Key')?e.code.slice(3):e.code.startsWith('Digit')?e.code.slice(5):e.code;if(e.metaKey)return;key.value=[e.ctrlKey?'Ctrl':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,name].filter(Boolean).join('+');dirty=true;};
  const mode=document.createElement('select');mode.className='mode';mode.setAttribute('aria-label','切り替え方');mode.append(option('select','選んだ表情を維持'),option('hold','押している間だけ'));mode.value=binding.mode;
  const remove=document.createElement('button');remove.textContent='×';remove.className='remove';remove.setAttribute('aria-label','この割り当てを削除');remove.onclick=()=>{row.remove();dirty=true;};
  for(const el of [expression,key,mode,remove]){const td=document.createElement('td');td.append(el);row.append(td);}
  $('bindings').append(row);
 }
}
async function refreshState(initial=false){
 const state=await invoke('desktop_state');running=state.running;
 if(initial){config=state.config;$('dataDir').value=config.data_dir;$('seeThrough').value=config.see_through_dir;$('port').value=config.port;$('enabled').checked=config.enabled;renderBindings(config.bindings);}
 $('connection').textContent=running?'起動中':'起動前';$('start').textContent=running?'制作画面を開く':'アプリを起動する';$('serverUrl').textContent=state.url||'';
 for(const id of ['dataDir','seeThrough','port','pickData','pickSee'])$(id).disabled=running||busy;
 $('registered').textContent=state.registered?`${state.registered}個のホットキーが有効です。`:state.config.enabled?'操作対象を選んで保存すると有効になります。':'ホットキーは停止中です。';
 $('errors').replaceChildren(...state.errors.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('lastEvent').textContent=state.last_event;
 return state;
}
async function refreshSessions(){
 const selected=$('target').value;const bindings=readBindings();sessions=await invoke('desktop_sessions');
 $('target').replaceChildren(option('','出力を選んでください'));
 for(const s of sessions.filter(s=>s.connected))$('target').append(option(s.id,`${s.name} · ${s.id.slice(0,6)}`));
 $('target').value=selected;
 if(!$('target').value)$('target').value='';renderBindings(bindings);
}
function guarded(work){return async()=>{if(busy)return;busy=true;for(const id of ['start','save','refresh','add'])$(id).disabled=true;try{await work();}catch(e){status(String(e));}finally{busy=false;for(const id of ['start','save','refresh','add'])$(id).disabled=false;await refreshState();}};}
$('start').onclick=guarded(async()=>{
 status('アプリを起動しています…');
 await invoke('desktop_start',{config:{...config,data_dir:$('dataDir').value.trim(),see_through_dir:$('seeThrough').value.trim(),port:Number($('port').value),enabled:$('enabled').checked,bindings:readBindings()}});
 config=(await refreshState()).config;status('制作画面を開きました。');await refreshSessions();
});
$('save').onclick=guarded(async()=>{await invoke('save_hotkeys',{enabled:$('enabled').checked,bindings:readBindings(),target:$('target').value});config=(await refreshState()).config;dirty=false;status('ホットキー設定を保存・適用しました。');});
$('refresh').onclick=guarded(refreshSessions);
$('add').onclick=()=>{const list=readBindings();if(list.length>=12){status('割り当ては12個までです。');return;}list.push({shortcut:'',index:0,mode:'select'});renderBindings(list);dirty=true;};
$('target').onchange=()=>{renderBindings(readBindings());dirty=true;};
$('bindings').oninput=$('enabled').onchange=()=>{dirty=true;};
for(const [button,input]of [['pickData','dataDir'],['pickSee','seeThrough']])$(button).onclick=guarded(async()=>{const path=await invoke('choose_folder');if(path)$(input).value=path;});
$('exit').onclick=()=>invoke('desktop_exit');
await window.__TAURI__.event.listen('desktop-status',()=>refreshState().catch(e=>status(String(e))));
await refreshState(true);
if(config.data_dir){await $('start').onclick();}
setInterval(()=>{if(running&&!busy&&!dirty)refreshSessions().catch(()=>{});},5000);
