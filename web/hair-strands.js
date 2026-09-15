const clamp=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
export function normalizeStrands(list,p){
 if(!Array.isArray(list))return [];
 return list.slice(0,8).filter(s=>s&&['rootX','rootY','tipX','tipY'].every(k=>Number.isFinite(s[k]))).map(s=>{
  const rootY=clamp(s.rootY,0,p.height*.85,0);
  return {rootX:clamp(s.rootX,0,p.width,p.width/2),rootY,tipX:clamp(s.tipX,0,p.width,p.width/2),tipY:clamp(s.tipY,rootY+p.height*.15,p.height,p.height),width:clamp(s.width,p.width*.1,p.width,p.width*.2),gain:clamp(s.gain,0,1.5,1),delay:clamp(s.delay,-1.5,1.5,0)};
 });
}
export function blendStrands(x,y,list,response){
 let total=0,result=0,coverage=0;
 for(const s of list){
  const u=Math.max(0,Math.min(1,(y-s.rootY)/(s.tipY-s.rootY))),cx=s.rootX+(s.tipX-s.rootX)*u;
  const weight=Math.exp(-2*((x-cx)/s.width)**2);
  total+=weight;coverage=Math.max(coverage,weight);result+=weight*response(u,s.gain,s.delay);
 }
 return total>1e-9?result/total*coverage:0;
}
