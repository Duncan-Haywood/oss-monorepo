"""Smoke tests for the MuJoCo benchmark (milestone 3): determinism, pairing, and the analysis helpers."""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "m3_benchmark"))
try:
    import numpy as np
    import pairs
    HAVE = True
except ImportError:
    HAVE = False


@unittest.skipUnless(HAVE, "needs numpy and mujoco")
class TestBenchmark(unittest.TestCase):
    def test_deterministic_and_bounded(self):
        c = pairs.sample_contexts(3, 1)
        for x in c:
            a, b = pairs.episode(x, {"fl": 1.0}), pairs.episode(x, {"fl": 1.0})
            self.assertEqual(a, b)
            self.assertTrue(0.0 <= a <= 1.0)

    def test_twin_ignores_disturbance_seed(self):
        c = pairs.sample_contexts(1, 2)[0].copy()
        d = c.copy(); d[5] += 1
        self.assertEqual(pairs.episode(c), pairs.episode(d))

    def test_real_depends_on_seed(self):
        c = pairs.sample_contexts(1, 2)[0].copy()
        d = c.copy(); d[5] += 1
        self.assertNotEqual(pairs.episode(c, {}), pairs.episode(d, {}))

    def test_large_delay_hurts(self):
        c = pairs.sample_contexts(4, 3)
        base = np.mean([pairs.episode(x, {}) for x in c])
        slow = np.mean([pairs.episode(x, {"delay": 12}) for x in c])
        self.assertLess(slow, base - 0.2)

    def test_analysis_helpers(self):
        # several experiments ship an analyse.py; load this one by path so a
        # module of the same name cached by another test cannot shadow it
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "m3_analyse", os.path.join(os.path.dirname(__file__), "..", "experiments", "m3_benchmark", "analyse.py"))
        analyse = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(analyse)
        self.assertAlmostEqual(analyse.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(analyse.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertAlmostEqual(analyse.ks_distance(np.array([0., 1.]), np.array([0., 1.])), 0.0)
        self.assertAlmostEqual(analyse.ks_distance(np.array([0., 0.1]), np.array([1., 2.])), 1.0)


if __name__ == "__main__":
    unittest.main()
