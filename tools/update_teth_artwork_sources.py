"""Choose PSD motion artwork for the bundled sample without rebuilding its face."""
import copy
import json
from pathlib import Path
from PIL import Image
import numpy as np
from psd_tools import PSDImage
from studio.segmented import split_motion_layers
from studio.artwork_sources import artwork_asset
from studio.repair_hair import raster_signature

def main():
    sample=Path('web/samples/teth/project.json')
    text=sample.read_text(encoding='utf-8');p=json.loads(text)
    if p.get('sampleArtworkSources')=='psd-motion-v1':
        print('Sample already has PSD motion sources.');return
    backup=Path('qa/teth-before-artwork-sources.project.json')
    if not backup.exists():backup.write_text(text,encoding='utf-8')
    dest=Path('qa/teth-artwork-sources');(dest/'work').mkdir(parents=True,exist_ok=True);(dest/'parts').mkdir(exist_ok=True)
    psd=PSDImage.open('data/uploads/2b1877505009438dac06bc00439c56d3/face.psd')
    plate=np.array(Image.open('data/projects/'+p['id']+'/work/clean-plate.png').convert('RGBA'))
    choices={};leading,trailing,meta,_=split_motion_layers(plate,[l for l in psd.descendants() if not l.is_group()],source_options=choices)
    groups={meta[name]['deformGroup']:name for name,_,_ in leading+trailing if meta[name]['deformGroup']!='core'}
    hats={meta[name].get('sourceLayerName'):name for name,_,_ in leading if meta[name].get('independentAccessory')}
    protected={part['id']:copy.deepcopy(part) for part in p['parts'] if part.get('deformGroup') not in ('front','back','arm-r','arm-l') and not part.get('independentAccessory')}
    settings=copy.deepcopy(p['settings']);order=[part['id'] for part in p['parts']]
    for part in p['parts']:
        name=hats.get(part.get('sourceLayerName')) if part.get('independentAccessory') else groups.get(part.get('deformGroup'))
        if name not in choices:continue
        images=choices[name]
        current={k:part[k] for k in ('x','y','width','height','paths','svgText','originalUrl')}
        current_is_psd=part['name'].startswith('PSDの')
        # Retain the user's cleaned PSD front/accessory and original sleeve cutouts.
        variants={}
        for key,image in images.items():
            if (key=='psd' and current_is_psd) or (key=='original' and part.get('deformGroup','').startswith('arm-')):
                variants[key]=copy.deepcopy(current)
            else:
                asset=artwork_asset(image,dest/'work','sample-'+part['id']+'-'+key,p['conversion']['preset'])
                if asset:variants[key]=asset
        part.update(variants['psd']);part.update(artworkSource='psd',artworkSources=variants)
        part['name']={'back':'後ろ髪','front':'前髪','arm-r':'右腕・袖','arm-l':'左腕・袖'}.get(part.get('deformGroup'),'頭飾り（headwear）')
        part['rasterSourceUrl']=part['originalUrl'];part['rasterSignature']=raster_signature(part['svgText']);part.pop('spatialBounds',None)
        print(part['name'],part['width'],part['height'],list(variants),flush=True)
    assert settings==p['settings'] and order==[part['id'] for part in p['parts']]
    assert all(part==protected[part['id']] for part in p['parts'] if part['id'] in protected)
    # Full sleeve backing tucks underneath the torso, matching this PSD's stack.
    core=next(part for part in p['parts'] if part['id']=='p001')
    p['parts'].remove(core)
    last_arm=max(i for i,part in enumerate(p['parts']) if part.get('deformGroup','').startswith('arm-'))
    p['parts'].insert(last_arm+1,core)
    p['sampleArtworkSources']='psd-motion-v1'
    sample.write_text(json.dumps(p,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Sample updated; body, eyes, mouth, hidden ears, tuning and layer order preserved.',flush=True)

if __name__=='__main__':main()
