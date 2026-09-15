// A shared deformation field keeps every cut edge attached to its neighbour.
// Derive ownership from the actual, sanitized SVGs (including custom replacements).
const pending=new WeakMap();
const kinds=['front','back','arm-r','arm-l'];
function blur(a,w,h,radius=4){
  const temp=new Float32Array(a.length),out=new Float32Array(a.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=a[y*w+Math.max(0,Math.min(w-1,x+k))];temp[y*w+x]=sum/(radius*2+1);}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=temp[Math.max(0,Math.min(h-1,y+k))*w+x];out[y*w+x]=sum/(radius*2+1);}
  return out;
}
export async function ensureSeamRig(p){
  if(!p.rig?.segmented||p.rig.seamWeights)return;
  if(pending.has(p))return pending.get(p);
  const task=(async()=>{
    const scale=256/Math.max(p.width,p.height),w=Math.max(2,Math.round(p.width*scale)),h=Math.max(2,Math.round(p.height*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});
    const owners=new Int8Array(w*h);owners.fill(-1);
    for(const part of p.parts.filter(p=>p.visible&&!p.blinkOverlay&&!p.faceOverlay)){
      const im=new Image(),url=URL.createObjectURL(new Blob([part.svgText],{type:'image/svg+xml'}));
      try{im.src=url;await im.decode();ctx.clearRect(0,0,w,h);ctx.drawImage(im,part.x*scale,part.y*scale,part.width*scale,part.height*scale);
        const pixels=ctx.getImageData(0,0,w,h).data,kind=kinds.indexOf(part.deformGroup)+1;
        for(let i=0;i<owners.length;i++)if(pixels[i*4+3]>127)owners[i]=kind;
      }finally{URL.revokeObjectURL(url);}
    }
    // Extend nearest ownership beyond silhouettes, so tips don't stick to the backdrop.
    const queue=new Int32Array(w*h);let head=0,tail=0;
    for(let i=0;i<owners.length;i++)if(owners[i]>=0)queue[tail++]=i;
    while(head<tail){const i=queue[head++],x=i%w;for(const j of [x?i-1:-1,x<w-1?i+1:-1,i-w,i+w])if(j>=0&&j<owners.length&&owners[j]<0){owners[j]=owners[i];queue[tail++]=j;}}
    const size=33,weights={size};
    for(const [index,kind] of kinds.entries()){
      let field=Float32Array.from(owners,v=>v===index+1?1:0);
      field=blur(blur(field,w,h),w,h);
      weights[kind]=Array.from({length:size*size},(_,i)=>+field[Math.round(Math.floor(i/size)/(size-1)*(h-1))*w+Math.round(i%size/(size-1)*(w-1))].toFixed(4));
    }
    p.rig.seamWeights=weights;
  })();
  pending.set(p,task);
  try{await task;}finally{pending.delete(p);delete p.rig.seamPending;}
}
