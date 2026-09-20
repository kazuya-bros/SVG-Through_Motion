import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from studio.rife_sequence import sequence_times, balanced_times, frame_bounds, visual_sample, compact_mouth_alpha, mouth_profile
from studio.rife_keyframes import RifeRunner


class SequenceTests(unittest.TestCase):
    def test_mouth_compaction_preserves_generated_shape_color_and_coverage(self):
        rgba = np.zeros((64, 64, 4), dtype=np.uint8)
        # A bent, faint RIFE opening with two internal colors, not an endpoint.
        for x in range(12, 52):
            y = 18+int(((x-32)/12)**2)
            rgba[y:y+8, x] = [60, 30, 20, 64]
            rgba[y+8:y+24, x] = [220, 100, 90, 64]
        fixed = np.asarray(compact_mouth_alpha(Image.fromarray(rgba)))
        before = rgba[:, :, 3].astype(float)/255
        after = fixed[:, :, 3].astype(float)/255
        np.testing.assert_allclose(after.sum(axis=0), before.sum(axis=0), atol=.015)
        for pixels in (rgba, fixed):
            self.assertEqual(pixels[0, 0, 3], 0)
        for c in range(3):
            np.testing.assert_allclose((fixed[:, :, c]*after).sum(axis=0),
                                       (rgba[:, :, c]*before).sum(axis=0), atol=4)
        self.assertGreater(fixed[:, :, 3].max(), 250)
        profile = np.array(mouth_profile(Image.fromarray(fixed)))
        self.assertEqual(profile.shape, (17, 2))
        self.assertTrue(np.all(profile[:, 1] > profile[:, 0]))
        # Bent source curvature survives; this is not a linear open-SVG scale.
        self.assertGreater(profile[4, 0], profile[8, 0])

    def test_mouth_compaction_keeps_intentional_layer_opacity(self):
        image = Image.new('RGBA', (32, 32))
        ImageDraw.Draw(image).rectangle((5, 10, 25, 20), fill=(40, 170, 90, 128))
        fixed = compact_mouth_alpha(image, 128/255)
        np.testing.assert_array_equal(fixed, image)

    def test_actual_visual_change_balances_a_late_transition(self):
        times = np.linspace(0, 1, 65)
        samples = [np.full((2, 2, 4), t**8) for t in times]
        selected = balanced_times(times, samples)
        changes = np.diff(selected**8)
        self.assertLess(changes.max()/changes.min(), 1.05)
        self.assertEqual((selected[0], selected[-1]), (0, 1))
        with self.assertRaises(ValueError):
            balanced_times(times, [samples[0]]*len(times))
        image = Image.new('RGBA', (32, 32))
        ImageDraw.Draw(image).rectangle((8, 8, 24, 23), fill='red')
        self.assertEqual(frame_bounds(image), [.25, .75])
        self.assertEqual(visual_sample(image)[0, 0].sum(), 0)

    def test_timing_keeps_eight_monotone_keys_and_exact_endpoints(self):
        profiles = [np.array([[.2]*5, [.2+.6*gap]*5]) for gap in [1, .6, .06, .01, 0]]
        times = sequence_times(profiles, 'eye')
        self.assertEqual(len(times), 8)
        self.assertEqual((times[0], times[-1]), (0, 1))
        self.assertTrue(np.all(np.diff(times) > 0))
        self.assertLess(times[4], 4/7)  # compensate early closing
        mouth = sequence_times(profiles[::-1], 'mouth')
        self.assertGreater(mouth[4], 4/7)  # compensate late opening
        self.assertTrue(np.all(np.diff(mouth) > 0))
        linear = [np.array([[.2]*5, [.2+.6*gap]*5]) for gap in [0, .25, .5, .75, 1]]
        np.testing.assert_allclose(sequence_times(linear, 'mouth'), np.linspace(0, 1, 8))
        with self.assertRaises(ValueError):
            sequence_times([profiles[0]]*5, 'eye')

    @unittest.skipUnless(Path('.desktop-build/models/rife.onnx').exists(), 'audited RIFE model is optional in source checkout')
    def test_alpha_uses_same_flow_without_changing_rgb_or_keying_green_art(self):
        model = Path('.desktop-build/models/rife.onnx')
        plain, alpha = RifeRunner(model), RifeRunner(model, with_alpha=True)
        start, end = Image.new('RGBA', (64, 64)), Image.new('RGBA', (64, 64))
        ImageDraw.Draw(start).ellipse((12, 12, 50, 50), fill=(0, 255, 0, 255))
        ImageDraw.Draw(end).ellipse((12, 25, 50, 36), fill=(0, 255, 0, 255))
        for at, expected in [(0, start), (1, end)]:
            np.testing.assert_array_equal(alpha.interpolate_rgba(start, end, at), expected)
        result = np.asarray(alpha.interpolate_rgba(start, end, .5))
        np.testing.assert_array_equal(result[30, 30], [0, 255, 0, 255])
        self.assertEqual(result[0, 0, 3], 0)
        rgb = start.convert('RGB'), end.convert('RGB')
        np.testing.assert_array_equal(plain.interpolate(*rgb, .5)[0], alpha.interpolate(*rgb, .5)[0])
        with self.assertRaises(ValueError):
            alpha.interpolate_rgba(start, end, float('nan'))
