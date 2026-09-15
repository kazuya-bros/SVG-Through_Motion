"""Repair source eyelash ink assigned to foreground hair by a PSD boundary."""
import numpy as np
from scipy import ndimage
from PIL import Image


def hair_lash_layers(original,mask,eye_centers):
    """Keep repaired-away source ink as a separate blink-dependent foreground."""
    if not mask.any() or not eye_centers:return []
    yy,xx=np.indices(mask.shape)
    sides=list(eye_centers)
    owner=np.argmin(np.stack([(xx-eye_centers[s][0])**2+(yy-eye_centers[s][1])**2 for s in sides]),axis=0)
    result=[]
    for i,side in enumerate(sides):
        pixels=original.copy();pixels[:,:,3]=np.where(mask&(owner==i),original[:,:,3],0)
        if pixels[:,:,3].any():result.append((side,Image.fromarray(pixels)))
    return result


def clean_hair_eye_overlap(original, front, lash_alpha):
    """Borrow PSD hair color only where overlapping lash ink darkened source hair.

    Geometry/alpha and all pixels away from the eye boundary remain unchanged.
    Dark matching hair outlines are retained. A PSD that also contains the ink
    cannot supply a repair and is deliberately left alone.
    """
    source=original[:,:,:3].astype(float)
    donor=front[:,:,:3].astype(float)
    nearby=ndimage.binary_dilation(lash_alpha>40,iterations=max(2,round(original.shape[1]/200)))
    mask=nearby & (front[:,:,3]>80) & (source.mean(2)<180) & (donor.mean(2)-source.mean(2)>22)
    repaired=original.copy()
    repaired[mask,:3]=front[mask,:3]
    return repaired,mask
