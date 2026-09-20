import unittest
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image, ImageDraw
from studio.mouths import closed_mouth_svg, mouth_interior_svg


class MouthTests(unittest.TestCase):
    def test_highlighted_tilted_mouth_closes_without_a_step(self):
        with Image.open(Path(__file__).parent/'fixtures/mouths/highlighted-tilted.png') as im:
            path=list(ET.fromstring(closed_mouth_svg(im)))[0]
        points=[(float(x),float(y)) for x,y in re.findall(r'[ML]([\d.-]+) ([\d.-]+)',path.get('d'))]
        slopes=[(b[1]-a[1])/(b[0]-a[0]) for a,b in zip(points,points[1:])]
        self.assertLess(max(abs(s) for s in slopes),.6)
        self.assertLess(max(abs(b-a) for a,b in zip(slopes,slopes[1:])),.15)
        self.assertGreater(points[0][1],points[-1][1])
        self.assertGreater(points[len(points)//2][1],(points[0][1]+points[-1][1])/2)

    def test_closed_line_retains_source_ink_color_and_nonzero_thickness(self):
        im=Image.new('RGBA',(80,50))
        ImageDraw.Draw(im).ellipse((8,10,72,40),fill=(245,165,155,255),outline=(48,35,40,255),width=2)
        root=ET.fromstring(closed_mouth_svg(im));path=list(root)[0]
        self.assertEqual(path.get('stroke'),'#302328')
        self.assertGreaterEqual(float(path.get('stroke-width')),1)
        self.assertEqual(root.get('viewBox'),'0 0 80 50')
        self.assertEqual(path.get('fill'),'none')

    def test_no_outline_does_not_invent_ink(self):
        self.assertIsNone(closed_mouth_svg(Image.new('RGBA',(30,20),(245,200,190,255))))

    def test_teeth_mask_stays_inside_mouth_and_excludes_skin(self):
        im=Image.new('RGBA',(80,50),(245,225,210,255))
        ImageDraw.Draw(im).ellipse((8,10,72,40),fill=(245,155,155,255),outline=(48,35,40,255),width=2)
        root=ET.fromstring(mouth_interior_svg(im))
        for rect in root:
            x,y,w,h=[int(rect.get(k)) for k in ('x','y','width','height')]
            self.assertTrue(8<x and x+w<=72 and 10<y and y+h<=40)
        self.assertIsNone(mouth_interior_svg(Image.new('RGBA',(30,20),(245,225,210,255))))
