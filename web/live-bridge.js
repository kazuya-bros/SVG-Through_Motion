// One editor owns the bridge. Reconnection never replays an old AI command.
export function createLiveBridge({snapshot,state,execute,onStatus}) {
  let socket=null,revision=0,lastPush=0,published=false,publishing=null;
  const pending=new Map();
  function rejectPending(){for(const item of pending.values())item.reject(Error('素材反映中に接続が切れました'));pending.clear();}
  const send=message=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));};
  async function publish() {
    if(!socket||socket.readyState!==WebSocket.OPEN)throw Error('先にAI・OBS接続を開始してください');
    if(publishing)return publishing;
    const ws=socket;
    const operation=(async()=>{
      const project=await snapshot();
      if(socket!==ws||ws.readyState!==WebSocket.OPEN)throw Error('素材反映中に接続が切れました');
      const rev=++revision,payload=JSON.stringify({type:'project',revision:rev,project});
      if(new TextEncoder().encode(payload).length>100*1024**2)throw Error('AI・OBSへ反映できる素材は100MBまでです');
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(rev);reject(Error('素材反映の確認がタイムアウトしました'));},30000);
        pending.set(rev,{resolve:()=>{clearTimeout(timer);pending.delete(rev);resolve();},reject:error=>{clearTimeout(timer);reject(error);}});
        try{ws.send(payload);}catch(error){pending.get(rev).reject(error);pending.delete(rev);}
      });
      if(socket!==ws)throw Error('接続が変更されました');
      published=true;
      onStatus('接続中。編集内容をOBSへ反映しました。');
    })();
    publishing=operation;
    try{await operation;}finally{if(publishing===operation)publishing=null;}
  }
  async function connect(publishInitial=true) {
    if(socket)return;
    onStatus('接続しています…');
    const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/control/socket/editor`);
    socket=ws;
    ws.onopen=()=>{if(publishInitial)publish().catch(e=>onStatus(e.message,true));else onStatus('AI操作に接続中。素材の読み込みを待っています。');};
    ws.onmessage=async event=>{
      if(socket!==ws)return;
      const msg=JSON.parse(event.data);
      if(msg.type==='published'){pending.get(msg.revision)?.resolve();return;}
      if(msg.type!=='command')return;
      const reply=message=>{if(socket===ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));};
      try{const result=await execute(msg.command);reply({type:'result',id:msg.id,result});}
      catch(error){reply({type:'result',id:msg.id,error:error.name==='AbortError'?'操作を中断しました':error.message});}
    };
    ws.onerror=()=>onStatus('接続できません。サーバーを更新して起動し直してください。',true);
    ws.onclose=()=>{if(socket===ws){socket=null;published=false;rejectPending();publishing=null;onStatus('未接続。他の編集画面が接続中の場合は、そちらを先に切断してください。');}};
  }
  function push(pose,now) {
    if(!published||socket?.readyState!==WebSocket.OPEN||now-lastPush<50||socket.bufferedAmount>200000)return;
    lastPush=now;send({type:'pose',revision,pose,state:state()});
  }
  return {connect,publish,push,get connected(){return socket?.readyState===WebSocket.OPEN;},
    disconnect(){socket?.close();socket=null;published=false;rejectPending();publishing=null;onStatus('接続を停止しました。');}};
}
