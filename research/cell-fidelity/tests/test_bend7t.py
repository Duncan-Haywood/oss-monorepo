"""Tests for experiments/bend7t (milestone 7t): the throttle, share and seen quantities, Spearman with ties, the look
interpolations, and H326 to H330's verdicts."""
import importlib.util
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


T = _mod("bend7t_run", EXP / "bend7t" / "run.py")


class Quantities(unittest.TestCase):
    def test_steady_plating_has_throttle_one_and_linear_loss_seen_share(self):
        P = [0.1 * n for n in range(1, 101)]
        L = [0.2 * n for n in range(1, 101)]
        self.assertAlmostEqual(T.throttle(P), 1.0)
        self.assertAlmostEqual(T.share(P, L), 0.5)
        self.assertAlmostEqual(T.seen(L, 10), 8 / 97)

    def test_saturating_plating_throttles(self):
        P = [1 - 0.97 ** n for n in range(1, 101)]
        self.assertLess(T.throttle(P), 0.2)


class Stats(unittest.TestCase):
    def test_spearman_monotone_and_ties(self):
        self.assertAlmostEqual(T.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(T.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertEqual(T.ranks([5, 1, 5, 2]), [3.5, 1.0, 3.5, 2.0])

    def test_perm_p_small_for_perfect_and_large_for_noise(self):
        x = list(range(20))
        self.assertLess(T.perm_p(x, x, n=2000), 0.01)
        self.assertGreater(T.perm_p(x, [3, 17, 8, 1, 12, 5, 19, 0, 10, 14, 7, 2, 16, 9, 4, 18, 11, 6, 15, 13], n=2000), 0.05)


class Looks(unittest.TestCase):
    def test_look_needed_interpolates_and_returns_none(self):
        med = {10: 0.2, 20: 0.1, 30: 0.05}
        self.assertAlmostEqual(T.look_needed(med, 0.15), 15.0)
        self.assertEqual(T.look_needed(med, 0.3), 10.0)
        self.assertIsNone(T.look_needed(med, 0.01))

    def test_look_at_share_extrapolates_from_cycle_two(self):
        self.assertAlmostEqual(T.look_at_share({10: 0.2, 20: 0.4}, 0.1), 6.0)
        self.assertAlmostEqual(T.look_at_share({10: 0.2, 20: 0.4}, 0.3), 15.0)


def _G(t10=0.5, t30=0.25, rho_tm=0.8, rho_de=0.95, e30=(0.1, 0.08, 0.06, 0.05, 0.04, 0.03), committed_dm=0.01):
    G = {}
    E = lambda vals: dict(zip(T.WINDOWS, vals))
    for s in T.TUNED:
        G[(s, "f10")] = dict(med_T=t10, rho_T_m=rho_tm, rho_dm_e10=rho_de, med_dm=0.05,
                             med_E=E((0.07,) * 6))
        G[(s, "f30")] = dict(med_T=t30, rho_T_m=rho_tm, rho_dm_e10=rho_de, med_dm=0.3, med_E=E(e30))
    for i, s in enumerate(("A", "B", "C", "D")):
        G[(s, "committed")] = dict(med_T=0.9 + i * 0.01, rho_T_m=0.0, rho_dm_e10=rho_de, med_dm=committed_dm,
                                   med_E=E((0.05,) * 6))
    return G


class Verdicts(unittest.TestCase):
    def test_all_supported(self):
        V, X = T.judge(_G())
        self.assertEqual(set(V.values()), {"supported"})
        self.assertLessEqual(X["looks"]["Mohtat2020"], 25)

    def test_refutations(self):
        V, _ = T.judge(_G(t10=0.2, t30=0.4, rho_tm=-0.1, rho_de=0.2, e30=(0.3,) * 6))
        self.assertEqual(V["H326"], "refuted")
        self.assertEqual(V["H327"], "refuted")
        self.assertEqual(V["H328"], "refuted")
        self.assertEqual(V["H329"], "refuted")


if __name__ == "__main__":
    unittest.main()
