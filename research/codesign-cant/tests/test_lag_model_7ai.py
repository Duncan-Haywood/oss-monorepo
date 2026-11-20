"""Milestone 7ai: the no-flight acceleration-step model (`linstab.accel_step`) and the exact lean-map probe. The new probes are
inert by default, the linear response is linear and settles at the request, it tracks `rollout`'s own open-outer-loop step on an
unrandomised plant, and the verdicts file is what the script prints from results.json."""
import os, subprocess, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "experiments", "m7ai_lag_model")
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_cant import aero as A, linstab as LS, poshold as P  # noqa: E402

X = np.array([[0.58, 0.36, 0.22, 0.21, 0.69, 0.75, 0.56, 0.64, 0.53, 0.76, 0.69, 0.2]])   # a stable attitude loop (found by search)


def test_lean_exact_default_is_inert():
    sz = A.size(np.array([0.12]), np.array([0.127]), np.array([0.5]), actuator="hover")
    g = P.phys_gains(np.full((1, 9), 0.5))
    a = P.rollout(sz, g, 0.01, episodes=2, seed=1, steps=200)
    b = P.rollout(sz, g, 0.01, episodes=2, seed=1, steps=200, lean_exact=False)
    assert np.array_equal(a["pos_ep"], b["pos_ep"])


def test_accel_step_is_linear_and_settles_at_the_request():
    dp = LS.design_params(X)
    a1, a35 = LS.accel_step(dp, 1.0, 4000), LS.accel_step(dp, 3.5, 4000)
    assert np.allclose(a35, 3.5 * a1)
    assert abs(a1[0, -200:].mean() - 1.0) < 1e-3


def test_accel_step_tracks_rollout_on_a_fixed_plant():
    """Small request (1 m/s^2), no plant randomisation, calm air: the flown mean response over 16 noisy episodes follows the
    linear one within 3% of the request in every 50 ms window after 0.1 s (the residual is sensor noise and the a/g map's nonlinearity)."""
    dp = LS.design_params(X)
    n = 600
    lin = LS.accel_step(dp, 1.0, n)[0]
    L = A.L_RANGE[0] + X[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); Dm = A.D_RANGE[0] + X[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, Dm, np.deg2rad(80.0) * X[:, 2], kappa_per_d=0.081, actuator="hover")
    tr = []
    old, ref = P.DEAD_POS, P.reference
    P.DEAD_POS = 1e3
    P.reference = lambda *a, **k: (lambda r: (r[0] * 0.0,) + tuple(r[1:]))(ref(*a, **k))   # no yaw steps, as m7y's ref_patch
    try:
        P.rollout(sz, P.phys_gains(X[:, 3:12]), 0.081 * Dm, 16, 3, gust_std=0.0, gust_mean=0.0, plant=None, wind_step=0.0,
                  ff=1.0, ff_mode="integ", trace=tr, steps=n, acc_cmd=np.array([1.0, 0.0]))
    finally:
        P.DEAD_POS, P.reference = old, ref
    px = np.concatenate([np.zeros((2, 16)), np.stack(tr, 0)[:, 0, :, 0]], 0)
    acc = ((px[2:] - 2 * px[1:-1] + px[:-2]) / A.DT ** 2).mean(1)
    w = lambda v: v[50:].reshape(-1, 25).mean(1)
    assert np.max(np.abs(w(acc) - w(lin))) < 0.03


def test_verdicts_match_results():
    if not os.path.exists(os.path.join(D, "results.json")):
        return
    out = subprocess.run([sys.executable, "verdicts.py"], cwd=D, capture_output=True, text=True, check=True).stdout
    assert out.rstrip() == open(os.path.join(D, "verdicts.txt")).read().rstrip()
