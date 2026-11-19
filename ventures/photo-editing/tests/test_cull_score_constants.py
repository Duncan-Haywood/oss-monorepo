"""Pin the two cull scoring constants that survived seeded mutation in quality rounds 1 to 4
(portfolio/quality/audits/2026-11-19-photo-editing-r4.json): the exposure grey target (luma 120)
and the sharpness half-point (60). Expected values are worked by hand from the documented formulas,
not read back from the module."""

import unittest

from shootflow.frame_analysis import (
    FRAME_HEIGHT,
    FRAME_WIDTH,
    _laplacian_variance,
    metrics_from_frames,
    noise_sigma_from_frame,
)

N = FRAME_WIDTH * FRAME_HEIGHT


def flat(level: int) -> bytes:
    return bytes([level]) * N


class ExposureTargetTest(unittest.TestCase):
    def test_flat_grey_at_the_target_scores_full_exposure(self):
        self.assertAlmostEqual(metrics_from_frames([flat(120)]).exposure, 1.0, places=6)

    def test_flat_grey_half_way_to_black_scores_one_half(self):
        # 1 - |60 - 120| / 120 = 0.5; no pixel is in the clipped bands (<8 or >=248).
        self.assertAlmostEqual(metrics_from_frames([flat(60)]).exposure, 0.5, places=6)

    def test_flat_grey_above_target(self):
        # 1 - |180 - 120| / 120 = 0.5
        self.assertAlmostEqual(metrics_from_frames([flat(180)]).exposure, 0.5, places=6)


class SharpnessHalfPointTest(unittest.TestCase):
    def test_sharpness_is_variance_over_variance_plus_sixty(self):
        # Vertical stripes 4 px wide: strong edges, a definite Laplacian variance.
        row = bytes((200 if (x // 4) % 2 else 60) for x in range(FRAME_WIDTH))
        frame = row * FRAME_HEIGHT
        sigma = noise_sigma_from_frame(frame)
        v = max(0.0, _laplacian_variance(frame, FRAME_WIDTH, FRAME_HEIGHT) - 20.0 * sigma * sigma)
        self.assertGreater(v, 0.0)
        self.assertAlmostEqual(metrics_from_frames([frame]).sharpness, round(v / (v + 60.0), 6), places=6)

    def test_flat_frame_has_zero_sharpness(self):
        self.assertEqual(metrics_from_frames([flat(120)]).sharpness, 0.0)


if __name__ == "__main__":
    unittest.main()
