"""Remove border-connected white background while protecting PSD cutouts."""
import re

import numpy as np
from PIL import Image
from scipy import ndimage


def foreground_support(leaves, size):
    w, h = size
    support = np.zeros((h, w), dtype=bool)
    for layer in leaves:
        if not layer.is_visible() or re.search(r'background|背景|^bg(?:\b|[_-])', layer.name, re.I):
            continue
        image = layer.composite(force=True)
        if image is None:
            continue
        canvas = Image.new('RGBA', size)
        canvas.alpha_composite(image.convert('RGBA'), (layer.left, layer.top))
        opaque = np.asarray(canvas)[:, :, 3] >= 128
        # An opaque full-canvas layer supplies no segmentation evidence.
        if not opaque.all():
            support |= opaque
    return support


def has_artwork_transparency(original):
    alpha = original[:, :, 3]
    # A few 254-alpha pixels are export rounding, not a transparent background.
    # Preserve genuinely transparent images and intentionally translucent sheets.
    return bool(np.any(alpha < 254) or np.mean(alpha < 255) > .01)


def white_background_mask(original, support):
    if has_artwork_transparency(original):
        # Existing transparency is authoritative, including white translucent art.
        return np.zeros(original.shape[:2], dtype=bool)
    near_white = (original[:, :, :3].min(axis=2) > 230) & (np.ptp(original[:, :, :3], axis=2) < 22)
    # Sparse 254-alpha export noise can also tint otherwise white edge pixels.
    rounded_white = (original[:, :, 3] == 254) & (original[:, :, :3].min(axis=2) > 200) & (np.ptp(original[:, :, :3], axis=2) < 45)
    border = np.zeros(original.shape[:2], dtype=bool)
    border[[0, -1], :] = True; border[:, [0, -1]] = True
    rounded_white |= border & (original[:, :, :3].min(axis=2) > 215) & (np.ptp(original[:, :, :3], axis=2) < 45)
    removable = (near_white | rounded_white) & ~support
    seeds = np.zeros_like(removable)
    seeds[0] = removable[0]; seeds[-1] = removable[-1]
    seeds[:, 0] = removable[:, 0]; seeds[:, -1] = removable[:, -1]
    return ndimage.binary_propagation(seeds, mask=removable)


def hair_white_gap_mask(original, leaves):
    """Find white source gaps contradicted by dark PSD hair, protecting other artwork."""
    h,w=original.shape[:2]
    empty=np.zeros((h,w),bool)
    # Do not reinterpret an artist's existing alpha channel.
    if has_artwork_transparency(original):return empty
    evidence=empty.copy();protected=empty.copy()
    for layer in leaves:
        if not layer.is_visible() or re.search(r'background|背景|^bg(?:\b|[_-])',layer.name,re.I):continue
        image=layer.composite(force=True)
        if image is None:continue
        canvas=Image.new('RGBA',(w,h));canvas.alpha_composite(image.convert('RGBA'),(layer.left,layer.top))
        pixels=np.asarray(canvas);alpha=pixels[:,:,3]
        if (alpha>=128).all():continue
        hair=bool(re.search(r'hair|髪',layer.name,re.I))
        if hair:
            evidence|=(alpha>=128)&(pixels[:,:,:3].max(axis=2)<210)
            protected|=(alpha>=32)&(pixels[:,:,:3].max(axis=2)>=210)
        else:protected|=alpha>=32
    rgb=original[:,:,:3];low=rgb.min(axis=2);chroma=np.ptp(rgb,axis=2)
    seed=(low>245)&(chroma<10)&evidence&~protected
    return ndimage.binary_propagation(seed,mask=(low>230)&(chroma<22)&~protected)


def source_background_masks(original, leaves):
    """Use both source-background passes in conversions and saved-project repairs."""
    h,w=original.shape[:2]
    leaves=list(leaves)
    return (white_background_mask(original,foreground_support(leaves,(w,h))),
            hair_white_gap_mask(original,leaves))
