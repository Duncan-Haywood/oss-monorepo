import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from eda_latencyhalve import screen as S  # noqa: E402

ROWS = [{"id": i, "v": v, "w": w} for i, (v, w) in enumerate([(3, 1), (1, 3), (2, 2), (1, 2)])]
V, Wt = (lambda r: r["v"]), (lambda r: r["w"])


class Screen(unittest.TestCase):
    def test_order_breaks_ties_by_index(self):
        self.assertEqual(S.order(ROWS, V), [1, 3, 2, 0])

    def test_best_in_top_k(self):
        # screen V picks designs 1 and 3 first; their true (W) values are 3 and 2
        self.assertEqual(S.best_in_top_k(ROWS, V, Wt, 1), 3)
        self.assertEqual(S.best_in_top_k(ROWS, V, Wt, 2), 2)
        self.assertEqual(S.best_in_top_k(ROWS, V, Wt, 4), 1)

    def test_optimum_rank(self):
        self.assertEqual(S.optimum_rank(ROWS, V, Wt), 4)  # truth W is best at design 0, last in V's order
        self.assertEqual(S.optimum_rank(ROWS, V, V), 1)

    def test_capture_full_k_is_certain(self):
        p, ratio = S.capture_probability(ROWS, V, Wt, 3, 3, 200)
        self.assertEqual((p, ratio), (1.0, 1.0))

    def test_capture_perfect_screen(self):
        p, ratio = S.capture_probability(ROWS, Wt, Wt, 3, 1, 200)
        self.assertEqual((p, ratio), (1.0, 1.0))

    def test_capture_k1_exact_value(self):
        # pools of 2 from 4 designs, screen V, truth W: enumerate by hand over the 6 pairs
        # pair (0,1): V picks 1 (W=3) vs best 1(W=... ) -> computed by brute force below
        import itertools
        hits = 0
        for a, b in itertools.combinations(range(4), 2):
            pick = min((a, b), key=lambda i: (ROWS[i]["v"], i))
            best = min(ROWS[a]["w"], ROWS[b]["w"])
            hits += ROWS[pick]["w"] == best
        p, _ = S.capture_probability(ROWS, V, Wt, 2, 1, 20000, seed=1)
        self.assertAlmostEqual(p, hits / 6, delta=0.02)

    def test_wilson_known(self):
        lo, hi = S.wilson(50, 100)
        self.assertAlmostEqual(lo, 0.4038, places=3)
        self.assertAlmostEqual(hi, 0.5962, places=3)

    def test_committed_data(self):
        rows = S.load(Path(__file__).resolve().parents[1] / "experiments" / "mapped.json")
        self.assertEqual(len(rows), 40)
        self.assertEqual(S.optimum_rank(rows, S.TRUTH["area x latency"], S.TRUTH["area x latency"]), 1)


if __name__ == "__main__":
    unittest.main()
