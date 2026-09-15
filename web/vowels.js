// Simple vowel deformation of existing mouth artwork; teeth/tongue stay in the asset.
export const vowels=['a','i','u','e','o'];
export const vowelScales={a:[.92,1.08],i:[1.18,.30],u:[.48,.48],e:[1.08,.64],o:[.62,1.02]};
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
export function normalizeMouthTuning(value={}){
 const bound=(v,d,min,max)=>Math.max(min,Math.min(max,Number.isFinite(v)?v:d));
 const common=(v={})=>({x:bound(v.x,0,-30,30),y:bound(v.y,0,-30,30),angle:bound(v.angle,0,-45,45)});
 const c=value?.closed||{},o=value?.open||{},out={closed:{...common(c),width:bound(c.width,1,.4,1.8),height:bound(c.height,1,.3,3),thickness:bound(c.thickness,1,.3,3),curve:bound(c.curve,0,-15,15),left:bound(c.left,0,-15,15),right:bound(c.right,0,-15,15),taper:bound(c.taper,.8,0,1),highlight:c.highlight===true,color:/^#[a-f0-9]{6}$/i.test(c.color||'')?c.color:null},open:{...common(o),width:bound(o.width,1,.25,1.8),height:bound(o.height,1,.1,1.8)},vowels:{}};
 const transition=value?.transition||{};out.transition={width:bound(transition.width,1,.5,1.5),height:bound(transition.height,1,.5,1.6)};
 for(const k of vowels){const v=value?.vowels?.[k]||{};out.vowels[k]={...common(v),width:bound(v.width,vowelScales[k][0],.25,1.8),height:bound(v.height,vowelScales[k][1],.1,1.8),teeth:bound(v.teeth,0,0,1),teethWidth:bound(v.teethWidth,.75,.1,1),teethHeight:bound(v.teethHeight,.22,.03,.8),teethY:bound(v.teethY,.27,0,.9),teethColor:/^#[a-f0-9]{6}$/i.test(v.teethColor||'')?v.teethColor:'#fff8ed'};}
 return out;
}
export function vowelWeights(pose={},settings={}){
 if(!settings.vowels)return [0,0,0,0,0];
 if(vowels.includes(pose.vowel))return vowels.map(k=>+(k===pose.vowel));
 const v=pose.vowelWeights;if(!Array.isArray(v)||v.length!==5)return [0,0,0,0,0];
 const w=v.map(clamp),sum=w.reduce((a,b)=>a+b,0);return w.map(v=>sum?v/sum:0);
}
export function vowelScale(pose={},settings={}){
  if(!settings.vowels){const v=normalizeMouthTuning(settings.mouthTuning).open;return [v.width,v.height];}
  const weights=vowelWeights(pose,settings);if(!weights.some(Boolean))return [1,1];
  const tune=normalizeMouthTuning(settings.mouthTuning);
  return ['width','height'].map(key=>weights.reduce((v,w,i)=>v+w*tune.vowels[vowels[i]][key],0));
}
export function cycleVowels(phase){
  const t=((phase%1)+1)%1*5,index=Math.floor(t),fraction=t-index;
  const blend=clamp((fraction-.8)/.2),weights=Array(5).fill(0);weights[index]=1-blend;weights[(index+1)%5]=blend;return weights;
}
const rows=['あかがさざただなはばぱまゃやらゎわぁ','いきぎしじちぢにひびぴみりゐぃ','うくぐすずつづぬふぶぷむゅゆるゔぅ','えけげせぜてでねへべぺめれゑぇ','おこごそぞとどのほぼぽもょよろをぉ'];
export function kanaTrack(text){
  const kana=String(text).normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
  if(/[一-龯々A-Za-z0-9]/.test(kana))return []; // Require an explicit reading for ambiguous text.
  const tokens=[];let previous='a';
  for(const c of kana){
    if(c==='ー'){tokens.push({vowel:previous,weight:1});continue;}
    if(c==='ん'||c==='っ'){tokens.push({vowel:null,weight:c==='っ'?.6:.8});continue;}
    if(/[、。！？!?…\s]/.test(c)){tokens.push({vowel:null,weight:c==='、'?.65:1});continue;}
    const index=rows.findIndex(row=>row.includes(c));if(index<0)continue;
    previous=vowels[index];
    if('ゃゅょぁぃぅぇぉ'.includes(c)&&tokens.length&&tokens.at(-1).vowel)tokens.at(-1).vowel=previous;
    else tokens.push({vowel:previous,weight:1});
  }
  return tokens;
}
export function timedVowel(tokens,time,duration){
  if(!tokens.length||!Number.isFinite(duration)||duration<=0||time<0||time>=duration)return null;
  const total=tokens.reduce((s,t)=>s+t.weight,0),target=time/duration*total;let end=0;
  for(const token of tokens){end+=token.weight;if(target<end)return token.vowel;}
  return null;
}
