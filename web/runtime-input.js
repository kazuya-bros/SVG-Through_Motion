// Same-browser controls for the separately opened output. No audio leaves the microphone page.
export function outputChannel(session){return new BroadcastChannel('svg-through-output-'+session);}
export function outputBackground(value){return value==='transparent'||/^#[0-9a-f]{6}$/i.test(value)?value:'#00ff00';}

export function createOutputReceiver(session,{onBackground=()=>{},now=()=>performance.now()}={}){
 const channel=outputChannel(session);let mouth=0,received=-Infinity,closed=false,enabled=false,camera=null,cameraReceived=-Infinity;
 const alive=()=>channel.postMessage({type:'output-alive'});
 channel.onmessage=({data})=>{
  if(data.type==='ping')alive();
  if(data.type==='microphone'&&Number.isFinite(data.mouth)){mouth=Math.max(0,Math.min(1,data.mouth));enabled=data.enabled!==false;received=now();}
  if(data.type==='camera'){
   if(data.enabled===false)camera=null;
   else if(['blinkL','blinkR','mouth'].every(key=>Number.isFinite(data.pose?.[key]))){camera=Object.fromEntries(['blinkL','blinkR','mouth'].map(key=>[key,Math.max(0,Math.min(1,data.pose[key]))]));cameraReceived=now();}
  }
  if(data.type==='background')onBackground(outputBackground(data.value));
 };
 const timer=setInterval(alive,500);alive();
 return {active:()=>enabled&&now()-received<1500||!!camera&&now()-cameraReceived<1500,microphoneActive:()=>enabled&&now()-received<1500,camera:()=>now()-cameraReceived<1500?camera:null,mouth:()=>enabled&&now()-received<1500?mouth:0,close(){if(closed)return;closed=true;clearInterval(timer);channel.postMessage({type:'output-closed'});channel.close();}};
}

export function createOutputSender({onConnection=()=>{}}={}){
 let channel=null,session=null,seen=-Infinity,connected=false;
 function setConnected(value){if(value!==connected){connected=value;onConnection(value);}}
 const timer=setInterval(()=>{channel?.postMessage({type:'ping'});setConnected(performance.now()-seen<3000);},500);
 return {
  get connected(){return connected;},
  select(id){if(session===id)return;channel?.close();session=id;seen=-Infinity;setConnected(false);channel=id?outputChannel(id):null;
   if(channel){channel.onmessage=({data})=>{if(data.type==='output-alive'){seen=performance.now();setConnected(true);}if(data.type==='output-closed'){seen=-Infinity;setConnected(false);}};channel.postMessage({type:'ping'});}},
  mouth(value,enabled=true){if(connected)channel.postMessage({type:'microphone',mouth:value,enabled});},
  camera(pose){if(connected)channel.postMessage({type:'camera',pose,enabled:!!pose});},
  background(value){channel?.postMessage({type:'background',value:outputBackground(value)});},
  close(){clearInterval(timer);channel?.close();setConnected(false);}
 };
}
