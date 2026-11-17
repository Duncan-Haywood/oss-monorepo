"""A 3-stop lift of a noise-free shadow gradient bands on the old encode, not on the new one.

The 16-bit master's sRGB encode used to be a 4,096-entry table read at the nearest entry; it is now
16,384 entries interpolated (eval/srgb-table-interp-2026-11-17.md). Pushing the master 3 stops in
an editor (tools/shadow_lift_check.py) spreads the old table's coarse shadow steps over the 8-bit
codes a screen shows. Results on real files: eval/shadow-lift-banding-2026-11-17.md.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

from shootflow import raw_develop as rd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))


class ShadowLiftTest(unittest.TestCase):
    def setUp(self):
        try:
            import numpy as np  # noqa: F401
        except ImportError:
            self.skipTest("numpy not installed")

    def test_gradient_keeps_every_code_on_new_encode(self):
        import numpy as np
        import shadow_lift_check as slc
        from shootflow import raw_develop_np as rnp

        # A smooth ramp through the deep shadows: linear 0 to 1/8, which a 3-stop lift takes to 0-1.
        v = np.linspace(0.0, 0.125, 200_001).reshape(1, -1)
        ident = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        new = rnp._encode(v, v, v, 1.0, ident, rd.srgb_table(), rd.SRGB_TABLE_SIZE, None)
        old_table = np.round(slc.linear_to_srgb(np.arange(4096) / 4095) * 65535).astype(np.uint16)
        old = np.repeat(old_table[np.floor(v * 4095 + 0.5).astype(np.int64)][..., None], 3, axis=2)
        exact = np.floor(slc.linear_to_srgb(np.minimum(v * 8, 1.0)) * 255 + 0.5)[0]

        new8, keep = slc.lift(new, 3)
        old8, _ = slc.lift(old, 3)
        self.assertGreater(float(keep.mean()), 0.99)
        lost = lambda a: len(np.setdiff1d(np.unique(exact), np.unique(a[0, :, 0])))
        self.assertEqual(lost(new8), 0)
        self.assertGreater(lost(old8), 10)
        self.assertLessEqual(int(np.abs(new8[0, :, 0].astype(int) - exact).max()), 1)

    def test_gaps(self):
        import numpy as np
        import shadow_lift_check as slc

        self.assertEqual(slc.gaps(np.array([3, 4, 5], dtype=np.uint8)), 0)
        self.assertEqual(slc.gaps(np.array([3, 6, 9], dtype=np.uint8)), 4)
        self.assertEqual(slc.gaps(np.array([3, 6, 90], dtype=np.uint8), hi=63), 2)


if __name__ == "__main__":
    unittest.main()
