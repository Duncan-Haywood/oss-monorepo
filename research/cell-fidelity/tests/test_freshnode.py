import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "freshnode"
spec = importlib.util.spec_from_file_location("freshnode_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["freshnode_run"] = run
spec.loader.exec_module(run)


class FreshNode(unittest.TestCase):
    def test_fresh_picks_avoid_5z_and_are_fixed(self):
        used = set(run.used_picks(12))
        p = run.fresh_picks(range(64), 12)
        self.assertEqual(len(p), 8)
        self.assertFalse(used & set(p))
        self.assertEqual(p, [5, 13, 19, 20, 22, 33, 38, 50])
        self.assertEqual(run.fresh_picks(range(64), 8), [11, 18, 19, 20, 30, 36, 47, 55])

    def test_ranks_and_spearman(self):
        self.assertEqual(run.ranks([3.0, 1.0, 1.0, 2.0]), [4.0, 1.5, 1.5, 3.0])
        self.assertAlmostEqual(run.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(run.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertEqual(run.spearman([1, 1, 1], [1, 2, 3]), 0.0)

    def test_gate(self):
        hs = [[0.0, v] for v in (0.5, 0.7, 0.9, 1.1)]
        self.assertTrue(run.gate_fires([100, 120, 140, 160], hs)[0])
        self.assertFalse(run.gate_fires([160, 140, 120, 100], hs)[0])

    def test_line_profile_clips_and_fits(self):
        hs = [[1.0, 0.0], [2.0, 1.0], [3.0, 2.0]]
        self.assertEqual(run.line_profile([1, 2, 3], hs, 2), [2.0, 1.0])
        self.assertEqual(run.line_profile([1, 2, 3], hs, 10), [3.0, 3.0])
        self.assertEqual(run.line_profile([1, 2, 3], hs, -5), [0.0, 0.0])

    def test_knn_profile(self):
        t, d = run.knn_profile([0.0, 0.0], [[0, 0], [1, 1], [0.1, 0], [5, 5]], [[1.0], [2.0], [3.0], [9.0]])
        self.assertEqual(t, [2.0])
        self.assertAlmostEqual(d, 2 ** 0.5)

    def test_sign_p(self):
        self.assertAlmostEqual(run.sign_p(12, 16), 0.0384063720703125)
        self.assertEqual(run.sign_p(0, 4), 1.0)


if __name__ == "__main__":
    unittest.main()
