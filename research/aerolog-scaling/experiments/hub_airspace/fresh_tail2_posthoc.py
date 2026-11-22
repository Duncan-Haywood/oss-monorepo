"""Milestone 11bb, post hoc (NOT pre-registered; written after `fresh_tail2_results.txt` was read): on the second
fresh set U3 lost two draws whose best band count is two BELOW the budget's (G1, G4 refuted), which W reaches; does
the union of W and U3, k_B - 2 .. k_B + 3 (S6, 300 descents), take both gains, on all three data sets?
Nothing here is a test; it names a candidate for the next pre-registered one.

    python3 fresh_tail2_posthoc.py > fresh_tail2_posthoc_results.txt
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


def window(x, p, lo, hi):
    k = cv.budget_rule(x["leak"], p)
    return [j for j in range(k - lo, k + hi + 1) if j in x["cost"]]


RULES = (("W", 2, 2), ("U3", 1, 3), ("S6", 2, 3))


def main():
    p = ft.frozen_p()
    P = print
    P("# Milestone 11bb post hoc (not pre-registered): W, U3 and their union S6; frozen p_N = %.5f" % p)
    for label, fname in (("old (11ax, 48 layouts)", "leak_budget.json.gz"),
                         ("first fresh (11ba, 24 layouts)", "fresh_tail.json.gz"),
                         ("second fresh (11bb, 24 layouts)", "fresh_tail2.json.gz")):
        with gzip.open(os.path.join(HERE, fname), "rt") as f:
            rows = cv.draws(json.load(f))
        P()
        P("## %s, %d draws" % (label, len(rows)))
        for m in (12, 16):
            for s in cv.SCALES:
                sub = [x for x in rows if x["m"] == m and x["s"] == s]
                P("  M = %d, s = %s" % (m, s))
                for name, lo, hi in RULES:
                    sp = [window(x, p, lo, hi) for x in sub]
                    v = [ft.cost(x, k) for x, k in zip(sub, sp)]
                    P("    %-3s median %.4f  p90 %.4f  max %.4f  effort %.1f descents"
                      % (name, S.median(v), ft.p90(v), max(v), S.fmean(ft.DESC * len(k) for k in sp)))


if __name__ == "__main__":
    main()
