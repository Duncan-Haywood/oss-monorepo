"""Milestone 7zr: the Gerritsma-Beukelman speed-term variants in `strip.WigleyStrip.response` and the pinned results."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_gb_speed_terms.txt")
_HULL = []


def hull():
    if not _HULL:
        h = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, kyy=0.25, rho=1000.0, alpha=0.0)
        h.set_viscous(0.0375, 0.0)
        _HULL.append(h)
    return _HULL[0]


class VariantTests(unittest.TestCase):
    W = math.sqrt(2.0 * math.pi / 3.0 * st.G)        # lambda/L 1 on the 3 m hull
    U = 0.3 * math.sqrt(st.G * 3.0)

    def test_empty_variant_is_the_default(self):
        self.assertEqual(hull().response(self.W, self.U), hull().response(self.W, self.U, gb={}))

    def test_formula_only_variants_keep_the_motions(self):
        z0, t0, r0, _ = hull().response(self.W, self.U)
        for gb in ({"raw_sign": 0}, {"raw_sign": 1}, {"prefactor": "omega"}):
            z, t, r, _ = hull().response(self.W, self.U, gb=gb)
            self.assertEqual((z, t), (z0, t0))
            self.assertNotAlmostEqual(r, r0, places=3)

    def test_speed_term_is_linear_in_its_sign(self):
        # the integrand is b33 + s U da/dx, so R(+1) + R(-1) = 2 R(0) with the motions fixed
        r = {s: hull().response(self.W, self.U, gb={"raw_sign": s})[2] for s in (-1, 0, 1)}
        self.assertAlmostEqual((r[1] + r[-1]) / (2.0 * r[0]), 1.0, places=12)

    def test_prefactor_variant_scales_by_encounter_over_absolute_frequency(self):
        _, _, r0, we = hull().response(self.W, self.U)
        r5 = hull().response(self.W, self.U, gb={"prefactor": "omega"})[2]
        self.assertAlmostEqual(r5 / r0, we / self.W, places=12)

    def test_flipped_convention_changes_the_motions(self):
        z0 = hull().response(self.W, self.U)[0]
        z3 = hull().response(self.W, self.U, gb={"motion_sign": 1, "raw_sign": 1})[0]
        self.assertGreater(abs(z3 - z0), 1e-3 * abs(z0))


@unittest.skipUnless(os.path.exists(RESULTS), "results not generated")
class PinnedResults(unittest.TestCase):
    def setUp(self):
        with open(RESULTS) as f:
            self.text = f.read()

    def test_base_reproduces_7zk(self):
        self.assertRegex(self.text, r"E0 V0 Fn 0\.2 peaks I 22\.25\d, III 17\.38\d .*: True")

    def test_every_expectation_line_has_a_verdict(self):
        for e in ("E0", "E1", "E2", "E3", "E4", "E5"):
            self.assertRegex(self.text, re.compile(rf"^{e} .*: (True|False)$", re.M))


if __name__ == "__main__":
    unittest.main()
