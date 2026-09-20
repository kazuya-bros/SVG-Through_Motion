import {outputBackground} from './runtime-input.js';

// Start the persistent player as soon as a character is selected. Preparation
// and broadcasting are two layouts of that player, not separate connections.
export function installRuntimeLauncher(api){
 const mount=document.createElement('section');mount.id='runtimeLauncher';mount.className='control-card';
 mount.innerHTML='<p id="outputStatus" role="status">キャラクターを準備しています…</p><button id="retryPreparation" class="wide" hidden>準備をやり直す</button>';
 document.getElementById('liveMount').prepend(mount);
 let pending=null;
 async function open({effects=false}={}){
  if(pending)return pending;
  const button=mount.querySelector('button'),status=mount.querySelector('p');button.hidden=true;
  status.textContent='キャラクターを準備しています…';document.documentElement.classList.add('route-loading');
  pending=(async()=>{
   const project=await api.runtimeSnapshot();
   const tts={engine:'browser'};
   const response=await fetch('/api/runtime/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project,tts,gain:api.gain?.()||5,accepting:false,ai_enabled:false})});
   const result=await response.json();if(!response.ok)throw Error(result.detail||'キャラクターを起動できませんでした');
   const url=new URL(result.player_url,location.href);url.searchParams.set('mode','idle');url.searchParams.set('prepare','1');url.searchParams.set('inplace','1');
   if(effects)url.pathname='/web/effects-editor.html';
   let color='#00ff00';try{color=outputBackground(localStorage.getItem('svg-through-output-background')||color);}catch{}
   url.searchParams.set('background',color);api.stopSpeech?.();location.replace(url.href);
  })();
  try{await pending;}catch(error){document.documentElement.classList.remove('route-loading');status.textContent=error.message;button.hidden=false;throw error;}finally{pending=null;}
 }
 mount.querySelector('button').onclick=()=>void open().catch(()=>{});
 return {open};
}
