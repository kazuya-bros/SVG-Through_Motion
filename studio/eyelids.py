"""Build a filled closed-lash SVG from the source lash's silhouette profile."""
import numpy as np
from scipy import ndimage


def closed_lash_svg(image, closed_y, *, legacy=False, spikes=True, side=None):
    a=np.array(image.convert('RGBA'))
    mask=(a[:,:,3]>80)&(a[:,:,:3].mean(axis=2)<150)
    labels,n=ndimage.label(mask)
    if not n:
        return None
    counts=np.bincount(labels.ravel());counts[0]=0
    mask=labels==counts.argmax()
    ys,xs=np.where(mask)
    if len(xs)<12 or xs.max()-xs.min()<8:
        return None
    w,h=image.size
    # The source profile carries the pointed outer wing and variable lash weight.
    profile=mask.sum(axis=0).astype(float)
    profile=ndimage.gaussian_filter1d(profile,.8)
    thickness=np.minimum(profile*.55,max(4,min(9,h*.14)))
    left,right=int(xs.min()),int(xs.max())
    thickness[left]=thickness[right]=0
    center=(left+right)/2;radius=max(1,(right-left)/2)
    curve=min(max(float(closed_y),h*.35),h-7)+2*(1-((np.arange(w)-center)/radius)**2)
    if not legacy:
        # Measure the two ends separately, away from isolated eyelash spikes.
        # Keeping their height difference preserves each eye's own inclination;
        # assigning one rotation to both eyes flattened the expression.
        columns=np.arange(left,right+1)
        centers=np.array([np.flatnonzero(mask[:,x]).mean() if mask[:,x].any() else np.nan for x in columns])
        u=(columns-left)/max(1,right-left)
        ends=[]
        for lo,hi in ((.10,.25),(.75,.90)):
            values=centers[(u>=lo)&(u<=hi)]
            ends.append(float(np.nanmedian(values)) if np.isfinite(values).any() else float(ys.mean()))
        rise=np.clip((ends[1]-ends[0])*.6/.65,-(right-left)*.22,(right-left)*.22)
        t=(np.arange(w)-left)/max(1,right-left)
        curve=float(closed_y)+rise*(t-.5)+min(5,(right-left)*.05)*4*t*(1-t)
        # Translate the curve as a unit if the crop is shallow; never clip a tip.
        low=np.min((curve-thickness*.5)[left:right+1])
        high=np.max((curve+thickness*.5)[left:right+1])
        curve+=max(0,1-low)-max(0,high-(h-1))
    upper=[(x,curve[x]-thickness[x]*.5) for x in range(left,right+1)]
    lower=[(x,curve[x]+thickness[x]*.5) for x in range(right,left-1,-1)]
    # Closed silhouette, not a stroked substitute line. No raster is embedded.
    points=upper+lower
    path='M '+' L '.join(f'{x:.2f} {y:.2f}' for x,y in points)+' Z'
    donor_height=h
    if spikes and not legacy:
        # A closed upper lid rolls its lashes downward. Separate tapered tufts
        # retain a pointed silhouette instead of averaging every spike away.
        outer_left=side=='r' if side in ('l','r') else profile[:int(center)].sum()>profile[int(center):].sum()
        span=right-left
        for fraction,length in ((.32,.10),(.48,.08)):
            x=left+span*fraction if outer_left else right-span*fraction
            ix=int(round(x));half=max(1.3,span*.025)
            base=curve[ix]+thickness[ix]*.25
            tip=base+span*length
            donor_height=max(donor_height,int(np.ceil(tip))+1)
            lean=(-1 if outer_left else 1)*span*.025
            path+=f' M {x+half:.2f} {base:.2f} L {x+lean:.2f} {tip:.2f} L {x-half:.2f} {base:.2f} Z'
    color=np.median(a[:,:,:3][mask],axis=0).astype(int)
    fill='#'+''.join(f'{v:02x}' for v in color)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{donor_height}" viewBox="0 0 {w} {donor_height}"><path d="{path}" fill="{fill}"/></svg>'


def attach_closed_lashes(project,directory):
    from PIL import Image
    for part in project['parts']:
        if not part['role'].startswith('lash-'):
            continue
        if not part.get('original'):
            continue
        side=part['role'][-1]
        white=next((p for p in project['parts'] if p['role']==f'white-{side}'),None)
        closed_y=white['y']+white['height']*.72-part['y'] if white else part['height']*.72
        original=directory/part['original']
        if original.is_file():
            with Image.open(original) as image:
                donor=closed_lash_svg(image,closed_y,side=side)
                previous=closed_lash_svg(image,closed_y,legacy=True)
                tilted=closed_lash_svg(image,closed_y,spikes=False)
            # Only upgrade our exact old generated shape. Artist-authored donors
            # remain authoritative, and conversion files are not rewritten.
            if part.get('closedSvgText') not in (None,previous,tilted,donor):
                continue
            if donor:
                part['closedSvgText']=donor
                part['legacyClosedSvgText']=previous
                part['previousClosedSvgTexts']=[previous,tilted]
    return project
