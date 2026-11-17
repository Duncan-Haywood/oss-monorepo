"""D1: trailing-window residual CUSUM leak detector (data-driven, no hydraulic model).

For each pressure sensor and each day d, a least-squares model of hourly pressure is
fitted on the days [d - g - W, d - g) and used to predict day d. Regressors: an
hour-of-week profile (168 indicator columns, collapsed to 24 hour-of-day x
{weekday, weekend} = 48 so a two-week window fits them), the tank level, and,
in variant "F", the inlet flows. Residuals are standardised by the window's residual sd.
A one-sided CUSUM per sensor accumulates negative residuals (a leak lowers pressure);
crossing h raises an alarm and resets every CUSUM.

After an alarm the training window is re-anchored: it starts no earlier than the alarm
day, so the leak just declared becomes part of the baseline, and scoring resumes once the
window holds `wmin` days. Without this (an earlier version held off for g days only) the
window still contained no post-leak data when the hold-off ended, and the same leak
alarmed again (`tests/`, the step-drop test).
"""
from __future__ import annotations

import numpy as np


def hourly(ts, X):
    """Hourly means of 5-minute data. Returns (hour timestamps, [H, k])."""
    h = ts.astype("datetime64[h]")
    n = len(h) // 12 * 12
    return h[:n:12], X[:n].reshape(-1, 12, X.shape[1]).mean(axis=1)


def design(hours, level, flows=None):
    """Regressor matrix [H, m] for hourly timestamps."""
    hod = (hours - hours.astype("datetime64[D]")).astype(int)
    dow = (hours.astype("datetime64[D]").astype(int) + 3) % 7  # 0 = Monday
    weekend = (dow >= 5).astype(int)
    cols = np.zeros((len(hours), 48))
    cols[np.arange(len(hours)), hod + 24 * weekend] = 1.0
    parts = [cols, level.reshape(len(hours), -1)]
    if flows is not None:
        parts.append(flows)
    return np.hstack(parts)


def residual_z(P, A, W=14, g=7):
    """Standardised one-day-ahead residuals [H, s]; NaN where no model exists yet.

    P: hourly pressures [H, s]; A: design matrix [H, m]; H a multiple of 24.
    """
    H, s = P.shape
    days = H // 24
    Z = np.full((H, s), np.nan)
    for d in range(W + g, days):
        tr = slice((d - g - W) * 24, (d - g) * 24)
        te = slice(d * 24, (d + 1) * 24)
        coef, *_ = np.linalg.lstsq(A[tr], P[tr], rcond=None)
        res = P[tr] - A[tr] @ coef
        sd = res.std(axis=0, ddof=A.shape[1] // 10 + 1)
        sd[sd < 1e-6] = 1e-6
        Z[te] = (P[te] - A[te] @ coef) / sd
    return Z


def cusum_alarms(Z, k=0.5, h=50.0, holdoff=7 * 24):
    """One-sided (downward) CUSUM per sensor with global reset and hold-off.

    Returns a list of (hour index, sensor index) alarms.
    """
    H, s = Z.shape
    S = np.zeros(s)
    alarms, wait = [], 0
    for t in range(H):
        z = Z[t]
        if np.isnan(z).any():
            continue
        if wait > 0:
            wait -= 1
            continue
        S = np.maximum(0.0, S - z - k)
        i = int(np.argmax(S))
        if S[i] > h:
            alarms.append((t, i))
            S[:] = 0.0
            wait = holdoff
    return alarms


def _fit_predict(P, A, tr, te):
    coef, *_ = np.linalg.lstsq(A[tr], P[tr], rcond=None)
    res = P[tr] - A[tr] @ coef
    dof = max(1, (tr.stop - tr.start) - np.linalg.matrix_rank(A[tr]))
    sd = np.sqrt((res ** 2).sum(axis=0) / dof)
    sd[sd < 1e-6] = 1e-6
    return (P[te] - A[te] @ coef) / sd


def detect_sequential(P, A, W=14, g=7, wmin=7, k=0.5, h=50.0):
    """D1 with re-anchoring. Returns (alarms [(hour, sensor)], Z [H, s] as scored).

    Day d is scored with a model fitted on days [max(d - g - W, anchor), d - g), where
    anchor is the day of the last alarm (0 before any); it is scored only if that window
    holds at least `wmin` days.
    """
    H, s = P.shape
    days = H // 24
    Z = np.full((H, s), np.nan)
    S = np.zeros(s)
    alarms, anchor = [], 0
    for d in range(days):
        lo, hi = max(d - g - W, anchor), d - g
        if hi - lo < wmin:
            continue
        z = _fit_predict(P, A, slice(lo * 24, hi * 24), slice(d * 24, (d + 1) * 24))
        Z[d * 24:(d + 1) * 24] = z
        for j in range(24):
            S = np.maximum(0.0, S - z[j] - k)
            i = int(np.argmax(S))
            if S[i] > h:
                alarms.append((d * 24 + j, i))
                S[:] = 0.0
                anchor = d
                break
    return alarms, Z
