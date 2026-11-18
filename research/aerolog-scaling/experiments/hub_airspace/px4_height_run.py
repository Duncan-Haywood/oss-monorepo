"""Milestone 11am planner analysis (P5 to P7 in px4_height.py's docstring): 11al's shared-field model with the
height-keeping noise taken from the PX4 logs (px4_height_2026.json, main set mission_enroute). Needs numpy.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build      # 11ai's inputs, unchanged
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 px4_height_run.py > px4_height_results.txt
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 px4_height_run.py --bound > px4_height_bound_results.txt  # post hoc
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 px4_height_run.py --rtk > rtk_baro_results.txt  # 11an
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 px4_height_run.py --rtk5 > rtk_baro_s5_results.txt  # 11an post hoc
"""
import math
import multiprocessing as mp
import os
import pickle
import statistics as S
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import drift_share as ds  # noqa: E402
import drift_share_run as dr  # noqa: E402
import px4_height_stats as phs  # noqa: E402

N_MIX = 64
OLD_SIGMA = 1.0
Z = ds.Z
HG = dr.HG


BOUND = "--bound" in sys.argv
RTK = "--rtk" in sys.argv      # milestone 11an (rtk_baro.py's docstring, P6 and P7)
RTK5 = "--rtk5" in sys.argv    # 11an post hoc: the baro - RTK difference smoothed over 5 s (rtk_baro_posthoc.py)


def flight_rms(set_name="mission_enroute"):
    """Per-flight RMS (m). With --bound (post hoc, not predicted): sqrt(FTE^2 + (baro - GNSS)^2) per flight from
    px4_height_posthoc.json, an upper bound on the height-keeping noise (baro - GNSS holds both sensors' noise)."""
    if RTK5:
        import json
        rows = json.load(open(os.path.join(HERE, "rtk_baro_posthoc.json")))["flights"]
        import rtk_baro as rb
        fte = {f["id"]: f["fte"] for f in rb.usable(rb.load(), "enroute")}
        return np.array([math.hypot(fte[r["id"]], r["enroute"]["s5"]) for r in rows if "enroute" in r])
    if RTK:
        import rtk_baro as rb
        return np.array([math.hypot(f["fte"], f["r_lin"]) for f in rb.usable(rb.load(), "enroute")])
    if BOUND:
        import json
        rows = json.load(open(os.path.join(HERE, "px4_height_posthoc.json")))["flights"]
        return np.array([math.hypot(r["fte_rms"], r["baro_gnss"]) for r in rows
                         if r.get("baro_gnss") is not None and np.isfinite(r["baro_gnss"])])
    return np.array([f["rms"] for f in phs.usable(phs.load(), set_name)])


def mix_scales(rms, n=N_MIX, seed=0):
    """n draws of the pair noise sd sqrt(r_i^2 + r_j^2), r_i and r_j independent from the per-flight RMS values,
    taken as stratified quantile pairs (i-th quantile of r_i against a fixed random permutation for r_j)."""
    rng = np.random.default_rng(seed)
    q = (np.arange(n) + 0.5) / n
    ri = np.quantile(rms, q)
    rj = np.quantile(rms, rng.permutation(q))
    return np.sqrt(ri ** 2 + rj ** 2)


def p_overlap_mix(gaps, Z, scales, deltas):
    """Scale mixture of ds.p_overlap: the mean over the pair-noise sds in `scales`."""
    return np.mean([ds.p_overlap(gaps, Z, s, deltas) for s in scales], axis=0)


def weights_mix(h, Z, scales, k, deltas):
    n = np.arange(0, 2 * k + 1)
    p = p_overlap_mix(n * h, Z, scales, deltas)
    pw = np.array([p[2 * d] for d in range(k)])
    px = np.array([0.5 * (p[2 * d + 1] + p[abs(2 * d - 1)]) for d in range(k)])
    return pw, px


def tables_mix(sup, m, h, scales, k):
    pw = np.zeros((m, m, k))
    px = np.zeros((m, m, k))
    for (i, j), dl in sup.items():
        a, b = weights_mix(h, Z, scales, k, dl)
        pw[i, j] = pw[j, i] = a
        px[i, j] = px[j, i] = b
    return pw, px


_SC = None


def analyse(L):
    global _SC
    if _SC is None:
        rms = flight_rms()
        _SC = (mix_scales(rms), phs.fleet_sigma(rms))
    scales, sig = _SC
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    isd = ds.load_isd()
    res = {"cond": {}}
    for mi, mission in enumerate(ds.MISSIONS):
        rng = np.random.default_rng(100000 * mi + idx)      # 11al's seeds: the same pressure supports
        sup, s0 = dr.pair_supports(idx, m, mission, rng, isd)
        mix, gau, old = {}, {}, {}
        for h in HG:
            k = dr.bb.k_cap(dr.ll.H_DEPTH, h, m)
            Pm = ds.PairProblem(W, X, V, *tables_mix(sup, m, h, scales, k))
            Pg = ds.PairProblem(W, X, V, *dr.tables(sup, m, h, sig * math.sqrt(2.0), k))
            Po = ds.PairProblem(W, X, V, *dr.tables(sup, m, h, OLD_SIGMA * math.sqrt(2.0), k))
            lg, Fg = Pg.search(restarts=dr.RESTARTS, seed=idx + 13)
            lo, Fo = Po.search(restarts=dr.RESTARTS, seed=idx + 13)
            lm, Fm = Pm.search(restarts=dr.RESTARTS, seed=idx + 13, starts=[lg, lo])
            mix[h] = (k, lm, Fm)
            gau[h] = (k, lg, Fg, Pm.score(lg))
            old[h] = (k, lo, Fo, Pm.score(lo))
        hm = min(mix, key=lambda q: (mix[q][2], q))
        hg = min(gau, key=lambda q: (gau[q][2], q))
        ho = min(old, key=lambda q: (old[q][2], q))
        res["cond"][mission] = {
            "mix": (hm, len(set(mix[hm][1])), mix[hm][2]), "gauss": (hg, len(set(gau[hg][1])), gau[hg][3]),
            "old": (ho, len(set(old[ho][1])), old[ho][3]), "s0": s0}
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.0f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return (m, idx), res


def med(x):
    return S.median(list(x))


def main(done):
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = dict(pool_.map(analyse, [done[k] for k in keys]))
    rms = flight_rms()
    sc = mix_scales(rms)
    P = print
    if RTK5:
        P("# POST HOC (--rtk5, no prediction): per-flight r = sqrt(FTE^2 + s5^2), s5 = line-detrended RMS of baro "
          "minus RTK height after a 5 s centred running mean (rtk_baro_posthoc.json, enroute set)")
    if RTK:
        P("# Milestone 11an (--rtk): per-flight r = sqrt(FTE^2 + r_lin^2), r_lin = line-detrended RMS of baro minus "
          "RTK-fixed GNSS height (rtk_baro_2026.json, enroute set); P5 to P7 below are 11am's, P6 and P7 of 11an are "
          "the deliv h*_mix and old/mix rows")
    if BOUND:
        P("# POST HOC (--bound, no prediction): per-flight r = sqrt(FTE^2 + detrended baro-GNSS RMS^2), an upper "
          "bound on the height-keeping noise")
    P("# Milestone 11am: 11al's shared-field planner with height-keeping noise from %d PX4 flights (mission, level, "
      "en route). Z = %.2f m, H = %g m, %d spacings, best of %d descents, 48 layouts" % (
          len(rms), Z, dr.ll.H_DEPTH, len(HG), dr.RESTARTS))
    P("# sigma_fleet = %.3f m (gauss: N(0, 2 sigma_fleet^2)); mix: pair sd sqrt(r_i^2 + r_j^2) over %d quantile pairs "
      "(median %.3f, p90 %.3f, max %.3f m). old = 11al's aware plan at sigma_n = %.1f m." % (
          phs.fleet_sigma(rms), N_MIX, np.median(sc), np.percentile(sc, 90), sc.max(), OLD_SIGMA))
    P("# Every plan scored under mix (the truth here). bands = distinct levels used.")
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        P()
        P("## M = %d (24 layouts)" % m)
        P("  mission  h*_mix  bands  h*_gauss  same_h  gauss/mix  max     h*_old  same_h  old/mix  max")
        for mission in ds.MISSIONS:
            R = [res[k]["cond"][mission] for k in idx]
            P("  %-6s   %6.2f  %4.1f   %6.2f    %2d/24   %6.4f   %6.4f  %6.2f  %2d/24   %6.4f   %6.4f" % (
                mission, med(r["mix"][0] for r in R), med(r["mix"][1] for r in R), med(r["gauss"][0] for r in R),
                sum(abs(r["mix"][0] - r["gauss"][0]) < 1e-9 for r in R),
                med(r["gauss"][2] / r["mix"][2] for r in R), max(r["gauss"][2] / r["mix"][2] for r in R),
                med(r["old"][0] for r in R), sum(abs(r["mix"][0] - r["old"][0]) < 1e-9 for r in R),
                med(r["old"][2] / r["mix"][2] for r in R), max(r["old"][2] / r["mix"][2] for r in R)))
        P("  h*_mix distribution (h: layouts)")
        for mission in ds.MISSIONS:
            hs = [round(res[k]["cond"][mission]["mix"][0], 2) for k in idx]
            P("    %-6s %s" % (mission, ", ".join("%g: %d" % (h, hs.count(h)) for h in sorted(set(hs)))))
    P()
    P("# predictions" + (" (stated for the FTE truth; shown here for comparison only)" if BOUND else ""))
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        hm = med(res[k]["cond"]["deliv"]["mix"][0] for k in idx)
        P("  P5 M=%d deliv median h*_mix <= 13.33: %.2f -> %s" % (m, hm, "held" if hm <= 13.34 else "refuted"))
    g = [res[k]["cond"][mi]["gauss"][2] / res[k]["cond"][mi]["mix"][2] for k in keys for mi in ds.MISSIONS]
    cells = [med(res[k]["cond"][mi]["gauss"][2] / res[k]["cond"][mi]["mix"][2] for k in keys if k[0] == m)
             for m in (12, 16) for mi in ds.MISSIONS]
    P("  P6 gauss/mix median <= 1.01 in every cell: worst cell median %.4f (all layouts max %.4f) -> %s" % (
        max(cells), max(g), "held" if max(cells) <= 1.01 else "refuted"))
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        o = med(res[k]["cond"]["deliv"]["old"][2] / res[k]["cond"]["deliv"]["mix"][2] for k in idx)
        P("  P7 M=%d deliv old/mix median <= 1.02: %.4f -> %s" % (m, o, "held" if o <= 1.02 else "refuted"))
    P()
    P("# analysis CPU s per layout: median %.0f" % med(res[k]["cpu"] for k in keys))


if __name__ == "__main__":
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    if "--one" in sys.argv:
        print(analyse(done[next(iter(done))])[1])
        sys.exit(0)
    missing = [(m, i) for m in (12, 16) for i in dr.SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
