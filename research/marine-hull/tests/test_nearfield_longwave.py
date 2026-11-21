"""Milestone 7zu: the near field's long-wave residual (`nearfield.NearField.response`, `run_nearfield_longwave.py`)."""
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from marine_hull import nearfield as nf  # noqa: E402
from marine_hull import strip as st  # noqa: E402

RESULTS = os.path.join(HERE, "..", "experiments", "results_nearfield_longwave.txt")
_NF = []


def near():
    if not _NF:
        h = st.ModifiedWigleyStrip(3.0, 0.3, 0.1875, kyy=0.25, rho=1000.0, alpha=1.0, n_stations=12, n_panels=10)
        keys = sorted(set(h.ratio), key=repr)
        _NF.append(nf.NearField(h, field=nf.FieldTable(keys, n_panels=10, nu_t=st.NU_T[::6], processes=1)))
    return _NF[0]


def omega(lam, l=3.0):
    return math.sqrt(2.0 * math.pi * st.G / (lam * l))


class LongWaveTests(unittest.TestCase):
    U = 0.2 * math.sqrt(st.G * 3.0)

    def tearDown(self):
        near().h.set_viscous(0.0, 0.0)

    def test_rows_add_up(self):
        o = near().response(omega(1.0), self.U)
        self.assertAlmostEqual(o["nf_p"], o["wl"] + o["vel"] + o["rot_newton"], places=9)
        self.assertAlmostEqual(o["nf0_p"], o["wl0"] + o["vel0"] + o["rot_newton"], places=9)
        self.assertAlmostEqual(o["nf_pg"], o["nf_p"] + o["grad"], places=9)
        self.assertAlmostEqual(o["nf0_pg"], o["nf0_p"] + o["grad0"], places=9)

    def test_without_viscous_damping_boese_and_pinkster_rotation_agree(self):
        o = near().response(omega(8.0), self.U)
        self.assertAlmostEqual(o["rot_boese"], o["rot_newton"], places=12)

    def test_viscous_part_of_the_rotation_term_is_the_tilted_damping_force(self):
        n = near()
        n.h.set_viscous(0.0375, 0.0)
        for lam in (8.0, 16.0):
            o = n.response(omega(lam), self.U)
            exact = 0.5 * (1j * o["we"] * n.h.bv33 * o["z"] * o["theta"].conjugate()).real
            self.assertAlmostEqual(o["rot_boese"] - o["rot_newton"], exact, delta=1e-9 * abs(exact))
            k = omega(lam) ** 2 / st.G
            self.assertAlmostEqual(exact / (0.5 * o["we"] * n.h.bv33 * k * abs(o["z"]) ** 2), 1.0, delta=0.1)

    def test_pinkster_rotation_removes_the_damped_long_wave_residual(self):
        n = near()
        o0 = n.response(omega(16.0), self.U)
        n.h.set_viscous(0.0375, 0.0)
        o1 = n.response(omega(16.0), self.U)
        self.assertGreater(abs(o1["nf"] - o0["nf"]), 5.0 * abs(o1["nf_p"] - o0["nf_p"]))

    def test_rotated_mean_hydrostatic_candidate_vanishes(self):
        """sum z n_x dS over the hull: zero by Gauss (the closing waterplane has z = 0), so the second-order
        vertical displacement under pitch gives no mean x-force (LOG.md 7zu, analysis (a))."""
        h = near().h
        f = near().field
        ys = []
        geos = [f.geo[r] for r in h.ratio]
        npan = len(next(g for g in geos if g is not None))
        for g in geos:
            ys.append([h.t * g[j][0] for j in range(npan)] if g is not None else [0.0] * npan)
        tot = mag = 0.0
        for j in range(npan):
            dy = nf.d_dx([y[j] for y in ys], h.x, 0.5 * h.l)
            for i, g in enumerate(geos):
                if g is None:
                    continue
                term = h.t * g[j][1] * dy[i] * h.t * g[j][7] * h.dx
                tot += term
                mag += abs(term)
        self.assertLess(abs(tot), 0.02 * mag)

    @unittest.skipUnless(os.path.exists(RESULTS), "run the experiment first")
    def test_results_expectation_lines_present(self):
        text = open(RESULTS).read()
        for m in ("L0", "L1", "L2", "L3", "L4"):
            self.assertIsNotNone(re.search(rf"^{m} .*(held|refuted)", text, re.M), m)
        self.assertIn("check: GB 3.39%", text)


if __name__ == "__main__":
    unittest.main()
