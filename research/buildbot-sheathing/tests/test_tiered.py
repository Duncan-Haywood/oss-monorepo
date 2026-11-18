"""Milestone 45: the two-tier (hold-first) preload on a contact small enough to solve by hand."""
import numpy as np
import pytest

pytest.importorskip("scipy")
from buildbot_sheathing import tiered as TI  # noqa: E402


class Toy:
    """One contact (fx, fy, fz), weight 10 N on fz, friction pyramid mu 0.5; two joints coupled through fx:
    tau = (0.2 + fx, 0.4 - fx), so with tau_f 0.2 the margins are fx and 0.2 - fx."""
    k = 1
    Aeq = np.vstack([[0.0, 0.0, 1.0], np.zeros((5, 3))])
    beq = np.array([10.0, 0, 0, 0, 0, 0])
    Ain = np.array([[1, 0, -.5], [-1, 0, -.5], [0, 1, -.5], [0, -1, -.5], [0, 0, -1.0]])
    T = np.array([[1.0, 0, 0], [-1.0, 0, 0]])
    tau0 = np.array([0.2, 0.4])

    def tau(self, f):
        return self.tau0 + self.T @ f

    def residuals(self, f):
        return float(np.max(np.abs(self.Aeq @ f - self.beq))), float(max(0.0, np.max(self.Ain @ f)))


ROWS, KAP, D = np.array([0, 1]), np.array([1.0, 1.0]), np.array([-0.2, -0.2])


def test_tier_lp_trades_the_rest_for_the_top_row():
    c = Toy()
    t, _ = TI.tier_lp(c, ROWS, KAP, D, [True, True], [0.0, 0.0])
    assert t == pytest.approx(0.1)                       # the common margin: both rows at 0.1
    t, _ = TI.tier_lp(c, ROWS, KAP, D, [True, False], [0.0, 0.0])
    assert t == pytest.approx(0.2)                       # top row alone, the other allowed to its threshold
    t, f = TI.tier_lp(c, ROWS, KAP, D, [True, False], [0.0, 0.05])
    assert t == pytest.approx(0.15)
    assert c.tau(f)[1] - 0.2 >= 0.05 - 1e-9


def test_tier_lp_goes_negative_then_infeasible_as_the_floor_rises():
    t, _ = TI.tier_lp(Toy(), ROWS, KAP, D, [True, False], [0.0, 0.3])
    assert t == pytest.approx(-0.1)                      # the top row must cross its threshold
    assert TI.tier_lp(Toy(), ROWS, KAP, D, [True, False], [0.0, 6.0]) == (None, None)  # beyond friction


def test_solve_tiered_meets_each_target_at_least_leg_torque():
    c = Toy()
    f = TI.solve_tiered(c, [0, 1], ROWS, KAP, D, [0.12, 0.05])
    assert f is not None
    assert f[0] == pytest.approx(0.12, abs=1e-5)          # unconstrained optimum is fx 0.1; the target binds
    eq, cone = c.residuals(f)
    assert eq < 1e-6 and cone < 1e-6
    assert TI.solve_tiered(c, [0, 1], ROWS, KAP, D, [0.15, 0.1]) is None


def test_row_mask():
    assert list(TI.row_mask(np.array([3, 5, 5, 7]), [5])) == [False, True, True, False]
