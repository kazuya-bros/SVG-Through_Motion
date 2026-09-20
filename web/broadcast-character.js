import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {colorProject,defaultLook} from './broadcast-look.js';
import {paddedViewport} from './render-viewport.js';
import {createFaceTexture} from './broadcast-look-renderer.js';
export async function prepareBroadcastCharacter(project,edge=1080,status=()=>{}){
 let look=defaultLook(),disposed=false,desired='[]',applied='[]',timer=null,busy=false,failed='';
 const texture=createFaceTexture(),options={croppedCompositing:true,outputPadding:Math.max(project.width,project.height)*.15,texture:(image,part,p)=>options.onlyPart?image:texture(image,part,p,look)};
 let current=await prepareCanvasRenderer(project,edge,options);
 const canvas=document.createElement('canvas');canvas.width=current.canvas.width;canvas.height=current.canvas.height;const c=canvas.getContext('2d'),scale=Math.min(1,edge/project.width,edge/project.height);canvas.viewport=paddedViewport(project,Math.ceil(options.outputPadding*scale)/scale);
 async function rebuild(){timer=null;if(disposed||busy)return;const key=desired;busy=true;status('パーツの色を反映しています…');let next;
  try{next=await prepareCanvasRenderer(colorProject(project,JSON.parse(key)),edge,options);if(disposed||key!==desired){next.dispose();return}const old=current;current=next;applied=key;failed='';old.dispose();status('見た目を反映しました');}
  catch(error){failed=key;status('色変更に失敗しました: '+error.message)}
  finally{busy=false;if(!disposed&&desired!==applied&&desired!==failed)timer=setTimeout(rebuild,150)}
 }
 return{canvas,get ready(){return applied===desired},get error(){return failed===desired?'パーツの色を描画できませんでした':null},
 pick(x,y,pose){if(x<0||x>=1||y<0||y>=1)return null;try{for(const part of [...project.parts].reverse().filter(p=>p.visible)){options.onlyPart=part.id;current.draw(pose);const pixel=current.canvas.getContext('2d').getImageData(Math.floor(x*canvas.width),Math.floor(y*canvas.height),1,1).data;if(pixel[3]>80)return {part,color:'#'+[...pixel].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')};}return null;}finally{delete options.onlyPart;current.draw(pose);}},
 draw(pose,value){look={...defaultLook(),...value};const key=JSON.stringify(look.colors);if(key!==desired){desired=key;failed='';clearTimeout(timer);timer=setTimeout(rebuild,180)}current.draw(pose);c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(current.canvas,0,0)},dispose(){disposed=true;clearTimeout(timer);current.dispose();canvas.width=canvas.height=1}};
}
