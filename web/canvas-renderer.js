import {hasSecondaryMesh} from './secondary-motion.js';
import {naturalEarsActive} from './natural-ears.js';
import {earEnabled} from './idle-expression.js';
import {rasterProject} from './raster-source.js';
import {chestRegion} from './chest-motion.js';
import {drawAnimeMouth,mouthOffset} from './anime-mouth.js';
import {sceneSvg,applyPose,anchor,clamp,smooth,partMotion,mouthScale,hairLashOpacity,nativeMouthOpenOpacity,irisMotion} from './motion.js?v=mouth-editor-9';
import {rigActive,faceMotion,mesh,triangleMatrix,expandedTriangle,rigGroups} from './rig.js?v=mouth-editor-9';
import {ensureSeamRig} from './seam-rig.js';
import {vowelScale} from './vowels.js';
import {mouthOpenMatrix,mouthTeethSvg,mouthTeethOpacity} from './mouth-controls.js';
import {closedLashArtwork} from './eyelid-controls.js';
import {mouthVariantWeights} from './mouth-variants.js';
import {eyeThroughPasses,eyeThroughStrength} from './eye-through-hair.js';

// Render vector assets once at output resolution; animate their transforms on canvas.
// This avoids reparsing tens of thousands of paths on every recorded video frame.
export async function prepareCanvasRenderer(project, maxEdge=1024, options={}) {
  await ensureSeamRig(project);
  const passes=eyeThroughPasses(project);
  if(passes){
    const renderers=[];
    try{for(const pass of [passes.base,passes.hair,passes.lashes])renderers.push(await prepareCanvasRenderer(pass,maxEdge,options));}
    catch(error){renderers.forEach(r=>r.dispose());throw error;}
    const [base,hair,lashes]=renderers,canvas=document.createElement('canvas'),mix=document.createElement('canvas');
    canvas.width=mix.width=base.canvas.width;canvas.height=mix.height=base.canvas.height;
    const ctx=canvas.getContext('2d'),mask=mix.getContext('2d');
    return {canvas,async updateClosed(part){for(const pass of Object.values(passes)){const target=pass.parts.find(p=>p.id===part.id);if(target){target.closedSvgText=part.closedSvgText;target.lidAdjust=part.lidAdjust;}}await Promise.all(renderers.map(r=>r.updateClosed(part)));},dispose(){renderers.forEach(r=>r.dispose());canvas.width=canvas.height=mix.width=mix.height=1;},draw(pose){
      renderers.forEach(r=>r.draw(pose));ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(base.canvas,0,0);
      mask.clearRect(0,0,mix.width,mix.height);mask.globalCompositeOperation='source-over';mask.drawImage(lashes.canvas,0,0);mask.globalCompositeOperation='destination-in';mask.drawImage(hair.canvas,0,0);mask.globalCompositeOperation='source-over';
      ctx.globalAlpha=eyeThroughStrength(project.settings);ctx.drawImage(mix,0,0);ctx.globalAlpha=1;
    }};
  }
  const buffers=[];let disposed=false;
  const makeCanvas=()=>{const canvas=document.createElement('canvas');buffers.push(canvas);return canvas;};
  const release=canvas=>{if(!canvas)return;canvas.width=canvas.height=1;const i=buffers.indexOf(canvas);if(i>=0)buffers.splice(i,1);};
  const dispose=()=>{disposed=true;for(const canvas of buffers)canvas.width=canvas.height=1;buffers.length=0;};
  const supersample=Math.max(1,Math.min(options.supersample||1,2160/maxEdge));
  const scale=Math.min(options.allowUpscale?Infinity:1,maxEdge/project.width,maxEdge/project.height)*supersample;
  const width=Math.round(project.width*scale),height=Math.round(project.height*scale);
  const groups=rigActive(project)||chestRegion(project)||project.parts.some(earEnabled)||hasSecondaryMesh(project)?rigGroups(project):null;
  if(groups){
    const renderers=[];for(const group of groups)renderers.push(await prepareCanvasRenderer(group,maxEdge,options));
    const canvas=makeCanvas();canvas.width=Math.round(width/supersample);canvas.height=Math.round(height/supersample);const ctx=canvas.getContext('2d');
    return {canvas,async updateClosed(part){await Promise.all(renderers.map(r=>r.updateClosed(part)));},dispose(){renderers.forEach(r=>r.dispose());dispose();},draw(pose){ctx.clearRect(0,0,width,height);if(project.settings?.background==='white'){ctx.fillStyle='white';ctx.fillRect(0,0,width,height);}for(const renderer of renderers){renderer.draw(pose);ctx.drawImage(renderer.canvas,0,0);}}};
  }
  const rasterSettings={...project.settings,mouthTuning:{...project.settings?.mouthTuning,open:{}},closedWidth:1,mouthOffsetY:0,mouthStyle:'artwork'};
  const textures=await rasterProject(project);
  const scene=new DOMParser().parseFromString(sceneSvg(textures,rasterSettings,false),'image/svg+xml').documentElement;
  const defs=scene.querySelector('defs');
  const ns='http://www.w3.org/2000/svg';
  async function raster(part,pose,markup) {
    const root=document.createElementNS(ns,'svg');root.setAttribute('xmlns',ns);
    root.setAttribute('width',width);root.setAttribute('height',height);
    root.setAttribute('viewBox',`0 0 ${project.width} ${project.height}`);
    if(markup){const group=document.createElementNS(ns,'g');group.innerHTML=markup;root.append(group);}
    else root.append(defs.cloneNode(true),scene.querySelector(`[data-part="${part.id}"]`).cloneNode(true));
    applyPose(root,{sway:0,breathe:0,blinkL:0,blinkR:0,mouth:0,...pose},project,rasterSettings);
    const image=new Image();const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'}));
    image.src=url;
    try{await image.decode();if(disposed)return null;const canvas=makeCanvas();canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0,width,height);return canvas;}
    finally{URL.revokeObjectURL(url);}
  }
  const layers=[];
  for(const part of project.parts.filter(p=>p.visible)) {
    const native=part.role==='mouth'&&part.mouthMode==='source-open'&&!part.openSvgText;
    const layer={part,normal:await raster(part,native?{mouth:1}:{}),native};
    if(part.role.startsWith('iris-')){
      release(layer.normal);
      layer.normal=await raster(part,{},`<g opacity="${part.opacity??1}" transform="translate(${part.x} ${part.y})">${part.svgText}</g>`);
      const white=project.parts.find(p=>p.role==='white-'+part.role.slice(-1)&&p.visible),aperture=white||part;
      const shape=white?white.svgText:`<rect width="${part.width}" height="${part.height}" fill="white"/>`;
      layer.irisMask=await raster(part,{},`<g transform="translate(${aperture.x} ${aperture.y})">${shape}</g>`);
      layer.irisMix=makeCanvas();layer.irisMix.width=width;layer.irisMix.height=height;
    }
    if(native&&part.mouthVariants&&project.settings.vowels){layer.variants={};for(const [key,text] of Object.entries(part.mouthVariants))layer.variants[key]=await raster(part,{},`<g opacity="${part.opacity}" transform="translate(${part.x} ${part.y})">${text}</g>`);layer.variantMix=makeCanvas();layer.variantMix.width=width;layer.variantMix.height=height;}
    if(part.role==='mouth'&&!native&&(part.openSvgText||part.mouthMode==='synthetic'))layer.open=await raster(part,{mouth:1});
    if(part.role.startsWith('lash-'))layer.closed=await raster(part,{blinkL:1,blinkR:1});
    if(native&&part.closedSvgText)layer.closed=await raster(part,{mouth:0});
    if(native&&part.mouthInteriorSvg&&project.settings.vowels){layer.teeth={};for(const k of ['a','i','u','e','o'])layer.teeth[k]=await raster(part,{},`<g opacity="${part.opacity}" transform="translate(${part.x} ${part.y})">${mouthTeethSvg(part,k,project.settings)}</g>`);}
    layers.push(layer);
  }
  const canvas=makeCanvas();canvas.width=width;canvas.height=height;
  // Repaint only the edited eyelid; keep the expensive vector scene cached.
  async function updateClosed(part){
    const layer=layers.find(l=>l.part.id===part.id);if(disposed||!layer?.closed||!part.closedSvgText||!part.role.startsWith('lash-'))return;
    const ticket=layer.updateTicket=(layer.updateTicket||0)+1;
    const texture=await raster(part,{},`<g opacity="${part.opacity??1}" transform="translate(${part.x} ${part.y})">${closedLashArtwork(part)}</g>`);
    if(!texture)return;if(disposed||ticket!==layer.updateTicket){release(texture);return;}
    release(layer.closed);layer.closed=texture;
  }
  const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
  const output=makeCanvas();output.width=width;output.height=height;
  const warped=output.getContext('2d'),triangles=mesh(project);warped.imageSmoothingQuality='high';
  function draw(pose) {
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
    const deform=rigActive(project)||naturalEarsActive(project)||hasSecondaryMesh(project)||!!(pose.chestOffset&&chestRegion(project));
    if(!deform&&project.settings?.background==='white'){ctx.fillStyle='white';ctx.fillRect(0,0,width,height);}
    ctx.scale(scale,scale);
    if(!deform){
    ctx.translate(project.width/2,project.height*.75);ctx.rotate((pose.sway||0)*Math.PI/180);ctx.translate(-project.width/2,-project.height*.75);
    ctx.translate(0,(pose.bounce||0)-(pose.breathe||0));
    }
    const image=(source,opacity=1)=>{ctx.globalAlpha=opacity;ctx.drawImage(source,0,0,project.width,project.height);ctx.globalAlpha=1;};
    for(const {part:p,normal,closed,open,native,teeth,variants,variantMix,irisMask,irisMix} of layers) {
      ctx.save();const motion=partMotion(p,pose,project);
      ctx.translate(motion.x,motion.y);ctx.translate(motion.pivotX,motion.pivotY);ctx.rotate(motion.rotation*Math.PI/180);ctx.translate(-motion.pivotX,-motion.pivotY);
      const face=faceMotion(p,project,pose),cx=p.x+p.width/2,cy=p.y+p.height/2;
      ctx.translate(face.x+cx,face.y+cy);ctx.scale(face.sx,1);ctx.translate(-cx,-cy);
      if(p.role==='mouth')ctx.translate(0,mouthOffset(project.settings,project.width));
      if(p.role==='mouth'&&open&&project.settings.mouthStyle==='anime'){
        image(normal,clamp(1-clamp(pose.mouth)*8));drawAnimeMouth(ctx,p,pose,project.settings);
      }else if(native) {
        const [sx,sy]=mouthScale(pose.mouth,project.settings,pose),cx=p.x+p.width/2,cy=p.y+p.height/2;
        const opacity=closed?nativeMouthOpenOpacity(pose.mouth):1;
        ctx.save();
        ctx.transform(...mouthOpenMatrix(p,pose,project.settings));
        ctx.translate(cx,cy);ctx.scale(sx,sy);ctx.translate(-cx,-cy);
        if(variants){
          const weights=Object.entries(mouthVariantWeights(p,pose,project.settings)).filter(([,w])=>w);
          if(weights.length===1)image(weights[0][0]==='base'?normal:variants[weights[0][0]],opacity);
          else {const mix=variantMix.getContext('2d');mix.clearRect(0,0,width,height);for(const [key,weight] of weights){mix.globalAlpha=weight;mix.drawImage(key==='base'?normal:variants[key],0,0);}mix.globalAlpha=1;image(variantMix,opacity);}
        }else image(normal,opacity);
        if(teeth)for(const [key,texture] of Object.entries(teeth))image(texture,opacity*mouthTeethOpacity(key,pose,project.settings));
        ctx.restore();
        if(closed){ctx.save();ctx.translate(cx,cy);ctx.scale(sx,1);ctx.translate(-cx,-cy);image(closed,1-opacity);ctx.restore();}
      }else if(p.role==='mouth'&&open) {
        const mouth=clamp(pose.mouth);image(normal,clamp(1-mouth*8));
        if(mouth>0){const cx=p.x+p.width/2,cy=p.y+p.height/2,[vx,vy]=vowelScale(pose,project.settings);ctx.save();ctx.translate(cx,cy);ctx.scale(vx,mouth*vy);ctx.translate(-cx,-cy);image(open);ctx.restore();}
      }else if(p.blinkOverlay){
        image(normal,hairLashOpacity(pose,p.blinkOverlay));
      }else if(/^(white|iris|lash)-[lr]$/.test(p.role)) {
        const side=p.role.endsWith('-l')?'l':'r';const blink=clamp(side==='l'?pose.blinkL:pose.blinkR),[ax,ay]=anchor(project,side);
        const closedAmount=closed?clamp((blink-.65)/.25):0;
        const visible=closed?1-closedAmount:1-smooth((blink-.65)/.3);
        if(irisMask){
          const mix=irisMix.getContext('2d');mix.setTransform(1,0,0,1,0,0);mix.clearRect(0,0,width,height);
          const m=irisMotion(p,pose);mix.globalCompositeOperation='source-over';mix.setTransform(scale,0,0,scale,0,0);
          mix.translate(m.cx+m.x,m.cy+m.y);mix.scale(m.scale,m.scale);mix.translate(-m.cx,-m.cy);mix.drawImage(normal,0,0,project.width,project.height);
          mix.globalCompositeOperation='destination-in';mix.setTransform(scale,0,0,scale,0,0);
          mix.translate(ax,ay);mix.scale(1,Math.max(.025,1-blink));mix.translate(-ax,-ay);
          mix.drawImage(irisMask,0,0,project.width,project.height);mix.globalCompositeOperation='source-over';image(irisMix,visible);
        }else{ctx.save();ctx.translate(ax,ay);ctx.scale(1,Math.max(.025,1-blink));ctx.translate(-ax,-ay);image(normal,visible);ctx.restore();}
        if(closedAmount)image(closed,closedAmount);
      }else image(normal);
      ctx.restore();
    }
    warped.setTransform(1,0,0,1,0,0);warped.clearRect(0,0,width,height);
    if(!deform){warped.drawImage(canvas,0,0);return;}
    if(project.settings?.background==='white'){warped.fillStyle='white';warped.fillRect(0,0,width,height);}
    warped.scale(scale,scale);
    warped.translate(project.width/2,project.height*.75);warped.rotate((pose.sway||0)*Math.PI/180);warped.translate(-project.width/2,-project.height*.75);
    warped.translate(0,(pose.bounce||0)-(pose.breathe||0));
    for(const triangle of triangles) {
      warped.save();warped.transform(...triangleMatrix(triangle,project,pose));
      const points=expandedTriangle(triangle);warped.beginPath();points.forEach(([x,y],i)=>i?warped.lineTo(x,y):warped.moveTo(x,y));warped.closePath();warped.clip();
      warped.drawImage(canvas,0,0,project.width,project.height);warped.restore();
    }
  }
  if(supersample>1){
    const resolved=makeCanvas();resolved.width=Math.round(width/supersample);resolved.height=Math.round(height/supersample);const target=resolved.getContext('2d');target.imageSmoothingEnabled=true;target.imageSmoothingQuality='high';
    return {canvas:resolved,dispose,updateClosed,draw(pose){draw(pose);target.clearRect(0,0,resolved.width,resolved.height);target.drawImage(output,0,0,resolved.width,resolved.height);}};
  }
  return {canvas:output,draw,dispose,updateClosed};
}
