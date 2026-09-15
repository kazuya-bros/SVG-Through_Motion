"""Optional base-pose See-Through depth; facial donors inherit this field."""
from pathlib import Path
import re
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.constants import ColorMode
from scipy import ndimage


def layer_key(name):
    return re.sub(r'[-_\s]+', ' ', name.strip().lower())


def read_depth(path, base):
    if path is None:
        return None
    depth = PSDImage.open(path, max_alloc_bytes=512 * 1024**2)
    if depth.size != base.size:
        raise ValueError('Depth PSDは通常PSDと同じキャンバスサイズにしてください。自動拡縮は行いません。')
    if depth.color_mode != ColorMode.GRAYSCALE:
        raise ValueError('Depth PSDには、通常PSDと一緒に出力したグレースケールのDepth PSDを選んでください。')
    layers = [v for v in depth.descendants() if not v.is_group()]
    if len(layers) > 100:
        raise ValueError('Depth PSDは100レイヤー以下にしてください。')
    lookup = {}
    for layer in layers:
        key = layer_key(layer.name)
        if key in lookup:
            raise ValueError('Depth PSDのレイヤー名が重複しています: ' + layer.name)
        lookup[key] = layer
    candidates = {'face': 'face', '顔': 'face', 'front hair': 'front', '前髪': 'front',
                  'back hair': 'back', '後ろ髪': 'back', 'headwear': 'headwear', '頭飾り': 'headwear'}
    parts = {}; field = None
    for layer in base.descendants():
        if layer.is_group() or not layer.is_visible():
            continue
        key = layer_key(layer.name); kind = candidates.get(key)
        if kind is None or key not in lookup:
            continue
        donor = lookup[key]
        if layer.bbox != donor.bbox:
            raise ValueError('Depth PSDのレイヤー位置が通常PSDと一致しません: ' + layer.name)
        if not (0 <= layer.left < layer.right <= base.width and 0 <= layer.top < layer.bottom <= base.height):
            raise ValueError('Depthを使うレイヤーはキャンバス内に収めてください: ' + layer.name)
        art = layer.composite(force=True)
        image = donor.composite(force=True)
        if art is None or image is None:
            continue
        mask = np.asarray(art.convert('RGBA'))[:, :, 3] > 127
        values = np.asarray(image.convert('L'), dtype=np.float32) / 255
        if mask.shape != values.shape or not mask.any():
            continue
        median = float(np.median(values[mask])); parts[kind] = round(median, 6)
        if kind != 'face':
            continue
        # Bound interpolation memory independently of the original PSD resolution.
        # Alpha-weighted resampling keeps transparent padding out of the depth field.
        full = np.zeros((base.height, base.width), np.float32)
        alpha = np.zeros_like(full)
        full[layer.top:layer.bottom, layer.left:layer.right] = values * mask
        alpha[layer.top:layer.bottom, layer.left:layer.right] = mask
        size = (257, 257)
        numerator = np.asarray(Image.fromarray(full).resize(size, Image.Resampling.BILINEAR))
        weight = np.asarray(Image.fromarray(alpha).resize(size, Image.Resampling.BILINEAR))
        valid = weight > .5
        if not valid.any():
            raise ValueError('Depth PSDのFace領域が小さすぎます。')
        sampled = numerator / np.maximum(weight, 1e-6)
        indices = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        filled = sampled[tuple(indices)]
        smooth = ndimage.gaussian_filter(filled, sigma=1.6)
        grid = np.asarray(Image.fromarray(smooth).resize((65, 65), Image.Resampling.BILINEAR))
        field = dict(version=1, size=65, values=np.round(grid, 5).ravel().tolist(), median=round(median, 6))
    if field is None:
        raise ValueError('通常PSDとDepth PSDに、対応するFace（face）レイヤーが必要です。開き目・開き口の通常素材のDepthを選んでください。')
    field['parts'] = parts
    return dict(field=field, sourceName=Path(path).name, donorPolicy='inherit-base-face')


def attach_depth(project, data):
    if data is None:
        return
    project['rig']['depth'] = data['field']
    project['settings'].update(depthEnabled=True, depthStrength=1)
    project['conversion']['depth'] = dict(version=1, sourceName=data['sourceName'],
                                         donorPolicy=data['donorPolicy'], parts=list(data['field']['parts']))
