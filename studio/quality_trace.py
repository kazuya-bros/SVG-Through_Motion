"""Bounded supersampled tracing, shared by imports and edited materials.

Only vector paths/gradients are emitted. The caller's crop coordinates and
dimensions remain unchanged; padding is internal to the trace transform.
"""
from __future__ import annotations

import copy
import math
import os
import re
import subprocess
import sys
import threading
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np
from PIL import Image
from scipy import ndimage
import vtracer

NS = 'http://www.w3.org/2000/svg'
PROFILE = 'supersampled-contours-v1'
MAX_TRACE_PIXELS = 32_000_000
MAX_TRACE_SIDE = 8192
PADDING = 2
OPTIONS = dict(color_precision=8, layer_difference=12, filter_speckle=20,
               corner_threshold=100, length_threshold=6, splice_threshold=60,
               path_precision=2)
_workers = set()
_worker_lock = threading.Lock()
_stopping = False


def stop_workers():
    """Desktop shutdown must not leave a trace process behind."""
    global _stopping
    with _worker_lock:
        _stopping = True
        for worker in _workers:
            if worker.poll() is None:
                worker.terminate()


def run_quality_trace(image, work, part_id, role='static'):
    """VTracer holds the GIL; isolate it so progress/API calls stay responsive."""
    if image.convert('RGBA').getchannel('A').getextrema()[1] == 0:
        raise ValueError('空のパーツです')
    source, result = work/f'{part_id}.quality.png', work/f'{part_id}.quality.svg'
    image.save(source)
    prefix = [sys.executable, '--quality-trace'] if getattr(sys, 'frozen', False) else [sys.executable, '-m', 'studio.quality_trace']
    command = prefix + [str(source.resolve()), str(result.resolve()), part_id, role]
    with _worker_lock:
        if _stopping:
            raise RuntimeError('アプリの終了によりSVG変換を中止しました')
        worker = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  cwd=Path(__file__).resolve().parent.parent,
                                  env={**os.environ, 'PYTHONUTF8': '1', 'PYINSTALLER_RESET_ENVIRONMENT': '1'},
                                  creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        _workers.add(worker)
    try:
        try:
            _, stderr = worker.communicate(timeout=300)
        except subprocess.TimeoutExpired:
            worker.kill();worker.communicate()
            raise RuntimeError('SVG変換が5分以内に完了しませんでした。標準品質か小さい素材で試してください') from None
        if worker.returncode:
            raise RuntimeError('高品質SVG変換に失敗しました: '+stderr.decode('utf-8', errors='replace')[-1200:])
        return ET.parse(result).getroot()
    finally:
        with _worker_lock:
            _workers.discard(worker)


def tag(name):
    return '{%s}%s' % (NS, name)


def trace_scale(size):
    w, h = (v + PADDING * 2 for v in size)
    return max(1, min(4, int(math.sqrt(MAX_TRACE_PIXELS / (w * h))),
                      MAX_TRACE_SIDE // max(w, h)))


def hsv(rgb):
    """Vectorized HSV, including achromatic pixels without division warnings."""
    rgb = np.asarray(rgb, dtype=float) / 255
    hi, lo = rgb.max(axis=-1), rgb.min(axis=-1)
    delta = hi - lo
    divisor = np.where(delta > 0, delta, 1)
    r, g, b = np.moveaxis(rgb, -1, 0)
    hue = np.where(hi == r, ((g-b)/divisor) % 6,
                   np.where(hi == g, (b-r)/divisor+2, (r-g)/divisor+4)) / 6
    return hue, delta / np.maximum(hi, 1/255), hi


def iris_gradient(image, paths, defs, part_id, scale):
    """Restore only a coherent, smoothly shaded iris palette, of any hue.

    Textured/multicolour eyes fail the residual/hue tests and keep their trace.
    Dark outlines, pupils and white highlights never enter the fitted palette.
    """
    a = np.asarray(image.convert('RGBA'))
    hue, sat, val = hsv(a[:, :, :3])
    candidate = (a[:, :, 3] >= 220) & (sat > .28) & (val > .36)
    if candidate.sum() < 32:
        return 0
    hist, _ = np.histogram(hue[candidate], bins=36, range=(0, 1))
    center = (hist.argmax()+.5)/36
    distance = lambda h: np.abs((h-center+.5) % 1-.5)
    selected = candidate & (distance(hue) < .085)
    if selected.sum() < max(32, candidate.sum()*.85):
        return 0
    ys, xs = np.nonzero(selected)
    if np.ptp(ys) < 8:
        return 0
    y0, y1 = np.quantile(ys, [.01, .99])
    y = np.clip((ys-y0)/(y1-y0), 0, 1)
    design = np.column_stack([np.ones(len(y)), y, y*y])
    colors = a[ys, xs, :3].astype(float)
    # Row upper quantiles seed the iris ramp without the darker pupil/outline.
    row_y = np.unique(ys)
    row_colors = [np.quantile(colors[ys == row], .75, axis=0) for row in row_y]
    row_t = np.clip((row_y-y0)/(y1-y0), 0, 1)
    row_design = np.column_stack([np.ones(len(row_t)), row_t, row_t**2])
    coefficients = np.linalg.lstsq(row_design, row_colors, rcond=None)[0]
    for _ in range(3):
        inliers = np.linalg.norm(design @ coefficients-colors, axis=1) < 25
        if inliers.mean() < .45:
            return 0
        coefficients = np.linalg.lstsq(design[inliers], colors[inliers], rcond=None)[0]
    if inliers.mean() < .6 or np.sqrt(np.mean((design[inliers] @ coefficients-colors[inliers])**2)) > 9:
        return 0
    offsets = np.linspace(0, 1, 14)
    tones = np.column_stack([np.ones(14), offsets, offsets**2]) @ coefficients
    if np.linalg.norm(tones[-1]-tones[0]) < 15 or np.any(tones < -10) or np.any(tones > 265):
        return 0
    changed = 0
    for path in paths:
        fill = path.get('fill', '')
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', fill):
            continue
        color = np.array([int(fill[i:i+2], 16) for i in (1, 3, 5)])
        ph, ps, pv = hsv(color)
        if ps <= .28 or pv <= .36 or distance(ph) >= .085:
            continue
        # Require a colour actually explained by the fitted ramp as well.
        if np.min(np.linalg.norm(tones-color, axis=1)) > 24:
            continue
        transform = path.get('transform', '')
        match = re.fullmatch(r'translate\(\s*([-+\d.eE]+)[ ,]+([-+\d.eE]+)\s*\)', transform)
        if transform and not match:
            continue
        dx, dy = map(float, match.groups()) if match else (0, 0)
        gid = f'iris-tone-{part_id}-{changed}'
        gradient = ET.SubElement(defs, tag('linearGradient'), id=gid,
                                 gradientUnits='userSpaceOnUse', x1='0', x2='0',
                                 y1=str((y0+PADDING)*scale-dy),
                                 y2=str((y1+PADDING)*scale-dy))
        for offset, tone in zip(offsets, tones):
            color_hex = '#' + ''.join(f'{int(v):02x}' for v in np.clip(np.rint(tone), 0, 255))
            ET.SubElement(gradient, tag('stop'), offset=f'{offset:.5f}',
                          attrib={'stop-color': color_hex})
        path.set('fill', f'url(#{gid})')
        changed += 1
    return changed


def trace_quality(image: Image.Image, work: Path, part_id: str, role='static'):
    native = image.convert('RGBA')
    if max(native.size) > 16384 or native.width*native.height > 16_777_216:
        raise ValueError('高品質SVG変換は16メガピクセル・一辺16384px以下にしてください')
    scale = trace_scale(native.size)
    padded = Image.new('RGBA', (native.width+4, native.height+4))
    padded.paste(native, (PADDING, PADDING))
    pixels = np.array(padded)
    alpha = pixels[:, :, 3]
    if not alpha.any():
        raise ValueError('空のパーツです')
    valid = alpha >= max(1, min(128, int(alpha.max())//2))
    # Extend trustworthy RGB before enlargement, independently of alpha.
    nearest = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
    pixels[:, :, :3][~valid] = pixels[:, :, :3][tuple(nearest[:, ~valid])]
    del nearest
    size = (padded.width*scale, padded.height*scale)
    rgb_path, rgb_svg = work/f'{part_id}.rgb.png', work/f'{part_id}.color.svg'
    Image.fromarray(pixels[:, :, :3]).resize(size, Image.Resampling.LANCZOS).save(rgb_path)
    options = dict(OPTIONS, filter_speckle=max(1, round(20*(scale/4)**2)))
    vtracer.convert_image_to_svg_py(str(rgb_path), str(rgb_svg), colormode='color',
                                  hierarchical='stacked', mode='spline', **options)
    root = ET.Element(tag('svg'), width=str(native.width), height=str(native.height),
                      viewBox=f'0 0 {native.width} {native.height}',
                      attrib={'data-trace-profile': PROFILE, 'data-trace-scale': str(scale)})
    defs = ET.SubElement(root, tag('defs'))
    mask = ET.SubElement(defs, tag('mask'), id=f'alpha-{part_id}', maskUnits='userSpaceOnUse',
                         x='0', y='0', width=str(size[0]), height=str(size[1]),
                         attrib={'mask-type': 'luminance', 'color-interpolation': 'sRGB'})
    expanded_alpha = np.asarray(Image.fromarray(alpha).resize(size, Image.Resampling.LANCZOS))
    levels = np.rint(expanded_alpha.astype(np.float32)*(7/255)).astype(np.uint8)
    del expanded_alpha
    previous = None
    for level in range(1, 8):
        silhouette = levels >= level
        if not silhouette.any():
            break
        # Fully opaque art often has identical thresholds: reuse its geometry.
        if previous is None or not np.array_equal(previous, silhouette):
            mask_png, mask_svg = work/f'{part_id}.alpha.png', work/f'{part_id}.alpha.svg'
            Image.fromarray(np.where(silhouette, 0, 255).astype(np.uint8)).convert('RGB').save(mask_png)
            vtracer.convert_image_to_svg_py(str(mask_png), str(mask_svg), colormode='binary',
                                          mode='spline', filter_speckle=0, corner_threshold=90,
                                          length_threshold=4, splice_threshold=60, path_precision=2)
            contours = list(ET.parse(mask_svg).getroot())
        value = round(level*255/7)
        for contour in contours:
            path = copy.deepcopy(contour)
            path.set('fill', f'#{value:02x}{value:02x}{value:02x}')
            mask.append(path)
        previous = silhouette
    parent = ET.SubElement(root, tag('g'), transform=f'translate(-2 -2) scale({1/scale})')
    colors = ET.SubElement(parent, tag('g'), mask=f'url(#alpha-{part_id})')
    for child in ET.parse(rgb_svg).getroot():
        colors.append(child)
    restored = iris_gradient(native, list(colors), defs, part_id, scale) if role.startswith('iris-') else 0
    root.set('data-iris-gradients', str(restored))
    return root


def worker_main(arguments=None):
    source, result, part_id, role = arguments if arguments is not None else sys.argv[1:]
    with Image.open(source) as image:
        root = trace_quality(image, Path(result).parent, part_id, role)
    ET.register_namespace('', NS)
    ET.ElementTree(root).write(result, encoding='utf-8', xml_declaration=True)


if __name__ == '__main__':
    worker_main()
