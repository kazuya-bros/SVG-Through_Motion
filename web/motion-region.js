// Normalized canvas coordinates; byte weights are portable across preview/output sizes.
const regionCache=new WeakMap();
export function normalizeRegion(v){
 if(!v||typeof v!=='object')return null;
 if(regionCache.has(v))return regionCache.get(v);
 if(Object.keys(v).some(k=>!['cx','cy','rx','ry','mask'].includes(k)))return null;
 const r={};for(const k of ['cx','cy','rx','ry']){if(!Number.isFinite(v[k])||v[k]<(k[0]==='r'?.005:0)||v[k]>1)return null;r[k]=v[k];}
 if(v.mask!==undefined){if(!Array.isArray(v.mask)||v.mask.length!==4096||!v.mask.every(x=>Number.isInteger(x)&&x>=0&&x<=255))return null;r.mask=v.mask.slice();}
 regionCache.set(v,r);return r;
}
export function regionWeight(r,x,y){
 if(!r||x<0||x>1||y<0||y>1)return 0;
 if(!r.mask)return Math.max(0,1-((x-r.cx)/r.rx)**2-((y-r.cy)/r.ry)**2)**2;
 const gx=x*63,gy=y*63,ix=Math.min(62,Math.floor(gx)),iy=Math.min(62,Math.floor(gy)),fx=gx-ix,fy=gy-iy,a=r.mask;
 return ((a[iy*64+ix]*(1-fx)+a[iy*64+ix+1]*fx)*(1-fy)+(a[(iy+1)*64+ix]*(1-fx)+a[(iy+1)*64+ix+1]*fx)*fy)/255;
}
export function paintRegion(r,x,y,radius,erase=false,aspect=1){
 r.mask??=Array(4096).fill(0);
 for(let j=0;j<64;j++)for(let i=0;i<64;i++){
  const d=Math.hypot(i/63-x,(j/63-y)*aspect)/radius;if(d>=1)continue;
  const weight=Math.round(255*Math.min(1,(1-d)*3)),k=j*64+i;
  r.mask[k]=erase?Math.min(r.mask[k],255-weight):Math.max(r.mask[k],weight);
 }
}

// Bound deformation gradients so a narrow painted edge cannot invert the mesh.
const gradientCache=new WeakMap();
export function regionDisplacementLimit(r,width,height,axis){
 if(!r.mask)return (axis==='x'?r.rx*width:r.ry*height)*.4;
 let gradients=gradientCache.get(r);if(!gradients){let x=0,y=0;for(let j=0;j<64;j++)for(let i=0;i<64;i++){const k=j*64+i;if(i<63)x=Math.max(x,Math.abs(r.mask[k+1]-r.mask[k])/255*63);if(j<63)y=Math.max(y,Math.abs(r.mask[k+64]-r.mask[k])/255*63);}gradients={x,y};gradientCache.set(r,gradients);}
 return gradients[axis]? .6*(axis==='x'?width:height)/gradients[axis]:Infinity;
}
