import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_reserve_curve as rc  # noqa: E402
import run_speed_timing as sp  # noqa: E402
import run_year_pack as yp  # noqa: E402

POINT, YEAR = "P+50", 2024


class SpeedTimingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sun = rc.year_sun(POINT, YEAR)
        cls.T = sp.target(rc.climatology_wh(POINT, YEAR))

    def test_rule_L_matches_6zm_causal_rule(self):
        km, down, dark = rc.causal_target(self.sun, self.T)
        r = sp.run_rule(self.sun, self.T, "L")
        self.assertAlmostEqual(r["km"], km, places=6)
        self.assertEqual(r["down"], down)
        self.assertAlmostEqual(r["dark"], dark, places=6)

    def test_rule_Y_matches_6zj(self):
        km, down, dark, _ = yp.causal(self.sun)
        r = sp.run_rule(self.sun, [0.5 * sp.C] * len(self.sun), "Y")
        self.assertAlmostEqual(r["km"], km, places=6)
        self.assertAlmostEqual(r["dark"], dark, places=6)

    def test_energy_balance_closes(self):
        for rule in sp.RULES:
            r = sp.run_rule(self.sun, self.T, rule)
            P = sp.prop_energy(r)
            self.assertGreaterEqual(P, -1e-6)
            self.assertGreaterEqual(r["spill"], 0.0)
            self.assertLessEqual(r["end"], sp.C + 1e-9)

    def test_even_spend_beats_uneven(self):
        # Jensen: the same energy spent evenly goes at least as far (concave speed in power)
        n = 10
        even = sp.even_km(10000.0, n)
        a = 5 * 86.4 * yp.speed_for_prop_wh(1500.0) + 5 * 86.4 * yp.speed_for_prop_wh(500.0)
        self.assertGreater(even, a)

    def test_recapture_never_spills_more(self):
        a = sp.run_rule(self.sun, self.T, "L")
        b = sp.run_rule(self.sun, self.T, "S")
        self.assertLessEqual(b["spill"], a["spill"] + 1e-6)


class ForesightAccountingTests(unittest.TestCase):
    def test_matches_6zj_foresight(self):
        sun = rc.year_sun("P+0", 2024)[:60]
        table = yp.prop_table()
        km, down, dark = yp.foresight(sun, table=table)
        r = sp.foresight_acct(sun, table)
        self.assertAlmostEqual(r["km"], km, places=6)
        self.assertEqual(r["down"], down)

    def test_end_floor_is_met(self):
        sun = rc.year_sun("P+0", 2024)[:60]
        r = sp.foresight_acct(sun, yp.prop_table(), end_min=0.5 * sp.C)
        self.assertGreaterEqual(r["end"], 0.5 * sp.C - 1e-6)



class DispatchTests(unittest.TestCase):
    """The first run dispatched (S) and (OS) to (O)'s power estimate; these pin the fix."""

    def test_recapture_rules_use_their_own_base(self):
        sun = rc.year_sun(POINT, YEAR)
        hc = rc.climatology_wh(POINT, YEAR)
        T = sp.target(hc)
        L, S, O = (sp.run_rule(sun, T, k) for k in ("L", "S", "O"))
        self.assertNotAlmostEqual(S["km"], O["km"], places=3)
        self.assertGreaterEqual(S["km"], L["km"] - 1e-6)

    def test_climatology_rule_needs_hc(self):
        sun = rc.year_sun(POINT, YEAR)
        hc = rc.climatology_wh(POINT, YEAR)
        r = sp.run_rule(sun, sp.target(hc), "K", hc=hc)
        self.assertGreater(r["km"], 0.0)


if __name__ == "__main__":
    unittest.main()
