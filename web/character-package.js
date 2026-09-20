import {zipFiles} from './assets.js';
import {CHARACTER_RUNTIME} from './character-runtime.js';

const encoder=new TextEncoder();
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function mapTree(value,transform){
 if(typeof value==='string')return transform(value);
 if(Array.isArray(value))return Promise.all(value.map(v=>mapTree(v,transform)));
 if(value&&typeof value==='object'){const result={};for(const [k,v] of Object.entries(value))result[k]=await mapTree(v,transform);return result;}
 return value;
}
export function playbackScene(project){
 const result={};
 for(const k of ['version','id','name','width','height','rig','settings','parts','expressionPresets','rifeMorph'])if(project[k]!==undefined)result[k]=structuredClone(project[k]);
 for(const p of result.parts){
  for(const k of ['previousClosedSvgTexts','legacyClosedSvgText'])delete p[k];
  if(p.artworkSources)p.artworkSources=p.artworkSources[p.artworkSource]?{[p.artworkSource]:p.artworkSources[p.artworkSource]}:{};
 }
 return result;
}
async function imageSize(blob){const bitmap=await createImageBitmap(blob);try{return {width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}}

export async function exportCharacterPackage(project,{request=fetch,progress=()=>{}}={}){
 progress('元の素材と設定をまとめています…');
 const runtime=await (await request('/api/integration-runtime')).json();
 if(runtime.id!==CHARACTER_RUNTIME.id||runtime.behaviorVersion!==CHARACTER_RUNTIME.behaviorVersion||!runtime.build)throw Error('再生処理のバージョンを確認できません。ページを更新してください。');
 const files=[],assets=[],cache=new Map();
 async function asset(url){
  if(cache.has(url))return cache.get(url);
  const task=(async()=>{
   if(!/^data:image\/png;base64,/.test(url)&&!/^\/(?:api|web)\//.test(url))throw Error('素材の参照先に対応していません。プロジェクトを読み直してください。');
   const response=await request(url);if(!response.ok)throw Error('元の画像を読み込めませんでした。');
   const blob=await response.blob(),bytes=new Uint8Array(await blob.arrayBuffer());
   if(bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error('連携用の元画像はPNGである必要があります。');
   const id=await sha256(bytes),path=`assets/${id}.png`;
   if(!assets.some(a=>a.id===id)){assets.push({id,path,mime:'image/png',bytes:bytes.length,...await imageSize(blob)});files.push([path,bytes]);}
   return 'asset:'+id;
  })();cache.set(url,task);return task;
 }
 const scene=await mapTree(playbackScene(project),async value=>{
  if(/^data:image\/png;base64,/.test(value)||/^\/(?:api|web)\/.*\.png(?:\?|$)/i.test(value))return asset(value);
  if(value.includes('<svg')){
   // Preserve every SVG byte other than embedded image URLs, so signatures
   // recover exactly when PNG data URLs are restored by the loader.
   for(const match of [...value.matchAll(/(?:data:image\/png;base64,[A-Za-z0-9+/=]+|\/(?:api|web)\/[^"'<>\s]+\.png)/g)])value=value.replace(match[0],await asset(match[0]));
  }
  return value;
 });
 const sceneText=JSON.stringify(scene),sceneHash=await sha256(encoder.encode(sceneText));
 await mapTree(scene,value=>{
  if(/^https?:|^file:|^[A-Za-z]:[\\/]|^\/(?:api|web)\//.test(value))throw Error('同梱できていない素材があります。画像の参照先を確認してください。');
  if(value.includes('<svg')&&/(?:href\s*=\s*["'](?!#|asset:|data:image\/)|url\(\s*(?!#)[^)]*\))/i.test(value))throw Error('SVG素材に同梱できない外部参照があります。');
  return value;
 });
 const manifest={format:'svg-through.character',formatVersion:'1.0.0',character:{id:project.id,name:project.name},scene:'scene.json',sceneSha256:sceneHash,
  runtime:{...CHARACTER_RUNTIME,build:runtime.build,requiredCapabilities:['mesh','face-jaw','natural-ears','source-artwork']},
  canvas:{width:project.width,height:project.height},assets,presentation:{background:'transparent'},integration:{target:'SpriTalk',receiverStatus:'requires-adapter'}};
 files.push(['manifest.json',JSON.stringify(manifest,null,2)],['scene.json',sceneText],['runtime-sources.json',JSON.stringify(runtime,null,2)],
  ['README.txt','SpriTalk用の再生パッケージです。SpriTalk側の専用読み込み対応が必要です。既存のPachiPaku/MPNGインポーターでは読み込めません。\n元PNG・編集済みの描画データ・差分・支点・変形設定を保持しています。\nmanifest.jsonに指定した同じ共通ランタイムで再生してください。実行コードは同梱していません。\n口と顎にはSpriTalkの発話入力を使い、待機中のデモ口パクは止めてください。\n']);
 progress('専用ZIPを作成しています…');
 return {blob:zipFiles(files),manifest,files};
}

// File map is supplied by the host after safe ZIP extraction. Hashes are checked
// before data is passed to the renderer. Used by the exporter round-trip QA too.
export async function loadCharacterPackage(files,{build}={}){
 const get=name=>{const v=files.get(name);if(v===undefined)throw Error('素材が不足しています: '+name);return typeof v==='string'?encoder.encode(v):v;};
 const decode=name=>new TextDecoder().decode(get(name));
 const manifest=JSON.parse(decode('manifest.json'));
 if(manifest.format!=='svg-through.character'||manifest.formatVersion!=='1.0.0'||manifest.runtime?.id!==CHARACTER_RUNTIME.id||manifest.runtime?.apiVersion!==1||manifest.runtime?.behaviorVersion!==CHARACTER_RUNTIME.behaviorVersion)throw Error('未対応のキャラクター形式です。');
 if(!build||manifest.runtime.build!==build)throw Error('共通ランタイムのビルドが一致しません。');
 if(await sha256(get(manifest.scene))!==manifest.sceneSha256)throw Error('再生設定が破損しています。');
 const urls=new Map();
 for(const a of manifest.assets){
  if(a.path!==`assets/${a.id}.png`||a.mime!=='image/png')throw Error('素材パスが不正です。');
  const bytes=get(a.path);if(bytes.length!==a.bytes||await sha256(bytes)!==a.id)throw Error('画像素材が破損しています。');
  const blob=new Blob([bytes],{type:a.mime}),size=await imageSize(blob);
  if(size.width!==a.width||size.height!==a.height)throw Error('画像寸法が一致しません。');
  const uri=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});urls.set('asset:'+a.id,uri);
 }
 const scene=await mapTree(JSON.parse(decode(manifest.scene)),s=>s.replace(/asset:[a-f0-9]{64}/g,ref=>{if(!urls.has(ref))throw Error('参照画像がありません。');return urls.get(ref);}));
 return {scene,manifest};
}
