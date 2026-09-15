"""Apply PSD-supported background gaps to a new portable project without retracing its artwork."""
import base64, hashlib, io, json, re, uuid
from pathlib import Path
from xml.etree import ElementTree as ET
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from .background import hair_white_gap_mask
from .convert import tag
from .repair_hair import raster_matches


def signature(svg):
    ids={}
    def identify(m):
        ids.setdefault(m[1],'asset'+str(len(ids)));return 'id="'+ids[m[1]]+'"'
    svg=re.sub(r'\bid="([^"]+)"',identify,svg)
    svg=re.sub(r'url\(#([^)]+)\)',lambda m:'url(#'+ids.get(m[1],m[1])+')',svg)
    svg=re.sub(r'\bhref="#([^"]+)"',lambda m:'href="#'+ids.get(m[1],m[1])+'"',svg)
    return hashlib.sha256(re.sub(r'>\s+<','><',svg).strip().encode()).hexdigest()


def repair(saved,psd_path):
    from .server import space_guard
    space_guard()
    project=json.loads(Path(saved).read_text(encoding='utf-8'))
    if project.get('conversion',{}).get('mode')!='hybrid':raise ValueError('A hybrid project is required')
    raw=project['sourceUrl']
    if not raw.startswith('data:image/png;base64,'):raise ValueError('An embedded original is required')
    original=np.array(Image.open(io.BytesIO(base64.b64decode(raw.split(',',1)[1]))).convert('RGBA'))
    psd=PSDImage.open(psd_path)
    if psd.size!=(project['width'],project['height']):raise ValueError('PSD dimensions differ')
    mask=hair_white_gap_mask(original,[l for l in psd.descendants() if not l.is_group()])
    baseline=json.loads((Path('data/projects')/project['id']/'project.json').read_text(encoding='utf-8'))
    changed=[]
    for part in project['parts']:
        if part.get('deformGroup') not in ('core','back') or part.get('independentAccessory'):continue
        base=next(p for p in baseline['parts'] if p['id']==part['id'])
        if any(part[k]!=base[k] for k in ('x','y','width','height')):raise ValueError('Layer geometry changed')
        if part.get('rasterDisabled') or not raster_matches(part):raise ValueError('Layer artwork changed')
        x,y,w,h=[part[k] for k in ('x','y','width','height')]
        data=part.get('rasterSourceUrl')
        if not data or not data.startswith('data:image/png;base64,'):raise ValueError('Embedded layer required')
        pixels=np.array(Image.open(io.BytesIO(base64.b64decode(data.split(',',1)[1]))).convert('RGBA'))
        local=mask[y:y+h,x:x+w] & (pixels[:,:,3]>0)
        if not local.any():continue
        pixels[local,3]=0
        root=ET.fromstring(part['svgText']);children=list(root)
        defs=ET.SubElement(root,tag('defs'));identifier='hair-gap-'+uuid.uuid4().hex
        m=ET.SubElement(defs,tag('mask'),{'id':identifier,'maskUnits':'userSpaceOnUse','x':'0','y':'0','width':str(w),'height':str(h),'mask-type':'luminance'})
        ET.SubElement(m,tag('rect'),{'width':str(w),'height':str(h),'fill':'white'})
        runs=[]
        for row,line in enumerate(local):
            edges=np.diff(np.pad(line.astype('int8'),(1,1)))
            for left,right in zip(np.where(edges==1)[0],np.where(edges==-1)[0]):runs.append(f'M{left} {row}h{right-left}v1h{left-right}Z')
        ET.SubElement(m,tag('path'),{'d':' '.join(runs),'fill':'black'})
        group=ET.SubElement(root,tag('g'),{'mask':f'url(#{identifier})'})
        for child in children:root.remove(child);group.append(child)
        part['svgText']=ET.tostring(root,encoding='unicode').replace(' />','/>')
        buf=io.BytesIO();Image.fromarray(pixels).save(buf,format='PNG')
        part['originalUrl']=part['rasterSourceUrl']='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
        part['rasterSignature']=signature(part['svgText']);part.pop('spatialBounds',None)
        changed.append({'id':part['id'],'pixels':int(local.sum())})
    if not changed:raise ValueError('No supported white gaps found')
    project['conversion']['backgroundRemoval']='psd-protected-hair-gaps-v2'
    project['conversion']['hairGapRepair']=changed
    out=Path('data/exports')/uuid.uuid4().hex;out.mkdir()
    path=out/'khaula-motion.project.json';path.write_text(json.dumps(project,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'path':str(path.resolve()),'export_id':out.name,'changed':changed}))

if __name__=='__main__':
    import sys
    repair(*sys.argv[1:])
