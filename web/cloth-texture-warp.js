import {normalizeSecondary} from './secondary-motion.js';
import {regionWeight,regionDisplacementLimit} from './motion-region.js';

// The cloth field moves only horizontally and is constrained to stay monotone.
// Invert each scanline once, instead of clipping/redrawing thousands of triangles.
export function createClothTextureWarp(source,part,project){
 const region=normalizeSecondary(part.secondaryMotion).region,scale=source.width/project.width,limit=Math.min(24,part.width*.07,regionDisplacementLimit(region,project.width,project.height,'x'))*scale;
 const ctx=source.getContext('2d'),pixels=ctx.getImageData(0,0,source.width,source.height).data;
 let left=source.width,right=-1,top=source.height,bottom=-1;
 for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(pixels[(y*source.width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)return {draw:()=>source,dispose(){}};
 const margin=Math.ceil(limit)+2,x0=left-margin,y0=top-1,w=right-left+1+margin*2,h=bottom-top+3;
 const raw=new Uint8ClampedArray(w*h*4),weights=new Float32Array(w*h),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.sourceBox=[x0/scale,y0/scale,w/scale,h/scale];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const sx=x+x0,sy=y+y0,k=y*w+x;if(sx>=0&&sx<source.width&&sy>=0&&sy<source.height)raw.set(pixels.subarray((sy*source.width+sx)*4,(sy*source.width+sx)*4+4),k*4);
  weights[k]=limit*regionWeight(region,(sx+.5)/source.width,(sy+.5)/source.height);
 }
 const target=canvas.getContext('2d'),output=target.createImageData(w,h);let last=NaN;
 return {draw(pose){const c=normalizeSecondary(part.secondaryMotion),amount=c.enabled?Math.sin((pose.secondaryPhase??pose.hairPhase??0)*c.cycles)*c.amount/100:0;if(!amount)return source;if(amount===last)return canvas;last=amount;
  const out=output.data;
  for(let y=0;y<h;y++){const row=y*w;let index=0;for(let x=0;x<w;x++){
   while(index<w-2&&index+1+weights[row+index+1]*amount<x)index++;
   const a=index+weights[row+index]*amount,b=index+1+weights[row+index+1]*amount,f=Math.max(0,Math.min(1,(x-a)/(b-a))),j=(row+index)*4,k=(row+x)*4,alpha=raw[j+3]*(1-f)+raw[j+7]*f;
   out[k+3]=alpha;for(let c=0;c<3;c++)out[k+c]=alpha?(raw[j+c]*raw[j+3]*(1-f)+raw[j+4+c]*raw[j+7]*f)/alpha:0;
  }}
  target.putImageData(output,0,0);return canvas;
 },dispose(){canvas.width=canvas.height=1;}};
}
