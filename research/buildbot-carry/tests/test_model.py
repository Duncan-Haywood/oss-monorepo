import mujoco
import numpy as np
import pytest

from buildbot_carry import model as C
from buildbot_payload import fetch, model as P


@pytest.fixture(scope="module")
def g1():
    if not fetch.available("g1"):
        pytest.skip("Menagerie models cannot be fetched")
    r = P.load("g1")
    return r, P.standing(r)


def test_carry_rate_arithmetic():
    # 10 m each way at 1 m/s is 20 s, plus 10 s handling = 30 s a trip; 2 pieces a trip = 4 a minute
    assert C.carry_rate(2, 1.0, 10, 10) == pytest.approx(4.0)
    assert C.lipm_speed(0.5, 0.5) == pytest.approx(1.0)


def test_best_pieces_prefers_more_when_speed_holds():
    rate, n, v = C.best_pieces(lambda k: 1.0, 10, 10, nmax=4)
    assert n == 4 and rate == pytest.approx(C.carry_rate(4, 1.0, 10, 10))
    # speed collapses with load: one piece is best
    rate, n, v = C.best_pieces(lambda k: 1.0 if k == 1 else 0.05, 10, 10, nmax=4)
    assert n == 1
    assert C.best_pieces(lambda k: None, 10, 10) == (0.0, 0, 0.0)


def test_pose_meets_targets_and_zmp_is_at_the_sole(g1):
    r, d0 = g1
    s = C.stride_check(r, d0, (0.3, 0.6), 3.8, 0.4)
    assert s.ik_ok
    # the model puts the zero-moment point at the stance sole point; the solved wrench agrees
    assert abs(s.zmp[0]) < 1e-4 and abs(s.zmp[1]) < 1e-4
    # LIPM: a = g (L/2) / h
    assert s.accel == pytest.approx(P.G * 0.2 / s.com_height)
    assert s.mu_need == pytest.approx(s.accel / P.G)


def test_gravity_is_restored(g1):
    r, d0 = g1
    before = r.model.opt.gravity.copy()
    C.stride_check(r, d0, (0.3, 0.6), 2.0, 0.4)
    assert np.allclose(r.model.opt.gravity, before)


def test_torques_balance_in_mujoco(g1):
    """Apply the computed stance wrench, hand loads and tau, with the tilted gravity: nothing accelerates."""
    r, d0 = g1
    m = r.model
    L, mass = 0.4, 3.8
    q, ok, _ = C.stride_pose(r, d0, (0.3, 0.6), mass, L)
    assert ok
    ratio, worst, ax, h, zmp, fz = C.stride_torques(r, q, mass, L)
    d = mujoco.MjData(m)
    d.qpos[:] = q
    m.opt.gravity[:] = [-ax, 0.0, -P.G]
    try:
        mujoco.mj_forward(m, d)
        bias = d.qfrc_bias.copy()
        load = np.zeros(m.nv)
        for b, p in r.hands["palm"]:
            jp, _ = P._jac(m, d, P._bid(m, b), p)
            load += jp.T @ np.array([-mass * ax / 2, 0, -mass * P.G / 2])
        b0, p0 = r.feet[0]
        Jc = np.vstack(P._jac(m, d, P._bid(m, b0), p0))
        f = np.linalg.solve(Jc[:, :6].T, bias[:6] - load[:6])
        lim = P.torque_limits(m)
        tau = bias - load - Jc.T @ f
        tau[:6] = 0
        # the actuated torque plus the hand load plus the ground wrench cancel the bias exactly
        d.qfrc_applied[:] = tau + load + Jc.T @ f
        # no joint stops, self-contact or the model's own (position) actuators
        off = int(mujoco.mjtDisableBit.mjDSBL_CONSTRAINT) | int(mujoco.mjtDisableBit.mjDSBL_ACTUATION)
        m.opt.disableflags |= off
        try:
            mujoco.mj_forward(m, d)
        finally:
            m.opt.disableflags &= ~off
        assert np.abs(d.qacc).max() < 1e-6
        assert float(np.max(np.where(np.isfinite(lim), np.abs(tau) / lim, 0))) == pytest.approx(float(ratio.max()))
    finally:
        m.opt.gravity[:] = [0, 0, -P.G]


def test_longer_step_needs_more_friction(g1):
    r, d0 = g1
    a = C.stride_check(r, d0, (0.3, 0.6), 0.0, 0.2)
    b = C.stride_check(r, d0, (0.3, 0.6), 0.0, 0.6)
    assert b.mu_need > a.mu_need
    # a slippery floor caps the step
    L_slip, _, _ = C.max_step(r, d0, (0.3, 0.6), 0.0, mu=0.2)
    L_grip, _, _ = C.max_step(r, d0, (0.3, 0.6), 0.0, mu=0.6)
    assert L_slip < L_grip


def test_a_heavier_load_does_not_lengthen_the_step(g1):
    r, d0 = g1
    L0, _, _ = C.max_step(r, d0, (0.3, 0.6), 0.0)
    L4, _, _ = C.max_step(r, d0, (0.3, 0.6), 4.6)
    assert L4 is not None and L4 <= L0
    # far above the static payload there is no step at all
    L9, _, _ = C.max_step(r, d0, (0.3, 0.6), 12.0)
    assert L9 is None
