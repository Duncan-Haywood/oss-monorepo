import os
import unittest
import numpy as np
from eda_cheapaware import bench, hv, screen
from eda_cheapaware.space import Space, load_table

TAB = os.path.join(os.path.dirname(__file__), "..", "experiments", "table.jsonl")


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sp = Space(load_table(TAB))

    def test_front_ranks_known(self):
        r = screen.front_ranks({"a": (0, 0), "b": (1, 1), "c": (2, 2), "d": (0, 3), "e": (3, 0)})
        self.assertEqual(r["a"], 0)
        self.assertEqual(r["b"], 1)
        self.assertEqual(r["c"], 2)
        self.assertEqual(r["d"], 1)
        self.assertEqual(r["e"], 1)

    def test_spread_is_distinct_and_deterministic_given_seed(self):
        a = screen.spread(self.sp, 6, np.random.default_rng(3))
        b = screen.spread(self.sp, 6, np.random.default_rng(3))
        self.assertEqual(a, b)
        self.assertEqual(len(set(a)), 6)

    def test_fit_recovers_exact_loglinear_cells(self):
        class Fake:
            lo, hi = [0.0], [1.0]
            def all(self): return list(self.d)
            def raw_cells(self, x): return self.d[x]
        f = Fake()
        f.d = {(i, j, k): float(np.exp(screen.features((i, j, k)) @ np.array([2.0, 1.0, 0.5, 0.3, 0.1])))
               for i in range(8) for j in range(5) for k in range(2)}
        pred = screen.fit_predict(f, list(f.d)[:30], ridge=1e-9)
        for x in f.d:
            self.assertAlmostEqual(pred[x], f.d[x], delta=1e-3 * f.d[x])

    def test_run_spends_exact_budget_without_repeats(self):
        for name in ("random", "tpe", "screen4", "cheaponly", "oracle", "cheaprandom"):
            order = bench.run_once(self.sp, name, 12, 1)
            self.assertEqual(len(order), 12)
            self.assertEqual(len(set(order)), 12)

    def test_oracle_finds_whole_front_in_front_size(self):
        n = len(hv.nondominated([self.sp.evaluate(x) for x in self.sp.all()]))
        order = bench.run_once(self.sp, "oracle", n, 0)
        self.assertAlmostEqual(bench.curve(self.sp, order, [n])[0], 1.0)

    def test_screen_beats_random_at_12_on_a_few_seeds(self):
        s = np.mean([bench.curve(self.sp, bench.run_once(self.sp, "screen4", 12, i), [12])[0] for i in range(10)])
        r = np.mean([bench.curve(self.sp, bench.run_once(self.sp, "random", 12, i), [12])[0] for i in range(10)])
        self.assertGreater(s, r)

    def test_cheaprandom_ignores_cell_counts_and_draws_best_cheap_layer_first(self):
        class Sp:
            def all(self): return [(0,), (1,), (2,), (3,)]
            def cheap(self, x): return {(0,): (0, 0), (1,): (1, 1), (2,): (0, 3), (3,): (3, 0)}[x]
        c = screen.CheapRandom([4], np.random.default_rng(0), None, Sp())
        self.assertEqual(c.propose({}), (0,))
        self.assertIn(c.propose({(0,): (9, 9, 9)}), [(1,), (2,), (3,)])
        # layer 1 holds (1,), (2,), (3,)? (1,1) dominates none of (0,3)/(3,0): yes all rank 1
        self.assertEqual(sorted(set(c.rank.values())), [0, 1])

    def test_cheaprandom_is_a_proper_random_baseline_here(self):
        # on the real table it must at least not lose to plain random at 12 over a few seeds
        s = np.mean([bench.curve(self.sp, bench.run_once(self.sp, "cheaprandom", 12, i), [12])[0] for i in range(20)])
        r = np.mean([bench.curve(self.sp, bench.run_once(self.sp, "random", 12, i), [12])[0] for i in range(20)])
        self.assertGreaterEqual(s, r - 0.02)


if __name__ == "__main__":
    unittest.main()
