"""One-time source migration: preserve every existing control ID while regrouping tasks."""
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
path = ROOT/'web/index.html'
soup = BeautifulSoup(path.read_text(encoding='utf-8'), 'html.parser')
assert not soup.select_one('#workflowNav'), 'Already migrated'
original_ids = {n['id'] for n in soup.select('[id]')}

def fragment(html):
    return BeautifulSoup(html, 'html.parser')

def get(id):
    return soup.find(id=id)

def add(parent, html):
    for node in list(fragment(html).contents):
        parent.append(node)

def move(parent, id, ancestor=None):
    node = get(id)
    if ancestor:
        node = node.find_parent(ancestor)
    parent.append(node.extract())
    return node

def section(parent, title, description=''):
    box = soup.new_tag('section', attrs={'class':'control-card'})
    add(box, f'<h3>{title}</h3>'+(f'<p class="card-description">{description}</p>' if description else ''))
    parent.append(box)
    return box

soup.title.string = 'うごきえ — イラストに動きと声を'
soup.head.find('link')['href']='/web/style.css?v=workspace-2'
soup.find('script',src=True)['src']='/web/app.js?v=workspace-2'
brand=soup.select_one('.brand');brand.clear()
add(brand,'<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>うごきえ<small>イラストに動きと声を</small></span>')
get('saveProject').string='保存'
get('exportTop').string='書き出し'
top=soup.select_one('.top-actions');top.insert(0,fragment('<button data-open-source>素材を開く</button>').button)

# Imports become a dedicated dialog rather than occupying the layer palette.
dialog=soup.new_tag('dialog',id='sourceDialog')
soup.body.append(dialog)
add(dialog,'<div class="dialog-heading"><div><span class="eyebrow">はじめる</span><h2>素材を開く</h2></div><button id="closeSource" aria-label="素材の読み込みを閉じる">✕</button></div>')
library=section(dialog,'保存した素材から再開')
library.append(soup.select_one('.left-bottom').extract())
dialog.append(get('importForm').extract())
get('hybridImport').string='素材を読み込んで動かす'
soup.body.append(dialog)

left=soup.select_one('.left-panel')
layers=get('layers').extract();count=get('partCount').extract()
left.clear()
add(left,'<nav id="workflowNav" aria-label="作業を切り替える">'+''.join(
 f'<button data-tab="{key}" aria-controls="tab-{key}"><span class="step-number">{i:02}</span><span><strong>{title}</strong><small>{hint}</small></span></button>'
 for i,(key,title,hint) in enumerate([
 ('edit','形を整える','口・目・パーツ'),('motion','動きをつける','待機・揺れ・瞬き'),('voice','声と表情','音声・マイク・カメラ'),('live','配信・AI連携','OBS・外部からの操作'),('export','書き出す','動画・ゲーム素材')],1))+'</nav>')
layerbox=section(left,'レイヤー');layerbox['id']='layerPalette';layerbox.h3.append(count);layerbox.append(layers)
add(left,'<button class="workspace-help" data-open-source>＋ 別の素材を開く</button>')

right=soup.select_one('.right-panel');oldmotion=get('tab-motion');voice=get('tab-voice');tracking=get('tab-tracking');exports=get('exportSection')
for n in (oldmotion,voice,tracking,exports):n.extract()
right.clear()
add(right,'<div class="inspector-heading"><span id="taskEyebrow" class="eyebrow">01 / 編集</span><h2 id="taskTitle">形を整える</h2><p id="taskDescription">口・目・パーツを選んで調整します。</p></div>')
panels={}
for key in ('edit','motion','voice','tracking','live','export'):
    p=soup.new_tag('section',id='tab-'+key,attrs={'class':'task-panel','hidden':''})
    right.append(p);panels[key]=p
# Nodes extracted above remain searchable through this temporary holder.
holder=soup.new_tag('div');soup.body.append(holder)
for n in (oldmotion,voice,tracking,exports):holder.append(n)
oldmotion['id']='legacy-motion';voice['id']='legacy-voice';tracking['id']='legacy-tracking'

edit=panels['edit']
add(edit,'<div class="context-tabs" role="group" aria-label="編集する部位"><button data-edit-page="mouth" class="active">口</button><button data-edit-page="eyes">目</button><button data-edit-page="parts">パーツ</button></div><div id="edit-mouth" class="edit-page"></div><div id="edit-eyes" class="edit-page" hidden></div><div id="edit-parts" class="edit-page" hidden></div>')
mouth=get('edit-mouth');eyes=get('edit-eyes');parts=get('edit-parts')
add(mouth,'<div id="mouthEditorMount"></div>')
box=section(mouth,'口パクを確認')
for id in ('vowels','mouth','mouthOffsetY','closedWidth'):move(box,id,'label')
box.append(oldmotion.select_one('.vowel-buttons').extract())
advanced=soup.new_tag('details');add(advanced,'<summary>口素材の互換設定</summary>');mouth.append(advanced);move(advanced,'mouthStyle','label');move(mouth,'mouthAssetHint')
box=section(eyes,'瞬きを確認');box.append(get('blinkTest').parent.extract());add(eyes,'<div id="eyeEditorMount"></div>')
move(parts,'partEditor')

motion=panels['motion'];box=section(motion,'まずは動きを選ぶ')
box.append(oldmotion.select_one('.preset-row').extract())
for id in ('sway','breathe','blink','talking'):move(box,id,'label')
add(motion,'<div class="context-tabs" role="group" aria-label="動きの調整"><button data-motion-page="head" class="active">頭・身体</button><button data-motion-page="hair">髪・腕</button><button data-motion-page="extra">弾み・詳細</button></div><div id="motion-head" class="motion-page"></div><div id="motion-hair" class="motion-page" hidden></div><div id="motion-extra" class="motion-page" hidden></div>')
head=section(get('motion-head'),'頭と身体の動き')
for id in ('headTilt','headYaw','headPitch','headNod','bodyFollow'):move(head,id,'label')
advanced=soup.new_tag('details');add(advanced,'<summary>変形と支点の詳細</summary>');head.append(advanced)
for id in ('rigEnabled','rigMode','pitchSway'):move(advanced,id,'label')
move(advanced,'neckX','div');move(advanced,'restrainedMotion')
get('rigMode').find('option',value='stable').string='形を保つ（推奨）';get('rigMode').find('option',value='soft').string='柔らかく変形'
hair=section(get('motion-hair'),'髪・腕の揺れ')
move(hair,'hairMethod','label');move(hair,'springControls');move(hair,'splitMotionControls');move(hair,'splitMotionHint');move(hair,'unsplitHair')
get('hairMethod').find('option',value='wave').string='波のように揺れる';get('hairMethod').find('option',value='spring').string='弾むように揺れる'
get('splitMotionHint').string='前後の髪と腕の個別調整には、読み込み時に「腕・前髪・後ろ髪も分離」を有効にしてください。'
extra=section(get('motion-extra'),'弾みとパーツの追従')
for id in ('singleBounce','bounceHeight','hair','chest','ears'):move(extra,id,'label')

for key,node in [('voice',voice),('tracking',tracking)]:
    add(panels[key],'<div class="context-tabs"><button data-perform-page="voice">音声</button><button data-perform-page="mic">マイク</button><button data-perform-page="tracking">カメラ</button></div>')
    node['class']='control-card';node.attrs.pop('hidden',None)
    panels[key].append(node.extract())
    for n in list(node.select('.section-kicker')):n.decompose()
add(panels['voice'],'<div id="microphoneMount" hidden></div>')
voice.find('h2').string='音声に合わせて口パク'
get('speechText').string='こんにちは。今日は、どんな動きを作りましょうか。'
get('cameraLabel').string='カメラ停止中'

add(panels['live'],'<div id="liveMount"></div>')
export=panels['export'];add(export,'<div class="context-tabs"><button data-output-page="image" class="active">画像・動画</button><button data-output-page="materials">ゲーム素材</button></div><div id="output-image"></div><div id="output-materials" hidden><div id="materialsMount"></div></div>')
get('output-image').append(exports.extract());exports['class']='control-card'
exports.find('h2').string='画像・動画を保存'
move(exports,'outputBackground','label')
for b in exports.select('.eyebrow'):b.decompose()
formats={'exportSvg':('ループSVG','拡大してもきれいなベクター'), 'exportPng':('静止PNG','今のポーズを画像に'), 'exportVideo':('WebM動画','音声付きの動きを録画'), 'exportMp4':('MP4動画','白背景・SNS向け'), 'exportParts':('パーツZIP','SVGと編集情報をまとめて')}
for id,(title,desc) in formats.items():
    b=get(id);b.clear();add(b,f'<strong>{title}</strong><small>{desc}</small>')

# Keep only informational text that is needed at the actual point of use.
remaining_ids={n['id'] for n in holder.select('[id]') if n['id']!='legacy-motion'}
assert not remaining_ids, f'Unmoved controls: {remaining_ids}'
holder.decompose()
get('originalImage')['alt']='変換前の元画像';get('originalWrap').span.string='元画像'
soup.select_one('.stage-badge').clear();add(soup.select_one('.stage-badge'),'<span class="dot"></span>プレビュー')
welcome=soup.select_one('.welcome');welcome.clear();add(welcome,'<span class="welcome-symbol" aria-hidden="true">◌</span><h1>イラストに、<br>動きと声を。</h1><p>元画像とパーツ分けPSDを開いて、<br>表情や動きを整えましょう。</p><button class="primary" data-open-source>素材を開く</button>')
get('pathInfo').string='';get('canvasInfo').string='素材を読み込んでください'
all_ids=[n['id'] for n in soup.select('[id]')]
assert len(all_ids)==len(set(all_ids)), 'Duplicate IDs'
assert original_ids-set(all_ids)==set(), f'Lost controls: {original_ids-set(all_ids)}'
path.write_text(str(soup),encoding='utf-8')
print(f'Reorganized {len(original_ids)} existing IDs; {len(all_ids)} total IDs.')
