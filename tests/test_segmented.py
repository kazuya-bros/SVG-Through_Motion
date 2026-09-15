import unittest
import numpy as np
from PIL import Image,ImageDraw
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from studio.segmented import split_motion_layers,motion_image

class SegmentedTests(unittest.TestCase):
    def test_combined_earwear_gets_independent_left_and_right_roots(self):
        psd=PSDImage.new('RGBA',(100,100))
        PixelLayer.frompil(Image.new('RGBA',(30,50),'blue'),psd,name='topwear',left=35,top=30)
        earrings=Image.new('RGBA',(100,100));draw=ImageDraw.Draw(earrings)
        draw.rectangle((10,20,18,35),fill='yellow');draw.rectangle((82,20,90,35),fill='yellow')
        PixelLayer.frompil(earrings,psd,name='earwear')
        leading,_,meta,_=split_motion_layers(np.array(psd.composite(force=True).convert('RGBA')),list(psd.descendants()))
        roots={m['sourceLayerName']:m['pivotX'] for m in meta.values() if m.get('sourceLayerName','').startswith('earwear')}
        self.assertEqual(set(roots),{'earwear-l','earwear-r'})
        self.assertLess(roots['earwear-l'],20);self.assertGreater(roots['earwear-r'],80)

    def test_extra_parts_keep_psd_backing_and_do_not_duplicate_in_torso(self):
        psd=PSDImage.new('RGBA',(100,100))
        PixelLayer.frompil(Image.new('RGBA',(30,50),'blue'),psd,name='topwear',left=35,top=15)
        PixelLayer.frompil(Image.new('RGBA',(40,25),'orange'),psd,name='bottomwear',left=30,top=60)
        PixelLayer.frompil(Image.new('RGBA',(8,25),'red'),psd,name='neckwear',left=46,top=20)
        PixelLayer.frompil(Image.new('RGBA',(6,10),'yellow'),psd,name='earwear',left=20,top=15)
        # Empty classes from the decomposition must not create controls.
        PixelLayer.frompil(Image.new('RGBA',(100,100),(40,40,40,20)),psd,name='wings')
        plate=np.array(psd.composite(force=True).convert('RGBA'))
        leading,_,meta,_=split_motion_layers(plate,list(psd.descendants()))
        extras={meta[name].get('sourceLayerName'):(name,im) for name,_,im in leading if meta[name].get('sourceLayerName')}
        self.assertTrue({'bottomwear','neckwear','earwear'}<=extras.keys())
        self.assertNotIn('wings',extras)
        for key in ('bottomwear','neckwear','earwear'):
            name,im=extras[key]
            self.assertFalse(meta[name]['secondaryMotion']['enabled'])
            self.assertTrue(meta[name]['independentAccessory'])
            self.assertIsNotNone(im.getchannel('A').getbbox())
        core=next(im for name,_,im in leading if name.startswith('元画像（胴体'))
        self.assertEqual(core.getpixel((40,75))[3],0)
        self.assertEqual(core.getpixel((48,25))[3],255) # Hidden torso retained behind ribbon.

    def test_tail_is_separate_behind_torso_and_anchored_at_contact(self):
        psd=PSDImage.new('RGBA',(100,100))
        PixelLayer.frompil(Image.new('RGBA',(50,20),'orange'),psd,name='tail',left=40,top=50)
        PixelLayer.frompil(Image.new('RGBA',(30,60),'blue'),psd,name='topwear',left=20,top=20)
        plate=np.array(psd.composite(force=True).convert('RGBA'))
        leading,_,meta,_=split_motion_layers(plate,list(psd.descendants()))
        name,role,tail=next(p for p in leading if p[1]=='tail')
        self.assertEqual(meta[name]['deformGroup'],'tail')
        self.assertLess(meta[name]['pivotX'],55)
        self.assertTrue(50<=meta[name]['pivotY']<70)
        self.assertEqual(leading[0][1],'tail')
        core=next(im for name,_,im in leading if meta[name]['deformGroup']=='core')
        self.assertEqual(core.getpixel((80,60))[3],0)
        self.assertEqual(tail.getpixel((45,60))[3],255) # Concealed root retained.

    def test_separated_face_keeps_neck_coverage_at_chin(self):
        psd=PSDImage.new('RGBA',(80,80))
        PixelLayer.frompil(Image.new('RGBA',(20,35),(220,170,150,255)),psd,name='neck',left=30,top=30)
        PixelLayer.frompil(Image.new('RGBA',(40,30),(245,210,190,255)),psd,name='face',left=20,top=10)
        plate=np.array(psd.composite(force=True).convert('RGBA'))
        leading,_,meta,_=split_motion_layers(plate,list(psd.descendants()))
        core=np.array(next(im for name,_,im in leading if name=='元画像（胴体・首）'))
        self.assertTrue((core[35:45,30:50,3]==255).all())
        self.assertEqual(core[20,40,3],0) # No fixed copy of the face.

    def test_source_arm_outline_is_not_left_on_torso(self):
        psd=PSDImage.new('RGBA',(80,80))
        PixelLayer.frompil(Image.new('RGBA',(20,50),'red'),psd,name='topwear',left=40,top=20)
        PixelLayer.frompil(Image.new('RGBA',(15,40),'yellow'),psd,name='handwear-r',left=20,top=30)
        plate=np.array(psd.composite(force=True).convert('RGBA'))
        plate[30:70,18]=[20,20,20,255] # Original outline beyond the PSD arm.
        leading,_,meta,_=split_motion_layers(plate,list(psd.descendants()))
        core=np.array(next(im for name,_,im in leading if meta[name]['deformGroup']=='core'))
        self.assertTrue((core[30:70,18,3]==0).all())
        np.testing.assert_array_equal(core[35,45],[255,0,0,255])

    def test_faint_export_specks_removed_but_connected_soft_edge_retained(self):
        a=np.zeros((30,30,4),np.uint8)
        a[10:20,10:20]=[200,150,100,255]
        a[9,10:20]=[200,150,100,20]
        a[0,:]=[100,100,100,20]
        result=np.array(motion_image(Image.fromarray(a)))
        self.assertTrue((result[0,:,3]==0).all())
        np.testing.assert_array_equal(result[9:20,10:20],a[9:20,10:20])

    def test_psd_face_replaces_baked_hair_ink_without_changing_torso(self):
        psd=PSDImage.new('RGBA',(80,80))
        PixelLayer.frompil(Image.new('RGBA',(30,25),(240,210,190,255)),psd,name='face',left=25,top=10)
        PixelLayer.frompil(Image.new('RGBA',(30,35),'blue'),psd,name='topwear',left=25,top=40)
        plate=np.array(psd.composite(force=True).convert('RGBA'))
        plate[15:19,32:38,:3]=0  # Ink that belongs to the original bangs.
        leading,_,meta,_=split_motion_layers(plate,list(psd.descendants()))
        core=np.array(next(im for name,_,im in leading if meta[name]['deformGroup']=='core'))
        self.assertEqual(core[16,34,3],0)
        face=np.array(next(im for name,_,im in leading if meta[name].get('faceBase')))
        np.testing.assert_array_equal(face[16,34],[240,210,190,255])
        self.assertEqual(face[50,34,3],0)
        np.testing.assert_array_equal(core[40:75,:,3],plate[40:75,:,3])
        np.testing.assert_array_equal(core[40:75,25:55],plate[40:75,25:55])
        legacy,_,meta,_=split_motion_layers(plate,list(psd.descendants()),prefer_psd=False)
        old=np.array(next(im for name,_,im in legacy if meta[name]['deformGroup']=='core'))
        np.testing.assert_array_equal(old[16,34,:3],[0,0,0])

    def test_human_ears_remain_separate_without_covering_face(self):
        psd=PSDImage.new('RGBA',(80,80))
        PixelLayer.frompil(Image.new('RGBA',(80,80),'blue'),psd,name='back hair')
        PixelLayer.frompil(Image.new('RGBA',(20,20),'red'),psd,name='ears-r',left=10,top=30)
        PixelLayer.frompil(Image.new('RGBA',(40,40),'yellow'),psd,name='face',left=20,top=20)
        source=psd.composite(force=True).convert('RGBA')
        leading,trailing,meta,_=split_motion_layers(np.array(source),list(psd.descendants()),prefer_psd=False)
        ear=next(v for v in leading if v[1]=='ear-r')
        self.assertEqual(ear[2].getpixel((25,35))[3],0)
        self.assertFalse(meta[ear[0]]['earMotion'])
        hidden=Image.new('RGBA',(80,80))
        for name,role,im in leading+trailing:
            if role!='ear-r':hidden.alpha_composite(im)
        self.assertEqual(hidden.getpixel((15,35)),(0,0,255,255))
        hidden.alpha_composite(ear[2])
        np.testing.assert_array_equal(np.array(hidden),np.array(source))

    def test_visible_pixels_preserved_and_psd_only_used_under_cutouts(self):
        psd=PSDImage.new('RGBA',(80,80))
        PixelLayer.frompil(Image.new('RGBA',(80,80),'blue'),psd,name='back hair')
        PixelLayer.frompil(Image.new('RGBA',(40,60),'red'),psd,name='topwear',left=20,top=20)
        PixelLayer.frompil(Image.new('RGBA',(15,50),'yellow'),psd,name='handwear-r',left=15,top=30)
        PixelLayer.frompil(Image.new('RGBA',(40,20),'green'),psd,name='front hair',left=20,top=0)
        source=Image.new('RGBA',(80,80),(210,180,130,255));ImageDraw.Draw(source).rectangle((35,35,50,60),fill=(30,50,60,255))
        leading,trailing,meta,arms=split_motion_layers(np.array(source),list(psd.descendants()),prefer_psd=False)
        merged=Image.new('RGBA',(80,80))
        for _,_,im in leading+trailing:merged.alpha_composite(im)
        np.testing.assert_array_equal(np.array(merged),np.array(source))
        self.assertEqual(set(v['deformGroup'] for v in meta.values()),{'back','core','front','arm-r'})
        self.assertEqual(arms['arm-r']['y'],30)
        core=next(im for name,_,im in leading if meta[name]['deformGroup']=='core')
        self.assertEqual(core.getpixel((25,40)),(255,0,0,255)) # Only uncovered when arm moves.
    def test_missing_arm_is_not_invented(self):
        psd=PSDImage.new('RGBA',(20,20));PixelLayer.frompil(Image.new('RGBA',(20,20),'red'),psd,name='topwear')
        _,_,_,arms=split_motion_layers(np.array(Image.new('RGBA',(20,20),'white')),list(psd.descendants()))
        self.assertEqual(arms,{})

    def test_motion_defaults_keep_psd_color_and_concealed_pixels_with_original_alternative(self):
        psd=PSDImage.new('RGBA',(80,80))
        PixelLayer.frompil(Image.new('RGBA',(80,80),'blue'),psd,name='back hair')
        PixelLayer.frompil(Image.new('RGBA',(30,50),'yellow'),psd,name='handwear-r',left=10,top=30)
        PixelLayer.frompil(Image.new('RGBA',(40,60),'red'),psd,name='topwear',left=25,top=20)
        source=np.array(Image.new('RGBA',(80,80),'white'));source[75:,:,3]=0
        choices={}
        leading,_,meta,_=split_motion_layers(source,list(psd.descendants()),source_options=choices)
        name,_,arm=next(v for v in leading if meta[v[0]]['deformGroup']=='arm-r')
        self.assertEqual(meta[name]['artworkSource'],'psd')
        self.assertEqual(arm.getpixel((35,40)),(255,255,0,255)) # Hidden by the torso in the original.
        self.assertEqual(arm.getpixel((15,78))[3],255) # Not clipped to flattened image alpha.
        self.assertEqual(choices[name]['original'].getpixel((35,40))[3],0)
        self.assertEqual(choices[name]['original'].getpixel((15,40)),(255,255,255,255))
        self.assertLess([meta[v[0]]['deformGroup'] for v in leading].index('arm-r'),[meta[v[0]]['deformGroup'] for v in leading].index('core'))

    def test_sleeves_above_clothing_in_psd_stay_above_clothing(self):
        psd=PSDImage.new('RGBA',(80,80))
        PixelLayer.frompil(Image.new('RGBA',(80,80),'blue'),psd,name='topwear')
        PixelLayer.frompil(Image.new('RGBA',(30,50),'yellow'),psd,name='handwear-r',left=10,top=30)
        leading,trailing,meta,_=split_motion_layers(np.array(psd.composite(force=True)),list(psd.descendants()))
        merged=Image.new('RGBA',(80,80))
        for _,_,im in leading+trailing:merged.alpha_composite(im)
        self.assertEqual(merged.getpixel((20,40)),(255,255,0,255))

    def test_headwear_has_its_own_full_layer_and_is_not_baked_into_body(self):
        psd=PSDImage.new('RGBA',(80,80))
        PixelLayer.frompil(Image.new('RGBA',(80,80),'blue'),psd,name='face')
        PixelLayer.frompil(Image.new('RGBA',(30,20),'red'),psd,name='headwear',left=10,top=10)
        PixelLayer.frompil(Image.new('RGBA',(20,35),'green'),psd,name='front hair',left=25,top=5)
        source=psd.composite(force=True).convert('RGBA')
        leading,trailing,meta,_=split_motion_layers(np.array(source),list(psd.descendants()))
        hat=next(v for v in leading if meta[v[0]].get('independentAccessory'))
        self.assertEqual(hat[2].getpixel((30,15)),(255,0,0,255)) # Hidden art is available when raised.
        body=Image.new('RGBA',(80,80))
        for name,_,im in leading+trailing:
            if not meta[name].get('independentAccessory'):body.alpha_composite(im)
        self.assertEqual(body.getpixel((15,15)),(0,0,255,255)) # Hiding the hat leaves no baked copy.
        body.alpha_composite(hat[2]);self.assertEqual(body.getpixel((30,15)),(255,0,0,255))
        merged=Image.new('RGBA',(80,80))
        for _,_,im in leading+trailing:merged.alpha_composite(im)
        np.testing.assert_array_equal(np.array(merged),np.array(source))
