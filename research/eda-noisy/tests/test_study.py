import os
import sys
import unittest
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "eda-proposers", "src"))
from eda_noisy import study                      # noqa: E402
from eda_proposers import proposers, table       # noqa: E402

ROWS = table.load_table(study.TABLE)
TPE = proposers.TPE


class T(unittest.TestCase):
    def test_zero_sigma_is_the_true_space(self):
        a, b = table.Space(ROWS), study.NoisySpace(ROWS, 0.0, 3)
        for x in a.all():
            self.assertEqual(a.evaluate(x), b.evaluate(x))

    def test_noise_is_persistent_per_design(self):
        s = study.NoisySpace(ROWS, 0.2, 1)
        x = s.all()[5]
        self.assertEqual(s.evaluate(x), s.evaluate(x))

    def test_noise_differs_across_seeds_and_has_right_scale(self):
        e = [study.NoisySpace(ROWS, 0.2, k).err for k in range(30)]
        self.assertNotEqual(e[0][(0, 0, 0)].tolist(), e[1][(0, 0, 0)].tolist())
        v = np.concatenate([np.array(list(d.values())).ravel() for d in e])
        self.assertAlmostEqual(float(v.std()), 0.2, delta=0.01)

    def test_full_budget_scores_one_whatever_the_noise(self):
        self.assertAlmostEqual(study.run(ROWS, TPE, 0.5, 80, 0), 1.0)

    def test_ratio_in_unit_interval_and_deterministic(self):
        r = study.run(ROWS, TPE, 0.2, 16, 4)
        self.assertTrue(0 < r <= 1.0)
        self.assertEqual(r, study.run(ROWS, TPE, 0.2, 16, 4))

    def test_found_set_is_scored_on_true_objectives(self):
        # The same picks must score the same whatever noise the proposer saw: scoring is on the truth, not the view.
        from eda_proposers import bench
        order = bench.run_once(study.NoisySpace(ROWS, 0.8, 2), TPE, 16, 2)
        expect = study.hv_ratio(table.Space(ROWS), order, 16)
        self.assertNotAlmostEqual(expect, study.hv_ratio(study.NoisySpace(ROWS, 0.8, 2), order, 16), places=6)
        self.assertEqual(study.run(ROWS, TPE, 0.8, 16, 2), expect)

    def test_ratio_uses_exactly_the_first_budget_designs(self):
        # Hand check against the front: the 12 true-front designs alone score 1.0; dropping one scores below 1.0.
        from eda_proposers.hv import nondominated
        sp = table.Space(ROWS)
        front = set(nondominated([sp.evaluate(x) for x in sp.all()]))
        fx = [x for x in sp.all() if sp.evaluate(x) in front]
        self.assertEqual(len(fx), 12)
        self.assertAlmostEqual(study.hv_ratio(sp, fx, 12), 1.0)
        self.assertLess(study.hv_ratio(sp, fx, 11), 1.0)


if __name__ == "__main__":
    unittest.main()
