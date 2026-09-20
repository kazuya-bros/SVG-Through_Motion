// Display names only: preserve imported names used for provenance and role detection.
const names={'ears-r':'右耳','ears-l':'左耳','front hair':'前髪','back hair':'後ろ髪',eyewear:'眼鏡',headwear:'頭飾り',bottomwear:'服の裾',legwear:'脚・脚の衣装',body:'胴体・首',face:'顔の下地',hair_front:'前髪',hair_back:'後ろ髪',tail:'尻尾',wings:'翼',neckwear:'首飾り',earwear:'耳飾り',mouth:'口'};
const roles={lash:'睫毛',iris:'瞳',white:'白目',brow:'眉',ear:'耳'};
export function partLabel(p){
 const name=String(p.name||''),source=p.sourceLayerName||name.match(/[（(]([a-z][\w-]*)[）)]/i)?.[1]||(names[name.toLowerCase()]?name:null);
 if(source&&names[source.toLowerCase()])return `${names[source.toLowerCase()]}（${source}）`;
 const feature=name.match(/^(eyelash|irides|eyewhite|eyebrow|mouth)(-[lr])?$/i);
 if(feature){const stem={eyelash:'睫毛',irides:'瞳',eyewhite:'白目',eyebrow:'眉',mouth:'口'}[feature[1].toLowerCase()];return `${feature[2]?feature[2]==='-l'?'左の':'右の':''}${stem}（${name}）`;}
 const conventional={'PSDの前髪':['前髪','front hair'],'後ろ髪':['後ろ髪','back hair'],'尻尾':['尻尾','tail']};
 if(conventional[name])return `${conventional[name][0]}（${conventional[name][1]}）`;
 const role=p.role?.match(/^(lash|iris|white|brow|ear)-([lr])$/);
 if(role&&!name)return `${role[2]==='l'?'左':'右'}の${roles[role[1]]}`;
 return name.replace(/^PSDの/,'').replace(/^Face（顔の下地）$/,'顔の下地（Face）').replace(/^元画像（胴体・首）$/,'胴体・首（Body）')||'パーツ';
}
