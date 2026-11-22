"""Milestone 11ba, post hoc (NOT pre-registered; written after `fresh_tail_results.txt` was read): which side of the
budget's band count k_B does the three-spacing rule's tail sit on, and does a one-sided search close it as cheaply?

Why: on the fresh layouts, 11 of 12 N tail draws at s = 2 (and all 4 at s = 1) have their best band count ABOVE k_B:
the frozen budget (0.027) lands at the foot of the leak cliff (about 1e-6 at 3 bands, a few per cent at 4) and the
cost-optimal plan is 2 or 3 band counts thinner. The cliff rule C(q) adds a band count at or below k_B, the wrong side.
This script counts the side on the old 384 draws as well (same frozen budget) and scores two one-sided searches
against W, on both data sets: U2 = k_B - 1 .. k_B + 2 (200 descents) and U3 = k_B - 1 .. k_B + 3 (250, W's effort).
Both were chosen after the fresh results were seen; the old data are 11ax's, used by every earlier calibration. So
nothing here is a test; it names a candidate for the next pre-registered one.

    python3 fresh_tail_posthoc.py > fresh_tail_posthoc_results.txt
"""
import gzip
import json
import os
import statistics as S
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import budget_cv as cv  # noqa: E402
import fresh_tail as ft  # noqa: E402


def one_sided(x, p, lo, hi):
    k = cv.budget_rule(x["leak"], p)
    return [j for j in range(k - lo, k + hi + 1) if j in x["cost"]]


def main():
    p = ft.frozen_p()
    P = print
    P("# Milestone 11ba post hoc (not pre-registered): side of the tail and one-sided searches; frozen p_N = %.5f" % p)
    for label, fname in (("old (11ax, 48 layouts)", "leak_budget.json.gz"), ("fresh (11ba, 24 layouts)", "fresh_tail.json.gz")):
        with gzip.open(os.path.join(HERE, fname), "rt") as f:
            rows = cv.draws(json.load(f))
        P()
        P("## %s, %d draws" % (label, len(rows)))
        for m in (12, 16):
            for s in cv.SCALES:
                sub = [x for x in rows if x["m"] == m and x["s"] == s]
                up = dn = 0
                for x in sub:
                    if ft.cost(x, ft.spacings(x, p, "N")) > 1.05:
                        kb = cv.budget_rule(x["leak"], p)
                        kbest = min(x["cost"], key=x["cost"].get)
                        up += kbest > kb
                        dn += kbest < kb
                P("  M = %d, s = %s: N tail draws with best above k_B %d, below %d" % (m, s, up, dn))
                for name, f in (("N", lambda x: ft.spacings(x, p, "N")), ("W", lambda x: ft.spacings(x, p, "W")),
                                ("U2", lambda x: one_sided(x, p, 1, 2)), ("U3", lambda x: one_sided(x, p, 1, 3))):
                    sp = [f(x) for x in sub]
                    v = [ft.cost(x, k) for x, k in zip(sub, sp)]
                    P("    %-3s median %.4f  p90 %.4f  max %.4f  effort %.1f descents"
                      % (name, S.median(v), ft.p90(v), max(v), S.fmean(ft.DESC * len(k) for k in sp)))


if __name__ == "__main__":
    main()
