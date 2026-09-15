// Artwork-oriented mouth contours. Shared paths drive Canvas, SVG and SMIL.
const names=['a','i','u','e','o'];
// half-width, upper arch, lower arch, tooth depth, tongue visibility
const shapes={a:[.34,.06,.32,.08,.8],i:[.36,.015,.12,.8,0],u:[.16,.075,.13,0,0],e:[.32,.025,.22,.38,.35],o:[.21,.16,.34,0,.35]};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(+x)?+x:a));
const n=x=>+x.toFixed(5);
export const mouthOffset=(settings={},width=1024)=>clamp(settings.mouthOffsetY??0,-20,20)*width/1024;
export function animeMouth(pose={},settings={}){
  let weights=names.map(v=>+(v===(settings.vowels?pose.vowel:'a')));
  if(settings.vowels&&Array.isArray(pose.vowelWeights)&&pose.vowelWeights.length===5)weights=pose.vowelWeights.map(v=>clamp(v));
  let sum=weights.reduce((a,b)=>a+b,0);if(!sum){weights=[1,0,0,0,0];sum=1;}
  const [target,up,down,tooth,tongue]=[0,1,2,3,4].map(k=>weights.reduce((a,w,i)=>a+w*shapes[names[i]][k],0)/sum);
  const amount=clamp(pose.mouth),ease=amount*amount*(3-2*amount),w=.28+(target-.28)*ease;
  const t=-up*amount,b=down*amount;
  // Corners stay at the lip line; the jaw opens downward, not around the center.
  const outline=`M ${n(-w)} 0 C ${n(-w*.65)} ${n(t*1.35)} ${n(w*.65)} ${n(t*1.35)} ${n(w)} 0 C ${n(w*.88)} ${n(b*1.35)} ${n(-w*.88)} ${n(b*1.35)} ${n(-w)} 0 Z`;
  const teeth=`M -.5 -.5 L .5 -.5 L .5 ${n(t+(b-t)*tooth)} Q 0 ${n(t+(b-t)*tooth+.008*amount)} -.5 ${n(t+(b-t)*tooth)} Z`;
  const tonguePath=`M ${n(-w*.75)} ${n(b*.9)} Q 0 ${n(b*.28)} ${n(w*.75)} ${n(b*.9)} L ${n(w)} ${n(b*1.5)} L ${n(-w)} ${n(b*1.5)} Z`;
  return {outline,teeth,tongue:tonguePath,teethOpacity:tooth>0?1:0,tongueOpacity:tongue,opacity:clamp(amount*12),stroke:.022};
}
export function animeMouthSvg(part){
  const id=`anime-mouth-${part.id}`,s=animeMouth({mouth:1,vowel:'a'},{vowels:true});
  return `<g transform="translate(${part.x+part.width/2} ${part.y+part.height/2}) rotate(-6) scale(${part.width})"><g data-channel="anime-visible"><defs><clipPath id="${id}"><path data-channel="anime-outline" d="${s.outline}"/></clipPath></defs><path data-channel="anime-outline" d="${s.outline}" fill="#843f3d"/><g clip-path="url(#${id})"><g data-channel="anime-teeth-visible"><path data-channel="anime-teeth" d="${s.teeth}" fill="#fff0de"/></g><g data-channel="anime-tongue-visible"><path data-channel="anime-tongue" d="${s.tongue}" fill="#d8847d"/></g></g><path data-channel="anime-outline" d="${s.outline}" fill="none" stroke="#6c4240" stroke-width="${s.stroke}" stroke-linejoin="round"/></g></g>`;
}
export function drawAnimeMouth(ctx,part,pose,settings){
  const s=animeMouth(pose,settings);ctx.save();ctx.globalAlpha=part.opacity*s.opacity;
  ctx.translate(part.x+part.width/2,part.y+part.height/2);ctx.rotate(-6*Math.PI/180);ctx.scale(part.width,part.width);
  const outline=new Path2D(s.outline);ctx.fillStyle='#843f3d';ctx.fill(outline);ctx.save();ctx.clip(outline);
  ctx.fillStyle='#fff0de';ctx.globalAlpha*=s.teethOpacity;ctx.fill(new Path2D(s.teeth));
  ctx.globalAlpha=part.opacity*s.opacity*s.tongueOpacity;ctx.fillStyle='#d8847d';ctx.fill(new Path2D(s.tongue));ctx.restore();
  ctx.strokeStyle='#6c4240';ctx.lineWidth=s.stroke;ctx.lineJoin='round';ctx.stroke(outline);ctx.restore();
}
