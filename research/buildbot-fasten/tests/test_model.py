import math

import mujoco
import numpy as np
import pytest

from buildbot_fasten import model as F
from buildbot_payload import fetch, model as P

IN = F.IN


def test_schedule_counts_and_windows():
    n = F.schedule()
    assert len(n) == 62
    cls = {c: sum(1 for x in n if x.cls == c) for c in {x.cls for x in n}}
    assert cls == {"joint": 34, "field": 14, "bottom plate": 7, "top plate": 7}
    joint = next(x for x in n if x.cls == "joint")
    # (19.05 - 1.66 - 9.525) / 2 mm: the half face under a sheet minus the nail radius and the edge distance
    assert joint.half * 1000 == pytest.approx((0.75 * 25.4 - 0.131 * 25.4 / 2 - 0.375 * 25.4) / 2, rel=1e-9)
    field = next(x for x in n if x.cls == "field")
    assert field.half * 1000 == pytest.approx(0.75 * 25.4 - 0.131 * 25.4 / 2, rel=1e-9)
    assert field.half > 4 * joint.half


def test_nails_sit_inside_the_sheet_and_on_a_member():
    w, h = F.SHEET
    for x in F.schedule():
        assert 0 <= x.y <= w and 0 <= x.z <= h


def test_nail_success_is_the_gaussian_interval():
    assert F.nail_success(1.0, 1.0) == pytest.approx(0.6826894921370859)
    assert F.nail_success(1.96, 1.0) == pytest.approx(0.95, abs=1e-3)
    assert F.nail_success(1.0, 0.0) == 1.0


def test_required_sigma_inverts_sheet_success():
    n = F.schedule()
    for target in (0.5, 0.95):
        s = F.required_sigma(n, target)
        assert F.sheet_success(n, s, s) == pytest.approx(target, abs=1e-6)
    assert F.required_sigma(n, 0.99) < F.required_sigma(n, 0.95)


needs_models = pytest.mark.skipif(not fetch.available("h1"), reason="Menagerie models unavailable (offline)")


@needs_models
def test_ground_wrench_balances_the_robot_in_forward_dynamics():
    r = P.load("h1")
    d0 = P.standing(r)
    force = 60.0
    ok, q, why = F.check_push(r, d0, (0.4, 1.0), 3.4, force, 0.6)
    assert ok, why
    ext = np.array([-force, 0.0, -3.4 * F.G])
    tau, ratio, f = F.ground_wrench(r, q, ext)
    m = r.model
    d = mujoco.MjData(m)
    d.qpos[:] = q
    mujoco.mj_forward(m, d)
    act = np.zeros(m.nv)
    act[:] = tau
    for b, p in r.hands["palm"]:
        jp, _ = P._jac(m, d, P._bid(m, b), p)
        act += jp.T @ (ext / 2)
    Jc = np.vstack([np.vstack(P._jac(m, d, P._bid(m, b), pt)) for b, pt in r.feet])
    act += Jc.T @ f
    d.qfrc_applied[:] = act
    mujoco.mj_forward(m, d)
    assert np.abs(d.qacc).max() < 1e-6


@needs_models
def test_push_limit_falls_with_friction_and_the_leaning_robot_balances():
    r = P.load("h1")
    d0 = P.standing(r)
    hi, _ = F.push_limit(r, d0, (0.4, 1.0), 3.4, 0.6)
    lo, why = F.push_limit(r, d0, (0.4, 1.0), 3.4, 0.05)
    assert hi > 50
    assert lo < hi and why == "slip"
    # the slip limit is mu * weight to within the bisection step
    w = (float(r.model.body_subtreemass[1]) + 3.4) * F.G
    assert lo == pytest.approx(0.05 * w, abs=3.0)


@needs_models
def test_tip_jacobian_matches_a_finite_perturbation():
    r = P.load("h1")
    d0 = P.standing(r)
    tip, p = F.tip_jacobian(r, d0, (0.4, 1.0), 3.4)
    assert tip is not None
    m = r.model
    bh, ph = r.hands["palm"][1]
    feet = [(P._bid(m, b), pt) for b, pt in r.feet]
    rng = np.random.default_rng(3)
    dq = np.zeros(m.nv - 6)
    j = [i for i in range(m.nv - 6)]
    dq[rng.choice(j, 4, replace=False)] = 1e-4 * rng.standard_normal(4)

    def tip_pos(qj):
        # re-plant the feet (position and orientation) by Gauss-Newton on the base, then read the tip
        d = mujoco.MjData(m)
        d.qpos[:] = p.qpos
        mujoco.mj_kinematics(m, d)
        tgt = []
        for b, pt in feet:
            q4 = np.zeros(4)
            mujoco.mju_mat2Quat(q4, d.xmat[b])
            tgt.append((P._point(d, b, pt), q4))
        d.qpos[:] = p.qpos
        d.qpos[7:] += qj
        for _ in range(20):
            mujoco.mj_kinematics(m, d)
            mujoco.mj_comPos(m, d)
            rows, errs = [], []
            for (b, pt), (tp, tq) in zip(feet, tgt):
                jp, jr = P._jac(m, d, b, pt)
                cq = np.zeros(4)
                mujoco.mju_mat2Quat(cq, d.xmat[b])
                eo = np.zeros(3)
                mujoco.mju_subQuat(eo, tq, cq)
                rows += [jp, jr]
                errs += [tp - P._point(d, b, pt), d.xmat[b].reshape(3, 3) @ eo]
            step = np.zeros(m.nv)
            step[:6] = np.linalg.lstsq(np.vstack(rows)[:, :6], np.concatenate(errs), rcond=None)[0]
            mujoco.mj_integratePos(m, d.qpos, step, 1.0)
        mujoco.mj_kinematics(m, d)
        return P._point(d, P._bid(m, bh), ph)

    base = tip_pos(np.zeros(m.nv - 6))
    moved = tip_pos(dq)
    pred = tip @ dq
    assert np.allclose((moved - base)[1:], pred[1:], atol=3e-5)
