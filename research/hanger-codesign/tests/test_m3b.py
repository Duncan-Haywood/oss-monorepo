"""Milestone 3b: the continuation chains and the cold-start table they are compared against."""
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np

EXP = Path(__file__).resolve().parents[1] / "experiments"
sys.path.insert(0, str(EXP / "m3_fem_tier"))
import fem  # noqa: E402
import newton  # noqa: E402

spec = importlib.util.spec_from_file_location("m3b_run", EXP / "m3b_continuation" / "run.py")
m3b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m3b)


class TestM3b(unittest.TestCase):
    def test_cold_table_reads_all_24_measured_shear_cases(self):
        self.assertEqual(len(m3b.COLD), 24)
        self.assertEqual(m3b.COLD[("A", 150.0, 0.0025)], (0.1608, True))
        self.assertEqual(m3b.COLD[("A", 3200.0, 0.0025)], (0.2303, False))

    def test_chains_start_at_3a_cold_ea_and_contain_the_sourced_values(self):
        for f, ch in m3b.CHAIN.items():
            self.assertEqual(ch[0], 150.0)
            self.assertEqual(list(ch), sorted(ch))
            for ea in m3b.SOURCED[f]:
                self.assertIn(ea, ch)

    def test_changing_ea_in_place_rescales_only_the_stretch_energy(self):
        P, T = fem.lattice(0.01, (0, 0.03), (0, 0.03))
        X = np.column_stack([P * [1.01, 1.0], np.zeros(len(P))])   # pure 1% warp stretch, flat
        e = []
        for ea in (150.0, 600.0):
            m = fem.Mesh(P, T, 0.1, 0.0, 150.0, 26.0, np.zeros(len(P), bool))
            m.EA = ea
            e.append(m.energy_grad(X.ravel(), X)[0])
        self.assertAlmostEqual(e[1] / e[0], 4.0, places=9)

    def test_a_continued_stage_starts_from_the_previous_equilibrium(self):
        # a small cantilever: solve at EA 150, then raise EA; the restart is already near
        # equilibrium (the bend is near-isometric), so it needs few Newton steps
        P, T = fem.lattice(0.004, (-0.004, 0.03), (0, 0.008), rows_along="y")
        m = fem.Mesh(P, T, 0.05, 12.0, 150.0, 26.0, P[:, 0] <= 1e-12)
        X = m.X0.copy()
        w = fem.GRAV * m.mass.max()
        nw = newton.Newton(m.n, [m.T, np.column_stack([m.hu, m.hv, m.ho1, m.ho2])], m.free)
        steps = []
        for ea in (150.0, 800.0):
            m.EA = ea
            v, info = nw.solve(lambda u: m.energy_grad(u, X), X[m.free].ravel(), gtol=1e-6 * w, maxit=200)
            X = X.copy()
            X[m.free] = v.reshape(-1, 3)
            self.assertLess(info["gmax"], 1e-6 * w)
            steps.append(info["iters"])
        self.assertLess(steps[1], steps[0])


if __name__ == "__main__":
    unittest.main()
