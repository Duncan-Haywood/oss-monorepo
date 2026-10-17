import pathlib
import statistics
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_extinction.chain import equilibrium, gillespie_extinction, harmonic, mean_extinction_times


class Chain(unittest.TestCase):
    def test_pure_death_matches_harmonic_number(self):
        # no import budget: no births, so E[T | n] = L * H_n exactly (independent known answer)
        t = mean_extinction_times(50, 100, 0.0, 300.0, nmax=20)
        for n in (1, 2, 5, 20):
            self.assertAlmostEqual(t[n], 300.0 * harmonic(n), places=6)

    def test_single_machine_no_births_is_life(self):
        self.assertAlmostEqual(mean_extinction_times(50, 100, 0.0, 123.0, nmax=5)[1], 123.0)

    def test_increases_with_start_and_budget(self):
        a = mean_extinction_times(50, 170, 4, 200, nmax=100)
        self.assertTrue(all(a[i] < a[i + 1] for i in range(1, 100)))
        b = mean_extinction_times(50, 170, 8, 200, nmax=100)
        self.assertGreater(b[1], a[1])

    def test_solver_matches_gillespie(self):
        exact = mean_extinction_times(50, 170, 4, 150, nmax=100)[3]
        runs = [gillespie_extinction(3, 50, 170, 4, 150, seed=s) for s in range(4000)]
        se = statistics.stdev(runs) / len(runs) ** 0.5
        self.assertLess(abs(statistics.mean(runs) - exact), 4 * se)

    def test_interruption_shortens_extinction(self):
        a = mean_extinction_times(50, 170, 4, 200, nmax=100)[2]
        b = mean_extinction_times(50, 170, 4, 200, nmax=100, interrupt=True)[2]
        self.assertLess(b, a)

    def test_equilibrium(self):
        self.assertAlmostEqual(equilibrium(50, 170, 4, 500), 4 * 500 / 170)


if __name__ == "__main__":
    unittest.main()
