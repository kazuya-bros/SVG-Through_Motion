import {sampleMotionSettings} from './natural-motion.js';
import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {loopPose} from './motion.js?v=mouth-editor-9';
import {svgSignature} from './raster-source.js';
import {ensureSeamRig} from './seam-rig.js';

export function sampleCopy(template, id='sample-'+crypto.randomUUID()) {
  const copy=structuredClone(template);
  copy.id=id;copy.name='Teth2 · お試し';copy.sampleMotionDefault=true;copy.settings=sampleMotionSettings(copy.settings);
  delete copy.voiceSettings;delete copy.assist;delete copy.assistSession;
  copy.warnings=[];
  return copy;
}

export const samplePreviewPose=loopPose;

export function installStartSample({adopt,validate}) {
  const $=id=>document.getElementById(id),root=$('startScreen'),status=$('sampleStatus');
  function startPage(materials,focus=false){
    $('startLanding').hidden=materials;$('startSourceHost').hidden=!materials;
    if(focus){window.scrollTo(0,0);(materials?document.querySelector('.source-tabs .active'):$('startOwn')).focus({preventScroll:true});}
  }
  $('startOwn').onclick=()=>{
    document.querySelector('[data-source-page=new]').click();
    history.pushState({...history.state,startMaterials:true},'','#materials');startPage(true,true);
  };
  $('startResume').onclick=()=>{document.querySelector('[data-source-page=resume]').click();history.pushState({...history.state,startMaterials:true},'','#materials');startPage(true,true);};
  window.addEventListener('popstate',()=>{if(!root.hidden)startPage(location.hash==='#materials',true);});
  startPage(location.hash==='#materials');
  if(new URLSearchParams(location.search).has('project')||new URLSearchParams(location.search).get('menu')==='use')return;
  let template,previewSettings,renderer,frame=0,visible=false,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,time=0,last=0;
  const start=$('startSample');
  function tick(now){
    frame=0;
    if(!renderer||!playing||!visible||root.hidden||document.hidden){last=0;return;}
    if(last)time+=(now-last)/1000;last=now;
    renderer.draw(samplePreviewPose(time,previewSettings));frame=requestAnimationFrame(tick);
  }
  function resume(){if(!frame)frame=requestAnimationFrame(tick);}
  const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume();});visibility.observe($('sampleMotion'));
  document.addEventListener('visibilitychange',resume);
  const imported=new MutationObserver(()=>{if(root.hidden){cancelAnimationFrame(frame);frame=0;renderer?.dispose();renderer=null;visibility.disconnect();imported.disconnect();document.removeEventListener('visibilitychange',resume);}});imported.observe(root,{attributes:true,attributeFilter:['hidden']});
  start.onclick=async()=>{
    if(!template)return;start.disabled=true;
    try{
      adopt(sampleCopy(template));
      const url=new URL(location.href);url.searchParams.delete('project');url.hash='';history.replaceState(null,'',url);
    }catch(error){status.hidden=false;status.textContent='サンプルを開けませんでした：'+error.message;start.disabled=false;}
  };
  void (async()=>{
    try{
      const response=await fetch('/web/samples/teth/manifest.json');if(!response.ok)throw Error('サンプル素材が見つかりません');
      const manifest=await response.json();
      $('sampleOriginal').src=manifest.original;
      for(const layer of manifest.layers){const box=document.createElement('div');box.className='sample-layer';const img=document.createElement('img'),label=document.createElement('span');img.src=layer.url;img.alt='PSD内の'+layer.label;label.textContent=layer.label;box.append(img,label);$('sampleLayers').append(box);}
      const data=await fetch(manifest.project);if(!data.ok)throw Error('サンプルを読み込めません');
      template=validate(await data.json());template.settings=sampleMotionSettings(template.settings);
      for(const part of template.parts)if(part.role==='static'&&!part.rasterDisabled&&!part.rasterSourceUrl){part.rasterSourceUrl=part.originalUrl;part.rasterSignature=await svgSignature(part.svgText);}
      await ensureSeamRig(template);
      start.disabled=false;
      // The landing showcase and editable sample share the same default motion.
      previewSettings=sampleMotionSettings(template.settings);
      const preview=structuredClone(template);preview.settings=previewSettings;
      renderer=await prepareCanvasRenderer(preview,480);
      if(root.hidden){renderer.dispose();renderer=null;return;}
      renderer.canvas.setAttribute('role','img');renderer.canvas.setAttribute('aria-label','Teth2の口パク・まばたき・瞳の動き・胸揺れ・耳揺れ・髪揺れ・弾みの見本');
      $('sampleMotion').replaceChildren(renderer.canvas);renderer.draw(samplePreviewPose(0,previewSettings));
      resume();
    }catch(error){status.hidden=false;status.textContent=error.message+'。自分の素材からは、そのまま始められます。';}
  })();
}
