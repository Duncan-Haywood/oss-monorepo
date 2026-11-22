"""Milestone 11az: a rule for the leak budget's large-offset tail. Search the budget's band count k_B and its two
neighbours (11ay's rule N) always, and k_B - 2 or k_B + 2 only when the leak curve is flat between it and k_B.

Why: the "Next" of 11ay and of the 2026-11-22 paper step. 11ay's N(p_LOLO) recovers the full search's median
(1.0000 to 1.0020) at 150 descents instead of 1 600, but its p90 at s = 2 is 1.0678 (M = 12) and 1.0522 (M = 16),
above the 1.05 bar, and its worst draw at M = 12, s = 2 costs 1.5472 under every budget tested. 11ay read the tail as
draws where the search's band count is two or more away from the budget's (the 3-band against 5-to-6 split at
s = 2). The adjacent-pair leak is the only signal a practitioner has to decide when a wider search is worth it: if
the leak barely changes between k_B and k_B +/- 2, the budget cannot tell those band counts apart, and searching
them is cheap insurance; where the leak curve is steep, the budget's choice is informed and the extra spacing is
wasted.

Data: `leak_budget.json.gz` as saved by 11ax (384 draws: 48 layouts x 2 offset scales x 4 draws), per draw the
sorted plan's adjacent leak at every band count's widest NEW spacing (`leak_by_k`) and 11aw's random-50 cost ratio
to the aware F at every band count (`cost_by_k`), read through `budget_cv.draws`. Nothing is rerun.

Rules (effort = spacings searched x 50 descents):
  * N: best random-50 over k_B - 1, k_B, k_B + 1 (11ay; 150 descents, fewer at the ends of 1..12).
  * W: best over k_B - 2 .. k_B + 2, always (250 descents): the unconditional wide search.
  * A(r): N's spacings plus k_B + 2 if leak(k_B + 2) / leak(k_B) <= r and k_B - 2 if leak(k_B) / leak(k_B - 2) <= r,
    each leak floored at EPS = 1e-6 (a leak of 0 at both ends is flat). r on R_GRID (1 and 61 log-spaced values in
    [1, 1e6]); r = 1 extends only across an exactly flat (or floored) stretch, large r is W.
  * oracle: best over every band count (11ay's bound).
Budget p: 11ay's leave-one-layout-out budget for N (chosen on the other 47 layouts' mean N cost; reproduced here and
checked against 11ay's printed folds). Ratio r: chosen in the same LOLO fold, on the same 376 training draws: the
lowest training p90 of A's cost subject to a training mean effort <= 200 descents (one extra spacing in two draws);
ties to the smaller r.
Control: does flatness pick the right draws? For each (M, s) cell, the held-out A adds n extra spacings; the
control adds n extra spacings chosen uniformly at random among the cell's available k_B +/- 2 slots (1 000 draws of
the subset, seed 11), and reports the median of its p90 and the share of subsets whose p90 is <= A's.

Predictions (written and pushed before this script was run; 11ay's printed summary was known, including N's
medians, p90s, its worst draw 1.5472 at M = 12 s = 2 and that N takes a neighbour of k_B in 32 to 52 of 96 draws; no
k_B +/- 2 cost, no per-draw leak ratio and no tail draw's band counts had been looked at):
 T1 W has median <= 1.001 and p90 <= 1.03 in all four (M, s) cells.
 T2 Held out, A(r_LOLO) has a p90 <= 1.05 in all four cells (the bar N missed at s = 2) and a mean effort
    <= 210 descents in each cell.
 T3 In at least 3 of the 4 cells, A's held-out p90 is below the random-extension control's median p90 at the same
    number of extra spacings.
 T4 At s = 2, A's p90 excess (p90 - 1) is at most 60% of N's at both M.
 T5 W's worst draw at M = 12, s = 2 costs <= 1.10 (N's 1.5472 draw is two band counts or fewer from k_B).
Reported without a prediction: the LOLO r per fold, A's share of draws extended per cell, the distance |k_best - k_B|
in N's tail draws (cost > 1.05), and the mean cost of every rule.

    python3 tail_rule.py > tail_rule_results.txt

Limits: as 11ay (one Gaussian pair sd in the leak, offsets known exactly, 5-flight offsets, 48 synthetic layouts,
random-50 at each spacing shares 11aw's seeds, so W and A reuse the same searches as N rather than new ones);
the flatness signal uses only the sorted plan's adjacent leak, the same input as the budget. Preliminary.
"""
import gzip
import json
import math
import os
import statistics as S
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import budget_cv as cv  # noqa: E402

EPS = 1e-6
R_GRID = tuple(sorted({1.0} | {float(v) for v in np.geomspace(1.0, 1e6, 61)}))
DESC = 50
EFFORT_CAP = 200.0
SEED = 11
REPS = 1000


def _leak(x, k):
    return max(x["leak"][k], EPS)


def spacings_N(x, p):
    k = cv.budget_rule(x["leak"], p)
    return [j for j in (k - 1, k, k + 1) if j in x["cost"]]


def spacings_W(x, p):
    k = cv.budget_rule(x["leak"], p)
    return [j for j in range(k - 2, k + 3) if j in x["cost"]]


def extensions(x, p):
    """The k_B +/- 2 slots that exist, as (k, log leak ratio across the stretch to k_B)."""
    k = cv.budget_rule(x["leak"], p)
    out = []
    if k + 2 in x["cost"]:
        out.append((k + 2, math.log(_leak(x, k + 2) / _leak(x, k))))
    if k - 2 in x["cost"]:
        out.append((k - 2, math.log(_leak(x, k) / _leak(x, k - 2))))
    return out


def spacings_A(x, p, r):
    lr = math.log(r)
    return spacings_N(x, p) + [j for j, g in extensions(x, p) if g <= lr + 1e-12]


def cost(x, ks):
    return min(x["cost"][j] for j in ks)


def p90(v):
    return float(np.percentile(v, 90))


def calibrate_r(rows, ps, grid=R_GRID, cap=EFFORT_CAP):
    """The r with the lowest p90 of A's cost subject to mean effort <= cap; ties to the smaller r. If no r meets
    the cap, the smallest r."""
    best = None
    for r in grid:
        sp = [spacings_A(x, p, r) for x, p in zip(rows, ps)]
        eff = S.fmean(DESC * len(s) for s in sp)
        if eff > cap + 1e-9:
            continue
        q = p90([cost(x, s) for x, s in zip(rows, sp)])
        if best is None or q < best[0] - 1e-12:
            best = (q, r)
    return grid[0] if best is None else best[1]


def lolo(rows):
    """Per draw: (p_N from 11ay's LOLO, r from this LOLO). Both are chosen without the held-out layout."""
    keys = sorted({(x["m"], x["idx"]) for x in rows})
    out = [None] * len(rows)
    for key in keys:
        tr = [i for i, x in enumerate(rows) if (x["m"], x["idx"]) != key]
        train = [rows[i] for i in tr]
        p = cv.calibrate(train, cv.cost_N)
        r = calibrate_r(train, [p] * len(train))
        for i, x in enumerate(rows):
            if (x["m"], x["idx"]) == key:
                out[i] = (p, r)
    return out


def control(sub, ps, n_extra, rng, reps=REPS):
    """p90s of N plus n_extra k_B +/- 2 spacings chosen at random among the cell's available slots."""
    slots = [(i, j) for i, (x, p) in enumerate(zip(sub, ps)) for j, _ in extensions(x, p)]
    base = [spacings_N(x, p) for x, p in zip(sub, ps)]
    out = []
    for _ in range(reps):
        pick = rng.choice(len(slots), size=min(n_extra, len(slots)), replace=False) if n_extra else []
        ks = [list(b) for b in base]
        for t in pick:
            i, j = slots[int(t)]
            ks[i].append(j)
        out.append(p90([cost(x, k) for x, k in zip(sub, ks)]))
    return out


def main():
    with gzip.open(os.path.join(HERE, "leak_budget.json.gz"), "rt") as f:
        rows = cv.draws(json.load(f))
    P = print
    P("# Milestone 11az: a flatness-triggered k_B +/- 2 extension of 11ay's neighbour rule (tail_rule.py's "
      "docstring). Data: leak_budget.json.gz, %d draws; r grid %d values in [1, 1e6]; effort cap %g descents"
      % (len(rows), len(R_GRID), EFFORT_CAP))
    pr = lolo(rows)
    rs = sorted({(x["m"], x["idx"], r) for x, (_, r) in zip(rows, pr)})
    rv = [r for _, _, r in rs]
    pv = sorted({(x["m"], x["idx"], p) for x, (p, _) in zip(rows, pr)})
    P("# LOLO budget p (11ay's N folds): min %.4g, median %.4g, max %.4g"
      % (min(t[2] for t in pv), S.median(t[2] for t in pv), max(t[2] for t in pv)))
    P("# LOLO ratio r: min %.4g, median %.4g, max %.4g over 48 folds" % (min(rv), S.median(rv), max(rv)))
    rng = np.random.default_rng(SEED)
    ok = {q: True for q in ("T1", "T2", "T3", "T4", "T5")}
    ctrl_wins = 0
    for m in (12, 16):
        for s in cv.SCALES:
            ii = [i for i, x in enumerate(rows) if x["m"] == m and x["s"] == s]
            sub = [rows[i] for i in ii]
            ps = [pr[i][0] for i in ii]
            sN = [spacings_N(x, p) for x, p in zip(sub, ps)]
            sW = [spacings_W(x, p) for x, p in zip(sub, ps)]
            sA = [spacings_A(x, pr[i][0], pr[i][1]) for x, i in zip(sub, ii)]
            P()
            P("## M = %d, s = %s (%d draws)" % (m, s, len(sub)))
            st = {}
            for name, sp in (("N", sN), ("A(LOLO)", sA), ("W", sW)):
                v = [cost(x, k) for x, k in zip(sub, sp)]
                eff = S.fmean(DESC * len(k) for k in sp)
                st[name] = (S.median(v), p90(v), S.fmean(v), max(v), eff)
                P("  %-8s median %.4f  p90 %.4f  mean %.4f  max %.4f  effort %.1f descents  (within 1%%: %d of %d)"
                  % ((name,) + st[name] + (sum(c <= 1.01 for c in v), len(v))))
            v = [cv.cost_oracle(x) for x in sub]
            P("  %-8s median %.4f  p90 %.4f  mean %.4f  max %.4f  effort %d descents"
              % ("oracle", S.median(v), p90(v), S.fmean(v), max(v), DESC * 12))
            n_extra = sum(len(a) - len(n) for a, n in zip(sA, sN))
            n_slots = sum(len(extensions(x, p)) for x, p in zip(sub, ps))
            P("  A extends %d of %d available k_B +/- 2 slots (%d of %d draws)"
              % (n_extra, n_slots, sum(len(a) > len(n) for a, n in zip(sA, sN)), len(sub)))
            c = control(sub, ps, n_extra, rng)
            share = sum(q <= st["A(LOLO)"][1] + 1e-12 for q in c) / len(c)
            P("  random-extension control (%d extra spacings, %d subsets): median p90 %.4f, p10 %.4f, p90 %.4f; "
              "share with p90 <= A's: %.3f" % (n_extra, len(c), S.median(c), float(np.percentile(c, 10)),
                                                 float(np.percentile(c, 90)), share))
            if st["A(LOLO)"][1] < S.median(c) - 1e-12:
                ctrl_wins += 1
            tail = [(x, p) for x, p, k in zip(sub, ps, sN) if cost(x, k) > 1.05]
            dist = sorted(abs(min(x["cost"], key=x["cost"].get) - cv.budget_rule(x["leak"], p)) for x, p in tail)
            P("  N's tail draws (cost > 1.05): %d; |k_best - k_B| = %s" % (len(tail), dist))
            if st["W"][0] > 1.001 or st["W"][1] > 1.03:
                ok["T1"] = False
            if st["A(LOLO)"][1] > 1.05 or st["A(LOLO)"][4] > 210:
                ok["T2"] = False
            if s == "2.0" and st["A(LOLO)"][1] - 1 > 0.6 * (st["N"][1] - 1):
                ok["T4"] = False
            if m == 12 and s == "2.0":
                if st["W"][3] > 1.10:
                    ok["T5"] = False
                worst = max(range(len(sub)), key=lambda t: cost(sub[t], sN[t]))
                x = sub[worst]
                kb = cv.budget_rule(x["leak"], ps[worst])
                P("  N's worst draw: layout %d, k_B %d, k_aware %d, best k %d; cost by k %s; leak by k %s"
                  % (x["idx"], kb, x["k_aware"], min(x["cost"], key=x["cost"].get),
                     {k: round(v, 4) for k, v in sorted(x["cost"].items())},
                     {k: float("%.3g" % v) for k, v in sorted(x["leak"].items())}))
    if ctrl_wins < 3:
        ok["T3"] = False
    P()
    P("# A beats the random-extension control's median p90 in %d of 4 cells" % ctrl_wins)
    for q in sorted(ok):
        P("# %s -> %s" % (q, "held" if ok[q] else "refuted"))


if __name__ == "__main__":
    main()
