import {effectPresets,effectFrame} from './character-effects.js';

export function installEffectControls({host,base}){
  const section=document.createElement('section');section.className='effect-controls';
  section.innerHTML='<h2>演出</h2><p class="tiny">キャラクターと配信ソフトの表示に反映します。</p><div class="effect-buttons"></div><label>演出の強さ <output class="effect-strength-value">70%</output><input class="effect-strength" type="range" min="0" max="1" step=".05" value=".7"></label><label>演出の時間<select class="effect-duration"><option value="2">2秒</option><option value="4">4秒</option><option value="6" selected>6秒</option><option value="10">10秒</option><option value="20">20秒</option><option value="30">30秒</option></select></label><label class="toggle">発話が終わったら戻す<input class="effect-speech" type="checkbox"></label><p class="tiny">発話中に使えます。時間の終了か発話の終了・中断で戻します。</p><button class="effect-reset wide" type="button">演出を止めて元に戻す</button><p class="effect-status tiny" role="status">演出なし</p>';
  host.append(section);const status=section.querySelector('.effect-status'),strength=section.querySelector('.effect-strength'),duration=section.querySelector('.effect-duration'),bound=section.querySelector('.effect-speech');
  let connected=false,busy=false,last='',lastCue='',errorCue=null;const buttons=[];
  function available(){for(const b of buttons)b.disabled=!connected||busy;}
  async function play(preset){
    if(busy)return;busy=true;available();
    try{
      const r=await fetch(base+'/effect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:crypto.randomUUID(),preset,strength:Number(strength.value),duration:Number(duration.value),until_speech_end:preset!=='none'&&bound.checked})});
      const body=await r.json();if(!r.ok)throw Error(typeof body.detail==='string'?body.detail:'演出の設定を確認してください');
      status.textContent='演出を送信しました…';last='';
    }catch(error){status.textContent=error.message;errorCue=lastCue;}finally{busy=false;available();}
  }
  for(const entry of effectPresets){const b=document.createElement('button');b.type='button';b.textContent=entry.name;b.title=entry.hint;b.onclick=()=>void play(entry.id);section.querySelector('.effect-buttons').append(b);buttons.push(b);}
  const reset=section.querySelector('.effect-reset');buttons.push(reset);reset.onclick=()=>void play('none');
  strength.oninput=()=>{section.querySelector('.effect-strength-value').value=Math.round(Number(strength.value)*100)+'%';};
  available();
  return {connection(value){connected=value;available();if(!value){status.textContent='出力との接続を待っています';last='';}},
    update(cue,time){
      const request=cue?.request_id||'';
      if(request!==lastCue){
        lastCue=request;errorCue=null;
        if(cue&&cue.preset!=='none'){
          strength.value=String(cue.strength);section.querySelector('.effect-strength-value').value=Math.round(cue.strength*100)+'%';
          if(![...duration.options].some(o=>o.value===String(cue.duration))){duration.querySelector('[data-custom]')?.remove();const o=new Option(cue.duration+'秒',String(cue.duration));o.dataset.custom='';duration.append(o);}
          duration.value=String(cue.duration);bound.checked=cue.until_speech_end;
        }
      }
      if(errorCue===request)return;
      const f=effectFrame(cue,time),key=(cue?.request_id||'')+':'+f.phase;
      if(last===key)return;last=key;
      const label=effectPresets.find(v=>v.id===cue?.preset)?.name;
      status.textContent=label?(f.phase==='running'?label+' · 再生中':cue.preset==='dissolve'&&!cue.until_speech_end?'非表示です。「粒から現れる」か「元に戻す」で戻せます。':'演出が終わりました'):'演出なし';
      for(let i=0;i<effectPresets.length;i++)buttons[i].setAttribute('aria-pressed',String(cue?.preset===effectPresets[i].id&&f.phase==='running'));
    },close(){section.remove();}};
}
