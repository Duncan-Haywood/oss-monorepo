"""Milestone 7zzb: `NearField.diffraction_flow` with the diffraction disturbance's own x-derivative in the sectional
body condition (fixed-point passes), and the pinned results."""
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import nearfield as nf  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_dx_fixed_point.txt")


def omega(lam, l):
    return math.sqrt(2.0 * math.pi * st.G / (lam * l))


_H = []


def hull():
    if not _H:
        h = st.WigleyStrip(3.0, 0.3, 0.1875, n_stations=10, n_panels=8)
        keys = sorted(set(h.ratio), key=repr)
        _H.append((h, nf.NearField(h, field=nf.FieldTable(keys, n_panels=8, nu_t=st.NU_T[::6], processes=1))))
    return _H[0]


class FixedPointTests(unittest.TestCase):
    def test_zero_passes_leave_every_output_unchanged(self):
        h, n = hull()
        w = omega(1.0, 3.0)
        a = n.response(w, 0.0, diffraction="sdx", motions=(0j, 0j))
        b = n.response(w, 0.0, diffraction="sdx", motions=(0j, 0j), dx_passes=0)
        for key in ("nf_pg", "wl", "vel", "grad"):
            self.assertEqual(a[key], b[key])
        self.assertEqual(n.excitation(w, "sdx", "exact"), n.excitation(w, "sdx", "exact", dx_passes=0))

    def test_one_pass_adds_the_x_derivative_term_to_the_body_condition(self):
        h, n = hull()
        w = omega(1.0, 3.0)
        p0, d0, _ = n.diffraction_flow(w, "sdx")
        p1, d1, hist = n.diffraction_flow(w, "sdx", dx_passes=1)
        self.assertEqual(len(hist), 1)
        yx = n._yx()
        pxt = n._pxt(p0, d0, yx)
        for i, r in enumerate(h.ratio):
            g = n.field.geo[r]
            if g is None:
                continue
            for j in range(len(g)):
                self.assertAlmostEqual(abs(d1[i][j] - d0[i][j] - yx[i][j] * g[j][2] * pxt[i][j]), 0.0, places=12)

    def test_settled_flow_satisfies_its_own_body_condition(self):
        h, n = hull()
        w = omega(1.0, 3.0)
        p0, d0, _ = n.diffraction_flow(w, "sdx")
        p, d, hist = n.diffraction_flow(w, "sdx", dx_passes=200, tol=1e-10)
        self.assertLess(hist[-1], 1e-8)
        pxt = n._pxt(p, d, n._yx())
        yx = n._yx()
        top = max(abs(v) for row in d for v in row)
        for i, r in enumerate(h.ratio):
            g = n.field.geo[r]
            if g is None:
                continue
            for j in range(len(g)):
                res = d[i][j] - d0[i][j] - yx[i][j] * g[j][2] * pxt[i][j]
                self.assertLess(abs(res) / top, 1e-6)

    def test_iteration_contracts_at_lambda_over_l_one(self):
        _, n = hull()
        _, _, hist = n.diffraction_flow(omega(1.0, 3.0), "sdx", dx_passes=6)
        self.assertLess(hist[-1], hist[0])


class PinnedResultsTests(unittest.TestCase):
    def test_all_expectation_lines_present(self):
        with open(RESULTS) as f:
            text = f.read()
        for tag in ("X1", "X2", "X3", "X4", "X5", "X6"):
            self.assertRegex(text, rf"\n{tag} .* -> (held|refuted)")


if __name__ == "__main__":
    unittest.main()
