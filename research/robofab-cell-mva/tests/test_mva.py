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

    def test_hold_not_faster_than_pf(self):
        pf = replicate(T, 4, 1, 6, mode="pf", dist="det", seeds=range(3))[0]
        hold = replicate(T, 4, 1, 6, mode="hold", dist="det", seeds=range(3))[0]
        self.assertLessEqual(hold, pf + 1e-9)


if __name__ == "__main__":
    unittest.main()
