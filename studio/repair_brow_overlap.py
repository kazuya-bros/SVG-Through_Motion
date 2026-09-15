"""Migrate an unedited source hybrid into a new copy with face-owned brow ink."""
import base64
import io
import json
import uuid
from pathlib import Path
import numpy as np
from PIL import Image
from .convert import trace_part
from .hair_cleanup import clean_hair_eye_overlap, hair_lash_layers
from .repair_hair import raster_matches


def png_url(image):
    stream=io.BytesIO();image.save(stream,format='PNG')
    return 'data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode()


def repair(saved, front_png):
    project=json.loads(Path(saved).read_text(encoding='utf8'))
    if any(p.get('faceOverlay') for p in project['parts']):
        raise ValueError('This project already has brow overlays')
    source_dir=Path('data/projects')/project['id']
    meta=json.loads((source_dir/'project.json').read_text(encoding='utf8'))
    w,h=project['width'],project['height']
    original=np.array(Image.open(source_dir/'source.png').convert('RGBA'))
    front=np.array(Image.open(front_png).convert('RGBA'))
    if original.shape!=front.shape or original.shape[:2]!=(h,w):
        raise ValueError('Donor dimensions differ')
    brows=np.zeros((h,w),np.uint8)
    for p in meta['parts']:
        if not p['role'].startswith('brow-'):continue
        current=next(q for q in project['parts'] if q['id']==p['id'])
        if any(current[k]!=p[k] for k in ('x','y','width','height','role')):
            raise ValueError('Brow geometry was edited')
        a=np.array(Image.open(source_dir/p['original']).convert('RGBA'))[:,:,3]
        x,y=p['x'],p['y'];brows[y:y+a.shape[0],x:x+a.shape[1]]=np.maximum(brows[y:y+a.shape[0],x:x+a.shape[1]],a)
    repaired,mask=clean_hair_eye_overlap(original,front,brows)
    for p in project['parts']:
        if p.get('blinkOverlay'):
            a=np.array(Image.open(io.BytesIO(base64.b64decode(p['originalUrl'].split(',')[1]))).convert('RGBA'))[:,:,3]
            x,y=p['x'],p['y'];mask[y:y+a.shape[0],x:x+a.shape[1]] &= a==0
    affected=[]
    for p in project['parts']:
        if p.get('deformGroup') not in ('core','front'):continue
        if p.get('rasterDisabled') or not raster_matches(p):
            raise ValueError('Base SVG was edited; do not replace it with source pixels')
        url=p.get('rasterSourceUrl','')
        if not url.startswith('data:image/png;base64,'):raise ValueError('Embedded source PNG required')
        a=np.array(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGBA'))
        x,y,bw,bh=[p[k] for k in ('x','y','width','height')]
        local=mask[y:y+bh,x:x+bw] & (a[:,:,3]>0)
        if local.any():
            a[local,:3]=repaired[y:y+bh,x:x+bw,:3][local]
            affected.append((p,Image.fromarray(a)))
    if not affected:raise ValueError('No brow ink found on the source base')
    out=Path('data/exports')/uuid.uuid4().hex;out.mkdir()
    for folder in ('parts','work'):(out/folder).mkdir()
    changed=[]
    for part,image in affected:
        part['svgText'],part['paths']=trace_part(image,out/'work',part['id'],project['conversion']['preset'])
        part.pop('spatialBounds',None)
        part['rasterSourceUrl']=part['originalUrl']=png_url(image)
        changed.append(part['id'])
    centers={p['role'][-1]:(p['x']+p['width']/2,p['y']+p['height']/2) for p in project['parts'] if p['role'].startswith('white-')}
    next_id=max(int(p['id'][1:]) for p in project['parts'])+1
    for side,image in hair_lash_layers(original,mask,centers):
        box=image.getchannel('A').getbbox();image=image.crop(box);pid=f'p{next_id:03d}';next_id+=1
        svg,paths=trace_part(image,out/'work',pid,project['conversion']['preset'])
        url=png_url(image)
        project['parts'].append(dict(id=pid,name='髪に重なる眉（'+('左' if side=='l' else '右')+'）',role='static',
            faceOverlay='brow-'+side,x=box[0],y=box[1],width=image.width,height=image.height,
            visible=True,opacity=1,svgText=svg,paths=paths,rasterSourceUrl=url,originalUrl=url))
        changed.append(pid)
    project['faceRepairParts']=changed
    Image.fromarray(mask.astype('uint8')*255).save(out/'brow-repair-mask.png')
    (out/'khaula-motion.project.json').write_text(json.dumps(project,ensure_ascii=False),encoding='utf8')
    print(json.dumps(dict(directory=str(out),pixels=int(mask.sum()),parts=changed)))


if __name__=='__main__':
    import sys
    repair(*sys.argv[1:])
