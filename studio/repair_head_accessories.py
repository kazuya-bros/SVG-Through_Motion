"""Recover separated headwear in a new portable copy of an existing segmented hybrid."""
import base64
import hashlib
import io
import json
import re
import uuid
from pathlib import Path
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from .convert import trace_part
from .repair_hair import raster_matches
from .segmented import split_motion_layers
from .paths import DATA


def repair(saved,psd_path):
    from .server import space_guard
    space_guard()
    project=json.loads(Path(saved).read_text(encoding='utf8'))
    if not project.get('conversion',{}).get('motionParts'):raise ValueError('A segmented hybrid project is required')
    if any(p.get('independentAccessory') for p in project['parts']):raise ValueError('Headwear is already separated')
    root=DATA/'projects'/project['id']
    psd=PSDImage.open(psd_path)
    if psd.size!=(project['width'],project['height']):raise ValueError('PSD dimensions differ')
    plate=np.array(Image.open(root/'work'/'clean-plate.png').convert('RGBA'))
    leading,_,meta,_=split_motion_layers(plate,[l for l in psd.descendants() if not l.is_group()])
    accessories=[v for v in leading if meta[v[0]].get('independentAccessory')]
    if not accessories:raise ValueError('No headwear layer was found')
    mask=np.zeros(plate.shape[:2],bool)
    for _,_,im in accessories:mask |= np.array(im)[:,:,3]>0
    core=next(p for p in project['parts'] if p.get('deformGroup')=='core' and p['role']=='static')
    original=json.loads((root/'project.json').read_text(encoding='utf8'))
    baseline=next(p for p in original['parts'] if p['id']==core['id'])
    if any(core[k]!=baseline[k] for k in ('x','y','width','height','role')) or core.get('rasterDisabled') or not raster_matches(core):
        raise ValueError('Body artwork or geometry was edited; refusing to replace it')
    raw=core.get('rasterSourceUrl','')
    if not raw.startswith('data:image/png;base64,'):raise ValueError('Embedded body source required')
    body=np.array(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[1]))).convert('RGBA'))
    backing=next(np.array(im) for name,_,im in leading if meta[name]['deformGroup']=='core' and not meta[name].get('independentAccessory'))
    x,y,w,h=[core[k] for k in ('x','y','width','height')];local=mask[y:y+h,x:x+w]
    body[local]=backing[y:y+h,x:x+w][local]
    out=DATA/'exports'/uuid.uuid4().hex;out.mkdir()
    for d in ('work','parts'):(out/d).mkdir()
    def encode(part,im):
        svg,paths=trace_part(im,out/'work',part['id'],project['conversion']['preset'])
        part['svgText']=svg.replace(' />','/>');part['paths']=paths;part.pop('spatialBounds',None)
        buf=io.BytesIO();im.save(buf,format='PNG');part['originalUrl']=part['rasterSourceUrl']='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
        ids={}
        def identify(m):
            ids.setdefault(m[1],'asset'+str(len(ids)));return 'id="'+ids[m[1]]+'"'
        canonical=re.sub(r'\bid="([^"]+)"',identify,part['svgText'])
        canonical=re.sub(r'url\(#([^)]+)\)',lambda m:'url(#'+ids.get(m[1],m[1])+')',canonical)
        canonical=re.sub(r'\bhref="#([^"]+)"',lambda m:'href="#'+ids.get(m[1],m[1])+'"',canonical)
        canonical=re.sub(r'>\s+<','><',canonical).strip()
        part['rasterSignature']=hashlib.sha256(canonical.encode()).hexdigest()
    encode(core,Image.fromarray(body))
    for name,role,im in accessories:
        box=im.getchannel('A').getbbox();crop=im.crop(box)
        part=dict(id='p'+str(len(project['parts'])).zfill(3),name=name,role=role,x=box[0],y=box[1],width=crop.width,height=crop.height,visible=True,opacity=1,motionStrength=1,**meta[name])
        encode(part,crop)
        # Append above the front hair; the layer palette can freely move it back underneath.
        project['parts'].append(part)
    project['rig'].pop('seamWeights',None);project['rig']['seamPending']=True
    project['conversion']['independentHeadwear']=True
    path=out/'khaula-motion.project.json';path.write_text(json.dumps(project,ensure_ascii=False),encoding='utf8')
    print(json.dumps({'path':str(path),'export_id':out.name,'parts':len(project['parts'])}))

if __name__=='__main__':
    import sys
    repair(*sys.argv[1:])
