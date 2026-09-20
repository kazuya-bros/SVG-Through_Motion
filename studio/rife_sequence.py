"""RIFE RGBA frames, traced directly instead of fitted to a deformation grid."""
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from .convert import trace_part
from .paths import DATA


def composite(image, color):
    background = Image.new('RGB', image.size, color)
    background.paste(image, mask=image.getchannel('A'))
    return background


def interpolate_rgba(runner, start, end, at):
    if at in (0, 1):
        return (start if at == 0 else end).copy()
    return runner.interpolate_rgba(start, end, at)


def sequence_times(profiles, kind):
    at = np.linspace(0, 1, 8)
    profiles = np.asarray(profiles)
    gaps = np.mean(profiles[:, 1]-profiles[:, 0], axis=1)
    span = gaps[0]-gaps[-1] if kind == 'eye' else gaps[-1]-gaps[0]
    if span < .025:
        raise ValueError('開閉の差が小さすぎます。開いた絵と閉じた絵を確認してください')
    change = gaps[0]-gaps if kind == 'eye' else gaps-gaps[0]
    closure = np.maximum.accumulate(np.clip(change/span, 0, 1))
    closure[0], closure[-1] = 0, 1
    distinct = np.r_[True, np.diff(closure) > 1e-6]
    times = np.interp(at, closure[distinct], np.linspace(0, 1, len(gaps))[distinct])
    times[0], times[-1] = 0, 1
    return times


def frame_bounds(image):
    weights = np.asarray(image.getchannel('A'), dtype=float).sum(axis=1)
    total = weights.sum()
    if total < 1:
        return [0., 1.]
    cumulative = np.cumsum(weights)/total
    top, bottom = np.searchsorted(cumulative, [.005, .995])
    return [float(top/image.height), float((bottom+1)/image.height)]


def visual_sample(image):
    rgba = np.asarray(image.resize((48, 48), Image.Resampling.BILINEAR), dtype=float)/255
    rgba[:, :, :3] *= rgba[:, :, 3:4]
    return rgba


def compact_mouth_alpha(image, opacity=1.):
    """Transport each RIFE column's coverage into a solid silhouette.

    Faint disoccluded mouth area becomes a smaller opaque opening. Both contour
    position and premultiplied colors come from this generated frame, never from
    a resized endpoint. Coverage and color mass are conserved (including AA).
    """
    rgba = np.asarray(image, dtype=float)/255
    h, w = rgba.shape[:2]
    result = np.zeros_like(rgba)
    for x in range(w):
        alpha = np.clip(rgba[:, x, 3]/max(opacity, 1/255), 0, 1)
        mass = alpha.sum()
        if mass < 1/255:
            continue
        center = np.sum((np.arange(h)+.5)*alpha)/mass
        top = np.clip(center-mass/2, 0, h-mass)
        edges = top+np.r_[0, np.cumsum(alpha)]
        distinct = np.r_[True, np.diff(edges) > 1e-10]
        for channel in range(4):
            values = np.r_[0, np.cumsum(alpha*(rgba[:, x, channel] if channel < 3 else 1))]
            result[:, x, channel] = np.diff(np.interp(np.arange(h+1), edges[distinct],
                                                    values[distinct], left=0, right=values[-1]))
    result[:, :, :3] /= np.maximum(result[:, :, 3:], 1e-10)
    result[:, :, 3] *= opacity
    return Image.fromarray(np.round(np.clip(result, 0, 1)*255).astype('uint8'), 'RGBA')


def mouth_profile(image):
    """Small correspondence mesh measured from each actual generated silhouette."""
    alpha = np.asarray(image.getchannel('A'), dtype=float)/255
    h, w = alpha.shape
    columns, rows = [], []
    for x in range(w):
        total = alpha[:, x].sum()
        if total < .25:
            continue
        cumulative = np.r_[0, np.cumsum(alpha[:, x])]
        top, bottom = np.interp([total*.02, total*.98], cumulative, np.arange(h+1))
        columns.append((x+.5)/w)
        rows.append([max(1/h, (top-1)/h), min(1-1/h, (bottom+1)/h)])
    if not columns:
        raise ValueError('口の輪郭を抽出できません。開閉素材を確認してください')
    rows = np.asarray(rows)
    return np.array([np.interp(np.linspace(0, 1, 17), columns, rows[:, i])
                     for i in range(2)]).T.tolist()


def balanced_times(times, samples):
    # Accumulate actual image change, including the exact endpoint. Five height
    # measurements miss late iris/outline changes and abrupt model transitions.
    distances = np.array([np.mean(np.abs(b-a)) for a, b in zip(samples, samples[1:])])
    cumulative = np.r_[0., np.cumsum(distances)]
    if cumulative[-1] < 1e-6:
        raise ValueError('開閉画像の違いが小さすぎます')
    distinct = np.r_[True, np.diff(cumulative) > 1e-10]
    chosen = np.interp(np.linspace(0, cumulative[-1], 8), cumulative[distinct], np.asarray(times)[distinct])
    chosen[0], chosen[-1] = 0., 1.
    return chosen


def generate_sequence(runner, start, end, kind, profiles, progress, encode):
    opacity = max(start.getchannel('A').getextrema()[1], end.getchannel('A').getextrema()[1])/255
    def corrected(time):
        raw = interpolate_rgba(runner, start, end, float(time))
        return compact_mouth_alpha(raw, opacity) if kind == 'mouth' and time not in (0, 1) else raw
    coarse = sequence_times(profiles, kind)
    candidates = sorted(set(np.linspace(0, 1, 33)) | set(coarse) | {.005, .01, .02, .98, .99, .995})
    samples = []
    for i, time in enumerate(candidates):
        progress(.3+.3*i/len(candidates), f'変化量を測定 {i+1}/{len(candidates)}')
        samples.append(visual_sample(corrected(time)))
    times = balanced_times(candidates, samples)
    frames, references, raw_references = [], [], []
    work = DATA/'rife-work'
    work.mkdir(parents=True, exist_ok=True)
    # Only this newly-created private temporary directory is removed afterwards.
    with tempfile.TemporaryDirectory(prefix='sequence-', dir=work) as temp:
        folder = Path(temp)
        (folder/'parts').mkdir()
        (folder/'work').mkdir()
        for i, time in enumerate(times):
            progress(.6+.4*i/8, f'SVG {i+1}/8 を作成中')
            image = corrected(time)
            svg, paths = trace_part(image, folder/'work', f'rife{i}', 'balanced')
            if len(svg) > 1_500_000:
                raise ValueError('SVGが複雑すぎます。素材のサイズや細部を減らして再生成してください')
            frames.append(dict(at=i/7, source_time=float(time), svgText=svg, paths=paths, bounds=frame_bounds(image)))
            if kind == 'mouth':
                frames[-1]['profile'] = mouth_profile(image)
                raw_references.append(encode(interpolate_rgba(runner, start, end, float(time))))
            references.append(encode(image))
    return dict(svg_frames=frames, svg_size=list(start.size), references=references,
                raw_references=raw_references, mouth_correction='alpha-compact-v1' if kind == 'mouth' else None,
                timing_corrected=True, mode='svg-frames')
