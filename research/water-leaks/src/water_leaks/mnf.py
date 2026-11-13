"""M1: minimum-night-flow (MNF) leak detector on the district water balance, no pressure data.

Plan fixed in LOG.md (2026-11-13, step 6) before any night-flow series was computed.

L-Town's water balance (from L-TOWN.inp): reservoirs R1 and R2 feed the network through the
metered pipes p227 and p235; PUMP_1 lifts water from node n54 into tank T1 (diameter 16 m),
which drains back into the network, so the pump flow is internal. Demand plus leakage is

    Q = p227 + p235 - A_T1 * dL/dt,      A_T1 = pi * 8^2 m^2.

Each night's statistic is the least hourly Q from 00:00 to 06:00, known at 06:00. A trailing
median / MAD baseline over the same window as D1 (days [max(d - g - W, anchor), d - g), at least
`wmin` days) standardises it, and a one-sided upward CUSUM raises the alarm; an alarm resets the
CUSUM and re-anchors the window at the alarm day, exactly as D1 does.
"""
from __future__ import annotations

import numpy as np

TANK_AREA = np.pi * 8.0 ** 2  # m^2, T1 diameter 16 m in L-TOWN.inp [TANKS]
NIGHT = range(0, 6)           # hours 00:00-05:59
ALARM_HOUR = 6                # the night's minimum is known at 06:00


def net_demand(inflow, level, tank=True):
    """Hourly district demand plus leakage (m3/h) from hourly inflow (m3/h) and tank level (m)."""
    q = np.asarray(inflow, dtype=float).copy()
    if tank:
        q -= TANK_AREA * np.gradient(np.asarray(level, dtype=float))
    return q


def night_min(q):
    """Least hourly flow in hours 00-05 of each day; q has 24 * days entries starting at 00:00."""
    days = len(q) // 24
    Q = np.asarray(q[: days * 24]).reshape(days, 24)
    return Q[:, list(NIGHT)].min(axis=1)


def detect_mnf(m, W=14, g=7, wmin=7, k=0.5, h=5.0, mad_floor=0.1):
    """Upward CUSUM on standardised nightly minima. Returns (alarms [(hour index, 0)], z per day)."""
    days = len(m)
    z = np.full(days, np.nan)
    S, anchor, alarms = 0.0, 0, []
    for d in range(days):
        lo, hi = max(d - g - W, anchor), d - g
        if hi - lo < wmin:
            continue
        ref = m[lo:hi]
        med = np.median(ref)
        sd = max(1.4826 * np.median(np.abs(ref - med)), mad_floor)
        z[d] = (m[d] - med) / sd
        S = max(0.0, S + z[d] - k)
        if S > h:
            alarms.append((d * 24 + ALARM_HOUR, 0))
            S, anchor = 0.0, d
    return alarms, z


def weekday_offsets(m, days, train):
    """Step 7 (M2/M4): mean of each night's minimum minus the median of the 7 nights centred on
    it, by weekday of the night's date (0 = Monday), over the nights where `train` is true.
    `days` are numpy datetime64[D]. Returns 7 offsets in the units of m (as step 6's weekly.py)."""
    from numpy.lib.stride_tricks import sliding_window_view
    m = np.asarray(m, dtype=float)
    mt = m[train]
    res = mt - np.median(sliding_window_view(np.pad(mt, 3, mode="edge"), 7), axis=1)
    dow = (np.asarray(days)[train].astype(int) + 3) % 7
    return np.array([res[dow == k].mean() for k in range(7)])


def deweek(m, days, offsets):
    """Subtract each night's weekday offset."""
    dow = (np.asarray(days).astype(int) + 3) % 7
    return np.asarray(m, dtype=float) - offsets[dow]
