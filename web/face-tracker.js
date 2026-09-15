export class FaceTracker {
  constructor({worker=new Worker(new URL('./face-tracker-worker.js',import.meta.url)),onProgress=()=>{},initTimeout=90000,frameTimeout=10000,makeBitmap=image=>createImageBitmap(image)}={}){
    this.worker=worker;this.pending=new Map();this.sequence=0;this.closed=false;this.busy=false;
    this.makeBitmap=makeBitmap;this.initTimeout=initTimeout;this.frameTimeout=frameTimeout;
    worker.onmessage=({data})=>{
      if(this.closed)return;
      if(data.progress){onProgress(data.progress);return;}
      const request=this.pending.get(data.id);if(!request)return;
      this.pending.delete(data.id);clearTimeout(request.timer);
      if(data.error)request.reject(Error(data.error));else request.resolve(data.result);
    };
    worker.onerror=event=>{event.preventDefault?.();this.close(Error(event.message||'顔解析の実行環境を起動できませんでした。'));};
    worker.onmessageerror=()=>this.close(Error('顔解析の結果を読み取れませんでした。'));
  }
  request(type,payload={},transfer=[],timeout=this.frameTimeout){
    if(this.closed)return Promise.reject(new DOMException('顔解析を中断しました','AbortError'));
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>this.close(Error(type==='init'?'顔解析の準備が時間切れになりました。ネット接続を確認し、もう一度開始してください。':'顔解析が応答しなくなりました。もう一度開始してください。')),timeout);
      this.pending.set(id,{resolve,reject,timer});
      try{this.worker.postMessage({id,type,...payload},transfer);}catch(error){this.close(error);}
    });
  }
  init(){return this.request('init',{},[],this.initTimeout);}
  async detect(video,timestamp){
    if(this.busy||this.closed)return null;
    this.busy=true;let bitmap;
    try{
      bitmap=await this.makeBitmap(video);
      if(this.closed)return null;
      return await this.request('detect',{bitmap,timestamp},[bitmap]);
    }finally{bitmap?.close();this.busy=false;}
  }
  close(error=new DOMException('顔解析を中断しました','AbortError')){
    if(this.closed)return;this.closed=true;this.worker.terminate();
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}
    this.pending.clear();
  }
}

// A permission prompt can remain unanswered; release streams that arrive after cancellation.
export function cameraWait(promise,{signal,timeout=30000,message='カメラの応答がありません。ブラウザのカメラ許可を確認し、もう一度開始してください。',dispose=()=>{}}={}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,value)=>{if(settled){if(!error)dispose(value);return;}settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    const abort=()=>finish(new DOMException('カメラの開始を中断しました','AbortError'));
    const timer=setTimeout(()=>finish(Error(message)),timeout);
    signal?.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(value=>finish(null,value),error=>finish(error));
    if(signal?.aborted)abort();
  });
}
