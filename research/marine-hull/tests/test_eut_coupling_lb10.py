"""Milestone 7zp: transfer rules for Kashiwagi's coupling and the pinned L/B 10 results."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

from marine_hull.strip import G  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_eut_coupling_lb10.txt")


class FakeHull:
    """Stands in for a strip hull: fixed dimensional coupling, known nondimensional scales."""
    l, rho, vol = 3.0, 1000.0, 0.05

    def cross_coupling(self, we, u):
        a, b = self.rho * self.vol * self.l, self.rho * self.vol * self.l * math.sqrt(G / self.l)
        return -0.05 * a, 0.10 * b, 0.0, -0.11 * b


class FakeTank:
    def eut(self, kl):
        return [-0.02, 0.12, 0.02, -0.12]

    def strip(self, kl):
        return [-0.04, 0.14, 0.0, -0.15]

    def measured(self, kl):
        return [0.0, 0.1, 0.01, -0.1]


class RuleTests(unittest.TestCase):
    def setUp(self):
        import run_eut_coupling_lb10 as ec
        self.ec, self.h, self.t = ec, FakeHull(), FakeTank()
        self.nd = ec.nd_scales(self.h)

    def nd_of(self, rule, u=1.0, **kw):
        return self.ec.to_nd(self.ec.coupling(rule, self.h, self.t, **kw)(2.0, u), self.nd)

    def test_direct_rule_takes_the_tank_curve(self):
        for got, want in zip(self.nd_of("T1"), self.t.eut(0)):
            self.assertAlmostEqual(got, want, places=12)

    def test_correction_rule_adds_the_tank_difference(self):
        want = [-0.05 + 0.02, 0.10 - 0.02, 0.0 + 0.02, -0.11 + 0.03]
        for got, w in zip(self.nd_of("T2"), want):
            self.assertAlmostEqual(got, w, places=12)

    def test_correction_scales_with_froude_number(self):
        u = 0.1 * math.sqrt(G * 3.0)          # Fn 0.1: half the Fn 0.2 correction
        got = self.nd_of("T2", u=u, scale_by_fn=True)
        self.assertAlmostEqual(got[2], 0.01, places=12)
        self.assertAlmostEqual(got[3], -0.11 + 0.015, places=12)

    def test_a0_rule_keeps_damping(self):
        got = self.nd_of("T4")
        self.assertEqual((got[0], got[2]), (0.0, 0.0))
        self.assertAlmostEqual(got[1], 0.10, places=12)


class PinnedResults(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(RESULTS) as f:
            cls.text = f.read()

    def test_code_checks(self):
        self.assertIn("K0 T0 vs no override max relative 0.0e+00", self.text)
        self.assertIn("tank T1 heave error +4.93% vs +4.9%: True", self.text)

    def test_coupling_does_not_close_the_lb10_gap(self):
        m = re.search(r"I T2 ([+-][\d.]+)% \(ratio ([\d.]+)\).*III T2 ([+-][\d.]+)% \(ratio ([\d.]+)\)", self.text)
        self.assertLess(float(m.group(2)), 0.75)
        self.assertLess(float(m.group(4)), 0.80)
        self.assertIn("K3 T3 ratio I 0.624 vs 0.700, III 0.745 vs 0.783 lower: True", self.text)

    def test_monohull_loss_inside_bracket(self):
        self.assertIn("row T2_x_Fn/0.2 2.968 0.028 -3.54 -12.79 True", self.text)


if __name__ == "__main__":
    unittest.main()
