import math
import unittest

from buildbot_shift import model as M


class T(unittest.TestCase):
    def test_vendor_two_hours_implies_210_watts(self):
        self.assertAlmostEqual(M.implied_power_w(), 210.6, places=1)

    def test_short_shift_is_all_work(self):
        self.assertAlmostEqual(M.worked_hours(1.0, 1), 1.0)

    def test_one_pack_alternates_run_and_charge(self):
        run = M.PACK_WH * 0.9 / M.implied_power_w()
        ch = M.PACK_WH * 0.9 / (M.CHARGER_W * 0.9)
        sw = 5 / 60
        # 1 swap-out, wait for own charge, then the rest of the shift
        shift = run + sw + ch + run * 0.5 + 1e-9
        got = M.worked_hours(shift, 1)
        self.assertAlmostEqual(got, run * 1.5, places=6)

    def test_instant_charging_leaves_only_swap_losses(self):
        got = M.worked_hours(8.0, 2, charger_w=1e9, swap_min=5)
        run = M.PACK_WH * 0.9 / M.implied_power_w()
        swaps = math.ceil(8.0 / run) - 1
        self.assertAlmostEqual(got, 8.0 - swaps * 5 / 60, delta=0.1)

    def test_more_packs_never_hurt_and_never_exceed_shift(self):
        prev = 0
        for k in (1, 2, 3, 4):
            w = M.worked_hours(8.0, k)
            self.assertGreaterEqual(w, prev - 1e-9)
            self.assertLessEqual(w, 8.0)
            prev = w

    def test_heavier_draw_works_fewer_hours(self):
        self.assertLess(M.worked_hours(8.0, 2, power_w=400), M.worked_hours(8.0, 2, power_w=200))

    def test_pack_rate(self):
        self.assertAlmostEqual(M.pack_rate(700, 500, 2.0), 0.70)


if __name__ == "__main__":
    unittest.main()
