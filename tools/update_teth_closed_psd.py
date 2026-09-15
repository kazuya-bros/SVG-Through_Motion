"""Separate Face from the sample torso and adopt the user's closed-expression PSD."""
import base64,copy,io,json,re
from pathlib import Path
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from studio.eye_plate import psd_face_artwork
from studio.artwork_sources import artwork_asset,png_url
from studio.repair_background import clip_background
from studio.repair_hair import raster_signature
from studio.face_donors import read_donors,attach_donors

def main():
    path=Path('web/samples/teth/project.json');p=json.loads(path.read_text(encoding='utf8'))
    marker='close-eye-psd-face-separated-v1'
    if p.get('sampleClosedDonor')==marker:print('Already updated');return
    backup=Path('qa/teth-before-closed-psd.project.json')
    if not backup.exists():backup.write_text(json.dumps(p,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    dest=Path('qa/teth-closed-psd')
    for d in ['work','parts','originals']:(dest/d).mkdir(parents=True,exist_ok=True)
    body=next(v for v in p['parts'] if v['id']=='p001')
    if not any(v.get('faceBase') for v in p['parts']):
        psd=PSDImage.open('data/uploads/2b1877505009438dac06bc00439c56d3/face.psd')
        face=psd_face_artwork(psd.descendants(),(1024,1024));assert face is not None
        mask=np.array(face)[:,:,3]>0
        pixels=np.array(Image.open(io.BytesIO(base64.b64decode(body['rasterSourceUrl'].split(',')[1]))).convert('RGBA'))
        pixels[mask,3]=0
        svg=re.sub(r'\s+/>','/>',clip_background(body['svgText'],mask,'teth-face-separated'))
        body.update(name='元画像（胴体・首）',svgText=svg,originalUrl=png_url(Image.fromarray(pixels)),rasterSignature=raster_signature(svg))
        body['rasterSourceUrl']=body['originalUrl'];body.pop('spatialBounds',None)
        asset=artwork_asset(face,dest/'work','face-base','detail')
        asset['svgText']=re.sub(r'\s+/>','/>',asset['svgText'])
        asset.update(id='face-base',name='Face（顔の下地）',role='static',faceBase=True,deformGroup='core',visible=True,opacity=1,motionStrength=1,
                     rasterSourceUrl=asset['originalUrl'],rasterSignature=raster_signature(asset['svgText']))
        p['parts'].insert(p['parts'].index(body)+1,asset)
    source=Path.home()/'Desktop'/'close_eye.psd'
    donors=read_donors({'eyes_closed':source,'mouth_closed':source},(1024,1024),cleanup=False)
    attach_donors(p,donors,dest,'detail')
    for part in p['parts']:
        if part['role'].startswith('lash-'):part.pop('lidAdjust',None)
    # The donor already contains its own curve, angle, line thickness and glint.
    p['settings'].setdefault('mouthTuning',{})['closed']={}
    p['sampleClosedDonor']=marker;p['sampleFaceBase']='psd-face-separated-v2'
    path.write_text(json.dumps(p,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    print('Separated Face and attached PSD closed eyes / mouth at original coordinates.')

if __name__=='__main__':main()
