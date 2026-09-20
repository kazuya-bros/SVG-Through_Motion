import {defaultScene,exampleRecipes} from './stage-model.js';

export function installStageControls({host,sid,onReset=()=>{}}){
 const root=document.createElement('section');root.className='stage-controls';
 root.innerHTML=`<h2>AIと演出</h2><label class="toggle">AIに任せる<input data-field="ai" type="checkbox"></label>
 <p class="tiny">AIが字幕・画像・表情・動きを一時変更できます。通常に戻すと、保存した見た目に戻ります。</p>
 <button class="wide" data-action="reset">通常に戻す</button><p class="tiny" data-field="state" role="status">接続を待っています</p>
 <label>演技プリセット<select data-field="preset"></select></label><button class="wide primary" data-action="play">この演技を試す</button><button class="wide" data-action="refresh">登録画像・プリセットを更新</button><button class="wide" data-action="current">実行中の演技を編集欄に取り込む</button>
 <details><summary>字幕と通常の見た目</summary>
 <label class="toggle">字幕を表示<input data-field="enabled" type="checkbox" checked></label>
 <label>字幕の内容<select data-field="source"><option value="speech">発話に合わせて自動表示</option><option value="text">入力した文字を表示</option></select></label>
 <p class="tiny">自動字幕は、このアプリからの発話が対象です。マイクの文字起こしは含みません。</p>
 <label>表示する文字<textarea data-field="text" rows="3" maxlength="2000" placeholder="お知らせや、演技に添える言葉"></textarea></label>
 <div class="stage-grid"><label>文字サイズ<input data-field="size" type="number" min="16" max="100" value="42"></label><label>文字色<input data-field="color" type="color" value="#ffffff"></label></div>
 <div class="stage-grid"><label>縁取り色<input data-field="outline" type="color" value="#202535"></label><label>書体<select data-field="font"><option value="sans">ゴシック</option><option value="serif">明朝</option><option value="mono">等幅</option></select></label></div>
 <label>字幕の高さ<input data-field="y" type="range" min=".1" max=".9" step=".01" value=".84"></label>
 <label>文字の出し方<select data-field="reveal"><option value="instant">まとめて表示</option><option value="typewriter">一文字ずつ</option></select></label>
 <label>動きの強さ<input data-field="movement" type="range" min="0" max="2" step=".05" value="1"></label>
 <label>重ねる効果<select data-field="effect"><option value="none">なし</option><option value="comms">通信中</option><option value="happy">幸せの光</option></select></label>
 <button class="wide" data-action="baseline">通常の見た目として適用</button></details>
 <details><summary>演出画像</summary><p class="tiny">AIが生成した画像や手持ちのPNG・JPEG・WebPを登録できます。画像生成は外部ツールで行います。</p>
 <label>画像の名前<input data-field="assetName" maxlength="80" placeholder="月と雲"></label><label>画像ファイル<input data-field="file" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="wide" data-action="upload">画像を登録</button>
 <label>登録した画像<select data-field="asset"></select></label><button class="wide" data-action="add">この画像を配置に追加</button><div data-field="layers"></div><p class="tiny">配置を編集したら「通常の見た目として適用」か、下の演技の工程へ取り込みます。</p></details>
 <details><summary>演技を組み立てる</summary><p class="tiny">字幕・画像・動きを上で調整し、工程へ取り込めます。AIも同じ形式で演技を作って保存できます。</p>
 <label>演技の名前<input data-field="recipeName" maxlength="60"></label><div class="stage-grid"><label>長さ（秒）<input data-field="duration" type="number" min="1" max="120" value="8"></label><label>切替（秒）<input data-field="transition" type="number" min=".1" max="3" step=".1" value=".6"></label></div>
 <label class="toggle">発話が終わったら戻す<input data-field="bound" type="checkbox"></label><label>編集する工程<select data-field="step"></select></label>
 <button class="wide" data-action="loadStep">この工程を編集欄に読み込む</button><button class="wide" data-action="replaceStep">編集欄の設定で工程を更新</button>
 <label>追加する工程の開始（秒）<input data-field="at" type="number" min=".1" max="119" step=".5" value="4"></label><button class="wide" data-action="addStep">編集欄から工程を追加</button><button class="wide" data-action="removeStep">選んだ工程を外す</button>
 <button class="wide primary" data-action="save">新しいプリセットとして保存</button><p class="tiny">保存した画像と演技は、アプリを再起動しても残ります。現在の通常設定は出力ウィンドウ単位です。</p></details>
 <p class="tiny stage-message" data-field="message" role="status"></p>`;
 host.append(root);const field=k=>root.querySelector(`[data-field="${k}"]`),button=k=>root.querySelector(`[data-action="${k}"]`);
 let state=null,scene=defaultScene(),recipes=exampleRecipes(),recipe=structuredClone(recipes[0]),library={assets:[],presets:[]},busy=false,connected=false,dirty=false,baselineKey='';
 const base='/api/stage/sessions/'+sid;
 function message(text){field('message').textContent=text;}
 async function request(path,method='GET',body){const response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw Error(typeof value.detail==='string'?value.detail:'入力した設定を確認してください');return value;}
 function available(){for(const b of root.querySelectorAll('button'))b.disabled=busy||!connected;field('ai').disabled=busy||!connected;}
 async function work(fn){if(busy)return;busy=true;available();message('');try{await fn();}catch(e){message(e.message);if(e.message.includes('更新'))state=await request(base).catch(()=>state);}finally{busy=false;available();}}
 function fillScene(value){scene=structuredClone(value);for(const k of ['enabled','source','text','size','color','outline','font','y','reveal']){if(k==='enabled')field(k).checked=scene.caption[k];else field(k).value=scene.caption[k];}field('movement').value=scene.movement;field('effect').value=scene.effect;drawLayers();dirty=false;}
 function readScene(){const value=structuredClone(scene);for(const k of ['source','text','color','outline','font','reveal'])value.caption[k]=field(k).value;value.caption.enabled=field('enabled').checked;for(const k of ['size','y'])value.caption[k]=Number(field(k).value);value.movement=Number(field('movement').value);value.effect=field('effect').value;return value;}
 function choices(){const selected=recipes.findIndex(r=>JSON.stringify(r)===JSON.stringify(recipe));field('preset').replaceChildren(...recipes.map((r,i)=>new Option(r.name,String(i))));if(selected<0)field('preset').add(new Option('編集中：'+recipe.name,'draft'));field('preset').value=selected<0?'draft':String(selected);}
 function fillRecipe(){field('recipeName').value=recipe.name;field('duration').value=recipe.duration;field('transition').value=recipe.transition;field('bound').checked=recipe.until_speech_end;drawSteps();choices();}
 function readRecipe(){return {...structuredClone(recipe),name:field('recipeName').value,duration:Number(field('duration').value),transition:Number(field('transition').value),until_speech_end:field('bound').checked};}
 function drawSteps(){field('step').replaceChildren(...recipe.steps.map((s,i)=>new Option(`${i+1}. ${s.at}秒から`,String(i))));}
 function drawLayers(){
  const holder=field('layers');holder.replaceChildren();scene.overlays.forEach((o,index)=>{
   const item=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=library.assets.find(a=>a.id===o.asset_id)?.name||'演出画像';item.append(legend);
   for(const [key,label,options] of [['anchor','基準',[['canvas','画面'],['head','頭の位置']]],['layer','重なり',[['back','キャラの後ろ'],['front','キャラの前']]],['motion','動き',[['still','静止'],['float','浮かぶ'],['pulse','脈動'],['orbit','小さく周回']]]]){const l=document.createElement('label');l.textContent=label;const input=document.createElement('select');for(const [v,t] of options)input.add(new Option(t,v));input.value=o[key];input.onchange=()=>{o[key]=input.value;if(key==='anchor'){o.x=input.value==='head'?0:.5;o.y=input.value==='head'?-.2:.3;drawLayers();}dirty=true;};l.append(input);item.append(l);}
   for(const [key,label,min,max,step] of [['x','左右',-1,1.5,.01],['y','上下',-1,1.5,.01],['scale','大きさ',.02,1.5,.01],['opacity','濃さ',0,1,.05],['rotation','角度',-180,180,1]]){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');Object.assign(input,{type:'range',min,max,step,value:o[key]});input.oninput=()=>{o[key]=Number(input.value);dirty=true;};l.append(input);item.append(l);}
   const remove=document.createElement('button');remove.textContent='配置から外す';remove.onclick=()=>{scene.overlays.splice(index,1);dirty=true;drawLayers();};item.append(remove);holder.append(item);
  });
 }
 async function refreshLibrary(){library=await request('/api/stage/library');recipes=[...exampleRecipes(),...library.presets.map(p=>p.recipe)];choices();field('asset').replaceChildren(...library.assets.map(a=>new Option(a.name,a.id)));drawLayers();}
 async function configure(mode,baseline){state=await request(base,'PUT',{revision:state.revision,mode,...(baseline?{baseline}:{})});update(state);}
 function update(value){state=value;field('ai').checked=value.mode==='ai';field('state').textContent=value.active?`${value.active.recipe.name} · ${value.active.started_at==null?'画像を準備中':'演技中'}`:value.mode==='ai'?'AI制御を受け付けています':'通常の設定で動いています';}
 field('ai').onchange=()=>void work(()=>configure(field('ai').checked?'ai':'fixed'));
 button('reset').onclick=()=>void work(async()=>{await configure(state.mode);onReset();});
 button('refresh').onclick=()=>void work(async()=>{await refreshLibrary();message('登録画像・プリセットを更新しました');});
 button('current').onclick=()=>{if(!state?.active)return message('現在、演技は実行されていません');recipe=structuredClone(state.active.recipe);fillRecipe();fillScene(recipe.steps[0].scene);message('AIの演技を編集欄に取り込みました。調整して新しく保存できます');};
 button('baseline').onclick=()=>void work(async()=>{await configure(state.mode,readScene());dirty=false;message('通常の見た目を更新しました');});
 field('preset').onchange=()=>{if(field('preset').value==='draft')return;recipe=structuredClone(recipes[Number(field('preset').value)]);fillRecipe();};
 button('play').onclick=()=>void work(async()=>{if(state.mode!=='ai')await configure('ai');const result=await request(base+'/perform','POST',{request_id:crypto.randomUUID(),revision:state.revision,recipe:readRecipe()});message('演技を受け付けました');state=await request(base);update(state);});
 button('upload').onclick=()=>void work(async()=>{const file=field('file').files[0];if(!file)throw Error('登録する画像を選んでください');const form=new FormData();form.append('file',file);form.append('name',field('assetName').value||file.name);const r=await fetch('/api/stage/assets',{method:'POST',body:form}),v=await r.json();if(!r.ok)throw Error(typeof v.detail==='string'?v.detail:'画像を登録できません');await refreshLibrary();field('asset').value=v.id;message('画像を登録しました。配置に追加して使えます');});
 button('add').onclick=()=>{if(scene.overlays.length>=8)return message('配置は8枚までです');if(!field('asset').value)return message('画像を登録してください');scene.overlays.push({asset_id:field('asset').value,anchor:'canvas',layer:'back',x:.5,y:.3,scale:.3,opacity:.8,rotation:0,motion:'float'});dirty=true;drawLayers();};
 button('loadStep').onclick=()=>{fillScene(recipe.steps[Number(field('step').value)].scene);message('工程を編集欄に読み込みました');};
 button('replaceStep').onclick=()=>{recipe.steps[Number(field('step').value)].scene=readScene();choices();message('工程を更新しました。「この演技を試す」で確認できます');};
 button('addStep').onclick=()=>{const at=Number(field('at').value);if(recipe.steps.length>=8||at<=0||at>=Number(field('duration').value)||recipe.steps.some(s=>s.at===at))return message('工程は8件まで、開始時刻は重複せず演技時間内に指定してください');recipe.steps.push({at,scene:readScene()});recipe.steps.sort((a,b)=>a.at-b.at);drawSteps();};
 button('removeStep').onclick=()=>{const i=Number(field('step').value);if(i===0)return message('最初の工程は残してください');recipe.steps.splice(i,1);drawSteps();};
 button('save').onclick=()=>void work(async()=>{const saved=await request('/api/stage/presets','POST',{request_id:crypto.randomUUID(),recipe:readRecipe()});await refreshLibrary();field('preset').value=String(recipes.length-1);recipe=saved.recipe;fillRecipe();message('新しい演技プリセットを保存しました');});
 root.addEventListener('input',()=>{dirty=true;});fillScene(scene);fillRecipe();available();
 void refreshLibrary().catch(e=>message(e.message));
 return {update(value){update(value);const key=JSON.stringify(value.baseline);if(key!==baselineKey&&!dirty)fillScene(value.baseline);baselineKey=key;},connection(v){connected=v;available();},error:message,close(){root.remove();}};
}
