import {sceneSvg,applyPose,anchor} from './motion.js?v=mouth-editor-9';
import {featureRoles,featureSignature,validateMorph,activeFeature,invalidateMorph,mouthPlaybackMode} from './rife-morph.js';

async function endpoint(project,key,box,at,mode){
  const roles=featureRoles(key),parts=project.parts.filter(p=>roles.includes(p.role)&&p.visible);
  const copy={...project,rig:null,rifeMorph:null,eyeThroughPass:true,renderGroup:true,parts,
    settings:{...project.settings,rifeDisabled:true,rigEnabled:false,background:'transparent',eyeThroughHair:false,mouthStyle:'artwork',vowels:false,mouthTuning:mode==='svg-frames'?project.settings?.mouthTuning:{closed:project.settings?.mouthTuning?.closed},closedWidth:mode==='svg-frames'?project.settings?.closedWidth??.8:1,mouthOffsetY:0}};
  const root=new DOMParser().parseFromString(sceneSvg(copy,copy.settings,false),'image/svg+xml').documentElement;
  applyPose(root,{mouth:key==='mouth'?at:0,blinkL:key==='eye-l'?at:0,blinkR:key==='eye-r'?at:0},copy);
  for(const node of root.querySelectorAll('[opacity="0"]'))node.remove();
  for(const node of root.querySelectorAll('[style]'))if(node.style?.maskType)node.setAttribute('mask-type',node.style.maskType);
  const [x,y,w,h]=box,scale=256/Math.max(w,h),width=Math.max(16,Math.round(w*scale)),height=Math.max(16,Math.round(h*scale));
  root.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);root.setAttribute('width',width);root.setAttribute('height',height);
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'}));
  const image=new Image();image.src=url;
  try{await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0);return {png:canvas.toDataURL('image/png'),svg:new XMLSerializer().serializeToString(root)};}
  finally{URL.revokeObjectURL(url);}
}

export function installRifeMorph(api){
  const panels=[],state={busy:false,job:null,cancelled:false,message:'',messageTargets:[]};
  for(const [target,mount,title] of [['eyes','eyeEditorMount','瞬き'],['mouth','mouthEditorMount','口パク']]){
    const card=document.createElement('section');card.className='control-card rife-morph-controls';
    card.innerHTML=`<h3>${title}の中間形状（RIFE）</h3><p class="tiny">${target==='mouth'?'RIFEが描いた中間の口を補正してSVG化します。8枚の輪郭を合わせ、形と色をつないで再生します。':'RIFEの絵をそのままSVG化し、開閉を含む8枚をなめらかにつないで再生します。'}</p><button class="wide" data-generate>8枚のSVGを作る</button><button class="wide" data-cancel hidden>生成を中止</button><label>再生方式<select data-mode>${target==='mouth'?'<option value="svg-frames">RIFEの8枚SVGを補間（推奨）</option><option value="stable">元SVGを変形（比較用）</option>':'<option value="svg-frames">8枚のSVGをなめらかにつなぐ</option>'}<option value="grid">従来の変形で動かす</option></select></label><label class="toggle-row">中間形状を使う<input data-enabled type="checkbox"></label><label class="slider-label" data-strength-label>変形の強さ <output>100%</output><input data-strength type="range" min="0" max="1" step=".05" value="1"></label><p class="tiny" data-frame-note>隣のコマの位置・高さを合わせて補間します。古い生成結果は作り直すと終端の跳びも抑えられます。${target==='eyes'?'目が開いている間は元の瞳が動き、瞬きに合わせてRIFEへつなぎます。待機中の視線移動・瞳の拡縮は再生成なしで使えます。':''}</p><p class="tiny" role="status" data-status>未生成</p><details hidden><summary>生成した8枚を確認</summary><label>表示<select data-reference-mode><option value="svg">SVG</option><option value="rife">SVG化する前の補正画像</option><option value="raw">補正前のRIFE画像</option></select></label><div data-references style="display:flex;flex-wrap:wrap;gap:4px"></div></details>`;
    document.getElementById(mount).after(card);
    if(target==='eyes'){card.querySelector('[data-reference-mode] option[value=raw]').remove();card.querySelector('[data-reference-mode] option[value=rife]').textContent='SVG化する前のRIFE画像';}
    const panel={target,card,button:card.querySelector('[data-generate]'),mode:card.querySelector('[data-mode]'),cancel:card.querySelector('[data-cancel]'),enabled:card.querySelector('[data-enabled]'),strength:card.querySelector('[data-strength]'),status:card.querySelector('[data-status]')};panels.push(panel);
    panel.button.onclick=()=>execute({operation:'generate',target}).catch(error=>{state.message=error.message;state.messageTargets=[target];refresh();api.status(error.message,true);});
    panel.cancel.onclick=()=>execute({operation:'cancel'}).catch(error=>api.status(error.message,true));
    panel.enabled.onchange=()=>{const p=api.project();if(!p)return;p.settings[target==='eyes'?'rifeEyes':'rifeMouth']=panel.enabled.checked;api.changed();refresh();};
    panel.mode.onchange=()=>{const p=api.project();if(!p)return;p.settings[target==='eyes'?'rifeEyesMode':'rifeMouthMode']=panel.mode.value;state.message='';api.changed();refresh();};
    panel.strength.oninput=()=>{const p=api.project();if(!p)return;p.settings.rifeStrength=+panel.strength.value;api.changed();refresh();};
  }
  const json=async(url,body)=>{const res=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail));return data;};
  function current(p,key){const f=p.rifeMorph?.features?.[key];return !!f&&featureSignature(p,key,f.sourceMode)===f.signature;}
  function inspect(){const p=api.project();return {busy:state.busy,job_id:state.job,message:state.message,features:p?Object.fromEntries(['eye-l','eye-r','mouth'].map(key=>[key,{generated:!!p.rifeMorph?.features?.[key],current:current(p,key),enabled:!!activeFeature(p,key),svg_frames:p.rifeMorph?.features?.[key]?.svgFrames?.length||0,correction:p.rifeMorph?.features?.[key]?.mouthCorrection||null,mode:key==='mouth'?mouthPlaybackMode(p.settings):p.settings.rifeEyesMode||'svg-frames'}])):{}};}
  function refresh(){
    const p=api.project();
    for(const panel of panels){
      const keys=panel.target==='eyes'?['eye-l','eye-r']:['mouth'];
      const existing=keys.filter(key=>p?.rifeMorph?.features?.[key]),valid=existing.length&&existing.every(key=>current(p,key));
      panel.button.disabled=!p||state.busy;panel.cancel.hidden=!state.busy;panel.enabled.disabled=!valid||state.busy;panel.enabled.checked=!!p?.settings?.[panel.target==='eyes'?'rifeEyes':'rifeMouth'];
      panel.strength.disabled=!valid||state.busy;panel.strength.value=p?.settings?.rifeStrength??1;panel.card.querySelector('output').value=Math.round(panel.strength.value*100)+'%';
      panel.mode.value=panel.target==='mouth'?mouthPlaybackMode(p?.settings):p?.settings?.rifeEyesMode||'svg-frames';panel.mode.disabled=!p||state.busy;
      panel.card.querySelector('[data-strength-label]').hidden=panel.mode.value!=='grid';panel.card.querySelector('[data-frame-note]').hidden=panel.mode.value==='grid';
      if(panel.target==='mouth')panel.card.querySelector('[data-frame-note]').textContent=panel.mode.value==='stable'?'元の開き口SVGを変形します。RIFEの中間の絵そのものは表示しません。':'RIFEの中間の形と色を使います。薄い残像を補正し、隣のコマの輪郭を合わせてつなぎます。古い8枚は再生成してください。';
      panel.status.textContent=(existing.length&&!valid?'素材が変更されています。中間形状を作り直してください。':state.messageTargets.includes(panel.target)&&state.message)||(valid?'生成済み。開閉スライダーで確認できます。':'未生成。開いた絵と閉じた絵を整えてから作成してください。');
      if(valid&&panel.target==='mouth'&&panel.mode.value==='svg-frames'&&p.rifeMorph.features.mouth.svgFrames&&!p.rifeMorph.features.mouth.mouthCorrection)panel.status.textContent='補正前の8枚です。「8枚のSVGを作る」で薄い輪郭を補正して作り直せます。';
      if(valid&&panel.mode.value==='svg-frames'&&existing.some(key=>!p.rifeMorph.features[key].svgFrames))panel.status.textContent='8枚SVGは未生成です。生成するまでは従来の変形で表示します。';
    }
  }
  async function execute(command={}){
    if(command.operation==='inspect')return inspect();
    if(command.operation==='cancel'){state.cancelled=true;if(state.job)await json(`/api/rife-morph/jobs/${state.job}/cancel`,{});return inspect();}
    if(command.operation!=='generate')throw Error('未対応のRIFE操作です');
    if(state.busy)throw Error('RIFE生成中です');
    const p=api.project();if(!p)throw Error('先にキャラクターを読み込んでください');
    const mode=command.mode||'svg-frames',target=command.target||'all',keys=(target==='eyes'?['eye-l','eye-r']:target==='mouth'?['mouth']:['eye-l','eye-r','mouth']).filter(key=>p.parts.some(part=>part.visible&&part.role===(key==='mouth'?'mouth':'lash-'+key.slice(-1))));
    if(!keys.length)throw Error('対象となる目・口パーツがありません');
    for(const key of keys){const part=p.parts.find(part=>part.visible&&part.role===(key==='mouth'?'mouth':'lash-'+key.slice(-1)));if(!part.closedSvgText||(key==='mouth'&&(part.mouthMode!=='source-open'||part.openSvgText)))throw Error(key==='mouth'?'今回は「元絵は開口」と閉じ口差分がある口に対応します。':'閉じ目の差分を先に設定してください。');}
    state.busy=true;state.cancelled=false;state.messageTargets=target==='all'?['eyes','mouth']:[target];state.message='開閉の素材を準備しています…';refresh();
    const signatures=Object.fromEntries(keys.map(key=>[key,featureSignature(p,key,mode)])),features={},evidence=[];
    try{
      const available=await json('/api/rife-morph/status');if(!available.available)throw Error(available.message);
      for(const key of keys){
        if(state.cancelled)throw Error('生成を中止しました');
        const roles=featureRoles(key),parts=p.parts.filter(part=>part.visible&&roles.includes(part.role));
        const x=Math.min(...parts.map(p=>p.x)),y=Math.min(...parts.map(p=>p.y)),right=Math.max(...parts.map(p=>p.x+p.width)),bottom=Math.max(...parts.map(p=>p.y+p.height));
        const pad=Math.max(right-x,bottom-y)*.25,box=[x-pad,y-pad,right-x+2*pad,bottom-y+2*pad];
        const pivot=key==='mouth'?parts[0].y+parts[0].height/2:anchor(p,key.slice(-1))[1],normalizedAnchor=(pivot-box[1])/box[3];
        const start=await endpoint(p,key,box,0,mode),end=await endpoint(p,key,box,1,mode);
        if(state.cancelled)throw Error('生成を中止しました');
        let job=await json('/api/rife-morph/jobs',{request_id:crypto.randomUUID(),mode,kind:key==='mouth'?'mouth':'eye',anchor:normalizedAnchor,start:start.png,end:end.png});state.job=job.id;
        const deadline=Date.now()+180000;
        while(!['done','failed','cancelled'].includes(job.status)){
          if(Date.now()>deadline){await json(`/api/rife-morph/jobs/${job.id}/cancel`,{});throw Error('RIFE生成がタイムアウトしました');}
          if(state.cancelled){await json(`/api/rife-morph/jobs/${job.id}/cancel`,{});throw Error('生成を中止しました');}
          state.message=`${key==='mouth'?'口':key==='eye-l'?'左目':'右目'}：${job.message}（${Math.round(job.progress*100)}%）`;refresh();
          await new Promise(resolve=>setTimeout(resolve,250));job=await json(`/api/rife-morph/jobs/${job.id}`);
        }
        if(job.status!=='done')throw Error(job.message);
        features[key]={signature:signatures[key],box,anchor:normalizedAnchor,frames:job.result.frames};evidence.push({key,job_id:job.id});
        if(job.result.svg_frames){features[key].sourceMode='svg-frames';if(job.result.mouth_correction)features[key].mouthCorrection=job.result.mouth_correction;features[key].svgSize=job.result.svg_size;features[key].svgFrames=job.result.svg_frames.map((frame,i)=>({at:i/7,bounds:frame.bounds,...(frame.profile?{profile:frame.profile}:{}),svgText:i===0?start.svg:i===7?end.svg:frame.svgText}));}
        const panel=panels.find(panel=>panel.target===(key==='mouth'?'mouth':'eyes')),list=panel.card.querySelector('[data-references]');list.replaceChildren();
        const preview=()=>{list.replaceChildren();const vector=panel.card.querySelector('[data-reference-mode]').value==='svg';(panel.card.querySelector('[data-reference-mode]').value==='raw'&&job.result.raw_references?.length?job.result.raw_references:job.result.references).forEach((src,i)=>{const image=new Image();image.src=vector&&features[key].svgFrames?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(features[key].svgFrames[i].svgText):src;image.alt=`${key} ${Math.round(i/(job.result.references.length-1)*100)}%`;image.style.cssText='width:23%;background:repeating-conic-gradient(#eee 0% 25%,white 0% 50%) 0 / 12px 12px';list.append(image);});};
        panel.card.querySelector('[data-reference-mode]').onchange=preview;preview();panel.card.querySelector('summary').textContent=(key==='mouth'?'口':key==='eye-l'?'左目':'右目')+'：生成したコマを確認';panel.card.querySelector('details').hidden=false;
      }
      if(state.cancelled)throw Error('生成を中止しました');
      if(api.project()!==p||keys.some(key=>featureSignature(p,key,mode)!==signatures[key]))throw Error('生成中に素材が変わったため適用しませんでした。再生成してください。');
      p.rifeMorph=validateMorph({version:1,features:{...p.rifeMorph?.features,...features}});
      for(const key of keys){p.settings[key==='mouth'?'rifeMouth':'rifeEyes']=true;p.settings[key==='mouth'?'rifeMouthMode':'rifeEyesMode']=mode;}
      p.settings.rifeStrength??=1;invalidateMorph(p);api.changed();await api.ready();
      state.message='中間形状を適用しました。プロジェクト保存で一緒に保存されます。';return {applied:keys,evidence};
    }catch(error){state.message=error.message;throw error;}
    finally{state.busy=false;state.job=null;refresh();}
  }
  refresh();return {execute,refresh};
}
