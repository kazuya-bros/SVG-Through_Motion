"""Clip the Teth2 PSD's left hair-gap residue; keep SVG and pixel cache aligned."""
import base64
import copy
import io
import json
from pathlib import Path

import cairosvg
import numpy as np
from PIL import Image
from studio.repair_hair import raster_matches, raster_signature

# Sample coordinates. These curves follow the fine strand in the original art.
GAP = ('M330 239 C323 262 310 291 300 323 '
       'C294 341 289 360 292 387 '
       'Q300 370 306 355 Q312 340 315 325 '
       'Q319 296 322 277 Q326 253 330 239 Z')
OUTSIDE = ('M270 239 H327 C319 261 303 297 294 326 '
           'C286 351 285 373 289 392 H270 Z')
KEY = 'teth2-left-hair-gap-v1'

def clean(part):
    assert part['id'] == 'p000' and part['deformGroup'] == 'back'
    assert (part['x'],part['y'],part['width'],part['height']) == (0,0,1024,1024)
    assert part['artworkSource'] == 'psd' and raster_matches(part)
    path = f'M0 0H1024V1024H0Z {GAP} {OUTSIDE}'
    svg = part['svgText']; start=svg.index('>')+1; end=svg.rfind('</')
    clipped = (svg[:start]+f'<defs><clipPath id="{KEY}" clipPathUnits="userSpaceOnUse">'
               f'<path d="{path}" clip-rule="evenodd"/></clipPath></defs>'
               f'<g clip-path="url(#{KEY})">'+svg[start:end]+'</g>'+svg[end:])
    # Rasterize the very same vector clip for the original-pixel render cache.
    clip_svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="{path}" fill="white" fill-rule="evenodd"/></svg>'
    mask=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=clip_svg.encode(),output_width=4096,output_height=4096))).getchannel('A').resize((1024,1024),Image.Resampling.LANCZOS)
    before=np.array(Image.open(io.BytesIO(base64.b64decode(part['rasterSourceUrl'].split(',')[1]))).convert('RGBA'))
    after=before.copy();after[:,:,3]=((before[:,:,3].astype(np.uint16)*np.asarray(mask)+127)//255).astype(np.uint8)
    # No color changes, and no alpha changes away from this small hair gap.
    assert np.array_equal(before[:,:,:3],after[:,:,:3])
    changed=before[:,:,3]!=after[:,:,3]
    yy,xx=np.where(changed)
    assert xx.min()>=267 and xx.max()<=333 and yy.min()>=236 and yy.max()<=395
    buf=io.BytesIO();Image.fromarray(after).save(buf,format='PNG')
    url='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()
    result=copy.deepcopy(part)
    result.update(svgText=clipped,originalUrl=url,rasterSourceUrl=url,rasterSignature=raster_signature(clipped))
    result['artworkSources']['psd'].update(svgText=clipped,originalUrl=url)
    result.pop('spatialBounds',None)
    print('Clipped pixels:',int(changed.sum()))
    return result

def main():
    sample=Path('web/samples/teth/project.json');project=json.loads(sample.read_text(encoding='utf8'))
    if project.get('sampleHairGapCleanup')==KEY:
        print('Already cleaned');return
    assert project['id']=='ef395d300d24447dbe2be3c353ddccca'
    before=copy.deepcopy(project)
    part=next(p for p in project['parts'] if p['id']=='p000')
    backup=Path('qa/teth-back-before-gap.json')
    if not backup.exists():backup.write_text(json.dumps(part,ensure_ascii=False),encoding='utf8')
    project['parts']=[clean(p) if p['id']=='p000' else p for p in project['parts']]
    assert all(a==b for a,b in zip(before['parts'],project['parts']) if a['id']!='p000')
    assert before['settings']==project['settings']
    project['sampleHairGapCleanup']=KEY
    sample.write_text(json.dumps(project,ensure_ascii=False,separators=(',',':')),encoding='utf8')

if __name__=='__main__':main()
