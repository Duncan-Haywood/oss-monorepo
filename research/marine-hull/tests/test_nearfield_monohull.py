"""Milestone 7zt: the monohull's 30 W loss with the near-field added resistance (`run_nearfield_monohull.py`)."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))

from marine_hull import nearfield as nf  # noqa: E402
from marine_hull import strip as st  # noqa: E402
import run_nearfield_monohull as nm  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_nearfield_monohull.txt")
_H = []


def hull():
    if not _H:
        h = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, kyy=0.25, rho=1000.0, alpha=1.0, n_stations=12, n_panels=10)
        keys = sorted(set(h.ratio), key=repr)
        n = nf.NearField(h, field=nf.FieldTable(keys, n_panels=10, nu_t=st.NU_T[::6], processes=1))
        _H.append((h, nm.Cached(n)))
    return _H[0]


def rows():
    out = {}
    with open(RESULTS) as f:
        for line in f:
            if line.startswith("row "):
                v = line.split()
                out[(v[1], v[2])] = dict(motion=float(v[3]), refl=float(v[4]), loss25=float(v[5]),
                                         loss1=float(v[6]), scope=v[7] == "True")
    return out


class NearFieldMonohullTests(unittest.TestCase):
    W = math.sqrt(2.0 * math.pi / 3.0 * st.G)
    U = 0.2 * math.sqrt(st.G * 3.0)

    def test_gb_wrapper_returns_the_strip_hull_response(self):
        h, c = hull()
        z, th, raw, we = h.response(self.W, self.U)
        z2, th2, raw2, we2 = nm.Formula(h, c, "gb").response(self.W, self.U)
        self.assertAlmostEqual(raw, raw2, places=9)
        self.assertAlmostEqual(abs(z - z2), 0.0, places=12)
        self.assertAlmostEqual(we, we2, places=12)

    def test_formula_rows_share_the_motions_and_one_evaluation(self):
        h, c = hull()
        a = nm.Formula(h, c, "nf").response(self.W, self.U)
        b = nm.Formula(h, c, "nf0").response(self.W, self.U)
        self.assertEqual(a[0], b[0])
        self.assertEqual(a[1], b[1])
        self.assertNotAlmostEqual(a[2], b[2], places=3)
        self.assertEqual(sum(1 for k in c.memo if k == (self.W, self.U)), 1)

    def test_formula_forwards_hull_attributes(self):
        h, c = hull()
        self.assertEqual(nm.Formula(h, c, "nf").t, h.t)

    @unittest.skipUnless(os.path.exists(RESULTS), "run the experiment first")
    def test_results_gb_row_reproduces_7zr(self):
        r = rows()
        self.assertAlmostEqual(-r[("GB", "faltinsen")]["loss25"], nm.REF_7ZR_V0, delta=0.01)

    @unittest.skipUnless(os.path.exists(RESULTS), "run the experiment first")
    def test_results_reflection_only_adds(self):
        r = rows()
        for name, _ in nm.FORMULAS:
            self.assertEqual(r[(name, "none")]["motion"], r[(name, "faltinsen")]["motion"])
            self.assertEqual(r[(name, "none")]["refl"], 0.0)
            self.assertLessEqual(r[(name, "faltinsen")]["loss25"], r[(name, "none")]["loss25"])

    @unittest.skipUnless(os.path.exists(RESULTS), "run the experiment first")
    def test_results_expectation_lines_present(self):
        text = open(RESULTS).read()
        for m in ("M0", "M1", "M2", "M3", "M4"):
            self.assertIsNotNone(re.search(rf"^{m} .*: (True|False)", text, re.M), m)


if __name__ == "__main__":
    unittest.main()
