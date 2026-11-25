"""Milestone 78: an augmented filter that learns the free-air reading's systematic error."""
import numpy as np
import pytest

pytest.importorskip("scipy.stats")

from buildbot_sheathing import augfilter as A  # noqa: E402
from buildbot_sheathing import closedloop as C  # noqa: E402
from buildbot_sheathing import riskdp as Q  # noqa: E402

AL = np.array([0.03, 0.02, 0.03, 0.025])
TAU, PRE, SIG = 5.0, 20.0, 0.002
SHEETS = 12


def _sheet():
    risk = C.SheetRisk(AL, TAU, SIG, n_r=21)
    LS = Q.segment_logsurv(np.zeros(len(AL)), np.full(len(AL), TAU), AL, len(AL), SIG, 0.5)
    return risk, LS


def test_without_beta_the_variance_sequence_is_milestone_77s():
    for starts in ([], [2]):
        got = A.pee_sequence(len(AL), starts, TAU, PRE, SIG, 0.01, SHEETS, set(), 0.0, False)
        ref = C.p_sequence(len(AL), starts, TAU, PRE, SIG, 0.01, SHEETS)
        assert np.allclose(got, ref, rtol=1e-12, atol=1e-18)


def test_update_matches_the_full_kalman_filter():
    P = np.array([[3e-4, -1e-4], [-1e-4, 4e-4]])
    H, s = np.array([[1.0, 1.0]]), 0.01
    K = P @ H.T / (H @ P @ H.T + s ** 2)
    ref = (np.eye(2) - K @ H) @ P
    (ee, eb, bb), (ke, kb) = A.read((P[0, 0], P[0, 1], P[1, 1]), s)
    assert np.allclose([ee, eb, bb], [ref[0, 0], ref[0, 1], ref[1, 1]])
    assert np.allclose([ke, kb], K[:, 0])


def test_post_tare_readings_learn_beta():
    # each tare followed by a reading of beta + sZ: the beta variance falls as 1 / (1 / sb^2 + k / s^2)
    s, sb = 0.01, 0.02
    P = (0.0, 0.0, sb ** 2)
    for k in range(1, 6):
        P, _ = A.read((0.0, 0.0, P[2]), s)
        assert P[2] == pytest.approx(1.0 / (1.0 / sb ** 2 + k / s ** 2))
    # and the tracked variance under beta uncertainty is larger without them
    tare = {3, 6, 9}
    a = A.pee_sequence(len(AL), [], TAU, PRE, SIG, s, SHEETS, tare, sb, False)
    b = A.pee_sequence(len(AL), [], TAU, PRE, SIG, s, SHEETS, tare, sb, True)
    c = A.pee_sequence(len(AL), [], TAU, PRE, SIG, s, SHEETS, tare, 0.0, False)
    assert all(x >= y - 1e-18 for x, y in zip(a, b)) and all(x >= y - 1e-18 for x, y in zip(b, c))


def test_q0_interpolation_matches_the_chain():
    risk, LS = _sheet()
    starts, rest = [], 0.0
    q0 = A.Q0(risk, starts, rest, 4e-4)
    for P in (0.0, 3e-5, 1.1e-4, 3.7e-4):
        ref = float(C.carry_fail(risk, P, starts, rest)[0])
        assert q0(P) == pytest.approx(ref, rel=2e-3, abs=1e-14)


def test_naive_reproduces_milestone_77_draw_for_draw():
    risk, LS = _sheet()
    eps = 2e-3
    got = A.simulate(AL, TAU, PRE, SHEETS, SIG, 0.004, eps, risk, LS, 600, 5)
    ref = C.simulate("BALANCE", AL, TAU, PRE, SHEETS, SIG, 0.004, eps, risk, LS, 600, 5)
    assert got == pytest.approx(ref)


def test_filter_variance_is_honest_on_the_prior():
    # with beta drawn from the filter's own prior, the tracked residual's spread matches Pee
    s, sb, N = 0.01, 0.02, 20000
    rng = np.random.default_rng(1)
    b = rng.standard_normal(N) * sb
    e, me, mb = np.zeros(N), np.zeros(N), np.zeros(N)
    P = (0.0, 0.0, sb ** 2)
    for k in range(6):
        e += rng.standard_normal(N) * SIG * np.sqrt(TAU * len(AL) + PRE)
        P = (P[0] + SIG ** 2 * (TAU * len(AL) + PRE), P[1], P[2])
        y = e + b + rng.standard_normal(N) * s
        P, (ke, kb) = A.read(P, s)
        r = y - me - mb
        me, mb = me + ke * r, mb + kb * r
        e, me = e - me, np.zeros(N)
        if k == 2:
            e[:] = 0.0
            P = (0.0, 0.0, P[2])
    assert np.var(e) == pytest.approx(P[0], rel=0.05)
    assert np.var(b - mb) == pytest.approx(P[2], rel=0.05)
