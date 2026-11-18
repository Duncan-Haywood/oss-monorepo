import itertools, pathlib, sys, unittest
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "src"))
from robofab_cell_mva.mva import mva, cell_demands, balanced_bounds
from robofab_cell_mva.sim import simulate, replicate

T = [dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.1),
     dict(weight=1, print=60, load=2, unload=2, inspect=3, q=0.2)]


def ctmc_throughput(D, m, N):
    """Throughput of a cyclic closed network by solving the Markov chain's balance equations."""
    K = len(D)
    states = [s for s in itertools.product(range(N + 1), repeat=K) if sum(s) == N]
    idx = {s: i for i, s in enumerate(states)}
    Q = np.zeros((len(states), len(states)))
    for s in states:
        for i in range(K):
            if s[i] > 0:
                rate = min(s[i], m[i]) / D[i]
                t = list(s); t[i] -= 1; t[(i + 1) % K] += 1
                Q[idx[s], idx[tuple(t)]] += rate
        Q[idx[s], idx[s]] -= Q[idx[s]].sum()
    A = np.vstack([Q.T, np.ones(len(states))])
    b = np.zeros(len(states) + 1); b[-1] = 1
    pi = np.linalg.lstsq(A, b, rcond=None)[0]
    return sum(pi[idx[s]] * min(s[0], m[0]) / D[0] for s in states)


class TestMVA(unittest.TestCase):
    def test_matches_markov_chain(self):
        for D, m, N in [([4, 30, 3], [1, 2, 1], 3), ([2, 5, 7], [1, 3, 2], 4), ([1, 1, 1], [1, 1, 1], 5)]:
            self.assertAlmostEqual(mva(D, m, N)[0], ctmc_throughput(D, m, N), places=9)

    def test_single_customer(self):
        self.assertAlmostEqual(mva([2, 3, 5], [1, 2, 1], 1)[0], 1 / 10)

    def test_below_bound_and_monotone(self):
        D, m = [4, 30, 3], [1, 4, 1]
        xs = [mva(D, m, n)[0] for n in range(1, 15)]
        self.assertTrue(all(b >= a - 1e-12 for a, b in zip(xs, xs[1:])))
        self.assertTrue(all(x <= balanced_bounds(D, m, n) + 1e-12 for n, x in enumerate(xs, 1)))

    def test_littles_law(self):
        X, u, q = mva([4, 30, 3], [1, 2, 1], 6)
        self.assertAlmostEqual(q.sum(), 6.0)
        self.assertTrue(np.all(u <= 1 + 1e-12))

    def test_demands(self):
        D, m = cell_demands(T, 4, 1)
        self.assertAlmostEqual(D[0], 0.5 * 4 / 0.9 + 0.5 * 4 / 0.8)
        self.assertEqual(m, [1, 4, 1])

    def test_demands_hold_printer(self):
        # MVA-h (hold_printer=True): printer demand per good part includes load and unload.
        # By hand: 0.5*(20+2+2)/0.9 + 0.5*(60+2+2)/0.8 = 13.333... + 40 = 53.333...
        D, _ = cell_demands(T, 4, 1, hold_printer=True)
        self.assertAlmostEqual(D[1], 0.5 * 24 / 0.9 + 0.5 * 64 / 0.8)
        self.assertAlmostEqual(D[1], 160 / 3)
        # arm and inspection demands do not change; plain printer demand is print time only
        D0, _ = cell_demands(T, 4, 1)
        self.assertAlmostEqual(D0[1], 0.5 * 20 / 0.9 + 0.5 * 60 / 0.8)
        self.assertEqual(D[0], D0[0]); self.assertEqual(D[2], D0[2])

    def test_mva_h_double_counts_at_one_job(self):
        # One job, no rework: the true cycle is load + print + unload + inspect = 27 min, but MVA-h
        # charges load and unload to both the arm and the printer, so it predicts 1/31 per minute.
        A = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.0)
        D, m = cell_demands([A], 1, 1, hold_printer=True)
        self.assertAlmostEqual(mva(D, m, 1)[0], 1 / 31)

    def test_demands_reject_bad_input(self):
        bad = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=1.0)
        with self.assertRaises(ValueError):
            cell_demands([bad], 1, 1)
        with self.assertRaises(ValueError):
            cell_demands([dict(bad, q=-0.1)], 1, 1)
        with self.assertRaises(ValueError):
            cell_demands([dict(bad, q=0.1, weight=0)], 1, 1)
        with self.assertRaises(ValueError):
            cell_demands([], 1, 1)


class TestSim(unittest.TestCase):
    def test_product_form_sim_matches_mva(self):
        D, m = cell_demands(T[:1], 3, 1)
        x = mva(D, m, 5)[0]
        mean, se = replicate(T[:1], 3, 1, 5, mode="pf", dist="exp", seeds=range(10), horizon=40 * 60.0)
        self.assertLess(abs(mean - x), 4 * se + 0.003)

    def test_deterministic_and_seeded(self):
        a = simulate(T, 2, 1, 4, mode="hold", dist="ln", seed=3)
        b = simulate(T, 2, 1, 4, mode="hold", dist="ln", seed=3)
        self.assertEqual(a, b)
        self.assertGreater(a, 0)

    def test_deterministic_exact_rates(self):
        # Deterministic times, no rework, one type: the printer is the bottleneck and its rate is
        # exact. Hold mode keeps a printer for load + print + unload = 24 min; pf mode for print = 20.
        # Counting only whole parts in the 1200 min after warm-up allows an error of one part.
        A = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.0)
        tol = 1 / 1200
        self.assertAlmostEqual(simulate([A], 1, 1, 3, mode="hold", dist="det"), 1 / 24, delta=tol)
        self.assertAlmostEqual(simulate([A], 2, 1, 4, mode="hold", dist="det"), 2 / 24, delta=tol)
        self.assertAlmostEqual(simulate([A], 1, 1, 3, mode="pf", dist="det"), 1 / 20, delta=tol)
        self.assertAlmostEqual(simulate([A], 2, 1, 4, mode="pf", dist="det"), 2 / 20, delta=tol)
        # one job never waits, so the cycle is 2 + 20 + 2 + 3 = 27 min in both modes
        self.assertAlmostEqual(simulate([A], 1, 1, 1, mode="hold", dist="det"), 1 / 27, delta=tol)

    def test_hold_single_job_with_rework(self):
        # One job, exponential times, q = 0.1: renewal-reward gives (1 - q) / 27 good parts per min.
        B = dict(weight=1, print=20, load=2, unload=2, inspect=3, q=0.1)
        mean, se = replicate([B], 1, 1, 1, mode="hold", dist="exp", seeds=range(20))
        self.assertLess(abs(mean - 0.9 / 27), 4 * se)

    def test_hold_not_faster_than_pf(self):
        pf = replicate(T, 4, 1, 6, mode="pf", dist="det", seeds=range(3))[0]
        hold = replicate(T, 4, 1, 6, mode="hold", dist="det", seeds=range(3))[0]
        self.assertLessEqual(hold, pf + 1e-9)


if __name__ == "__main__":
    unittest.main()
