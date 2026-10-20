import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mmd


class T(unittest.TestCase):
    def test_mmd_identical_distribution_near_zero(self):
        r = np.random.default_rng(0)
        a, b = r.normal(size=(300, 5)), r.normal(size=(300, 5))
        self.assertAlmostEqual(mmd.mmd2(a, b), 0.0, delta=0.01)

    def test_mmd_detects_shift(self):
        r = np.random.default_rng(1)
        a, b = r.normal(size=(300, 5)), r.normal(size=(300, 5)) + 1.0
        self.assertGreater(mmd.mmd2(a, b), 0.05)

    def test_mmd_unbiased_can_be_negative_and_symmetric(self):
        r = np.random.default_rng(2)
        a, b = r.normal(size=(50, 3)), r.normal(size=(50, 3))
        self.assertAlmostEqual(mmd.mmd2(a, b, 1.0), mmd.mmd2(b, a, 1.0), places=12)

    def test_noise_sd_matches(self):
        r = np.random.default_rng(0)
        for k in ("gauss", "student3"):
            self.assertAlmostEqual(mmd.noise(r, 400000, 0.05, k).std(), 0.05, delta=0.004)

    def test_unknown_inputs_raise(self):
        with self.assertRaises(ValueError):
            mmd.noise(np.random.default_rng(0), 3, 1, "x")
        with self.assertRaises(ValueError):
            mmd.features(np.zeros((2, 5)), "x")

    def test_resid_shape(self):
        self.assertEqual(mmd.features(np.zeros((4, STEPS := 100)), "resid").shape, (4, 98))

    def test_threshold_and_power(self):
        thr = mmd.threshold(np.arange(100.0))
        self.assertAlmostEqual(thr, 94.05)
        p, lo, hi = mmd.power([100.0] * 10, thr)
        self.assertEqual(p, 1.0)
        self.assertLess(lo, 1.0)

    def test_friction_mismatch_detected_by_mmd_raw(self):
        r = np.random.default_rng(3)
        real = mmd.sample(r, 300, 0.1, 0.4, 0.02, "gauss")
        nul = [mmd.mmd2(mmd.sample(r, 300, 0.1, 0.4, 0.02, "gauss"), mmd.sample(r, 300, 0.1, 0.4, 0.02, "gauss")) for _ in range(5)]
        twin = mmd.sample(r, 300, 0.1, 0.0, 0.02, "gauss")
        self.assertGreater(mmd.mmd2(real, twin), max(nul))


if __name__ == "__main__":
    unittest.main()
