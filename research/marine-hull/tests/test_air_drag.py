import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

import figure_air_drag as fa  # noqa: E402
import run_air_drag as ad  # noqa: E402
import run_hotel_ranking as hr  # noqa: E402
import run_range_speed as rr  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_air_drag.txt")


class AirDragTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RESULTS) as f:
            cls.text = f.read()
        cls.curves = fa.parse_curves(cls.text)

    def test_air_term_is_half_rho_cda_u_squared(self):
        out = ad.with_air([10.0, 20.0], [100.0, None], 0.2)
        self.assertAlmostEqual(out[0], 100.0 + 0.5 * 1.225 * 0.2 * 100.0)
        self.assertIsNone(out[1])

    def test_zero_cda_reproduces_milestone_7v(self):
        mono0, rungs0 = ad.base_rungs()
        ratios = ad.central(0.0, mono0, rungs0)[0]
        self.assertAlmostEqual(hr.crossing(hr.HOTELS, ratios["hydrofoil"]), 659, delta=0.5)
        self.assertAlmostEqual(hr.crossing(hr.HOTELS, ratios["planing"]), 1068, delta=0.5)

    def test_foil_break_even_rises_with_cda(self):
        xs = [hr.crossing([r[0] for r in rows], [r[1] for r in rows]) for _, rows in sorted(self.curves.items())]
        self.assertEqual(len(xs), len(ad.CDAS))
        self.assertTrue(all(a < b for a, b in zip(xs, xs[1:])))
        self.assertTrue(659 <= xs[-1] <= 1500)

    def test_monohull_leads_to_200_w_at_every_cda(self):
        self.assertEqual(self.text.count("hotel <= 200 W (central): True"), len(ad.CDAS))
        self.assertEqual(self.text.count("at or below 200 W: 0"), len(ad.CDAS))

    def test_displacement_rungs_barely_move(self):
        mono0, rungs0 = ad.base_rungs()
        m0 = hr.peak_at(rr.DISP, mono0, 30.0)[0]
        m4 = hr.peak_at(rr.DISP, ad.with_air(rr.DISP, mono0, 0.4), 30.0)[0]
        self.assertLess(abs(m4 / m0 - 1), 0.02)


if __name__ == "__main__":
    unittest.main()
