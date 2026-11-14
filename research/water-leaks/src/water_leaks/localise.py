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
