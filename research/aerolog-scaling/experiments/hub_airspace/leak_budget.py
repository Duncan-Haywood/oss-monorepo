"""Milestone 11ax: replace the 3-sigma spacing rule with a leak-probability budget at the adjacent pairs, and ask
which budget reproduces the offset-aware planner's band count, calibrated on one fleet size and tested on the other.

Why: 11aw's "Next". 11aw's closed form (c) (the most bands k whose widest spacing h_k satisfies h_k - Z >= 3
sigma_adj, sigma_adj from the sorted plan's adjacent pairs) picks a median 4 bands at s = 1 and 2 at s = 2, one band
below the search's median (5 and 3), and the sorted plan at (c)'s spacing costs a median 1.18 to 1.47 of the aware
plan. 11ap's fleet table (`rule_check_results.txt`) already showed why: at the measured offset the search's 5-band
plan accepts a mean leak probability one level apart of about 0.066 over the offset mixture, about 50 times the
Phi(-3) = 0.00135 that h - Z >= 3 sigma implies for a Gaussian. The 3-sigma rule is a safety-style budget; the
planner trades leaks one level apart against same-level conflicts, and the optimum is a much larger leak.

Rule B(p): at each band count k, take the sorted plan (11ar's sort of the offset-blind base labels, better of
ascending and descending, as in 11aw) at k's widest NEW spacing h_k, and compute the conflict-weighted mean, over
cross-operator pairs one level apart (w > 0), of the leak probability P(|h_k + d + e| < Z), d = b_i - b_j, e ~ N(0,
sigma_pair^2), sigma_pair = 1.061 m, symmetrised in the sign of d (`rule_check.p_leak`, as `rule_check.p_mix`).
B(p) = the most k whose leak is <= p; the fewest bands if none is. Every input is what a practitioner has: the
measured offsets, the conflict weights, the offset-blind plan, the pair sd. No scorer, no search.

Run: 11aw's loop replicated exactly (kernel tables, same seeds, same rng order, so every rule value at every spacing
is 11aw's), plus the leaks above and the leak of the aware plan's own labels at its own spacing. Budgets
P_GRID = 1e-4 ... 0.3 are all scored on the saved results; nothing is rerun per budget.
  * p0 = Phi(-3) = 0.00135, the 3-sigma-equivalent budget, fixed in advance.
  * p* = the budget on P_GRID that maximises agreement with the aware band count over M = 12 (both s, 192 draws;
    ties to the smaller p), then applied unchanged to M = 16 (held out).
At B(p)'s spacing h_B, the cost (ratio to 11aw's NEW-grid aware F) of the sorted plan, sort+descent, and the best of
50 random starts each descended (11aw's random-50 at that one spacing: 50 descents instead of 50 x 32).

Checks (or the comparison is void): base's best labels equal 11aw's (exact_rules.json.gz) in 48 of 48 layouts;
aware F, k_c and sort at (c) equal 11aw's exactly in 384 of 384 draws.

Predictions (written and pushed before this script was run on any layout; 11ao to 11aw results were known, including
rule_check's fleet leak table and 11aw's aware band tallies and closed-form medians):
 L1 B(p0) picks a median 4 bands at s = 1 and 3 at s = 2, at both M (one band more than (c) at s = 2, because the
    discrete offset mixture's tail is lighter than a Gaussian's at the same sd once the sort removes the worst pairs).
 L2 p* lies in [0.01, 0.1].
 L3 On the held-out M = 16, B(p*) matches the aware band count in at least half the draws at s = 1, and in more
    draws than (c) in both s cells.
 L4 At B(p*)'s spacing, sort+descent costs a lower median than sort+descent at (c) in all four (M, s) cells (11aw:
    1.1379, 1.2589 at M = 12; 1.2054, 1.3762 at M = 16), and random-50 at that one spacing is within 2% of the aware
    plan (median <= 1.02) at M = 16, both s.
 L5 The aware plan's own adjacent leak (its labels, its spacing) has a median above 0.01 at s = 1, both M.
Reported without a prediction: agreement of every budget on the grid, per cell; the per-cell best budget (in-sample,
labelled as such); the band tallies of B(p0), B(p*) and (c); p90 of each cost.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl BUDGET_CACHE=bcache python3 leak_budget.py > leak_budget_results.txt
    python3 leak_budget.py --summarise   # rescore budgets from leak_budget.json.gz

Limits: as 11ao to 11aw (5 flights chosen by their uploaders, one offset per operator, offsets known exactly);
sigma_pair is one Gaussian sd for every pair (the planner uses each pair's sourced support); the calibration is one
split (M = 12 -> 16), not a cross-validation over layouts. Preliminary.
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
import exact_rules as er  # noqa: E402
import fast_tables as ft  # noqa: E402
import rule_check as rc  # noqa: E402
import sort_rule as sr  # noqa: E402
import speed_offset as so  # noqa: E402

Z = ds.Z
NEW = eg.NEW
SCALES = er.SCALES
DRAWS = so.DRAWS
SIGMA_PAIR = sr.SIGMA_PAIR
P0 = 0.5 * (1.0 + math.erf(-3.0 / math.sqrt(2.0)))  # Phi(-3)
P_GRID = (1e-4, 3e-4, P0, 3e-3, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3)
COSTS = ("sort", "sdesc", "rand_50")


def adj_leak(b, lab, w, h, sigma_pair=SIGMA_PAIR):
    """Conflict-weighted mean leak probability over cross-operator pairs one level apart (w > 0) at spacing h;
    the zero-offset leak if no weighted pair is adjacent."""
    b, lab = np.asarray(b, float), np.asarray(lab)
    m = len(lab)
    num = den = 0.0
    for i in range(m):
        for j in range(i + 1, m):
            if abs(int(lab[i]) - int(lab[j])) == 1 and w[i, j] > 0:
                d = float(b[i] - b[j])
                p = 0.5 * (rc.p_leak(d, sigma_pair, h) + rc.p_leak(-d, sigma_pair, h))
                num += float(w[i, j]) * p
                den += float(w[i, j])
    return num / den if den > 0 else rc.p_leak(0.0, sigma_pair, h)


def budget_rule(leak_by_k, p):
    """The most bands k whose leak is <= p; the fewest bands if none is."""
    ok = [k for k, v in leak_by_k.items() if v <= p]
    return max(ok) if ok else min(leak_by_k)


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
    res = {"m": m, "idx": idx, "base_labels": list(lb), "cells": {}}
    kset = sorted({eg.kcap(h, m) for h in NEW})
    hk = {k: er.h_exact(k, m) for k in kset}
    for si, s in enumerate(SCALES):
        rows = []
        for dd in range(DRAWS):
            b = so.draw_offsets(c10, m, s, 7000 * dd + idx)
            truth = eg.plan(kern, W, X, V, so.with_offsets(sup, b), m, seed, starts=base_labs)
            ha, la, Fa = eg.best(truth, NEW)
            rng = np.random.default_rng(90000 + 1000 * dd + 100 * si + idx)
            per_h, sig_by_k, leak_by_k = {}, {}, {}
            for h in NEW:  # same order and rng use as exact_rules.analyse
                k = eg.kcap(h, m)
                per_h[h], ls = er.rules_at(truth[h][2], base_labs[h], b, deg, k, m, rng)
                per_h[h]["sig"] = sr.sigma_adj(b, ls, w)
                if h in hk.values() and hk[k] == h:
                    leak_by_k[k] = adj_leak(b, ls, w, h)
            for k in kset:
                sig_by_k[k] = per_h[hk[k]]["sig"]
            kc = er.closed_form(sig_by_k, m)
            row = {"F_aware": Fa, "h_aware": ha, "k_aware": len(set(la)), "k_c": kc,
                   "leak_aware": adj_leak(b, la, w, ha),
                   "leak_by_k": {str(k): v for k, v in leak_by_k.items()},
                   "cost_by_k": {str(k): {c: per_h[hk[k]][c] / Fa for c in COSTS} for k in kset}}
            rows.append(row)
        res["cells"][str(s)] = rows
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.1f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return res


def med(x):
    x = [v for v in x if v is not None and np.isfinite(v)]
    return S.median(x) if x else float("nan")


def k_of(row, p):
    return budget_rule({int(k): v for k, v in row["leak_by_k"].items()}, p)


def agree(rows, p):
    return sum(1 for x in rows if k_of(x, p) == x["k_aware"])


def calibrate(rows):
    """p on P_GRID maximising agreement with the aware band count; ties to the smaller p."""
    return max(P_GRID, key=lambda p: (agree(rows, p), -p))


def summarise(res, prev=None, P=print):
    ok = {q: True for q in ("L1", "L2", "L3", "L4", "L5")}
    if prev is not None:
        nb = sum(1 for r in res if r["base_labels"] == prev[(r["m"], r["idx"])]["base_labels"])
        nF = nk = nS = n = 0
        for r in res:
            pr = prev[(r["m"], r["idx"])]
            for s in r["cells"]:
                for x, y in zip(r["cells"][s], pr["cells"][s]):
                    n += 1
                    nF += x["F_aware"] == y["F_aware"]
                    nk += x["k_c"] == y["k_c"]
                    nS += abs(x["cost_by_k"][str(y["k_c"])]["sort"] - y["sort_c"]) <= 1e-12
        P("# check: base labels equal 11aw's in %d of %d layouts; aware F equal in %d, k_c in %d, sort at (c) in %d "
          "of %d draws" % (nb, len(res), nF, nk, nS, n))
    rows_of = {(m, s): [x for r in res if r["m"] == m for x in r["cells"][str(s)]] for m in (12, 16) for s in SCALES}
    cal = [x for s in SCALES for x in rows_of[(12, s)]]
    pstar = calibrate(cal)
    P("# p0 = Phi(-3) = %.5f; p* (calibrated on M = 12, both s, %d draws) = %g, agreement %d of %d"
      % (P0, len(cal), pstar, agree(cal, pstar), len(cal)))
    if not (0.01 <= pstar <= 0.1):
        ok["L2"] = False
    for (m, s), rows in rows_of.items():
        n = len(rows)
        tag = "calibration" if m == 12 else "held out"
        P()
        P("## M = %d, s = %g (%d draws, %s); aware bands %s" % (m, s, n, tag, eg.tally(x["k_aware"] for x in rows)))
        P("  aware plan's own adjacent leak: median %.4f, p10 %.4f, p90 %.4f"
          % (med(x["leak_aware"] for x in rows), np.percentile([x["leak_aware"] for x in rows], 10),
             np.percentile([x["leak_aware"] for x in rows], 90)))
        P("  median sorted-plan adjacent leak by k: %s" % ", ".join(
            "k=%s %.4f" % (k, med(x["leak_by_k"].get(k) for x in rows)) for k in ("2", "3", "4", "5", "6", "7")))
        P("  agreement with the aware band count by budget: %s" % ", ".join(
            "%g:%d" % (p, agree(rows, p)) for p in P_GRID))
        best_cell = max(P_GRID, key=lambda p: (agree(rows, p), -p))
        P("  in-sample best budget for this cell: %g (%d of %d)" % (best_cell, agree(rows, best_cell), n))
        kcs = {}
        for name, kfun in (("(c) 3-sigma", lambda x: x["k_c"]), ("B(p0)", lambda x: k_of(x, P0)),
                           ("B(p*)", lambda x: k_of(x, pstar))):
            ks = [kfun(x) for x in rows]
            kcs[name] = ks
            cost = {c: [x["cost_by_k"][str(k)][c] for x, k in zip(rows, ks)] for c in COSTS}
            P("  %-11s bands %s (median %g); agree %2d; sort %.4f (p90 %.4f); sort+descent %.4f (p90 %.4f); "
              "random-50 at h_B %.4f (p90 %.4f)" % (
                  name, eg.tally(ks), med(ks), sum(1 for x, k in zip(rows, ks) if k == x["k_aware"]),
                  med(cost["sort"]), np.percentile(cost["sort"], 90), med(cost["sdesc"]),
                  np.percentile(cost["sdesc"], 90), med(cost["rand_50"]), np.percentile(cost["rand_50"], 90)))
            if name == "B(p*)":
                sd_star = med(cost["sdesc"])
                r50 = med(cost["rand_50"])
            if name == "(c) 3-sigma":
                sd_c = med(cost["sdesc"])
        if med(kcs["B(p0)"]) != (4 if s == 1.0 else 3):
            ok["L1"] = False
        if m == 16:
            a_star = sum(1 for x, k in zip(rows, kcs["B(p*)"]) if k == x["k_aware"])
            a_c = sum(1 for x, k in zip(rows, kcs["(c) 3-sigma"]) if k == x["k_aware"])
            if a_star <= a_c or (s == 1.0 and 2 * a_star < n):
                ok["L3"] = False
            if r50 > 1.02:
                ok["L4"] = False
        if not sd_star < sd_c:
            ok["L4"] = False
        if s == 1.0 and not med(x["leak_aware"] for x in rows) > 0.01:
            ok["L5"] = False
    P()
    P("  CPU per layout: median %.1f s" % med(r["cpu"] for r in res))
    for q in sorted(ok):
        P("# %s -> %s" % (q, "held" if ok[q] else "refuted"))


def load_prev():
    with gzip.open(os.path.join(HERE, "exact_rules.json.gz"), "rt") as f:
        old = json.load(f)
    with gzip.open(os.path.join(HERE, "exact_grid.json.gz"), "rt") as f:
        grid = {(r["m"], r["idx"]): r for r in json.load(f)}
    return {(r["m"], r["idx"]): dict(r, base_labels=grid[(r["m"], r["idx"])]["base_new"]["labels"]) for r in old}


def main(done):
    prev = load_prev()
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    if "--quick" in sys.argv:
        keys = keys[:1]
    cache = os.environ.get("BUDGET_CACHE")
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
    if "--quick" in sys.argv:
        print(json.dumps(res[0]["cells"]["1.0"][0], indent=1)[:3000])
        return
    with gzip.open(os.path.join(HERE, "leak_budget.json.gz"), "wt") as f:
        json.dump(res, f, separators=(",", ":"))
    print("# Milestone 11ax: a leak-probability budget at the adjacent pairs against the aware plan's band count "
          "(leak_budget.py's docstring). deliv ages, Z = %.2f m, kernel tables, NEW grid %d spacings, 5-flight "
          "offsets, %d draws, s = %s, sigma_pair = %.3f m" % (Z, len(NEW), DRAWS, ", ".join("%g" % s for s in SCALES),
                                                           SIGMA_PAIR))
    summarise(res, prev)


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(os.path.join(HERE, "leak_budget.json.gz"), "rt") as f:
            summarise(json.load(f), load_prev())
        sys.exit(0)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    main(done)
