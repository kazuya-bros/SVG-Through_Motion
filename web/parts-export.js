import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {zipFiles} from './assets.js';
import {pngBlob} from './material-export.js';

export async function exportPngParts(project,{progress=()=>{}}={}){
 const files=[],parts=[];
 for(const [index,part] of project.parts.entries()){
  const variants={normal:part.svgText,...(part.closedSvgText?{closed:part.closedSvgText}:{}),...(part.openSvgText?{open:part.openSvgText}:{}),...Object.fromEntries(Object.entries(part.mouthVariants||{}).map(([k,v])=>['vowel-'+k,v]))};
  const images={};
  for(const [variant,svgText] of Object.entries(variants)){
   const p={...part,svgText,role:'static',visible:true,faceBase:false,earMotion:false,blinkOverlay:undefined,openSvgText:undefined,closedSvgText:undefined};
   if(variant!=='normal'){delete p.rasterSourceUrl;delete p.artworkSources;}
   const copy={...project,rig:undefined,parts:[p],settings:{...project.settings,background:'transparent',rigEnabled:false}};
   const renderer=await prepareCanvasRenderer(copy,Math.max(project.width,project.height));
   try{
    renderer.draw({});const name=`parts/${String(index).padStart(3,'0')}-${variant}.png`;images[variant]=name;
    files.push([name,new Uint8Array(await (await pngBlob(renderer.canvas)).arrayBuffer())]);
   }finally{renderer.dispose();}
  }
  parts.push({id:part.id,name:part.name,role:part.role,visible:part.visible,opacity:part.opacity,x:part.x,y:part.y,width:part.width,height:part.height,images});
  progress(`PNGパーツを作成中… ${Math.round((index+1)/project.parts.length*100)}%`);
 }
 files.push(['parts.json',JSON.stringify({format:'svg-through.png-parts',version:1,width:project.width,height:project.height,layout:'full-canvas',opacityBaked:true,parts},null,2)],['README.txt','全画像は元キャンバスと同じ大きさの透過PNGです。元の位置と不透明度を画像に反映済みなので、重ねる際に座標や不透明度を二重適用しないでください。\nparts.jsonの配列順は奥から手前です。visible:falseのパーツは通常非表示です。normal以外は差分素材です。\n揺れ・リグ・音声連動は含みません。編集の再開には別途プロジェクトを保存してください。\n']);
 return {blob:zipFiles(files)};
}
