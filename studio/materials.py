"""Non-destructive material preparation before SVG conversion.

Adapted from PachiPakuGen BaseEditorPersistedState / BaseEditorLayerPatch and
transform_extracted_part (MIT, kazuya-bros). The Python adaptation keeps immutable
source images, versioned edits, alpha masks, attachment IDs and corrected PSDs.
"""
from __future__ import annotations

import copy
import json
import math
import re
import threading
import uuid
import zipfile
from pathlib import Path

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from pydantic import BaseModel, ConfigDict, Field

from .convert import MAX_PIXELS, convert_file

from .paths import ROOT, DATA
STORE = DATA / 'materials'
router = APIRouter(prefix='/api/materials', tags=['素材の分割・補正'])
mutex = threading.RLock()
TAGS = ['static', 'face', 'front hair', 'back hair', 'neck', 'topwear', 'bottomwear',
        'handwear-l', 'handwear-r', 'headwear', 'eyewear', 'earwear', 'tail', 'wings','nose','neckwear','legwear','footwear',
        'white-l', 'white-r', 'iris-l', 'iris-r', 'lash-l', 'lash-r', 'brow-l', 'brow-r',
        'closed-l', 'closed-r', 'mouth', 'mouth-closed', 'ear-l', 'ear-r']
SIDES = {'eyewhite': 'white', 'irides': 'iris', 'eyelash': 'lash', 'eyebrow': 'brow',
         'eye_close': 'closed', 'eye close': 'closed','ears':'ear','handwear':'handwear'}


def infer_tag(name):
    name=name.split('--')[0]
    n = re.sub(r'[-_\s]+', ' ', name.lower()).strip()
    side = re.fullmatch(r'(eyewhite|irides|eyelash|eyebrow|eye close|ears|handwear) ([lr])', n)
    if side:
        return {**SIDES,'ears':'ear','handwear':'handwear'}[side[1]]+'-'+side[2]
    if name.lower() in TAGS:
        return name.lower()
    return n if n in TAGS else {'mouth open':'mouth','mouth close':'mouth-closed',
                               'mouth closed':'mouth-closed','顔':'face','前髪':'front hair','後ろ髪':'back hair'}.get(n,'static')


class Layer(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: str = Field(pattern=r'^[a-f0-9]{32}$')
    name: str = Field(min_length=1, max_length=150)
    asset: str = Field(pattern=r'^[a-f0-9]{32}\.png$')
    tag: str = 'static'
    x: float = Field(0, ge=-16384, le=16384)
    y: float = Field(0, ge=-16384, le=16384)
    scale: float = Field(1, ge=.05, le=4)
    opacity: float = Field(1, ge=0, le=1)
    visible: bool = True
    locked: bool = False
    parent: str | None = None
    repair: bool = False
    depth: float = Field(0, ge=-1, le=1)
    crop: list[int] | None = None


class Edit(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=150)
    layers: list[Layer] = Field(min_length=1, max_length=100)


def folder(mid):
    if not re.fullmatch(r'[a-f0-9]{32}', mid):
        raise HTTPException(404, '素材が見つかりません')
    p = STORE / mid
    if not (p / 'state.json').is_file():
        raise HTTPException(404, '素材が見つかりません')
    return p


def read(mid):
    return json.loads((folder(mid) / 'state.json').read_text(encoding='utf-8'))


def persist(path, state):
    if state.get('depth'):
        from .material_inference import signature
        state['depthCurrent']=state['depth']['signature']==signature(state)
    (path / 'history').mkdir(exist_ok=True)
    text = json.dumps(state, ensure_ascii=False, indent=2)
    (path / 'history' / f"{state['revision']:06d}.json").write_text(text, encoding='utf-8')
    tmp = path / 'state.tmp'
    tmp.write_text(text, encoding='utf-8')
    tmp.replace(path / 'state.json')


def checked_image(path):
    with Image.open(path) as im:
        if im.width * im.height > MAX_PIXELS:
            raise ValueError('画像は16メガピクセル以下にしてください')
        return im.convert('RGBA')


def add_image(path, state, image, name, tag='static', x=0, y=0, visible=True):
    if len(state['layers']) >= 100:
        raise ValueError('素材は100レイヤー以下にしてください')
    box = image.getchannel('A').getbbox()
    if not box:
        return
    aid = uuid.uuid4().hex
    image.crop(box).save(path / f'{aid}.png')
    layer = Layer(id=aid, name=name[:150], asset=aid+'.png', tag=tag,
                  x=x+box[0], y=y+box[1], visible=visible).model_dump()
    state['layers'].append(layer)


def add_source(path, state, source, candidate=False):
    first=len(state['layers'])
    if source.suffix.lower() != '.psd':
        image = checked_image(source)
        if not state['layers']:
            state.update(width=image.width, height=image.height)
        add_image(path, state, image, source.stem, visible=not candidate)
        return
    psd = PSDImage.open(source, max_alloc_bytes=512*1024**2)
    if psd.width * psd.height > MAX_PIXELS:
        raise ValueError('PSDは16メガピクセル以下にしてください')
    if state['layers'] and (psd.width, psd.height) != (state['width'], state['height']):
        raise ValueError('候補PSDは同じキャンバスサイズにしてください')
    state.update(width=psd.width, height=psd.height)
    leaves = [p for p in psd.descendants() if not p.is_group()]
    if len(leaves) > 100:
        raise ValueError('PSDは100レイヤー以下にしてください')
    for p in leaves:
        if p.width * p.height > MAX_PIXELS:
            raise ValueError('大きすぎるレイヤーがあります')
        im = p.composite(force=True, layer_filter=lambda _: True)
        if im is None:
            continue
        im = im.convert('RGBA')
        # Layer composite applies its own opacity, but not ancestor opacity.
        parent, opacity = p.parent, 1.
        while parent is not None and parent is not psd:
            opacity *= parent.opacity / 255
            parent = parent.parent
        if opacity != 1:
            im.putalpha(im.getchannel('A').point(lambda a: round(a*opacity)))
        n = re.sub(r'[-_\s]+', ' ', p.name.lower()).strip()
        if str(p.blend_mode) != 'BlendMode.NORMAL' or p.clipping or p.has_mask():
            state['warnings'].append(p.name+': 合成効果は元PSDと比較してください。')
        role = SIDES.get(n)
        if role:
            cut = max(0, min(im.width, round(psd.width/2-p.left)))
            for side, box in [('l', (0, 0, cut, im.height)), ('r', (cut, 0, im.width, im.height))]:
                if box[2] > box[0]:
                    add_image(path, state, im.crop(box), p.name+'-'+side, role+'-'+side,
                              p.left+box[0], p.top, p.is_visible() and not candidate)
        else:
            tag = infer_tag(p.name)
            add_image(path, state, im, p.name, tag, p.left, p.top, p.is_visible() and not candidate)
    # Upstream PSD suffixes may use the character's own left/right. Our UI and
    # trackers use screen coordinates; infer paired sides from actual artwork.
    added=state['layers'][first:]
    for role in ['white','iris','lash','brow','closed','ear','handwear']:
        pair=[p for p in added if p['tag'] in (role+'-l',role+'-r')]
        if len(pair)==2:
            pair.sort(key=lambda p:p['x']+checked_image(path/p['asset']).width/2)
            for p,side in zip(pair,['l','r']):p['tag']=role+'-'+side


def validate(state, edit, path):
    if edit.revision != state['revision']:
        raise HTTPException(409, '別の画面で更新されています。読み直してから編集してください')
    layers = [p.model_dump() for p in edit.layers]
    lookup = {p['id']: p for p in layers}
    if len(lookup) != len(layers):
        raise ValueError('レイヤーIDが重複しています')
    assets = {p.name for p in path.glob('*.png') if re.fullmatch(r'[a-f0-9]{32}\.png',p.name)}
    for p in layers:
        if p['asset'] not in assets or not (path / p['asset']).is_file():
            raise ValueError('素材の画像が見つかりません')
        if p['tag'] not in TAGS:
            raise ValueError('パーツの役割が不正です')
        chain = {p['id']}; owner = p
        while owner['parent']:
            if owner['parent'] in chain or owner['parent'] not in lookup:
                raise ValueError('追従先が循環しているか、存在しません')
            chain.add(owner['parent']); owner = lookup[owner['parent']]
        if p['repair'] and not p['parent']:
            raise ValueError('補修レイヤーには補修先を選んでください')
        if p['crop'] is not None:
            c = p['crop']
            with Image.open(path / p['asset']) as im:
                if len(c) != 4 or not (0 <= c[0] < c[2] <= im.width and 0 <= c[1] < c[3] <= im.height):
                    raise ValueError('切り出し範囲が不正です')
    return layers


def layer_image(path, p):
    im = checked_image(path / p['asset'])
    if p['crop']:
        mask = Image.new('L', im.size)
        mask.paste(255, tuple(p['crop']))
        im.putalpha(Image.fromarray(np.minimum(np.asarray(im.getchannel('A')), np.asarray(mask))))
    size = (max(1, round(im.width*p['scale'])), max(1, round(im.height*p['scale'])))
    if size[0]*size[1] > MAX_PIXELS:
        raise ValueError('拡大後のパーツが大きすぎます')
    if im.size != size:
        im = im.resize(size, Image.Resampling.LANCZOS)
    if p['opacity'] != 1:
        im.putalpha(im.getchannel('A').point(lambda a: round(a*p['opacity'])))
    return im


def materialized(path, state):
    """Merge repairs into the owner before tracing; independent parts retain order."""
    lookup = {p['id']: p for p in state['layers']}
    def owner(p):
        while p['repair']:
            p = lookup[p['parent']]
        return p['id']
    groups = {}
    for p in state['layers']:
        if not p['visible']:
            continue
        key = owner(p)
        if not lookup[key]['visible']:
            continue
        groups.setdefault(key, []).append(p)
    for p in state['layers']:
        if p['id'] not in groups:
            continue
        canvas = Image.new('RGBA', (state['width'], state['height']))
        for child in groups[p['id']]:
            canvas.alpha_composite(layer_image(path, child), (round(child['x']), round(child['y'])))
        yield p, canvas


def export_psd(path, state, dest):
    psd = PSDImage.new('RGBA', (state['width'], state['height']))
    names = {}
    for p, im in materialized(path, state):
        box = im.getchannel('A').getbbox()
        if not box:
            continue
        # Unique stable names; mapping is supplied alongside the PSD.
        name = p['tag']+'--'+p['id']
        layer=PixelLayer.frompil(im.crop(box), psd, name=name, top=box[1], left=box[0])
        if p['tag'].startswith('closed-') or p['tag']=='mouth-closed':layer.visible=False
        names[name] = p
    if not names:
        raise ValueError('表示中のパーツがありません')
    psd.save(dest)
    return names


def build_svg(path, state, dest, preset, progress):
    from .eyelids import attach_closed_lashes
    from .mouths import attach_closed_mouths
    names = export_psd(path, state, dest.parent / (dest.name+'.psd'))
    project = convert_file(dest.parent / (dest.name+'.psd'), dest, preset=preset, progress=progress)
    parts = project['parts']; mapped = {}
    for p in parts:
        src = names[p['name']]; p['name'] = src['name']; p['materialId'] = src['id']
        mapped[src['id']] = p
        p['role'] = src['tag'] if src['tag'] in ['mouth','tail','ear-l','ear-r'] or re.fullmatch(r'(white|iris|lash|brow)-[lr]', src['tag']) else 'static'
        p['deformGroup'] = {'front hair':'front','back hair':'back','handwear-l':'arm-l','handwear-r':'arm-r'}.get(src['tag'], 'core')
        if src['tag']=='eyewear':p['role']='glasses'
        if src['tag'] in ['headwear','earwear','neckwear','bottomwear','wings']:
            p.update(independentAccessory=True,sourceLayerName=src['tag'])
            if src['tag']!='headwear':p['deformGroup']=src['tag']
        if src['tag'] == 'face':
            p['faceBase'] = True
        p['attachmentDepth'] = src['depth']
        if p['role'] == 'mouth':
            p['mouthMode'] = 'source-open'
    # Closed artwork is registered to the owner's exact local coordinates.
    for closed in list(parts):
        source = names[next(n for n, v in names.items() if v['id']==closed['materialId'])]
        target_role = {'closed-l':'lash-l','closed-r':'lash-r','mouth-closed':'mouth'}.get(source['tag'])
        if not target_role:
            continue
        target = next((p for p in parts if p['role']==target_role), None)
        if target:
            text = (dest / closed['svg']).read_text(encoding='utf-8')
            offset = f"translate({closed['x']-target['x']} {closed['y']-target['y']})"
            target['closedSvgText'] = f'<svg xmlns="http://www.w3.org/2000/svg" width="{target["width"]}" height="{target["height"]}" viewBox="0 0 {target["width"]} {target["height"]}"><g transform="{offset}">{text}</g></svg>'
            target['closedSource'] = 'psd'
            mapped[closed['materialId']]=target
            parts.remove(closed)
    for p in parts:
        src = next(v for v in state['layers'] if v['id']==p['materialId'])
        if src['parent'] and src['parent'] in mapped:
            p['followPart'] = mapped[src['parent']]['id']
    face = next((p for p in parts if p.get('faceBase')), None)
    if face:
        cx = face['x']+face['width']/2; cy = face['y']+face['height']*.55
        project['rig'] = dict(faceX=cx,faceY=cy,faceWidth=face['width'],neckX=cx,
                              neckY=face['y']+face['height'],headTop=face['y'],segmented=True,
                              hairGridSize=2,hairWeights=[0]*4,arms={})
        for p in parts:
            if p['deformGroup'].startswith('arm-'):
                project['rig']['arms'][p['deformGroup']] = dict(x=p['x']+p['width']/2,y=p['y'])
        project['settings'].update(rigEnabled=True,rigMode='stable',headTilt=1,headYaw=.12,headNod=.3,
                                   bodyFollow=.2,independentHair=True,frontHair=2,backHair=5,armSwing=.5)
    attach_closed_lashes(project, dest)
    attach_closed_mouths(project, dest)
    project['name'] = state['name']
    project['settings']['renderSource'] = 'svg'
    from .material_inference import signature
    depth = state.get('depth')
    if depth and depth.get('signature') == signature(state) and project.get('rig'):
        project['rig']['depth'] = depth['field']
        project['settings'].update(depthEnabled=True,depthStrength=1)
        for p in parts:
            value=depth.get('partValues',{}).get(p['materialId'])
            if value is not None and p['deformGroup'] not in ('core','front','back'):
                p['attachmentDepth']=max(-1,min(1,p['attachmentDepth']+depth['field']['median']-value))
    elif depth:
        project['warnings'].append('補正後に奥行きが更新されていません。以前のDepthは適用していません。')
    project['conversion'].update(mode='prepared',materialId=state['id'],materialRevision=state['revision'],motionParts=bool(face))
    (dest / 'project.json').write_text(json.dumps(project,ensure_ascii=False,indent=2),encoding='utf-8')
    from .convert import assemble
    (dest / 'assembled.svg').write_text(assemble(project,dest),encoding='utf-8')
    return project


def upload(file, path):
    suffix = Path(file.filename or '').suffix.lower()
    if suffix not in ('.psd','.png','.jpg','.jpeg','.webp'):
        raise HTTPException(415, 'PSD / PNG / JPEG / WebPを選んでください')
    dest = path / ('input-'+uuid.uuid4().hex+suffix)
    total = 0
    with dest.open('xb') as out:
        while chunk := file.file.read(1024**2):
            total += len(chunk)
            if total > 100*1024**2:
                raise HTTPException(413,'素材は100MB以下にしてください')
            out.write(chunk)
    return dest


@router.get('')
def listing():
    if not STORE.exists():
        return []
    return [json.loads(p.read_text(encoding='utf-8')) for p in sorted(STORE.glob('*/state.json'), key=lambda p:p.stat().st_mtime, reverse=True)[:40]]


@router.post('')
def create(file: UploadFile = File(...)):
    from .server import space_guard
    space_guard()
    mid = uuid.uuid4().hex; path = STORE / mid; path.mkdir(parents=True)
    source = upload(file,path)
    state = dict(id=mid,version=1,revision=0,name=Path(file.filename or '素材').stem[:150],width=1,height=1,layers=[],warnings=[])
    state['sourceAsset']=source.name
    try:
        add_source(path,state,source)
        if not state['layers']:
            raise ValueError('画像レイヤーがありません')
        persist(path,state)
    except Exception as e:
        raise HTTPException(422,str(e)) from e
    return state


@router.get('/{mid}')
def get(mid: str):
    return read(mid)


@router.get('/{mid}/files/{name}')
def asset(mid: str,name: str):
    path = folder(mid)
    if not re.fullmatch(r'[a-f0-9]{32}\.png|export-[a-f0-9]{32}\.(psd|json|zip)', name) or not (path/name).is_file():
        raise HTTPException(404,'素材が見つかりません')
    return FileResponse(path/name)


@router.put('/{mid}')
def save(mid: str,edit: Edit):
    with mutex:
        state=read(mid); path=folder(mid)
        try:
            state['layers']=validate(state,edit,path)
        except ValueError as e:
            raise HTTPException(422,str(e)) from e
        state.update(name=edit.name,revision=state['revision']+1)
        if state.get('depth'):
            from .material_inference import signature
            state['depthCurrent']=state['depth']['signature']==signature(state)
        persist(path,state)
        return state


@router.post('/{mid}/add')
def add(mid: str, file: UploadFile=File(...), revision: int=Form(...), candidate: bool=Form(False)):
    with mutex:
        state=read(mid); path=folder(mid)
        if revision != state['revision']:
            raise HTTPException(409,'素材が更新されています。読み直してください')
        source=upload(file,path)
        try:
            add_source(path,state,source,candidate)
            state['revision']+=1;persist(path,state)
        except Exception as e:
            raise HTTPException(422,str(e)) from e
        return state


@router.post('/{mid}/export')
def export(mid: str):
    with mutex:
        state=read(mid); path=folder(mid); name='export-'+uuid.uuid4().hex
        try:
            export_psd(path,state,path/(name+'.psd'))
            (path/(name+'.json')).write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
            with zipfile.ZipFile(path/(name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
                z.writestr('material.json',json.dumps(state,ensure_ascii=False))
                for asset_name in {p['asset'] for p in state['layers']}:
                    z.write(path/asset_name,asset_name)
                if state.get('sourceAsset') and (path/state['sourceAsset']).is_file():
                    z.write(path/state['sourceAsset'],state['sourceAsset'])
        except ValueError as e:
            raise HTTPException(422,str(e)) from e
    return dict(psd=f'/api/materials/{mid}/files/{name}.psd',manifest=f'/api/materials/{mid}/files/{name}.json',bundle=f'/api/materials/{mid}/files/{name}.zip')


class Region(BaseModel):
    model_config=ConfigDict(extra='forbid')
    revision:int=Field(ge=0)
    part_id:str=Field(pattern=r'^[a-f0-9]{32}$')
    rect:list[int]=Field(min_length=4,max_length=4)
    cut_source:bool=False
    instruction:str=Field('',max_length=2000)


def region_source(mid,body):
    state=read(mid);path=folder(mid)
    if state['revision']!=body.revision:raise HTTPException(409,'素材を保存し直してください')
    part=next((p for p in state['layers'] if p['id']==body.part_id),None)
    if not part:raise HTTPException(404,'パーツが見つかりません')
    im=checked_image(path/part['asset']);c=body.rect
    if not(0<=c[0]<c[2]<=im.width and 0<=c[1]<c[3]<=im.height):raise HTTPException(422,'範囲が不正です')
    if part['crop']:
        mask=Image.new('L',im.size);mask.paste(255,tuple(part['crop']))
        im.putalpha(Image.fromarray(np.minimum(np.asarray(im.getchannel('A')),np.asarray(mask))))
    return path,state,part,im


@router.post('/{mid}/extract')
def extract(mid:str,body:Region):
    with mutex:
        path,state,part,im=region_source(mid,body)
        if part['locked']:raise HTTPException(422,'編集ロックを解除してください')
        crop=im.crop(tuple(body.rect));box=crop.getchannel('A').getbbox()
        if not box:raise HTTPException(422,'選んだ範囲に絵がありません')
        if len(state['layers'])>=100:raise HTTPException(422,'100レイヤーまでです。不要な候補を一覧から外してください')
        add_image(path,state,crop,part['name']+'の切り出し')
        added=state['layers'].pop();added.update(x=part['x']+(body.rect[0]+box[0])*part['scale'],y=part['y']+(body.rect[1]+box[1])*part['scale'],scale=part['scale'],opacity=part['opacity'],parent=part['id'])
        state['layers'].insert(state['layers'].index(part)+1,added)
        if body.cut_source:
            im.paste((0,0,0,0),tuple(body.rect));asset_name=uuid.uuid4().hex+'.png';im.save(path/asset_name);part.update(asset=asset_name,crop=None)
        state['revision']+=1;state['depthCurrent']=False;persist(path,state)
        return state


@router.post('/{mid}/assist-region')
def assist_region(mid:str,body:Region):
    with mutex:
        path,state,part,im=region_source(mid,body);name='export-'+uuid.uuid4().hex
        import io
        def png(image):
            stream=io.BytesIO();image.save(stream,format='PNG');return stream.getvalue()
        composite=Image.new('RGBA',(state['width'],state['height']))
        for _,image in materialized(path,state):composite.alpha_composite(image)
        mask=Image.new('L',im.size);mask.paste(255,tuple(body.rect))
        with zipfile.ZipFile(path/(name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('context.png',png(composite));z.writestr('part.png',png(im));z.writestr('region.png',png(im.crop(tuple(body.rect))));z.writestr('mask.png',png(mask))
            z.writestr('request.md',f"# パーツ補修依頼\n\n対象: {part['name']}\n役割: {part['tag']}\n\n{body.instruction or '選択範囲の線と塗りの不自然な箇所を補修してください。'}\n\ncontext.pngは参照用です。part.pngの白マスク範囲だけを補修し、範囲外は透明にした同寸法のRGBA PNGを返してください。顔立ち・線幅・色・位置・寸法を保ってください。\n")
            z.writestr('placement.json',json.dumps(dict(materialId=mid,revision=state['revision'],partId=part['id'],x=part['x'],y=part['y'],scale=part['scale'],width=im.width,height=im.height),ensure_ascii=False))
        return dict(url=f'/api/materials/{mid}/files/{name}.zip')


@router.post('/restore')
def restore(file:UploadFile=File(...)):
    from .server import space_guard
    space_guard();raw=file.file.read(100*1024**2+1)
    if len(raw)>100*1024**2:raise HTTPException(413,'作業ZIPは100MB以下にしてください')
    import io
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            if sum(p.file_size for p in z.infolist())>512*1024**2 or len(z.infolist())>103:raise ValueError('作業ZIPが大きすぎます')
            state=json.loads(z.read('material.json'))
            if state.get('version')!=1 or not all(isinstance(state.get(k),int) and 0<state[k]<=16384 for k in ['width','height']) or state['width']*state['height']>MAX_PIXELS:raise ValueError('素材の形式が不正です')
            edit=Edit(revision=0,name=state['name'],layers=state['layers'])
            mid=uuid.uuid4().hex;path=STORE/mid;path.mkdir(parents=True)
            for asset_name in {p.asset for p in edit.layers}:
                (path/asset_name).write_bytes(z.read(asset_name));checked_image(path/asset_name)
            source=state.get('sourceAsset','')
            if re.fullmatch(r'input-[a-f0-9]{32}\.(png|psd|jpg|jpeg|webp)',source) and source in z.namelist():(path/source).write_bytes(z.read(source))
            else:state.pop('sourceAsset',None)
            state.update(id=mid,revision=0);state['layers']=validate(state,edit,path);persist(path,state)
            return state
    except (ValueError,KeyError,OSError,zipfile.BadZipFile) as e:raise HTTPException(422,'作業ZIPを開けません: '+str(e)) from e


@router.post('/{mid}/convert')
def convert(mid: str, preset: str='balanced'):
    from .server import jobs,lock,pool,PROJECTS,space_guard
    from .convert import PRESETS
    if preset not in PRESETS:
        raise HTTPException(422,'変換品質が不正です')
    state=read(mid);path=folder(mid);space_guard()
    with lock:
        if any(j['state'] in ('queued','running') for j in jobs.values()):
            raise HTTPException(409,'変換中です。完了後に実行してください')
        jid=uuid.uuid4().hex;jobs[jid]=dict(id=jid,state='queued',progress=0,message='補正済み素材を準備しています')
    def work():
        jobs[jid]['state']='running'
        try:
            build_svg(path,state,PROJECTS/jid,preset,lambda value,message:jobs[jid].update(progress=value,message=message))
            jobs[jid].update(state='done',projectId=jid)
        except Exception as e:
            jobs[jid].update(state='error',message=str(e))
    pool.submit(work)
    return dict(jobId=jid)
