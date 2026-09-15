"""Keep the sample's tuned eyes/mouth; replace only baked-in face underpaint."""
import base64,io,json,copy,re
from pathlib import Path
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from studio.eye_plate import psd_face_artwork,replace_face_base
from studio.artwork_sources import artwork_asset,png_url
from studio.repair_background import clip_background
from studio.repair_hair import raster_matches,raster_signature

def main():
    path=Path('web/samples/teth/project.json');p=json.loads(path.read_text(encoding='utf8'))
    if p.get('sampleFaceBase')=='psd-face-v1':print('Already updated');return
    before=copy.deepcopy(p);part=next(a for a in p['parts'] if a['id']=='p001')
    assert raster_matches(part) and (part['x'],part['y'],part['width'],part['height'])==(0,0,1024,1024)
    backup=Path('qa/teth-core-before-face.json')
    if not backup.exists():backup.write_text(json.dumps(part,ensure_ascii=False),encoding='utf8')
    psd=PSDImage.open('data/uploads/2b1877505009438dac06bc00439c56d3/face.psd')
    face=psd_face_artwork(psd.descendants(),(1024,1024));assert face is not None
    pixels=np.array(Image.open(io.BytesIO(base64.b64decode(part['rasterSourceUrl'].split(',')[1]))).convert('RGBA'))
    fixed,mask=replace_face_base(pixels,face)
    assert np.array_equal(pixels[~mask],fixed[~mask])
    work=Path('qa/teth-face-base/work');work.mkdir(parents=True,exist_ok=True);work.parent.joinpath('parts').mkdir(exist_ok=True)
    asset=artwork_asset(face,work,'face','detail')
    svg=clip_background(part['svgText'],mask,'teth-face-base-replace');end=svg.rfind('</')
    svg=svg[:end]+f'<g transform="translate({asset["x"]} {asset["y"]})">'+asset['svgText']+'</g>'+svg[end:]
    svg=re.sub(r'\s+/>','/>',svg)
    part.update(svgText=svg,paths=part['paths']+asset['paths'],originalUrl=png_url(Image.fromarray(fixed)),rasterSignature=raster_signature(svg))
    part['rasterSourceUrl']=part['originalUrl'];part.pop('spatialBounds',None)
    assert before['settings']==p['settings']
    assert all(a==b for a,b in zip(before['parts'],p['parts']) if a['id']!='p001')
    p['sampleFaceBase']='psd-face-v1';path.write_text(json.dumps(p,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    print('Face base updated; other parts and settings preserved.')

if __name__=='__main__':main()
