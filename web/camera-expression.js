const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
export function cameraExpression(categories,previous={},options={}){
 const c=Object.fromEntries(categories.map(v=>[v.categoryName,clamp(v.score)])),v=key=>c[key]||0;
 const gain=options.expressionStrength??.5,sign=options.mirror?-1:1;
 const horizontal=(v('eyeLookInLeft')-v('eyeLookOutLeft')+v('eyeLookOutRight')-v('eyeLookInRight'))/2;
 const vertical=(v('eyeLookDownLeft')+v('eyeLookDownRight')-v('eyeLookUpLeft')-v('eyeLookUpRight'))/2;
 const target={irisX:horizontal*16*gain*sign,irisY:vertical*10*gain,
  browL:(v('browInnerUp')+v('browOuterUpLeft')-v('browDownLeft'))*gain,
  browR:(v('browInnerUp')+v('browOuterUpRight')-v('browDownRight'))*gain};
 if(options.swap)[target.browL,target.browR]=[target.browR,target.browL];
 return Object.fromEntries(Object.entries(target).map(([k,value])=>[k,gain===0?0:(previous[k]||0)*.55+value*.45]));
}
