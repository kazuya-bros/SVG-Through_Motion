// Base selection and overlapping temporary expressions have separate lifetimes.
export function createExpressionSelection(initial=0){
 let selected=initial;const held=new Map();
 return {
  get current(){return held.size?[...held.values()].at(-1):selected;},
  select(index){selected=index;held.clear();},
  hold(key,index){if(!held.has(key))held.set(key,index);},
  release(key){held.delete(key);},
  releaseAll(){held.clear();},
 };
}
