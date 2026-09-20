// Render generated SVGs in Chromium: masks must work without frontend repairs.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('output/verification/quality-trace');
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:1100,height:1000}});
  const svg=fs.readFileSync(path.join(root,'parts/mask-check.svg'),'utf8');
  const result=await page.evaluate(async text=>{
   const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(text)));await image.decode();
   const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(image,0,0);
   const pixel=(a,b)=>[...x.getImageData(a,b,1,1).data];
   return {outside:pixel(1,1),hole:pixel(32,32),solid:pixel(15,32),half:pixel(4,58)};
  },svg);
  assert.equal(result.outside[3],0);assert.equal(result.hole[3],0);
  assert.equal(result.solid[3],255);assert(Math.abs(result.half[3]-128)<22);
  assert(Math.abs(result.solid[0]-240)<8);assert(Math.abs(result.half[2]-210)<8);
  fs.writeFileSync(path.join(root,'mask-render.json'),JSON.stringify(result,null,2));
  console.log('Native SVG mask rendering passed',result);
  const id=JSON.parse(fs.readFileSync(path.join(root,'job.json'))).jobId;
  const dir=path.resolve('output/verification/quality-data/projects',id);
  if(fs.existsSync(path.join(dir,'assembled.svg'))){
   const assembled=fs.readFileSync(path.join(dir,'assembled.svg'),'utf8');
   await page.setContent('<body style="margin:0;background:white"><img id="art" style="width:1000px;height:1000px"></body>');
   await page.locator('#art').evaluate(async(el,text)=>{el.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(text)));await el.decode()},assembled);
   await page.screenshot({path:path.join(root,'hybrid-render.png')});
  }
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
