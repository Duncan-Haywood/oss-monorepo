"""tools/optical_black_floor.py's masked-margin read (2026-11-22, eval/optical-black-floor-2026-11-22.md)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))


@unittest.skipIf(np is None, "numpy not installed")
class MarginSigma(unittest.TestCase):
    def sensor(self, sigma=3.0, H=400, W=260, top=0, left=0, h=400, w=220, seed=0):
        rng = np.random.default_rng(seed)
        raw = 512 + rng.normal(0, sigma, (H, W))
        raw[top : top + h, left : left + w] += 4000 * rng.random((h, w))  # a busy picture: must not leak in
        colors = np.tile(np.array([[0, 1], [3, 2]]), (H // 2, W // 2))
        return raw.round().astype(np.uint16), colors

    def test_reads_the_right_margin_sigma_and_ignores_the_picture(self):
        from optical_black_floor import margin_sigma

        raw, colors = self.sensor(sigma=3.0)
        out = margin_sigma(raw, colors, 0, 0, 400, 220)
        self.assertEqual(sorted(out), [0, 1, 2, 3])
        for sig, n in out.values():
            self.assertAlmostEqual(sig, 3.0, delta=0.25)
            self.assertGreater(n, 2000)

    def test_padding_columns_of_one_value_are_dropped(self):
        from optical_black_floor import margin_sigma

        raw, colors = self.sensor(sigma=3.0)
        raw[:, 250:] = 1  # ten columns of padding, as on a D800E
        out = margin_sigma(raw, colors, 0, 0, 400, 220)
        for sig, _ in out.values():
            self.assertAlmostEqual(sig, 3.0, delta=0.3)

    def test_row_banding_is_not_read_as_noise(self):
        from optical_black_floor import margin_sigma

        raw, colors = self.sensor(sigma=2.0, left=40, w=220)
        raw = raw.astype(np.int32)
        raw[:, :40] += (np.arange(400) % 7 * 20)[:, None]  # strong per-row offsets in the masked columns
        out = margin_sigma(raw.astype(np.uint16), colors, 0, 40, 400, 220)
        for sig, _ in out.values():
            self.assertAlmostEqual(sig, 2.0, delta=0.25)

    def test_trimmed_columns_away_from_black_are_dropped(self):
        from optical_black_floor import margin_sigma

        raw, colors = self.sensor(sigma=3.0)
        raw = raw.astype(np.int32)
        raw[:, 250:] += 900 + np.arange(400)[:, None] * 2  # a lit ramp LibRaw trims, not masked sensels
        raw = raw.astype(np.uint16)
        self.assertGreater(max(v[0] for v in margin_sigma(raw, colors, 0, 0, 400, 220).values()), 20)
        out = margin_sigma(raw, colors, 0, 0, 400, 220, black=512, tol=80)
        for sig, _ in out.values():
            self.assertAlmostEqual(sig, 3.0, delta=0.3)

    def test_dim_picture_columns_near_black_are_dropped_by_the_quiet_test(self):
        """An Olympus crop's border: masked columns at 3 DN next to dim picture columns 20 DN above black."""
        from optical_black_floor import margin_sigma

        raw, colors = self.sensor(sigma=3.0, W=300)
        rng = np.random.default_rng(5)
        raw = raw.astype(np.float64)
        raw[:, 220:250] = 530 + rng.normal(0, 18.0, (400, 30))  # dim, noisy picture lines inside the black tolerance
        raw = raw.round().astype(np.uint16)
        loose = margin_sigma(raw, colors, 0, 0, 400, 220, black=512, tol=40)
        self.assertGreater(max(v[0] for v in loose.values()), 8)
        out = margin_sigma(raw, colors, 0, 0, 400, 220, black=512, tol=40, quiet=1.5)
        for sig, _ in out.values():
            self.assertAlmostEqual(sig, 3.0, delta=0.3)

    def test_no_margin_gives_none(self):
        from optical_black_floor import margin_sigma

        raw, colors = self.sensor(w=260)
        self.assertIsNone(margin_sigma(raw, colors, 0, 0, 400, 260))


@unittest.skipIf(np is None, "numpy not installed")
class ShootflowReader(unittest.TestCase):
    """``--reader shootflow``: the full sensor and ActiveArea from shootflow's own parser (a DNG here)."""

    def test_masked_columns_outside_the_active_area_are_read(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from test_raw_develop import make_dng

        from optical_black_floor import _shootflow_sensor, margin_sigma

        H, W, left = 400, 160, 40  # 40 masked columns at the left, picture to the right
        rng = np.random.default_rng(1)
        sensor = 256 + rng.normal(0, 4.0, (H, W))
        sensor[:, left:] += 3000 * rng.random((H, W - left))
        sensor = np.clip(sensor.round(), 0, 4095).astype(int)
        blob = make_dng(sensor.flatten().tolist(), W, H, cfa=(0, 1, 1, 2), black=256, white=4095,
                        active=(0, left, H, W))
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".dng") as f:
            f.write(blob)
            f.flush()
            raw, colors, black, white, area, crop, pat, source, lin = _shootflow_sensor(f.name)
        self.assertEqual((area, crop), ((0, left, H, W - left), None))
        self.assertEqual((black, white, pat, source, lin), (256.0, 4095.0, (0, 1, 1, 2), "dng", False))
        # the CFA phase starts at the active area's corner; the second green sits on the blue row
        self.assertEqual(colors[0, left], 0)
        self.assertEqual(colors[1, left + 1], 2)
        self.assertEqual(colors[1, left], 3)
        out = margin_sigma(raw, colors, *area, black=black, tol=0.005 * (white - black))
        self.assertEqual(sorted(out), [0, 1, 2, 3])
        for sig, _ in out.values():
            self.assertAlmostEqual(sig, 4.0, delta=0.4)

    def test_masked_rows_outside_the_default_crop_are_read_and_the_crop_phase_kept(self):
        """ORF, RW2, ARW, SRW and PEF readers keep the whole sensor as ActiveArea and the picture in DefaultCrop."""

        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from test_raw_develop import make_dng

        from optical_black_floor import _shootflow_sensor, margin_sigma, row_for_shootflow

        H, W, top = 160, 400, 31  # 31 masked rows at the top; the crop starts on an odd row
        rng = np.random.default_rng(2)
        sensor = 256 + rng.normal(0, 3.0, (H, W))
        sensor[top:, :] += 2000 * rng.random((H - top, W))
        sensor = np.clip(sensor.round(), 0, 4095).astype(int)
        blob = make_dng(sensor.flatten().tolist(), W, H, cfa=(0, 1, 1, 2), black=256, white=4095,
                        crop=(0, top, W, H - top))
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".dng") as f:
            f.write(blob)
            f.flush()
            raw, colors, black, white, area, crop, pat, source, lin = _shootflow_sensor(f.name)
            row = row_for_shootflow(f.name)
        self.assertEqual((area, crop), ((0, 0, H, W), (top, 0, H - top, W)))
        out = margin_sigma(raw, colors, *crop, black=black, tol=0.005 * (white - black))
        for sig, _ in out.values():
            self.assertAlmostEqual(sig, 3.0, delta=0.3)
        self.assertEqual(row["picture"], "crop")
        self.assertAlmostEqual(row["sigma_ob_dn"], 3.0, delta=0.3)
        self.assertIsNotNone(row["read_active"])


if __name__ == "__main__":
    unittest.main()
