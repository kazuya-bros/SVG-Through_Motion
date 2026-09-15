"""Portable source choices. Both alternatives contain real vector and PNG artwork."""
import base64
import io
from .convert import trace_part

def png_url(image):
    buffer=io.BytesIO();image.save(buffer,format='PNG')
    return 'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()

def artwork_asset(image,work,pid,preset):
    box=image.getchannel('A').getbbox()
    if not box:return None
    crop=image.crop(box)
    svg,paths=trace_part(crop,work,pid,preset)
    return dict(x=box[0],y=box[1],width=crop.width,height=crop.height,
                svgText=svg,paths=paths,originalUrl=png_url(crop))

def attach_artwork_sources(part,images,work,preset,current_image=None,current_svg=None):
    choices={}
    for key,image in images.items():
        if key==part.get('artworkSource') and current_image is not None:
            choices[key]={k:part[k] for k in ('x','y','width','height','paths')}
            choices[key].update(svgText=current_svg,originalUrl=png_url(current_image))
        else:
            asset=artwork_asset(image,work,part['id']+'-'+key,preset)
            if asset:choices[key]=asset
    if choices:part['artworkSources']=choices
