"""Closed-mouth ink derived from the existing open-mouth outline."""
import numpy as np
from PIL import Image
from scipy import ndimage


def mouth_interior_svg(image):
    a=np.array(image.convert('RGBA'));h,w=a.shape[:2]
    rgb=a[:,:,:3].astype(float)
    border=np.concatenate([rgb[0],rgb[-1],rgb[:,0],rgb[:,-1]])
    skin=np.median(border,axis=0)
    region=(np.linalg.norm(rgb-skin,axis=2)>42)&(a[:,:,3]>80)
    labels,count=ndimage.label(region)
    if not count:return None
    sizes=np.bincount(labels.ravel());sizes[0]=0
    region=ndimage.binary_fill_holes(labels==sizes.argmax())
    region=ndimage.binary_erosion(region,iterations=max(1,round(w/90)))
    if not region.any():return None
    # Run-length rectangles retain the cavity mask without embedding raster art.
    rows=[]
    for y,row in enumerate(region):
        edges=np.diff(np.r_[False,row,False].astype(int))
        for x,end in zip(np.where(edges==1)[0],np.where(edges==-1)[0]):
            rows.append(f'<rect x="{x}" y="{y}" width="{end-x}" height="1" fill="white"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'+''.join(rows)+'</svg>'


def closed_mouth_svg(image):
    a=np.array(image.convert('RGBA'));h,w=a.shape[:2]
    lum=a[:,:,:3].astype(float) @ np.array([.299,.587,.114])
    ink=(a[:,:,3]>100)&(lum<110)
    ys,xs=np.where(ink)
    if len(xs)<6:return None
    left,right=int(xs.min()),int(xs.max())
    if right-left<4:return None
    # The darkest pixel is not necessarily the upper lip: highlights can leave
    # only the lower outline dark on one side. Follow the mouth silhouette instead.
    silhouette=a[:,:,3]>100
    if silhouette.all():
        rgb=a[:,:,:3].astype(float)
        border=np.concatenate([rgb[0],rgb[-1],rgb[:,0],rgb[:,-1]])
        silhouette=np.linalg.norm(rgb-np.median(border,axis=0),axis=2)>42
    labels,count=ndimage.label(silhouette)
    if not count:return None
    sizes=np.bincount(labels.ravel());sizes[0]=0
    silhouette=labels==sizes.argmax()
    columns=np.arange(left,right+1)
    top=np.array([np.where(silhouette[:,x])[0][0] if silhouette[:,x].any() else np.nan for x in columns])
    central=np.isfinite(top)&(columns>=left+(right-left)*.1)&(columns<=right-(right-left)*.1)
    if central.sum()<3:return None
    fit=np.polyfit((columns[central]-left)/(right-left),top[central],2)
    t=np.linspace(0,1,21)
    tilt=float(np.polyval(fit,1)-np.polyval(fit,0))*.6
    tilt=float(np.clip(tilt,-h*.3,h*.3))
    smile=min(h*.16,(right-left)*.07)
    curve=h/2+tilt*(t-.5)+smile*(4*t*(1-t)-.5)
    rgb=np.median(a[:,:,:3][ink],axis=0).astype(int)
    color='#'+''.join(f'{c:02x}' for c in rgb)
    # Retain readable ink thickness instead of flattening it along with the cavity.
    thickness=max(1,min(2.5,(right-left)*.025))
    path=' '.join(('M' if i==0 else 'L')+f'{left+t[i]*(right-left):.2f} {y:.2f}' for i,y in enumerate(curve))
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><path d="{path}" fill="none" stroke="{color}" stroke-width="{thickness:.2f}" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def attach_closed_mouths(project, directory):
    for p in project['parts']:
        if p['role']=='mouth' and p.get('mouthMode')=='source-open':
            image=Image.open(directory/p['original'])
            if not p.get('closedSvgText'):
                donor=closed_mouth_svg(image)
                if donor:p['closedSvgText']=donor
            if not p.get('mouthInteriorSvg'):
                mask=mouth_interior_svg(image)
                if mask:p['mouthInteriorSvg']=mask
    return project
