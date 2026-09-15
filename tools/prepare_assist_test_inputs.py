"""Create small synthetic PNG+PSD inputs for the from-inputs workflow; no user artwork is touched."""
import json
from pathlib import Path
from uuid import uuid4
from PIL import Image,ImageDraw
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer

root=Path(__file__).resolve().parents[1]/'qa'/('assist-inputs-'+uuid4().hex)
root.mkdir()
size=(320,360);psd=PSDImage.new('RGBA',size)
def layer(name,draw):
    im=Image.new('RGBA',size);draw(ImageDraw.Draw(im));PixelLayer.frompil(im,psd,name=name);return im
layers=[]
layers.append(layer('body',lambda d:d.ellipse((40,25,280,325),fill='#ffe4cf')))
for side,x in [('r',82),('l',192)]:
    layers.append(layer('eyewhite-'+side,lambda d,x=x:d.ellipse((x,131,x+46,153),fill='white')))
    layers.append(layer('iris-'+side,lambda d,x=x:d.ellipse((x+17,131,x+29,153),fill='#58627a')))
    layers.append(layer('eyelash-'+side,lambda d,x=x:d.arc((x,131,x+46,153),180,360,fill='#34314a',width=3)))
layers.append(layer('mouth',lambda d:d.ellipse((133,212,187,243),fill='#743642')))
original=Image.new('RGBA',size,'white')
for im in layers:original.alpha_composite(im)
original.convert('RGB').save(root/'original.png');psd.save(root/'parts.psd')
print(json.dumps({'original':str(root/'original.png'),'psd':str(root/'parts.psd')},ensure_ascii=False))
