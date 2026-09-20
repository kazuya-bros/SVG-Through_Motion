// Run with Playwright available in NODE_PATH and a local source server.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.goto((process.argv[2]||'http://127.0.0.1:18787')+'/web/control-help.html');
  const result=await page.evaluate(async()=>{
   const {repairTraceMasks}=await import('/web/trace-mask.js');
   const rect='M0 0L64 0L64 64L0 64Z';
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><mask id="alpha-test" mask-type="luminance" width="64" height="64" maskUnits="userSpaceOnUse"><path fill="#FFFFFF" d="${rect}"/><path fill="#000000" d="M0 0L64 0L64 20L0 20Z"/><path fill="#000000" d="M0 0L20 0L20 64L0 64Z"/></mask></defs><path fill="#eeddcc" d="${rect}" mask="url(#alpha-test)"/></svg>`;
   const fixed=repairTraceMasks(svg),image=new Image(),url=URL.createObjectURL(new Blob([fixed],{type:'image/svg+xml'}));image.src=url;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=canvas.height=80;const ctx=canvas.getContext('2d');ctx.drawImage(image,5.3,5.7);URL.revokeObjectURL(url);
   const alpha=(x,y)=>ctx.getImageData(x,y,1,1).data[3];
   const edited=svg.replace('fill="#000000"','fill="#000000" opacity=".5"');
   return {overlap:alpha(10,10),top:alpha(45,10),left:alpha(10,45),inside:alpha(45,45),idempotent:repairTraceMasks(fixed)===fixed,editedPreserved:repairTraceMasks(edited)===edited};
  });
  assert.deepEqual(result,{overlap:0,top:0,left:0,inside:255,idempotent:true,editedPreserved:true});
  console.log('Mask rendering: overlapping cutouts, crop edges, preserved artwork and idempotence OK.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
