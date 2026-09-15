import unittest
from xml.etree import ElementTree as ET
from PIL import Image,ImageDraw
import numpy as np
from studio.eyelids import closed_lash_svg,attach_closed_lashes

class EyelidTests(unittest.TestCase):
    def test_closed_lash_keeps_source_weight_and_color_as_filled_geometry(self):
        im=Image.new('RGBA',(90,60))
        ImageDraw.Draw(im).polygon([(2,32),(18,14),(60,16),(87,30),(59,23),(20,24)],fill=(35,20,18,255))
        text=closed_lash_svg(im,45);root=ET.fromstring(text);path=root[0]
        self.assertEqual(path.attrib['fill'],'#231412')
        self.assertNotIn('stroke',path.attrib)
        self.assertNotIn('image',text)
        points=np.array([list(map(float,p.split())) for p in path.attrib['d'].split(' Z')[0][2:].split(' L ')])
        # The middle has several pixels of filled lash, with tapered tips.
        middle=points[np.abs(points[:,0]-40)<.1,1]
        self.assertGreater(middle.max()-middle.min(),3)
        self.assertGreaterEqual(points[:,1].min(),0)
        self.assertLessEqual(points[:,1].max(),60)

    def test_empty_or_light_skin_is_not_an_eyelash(self):
        self.assertIsNone(closed_lash_svg(Image.new('RGBA',(80,60)),40))
        self.assertIsNone(closed_lash_svg(Image.new('RGBA',(80,60),(240,220,210,255)),40))

    def test_closed_lash_has_downward_outer_tufts(self):
        im=Image.new('RGBA',(90,60))
        ImageDraw.Draw(im).polygon([(2,40),(20,15),(60,12),(87,22),(60,20),(20,26)],fill=(35,20,18,255))
        for side in ('l','r'):
            path=ET.fromstring(closed_lash_svg(im,42,side=side))[0].attrib['d']
            tufts=path.split(' Z')[1:3]
            self.assertEqual(len(tufts),2)
            for tuft in tufts:
                pts=np.array([list(map(float,p.split())) for p in tuft.strip()[2:].split(' L ')])
                self.assertGreater(pts[1,1],pts[0,1]+3)
                self.assertLessEqual(pts[1,1],59)
                self.assertEqual(pts[:,0].mean()<45,side=='r')

    def test_mirrored_source_lashes_close_with_opposite_tilts(self):
        im=Image.new('RGBA',(90,60))
        ImageDraw.Draw(im).polygon([(2,40),(20,15),(60,12),(87,22),(60,20),(20,26)],fill=(35,20,18,255))
        def points(image):
            path=ET.fromstring(closed_lash_svg(image,42))[0].attrib['d']
            return np.array([list(map(float,p.split())) for p in path.split(' Z')[0][2:].split(' L ')])
        a=points(im);b=points(im.transpose(Image.Transpose.FLIP_LEFT_RIGHT))
        def rise(p):
            return p[p[:,0]==p[:,0].max(),1].mean()-p[p[:,0]==p[:,0].min(),1].mean()
        self.assertGreater(abs(rise(a)),4)
        self.assertAlmostEqual(rise(a),-rise(b),places=1)
        for p in (a,b):
            self.assertGreaterEqual(p[:,1].min(),0)
            self.assertLessEqual(p[:,1].max(),60)

    def test_only_known_legacy_donor_is_upgraded(self):
        import tempfile
        from pathlib import Path
        im=Image.new('RGBA',(90,60))
        ImageDraw.Draw(im).polygon([(2,40),(20,15),(60,12),(87,22),(60,20),(20,26)],fill=(35,20,18,255))
        with tempfile.TemporaryDirectory() as directory:
            directory=Path(directory);im.save(directory/'lash.png')
            old=closed_lash_svg(im,43.2,legacy=True)
            p={'parts':[dict(role='lash-r',height=60,y=0,original='lash.png',closedSvgText=old)]}
            attach_closed_lashes(p,directory)
            self.assertNotEqual(p['parts'][0]['closedSvgText'],old)
            self.assertEqual(p['parts'][0]['legacyClosedSvgText'],old)
            p['parts'][0]['closedSvgText']='<svg>artist donor</svg>'
            attach_closed_lashes(p,directory)
            self.assertEqual(p['parts'][0]['closedSvgText'],'<svg>artist donor</svg>')

    def test_custom_closed_svg_is_preserved(self):
        from pathlib import Path
        p={'parts':[{'role':'lash-r','closedSvgText':'custom'}]}
        self.assertEqual(attach_closed_lashes(p,Path('.'))['parts'][0]['closedSvgText'],'custom')

if __name__=='__main__':unittest.main()
