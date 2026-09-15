import {secondaryRigid} from './secondary-motion.js';
import {naturalEarPose,naturalEarFilter,earFilterMatrix} from './natural-ears.js';
import {animeMouth,animeMouthSvg,mouthOffset} from './anime-mouth.js';
import {chestRegion,chestFilter,chestDisplacement} from './chest-motion.js';
import {earEnabled,idleGaze} from './idle-expression.js';
import {facePart,faceFilter,jawFilter,faceFilterMatrix} from './face-rig.js';
import {closedLashArtwork} from './eyelid-controls.js';
import {eyeThroughPasses,eyeThroughStrength} from './eye-through-hair.js';
import {mouthVariantWeights} from './mouth-variants.js';
import {rigActive,rigPose,faceMotion,mesh,triangleMatrix,decompose,expandedTriangle,rigGroups,segmentOffset,frontHairEnd} from './rig.js?v=mouth-editor-9';
import {vowelScale,cycleVowels,normalizeMouthTuning} from './vowels.js';
import {closedMouthArtwork,mouthOpenMotion,mouthTeethSvg,mouthTeethOpacity} from './mouth-controls.js';
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : lo));
export const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const num = v => +(+v).toFixed(5);
export const smooth = v => {const x=clamp(v);return x*x*(3-2*x);};
export const hairLashOpacity=(pose,side)=>1-smooth(clamp((side==='l'?pose.blinkL:pose.blinkR)||0)/.6);
export const nativeMouthOpenOpacity=amount=>smooth((clamp(amount)-.035)/.05);
export const pulse = (phase,start,length) => phase>start&&phase<start+length ? Math.sin(Math.PI*(phase-start)/length)**2 : 0;
export function singleHop(t, duration, height) {
  const phase=((t%duration)+duration)%duration/duration;
  return height*(.10*pulse(phase,.12,.07)-pulse(phase,.18,.20)+.09*pulse(phase,.38,.08));
}
export function loopHop(t,duration,height,count=3){return singleHop(t,duration/Math.round(clamp(count,1,6)),height);}
export function earMotion(phase,settings={}){
 const u=((phase*Math.round(clamp(settings.earCycles??1,1,6)))%1+1)%1;
 const mode=settings.earPattern||'twitch',amount=clamp(settings.ears,0,30),height=amount*(mode==='up'?.5:.25);
 if(mode==='natural')return {earAngleL:0,earAngleR:0,earAngle:0,earLift:0,...naturalEarPose(phase,settings)};
 if(mode==='up'){
  // A quick lift, then a softer return; leave a clear rest between pops.
  const lift=u<.18?smooth((u-.12)/.06):1-smooth((u-.18)/.16);
  return {earAngleL:0,earAngleR:0,earAngle:0,earLift:height*lift};
 }
 const flick=t=>pulse(t,.12,.18)-.3*pulse(t,.30,.15);
 let left,right;
 if(mode==='double'){left=right=flick(u)+flick(u-.42);}
 else if(mode==='alternate'){left=flick(u);right=flick(((u-.5)%1+1)%1);}
 else if(mode==='droop'){left=right=-pulse(u,.1,.75);}
 else {left=right=flick(u);}
 return {earAngleL:left*height,earAngleR:right*height,earAngle:(mode==='alternate'?left-right:left)*height,earLift:0};
}
export function irisMotion(part,pose){
  const scale=clamp(pose.irisScale??1,.9,1.1);
  return {x:clamp(pose.irisX??0,-20,20),y:clamp(pose.irisY??0,-12,12),scale,cx:part.x+part.width/2,cy:part.y+part.height/2};
}
export function mouthScale(open, settings={},pose={}) {
  const amount=clamp(open),closed=clamp(settings.closedWidth ?? .8,.5,1);
  const [vx,vy]=vowelScale(pose,settings),blend=smooth(amount);
  // Local correction peaks at 20% opening and eases out before the full-open pose.
  const near=smooth(amount/.2)*(1-smooth((amount-.2)/.45)),t=normalizeMouthTuning(settings.mouthTuning).transition;
  return [(closed+(1-closed)*blend)*(1+(vx-1)*blend)*(1+(t.width-1)*near),(.045+.955*amount)*(1+(vy-1)*blend)*(1+(t.height-1)*near)];
}
export function partMotion(part,pose,project) {
  if(pose.pivotOverrides?.[part.id])part={...part,...pose.pivotOverrides[part.id]};
  const sign=part.role==='ear-r'?-1:part.role==='ear-l'?1:part.x+part.width/2<project.width/2?-1:1;
  const strength=clamp(part.motionStrength??1,0,2);
  const secondary=secondaryRigid(part,pose,project);
  return {x:0,y:secondary.y+((part.role==='chest'?(pose.chestOffset||0):0)-(earEnabled(part)?(pose.earLift||0):0))*strength,
    rotation:earEnabled(part)?(pose[part.role==='ear-l'?'earAngleL':part.role==='ear-r'?'earAngleR':'earAngle']??pose.earAngle??0)*sign*strength:part.role==='tail'?(pose.tailAngle||0)*strength:part.role==='hair'?(pose.hairAngle||0)*sign*strength:secondary.rotation,
    pivotX:part.pivotX??part.x+part.width/2,pivotY:part.pivotY??part.y+part.height*(earEnabled(part)?.9:.08)};
}

export function loopPose(t, settings) {
  const d = clamp(settings.duration, 1, 30);
  const phase = ((t % d) + d) % d / d;
  const wave = Math.sin(phase * Math.PI * 2);
  // A compact, smooth blink fully contained in the loop, equal endpoint poses.
  const distance = Math.abs(phase - .72);
  const blink = settings.blink && distance < .035 ? (1 + Math.cos(distance / .035 * Math.PI)) / 2 : 0;
  const hopping=!!settings.singleBounce;
  const talk = settings.talking ? Math.max(0, Math.sin(phase * Math.PI * 16)) * .72 : 0;
  const height=hopping?clamp(settings.bounceHeight??28,0,160):0;
  const hopDuration=clamp(settings.bounceDuration??d,1,d);
  const hopAt=time=>{const local=((time%d)+d)%d;return local<hopDuration?singleHop(local,hopDuration,height):0;};
  const hop=hopAt(t),follow=hopAt(t-.11)-hop,irisPhase=phase*Math.PI*2*Math.round(clamp(settings.irisCycles??1,1,4));
  return {sway: wave * clamp(settings.sway, 0, 12), breathe: (1 - Math.cos(phase * 2 * Math.PI)) * .5 * clamp(settings.breathe, 0, 40),
    secondaryPhase:phase*Math.PI*2,
    tailAngle:clamp(settings.tailSwing??0,0,30)*Math.sin(phase*Math.PI*2*Math.round(clamp(settings.tailCycles??1,1,4))),
    irisX:(settings.irisGaze==='sweep'?Math.sin(irisPhase):idleGaze(irisPhase/(Math.PI*2)))*clamp(settings.irisX??0,0,20),irisY:0,irisScale:1+Math.sin(irisPhase+.3)*clamp(settings.irisScale??0,0,10)/100,
    bounce:hop,hairAngle:clamp(settings.hair,0,25)*(Math.sin(phase*Math.PI*2-.4)*.3+clamp(follow/28,-1,1)*.7),
    chestOffset:clamp(settings.chest,0,40)*(clamp(Math.sin(phase*Math.PI*2)*.6+(hopAt(t-.085)-hop)/28,-1,1)),
    ...earMotion(phase,settings),earNaturalFollow:settings.earPattern==='natural'?clamp(follow*.1,-8,8)*clamp(settings.ears,0,30)/5:0,
    blinkL: blink, blinkR: blink, mouth: talk,...(settings.vowels?{vowelWeights:cycleVowels(phase)}:{}),...rigPose(t,settings)};
}

export function blendshapePose(categories = [], previous = {}, smoothing = .45) {
  const scores = Object.fromEntries(categories.map(c => [c.categoryName, clamp(c.score)]));
  const smooth = (name, target) => clamp((previous[name] ?? 0) * (1 - smoothing) + target * smoothing);
  return {blinkL: smooth('blinkL', scores.eyeBlinkLeft || 0), blinkR: smooth('blinkR', scores.eyeBlinkRight || 0),
    mouth: smooth('mouth', clamp(((scores.jawOpen || 0) - .025) * 2.5))};
}

export function rms(samples) {
  if (!samples.length) return 0;
  return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
}

export function mouthEnvelope(samples, gain = 5, previous = 0) {
  const target = clamp((rms(samples) - .009) * gain);
  const speed = target > previous ? .72 : .3;
  return previous + (target - previous) * speed;
}

export function anchor(project, side) {
  const p = project.parts.find(p => p.role === `white-${side}`) || project.parts.find(p => p.role === `lash-${side}`) || project.parts.find(p=>p.role===`iris-${side}`);
  return p ? [p.x + p.width / 2, p.y + p.height * .72] : [project.width / 2, project.height / 3];
}

// Input SVG has already passed the DOM sanitizer. Prefix clones to keep masks distinct.
export function cloneIds(svg, prefix) {
  return svg.replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
    .replace(/\bhref="#([^"]+)"/g, (_, id) => `href="#${prefix}${id}"`);
}

export function sceneSvg(project, settings = project.settings || {}, meshRig=true) {
  const {width:w, height:h} = project;
  const passes=eyeThroughPasses(project,settings);
  if(passes){
    const body=kind=>cloneIds(sceneSvg(passes[kind],{...settings,eyeThroughHair:false,background:kind==='base'?settings.background:'transparent'},meshRig),`see-${kind}-`).replace(/^<svg\b[^>]*>/,'<g>').replace(/<\/svg>$/,'</g>');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><mask id="see-hair-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" style="mask-type:alpha">${body('hair')}</mask></defs>${body('base')}<g data-channel="eye-through-strength" mask="url(#see-hair-mask)" opacity="${eyeThroughStrength(settings)}">${body('lashes')}</g></svg>`;
  }
  const groups=meshRig&&rigActive(project,settings)?rigGroups(project):null;
  if(groups){
    // One SVG timeline for all groups; nested root SVGs would have independent clocks.
    const body=groups.map((p,i)=>cloneIds(sceneSvg(p,{...settings,background:'transparent'}),`group${i}-`).replace(/^<svg\b[^>]*>/,'<g>').replace(/<\/svg>$/,'</g>').replace(/data-channel="([^"]+)"/g,(_,channel)=>`data-channel="group${i}:${channel}"`)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${settings.background==='white'?`<rect width="${w}" height="${h}" fill="white"/>`:''}${body}</svg>`;
  }
  const white = side => project.parts.find(p => p.role === `white-${side}` && p.visible);
  const aperture = side => white(side)||project.parts.find(p=>p.role===`iris-${side}`&&p.visible);
  const silhouettes = ['l','r'].filter(s => aperture(s)).map(s => {
    const p=aperture(s),[ax,ay]=anchor(project,s);
    const shape=white(s)?cloneIds(p.svgText,`clip-${s}-`):`<rect width="${p.width}" height="${p.height}" fill="white"/>`;
    return `<mask id="eye-clip-${s}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" style="mask-type:alpha"><g transform="translate(${ax} ${ay})"><g data-channel="eye-${s}"><g transform="translate(${-ax} ${-ay})"><g transform="translate(${p.x} ${p.y})">${shape}</g></g></g></g></mask>`;
  }).join('');
  const markup = project.parts.map(p => {
    const side = p.role.endsWith('-l') ? 'l' : 'r';
    const isEye = /^(white|iris|lash)-[lr]$/.test(p.role);
    const [ax, ay] = anchor(project, side);
    let source=p.svgText;
    if(meshRig&&rigActive(project,settings)&&p.role==='static'&&p.spatialBounds){
      let index=0;source=source.split(/(<defs\b[\s\S]*?<\/defs>)/g).map(chunk=>chunk.startsWith('<defs')?chunk:chunk.replace(/<path\b[^>]*\/>/g,path=>path.replace('<path',`<path id="rig-shape-${p.id}-${index++}"`))).join('');
    }
    const content = `<g transform="translate(${p.x} ${p.y})">${source}</g>`;
    let body = p.role.startsWith('iris-') && aperture(side) ? `<g mask="url(#eye-clip-${side})"><g data-channel="iris-shift-${p.id}"><g data-channel="iris-size-${p.id}"><g transform="translate(${-p.x-p.width/2} ${-p.y-p.height/2})">${content}</g></g></g></g>` : content;
    if(p.blinkOverlay)body=`<g data-channel="hair-lash-${p.blinkOverlay}">${body}</g>`;
    if (isEye) {
      if(!p.role.startsWith('lash-'))body=`<g data-channel="eye-content-${side}">${body}</g>`;
      // The lid aperture closes over a stationary iris; never squash its pupil or highlight.
      if(!p.role.startsWith('iris-'))body = `<g transform="translate(${ax} ${ay})"><g data-channel="eye-${side}" transform="scale(1 1)"><g transform="translate(${-ax} ${-ay})">${body}</g></g></g>`;
      if (p.role.startsWith('lash-')) {
        const whitePart=white(side), lidWidth=whitePart?.width || p.width*.8;
        const closed=p.closedSvgText ? `<g transform="translate(${p.x} ${p.y})">${closedLashArtwork(p)}</g>` :
          `<path d="M ${ax-lidWidth*.49} ${ay-2} Q ${ax} ${ay+lidWidth*.08} ${ax+lidWidth*.49} ${ay-3}" fill="none" stroke="#382c29" stroke-width="${Math.max(1.5,lidWidth*.038)}" stroke-linecap="round"/>`;
        body = `<g data-channel="open-${side}">${body}</g><g data-channel="closed-${side}" opacity="0">${closed}</g>`;
      }
    }
    if (p.role === 'mouth' && p.mouthMode==='source-open' && !p.openSvgText) {
      const cx=p.x+p.width/2,cy=p.y+p.height/2;
      const teeth=['a','i','u','e','o'].map(k=>`<g data-channel="mouth-teeth-${p.id}-${k}" opacity="0"><g transform="translate(${p.x} ${p.y})">${mouthTeethSvg(p,k,settings)}</g></g>`).join('');
      const artwork=p.mouthVariants&&settings.vowels?Object.entries({base:p.svgText,...p.mouthVariants}).map(([key,text])=>`<g data-channel="mouth-variant-${p.id}-${key}"><g transform="translate(${p.x} ${p.y})">${cloneIds(text,`variant-${p.id}-${key}-`)}</g></g>`).join(''):content;
      body=`<g data-channel="mouth-tune-shift-${p.id}"><g data-channel="mouth-tune-turn-${p.id}"><g transform="translate(${cx} ${cy})"><g data-channel="mouth-native"><g transform="translate(${-cx} ${-cy})">${artwork}${teeth}</g></g></g></g></g>`;
      if(p.closedSvgText){
        const closed=`<g transform="translate(${p.x} ${p.y})">${closedMouthArtwork(p,settings)}</g>`;
        body=`<g data-channel="mouth-native-open">${body}</g><g data-channel="mouth-native-closed"><g transform="translate(${cx} ${cy})"><g data-channel="mouth-native-width"><g transform="translate(${-cx} ${-cy})">${closed}</g></g></g></g>`;
      }
    } else if (p.role === 'mouth' && (p.openSvgText || p.mouthMode==='synthetic')) {
      const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
      const mw = Math.max(12, p.width * .72), mh = Math.max(14, p.width * .48);
      const opening = p.openSvgText ? `<g transform="translate(${-p.width/2} ${-p.height/2})">${p.openSvgText}</g>` :
        `<path d="M ${-mw/2} 0 Q 0 ${-mh*.25} ${mw/2} 0 Q ${mw*.44} ${mh} 0 ${mh} Q ${-mw*.44} ${mh} ${-mw/2} 0Z" fill="#532b2c" stroke="#38252a" stroke-width="1.2"/><path d="M ${-mw*.3} ${mh*.72} Q 0 ${mh*.36} ${mw*.3} ${mh*.72} Q 0 ${mh*1.06} ${-mw*.3} ${mh*.72}" fill="#d68d88"/>`;
      body = `<g data-channel="mouth-closed">${content}</g><g transform="translate(${cx} ${cy})"><g data-channel="mouth-open" transform="scale(1 0)">${opening}</g></g>`;
    }
    if (p.role==='mouth' && p.mouthMode!=='source-open' && !p.openSvgText && p.mouthMode!=='synthetic')body=content;
    if(p.role==='mouth'){
      if(settings.mouthStyle==='anime'&&(p.openSvgText||p.mouthMode==='synthetic'))body=`<g data-channel="mouth-closed">${content}</g>${animeMouthSvg(p)}`;
      body=`<g data-channel="mouth-position">${body}</g>`;
    }
    if(p.role==='hair'||p.role==='chest'||earEnabled(p)) {
      body=`<g data-channel="secondary-shift-${p.id}"><g data-channel="secondary-turn-${p.id}">${body}</g></g>`;
    }
    if(rigActive(project,settings)&&(/^(white|iris|lash|brow)-[lr]$/.test(p.role)||p.role==='mouth'||p.role==='glasses'||p.blinkOverlay||p.faceOverlay)) {
      const cx=p.x+p.width/2,cy=p.y+p.height/2;
      body=`<g data-channel="face-shift-${p.id}"><g transform="translate(${cx} ${cy})"><g data-channel="face-scale-${p.id}"><g transform="translate(${-cx} ${-cy})">${body}</g></g></g></g>`;
    }
    return `<g id="rig-part-${p.id}" data-part="${p.id}" opacity="${p.opacity}" ${p.visible ? '' : 'display="none"'}>${body}</g>`;
  }).join('');
  const background=settings.background==='white'?`<rect width="${w}" height="${h}" fill="white"/>`:'';
  let art=markup, extra='';
  if(meshRig&&rigActive(project,settings)) {
    extra=`<g id="rig-art">${markup}</g>`;
    const triangles=mesh(project),cells=new Map();
    const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
    art=triangles.map((t,i)=>{
      const cell=Math.floor(i/2),region=[Math.min(...t.map(v=>v[0]))-3,Math.min(...t.map(v=>v[1]))-3,Math.max(...t.map(v=>v[0]))+3,Math.max(...t.map(v=>v[1]))+3];
      if(!cells.has(cell)){
        let fragments='';
        for(const p of project.parts.filter(p=>p.visible)){
          if(!intersects(region,[p.x-32,p.y-32,p.x+p.width+32,p.y+p.height+32]))continue;
          if(p.role==='static'&&p.spatialBounds){
            let index=0;const local=[region[0]-p.x,region[1]-p.y,region[2]-p.x,region[3]-p.y];
            const cropped=p.svgText.replace(/<defs\b[\s\S]*?<\/defs>/g,'').replace(/<path\b[^>]*\/>/g,path=>{const i=index++,b=p.spatialBounds[i];return !b||intersects(local,b)?`<use href="#rig-shape-${p.id}-${i}"/>`:'';});
            fragments+=`<g opacity="${p.opacity}" transform="translate(${p.x} ${p.y})">${cropped}</g>`;
          }else fragments+=`<use href="#rig-part-${p.id}"/>`;
        }
        extra+=`<g id="rig-cell-${cell}">${fragments}</g>`;cells.set(cell,true);
      }
      extra+=`<clipPath id="rig-clip-${i}" clipPathUnits="userSpaceOnUse"><polygon points="${expandedTriangle(t).map(v=>v.map(num).join(',')).join(' ')}"/></clipPath>`;
      return `<g data-channel="mesh-${i}-translate"><g data-channel="mesh-${i}-rotate"><g data-channel="mesh-${i}-skewX"><g data-channel="mesh-${i}-scale"><g clip-path="url(#rig-clip-${i})"><use href="#rig-cell-${cell}"/></g></g></g></g></g>`;
    }).join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${esc(project.name)} — SVG-Through Motion</title><defs>${silhouettes}${extra}</defs>${background}<g data-channel="sway" transform="rotate(0 ${w/2} ${h*.75})"><g data-channel="breathe" transform="translate(0 0)">${art}</g></g></svg>`;
}

const meshCache=new WeakMap();
export function channelValue(channel, pose, project, settings=project.settings||{}) {
  if(channel.startsWith('svg-ear-field-')){const match=channel.match(/^svg-ear-field-(\d+)-(.+)$/),part=project.parts.find(p=>p.id===match[2]);return {attribute:'values',value:earFilterMatrix(part,project,pose,+match[1])};}
  if(channel==='svg-chest')return {attribute:'scale',value:num(-2*chestDisplacement(project,pose))};
  if(channel==='svg-face-matrix')return {attribute:'values',value:faceFilterMatrix(project,pose)};
  if(channel==='svg-face-jaw')return {attribute:'scale',value:num(-12*project.rig.faceWidth/333*clamp(pose.mouth||0))};
  if(channel==='svg-rig-turn')return {attribute:'transform',type:'rotate',value:`${num(clamp(pose.bodyRoll||0,-8,8))} ${project.rig.neckX} ${project.height*.8}`};
  if(channel==='svg-rig-shift')return {attribute:'transform',type:'translate',value:'0 0'};
  if(channel==='svg-rig-orient'){
    // Intact SVG artwork uses a mild common projection about the neck. Keep
    // every part attached; the canvas renderer adds the local head volume.
    const yaw=clamp(pose.yaw||0,-1,1),pitch=clamp(pose.pitch||0,-1,1),r=project.rig;
    return {attribute:'transform',type:'translate',value:`0 ${num(-pitch*r.faceWidth*.03)}`};
  }
  if(channel==='svg-rig-perspective')return {attribute:'transform',type:'scale',value:`${num(Math.cos(clamp(pose.yaw||0,-1,1)*.18))} ${num(Math.cos(clamp(pose.pitch||0,-1,1)*.18))}`};
  if(channel==='svg-rig-yaw')return {attribute:'transform',type:'skewX',value:num(-clamp(pose.yaw||0,-1,1)*1.4)};
  if(channel.startsWith('svg-hair-')){
    const p=project.parts.find(p=>p.id===channel.slice(9)),front=p.deformGroup==='front',root=project.rig.headTop+(front?project.height*.04:0),tip=front?frontHairEnd(project):Math.min(project.height,p.y+p.height),center=p.x+p.width/2;
    const owner={...project,settings,deformGroup:p.deformGroup,parts:[p]},shift=segmentOffset(center,tip,owner,pose)[0];
    return {attribute:'transform',type:'skewX',value:String(num(Math.atan2(shift,Math.max(project.height*.1,tip-root))*180/Math.PI))};
  }
  if(channel.startsWith('svg-arm-')){
    const p=project.parts.find(p=>p.id===channel.slice(8)),pivot=project.rig.arms?.[p.deformGroup];
    const angle=pivot?clamp((settings.armSwing??0)*(p.motionStrength??1),0,10)*Math.sin((pose.hairPhase||0)-.35)*(p.deformGroup==='arm-r'?1:-1):0;
    return {attribute:'transform',type:'rotate',value:`${num(angle)} ${p.pivotX??pivot?.x??0} ${p.pivotY??pivot?.y??0}`};
  }
  if(channel.startsWith('group')){const [prefix,inner]=channel.split(':');return channelValue(inner,pose,rigGroups(project)[+prefix.slice(5)],settings);}
  if(channel.startsWith('iris-shift-')||channel.startsWith('iris-size-')){const part=project.parts.find(p=>p.id===channel.split('-').slice(2).join('-')),m=irisMotion(part,pose);return channel.startsWith('iris-shift-')?{attribute:'transform',type:'translate',value:`${num(m.cx+m.x)} ${num(m.cy+m.y)}`}:{attribute:'transform',type:'scale',value:`${num(m.scale)} ${num(m.scale)}`};}
  const blink = clamp(channel.endsWith('-l') ? pose.blinkL : pose.blinkR);
  if(channel.startsWith('mesh-')) {
    const [,index,type]=channel.split('-');
    if(!meshCache.has(project))meshCache.set(project,mesh(project));
    const values=decompose(triangleMatrix(meshCache.get(project)[+index],project,pose));
    return {attribute:'transform',type,value:values[type].map(num).join(' ')};
  }
  if(channel.startsWith('face-')) {
    const [,kind,id]=channel.split('-'),p=project.parts.find(p=>p.id===id),m=faceMotion(p,project,pose);
    return {attribute:'transform',type:kind==='shift'?'translate':'scale',value:kind==='shift'?`${num(m.x)} ${num(m.y)}`:`${num(m.sx)} 1`};
  }
  if(channel.startsWith('mouth-tune-')) {
    const p=project.parts.find(p=>p.id===channel.split('-').at(-1)),m=mouthOpenMotion(pose,settings);
    return channel.startsWith('mouth-tune-shift')?{attribute:'transform',type:'translate',value:`${num(m.x)} ${num(m.y)}`}:{attribute:'transform',type:'rotate',value:`${num(m.angle)} ${p.x+p.width/2} ${p.y+p.height/2}`};
  }
  if(channel.startsWith('mouth-variant-')){const [, ,id,key]=channel.split('-'),part=project.parts.find(p=>p.id===id);return {attribute:'opacity',value:num(mouthVariantWeights(part,pose,settings)[key]||0)};}
  if(channel.startsWith('mouth-teeth-'))return {attribute:'opacity',value:num(mouthTeethOpacity(channel.slice(-1),pose,settings))};
  if(channel.startsWith('secondary-')) {
    const part=project.parts.find(p=>p.id===channel.split('-').slice(2).join('-'));
    const m=partMotion(part,pose,project);
    return channel.startsWith('secondary-shift')?{attribute:'transform',type:'translate',value:`${num(m.x)} ${num(m.y)}`}:
      {attribute:'transform',type:'rotate',value:`${num(m.rotation)} ${num(m.pivotX)} ${num(m.pivotY)}`};
  }
  if(channel.startsWith('anime-')){const s=animeMouth(pose,settings),key=channel.slice(6);
    if(key==='visible')return {attribute:'opacity',value:num(s.opacity)};
    if(key.endsWith('-visible'))return {attribute:'opacity',value:num(s[key.split('-')[0]+'Opacity'])};
    return {attribute:'d',value:s[key]};
  }
  switch (channel) {
    case 'eye-through-strength': return {attribute:'opacity',value:eyeThroughStrength(settings)};
    case 'hair-lash-l': case 'hair-lash-r': return {attribute:'opacity',value:num(hairLashOpacity(pose,channel.slice(-1)))};
    case 'mouth-position': return {attribute:'transform',type:'translate',value:`0 ${num(mouthOffset(settings,project.width))}`};
    case 'sway': return {attribute:'transform', type:'rotate', value:`${num(pose.sway || 0)} ${project.width/2} ${project.height*.75}`};
    case 'breathe': return {attribute:'transform', type:'translate', value:`0 ${num((pose.bounce||0)-(pose.breathe || 0))}`};
    case 'eye-l': case 'eye-r': return {attribute:'transform', type:'scale', value:`1 ${num(Math.max(.025, 1 - blink))}`};
    case 'eye-content-l': case 'eye-content-r': return {attribute:'opacity',value:num(1-smooth((blink-.65)/.3))};
    case 'open-l': case 'open-r': return {attribute:'opacity', value:num(1-clamp((blink-.65)/.25))};
    case 'closed-l': case 'closed-r': return {attribute:'opacity', value:num(clamp((blink-.65)/.25))};
    case 'mouth-closed': return {attribute:'opacity', value:num(clamp(1 - clamp(pose.mouth) * 8))};
    case 'mouth-open': {const [vx,vy]=vowelScale(pose,settings);return {attribute:'transform', type:'scale', value:`${num(vx)} ${num(clamp(pose.mouth)*vy)}`};}
    case 'mouth-native': return {attribute:'transform',type:'scale',value:mouthScale(pose.mouth,settings,pose).map(num).join(' ')};
    case 'mouth-native-width': return {attribute:'transform',type:'scale',value:`${num(mouthScale(pose.mouth,settings,pose)[0])} 1`};
    case 'mouth-native-open': return {attribute:'opacity',value:num(nativeMouthOpenOpacity(pose.mouth))};
    case 'mouth-native-closed': return {attribute:'opacity',value:num(1-nativeMouthOpenOpacity(pose.mouth))};
    default: throw Error(`Unknown animation channel: ${channel}`);
  }
}

export function applyPose(svg, pose, project, settings=project.settings||{}) {
  for (const node of svg.querySelectorAll('[data-channel]')) {
    const v = channelValue(node.dataset.channel, pose, project,settings);
    node.setAttribute(v.attribute, v.type ? `${v.type}(${v.value})` : v.value);
  }
}

// Standalone SVGs animate intact vector parts. Repainting hundreds of clipped
// copies creates alpha seams and overwhelms image-element SMIL renderers.
// Canvas/video retain the continuous mesh; SVG uses root-pinned affine hair sway.
export function animatedSvg(project, settings, parse) {
  const svg=parse(sceneSvg(project,settings,false)),ns='http://www.w3.org/2000/svg';
  if(settings.earPattern==='natural'){
    const defs=svg.querySelector('defs');
    for(const part of project.parts.filter(p=>earEnabled(p)&&p.visible)){
      const id='ear-natural-'+part.id;defs.append(parse(`<svg xmlns="${ns}">${naturalEarFilter(part,project,id)}</svg>`).firstElementChild);
      svg.querySelector(`[data-part="${part.id}"]`)?.setAttribute('filter',`url(#${id})`);
    }
  }
  if(settings.chest>0&&chestRegion(project)){
    const defs=svg.querySelector('defs')||svg.insertBefore(svg.ownerDocument.createElementNS(ns,'defs'),svg.firstChild);
    const filter=parse(`<svg xmlns="${ns}">${chestFilter(project,'chest-local')}</svg>`).firstElementChild;
    defs.append(filter);
    for(const node of svg.querySelectorAll('[data-part]')){
      const part=project.parts.find(p=>p.id===node.dataset.part);
      if(part&&chestRegion({...project,parts:[part]}))node.setAttribute('filter','url(#chest-local)');
    }
  }
  const group=(channel,child)=>{const g=svg.ownerDocument.createElementNS(ns,'g');g.dataset.channel=channel;child.replaceWith(g);g.append(child);return g;};
  if(rigActive(project,settings)){
    const defs=svg.querySelector('defs')||svg.insertBefore(svg.ownerDocument.createElementNS(ns,'defs'),svg.firstChild);
    defs.append(parse(`<svg xmlns="${ns}">${faceFilter(project,'face-local')}</svg>`).firstElementChild);
    let faceRun=null;
    for(const node of [...svg.querySelectorAll('[data-part]')]){
      const p=project.parts.find(p=>p.id===node.dataset.part);if(!p)continue;
      if(p.faceBase){
        const id='jaw-local-'+p.id;defs.append(parse(`<svg xmlns="${ns}">${jawFilter({...project,parts:[p]},id)}</svg>`).firstElementChild);node.setAttribute('filter',`url(#${id})`);
      }
      if(facePart(p)){
        // Contiguous face/base/features share one filter pass, preserving order.
        if(!faceRun||faceRun.nextElementSibling!==node){faceRun=svg.ownerDocument.createElementNS(ns,'g');node.before(faceRun);faceRun.setAttribute('filter','url(#face-local)');}
        faceRun.append(node);
      }else faceRun=null;
      if(['front','back'].includes(p.deformGroup)){
        const root=project.rig.headTop+(p.deformGroup==='front'?project.height*.04:0);
        const outer=svg.ownerDocument.createElementNS(ns,'g'),inner=svg.ownerDocument.createElementNS(ns,'g');outer.setAttribute('transform',`translate(0 ${root})`);inner.setAttribute('transform',`translate(0 ${-root})`);node.replaceWith(outer);outer.append(inner);inner.append(node);group('svg-hair-'+p.id,inner);
      }else if(p.deformGroup?.startsWith('arm-'))group('svg-arm-'+p.id,node);
    }
    // A common rigid transform preserves the face, clothing and cut boundaries.
    for(const node of [...svg.querySelectorAll('[data-channel="sway"]')]){
      const outer=svg.ownerDocument.createElementNS(ns,'g'),inner=svg.ownerDocument.createElementNS(ns,'g'),r=project.rig;
      outer.setAttribute('transform',`translate(${r.neckX} ${r.neckY})`);inner.setAttribute('transform',`translate(${-r.neckX} ${-r.neckY})`);
      node.replaceWith(outer);outer.append(inner);inner.append(node);
      // Face XYZ is local to the face filter. Only body follow is shared.
      group('svg-rig-turn',outer);
    }
  }
  const steps=Math.max(120,Math.ceil(settings.duration*30));
  const poses=Array.from({length:steps+1},(_,i)=>loopPose(i/steps*settings.duration,settings)),keyTimes=poses.map((_,i)=>num(i/steps)).join(';');
  for(const node of svg.querySelectorAll('[data-channel]')){
    const values=poses.map(pose=>channelValue(node.dataset.channel,pose,project,settings)),first=values[0];
    node.setAttribute(first.attribute,first.type?`${first.type}(${first.value})`:first.value);
    if(values.every(v=>v.value===first.value))continue;
    const anim=svg.ownerDocument.createElementNS(ns,first.type?'animateTransform':'animate');anim.setAttribute('attributeName',first.attribute);if(first.type)anim.setAttribute('type',first.type);
    anim.setAttribute('dur',`${settings.duration}s`);anim.setAttribute('repeatCount','indefinite');anim.setAttribute('values',values.map(v=>v.value).join(';'));anim.setAttribute('keyTimes',keyTimes);anim.setAttribute('calcMode','linear');node.append(anim);
  }
  return new XMLSerializer().serializeToString(svg);
}
