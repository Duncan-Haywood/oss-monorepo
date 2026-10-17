import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_extinction_kits.chain import first_generation_extinction, solve, transitions
from selfrep_extinction_kits.des import run


class Extinction(unittest.TestCase):
    def test_first_generation_formula_limits(self):
        self.assertAlmostEqual(first_generation_extinction(1.0, 1.0, 1e9), 0.0, places=6)
        self.assertAlmostEqual(first_generation_extinction(1e-9, 1.0, 1.0), 1.0, places=6)

    def test_chain_is_bounded_below_by_first_generation(self):
        a, w, l = 0.02, 50.0, 500.0
        p = solve(a, w, l, nmax=12, kmax=6, safe=4)["p_extinct_first"]
        self.assertGreater(p, first_generation_extinction(a, w, l))
        self.assertLess(p, 1.0)

    def test_no_death_means_no_extinction(self):
        self.assertAlmostEqual(solve(0.02, 50.0, 1e12, nmax=12, kmax=6, safe=4)["p_extinct_first"], 0.0, places=6)

    def test_exit_rates_are_positive_and_idle_never_waits_with_kit(self):
        for s in [(0, 1, 0), (1, 0, 2), (2, 0, 0), (1, 1, 0)]:
            for r, (b, i, k) in transitions(s, 0.02, 50.0, 500.0, 10, 5):
                self.assertGreater(r, 0)
                self.assertEqual(i * k, 0)

    def test_mean_time_single_state_check(self):
        # With no imports a lone machine is gone after its life: mean time = life (a -> tiny, builds never start)
        t = solve(1e-12, 50.0, 100.0, nmax=4, kmax=2)["mean_time"]
        self.assertAlmostEqual(t, 100.0, delta=0.01)

    def test_simulation_matches_chain_early_extinction(self):
        a, w, l, n = 0.02, 50.0, 500.0, 3000
        exact = solve(a, w, l, nmax=12, kmax=6, safe=4)["p_extinct_first"]
        k = sum(run(a, w, l, s, "poisson", "exp", safe=4)[0] == "extinct" for s in range(n))
        se = (exact * (1 - exact) / n) ** 0.5
        self.assertLess(abs(k / n - exact), 4 * se)

    def test_deterministic_given_seed(self):
        self.assertEqual(run(0.02, 50.0, 300.0, 5, "regular", "lognormal"), run(0.02, 50.0, 300.0, 5, "regular", "lognormal"))


if __name__ == "__main__":
    unittest.main()
