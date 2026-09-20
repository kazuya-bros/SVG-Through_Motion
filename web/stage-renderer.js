import {canvasViewport} from './render-viewport.js';
import {captionPages} from './stage-model.js';
import {rigActive,warpPoint} from './rig.js?v=mouth-editor-9';
import {lookAssets} from './broadcast-look.js';

export function createStageRenderer(source,project){
 const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
 canvas.viewport=source.viewport;const viewport=canvasViewport(canvas,project),cw=project.width/viewport.width*canvas.width,ch=project.height/viewport.height*canvas.height;
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,images=new Map();
 let captionKey='',captionAt=0,disposed=false;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function load(id){
  if(!/^[a-f0-9]{32}$/.test(id))return Promise.reject(Error('演出画像IDが不正です'));
  if(images.has(id))return images.get(id).promise;
  const entry={image:null};entry.promise=new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{if(disposed)return reject(Error('出力を終了しました'));entry.image=im;resolve();};im.onerror=()=>reject(Error('演出画像を読み込めません: '+id));im.src='/api/stage/assets/'+id+'/image';});images.set(id,entry);return entry.promise;
 }
 function anchor(o,pose){
  if(o.anchor!=='head')return [(o.x*project.width-viewport.x)*w/viewport.width,(o.y*project.height-viewport.y)*h/viewport.height];
  let x=project.rig?.faceX??project.width*.5,y=project.rig?.faceY??project.height*.32;
  if(rigActive(project))[x,y]=warpPoint(x,y,project,pose);
  return [(x-viewport.x)*w/viewport.width+(pose.sway||0)*cw/project.width+o.x*cw,(y-viewport.y)*h/viewport.height+((pose.breathe||0)+(pose.bounce||0))*ch/project.height+o.y*ch];
 }
 function overlay(o,time,pose){
  const im=images.get(o.asset_id)?.image;if(!im)return;
  let [x,y]=anchor(o,pose),scale=o.scale;
  if(!reduced()){
   if(o.motion==='float')y+=Math.sin(time*1.5)*h*.012;
   if(o.motion==='pulse')scale*=1+Math.sin(time*2)*.06;
   if(o.motion==='orbit'){x+=Math.cos(time)*w*.035;y+=Math.sin(time)*h*.02;}
  }
  const iw=cw*scale,ih=iw*im.height/im.width;ctx.save();ctx.globalAlpha=o.opacity;ctx.translate(x,y);ctx.rotate(o.rotation*Math.PI/180);ctx.drawImage(im,-iw/2,-ih/2,iw,ih);ctx.restore();
 }
 function caption(style,speech,time){
  const text=style.source==='speech'?speech:style.text;
  if(!style.enabled||!text){captionKey='';return;}
  if(captionKey!==text){captionKey=text;captionAt=time;}
  const size=style.size*h/1080,font={sans:'system-ui, sans-serif',serif:'serif',mono:'monospace'}[style.font]||'sans-serif';
  ctx.font=`600 ${size}px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
  const pages=captionPages(text,s=>ctx.measureText(s).width,w*style.width),pageDuration=6;
  const pageIndex=Math.min(pages.length-1,Math.floor(Math.max(0,time-captionAt)/pageDuration));
  const lines=pages[pageIndex]||[],pageTime=Math.max(0,time-captionAt-pageIndex*pageDuration);
  let count=style.reveal==='typewriter'&&!reduced()?Math.floor(pageTime*28):Infinity;
  const lineHeight=size*1.4,total=lines.length*lineHeight,x=style.x*w,y=Math.max(total/2+size,Math.min(h-total/2-size,style.y*h));
  ctx.strokeStyle=style.outline;ctx.fillStyle=style.color;ctx.lineWidth=Math.max(2,size*.14);
  for(let i=0;i<lines.length;i++){const chars=Array.from(lines[i]),part=chars.slice(0,count).join('');count=Math.max(0,count-chars.length);const yy=y+(i-(lines.length-1)/2)*lineHeight;ctx.strokeText(part,x,yy);ctx.fillText(part,x,yy);}
 }
 return {canvas,load,image:id=>images.get(id)?.image,async prepare(scene){await Promise.all([...scene.overlays.map(o=>o.asset_id),...lookAssets(scene.appearance)].map(load));},
  draw(scene,time,pose,speech=''){
   ctx.clearRect(0,0,w,h);for(const o of scene.overlays)if(o.layer==='back')overlay(o,time,pose);
   ctx.drawImage(source,0,0);for(const o of scene.overlays)if(o.layer==='front')overlay(o,time,pose);
   const a=scene.appearance;if((a?.emotion==='image'||a?.emotion_layers?.includes('image'))&&a.emotion_asset_id)overlay({asset_id:a.emotion_asset_id,anchor:'head',x:a.image_x,y:a.image_y,scale:a.image_scale,opacity:a.emotion_strength,rotation:a.image_rotation||0,motion:'still'},time,pose);
   caption(scene.caption,speech,time);
  },clear(){ctx.clearRect(0,0,w,h);},async snapshot(){
   const c=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(w,h));c.width=Math.round(w*scale);c.height=Math.round(h*scale);c.getContext('2d').drawImage(canvas,0,0,c.width,c.height);
   return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('確認画像を作れませんでした')),'image/png'));
  },dispose(){disposed=true;images.clear();canvas.width=canvas.height=1;}};
}
