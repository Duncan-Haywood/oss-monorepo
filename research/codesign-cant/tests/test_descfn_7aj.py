"""Milestone 7aj: the describing-function pieces (saturation gain, its inverse, the nsat key, the clip-input probes) and the
inert `trace_tilt` probe of `poshold.rollout`."""
import importlib.util
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_cant import aero as A, linstab as S, poshold as P  # noqa: E402

_spec = importlib.util.spec_from_file_location("m7aj_run", os.path.join(HERE, "..", "experiments", "m7aj_descfn", "run.py"))
R = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(R)


def _d(rng, n=5):
    return dict(kp=rng.uniform(0.5, 2, n), kd=rng.uniform(0.01, 0.1, n), ki=rng.uniform(0.1, 2, n), kpp=rng.uniform(0.5, 5, n),
                kdp=rng.uniform(0.5, 3, n), kip=rng.uniform(0.1, 2, n), lam=rng.uniform(-3, 3, n), tmax=rng.uniform(0.1, 0.5, n),
                I=rng.uniform(0.002, 0.01, n), m=rng.uniform(0.8, 1.5, n), m_nom=rng.uniform(0.8, 1.5, n), lag=rng.uniform(0.02, 0.08, n),
                lag_nom=rng.uniform(0.02, 0.05, n), tau_s=rng.uniform(0.7, 1, n), ff=1.0, mode="integ", b_ff=rng.uniform(0.001, 0.01, n))


def test_saturation_describing_function_and_its_inverse():
    assert R.df_gain(1.0) == 1.0 and R.df_gain(0.5) == 1.0
    r = np.geomspace(1.001, 1e4, 200)
    N = R.df_gain(r)
    assert np.all(np.diff(N) < 0) and np.all((N > 0) & (N < 1))
    assert np.allclose(N[-20:], 4 / (np.pi * r[-20:]), rtol=1e-6)          # large-amplitude limit: the square wave's 4 / (pi r)
    assert np.allclose(R.df_inverse(N), r, rtol=1e-9)


def test_df_gain_is_the_first_harmonic_of_a_clipped_sine():
    t = np.linspace(0, 2 * np.pi, 20001)[:-1]
    for r in (1.2, 2.0, 5.0):
        y = np.clip(r * np.sin(t), -1, 1)
        b1 = 2 * np.mean(y * np.sin(t))
        assert abs(b1 / r - R.df_gain(r)) < 1e-6


def test_nsat_one_is_the_default_step_and_scales_the_reference():
    rng = np.random.default_rng(1)
    d = _d(rng); x = rng.standard_normal((5, S.NX))
    assert np.array_equal(S.step(x, d), S.step(x, dict(d, nsat=1.0)))
    assert not np.allclose(S.step(x, d), S.step(x, dict(d, nsat=0.5)))
    # nsat = 0 removes the position loop from the attitude reference: zeroing position states then changes nothing in tilt
    x2 = x.copy(); x2[:, :3] = 0.0
    a, b = S.step(x, dict(d, nsat=0.0)), S.step(x2, dict(d, nsat=0.0))
    assert np.allclose(a[:, 3:], b[:, 3:])


def test_probes_read_the_steps_own_attitude_command():
    """With the delivered torque at zero, one step's torque is u_att * tmax * tau_s * DT / lag: the probe is the command `step` uses."""
    rng = np.random.default_rng(2)
    for nsat in (1.0, 0.3):
        d = dict(_d(rng), nsat=nsat); x = rng.standard_normal((5, S.NX)); x[:, 8] = 0.0
        _, ua = R.probes(x, d)
        tq = S.step(x, d)[:, 8]
        assert np.allclose(tq, ua * d["tmax"] * d["tau_s"] * A.DT / d["lag"], rtol=1e-12)


def test_trace_tilt_is_inert_and_records_angles_and_references():
    rng = np.random.default_rng(3)
    x = rng.uniform(0.3, 0.7, (2, 12)); x[:, 2] = 0.4
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0])
    D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, np.deg2rad(80.0) * x[:, 2], kappa_per_d=0.081, actuator="hover")
    g = P.phys_gains(x[:, 3:12])
    tr = []
    a = P.rollout(sz, g, 0.081 * D, 3, 7, steps=400)
    b = P.rollout(sz, g, 0.081 * D, 3, 7, steps=400, trace_tilt=tr)
    for k in ("pos", "att", "dead_ep", "pos_ep"):
        assert np.array_equal(a[k], b[k])
    t = np.stack(tr, 0)
    assert t.shape == (400, 2, 3, 4)
    alive = ~b["dead_ep"]
    assert np.all(np.abs(t[:, alive, 2:]) <= P.TILT_CMD_MAX + 1e-6)
