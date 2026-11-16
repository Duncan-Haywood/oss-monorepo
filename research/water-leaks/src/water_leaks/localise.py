"""Step 11: sensitivity-based leak localisation on the nominal L-Town model.

A leak signature s_j is the 24 h mean change in pressure at the 33 sensor nodes when a constant
extra demand q is drawn at junction j, from WNTR's EPANET simulator on `L-TOWN.inp` (Klise et al.
2017). An observed residual r is each sensor's mean (pressure - prediction) over the 24 h from a
localisation time, the prediction being step 1's D1 regression without flows fitted on a trailing
window. The estimate is the junction whose signature correlates best with r.

Only `signatures` needs WNTR; everything else is numpy, so the tests run without it.
"""
from __future__ import annotations

import os
import tempfile
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from water_leaks import detect


def _sim(inp, sensors, extra, prefix, hourly=False):
    import wntr  # noqa: PLC0415 (heavy, optional)

    wn = wntr.network.WaterNetworkModel(inp)
    t = wn.options.time
    t.duration, t.hydraulic_timestep, t.report_timestep = 24 * 3600, 3600, 3600
    if extra is not None:
        node, q_m3h = extra
        wn.get_node(node).add_demand(q_m3h / 3600.0, None, "leak")   # m3/s, constant
    res = wntr.sim.EpanetSimulator(wn).run_sim(file_prefix=prefix)
    p = res.node["pressure"][sensors].to_numpy()
    if hourly:
        return p[:24]            # [24, sensors], hours 0..23 from 00:00
    return p[:24].mean(axis=0)   # hours 0..23 (the 25th report is 24:00)


def _worker(args):
    inp, sensors, nodes, q, wid, hourly = args
    d = tempfile.mkdtemp(prefix=f"wl{wid}_")
    out = []
    for k, j in enumerate(nodes):
        out.append(_sim(inp, sensors, (j, q), os.path.join(d, f"s{k}"), hourly))
    return out


def signatures(inp, sensors, nodes, q, procs=4, hourly=False):
    """Pressure change (m) at the sensors for a constant leak of q m3/h at each node:
    [nodes, sensors] as a 24 h mean, or [nodes, 24, sensors] hour by hour (step 12)."""
    base = _sim(inp, sensors, None, os.path.join(tempfile.mkdtemp(prefix="wlb_"), "base"), hourly)
    chunks = [nodes[i::procs] for i in range(procs)]
    with ProcessPoolExecutor(procs) as ex:
        parts = list(ex.map(_worker, [(inp, sensors, c, q, i, hourly) for i, c in enumerate(chunks)]))
    S = np.zeros((len(nodes),) + base.shape)
    for i, part in enumerate(parts):
        S[i::procs] = np.array(part) - base
    return S


def residual(P, A, t, W=14, g=7, span=24):
    """Mean (pressure - prediction) per sensor over hours [t, t + span), in the units of P.

    The model is fitted on the days [max(0, d - g - W), d - g), d = t // 24 (step 1's window),
    at least 7 of them."""
    return residual_hourly(P, A, t, W, g, span).mean(axis=0)


def residual_hourly(P, A, t, W=14, g=7, span=24):
    """(pressure - prediction) per hour and sensor over hours [t, t + span): [span, sensors]."""
    d = t // 24
    lo = max(0, d - g - W)
    if d - g - lo < 7:
        raise ValueError(f"hour {t}: fewer than 7 training days before day {d - g}")
    tr = slice(lo * 24, (d - g) * 24)
    coef, *_ = np.linalg.lstsq(A[tr], P[tr], rcond=None)
    te = slice(t, t + span)
    return P[te] - A[te] @ coef


def design_noflow(hrs, level):
    return detect.design(hrs, level)


TOL = 1e-4   # m, RMS; EPANET reports pressure in float32, so ~1e-5 m differences are rounding


def scores(r, S, kind="pearson", tol=TOL):
    """Similarity of r with each signature row: Pearson correlation or cosine.

    A row whose (centred, for Pearson) RMS is below `tol` metres scores 0: its correlation is
    set by float32 rounding, not hydraulics (step 12: junction n111's 24 h mean signature is a
    uniform shift, exactly constant from one route and 5e-7 m of noise from another)."""
    if kind == "pearson":
        rc = r - r.mean()
        Sc = S - S.mean(axis=1, keepdims=True)
    else:
        rc, Sc = r, S
    num = Sc @ rc
    nS = np.linalg.norm(Sc, axis=1)
    den = nS * np.linalg.norm(rc)
    den[(den == 0) | (nS < tol * np.sqrt(Sc.shape[1]))] = np.inf
    return num / den


def aligned(SH, hod0):
    """Hourly signatures [nodes, 24, s] re-ordered so row k is hour of day (hod0 + k) % 24."""
    return SH[:, (hod0 + np.arange(24)) % 24, :]


def scores_tr(R, SH):
    """Step 12: Pearson correlation of a [24, s] residual with each [24, s] signature over all
    24 x s entries, each hour's row first centred by its own mean across sensors (so a common
    pressure shift in one hour, e.g. from demand, does not count)."""
    Rc = R - R.mean(axis=1, keepdims=True)
    Sc = SH - SH.mean(axis=2, keepdims=True)
    return scores(Rc.ravel(), Sc.reshape(len(SH), -1), "cosine")


def nearest_q(qhat, grid):
    """Grid value nearest qhat in log scale, qhat clipped to the grid's range."""
    g = np.asarray(grid, float)
    q = min(max(qhat, g.min()), g.max())
    return float(g[np.argmin(np.abs(np.log(g) - np.log(q)))])


def estimate(r, S, kind="pearson"):
    return int(np.argmax(scores(r, S, kind)))


def poisson_binomial_tail(ps, k):
    """P(sum of independent Bernoulli(p_i) >= k), exactly by convolution."""
    dist = np.array([1.0])
    for p in ps:
        dist = np.convolve(dist, [1 - p, p])
    return float(dist[k:].sum()) if k < len(dist) else 0.0


def sign_test_counts(a, b):
    """Discordant counts (a only, b only) for two boolean arrays."""
    a, b = np.asarray(a, bool), np.asarray(b, bool)
    return int((a & ~b).sum()), int((~a & b).sum())


def visible_from(D, on, n_hours, drop=0.05, run_len=3):
    """Step 15: first hour index >= on at which (D - its mean over the 24 h before on) is at or
    below -drop at some sensor for run_len consecutive hours; None if not within n_hours.
    D is [hours, sensors], e.g. published minus leak-free simulated pressure."""
    base = D[on - 24:on].mean(axis=0)
    run = 0
    for h in range(on, min(on + n_hours, len(D))):
        run = run + 1 if bool(((D[h] - base) <= -drop).any()) else 0
        if run == run_len:
            return h - run_len + 1
    return None


def lagged_change(X, t, lag, span=24):
    """Step 18: mean of X over hours [t, t + span) minus its mean over [t - lag, t - lag + span).

    A tracking baseline: whatever changed before t - lag drops out, and so does any part of the
    target leak's own effect that was already there. X is [hours, sensors]."""
    if t - lag < 0:
        raise ValueError(f"hour {t}: lag {lag} reaches before the data")
    return X[t:t + span].mean(axis=0) - X[t - lag:t - lag + span].mean(axis=0)


def nn_pursuit(r, S, support=(), rel=0.05, floor=0.005, kmax=24):
    """Step 19: non-negative greedy pursuit of r ([sensors]) over atoms S ([atoms, sensors]).

    Both are centred across sensors (a common pressure shift is not fitted). Leaks lower pressure,
    so each atom is a signature per unit flow and its flow is fitted non-negative. Starting from
    `support` (refitted), add the atom with the largest positive normalised correlation with the
    current residual and refit all flows by NNLS; stop when the last addition cut the RMS by less
    than `rel` of the previous RMS (that atom is dropped), the RMS is under `floor`, or `kmax`
    atoms are in. Returns (support list, flows array aligned with it, final RMS)."""
    from scipy.optimize import nnls  # noqa: PLC0415

    rc = r - r.mean()
    Sc = S - S.mean(axis=1, keepdims=True)
    nS = np.linalg.norm(Sc, axis=1)
    nS[nS == 0] = np.inf

    def fit(sup):
        if not sup:
            return np.zeros(0), rc.copy()
        x, _ = nnls(Sc[sup].T, rc)
        return x, rc - Sc[sup].T @ x

    sup = list(dict.fromkeys(int(j) for j in support))
    x, res = fit(sup)
    rms = float(np.sqrt(np.mean(res ** 2)))
    while len(sup) < kmax and rms >= floor:
        c = (Sc @ res) / nS
        c[sup] = -np.inf
        j = int(np.argmax(c))
        if c[j] <= 0:
            break
        x2, res2 = fit(sup + [j])
        rms2 = float(np.sqrt(np.mean(res2 ** 2)))
        if rms - rms2 < rel * rms:
            break
        sup, x, res, rms = sup + [j], x2, res2, rms2
    return sup, x, rms


def rise(sup_b, x_b, sup_t, x_t):
    """Step 19: the atom whose fitted flow rose most from the baseline fit to the window fit."""
    b = dict(zip(sup_b, x_b))
    d = {j: q - b.get(j, 0.0) for j, q in zip(sup_t, x_t)}
    for j in b:
        d.setdefault(j, -b[j])
    return max(d, key=d.get)


def track(R, S, rel=0.05, qmin=0.5, link=0.95, gap=2, floor=0.005, kmax=24):
    """Step 20: a daily tracker. R is [days, sensors] (daily mean residuals), S [atoms, sensors].

    Day 0 is fitted by `nn_pursuit` from an empty set; each later day from the previous day's
    active atoms (flow >= qmin). Each active atom carries an onset day: kept if the atom was
    active within the last gap + 1 days, else inherited from a track dropped within that span
    whose centred signature correlates at least `link` with it (link=None: never), else today.
    Returns a list, per day, of {atom: (flow, onset day)} and a list of per-day fit RMS."""
    Sc = S - S.mean(axis=1, keepdims=True)
    nS = np.linalg.norm(Sc, axis=1)
    nS[nS == 0] = np.inf
    Sn = Sc / nS[:, None]
    out, rmss = [], []
    prev = {}      # atom -> onset, active on the previous day
    lost = {}      # atom -> (onset, last active day), dropped within the gap
    for k, r in enumerate(R):
        sup, x, rms = nn_pursuit(r, S, support=list(prev), rel=rel, floor=floor, kmax=kmax)
        act = {j: float(q) for j, q in zip(sup, x) if q >= qmin}
        for j, o in prev.items():
            if j not in act:
                lost[j] = (o, k - 1)
        lost = {j: v for j, v in lost.items() if k - v[1] <= gap + 1}
        cur = {}
        for j in act:
            if j in prev:
                cur[j] = prev[j]
            elif j in lost:
                cur[j] = lost.pop(j)[0]
        if link is not None:
            for j in sorted((j for j in act if j not in cur), key=lambda j: (-act[j], j)):
                best, bc = None, link
                for i in sorted(lost):
                    c = float(Sn[i] @ Sn[j])
                    if c >= bc:
                        best, bc = i, c
                if best is not None:
                    cur[j] = lost.pop(best)[0]
        for j in act:
            cur.setdefault(j, k)
        prev = cur
        out.append({j: (act[j], cur[j]) for j in act})
        rmss.append(rms)
    return out, rmss


def latest_onset(state):
    """Step 20: the active atom with the latest onset, ties by the larger flow (None if empty)."""
    if not state:
        return None
    return max(state, key=lambda j: (state[j][1], state[j][0], -j))


def nearest_onset(state, day):
    """Step 20: the active atom whose onset is nearest `day`, ties by the larger flow."""
    if not state:
        return None
    return min(state, key=lambda j: (abs(state[j][1] - day), -state[j][0], j))
