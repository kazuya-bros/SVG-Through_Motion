import {canvasViewport} from './render-viewport.js';
import {effectFrame,effectNoise,dissolveThreshold,smoothEffect} from './character-effects.js';
import {warpPoint,rigActive} from './rig.js?v=mouth-editor-9';

// Effects use the rendered silhouette/color, so edited SVG and source-art modes agree.
// Bounded particles and small alpha masks; never create one DOM element per particle.
export function createCharacterEffectsRenderer(source,project){
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  canvas.viewport=source.viewport;const viewport=canvasViewport(canvas,project),cw=project.width/viewport.width*canvas.width,ch=project.height/viewport.height*canvas.height;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const mask=document.createElement('canvas'),maskScale=192/Math.max(w,h);mask.width=Math.max(1,Math.round(w*maskScale));mask.height=Math.max(1,Math.round(h*maskScale));
  const mctx=mask.getContext('2d',{willReadFrequently:true}),pixels=mctx.createImageData(mask.width,mask.height);
  const work=document.createElement('canvas');work.width=w;work.height=h;const wc=work.getContext('2d');
  let sampled=null,particles=[],disposed=false;
  const ink=document.createElement('canvas');ink.width=Math.max(1,Math.round(w*Math.min(1,640/Math.max(w,h))));ink.height=Math.max(1,Math.round(h*Math.min(1,640/Math.max(w,h))));const ic=ink.getContext('2d',{willReadFrequently:true});let inkAt=-Infinity,inkId='';
  const vector=d=>({left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[d]||[1,0]);
  function reveal(p,d){p=Math.max(0,Math.min(1,p));ctx.beginPath();if(d==='left')ctx.rect(w*(1-p),0,w*p,h);else if(d==='up')ctx.rect(0,h*(1-p),w,h*p);else if(d==='down')ctx.rect(0,0,w,h*p);else ctx.rect(0,0,w*p,h);ctx.clip();}
  function inkAppear(f){
    if(f.reduced){ctx.globalAlpha=smoothEffect(f.progress);ctx.drawImage(source,0,0);ctx.globalAlpha=1;return;}
    if(inkId!==f.request_id||f.elapsed-inkAt>.1){inkId=f.request_id;inkAt=f.elapsed;ic.clearRect(0,0,ink.width,ink.height);ic.drawImage(source,0,0,ink.width,ink.height);const p=ic.getImageData(0,0,ink.width,ink.height);for(let i=0;i<p.data.length;i+=4){const v=p.data[i]*.2126+p.data[i+1]*.7152+p.data[i+2]*.0722;p.data[i+3]*=Math.max(0,Math.min(1,(135-v)/65));p.data[i]=49;p.data[i+1]=58;p.data[i+2]=72;}ic.putImageData(p,0,0);}
    ctx.save();reveal(f.progress/.45,f.direction);ctx.globalAlpha=1-smoothEffect((f.progress-.85)/.15);ctx.drawImage(ink,0,0,w,h);ctx.restore();
    ctx.save();reveal((f.progress-.3)/.7,f.direction);ctx.drawImage(source,0,0);ctx.restore();
  }
  const thresholds=Float32Array.from({length:mask.width*mask.height},(_,i)=>dissolveThreshold(i%mask.width,Math.floor(i/mask.width),mask.width));
  function capture(id,direction){
    for(let i=0;i<thresholds.length;i++){const x=i%mask.width,y=Math.floor(i/mask.width),axis=direction==='left'?1-x/(mask.width-1):direction==='up'?1-y/(mask.height-1):direction==='down'?y/(mask.height-1):x/(mask.width-1);thresholds[i]=.08+.64*axis+.12*effectNoise(i);}
    mctx.clearRect(0,0,mask.width,mask.height);mctx.drawImage(source,0,0,mask.width,mask.height);
    const data=mctx.getImageData(0,0,mask.width,mask.height).data;particles=[];
    const candidates=[];for(let i=0;i<thresholds.length;i++)if(data[i*4+3]>=90)candidates.push(i);
    candidates.sort((a,b)=>effectNoise(a,31)-effectNoise(b,31));
    for(const i of candidates.slice(0,1400)){
      particles.push({x:(i%mask.width+.5)*w/mask.width,y:(Math.floor(i/mask.width)+.5)*h/mask.height,
        start:thresholds[i],r:effectNoise(i,7),color:`rgb(${data[i*4]},${data[i*4+1]},${data[i*4+2]})`});
    }
    sampled=id;
  }
  function dissolve(f){
    const p=f.preset==='appear'?1-f.progress:f.progress;
    if(f.reduced||f.strength===0){ctx.globalAlpha=1-smoothEffect(p);ctx.drawImage(source,0,0);ctx.globalAlpha=1;return;}
    if(p<=0){ctx.drawImage(source,0,0);return;}if(p>=1)return;
    if(sampled!==f.request_id)capture(f.request_id,f.direction);
    const data=pixels.data;
    for(let i=0;i<thresholds.length;i++)data[i*4+3]=Math.round(255*smoothEffect((thresholds[i]-p)/.028));
    mctx.putImageData(pixels,0,0);ctx.drawImage(source,0,0);ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0,w,h);ctx.globalCompositeOperation='source-over';
    const size=Math.max(1,w/550),force=.4+f.strength*.9;
    for(const q of particles){
      const age=(p-q.start)/.16;if(age<0||age>1)continue;
      const travel=smoothEffect(age),distance=(.08+q.r*.17)*Math.max(w,h)*travel*force,[vx,vy]=vector(f.direction),dx=vx*distance-vy*Math.sin(age*7+q.r*9)*8,dy=vy*distance+vx*Math.sin(age*7+q.r*9)*8;
      ctx.globalAlpha=(1-age)*f.strength;ctx.fillStyle=q.color;
      ctx.fillRect(q.x+dx,q.y+dy,(1+q.r)*size,(1+q.r)*size);
    }
    ctx.globalAlpha=1;
  }
  function comms(f){
    const a=f.strength*f.envelope;
    ctx.drawImage(source,0,0);if(a<=0)return;
    wc.clearRect(0,0,w,h);wc.filter='grayscale(1) contrast(1.15)';wc.drawImage(source,0,0);wc.filter='none';
    wc.globalCompositeOperation='source-atop';wc.fillStyle='rgba(21,185,112,.62)';wc.fillRect(0,0,w,h);
    const shift=f.reduced?0:(f.elapsed*10)%5;
    wc.fillStyle='rgba(2,25,21,.24)';for(let y=shift;y<h;y+=5)wc.fillRect(0,y,w,1.4);
    // One slow sweep, no rapid flashes. Clip every overlay to the character alpha.
    if(!f.reduced){const [vx,vy]=vector(f.direction),p=(f.elapsed*.11%1),pos=(vx<0||vy<0?1-p:p)*(vx?w:h),g=vx?wc.createLinearGradient(pos-40,0,pos+40,0):wc.createLinearGradient(0,pos-40,0,pos+40);g.addColorStop(0,'#b8ffd800');g.addColorStop(.5,'#b8ffd83b');g.addColorStop(1,'#b8ffd800');wc.fillStyle=g;if(vx)wc.fillRect(pos-40,0,80,h);else wc.fillRect(0,pos-40,w,80);}
    wc.globalCompositeOperation='source-over';ctx.globalAlpha=a;ctx.drawImage(work,0,0);ctx.globalAlpha=1;
    if(!f.reduced&&f.elapsed<.7){
      ctx.globalAlpha=a*.22*(1-f.elapsed/.7);
      for(let i=0;i<3;i++){const y=(.2+i*.23)*h,offset=Math.sin(f.elapsed*16+i*3)*w*.007;ctx.drawImage(work,0,y,w,h*.025,offset,y,w,h*.025);}
      ctx.globalAlpha=1;
    }
  }
  function glitch(f){
    ctx.drawImage(source,0,0);
    const beat=Math.floor(f.elapsed/1.6),phase=f.elapsed/1.6-beat;
    if(f.reduced||!f.strength||phase>.12+effectNoise(beat,44)*.1)return;
    // A small silhouette mask keeps noise around the contour, away from the face.
    mctx.clearRect(0,0,mask.width,mask.height);mctx.drawImage(source,0,0,mask.width,mask.height);
    mctx.globalCompositeOperation='source-in';mctx.fillStyle=beat%2?'#d5faff':'#8bbfe7';mctx.fillRect(0,0,mask.width,mask.height);mctx.globalCompositeOperation='source-over';
    wc.clearRect(0,0,w,h);const amount=(.003+.014*f.strength)*cw,[vx,vy]=vector(f.direction);
    for(let i=0;i<4;i++){const y=effectNoise(beat*4+i,48)*h,bh=h*(.025+.055*effectNoise(i+beat,67)),shift=(effectNoise(i+beat*7,15)*2-1)*amount;
      wc.drawImage(mask,0,y*mask.height/h,mask.width,bh*mask.height/h,vx*shift,y+vy*shift,w,bh);
    }
    wc.globalCompositeOperation='destination-out';wc.drawImage(source,0,0);wc.globalCompositeOperation='source-over';
    ctx.globalAlpha=f.strength*f.envelope;ctx.drawImage(work,0,0);ctx.globalAlpha=1;
  }
  function blocks(f){
    if(f.progress>=1){ctx.drawImage(source,0,0);return;}
    if(f.reduced||!f.strength){ctx.globalAlpha=smoothEffect(f.progress);ctx.drawImage(source,0,0);ctx.globalAlpha=1;return;}
    if(sampled!==f.request_id)capture(f.request_id,f.direction);
    const size=8,p=f.progress;
    mctx.clearRect(0,0,mask.width,mask.height);mctx.fillStyle='#fff';
    for(let y=0;y<mask.height;y+=size)for(let x=0;x<mask.width;x+=size){
      const i=y*mask.width+x,start=thresholds[i]*.9,local=(p-start)/.2;
      if(local>=1)mctx.fillRect(x,y,size,size);
      else if(local>0){mctx.globalAlpha=smoothEffect(local);mctx.fillRect(x,y,size,size);mctx.globalAlpha=1;}
    }
    ctx.drawImage(source,0,0);ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0,w,h);ctx.globalCompositeOperation='source-over';
    const [vx,vy]=vector(f.direction);
    for(let i=0;i<particles.length;i+=8){const q=particles[i],local=(p-q.start*.9)/.2;if(local<=0||local>=1)continue;
      const travel=(1-local)*cw*.14*f.strength,bw=w/mask.width*size*(.35+q.r*.65);ctx.globalAlpha=Math.sin(local*Math.PI)*f.strength;
      ctx.fillStyle=effectNoise(i,Math.floor(f.elapsed*9))>.65?'#bfe8ef':q.color;ctx.fillRect(q.x-vx*travel,q.y-vy*travel,bw,bw);
    }ctx.globalAlpha=1;
  }
  function facePoint(pose){
    let x=project.rig?.faceX??project.width*.5,y=project.rig?.faceY??project.height*.32;
    if(rigActive(project)){[x,y]=warpPoint(x,y,project,pose);}
    return [(x-viewport.x)*w/viewport.width+(pose.sway||0)*cw/project.width,(y-viewport.y)*h/viewport.height+((pose.breathe||0)+(pose.bounce||0))*ch/project.height];
  }
  function star(x,y,r,alpha){
    ctx.globalAlpha=alpha;ctx.fillStyle='#fff3be';ctx.beginPath();
    ctx.moveTo(x,y-r);ctx.quadraticCurveTo(x+r*.17,y-r*.17,x+r,y);ctx.quadraticCurveTo(x+r*.17,y+r*.17,x,y+r);
    ctx.quadraticCurveTo(x-r*.17,y+r*.17,x-r,y);ctx.quadraticCurveTo(x-r*.17,y-r*.17,x,y-r);ctx.fill();
    ctx.globalAlpha=alpha*.65;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,r*.2,0,Math.PI*2);ctx.fill();
  }
  function happy(f,pose){
    const a=f.strength*f.envelope,[x,y]=facePoint(pose),radius=(project.rig?.faceWidth??project.width*.3)*cw/project.width;
    // Glow behind the head, preserving the facial artwork in front.
    const glow=ctx.createRadialGradient(x,y,radius*.3,x,y,radius*1.55);
    glow.addColorStop(0,`rgba(255,203,112,${a*.27})`);glow.addColorStop(.6,`rgba(255,204,124,${a*.13})`);glow.addColorStop(1,'rgba(255,218,152,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);ctx.drawImage(source,0,0);
    if(a<=0)return;
    // Warm tint inside the silhouette; low alpha keeps details legible.
    wc.clearRect(0,0,w,h);wc.drawImage(source,0,0);wc.globalCompositeOperation='source-in';wc.fillStyle='#ffd1a1';wc.fillRect(0,0,w,h);wc.globalCompositeOperation='source-over';
    ctx.globalAlpha=a*.07;ctx.drawImage(work,0,0);ctx.globalAlpha=1;
    for(let i=0;i<18;i++){
      const n=effectNoise(i,5),cycle=f.reduced?n:(f.elapsed*(.10+n*.06)+n)%1;
      const side=i%2?-1:1,px=x+side*radius*(.6+effectNoise(i,6)*.75),py=y+radius*(.9-cycle*2.25);
      const alpha=a*(f.reduced?.55:Math.sin(Math.PI*cycle)**2)*(.45+n*.4);
      const [vx,vy]=vector(f.direction||'up'),drift=(cycle-.5)*radius;star(px+vx*drift,py+(vy+1)*drift,Math.max(2,radius*(.018+n*.025)),alpha);
    }
    ctx.globalAlpha=1;
  }
  return {canvas,draw(cue,time,pose={},overrideFrame=null){
    if(disposed)return;ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    const f=overrideFrame||effectFrame(cue,time);
    if(f.preset==='dissolve'||f.preset==='appear')dissolve(f);
    else if(f.preset==='comms')comms(f);
    else if(f.preset==='glitch')glitch(f);
    else if(f.preset==='blocks')blocks(f);
    else if(f.preset==='happy')happy(f,pose);
    else if(f.preset==='ink')inkAppear(f);
    else if(f.preset==='bounce'){const [vx,vy]=vector(f.direction),distance=Math.sin(Math.PI*f.progress)*f.strength*ch*(f.reduced?.025:.12);ctx.drawImage(source,vx*distance,vy*distance);}
    else ctx.drawImage(source,0,0);
  },dispose(){disposed=true;particles=[];for(const c of [canvas,mask,work,ink])c.width=c.height=1;}};
}
