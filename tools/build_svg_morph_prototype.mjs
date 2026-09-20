// Self-contained file: opens by double-click without a server or installed app.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {validateTrack} from '../web/svg-keyframes.js';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
const core=(await read('web/svg-keyframes.js')).replace(/^export /gm,'');
const ui=(await read('web/svg-keyframe-prototype.js')).replace(/^import [^\n]*\n/,'');
let html=(await read('web/svg-keyframe-prototype.html')).replace('<script type="module" src="./svg-keyframe-prototype.js"></script>',()=>`<script type="module">\n${core}\n${ui}\n</script>`);
const dataPath=process.argv[2];
if(dataPath){
  const data=JSON.parse(await readFile(dataPath,'utf8'));
  for(const key of ['eye','mouth']){
    validateTrack(data.cases[key].track);
    if(data.cases[key].references.length!==5||data.cases[key].references.some(v=>!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)))throw Error('Invalid reference images');
  }
  // The head-direction experiment was stopped. Keep old results on disk only.
  delete data.headTurn;
  html=html.replace('<script type="application/json" id="rifeData">null</script>',()=>'<script type="application/json" id="rifeData">'+JSON.stringify(data).replaceAll('<','\\u003c')+'</script>');
}
const directory=new URL('output/prototypes/',root);await mkdir(directory,{recursive:true});
const file=new URL(dataPath?'svg-rife-keyframe-morph.html':'svg-keyframe-morph.html',directory);await writeFile(file,html);console.log(file.pathname);
