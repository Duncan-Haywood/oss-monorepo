import math
import unittest
from robofab_rampopt.model import Arm
from robofab_rampopt import trap


class RefineTest(unittest.TestCase):
    def setUp(self):
        self.arm = Arm(0.12, 0.12, 0.12, 0.12, 0.2)
        self.qa, self.qb = (0.3, 1.2), (1.0, 0.6)
        self.fr = (0.01, 0.05, 0.1, 0.2, 0.3, 0.5)
        self.kw = dict(mu=0.5, wmax=2.0, ramp_samples=10)

    def test_never_worse_than_grid_and_inside_bracket(self):
        best = trap.best_trap(self.arm, self.qa, self.qb, 5.0, 0.01, 1e9, fracs=self.fr, **self.kw)
        T, f, ev = trap.refine_trap(self.arm, self.qa, self.qb, 5.0, 0.01, 1e9, best, self.fr, iters=6, **self.kw)
        self.assertLessEqual(T, best[0])
        i = self.fr.index(best[1])
        self.assertTrue(self.fr[max(i - 1, 0)] - 1e-12 <= f <= self.fr[min(i + 1, len(self.fr) - 1)] + 1e-12)
        self.assertGreater(ev, 6)

    def test_refined_time_is_feasible(self):
        best = trap.best_trap(self.arm, self.qa, self.qb, 5.0, 0.01, 1e9, fracs=self.fr, **self.kw)
        T, f, _ = trap.refine_trap(self.arm, self.qa, self.qb, 5.0, 0.01, 1e9, best, self.fr, iters=6, **self.kw)
        r = trap.move(self.arm, self.qa, self.qb, T, f, mu=0.5, mass=0.01, ramp_samples=10)
        self.assertLessEqual(max(r["tau1"], r["tau2"]), 5.0 + 1e-3)


if __name__ == "__main__":
    unittest.main()
