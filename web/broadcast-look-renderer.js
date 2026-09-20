import {defaultLook} from './broadcast-look.js';
const make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
export const facePart=p=>p.faceBase||/^face$/i.test(p.sourceLayerName||'')||/顔の下地|^face(?:$|[（(])/i.test(p.name||'');
// Called before the layer's own deformation; hair/eyes naturally paint over the face.
export function createFaceTexture(){const cache=new WeakMap();function paint(source,part,project,look){
 const key=JSON.stringify(look);
 if(!facePart(part)||!['blush','gloom','sweat'].includes(look.emotion)||!look.emotion_strength)return source;
 let entries=cache.get(source);if(!entries){entries=new Map();cache.set(source,entries);}if(entries.has(key))return entries.get(key);
 const out=make(source.width,source.height),effect=make(source.width,source.height),c=effect.getContext('2d'),sx=source.width/project.width,sy=source.height/project.height;
 c.scale(sx,sy);const {x,y,width:w,height:h}=part,a=look.emotion_strength;
 if(look.emotion==='blush'){c.save();const ox=x+w*(.52+look.blush_x),oy=y+h*(.73+look.blush_y);c.translate(ox,oy);c.rotate((look.blush_rotation||0)*Math.PI/180);c.translate(-ox,-oy);for(const side of [-1,1]){const cx=x+w*(.52+look.blush_x+side*.27*look.blush_spacing),cy=y+h*(.73+look.blush_y),r=w*.22*look.blush_scale,g=c.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,`rgba(232,84,105,${a*.7})`);g.addColorStop(1,'#eb546900');c.fillStyle=g;c.fillRect(cx-r,cy-r,r*2,r*2);c.strokeStyle=`rgba(180,71,83,${a*.65})`;c.lineWidth=w*.006;for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(cx+(i*.025-.008)*w*look.blush_scale,cy-h*.015*look.blush_scale);c.lineTo(cx+(i*.025+.008)*w*look.blush_scale,cy+h*.015*look.blush_scale);c.stroke()}}c.restore();}
 else if(look.emotion==='sweat'){const cx=x+w*(.5+look.sweat_x),cy=y+h*(.5+look.sweat_y),r=w*look.sweat_scale;c.save();c.translate(cx,cy);c.rotate((look.sweat_rotation||0)*Math.PI/180);c.globalAlpha=a;c.fillStyle='#87d5ed';c.strokeStyle='#f0fcff';c.lineWidth=r*.1;c.beginPath();c.moveTo(0,-r);c.bezierCurveTo(-r*.18,-r*.45,-r*.62,0,-r*.48,r*.4);c.bezierCurveTo(-r*.3,r*.93,r*.48,r*.91,r*.49,r*.32);c.bezierCurveTo(r*.52,-r*.07,r*.1,-r*.62,0,-r);c.fill();c.stroke();c.strokeStyle='#ffffff';c.lineWidth=r*.12;c.beginPath();c.moveTo(-r*.19,0);c.lineTo(-r*.23,r*.3);c.stroke();c.restore();}
 else{const g=c.createLinearGradient(0,y+h*.2,0,y+h*.93);g.addColorStop(0,`rgba(39,43,90,${a*.8})`);g.addColorStop(.6,`rgba(51,61,109,${a*.45})`);g.addColorStop(1,'#303d7000');c.fillStyle=g;c.fillRect(x,y,w,h)}
 c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='destination-in';c.drawImage(source,0,0);const target=out.getContext('2d');target.drawImage(source,0,0);target.drawImage(effect,0,0);out.contentBounds=source.contentBounds;entries.set(key,out);if(entries.size>8)entries.delete(entries.keys().next().value);return out;
 }return (source,part,project,look)=>{const emotions=look.emotion_layers||[look.emotion];for(const emotion of emotions)source=paint(source,part,project,{...look,emotion});return source;};}
export function createBroadcastLookRenderer(source){
 const w=source.width,h=source.height,canvas=make(w,h),lit=make(w,h),small=make(Math.max(1,Math.round(w*.35)),Math.max(1,Math.round(h*.35))),ring=make(small.width,small.height),ctx=canvas.getContext('2d'),lc=lit.getContext('2d'),sc=small.getContext('2d');
 canvas.viewport=source.viewport;
 let imageKey=null,tone='#e3be97';
 function backgroundTone(image){if(!image)return null;if(image===imageKey)return tone;imageKey=image;const c=make(16,16),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0,16,16);const p=x.getImageData(0,0,16,16).data,sum=[0,0,0];let n=0;for(let i=0;i<p.length;i+=4){n+=p[i+3]/255;for(let j=0;j<3;j++)sum[j]+=p[i+j]*p[i+3]/255}tone=n?'#'+sum.map(v=>Math.round(v/n).toString(16).padStart(2,'0')).join(''):'#ffffff';return tone}
 return {canvas,draw(value,image){const a={...defaultLook(),...value};ctx.clearRect(0,0,w,h);lc.clearRect(0,0,w,h);lc.drawImage(source,0,0);
  if(a.light!=='none'&&a.light_strength){const col={day:'#fff6df',sunset:'#ffaf7b',night:'#819bcc',neon:'#c58cee',background:backgroundTone(image)||a.light_color}[a.light]||a.light_color;
   lc.globalCompositeOperation='source-atop';lc.globalAlpha=a.light_strength*(a.light==='night'?.58:.34);lc.fillStyle=col;lc.fillRect(0,0,w,h);lc.globalAlpha=1;lc.globalCompositeOperation='source-over';
  }
  if(a.outline&&a.outline_width>0){sc.clearRect(0,0,small.width,small.height);sc.drawImage(lit,0,0,small.width,small.height);sc.globalCompositeOperation='source-in';sc.fillStyle='#fff';sc.fillRect(0,0,small.width,small.height);sc.globalCompositeOperation='source-over';const rc=ring.getContext('2d');
   const colors=a.outline_color_count===1?[a.outline_color]:a.outline_color_count===2?[a.outline_color2,a.outline_color]:[a.outline_color,a.outline_color2,a.outline_color3];
   for(let mul=a.outline_layers;mul>=1;mul--){const col=colors[(a.outline_layers-mul)%colors.length];rc.clearRect(0,0,ring.width,ring.height);const r=a.outline_width*(ring.width*(source.viewport?source.viewport.contentWidth/source.viewport.width:1))/1080*mul;for(let i=0;i<16;i++){const t=i*Math.PI/8;rc.drawImage(small,Math.cos(t)*r,Math.sin(t)*r)}rc.globalCompositeOperation='source-in';rc.fillStyle=col;rc.fillRect(0,0,ring.width,ring.height);rc.globalCompositeOperation='source-over';ctx.drawImage(ring,0,0,w,h)}
  }ctx.drawImage(lit,0,0);
 },dispose(){for(const c of [canvas,lit,small,ring])c.width=c.height=1}};
}
