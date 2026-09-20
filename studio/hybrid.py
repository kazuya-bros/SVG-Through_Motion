"""Original-image plate plus PSD facial features; never reassemble neck/clothes."""
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np
from PIL import Image
from psd_tools import PSDImage
from scipy import ndimage

from .convert import MAX_PIXELS, PRESETS, clean_alpha, role_for, trace_part, write_new, assemble
from .eyelids import attach_closed_lashes
from .segmented import split_motion_layers,is_head_accessory,is_eyewear,motion_group,motion_image
from .artwork_sources import attach_artwork_sources
from .hair_cleanup import clean_hair_eye_overlap,hair_lash_layers
from .mouths import attach_closed_mouths
from .face_donors import read_donors, attach_donors
from .background import source_background_masks
from .eye_plate import psd_skin_inputs, blend_eye_skin
from .depth import read_depth, attach_depth
from .psd_visibility import require_visible_if_present


def spatial_bounds(text):
    """Conservative bounds of VTracer M/L/C/Z paths, in cropped SVG coordinates."""
    bounds=[]
    def visit(node, sx=1, sy=1, tx=0, ty=0):
        if node.tag.rsplit('}',1)[-1]=='defs':
            return
        for kind, raw in re.findall(r'(translate|scale)\(([^)]+)\)', node.get('transform','')):
            values=[float(v) for v in re.findall(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',raw)]
            if kind=='translate':
                tx+=values[0]*sx;ty+=(values[1] if len(values)>1 else 0)*sy
            else:
                sx*=values[0];sy*=values[1] if len(values)>1 else values[0]
        if node.tag.rsplit('}',1)[-1]=='path':
            data=node.get('d','')
            if re.search('[AaHhVvQqSsTt]|[mlcz]',data):
                raise ValueError('VTracerパスの形式が空間索引に未対応です')
            v=np.array([float(n) for n in re.findall(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',data)]).reshape(-1,2)
            v=v*[sx,sy]+[tx,ty]
            bounds.append([round(float(v[:,0].min()),2),round(float(v[:,1].min()),2),round(float(v[:,0].max()),2),round(float(v[:,1].max()),2)])
        for child in node:
            visit(child,sx,sy,tx,ty)
    visit(ET.fromstring(text))
    return bounds


def convert_hybrid(source, original, dest, preset='quality', line_cleanup=True,
                   alpha_threshold=12, progress=lambda *_: None, motion_parts=False, source_open=False, face_donors=None, depth_psd=None):
    if preset not in PRESETS:
        raise ValueError('未知の変換プリセット')
    progress(0, '通常PSDを読み込んでいます')
    psd = PSDImage.open(source, max_alloc_bytes=512 * 1024**2)
    with Image.open(original) as im:
        if im.width * im.height > MAX_PIXELS:
            raise ValueError('画像は16メガピクセル以下にしてください')
        original_im = im.convert('RGBA')
    if original_im.size != (psd.width, psd.height):
        raise ValueError('元画像とPSDは同じキャンバスサイズ・位置にしてください。自動拡縮は行いません。')
    w, h = original_im.size
    progress(1, '閉じ目・口などの差分PSDを読み込んでいます' if face_donors else '元画像とPSDを確認しています')
    donors = read_donors(face_donors, (w, h), alpha_threshold, line_cleanup)
    leaves = [l for l in psd.descendants() if not l.is_group()]
    if len(leaves) > 100 or w*h > MAX_PIXELS:
        raise ValueError('100レイヤー・16メガピクセル以下にしてください')
    progress(2, '通常PSDとDepth PSDを照合しています' if depth_psd else '通常PSDを確認しています')
    depth_data = read_depth(depth_psd, psd)
    require_visible_if_present(leaves, lambda layer: role_for(layer.name).startswith('white-'), '通常PSD')
    if source_open:
        require_visible_if_present(leaves, lambda layer: role_for(layer.name) == 'mouth', '通常PSD')
    dest.mkdir(parents=True, exist_ok=False)
    for name in ('parts', 'originals', 'work'):
        (dest / name).mkdir()
    original_im.save(dest / 'source.png')
    original_a = np.array(original_im)
    features = []
    removal = np.zeros((h, w), np.uint8)
    hair = np.zeros((h, w), np.uint8)
    front = np.zeros((h, w), np.uint8)
    front_color=Image.new('RGBA',(w,h))
    lash_alpha=np.zeros((h,w),np.uint8)
    brow_alpha=np.zeros((h,w),np.uint8)
    for layer in leaves:
        role = role_for(layer.name)
        if not layer.is_visible() or not (role == 'hair' or role == 'mouth' or role.startswith(('white-', 'iris-', 'lash-', 'brow-'))):
            continue
        if layer.width*layer.height > MAX_PIXELS:
            raise ValueError('レイヤーが16メガピクセルを超えています')
        im = layer.composite(force=True)
        if im is None:
            continue
        im = clean_alpha(im, role, alpha_threshold, line_cleanup)
        if role=='hair':im=motion_image(im)
        canvas = Image.new('RGBA', (w, h))
        canvas.alpha_composite(im, (layer.left, layer.top))
        pixels = np.array(canvas)
        if role == 'hair':
            hair = np.maximum(hair, pixels[:, :, 3])
            if 'front' in layer.name.lower() or '前' in layer.name:
                # Keep the isolated PSD's color and alpha for clean foreground hair.
                front = np.maximum(front, pixels[:, :, 3])
                front_color.alpha_composite(canvas)
        else:
            if role == 'mouth' and source_open:
                # PSD supplies the footprint; the original illustration supplies all mouth colors.
                mouth_pixels = original_a.copy()
                mouth_pixels[:, :, 3] = np.minimum(original_a[:, :, 3], pixels[:, :, 3])
                canvas = Image.fromarray(mouth_pixels)
            features.append((layer.name, role, canvas))
            if role.startswith('lash-'):
                lash_alpha=np.maximum(lash_alpha,pixels[:,:,3])
            if role.startswith('brow-'):
                brow_alpha=np.maximum(brow_alpha,pixels[:,:,3])
            removal = np.maximum(removal, pixels[:, :, 3])
    if not features or not any(r.startswith('white-') for _, r, _ in features):
        raise ValueError('白目・瞳・まつ毛・眉・口の名前が付いたPSDレイヤーが必要です')
    if source_open and not any(r == 'mouth' for _, r, _ in features):
        raise ValueError('元絵の開いた口を切り出すため、mouth（口）レイヤーが必要です')
    source_ink=original_a
    original_a,hair_repair=clean_hair_eye_overlap(original_a,np.array(front_color),lash_alpha)
    brow_repaired,brow_repair=clean_hair_eye_overlap(source_ink,np.array(front_color),brow_alpha)
    brow_repair &= ~hair_repair  # A pixel must not belong to both blink and brow overlays.
    original_a[brow_repair,:3]=brow_repaired[brow_repair,:3]
    eye_centers={}
    for _,role,im in features:
        if role.startswith('white-'):
            b=im.getchannel('A').getbbox()
            if b:eye_centers[role[-1]]=((b[0]+b[2])/2,(b[1]+b[3])/2)
    # The PSD's isolated foreground carries no baked open-eye ink. Reapplying
    # source-illustration overlays here would leave stationary lashes on a blink.
    psd_front=front_color.getchannel('A').getbbox() is not None
    overlays=[] if psd_front else hair_lash_layers(source_ink,hair_repair,eye_centers)
    brow_overlays=[] if psd_front else hair_lash_layers(source_ink,brow_repair,eye_centers)
    Image.fromarray(hair_repair.astype('uint8')*255).save(dest/'work'/'hair-eye-repair.png')
    Image.fromarray(brow_repair.astype('uint8')*255).save(dest/'work'/'hair-brow-repair.png')
    # Keep the entire source drawing order. Only replace original feature footprints.
    removal = ndimage.binary_dilation(removal > 30, iterations=max(2, round(w/256)))
    front_shape = ndimage.binary_dilation(front > 60, iterations=1)
    occlusion = front_shape & ndimage.binary_dilation(removal, iterations=12)
    removal &= ~front_shape
    rgb = original_a[:, :, :3].astype(float)
    # Hair/ink beside an eye is not a valid eyelid donor. Sample nearby skin only.
    r, g, b = rgb.transpose(2,0,1)
    skin = (~ndimage.binary_dilation(removal, iterations=8)) & (r>185) & (r-g>4) & (r-g<36) & (g-b>5) & (g-b<40)
    yy, xx = np.mgrid[:h,:w]
    boxes = [im.getchannel('A').getbbox() for _, role, im in features if role=='mouth']
    if boxes:
        mx=(boxes[0][0]+boxes[0][2])/2; my=(boxes[0][1]+boxes[0][3])/2
        skin &= (abs(xx-mx)<w*.22) & (abs(yy-my)<h*.19)
    if not skin.any():
        raise ValueError('顔の下地になる肌色を見つけられません。元画像の顔位置を確認してください。')
    nearest = ndimage.distance_transform_edt(~skin, return_distances=False, return_indices=True)
    donor = rgb[tuple(nearest)]
    donor = ndimage.gaussian_filter(donor, sigma=(4,4,0))
    repaired = original_a[:, :, :3].copy()
    repaired[removal] = donor[removal].astype('uint8')
    plate = original_a.copy()
    plate[:, :, :3] = repaired
    # White sleeves can touch the bottom edge: border connectivity alone is unsafe.
    outer_bg, hair_gaps = source_background_masks(original_a,leaves)
    bg = outer_bg | hair_gaps
    plate[bg, 3] = 0
    # This uses the base PSD's separated face, independently of closed-eye donors.
    face_skin,eye_area=psd_skin_inputs(leaves,(w,h),features,removal,
                                     lambda im:clean_alpha(im,'static',alpha_threshold,line_cleanup))
    plate,skin_repair=blend_eye_skin(plate,face_skin,eye_area,front>60,radius=max(2,round(w*12/1024)))
    Image.fromarray(skin_repair.astype('uint8')*255).save(dest/'work'/'eye-plate-repair.png')
    Image.fromarray(removal.astype('uint8')*255).save(dest/'work'/'face-removal.png')
    Image.fromarray(plate).save(dest/'work'/'clean-plate.png')
    layers = [('元画像（顔の下地）', 'static', Image.fromarray(plate))] + features
    if psd_front:
        layers.append(('PSDの前髪', 'static', front_color))
    elif occlusion.any():
        foreground = original_a.copy()
        foreground[:, :, 3] = np.where(occlusion, original_a[:, :, 3], 0)
        layers.append(('元画像の前髪（顔の手前）', 'static', Image.fromarray(foreground)))
    motion_meta={};arms={};source_options={}
    if motion_parts:
        leading,trailing,motion_meta,arms=split_motion_layers(plate,leaves,source_options=source_options)
        if psd_front:
            trailing=[('PSDの前髪','static',front_color)]
            motion_meta['PSDの前髪']={'deformGroup':'front','artworkSource':'psd'}
            if '前髪' in source_options:source_options['PSDの前髪']={**source_options.pop('前髪'),'psd':front_color}
        layers=leading+features+trailing
    elif psd_front or any((is_head_accessory(l.name) or motion_group(l.name).startswith('human-ear-')) and l.is_visible() for l in leaves):
        # A translucent PSD front must not sit on the old, flattened front.
        # Merge the backing into one static part when independent motion is off.
        leading,trailing,accessory_meta,_=split_motion_layers(plate,leaves,prefer_psd=False)
        backing=Image.new('RGBA',(w,h))
        accessories=[layer for layer in leading if accessory_meta[layer[0]].get('independentAccessory')]
        for name,_,image in leading+([] if psd_front else trailing):
            if not accessory_meta[name].get('independentAccessory'):backing.alpha_composite(image)
        layers=[('元画像（顔の下地）','static',backing)]+features+accessories+([('PSDの前髪','static',front_color)] if psd_front else [])
        motion_meta.update({name:accessory_meta[name] for name,_,_ in accessories})
    # Glasses must sit in front of facial features. Preserve their PSD ordering
    # relative to the front hair, instead of burying them in the face underpaint.
    glasses=[layer for layer in layers if is_eyewear(motion_meta.get(layer[0],{}).get('sourceLayerName',''))]
    if glasses:
        glass_names={layer[0] for layer in glasses}
        layers=[layer for layer in layers if layer[0] not in glass_names]
        positions={layer.name:i for i,layer in enumerate(leaves) if layer.is_visible()}
        front_position=max((i for i,layer in enumerate(leaves) if layer.is_visible() and motion_group(layer.name)=='front'),default=-1)
        front_index=next((i for i,layer in enumerate(layers) if layer[0] in ('PSDの前髪','元画像の前髪（顔の手前）') or motion_meta.get(layer[0],{}).get('deformGroup')=='front'),len(layers))
        behind=[layer for layer in glasses if positions[motion_meta[layer[0]]['sourceLayerName']]<front_position]
        above=[layer for layer in glasses if layer not in behind]
        layers=layers[:front_index]+behind+layers[front_index:front_index+1]+above+layers[front_index+1:]
    for side,im in overlays:
        name='髪に重なるまつ毛（'+('左' if side=='l' else '右')+'）'
        layers.append((name,'static',im));motion_meta[name]={'blinkOverlay':side}
    for side,im in brow_overlays:
        name='髪に重なる眉（'+('左' if side=='l' else '右')+'）'
        layers.append((name,'static',im));motion_meta[name]={'faceOverlay':'brow-'+side}
    project = dict(version=1, id=dest.name, name=Path(original).stem+' · Hybrid', width=w, height=h,
                   parts=[], warnings=[], conversion=dict(mode='hybrid', preset=preset, lineCleanup=line_cleanup,
                   alphaThreshold=alpha_threshold, originalName=Path(original).name, psdName=Path(source).name,
                   backgroundRemoval='psd-protected-hair-gaps-v3',hairGapPixels=int((hair_gaps & ~outer_bg).sum()),frontHairSource='psd' if psd_front else 'original',
                   eyePlateRepair='psd-skin-color-match-v1' if skin_repair.any() else 'unavailable',
                   eyePlateRepairPixels=int(skin_repair.sum())),
                   settings=dict(duration=4, sway=.3, breathe=1, blink=True, talking=True, background='white',
                                 rigEnabled=True, rigMode='stable', headTilt=1.2, headYaw=.15, headNod=.5, bodyFollow=.2, hairBend=3))
    reconstruction = Image.new('RGBA', (w, h))
    for i, (name, role, im) in enumerate(layers):
        box = im.getchannel('A').getbbox()
        if not box:
            continue
        pid = f'p{len(project["parts"]):03d}'
        crop = im.crop(box)
        crop.save(dest/'originals'/f'{pid}.png')
        progress(10+int(i/len(layers)*(80 if donors else 85)), f'元画像＋顔パーツ SVG化: {name}')
        svg_text, paths = trace_part(crop, dest/'work', pid, preset, role)
        reconstruction.alpha_composite(crop, box[:2])
        project['parts'].append(dict(id=pid, name=name, role=role, x=box[0], y=box[1], width=crop.width,
                                    height=crop.height, visible=True, opacity=1, paths=paths,
                                    svg=f'parts/{pid}.svg', original=f'originals/{pid}.png'))
        if role=='static':
            project['parts'][-1]['spatialBounds']=spatial_bounds(svg_text)
        project['parts'][-1].update(motion_meta.get(name,{}))
        if name in source_options:
            attach_artwork_sources(project['parts'][-1],source_options[name],dest/'work',preset,crop,svg_text)
    whites = [p for p in project['parts'] if p['role'].startswith('white-')]
    mouths = [p for p in project['parts'] if p['role']=='mouth']
    face_owner=next((p for p in project['parts'] if p.get('faceBase')),whites[0])
    for part in project['parts']:
        if is_eyewear(part.get('sourceLayerName','')):
            part['followPart']=face_owner['id']
    cx = sum(p['x']+p['width']/2 for p in whites)/len(whites)
    ey = sum(p['y']+p['height']/2 for p in whites)/len(whites)
    my = mouths[0]['y']+mouths[0]['height']/2 if mouths else ey+h*.08
    face_width = max(p['x']+p['width'] for p in whites)-min(p['x'] for p in whites)
    # Mask weights are geometry only; foreground color comes from the isolated PSD.
    grid_size = 33
    grid = np.array(Image.fromarray(hair).resize((grid_size, grid_size), Image.Resampling.BILINEAR))/255
    project['rig'] = dict(neckX=cx, neckY=min(h*.8, my+(my-ey)*1.25), faceX=cx,
                          faceY=(ey+my)/2, faceWidth=face_width*1.4, headTop=max(0,ey-face_width*1.3),
                          hairGridSize=grid_size, hairWeights=np.round(grid,3).ravel().tolist())
    if motion_parts:
        project['rig'].update(segmented=True,arms=arms)
        project['conversion']['motionParts']=True
        project['conversion']['artworkSourcePolicy']='psd-motion-with-original-alternatives-v1'
        project['settings'].update(hairMethod='wave',frontHair=4,backHair=9,hairTip=2,armSwing=.8)
    if source_open:
        project['conversion'].update(inputRequirement='open-eyes-open-mouth', mouthColorSource='original-image')
        for p in mouths:
            p['mouthMode']='source-open'
    if any(p['role']=='tail' for p in project['parts']):
        project['settings'].update(tailSwing=8,tailCycles=1)
    attach_closed_lashes(project,dest)
    attach_closed_mouths(project,dest)
    attach_donors(project, donors, dest, preset, progress)
    attach_depth(project, depth_data)
    if preset == 'quality':
        from .quality_trace import PROFILE
        project['conversion']['traceProfile'] = PROFILE
        project['settings']['renderSource'] = 'svg'
    reconstruction.save(dest/'reconstructed.png')
    write_new(dest/'project.json', json.dumps(project, ensure_ascii=False, indent=2))
    write_new(dest/'assembled.svg', assemble(project, dest))
    progress(100, '元画像＋PSD顔パーツの変換が完了しました')
    return project
