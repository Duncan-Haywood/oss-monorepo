"""Milestone 11ay: calibrate 11ax's leak budget on the planner's own target (the conflict cost F) with a
leave-one-layout-out cross-validation, and test a three-spacing version of the rule that searches the budget's band
count and its two neighbours.

Why: 11ax's "Next". 11ax calibrated the budget p on band-count agreement with the offset-aware search, on one split
(M = 12 -> 16). Agreement is a weak target there (the search is bimodal at s = 2: 3 bands against 5 to 6, so no
budget matched more than 54 of 96 draws in any cell), while the cost of the finished plan is what a planner pays.
11ax already showed that 50 random starts at the budget's one spacing land within 1.4% of the full 32-spacing search
at the median; its p90 was 1.06 to 1.18, the tail coming from draws where the budget picks the wrong side of the
bimodal choice. Searching k_B - 1, k_B and k_B + 1 (three spacings, 150 descents instead of 1 600) should catch most
of those.

Data: `leak_budget.json.gz` as saved by 11ax (48 layouts x 2 offset scales x 4 draws = 384 draws), which holds, per
draw, the sorted plan's adjacent leak at every band count's widest NEW spacing (`leak_by_k`) and the cost, as a
ratio to 11aw's NEW-grid aware F, of 11aw's random-50 (best of 50 uniform random starts, each descended, at that
one spacing) at every band count (`cost_by_k`). Nothing is rerun; every number below is a function of that file.

Rules, all using only practitioner inputs to choose the spacing (the budget, the leaks):
  * B(p): random-50 at k_B = budget_rule(leak_by_k, p), one spacing (11ax's rule).
  * N(p): the best random-50 over k_B - 1, k_B, k_B + 1 (those that exist): three spacings.
  * oracle: the best random-50 over every band count (32 -> 12 widest spacings; a lower bound for one-spacing
    rules, not a rule).
  * the fixed budgets of 11ax, p0 = Phi(-3) and p* = 0.07, for comparison.
Calibration target: the mean cost ratio of the rule over the training draws (a planner pays the mean, and the mean
is sensitive to the tail the median hides). Budgets on P_DENSE (41 log-spaced values in [1e-4, 0.3] plus 11ax's
P_GRID); ties to the smaller p.
  * LOLO: for each of the 48 layouts, p is chosen on the other 47 layouts' 376 draws (both M, both s), separately
    for B and for N, and applied to the held-out layout's 8 draws.
  * Split: p chosen on M = 12 (192 draws) on F, applied to M = 16, the direct counterpart of 11ax's p*.

Predictions (written and pushed before this script was run; 11ax's printed summary, including its p*, agreement
tables, in-sample best agreement budgets and B(p*)'s and B(p0)'s medians and p90s, was known; no F-calibrated
budget, no neighbour rule and no oracle had been computed):
 V1 The LOLO budget for B lies in [0.02, 0.1] in all 48 folds.
 V2 Held out, B(p_LOLO) has a median random-50 cost <= 1.015 in all four (M, s) cells, and a mean no more than 0.005
    above B(0.07)'s mean in each cell (calibrating on F does not do worse than calibrating on agreement).
 V3 Held out, N(p_LOLO,N) has a median <= 1.003 and a p90 <= 1.05 in all four cells.
 V4 The oracle's median is <= 1.002 in all four cells.
 V5 At s = 2, B(p_LOLO)'s p90 exceeds 1.08 at both M (one spacing cannot resolve the bimodal choice), and N's p90
    excess (p90 - 1) is at most half of B's in both.
Reported without a prediction: the split budget and its held-out costs, the per-(M, s) in-sample optimum, the
fraction of draws where N picks a neighbour rather than k_B, and the mean cost of each rule.

    python3 budget_cv.py > budget_cv_results.txt

Limits: as 11ax (one Gaussian pair sd in the leak, offsets known exactly, 5-flight offsets, 48 synthetic layouts);
the folds share 11ax's draws and seeds, so the cross-validation tests the budget's choice, not new random searches;
random-50 at one spacing uses 11aw's seeds, so N's three searches are not independent of B's. Preliminary.
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

P0 = 0.5 * (1.0 + math.erf(-3.0 / math.sqrt(2.0)))
P_GRID = (1e-4, 3e-4, P0, 3e-3, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3)
P_DENSE = tuple(sorted(set(P_GRID) | {float(v) for v in np.geomspace(1e-4, 0.3, 41)}))
P_STAR = 0.07
COST = "rand_50"
SCALES = ("1.0", "2.0")


def budget_rule(leak_by_k, p):
    """The most bands k whose leak is <= p; the fewest bands if none is (as leak_budget.budget_rule)."""
    ok = [k for k, v in leak_by_k.items() if v <= p]
    return max(ok) if ok else min(leak_by_k)


def draws(res):
    """Flatten to one dict per draw with integer-keyed leak and cost tables."""
    out = []
    for r in res:
        for s in SCALES:
            for x in r["cells"][s]:
                out.append({"m": r["m"], "idx": r["idx"], "s": s, "k_aware": x["k_aware"],
                            "leak": {int(k): v for k, v in x["leak_by_k"].items()},
                            "cost": {int(k): v[COST] for k, v in x["cost_by_k"].items()}})
    return out


def cost_B(x, p):
    return x["cost"][budget_rule(x["leak"], p)]


def cost_N(x, p):
    k = budget_rule(x["leak"], p)
    return min(x["cost"][j] for j in (k - 1, k, k + 1) if j in x["cost"])


def cost_oracle(x, p=None):
    return min(x["cost"].values())


def calibrate(rows, rule, grid=P_DENSE):
    """The budget minimising the rule's mean cost over rows; ties to the smaller p."""
    return min(grid, key=lambda p: (S.fmean(rule(x, p) for x in rows), p))


def lolo(rows, rule):
    """Leave-one-layout-out: per draw, (cost under the budget chosen without its layout, that budget)."""
    out = {}
    for key in sorted({(x["m"], x["idx"]) for x in rows}):
        train = [x for x in rows if (x["m"], x["idx"]) != key]
        p = calibrate(train, rule)
        for i, x in enumerate(rows):
            if (x["m"], x["idx"]) == key:
                out[i] = (rule(x, p), p)
    return [out[i] for i in range(len(rows))]


def stats(v):
    return S.median(v), float(np.percentile(v, 90)), S.fmean(v)


def main():
    with gzip.open(os.path.join(HERE, "leak_budget.json.gz"), "rt") as f:
        rows = draws(json.load(f))
    P = print
    P("# Milestone 11ay: leak budget calibrated on F (random-50 cost ratio to the aware plan), leave-one-layout-out "
      "over 48 layouts, and a three-spacing neighbour rule (budget_cv.py's docstring). Data: leak_budget.json.gz, "
      "%d draws; budgets: %d values in [1e-4, 0.3]" % (len(rows), len(P_DENSE)))
    cvB, cvN = lolo(rows, cost_B), lolo(rows, cost_N)
    pB = [p for _, p in cvB]
    pN = [p for _, p in cvN]
    P("# LOLO budget for B: min %.4g, median %.4g, max %.4g; folds in [0.02, 0.1]: %d of 48"
      % (min(pB), S.median(pB), max(pB), sum(0.02 <= p <= 0.1 for p in set_by_layout(rows, pB))))
    P("# LOLO budget for N: min %.4g, median %.4g, max %.4g" % (min(pN), S.median(pN), max(pN)))
    cal = [x for x in rows if x["m"] == 12]
    ps_B, ps_N = calibrate(cal, cost_B), calibrate(cal, cost_N)
    P("# split (M = 12 -> 16) on F: p_B = %.4g, p_N = %.4g (11ax's agreement p* = %g)" % (ps_B, ps_N, P_STAR))
    ok = {q: True for q in ("V1", "V2", "V3", "V4", "V5")}
    if not all(0.02 <= p <= 0.1 for p in pB):
        ok["V1"] = False
    for m in (12, 16):
        for s in SCALES:
            ii = [i for i, x in enumerate(rows) if x["m"] == m and x["s"] == s]
            sub = [rows[i] for i in ii]
            P()
            P("## M = %d, s = %s (%d draws)" % (m, s, len(sub)))
            lines = {
                "B(p0)": [cost_B(x, P0) for x in sub],
                "B(0.07)": [cost_B(x, P_STAR) for x in sub],
                "B(LOLO)": [cvB[i][0] for i in ii],
                "N(LOLO)": [cvN[i][0] for i in ii],
                "N(0.07)": [cost_N(x, P_STAR) for x in sub],
                "oracle": [cost_oracle(x) for x in sub],
            }
            if m == 16:
                lines["B(split)"] = [cost_B(x, ps_B) for x in sub]
                lines["N(split)"] = [cost_N(x, ps_N) for x in sub]
            st = {}
            for name, v in lines.items():
                st[name] = stats(v)
                P("  %-9s median %.4f  p90 %.4f  mean %.4f  max %.4f  (within 1%%: %d of %d)"
                  % ((name,) + st[name] + (max(v), sum(c <= 1.01 for c in v), len(v))))
            nb = sum(1 for i in ii if cvN[i][0] < rows[i]["cost"][budget_rule(rows[i]["leak"], cvN[i][1])] - 1e-12)
            P("  N(LOLO) takes a neighbour of k_B in %d of %d draws" % (nb, len(ii)))
            ins_B = calibrate(sub, cost_B)
            ins_N = calibrate(sub, cost_N)
            P("  in-sample best budget (this cell only): B %.4g (mean %.4f), N %.4g (mean %.4f)"
              % (ins_B, S.fmean(cost_B(x, ins_B) for x in sub), ins_N, S.fmean(cost_N(x, ins_N) for x in sub)))
            if st["B(LOLO)"][0] > 1.015 or st["B(LOLO)"][2] > st["B(0.07)"][2] + 0.005:
                ok["V2"] = False
            if st["N(LOLO)"][0] > 1.003 or st["N(LOLO)"][1] > 1.05:
                ok["V3"] = False
            if st["oracle"][0] > 1.002:
                ok["V4"] = False
            if s == "2.0" and (st["B(LOLO)"][1] <= 1.08 or st["N(LOLO)"][1] - 1 > 0.5 * (st["B(LOLO)"][1] - 1)):
                ok["V5"] = False
    P()
    P("  search effort: B = 50 descents, N = 150, the full random-50 over 32 spacings = 1 600")
    for q in sorted(ok):
        P("# %s -> %s" % (q, "held" if ok[q] else "refuted"))


def set_by_layout(rows, ps):
    """One budget per layout fold (the value its draws share)."""
    seen = {}
    for x, p in zip(rows, ps):
        seen[(x["m"], x["idx"])] = p
    return list(seen.values())


if __name__ == "__main__":
    main()
