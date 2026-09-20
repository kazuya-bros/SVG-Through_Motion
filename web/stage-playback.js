import {defaultScene,stageFrame,recipeAssets} from './stage-model.js';
import {lookAssets} from './broadcast-look.js';

export function createStagePlayback({renderer,send,changed=()=>{},error=()=>{},display=false}){
 let state={revision:0,mode:'fixed',baseline:defaultScene(),active:null},ready=false,localStart=null,reported='',generation=0;
 function notify(){changed(state);}
 return {get state(){return state;},
  receive(value){
   if(!value)return;
   const old=state.active?.request_id;state=structuredClone(value);const token=++generation;
   if(old!==state.active?.request_id){localStart=null;reported='';}
   ready=false;notify();
   const ids=[...state.baseline.overlays.map(o=>o.asset_id),...lookAssets(state.baseline.appearance),...(state.active?recipeAssets(state.active.recipe):[])];
   Promise.all(ids.map(id=>renderer.load(id))).then(()=>{if(token!==generation)return;ready=true;if(state.active&&state.active.started_at==null&&!display)localStart=Date.now()/1000;}).catch(e=>{
    if(token!==generation)return;error(e.message);if(state.active&&!display)send({type:'stage_result',request_id:state.active.request_id,status:'failed',error:e.message});state.active=null;notify();
   });
  },frame(now){
   let value=state;
   if(!ready)value={...state,active:null};
   else if(value.active&&value.active.started_at==null&&!display)value={...state,active:{...state.active,started_at:localStart}};
   return stageFrame(value,now);
  },deferStart(now){
   // Texture rebuilding must not consume a performance's visible duration.
   if(!display&&state.active&&state.active.started_at==null)localStart=now;
  },rendered(frame){
   if(display||!ready||!state.active||frame.phase==='idle')return;
   if(reported!==frame.phase){reported=frame.phase;send({type:'stage_result',request_id:state.active.request_id,status:frame.phase});}
  },speechEnded(){
   if(!display&&state.active?.recipe.until_speech_end){send({type:'stage_result',request_id:state.active.request_id,status:'interrupted'});state.active=null;generation++;notify();}
  },reset(){generation++;state={...state,mode:'fixed',active:null};ready=false;reported='';notify();}
 };
}
