"""Milestone 7zzf: the strip model against Journee's tabulated Wigley III values (`experiments/run_journee_tables.py`)."""
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

import run_journee_tables as jt  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_journee_tables.txt")


class JourneeTablesTests(unittest.TestCase):
    def test_encounter_inverse(self):
        """w0_from_we inverts the head-sea encounter relation we = w0 + w0^2 U / g."""
        for w0, u in ((3.0, 0.5), (6.0, 1.6), (9.0, 2.2)):
            we = w0 + w0 * w0 * u / st.G
            self.assertAlmostEqual(jt.w0_from_we(we, u), w0, places=10)

    def test_data_counts_match_the_plan(self):
        """16 quoted values: 5 coefficient frequencies (2 each), 4 load wavelengths (2 each), 7 heave points."""
        self.assertEqual(len(jt.COEF), 5)
        self.assertEqual(len(jt.LOADS), 4)
        self.assertEqual(len(jt.HEAVE), 7)

    def test_restrained_loads_long_wave_limit(self):
        """In very long waves at zero speed the restrained heave force tends to C33 zeta and the pitch moment to
        k C55 zeta (Froude-Krylov hydrostatics), so both normalised loads tend to 1."""
        h = st.ModifiedWigleyStrip(jt.L, jt.B, jt.D, n_stations=20, kyy=jt.KYY, n_panels=8, alpha=0.0)
        w = jt.head_omega(400.0)
        k = w * w / st.G
        f3, f5 = jt.restrained_loads(h, w, 0.0)
        c33, c55 = h.restoring()
        self.assertAlmostEqual(f3 / c33, 1.0, delta=0.02)
        self.assertAlmostEqual(f5 / (k * c55), 1.0, delta=0.05)

    def test_heave_coefficients_match_response_matrix(self):
        """A33, B33 agree with the heave diagonal of the motion matrix that `response` builds (h11)."""
        h = st.ModifiedWigleyStrip(jt.L, jt.B, jt.D, n_stations=20, kyy=jt.KYY, n_panels=8, alpha=0.0)
        we, u = 5.0, 0.8
        a, b = h.sections(we)
        a33, b33 = jt.heave_coefficients(h, we, u)
        self.assertAlmostEqual(a33, sum(a) * h.dx, places=10)
        # B33 equals sum b dx to within the end terms of sum da/dx dx (a -> 0 at both Wigley ends)
        self.assertAlmostEqual(b33 / (sum(b) * h.dx), 1.0, delta=0.05)

    @unittest.skipUnless(os.path.exists(RESULTS), "run the experiment first")
    def test_results_carry_both_grids_and_every_expectation(self):
        text = open(RESULTS).read()
        for g in jt.GRIDS:
            self.assertIn(f"## grid {g}", text)
        for e in ("E0", "E1", "E2", "E3", "E4", "E5"):
            self.assertIn(e + " ", text)


if __name__ == "__main__":
    unittest.main()
