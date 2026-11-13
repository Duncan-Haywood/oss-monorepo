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


def _sim(inp, sensors, extra, prefix):
    import wntr  # noqa: PLC0415 (heavy, optional)

    wn = wntr.network.WaterNetworkModel(inp)
    t = wn.options.time
    t.duration, t.hydraulic_timestep, t.report_timestep = 24 * 3600, 3600, 3600
    if extra is not None:
        node, q_m3h = extra
        wn.get_node(node).add_demand(q_m3h / 3600.0, None, "leak")   # m3/s, constant
    res = wntr.sim.EpanetSimulator(wn).run_sim(file_prefix=prefix)
    p = res.node["pressure"][sensors].to_numpy()
    return p[:24].mean(axis=0)   # hours 0..23 (the 25th report is 24:00)


def _worker(args):
    inp, sensors, nodes, q, wid = args
    d = tempfile.mkdtemp(prefix=f"wl{wid}_")
    out = []
    for k, j in enumerate(nodes):
        out.append(_sim(inp, sensors, (j, q), os.path.join(d, f"s{k}")))
    return out


def signatures(inp, sensors, nodes, q, procs=4):
    """[len(nodes), len(sensors)] 24 h mean pressure change (m) for a leak of q m3/h at each node."""
    base = _sim(inp, sensors, None, os.path.join(tempfile.mkdtemp(prefix="wlb_"), "base"))
    chunks = [nodes[i::procs] for i in range(procs)]
    with ProcessPoolExecutor(procs) as ex:
        parts = list(ex.map(_worker, [(inp, sensors, c, q, i) for i, c in enumerate(chunks)]))
    S = np.zeros((len(nodes), len(sensors)))
    for i, part in enumerate(parts):
        S[i::procs] = np.array(part) - base
    return S


def residual(P, A, t, W=14, g=7, span=24):
    """Mean (pressure - prediction) per sensor over hours [t, t + span), in the units of P.

    The model is fitted on the days [max(0, d - g - W), d - g), d = t // 24 (step 1's window),
    at least 7 of them."""
    d = t // 24
    lo = max(0, d - g - W)
    if d - g - lo < 7:
        raise ValueError(f"hour {t}: fewer than 7 training days before day {d - g}")
    tr = slice(lo * 24, (d - g) * 24)
    coef, *_ = np.linalg.lstsq(A[tr], P[tr], rcond=None)
    te = slice(t, t + span)
    return (P[te] - A[te] @ coef).mean(axis=0)


def design_noflow(hrs, level):
    return detect.design(hrs, level)


def scores(r, S, kind="pearson"):
    """Similarity of r with each signature row: Pearson correlation or cosine."""
    if kind == "pearson":
        rc = r - r.mean()
        Sc = S - S.mean(axis=1, keepdims=True)
    else:
        rc, Sc = r, S
    num = Sc @ rc
    den = np.linalg.norm(Sc, axis=1) * np.linalg.norm(rc)
    den[den == 0] = np.inf
    return num / den


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
