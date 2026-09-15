const parseSvg = text => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;

export function sanitizeSvg(text, prefix) {
  if (typeof text !== 'string' || text.length > 15_000_000 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('SVGのサイズまたは形式が不正です');
  const root = parseSvg(text);
  if (root.localName !== 'svg' || root.querySelector('parsererror')) throw Error('SVGを解析できません');
  const allowed = new Set(['svg','g','path','defs','mask','clipPath','rect','circle','ellipse','line','polyline','polygon','linearGradient','radialGradient','stop','title','desc','use']);
  const attributes = new Set(['id','d','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','transform','viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','fx','fy','points','offset','stop-color','stop-opacity','gradientUnits','gradientTransform','spreadMethod','mask','mask-type','maskUnits','maskContentUnits','clip-path','clipPathUnits','color-interpolation','preserveAspectRatio','display','href']);
  const ids = new Map();
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (!allowed.has(node.localName)) throw Error(`SVGに未対応の要素があります: ${node.localName}。パスに変換して読み込んでください。`);
    if (node.namespaceURI !== 'http://www.w3.org/2000/svg') throw Error('SVG以外の名前空間は使用できません');
    for (const a of [...node.attributes]) {
      if (a.name === 'xmlns') continue;
      if (a.name === 'overflow' && ['visible','hidden'].includes(a.value)) continue;
      if (!attributes.has(a.localName) || a.name.toLowerCase().startsWith('on') || (a.namespaceURI && a.localName !== 'href')) {
        node.removeAttributeNode(a); continue;
      }
      if (/url\(/i.test(a.value) && !/^url\(#[\w.:-]+\)$/.test(a.value)) throw Error('外部参照を含むSVGは使用できません');
      if (a.localName === 'href' && !/^#[\w.:-]+$/.test(a.value)) throw Error('外部参照を含むSVGは使用できません');
      if (a.localName === 'id') {
        if (!/^[\w.:-]+$/.test(a.value) || ids.has(a.value)) throw Error('SVGのIDが重複または不正です');
        ids.set(a.value, prefix + a.value);
      }
    }
  }
  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...node.attributes]) {
      if (a.name === 'id') node.setAttribute('id', ids.get(a.value));
      else if (a.value.startsWith('url(#')) {
        const id = a.value.slice(5,-1);
        if (!ids.has(id)) throw Error('SVG内の参照先がありません');
        node.setAttribute(a.name, `url(#${ids.get(id)})`);
      } else if (a.localName === 'href') {
        if (!ids.has(a.value.slice(1))) throw Error('SVG内の参照先がありません');
        node.setAttribute('href', '#' + ids.get(a.value.slice(1)));
      }
    }
  }
  return new XMLSerializer().serializeToString(root);
}


export function zipFiles(files) {
  const encode=new TextEncoder(), entries=[], central=[];let offset=0;
  const crcTable=Array.from({length:256},(_,i)=>{for(let b=0;b<8;b++)i=(i>>>1)^((i&1)?0xedb88320:0);return i>>>0;});
  const bytes=(size)=>{const a=new Uint8Array(size);return [a,new DataView(a.buffer)];};
  for(const [name,value] of files) {
    const n=encode.encode(name),data=typeof value==='string'?encode.encode(value):value;
    let crc=0xffffffff;for(const b of data)crc=(crc>>>8)^crcTable[(crc^b)&255];crc=(crc^0xffffffff)>>>0;
    const [head,h]=bytes(30);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,n.length,true);
    entries.push(head,n,data);
    const [c,v]=bytes(46);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true);central.push(c,n);offset+=head.length+n.length+data.length;
  }
  const [end,e]=bytes(22),centralSize=central.reduce((s,a)=>s+a.length,0);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...entries,...central,end],{type:'application/zip'});
}
