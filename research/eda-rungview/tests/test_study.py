import os
import sys
import unittest
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "eda-proposers", "src"))
from eda_rungview import study                    # noqa: E402
from eda_proposers import proposers               # noqa: E402

ROWS = study.load_rows()


class T(unittest.TestCase):
    def test_40_designs_scaled_to_unit_range(self):
        v = study.View(ROWS, "true")
        y = np.array([v.evaluate(x) for x in v.all()])
        self.assertEqual(len(y), 40)
        self.assertTrue(np.allclose(y.min(0), 0) and np.allclose(y.max(0), 1))

    def test_true_view_has_zero_error_against_itself(self):
        e, sp = study.view_error(ROWS, "true")
        self.assertTrue(np.allclose(e, 0) and np.allclose(sp, 1))

    def test_error_objective_is_shared_between_views(self):
        e, _ = study.view_error(ROWS, "cells")
        self.assertEqual(e[2], 0.0)

    def test_scoring_the_whole_space_gives_one(self):
        t = study.View(ROWS, "true")
        self.assertAlmostEqual(study.hv_ratio(t, t.all(), 40), 1.0)

    def test_searching_the_true_view_matches_scoring_it(self):
        a = study.run(ROWS, proposers.TPE, "true", 12, 3)
        b = study.run(ROWS, proposers.TPE, "true", 12, 3)
        self.assertEqual(a, b)
        self.assertTrue(0 < a <= 1)

    def test_zero_sigma_noisy_equals_true_view(self):
        self.assertEqual(study.run(ROWS, proposers.TPE, "noisy", 12, 4, sigma=0.0), study.run(ROWS, proposers.TPE, "true", 12, 4))


if __name__ == "__main__":
    unittest.main()
