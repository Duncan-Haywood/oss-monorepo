import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_extinction_qsd.qsd import mean_times, qsd


class QSD(unittest.TestCase):
    def test_distribution_normalised_and_positive(self):
        lam, d, _ = qsd(0.02, 50.0, 200.0, nmax=12, kmax=6)
        self.assertAlmostEqual(sum(d.values()), 1.0, places=9)
        self.assertGreater(lam, 0)
        self.assertTrue(all(v >= 0 for v in d.values()))

    def test_qsd_start_gives_exact_exponential_mean(self):
        # Started from the QSD, extinction time is exactly exponential: sum_s qsd(s) * T(s) = 1/lambda0.
        lam, d, _ = qsd(0.03, 50.0, 150.0, nmax=14, kmax=6)
        h = mean_times(0.03, 50.0, 150.0, nmax=14, kmax=6)
        m = sum(p * h[s] for s, p in d.items())
        self.assertAlmostEqual(m * lam, 1.0, places=5)

    def test_no_births_limit(self):
        # Almost no kits and a tiny fleet cap: one machine dies at rate 1/L, so lambda0 -> 1/L.
        lam, _, _ = qsd(1e-9, 50.0, 100.0, nmax=1, kmax=1)
        self.assertAlmostEqual(lam * 100.0, 1.0, places=5)

    def test_more_machines_last_longer(self):
        h = mean_times(0.03, 50.0, 150.0, nmax=14, kmax=6)
        self.assertGreater(h[(0, 3, 0)], h[(0, 1, 0)])


if __name__ == "__main__":
    unittest.main()
