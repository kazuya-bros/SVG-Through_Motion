// Coordinate-only SVG morph tracks. No raster frames or inference at playback.
const arity={M:2,C:6,Z:0};
export function validateTrack(value){
  if(value?.version!==1||!Array.isArray(value.commands)||value.commands[0]!=='M'||value.commands.at(-1)!=='Z'||value.commands.length<3||value.commands.length>128||value.commands.slice(1,-1).some(c=>c!=='C'))throw Error('M / C / Zで構成した閉じたパスが必要です。');
  const count=value.commands.reduce((n,c)=>n+arity[c],0),frames=value.frames;
  if(!Array.isArray(frames)||frames.length<2||frames.length>33||frames[0]?.at!==0||frames.at(-1)?.at!==1)throw Error('0と1を含む2〜33個のキーフレームが必要です。');
  for(let i=0;i<frames.length;i++){
    const f=frames[i];
    if(!Number.isFinite(f.at)||f.at<0||f.at>1||(i&&f.at<=frames[i-1].at)||!Array.isArray(f.points)||f.points.length!==count||f.points.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))throw Error('時刻の順序、座標数、座標の値を確認してください。');
  }
  return {version:1,commands:[...value.commands],frames:frames.map(f=>({at:f.at,points:[...f.points]}))};
}
export function sampleTrack(track,value,{endpointsOnly=false}={}){
  if(!Number.isFinite(value))throw Error('開閉値は数値で指定してください。');
  const t=Math.max(0,Math.min(1,value)),frames=endpointsOnly?[track.frames[0],track.frames.at(-1)]:track.frames;
  let i=0;while(i<frames.length-2&&t>=frames[i+1].at)i++;
  const a=frames[i],b=frames[i+1],ratio=(t-a.at)/(b.at-a.at);
  return {from:a.at,to:b.at,ratio,points:a.points.map((n,k)=>n+(b.points[k]-n)*ratio)};
}
export function pathData(commands,points){
  let offset=0;
  return commands.map(c=>c+' '+points.slice(offset,offset+=arity[c]).map(n=>+n.toFixed(4)).join(' ')).join(' ');
}
export function retimeEyeTrack(value,strength=1){
  const track=validateTrack(value);
  if(!Number.isFinite(strength)||strength<0||strength>1)throw Error('補正の強さは0〜1で指定してください。');
  if(track.commands.join()!=='M,C,C,Z')throw Error('この補正は2本の曲線で作った目の輪郭専用です。');
  // Midpoint gap between the two cubic eyelids. Their endpoints are shared.
  const gaps=track.frames.map(({points:p})=>.375*(p[9]+p[11]-p[3]-p[5]));
  const span=gaps[0]-gaps.at(-1);
  if(span<=1e-6||gaps.some((gap,i)=>gap<-.00001||(i&&gap>gaps[i-1]+.00001)))throw Error('開眼から閉眼へ、順に閉じる形状が必要です。');
  if(strength===0)return track;
  const closure=gaps.map(gap=>(gaps[0]-gap)/span),original=track.frames;
  // Invert measured closure, then bake the remapping into the same five keys.
  // Playback and SVG export need no image processing or extra runtime channel.
  track.frames=original.map((frame,index)=>{
    if(index===0||index===original.length-1)return frame;
    let right=1;while(right<closure.length-1&&closure[right]<frame.at)right++;
    const left=right-1,f=(frame.at-closure[left])/(closure[right]-closure[left]);
    const correctedTime=original[left].at+(original[right].at-original[left].at)*f;
    const time=frame.at+(correctedTime-frame.at)*strength;
    return {at:frame.at,points:sampleTrack({...track,frames:original},time).points};
  });
  return track;
}
export function demoTrack(kind='eye'){
  // Hand-authored targets to test playback. These are NOT RIFE results.
  const shapes=kind==='eye'?[[80,42,151,100],[79,72,153,101],[78,112,151,104],[76,140,145,109],[74,145,145,114]]:
    [[65,100,102,100],[56,96,130,99],[65,78,164,100],[74,65,183,100],[78,61,188,100]];
  // Matching horizontal handles let the two eyelids meet exactly at closure.
  const lowerHandle=kind==='eye'?.62:.75;
  return {version:1,commands:['M','C','C','Z'],frames:shapes.map(([width,upper,lower,corner],i)=>({at:i/4,points:[120-width,corner,120-width*.62,upper,120+width*.62,upper,120+width,corner,120+width*lowerHandle,lower,120-width*lowerHandle,lower,120-width,corner]}))};
}
