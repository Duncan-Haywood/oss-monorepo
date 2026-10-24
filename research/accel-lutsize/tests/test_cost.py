import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_lutsize import cost as C  # noqa: E402
from accel_lutsize.cost import L  # noqa: E402


class T(unittest.TestCase):
    def test_8kb_point_is_horowitz(self):
        self.assertAlmostEqual(C.e_bit(8 * 1024 * 8, 0.5), 10.0 / 64)

    def test_alpha_zero_flat(self):
        self.assertAlmostEqual(C.e_bit(256, 0.0), C.e_bit(10 ** 6, 0.0))

    def test_size_law_slope_matches_horowitz_8_to_32kb(self):
        # Fig. 1.1.9: 10 pJ at 8 KB, 20 pJ at 32 KB per 64 bit, log-log slope 0.5
        r = C.e_bit(32 * 1024 * 8, 0.5) / C.e_bit(8 * 1024 * 8, 0.5)
        self.assertAlmostEqual(r, 2.0)

    def test_floor_never_below_8kb(self):
        self.assertAlmostEqual(C.e_bit(64, 0.5, floor=True), C.E_8KB_PJ_PER_BIT)

    def test_flat_alpha_reproduces_accel_lut_mac(self):
        # alpha = 0 gives 0.15625 pJ/bit; accel-lut uses 0.16, so compare after rescaling the read term
        a = C.mac_pj(64, 32, 2048, 8, 4, False, 0.0)
        old = L.energy_mac_pj(64, 32, 2048, 8, 4, False, True)
        read_new = 2048 * 8 * C.E_8KB_PJ_PER_BIT + 64 * 4 * C.E_8KB_PJ_PER_BIT
        read_old = 2048 * 8 * 0.16 + 64 * 4 * 0.16
        self.assertAlmostEqual(a - read_new, old - read_old, places=9)

    def test_flat_alpha_reproduces_accel_lut_table(self):
        e = C.E_8KB_PJ_PER_BIT
        new = C.lut_pj(64, 32, 2048, 16, 4, False, 0.0)
        old = L.energy_lut_pj(64, 32, 2048, 16, 4, False, e)
        # old charges array reads at 0.16 and the table at e_tbl; here all are e
        diff = (64 * 4 + 2048 * 4) * (0.16 - e)
        self.assertAlmostEqual(old - diff, new, places=9)

    def test_smaller_tables_are_cheaper(self):
        self.assertLess(C.lut_pj(64, 32, 2048, 4, 4, False, 0.5), C.lut_pj(64, 32, 2048, 4, 4, False, 0.0))


if __name__ == "__main__":
    unittest.main()
