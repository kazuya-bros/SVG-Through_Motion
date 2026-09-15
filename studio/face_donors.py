"""Import only the requested facial layers, keeping PSD canvas coordinates."""
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image
from psd_tools import PSDImage
from .convert import MAX_PIXELS, clean_alpha, role_for, trace_part, tag

DONOR_KEYS = ('eyes_closed', 'mouth_closed', 'a', 'i', 'u', 'e', 'o')
LABELS = dict(zip(DONOR_KEYS, ('閉じ目', '閉じ口', 'あ', 'い', 'う', 'え', 'お')))


def read_donors(sources, size, alpha=12, cleanup=False):
    result = {}
    for key, source in (sources or {}).items():
        if key not in DONOR_KEYS:
            raise ValueError('未対応の顔差分です')
        path = Path(source)
        psd = PSDImage.open(path, max_alloc_bytes=512 * 1024**2)
        if psd.size != size or psd.width * psd.height > MAX_PIXELS:
            raise ValueError(f'{LABELS[key]}: ベースと同じキャンバスサイズのPSDを指定してください')
        leaves = [l for l in psd.descendants() if not l.is_group()]
        if len(leaves) > 100:
            raise ValueError(f'{LABELS[key]}: 100レイヤー以下にしてください')
        roles = ('lash-r', 'lash-l') if key == 'eyes_closed' else ('mouth',)
        selected = {}
        for role in roles:
            canvas = Image.new('RGBA', size)
            names = []
            for layer in leaves:
                if not layer.is_visible() or role_for(layer.name) != role:
                    continue
                if layer.width * layer.height > MAX_PIXELS:
                    raise ValueError(f'{LABELS[key]}: レイヤーが16メガピクセルを超えています')
                image = layer.composite(force=True)
                if image is not None:
                    canvas.alpha_composite(clean_alpha(image, role, alpha, cleanup), (layer.left, layer.top))
                    names.append(layer.name)
            bounds = canvas.getchannel('A').getbbox()
            if not bounds:
                raise ValueError(f'{LABELS[key]}: 表示中の {role} レイヤーが見つからないか空です')
            selected[role] = dict(image=canvas.crop(bounds), bounds=bounds, layers=names)
        result[key] = dict(source=path.name, parts=selected)
    return result


def registered_svg(text, bounds, part):
    # Keep each donor's original size and offset. Do not stretch it to the base crop.
    root = ET.Element(tag('svg'), width=str(part['width']), height=str(part['height']),
                      viewBox=f"0 0 {part['width']} {part['height']}", overflow='visible')
    group = ET.SubElement(root, tag('g'), transform=f"translate({bounds[0]-part['x']} {bounds[1]-part['y']})")
    group.append(ET.fromstring(text))
    return ET.tostring(root, encoding='unicode')


def attach_donors(project, donors, dest, preset, progress=lambda *_: None):
    metadata = {}
    for index, (key, donor) in enumerate(donors.items()):
        progress(92 + int(index / max(1, len(donors)) * 7), f'{LABELS[key]}のPSDから顔パーツをSVG化')
        metadata[key] = dict(source=donor['source'], parts={})
        for role, entry in donor['parts'].items():
            part = next((p for p in project['parts'] if p['role'] == role), None)
            if not part:
                raise ValueError(f'{LABELS[key]}: ベースに {role} パーツがありません')
            pid = f"donor-{key}-{role}"
            text, paths = trace_part(entry['image'], dest / 'work', pid, preset)
            svg = registered_svg(text, entry['bounds'], part)
            entry['image'].save(dest / 'originals' / f'{pid}.png')
            metadata[key]['parts'][role] = dict(bounds=entry['bounds'], layers=entry['layers'], svg=f'parts/{pid}.svg', paths=paths)
            if key in ('eyes_closed', 'mouth_closed'):
                part['closedSvgText'] = svg
                part['closedSource'] = 'psd'
                if key == 'mouth_closed':
                    project['settings']['closedWidth'] = 1
            else:
                part.setdefault('mouthVariants', {})[key] = svg
    if any(k in donors for k in 'aiueo'):
        project['settings']['vowels'] = True
        project['settings']['mouthTuning'] = {'vowels': {k: dict(width=1, height=1) for k in 'aiueo'}}
    if metadata:
        project['conversion']['faceDonors'] = metadata
