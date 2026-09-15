import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {exportPlan,pngBlob} from './material-export.js';
import {zipFiles} from './assets.js';
import {gameSupportFiles} from './game-export-support.js';

export const GAME_TARGETS={
  tyrano:{label:'ティラノ',description:'立ち絵と目・口の差分、登録用スクリプトを出力します。標準の目パチ・口パク機能で使えます。'},
  rpgmaker:{label:'ツクールMZ',description:'ピクチャ用PNGと設定例を出力します。目パチ・口パクの再生には別途PictureAnimationプラグインを使います。'},
  unity:{label:'Unity',description:'透過PNGと取り込みツールを出力します。PrefabとAnimatorを作成でき、会話側から口パクを切り替えられます。'},
};

// Partition whole rendered poses, including their skin/hair occlusion. Changed
// pixels have one owner; opaque unchanged padding hides scaled layer boundaries.
export function splitPortraitPixels(base,eyes,mouths,width=0){
  const size=base.length;
  if(size%4||[...eyes,...mouths].some(p=>p.length!==size))throw Error('差分画像のサイズが一致しません。');
  const eyeMask=new Uint8Array(size/4),mouthMask=new Uint8Array(size/4);
  for(let i=0;i<size;i+=4){
    const changed=p=>p[i]!==base[i]||p[i+1]!==base[i+1]||p[i+2]!==base[i+2]||p[i+3]!==base[i+3];
    eyeMask[i/4]=+eyes.some(changed);mouthMask[i/4]=+mouths.some(changed);
    if(eyeMask[i/4]&&mouthMask[i/4])throw Error('目と口の補正範囲が重なっています。位置・サイズを調整してから書き出してください。');
  }
  const cut=(pixels,mask)=>{
    const out=new Uint8ClampedArray(size);
    for(let i=0;i<size;i+=4)if(mask(i/4))out.set(pixels.subarray(i,i+4),i);
    return out;
  };
  const padded=mask=>{
    const out=mask.slice();
    if(width>0){
      const height=mask.length/width;
      for(let i=0;i<mask.length;i++)if(mask[i]){
        const x=i%width,y=Math.floor(i/width);
        for(let yy=Math.max(0,y-2);yy<=Math.min(height-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(width-1,x+2);xx++){
          const j=yy*width+xx;
          // Opaque unchanged overlap prevents seams when a game scales layers.
          if(!eyeMask[j]&&!mouthMask[j]&&base[j*4+3]===255)out[j]=1;
        }
      }
    }
    return out;
  };
  const eyePadded=padded(eyeMask),mouthPadded=padded(mouthMask);
  return {base:cut(base,i=>!eyeMask[i]&&!mouthMask[i]),
    eyes:[base,...eyes].map(p=>cut(p,i=>eyePadded[i])),
    mouths:[base,...mouths].map(p=>cut(p,i=>mouthPadded[i]))};
}

export async function exportGameCharacter(project,options={}, {signal,progress=()=>{}}={}){
  const target=options.target;
  if(!GAME_TARGETS[target])throw Error('ゲームの出力先を選んでください。');
  const plan=exportPlan(project,{max_edge:options.max_edge??512,duration:1,fps:1});
  if(target==='rpgmaker'&&plan.width*3>4096)throw Error('ツクール用は最大辺を1024px以下にしてください。');
  const copy=structuredClone(project);
  copy.settings={...copy.settings,background:'transparent',rigEnabled:false};
  const slug=String(project.id||'character').replace(/[^a-zA-Z0-9_]/g,'').slice(0,32)||'character';
  const id=`svg_${slug}`;
  signal?.throwIfAborted();
  const renderer=await prepareCanvasRenderer(copy,plan.maxEdge);
  const files=[],images={},samples=[];
  const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
  const ctx=canvas.getContext('2d');
  try{
    // A stationary pose keeps eye and mouth replacements independently aligned.
    const poses=[[0,0],[.5,0],[1,0],[0,.5],[0,1]];
    for(let i=0;i<poses.length;i++){
      signal?.throwIfAborted();const [blink,mouth]=poses[i];
      renderer.draw({sway:0,breathe:0,blinkL:blink,blinkR:blink,mouth,vowel:'a'});
      samples.push(renderer.canvas.getContext('2d').getImageData(0,0,plan.width,plan.height).data);
      progress(i+1,5);await new Promise(r=>setTimeout(r,0));
    }
    const layers=splitPortraitPixels(samples[0],samples.slice(1,3),samples.slice(3),plan.width);
    const prefix=target==='tyrano'?`data/fgimage/${id}/`:target==='rpgmaker'?`img/pictures/${id}_`:`Assets/SVGThrough/${id}/`;
    const add=async(name,data)=>{
      signal?.throwIfAborted();ctx.putImageData(new ImageData(data,plan.width,plan.height),0,0);
      const file=prefix+name+'.png';
      files.push([file,new Uint8Array(await (await pngBlob(canvas)).arrayBuffer())]);images[name]=file;
    };
    await add('base',layers.base);
    const names=['open','mid','close'],mouthNames=['close','mid','open'];
    for(let i=0;i<3;i++){await add('eye_'+names[i],layers.eyes[i]);await add('mouth_'+mouthNames[i],layers.mouths[i]);}
    // Whole portraits also work in ordinary Show Picture and other dialogue tools.
    for(let e=0;e<3;e++)for(let m=0;m<3;m++){
      const full=layers.base.slice();
      for(const layer of [layers.eyes[e],layers.mouths[m]])for(let i=0;i<full.length;i+=4){
        if(layer[i+3])full.set(layer.subarray(i,i+4),i);
      }
      await add(`portrait_e${e}_m${m}`,full);
    }
    if(target==='rpgmaker'){
      // Horizontal three-cell strips are natively supported by PictureAnimation.
      for(const [name,frames] of [['eye',layers.eyes],['mouth',layers.mouths]]){
        const sheet=document.createElement('canvas');sheet.width=plan.width*3;sheet.height=plan.height;
        const sc=sheet.getContext('2d');
        frames.forEach((data,i)=>sc.putImageData(new ImageData(data,plan.width,plan.height),i*plan.width,0));
        files.push([prefix+name+'_sheet.png',new Uint8Array(await (await pngBlob(sheet)).arrayBuffer())]);sheet.width=sheet.height=1;
      }
    }
    const manifest={schema:'svg-through.character.v1',target,id,name:project.name,width:plan.width,height:plan.height,
      alpha:true,trimmed:false,bodyMotion:false,eyeStates:names,mouthStates:mouthNames,images};
    files.push(['character.json',JSON.stringify(manifest,null,2)],...await gameSupportFiles(target,id,signal));
    signal?.throwIfAborted();return {blob:zipFiles(files),manifest};
  }finally{renderer.dispose();canvas.width=canvas.height=1;}
}
