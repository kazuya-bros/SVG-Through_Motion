export const ttsEngines={sbv2:{name:'Style-Bert-VITS2',url:'http://127.0.0.1:5002'},voicevox:{name:'VOICEVOX',url:'http://127.0.0.1:50021'},aivis:{name:'AivisSpeech',url:'http://127.0.0.1:10101'},irodori:{name:'Irodori-TTS（OpenAI互換）',url:'http://127.0.0.1:8088'},browser:{name:'ブラウザ標準（簡易口パク）',url:''}};
export function cleanTtsConfig(v={}){
 const engine=Object.hasOwn(ttsEngines,v.engine)?v.engine:'sbv2',text=(x,n=200)=>typeof x==='string'?x.slice(0,n):'',id=x=>Number.isInteger(x)&&x>=0?x:0;
 return {engine,base_url:text(v.base_url,300)||ttsEngines[engine].url,model_id:id(v.model_id),speaker_id:id(v.speaker_id),style:text(v.style)||'Neutral',style_weight:Number.isFinite(v.style_weight)?Math.max(0,Math.min(3,v.style_weight)):1,model:text(v.model)||'irodori-tts',voice:text(v.voice),label:text(v.label,500),browser_voice:text(v.browser_voice,500)};
}
export function installTtsUI(api,{prefix='',testLabel='生成して話す'}={}){
 const $=id=>document.getElementById(prefix+id),select=$('engine'),host=$('sbvSettings');let active='sbv2',version=0,voices=[],memory={},nativeVoices=[];
 select.replaceChildren(...Object.entries(ttsEngines).map(([id,v])=>new Option(v.name,id)));
 host.innerHTML='<p id="ttsHint" class="tiny"></p><button id="connectTts" class="wide">接続して声を取得</button><label id="ttsVoiceLabel">読み上げる声<select id="ttsVoice"></select></label><details id="ttsAdvanced"><summary>接続・音声の詳細</summary><label>接続URL<input id="ttsUrl" autocomplete="off"></label><p id="ttsProtocol" class="tiny"></p><label id="ttsKeyLabel" hidden>APIキー（必要な場合・保存しません）<input id="ttsApiKey" type="password" autocomplete="off"></label><label class="slider-label" id="ttsWeightLabel">スタイルの強さ<output id="styleWeightOut">1</output><input id="styleWeight" type="range" min="0" max="3" step=".1" value="1"></label></details>';
 if(prefix)host.querySelectorAll('[id]').forEach(el=>el.id=prefix+el.id);
 function config(){const base=memory[active]||cleanTtsConfig({engine:active}),v=voices[+$('ttsVoice').value];return cleanTtsConfig({...base,...v,engine:active,base_url:$('ttsUrl').value,style_weight:+$('styleWeight').value,browser_voice:active==='browser'?nativeVoices[+$('ttsVoice').value]?.voiceURI||(nativeVoices.length?'':base.browser_voice):base.browser_voice});}
 function native(previous=config().browser_voice){nativeVoices=globalThis.speechSynthesis?.getVoices().filter(v=>v.lang.startsWith('ja'))||[];$('ttsVoice').replaceChildren(new Option('日本語の既定の声','-1'),...nativeVoices.map((v,i)=>new Option(v.name,String(i))));const found=nativeVoices.findIndex(v=>v.voiceURI===previous);$('ttsVoice').value=String(found);}
 function show(c){active=c.engine;select.value=active;memory[active]=c;voices=c.label||active==='sbv2'?[c]:[];$('ttsUrl').value=c.base_url;$('styleWeight').value=c.style_weight;$('styleWeightOut').value=c.style_weight;$('ttsApiKey').value='';$('connectTts').disabled=false;
  $('ttsVoice').replaceChildren(...(voices.length?voices.map((v,i)=>new Option(v.label||'モデル 0 / 話者 0 / Neutral',String(i))):[new Option('「接続して声を取得」を押してください','')]));
  $('ttsHint').textContent=active==='browser'?'追加エンジンなしで試せます。口パクは簡易動作で、WAV保存・動画への音声収録には対応しません。':`${ttsEngines[active].name}を起動して、読み上げる声を選んでください。`;
  $('connectTts').hidden=$('ttsAdvanced').hidden=active==='browser';$('ttsKeyLabel').hidden=active!=='irodori';$('ttsWeightLabel').hidden=active!=='sbv2';$('ttsProtocol').textContent=active==='irodori'?'Irodori-TTS OpenAI互換サーバー（Aratako版）のURL。末尾の /v1 は省略できます。':'同じPCで起動した音声エンジンのURLを指定します。';
  if(active==='browser')native(c.browser_voice);
 }
 select.onchange=()=>{memory[active]=config();version++;api.stop();show(memory[select.value]||cleanTtsConfig({engine:select.value}));};
 $('connectTts').onclick=async()=>{const token=++version,c=config();$('connectTts').disabled=true;api.status('声の一覧を取得しています…');
  try{const result=await api.post('/api/tts/voices',{...c,api_key:$('ttsApiKey').value});const body=await result.json();if(token!==version)return;if(!Array.isArray(body.voices)||!body.voices.length)throw Error('使える声がありません。音声エンジン側でモデル・声を用意してください。');voices=body.voices;const idx=voices.findIndex(v=>Object.entries(v).every(([k,value])=>k==='label'||c[k]===value));$('ttsVoice').replaceChildren(...voices.map((v,i)=>new Option(v.label,String(i))));$('ttsVoice').value=String(Math.max(0,idx));memory[active]=config();api.status(`接続できました。声を選び「${testLabel}」で試せます。`);}
  catch(e){if(token===version){voices=[];$('ttsVoice').replaceChildren(new Option('接続できませんでした',''));api.status(e.message,true);}}
  finally{if(token===version)$('connectTts').disabled=false;}
 };
 $('ttsUrl').oninput=()=>{version++;$('connectTts').disabled=false;memory[active]=cleanTtsConfig({engine:active,base_url:$('ttsUrl').value});voices=[];$('ttsVoice').replaceChildren(new Option('接続して声を取得してください',''));};
 globalThis.speechSynthesis?.addEventListener('voiceschanged',()=>{if(active==='browser')native();});
 show(cleanTtsConfig());
 return {snapshot(){memory[active]=config();return {selected:active,engines:structuredClone(memory)};},restore(saved,legacy){version++;api.stop();memory={};for(const [k,v] of Object.entries(saved?.engines||{}))if(Object.hasOwn(ttsEngines,k))memory[k]=cleanTtsConfig({...v,engine:k});const selected=Object.hasOwn(ttsEngines,saved?.selected)?saved.selected:Object.hasOwn(ttsEngines,legacy)?legacy:'sbv2';show(memory[selected]||cleanTtsConfig({engine:selected}));},body(text){if(active!=='browser'&&!voices.length)throw Error('先に「接続して声を取得」で読み上げる声を選んでください。');return {...config(),text,api_key:$('ttsApiKey').value};},get browserVoice(){return nativeVoices[+$('ttsVoice').value]||null;},get name(){return ttsEngines[active].name;}};
}
