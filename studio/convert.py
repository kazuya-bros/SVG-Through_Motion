"""Position-preserving PSD/raster conversion; no source file is modified."""
from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np
from PIL import Image
from scipy import ndimage
from psd_tools import PSDImage
import vtracer

NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
MAX_PIXELS = 16_777_216
PRESETS = {
    'balanced': dict(color_precision=7, layer_difference=20, filter_speckle=4, path_precision=2),
    'detail': dict(color_precision=8, layer_difference=10, filter_speckle=2, path_precision=3),
    'light': dict(color_precision=6, layer_difference=32, filter_speckle=10, path_precision=1),
}


def tag(name):
    return '{%s}%s' % (NS, name)


def write_new(path: Path, data: str):
    with path.open('x', encoding='utf-8') as f:
        f.write(data)


def role_for(name):
    n = name.lower().replace('_', '-').strip()
    side = 'r' if re.search(r'[- ]r$|right|右', n) else 'l' if re.search(r'[- ]l$|left|左', n) else ''
    for keys, role in [(['eyewhite', '白目'], 'white'), (['irides', 'iris', '瞳', '虹彩'], 'iris'),
                       (['eyelash', 'まつ毛'], 'lash'), (['eyebrow', '眉'], 'brow')]:
        if any(k in n for k in keys):
            return f'{role}-{side}' if side else 'static'
    if re.search(r'(^|[- ])tail($|[- ])|尻尾|しっぽ',n):return 'tail'
    if 'mouth' in n or '口' in n:
        return 'mouth'
    if 'hair' in n or '髪' in n:
        return 'hair'
    if re.search(r'(^|[- ])ears?($|[- ])|耳', n):
        return f'ear-{side}' if side else 'static'
    if re.search(r'(^|[- ])chest($|[- ])|胸', n):
        return 'chest'
    return 'static'


def clean_alpha(im, role, threshold=12, line_cleanup=False):
    a = np.array(im.convert('RGBA')).copy()
    a[a[:, :, 3] < threshold, 3] = 0
    if role == 'mouth' and a[:, :, 3].any():
        # See-Through can leave faint disconnected pixels at canvas corners.
        # They must not turn a small mouth crop (and its animation pivot) into
        # the whole canvas. Keep antialiased fringes connected to real ink.
        labels, count = ndimage.label(a[:, :, 3] > 0)
        peak = int(a[:, :, 3].max())
        seed = a[:, :, 3] >= min(peak, max(32, peak * .25))
        keep = np.zeros(count + 1, dtype=bool)
        keep[np.unique(labels[seed])] = True
        keep[0] = False
        a[~keep[labels], 3] = 0
    if line_cleanup and (role.startswith('lash-') or role.startswith('brow-')):
        lum = a[:, :, :3].astype(float) @ np.array([.299, .587, .114])
        a[lum > 135, 3] = 0
        labels, count = ndimage.label(a[:, :, 3] > 0)
        if count:
            sizes = np.bincount(labels.ravel())
            keep = sizes >= max(3, sizes[1:].max() * .012)
            keep[0] = False
            a[~keep[labels], 3] = 0
    return Image.fromarray(a)


def trace_part(im: Image.Image, out: Path, part_id: str, preset: str):
    """Trace RGB and an 8-bit luminance alpha mask separately (no alpha squaring)."""
    original_width, original_height = im.size
    scale = 3 if max(im.size) <= 256 else 1
    if scale > 1:
        im = im.resize((im.width * scale, im.height * scale), Image.Resampling.LANCZOS)
    a = np.array(im.convert('RGBA'))
    alpha = a[:, :, 3]
    valid = alpha > 0
    if not valid.any():
        raise ValueError('空のパーツです')
    # Extend edge colors into transparent pixels before tracing: avoids black fringes.
    if not valid.all():
        nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        a[:, :, :3][~valid] = a[:, :, :3][tuple(nearest[:, ~valid])]
    rgb_path = out / f'{part_id}.rgb.png'
    mask_path = out / f'{part_id}.alpha.png'
    rgb_svg = out / f'{part_id}.color.svg'
    mask_svg = out / f'{part_id}.alpha.svg'
    Image.fromarray(a[:, :, :3], 'RGB').save(rgb_path)
    # Eight alpha levels keep soft edges without thousands of tiny opacity paths.
    quantized = (np.round(alpha.astype(float) / 255 * 7) * (255 / 7)).astype('uint8')
    Image.fromarray(quantized, 'L').convert('RGB').save(mask_path)
    vtracer.convert_image_to_svg_py(str(rgb_path), str(rgb_svg), colormode='color',
                                  hierarchical='stacked', mode='spline', **PRESETS[preset])
    vtracer.convert_image_to_svg_py(str(mask_path), str(mask_svg), colormode='color',
                                  hierarchical='stacked', mode='spline', color_precision=8,
                                  layer_difference=1, filter_speckle=0, path_precision=2)
    root = ET.Element(tag('svg'), width=str(original_width), height=str(original_height),
                      viewBox=f'0 0 {original_width} {original_height}')
    defs = ET.SubElement(root, tag('defs'))
    mask = ET.SubElement(defs, tag('mask'), id=f'alpha-{part_id}', maskUnits='userSpaceOnUse',
                         x='0', y='0', width=str(im.width), height=str(im.height),
                         attrib={'mask-type': 'luminance', 'color-interpolation': 'sRGB'})
    for child in ET.parse(mask_svg).getroot():
        mask.append(child)
    parent = ET.SubElement(root, tag('g'), transform=f'scale({1 / scale})') if scale > 1 else root
    g = ET.SubElement(parent, tag('g'), mask=f'url(#alpha-{part_id})')
    for child in ET.parse(rgb_svg).getroot():
        g.append(child)
    svg = ET.tostring(root, encoding='unicode')
    write_new(out.parent / 'parts' / f'{part_id}.svg', svg)
    return svg, sum(1 for _ in root.iter(tag('path')))


def assemble(project, root_dir: Path):
    root = ET.Element(tag('svg'), width=str(project['width']), height=str(project['height']),
                      viewBox=f"0 0 {project['width']} {project['height']}")
    for part in project['parts']:
        g = ET.SubElement(root, tag('g'), id=part['id'],
                          transform=f"translate({part['x']} {part['y']})",
                          attrib={'data-name': part['name'], 'data-role': part['role']})
        if not part['visible']:
            g.set('display', 'none')
        g.append(ET.fromstring((root_dir / 'parts' / f"{part['id']}.svg").read_text(encoding='utf-8')))
    return ET.tostring(root, encoding='unicode')


def convert_file(source: Path, dest: Path, preset='balanced', line_cleanup=False,
                 alpha_threshold=12, progress=lambda value, message: None, source_open=False):
    if preset not in PRESETS:
        raise ValueError('未知の変換プリセット')
    dest.mkdir(parents=True, exist_ok=False)
    for d in ['parts', 'originals', 'work']:
        (dest / d).mkdir()
    project = dict(version=1, id=dest.name, name=source.stem, parts=[], warnings=[],
                   settings=dict(duration=4, sway=1.2, breathe=3, blink=True, talking=False),
                   conversion=dict(preset=preset, lineCleanup=line_cleanup, alphaThreshold=alpha_threshold))
    source_layers = []
    if source.suffix.lower() == '.psd':
        psd = PSDImage.open(source, max_alloc_bytes=512 * 1024**2)
        width, height = psd.size
        if width * height > MAX_PIXELS:
            raise ValueError('PSDは合計16メガピクセル以下にしてください')
        leaves = [l for l in psd.descendants() if not l.is_group()]
        if len(leaves) > 100:
            raise ValueError('100レイヤー以下にしてください')
        for l in leaves:
            if l.width * l.height > MAX_PIXELS:
                raise ValueError('レイヤーが16メガピクセルを超えています')
        # See-Through's cached merged preview can contain black transparency noise.
        preview = psd.composite(force=True)
        if preview:
            preview.save(dest / 'source.png')
        # psd-tools iterates bottom-to-top. layer.composite() already applies own opacity.
        for i, layer in enumerate(leaves):
            progress(int(i / max(1, len(leaves)) * 10), f'レイヤー抽出: {layer.name}')
            if layer.width == 0 or layer.height == 0:
                continue
            if str(layer.blend_mode) != 'BlendMode.NORMAL' or layer.clipping:
                project['warnings'].append(f'{layer.name}: ブレンド/クリッピングの完全再現は非対応。比較で確認してください。')
            parent = layer.parent
            parent_opacity = 1.0
            while parent is not None and parent is not psd:
                parent_opacity *= parent.opacity / 255
                if parent.has_mask() or str(parent.blend_mode) not in ('BlendMode.NORMAL', 'BlendMode.PASS_THROUGH'):
                    project['warnings'].append(f'{layer.name}: 親グループのマスク/合成効果は個別出力に未反映。')
                parent = parent.parent
            # Export pixels even when an ancestor is hidden; retain visibility in metadata.
            image = layer.composite(force=True, layer_filter=lambda _: True)
            if image is not None:
                image = image.convert('RGBA')
                if parent_opacity < 1:
                    image.putalpha(image.getchannel('A').point(lambda a: round(a * parent_opacity)))
                source_layers.append((layer.name, image, layer.left, layer.top, layer.is_visible()))
    else:
        with Image.open(source) as image:
            if image.width * image.height > MAX_PIXELS:
                raise ValueError('画像は合計16メガピクセル以下にしてください')
            image = image.convert('RGBA')
        width, height = image.size
        image.save(dest / 'source.png')
        source_layers.append((source.stem, image, 0, 0, True))
        project['warnings'].append('一枚絵は1パーツとして変換。目や口を独立させるにはパーツ分けPSDを読み込んでください。')
    project.update(width=width, height=height)
    reconstruction = Image.new('RGBA', (width, height))
    for index, (name, image, left, top, visible) in enumerate(source_layers):
        progress(10 + int(index / max(1, len(source_layers)) * 85), f'SVG化 {index+1}/{len(source_layers)}: {name}')
        role = role_for(name)
        cleaned = clean_alpha(image, role, alpha_threshold, line_cleanup)
        box = cleaned.getchannel('A').getbbox()
        if not box:
            continue
        pid = f'p{index:03d}'
        cropped = cleaned.crop(box)
        x, y = left + box[0], top + box[1]
        image.crop(box).save(dest / 'originals' / f'{pid}.png')
        cropped.save(dest / 'work' / f'{pid}.clean.png')
        _, paths = trace_part(cropped, dest / 'work', pid, preset)
        if visible:
            reconstruction.alpha_composite(cropped, (x, y))
        project['parts'].append(dict(id=pid, name=name, role=role, x=x, y=y, width=cropped.width,
                                     height=cropped.height, visible=visible, opacity=1, paths=paths,
                                     svg=f'parts/{pid}.svg', original=f'originals/{pid}.png'))
    if source_open:
        project['conversion']['inputRequirement']='open-eyes-open-mouth'
        for part in project['parts']:
            if part['role']=='mouth': part['mouthMode']='source-open'
    if not project['parts']:
        raise ValueError('変換できるピクセルレイヤーがありません')
    reconstruction.save(dest / 'reconstructed.png')
    project['warnings'] = list(dict.fromkeys(project['warnings']))
    write_new(dest / 'project.json', json.dumps(project, ensure_ascii=False, indent=2))
    write_new(dest / 'assembled.svg', assemble(project, dest))
    progress(100, f"完了: {len(project['parts'])} パーツ")
    return project
