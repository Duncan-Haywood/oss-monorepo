"""Milestone 11av: rerun 11ao's and 11aq's band choices on a spacing grid that has every band count.

Why: 11au's post hoc found that `ref_mix.hgrid` rounds H / (2k - 1) to 6 decimals, and for k = 6 (10.909091 m) and
k = 11 (5.714286 m) the rounding lands just above H / (2k - 1), so `band_budget.k_cap` gives k - 1: no spacing on the
30-point grid has 6 or 11 bands. Every milestone since 11ah that picks a spacing on that grid therefore never offered
the planner 6 bands. 11au's R200 check at the exact H / 11 beat 11aq's offset-aware plan in 18, 16, 30 and 26 of 96
draws (M = 12 s = 1, M = 12 s = 2, M = 16 s = 1, M = 16 s = 2), but that was a bare 200-start search against a
warm-started one. With 11au's kernel tables a whole re-plan costs seconds per layout, so this milestone reruns the
planner itself on a corrected grid and corrects the band-count tallies and the blind-vs-aware ratios.

Grids. OLD = the 30-point grid every milestone since 11ah used (drift_share_run.HG). NEW = OLD plus the exact H / (2k - 1)
for every k in 1..12 that no OLD spacing reaches (k_cap counts): k = 6 and 11. NEW contains OLD, so with the same
seeds and starts at each spacing, NEW's best F is never above OLD's.

Planners (11ao's, unchanged except where stated), all on 11au's kernel tables (`fast_tables.tables_kernel`, within
4e-8 of the loop tables, 11au T1), deliv ages, 11al's pressure supports and seeds:
  * base: no offsets; at each spacing PairProblem.search(200 restarts, seed idx + 13), as speed_offset.plan.
  * blind: base's best plan (on OLD or on NEW), scored under the truth.
  * aware: the truth's tables (supports plus b_i - b_j, 11ao's 5-flight offsets, s = 1 and 2, 4 draws, seed
    7000 * draw + idx), search(200, seed idx + 13) warm-started from base's labels at the same spacing. 11ao also
    warm-started from the `dist` planner's labels; that planner is not rerun here (disclosed difference), so on OLD
    this aware search can land above 11aq's recorded F, and E1 measures by how much.
Ratios to 11aq's aware F (arrangement_plans.json.gz) and NEW / OLD for the same planner, layout and draw.

Predictions (written and pushed before this script was run on any layout; 11ao to 11au results known, including the
11au post hoc counts above and that 11ao's base picked 13.33 m (5 bands) at the median of both M):
 E1 on OLD, aware F is a median at most 1.0005 of 11aq's recorded F in every (M, s) cell, and its band count equals
    11aq's in at least 88 of 96 draws per cell.
 E2 on NEW, aware picks 6 bands in 12 to 36 of 96 draws in every (M, s) cell (11 bands in none).
 E3 the median aware band count is unchanged by the correction in all four cells (5 at s = 1; 3 at s = 2), and so
    is the median spacing.
 E4 aware F on NEW is below OLD's (relative 1e-9) in at least 12 of 96 draws per cell; over all 384 draws the
    largest saving is at least 5%; the median NEW / OLD is 1.0000 in every cell.
 E5 base on NEW picks 6 bands in at least 12 of 48 layouts (with no offsets the per-pair error is narrower, so
    the thinner 6-band spacing should pay more often than under offsets).
 E6 the blind / aware median ratio at s = 1 (OLD: 11ao's 1.0342 at M = 12 and 1.0183 at M = 16) moves by at most
    0.01 on NEW in both M; at s = 2 (1.1631 and 1.1296) by at most 0.03.
Reported without a prediction: full band-count tallies OLD vs NEW per cell, p10/p90 of NEW / OLD, base's tallies,
and the CPU per layout.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build     # 11ai's inputs (0.2 s)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl GRID_CACHE=gcache python3 exact_grid.py > exact_grid_results.txt
    # writes exact_grid.json.gz; GRID_CACHE (optional) keeps per-layout results so a stopped run resumes

Limits: as 11ao to 11au; no dist warm start; the k = 6 and 11 spacings are the widest for their k (the k-widest rule
of 11au, which held in 379 of 384 draws), not a sweep inside each k. Preliminary.
"""
import gzip
import json
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
import fast_tables as ft  # noqa: E402
import speed_offset as so  # noqa: E402

Z = ds.Z
H = dr.ll.H_DEPTH
OLD = tuple(dr.HG)
SCALES = (1.0, 2.0)
DRAWS = so.DRAWS
KMAX = 12


def kcap(h, m=16):
    return dr.bb.k_cap(H, h, m)


def exact_grid(old=OLD, kmax=KMAX):
    """old plus the exact H / (2k - 1) for each k in 1..kmax that no old spacing reaches."""
    have = {kcap(h, kmax) for h in old}
    add = [H / (2 * k - 1) for k in range(2, kmax + 1) if k not in have]
    if 1 not in have:
        add.append(H)
    return tuple(sorted(set(old) | set(add)))


NEW = exact_grid()


def plan(kern, W, X, V, sup, m, seed, starts=None):
    """{h: (labels, F)} on kernel tables at every NEW spacing, 200 descents each, as speed_offset.plan."""
    out = {}
    for h in NEW:
        k = kcap(h, m)
        P = ds.PairProblem(W, X, V, *ft.tables_kernel(kern, sup, m, h, k))
        st = [starts[h]] if starts and starts.get(h) is not None else []
        lab, F = P.search(restarts=dr.RESTARTS, seed=seed, starts=st)
        out[h] = (tuple(int(x) for x in lab), float(F), P)
    return out


def best(p, grid):
    h = min(grid, key=lambda q: (p[q][1], q))
    return h, p[h][0], p[h][1]


def analyse(args):
    L, aware = args
    _, scales, c10, _ = so._state()
    kern = ft.Kernel(scales)
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    isd = ds.load_isd()
    sup, _ = dr.pair_supports(idx, m, "deliv", np.random.default_rng(idx), isd)
    seed = idx + 13
    base = plan(kern, W, X, V, sup, m, seed)
    blind_labs = {h: base[h][0] for h in NEW}
    res = {"m": m, "idx": idx, "cells": {}}
    for g, grid in (("old", OLD), ("new", NEW)):
        hb, lb, Fb = best(base, grid)
        res["base_" + g] = {"h": hb, "k": len(set(lb)), "F": Fb, "labels": list(lb)}
    for s in SCALES:
        rows = []
        for dd in range(DRAWS):
            b = so.draw_offsets(c10, m, s, 7000 * dd + idx)
            rec = aware["cells"][str(s)][dd]
            assert np.allclose(rec["b"], b), "offset draw differs from 11aq's"
            truth = plan(kern, W, X, V, so.with_offsets(sup, b), m, seed, starts=blind_labs)
            row = {"F_11aq": rec["F"], "h_11aq": rec["h"], "k_11aq": len(set(rec["labels"]))}
            for g, grid in (("old", OLD), ("new", NEW)):
                ha, la, Fa = best(truth, grid)
                hb = res["base_" + g]["h"]
                Fbl = truth[hb][2].score(res["base_" + g]["labels"])
                row[g] = {"h": ha, "k": len(set(la)), "F": Fa, "blind": float(Fbl) / Fa}
            rows.append(row)
        res["cells"][str(s)] = rows
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.1f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return res


def med(x):
    x = list(x)
    return S.median(x) if x else float("nan")


def tally(ks):
    c = {}
    for k in ks:
        c[k] = c.get(k, 0) + 1
    return ", ".join("%d: %d" % (k, c[k]) for k in sorted(c))


def summarise(res, P=print):
    ok = {q: True for q in ("E1", "E2", "E3", "E4", "E5", "E6")}
    blind_old = {(12, 1.0): 1.0342, (16, 1.0): 1.0183, (12, 2.0): 1.1631, (16, 2.0): 1.1296}
    savings = []
    for m in (12, 16):
        R_ = [r for r in res if r["m"] == m]
        P()
        P("## M = %d (%d layouts)" % (m, len(R_)))
        for g in ("old", "new"):
            P("  base (no offsets) on %s: bands %s; median h %.2f" % (
                g.upper(), tally(r["base_" + g]["k"] for r in R_), med(r["base_" + g]["h"] for r in R_)))
        n6 = sum(1 for r in R_ if r["base_new"]["k"] == 6)
        P("  base picks 6 bands on NEW in %d of %d layouts" % (n6, len(R_)))
        for s in SCALES:
            rows = [x for r in R_ for x in r["cells"][str(s)]]
            n = len(rows)
            P("  s = %g (%d draws)" % (s, n))
            r_old = [x["old"]["F"] / x["F_11aq"] for x in rows]
            same_k = sum(1 for x in rows if x["old"]["k"] == x["k_11aq"])
            P("    E1 OLD aware / 11aq F: median %.5f, p90 %.5f, max %.5f; same band count in %d of %d"
              % (med(r_old), np.percentile(r_old, 90), max(r_old), same_k, n))
            if med(r_old) > 1.0005 or same_k < 88:
                ok["E1"] = False
            P("    aware bands 11aq: %s" % tally(x["k_11aq"] for x in rows))
            P("    aware bands OLD:  %s" % tally(x["old"]["k"] for x in rows))
            P("    aware bands NEW:  %s" % tally(x["new"]["k"] for x in rows))
            k6 = sum(1 for x in rows if x["new"]["k"] == 6)
            k11 = sum(1 for x in rows if x["new"]["k"] == 11)
            if not (12 <= k6 <= 36 and k11 == 0):
                ok["E2"] = False
            mk_o, mk_n = med(x["old"]["k"] for x in rows), med(x["new"]["k"] for x in rows)
            mh_o, mh_n = med(x["old"]["h"] for x in rows), med(x["new"]["h"] for x in rows)
            P("    E2 6 bands on NEW in %d, 11 bands in %d; E3 median bands %g -> %g, median h %.2f -> %.2f"
              % (k6, k11, mk_o, mk_n, mh_o, mh_n))
            if mk_o != mk_n or abs(mh_o - mh_n) > 1e-9:
                ok["E3"] = False
            nr = [x["new"]["F"] / x["old"]["F"] for x in rows]
            savings += nr
            nbelow = sum(1 for v in nr if v < 1 - 1e-9)
            P("    E4 aware NEW / OLD F: median %.5f, p10 %.5f, min %.5f; below 1 in %d of %d"
              % (med(nr), np.percentile(nr, 10), min(nr), nbelow, n))
            if nbelow < 12 or abs(med(nr) - 1) > 5e-5:
                ok["E4"] = False
            bo, bn = med(x["old"]["blind"] for x in rows), med(x["new"]["blind"] for x in rows)
            P("    E6 blind / aware (both under the truth): OLD median %.4f (11ao: %.4f), NEW median %.4f; p90 NEW %.4f"
              % (bo, blind_old[(m, s)], bn, np.percentile([x["new"]["blind"] for x in rows], 90)))
            if abs(bn - bo) > (0.01 if s == 1.0 else 0.03):
                ok["E6"] = False
        P("  CPU per layout: median %.1f s" % med(r["cpu"] for r in R_))
    n6 = sum(1 for r in res if r["base_new"]["k"] == 6)
    P()
    P("# E5 base picks 6 bands on NEW in %d of %d layouts (both M)" % (n6, len(res)))
    if n6 < 12:
        ok["E5"] = False
    big = 1 - min(savings)
    if big < 0.05:
        ok["E4"] = False
    P()
    P("# largest aware saving NEW vs OLD over all draws: %.2f%%" % (100 * big))
    for q in sorted(ok):
        P("# %s -> %s" % (q, "held" if ok[q] else "refuted"))


def main(done):
    with gzip.open(os.path.join(HERE, "arrangement_plans.json.gz"), "rt") as f:
        aware = {(r["m"], r["idx"]): r for r in json.load(f)}
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    if "--quick" in sys.argv:
        keys = keys[:1]
    cache = os.environ.get("GRID_CACHE")
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
        with gzip.open(os.path.join(HERE, "exact_grid.json.gz"), "wt") as f:
            json.dump(res, f, separators=(",", ":"))
    print("# Milestone 11av: 11ao/11aq band choices on a grid with every band count (exact_grid.py's docstring). "
          "deliv ages, Z = %.2f m, H = %g m, kernel tables, 200 descents, OLD %d spacings, NEW %d (added %s m), "
          "5-flight offsets, %d draws, s = %s"
          % (Z, H, len(OLD), len(NEW), ", ".join("%.6f" % h for h in NEW if h not in OLD), DRAWS,
             ", ".join("%g" % s for s in SCALES)))
    summarise(res)


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(os.path.join(HERE, "exact_grid.json.gz"), "rt") as f:
            summarise(json.load(f))
        sys.exit(0)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    main(done)
