"""Milestone 76: closed-loop re-zeros from a noisy bias reading once a sheet."""
import numpy as np
import pytest

stats = pytest.importorskip("scipy.stats")

from buildbot_sheathing import closedloop as C  # noqa: E402
from buildbot_sheathing import riskdp as Q  # noqa: E402

A = np.array([0.03, 0.02, 0.03, 0.025])
TAU, SIG = 5.0, 0.002


def _sheet():
    risk = C.SheetRisk(A, TAU, SIG, n_r=21)
    LS = Q.segment_logsurv(np.zeros(len(A)), np.full(len(A), TAU), A, len(A), SIG, 0.5)
    return risk, LS


def test_start_masses_match_noncentral_chi2():
    edges = np.linspace(0, 0.05, 11)
    r, sd = 0.01, 0.006
    got = C.start_masses(edges, [r], sd)[:, 0]
    ref = np.diff(stats.ncx2.cdf(edges ** 2 / sd ** 2, 3, r ** 2 / sd ** 2))
    assert np.max(np.abs(got - ref)) < 1e-10
    z = C.start_masses(edges, [0.0], sd)[:, 0]
    assert np.max(np.abs(z - np.diff(stats.chi2.cdf(edges ** 2 / sd ** 2, 3)))) < 1e-12


def test_carried_survival_from_zero_equals_milestone_75_chain():
    risk, LS = _sheet()
    S = risk.surv(0.0)
    assert np.allclose(np.log(S[:, 0]), LS[0][:len(A)], atol=1e-9)


def test_carried_failure_matches_monte_carlo():
    risk, _ = _sheet()
    k, P = 8, 2e-5
    r = risk.r[k]
    rng = np.random.default_rng(3)
    N = 200000
    e = np.zeros((N, 3))
    e[:, 0] = r
    e += rng.standard_normal((N, 3)) * np.sqrt(P)
    f = np.zeros(N, bool)
    for a in A:
        e += rng.standard_normal((N, 3)) * SIG * np.sqrt(TAU)
        f |= np.einsum("ij,ij->i", e, e) > a ** 2
    q = 1 - risk.surv(P)[-1, k]
    se = np.sqrt(f.mean() * (1 - f.mean()) / N)
    assert q >= f.mean() - 3 * se and q - f.mean() < 0.1 * f.mean() + 3 * se


def test_carried_failure_grows_with_bias_and_variance():
    risk, _ = _sheet()
    q1 = 1 - risk.surv(0.0)[-1]
    q2 = 1 - risk.surv(5e-5)[-1]
    # risk grows with the carried bias; at r = 0 it grows with the variance too (far from the centre
    # extra spread can pull mass back inside, so not for every r)
    assert np.all(np.diff(q1) >= -1e-12) and q2[0] >= q1[0]


def test_threshold_interpolates():
    r = np.array([0.0, 1.0, 2.0])
    q = np.array([0.1, 0.2, 0.4])
    assert C.threshold(q, r, 0.3) == pytest.approx(1.5)
    assert C.threshold(q, r, 0.05) == -1.0 and C.threshold(q, r, 0.5) == 2.0


def test_perfect_tracking_never_tares_and_read_needs_more():
    risk, LS = _sheet()
    eps = 0.1
    inside = len(C.in_sheet_plan(LS, len(A), eps)[0])
    args = (A, TAU, 20.0, 30, SIG, 0.0, eps, risk, LS, 400, 1)
    ft, mt, _ = C.simulate("TRACK", *args)
    fr, mr, _ = C.simulate("READ", *args)
    assert mt == 30 * inside and mr >= mt
    assert 0.0 <= ft <= 1.0 and 0.0 <= fr <= 1.0


def test_more_risk_allows_fewer_tares():
    risk, LS = _sheet()
    lo = C.simulate("READ", A, TAU, 20.0, 30, SIG, 0.01, 1e-2, risk, LS, 400, 2)
    hi = C.simulate("READ", A, TAU, 20.0, 30, SIG, 0.01, 2e-1, risk, LS, 400, 2)
    assert hi[1] <= lo[1]


# Milestone 77: BALANCE

def test_balanced_runs_cover_the_wall_as_equally_as_possible():
    for sheets in (1, 7, 100):
        for T in range(sheets):
            runs = C.balanced_runs(sheets, T)
            assert sum(runs) == sheets and len(runs) == T + 1 and max(runs) - min(runs) <= 1


def test_balance_schedule_is_the_brute_force_optimum_for_convex_costs():
    import itertools
    q = [1e-4, 2e-3, 4e-3, 5e-3, 5.5e-3, 5.8e-3, 6e-3, 6e-3]
    sheets, budget = 8, 0.02
    cum = np.concatenate([[0.0], np.cumsum(q)])
    best = None
    for T in range(sheets):
        for tares in itertools.combinations(range(1, sheets), T):
            cut = [0, *tares, sheets]
            if sum(cum[b - a] for a, b in zip(cut[:-1], cut[1:])) <= budget:
                best = T
                break
        if best is not None:
            break
    sched, cost = C.balance_schedule(q, sheets, budget)
    assert len(sched) == best and cost <= budget


def test_p_sequence_matches_the_filter_and_rises_monotonically():
    Ps = C.p_sequence(4, [], TAU, 30.0, SIG, 0.01, 20)
    assert Ps[0] == 0.0 and all(b >= a - 1e-18 for a, b in zip(Ps, Ps[1:]))
    P = SIG ** 2 * (4 * TAU + 30.0)
    assert np.isclose(Ps[1], P * 0.01 ** 2 / (P + 0.01 ** 2))
    assert C.p_sequence(4, [], TAU, 30.0, SIG, 0.0, 5) == [0.0] * 5
    assert len(set(C.p_sequence(4, [2], TAU, 30.0, SIG, 0.01, 6)[1:])) == 1   # an in-sheet re-zero resets P


def test_balance_simulation_tares_on_its_schedule():
    risk, LS = _sheet()
    f, mean, p95 = C.simulate("BALANCE", A, TAU, 30.0, 10, SIG, 0.01, 1e-3, risk, LS, 200, 1)
    t, _, _ = C.simulate("TRACK", A, TAU, 30.0, 10, SIG, 0.01, 1e-3, risk, LS, 200, 1)
    assert mean == p95 and 0.0 <= f <= 1.0
