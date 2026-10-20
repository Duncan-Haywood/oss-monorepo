import os, sys, unittest
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import threshold  # noqa: E402


class T(unittest.TestCase):
    def test_quantile_threshold_gives_nominal_fpr(self):
        rng = np.random.default_rng(0)
        s = np.concatenate([rng.normal(0, 1, 10000), rng.normal(2, 1, 10000)])
        y = np.concatenate([np.zeros(10000), np.ones(10000)])
        thr = threshold.human_quantile_threshold(s, y)
        self.assertAlmostEqual(threshold.rates(s, y, thr)["fpr"], 0.05, places=2)

    def test_rates(self):
        r = threshold.rates([0.1, 0.9, 0.2, 0.8], [0, 0, 1, 1], 0.5)
        self.assertEqual(r, {"fpr": 0.5, "tpr": 0.5})

    def test_wilson_contains_p_and_is_ordered(self):
        lo, hi = threshold.wilson(5, 100)
        self.assertTrue(lo < 0.05 < hi)
        self.assertTrue(0 <= lo < hi <= 1)

    def test_suite_loads_all_families(self):
        items = threshold.load()
        self.assertEqual(sorted({i["family"] for i in items}), threshold.FAMILIES)

    def test_run_on_toy_detector(self):
        items = [{"family": f, "y": i % 2, "text": ("moreover " if i % 2 else "lol ") * 3 + str(i)}
                 for f in ("a", "b", "c") for i in range(60)]
        res = threshold.run(items, families=["a"], fitter=lambda t, y: (lambda x: [1.0 * ("moreover" in s) for s in x]))
        self.assertEqual(res["a"]["tpr"], 1.0)
        self.assertEqual(res["a"]["fpr"], 0.0)


if __name__ == "__main__":
    unittest.main()
