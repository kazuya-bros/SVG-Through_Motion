"""Repair a saved hybrid's eye underlay into a separate export."""
import base64
import io
import json
import uuid
from pathlib import Path
import numpy as np
from PIL import Image
from .convert import trace_part, clean_alpha
from psd_tools import PSDImage
from .repair_hair import raster_matches
from .eye_plate import blend_eye_skin, psd_skin_inputs


def repair(saved, psd_path):
    project=json.loads(Path(saved).read_text(encoding='utf-8'))
    part=next(p for p in project['parts'] if p.get('deformGroup')=='core')
    if part.get('rasterDisabled') or not raster_matches(part):
        raise ValueError('The core artwork has been edited; refusing to replace it')
    source=Path('data/projects')/project['id']
    meta=json.loads((source/'project.json').read_text(encoding='utf-8'))
    baseline=next(p for p in meta['parts'] if p['id']==part['id'])
    if any(part[k]!=baseline[k] for k in ('x','y','width','height')):
        raise ValueError('Core frame differs from the source')
    base=np.array(Image.open(io.BytesIO(base64.b64decode(part['rasterSourceUrl'].split(',')[1]))).convert('RGBA'))
    x,y,w,h=[part[k] for k in ('x','y','width','height')]
    psd=PSDImage.open(psd_path,max_alloc_bytes=512*1024**2)
    size=(project['width'],project['height'])
    if psd.size!=size:raise ValueError('PSD dimensions differ')
    features=[]
    for p in meta['parts']:
        if not p['role'].startswith(('white-','iris-','lash-')):continue
        canvas=Image.new('RGBA',size)
        with Image.open(source/p['original']) as im:canvas.alpha_composite(im.convert('RGBA'),(p['x'],p['y']))
        features.append((p['name'],p['role'],canvas))
    removal=np.array(Image.open(source/'work'/'face-removal.png').convert('L'))>0
    settings=project.get('conversion',{})
    face,mask=psd_skin_inputs(list(psd.descendants()),size,features,removal,
        lambda im:clean_alpha(im,'static',settings.get('alphaThreshold',12),settings.get('lineCleanup',True)))
    face=face[y:y+h,x:x+w];mask=mask[y:y+h,x:x+w]
    front=next(p for p in project['parts'] if p.get('deformGroup')=='front')
    full=Image.new('RGBA',(project['width'],project['height']))
    im=Image.open(io.BytesIO(base64.b64decode(front['rasterSourceUrl'].split(',')[1]))).convert('RGBA')
    full.alpha_composite(im,(front['x'],front['y']))
    excluded=np.array(full)[y:y+h,x:x+w,3]>60
    repaired,area=blend_eye_skin(base,face,mask,excluded,radius=max(2,round(size[0]*12/1024)))
    if not area.any():raise ValueError('No suitable skin area')
    assert np.array_equal(base[:,:,3],repaired[:,:,3])
    assert np.array_equal(base[~area],repaired[~area])
    out=Path('data/exports')/uuid.uuid4().hex;out.mkdir();(out/'work').mkdir();(out/'parts').mkdir()
    image=Image.fromarray(repaired);image.save(out/'core.png')
    Image.fromarray(area.astype('uint8')*255).save(out/'mask.png')
    part['svgText'],part['paths']=trace_part(image,out/'work',part['id'],project['conversion']['preset'])
    part.pop('spatialBounds',None);part.pop('rasterSignature',None)
    data=io.BytesIO();image.save(data,format='PNG')
    part['originalUrl']=part['rasterSourceUrl']='data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()
    project['conversion']['eyePlateRepair']='psd-skin-color-match-v1'
    project['conversion']['eyePlateRepairPixels']=int(area.sum())
    if project.get('rig'):project['rig'].pop('seamWeights',None)
    (out/'khaula-motion.project.json').write_text(json.dumps(project,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'directory':str(out),'part':part['id'],'pixels':int(area.sum())}))


if __name__=='__main__':
    import sys
    repair(*sys.argv[1:])
