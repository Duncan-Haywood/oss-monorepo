"""Milestone 11au: price the pair-cost tables. The scale mixture is one shared kernel, so the tables are a 1-D
interpolation, and the band count fixes the spacing.

Why: 11at's "Next". 11at found the search (200 random starts at each of 30 spacings) is about 3% of the planner's
CPU; the pair-cost tables are the rest (a median 252 CPU s per layout over 8 offset draws). 11at proposed pricing
them by lower resolution (fewer support bins, fewer spacings, interpolation across offset draws). Before trading
accuracy for speed, this milestone asks how much of that cost is exact redundancy.

Two observations, both checkable without running the planner:
  * `px4_height_run.tables_mix` evaluates, for every pair, gap and support bin, the mean over 64 pair-noise sds s of
    K_s(y) = Phi((Z - y) / s) - Phi((-Z - y) / s) at y = gap +/- delta. The 64 sds are the same for every pair, so the
    mean is one even function Kbar(y) = mean_s K_s(y) of one variable. Tabulated once on a 1 mm grid of |y| (with the
    same Abramowitz-Stegun erf), every table entry is 1/2 mean_delta [Kbar(g + delta) + Kbar(g - delta)] by linear
    interpolation: 64 times fewer erf evaluations, vectorised over pairs. Linear interpolation error on a 1 mm grid is
    at most (1e-3)^2 / 8 * max|Kbar''|, about 2e-7 for the smallest s here (0.38 m), the size of the erf's own error.
  * F has no other dependence on the spacing h than through the tables, and the band count k = k_cap(H, h, m) is a
    step function of h. Inside one k, a wider spacing moves every non-zero gap n h outward. So a planner that tries,
    for each k, only the widest spacing on the grid ("k-widest": 12 of the 30) should lose nothing whenever the leak
    probability falls with the gap. That holds for a symmetric unimodal kernel but is not guaranteed for the
    mixture over the supports, so it is tested, not assumed. (11aq's chosen spacings, known before this was written:
    384 of 384 draws at 13.0, 13.33, 17.14 or 24.0 m, of which 382 are widest-for-their-k.)

Per layout, offset draw (s = 1, 2; 4 draws; 11aq's seeds and supports) and spacing h in the 30-point grid:
  * loop tables: px4_height_run.tables_mix unchanged (the reference); kernel tables: `tables_kernel` below.
    CPU of each, max |difference| over every entry.
  * 11aq's aware labels rescored under kernel tables at 11aq's h, against its recorded F (built from loop tables).
  * a 20-start search (R20: 20 uniform random labellings, each descended, the best kept; one seed per draw and h,
    90000 + 1000 * draw + 100 * scale index + idx, the same starts on both tables) on loop tables and on kernel
    tables; the kernel plan is scored under the loop tables (the truth here).
  * spacing (o) = the h with the lowest F over the 30 spacings (or over the k-widest 12), as in 11at.
Ratios are to 11aq's aware F (arrangement_plans.json.gz) for the same layout and draw.

Predictions (written and pushed before this script was run on more than the smoke below; 11ao to 11at results
known):
 T1 every kernel-table entry is within 1e-6 (absolute) of the loop table's, over all 48 layouts, 8 draws, 30
    spacings.
 T2 11aq's aware labels rescored under kernel tables match its recorded F to 1e-6 (relative) on every one of 384
    draws.
 T3 at spacing (o) over 30 spacings, R20 on kernel tables returns the same labels as R20 on loop tables in at least
    380 of 384 draws, and its truth F is at most 1.0001 of the loop R20 plan's on every draw.
 T4 the median per-layout CPU of building all 240 tables falls at least 20-fold (loop / kernel).
 T5 with kernel tables, building them is under half of the CPU of R20 over the same 30 spacings and 8 draws (the
    search, not the tables, becomes the cost).
 T6 the k-widest 12 spacings give the same best R20 F as all 30 (loop tables, relative 1e-12) in at least 380 of
    384 draws, and the median ratio is 1.0000 in all four (M, s) cells.
 T7 the cheap planner (kernel tables, k-widest 12 spacings, R20) has a median truth ratio to 11aq's aware F at or
    below 1.005 in all four cells, at a median per-layout CPU at most 5% of the loop tables' build alone.
Reported without a prediction: p90 and max of every ratio; per-cell counts; per-layout CPU of each part.

Smoke looked at before writing the predictions: one layout (M = 16, idx 1600, s = 1, one draw) built 30 loop tables
in 31.7 CPU s; the 64 sds span 0.38 to 1.95 m; supports have 120 bins and |delta| <= 9.9 m; k runs 1 to 12, the
largest gap 2 k h is 160 m. No kernel table, plan or ratio was computed before the predictions were pushed.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build     # 11ai's inputs (0.2 s)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl FAST_CACHE=tcache python3 fast_tables.py > fast_tables_results.txt
    # writes fast_tables.json.gz; FAST_CACHE (optional) keeps per-layout results so a stopped run resumes

Limits: as 11ao to 11at (5 flights chosen by their uploaders, one offset per operator, offsets known to the
planners); the kernel is exact only up to interpolation on its grid, and the k-widest rule rests on the leak
falling with the gap, measured here for these supports only; R20 is a 20-start search (11at: within 0.1 to 0.4% of
200 starts at the median). Preliminary.
"""
import gzip
import json
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
import speed_offset as so  # noqa: E402

Z = ds.Z
HG = dr.HG
H = dr.ll.H_DEPTH
SCALES = (1.0, 2.0)
DRAWS = so.DRAWS
R_START = 20
GRID_STEP = 1e-3


class Kernel:
    """Kbar(y) = mean_s [Phi((Z - y)/s) - Phi((-Z - y)/s)] on a grid of |y| (even in y), zero beyond the grid."""

    def __init__(self, scales, Z=Z, step=GRID_STEP, tail=10.0):
        sc = np.asarray(scales, dtype=float)
        self.ymax = Z + tail * float(sc.max())
        self.y = np.arange(0.0, self.ymax + step, step)
        r2 = math.sqrt(2.0)
        acc = np.zeros_like(self.y)
        for s in sc:
            c = lambda x: 0.5 * (1.0 + ds.erf(x / (s * r2)))
            acc += c(Z - self.y) - c(-Z - self.y)
        self.k = acc / len(sc)

    def __call__(self, y):
        return np.interp(np.abs(y), self.y, self.k, right=0.0)

    def p_overlap(self, gaps, deltas):
        """1/2 mean over delta of Kbar(g + delta) + Kbar(g - delta); gaps (..., G), deltas (..., B) -> (..., G)."""
        g = np.asarray(gaps, dtype=float)[..., :, None]
        d = np.asarray(deltas, dtype=float)[..., None, :]
        return 0.5 * (self(g + d) + self(g - d)).mean(axis=-1)


def tables_kernel(kern, sup, m, h, k):
    """The same (pw, px) as px4_height_run.tables_mix(sup, m, h, scales, k), from the shared kernel."""
    keys = list(sup)
    n = np.arange(0, 2 * k + 1) * h
    pw = np.zeros((m, m, k))
    px = np.zeros((m, m, k))
    lens = {len(sup[q]) for q in keys}
    groups = [[q for q in keys if len(sup[q]) == L] for L in sorted(lens)]
    dd = np.arange(k)
    for grp in groups:
        D = np.stack([sup[q] for q in grp])
        p = kern.p_overlap(np.broadcast_to(n, (len(grp), len(n))), D)          # (pairs, 2k + 1)
        a = p[:, 2 * dd]
        b = 0.5 * (p[:, 2 * dd + 1] + p[:, np.abs(2 * dd - 1)])
        I = np.array([q[0] for q in grp])
        J = np.array([q[1] for q in grp])
        pw[I, J] = a
        pw[J, I] = a
        px[I, J] = b
        px[J, I] = b
    return pw, px


def k_widest(hs=HG, m=16):
    """For each band count k on the grid, the widest spacing with that k."""
    best = {}
    for h in hs:
        k = dr.bb.k_cap(H, h, m)
        best[k] = max(best.get(k, h), h)
    return tuple(sorted(best.values()))


def r_search(P, m, k, rng, R=R_START):
    starts = [tuple(int(x) for x in rng.integers(0, k, m)) for _ in range(R)]
    best, arg = np.inf, None
    for s0 in starts:
        lab = P.descend(s0)
        f = P.score(lab)
        if f < best - 1e-12 * abs(best if np.isfinite(best) else 1.0):
            best, arg = f, lab
    return arg, best


def analyse(args):
    L, aware = args
    phr, scales, c10, _ = so._state()
    kern = Kernel(scales)
    t0 = time.process_time()
    cpu = {"loop": 0.0, "kern": 0.0, "srch_loop": 0.0, "srch_kern": 0.0}
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    isd = ds.load_isd()
    rng = np.random.default_rng(100000 * 0 + idx)        # 11al's to 11at's seed for "deliv"
    sup, _ = dr.pair_supports(idx, m, "deliv", rng, isd)
    kw_set = set(k_widest(HG, m))
    res = {"m": m, "idx": idx, "cells": {}, "maxdiff": 0.0}
    for si, s in enumerate(SCALES):
        rows = []
        for dd in range(DRAWS):
            b = so.draw_offsets(c10, m, s, 7000 * dd + idx)
            rec = aware["cells"][str(s)][dd]
            assert np.allclose(rec["b"], b), "offset draw differs from 11aq's"
            sup_b = so.with_offsets(sup, b)
            per_h = {}
            resc = None
            for h in HG:
                k = dr.bb.k_cap(H, h, m)
                t1 = time.process_time()
                Tl = phr.tables_mix(sup_b, m, h, scales, k)
                t2 = time.process_time()
                Tk = tables_kernel(kern, sup_b, m, h, k)
                t3 = time.process_time()
                cpu["loop"] += t2 - t1
                cpu["kern"] += t3 - t2
                res["maxdiff"] = max(res["maxdiff"], float(np.abs(Tl[0] - Tk[0]).max()),
                                     float(np.abs(Tl[1] - Tk[1]).max()))
                Pl = ds.PairProblem(W, X, V, *Tl)
                Pk = ds.PairProblem(W, X, V, *Tk)
                seed = 90000 + 1000 * dd + 100 * si + idx
                t4 = time.process_time()
                ll_, Fl = r_search(Pl, m, k, np.random.default_rng(seed))
                t5 = time.process_time()
                lk, Fk = r_search(Pk, m, k, np.random.default_rng(seed))
                t6 = time.process_time()
                cpu["srch_loop"] += t5 - t4
                cpu["srch_kern"] += t6 - t5
                per_h[h] = {"Fl": Fl, "lab_l": ll_, "Fk": Fk, "lab_k": lk, "Fk_true": Pl.score(lk)}
                if abs(h - rec["h"]) < 1e-9:
                    resc = Pk.score(rec["labels"])
            hl = min(per_h, key=lambda q: (per_h[q]["Fl"], q))
            hk = min(per_h, key=lambda q: (per_h[q]["Fk"], q))
            hlw = min((q for q in per_h if q in kw_set), key=lambda q: (per_h[q]["Fl"], q))
            hkw = min((q for q in per_h if q in kw_set), key=lambda q: (per_h[q]["Fk"], q))
            rows.append({
                "F_aware": rec["F"], "h_aware": rec["h"], "F_aware_kern": resc,
                "h_l": hl, "F_l": per_h[hl]["Fl"],
                "h_k": hk, "F_k_true": per_h[hk]["Fk_true"],
                "same_labels": bool(hl == hk and tuple(per_h[hl]["lab_l"]) == tuple(per_h[hk]["lab_k"])),
                "h_lw": hlw, "F_lw": per_h[hlw]["Fl"],
                "h_kw": hkw, "F_kw_true": per_h[hkw]["Fk_true"],
            })
        res["cells"][str(s)] = rows
    res["cpu"] = time.process_time() - t0
    res.update({"cpu_" + q: v for q, v in cpu.items()})
    print("M=%d layout %d analysed, %.0f CPU s (loop tables %.1f s, kernel tables %.2f s, R20 %.1f s), max diff %.1e"
          % (m, idx, res["cpu"], cpu["loop"], cpu["kern"], cpu["srch_kern"], res["maxdiff"]),
          file=sys.stderr, flush=True)
    return res


def med(x):
    x = [v for v in x if v is not None and np.isfinite(v)]
    return S.median(x) if x else float("nan")


def summarise(res, P=print):
    out = {}
    md = max(r["maxdiff"] for r in res)
    P("# T1 max |kernel - loop| over every table entry: %.2e -> %s" % (md, "held" if md <= 1e-6 else "refuted"))
    rel = [abs(x["F_aware_kern"] / x["F_aware"] - 1) for r in res for s in r["cells"] for x in r["cells"][s]]
    P("# T2 11aq's aware labels under kernel tables: max relative difference from its F %.2e over %d draws -> %s"
      % (max(rel), len(rel), "held" if max(rel) <= 1e-6 else "refuted"))
    allx = [x for r in res for s in r["cells"] for x in r["cells"][s]]
    same = sum(x["same_labels"] for x in allx)
    worst = max(x["F_k_true"] / x["F_l"] for x in allx)
    P("# T3 R20 on kernel tables returns the loop plan's labels at spacing (o) in %d of %d draws; worst truth ratio "
      "%.6f -> %s" % (same, len(allx), worst, "held" if same >= 380 and worst <= 1.0001 else "refuted"))
    ratio_tab = [r["cpu_loop"] / r["cpu_kern"] for r in res]
    P("# T4 table build CPU per layout: loop median %.1f s, kernel median %.2f s; median ratio %.1f -> %s"
      % (med(r["cpu_loop"] for r in res), med(r["cpu_kern"] for r in res), med(ratio_tab),
         "held" if med(ratio_tab) >= 20 else "refuted"))
    share = [r["cpu_kern"] / r["cpu_srch_kern"] for r in res]
    P("# T5 kernel tables / R20 search CPU (30 spacings, 8 draws): median %.3f, max %.3f -> %s"
      % (med(share), max(share), "held" if med(share) < 0.5 else "refuted"))
    eq = sum(1 for x in allx if x["F_lw"] <= x["F_l"] * (1 + 1e-12))
    P("# T6 k-widest spacings give the 30-spacing best R20 F (loop tables) in %d of %d draws" % (eq, len(allx)))
    t6 = eq >= 380
    t7 = True
    for m in (12, 16):
        R_ = [r for r in res if r["m"] == m]
        if not R_:
            continue
        nkw = len(k_widest(HG, m))
        for s in SCALES:
            rows = [x for r in R_ for x in r["cells"][str(s)]]
            P()
            P("## M = %d, s = %g (%d layouts x %d draws): ratio to 11aq's aware F, median / p90 / max"
              % (m, s, len(R_), DRAWS))
            for name, key in (("R20 loop tables, 30 spacings", "F_l"), ("R20 kernel tables, 30 spacings", "F_k_true"),
                              ("R20 loop tables, k-widest", "F_lw"), ("R20 kernel tables, k-widest (cheap)", "F_kw_true")):
                rat = [x[key] / x["F_aware"] for x in rows]
                out[(m, s, key)] = med(rat)
                P("  %-38s %.4f  %.4f  %.4f" % (name, med(rat), np.percentile(rat, 90), max(rat)))
            kw_rat = [x["F_lw"] / x["F_l"] for x in rows]
            P("  k-widest / 30 spacings (loop R20): median %.6f, max %.6f, equal in %d of %d"
              % (med(kw_rat), max(kw_rat), sum(1 for v in kw_rat if v <= 1 + 1e-12), len(rows)))
            if med(kw_rat) > 1.00005:
                t6 = False
            if out[(m, s, "F_kw_true")] > 1.005:
                t7 = False
            cheap = [r["cpu_kern"] * nkw / len(HG) + r["cpu_srch_kern"] * nkw / len(HG) for r in R_]
            out[(m, "cheap_cpu")] = med(cheap)
        R_ = [r for r in res if r["m"] == m]
        nkw = len(k_widest(HG, m))
        cheap = [(r["cpu_kern"] + r["cpu_srch_kern"]) * nkw / len(HG) for r in R_]
        fr = [c / r["cpu_loop"] for c, r in zip(cheap, R_)]
        P("  M = %d CPU per layout (8 draws): loop tables %.1f s; cheap planner about %.2f s (kernel tables + R20 at "
          "the %d k-widest spacings, prorated from the 30); share of loop tables median %.4f"
          % (m, med(r["cpu_loop"] for r in R_), med(cheap), nkw, med(fr)))
        if med(fr) > 0.05:
            t7 = False
    P()
    P("# T6 -> %s" % ("held" if t6 else "refuted"))
    P("# T7 cheap planner median ratio <= 1.005 in all cells and CPU <= 5%% of the loop tables -> %s"
      % ("held" if t7 else "refuted"))
    return out


def main(done):
    with gzip.open(os.path.join(HERE, "arrangement_plans.json.gz"), "rt") as f:
        aware = {(r["m"], r["idx"]): r for r in json.load(f)}
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    if "--quick" in sys.argv:
        keys = keys[:1]
    cache = os.environ.get("FAST_CACHE")
    if cache:
        os.makedirs(cache, exist_ok=True)

    def path(k):
        return os.path.join(cache, "%d_%d.json" % k) if cache else None
    have = {k: json.load(open(path(k))) for k in keys if cache and os.path.exists(path(k))}
    todo = [k for k in keys if k not in have]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        for k, r in zip(todo, pool_.imap(analyse, [(done[k], aware[k]) for k in todo])):
            have[k] = r
            if cache:
                with open(path(k), "w") as f:
                    json.dump(r, f)
    res = [have[k] for k in keys]
    if "--quick" not in sys.argv:
        with gzip.open(os.path.join(HERE, "fast_tables.json.gz"), "wt") as f:
            json.dump(res, f, separators=(",", ":"))
    _, scales, c10, _ = so._state()
    print("# Milestone 11au: kernel tables and k-widest spacings (fast_tables.py's docstring). deliv ages, Z = %.2f m, "
          "%d pair-noise sds (%.2f to %.2f m), kernel grid %.0e m, 5-flight offsets, %d draws, s = %s, %d spacings, "
          "k-widest %s (M = 12) and %s (M = 16)"
          % (Z, len(scales), min(scales), max(scales), GRID_STEP, DRAWS, ", ".join("%g" % s for s in SCALES),
             len(HG), len(k_widest(HG, 12)), len(k_widest(HG, 16))))
    summarise(res)


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(os.path.join(HERE, "fast_tables.json.gz"), "rt") as f:
            summarise(json.load(f))
        sys.exit(0)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    missing = [(m, i) for m in (12, 16) for i in dr.SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
