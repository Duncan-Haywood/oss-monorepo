"""Milestone 11bc: a pre-registered test, on a third set of 24 fresh layouts, of 11bb's post hoc six-spacing search
S6 (k_B - 2 .. k_B + 3, 300 descents) against the symmetric five-spacing search W (k_B - 2 .. k_B + 2, 250
descents), the builder rule since 11az, and the one-sided U3 (k_B - 1 .. k_B + 3, 250).

Why: 11bb's "Next". On the second fresh set U3 beat W at twice the offset but lost the rare draw whose best band
count is two BELOW the budget's (layout 1246, worst 1.1099); the union S6 was at or below both on all three data sets
read so far (old, first fresh, second fresh), with a worst draw over 768 draws of 1.0489. S6 was chosen after all
three were read; this step draws layouts nobody has looked at, and asks whether 50 more descents than W buy a worst
draw under 1.05.

A note on what can and cannot be tested. S6's band counts contain W's and U3's, and a search's cost is the best
random-50 cost over the band counts it searches (the same random-50 values for every rule), so S6 is at or below W
and U3 on every draw by construction. "S6 is no worse than W" is therefore not a prediction; the predictions below
are about the SIZE of the gain and about the tail, which the construction does not settle.

Data: 12 new layouts per fleet size, idx 1248..1259 (M = 12) and 1648..1659 (M = 16), generated exactly as 11ba's and
11bb's (fresh_tail.build / analyse_all unchanged, only the index lists differ). No derived seed coincides with an old
(11ax), first-fresh (11ba) or second-fresh (11bb) layout's (`check_seeds`).

Frozen (nothing is fitted on these draws): p_N = 0.02716 (`fresh_tail.frozen_p`, 11ax's 384 old draws), as 11ba and
11bb. Rules: B, N, W, U3, S6, oracle (cost = best random-50 cost ratio to the aware plan over the band counts searched).

Predictions (written and pushed before this script was run on any of these layouts; only 11ax's, 11ba's and 11bb's
results were known, including 11bb's post hoc table in fresh_tail2_posthoc_results.txt):
 H1 (prior 60%) S6's worst draw over all 192 draws is <= 1.05 (the question 11bb's "Next" asked).
 H2 (prior 60%) S6's p90 is <= 1.01 in both s = 2 cells (posthoc: 1.0016/1.0079, 1.0015/1.0004, 1.0000/1.0044).
 H3 (prior 50%) S6's p90 is at least 0.003 below W's in at least one s = 2 cell (a gain worth 50 descents).
 H4 (prior 55%) At s = 2, pooled over M, S6 is strictly below W (by more than 1e-9) on at least 4 of 96 draws.
 H5 (prior 75%) W's p90 is <= 1.03 in all four (M, s) cells (11az's T1, 11ba's F1, 11bb's G7, a fourth time).
 H6 (prior 75%) The tail's side replicates: of N's tail draws (cost > 1.05) pooled over the four cells, at least 80%
                have their best band count above k_B (at least 5 tail draws needed; with fewer, untestable).
 H7 (prior 85%) S6's median is <= 1.001 in all four cells.
 H8 (prior 50%) S6's worst draw is strictly below U3's worst draw in at least one s = 2 cell (the below-side draw
                11bb found recurs at least once in 24 layouts).
Reported without a prediction: B, N, U3 and the oracle per cell; per N tail draw k_B, the best band count, W, U3, S6;
S6 against W pooled over all three fresh sets (72 layouts, 576 draws).
Reading fixed in advance: H1 and H2 held says the builder rule becomes S6 (300 descents, 20% more than W) and the
paper's section 6.9 says so with these numbers. H1 refuted says no fixed window closes the rare tail at 300 descents;
W stays the builder rule and S6 is reported as the option that trims the p90 for 50 more descents if H2 or H3 held.
H8 held says the one-sided U3 is not safe on its own; H8 refuted adds no evidence either way (the draw is rare).

    OMP_NUM_THREADS=1 FRESH_CACHE=fresh3 python3 fresh_tail3.py --build        # inputs, ~390 CPU s per layout
    OMP_NUM_THREADS=1 FRESH_CACHE=fresh3 python3 fresh_tail3.py > fresh_tail3_results.txt
    python3 fresh_tail3.py --summarise   # from the committed fresh_tail3.json.gz

Limits: as 11ba and 11bb (one Gaussian pair sd in the leak, offsets known exactly, 5-flight offsets, synthetic layouts
on one city's destinations, random-50 shares 11aw's seed scheme); 24 layouts, 192 draws, so a cell's p90 is about its
5th-worst of 48 draws. Preliminary.
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

FRESH3 = {12: list(range(1248, 1260)), 16: list(range(1648, 1660))}
FRESH2 = {12: list(range(1236, 1248)), 16: list(range(1636, 1648))}
FIRST = {m: list(v) for m, v in ft.FRESH.items()}   # 11ba's set, copied before __main__ points ft.FRESH here
OUT = os.path.join(HERE, "fresh_tail3.json.gz")
RULES = ("B", "N", "W", "U3", "S6", "oracle")
WINDOWS = {"U3": (1, 3), "S6": (2, 3)}


def _seeds(i):
    return {("layout", 1100 + i), ("sup", i), ("plan", i + 13)} | {("off", 7000 * d + i) for d in range(4)}


def check_seeds():
    """Seeds of the third fresh set that coincide with an old, first- or second-fresh layout's (should be empty)."""
    prior = set().union(*(_seeds(i) for g in (ft.OLD, FIRST, FRESH2) for m in g for i in g[m]))
    new = set().union(*(_seeds(i) for m in FRESH3 for i in FRESH3[m]))
    return prior & new


def spacings(x, p, rule):
    if rule in WINDOWS:
        lo, hi = WINDOWS[rule]
        k = cv.budget_rule(x["leak"], p)
        return [j for j in range(k - lo, k + hi + 1) if j in x["cost"]]
    return ft.spacings(x, p, rule)


def table(rows, p, P):
    st = {}
    for name in RULES:
        sp = [spacings(x, p, name) for x in rows]
        v = [ft.cost(x, k) for x, k in zip(rows, sp)]
        eff = S.fmean(ft.DESC * len(k) for k in sp)
        st[name] = dict(median=S.median(v), p90=ft.p90(v), mean=S.fmean(v), max=max(v), eff=eff, v=v)
        P("  %-6s median %.4f  p90 %.4f  mean %.4f  max %.4f  effort %.1f descents  (within 1%%: %d of %d)"
          % (name, st[name]["median"], st[name]["p90"], st[name]["mean"], st[name]["max"], eff,
             sum(c <= 1.01 for c in v), len(v)))
    return st


def verdicts(rows, p, P=lambda *a: None):
    """Score H1..H8 on `rows` (draws from cv.draws); returns {name: True/False/None}."""
    ok = {f: True for f in ("H1", "H2", "H5", "H7")}
    h3 = h8 = False
    strict = 0
    up = n_tail = 0
    for m in (12, 16):
        for s in cv.SCALES:
            sub = [x for x in rows if x["m"] == m and x["s"] == s]
            P()
            P("## M = %d, s = %s (%d draws)" % (m, s, len(sub)))
            st = table(sub, p, P)
            tail = [(x, c) for x, c in zip(sub, st["N"]["v"]) if c > 1.05]
            P("  N tail draws (cost > 1.05): %d" % len(tail))
            for x, c in tail:
                kb = cv.budget_rule(x["leak"], p)
                kbest = min(x["cost"], key=x["cost"].get)
                n_tail += 1
                up += kbest > kb
                P("    layout %d: N %.4f, W %.4f, U3 %.4f, S6 %.4f; k_B %d, best %d (%s); leak %s"
                  % (x["idx"], c, ft.cost(x, spacings(x, p, "W")), ft.cost(x, spacings(x, p, "U3")),
                     ft.cost(x, spacings(x, p, "S6")), kb, kbest,
                     "above" if kbest > kb else ("below" if kbest < kb else "at"),
                     " / ".join("%d:%.2g" % (k, x["leak"][k]) for k in sorted(x["leak"]) if k <= 7)))
            W, U3, S6 = st["W"], st["U3"], st["S6"]
            if S6["max"] > 1.05:
                ok["H1"] = False
            if W["p90"] > 1.03:
                ok["H5"] = False
            if S6["median"] > 1.001:
                ok["H7"] = False
            if s == "2.0":
                if S6["p90"] > 1.01:
                    ok["H2"] = False
                if S6["p90"] <= W["p90"] - 0.003:
                    h3 = True
                if S6["max"] < U3["max"] - 1e-9:
                    h8 = True
                strict += sum(a < b - 1e-9 for a, b in zip(S6["v"], W["v"]))
    ok["H3"] = h3
    ok["H4"] = strict >= 4
    ok["H8"] = h8
    ok["H6"] = (up >= 0.8 * n_tail) if n_tail >= 5 else None
    P()
    P("  N tail draws pooled: %d, best band count above k_B in %d" % (n_tail, up))
    P("  s = 2 draws where S6 is strictly below W: %d of %d"
      % (strict, sum(x["s"] == "2.0" for x in rows)))
    return ok


def summarise(res, P=print, earlier=()):
    p = ft.frozen_p()
    rows = cv.draws(res)
    P("# Milestone 11bc: third fresh-layout test of S6 against W and U3 (fresh_tail3.py's docstring). %d layouts, "
      "%d draws; frozen budget p_N = %.5f; seed clashes with the old, first- and second-fresh layouts: %d"
      % (len(res), len(rows), p, len(check_seeds())))
    ok = verdicts(rows, p, P)
    if earlier:
        allr = [x for e in earlier for x in cv.draws(e)] + rows
        P()
        P("# Without a prediction: pooled 72 fresh layouts (11ba + 11bb + 11bc), %d draws" % len(allr))
        for m in (12, 16):
            for s in cv.SCALES:
                P("## M = %d, s = %s" % (m, s))
                table([x for x in allr if x["m"] == m and x["s"] == s], p, P)
    P()
    P("  CPU per layout (analysis): median %.1f s" % S.median(r["cpu"] for r in res))
    for f in ("H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"):
        v = ok[f]
        P("# %s -> %s" % (f, "untestable (fewer than 5 tail draws)" if v is None else ("held" if v else "refuted")))
    return ok


def _load(path):
    with gzip.open(path, "rt") as f:
        return json.load(f)


if __name__ == "__main__":
    ft.FRESH = FRESH3
    ft.OUT = OUT
    earlier = [_load(os.path.join(HERE, n)) for n in ("fresh_tail.json.gz", "fresh_tail2.json.gz")]
    if "--summarise" in sys.argv:
        summarise(_load(OUT), earlier=earlier)
        sys.exit(0)
    cache = os.environ.get("FRESH_CACHE", os.path.join(HERE, "fresh3"))
    if "--build" in sys.argv:
        ft.build(cache)
        sys.exit(0)
    summarise(ft.analyse_all(cache), earlier=earlier)
