"""Milestone 11ah analysis (band_budget.py's predictions), run by band_budget_run.py on its cached inputs."""
import importlib.util
import multiprocessing as mp
import os
import statistics as S

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bc = _load("hub_airspace_band_cost_11ah_a", "band_cost.py")
kw = _load("hub_airspace_split_kway_11ah_a", "split_kway.py")
bb = _load("hub_airspace_band_budget_11ah_a", "band_budget.py")
GROW_H = 7.62
GROW_K = 8


def analyse(L):
    m = L["m"]
    W = kw.matrix(L["cfD+"], m)
    F1 = float(W.sum())
    out = {"F1": F1, "cap": {}, "free": {}, "grow": {}, "replan": {}}
    for h in bb.SPACINGS:
        tau = bb.tau_of(h)
        V = bc.V_of(L["T"], tau)
        cache = {}
        for k in sorted({bb.k_cap(H, h, m) for H in bb.DEPTHS} | {m} | (set(range(2, GROW_K + 1)) if h == GROW_H else set())):
            cache[k] = bc.search_bands(W, V, k)
        out["free"][h] = cache[m]
        for H in bb.DEPTHS:
            out["cap"][(H, h)] = (bb.k_cap(H, h, m),) + tuple(cache[bb.k_cap(H, h, m)])
        if h == GROW_H:
            out["grow"] = bb.grow(bc, W, V, GROW_K)
            out["replan"] = {k: cache[k] for k in range(2, GROW_K + 1)}
    return (m, L["idx"]), out


def med(x):
    return S.median(list(x))


def main(done):
    keys = [(m, n) for m in (12, 16) for n in range(m * 100, m * 100 + 24)]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = dict(pool_.map(analyse, [done[k] for k in keys]))
    P = print
    P("# Milestone 11ah: altitude bands under a fixed altitude budget (band_budget.py); 11ag's model and inputs "
      "(W = cf_D+ en-route, V = tau*A + B), 48 layouts")
    P("# k_cap = floor((H/h + 1)/2) bands of two levels; tau = h (1/%g + 1/%g)/2 s per level crossed; best of 200 "
      "descents; F_1 = one band (all en-route weight, no transit)" % (bb.W_UP, bb.W_DOWN))
    chk = {}
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        P()
        P("## M = %d: medians over 24 layouts, by usable depth H (m) and level spacing h (m)" % m)
        P("  H      h   tau_s  k_cap   F/F_1   F/F_free   (free count used: median)")
        tab = {}
        for h in bb.SPACINGS:
            for H in bb.DEPTHS:
                r1 = [res[k]["cap"][(H, h)][2] / res[k]["F1"] for k in idx]
                rf = [res[k]["cap"][(H, h)][2] / res[k]["free"][h][1] for k in idx]
                kf = med(len(set(res[k]["free"][h][0])) for k in idx)
                tab[(H, h)] = (med(r1), med(rf))
                P("%4g  %5.2f  %5.2f  %4d    %6.4f   %7.4f    %4.1f" % (
                    H, h, bb.tau_of(h), bb.k_cap(H, h, m), med(r1), med(rf), kf))
        P()
        P("## M = %d: growing one band at a time at h = %g m (tau %.2f s) against a 200-restart re-plan at each k" % (
            m, GROW_H, bb.tau_of(GROW_H)))
        P("  k   mean F_ins/F_re   max      median moved  inserted on top (of 24)  bands used (median)")
        gl = {}
        for k in range(2, GROW_K + 1):
            r = [res[x]["grow"][k][1] / res[x]["replan"][k][1] for x in idx]
            mv = [res[x]["grow"][k][3] for x in idx]
            top = sum(res[x]["grow"][k][2] == max(res[x]["grow"][k - 1][0]) + 1 for x in idx)
            used = med(max(res[x]["grow"][k][0]) + 1 for x in idx)
            gl[k] = S.mean(r)
            P("%3d   %10.4f      %7.4f   %6.1f        %6d               %4.1f" % (k, S.mean(r), max(r), med(mv), top, used))
        chk[m] = dict(tab=tab, gl=gl, idx=idx)
    P()
    P("## Prediction checks")
    t = {m: chk[m]["tab"] for m in (12, 16)}
    P("(1) H 120, h 7.62: median F/F_free M=12 %.4f, M=16 %.4f (<= 1.01): %s" % (
        t[12][(120.0, 7.62)][1], t[16][(120.0, 7.62)][1], max(t[m][(120.0, 7.62)][1] for m in t) <= 1.01))
    P("(2) H 60, h 7.62: median F/F_free M=12 %.4f, M=16 %.4f (in [1.10, 1.40]): %s" % (
        t[12][(60.0, 7.62)][1], t[16][(60.0, 7.62)][1], all(1.10 <= t[m][(60.0, 7.62)][1] <= 1.40 for m in t)))
    P("(3) H 120, h 30.48: median F/F_1 M=12 %.4f, M=16 %.4f (>= 0.45): %s" % (
        t[12][(120.0, 30.48)][0], t[16][(120.0, 30.48)][0], min(t[m][(120.0, 30.48)][0] for m in t) >= 0.45))
    red = {}
    for m in (12, 16):
        red[m] = med(1 - res[x]["cap"][(120.0, 7.62)][2] / res[x]["cap"][(120.0, 15.24)][2] for x in chk[m]["idx"])
    P("(4) H 120, h 15.24 -> 7.62: median reduction in best F M=12 %.4f, M=16 %.4f (in [0.20, 0.40]): %s" % (
        red[12], red[16], all(0.20 <= red[m] <= 0.40 for m in red)))
    worst = max(max(chk[m]["gl"].values()) for m in (12, 16))
    P("(5) growing by insertion: worst mean F_ins/F_re over k = 2..8 and both M %.4f (<= 1.02): %s" % (worst, worst <= 1.02))
