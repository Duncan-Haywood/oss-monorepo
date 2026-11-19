"""Milestone 11ao: the barometer's speed-dependent offset differs between airframes, so between operators it does not
cancel. Does that unshared term change the altitude-layer stack?

Why: 11an's "Next" ("the speed term as a differential error between drones flying different speeds in adjacent
layers"). 11an fitted d ~ 1 + t + v_h^2 (d = baro - RTK-fixed GNSS height) on every flight whose level RTK-fixed
speeds span 5 m/s, and found an offset at 10 m/s, c * 100, of -4.70, -1.44, +0.81, +1.06 and +1.55 m in the 5 usable
en-route flights (static-port position error from dynamic pressure and prop wash; sign and size set by the
airframe). Every planner since 11al treated the barometer's error as zero-mean noise per drone plus a shared pressure
field. A static-pressure offset is neither: drones of one operator (one airframe, one cruise speed) share it, so it
cancels inside an operator, but two operators flying different airframes carry different offsets, a constant bias in
their altitude gap for the whole cruise.

Model. 11an post hoc's planner (px4_height_run.py --rtk5: 11al's shared-field pressure supports, per-drone noise a
scale mixture over sqrt(FTE^2 + s5^2) of the 7 RTK en-route flights), delivery ages only (11al's "deliv" mission, the
headline cell of every layer milestone). Each operator i draws an offset b_i = s * c_i * 100 m, c_i drawn with
replacement from the 5 usable en-route flights' c (the offset as at 10 m/s, no extrapolation in speed), D = 4 draws
per layout (seed 7000 * draw + layout). The gap error of a cross-operator pair gains the constant b_i - b_j (added
to its pressure-part support; ds.p_overlap symmetrises the sign, as for the pressure part); a same-operator pair
gains nothing. s sweeps 0.25, 0.5, 1 and 2: 1 is the measured offset at 10 m/s, 0.25 and 0.5 a fleet that has
calibrated three quarters or half of it away (PX4's EKF2_PCOEF_* static-pressure coefficients exist for this; the
logs do not record whether they were set), 2 a crude stand-in for the layouts' faster cruise speeds (12 to 28 m/s,
where a v^2 law would give more, but 11an's fits span 5 to 11 m/s and are not extrapolated).

Planners, each picking its own spacing on 11aj's grid and its labels by 200 descents; all scored under the truth
(supports plus the drawn offsets):
  * aware: knows every operator's offset (a UTM service that measures each operator's bias, e.g. from conformance
    monitoring against a geometric reference);
  * dist: knows only the offsets' distribution: every cross-operator pair's support convolved with the 25 equally
    likely differences s * (c_a - c_b) * 100 (compressed to 120 equal-count bins);
  * blind: 11an's --rtk5 plan, no offset term (what every milestone since 11al would hand out).
  * base: the aware plan with no offsets (s = 0), the reference for what the offsets cost.

Predictions (written and pushed before this script was run on any layout; 11an's c values and 11ai to 11an results
were known; the pair-difference sd of the 5 offsets, about 3.5 m at s = 1, was computed by hand while planning):
 P1 at s = 1 the aware planner's median h* over layouts and draws is at least 17.14 m (4 bands or fewer) at both M.
 P2 at s = 1 the blind plan costs a median at least 1.25 times the aware plan (both under the truth) at both M.
 P3 at s = 0.25 the aware median h* is 13.33 m (5 bands) and blind / aware has a median at most 1.05 at both M.
 P4 at s = 1 dist / aware has a median at most 1.10 at both M: knowing the offsets' spread is nearly as good as
    knowing each operator's.
 P5 at s = 1 the aware plan's F is a median at least 1.2 times base's: the offsets cost losses of separation even
    when planned for.
Reported without a prediction: s = 0.5 and 2, the spread over draws, and the same analysis with the c of all 12
distinct flights whose speeds span 5 m/s (--all12, M = 12 layouts only, for run time; 7 of the 12 lack 30 s of
level en-route flight). Added after the main run started, before any of its results were read: --all12 runs M = 12
only.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build     # 11ai's inputs (0.15 s, committed)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 speed_offset.py > speed_offset_results.txt
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 speed_offset.py --all12 > speed_offset_all12_results.txt

Limits: 5 (or 12) flights chosen by their uploaders; c fitted on ground speed (wind not removed); offsets assigned to
operators at random from those flights, so two operators can draw the same airframe; one offset per operator for the
whole cruise (no climb or turn terms); everything else is 11al's and 11an's. Preliminary.
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

Z = ds.Z
HG = dr.HG
SCALES = (0.25, 0.5, 1.0, 2.0)
DRAWS = 4
ALL12 = "--all12" in sys.argv


def offsets_10(d, all12=False):
    """Offsets at 10 m/s (m), c * 100, one per distinct flight. Default: 11an's P4 set (usable en route, speeds
    spanning 5 m/s, deduplicated by the en-route summary). all12: every flight with a fitted c, deduplicated by
    (c, v_span)."""
    import rtk_baro as rb
    out, seen = [], set()
    for x in d["logs"]:
        c = x.get("c")
        if c is None or not np.isfinite(c) or not x.get("rtk") or x.get("v_span", 0) < rb.MIN_SPAN:
            continue
        if all12:
            key = (round(c, 9), round(x["v_span"], 6))
        else:
            if x.get("rtk_level_s", 0) < rb.MIN_USABLE_S or not x.get("enroute"):
                continue
            key = (x["enroute"]["n"], round(x["enroute"]["r_lin"], 9))
        if key not in seen:
            seen.add(key)
            out.append(100.0 * c)
    return np.array(out)


def draw_offsets(c10, m, s, seed):
    """b_i = s * c_i, c_i drawn with replacement from c10, for m operators."""
    rng = np.random.default_rng(seed)
    return s * rng.choice(c10, size=m, replace=True)


def with_offsets(sup, b):
    """Supports with the constant b_i - b_j added to every cross-operator pair; same-operator pairs unchanged."""
    return {(i, j): (dl if i == j else dl + (b[i] - b[j])) for (i, j), dl in sup.items()}


def with_spread(sup, c10, s, nbins=120):
    """Supports convolved with the equally likely offset differences s * (c_a - c_b) for cross-operator pairs."""
    diffs = s * (c10[:, None] - c10[None, :]).ravel()
    return {(i, j): (dl if i == j else ds.compress((dl[:, None] + diffs[None, :]).ravel(), nbins))
            for (i, j), dl in sup.items()}


_ST = None


def _state():
    global _ST
    if _ST is None:
        import px4_height_run as phr
        import rtk_baro as rb
        phr.RTK5 = True
        rms = phr.flight_rms()
        _ST = (phr, phr.mix_scales(rms), offsets_10(rb.load(), ALL12), len(rms))
    return _ST


def plan(phr, scales, W, X, V, sup, m, seed, starts=()):
    """{h: (labels, F)} for the scale-mixture tables built from sup, best of dr.RESTARTS descents at each h."""
    out = {}
    for h in HG:
        k = dr.bb.k_cap(dr.ll.H_DEPTH, h, m)
        P = ds.PairProblem(W, X, V, *phr.tables_mix(sup, m, h, scales, k))
        lab, F = P.search(restarts=dr.RESTARTS, seed=seed, starts=[s.get(h) for s in starts if s.get(h)])
        out[h] = (lab, F, P)
    return out


def best(p):
    h = min(p, key=lambda q: (p[q][1], q))
    return h, p[h][0], p[h][1]


def analyse(L):
    phr, scales, c10, _ = _state()
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    isd = ds.load_isd()
    rng = np.random.default_rng(100000 * 0 + idx)        # 11al's seed for "deliv": the same pressure supports
    sup, _ = dr.pair_supports(idx, m, "deliv", rng, isd)
    seed = idx + 13
    base = plan(phr, scales, W, X, V, sup, m, seed)
    hb, lb, Fb = best(base)
    blind_labs = {h: base[h][0] for h in HG}
    res = {"base": (hb, len(set(lb)), Fb), "cells": {}}
    for s in SCALES:
        dist = plan(phr, scales, W, X, V, with_spread(sup, c10, s), m, seed, starts=[blind_labs])
        hd, ld, _ = best(dist)
        rows = []
        for dd in range(DRAWS):
            b = draw_offsets(c10, m, s, 7000 * dd + idx)
            truth = plan(phr, scales, W, X, V, with_offsets(sup, b), m, seed,
                         starts=[blind_labs, {h: dist[h][0] for h in HG}])
            ha, la, Fa = best(truth)
            F_blind = truth[hb][2].score(lb)
            F_dist = truth[hd][2].score(ld)
            rows.append({"h_aware": ha, "bands": len(set(la)), "F_aware": Fa, "blind": F_blind / Fa,
                         "dist": F_dist / Fa, "vs_base": Fa / Fb, "h_dist": hd})
        res["cells"][s] = rows
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.0f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return (m, idx), res


def med(x):
    return S.median(list(x))


SIZES_RUN = (12,) if ALL12 else (12, 16)


def main(done):
    keys = [(m, n) for m in SIZES_RUN for n in dr.SIZES[m]]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = dict(pool_.map(analyse, [done[k] for k in keys]))
    _, scales, c10, nfl = _state()
    P = print
    P("# Milestone 11ao%s: operator-specific barometer speed offsets in 11an's --rtk5 planner (speed_offset.py's "
      "docstring). deliv ages, Z = %.2f m, H = %g m, %d spacings, best of %d descents, 48 layouts, %d draws" % (
          " (--all12, no prediction)" if ALL12 else "", Z, dr.ll.H_DEPTH, len(HG), dr.RESTARTS, DRAWS))
    diffs = (c10[:, None] - c10[None, :]).ravel()
    P("# offsets at 10 m/s from %d flights (m): %s; sd %.3f, sd of b_i - b_j %.3f; per-drone noise from %d flights" % (
        len(c10), ", ".join("%+.2f" % v for v in sorted(c10)), np.std(c10, ddof=1), np.std(diffs), nfl))
    P("# ratios: blind/aware, dist/aware (each plan under the truth), aware/base (base = no offsets)")
    out = {}
    for m in SIZES_RUN:
        idx = [k for k in keys if k[0] == m]
        P()
        P("## M = %d (24 layouts x %d draws); base h* median %.2f, bands %.1f" % (
            m, DRAWS, med(res[k]["base"][0] for k in idx), med(res[k]["base"][1] for k in idx)))
        P("  s      h*_aware  bands  h*_dist  blind/aware  max     dist/aware  max     aware/base  p90")
        for s in SCALES:
            R = [r for k in idx for r in res[k]["cells"][s]]
            hd = [res[k]["cells"][s][0]["h_dist"] for k in idx]
            row = dict(h=med(r["h_aware"] for r in R), blind=med(r["blind"] for r in R),
                       dist=med(r["dist"] for r in R), base=med(r["vs_base"] for r in R))
            out[(m, s)] = row
            P("  %-5g  %7.2f   %4.1f   %6.2f   %8.4f   %7.4f   %8.4f   %7.4f   %8.4f   %7.4f" % (
                s, row["h"], med(r["bands"] for r in R), med(hd), row["blind"], max(r["blind"] for r in R),
                row["dist"], max(r["dist"] for r in R), row["base"],
                float(np.percentile([r["vs_base"] for r in R], 90))))
        P("  h*_aware distribution (s: h x count)")
        for s in SCALES:
            hs = [round(r["h_aware"], 2) for k in idx for r in res[k]["cells"][s]]
            P("    %-5g %s" % (s, ", ".join("%g: %d" % (h, hs.count(h)) for h in sorted(set(hs)))))
    P()
    P("# predictions" + (" (stated for the 5-flight set; shown for comparison only)" if ALL12 else ""))
    for m in SIZES_RUN:
        r = out[(m, 1.0)]
        P("  P1 M=%d s=1 median h*_aware >= 17.14: %.2f -> %s" % (m, r["h"], "held" if r["h"] >= 17.13 else "refuted"))
    for m in SIZES_RUN:
        r = out[(m, 1.0)]
        P("  P2 M=%d s=1 blind/aware median >= 1.25: %.4f -> %s" % (m, r["blind"], "held" if r["blind"] >= 1.25
                                                                       else "refuted"))
    for m in SIZES_RUN:
        r = out[(m, 0.25)]
        ok = abs(r["h"] - 13.33) < 0.01 and r["blind"] <= 1.05
        P("  P3 M=%d s=0.25 median h*_aware = 13.33 and blind/aware <= 1.05: %.2f, %.4f -> %s" % (
            m, r["h"], r["blind"], "held" if ok else "refuted"))
    for m in SIZES_RUN:
        r = out[(m, 1.0)]
        P("  P4 M=%d s=1 dist/aware median <= 1.10: %.4f -> %s" % (m, r["dist"], "held" if r["dist"] <= 1.10
                                                                     else "refuted"))
    for m in SIZES_RUN:
        r = out[(m, 1.0)]
        P("  P5 M=%d s=1 aware/base median >= 1.2: %.4f -> %s" % (m, r["base"], "held" if r["base"] >= 1.2
                                                                    else "refuted"))
    P()
    P("# analysis CPU s per layout: median %.0f" % med(res[k]["cpu"] for k in keys))


if __name__ == "__main__":
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    if "--one" in sys.argv:
        SCALES = (1.0,)
        DRAWS = 1
        k = next(iter(done))
        print(analyse(done[k])[1])
        sys.exit(0)
    missing = [(m, i) for m in (12, 16) for i in dr.SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
