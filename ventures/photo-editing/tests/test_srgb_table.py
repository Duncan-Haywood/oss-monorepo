"""The sRGB encode reads its table with linear interpolation (eval/srgb-table-interp-2026-11-17.md).

The old 4,096-entry nearest-entry table capped a 16-bit output at 4,096 levels per channel and was up
to 104 codes off the exact curve; these pin the interpolated read to within one code of the exact
curve and check that it reaches far more levels.
"""

from __future__ import annotations

import unittest

from shootflow import raw_develop as rd


def exact_code(v: float) -> int:
    return int(rd._srgb_curve(v) * 65535 + 0.5)


class SrgbTableTest(unittest.TestCase):
    def test_table_ends(self):
        t = rd.srgb_table()
        self.assertEqual(len(t), rd.SRGB_TABLE_SIZE)
        self.assertEqual(t[0], 0.0)
        self.assertAlmostEqual(t[-1], 65535.0, places=6)

    def test_numpy_encode_within_one_code(self):
        try:
            import numpy as np
            from shootflow import raw_develop_np as rnp
        except ImportError:
            self.skipTest("numpy not installed")
        v = np.linspace(0.0, 1.0, 400_001)
        plane = v.reshape(1, -1)
        ident = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        out = rnp._encode(plane, plane, plane, 1.0, ident, rd.srgb_table(), rd.SRGB_TABLE_SIZE, None)[0, :, 0]
        ref = np.array([exact_code(float(x)) for x in v])
        diff = np.abs(out.astype(np.int64) - ref)
        self.assertLessEqual(int(diff.max()), 1)
        self.assertLess(float((diff > 0).mean()), 0.001)
        # Far more than the old table's 4,096 levels.
        self.assertGreater(len(np.unique(out)), 60_000)
        self.assertEqual(int(out[0]), 0)
        self.assertEqual(int(out[-1]), 65535)

    def test_shadow_steps_are_fine(self):
        # Just above black the curve is steep (12.92x): the old table stepped 207 codes at a time here.
        try:
            import numpy as np
            from shootflow import raw_develop_np as rnp
        except ImportError:
            self.skipTest("numpy not installed")
        v = np.linspace(0.0, 0.001, 10_001).reshape(1, -1)
        ident = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        out = rnp._encode(v, v, v, 1.0, ident, rd.srgb_table(), rd.SRGB_TABLE_SIZE, None)[0, :, 0]
        self.assertLessEqual(int(np.diff(out.astype(np.int64)).max()), 2)


if __name__ == "__main__":
    unittest.main()
