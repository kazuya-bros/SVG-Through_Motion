"""Create a separate repaired project from a saved hybrid and its matching PSD."""
import base64
import io
import json
import uuid
import re
import hashlib
from pathlib import Path
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from .convert import trace_part,clean_alpha
from .hair_cleanup import clean_hair_eye_overlap
from .eyelids import closed_lash_svg


def raster_signature(text):
    ids={}
    def identify(match):
        key=match.group(1)
        if key not in ids:ids[key]=f'asset{len(ids)}'
        return 'id="'+ids[key]+'"'
    text=re.sub(r'\bid="([^"]+)"',identify,text)
    text=re.sub(r'url\(#([^)]+)\)',lambda m:'url(#'+ids.get(m[1],m[1])+')',text)
    text=re.sub(r'\bhref="#([^"]+)"',lambda m:'href="#'+ids.get(m[1],m[1])+'"',text)
    text=re.sub(r'>\s+<','><',text).strip()
    return hashlib.sha256(text.encode()).hexdigest()


def raster_matches(part):
    return raster_signature(part['svgText'])==part.get('rasterSignature')


def repair(saved,psd_path):
    project=json.loads(Path(saved).read_text(encoding='utf8'))
    source_dir=Path('data/projects')/project['id']
    meta=json.loads((source_dir/'project.json').read_text(encoding='utf8'))
    psd=PSDImage.open(psd_path)
    w,h=project['width'],project['height']
    if (psd.width,psd.height)!=(w,h):raise ValueError('PSD dimensions differ')
    front=Image.new('RGBA',(w,h))
    for l in psd.descendants():
        if not l.is_group() and l.is_visible() and ('front hair' in l.name.lower() or '前髪' in l.name):
            im=l.composite(force=True)
            if im is not None:front.alpha_composite(clean_alpha(im,'hair'),(l.left,l.top))
    lashes=np.zeros((h,w),np.uint8)
    for p in meta['parts']:
        if p['role'].startswith('lash-'):
            a=np.array(Image.open(source_dir/p['original']).convert('RGBA'))[:,:,3]
            lashes[p['y']:p['y']+p['height'],p['x']:p['x']+p['width']]=np.maximum(lashes[p['y']:p['y']+p['height'],p['x']:p['x']+p['width']],a)
    original=np.array(Image.open(source_dir/'source.png').convert('RGBA'))
    repaired,mask=clean_hair_eye_overlap(original,np.array(front),lashes)
    out=Path('data/exports')/uuid.uuid4().hex;out.mkdir()
    for folder in ('parts','work'):(out/folder).mkdir()
    Image.fromarray(mask.astype('uint8')*255).save(out/'repair-mask.png')
    changed=[]
    for part in project['parts']:
        if part['role'].startswith('lash-'):
            src=next(p for p in meta['parts'] if p['name']==part['name'])
            white=next(p for p in project['parts'] if p['role']=='white-'+part['role'][-1])
            cy=white['y']+white['height']*.72-part['y']
            image=Image.open(source_dir/src['original'])
            existing=part.get('closedSvgText')
            known=[closed_lash_svg(image,cy,legacy=True),closed_lash_svg(image,cy,spikes=False)]
            if not existing or any(existing==text for text in known):
                part['closedSvgText']=closed_lash_svg(image,cy,side=part['role'][-1])
        if part.get('deformGroup') not in ('front','core'):continue
        if part.get('rasterDisabled') or not raster_matches(part):continue
        # Use the saved source pixels, not a stale original over a hand edit.
        url=part.get('rasterSourceUrl','')
        if not url.startswith('data:image/png;base64,'):continue
        a=np.array(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGBA'))
        x,y,bw,bh=[part[k] for k in ('x','y','width','height')]
        local=mask[y:y+bh,x:x+bw] & (a[:,:,3]>0)
        if not local.any():continue
        a[local,:3]=repaired[y:y+bh,x:x+bw,:3][local]
        image=Image.fromarray(a);image.save(out/(part['id']+'.png'))
        part['svgText'],part['paths']=trace_part(image,out/'work',part['id'],project['conversion']['preset'])
        part.pop('spatialBounds',None)
        data=io.BytesIO();image.save(data,format='PNG');part['rasterSourceUrl']='data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()
        part['originalUrl']=part['rasterSourceUrl'];changed.append(part['id'])
    project['hairRepairParts']=changed
    (out/'khaula-motion.project.json').write_text(json.dumps(project,ensure_ascii=False),encoding='utf8')
    print(json.dumps(dict(directory=str(out),pixels=int(mask.sum()),parts=changed)))


if __name__=='__main__':
    import sys
    repair(*sys.argv[1:])
