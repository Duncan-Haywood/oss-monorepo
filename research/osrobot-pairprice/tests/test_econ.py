import unittest
from osrobot_pairprice import econ as E


class T(unittest.TestCase):
    def test_swaps(self):
        self.assertEqual(E.swaps(0.0), 0)
        self.assertEqual(E.swaps(20.0), 0)
        self.assertEqual(E.swaps(20.1), 1)
        self.assertEqual(E.swaps(60.0), 2)

    def test_inline_cost_hand_value(self):
        # 60 min: 5000*0.3*1/500 = 3.0 capital; 3 min at 20 USD/h = 1.0; 100 Wh at 0.15 = 0.015
        self.assertAlmostEqual(E.inline_cost(60.0, 100.0), 4.015)

    def test_pair_cost_hand_value(self):
        # 30 min fly (1 swap), 30 min ground: scout 33 min -> 2500*.3*.55/500 = 0.825; treater 3500*.3*.5/500 = 1.05
        # people: (8+3+3)/60*20 = 4.6667; energy 0; pilot not charged
        self.assertAlmostEqual(E.pair_cost(30.0, 30.0, 0.0, pilot=False), 0.825 + 1.05 + 14 / 3)

    def test_pilot_time_is_charged_by_default(self):
        # 14 CFR 107.31: the remote pilot watches the whole flight. 30 flight min at 20 USD/h = 10 USD on top of the
        # set-up and swap labour; the swap minutes are not counted twice.
        self.assertTrue(E.PILOT_ATTENDED)
        self.assertAlmostEqual(E.pair_cost(30.0, 30.0, 0.0), 0.825 + 1.05 + 14 / 3 + 10.0)
        self.assertAlmostEqual(E.pair_cost(30.0, 30.0, 0.0, pilot_rate=6.0) - E.pair_cost(30.0, 30.0, 0.0, pilot=False), 3.0)

    def test_crossings_finds_every_root_of_a_sawtooth(self):
        # A sawtooth like the swap-driven cost difference: one bisection over the range finds one root at most.
        f = lambda x: (x % 1.0) - 0.5 - 0.05 * (x - 2.0)
        xs = E.crossings(f, 0.1, 6.0)
        self.assertGreater(len(xs), 3)
        for x in xs:   # the cheaper side flips there: a root, or a step where a battery swap is added
            self.assertLess(f(x - 1e-6) * f(x + 1e-6), 0)
        self.assertEqual(len([x for x in xs if abs(f(x)) < 1e-6]), 6)   # the six continuous roots on (0.1, 6)
        self.assertEqual(E.crossings(lambda x: x + 1, 0.1, 10.0), [])
        self.assertAlmostEqual(E.crossings(lambda x: x - 2.5, 0.1, 10.0)[0], 2.5)

    def test_cost_model_matches_the_audit_recomputation(self):
        # The published Sweep 2 fits (experiments/results.txt). Quality audit 2026-11-13 recomputed the pair at
        # 2.46x the inline robot at 0.72 ha and 2.32x at 20 ha once the pilot is paid, and 0.98x / 0.68x unpaid.
        fits = {"fly_min": (0.57, 56.8, 1), "ground_min": (-0.75, 91.2, 1), "inline_min": (0.96, 227.6, 1),
                "pair_wh": (-3.23, 665.7, 1), "inline_wh": (-1.93, 985.6, 1)}
        for a, paid, unpaid in ((0.72, 2.46, 0.98), (20.0, 2.32, 0.68)):
            i, p, h = E.cost_model(fits, a)
            _, p0, _ = E.cost_model(fits, a, pilot=False)
            self.assertAlmostEqual(p / i, paid, places=2)
            self.assertAlmostEqual(p0 / i, unpaid, places=2)
            self.assertGreater(h, p)
        # labour reaches both machines; cap reaches only the inline robot
        self.assertLess(E.cost_model(fits, 1.0, labour=0.0)[0], E.cost_model(fits, 1.0)[0])
        self.assertEqual(E.cost_model(fits, 1.0, cap=9e9)[1], E.cost_model(fits, 1.0)[1])
        # attend reaches both machines: inline gains 227.6 attended min/ha, the pair 91.2, so at 0.72 ha the pair is
        # 0.69x the inline robot (Sweep 3b; by hand: inline 89.30, pair 62.02 USD/ha)
        i, p, _ = E.cost_model(fits, 0.72, attend=True)
        self.assertAlmostEqual(p / i, 0.69, places=2)
        self.assertAlmostEqual(i / 0.72, 89.30, places=1)

    def test_attend_charges_ground_minutes_on_both_architectures(self):
        # inline: 60 attended ground min add 60/60*20 = 20 USD; pair: the treater's 30 min add 10 USD, held or not
        self.assertAlmostEqual(E.inline_cost(60.0, 100.0, attend=True) - E.inline_cost(60.0, 100.0), 20.0)
        self.assertAlmostEqual(E.pair_cost(30.0, 30.0, 0.0, attend=True) - E.pair_cost(30.0, 30.0, 0.0), 10.0)
        self.assertAlmostEqual(E.pair_cost(30.0, 30.0, 0.0, held=True, attend=True)
                               - E.pair_cost(30.0, 30.0, 0.0, held=True), 10.0)

    def test_held_costs_at_least_unheld(self):
        a = E.pair_cost(10.0, 15.0, 100.0)
        b = E.pair_cost(10.0, 15.0, 100.0, held=True)
        self.assertGreater(b, a)

    def test_interp_no_extrapolation(self):
        self.assertAlmostEqual(E.interp([0, 1, 2], [0, 10, 40], 1.5), 25.0)
        self.assertIsNone(E.interp([0, 1, 2], [0, 10, 40], 3.0))

    def test_fit_line_exact(self):
        c, m, r2 = E.fit_line([1, 2, 3], [3, 5, 7])
        self.assertAlmostEqual(c, 1.0); self.assertAlmostEqual(m, 2.0); self.assertAlmostEqual(r2, 1.0)

    def test_bisect(self):
        self.assertAlmostEqual(E.bisect(lambda x: x - 2.5, 0, 10), 2.5)
        self.assertIsNone(E.bisect(lambda x: x + 1, 0, 10))
