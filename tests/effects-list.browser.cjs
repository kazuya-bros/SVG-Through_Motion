const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.AVATAR_TEST_URL||'http://127.0.0.1:18811',out='output/verification/';
(async()=>{const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
const project=(await(await page.request.get(base+'/api/runtime/sessions/07d63c6946df4eb68c610c0d28128918/project')).json()).project;
const created=await page.request.post(base+'/api/runtime/sessions',{data:{project,tts:{engine:'browser'},accepting:false,ai_enabled:false}});assert.equal(created.status(),201);const sid=(await created.json()).session_id,url=base+'/web/effects-editor.html?session='+sid;
await page.goto(url);await page.waitForFunction(()=>!document.querySelector('#effectPreview')?.disabled,{},{timeout:120000});const root=page.locator('#avatarActions');
assert.equal(await page.locator('[data-visible]').count(),0);assert.equal(await page.locator('#stage #effectPreview,#stage #effectStop').count(),2);
await page.locator('#effectAdd').click();await root.locator('[data-name]').fill('笑顔と照れ・縁取り');
for(const k of ['expression','blush','outline']){await root.locator('[data-kind]').selectOption(k);await root.locator('[data-add]').click();}
assert.equal(await root.locator('[data-components] [data-component]').count(),3);
await root.locator('[data-component=expression]').click();assert.equal(await root.locator('[data-group]:visible').count(),0);assert.equal(await root.locator('[data-editing-component]').count(),1);await root.locator('.avatar-component').first().locator('select').selectOption('1');
await root.locator('[data-component=outline]').click();assert.equal(await root.locator('[data-group]:visible').count(),1);await root.locator('[data-look=outline_width]').fill('8');
await root.locator('[data-component=blush]').click();assert.equal(await root.locator('[data-editing-component]').count(),0);assert.equal(await root.locator('[data-group]:visible').count(),2);await root.locator('[data-look=blush_rotation]').fill('12');
await page.locator('[data-look=blush_scale]').fill('0.65');await page.locator('[data-look=blush_scale]').dispatchEvent('input');
const save=async()=>{await root.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('#avatarActions > [data-status]').textContent.startsWith('保存しました'));return page.locator('.effect-list-item.selected').getAttribute('data-id');};
const id=await save();const saved=(await(await page.request.get(base+'/api/avatar/presets')).json()).find(r=>r.id===id);assert.equal(saved.action.appearance.blush_rotation,12);assert.equal(saved.action.appearance.outline_width,8);assert.equal(saved.action.components.find(c=>c.kind==='expression').expression_index,1);assert.equal(await page.locator('.effect-list-item.selected li').count(),3);
await page.locator('.effect-list-item.selected summary').click();assert.equal(await page.locator('.effect-list-item.selected').getAttribute('open'),null);await page.locator('.effect-list-item.selected summary').click();
await page.locator('#effectPreview').click();await page.waitForTimeout(6500);assert(await page.locator('#effectStop').isEnabled());assert.equal(await page.locator('#effectPreviewStatus').textContent(),'停止・切替まで表示');
await root.locator('[data-name]').scrollIntoViewIfNeeded();await page.screenshot({path:out+'effects-list-layout.png'});
const alpha=()=>page.locator('#stage canvas').evaluate(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=3;i<a.length;i+=4)if(a[i]>100)count++;return count;});assert(await alpha()>1000);
// Selecting another row replaces a running preview; plain hide persists as well.
await page.locator('[data-id="'+ '0'.repeat(32)+'"] summary').click();await page.waitForTimeout(500);assert.equal(await alpha(),0);await page.waitForTimeout(4200);assert.equal(await alpha(),0);
await page.locator('#effectStop').click();await page.waitForTimeout(250);assert(await alpha()>1000);
await page.locator('#effectAdd').click();await root.locator('[data-name]').fill('消えるテスト');await root.locator('[data-kind]').selectOption('dissolve');await root.locator('[data-add]').click();await root.locator('.avatar-component input[type=number]').fill('0.5');await root.locator('[data-duration]').evaluate(e=>{e.value='.5';e.dispatchEvent(new Event('input',{bubbles:true}));});
const deletedId=await save();await page.locator('#effectPreview').click();await page.waitForTimeout(1500);assert.equal(await alpha(),0);await page.waitForTimeout(1000);assert.equal(await alpha(),0);
page.once('dialog',d=>d.accept());await page.locator('#effectDelete').click();await page.waitForFunction(id=>!document.querySelector('[data-id="'+id+'"]'),deletedId);assert(await alpha()>1000);
assert(!(await(await page.request.get(base+'/api/avatar/presets')).json()).some(r=>r.id===deletedId));
await page.locator('[data-id="'+id+'"] summary').click();await root.locator('[data-behavior]').selectOption('timed');await root.locator('[data-duration]').fill('0.5');await save();await page.locator('#effectPreview').click();await page.waitForTimeout(1200);assert(await page.locator('#effectStop').isDisabled());
// Finish on the persistent composition for visual inspection.
await root.locator('[data-behavior]').selectOption('select');await root.locator('[data-component=blush]').click();assert.equal(await root.locator('[data-look=blush_rotation]').inputValue(),'12');await save();await page.locator('#effectPreview').click();await root.locator('[data-name]').scrollIntoViewIfNeeded();await page.waitForTimeout(300);await page.screenshot({path:out+'effects-list-layout.png'});
const row=(await(await page.request.get(base+'/api/avatar/presets')).json()).find(r=>r.id===id);await page.locator('#effectStop').click();assert.equal((await page.request.delete(base+'/api/avatar/presets/'+id,{data:{request_id:require('node:crypto').randomUUID().replaceAll('-',''),revision:row.revision}})).status(),200);
assert.deepEqual(errors,[]);fs.writeFileSync(out+'effects-list-browser.json',JSON.stringify({sid,url,id,deletedId,errors}));console.log('List add/delete, expand, persistent/timed preview and disappear passed',sid);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
