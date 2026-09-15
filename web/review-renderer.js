import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {loopPose} from './motion.js?v=mouth-editor-9';
import {pngBlob} from './material-export.js';

export function reviewPoses(settings){
  const still={...loopPose(0,{...settings,irisX:0,irisY:0,irisScale:0,blink:false,talking:false,sway:0,breathe:0,headPitch:0,headYaw:0,headTilt:0,frontHair:0,backHair:0,hair:0,chest:0,ears:0,singleBounce:false}),mouth:1,blinkL:0,blinkR:0};
  return [...[0,.5,.8,1].map(v=>({label:`Eye closure ${v*100}%`,pose:{...still,blinkL:v,blinkR:v}})),
    ...[0,.25,.5,1].map(v=>({label:`Mouth open ${v*100}%`,pose:{...still,mouth:v}})),
    {label:'Both closed',pose:{...still,mouth:0,blinkL:1,blinkR:1}},
    ...Array.from({length:8},(_,i)=>({label:`Motion ${i+1}/8`,pose:loopPose(i*(settings.duration||4)/8,settings)}))];
}
export async function renderCorrectionReview(before,after,{maxEdge=384}={}){
  const snapshots=[before,after].map(p=>{const copy=structuredClone(p);copy.settings={...copy.settings,background:'transparent',vowels:false};return copy;});
  const poses=pairedReviewPoses(snapshots[0].settings,snapshots[1].settings),renderers=[];
  try{
    for(const p of snapshots)renderers.push(await prepareCanvasRenderer(p,maxEdge));
    const scale=Math.min(1,maxEdge/Math.max(before.width,before.height)),w=Math.round(before.width*scale),h=Math.round(before.height*scale);
    // One page per pose avoids a very tall/large canvas. Each page contains whole and face crops.
    const parts=before.parts.filter(p=>/^(mouth|lash-[lr]|white-[lr])$/.test(p.role));
    const rect=parts.length?{x:Math.min(...parts.map(p=>p.x)),y:Math.min(...parts.map(p=>p.y)),
      right:Math.max(...parts.map(p=>p.x+p.width)),bottom:Math.max(...parts.map(p=>p.y+p.height))}:{x:0,y:0,right:before.width,bottom:before.height};
    const pad=Math.max(rect.right-rect.x,rect.bottom-rect.y)*.3;
    const crop={x:Math.max(0,rect.x-pad),y:Math.max(0,rect.y-pad),right:Math.min(before.width,rect.right+pad),bottom:Math.min(before.height,rect.bottom+pad)};
    const pages=[];
    for(const [index,item] of poses.entries()){
      const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=32+h+32+w;
      const ctx=canvas.getContext('2d');ctx.fillStyle=index%2?'#293443':'#f4eee7';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle=index%2?'white':'#222';ctx.font='14px sans-serif';ctx.fillText(`${item.label} | Before / Candidate`,8,21);
      for(let side=0;side<2;side++){
        renderers[side].draw(side?item.candidatePose:item.pose);
        // Freeze the frame before using it twice while the live editor keeps rendering.
        const source=await createImageBitmap(renderers[side].canvas);
        ctx.drawImage(source,side*w,32,w,h);
        const sx=source.width/before.width,sy=source.height/before.height,cw=(crop.right-crop.x)*sx,ch=(crop.bottom-crop.y)*sy;
        const fit=Math.min(w/Math.max(1,cw),w/Math.max(1,ch));
        ctx.drawImage(source,crop.x*sx,crop.y*sy,Math.max(1,cw),Math.max(1,ch),side*w+(w-cw*fit)/2,h+64+(w-ch*fit)/2,cw*fit,ch*fit);
        source.close();
      }
      pages.push({name:`review-${String(index).padStart(2,'0')}.png`,blob:await pngBlob(canvas),label:item.label});
    }
    return {pages,manifest:{version:1,layout:'left=before,right=candidate; top=whole,bottom=face',crop,poses,maxEdge,
      backgrounds:'alternating light/dark by page',live_inputs:false}};
  }finally{for(const renderer of renderers)renderer.dispose();}
}

export function pairedReviewPoses(before,after){const candidate=reviewPoses(after);return reviewPoses(before).map((item,i)=>({...item,candidatePose:candidate[i].pose}));}

export async function renderAssetReference(project){
  const copy=structuredClone(project);copy.settings={...copy.settings,background:'white',vowels:false};
  const renderer=await prepareCanvasRenderer(copy,1024);
  try{renderer.draw(reviewPoses(copy.settings)[0].pose);return {blob:await pngBlob(renderer.canvas),width:renderer.canvas.width,height:renderer.canvas.height};}
  finally{renderer.dispose();}
}

// A single matched face pair for the result dialog; full evidence stays in the review archive.
export async function renderCorrectionPreview(before,after,targets=[]){
  const roles=before.parts.filter(p=>targets.includes(p.id)).map(p=>p.role);
  const mouth=roles.includes('mouth'),eyes=roles.some(r=>/^lash-[lr]$/.test(r));
  const pose=reviewPoses(before.settings)[eyes?(mouth?8:3):4].pose;
  const face=before.parts.filter(p=>/^(mouth|lash-[lr]|white-[lr])$/.test(p.role));
  const bounds=face.length?{left:Math.min(...face.map(p=>p.x)),top:Math.min(...face.map(p=>p.y)),right:Math.max(...face.map(p=>p.x+p.width)),bottom:Math.max(...face.map(p=>p.y+p.height))}:{left:0,top:0,right:before.width,bottom:before.height};
  const pad=Math.max(bounds.right-bounds.left,bounds.bottom-bounds.top)*.3;
  const left=Math.max(0,bounds.left-pad),top=Math.max(0,bounds.top-pad);
  const width=Math.min(before.width,bounds.right+pad)-left,height=Math.min(before.height,bounds.bottom+pad)-top;
  const images=[];
  for(const project of [before,after]){
    const copy=structuredClone(project);copy.settings={...copy.settings,background:'transparent',vowels:false};
    const renderer=await prepareCanvasRenderer(copy,1024);
    try{
      renderer.draw(pose);
      const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.round(480*height/width);
      const ctx=canvas.getContext('2d'),sx=renderer.canvas.width/before.width,sy=renderer.canvas.height/before.height;
      ctx.fillStyle='#f4eee7';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(renderer.canvas,left*sx,top*sy,width*sx,height*sy,0,0,canvas.width,canvas.height);
      images.push(await pngBlob(canvas));
    }finally{renderer.dispose();}
  }
  return images;
}
