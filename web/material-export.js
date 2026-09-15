import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {loopPose} from './motion.js?v=mouth-editor-9';
import {zipFiles} from './assets.js';

export function exportPlan(project, options={}) {
  const fps=Number(options.fps??24),duration=Number(options.duration??project.settings.duration??4);
  const edge=Number(options.max_edge??512),columns=Number(options.columns??8);
  if(!Number.isInteger(fps)||fps<1||fps>60||!Number.isFinite(duration)||duration<1||duration>30||
     !Number.isInteger(edge)||edge<64||edge>2048||!Number.isInteger(columns)||columns<1||columns>32)
    throw Error('出力設定が範囲外です（1〜30秒・1〜60fps・64〜2048px）。');
  const count=Math.round(duration*fps);
  if(count>600)throw Error('一度の書き出しは600コマまでです。秒数かfpsを下げてください。');
  const scale=Math.min(1,edge/project.width,edge/project.height);
  const width=Math.max(1,Math.round(project.width*scale)),height=Math.max(1,Math.round(project.height*scale));
  if(width*height*4*(project.parts.length*4+6)>512*1024**2)
    throw Error('描画用メモリが大きくなります。出力サイズを小さくしてください。');
  const cols=Math.min(columns,Math.floor(4096/width),count);
  const rows=Math.min(Math.floor(4096/height),Math.ceil(count/cols));
  return {fps,count,duration:count/fps,width,height,columns:cols,rows,perPage:cols*rows,maxEdge:edge};
}

export const pngBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNGを書き出せませんでした')),'image/png'));

export async function exportMaterials(project, options={}, {signal,progress=()=>{}}={}) {
  const plan=exportPlan(project,options),format=options.format??'frames';
  if(!['frames','sheet'].includes(format))throw Error('素材出力の形式が不正です');
  const copy=structuredClone(project);
  copy.settings={...copy.settings,background:'transparent',duration:plan.duration};
  signal?.throwIfAborted();
  progress(0,plan.count);
  const renderer=await prepareCanvasRenderer(copy,plan.maxEdge);
  const files=[],frames=[],pages=[];let total=0,sheet=null;
  const add=async(name,blob)=>{
    total+=blob.size;
    if(total>180*1024**2)throw Error('出力が180MBを超えます。秒数・fps・サイズを下げてください。');
    files.push([name,new Uint8Array(await blob.arrayBuffer())]);
  };
  try {
  for(let i=0;i<plan.count;i++) {
    signal?.throwIfAborted();
    renderer.draw(loopPose(i/plan.fps,copy.settings));
    if(format==='frames') {
      const file=`frames/frame${String(i).padStart(5,'0')}.png`;
      await add(file,await pngBlob(renderer.canvas));
      frames.push({file,time:i/plan.fps,duration:1/plan.fps});
    } else {
      const slot=i%plan.perPage,page=Math.floor(i/plan.perPage),file=`sheet-${String(page).padStart(3,'0')}.png`;
      if(slot===0){
        sheet=document.createElement('canvas');sheet.width=plan.columns*plan.width;
        sheet.height=Math.ceil(Math.min(plan.perPage,plan.count-i)/plan.columns)*plan.height;
        pages.push({file,width:sheet.width,height:sheet.height});
      }
      const x=(slot%plan.columns)*plan.width,y=Math.floor(slot/plan.columns)*plan.height;
      sheet.getContext('2d').drawImage(renderer.canvas,x,y);
      frames.push({file,x,y,w:plan.width,h:plan.height,time:i/plan.fps,duration:1/plan.fps});
      if(slot===plan.perPage-1||i===plan.count-1){await add(file,await pngBlob(sheet));sheet.width=sheet.height=1;sheet=null;}
    }
    progress(i+1,plan.count);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  signal?.throwIfAborted();
  const manifest={schema:'khaula.materials.v1',name:project.name,format,alpha:true,loop:true,
    fps:plan.fps,frameCount:plan.count,duration:plan.duration,width:plan.width,height:plan.height,
    sourceSize:{width:project.width,height:project.height},pivot:{x:.5,y:1,unit:'normalized'},
    trimmed:false,pages,frames,animations:{idle:{start:0,count:plan.count,loop:true}}};
  files.push(['animation.json',JSON.stringify(manifest,null,2)],['README.txt',
    '透過RGBA PNGのループ素材です。音声・マイク・カメラ・確認用ポーズは含みません。\n'+
    '動きの設定を固定フレームで描画。最終コマは開始コマと重複させていません。\n'+
    'animation.jsonのfps/frameCount/framesで再生してください。矩形は左上基準px、pivotは左上基準の正規化座標（足元中央）です。\n'+
    '原画キャンバスを維持し、トリミング・拡大はしません。4096pxを超えるシートは複数ページに分割します。\n']);
  return {blob:zipFiles(files),manifest};
  } finally {renderer.dispose();if(sheet)sheet.width=sheet.height=1;}
}
