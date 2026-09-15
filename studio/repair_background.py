"""Remove a verified source background in a new copy, preserving saved artwork."""
import base64
import io
import json
import uuid
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage

from .background import source_background_masks
from .repair_hair import raster_matches, raster_signature


def clip_background(svg, mask, key):
    """Exact pixel-edge vector clip; retain every existing artwork path."""
    h,w=mask.shape
    path=[f'M0 0H{w}V{h}H0Z']
    for y,row in enumerate(mask):
        edges=np.flatnonzero(np.diff(np.r_[False,row,False].astype(np.int8)))
        for x1,x2 in edges.reshape(-1,2):
            path.append(f'M{x1} {y}H{x2}V{y+1}H{x1}Z')
    start=svg.index('>')+1;end=svg.rfind('</')
    return svg[:start]+f'<defs><clipPath id="{key}" clipPathUnits="userSpaceOnUse"><path d="'+''.join(path)+f'" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#{key})">'+svg[start:end]+'</g>'+svg[end:]


def repair(saved, psd_path, original_path=None):
    project=json.loads(Path(saved).read_text(encoding='utf-8'))
    root=Path('data/projects')/project['id']
    source=np.array(Image.open(root/'source.png').convert('RGBA'))
    psd=PSDImage.open(psd_path)
    if psd.size!=(project['width'],project['height']):raise ValueError('PSD dimensions differ')
    # Verify that the supplied PSD belongs to this exact uploaded original.
    original=Path(original_path) if original_path else Path(psd_path).with_name(project['conversion']['originalName'])
    if not original.exists() or not np.array_equal(source,np.array(Image.open(original).convert('RGBA'))):raise ValueError('Source image does not match the PSD upload')
    leaves=[l for l in psd.descendants() if not l.is_group()]
    outer,hair_gaps=source_background_masks(source,leaves)
    mask=outer|hair_gaps
    if not mask.any():raise ValueError('No verified background pixels')
    metadata=json.loads((root/'project.json').read_text(encoding='utf-8'))
    changed=[]
    for part in project['parts']:
        if part['role']!='static':continue
        baseline=next(p for p in metadata['parts'] if p['id']==part['id'])
        if any(part[k]!=baseline[k] for k in ('x','y','width','height')):raise ValueError('Part geometry was edited')
        if part.get('rasterDisabled') or not raster_matches(part):raise ValueError('Static SVG was edited; cannot safely apply source mask')
        url=part['rasterSourceUrl']
        if not url.startswith('data:image/png;base64,'):raise ValueError('Embedded raster required')
        pixels=np.array(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGBA'))
        x,y,w,h=[part[k] for k in ('x','y','width','height')]
        # The source plate receives gap cleanup before separate PSD foregrounds.
        # Keep those foregrounds intact here too: only core/back carry source gaps.
        layer_mask=mask if part.get('deformGroup') in ('core','back') and not part.get('independentAccessory') else outer
        local=layer_mask[y:y+h,x:x+w]
        count=int((local&(pixels[:,:,3]>0)).sum())
        if not count:continue
        pixels[local,3]=0
        data=io.BytesIO();Image.fromarray(pixels).save(data,format='PNG')
        part['originalUrl']=part['rasterSourceUrl']='data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()
        part['svgText']=clip_background(part['svgText'],local,'source-background-'+uuid.uuid4().hex)
        part['rasterSignature']=raster_signature(part['svgText'])
        # Clipping only shrinks visibility; the existing path bounds remain valid.
        # Keeping them avoids drawing the entire artwork for every SVG mesh cell.
        changed.append({'id':part['id'],'pixels':count})
    if not changed:raise ValueError('Background and hair gaps are already repaired')
    out=Path('data/exports')/uuid.uuid4().hex;out.mkdir()
    project['name']=project['name'].removesuffix('（白背景修正）')+'（白背景・髪の隙間修正）'
    project['backgroundRepair']={'method':'psd-protected-background-and-hair-v3','parts':changed,'backgroundPixels':int(outer.sum()),'hairGapPixels':int((hair_gaps&~outer).sum())}
    project['conversion']['backgroundRemoval']='psd-protected-hair-gaps-v3'
    project['conversion']['hairGapPixels']=int((hair_gaps&~outer).sum())
    (out/'khaula-motion.project.json').write_text(json.dumps(project,ensure_ascii=False),encoding='utf-8')
    Image.fromarray(mask.astype('uint8')*255).save(out/'background-mask.png')
    print(json.dumps({'directory':str(out),'parts':changed,'backgroundPixels':int(mask.sum())}))


if __name__=='__main__':
    import sys
    repair(*sys.argv[1:])
