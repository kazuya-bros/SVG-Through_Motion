import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {loopPose} from './motion.js?v=mouth-editor-9';
import {rigGroups,rigActive,mesh,triangleMatrix,faceMotion} from './rig.js?v=mouth-editor-9';
import {pngBlob} from './material-export.js';
import {zipFiles} from './assets.js';

export function alphaBounds(images,width,height){
 let left=width,top=height,right=-1,bottom=-1;
 for(const data of images)for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 if(right<0)throw Error('口の差分が空です。口の表示と素材を確認してください。');
 left=Math.max(0,left-3);top=Math.max(0,top-3);right=Math.min(width,right+4);bottom=Math.min(height,bottom+4);
 return {x:left,y:top,width:right-left,height:bottom-top};
}
function inside([x,y],[a,b,c]){
 const cross=(p,q)=>(q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]);
 const values=[cross(a,b),cross(b,c),cross(c,a)];return values.every(v=>v>=-1e-7)||values.every(v=>v<=1e-7);
}
export function mouthQuad(rect,part,project,pose,outputSize){
 const group=rigGroups(project)?.find(g=>g.parts.some(p=>p.id===part.id))||project;
 const triangles=rigActive(group)?mesh(group):[],face=faceMotion(part,project,pose);
 const quad=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x+rect.width,rect.y+rect.height],[rect.x,rect.y+rect.height]];
 const angle=(pose.sway||0)*Math.PI/180,cx=project.width/2,cy=project.height*.75;
 return quad.map(([x,y])=>{
  x=(x-(part.x+part.width/2))*face.sx+part.x+part.width/2+face.x;y+=face.y;
  const triangle=triangles.find(t=>inside([x,y],t));
  if(triangle){const [a,b,c,d,e,f]=triangleMatrix(triangle,group,pose);[x,y]=[a*x+c*y+e,b*x+d*y+f];}
  y+=(pose.bounce||0)-(pose.breathe||0);
  const dx=x-cx,dy=y-cy;
  return [(cx+dx*Math.cos(angle)-dy*Math.sin(angle))*outputSize.width/project.width,(cy+dx*Math.sin(angle)+dy*Math.cos(angle))*outputSize.height/project.height];
 });
}

export async function exportMpng(project,{request=fetch,progress=()=>{},signal}={}){
 const mouth=project.parts.filter(p=>p.visible&&p.role==='mouth');
 if(mouth.length!==1)throw Error('MPNGには表示中の口パーツが1つ必要です。');
 const part=mouth[0],duration=Number(project.settings.duration),fps=30,frames=Math.round(duration*fps);
 if(!Number.isFinite(duration)||duration<1||duration>30)throw Error('MPNGは1〜30秒のループにしてください。');
 const files=[],sprites={},samples=[],names=['closed','half','open','e','u'];
 const isolated={...structuredClone(project),rig:undefined,parts:[{...structuredClone(part),earMotion:false,faceBase:false}],settings:{...project.settings,background:'transparent',rigEnabled:false}};
 const spriteRenderer=await prepareCanvasRenderer(isolated,Math.max(project.width,project.height));
 let renderer=null,job=null,completed=false;
 try{
  const amounts=[0,.5,1,.75,.5],vowels=[undefined,undefined,'a','e','u'];
  for(let i=0;i<names.length;i++){
   spriteRenderer.draw({mouth:amounts[i],vowel:vowels[i]});
   samples.push(spriteRenderer.canvas.getContext('2d').getImageData(0,0,project.width,project.height).data);
  }
  const rect=alphaBounds(samples,project.width,project.height),crop=document.createElement('canvas');crop.width=rect.width;crop.height=rect.height;
  const full=document.createElement('canvas');full.width=project.width;full.height=project.height;
  try{for(let i=0;i<names.length;i++){
   full.getContext('2d').putImageData(new ImageData(samples[i],project.width,project.height),0,0);
   const ctx=crop.getContext('2d');ctx.clearRect(0,0,crop.width,crop.height);ctx.drawImage(full,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
   const name=`mouth/${names[i]}.png`;sprites[names[i]]=name;files.push([name,new Uint8Array(await (await pngBlob(crop)).arrayBuffer())]);
  }}finally{crop.width=crop.height=full.width=full.height=1;samples.length=0;spriteRenderer.dispose();}
  const copy=structuredClone(project);copy.parts=copy.parts.map(p=>p.id===part.id?{...p,visible:false}:p);
  copy.settings={...copy.settings,background:'transparent',talking:false,vowels:false};
  progress('口なし動画の描画を準備しています…');
  renderer=await prepareCanvasRenderer(copy,Math.min(1080,Math.max(project.width,project.height)),{supersample:2});
  signal?.throwIfAborted();
  job=await (await request('/api/loop-exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frames,width:renderer.canvas.width,height:renderer.canvas.height,format:'webm-alpha',fps}),signal})).json();
  const track={fps,refSpriteSize:[rect.width,rect.height],calibrationApplied:true,frames:[]};
  for(let i=0;i<frames;i++){
   signal?.throwIfAborted();const pose=loopPose(i/fps,copy.settings);pose.mouth=0;
   renderer.draw(pose);const blob=await pngBlob(renderer.canvas);
   await request(`/api/loop-exports/${job.id}/frames/${i}`,{method:'PUT',body:blob,signal});
   track.frames.push({valid:true,quad:mouthQuad(rect,part,project,pose,renderer.canvas)});
   progress(`口なし動画を作成中… ${Math.round((i+1)/frames*100)}%`);
  }
  progress('透過動画の保存を仕上げています…');
  const saved=await (await request(`/api/loop-exports/${job.id}/finish`,{method:'POST',signal})).json();completed=true;
  const video=await (await request(saved.url,{signal})).arrayBuffer();files.push(['idle.webm',new Uint8Array(video)],['tracking.json',JSON.stringify(track)]);
  const manifest={format:'mpng',video:'idle.webm',tracking:'tracking.json',mouthSprites:sprites,width:renderer.canvas.width,height:renderer.canvas.height,fps,frames,duration:frames/fps};
  files.push(['manifest.json',JSON.stringify(manifest,null,2)],['README.txt','MPNG用素材\nidle.webm: 口なし・透過ループ動画\ntracking.json: 動画の各コマに対応した口の四隅（左上・右上・右下・左下）\nmouth/: 同じ矩形サイズの口差分PNG\n\nSpriTalkではMPNG方式を選び、展開した動画・追跡JSON・口差分をそれぞれ指定してください。ZIPの自動インポートを前提にはしていません。\n髪・胸・耳・まばたきは動画に固定され、口だけが発話に連動します。顎の発話連動は含みません。口の変形は四隅による近似で、前景の髪等による遮蔽は動画の上に描く口へ反映されません。口に髪等が重なる素材はSpriTalk専用形式を使用してください。\nVP9の可逆モードを使用していますが、動画の色差変換はPNGと異なります。完全な画質一致は専用形式をご利用ください。\n']);
  progress('MPNG用ZIPをまとめています…');return {blob:zipFiles(files),manifest,track,files};
 }finally{spriteRenderer.dispose();renderer?.dispose();if(job&&!completed)try{await request(`/api/loop-exports/${job.id}`,{method:'DELETE'});}catch{/* Keep original failure. */}}
}
