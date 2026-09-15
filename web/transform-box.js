const at=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const inverse=(m,p)=>{const d=m[0]*m[3]-m[1]*m[2],x=p.x-m[4],y=p.y-m[5];return {x:(m[3]*x-m[2]*y)/d,y:(m[0]*y-m[1]*x)/d};};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Keep the opposite handle fixed; Alt scales about the box center.
export function resizeBox(m,b,handle,start,end,{free=false,center=false,minX=.1,maxX=10,minY=.1,maxY=10}={}){
 const h=handle.replace('box-',''),cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
 const anchor={x:center?cx:h.includes('w')?b.right:h.includes('e')?b.left:cx,y:center?cy:h.includes('n')?b.bottom:h.includes('s')?b.top:cy};
 const a=inverse(m,start),p=inverse(m,end),x=h.includes('e')||h.includes('w'),y=h.includes('n')||h.includes('s');
 let sx=x?(p.x-anchor.x)/(a.x-anchor.x):1,sy=y?(p.y-anchor.y)/(a.y-anchor.y):1;
 if(x&&y&&!free){const dx=a.x-anchor.x,dy=a.y-anchor.y;const scale=((p.x-anchor.x)*dx+(p.y-anchor.y)*dy)/(dx*dx+dy*dy);sx=sy=clamp(scale,Math.max(minX,minY),Math.min(maxX,maxY));}
 else{sx=clamp(sx,minX,maxX);sy=clamp(sy,minY,maxY);}
 const dx=anchor.x*(1-sx),dy=anchor.y*(1-sy);
 return {sx,sy,x:m[0]*dx+m[2]*dy,y:m[1]*dx+m[3]*dy};
}
export function transformBox(m,b,unit,extra=''){
 const cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2,r=4*unit;
 const pts=[['nw',b.left,b.top],['n',cx,b.top],['ne',b.right,b.top],['e',b.right,cy],['se',b.right,b.bottom],['s',cx,b.bottom],['sw',b.left,b.bottom],['w',b.left,cy]];
 const corners=[pts[0],pts[2],pts[4],pts[6]].map(([,x,y])=>at(m,{x,y}));
 const top=at(m,{x:cx,y:b.top}),len=Math.hypot(m[2],m[3]),turn={x:top.x-m[2]/len*25*unit,y:top.y-m[3]/len*25*unit};
 return `<path class="transform-area" ${extra} data-handle="move" d="${corners.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')}Z"><title>枠の中をドラッグして移動</title></path><path class="transform-stem" d="M${top.x} ${top.y}L${turn.x} ${turn.y}"/>`+pts.map(([h,x,y])=>{const p=at(m,{x,y});return `<rect class="transform-handle" ${extra} data-handle="box-${h}" x="${p.x-r}" y="${p.y-r}" width="${2*r}" height="${2*r}" style="cursor:${h}-resize"><title>${h.length===2?'縦横比を保って拡大縮小（Shiftで自由変形）':'幅・高さを変更'}</title></rect>`;}).join('')+`<circle class="transform-rotate" ${extra} data-handle="rotate" cx="${turn.x}" cy="${turn.y}" r="${5*unit}"><title>回転</title></circle>`;
}
const cache=new Map();
export function artworkBounds(text,cx,cy,fallback){
 let b=cache.get(text);
 if(!b){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.cssText='position:fixed;left:-10000px;top:0;width:2048px;height:2048px;visibility:hidden;pointer-events:none';svg.innerHTML=`<g>${text}</g>`;document.body.append(svg);
  try{const r=svg.firstElementChild.getBBox();if(r.width>0&&r.height>=0)b={x:r.x,y:r.y,width:r.width,height:r.height};}finally{svg.remove();}
  if(b){if(cache.size>64)cache.clear();cache.set(text,b);}
 }
 return b?{left:b.x-cx,right:b.x+b.width-cx,top:b.y-cy,bottom:b.y+b.height-cy}:fallback;
}
