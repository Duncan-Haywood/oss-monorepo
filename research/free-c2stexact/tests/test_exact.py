import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import exact


class T(unittest.TestCase):
    def test_mw_p_uniform_under_null(self):
        r = np.random.default_rng(0)
        ps = [exact.mw_p(r.normal(size=60), r.normal(size=60)) for _ in range(400)]
        self.assertLess(abs(np.mean(np.array(ps) < 0.05) - 0.05), 0.04)

    def test_mw_p_small_when_shifted(self):
        r = np.random.default_rng(1)
        self.assertLess(exact.mw_p(r.normal(1.5, 1, 80), r.normal(0, 1, 80)), 1e-6)

    def test_wilson_contains_point(self):
        lo, hi = exact.wilson(5, 100)
        self.assertLess(lo, 0.05)
        self.assertGreater(hi, 0.05)

    def test_gross_mismatch_rejected_by_all(self):
        p = exact.replicate(3, 150, dict(visc=0.1, coul=0.0, sd=0.02, kind="student3"), "raw")
        for k, v in p.items():
            self.assertLess(v, 0.01, k)

    def test_replicate_is_deterministic(self):
        a = exact.replicate(5, 60, exact.REAL, "raw")
        b = exact.replicate(5, 60, exact.REAL, "raw")
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
