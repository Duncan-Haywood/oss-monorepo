"""Detection scoring against BattLeDIM ground truth (detection only, no reported pipe)."""
from __future__ import annotations

import numpy as np


def leak_events(ts, cols, L):
    """[(pipe, onset, end, peak m3/h, volume m3)] from a leakage-flow table (5-min steps)."""
    out = []
    for j, name in enumerate(cols):
        nz = np.nonzero(L[:, j] > 0)[0]
        if len(nz):
            out.append((name, ts[nz[0]], ts[nz[-1]], float(L[:, j].max()),
                        float(L[:, j].sum() * 5 / 60)))
    return out


def merge_years(ev2018, ev2019):
    """One event list over both years: a 2019 leak running since 2018 keeps its 2018 onset.

    Returns (events, carried) where carried is the set of indices continued from 2018.
    """
    first = {e[0]: e for e in ev2018}
    out, carried = [], set()
    for e in ev2018:
        later = [f for f in ev2019 if f[0] == e[0]]
        if later:
            f = later[0]
            out.append((e[0], e[1], f[2], max(e[3], f[3]), e[4] + f[4]))
            carried.add(len(out) - 1)
        else:
            out.append(e)
    out += [f for f in ev2019 if f[0] not in first]
    return out, carried


def match(alarm_times, events, window=np.timedelta64(30, "D")):
    """Greedy matching in time order.

    An alarm at t matches the unmatched event with the latest onset such that
    onset <= t <= min(end, onset + window). Returns (matches {event index: alarm time},
    false-alarm times).
    """
    matched, false = {}, []
    for t in sorted(alarm_times):
        best = None
        for e, (_, on, end, *_rest) in enumerate(events):
            if e in matched or t < on or t > min(end, on + window):
                continue
            if best is None or on > events[best][1]:
                best = e
        if best is None:
            false.append(t)
        else:
            matched[best] = t
    return matched, false


def volume_before(ts, cols, L, pipe, onset, until):
    """Leak volume (m3) of one pipe from onset up to (not including) `until`."""
    j = cols.index(pipe)
    m = (ts >= onset) & (ts < until)
    return float(L[m, j].sum() * 5 / 60)
