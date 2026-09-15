// Classic worker: MediaPipe's WASM loader uses importScripts.
let tracker;
self.onmessage=async({data})=>{
  const {id,type,bitmap,timestamp}=data;
  try{
    if(type==='init'){
      self.postMessage({progress:'顔解析ライブラリを取得しています…'});
      const {FaceLandmarker,FilesetResolver}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs');
      self.postMessage({progress:'顔解析の実行環境を準備しています…'});
      const resolver=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm');
      self.postMessage({progress:'顔解析モデルを取得・初期化しています…（初回は時間がかかります）'});
      tracker=await FaceLandmarker.createFromOptions(resolver,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true,numFaces:1});
      self.postMessage({id,result:true});
    }else if(type==='detect'){
      const result=tracker.detectForVideo(bitmap,timestamp);
      self.postMessage({id,result:{faceBlendshapes:result.faceBlendshapes,facialTransformationMatrixes:result.facialTransformationMatrixes}});
    }
  }catch(error){self.postMessage({id,error:error.message||String(error)});}
  finally{bitmap?.close();}
};
