"""Align the bundled Teth2 closed donors with its compressed open artwork."""
import base64
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage


def pixels(part):
    return np.array(Image.open(io.BytesIO(base64.b64decode(part['originalUrl'].split(',')[1]))).convert('RGBA'))


def align(project):
    assert project['id']=='ef395d300d24447dbe2be3c353ddccca', 'Bundled Teth2 only'
    for p in project['parts']:
        if p['role']=='mouth':
            a=pixels(p);rgb=a[:,:,:3].astype(float)
            mask=(a[:,:,3]>128)&((rgb.max(2)<130)|((rgb[:,:,0]-rgb[:,:,1]>25)&(rgb[:,:,0]>rgb[:,:,2]*1.03)))
            xs=np.arange(6,66);centers=[]
            for x in xs:
                ys=np.flatnonzero(mask[:,x]);centers.append((ys.min()+ys.max())/2 if len(ys) else np.nan)
            valid=np.isfinite(centers);curve=np.polyfit(xs[valid],np.array(centers)[valid],2)
            points=np.linspace(6,65,21);cy=p['height']/2
            # At the middle of the existing crossfade (6%), the source mouth
            # is compressed by .045 + .955*.06 around this same center.
            y=cy+(np.polyval(curve,points)-cy)*(.045+.955*.06)
            path=' '.join(('M' if i==0 else 'L')+f'{x:.2f} {v:.2f}' for i,(x,v) in enumerate(zip(points,y)))
            p['closedSvgText']=f'<svg xmlns="http://www.w3.org/2000/svg" width="74" height="47" viewBox="0 0 74 47"><path d="{path}" fill="none" stroke="#221814" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        elif p['role'].startswith('lash-'):
            a=pixels(p);mask=(a[:,:,3]>80)&(a[:,:,:3].mean(2)<150)
            labels,_=ndimage.label(mask);counts=np.bincount(labels.ravel());counts[0]=0;mask=labels==counts.argmax()
            ys,xs=np.where(mask);left,right=int(xs.min()),int(xs.max());columns=np.arange(left,right+1)
            centers=np.array([np.flatnonzero(mask[:,x]).mean() for x in columns])
            # Use a smooth curve from this eye's own source, with the same
            # anchor and vertical compression as the blink handover.
            curve=np.polyval(np.polyfit(columns,centers,3),columns)
            white=next(w for w in project['parts'] if w['role']=='white-'+p['role'][-1])
            anchor=white['y']+white['height']*.72-p['y']
            curve=anchor+(curve-anchor)*.225
            thickness=ndimage.gaussian_filter1d(mask.sum(0).astype(float),.8)[columns]*.225
            thickness=np.clip(thickness,0,4.2);thickness[0]=thickness[-1]=0
            points=list(zip(columns,curve-thickness/2))+list(zip(columns[::-1],(curve+thickness/2)[::-1]))
            path='M '+' L '.join(f'{x:.2f} {y:.2f}' for x,y in points)+' Z'
            # Retain small downward lash tips, without the former long spikes
            # that exaggerated the mismatch during the crossfade.
            for fraction,length in ((.32,2.8),(.48,2.1)):
                x=left+(right-left)*(fraction if p['role']=='lash-r' else 1-fraction)
                i=int(round(x))-left;base=curve[i]+thickness[i]*.25
                lean=-1 if p['role']=='lash-r' else 1
                path+=f' M {x+1.3:.2f} {base:.2f} L {x+lean:.2f} {base+length:.2f} L {x-1.3:.2f} {base:.2f} Z'
            color='#'+''.join(f'{v:02x}' for v in np.median(a[:,:,:3][mask],axis=0).astype(int))
            p['closedSvgText']=f'<svg xmlns="http://www.w3.org/2000/svg" width="{p["width"]}" height="{p["height"]}" viewBox="0 0 {p["width"]} {p["height"]}"><path d="{path}" fill="{color}"/></svg>'
    project['sampleFeatureAlignment']='teth2-open-closed-v1'
    return project


if __name__=='__main__':
    import sys
    source,target=map(Path,sys.argv[1:])
    target.write_text(json.dumps(align(json.loads(source.read_text(encoding='utf8'))),ensure_ascii=False),encoding='utf8')
