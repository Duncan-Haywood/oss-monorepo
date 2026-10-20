import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import twin


class T(unittest.TestCase):
    def test_no_friction_keeps_amplitude(self):
        # released at rest, the undamped pendulum never exceeds its starting angle and swings through zero
        x = twin.simulate(np.array([1.0]), 0.0, 0.0, steps=200)[0]
        self.assertLess(x.max(), 1.0 + 1e-6)
        self.assertGreater(x.max(), 1.0 - 1e-3)
        self.assertLess(x.min(), -0.99)

    def test_friction_decays(self):
        a = twin.simulate(np.array([1.5]), 0.3, 0.3)
        self.assertLess(np.abs(a[0, -20:]).max(), np.abs(a[0, :20]).max())

    def test_noise_sd_matches(self):
        r = np.random.default_rng(0)
        for k in ("gauss", "student3"):
            self.assertAlmostEqual(twin.noise(r, 400000, 0.05, k).std(), 0.05, delta=0.004)

    def test_unknown_noise_raises(self):
        with self.assertRaises(ValueError):
            twin.noise(np.random.default_rng(0), 3, 1, "x")

    def test_null_c2st_near_chance(self):
        r = np.random.default_rng(1)
        a = twin.dataset(r, 600, 0.1, 0.2, 0.02, "student3")[2]
        b = twin.dataset(r, 600, 0.1, 0.2, 0.02, "student3")[2]
        auc, _ = twin.c2st(a, b, "raw", "logreg")
        self.assertAlmostEqual(auc, 0.5, delta=0.06)

    def test_gross_mismatch_detected(self):
        r = np.random.default_rng(2)
        a = twin.dataset(r, 600, 0.1, 0.4, 0.02, "gauss")[2]
        b = twin.dataset(r, 600, 0.1, 0.0, 0.02, "gauss")[2]
        auc, _ = twin.c2st(a, b, "raw", "gboost")
        self.assertGreater(auc, 0.8)

    def test_logreg_blind_to_symmetric_mismatch(self):
        # initial angles are symmetric about 0, so a linear rule on raw angles cannot separate friction levels
        r = np.random.default_rng(2)
        a = twin.dataset(r, 600, 0.1, 0.4, 0.02, "gauss")[2]
        b = twin.dataset(r, 600, 0.1, 0.0, 0.02, "gauss")[2]
        self.assertAlmostEqual(twin.c2st(a, b, "raw", "logreg")[0], 0.5, delta=0.06)

    def test_paired_rmse_zero_for_exact_twin(self):
        r = np.random.default_rng(3)
        th0, clean, _ = twin.dataset(r, 50, 0.1, 0.2, 0.02, "gauss")
        self.assertLess(twin.paired_rmse(th0, clean, 0.1, 0.2), 1e-12)


if __name__ == "__main__":
    unittest.main()
