"""Milestone 11bb: a pre-registered test, on a second set of 24 fresh layouts, of 11ba's post hoc one-sided band
searches U3 (k_B - 1 .. k_B + 3, 250 descents, W's effort) and U2 (k_B - 1 .. k_B + 2, 200 descents) against the
symmetric five-spacing search W (k_B - 2 .. k_B + 2, 250 descents), the builder rule since 11az.

Why: 11ba's "Next". On 11ba's fresh layouts and on 11ax's old ones, the three-spacing rule N's tail draws had their
best band count ABOVE the frozen budget's k_B in 41 of 42 cases (the budget lands at the foot of the leak cliff and
the cost-optimal plan is thinner), so a search that spends W's effort on the thin side (U3) lowered the s = 2 p90 from
W's 1.0065 to 1.0267 to 1.0004 to 1.0079. That rule was written after both data sets were read; this step draws
layouts nobody has looked at.

Data: 12 new layouts per fleet size, idx 1236..1247 (M = 12) and 1636..1647 (M = 16), generated exactly as 11ba's
(fresh_tail.build / analyse_all unchanged, only the index lists differ). No derived seed coincides with an old
(11ax) or a first-fresh (11ba) layout's (`check_seeds`).

Frozen (nothing is fitted on these draws): p_N = 0.02716, the budget minimising N's mean cost over 11ax's 384 old
draws (`fresh_tail.frozen_p`), the same budget 11ba used. Rules: N, W, U2, U3, B, oracle (cost = best random-50 cost
ratio to the aware plan over the band counts searched, as 11ba).

Predictions (written and pushed before this script was run on any of these layouts; only 11ax's and 11ba's results
were known, including 11ba's post hoc table in fresh_tail_posthoc_results.txt):
 G1 (prior 75%) U3's p90 is at or below W's in all four (M, s) cells.
 G2 (prior 55%) U3's p90 is <= 1.01 in both s = 2 cells (posthoc: 1.0016, 1.0079 old; 1.0028, 1.0004 fresh).
 G3 (prior 50%) U3's p90 is at least 0.003 below W's in at least one s = 2 cell (a gain, not only a tie).
 G4 (prior 70%) U3's worst draw is at or below W's in both s = 2 cells.
 G5 (prior 55%) U2's p90 is within 0.005 of W's in all four cells (the 200-descent search loses little).
 G6 (prior 80%) The tail's side replicates: of N's tail draws (cost > 1.05) pooled over the four cells, at least 80%
                have their best band count above k_B (there must be at least 5 tail draws for this to count; with
                fewer, G6 is reported as untestable, not held).
 G7 (prior 70%) W's p90 is <= 1.03 in all four cells (11az's T1 and 11ba's F1, a third time).
 G8 (prior 80%) U3's median is <= 1.001 in all four cells.
Reported without a prediction: B, N and the oracle per cell; per tail draw k_B, the best band count, W, U2 and U3;
the pooled 48-layout (11ba + 11bb fresh) table of W, U2 and U3.
Reading fixed in advance: G1 and G2 held says the builder rule becomes U3 (W's effort, all of it searched on the
thin side of the budget), and the paper's section 6.9 says so with these numbers. G1 held and G2 refuted says U3 is
no worse than W and the paper reports both. G1 refuted says 11ba's one-sided gain was a property of the data it was
found on, and W stays. G5 held says U2 is a 20% cheaper option at near-W quality.

    OMP_NUM_THREADS=1 FRESH_CACHE=fresh2 python3 fresh_tail2.py --build        # inputs, ~390 CPU s per layout
    OMP_NUM_THREADS=1 FRESH_CACHE=fresh2 python3 fresh_tail2.py > fresh_tail2_results.txt
    python3 fresh_tail2.py --summarise   # from the committed fresh_tail2.json.gz

Limits: as 11ba (one Gaussian pair sd in the leak, offsets known exactly, 5-flight offsets, synthetic layouts on one
city's destinations, random-50 shares 11aw's seed scheme); 24 layouts, 192 draws, so a cell's p90 is about its
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

FRESH2 = {12: list(range(1236, 1248)), 16: list(range(1636, 1648))}
OUT = os.path.join(HERE, "fresh_tail2.json.gz")
RULES = ("B", "N", "W", "U2", "U3", "oracle")


def _seeds(i):
    return {("layout", 1100 + i), ("sup", i), ("plan", i + 13)} | {("off", 7000 * d + i) for d in range(4)}


def check_seeds():
    """Seeds of the second fresh set that coincide with an old or first-fresh layout's (should be empty)."""
    prior = set().union(*(_seeds(i) for g in (ft.OLD, ft.FRESH) for m in g for i in g[m]))
    new = set().union(*(_seeds(i) for m in FRESH2 for i in FRESH2[m]))
    return prior & new


def spacings(x, p, rule):
    k = cv.budget_rule(x["leak"], p)
    if rule == "U2":
        ks = range(k - 1, k + 3)
    elif rule == "U3":
        ks = range(k - 1, k + 4)
    else:
        return ft.spacings(x, p, rule)
    return [j for j in ks if j in x["cost"]]


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


def summarise(res, P=print, first=None):
    p = ft.frozen_p()
    rows = cv.draws(res)
    P("# Milestone 11bb: second fresh-layout test of U3 and U2 against W (fresh_tail2.py's docstring). %d layouts, "
      "%d draws; frozen budget p_N = %.5f; seed clashes with the old and first-fresh layouts: %d"
      % (len(res), len(rows), p, len(check_seeds())))
    ok = {f: True for f in ("G1", "G2", "G3", "G4", "G5", "G7", "G8")}
    g3_any = False
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
                P("    layout %d: N %.4f, W %.4f, U2 %.4f, U3 %.4f; k_B %d, best %d (%s); leak %s"
                  % (x["idx"], c, ft.cost(x, spacings(x, p, "W")), ft.cost(x, spacings(x, p, "U2")),
                     ft.cost(x, spacings(x, p, "U3")), kb, kbest,
                     "above" if kbest > kb else ("below" if kbest < kb else "at"),
                     " / ".join("%d:%.2g" % (k, x["leak"][k]) for k in sorted(x["leak"]) if k <= 7)))
            W, U2, U3 = st["W"], st["U2"], st["U3"]
            if U3["p90"] > W["p90"] + 1e-12:
                ok["G1"] = False
            if s == "2.0":
                if U3["p90"] > 1.01:
                    ok["G2"] = False
                if U3["p90"] <= W["p90"] - 0.003:
                    g3_any = True
                if U3["max"] > W["max"] + 1e-12:
                    ok["G4"] = False
            if abs(U2["p90"] - W["p90"]) > 0.005:
                ok["G5"] = False
            if W["p90"] > 1.03:
                ok["G7"] = False
            if U3["median"] > 1.001:
                ok["G8"] = False
    ok["G3"] = g3_any
    P()
    P("  N tail draws pooled: %d, best band count above k_B in %d" % (n_tail, up))
    if n_tail >= 5:
        ok["G6"] = up >= 0.8 * n_tail
    if first is not None:
        both = cv.draws(first) + rows
        P()
        P("# Without a prediction: pooled 48 fresh layouts (11ba + 11bb), %d draws" % len(both))
        for m in (12, 16):
            for s in cv.SCALES:
                P("## M = %d, s = %s" % (m, s))
                table([x for x in both if x["m"] == m and x["s"] == s], p, P)
    P()
    P("  CPU per layout (analysis): median %.1f s" % S.median(r["cpu"] for r in res))
    for f in ("G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"):
        P("# %s -> %s" % (f, ("held" if ok[f] else "refuted") if f in ok else "untestable (fewer than 5 tail draws)"))


def _load(path):
    with gzip.open(path, "rt") as f:
        return json.load(f)


if __name__ == "__main__":
    ft.FRESH = FRESH2
    ft.OUT = OUT
    first = _load(os.path.join(HERE, "fresh_tail.json.gz"))
    if "--summarise" in sys.argv:
        summarise(_load(OUT), first=first)
        sys.exit(0)
    cache = os.environ.get("FRESH_CACHE", os.path.join(HERE, "fresh2"))
    if "--build" in sys.argv:
        ft.build(cache)
        sys.exit(0)
    summarise(ft.analyse_all(cache), first=first)
