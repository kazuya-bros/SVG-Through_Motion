"""Separate the sample's existing vector artwork using its original PSD ear masks."""
import base64
import copy
import io
import json
import re
from pathlib import Path
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from scipy import ndimage
from studio.repair_background import clip_background
from studio.repair_hair import raster_signature, raster_matches

def png_url(pixels):
    stream=io.BytesIO();Image.fromarray(pixels).save(stream,format='PNG')
    return 'data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode()

def separate(project,psd):
    if project.get('sampleHumanEars')=='separate-hidden-v1':return project
    assert project['id']=='ef395d300d24447dbe2be3c353ddccca' and psd.size==(1024,1024)
    core=next(p for p in project['parts'] if p['id']=='p001')
    assert raster_matches(core), 'Refuse to replace an edited body'
    leaves={l.name:l for l in psd.descendants() if not l.is_group()}
    face=np.array(leaves['face'].composite(force=True).convert('RGBA'))[:,:,3]
    assert leaves['ears-r'].bbox==(364,343,425,415) and leaves['ears-l'].bbox==(635,295,681,384)
    before=np.array(Image.open(io.BytesIO(base64.b64decode(core['rasterSourceUrl'].split(',')[1]))).convert('RGBA'))
    remove=np.zeros((1024,1024),bool);ears=[]
    for side in ('r','l'):
        layer=leaves['ears-'+side];alpha=np.zeros((1024,1024),np.uint8)
        ear=np.array(layer.composite(force=True).convert('RGBA'))
        alpha[layer.top:layer.bottom,layer.left:layer.right]=ear[:,:,3]
        mask=ndimage.binary_dilation(alpha>8,iterations=1)&(face<16)
        remove|=mask
        yy,xx=np.where(mask);x,y,right,bottom=int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)
        # Copy the original vector paths, never redraw the ear or change its colours.
        art=clip_background(core['svgText'],~mask,'human-ear-'+side)
        for id in set(re.findall(r'\bid="([^"]+)"',art)):
            new='human-'+side+'-'+id
            art=art.replace('id="'+id+'"','id="'+new+'"').replace('url(#'+id+')','url(#'+new+')').replace('href="#'+id+'"','href="#'+new+'"')
        art=art[art.index('>')+1:art.rfind('</svg>')]
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{right-x}" height="{bottom-y}" viewBox="0 0 {right-x} {bottom-y}"><g transform="translate({-x} {-y})">{art}</g></svg>'
        pixels=before.copy();pixels[~mask,3]=0;pixels=pixels[y:bottom,x:right]
        url=png_url(pixels)
        ears.append(dict(id='human-ear-'+side,name='人間の'+('右' if side=='r' else '左')+'耳',role='ear-'+side,visible=False,opacity=1,motionStrength=1,earMotion=False,deformGroup='core',x=x,y=y,width=right-x,height=bottom-y,pivotX=415 if side=='r' else 641,pivotY=388 if side=='r' else 340,svgText=svg,paths=core.get('paths',0),originalUrl=url,rasterSourceUrl=url,rasterSignature=raster_signature(svg)))
    after=before.copy();after[remove,3]=0
    core['svgText']=clip_background(core['svgText'],remove,'teth-human-ears-removed')
    core['rasterSignature']=raster_signature(core['svgText']);core['originalUrl']=core['rasterSourceUrl']=png_url(after)
    # Ears remain behind the front hair, and do not renumber the tuned eye/mouth parts.
    index=next(i for i,p in enumerate(project['parts']) if p.get('deformGroup')=='front')
    project['parts'][index:index]=ears
    project['sampleHumanEars']='separate-hidden-v1'
    return project

if __name__=='__main__':
    sample=Path('web/samples/teth/project.json');original=sample.read_text(encoding='utf-8')
    project=json.loads(original)
    if project.get('sampleHumanEars')!='separate-hidden-v1':
        backup=Path('qa/teth-before-human-ear-split.project.json')
        if not backup.exists():backup.write_text(original,encoding='utf-8')
        result=separate(project,PSDImage.open('data/uploads/2b1877505009438dac06bc00439c56d3/face.psd'))
        sample.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
        print('Human ears separated, hidden by default; original eye and mouth settings retained.')
