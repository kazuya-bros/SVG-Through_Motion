// Render the same moving lashes twice, but reveal the second pass only on hair.
// Keep every part in place so rig group indices and eye anchors remain identical.
export const eyeThroughStrength=settings=>settings?.eyeThroughHair===true?Math.max(0,Math.min(1,Number.isFinite(+settings.eyeThroughHairStrength)?+settings.eyeThroughHairStrength:.35)):0;
export function foregroundHairIds(project){
 const firstLash=project.parts.findIndex(p=>p.visible&&/^lash-[lr]$/.test(p.role));
 return new Set(project.parts.filter((p,i)=>i>firstLash&&firstLash>=0&&p.visible&&((p.deformGroup==='front')||(!p.deformGroup&&(p.role==='hair'||/前髪|front[ -]?hair/i.test(p.name||''))))).map(p=>p.id));
}
export function eyeThroughPasses(project,settings=project.settings){
 if(project.eyeThroughPass||settings?.eyeThroughHair!==true)return null;
 const hair=foregroundHairIds(project);if(!hair.size)return null;
 const liveSettings=settings===project.settings;
 const make=kind=>{
  const pass={...project,eyeThroughPass:true,parts:project.parts.map(p=>{
   const part={...p};
   // These passes cache artwork, not the user's live motion settings.
   // The controls replace this object on every input (including initial ON).
   Object.defineProperty(part,'secondaryMotion',{enumerable:true,get:()=>p.secondaryMotion});
   if(kind==='base'){if(p.blinkOverlay)part.visible=false;}
   else if(kind==='hair')part.visible=p.visible&&hair.has(p.id);
   else {part.visible=p.visible&&/^(lash|white)-[lr]$/.test(p.role);if(p.role.startsWith('white-'))part.opacity=0;}
   return part;
  })};
  Object.defineProperty(pass,'settings',{get:()=>({...project.settings,...(liveSettings?{}:settings),eyeThroughHair:false,background:kind==='base'?(liveSettings?project.settings?.background:settings?.background):'transparent'})});
  return pass;
 };
 return {base:make('base'),hair:make('hair'),lashes:make('lashes')};
}
