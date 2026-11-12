"""Milestone 6zl: a capacity-aware (two-sided) rule curve for the deck-solar pack."""
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
import run_reserve_curve as rc  # noqa: E402
import run_two_sided_curve as ts  # noqa: E402

DAY = rc.HOTEL * 24.0


class TwoSidedCurveTests(unittest.TestCase):
    def test_equals_uncapped_reserve_when_spell_fits_the_pack(self):
        hc = [DAY + 500.0] * 100 + [DAY - 240.0] * 10 + [DAY + 500.0] * 255
        self.assertEqual(ts.reserve_capped(hc), rc.reserve(hc))

    def test_capped_never_exceeds_pack_or_uncapped_curve(self):
        hc = [DAY + 300.0] * 180 + [DAY - 400.0] * 185
        Rc, Ru = ts.reserve_capped(hc), rc.reserve(hc)
        self.assertLessEqual(max(Rc), ts.C)
        self.assertTrue(all(a <= b + 1e-9 for a, b in zip(Rc, Ru)))

    def test_target_falls_ahead_of_the_deficit_season(self):
        # 180 surplus days of 300 Wh, then a 185-day winter far deeper than the pack: the uncapped curve is above C
        # every day; the capped one is full only from about C / 300 Wh = 33 days before the winter starts
        hc = [DAY + 300.0] * 180 + [DAY - 400.0] * 185
        Rc = ts.reserve_capped(hc)
        self.assertTrue(all(r > ts.C for r in rc.reserve(hc)))
        self.assertEqual(Rc[179], ts.C - 300.0)
        self.assertEqual(Rc[180], ts.C)
        self.assertEqual(Rc[0], 0.0)
        self.assertEqual(ts.target_capped(Rc)[0], 0.5 * ts.C)
        self.assertEqual(ts.target_capped(Rc, floor=0.0)[0], 0.0)

    def test_falls_from_full_before_the_spring_recovery(self):
        # within the winter the requirement is only what is left of it, capped: 10 days before spring it is 4,000 Wh
        hc = [DAY + 3000.0] * 180 + [DAY - 400.0] * 185
        Rc = ts.reserve_capped(hc)
        self.assertAlmostEqual(Rc[355], 4000.0)
        self.assertEqual(Rc[200], ts.C)

    def test_evaluate_reproduces_6zk_for_y_and_r(self):
        a = ts.evaluate(points=["P+40"], years=(2024,), with_f=False)[("P+40", 2024)]
        b = rc.evaluate(points=["P+40"], years=(2024,), with_f=False)[("P+40", 2024)]
        for k in ("Y", "R", "R1", "idle"):
            self.assertEqual(a[k], b[k])


if __name__ == "__main__":
    unittest.main()
