"""tools/frame_noise_crop_area.py: the frame noise read on the ActiveArea vs the camera's crop (2026-11-22)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
sys.path.insert(0, str(Path(__file__).resolve().parent))


@unittest.skipIf(np is None, "numpy not installed")
class CropArea(unittest.TestCase):
    def test_a_zero_filled_border_is_seen_on_the_active_area_only(self):
        from test_raw_develop import make_dng

        from frame_noise_crop_area import row_for

        H, W, b = 192, 192, 16
        rng = np.random.default_rng(3)
        level = np.linspace(300, 3000, W)[None, :].repeat(H, 0)
        sensor = 256 + level + rng.normal(0, 1, (H, W)) * np.sqrt(4.0 + 0.5 * level)
        sensor[:, :b] = 0  # zero fill outside the crop, as an SRW's border
        sensor = np.clip(sensor.round(), 0, 4095).astype(int)
        blob = make_dng(sensor.flatten().tolist(), W, H, cfa=(0, 1, 1, 2), black=256, white=4095,
                        crop=(b, 0, W - b, H))
        with tempfile.NamedTemporaryFile(suffix=".dng") as f:
            f.write(blob)
            f.flush()
            row = row_for(f.name)
        self.assertEqual(row["active"], (0, 0, H, W))
        self.assertEqual(row["crop"], (0, b, H, W - b))
        for k in ("shot_active", "shot_crop", "shot_inset", "ratio_0.1", "control_0.1"):
            self.assertIn(k, row)
        self.assertGreater(row["shot_crop"], 0)
        # the inset control is a smaller piece of the same crop
        t, l, h, w = row["inset"]
        self.assertTrue(t >= 0 and l >= b and h < H and w < W - b)


if __name__ == "__main__":
    unittest.main()
