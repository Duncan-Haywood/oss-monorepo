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

    def test_no_margin_gives_none(self):
        from optical_black_floor import margin_sigma

        raw, colors = self.sensor(w=260)
        self.assertIsNone(margin_sigma(raw, colors, 0, 0, 400, 260))


if __name__ == "__main__":
    unittest.main()
