"""LILA's leakage identification (Daniel et al. 2022), made automatic.

An independent MIT reimplementation written from the paper and from reading the authors'
released code (SWN-group-at-TU-Berlin/LILA, GPL-3.0; no code copied). LILA's identification
has three parts:

LI-1  For every ordered pair of pressure sensors (i, j), a linear regression of p_j on p_i and
      the main inlet flow (PUMP_1), fitted on a leak-free reference period.
LI-2  Reconstruction errors e[i, j, t] = predicted p_j from sensor i minus measured p_j. At each
      time step the "most affected sensor" (MAS) is the j that the most models find lower than
      predicted (e > 0); its error is the Euclidean norm of e[:, j, t] (the MRE), and every other
      sensor's MRE is 0 at that step.
LI-3  Montgomery's tabular CUSUM (upward) on each sensor's MRE, with mean and sd estimated on the
      reference period (non-zero values only, as in the released code), slack K = delta/2 * sd,
      alarm when the sum exceeds C_thr * sd.

The released notebook applies LI-3 per known leak, with the MAS, neighbouring sensors and
calibration windows written in by hand for each leak. Nothing in it runs blind over a year. Here
the reference period is the same trailing window D1 uses ([d - g - W, d - g), re-anchored at
each alarm), so the detector runs unattended and is tuned on 2018 only. Alarms report the MAS,
which is LILA's own location estimate before its model-based localisation step.
"""
from __future__ import annotations

import numpy as np


def fit_pairs(P, v):
    """LI-1. P [T, s] pressures, v [T] inlet flow. Returns B [s, 3, s]: for regressor sensor i,
    the columns give intercept, slope on p_i and slope on v for predicting every p_j."""
    T, s = P.shape
    B = np.empty((s, 3, s))
    for i in range(s):
        X = np.column_stack([np.ones(T), P[:, i], v])
        B[i], *_ = np.linalg.lstsq(X, P, rcond=None)
    for i in range(s):
        B[i, :, i] = (0.0, 1.0, 0.0)  # i predicts itself exactly
    return B


def errors(P, v, B):
    """e [s, s, T]: predicted p_j from sensor i minus measured p_j."""
    pred = (B[:, 0, :, None] + B[:, 1, :, None] * P.T[:, None, :]
            + B[:, 2, :, None] * v[None, None, :])
    return pred - P.T[None, :, :]


def mre(e, tie="index"):
    """LI-2. [T, s] reconstruction error: non-zero only for the MAS at each step.

    When several sensors share the top vote count, tie="index" (the step 2 pre-registered
    rule) takes the lowest sensor index, as an argmax does; tie="norm" (an ablation added
    after the 2019 scores were seen, LOG.md) takes the one with the largest error norm.
    Ties are common: a strong common driver (the inlet flow) makes every model agree on the
    sign of a sensor's own noise, so many sensors reach the maximum count at once.
    """
    s, _, T = e.shape
    votes = (e > 0).sum(axis=0)          # [s, T]: models that find j too low
    norms = np.linalg.norm(e, axis=0)    # [s, T]
    if tie == "norm":
        top = votes == votes.max(axis=0)
        j = np.where(top, norms, -1.0).argmax(axis=0)
    else:
        j = votes.argmax(axis=0)         # ties go to the lower index
    M = np.zeros((T, s))
    M[np.arange(T), j] = norms[j, np.arange(T)]
    return M


def tie_share(e):
    """Share of time steps where more than one sensor has the top vote count."""
    votes = (e > 0).sum(axis=0)
    return float(((votes == votes.max(axis=0)).sum(axis=0) > 1).mean())


def ref_stats(M, min_count=12):
    """Mean and sd of each sensor's non-zero MRE on the reference period. Sensors that are
    MAS fewer than `min_count` times get mean 0 and the median sd of the others (the released
    code leaves them NaN, which would disable them for good; a sensor that is never the MAS in
    normal operation is exactly the one a nearby leak makes the MAS)."""
    s = M.shape[1]
    mu, sd = np.zeros(s), np.full(s, np.nan)
    for j in range(s):
        x = M[M[:, j] > 0, j]
        if len(x) >= min_count:
            mu[j], sd[j] = x.mean(), x.std(ddof=1)
    fill = np.nanmedian(sd) if np.isfinite(sd).any() else 1.0
    sd[~np.isfinite(sd) | (sd < 1e-6)] = fill
    return mu, sd


def detect_lila(P, v, W=14, g=7, wmin=7, delta=4.0, c_thr=3.0, tie="index"):
    """Automatic LILA over hourly data. Returns (alarms [(hour, MAS index)], M [H, s]).

    Day d is scored with LI-1 models and LI-3 statistics from days [max(d - g - W, anchor),
    d - g); anchor is the last alarm day. Every CUSUM resets at an alarm.
    """
    H, s = P.shape
    days = H // 24
    M_all = np.zeros((H, s))
    C = np.zeros(s)
    alarms, anchor, cache = [], 0, {}
    for d in range(days):
        lo, hi = max(d - g - W, anchor), d - g
        if hi - lo < wmin:
            continue
        if (lo, hi) not in cache:
            tr = slice(lo * 24, hi * 24)
            B = fit_pairs(P[tr], v[tr])
            mu, sd = ref_stats(mre(errors(P[tr], v[tr], B), tie))
            cache = {(lo, hi): (B, mu, sd)}
        B, mu, sd = cache[(lo, hi)]
        te = slice(d * 24, (d + 1) * 24)
        M = mre(errors(P[te], v[te], B), tie)
        M_all[te] = M
        K = delta / 2 * sd
        for j in range(24):
            C = np.maximum(0.0, C + M[j] - mu - K)
            r = C / (c_thr * sd)
            i = int(np.argmax(r))
            if r[i] > 1:
                alarms.append((d * 24 + j, i))
                C[:] = 0.0
                anchor = d
                break
    return alarms, M_all
