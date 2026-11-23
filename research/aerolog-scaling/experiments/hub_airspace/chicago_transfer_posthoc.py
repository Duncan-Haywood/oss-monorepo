"""Milestone 11bd, post hoc (written AFTER chicago_transfer_results.txt was read; NOT pre-registered).

The one Chicago draw that broke S6 (layout 1661, 16 operators, twice the offset, cost 1.2932) has a non-monotone
leak curve: 0.18 at 4 bands, 0.029 at 5, 0.024 at 6. The budget rule takes the MOST bands whose leak is within the
budget (budget_cv.budget_rule), so it jumps over the leaky 4 to 6, and the best plan (3 bands) is three below, out
of S6's reach. NYC's layout 1246 (11bb) failed the one-sided search the same way. This script scores a variant
fixed after seeing that draw, the *first-crossing* budget: the most bands k such that EVERY band count up to k has
leak within the budget (stop at the first band count over it), with the same S6 window (k - 2 .. k + 3), on the
Chicago set and on all four NYC sets (old 48 layouts, three fresh sets of 24). Same frozen p_N = 0.02716.

    python3 chicago_transfer_posthoc.py > chicago_transfer_posthoc_results.txt
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

SETS = (("NYC old (11ax)", "leak_budget.json.gz"), ("NYC fresh 1 (11ba)", "fresh_tail.json.gz"),
        ("NYC fresh 2 (11bb)", "fresh_tail2.json.gz"), ("NYC fresh 3 (11bc)", "fresh_tail3.json.gz"),
        ("Chicago (11bd)", "chicago_transfer.json.gz"))


def first_crossing(leak, p):
    """The most bands k with leak <= p at every band count up to k; the fewest bands if the first is over p."""
    ks = sorted(leak)
    best = ks[0]
    for k in ks:
        if leak[k] > p:
            break
        best = k
    return best


def window(x, k, lo=2, hi=3):
    return [j for j in range(k - lo, k + hi + 1) if j in x["cost"]]


def score(rows, p, kfun):
    return [ft.cost(x, window(x, kfun(x["leak"], p))) for x in rows]


def main(P=print):
    p = ft.frozen_p()
    P("# 11bd post hoc (NOT pre-registered): S6 window about the most-bands budget (as tested) and about the "
      "first-crossing budget; frozen p_N = %.5f" % p)
    P("# set                  M   s    | S6 p90   S6 max  | S6-first p90  max    | draws where k differs  | worse  better")
    for name, fn in SETS:
        with gzip.open(os.path.join(HERE, fn), "rt") as f:
            rows = cv.draws(json.load(f))
        for m in (12, 16):
            for s in cv.SCALES:
                sub = [x for x in rows if x["m"] == m and x["s"] == s]
                a = score(sub, p, cv.budget_rule)
                b = score(sub, p, first_crossing)
                diff = sum(cv.budget_rule(x["leak"], p) != first_crossing(x["leak"], p) for x in sub)
                P("  %-19s %2d  %s  | %.4f  %.4f  | %.4f       %.4f  | %3d of %3d             | %3d    %3d"
                  % (name, m, s, ft.p90(a), max(a), ft.p90(b), max(b), diff, len(sub),
                     sum(y > x + 1e-9 for x, y in zip(a, b)), sum(y < x - 1e-9 for x, y in zip(a, b))))
        a = score(rows, p, cv.budget_rule)
        b = score(rows, p, first_crossing)
        P("  %-19s all       | mean %.4f max %.4f | mean %.4f max %.4f" % (name, S.fmean(a), max(a), S.fmean(b), max(b)))


if __name__ == "__main__":
    main()
