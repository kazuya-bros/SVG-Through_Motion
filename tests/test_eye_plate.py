import unittest
import numpy as np
from studio.eye_plate import blend_eye_skin


class EyePlateTest(unittest.TestCase):
    def test_removes_dark_fill_matches_surrounding_skin_and_preserves_other_pixels(self):
        base=np.full((100,100,4),[232,214,201,255],dtype=np.uint8)
        face=np.full_like(base,[249,231,218,255])
        mask=np.zeros((100,100),bool);mask[40:60,35:65]=True
        base[mask,:3]=[170,170,168]
        base[0,:,3]=80
        before=base.copy()
        fixed,area=blend_eye_skin(base,face,mask,radius=8)
        np.testing.assert_array_equal(fixed[50,50],[232,214,201,255])
        np.testing.assert_array_equal(fixed[~area],before[~area])
        np.testing.assert_array_equal(fixed[:,:,3],before[:,:,3])
        np.testing.assert_array_equal(base,before)
        self.assertLessEqual(np.abs(fixed[32:68,30:70,:3].astype(int)-[232,214,201]).max(),1)

    def test_no_donor_or_no_clean_reference_leaves_plate_unchanged(self):
        base=np.full((80,80,4),[220,210,200,255],dtype=np.uint8)
        face=base.copy();face[:,:,3]=0
        mask=np.zeros((80,80),bool);mask[30:50,30:50]=True
        fixed,area=blend_eye_skin(base,face,mask)
        np.testing.assert_array_equal(fixed,base);self.assertFalse(area.any())
        fixed,area=blend_eye_skin(base,base,np.ones((80,80),bool))
        np.testing.assert_array_equal(fixed,base);self.assertFalse(area.any())

    def test_protected_foreground_is_never_changed(self):
        base=np.full((100,100,4),[232,214,201,255],dtype=np.uint8)
        face=base.copy();mask=np.zeros((100,100),bool);mask[40:60,35:65]=True
        base[mask,:3]=[170,170,168]
        protected=np.zeros((100,100),bool);protected[:,52:]=True
        fixed,area=blend_eye_skin(base,face,mask,protected,radius=6)
        np.testing.assert_array_equal(fixed[protected],base[protected]);self.assertFalse(area[protected].any())
