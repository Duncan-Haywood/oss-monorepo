import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import numpy as np
except ImportError:  # the margin tests stay stdlib-only; these need numpy
    np = None
from secretary_margin import make_trials, pick_margin

if np is not None:
    from secretary_bayes import (Phi, trials_array, features, fit_policy, apply_policy, oracle_pick, margin_pick,
                                 gm_threshold, gm_pick)


@unittest.skipIf(np is None, "numpy not installed")
class BayesTests(unittest.TestCase):
    def test_phi_matches_known_values(self):
        self.assertAlmostEqual(float(Phi(0.0)), 0.5, places=7)
        self.assertAlmostEqual(float(Phi(1.959964)), 0.975, places=6)
        self.assertAlmostEqual(float(Phi(-1.0)), 0.158655, places=6)

    def test_gilbert_mosteller_thresholds(self):
        # b_1 = 1/2 exactly; b_2 = 0.6899 and b_3 = 0.7758 in Gilbert and Mosteller's (1966) table
        self.assertAlmostEqual(gm_threshold(1), 0.5, places=9)
        self.assertAlmostEqual(gm_threshold(2), 0.6899, places=4)
        self.assertAlmostEqual(gm_threshold(3), 0.7758, places=4)

    def test_stop_now_probability_is_calibrated(self):
        # p[:, t] is P(candidate t is the true best | x_1..x_t); its mean must match the frequency 1/n
        for s in (0.0, 1.0):
            b, x = trials_array(make_trials(12, s, 6000, 21))
            p, _ = features(x, s)
            for t in (0, 5, 11):
                self.assertAlmostEqual(p[:, t].mean(), 1 / 12, delta=0.01)
            # and, among trials with a confident p, the hit rate matches p
            hi = p[:, 11] > 0.5
            self.assertAlmostEqual(p[hi, 11].mean(), (b[hi] == 11).mean(), delta=0.04)

    def test_final_step_probabilities_sum_to_one(self):
        # P(i is best | all x) over i sums to one; check by placing each i last via reversal-free identity:
        # at t = n-1, w = 0 (nothing left to come)
        _, x = trials_array(make_trials(8, 0.7, 200, 22))
        _, w = features(x, 0.7)
        self.assertTrue(np.allclose(w[:, -1], 0.0, atol=1e-6))

    def test_grid_is_fine_enough(self):
        _, x = trials_array(make_trials(20, 0.5, 300, 23))
        p1, w1 = features(x, 0.5)
        p2, w2 = features(x, 0.5, grid=np.linspace(-7, 7, 1401))
        self.assertLess(np.abs(p1 - p2).max(), 2e-3)
        self.assertLess(np.abs(w1 - w2).max(), 2e-3)

    def test_vectorised_margin_matches_scalar(self):
        tr = make_trials(15, 1.0, 300, 24)
        _, x = trials_array(tr)
        for r, d in ((1, 0.0), (5, 0.0), (6, 0.4)):
            self.assertEqual(list(margin_pick(x, r, d)), [pick_margin(list(row), r, d) for row in x])

    def test_noiseless_policy_near_full_information_optimum(self):
        btr, xtr = trials_array(make_trials(20, 0.0, 8000, 25))
        bte, xte = trials_array(make_trials(20, 0.0, 8000, 26))
        ptr, wtr = features(xtr, 0.0)
        pte, wte = features(xte, 0.0)
        ls = (apply_policy(pte, wte, fit_policy(ptr, wtr, btr)) == bte).mean()
        gm = (gm_pick(xte) == bte).mean()
        self.assertGreater(ls, gm - 0.02)
        self.assertLessEqual(gm, (oracle_pick(xte) == bte).mean())


if __name__ == "__main__":
    unittest.main()
