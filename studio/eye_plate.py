"""Local PSD skin repair, preserving source alpha and pixels outside the mask."""
import numpy as np
from scipy import ndimage
from PIL import Image

def psd_face_artwork(leaves, size):
    """A separated Face is the clean underpaint when face motion reveals bangs."""
    face=Image.new('RGBA',size);nose=Image.new('RGBA',size)
    for layer in leaves:
        if layer.is_group() or not layer.is_visible():continue
        name=layer.name.strip().lower()
        if name not in ('face','顔','顔の下地','顔下地','nose','鼻'):continue
        image=layer.composite(force=True)
        if image is not None:(nose if name in ('nose','鼻') else face).alpha_composite(image.convert('RGBA'),(layer.left,layer.top))
    a=np.array(face);solid=a[:,:,3]>32
    if not solid.any() or solid.all():return None
    labels,_=ndimage.label(solid);sizes=np.bincount(labels.ravel());sizes[0]=0
    support=ndimage.binary_dilation(labels==sizes.argmax(),iterations=2)
    a[~support,3]=0
    n=np.array(nose);n[~support,3]=0
    face=Image.fromarray(a);face.alpha_composite(Image.fromarray(n))
    return face

def replace_face_base(base, artwork):
    """Replace original baked-in hair/face marks only under the separated face."""
    if artwork is None:return base.copy(),np.zeros(base.shape[:2],bool)
    alpha=np.array(artwork)[:,:,3]
    mask=ndimage.binary_dilation(alpha>32,iterations=2)
    result=base.copy();result[mask,3]=0
    image=Image.fromarray(result);image.alpha_composite(artwork)
    return np.array(image),mask


def psd_skin_inputs(leaves, size, features, removal, clean):
    """Use only explicitly separated face layers from the base PSD."""
    w,h=size
    face=Image.new('RGBA',size)
    for layer in leaves:
        if layer.is_group() or not layer.is_visible():continue
        if layer.name.strip().lower() not in ('face','顔','顔の下地','顔下地'):continue
        image=layer.composite(force=True)
        if image is not None:face.alpha_composite(clean(image),(layer.left,layer.top))
    eyes=np.zeros((h,w),bool)
    for _,role,image in features:
        if role.startswith(('white-','iris-','lash-')):
            eyes |= np.array(image)[:,:,3]>30
    eyes=ndimage.binary_dilation(eyes,iterations=max(2,round(w/256)))
    face=np.array(face)
    return face,eyes & removal & (face[:,:,3]>240)


def blend_eye_skin(base, face, eye_mask, excluded=None, radius=12):
    if base.shape != face.shape or eye_mask.shape != base.shape[:2]:
        raise ValueError('Skin donor and mask must match the plate')
    radius=max(2,int(radius))
    safe=(face[:,:,3]>240)&(base[:,:,3]>240)
    if excluded is not None:safe &= ~excluded
    if not eye_mask.any():return base.copy(),np.zeros_like(eye_mask,dtype=bool)
    region=(ndimage.distance_transform_edt(~eye_mask)<=radius)&safe
    result=base.copy()
    if not region.any():return result,region
    src=base[:,:,:3].astype(float);donor=face[:,:,:3].astype(float)
    # Learn color differences from intact skin, never from the old eye fill or ink.
    healthy=safe & ~ndimage.binary_dilation(eye_mask,iterations=radius+3)
    healthy &= (src[:,:,0]>170)&(src[:,:,0]>=src[:,:,1])&(src[:,:,1]>=src[:,:,2])
    healthy &= (np.max(src,axis=2)-np.min(src,axis=2)<85)
    labels,count=ndimage.label(region)
    weight=np.clip(ndimage.distance_transform_edt(region)/radius,0,1)
    weight=weight*weight*(3-2*weight)
    weight[eye_mask & region]=1
    applied=np.zeros_like(region)
    for label in range(1,count+1):
        area=labels==label
        if area.sum()<30:continue
        ring=ndimage.binary_dilation(area,iterations=radius*3)&healthy
        if ring.sum()<30:continue
        # A robust color offset avoids transferring the donor's pale eye patches.
        offset=np.median((src-donor)[ring],axis=0)
        corrected=np.clip(donor[area]+offset,0,255)
        a=weight[area,None]
        result[area,:3]=np.rint(src[area]*(1-a)+corrected*a).astype(np.uint8)
        applied |= area
    return result,applied
