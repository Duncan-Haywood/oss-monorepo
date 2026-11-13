"""Milestone 7c: the linearised axis model must reproduce `poshold.rollout` near hover (noise, gust and wind off)."""
import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_cant import aero as A, linstab as S, poshold as P  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OFF = 1e-4   # m: small enough that no clip, saturation or trigonometric term matters


def _m7_design():
    runs = json.load(open(os.path.join(HERE, "..", "experiments", "m7_ff", "results.json")))["runs"]
    return next(r["x"] for r in runs if r["label"] == "ff retrained" and r["geom"] == "below" and r["seed"] == 0)


def _quiet_reference(off):
    def ref(episodes, seed):
        z = lambda *s: np.zeros(s)
        o = np.broadcast_to(np.asarray(off, float), (episodes, 2)).copy()
        return (z(episodes, P.STEPS), z(episodes, 2, P.STEPS), z(episodes, 3, P.STEPS), z(episodes, 3, P.STEPS), z(episodes, 2), o,
                z(episodes, 2, P.STEPS), z(episodes, 2, P.STEPS), np.ones((episodes, 2)))
    return ref


def _linear_pos_rms(dp, plant, ff, mode, off):
    tau_s, mass_s, lag_s = plant
    traj = []
    for sign, p0 in ((1.0, off[0]), (-1.0, -off[1])):     # x is the pitch-like axis; y' = -y the roll-like one
        d = dict(kp=dp["kp"][0], kd=dp["kd"][0], ki=dp["ki"][0], kpp=dp["kpp"][0], kdp=dp["kdp"][0], kip=dp["kip"][0],
                 lam=sign * dp["lat"][0], tmax=dp["tmax"][0], I=dp["I0"][0] * mass_s, m=dp["m_nom"][0] * mass_s,
                 m_nom=dp["m_nom"][0], lag=dp["lag_nom"][0] * lag_s, lag_nom=dp["lag_nom"][0], tau_s=tau_s, ff=ff, mode=mode,
                 b_ff=dp["b_ff"][0])
        M = S.matrix(d, ())
        x = np.zeros(S.NX); x[0] = p0
        ps = []
        for _ in range(P.STEPS):
            x = M @ x
            ps.append(x[0])
        traj.append(np.array(ps))
    return np.sqrt(np.mean(traj[0] ** 2 + traj[1] ** 2))


@pytest.mark.parametrize("ff,mode,plant", [(0.0, "integ", (1.0, 1.0, 1.0)), (1.0, "integ", (1.0, 1.0, 1.0)),
                                           (1.0, "integ", (0.7, 1.3, 2.0)), (1.0, "cmd", (0.85, 0.9, 1.5))])
def test_linear_model_matches_rollout_near_hover(monkeypatch, ff, mode, plant):
    x = np.array([_m7_design()])                             # a canted, flyable design (milestone 7), tau_ff its 13th coordinate
    off = np.array([OFF, -0.6 * OFF])
    monkeypatch.setattr(P, "reference", _quiet_reference(off))
    monkeypatch.setattr(A, "plant_draw", lambda kind, e, s: dict(tau=np.full(e, plant[0]), mass=np.full(e, plant[1]), lag=np.full(e, plant[2])))
    dp = S.design_params(x)
    tau_ff = P.TAU_FF_RANGE[0] * (P.TAU_FF_RANGE[1] / P.TAU_FF_RANGE[0]) ** x[0, 12]
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, np.deg2rad(80.0) * x[:, 2], kappa_per_d=0.081, actuator="hover")
    out = P.rollout(sz, P.phys_gains(x[:, 3:12]), 0.081 * D, episodes=1, seed=0, gust_std=0.0, gust_mean=0.0, wind_step=0.0,
                    ff=ff, tau_ff=tau_ff, ff_mode=mode)
    lin = _linear_pos_rms(dp, plant, ff, mode, off)
    assert np.isfinite(lin) and lin > 0
    assert out["pos"][0] == pytest.approx(lin, rel=1e-3)


def test_side_force_sign_matters_and_no_cant_is_symmetric():
    rng = np.random.default_rng(1)
    x = rng.uniform(0.3, 0.7, (3, 12)); x[:, 2] = [0.0, 0.4, 0.6]
    dp = S.design_params(x)
    t, m, l = (np.array([v]) for v in (1.0, 1.0, 1.0))
    rp, rr = S.radius(dp, t, m, l, 1.0, "integ", 1.0), S.radius(dp, t, m, l, 1.0, "integ", -1.0)
    assert np.isclose(rp[0, 0], rr[0, 0])                   # alpha = 0: lat = 0, both axes identical
    assert not np.isclose(rp[1, 0], rr[1, 0])


def test_ki_ceiling_brackets_the_boundary():
    rng = np.random.default_rng(2)
    x = rng.uniform(0.3, 0.7, (4, 12)); x[:, 2] = 0.45
    dp = S.design_params(x)
    s = S.ki_ceiling(dp, iters=25)
    for k in range(4):
        if 0 < s[k] < 4.0:
            lo, hi = dict(dp), dict(dp)
            lo["ki"] = dp["ki"] * s[k] * 0.98; hi["ki"] = dp["ki"] * s[k] * 1.02
            sub = lambda q: {kk: (v[k:k + 1] if isinstance(v, np.ndarray) else v) for kk, v in q.items()}
            assert S.worst_radius(sub(lo))[0] < 1.0 <= S.worst_radius(sub(hi))[0]
