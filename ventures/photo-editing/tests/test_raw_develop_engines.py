"""The numpy engine gives the pure-Python engine's bytes, for every DNG shape.

``shootflow.raw_develop_np`` repeats ``raw_develop``'s arithmetic in the same
order, so the two must agree sample for sample, not merely within a tolerance.
Each case develops a noisy synthetic DNG (noise so the clamps at black and at
the clip level both fire) with ``engine="python"`` and ``engine="numpy"`` and
compares the output arrays, sizes and clip fraction. Skipped when numpy is not
installed (ShootFlow itself stays stdlib only).
"""

from __future__ import annotations

import random
import unittest

from shootflow import raw_develop as rd
from test_raw_develop import make_dng, patch_sensor

try:
    import numpy  # noqa: F401

    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False


def noisy(sensor, white, seed, spread=400):
    rng = random.Random(seed)
    return [max(0, min(white, v + rng.randint(-spread, spread))) for v in sensor]


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineEquivalenceTests(unittest.TestCase):
    def assertSameBytes(self, blob, **settings):
        raw = rd.parse_raw(blob)
        py = rd.develop(raw, rd.DevelopSettings(engine="python", **settings))
        npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", **settings))
        self.assertEqual(py[3].engine, "python")
        self.assertEqual(npy[3].engine, "numpy")
        self.assertEqual(py[:2], npy[:2])
        self.assertEqual(py[3].clipped_fraction, npy[3].clipped_fraction)
        self.assertEqual(py[3].notes, npy[3].notes)
        self.assertEqual(py[2].tobytes(), npy[2].tobytes())

    def test_every_bayer_phase_full_and_half(self):
        for cfa in ((0, 1, 1, 2), (2, 1, 1, 0), (1, 0, 2, 1), (1, 2, 0, 1)):
            for w, h in ((48, 12), (37, 11)):
                sensor = noisy(patch_sensor(w, h, cfa=cfa, gain=1.6), 4095, seed=w + sum(cfa))
                for half in (False, True):
                    with self.subTest(cfa=cfa, size=(w, h), half=half):
                        self.assertSameBytes(make_dng(sensor, w, h, cfa=cfa), half=half)

    def test_tiny_images(self):
        for w, h in ((2, 2), (3, 2), (2, 3)):
            with self.subTest(size=(w, h)):
                sensor = noisy(patch_sensor(w, h), 4095, seed=w * h)
                self.assertSameBytes(make_dng(sensor, w, h))
                self.assertSameBytes(make_dng(sensor, w, h), half=True)

    def test_per_position_black_and_row_column_deltas(self):
        w, h = 40, 10
        sensor = noisy(patch_sensor(w, h), 4095, seed=3)
        rng = random.Random(9)
        dh = tuple(rng.uniform(-6, 6) for _ in range(w))
        dv = tuple(rng.uniform(-6, 6) for _ in range(h))
        cases = {
            "repeat": [(50713, 3, (2, 2)), (50714, 4, (200, 256, 260, 300))],
            "repeat_1x2": [(50713, 3, (1, 2)), (50714, 4, (250, 262))],
            "delta_v": [(50716, 10, dv)],
            "delta_h": [(50715, 10, dh)],
            "both": [(50713, 3, (2, 2)), (50714, 4, (200, 256, 260, 300)), (50715, 10, dh), (50716, 10, dv)],
        }
        for name, tags in cases.items():
            black = None if any(t[0] == 50714 for t in tags) else 256
            for half in (False, True):
                with self.subTest(case=name, half=half):
                    self.assertSameBytes(make_dng(sensor, w, h, black=black, extra_raw_tags=tags), half=half)

    def test_linearization_table(self):
        w, h = 24, 6
        table = [min(4095, int(round((i / 255) ** 2 * 4095))) for i in range(256)]
        rng = random.Random(5)
        coded = [rng.randint(0, 300) for _ in range(w * h)]  # some past the table's end
        self.assertSameBytes(make_dng(coded, w, h, linearization=table))

    def test_active_area_crop_and_every_orientation(self):
        w, h = 52, 12
        sensor = noisy(patch_sensor(w, h), 4095, seed=11)
        for orientation in range(0, 10):
            for half in (False, True):
                with self.subTest(orientation=orientation, half=half):
                    blob = make_dng(
                        sensor, w, h, active=(2, 4, 10, 52), crop=(8, 2, 32, 4), orientation=orientation
                    )
                    self.assertSameBytes(blob, half=half)
        # a crop that does not fit is ignored with a note on both engines
        self.assertSameBytes(make_dng(sensor, w, h, crop=(40, 0, 30, 4)))

    def test_white_balance_exposure_and_clipping(self):
        w, h = 30, 8
        sensor = noisy(patch_sensor(w, h, gain=2.5), 4095, seed=2, spread=900)
        for settings in (
            dict(exposure_ev=1.5),
            dict(exposure_ev=-2.0, use_baseline_exposure=False),
            dict(white_balance=(2.1, 1.0, 1.4)),
        ):
            with self.subTest(**settings):
                self.assertSameBytes(make_dng(sensor, w, h, baseline_exposure=0.35), **settings)

    def test_linear_raw(self):
        w, h = 9, 4
        rng = random.Random(4)
        sensor = [rng.randint(0, 4095) for _ in range(w * h * 3)]
        blob = make_dng(sensor, w, h, photometric=rd.PHOTOMETRIC_LINEAR_RAW, spp=3)
        self.assertSameBytes(blob)
        self.assertSameBytes(make_dng(sensor, w, h, photometric=rd.PHOTOMETRIC_LINEAR_RAW, spp=3, orientation=8))


class EngineChoiceTests(unittest.TestCase):
    def test_unknown_engine_is_refused(self):
        blob = make_dng(patch_sensor(8, 4), 8, 4)
        with self.assertRaises(rd.DevelopError):
            rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="gpu"))

    def test_one_pixel_wide_image_uses_python_even_on_auto(self):
        blob = make_dng(patch_sensor(1, 4), 1, 4)
        *_, report = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="auto"))
        self.assertEqual(report.engine, "python")
        with self.assertRaises(rd.DevelopError):
            rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="numpy"))

    def test_python_engine_reports_itself(self):
        blob = make_dng(patch_sensor(8, 4), 8, 4)
        *_, report = rd.develop(rd.parse_raw(blob), rd.DevelopSettings(engine="python"))
        self.assertEqual(report.engine, "python")


if __name__ == "__main__":
    unittest.main()
