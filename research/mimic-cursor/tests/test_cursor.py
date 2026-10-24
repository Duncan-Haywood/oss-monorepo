import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import data  # noqa: E402
import game as G  # noqa: E402
import programs as P  # noqa: E402


def toy_humans(n=60, seed=0):
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        start = rng.uniform(100, 900, 2)
        end = start + rng.normal(0, 200, 2) + 60
        t = np.cumsum(np.r_[0, rng.integers(4, 14, 30)])
        u = 10 * (t / t[-1]) ** 3 - 15 * (t / t[-1]) ** 4 + 6 * (t / t[-1]) ** 5
        xy = np.round(start + np.outer(u, end - start) + rng.normal(0, 1, (len(t), 2)))
        xy[0], xy[-1] = np.round(start), np.round(end)
        out.append(np.column_stack([t, xy]))
    return out


ALL_TEMPLATE = {
    "dur": {"kind": "template", "a": 300, "b": 100, "sd": 0.3},
    "path": {"kind": "template", "curv": 0.1, "tmix": 0.3, "tol": 20},
    "profile": {"kind": "uniform", "peak": 0.5},
    "sub": {"kind": "none", "mag": 0.1, "prob": 0.5, "frac": 0.9},
    "noise": {"kind": "smooth", "sd": 1, "rho": 0.8},
    "clock": {"kind": "template", "dt": 10, "cv": 0.3},
    "round": {"kind": "yes"},
}


class TestSegment(unittest.TestCase):
    def test_splits_on_gap_and_click(self):
        ev = [(i * 10, "MouseMovement", 100 + 10 * i, 100) for i in range(10)]
        ev += [(95, "MouseClick", None, None)]
        ev += [(1000 + i * 10, "MouseMovement", 300 + 10 * i, 100) for i in range(10)]
        ev.sort(key=lambda e: e[0])
        strokes = data.segment(ev)
        self.assertEqual(len(strokes), 2)
        self.assertEqual(strokes[1][0][0], 0)

    def test_drops_short_strokes(self):
        ev = [(i * 10, "MouseMovement", 100 + i, 100) for i in range(10)]
        self.assertEqual(data.segment(ev), [])


class TestGenerator(unittest.TestCase):
    def setUp(self):
        P.set_human(toy_humans())
        self.rng = np.random.default_rng(1)

    def check(self, genome):
        for _ in range(20):
            s = P.generate(genome, (100, 200), (500, 260), self.rng)
            self.assertTrue(np.all(np.diff(s[:, 0]) > 0))
            np.testing.assert_allclose(s[0, 1:], [100, 200])
            np.testing.assert_allclose(s[-1, 1:], [500, 260])
            self.assertGreaterEqual(len(s), 2)

    def test_naive_and_template(self):
        self.check(P.NAIVE)
        self.check(ALL_TEMPLATE)

    def test_every_mutation_is_valid(self):
        g = P.NAIVE
        for i in range(300):
            g = P.mutate(g, list(P.GENES)[i % len(P.GENES)], self.rng)
            for gene, spec in P.GENES.items():
                self.assertIn(g[gene]["kind"], spec["kinds"])
                for p, (lo, hi) in spec["params"].items():
                    self.assertTrue(lo <= g[gene][p] <= hi)
            self.check(g)

    def test_mutation_touches_one_gene(self):
        for gene in P.GENES:
            m = P.mutate(P.NAIVE, gene, self.rng)
            changed = [k for k in P.GENES if m[k] != P.NAIVE[k]]
            self.assertLessEqual(set(changed), {gene})

    def test_naive_is_straight_and_unrounded(self):
        s = P.generate(P.NAIVE, (0, 0), (301, 97), self.rng)
        self.assertAlmostEqual(P.f_straight(s)[1], 0.0, places=6)
        self.assertGreater(P.f_steps(s)[3], 0.5)


class TestFeatures(unittest.TestCase):
    def test_shapes_and_gaps(self):
        h = toy_humans(40)
        f = P.features(h)
        for g in P.GROUPS:
            self.assertEqual(f[g].shape, (40, P.WIDTH[g]))
            self.assertTrue(np.all(np.isfinite(f[g])))
        self.assertTrue(all(v < 1e-9 for v in P.gaps(f, f).values()))

    def test_copy_rate_flags_exact_copies(self):
        h = toy_humans(80, seed=3)
        G.COPY["bank"] = np.array([P.shape_vec(x) for x in h[:40]])
        G.COPY["ref"] = np.array([P.shape_vec(x) for x in h[40:]])
        self.assertEqual(G.copy_rate(h[:40]), 1.0)
        self.assertLess(G.copy_rate(toy_humans(40, seed=9)), 0.5)


class TestGame(unittest.TestCase):
    def test_equal_budget(self):
        P.set_human(toy_humans(300, seed=4))
        pool = toy_humans(300, seed=5)
        G.COPY["bank"] = np.array([P.shape_vec(x) for x in pool[:150]])
        G.COPY["ref"] = np.array([P.shape_vec(x) for x in toy_humans(150, seed=6)])
        old_n, calls = G.N_CTX, []
        G.N_CTX = 40
        real = G.cv_auroc
        G.cv_auroc = lambda *a, **k: calls.append("d") or real(*a, **k)
        real_mut = P.mutate
        P.mutate = lambda *a, **k: calls.append("i") or real_mut(*a, **k)
        try:
            for cond in G.CONDITIONS:
                calls.clear()
                pl = G.Player(cond, np.random.default_rng(0))
                G.detector_step(pl, pool, 1, 1)
                G.imitator_step(pl, pool, 1, 2)
                self.assertEqual(calls.count("d"), G.BUDGET, cond)
                self.assertEqual(calls.count("i"), G.BUDGET, cond)
                self.assertEqual(len(pl.groups), G.K)
                self.assertEqual(set(pl.shared), set(pl.groups))
        finally:
            G.N_CTX, G.cv_auroc, P.mutate = old_n, real, real_mut


if __name__ == "__main__":
    unittest.main()
