import {FaceTracker,cameraWait} from './face-tracker.js';
import {blendshapePose} from './motion.js?v=mouth-editor-9';
import {createCameraMotion} from './camera-motion.js';

export function createCameraCapture({video,onState=()=>{},onPose=()=>{},swap=()=>false,motionSettings=()=>({}),media=navigator.mediaDevices,Tracker=FaceTracker}={}){
 let run=null,pose=null,received=-Infinity;const motion=createCameraMotion();
 function stop(){const old=run;run=null;pose=null;received=-Infinity;motion.reset();if(old){old.abort.abort();clearInterval(old.timer);old.tracker?.close();old.stream?.getTracks().forEach(t=>t.stop());}video.srcObject=null;onPose(null);onState('stopped','カメラ停止');}
 async function start(device=''){
  if(run)return;const current={abort:new AbortController(),stamp:-1};run=current;const alive=()=>run===current,signal=current.abort.signal;
  onState('starting','カメラの許可を確認しています…');
  try{
   if(!media?.getUserMedia)throw Error('カメラ対応のChrome／Edgeで開いてください。');
   const stream=await cameraWait(media.getUserMedia({video:{deviceId:device?{exact:device}:undefined,width:640,height:480,facingMode:'user'},audio:false}),{signal,dispose:s=>s.getTracks().forEach(t=>t.stop())});
   if(!alive()){stream.getTracks().forEach(t=>t.stop());return;}
   current.stream=stream;video.srcObject=stream;
   for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(alive()){stop();onState('error','カメラの接続が終了しました。');}},{once:true});
   await cameraWait(video.play(),{signal,timeout:15000});if(!alive())return;
   current.tracker=new Tracker({onProgress:text=>{if(alive())onState('starting',text);}});
   await current.tracker.init();if(!alive())return;
   onState('running','顔をカメラに向けてください。');
   current.timer=setInterval(async()=>{
    if(!alive()||current.tracker.busy||video.readyState<2||video.currentTime===current.stamp)return;
    current.stamp=video.currentTime;
    try{
     const result=await current.tracker.detect(video,performance.now());if(!alive()||!result)return;
     let categories=result.faceBlendshapes?.[0]?.categories||[];
     if(swap())categories=categories.map(c=>({...c,categoryName:c.categoryName==='eyeBlinkLeft'?'eyeBlinkRight':c.categoryName==='eyeBlinkRight'?'eyeBlinkLeft':c.categoryName}));
     const now=performance.now(),head=motion.update(result.facialTransformationMatrixes?.[0],now,motionSettings());
     pose=categories.length?{...blendshapePose(categories,pose||{}),...head}:null;received=now;onPose(pose);
    }catch(e){if(alive()){stop();onState('error',e.message);}}
   },80);
  }catch(e){if(alive()){stop();onState('error',e.name==='NotAllowedError'?'カメラが許可されていません。サイト設定でカメラを許可してください。':e.name==='NotFoundError'?'カメラが見つかりません。':e.name==='NotReadableError'?'他のアプリがカメラを使用していないか確認してください。':e.message);}}
 }
 return {start,stop,recenter(){if(!pose||performance.now()-received>1000)return false;return motion.recenter();},get active(){return !!run;},get pose(){return performance.now()-received<1000?pose:null;}};
}
