"""(robofab-edgeconv, quality fix 2026-11-14) The trapezoid comparator must be converged in its ramp fraction:
the 2026-11-07 quality audit found best_trap's optimum at the grid floor (0.002) in the speed-limited rows."""
import math
import unittest
from robofab_edgeconv import topp, trap
from robofab_edgeconv.model import Arm
from robofab_edgeconv.geometry import GRIPPER, targets, min_link, best_base

# the first part of run.py's 0.12 m row (k = none, wmax = 1 rad/s), built exactly as run.py builds it
_PTS = targets()
_L = round(min_link(100.0, _PTS, step=10.0, lo=40, hi=400) / 1000 * 1.5, 3)
_BASE = best_base(_L * 1000, _L * 1000, 100.0, _PTS, step=10.0)
_NM, _P = next(iter(_PTS.items()))
_B = GRIPPER[_NM]
M = 1240.0 * (_B[3] - _B[0]) * (_B[4] - _B[1]) * (_B[5] - _B[2]) * 1e-9
ARM = Arm(_L, _L, _L, _L, 0.1 + M)
QA, QB = [ARM.ik(math.hypot(_P[k][0] - _BASE[0], _P[k][1] - _BASE[1]) / 1000, _P[k][2] / 1000 - 0.1, -1) for k in ("pick", "lift")]
FR = (0.002, 0.005, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5)


class ConvergedTrap(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.grid = trap.best_trap(ARM, QA, QB, 5.0, M, 1e9, wmax=1.0, fracs=FR, ramp_samples=40)
        cls.conv = trap.converged_trap(ARM, QA, QB, 5.0, M, 1e9, wmax=1.0, dense=21, iters=20)

    def test_grid_optimum_sits_at_the_grid_floor(self):
        # the defect: at 1 rad/s the 14-value grid's best fraction is its smallest one, so it is not an optimum
        self.assertEqual(self.grid[1], min(FR))

    def test_converged_optimum_is_interior_and_below_the_grid(self):
        T, f, interior = self.conv
        self.assertTrue(interior)
        self.assertLess(f, min(FR))
        self.assertLessEqual(T, self.grid[0] + 1e-6)

    def test_golden_section_improves_on_its_own_grid(self):
        best_grid = min(trap.min_time_trap(ARM, QA, QB, 5.0, M, 1e9, f, wmax=1.0, tol=1e-6, ramp_samples=40)
                        for f in trap.log_grid(1e-5, 0.5, 21))
        self.assertLess(self.conv[0], best_grid - 1e-6)

    def test_never_below_speed_bound(self):
        dmax = max(abs(QB[0] - QA[0]), abs(QB[1] - QA[1]))
        self.assertGreater(self.conv[0], dmax / 1.0)

    def test_converged_trap_is_feasible(self):
        T, f, _ = self.conv
        r = trap.move(ARM, QA, QB, T * 1.0001, f, mass=M, ramp_samples=200)
        self.assertLessEqual(max(r["tau1"], r["tau2"]), 5.0 * 1.001)
        dmax = max(abs(QB[0] - QA[0]), abs(QB[1] - QA[1]))
        self.assertLessEqual(dmax / (T * (1 - f)), 1.0 + 1e-9)

    def test_solver_beats_converged_trap(self):
        # a feasible trapezoid is an upper bound on the time-optimal profile, so at a converged n the solver wins
        p = topp.solve(ARM, QA, QB, 5.0, n=6400, wmax=1.0)
        self.assertLessEqual(p["T"], self.conv[0] * (1 + 1e-4))

    def test_infeasible_returns_none(self):
        heavy = Arm(0.5, 0.5, 5.0, 5.0, 1.0)
        self.assertIsNone(trap.converged_trap(heavy, (0.0, 0.5), (0.5, 0.5), 0.5, 1.0, 1e9, wmax=1.0, dense=5, iters=2))


if __name__ == "__main__":
    unittest.main()
