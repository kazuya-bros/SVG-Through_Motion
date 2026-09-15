import unittest
import numpy as np
from studio.hair_cleanup import clean_hair_eye_overlap,hair_lash_layers


class HairCleanupTests(unittest.TestCase):
    def test_open_eye_overlay_restores_every_repaired_pixel_without_overlap(self):
        a=np.full((30,50,4),255,np.uint8);a[10:14,7:12,:3]=30;a[8:10,37:42,:3]=70
        mask=a[:,:,0]<100
        layers=hair_lash_layers(a,mask,{'r':(10,12),'l':(40,10)})
        coverage=np.zeros(mask.shape,int)
        for side,image in layers:
            pixels=np.array(image);region=pixels[:,:,3]>0;coverage+=region
            self.assertTrue(np.array_equal(pixels[region],a[region]))
        self.assertTrue(np.array_equal(coverage,mask.astype(int)))
    def test_only_dark_overlap_with_clean_hair_donor_changes(self):
        original=np.full((40,40,4),220,dtype=np.uint8);original[:,:,3]=255
        front=original.copy();lash=np.zeros((40,40),np.uint8)
        original[20,20,:3]=30;lash[20,20]=255
        original[20,23,:3]=30;front[20,23,:3]=30  # Real matching hair outline.
        original[2,2,:3]=30  # Away from the eye.
        original[21,20,:3]=30;front[21,20,3]=0  # Exposed face is not hair.
        result,mask=clean_hair_eye_overlap(original,front,lash)
        self.assertEqual(int(mask.sum()),1)
        self.assertTrue(np.array_equal(result[20,20,:3],front[20,20,:3]))
        self.assertTrue(np.array_equal(result[:,:,3],original[:,:,3]))
        self.assertTrue(np.array_equal(result[~mask],original[~mask]))
