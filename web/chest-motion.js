import {normalizeRegion,regionWeight,regionDisplacementLimit} from './motion-region.js';
export const chestDefaults={chestMotionRegion:null,chestRegionManual:false,chestCenterX:.5,chestCenterY:.65,chestRadiusX:.2,chestRadiusY:.15};
export function chestSettings(settings={}){
 const result={chestMotionRegion:normalizeRegion(settings.chestMotionRegion),chestRegionManual:settings.chestRegionManual===true};
 for(const key of ['chestCenterX','chestCenterY','chestRadiusX','chestRadiusY']){
  const radius=key.includes('Radius'),v=settings[key];
  result[key]=typeof v==='number'&&Number.isFinite(v)?Math.max(radius?.01:0,Math.min(radius?.5:1,v)):chestDefaults[key];
 }
 return result;
}
export function chestRegion(project){
 const r=project.rig;if(!r)return null;
 if(project.chestSeparated??project.parts.some(p=>p.visible&&p.role==='chest'))return null;
 const h=project.height,w=project.width,remaining=h-r.neckY;
 const s=chestSettings(project.settings);
 const region=s.chestMotionRegion?{cx:s.chestMotionRegion.cx*w,cy:s.chestMotionRegion.cy*h,rx:s.chestMotionRegion.rx*w,ry:s.chestMotionRegion.ry*h}:s.chestRegionManual?{cx:s.chestCenterX*w,cy:s.chestCenterY*h,rx:s.chestRadiusX*w,ry:s.chestRadiusY*h}:{cx:r.neckX,cy:r.neckY+remaining*.32,rx:Math.min(w*.23,r.faceWidth*.72),ry:remaining*.25};
 if(region.ry<8)return null;
 const body=project.parts.some(p=>p.visible&&p.role==='static'&&!p.faceBase&&!p.independentAccessory&&(!p.deformGroup||p.deformGroup==='core')&&(s.chestRegionManual?(p.x<region.cx+region.rx&&p.x+p.width>region.cx-region.rx&&p.y<region.cy+region.ry&&p.y+p.height>region.cy-region.ry):(p.y<region.cy&&p.y+p.height>region.cy+region.ry*.5&&p.x<region.cx&&p.x+p.width>region.cx)));
 return body?region:null;
}
export function chestDisplacement(project,pose){
 const r=chestRegion(project);if(!r)return 0;
 const limit=Math.min(40*project.width/1024,r.ry*.35,project.settings?.chestMotionRegion?regionDisplacementLimit(project.settings.chestMotionRegion,project.width,project.height,'y'):Infinity);
 return Math.max(-limit,Math.min(limit,(pose.chestOffset||0)*project.width/1024));
}
export function chestPoint(x,y,project,pose){
 if(!pose.chestOffset)return [x,y];
 const r=chestRegion(project);if(!r)return [x,y];
 const u=(x-r.cx)/r.rx,v=(y-r.cy)/r.ry,weight=project.settings?.chestMotionRegion?regionWeight(project.settings.chestMotionRegion,x/project.width,y/project.height):Math.max(0,1-u*u-v*v)**2;
 return [x,y+weight*chestDisplacement(project,pose)];
}
export function chestFilter(project,id){
 const r=chestRegion(project);if(!r)return '';
 const stops=Array.from({length:17},(_,i)=>{const t=i/16,g=50+50*(1-t*t)**2;return `<stop offset="${t}" stop-color="rgb(50%,${g}%,50%)"/>`;}).join('');
 const brush=project.settings?.chestMotionRegion;
 const cells=brush?Array.from({length:4096},(_,i)=>`<rect x="${i%64*project.width/64}" y="${Math.floor(i/64)*project.height/64}" width="${project.width/64+.01}" height="${project.height/64+.01}" fill="rgb(50%,${50+50*regionWeight(brush,(i%64+.5)/64,(Math.floor(i/64)+.5)/64)}%,50%)"/>`).join(''):'';
 const map=`<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}"><defs><radialGradient id="g">${stops}</radialGradient></defs><rect width="100%" height="100%" fill="rgb(50%,50%,50%)"/>${brush?cells:`<ellipse cx="${r.cx}" cy="${r.cy}" rx="${r.rx}" ry="${r.ry}" fill="url(#g)"/>`}</svg>`;
 return `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${project.width}" height="${project.height}" color-interpolation-filters="sRGB"><feImage href="data:image/svg+xml,${encodeURIComponent(map)}" x="0" y="0" width="${project.width}" height="${project.height}" result="map"/><feComponentTransfer in="map" result="field"><feFuncR type="linear" slope="0" intercept=".5"/></feComponentTransfer><feDisplacementMap in="SourceGraphic" in2="field" xChannelSelector="R" yChannelSelector="G" scale="0" data-channel="svg-chest"/></filter>`;
}
