// Shared deterministic timeline: output window and OBS evaluate the same cue/time.
export const effectPresets = [
  {id:'glitch',name:'輪郭ノイズ',hint:'ときどき輪郭がずれる通信ノイズ。'},
  {id:'blocks',name:'ノイズブロックから現れる',hint:'四角いノイズが集まって現れます。'},
  {id:'bounce',name:'はずみ',hint:'指定した方向へ弾んで戻ります。'},
  {id:'ink',name:'線から色へ登場',hint:'暗い線が現れ、色が広がります。'},
  {id:'dissolve',name:'サラサラ消える',hint:'色の粒になって消え、非表示を保ちます。'},
  {id:'appear',name:'粒から現れる',hint:'粒が集まり、通常の表示に戻ります。'},
  {id:'comms',name:'通信中',hint:'緑の色調・走査線・接続時の小さな乱れ。'},
  {id:'happy',name:'幸せの光',hint:'暖かい光と、顔の周囲に浮かぶ星。'},
];
const names=new Set(['none','bundle',...effectPresets.map(p=>p.id)]);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const smoothEffect=v=>{v=clamp(v);return v*v*(3-2*v);};
export function effectNoise(index,seed=17){let n=Math.imul(index+1,374761393)^Math.imul(seed+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
export function effectCue(command,time,reduced=false){
  if(!names.has(command.preset)||!Number.isFinite(time)||!Number.isFinite(command.duration)||command.duration<.5||command.duration>30||!Number.isFinite(command.strength)||command.strength<0||command.strength>1)throw Error('演出の設定が不正です');
  const direction=command.direction||'right';if(!['right','left','up','down'].includes(direction))throw Error('演出の方向が不正です');
  if(command.preset==='bundle'&&(!command.recipe||!Array.isArray(command.recipe.components)||command.recipe.components.length>10))throw Error('組み合わせ演出が不正です');
  return {update_preview_id:command.update_preview_id||null,recipe:command.recipe||null,preview:!!command.preview,restore_preview_id:command.restore_preview_id||null,preset:command.preset,direction,duration:command.duration,strength:command.strength,started_at:time,request_id:command.request_id,reduced:!!reduced,until_speech_end:!!command.until_speech_end};
}
export function effectFrame(cue,time){
  if(!cue||!names.has(cue.preset)||!Number.isFinite(cue.started_at)||!Number.isFinite(time)||!(cue.duration>=.5&&cue.duration<=30)||!(cue.strength>=0&&cue.strength<=1))return {preset:'none',phase:'completed',progress:1,strength:0,elapsed:0,visibility:1};
  const elapsed=Math.max(0,time-cue.started_at),progress=clamp(elapsed/cue.duration),finished=progress>=1||cue.preset==='none';
  const transition=cue.preset==='dissolve'||cue.preset==='appear'||cue.preset==='blocks';
  return {...cue,elapsed,progress,phase:finished?'completed':'running',
    preset:cue.preset==='bundle'?((!finished||cue.recipe?.behavior==='select')?'bundle':'none'):finished&&(!transition||cue.until_speech_end)?'none':cue.preset,
    visibility:finished&&cue.until_speech_end?1:cue.preset==='dissolve'?1-progress:cue.preset==='appear'?progress:1,
    envelope:transition?1:smoothEffect(elapsed/.45)*smoothEffect((cue.duration-elapsed)/.6)};
}
export function dissolveThreshold(x,y,width){return .08+.64*x/Math.max(1,width-1)+.12*effectNoise(y*width+x);}

export function createEffectPlayback(report=()=>{}){
  let cue=null,reported=null,resume=null;
  const restore=time=>{if(resume){cue={...resume.cue,started_at:resume.cue.started_at+time-resume.at};reported=resume.reported;resume=null;}else{cue=null;reported=null;}};
  return {
    get cue(){return cue;},
    start(command,time,reduced=false){
      const next=effectCue(command,time,reduced);
      if(next.restore_preview_id){if(cue?.preview&&cue.request_id===next.restore_preview_id){if(reported!=='completed')report({request_id:cue.request_id,status:'interrupted'});restore(time);}report({request_id:next.request_id,status:'completed'});return;}
      if(cue?.request_id===next.request_id)return;
      if(next.preview&&!cue?.preview){resume=cue?{cue,reported,at:time}:null;}else if(cue&&reported!=='completed')report({request_id:cue.request_id,status:'interrupted'});
      if(!next.preview&&resume){if(resume.reported!=='completed')report({request_id:resume.cue.request_id,status:'interrupted'});resume=null;}
      if(next.preview&&cue?.preview&&next.update_preview_id===cue.request_id)next.started_at=cue.started_at;
      cue=next;reported=null;
    },
    rendered(time){if(!cue)return;const phase=effectFrame(cue,time).phase;if(phase!==reported){reported=phase;report({request_id:cue.request_id,status:phase});}if(phase==='completed'&&cue.preview&&cue.recipe?.behavior!=='select')restore(time);},
    reset(){if(cue&&reported!=='completed')report({request_id:cue.request_id,status:'interrupted'});cue=null;reported=null;resume=null;},
    speechEnded(){if(cue?.until_speech_end)this.reset();},
  };
}
