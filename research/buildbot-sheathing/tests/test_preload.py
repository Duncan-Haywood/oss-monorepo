"""Milestone 37: the preload's constraint rows, the settle model and the hedged compensator."""
import numpy as np

from buildbot_sheathing import preload as PL
from buildbot_sheathing.pose_range import held_bias

TF, GAP = 0.2, 1e-3


def test_margin_rows_push_each_joint_away_from_the_threshold_on_its_own_side():
    tau = np.array([0.5, -0.3, 0.1, -0.05, 9.0])
    rows, kap, d = PL.margin_rows(tau, [0, 1, 2, 3], TF)
    assert list(rows) == [0, 1, 2, 2, 3, 3]
    val = kap * tau[rows] + d                       # each row's margin at the nominal torques
    assert np.allclose(val, [0.3, 0.1, 0.1, 0.3, 0.25, 0.15])
    assert 4 not in rows                            # joints outside idx are left alone


def test_settle_restores_balance_with_the_smallest_change():
    class C:                                        # two vertical contacts under a 6-row base balance
        pass
    rng = np.random.default_rng(0)
    c = C()
    c.Aeq = rng.normal(size=(6, 12))
    f_plan = rng.normal(size=12)
    c.beq = c.Aeq @ f_plan + rng.normal(size=6)
    f = PL.settle(c, f_plan)
    assert np.allclose(c.Aeq @ f, c.beq)
    df = f - f_plan                                 # min-norm: in the row space of Aeq
    assert np.allclose(df, c.Aeq.T @ np.linalg.lstsq(c.Aeq.T, df, rcond=None)[0])
    c.beq = c.Aeq @ f_plan                          # already balanced: no change
    assert np.allclose(PL.settle(c, f_plan), f_plan)


def test_hedge_takes_a_quarter_gap_inside_the_band_only():
    lo = np.array([0.21, 0.5, 0.19, -0.6, 0.25])
    hi = np.array([0.30, 0.6, 0.21, -0.7, -0.25])
    plain = held_bias(lo, hi, TF, GAP)
    h = PL.hedged_bias(lo, hi, TF, GAP, 0.02)
    assert h[0] == -GAP / 4 and h[2] == -GAP / 4   # near tau_f: held (0) and loose (2) both hedge
    assert h[1] == plain[1] and h[3] == plain[3]    # far from tau_f: unchanged
    assert h[4] == 0.0                              # sign change over the press range: loose, no hedge
    assert np.array_equal(PL.hedged_bias(lo, hi, TF, GAP, 0.0), plain)


def test_flips_counts_status_and_side_changes():
    t_hat = (np.array([0.3, 0.1, 0.3, 0.5]), np.array([0.3, 0.1, 0.3, 0.5]))
    t = (np.array([0.1, 0.3, 0.3, -0.5]), np.array([0.1, 0.3, 0.4, -0.5]))
    assert list(PL.flips(t, t_hat, TF)) == [True, True, False, True]
