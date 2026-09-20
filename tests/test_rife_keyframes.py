import unittest
import numpy as np
from PIL import Image
from studio.rife_keyframes import render_demo,fit_demo_contour,RifeRunner,render_head_demo

class RifeContourTests(unittest.TestCase):
    def test_fit_recovers_known_two_cubic_eye_contour(self):
        target=[42,104,71.64,96,168.36,96,198,104,168.36,150,71.64,150,42,104]
        image=render_demo(target,'eye');guess=target.copy();guess[3]=guess[5]=65;guess[9]=guess[11]=170
        result,metrics=fit_demo_contour(image,guess,4)
        np.testing.assert_allclose(np.array(result)[[3,5,9,11]],np.array(target)[[3,5,9,11]],atol=3)
        self.assertEqual(result[0],target[0]);self.assertEqual(result[7],target[7]);self.assertLess(metrics['boundaryMeanErrorPx'],2)

    def test_blank_reference_is_rejected_instead_of_inventing_a_contour(self):
        with self.assertRaisesRegex(ValueError,'No contour'):
            fit_demo_contour(Image.new('RGB',(240,220),(247,231,221)),[0]*14,4)

    def test_runner_rejects_misaligned_or_transparent_inputs_and_keeps_endpoints(self):
        runner=object.__new__(RifeRunner);a=Image.new('RGB',(32,32),'red');b=Image.new('RGB',(32,32),'blue')
        for at,expected in [(0,a),(1,b)]:
            result,elapsed=runner.interpolate(a,b,at);self.assertEqual(result.tobytes(),expected.tobytes());self.assertIsNot(result,expected);self.assertEqual(elapsed,0)
        for other,at in [(Image.new('RGB',(20,20)),.5),(b,float('nan')),(b,-.1),(b,1.1)]:
            with self.assertRaises(ValueError):runner.interpolate(a,other,at)
        with self.assertRaisesRegex(ValueError,'background'):runner.interpolate(a.convert('RGBA'),b.convert('RGBA'),.5)

    def test_head_inputs_are_distinct_authored_poses(self):
        a,b=render_head_demo(0),render_head_demo(1)
        self.assertEqual(a.size,b.size);self.assertEqual(a.mode,'RGB');self.assertNotEqual(a.tobytes(),b.tobytes())
        with self.assertRaises(ValueError):render_head_demo(.5)
