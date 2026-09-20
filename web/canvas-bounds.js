// Conservative pixel bounds let transparent layer margins skip compositing.
// Undefined means unknown/full canvas; null means empty. Include a filter gutter.
export function scanCanvasBounds(canvas){
 const {width:w,height:h}=canvas,a=canvas.getContext('2d').getImageData(0,0,w,h).data;
 let x0=w,y0=h,x1=-1,y1=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a[(y*w+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 canvas.contentBounds=x1<0?null:[Math.max(0,x0-3),Math.max(0,y0-3),Math.min(w,x1+4),Math.min(h,y1+4)];return canvas;
}
export function copyCanvasBounds(ctx,source,dx=0,dy=0,dw=source.width,dh=source.height){
 const b=source.contentBounds;if(b===null||ctx.globalAlpha===0)return;
 const [x0,y0,x1,y1]=b||[0,0,source.width,source.height],sx=dw/source.width,sy=dh/source.height;
 const x=dx+x0*sx,y=dy+y0*sy,w=(x1-x0)*sx,h=(y1-y0)*sy;
 ctx.drawImage(source,x0,y0,x1-x0,y1-y0,x,y,w,h);
 const m=ctx.getTransform(),points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([u,v])=>[m.a*u+m.c*v+m.e,m.b*u+m.d*v+m.f]);
 const out=[Math.max(0,Math.floor(Math.min(...points.map(p=>p[0])))-3),Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))-3),Math.min(ctx.canvas.width,Math.ceil(Math.max(...points.map(p=>p[0])))+3),Math.min(ctx.canvas.height,Math.ceil(Math.max(...points.map(p=>p[1])))+3)];
 const old=ctx.canvas.contentBounds;
 if(old===undefined)return;
 if(out[2]<=out[0]||out[3]<=out[1])return;
 ctx.canvas.contentBounds=old?[Math.min(old[0],out[0]),Math.min(old[1],out[1]),Math.max(old[2],out[2]),Math.max(old[3],out[3])]:out;
}
