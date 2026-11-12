"""Tests for milestone 79's zoned quantile threshold and the hypergeometric catch (numpy; skipped without)."""
import importlib.util, os, unittest

try:
    import numpy as np
    HERE = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location(
        "qb", os.path.join(HERE, "..", "experiments", "quantile_budget", "analyze.py"))
    qb = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(qb)
    HAVE = True
except ImportError:
    HAVE = False


@unittest.skipUnless(HAVE, "numpy missing")
class QuantileBudgetTests(unittest.TestCase):
    def setUp(self):
        self.cal = np.arange(400, dtype=float).reshape(4, 100)  # zone split at column 80
        self.main = np.arange(100) < 80

    def test_zero_budget_is_the_zoned_maximum(self):
        th = qb.fit_zoned_quantile(self.cal, self.main, 0.0)
        self.assertEqual(th[0], self.cal[:, self.main].max())
        self.assertEqual(th[-1], self.cal[:, ~self.main].max())

    def test_budget_bounds_in_sample_flag_rate(self):
        rng = np.random.default_rng(0)
        cal = rng.lognormal(size=(40, 100))
        for f in (0.001, 0.01, 0.05):
            th = qb.fit_zoned_quantile(cal, self.main, f)
            self.assertLessEqual(np.mean(cal > th), f + 1e-12)

    def test_threshold_falls_as_budget_grows(self):
        ths = [qb.fit_zoned_quantile(self.cal, self.main, f)[0] for f in (0.0, 0.01, 0.1)]
        self.assertTrue(ths[0] >= ths[1] >= ths[2])

    def test_catch_closed_forms(self):
        self.assertEqual(qb.catch(0, 5, 75), 0.0)
        self.assertEqual(qb.catch(75, 5, 75), 1.0)
        self.assertAlmostEqual(qb.catch(15, 1, 75), 0.2)
        self.assertAlmostEqual(qb.catch(1, 5, 75), 5 / 75)


if __name__ == "__main__":
    unittest.main()
