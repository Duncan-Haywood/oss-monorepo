"""Tests for experiments/bend7u (milestone 7u): the early plating bend O4, the least-squares fit, the per-rule m_hat,
and H331 to H335's verdicts."""
import importlib.util
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


U = _mod("bend7u_run", EXP / "bend7u" / "run.py")


class Observable(unittest.TestCase):
    def test_steady_plating_has_zero_bend(self):
        self.assertAlmostEqual(U.o4([0.1 * n for n in range(1, 21)]), 0.0)

    def test_slowing_plating_has_negative_bend(self):
        P = [1 - 0.9 ** n for n in range(1, 21)]
        self.assertAlmostEqual(U.o4(P), 4 * math.log(0.9), places=9)

    def test_no_plating_is_nan(self):
        self.assertTrue(math.isnan(U.o4([0.0] * 20)))


class Fit(unittest.TestCase):
    def test_ols_recovers_exact_plane(self):
        X = [[x, y] for x in range(4) for y in range(3)]
        y = [2 + 3 * a - 0.5 * b for a, b in X]
        for got, want in zip(U.ols(X, y), (2, 3, -0.5)):
            self.assertAlmostEqual(got, want, places=9)

    def test_m_hat_rules(self):
        train = [dict(m=1 + 0.1 * k, O1=k, O2=-k * k, O3=0.5 * k, O4=0.5 * k + 0.01 * (k % 2)) for k in range(6)]
        r = dict(m=None, O1=7, O2=-49, O3=3.5, O4=3.5)
        self.assertEqual(U.m_hat("N", train, r), (1.0, None))
        mh, pick = U.m_hat("C", train, r)
        self.assertIn(pick, ("O1", "O3"))
        self.assertAlmostEqual(mh, 1.7, places=9)
        self.assertAlmostEqual(U.m_hat("T", train, r)[0], 1.7, delta=0.02)


class Verdicts(unittest.TestCase):
    def _G(self, rho34=1.0, rho4m=0.7, T30=0.03, C=0.04, CT=0.02, dT10=-0.001):
        G = {}
        for s, n10 in (("A", 0.05), ("B", 0.09)):
            G[(s, "f10")] = dict(rho_34=rho34, rho_4m=0.1, med=dict(N=n10, C=C, T=C + dT10, CT=CT))
            G[(s, "f30")] = dict(rho_34=rho34, rho_4m=rho4m, med=dict(N=0.2, C=C, T=T30, CT=CT))
        return G

    def test_all_supported(self):
        V = U.judge(self._G())
        self.assertEqual(set(V.values()), {"supported"})

    def test_refutations(self):
        V = U.judge(self._G(rho34=0.3, rho4m=-0.1, T30=0.25, C=0.01, CT=0.5, dT10=0.001))
        self.assertEqual(set(V.values()), {"refuted"})

    def test_q75(self):
        self.assertAlmostEqual(U.q75([1, 2, 3, 4, 5]), 4.0)


if __name__ == "__main__":
    unittest.main()
