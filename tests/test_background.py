import unittest
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from studio.background import foreground_support, white_background_mask, hair_white_gap_mask, source_background_masks


class BackgroundTests(unittest.TestCase):
    def test_shared_cleanup_includes_enclosed_hair_gaps_and_preserves_white_parts(self):
        original=np.full((100,100,4),255,dtype=np.uint8)
        original[0,0,3]=254
        original[20:80,20:80,:3]=100
        original[30:45,30:45,:3]=255  # White source background enclosed by hair.
        original[50:60,50:60,:3]=255  # Actual white foreground hair.
        psd=PSDImage.new('RGBA',(100,100))
        PixelLayer.frompil(Image.new('RGBA',(60,60),(100,100,100,255)),psd,name='back hair',left=20,top=20)
        PixelLayer.frompil(Image.new('RGBA',(10,10),'white'),psd,name='front hair',left=50,top=50)
        PixelLayer.frompil(Image.new('RGBA',(10,20),'white'),psd,name='handwear-l',left=50,top=80)
        outer,gaps=source_background_masks(original,list(psd.descendants()))
        self.assertTrue(outer[0,0])
        self.assertFalse(outer[30:45,30:45].any())
        self.assertTrue(gaps[30:45,30:45].all())
        combined=outer|gaps
        self.assertFalse(combined[50:60,50:60].any())
        self.assertFalse(combined[80:100,50:60].any())
        self.assertFalse(combined[20:30,20:80].any())

    def test_sparse_one_level_alpha_rounding_does_not_skip_background_removal(self):
        original=np.full((100,100,4),255,dtype=np.uint8)
        original[0,0,3]=254
        original[0,0,:3]=[221,254,218]
        support=np.zeros((100,100),bool);support[30:80,30:70]=True
        mask=white_background_mask(original,support)
        self.assertTrue(mask[0,0]);self.assertFalse(mask[support].any())
        self.assertTrue(mask[~support].all())
        original[:,:,3]=254
        self.assertFalse(white_background_mask(original,support).any())

    def test_hair_gap_removal_protects_white_artwork_and_existing_alpha(self):
        original=np.full((30,30,4),255,dtype=np.uint8)
        psd=PSDImage.new('RGBA',(30,30))
        PixelLayer.frompil(Image.new('RGBA',(20,20),(120,115,110,255)),psd,name='back hair',left=5,top=5)
        PixelLayer.frompil(Image.new('RGBA',(4,5),'white'),psd,name='front hair',left=8,top=8)
        PixelLayer.frompil(Image.new('RGBA',(4,5),'white'),psd,name='handwear-l',left=17,top=8)
        layers=list(psd.descendants());mask=hair_white_gap_mask(original,layers)
        self.assertTrue(mask[20,10])
        self.assertFalse(mask[8:13,8:12].any())
        self.assertFalse(mask[8:13,17:21].any())
        original[0,0,3]=0
        self.assertFalse(hair_white_gap_mask(original,layers).any())

    def test_white_sleeve_touching_bottom_keeps_original_alpha(self):
        original = np.full((30, 30, 4), 255, dtype=np.uint8)
        psd = PSDImage.new('RGBA', (30, 30))
        PixelLayer.frompil(Image.new('RGBA', (10, 20), 'white'), psd, name='handwear-l', left=10, top=10)
        support = foreground_support(list(psd.descendants()), (30, 30))
        bg = white_background_mask(original, support)
        self.assertFalse(bg[10:, 10:20].any())
        self.assertTrue(bg[:, :10].all())
        self.assertTrue(bg[:, 20:].all())

    def test_background_and_hidden_layers_do_not_protect_background(self):
        psd = PSDImage.new('RGBA', (20, 20))
        PixelLayer.frompil(Image.new('RGBA', (20, 20), 'white'), psd, name='plain opaque')
        PixelLayer.frompil(Image.new('RGBA', (10, 20), 'white'), psd, name='background')
        hidden=PixelLayer.frompil(Image.new('RGBA', (10, 20), 'white'), psd, name='handwear-r');hidden.visible=False
        self.assertFalse(foreground_support(list(psd.descendants()), (20, 20)).any())

    def test_transparent_input_retains_white_and_partial_alpha(self):
        original=np.full((20, 20, 4), 255, dtype=np.uint8)
        original[0, 0, 3]=0;original[10, 10, 3]=128
        self.assertFalse(white_background_mask(original,np.zeros((20,20),bool)).any())

    def test_psd_faint_residue_does_not_protect_background(self):
        psd=PSDImage.new('RGBA',(20,20))
        PixelLayer.frompil(Image.new('RGBA',(20,20),(255,255,255,1)),psd,name='face')
        self.assertFalse(foreground_support(list(psd.descendants()),(20,20)).any())
