"""Milestone 11az, post hoc (NOT pre-registered; written after `tail_rule_results.txt` was read): does adding the
foot of the leak curve's cliff, i.e. the band count a safety-size budget q picks, to 11ay's three-spacing rule N close
the tail that the flatness rule of `tail_rule.py` did not?

Why: in 11az the flatness-triggered extension changed no cost in any cell. N's worst draw (M = 12, s = 2, layout
1220) has leak 1.3e-7 at 3 bands and 0.04 at 4 and 5; the budget (0.027) picks 5, the best plan is 3. The tail sits
below a cliff in the leak curve, which a flatness test refuses to cross by construction, and 7 of 11 tail draws at
M = 12, s = 2 are three band counts away, beyond k_B +/- 2.

Rule C(q): N's spacings (k_B - 1, k_B, k_B + 1 at 11ay's LOLO budget) plus k_q = budget_rule(leak, q), the most
bands with leak <= q, when not already searched (at most 200 descents). q in Q (three values fixed before this script
was run: 1e-4, 3-sigma's Phi(-3), 0.01; all three are reported, none is selected). For reference, C2(q) adds
k_q - 1, k_q, k_q + 1 (up to 300 descents).

Because it was written after the data were seen, this script tests nothing; it names a candidate for a
pre-registered test on fresh draws (new layouts or new seeds), which is the next step.

    python3 tail_rule_posthoc.py > tail_rule_posthoc_results.txt
"""
import gzip
import json
import os
import statistics as S
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import budget_cv as cv  # noqa: E402
import tail_rule as tr  # noqa: E402

Q = (1e-4, cv.P0, 0.01)


def spacings_C(x, p, q, wide=False):
    ks = tr.spacings_N(x, p)
    kq = cv.budget_rule(x["leak"], q)
    add = (kq - 1, kq, kq + 1) if wide else (kq,)
    return ks + [j for j in add if j in x["cost"] and j not in ks]


def main():
    with gzip.open(os.path.join(HERE, "leak_budget.json.gz"), "rt") as f:
        rows = cv.draws(json.load(f))
    # 11ay's LOLO budget for N, one per layout fold (computed once per layout, not per draw)
    folds = {}
    for key in sorted({(x["m"], x["idx"]) for x in rows}):
        folds[key] = cv.calibrate([y for y in rows if (y["m"], y["idx"]) != key], cv.cost_N)
    pr = [folds[(x["m"], x["idx"])] for x in rows]
    P = print
    P("# Milestone 11az post hoc (not pre-registered): N plus the band count of a safety budget q "
      "(tail_rule_posthoc.py's docstring). %d draws" % len(rows))
    for m in (12, 16):
        for s in cv.SCALES:
            ii = [i for i, x in enumerate(rows) if x["m"] == m and x["s"] == s]
            P()
            P("## M = %d, s = %s (%d draws)" % (m, s, len(ii)))
            cand = [("N", lambda x, p: tr.spacings_N(x, p)), ("W", lambda x, p: tr.spacings_W(x, p))]
            for q in Q:
                cand.append(("C(%.3g)" % q, lambda x, p, q=q: spacings_C(x, p, q)))
            for q in Q:
                cand.append(("C2(%.3g)" % q, lambda x, p, q=q: spacings_C(x, p, q, wide=True)))
            for name, f in cand:
                sp = [f(rows[i], pr[i]) for i in ii]
                v = [tr.cost(rows[i], k) for i, k in zip(ii, sp)]
                P("  %-12s median %.4f  p90 %.4f  mean %.4f  max %.4f  effort %.1f descents  (within 1%%: %d of %d)"
                  % (name, S.median(v), tr.p90(v), S.fmean(v), max(v), S.fmean(tr.DESC * len(k) for k in sp),
                     sum(c <= 1.01 for c in v), len(v)))


if __name__ == "__main__":
    main()
