"""Restore erased sleeve pixels in a new portable project; never overwrite edits."""
import base64
import io
import json
import uuid
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage

from .background import foreground_support, white_background_mask
from .convert import trace_part
from .repair_hair import raster_matches
from .segmented import split_motion_layers


def repair(saved, psd_path):
    project=json.loads(Path(saved).read_text(encoding='utf-8'))
    root=Path('data/projects')/project['id']
    metadata=json.loads((root/'project.json').read_text(encoding='utf-8'))
    source=np.array(Image.open(root/'source.png').convert('RGBA'))
    plate=np.array(Image.open(root/'work/clean-plate.png').convert('RGBA'))
    psd=PSDImage.open(psd_path)
    if psd.size!=(project['width'],project['height']):
        raise ValueError('PSD dimensions differ')
    leaves=[layer for layer in psd.descendants() if not layer.is_group()]
    lost=(plate[:,:,3]==0)&~white_background_mask(source,foreground_support(leaves,psd.size))&(source[:,:,3]>0)
    restored=plate.copy();restored[lost]=source[lost]
    leading,trailing,groups,_=split_motion_layers(restored,leaves)
    candidates={groups[name]['deformGroup']:np.array(im) for name,_,im in leading+trailing}
    affected=[]
    for part in project['parts']:
        if part.get('deformGroup') not in ('arm-l','arm-r'):continue
        baseline=next(p for p in metadata['parts'] if p['id']==part['id'])
        if any(part[k]!=baseline[k] for k in ('x','y','width','height','role')):
            raise ValueError('Sleeve geometry was edited; refusing to replace it')
        if part.get('rasterDisabled') or not raster_matches(part):
            raise ValueError('Sleeve SVG was edited; refusing to replace it')
        raw=part['rasterSourceUrl']
        if not raw.startswith('data:image/png;base64,'):raise ValueError('Embedded source required')
        image=np.array(Image.open(io.BytesIO(base64.b64decode(raw.split(',')[1]))).convert('RGBA'))
        x,y,w,h=[part[k] for k in ('x','y','width','height')]
        local=candidates[part['deformGroup']][y:y+h,x:x+w]
        mask=lost[y:y+h,x:x+w]&(local[:,:,3]>0)&(image[:,:,3]==0)
        if mask.any():
            image[mask]=local[mask]
            affected.append((part,Image.fromarray(image),int(mask.sum())))
    if not affected:raise ValueError('No erased sleeve pixels found')
    out=Path('data/exports')/uuid.uuid4().hex;out.mkdir()
    for name in ('parts','work'):(out/name).mkdir()
    for part,image,count in affected:
        part['svgText'],part['paths']=trace_part(image,out/'work',part['id'],project['conversion']['preset'])
        part.pop('spatialBounds',None)
        buffer=io.BytesIO();image.save(buffer,format='PNG')
        part['rasterSourceUrl']=part['originalUrl']='data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()
        image.save(out/(part['id']+'.png'))
    # Browser verification normalizes the new SVG and its raster signature before saving.
    project['sleeveAlphaRepairParts']=[part['id'] for part,_,_ in affected]
    (out/'khaula-motion.project.json').write_text(json.dumps(project,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'directory':str(out),'parts':project['sleeveAlphaRepairParts'],'pixels':sum(c for _,_,c in affected)}))


if __name__=='__main__':
    import sys
    repair(*sys.argv[1:])
