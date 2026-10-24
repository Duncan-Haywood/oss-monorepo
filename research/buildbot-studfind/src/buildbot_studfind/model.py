"""Stud-finding error budget for nailing a 4x8 sheet (windows from buildbot-fasten).

Every nail of a stud shares that stud's position error, so the sheet's success is a product over
four studs (two joints, two intermediate studs) of a probability that is conditional on the stud's
error. Plate nails (axis "z") see only the robot's own scatter. Policies differ in how the stud
errors arise (see `estimate_errors`).
"""
from math import erf, sqrt

import numpy as np

IN = 0.0254
STUD_FACE = 1.5 * IN       # all of these as in buildbot-fasten (re-derived; a test cross-checks it)
NAIL_D = 0.131 * IN
EDGE_MIN = 0.375 * IN
SPACING = 16 * IN


def band(face, kind):
    """Half-width of the band a nail centre may land in (buildbot_fasten.model.band)."""
    r = NAIL_D / 2
    lo = EDGE_MIN if kind != "open" else r
    hi = (face / 2 if kind == "centre" else face) - r
    return (hi - lo) / 2


def stud_groups():
    """({stud index: [window half-widths of its nails]}, [half-widths of the plate nails]).

    Studs 0 and 3 are the sheet's joints (17 nails each, every 6 in), 1 and 2 the intermediate
    studs at 16 and 32 in (7 nails each, every 12 in); the plates take 7 nails each along the
    bottom (single plate) and top (double plate)."""
    groups = {0: [band(STUD_FACE, "centre")] * 17, 3: [band(STUD_FACE, "centre")] * 17,
              1: [band(STUD_FACE, "open")] * 7, 2: [band(STUD_FACE, "open")] * 7}
    zs = [band(STUD_FACE, "flush")] * 7 + [band(2 * STUD_FACE, "flush")] * 7
    return groups, zs


_verf = np.vectorize(erf)


def p_in(half, s):
    return 1.0 if s <= 0 else erf(half / (s * sqrt(2)))


def _cond(e, halves, s_robot):
    """prod over nails of P(|e + r| <= half), r ~ N(0, s_robot), vectorised over e."""
    c = np.ones_like(e)
    for h in halves:
        if s_robot <= 0:
            c *= (np.abs(e) <= h)
        else:
            c *= 0.5 * (_verf((h - e) / (s_robot * sqrt(2))) + _verf((h + e) / (s_robot * sqrt(2))))
    return c


def sheet_success_analytic(s_stud, s_robot, n_grid=801, span=6.0):
    """P(all nails inside their windows) when each stud has a shared N(0, s_stud) error and each
    nail adds an independent N(0, s_robot). Integrates over the stud error on a grid."""
    groups, zs = stud_groups()
    p = 1.0
    for h in zs:
        p *= p_in(h, s_robot)
    if s_stud <= 0:
        e = np.zeros(1)
        w = np.ones(1)
    else:
        e = np.linspace(-span * s_stud, span * s_stud, n_grid)
        w = np.exp(-0.5 * (e / s_stud) ** 2)
        w /= w.sum()
    for hs in groups.values():
        p *= float((w * _cond(e, hs, s_robot)).sum())
    return p


def estimate_errors(policy, rng, trials, s_meas, s_layout, n_read=1, k_studs=4):
    """Position error (estimate minus truth) of the four sheet studs, shape (trials, 4), in metres.

    Truth: x_i = o + i*SPACING + l_i, l_i ~ N(0, s_layout) (common offset o unknown, flat prior).
    Readings: m_ij = x_i + N(0, s_meas), n_read per stud.
    policy "single":  trust each stud's mean reading.
    policy "pooled":  shrink each stud toward the grid fitted through all k_studs studs measured
                      (the sheet's four plus, if k_studs > 4, more along the wall), BLUP weights.
    """
    idx = np.arange(k_studs)
    l = rng.normal(0, s_layout, (trials, k_studs))
    m = l + rng.normal(0, s_meas / sqrt(n_read), (trials, k_studs))     # offset o cancels in the error
    if policy == "single":
        est = m
    elif policy == "pooled":
        v = s_meas ** 2 / n_read
        wgt = s_layout ** 2 / (s_layout ** 2 + v) if (s_layout ** 2 + v) > 0 else 0.0
        o_hat = m.mean(axis=1, keepdims=True)
        est = o_hat + wgt * (m - o_hat)
    else:
        raise ValueError(policy)
    return (est - l)[:, :4]


def simulate(policy, s_meas, s_layout, s_robot, n_read=1, k_studs=4, trials=20000, seed=1):
    """Monte Carlo of the whole sheet. Returns (P(every nail inside its window), mean share of
    the 62 nails that miss). Per-nail robot scatter is independent; policy "servo" re-measures at
    every nail, so each y-nail gets its own reading error instead of a shared stud error."""
    rng = np.random.default_rng(seed)
    groups, zs = stud_groups()
    if policy == "servo":
        err = None
    else:
        err = estimate_errors(policy, rng, trials, s_meas, s_layout, n_read, k_studs)
    ok = np.ones(trials, bool)
    missed = np.zeros(trials)
    total = 0
    for k, hs in groups.items():
        for h in hs:
            shared = rng.normal(0, s_meas / sqrt(n_read), trials) if err is None else err[:, k]
            hit = np.abs(shared + rng.normal(0, s_robot, trials)) <= h
            ok &= hit
            missed += ~hit
            total += 1
    for h in zs:
        hit = np.abs(rng.normal(0, s_robot, trials)) <= h
        ok &= hit
        missed += ~hit
        total += 1
    return float(ok.mean()), float(missed.mean() / total)


def sheet_success_mc(*a, **k):
    return simulate(*a, **k)[0]


def required_meas(policy, s_layout, s_robot, target=0.95, n_read=1, k_studs=4, trials=20000):
    """Largest reading scatter s_meas with sheet success >= target (bisection on the MC, fixed seed)."""
    lo, hi = 1e-5, 0.03
    if sheet_success_mc(policy, lo, s_layout, s_robot, n_read, k_studs, trials) < target:
        return 0.0
    for _ in range(22):
        mid = (lo + hi) / 2
        if sheet_success_mc(policy, mid, s_layout, s_robot, n_read, k_studs, trials) >= target:
            lo = mid
        else:
            hi = mid
    return lo
