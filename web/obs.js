import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {loopPose} from './motion.js?v=mouth-editor-9';

const stage=document.getElementById('stage'),info=document.getElementById('info');
info.hidden=!new URLSearchParams(location.search).has('debug');
let renderer=null,project=null,packet=null,received=0,generation=0,revision=0;
let pendingProject=null,preparing=false,fetchAbort=null;
const report=text=>{info.textContent=text;document.title='SVG-Through Motion OBS — '+text;};
// Serialize texture preparation; discard superseded revisions and disconnected sessions.
async function prepareLatest(){
  if(preparing)return;preparing=true;
  try{while(pendingProject){
    pendingProject=null;const token=generation;
    report('素材を準備中');
    try{
      const abort=new AbortController();fetchAbort=abort;
      const timeout=setTimeout(()=>abort.abort(),30000);
      let snapshot;
      try{
        const response=await fetch('/api/control/project',{signal:abort.signal});
        if(!response.ok)throw Error('編集画面から素材を反映してください');
        snapshot=await response.json();
      }finally{clearTimeout(timeout);if(fetchAbort===abort)fetchAbort=null;}
      if(token!==generation)continue;
      const next=snapshot.project;next.settings={...next.settings,background:'transparent'};
      const edge=Math.max(64,Math.min(1080,Number(new URLSearchParams(location.search).get('size'))||1024));
      const ready=await prepareCanvasRenderer(next,edge);
      if(token!==generation||pendingProject){ready.dispose();continue;}
      renderer?.dispose();project=next;renderer=ready;revision=snapshot.revision;
      stage.replaceChildren(renderer.canvas);report('表示中');
    }catch(e){if(token===generation){renderer?.dispose();renderer=null;stage.replaceChildren();report(e.message);}}
  }}finally{preparing=false;}
}
function clear(){generation++;pendingProject=null;fetchAbort?.abort();renderer?.dispose();renderer=project=packet=null;stage.replaceChildren();report('編集画面の接続待ち');}
function connect(){
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/control/socket/obs`);
  ws.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(msg.type==='project'){pendingProject=msg;void prepareLatest();}
    if(msg.type==='pose'){packet=msg;received=performance.now();}
    if(msg.type==='disconnected')clear();
  };
  ws.onclose=()=>{clear();setTimeout(connect,1500);};
  ws.onerror=()=>ws.close();
}
function frame(now){
  if(renderer&&project){
    let pose=loopPose(0,project.settings);
    if(packet?.revision===revision){
      const stale=now-received>1500;
      const t=packet.state.time+(packet.state.playing?(now-received)/1000:0);
      // Continue idle movement if a browser throttles the controller in the background.
      pose={...loopPose(t,project.settings),...packet.pose};
      if(stale){pose=loopPose(t,project.settings);pose.mouth=0;delete pose.vowelWeights;}
    }
    renderer.draw(pose);
  }
  requestAnimationFrame(frame);
}
clear();connect();requestAnimationFrame(frame);
