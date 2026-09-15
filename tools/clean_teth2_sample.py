"""Teth2-specific SVG layer clipping, with matching original-render caches.

The face/body source plate retained background inside the PSD hair silhouette.
Keep its actual face/body area; the separately moving hair and sleeves stay on
their own layers. This is deliberately not a heuristic for arbitrary uploads.
"""
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from studio.repair_background import clip_background
from studio.repair_hair import raster_signature, raster_matches


def clean(project):
    if project.get('sampleCleanup') == 'teth2-layer-boundaries-v1':
        return project
    assert project['id'] == 'ef395d300d24447dbe2be3c353ddccca', 'Teth2 sample only'
    assert project['width'] == project['height'] == 1024
    # Generous margins around the visible face, ears, neck and torso. All points
    # are in the untransformed Teth2 source coordinates, never screen coordinates.
    core = [(350,110),(655,110),(700,290),(700,400),(625,485),
            (615,510),(700,545),(710,740),(690,875),(670,935),
            (755,1024),(280,1024),(335,935),(340,860),(330,700),
            (350,570),(435,510),(425,465),(350,395),(340,265)]
    changes = []
    for part in project['parts']:
        if part['id'] not in ('p000','p001'):
            continue
        assert raster_matches(part), 'Do not overwrite edited SVG artwork'
        pixels = np.array(Image.open(io.BytesIO(base64.b64decode(
            part['rasterSourceUrl'].split(',')[1]))).convert('RGBA'))
        if part['id'] == 'p001':
            keep = Image.new('1',(1024,1024))
            ImageDraw.Draw(keep).polygon(core,fill=1)
            remove = ~np.asarray(keep)
        else:
            remove = np.zeros((1024,1024),bool)
            # Trim only the stray crown arc above the main hair contour. Keep
            # the underpaint below it so the moving front hair has no holes.
            crown = Image.new('1',(1024,1024))
            ImageDraw.Draw(crown).polygon([(400,0),(535,0),(535,58),
                (520,58),(505,61),(490,65),(475,67),(460,72),(445,78),
                (430,86),(415,97),(400,112)],fill=1)
            remove |= np.asarray(crown)
            # Remove detached tracing flecks, retaining the connected hair art.
            labels,_ = ndimage.label(pixels[:,:,3] >= 12)
            sizes = np.bincount(labels.ravel()); sizes[0] = 0
            supported = sizes[labels] >= 64
            remove |= ~ndimage.binary_dilation(supported,iterations=1)
        count = int((remove & (pixels[:,:,3]>0)).sum())
        pixels[remove,3] = 0
        part['svgText'] = clip_background(part['svgText'],remove,
                                         'teth2-clean-'+part['id'])
        part['rasterSignature'] = raster_signature(part['svgText'])
        buffer = io.BytesIO(); Image.fromarray(pixels).save(buffer,format='PNG')
        part['originalUrl'] = part['rasterSourceUrl'] = (
            'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode())
        changes.append({'id':part['id'],'removedPixels':count})
    project['sampleCleanup'] = 'teth2-layer-boundaries-v1'
    print(changes)
    return project


if __name__ == '__main__':
    import sys
    source,target = map(Path,sys.argv[1:])
    target.write_text(json.dumps(clean(json.loads(source.read_text(encoding='utf8'))),
                                ensure_ascii=False),encoding='utf8')

