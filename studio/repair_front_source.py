"""Upgrade a saved hybrid's foreground material without replacing user edits."""
import base64
import io
import json
import uuid
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage
from .convert import clean_alpha, trace_part
from .repair_hair import raster_matches


def repair(saved, psd_path):
    project=json.loads(Path(saved).read_text(encoding='utf-8'))
    meta=json.loads((Path('data/projects')/project['id']/'project.json').read_text(encoding='utf-8'))
    psd=PSDImage.open(psd_path)
    if psd.size!=(project['width'],project['height']):
        raise ValueError('PSD dimensions differ')
    front=Image.new('RGBA',psd.size)
    for layer in psd.descendants():
        if layer.is_group() or not layer.is_visible():continue
        if 'front hair' not in layer.name.lower().replace('_',' ') and '前髪' not in layer.name:continue
        image=layer.composite(force=True)
        if image is not None:front.alpha_composite(clean_alpha(image,'hair',project.get('conversion',{}).get('alphaThreshold',12)),(layer.left,layer.top))
    if not front.getchannel('A').getbbox():raise ValueError('No foreground hair in the PSD')
    targets=[p for p in project['parts'] if p.get('deformGroup')=='front']
    if len(targets)!=1:raise ValueError('Expected one foreground part')
    part=targets[0];baseline=next(p for p in meta['parts'] if p['id']==part['id'])
    if any(part[k]!=baseline[k] for k in ('x','y','width','height','role')) or part.get('rasterDisabled') or not raster_matches(part):
        raise ValueError('Foreground was edited; keep the saved artwork intact')
    # Retain the original frame and all motion controls, rather than recentering it.
    x,y,w,h=[part[k] for k in ('x','y','width','height')]
    crop=front.crop((x,y,x+w,y+h))
    out=Path('data/exports')/uuid.uuid4().hex;out.mkdir()
    for name in ('parts','work'):(out/name).mkdir()
    part['svgText'],part['paths']=trace_part(crop,out/'work',part['id'],project['conversion']['preset'])
    part.pop('spatialBounds',None);part.pop('rasterSignature',None)
    data=io.BytesIO();crop.save(data,format='PNG');crop.save(out/'front.png')
    part['originalUrl']=part['rasterSourceUrl']='data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()
    hidden=[]
    for p in project['parts']:
        if p.get('blinkOverlay') or p.get('faceOverlay'):
            p['visible']=False;hidden.append(p['id'])
    project['conversion']['frontHairSource']='psd'
    # Only the front SVG changed. Force recalculation from its new silhouette.
    if project.get('rig'):project['rig'].pop('seamWeights',None)
    path=out/'khaula-motion.project.json';path.write_text(json.dumps(project,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'directory':str(out),'front':part['id'],'hiddenOverlays':hidden}))
    return path


if __name__=='__main__':
    import sys
    repair(*sys.argv[1:])
