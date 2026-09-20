import {createMicrophoneCapture,waitForMedia,microphoneError} from './microphone-capture.js';
import {createCameraCapture} from './camera-capture.js';
import {createModeSwitch} from './broadcast-mode.js';

export function installPlayerControls({mode,base,session,onModeChange=()=>{},onStatus=()=>{}}){
 const $=id=>document.getElementById(id);let disposed=false,online=false,refreshing=false,micState="stopped",permissionRequest=null,deviceRevision=0;
 $('controlTitle').textContent='配信の準備';
 function showMode(next){mode=next==='api'?'idle':next;$('inputMode').value=mode;for(const key of ['mic','camera'])$(key+'Settings').hidden=key!==mode;$('apiSettings').hidden=true;$('inputModeHint').textContent=mode==='idle'?'待機モーションで動きます。演出はホットキーで呼び出せます。':'開始すると入力に合わせて動きます。';}
 showMode(mode);
 $('desktopSettings').hidden=false;if(window.__SVG_THROUGH_DESKTOP__!==true)$('desktopSettings').querySelector('a').onclick=e=>{e.preventDefault();say('グローバルホットキーはデスクトップ版で設定できます。');};
 function say(text,error=false){$('controlStatus').textContent=text;$('controlStatus').classList.toggle('error',error);}
 const mic=createMicrophoneCapture({gate:()=>+$('micGate').value,
  onState(state,text){micState=state;micButtons();say(text,state==='error');$('micHelp').hidden=state!=='error';if(state==='running')void refreshDevices();},
  onLevel:value=>{$('micMeter').value=value;}
 });
 const camera=createCameraCapture({video:$('cameraPreview'),swap:()=>$('cameraSwap').checked,
  motionSettings:()=>({strength:+$('cameraMotion').value,mirror:$('cameraMirror').checked}),
  onState(state,text){const busy=['starting','running'].includes(state);$('cameraStart').disabled=busy||!online;$('cameraStop').disabled=!busy;$('cameraDevice').disabled=busy;say(text,state==='error');$('cameraHelp').hidden=state!=='error';}
 });
 const switcher=createModeSwitch({initial:mode,
  async reception(){/* Input selection is independent of AI speech reception. */},
  stopInputs(){permissionRequest?.abort();permissionRequest=null;mic.stop();camera.stop();},
  changed(next){showMode(next);onModeChange(next);say('動かし方を切り替えました。');void refresh();}
 });
 $('inputMode').onchange=async()=>{const next=$('inputMode').value;$('inputMode').disabled=true;try{await switcher.select(next);}catch(e){showMode(switcher.mode);say(e.message,true);}finally{$('inputMode').disabled=!online;}};
 $('inputMode').disabled=true;
 function micButtons(){const busy=['starting','running'].includes(micState);$('micStart').disabled=busy||!!permissionRequest||!online;$('micStop').disabled=!busy&&!permissionRequest;$('micDevice').disabled=micState==='starting'||!!permissionRequest;$('micRefresh').disabled=micState==='starting'||!!permissionRequest;}
 async function refreshDevices(){const revision=++deviceRevision;try{
  const devices=await navigator.mediaDevices?.enumerateDevices();if(disposed||revision!==deviceRevision||!devices)return;
  for(const [id,kind] of [['micDevice','audioinput'],['cameraDevice','videoinput']]){
   const select=$(id),selected=select.value,list=devices.filter(d=>d.kind===kind&&d.deviceId&&d.deviceId!=='default');
   select.replaceChildren(new Option(kind==='audioinput'?'既定のマイク':'既定のカメラ',''),...list.map((d,i)=>new Option(d.label||`${kind==='audioinput'?'マイク':'カメラ'} ${i+1}`,d.deviceId)));
   select.value=list.some(d=>d.deviceId===selected)?selected:'';
   if(id==='micDevice'){
    const named=devices.some(d=>d.kind===kind&&d.label);
    $('micRefresh').textContent=named?'マイク一覧を更新':'マイクを許可して一覧を取得';
    $('micDeviceHint').textContent=named?'使用中もマイクを切り替えられます。':'許可すると機器名を選べます。';
   }
  }
 }catch(e){if(!disposed&&mode==='mic'){say(microphoneError(e),true);$('micHelp').hidden=false;}}}
 void refreshDevices();navigator.mediaDevices?.addEventListener('devicechange',refreshDevices);
 $('micRefresh').onclick=async()=>{
  if(permissionRequest||micState==='starting')return;
  if(mic.active){await refreshDevices();return;}
  const request=new AbortController();permissionRequest=request;micButtons();say('マイクの許可を確認しています…「停止」で中断できます。');$('micHelp').hidden=true;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new DOMException('Not supported','NotSupportedError');
   const stream=await waitForMedia(navigator.mediaDevices.getUserMedia({audio:true,video:false}),request.signal,15000,s=>s.getTracks().forEach(t=>t.stop()));
   const release=()=>stream.getTracks().forEach(t=>t.stop());request.signal.addEventListener('abort',release,{once:true});
   try{if(!disposed&&!request.signal.aborted)await refreshDevices();}finally{request.signal.removeEventListener('abort',release);release();}
   if(!disposed&&!request.signal.aborted)say('マイクを選んで「マイク開始」を押してください。');
  }catch(e){if(!disposed&&!request.signal.aborted){say(microphoneError(e),true);$('micHelp').hidden=false;}}
  finally{if(permissionRequest===request){permissionRequest=null;if(!disposed)micButtons();}}
 };
 $('micStart').onclick=()=>{if(online&&!permissionRequest)void mic.start($('micDevice').value);};
 $('micStop').onclick=()=>{permissionRequest?.abort();permissionRequest=null;mic.stop();void refreshDevices();};
 $('micDevice').onchange=()=>{if(micState==='running'){const device=$('micDevice').value;mic.stop();if(online)void mic.start(device);}};
 $('cameraStart').onclick=()=>{if(online)void camera.start($('cameraDevice').value);};$('cameraStop').onclick=()=>{camera.stop();void refreshDevices();};
 $('cameraCenter').onclick=()=>say(camera.recenter()?'今の姿勢を正面にしました。':'カメラを開始し、顔が映った状態で押してください。');
 $('cameraMotion').oninput=()=>{$('cameraMotionValue').value=Math.round(+$('cameraMotion').value*100)+'%';};
 $('micOutputUrl').value=location.href;
 const displayUrl=new URL('/web/player.html',location.origin);displayUrl.searchParams.set('session',session);displayUrl.searchParams.set('display','1');
 for(const key of ['viewX','viewY','viewScale']){const value=new URLSearchParams(location.search).get(key);if(value!==null)displayUrl.searchParams.set(key,value);}
 $('displayUrl').value=displayUrl.href;
 $('copyDisplay').onclick=async()=>{const status=$('displayCopyStatus');status.hidden=false;try{await navigator.clipboard.writeText($('displayUrl').value);status.textContent='コピーしました。配信ソフトのブラウザソースに貼り付けてください。';}catch{status.textContent='URLを選択してコピーしてください。';$('displayUrl').hidden=false;$('displayUrl').focus();$('displayUrl').select();}};
 $('apiUrl').value=location.origin+'/api/runtime';
 const copy=async text=>{try{await navigator.clipboard.writeText(text);say('コピーしました。');}catch{say('コピーできませんでした。URLを選択してコピーしてください。',true);}};
 $('copyApi').onclick=()=>copyHelp($('apiUrl').value);$('copyCameraUrl').onclick=()=>copy(location.href);$('copyMicUrl').onclick=()=>copy(location.href);
 const help=$('integrationHelp');
 $('openIntegrationHelp').onclick=()=>help.showModal();$('closeIntegrationHelp').onclick=()=>help.close();
 const helpPage=agents=>{for(const [id,selected] of [['Agents',agents],['Api',!agents]]){$('help'+id).hidden=!selected;$('help'+id+'Button').setAttribute('aria-pressed',String(selected));}help.scrollTop=0;};
 $('helpAgentsButton').onclick=()=>helpPage(true);$('helpApiButton').onclick=()=>helpPage(false);
 const exampleId=crypto.randomUUID();
 $('apiExample').value=`GET ${location.origin}/api/runtime/status

# accepting・connected・ready が true、state が idle のとき
POST ${location.origin}/api/runtime/speech
Content-Type: application/json

${JSON.stringify({request_id:exampleId,action:'speak',text:'こんにちは。今日は何をしましょうか？'},null,2)}

# 受付後、発話の結果を確認
GET ${location.origin}/api/runtime/speech/${exampleId}`;
 async function copyHelp(text){const status=$('apiHelpStatus');status.hidden=false;try{await navigator.clipboard.writeText(text);status.textContent='コピーしました。';}catch{status.textContent='コピーできませんでした。内容を選択してコピーしてください。';const field=text===$('apiUrl').value?$('apiUrl'):$('apiExample');field.focus();field.select();}}
 $('copyApiExample').onclick=()=>copyHelp($('apiExample').value);
 $('aiConnectionGuide').textContent=`接続先: ${location.origin}
まず ${location.origin}/api/runtime/status で accepting・connected・ready・state・current.id を確認し、accepting・connected・ready がすべて true の場合だけ操作してください。
${location.origin}/web/runtime-help.html の手順に従い、待機中なら ${location.origin}/api/runtime/speech に speak を送信してください。発話中なら終了を待ち、今回は割り込まないでください。受付結果だけで成功とせず、発話完了まで確認してください。音声設定は変更しないでください。`;
 $('aiInstruction').oninput=()=>{$('copyAI').disabled=!$('aiInstruction').value.trim();$('aiCopyStatus').hidden=true;};
 $('copyAI').onclick=async()=>{
  const instruction=$('aiInstruction').value.trim(),status=$('aiCopyStatus');if(!instruction)return;
  status.hidden=false;
  const text=instruction+'\n\n'+$('aiConnectionGuide').textContent;
  try{await navigator.clipboard.writeText(text);status.textContent='コピーしました。AIのチャットに貼り付けて送信してください。';}
  catch{status.textContent='コピーできませんでした。下の全文を選択してコピーしてください。';const fallback=document.createElement('textarea');fallback.readOnly=true;fallback.value=text;fallback.setAttribute('aria-label','コピーする指示の全文');status.replaceChildren(document.createTextNode(status.textContent),fallback);fallback.focus();fallback.select();}
 };

 async function refresh(){if(disposed||refreshing)return;refreshing=true;try{const r=await fetch(base);if(!r.ok)throw Error('出力に接続できません。');const s=await r.json();onStatus(s);if(!$('apiAccepting').disabled)$('apiAccepting').checked=!!s.accepting;const labels={closed:'未接続',starting:'音声の準備中',idle:s.accepting?'発話の受付中':'発話の受付はオフ',synthesizing:'音声を生成中',speaking:'発話中',stopping:'発話を停止中',error:'発話エラー'};$('apiState').textContent=labels[s.state]||s.state;}catch(e){$('apiState').textContent=e.message;}finally{refreshing=false;}}
 $('apiAccepting').onchange=async()=>{const control=$('apiAccepting'),wanted=control.checked;control.disabled=true;try{const r=await fetch(base+'/reception',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepting:wanted})});if(!r.ok)throw Error('発話受付を変更できませんでした。');}catch(e){control.checked=!wanted;say(e.message,true);}finally{control.disabled=false;void refresh();}};
 void refresh();const timer=setInterval(refresh,2000);
 return {get active(){return mic.active||camera.active;},get cameraPose(){return camera.pose;},get microphoneActive(){return mic.active;},get mouth(){return mic.level;},
  connection(value){online=value;$('inputMode').disabled=!value||switcher.busy;if(!value){if(mic.active)mic.stop();if(camera.active)camera.stop();}micButtons();$('cameraStart').disabled=!value||camera.active;},
  close(){disposed=true;permissionRequest?.abort();permissionRequest=null;clearInterval(timer);mic.stop();camera.stop();navigator.mediaDevices?.removeEventListener('devicechange',refreshDevices);}
 };
}
