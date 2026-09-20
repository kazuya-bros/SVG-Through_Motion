const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch(),page=await browser.newPage();await page.goto('http://127.0.0.1:18809/web/player.html?display=1');
 const result=await page.evaluate(async()=>{
  const {createCharacterEffectsRenderer}=await import('/web/character-effects-renderer.js');const {effectCue}=await import('/web/character-effects.js');
  const source=document.createElement('canvas');source.width=source.height=200;const c=source.getContext('2d');c.fillStyle='#e08040';c.fillRect(40,40,120,120);
  const fx=createCharacterEffectsRenderer(source,{width:200,height:200}),x=fx.canvas.getContext('2d');
  const centroid=()=>{const d=x.getImageData(0,0,200,200).data;let sx=0,sy=0,n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>100){n++;sx+=(i/4)%200;sy+=Math.floor(i/4/200)}return[sx/n,sy/n,n]};
  const centers={};for(const direction of ['left','right','up','down']){fx.draw(effectCue({preset:'bounce',duration:2,strength:1,direction},0),1);centers[direction]=centroid();}
  const reveals={};for(const direction of ['left','right','up','down']){fx.draw(effectCue({preset:'ink',duration:2,strength:1,direction},0),1.1);reveals[direction]=centroid();}
  fx.dispose();
  const {createFaceTexture}=await import('/web/broadcast-look-renderer.js'),{defaultLook}=await import('/web/broadcast-look.js');const face={faceBase:true,x:40,y:40,width:120,height:120};const draw=createFaceTexture(),project={width:200,height:200};
  const a=draw(source,face,project,{...defaultLook(),emotion:'sweat',emotion_strength:1,sweat_x:-.2,sweat_y:0}),b=draw(source,face,project,{...defaultLook(),emotion:'sweat',emotion_strength:1,sweat_x:.2,sweat_y:0});
  const px=(image,at)=>[...image.getContext('2d').getImageData(at,100,1,1).data];
  return{centers,reveals,atLeft:[px(a,76),px(b,76)],atRight:[px(a,124),px(b,124)]};
 });
 assert(result.centers.left[0]<90&&result.centers.right[0]>110);assert(result.centers.up[1]<90&&result.centers.down[1]>110);
 assert(result.reveals.left[0]>110&&result.reveals.right[0]<90);assert(result.reveals.up[1]>110&&result.reveals.down[1]<90);
 assert.notDeepEqual(...result.atLeft);assert.notDeepEqual(...result.atRight);console.log('Direction rendering and movable sweat pixels passed');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
