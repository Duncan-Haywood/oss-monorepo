import pathlib, sys, unittest
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_ctmc.ctmc import build, stationary, throughput
from robofab_cell_ctmc.mva import mva
from robofab_cell_ctmc.sim import replicate


class TestCtmc(unittest.TestCase):
    def test_stationary_solves_balance_equations(self):
        states, r, c, rt, _ = build(6, 3, 3, 20, 2, 2, 3)
        pi = stationary(len(states), r, c, rt)
        flow = np.zeros(len(states))
        np.add.at(flow, c, pi[r] * rt)                    # inflow
        out = np.bincount(r, weights=rt, minlength=len(states)) * pi
        self.assertLess(np.abs(flow - out).max(), 1e-10)
        self.assertAlmostEqual(pi.sum(), 1.0, places=12)

    def test_states_conserve_jobs_and_respect_capacities(self):
        N, P = 7, 3
        states, *_ = build(N, P, 2, 20, 2, 2, 3)
        for w, al, ph, u, au, i in states:
            self.assertEqual(w + al + sum(ph) + u + au + i, N)
            self.assertLessEqual(al + sum(ph) + u + au, P)
            self.assertLessEqual(al + au, 1)

    def test_single_job_rate_is_one_over_cycle_time(self):
        rate, stall, _ = throughput(1, 2, 3, 20, 2, 2, 3, q=0.25)
        self.assertAlmostEqual(rate, 0.75 / (2 + 20 + 2 + 3), places=9)
        self.assertAlmostEqual(stall, 0.0, places=12)

    def test_exponential_ctmc_matches_mva_when_printers_never_queue(self):
        # N <= P, so printers are never the constraint and the held printer costs nothing extra.
        N, P = 4, 4
        rate, _, _ = throughput(N, P, 1, 20, 2, 2, 3)
        X = mva([4.0, 20.0, 3.0], [1, P, 1], N)[0]
        self.assertAlmostEqual(rate, X, delta=0.002 * X)

    def test_print_variability_barely_moves_throughput(self):
        a = throughput(8, 4, 1, 20, 2, 2, 3)[0]
        b = throughput(8, 4, 9, 20, 2, 2, 3)[0]
        self.assertLess(abs(a - b) / a, 0.01)

    def test_sim_agrees_with_ctmc(self):
        rate = throughput(6, 3, 4, 20, 2, 2, 3, 0.1)[0]
        m, se = replicate(6, 3, 4, 20, 2, 2, 3, 0.1, seeds=range(6), horizon=60_000)
        self.assertLess(abs(m - rate), 4 * se + 1e-4)


if __name__ == "__main__":
    unittest.main()
