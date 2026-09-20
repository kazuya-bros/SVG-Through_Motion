// Direct vector frames or legacy deformation grids; no RIFE inference at playback.
import {canonicalSvgText} from './raster-source.js';
import {sanitizeSvg} from './assets.js';
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
export const featureRoles=key=>key==='mouth'?['mouth']:[`white-${key.slice(-1)}`,`iris-${key.slice(-1)}`,`lash-${key.slice(-1)}`];
export function featureSignature(project,key,sourceMode='grid'){
  const roles=featureRoles(key),parts=(project.motionParts||project.parts).filter(p=>roles.includes(p.role));
  const payload=[parts.map(p=>[p.role,p.visible,p.x,p.y,p.width,p.height,p.mouthMode,canonicalSvgText(p.svgText||''),canonicalSvgText(p.closedSvgText||''),canonicalSvgText(p.openSvgText||''),p.lidAdjust]),key==='mouth'?project.settings?.mouthTuning?.closed:null];
  if(sourceMode==='svg-frames')payload.push(parts.map(p=>p.opacity),key==='mouth'?[project.settings?.mouthTuning,project.settings?.closedWidth??.8]:null);
  const text=JSON.stringify(payload);
  let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
export function validateMorph(value){
  if(!value)return undefined;
  if(value.version!==1||!value.features||typeof value.features!=='object')throw Error('RIFE補間データが不正です');
  const features={};
  for(const [key,f] of Object.entries(value.features)){
    if(!['eye-l','eye-r','mouth'].includes(key)||!/^\w{16}$/.test(f.signature||'')||!Array.isArray(f.box)||f.box.length!==4||!f.box.every(v=>Number.isFinite(v)&&Math.abs(v)<=20000)||f.box[2]<=0||f.box[3]<=0||!Number.isFinite(f.anchor)||Math.abs(f.anchor)>10)throw Error('RIFE対象が不正です');
    if(!Array.isArray(f.frames)||f.frames.length!==5)throw Error('RIFE中間形状が不正です');
    const frames=f.frames.map((frame,i)=>{
      if(frame.at!==i/4||!Array.isArray(frame.ys)||frame.ys.length!==10||!frame.ys.every(v=>Number.isFinite(v)&&Math.abs(v)<=10))throw Error('RIFE座標が不正です');
      for(let n=0;n<5;n++)if(frame.ys[n+5]<=frame.ys[n])throw Error('RIFEの形状が反転しています');
      return {at:frame.at,ys:[...frame.ys]};
    });
    const clean={signature:f.signature,box:[...f.box],anchor:f.anchor,frames};
    if(f.sourceMode==='svg-frames')clean.sourceMode='svg-frames';
    if(f.mouthCorrection==='alpha-compact-v1'){
      if(key!=='mouth'||!f.svgFrames)throw Error('口の輪郭補正には8枚SVGが必要です');
      clean.mouthCorrection=f.mouthCorrection;
    }
    if(f.svgFrames){
      if(!Array.isArray(f.svgFrames)||f.svgFrames.length!==8||!Array.isArray(f.svgSize)||f.svgSize.length!==2||!f.svgSize.every(v=>Number.isInteger(v)&&v>=16&&v<=384))throw Error('8枚SVGのサイズが不正です');
      if(f.svgFrames.reduce((n,frame)=>n+(typeof frame.svgText==='string'?frame.svgText.length:2000000),0)>12_000_000)throw Error('8枚SVGの容量が大きすぎます');
      clean.svgSize=[...f.svgSize];
      clean.svgFrames=f.svgFrames.map((frame,i)=>{
        if(!Number.isFinite(frame.at)||Math.abs(frame.at-i/7)>1e-8||typeof frame.svgText!=='string'||frame.svgText.length>2_000_000)throw Error('8枚SVGのコマが不正です');
        if(frame.bounds&&(!Array.isArray(frame.bounds)||frame.bounds.length!==2||!frame.bounds.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||frame.bounds[1]-frame.bounds[0]<1/384))throw Error('8枚SVGの補間範囲が不正です');
        if(frame.profile&&(!Array.isArray(frame.profile)||frame.profile.length!==17||!frame.profile.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>0&&p[1]<1&&p[1]-p[0]>=1/768)))throw Error('口のコマの輪郭が不正です');
        return {at:i/7,svgText:sanitizeSvg(frame.svgText,`rife-${key}-${i}-`),...(frame.bounds?{bounds:[...frame.bounds]}:{}),...(frame.profile?{profile:frame.profile.map(p=>[...p])}:{})};
      });
      if(clean.mouthCorrection&&clean.svgFrames.some(frame=>!frame.profile))throw Error('口の輪郭データが不足しています。再生成してください');
    }
    features[key]=clean;
  }
  return {version:1,features};
}
let cache=new WeakMap();
export function activeFeature(project,key,settings=project.settings||{}){
  if(settings.rifeDisabled||settings[key==='mouth'?'rifeMouth':'rifeEyes']!==true)return null;
  const f=project.rifeMorph?.features?.[key];if(!f)return null;
  // The caller prepares a new scene on edits. Cache only for that scene instance.
  let entries=cache.get(project);if(!entries){entries={};cache.set(project,entries);}
  if(!entries[key]||entries[key].feature!==f)entries[key]={feature:f,valid:featureSignature(project,key,f.sourceMode)===f.signature};
  return entries[key].valid?f:null;
}
export function invalidateMorph(){cache=new WeakMap();}
export const mouthPlaybackMode=settings=>['grid','stable'].includes(settings?.rifeMouthMode)?settings.rifeMouthMode:'svg-frames';
const stableMouthCache=new WeakMap();
export function stableMouthFeature(feature){
  if(stableMouthCache.has(feature))return stableMouthCache.get(feature);
  // Keep source artwork opaque. RIFE contributes a bounded shape residual only;
  // baked transparent frames cannot create a solid opening from a closed line.
  const frames=feature.frames.map(frame=>{const t=frame.at,scale=.045+.955*t,limit=.04*Math.sin(Math.PI*t);
    return {at:t,ys:frame.ys.map((v,n)=>{const base=feature.anchor+((n<5?0:1)-feature.anchor)*scale;return base+Math.max(-limit,Math.min(limit,v-base));})};});
  const corrected={...feature,frames};stableMouthCache.set(feature,corrected);return corrected;
}
export function activeSequence(project,key,settings=project.settings||{}){
  const f=activeFeature(project,key,settings),mode=key==='mouth'?mouthPlaybackMode(settings):settings.rifeEyesMode;
  return !project.rifeSequencesDisabled&&f?.svgFrames?.length===8&&mode!=='grid'&&mode!=='stable'?f:null;
}
export function activeGrid(project,key,settings=project.settings||{}){
  if(settings.rifeStrength===0||activeSequence(project,key,settings))return null;
  const f=activeFeature(project,key,settings);
  return f&&key==='mouth'&&mouthPlaybackMode(settings)==='stable'&&(f.svgFrames||settings.rifeMouthMode==='stable')?stableMouthFeature(f):f;
}
export const sequenceIndex=value=>Math.round(clamp(value)*7);
export function idleEyeWeight(value){const t=clamp(clamp(value)/.22);return 1-t*t*(3-2*t);}
export function idleEyeProject(project,key,crop=false){
  const f=project.rifeMorph.features[key],roles=featureRoles(key),[x,y,w,h]=f.box;
  return {...project,rig:null,rifeMorph:null,motionParts:undefined,renderGroup:true,eyeThroughPass:true,
    width:crop?w:project.width,height:crop?h:project.height,
    parts:(project.motionParts||project.parts).filter(p=>p.visible&&roles.includes(p.role)).map(p=>({...p,x:p.x-(crop?x:0),y:p.y-(crop?y:0),deformGroup:null})),
    settings:{...project.settings,rifeDisabled:true,rigEnabled:false,eyeThroughHair:false,background:'transparent'}};
}
export function idleEyePose(pose,key){return {irisX:pose.irisX,irisY:pose.irisY,irisScale:pose.irisScale,blinkL:key==='eye-l'?pose.blinkL:0,blinkR:key==='eye-r'?pose.blinkR:0};}
export function mouthSequenceCrop(project){
 const original=project.rifeMorph.features.mouth,[x,y,w,h]=original.box;
 const scene={...project,width:w,height:h,rig:null,motionParts:undefined,renderGroup:true,eyeThroughPass:true,
  parts:project.parts.filter(p=>p.role==='mouth').map(p=>({...p,x:p.x-x,y:p.y-y,deformGroup:null})),
  settings:{...project.settings,rigEnabled:false,eyeThroughHair:false,background:'transparent',mouthOffsetY:0}};
 const feature={...original,box:[0,0,w,h],signature:featureSignature(scene,'mouth',original.sourceMode)};
 scene.rifeMorph={version:1,features:{mouth:feature}};return scene;
}
const blendCache=new WeakMap();
export function sequenceBlend(feature,value){
  const cached=blendCache.get(feature);if(cached&&cached.value===value)return cached.entries;
  const t=clamp(value)*7,a=Math.min(6,Math.floor(t)),u=t-a,b=a+1;
  const left=feature.svgFrames[a].bounds,right=feature.svgFrames[b].bounds;
  const target=left&&right?left.map((v,i)=>v*(1-u)+right[i]*u):null;
  const profiles=feature.mouthCorrection&&feature.svgFrames[a].profile&&feature.svgFrames[b].profile;
  const targetProfile=profiles?feature.svgFrames[a].profile.map((p,i)=>p.map((v,j)=>v*(1-u)+feature.svgFrames[b].profile[i][j]*u)):null;
  const entries=[[a,1-u],[b,u]].filter(([,weight])=>weight>1e-12).map(([index,weight])=>{
    const bounds=feature.svgFrames[index].bounds;
    const scale=target?(target[1]-target[0])/(bounds[1]-bounds[0]):1;
    return {index,weight,scale:profiles?1:scale,offset:profiles?0:target?target[0]-bounds[0]*scale:0,...(profiles?{targetProfile}:{})};
  });
  blendCache.set(feature,{value,entries});return entries;
}
// Piecewise affine correspondence of neighboring RIFE contours. The padding rows
// preserve every pixel and all eight exact SVG keys; only the in-between is warped.
export function sequenceMesh(feature,entry){
  if(!entry.targetProfile)return null;if(entry.mesh)return entry.mesh;
  const source=feature.svgFrames[entry.index].profile,target=entry.targetProfile,triangles=[];
  for(let col=0;col<16;col++)for(let row=0;row<3;row++){
    const point=(profile,c,r)=>[c/16,r===0?0:r===3?1:profile[c][r-1]];
    for(const ids of [[[col,row],[col+1,row],[col,row+1]],[[col+1,row],[col+1,row+1],[col,row+1]]]){
      const p=ids.map(([c,r])=>point(source,c,r)),q=ids.map(([c,r])=>point(target,c,r));
      const ux=p[1][0]-p[0][0],uy=p[1][1]-p[0][1],vx=p[2][0]-p[0][0],vy=p[2][1]-p[0][1],det=ux*vy-uy*vx;
      const ey=q[1][1]-q[0][1],fy=q[2][1]-q[0][1],b=(ey*vy-fy*uy)/det,d=(fy*ux-ey*vx)/det;
      triangles.push({points:p,b,d,f:q[0][1]-b*p[0][0]-d*p[0][1]});
    }
  }
  entry.mesh=triangles;return triangles;
}
export function sequencePart(project,part,settings=project.settings||{}){
  const key=part.role==='mouth'?'mouth':/^(white|iris|lash)-[lr]$/.test(part.role)?'eye-'+part.role.slice(-1):null;
  const feature=key&&activeSequence(project,key,settings);if(!feature)return null;
  const roles=featureRoles(key),owner=(project.motionParts||project.parts).filter(p=>p.visible&&roles.includes(p.role)).at(-1);
  return {key,feature,owner:owner?.id===part.id};
}
export function sequenceFrameMarkup(f,index){const [x,y,w,h]=f.box;return `<g transform="translate(${x} ${y}) scale(${w/f.svgSize[0]} ${h/f.svgSize[1]})">${f.svgFrames[index].svgText}</g>`;}
export function sequenceSvg(f,key){return `<g style="isolation:isolate">`+f.svgFrames.map((_,i)=>{
  let body;
  if(f.mouthCorrection){
    const entry={index:i,targetProfile:f.svgFrames[i].profile},mesh=sequenceMesh(f,entry),id=`rife-contour-${key}-${i}`;
    body=`<g transform="translate(${f.box[0]} ${f.box[1]}) scale(${f.box[2]} ${f.box[3]})"><defs><g id="${id}-art" transform="scale(${1/f.svgSize[0]} ${1/f.svgSize[1]})">${f.svgFrames[i].svgText}</g>`+
      mesh.map((t,n)=>`<clipPath id="${id}-${n}" clipPathUnits="userSpaceOnUse"><polygon points="${t.points.map(p=>p.join(',')).join(' ')}"/></clipPath>`).join('')+'</defs>'+
      mesh.map((_,n)=>`<g style="mix-blend-mode:plus-lighter" data-channel="rife-contour:${key}:${i}:${n}:shift"><g data-channel="rife-contour:${key}:${i}:${n}:skew"><g data-channel="rife-contour:${key}:${i}:${n}:scale"><g clip-path="url(#${id}-${n})"><use href="#${id}-art"/></g></g></g></g>`).join('')+'</g>';
  }else body=`<g data-channel="rife-align:${key}:${i}:shift"><g data-channel="rife-align:${key}:${i}:scale">${sequenceFrameMarkup(f,i)}</g></g>`;
  return `<g style="mix-blend-mode:plus-lighter" data-channel="rife-frame:${key}:${i}" opacity="${i===0?1:0}">${body}</g>`;
}).join('')+'</g>';}
export function sampleMorph(f,key,value,strength=1){
  const t=clamp(value),i=Math.min(3,Math.floor(t*4)),u=t*4-i,a=f.frames[i].ys,b=f.frames[i+1].ys;
  const scale=key==='mouth'?.045+.955*t:Math.max(.025,1-t),k=clamp(strength);
  return a.map((v,n)=>{const original=f.anchor+((n<5?0:1)-f.anchor)*scale;return original+(v+(b[n]-v)*u-original)*k;});
}
export function morphTriangles(f,key,value,strength=1){
  const [x,y,w,h]=f.box,ys=sampleMorph(f,key,value,strength),result=[];
  for(let col=0;col<4;col++){
    const l=x+w*col/4,r=x+w*(col+1)/4;
    const tl=y+h*ys[col],tr=y+h*ys[col+1],bl=y+h*ys[col+5],br=y+h*ys[col+6];
    for(const lower of [false,true]){
      const d=(lower?br-tr:bl-tl)/h,b=(lower?br-bl:tr-tl)/(r-l),f0=(lower?br:tl)-b*(lower?r:l)-d*(lower?y+h:y);
      result.push({points:lower?[[r,y],[r,y+h],[l,y+h]]:[[l,y],[r,y],[l,y+h]],b,d,f:f0});
    }
  }
  return result;
}
export function morphSvg(content,project,key,id,settings){
  const feature=activeGrid(project,key,settings);if(!feature)return null;
  const triangles=morphTriangles(feature,key,key==='mouth'?1:0);
  return `<defs><g id="${id}-art">${content}</g>${triangles.map((t,i)=>`<clipPath id="${id}-clip-${i}" clipPathUnits="userSpaceOnUse"><polygon points="${t.points.map(p=>p.join(',')).join(' ')}"/></clipPath>`).join('')}</defs>`+
    triangles.map((_,i)=>`<g data-channel="rife:${key}:${i}:shift"><g data-channel="rife:${key}:${i}:skew"><g data-channel="rife:${key}:${i}:scale"><g clip-path="url(#${id}-clip-${i})"><use href="#${id}-art"/></g></g></g></g>`).join('');
}
export function drawMorph(ctx,texture,project,feature,key,value,strength=1){
  if(clamp(value)===0||clamp(value)===1||strength===0){const t=morphTriangles(feature,key,value,0)[0];ctx.save();ctx.transform(1,t.b,0,t.d,0,t.f);ctx.drawImage(texture,0,0,project.width,project.height);ctx.restore();return;}
  for(const t of morphTriangles(feature,key,value,strength)){
    ctx.save();ctx.transform(1,t.b,0,t.d,0,t.f);ctx.beginPath();t.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ctx.drawImage(texture,0,0,project.width,project.height);ctx.restore();
  }
}
