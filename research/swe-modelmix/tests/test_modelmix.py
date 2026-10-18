import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_modelmix import boot_ratio_of_medians, by_model_track, project_cv, runs_needed


class T(unittest.TestCase):
    def test_ratio_of_constant_samples(self):
        p, lo, hi = boot_ratio_of_medians([4.0] * 5, [1.0] * 5, reps=200)
        self.assertEqual((p, lo, hi), (4.0, 4.0, 4.0))

    def test_by_model_track_skips_unpriced_and_unnamed(self):
        runs = [{"track": "a", "model": "m", "cost_usd": 1},
                {"track": "a", "model": None, "cost_usd": 2},
                {"track": "a", "model": "m", "cost_usd": None}]
        self.assertEqual(by_model_track(runs), {"a": {"m": [1]}})

    def test_runs_needed_scales_with_inverse_square(self):
        self.assertAlmostEqual(runs_needed(1, 0.25) / runs_needed(1, 0.5), 4, delta=0.1)

    def test_runs_needed_known_value(self):
        self.assertEqual(runs_needed(1.0, 1.0), 16)  # 2*(2.8016)^2 = 15.7

    def test_project_cv(self):
        cv, n = project_cv([{"n_projects": 1}, {"n_projects": 3}, {"n_projects": None}])
        self.assertEqual(n, 2)
        self.assertAlmostEqual(cv, 0.5)


if __name__ == "__main__":
    unittest.main()
