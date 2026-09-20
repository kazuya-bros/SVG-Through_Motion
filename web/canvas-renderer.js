import {tailEnabled} from './accessory-targets.js';
import {scanCanvasBounds,copyCanvasBounds} from './canvas-bounds.js';
import {createClothTextureWarp} from './cloth-texture-warp.js';
import {headAttachment} from './face-rig.js';
import {retireClothingLinks} from './motion-links.js';
import {padMesh} from './render-viewport.js';
import {activeGrid,sequencePart,sequenceBlend,sequenceMesh,drawMorph,idleEyeWeight,idleEyeProject,idleEyePose} from './rife-morph.js';
import {hasSecondaryMesh,motionFrame} from './secondary-motion.js';
import {naturalEarsActive} from './natural-ears.js';
import {earEnabled} from './idle-expression.js';
import {rasterProject} from './raster-source.js';
import {chestRegion} from './chest-motion.js';
import {drawAnimeMouth,mouthOffset} from './anime-mouth.js';
import {sceneSvg,applyPose,anchor,clamp,smooth,partMotion,mouthScale,hairLashOpacity,nativeMouthOpenOpacity,irisMotion} from './motion.js?v=mouth-editor-9';
import {rigActive,faceMotion,mesh,triangleMatrix,expandedTriangle,rigGroups,rigidLinkMatrix,deformationBatches} from './rig.js?v=mouth-editor-9';
import {ensureSeamRig} from './seam-rig.js';
import {vowelScale} from './vowels.js';
import {mouthOpenMatrix,mouthTeethSvg,mouthTeethOpacity} from './mouth-controls.js';
import {closedLashArtwork} from './eyelid-controls.js';
import {mouthVariantWeights} from './mouth-variants.js';
import {eyeThroughPasses,eyeThroughStrength} from './eye-through-hair.js';

// Render vector assets once at output resolution; animate their transforms on canvas.
// This avoids reparsing tens of thousands of paths on every recorded video frame.
export async function prepareCanvasRenderer(project, maxEdge=1024, options={}) {
  const copy=(ctx,...args)=>options.croppedCompositing?copyCanvasBounds(ctx,...args):ctx.drawImage(...args);
  const resetBounds=canvas=>{if(options.croppedCompositing)canvas.contentBounds=null;};
  const fullBounds=canvas=>{if(options.croppedCompositing)canvas.contentBounds=undefined;};
  retireClothingLinks(project);
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
      pose=motionFrame(pose);renderers.forEach(r=>r.draw(pose));resetBounds(canvas);ctx.clearRect(0,0,canvas.width,canvas.height);copy(ctx,base.canvas,0,0);
      mask.clearRect(0,0,mix.width,mix.height);mask.globalCompositeOperation='source-over';mask.drawImage(lashes.canvas,0,0);mask.globalCompositeOperation='destination-in';mask.drawImage(hair.canvas,0,0);mask.globalCompositeOperation='source-over';
      ctx.globalAlpha=eyeThroughStrength(project.settings);copy(ctx,mix,0,0);ctx.globalAlpha=1;
    }};
  }
  const buffers=[],idleRenderers=[],clothWarps=[];let disposed=false;
  const makeCanvas=()=>{const canvas=document.createElement('canvas');buffers.push(canvas);return canvas;};
  const release=canvas=>{if(!canvas)return;canvas.width=canvas.height=1;const i=buffers.indexOf(canvas);if(i>=0)buffers.splice(i,1);};
  const dispose=()=>{disposed=true;for(const warp of clothWarps)warp.dispose();for(const renderer of idleRenderers)renderer.dispose();idleRenderers.length=0;for(const canvas of buffers)canvas.width=canvas.height=1;buffers.length=0;};
  const supersample=Math.max(1,Math.min(options.supersample||1,2160/maxEdge));
  const scale=Math.min(options.allowUpscale?Infinity:1,maxEdge/project.width,maxEdge/project.height)*supersample;
  const width=Math.round(project.width*scale),height=Math.round(project.height*scale);
  const pad=Math.max(0,options.outputPadding||0),px=Math.ceil(pad*scale),fullWidth=width+px*2,fullHeight=height+px*2;
  const sourceBox=[-px/scale,-px/scale,fullWidth/scale,fullHeight/scale];
  const groups=rigActive(project)||chestRegion(project)||project.parts.some(p=>earEnabled(p)||tailEnabled(p))||hasSecondaryMesh(project)?rigGroups(project):null;
  if(groups){
    const renderers=[];for(const group of groups)renderers.push(await prepareCanvasRenderer(group,maxEdge,options));
    const canvas=makeCanvas();canvas.width=Math.round(fullWidth/supersample);canvas.height=Math.round(fullHeight/supersample);const ctx=canvas.getContext('2d');
    return {canvas,async updateClosed(part){await Promise.all(renderers.map(r=>r.updateClosed(part)));},dispose(){renderers.forEach(r=>r.dispose());dispose();},draw(pose){pose=motionFrame(pose);resetBounds(canvas);ctx.clearRect(0,0,canvas.width,canvas.height);if(project.settings?.background==='white'){ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);fullBounds(canvas);}for(const renderer of renderers){renderer.draw(pose);copy(ctx,renderer.canvas,0,0);}}};
  }
  const rasterSettings={...project.settings,rifeDisabled:true,mouthTuning:{...project.settings?.mouthTuning,open:{}},closedWidth:1,mouthOffsetY:0,mouthStyle:'artwork'};
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
    try{await image.decode();if(disposed)return null;const canvas=makeCanvas();canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0,width,height);return options.croppedCompositing?scanCanvasBounds(canvas):canvas;}
    finally{URL.revokeObjectURL(url);}
  }
  const layers=[];
  for(const part of project.parts.filter(p=>p.visible)) {
    const sequence=sequencePart(project,part);
    if(sequence){
      if(!sequence.owner)continue;
      const frames=[],f=sequence.feature;
      for(const frame of f.svgFrames){
        const image=new Image(),url=URL.createObjectURL(new Blob([frame.svgText],{type:'image/svg+xml'}));image.src=url;
        try{await image.decode();const canvas=makeCanvas();canvas.width=Math.max(1,Math.ceil(f.box[2]*scale));canvas.height=Math.max(1,Math.ceil(f.box[3]*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);frames.push(canvas);}
        finally{URL.revokeObjectURL(url);}
      }
      const sequenceMix=makeCanvas();sequenceMix.width=frames[0].width;sequenceMix.height=frames[0].height;
      let idleRenderer=null;
      if(sequence.key!=='mouth'){
        const idle=idleEyeProject(project,sequence.key,true);
        idleRenderer=await prepareCanvasRenderer(idle,Math.max(idle.width,idle.height)*scale,{allowUpscale:true});idleRenderers.push(idleRenderer);
      }
      layers.push({part,sequence,sequenceFrames:frames,sequenceMix,idleRenderer});continue;
    }
    const native=part.role==='mouth'&&part.mouthMode==='source-open'&&!part.openSvgText;
    const key=part.role==='mouth'?'mouth':`eye-${part.role.slice(-1)}`;
    const layer={part,normal:await raster(part,native?{mouth:1}:{}),native,morph:activeGrid(project,key),morphKey:key};
    if(options.clothScanlines!==false&&project.parts.length===1&&part.role==='static'&&!part.followPart&&!part.motionLink&&!part.faceBase&&!headAttachment(part)&&!earEnabled(part)&&!/^face$|顔の下地/i.test(part.sourceLayerName||part.name||'')&&part.secondaryMotion?.region&&(!part.secondaryMotion.direction||part.secondaryMotion.direction==='horizontal')){layer.clothWarp=createClothTextureWarp(layer.normal,part,project);clothWarps.push(layer.clothWarp);}
    if(part.role.startsWith('iris-')){
      release(layer.normal);
      layer.normal=await raster(part,{},`<g opacity="${part.opacity??1}" transform="translate(${part.x} ${part.y})">${part.svgText}</g>`);
      const white=project.parts.find(p=>p.role==='white-'+part.role.slice(-1)&&p.visible),aperture=white||part;
      const shape=white?white.svgText:`<rect width="${part.width}" height="${part.height}" fill="white"/>`;
      layer.irisMask=await raster(part,{},`<g transform="translate(${aperture.x} ${aperture.y})">${shape}</g>`);
      layer.irisMix=makeCanvas();layer.irisMix.width=width;layer.irisMix.height=height;
      if(layer.morph){layer.morphMask=makeCanvas();layer.morphMask.width=width;layer.morphMask.height=height;}
    }
    if(native&&part.mouthVariants&&project.settings.vowels){layer.variants={};for(const [key,text] of Object.entries(part.mouthVariants))layer.variants[key]=await raster(part,{},`<g opacity="${part.opacity}" transform="translate(${part.x} ${part.y})">${text}</g>`);layer.variantMix=makeCanvas();layer.variantMix.width=width;layer.variantMix.height=height;}
    if(part.role==='mouth'&&!native&&(part.openSvgText||part.mouthMode==='synthetic'))layer.open=await raster(part,{mouth:1});
    if(part.role.startsWith('lash-'))layer.closed=await raster(part,{blinkL:1,blinkR:1});
    if(native&&part.closedSvgText)layer.closed=await raster(part,{mouth:0});
    if(native&&part.mouthInteriorSvg&&project.settings.vowels){layer.teeth={};for(const k of ['a','i','u','e','o'])layer.teeth[k]=await raster(part,{},`<g opacity="${part.opacity}" transform="translate(${part.x} ${part.y})">${mouthTeethSvg(part,k,project.settings)}</g>`);}
    layers.push(layer);
  }
  const canvas=makeCanvas();canvas.width=fullWidth;canvas.height=fullHeight;
  // Repaint only the edited eyelid; keep the expensive vector scene cached.
  async function updateClosed(part){
    const layer=layers.find(l=>l.part.id===part.id);if(disposed||!layer?.closed||!part.closedSvgText||!part.role.startsWith('lash-'))return;
    const ticket=layer.updateTicket=(layer.updateTicket||0)+1;
    const texture=await raster(part,{},`<g opacity="${part.opacity??1}" transform="translate(${part.x} ${part.y})">${closedLashArtwork(part)}</g>`);
    if(!texture)return;if(disposed||ticket!==layer.updateTicket){release(texture);return;}
    release(layer.closed);layer.closed=texture;
  }
  const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
  const output=makeCanvas();output.width=fullWidth;output.height=fullHeight;
  const meshProject=clothWarps.length?{...project,parts:project.parts.map(p=>({...p,secondaryMotion:undefined,name:'',sourceLayerName:''}))}:project;
  const warped=output.getContext('2d'),rawTriangles=padMesh(mesh(meshProject),project,px/scale);
  // Static clothing/body groups have no local texture motion: discard empty cells.
  // Keep a margin for facial parallax and clipping overlap. Other roles keep the full mesh.
  const bounded=hasSecondaryMesh(project)&&project.parts.every(p=>p.role==='static'&&!p.followPart&&!p.faceOverlay&&!p.blinkOverlay);
  const triangles=bounded?rawTriangles.filter(t=>project.parts.some(p=>p.visible&&Math.max(...t.map(v=>v[0]))>=p.x-32&&Math.min(...t.map(v=>v[0]))<=p.x+p.width+32&&Math.max(...t.map(v=>v[1]))>=p.y-32&&Math.min(...t.map(v=>v[1]))<=p.y+p.height+32)):rawTriangles;
  const clips=triangles.map(t=>expandedTriangle(t));warped.imageSmoothingQuality='high';
  function draw(pose) {
    pose=motionFrame(pose);resetBounds(canvas);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,fullWidth,fullHeight);
    const deform=rigActive(project)||naturalEarsActive(project)||hasSecondaryMesh(project)||!!(pose.chestOffset&&chestRegion(project));
    if(!deform&&project.settings?.background==='white'){ctx.fillStyle='white';ctx.fillRect(0,0,fullWidth,fullHeight);fullBounds(canvas);}
    ctx.translate(px,px);
    ctx.scale(scale,scale);
    if(!deform){
    ctx.translate(project.width/2,project.height*.75);ctx.rotate((pose.sway||0)*Math.PI/180);ctx.translate(-project.width/2,-project.height*.75);
    ctx.translate(0,(pose.bounce||0)-(pose.breathe||0));
    }
    const image=(source,opacity=1)=>{ctx.globalAlpha=opacity;copy(ctx,source,...(source.sourceBox||[0,0,project.width,project.height]));ctx.globalAlpha=1;};
    for(const {part:p,normal:baseNormal,clothWarp,closed,open,native,teeth,variants,variantMix,irisMask,irisMix,morph,morphKey,sequence,sequenceFrames,sequenceMix,idleRenderer} of layers) {
      if(options.onlyPart&&options.onlyPart!==p.id)continue;
      const warpedNormal=clothWarp?clothWarp.draw(pose):baseNormal,normal=warpedNormal&&options.texture?options.texture(warpedNormal,p,project):warpedNormal;
      ctx.save();const motion=partMotion(p,pose,project);
      ctx.translate(motion.x,motion.y);ctx.translate(motion.pivotX,motion.pivotY);ctx.rotate(motion.rotation*Math.PI/180);ctx.translate(-motion.pivotX,-motion.pivotY);
      const face=faceMotion(p,project,pose),cx=p.x+p.width/2,cy=p.y+p.height/2;
      ctx.translate(face.x+cx,face.y+cy);ctx.scale(face.sx,1);ctx.translate(-cx,-cy);
      if(p.role==='mouth')ctx.translate(0,mouthOffset(project.settings,project.width));
      if(sequence){
        const value=sequence.key==='mouth'?pose.mouth:sequence.key==='eye-l'?pose.blinkL:pose.blinkR;
        const idleWeight=idleRenderer?idleEyeWeight(value):0;
        if(idleWeight>0)idleRenderer.draw(idleEyePose(pose,sequence.key));
        const entries=sequenceBlend(sequence.feature,value);
        if(idleWeight===1)copy(ctx,idleRenderer.canvas,...sequence.feature.box);
        else if(entries.length===1&&idleWeight===0)copy(ctx,sequenceFrames[entries[0].index],...sequence.feature.box);
        else {
          const mix=sequenceMix.getContext('2d');mix.setTransform(1,0,0,1,0,0);mix.clearRect(0,0,sequenceMix.width,sequenceMix.height);
          // Add premultiplied colors in an isolated buffer: source-over would
          // turn two opaque half-weight frames into a translucent 75% result.
          mix.globalCompositeOperation='lighter';
            for(const entry of entries){
              mix.globalAlpha=entry.weight*(1-idleWeight);const mesh=sequenceMesh(sequence.feature,entry);
              if(mesh){
                const w=sequenceMix.width,h=sequenceMix.height;
                for(const t of mesh){mix.save();mix.setTransform(w,h*t.b,0,h*t.d,0,h*t.f);mix.beginPath();t.points.forEach(([x,y],i)=>i?mix.lineTo(x,y):mix.moveTo(x,y));mix.closePath();mix.clip();mix.drawImage(sequenceFrames[entry.index],0,0,1,1);mix.restore();}
              }else {mix.setTransform(1,0,0,entry.scale,0,entry.offset*sequenceMix.height);mix.drawImage(sequenceFrames[entry.index],0,0);}
            }
          if(idleWeight>0){mix.globalAlpha=idleWeight;mix.setTransform(1,0,0,1,0,0);mix.drawImage(idleRenderer.canvas,0,0,sequenceMix.width,sequenceMix.height);}
          mix.globalAlpha=1;mix.setTransform(1,0,0,1,0,0);copy(ctx,sequenceMix,...sequence.feature.box);
        }
      }else if(p.role==='mouth'&&open&&project.settings.mouthStyle==='anime'){
        image(normal,clamp(1-clamp(pose.mouth)*8));drawAnimeMouth(ctx,p,pose,project.settings);fullBounds(canvas);
      }else if(native) {
        const [sx,sy]=mouthScale(pose.mouth,project.settings,pose),cx=p.x+p.width/2,cy=p.y+p.height/2;
        const opacity=closed?nativeMouthOpenOpacity(pose.mouth):1;
        ctx.save();
        ctx.transform(...mouthOpenMatrix(p,pose,project.settings));
        ctx.translate(cx,cy);ctx.scale(sx,morph?sy/(.045+.955*clamp(pose.mouth)):sy);ctx.translate(-cx,-cy);
        if(variants){
          const weights=Object.entries(mouthVariantWeights(p,pose,project.settings)).filter(([,w])=>w);
          if(weights.length===1)image(weights[0][0]==='base'?normal:variants[weights[0][0]],opacity);
          else {const mix=variantMix.getContext('2d');mix.clearRect(0,0,width,height);for(const [key,weight] of weights){mix.globalAlpha=weight;mix.drawImage(key==='base'?normal:variants[key],0,0);}mix.globalAlpha=1;image(variantMix,opacity);}
        }else if(morph){ctx.globalAlpha=opacity;drawMorph(ctx,normal,project,morph,morphKey,pose.mouth,project.settings.rifeStrength??1);fullBounds(canvas);ctx.globalAlpha=1;}else image(normal,opacity);
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
        const closedAmount=closed?clamp(morph?(blink-.88)/.12:(blink-.65)/.25):0;
        const visible=closed?1-closedAmount:1-smooth(morph?(blink-.88)/.12:(blink-.65)/.3);
        if(irisMask){
          const mix=irisMix.getContext('2d');mix.setTransform(1,0,0,1,0,0);mix.clearRect(0,0,width,height);
          const m=irisMotion(p,pose);mix.globalCompositeOperation='source-over';mix.setTransform(scale,0,0,scale,0,0);
          mix.translate(m.cx+m.x,m.cy+m.y);mix.scale(m.scale,m.scale);mix.translate(-m.cx,-m.cy);mix.drawImage(normal,0,0,project.width,project.height);
          mix.globalCompositeOperation='destination-in';mix.setTransform(scale,0,0,scale,0,0);
          if(morph){
            // Build the entire aperture before destination-in: applying that
            // operator once per triangle would erase the previous triangles.
            const maskCanvas=layers.find(l=>l.part===p).morphMask;
            const mask=maskCanvas.getContext('2d');mask.setTransform(1,0,0,1,0,0);mask.clearRect(0,0,width,height);mask.setTransform(scale,0,0,scale,0,0);
            drawMorph(mask,irisMask,project,morph,morphKey,blink,project.settings.rifeStrength??1);mix.drawImage(maskCanvas,0,0,project.width,project.height);
          }else{mix.translate(ax,ay);mix.scale(1,Math.max(.025,1-blink));mix.translate(-ax,-ay);mix.drawImage(irisMask,0,0,project.width,project.height);}
          mix.globalCompositeOperation='source-over';image(irisMix,visible);
        }else if(morph){ctx.globalAlpha=visible;drawMorph(ctx,normal,project,morph,morphKey,blink,project.settings.rifeStrength??1);fullBounds(canvas);ctx.globalAlpha=1;}
        else{ctx.save();ctx.translate(ax,ay);ctx.scale(1,Math.max(.025,1-blink));ctx.translate(-ax,-ay);image(normal,visible);ctx.restore();}
        if(closedAmount)image(closed,closedAmount);
      }else image(normal);
      ctx.restore();
    }
    resetBounds(output);warped.setTransform(1,0,0,1,0,0);warped.clearRect(0,0,fullWidth,fullHeight);
    if(!deform){copy(warped,canvas,0,0);return;}
    if(project.settings?.background==='white'){warped.fillStyle='white';warped.fillRect(0,0,fullWidth,fullHeight);fullBounds(output);}
    warped.translate(px,px);
    warped.scale(scale,scale);
    warped.translate(project.width/2,project.height*.75);warped.rotate((pose.sway||0)*Math.PI/180);warped.translate(-project.width/2,-project.height*.75);
    warped.translate(0,(pose.bounce||0)-(pose.breathe||0));
    if(project.parts.length===1&&project.parts[0].motionLink&&['rigid','attachment'].includes(project.parts[0].motionLinkMode)){
      warped.transform(...rigidLinkMatrix(project,pose));copy(warped,canvas,...sourceBox);return;
    }
    for(const batch of deformationBatches(triangles,project,clothWarps.length?{...pose,skipClothRegion:true}:pose)) {
      warped.save();warped.transform(...batch.matrix);warped.beginPath();
      for(const i of batch.indices){const points=clips[i];points.forEach(([x,y],j)=>j?warped.lineTo(x,y):warped.moveTo(x,y));warped.closePath();}
      warped.clip();copy(warped,canvas,...sourceBox);warped.restore();
    }
  }
  if(supersample>1){
    const resolved=makeCanvas();resolved.width=Math.round(fullWidth/supersample);resolved.height=Math.round(fullHeight/supersample);const target=resolved.getContext('2d');target.imageSmoothingEnabled=true;target.imageSmoothingQuality='high';
    return {canvas:resolved,dispose,updateClosed,draw(pose){draw(pose);resetBounds(resolved);target.clearRect(0,0,resolved.width,resolved.height);copy(target,output,0,0,resolved.width,resolved.height);}};
  }
  return {canvas:output,draw,dispose,updateClosed};
}

