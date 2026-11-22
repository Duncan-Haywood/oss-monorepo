"""Milestone 7zv: grid convergence of the near field's X . grad p term (`run_nearfield_convergence.py`)."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import nearfield as nf  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_nearfield_convergence.txt")
RESULTS_B24 = os.path.join(HERE, "..", "experiments", "results_nearfield_convergence_b24.txt")


def tiny(n_panels, n_stations):
    h = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, kyy=0.25, rho=1000.0, alpha=1.0,
                               n_stations=n_stations, n_panels=n_panels)
    keys = sorted(set(h.ratio), key=repr)
    return h, nf.NearField(h, field=nf.FieldTable(keys, n_panels=n_panels, nu_t=st.NU_T[::6], processes=1))


class ConvergenceTests(unittest.TestCase):
    def test_station_order_formula_recovers_a_known_order(self):
        """(f20 - f40) / (f30 - f60) = 1.5^p for f(S) = f_inf + C S^-p, the identity the script uses."""
        for p in (1.0, 2.0, 3.0):
            f = {s: 5.0 + 7.0 * s ** -p for s in (20, 30, 40, 60)}
            got = math.log((f[20] - f[40]) / (f[30] - f[60])) / math.log(1.5)
            self.assertAlmostEqual(got, p, places=9)
            rich = f[60] - (f[30] - f[60]) / (2.0 ** p - 1.0)
            self.assertAlmostEqual(rich, 5.0, places=9)

    def test_grad_term_keeps_sign_and_size_across_station_counts(self):
        """Smoke: on a coarse hull the X . grad p term at lambda/L 1 keeps its sign from 10 to 20 stations."""
        u = 0.2 * math.sqrt(st.G * 3.0)
        w = math.sqrt(2.0 * math.pi * st.G / 3.0)
        vals = []
        for ns in (10, 20):
            _, n = tiny(8, ns)
            vals.append(n.response(w, u)["grad"])
        self.assertGreater(vals[0] * vals[1], 0.0)
        self.assertLess(abs(vals[1] / vals[0] - 1.0), 0.5)

    @unittest.skipUnless(os.path.exists(RESULTS), "run the experiment first")
    def test_results_expectation_lines_present(self):
        text = open(RESULTS).read()
        for m in ("C0", "C1", "C2", "C3", "C4"):
            self.assertIsNotNone(re.search(rf"^{m} .*(held|refuted)", text, re.M), m)
        self.assertIn("P16 S30", text)
        self.assertIn("C0 (16, 30) reproduces", text)

    @unittest.skipUnless(os.path.exists(RESULTS_B24), "run the experiment first")
    def test_b24_results_expectation_line_present(self):
        text = open(RESULTS_B24).read()
        self.assertIsNotNone(re.search(r"^C5 .*(held|refuted)", text, re.M))
        self.assertIn("row P24 S40 NF-PG", text)


if __name__ == "__main__":
    unittest.main()
