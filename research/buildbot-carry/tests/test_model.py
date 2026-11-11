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


# --- The pass/fail decision itself (quality audit 2026-11-07, defect 2: raising the torque
# threshold to 1.5x or doubling the friction limit left every test green). These stub the pose
# and torque solvers so the decision rule in `stride_check` and the grid walk in `max_step` are
# checked against hand-set inputs, independent of the IK.

def _stub(monkeypatch, ratio, ax, fz=100.0, ik_ok=True):
    monkeypatch.setattr(C, "stride_pose", lambda *a, **k: (np.zeros(3), ik_ok, 0.0))
    monkeypatch.setattr(C, "stride_torques",
                        lambda *a, **k: (np.array([0.1, ratio]), "joint_b", ax, 0.6, (0.0, 0.0), fz))


@pytest.mark.parametrize("ratio, ok", [(0.5, True), (1.0, True), (1.0001, False), (1.2, False), (1.49, False)])
def test_a_joint_over_its_peak_torque_fails_the_step(monkeypatch, ratio, ok):
    _stub(monkeypatch, ratio, ax=0.1 * P.G)
    s = C.stride_check(None, None, (0.3, 0.6), 3.8, 0.4)
    assert s.ok is ok
    assert s.ratio == pytest.approx(ratio)
    assert s.worst == "joint_b"


@pytest.mark.parametrize("need, mu, ok", [(0.55, 0.6, True), (0.6, 0.6, True), (0.65, 0.6, False),
                                          (0.29, 0.3, True), (0.35, 0.3, False), (0.59, 0.3, False)])
def test_the_step_needs_no_more_friction_than_mu(monkeypatch, need, mu, ok):
    # mu_need = a / g; a step whose LIPM acceleration needs more than mu slips
    _stub(monkeypatch, 0.5, ax=need * P.G)
    s = C.stride_check(None, None, (0.3, 0.6), 0.0, 0.4, mu=mu)
    assert s.ok is ok
    assert s.mu_need == pytest.approx(need)
    assert (s.worst == "friction") is (not ok)


def test_a_foot_pulling_on_the_floor_fails(monkeypatch):
    _stub(monkeypatch, 0.5, ax=0.1 * P.G, fz=-1.0)
    assert not C.stride_check(None, None, (0.3, 0.6), 0.0, 0.4).ok


def test_no_pose_is_reported_as_reach(monkeypatch):
    _stub(monkeypatch, 0.5, ax=0.1 * P.G, ik_ok=False)
    s = C.stride_check(None, None, (0.3, 0.6), 0.0, 0.4)
    assert not s.ok and not s.ik_ok and s.worst == "reach"


def test_max_step_walks_the_grid_and_stops_after_two_misses(monkeypatch):
    calls = []

    def fake(robot, data0, hand_xz, mass, L, s=0.0, grip="palm", q_init=None, mu=C.MU, gap=C.GAP):
        calls.append((L, q_init is not None))
        ok = L <= 0.45 or L == 0.6           # one isolated pass beyond two misses must not be reached
        worst = "waist" if ok else ("reach" if L == 0.5 else "friction")
        return C.Stride(ok, ok, 0.0, 0.5, worst, 0.0, 0.6, (0.0, 0.0), np.full(3, L))

    monkeypatch.setattr(C, "stride_check", fake)
    L, why, last = C.max_step(None, None, (0.3, 0.6), 3.8)
    assert L == 0.45
    assert why == "reach"                    # the reason at the first failing length
    assert last.qpos[0] == 0.45
    assert max(c[0] for c in calls) == 0.55  # 0.50 and 0.55 miss, then it stops
    # a warm-started miss is retried from the home pose
    assert (0.5, True) in calls and (0.5, False) in calls


def test_unloaded_g1_step_is_capped_by_friction_at_mu_0_3(g1):
    """Independent check of the friction cap: in the LIPM, mu_need = (L/2) / h, so with the solved
    CoM height h of about 0.61 m the longest 5 cm step at mu 0.3 is 0.35 m (0.40 would need 0.33)."""
    r, d0 = g1
    L, why, st = C.max_step(r, d0, (0.3, 0.6), 0.0, mu=0.3)
    assert L == pytest.approx(0.35)
    assert why == "friction"
    assert (L / 2) / st.com_height <= 0.3 < ((L + 0.05) / 2) / st.com_height
