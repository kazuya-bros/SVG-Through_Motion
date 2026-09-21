// Extra transparent drawing space, without changing the project's coordinates.
export function paddedViewport(project,padding=0){
 const pad=Math.max(0,Number(padding)||0);
 return {x:-pad,y:-pad,width:project.width+2*pad,height:project.height+2*pad,contentWidth:project.width,contentHeight:project.height};
}
export const canvasViewport=(canvas,project)=>canvas.viewport||paddedViewport(project);
export function canvasPoint(canvas,project,x,y){const v=canvasViewport(canvas,project);return [v.x+x*v.width,v.y+y*v.height];}
export function padMesh(triangles,project,pad){
 if(!Array.isArray(triangles)||!triangles.length||!pad)return triangles||[];
 const area=([a,b,c])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const sign=Math.sign(area(triangles[0]))||1,extra=[];
 // Batched clips use the nonzero winding rule; opposite windings would erase
 // the anti-seam overlap where the old canvas boundary meets the new margin.
 const oriented=t=>area(t)*sign<0?[t[0],t[2],t[1]]:t;
 const quad=(a,b,c,d)=>extra.push(oriented([a,b,c]),oriented([b,d,c]));
 for(const t of triangles)for(let i=0;i<3;i++){
  const a=t[i],b=t[(i+1)%3];let dx=0,dy=0;
  if(a[0]===0&&b[0]===0)dx=-pad;
  else if(a[0]===project.width&&b[0]===project.width)dx=pad;
  else if(a[1]===0&&b[1]===0)dy=-pad;
  else if(a[1]===project.height&&b[1]===project.height)dy=pad;
  if(dx||dy)quad(a,b,[a[0]+dx,a[1]+dy],[b[0]+dx,b[1]+dy]);
 }
 for(const x of [0,project.width])for(const y of [0,project.height])quad([x,y],[x+(x?pad:-pad),y],[x,y+(y?pad:-pad)],[x+(x?pad:-pad),y+(y?pad:-pad)]);
 return [...triangles,...extra];
}
