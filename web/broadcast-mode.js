export const inputModes=['idle','mic','camera','api'];
export function createModeSwitch({initial='idle',reception,stopInputs,changed}){
 let mode=inputModes.includes(initial)?initial:'idle',busy=false;
 return {get mode(){return mode;},get busy(){return busy;},async select(next){
  if(!inputModes.includes(next))throw Error('動かし方を選んでください。');
  if(busy||next===mode)return false;
  busy=true;
  try{await reception(next==='api');stopInputs();mode=next;changed(next);return true;}
  finally{busy=false;}
 }};
}
export function broadcastView(params){
 const number=(key,fallback,min,max)=>{const raw=params.get(key),v=raw===null?fallback:Number(raw);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;};
 return {x:number('viewX',0,-4,4),y:number('viewY',0,-4,4),scale:number('viewScale',1,.25,8)};
}
