"""Milestone 11aw: the cheap planning rules of 11ar (band sort), 11as (greedy insertion) and 11at (few random starts),
and 11ar's closed-form spacing, rerun against the offset-aware plan on the spacing grid that has every band count.

Why: 11av's "Next". 11au found the 30-point grid used since 11ah offers no 6- or 11-band spacing, and 11av reran the
blind and aware planners on the corrected grid (NEW = the 30 spacings plus the exact H / 11 and H / 21): the aware
planner takes 6 bands in 14 to 31 of 96 draws and the blind plan's excess grows (s = 1: 1.0342 -> 1.0438 at M = 12,
1.0183 -> 1.0651 at M = 16). The paper's Sections 6.8 to 6.10 still compare the cheap rules against the old-grid
aware plan, with the rules themselves restricted to the old grid; its limitation bullet says so. This closes that.

Everything on 11au's kernel tables (`fast_tables.tables_kernel`), deliv ages, 11al's supports and seeds, 11ao's
5-flight offsets, s = 1 and 2, 4 draws per layout, 48 layouts, the NEW grid (32 spacings):
  * base, blind, aware: exactly 11av's planners (`exact_grid.plan`, same seeds); checked against exact_grid.json.gz.
  * sort (11ar): at each spacing, base's labels with occupied bands re-ordered by their operators' mean offset (better
    of ascending, descending); sort+descent: one PairProblem.descend from it.
  * greedy-off (11as): insertion in ascending and descending offset order into the cheapest band given those placed,
    the better kept; greedy-off+descent: one descent from it; greedy-deg: insertion by conflict weight, largest first.
  * random-R (11at): best of R uniform random labellings, each descended, nested R = 1, 2, 5, 10, 20, 50; new seed
    90000 + 1000 * draw + 100 * scale index + idx (not the aware search's).
  Spacing (o) for each rule = the NEW spacing with its lowest F under the truth.
  * closed form (c) (11ar): the most bands k whose widest NEW spacing (H / (2k - 1) to 6 decimals) satisfies h - Z >= 3 sigma_adj, with
    sigma_adj over the cross-operator pairs one level apart in the sort labels at that spacing (conflict weights,
    sigma_pair = 1.061 m). On the old grid k = 6 had no spacing of its own (H / 11 rounded fits 5 bands), so (c) never
    considered 6 bands; here it can.
  Ratios are to 11av's NEW-grid aware F (recomputed here), and, for comparison, the old-grid values of 11ar to 11at.

Checks (or the comparison is void): base's best labels on NEW equal 11av's in 48 of 48 layouts; the aware NEW F and
the blind / aware ratio equal 11av's to 1e-9 (relative) in 384 of 384 draws.

Not rerun, and why: 11ap's fleet 3-sigma rule (`rule_check.py`) already uses the exact spacing H / (2k - 1) for each
k, so its band counts never depended on the grid; only the search counts it is compared with did, and 11av found
the search's median band count unchanged at s = 1 and 2 (s = 0.25 and 0.5 were not rerun by 11av).

Predictions (written and pushed before this script was run on any layout; 11ao to 11av results were known, old grid:
sort(o) 1.0995, 1.1279 at s = 1 and 1.1623, 1.1725 at s = 2 (M = 12, 16); sort+descent(o) 1.0628, 1.0716 and
1.0520, 1.0605; greedy-off(o) 1.1229, 1.1402 and 1.0985, 1.1054; greedy-off+descent(o) at s = 2 1.0408, 1.0528, beating
blind in 75 and 68 of 96; random-1 1.0396, 1.0493 at s = 1; random-10 1.0047, 1.0091 at s = 1, 1.0007, 1.0006 at
s = 2; random-20 1.0004, 1.0035 at s = 1; closed form median 4 bands at s = 1, 2 at s = 2; NEW grid (11av) blind
1.0438, 1.0651 at s = 1 and 1.2048, 1.2184 at s = 2):
 W1 at s = 1 every one-pass rule is still worse than the blind plan: sort(o) and greedy-off(o) have higher median
    ratios than blind's NEW median, at both M.
 W2 at s = 2 greedy-off+descent(o) has the lowest median ratio of the cheap rules (blind, sort(o), sort+descent(o),
    greedy-off(o), greedy-deg(o)) at both M, and beats the blind plan in at least 68 of 96 draws at both M.
 W3 the old-grid medians of sort(o), sort+descent(o), greedy-off(o) and greedy-off+descent(o) move by at most 0.02 on
    NEW in all four (M, s) cells (each rule gains the 6-band spacing as the aware plan does, and the aware median
    NEW / OLD is 1.0000).
 W4 random-10 (o) is within 1% of the aware plan (median ratio <= 1.010) and random-20 (o) within 0.5% (<= 1.005) in
    all four cells.
 W5 the closed form (c) picks 6 bands in at most 2 of 96 draws per cell (6 bands at 10.91 m need sigma_adj <=
    1.096 m, barely above sigma_pair), and its median band count is unchanged: 4 at s = 1, 2 at s = 2, both M.
Reported without a prediction: greedy-off+descent at s = 1, greedy-deg, p90 and max of each ratio, per-draw wins
against blind, the band counts each rule picks (how often 6), and the CPU per layout.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build     # 11ai's inputs (0.2 s)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl RULES_CACHE=rcache python3 exact_rules.py > exact_rules_results.txt
    # writes exact_rules.json.gz; RULES_CACHE (optional) keeps per-layout results so a stopped run resumes

Limits: as 11ao to 11av (5 flights chosen by their uploaders, one offset per operator for the whole cruise, offsets
known exactly to every rule); 11at's greedy-start curves are not rerun (random starts did as well or better there);
spacing (o) uses F itself, so only (c) is a rule a practitioner can apply without the scorer. Preliminary.
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
import arrangement as ar  # noqa: E402
import drift_share as ds  # noqa: E402
import drift_share_run as dr  # noqa: E402
import exact_grid as eg  # noqa: E402
import fast_tables as ft  # noqa: E402
import few_start as fs  # noqa: E402
import greedy_rule as gr  # noqa: E402
import sort_rule as sr  # noqa: E402
import speed_offset as so  # noqa: E402

Z = ds.Z
H = eg.H
NEW = eg.NEW
SCALES = (1.0, 2.0)
DRAWS = so.DRAWS
RS = (1, 2, 5, 10, 20, 50)
RULES = ("blind", "sort", "sdesc", "goff", "gdesc", "gdeg") + tuple("rand_%d" % R for R in RS)
OLD_GRID = {  # old-grid medians (11ar to 11at), ratios to 11aq's aware F; (M, s) -> rule -> value
    (12, 1.0): {"sort": 1.0995, "sdesc": 1.0628, "goff": 1.1229, "rand_1": 1.0396, "rand_10": 1.0047,
                "rand_20": 1.0004, "blind": 1.0342},
    (16, 1.0): {"sort": 1.1279, "sdesc": 1.0716, "goff": 1.1402, "rand_1": 1.0493, "rand_10": 1.0091,
                "rand_20": 1.0035, "blind": 1.0183},
    (12, 2.0): {"sort": 1.1623, "sdesc": 1.0520, "goff": 1.0985, "gdesc": 1.0408, "rand_10": 1.0007, "blind": 1.1631},
    (16, 2.0): {"sort": 1.1725, "sdesc": 1.0605, "goff": 1.1054, "gdesc": 1.0528, "rand_10": 1.0006, "blind": 1.1296},
}


def h_exact(k, m=16):
    """The widest NEW spacing with k bands (H / (2k - 1) up to the grid's 6-decimal rounding for k = 2..8, 10..12)."""
    return max(h for h in NEW if eg.kcap(h, m) == k)


def closed_form(sig_by_k, m, z=Z):
    """11ar's rule on the NEW grid: the most bands k whose widest spacing h_k satisfies h_k - z >= 3 sigma_adj(k);
    the fewest bands if none does."""
    ok = [k for k, sg in sig_by_k.items() if h_exact(k, m) - z >= 3.0 * sg]
    return max(ok) if ok else min(sig_by_k)


def rules_at(P, base_lab, b, deg, k, m, rng):
    """Every rule's F (and labels where needed) at one spacing, under the truth tables of P."""
    G = P._pair_table()
    c1, c2 = sr.sort_bands(base_lab, b), sr.sort_bands(base_lab, b, descending=True)
    f1, f2 = P.score(c1), P.score(c2)
    ls = c1 if f1 <= f2 else c2
    ga = gr.greedy(G, gr.offset_order(b, deg))
    gd = gr.greedy(G, gr.offset_order(b, deg, descending=True))
    fa, fd = P.score(ga), P.score(gd)
    lg = ga if fa <= fd else gd
    out = {"blind": P.score(base_lab), "sort": min(f1, f2), "sdesc": P.score(P.descend(ls)),
           "goff": min(fa, fd), "gdesc": P.score(P.descend(lg)), "gdeg": P.score(gr.greedy(G, gr.degree_order(deg))),
           "k_sort": len(set(ls)), "k_goff": len(set(lg))}
    Fr = [P.score(P.descend(tuple(int(x) for x in rng.integers(0, k, m)))) for _ in range(max(RS))]
    for R, v in fs.best_of_prefix(Fr, RS).items():
        out["rand_%d" % R] = v
    return out, ls


def analyse(args):
    L, prev = args
    _, scales, c10, _ = so._state()
    kern = ft.Kernel(scales)
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    w = ar.pair_weights(np.asarray(W), np.asarray(X))
    deg = w.sum(axis=1)
    isd = ds.load_isd()
    sup, _ = dr.pair_supports(idx, m, "deliv", np.random.default_rng(idx), isd)
    seed = idx + 13
    base = eg.plan(kern, W, X, V, sup, m, seed)
    base_labs = {h: base[h][0] for h in NEW}
    hb, lb, _ = eg.best(base, NEW)
    res = {"m": m, "idx": idx, "base_ok": list(lb) == prev["base_new"]["labels"], "h_blind": hb, "cells": {}}
    kset = sorted({eg.kcap(h, m) for h in NEW})
    for si, s in enumerate(SCALES):
        rows = []
        for dd in range(DRAWS):
            b = so.draw_offsets(c10, m, s, 7000 * dd + idx)
            truth = eg.plan(kern, W, X, V, so.with_offsets(sup, b), m, seed, starts=base_labs)
            ha, la, Fa = eg.best(truth, NEW)
            pv = prev["cells"][str(s)][dd]["new"]
            rng = np.random.default_rng(90000 + 1000 * dd + 100 * si + idx)
            per_h, sig_by_k = {}, {}
            for h in NEW:
                k = eg.kcap(h, m)
                per_h[h], ls = rules_at(truth[h][2], base_labs[h], b, deg, k, m, rng)
                per_h[h]["sig"] = sr.sigma_adj(b, ls, w)
            for k in kset:
                sig_by_k[k] = per_h[h_exact(k, m)]["sig"]
            kc = closed_form(sig_by_k, m)
            hc = h_exact(kc, m)
            row = {"F_aware": Fa, "h_aware": ha, "k_aware": len(set(la)), "F_aware_11av": pv["F"],
                   "blind_11av": pv["blind"], "k_c": kc, "h_c": hc, "sort_c": per_h[hc]["sort"] / Fa,
                   "sdesc_c": per_h[hc]["sdesc"] / Fa, "sig_by_k": {str(q): v for q, v in sig_by_k.items()}}
            for r_ in RULES:
                if r_ == "blind":
                    row["blind"] = per_h[hb]["blind"] / Fa
                    row["h_blind"] = hb
                    continue
                ho = min(NEW, key=lambda q: (per_h[q][r_], q))
                row[r_] = per_h[ho][r_] / Fa
                row["h_" + r_] = ho
            row["k_sort"] = per_h[row["h_sort"]]["k_sort"]
            row["k_goff"] = per_h[row["h_goff"]]["k_goff"]
            rows.append(row)
        res["cells"][str(s)] = rows
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.1f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return res


def med(x):
    x = [v for v in x if v is not None and np.isfinite(v)]
    return S.median(x) if x else float("nan")


def summarise(res, P=print):
    ok = {q: True for q in ("W1", "W2", "W3", "W4", "W5")}
    nb = sum(1 for r in res if r["base_ok"])
    rows_all = [x for r in res for s in r["cells"] for x in r["cells"][s]]
    dF = max(abs(x["F_aware"] / x["F_aware_11av"] - 1) for x in rows_all)
    dB = max(abs(x["blind"] / x["blind_11av"] - 1) for x in rows_all)
    P("# check: base labels on NEW equal 11av's in %d of %d layouts; aware F max rel diff from 11av %.2e, "
      "blind/aware %.2e (%d draws)" % (nb, len(res), dF, dB, len(rows_all)))
    for m in (12, 16):
        R_ = [r for r in res if r["m"] == m]
        P()
        P("## M = %d (%d layouts x %d draws); median ratio to the NEW-grid aware plan [old grid, 11ar-11at]; p90; max; "
          "draws below blind; draws at 6 bands" % (m, len(R_), DRAWS))
        for s in SCALES:
            rows = [x for r in R_ for x in r["cells"][str(s)]]
            n = len(rows)
            P("  s = %g (%d draws); aware bands %s" % (s, n, eg.tally(x["k_aware"] for x in rows)))
            meds = {}
            for r_ in RULES:
                v = [x[r_] for x in rows]
                meds[r_] = med(v)
                old = OLD_GRID[(m, s)].get(r_)
                wins = sum(1 for x in rows if x[r_] < x["blind"] - 1e-12)
                k6 = sum(1 for x in rows if eg.kcap(x["h_" + r_], m) == 6)
                P("    %-8s %.4f  [%s]  p90 %.4f  max %.4f  <blind %2d  6 bands %2d" % (
                    r_, meds[r_], "%.4f" % old if old else "  -   ", np.percentile(v, 90), max(v), wins, k6))
                if old and r_ in ("sort", "sdesc", "goff", "gdesc") and abs(meds[r_] - old) > 0.02:
                    ok["W3"] = False
            sc = [x["sort_c"] for x in rows]
            k6c = sum(1 for x in rows if x["k_c"] == 6)
            kcm = med(x["k_c"] for x in rows)
            P("    closed form (c): bands %s (median %g); sort at (c) median %.4f p90 %.4f; sort+descent at (c) %.4f"
              % (eg.tally(x["k_c"] for x in rows), kcm, med(sc), np.percentile(sc, 90), med(x["sdesc_c"] for x in rows)))
            P("    median sigma_adj by k (m): %s" % ", ".join(
                "k=%s %.3f" % (k, med(x["sig_by_k"].get(k) for x in rows)) for k in ("3", "4", "5", "6")))
            if s == 1.0:
                if not (meds["sort"] > meds["blind"] and meds["goff"] > meds["blind"]):
                    ok["W1"] = False
            else:
                cheap = ("blind", "sort", "sdesc", "goff", "gdeg")
                wins = sum(1 for x in rows if x["gdesc"] < x["blind"] - 1e-12)
                if not (all(meds["gdesc"] < meds[c] for c in cheap) and wins >= 68):
                    ok["W2"] = False
            if meds["rand_10"] > 1.010 or meds["rand_20"] > 1.005:
                ok["W4"] = False
            if k6c > 2 or kcm != (4 if s == 1.0 else 2):
                ok["W5"] = False
        P("  CPU per layout: median %.1f s" % med(r["cpu"] for r in R_))
    P()
    for q in sorted(ok):
        P("# %s -> %s" % (q, "held" if ok[q] else "refuted"))


def main(done):
    with gzip.open(os.path.join(HERE, "exact_grid.json.gz"), "rt") as f:
        prev = {(r["m"], r["idx"]): r for r in json.load(f)}
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    if "--quick" in sys.argv:
        keys = keys[:1]
    cache = os.environ.get("RULES_CACHE")
    if cache:
        os.makedirs(cache, exist_ok=True)

    def path(k):
        return os.path.join(cache, "%d_%d.json" % k) if cache else None
    have = {k: json.load(open(path(k))) for k in keys if cache and os.path.exists(path(k))}
    todo = [k for k in keys if k not in have]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        for k, r in zip(todo, pool_.imap(analyse, [(done[k], prev[k]) for k in todo])):
            have[k] = r
            if cache:
                with open(path(k), "w") as f:
                    json.dump(r, f)
    res = [have[k] for k in keys]
    if "--quick" not in sys.argv:
        with gzip.open(os.path.join(HERE, "exact_rules.json.gz"), "wt") as f:
            json.dump(res, f, separators=(",", ":"))
    print("# Milestone 11aw: 11ar-11at's cheap rules against the aware plan on the grid with every band count "
          "(exact_rules.py's docstring). deliv ages, Z = %.2f m, kernel tables, NEW grid %d spacings, 5-flight "
          "offsets, %d draws, s = %s; random-R R = %s" % (Z, len(NEW), DRAWS, ", ".join("%g" % s for s in SCALES),
                                                         ", ".join(str(R) for R in RS)))
    summarise(res)


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(os.path.join(HERE, "exact_rules.json.gz"), "rt") as f:
            summarise(json.load(f))
        sys.exit(0)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    main(done)
