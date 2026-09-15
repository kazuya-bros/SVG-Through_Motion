import {loopPose} from './motion.js';

// Await each upload before drawing another frame: memory is bounded by one PNG.
export async function streamLoopMp4(renderer,settings,request,status){
 const frames=Math.round(settings.duration*30),canvas=renderer.canvas;
 let job=null,completed=false;
 try{
  job=await (await request('/api/loop-exports',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({frames,width:canvas.width,height:canvas.height})})).json();
  for(let i=0;i<frames;i++){
   renderer.draw(loopPose(i/30,settings));
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('動画フレームを作成できませんでした');
   await request(`/api/loop-exports/${job.id}/frames/${i}`,{method:'PUT',body:blob});
   status(`MP4を作成中… ${Math.round((i+1)/frames*100)}%`);
  }
  status('MP4の保存を仕上げています…');
  const saved=await (await request(`/api/loop-exports/${job.id}/finish`,{method:'POST'})).json();
  completed=true;return saved;
 }finally{
  if(job&&!completed)try{await request(`/api/loop-exports/${job.id}`,{method:'DELETE'});}catch{/* Preserve the original export error. */}
 }
}
