import {loopPose} from './motion.js';

// Await each upload before drawing another frame: memory is bounded by one PNG.
export async function streamLoopVideo(renderer,settings,request,status,format='mp4'){
 if(!['mp4','webm-alpha'].includes(format))throw Error('動画形式が不正です');
 const label=format==='mp4'?'MP4':'WebM';
 const frames=Math.round(settings.duration*30),canvas=renderer.canvas;
 let job=null,completed=false;
 try{
  job=await (await request('/api/loop-exports',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({frames,width:canvas.width,height:canvas.height,format,fps:30,...(format==='webm-alpha'?{quality:'balanced'}:{})})})).json();
  for(let i=0;i<frames;i++){
   renderer.draw(loopPose(i/30,settings));
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('動画フレームを作成できませんでした');
   await request(`/api/loop-exports/${job.id}/frames/${i}`,{method:'PUT',body:blob});
   status(`${label}を作成中… ${Math.round((i+1)/frames*100)}%`);
  }
  status(`${label}の保存を仕上げています…`);
  const saved=await (await request(`/api/loop-exports/${job.id}/finish`,{method:'POST'})).json();
  completed=true;return saved;
 }finally{
  if(job&&!completed)try{await request(`/api/loop-exports/${job.id}`,{method:'DELETE'});}catch{/* Preserve the original export error. */}
 }
}
export const streamLoopMp4=(renderer,settings,request,status)=>streamLoopVideo(renderer,settings,request,status,'mp4');
