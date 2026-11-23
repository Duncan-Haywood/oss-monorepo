"""Milestone 11be: a pre-registered test, on fresh layouts in BOTH cities, of 11bd's post hoc first-crossing budget
against the most-bands budget that the builder rule S6 has used since 11bc.

Why: 11bd's "Next". The budget rule takes the MOST bands whose mean adjacent leak is within the frozen budget p_N
(budget_cv.budget_rule). When the leak curve is not monotone in the band count (11bb's layout 1246, 11bd's layout
1661), that jumps past a leaky band count, and the best plan can fall below S6's window (k_B - 2 .. k_B + 3); 11bd's
worst Chicago draw cost 1.2932 that way. 11bd's post hoc table (chicago_transfer_posthoc_results.txt) scored a
*first-crossing* budget k_F, the most bands k such that EVERY band count up to k is within budget, with the same
window: same cost on 1 151 of 1 152 draws over five data sets, never worse, and 1.2932 -> 1.0000 on the one draw.
It was chosen after that draw was seen. This step draws layouts nobody has looked at, in both cities, and asks how
often the two budgets differ and what the difference costs.

What the construction settles and what it does not. k_F <= k_B always (the first-crossing set is a prefix of the
within-budget set), and k_F = k_B whenever the leak curve is monotone up to k_B, so the rules can only differ on
non-monotone draws. Where k_F < k_B, F6's window (k_F - 2 .. k_F + 3) loses band counts at the top of S6's, which is
where the tail usually is (11ba to 11bd: the best band count is above k_B on 10 of 11 to 15 of 16 tail draws). So
F6 CAN be worse than S6 on a draw; "F6 is never worse" is a real prediction. The union FU (k_F - 2 .. k_B + 3) is at
or below S6 on every draw by construction and costs extra descents only where k_F < k_B; its predictions are about
the tail and the effort only.

Data: 24 new NYC layouts (idx 1272..1283 at M = 12, 1672..1683 at M = 16; NYC 2014 ride-hail pickups) and 24 new
Chicago layouts (idx 1284..1295 and 1684..1695; Divvy April 2024 trip ends through chicago_extract.py, as 11bd),
generated exactly as 11ba to 11bd (fresh_tail.build / analyse_all unchanged); 384 draws (48 layouts x 2 offset
scales x 4 offset draws). No derived seed coincides with any earlier layout's or between the two new sets
(`check_seeds`).

Frozen (nothing is fitted on these draws): p_N = 0.02716 (fresh_tail.frozen_p, 11ax's 384 NYC draws).
Rules: S6 (k_B - 2 .. k_B + 3, 300 descents, the builder rule since 11bc), F6 (k_F - 2 .. k_F + 3, 300 descents),
FU (k_F - 2 .. k_B + 3), oracle (all band counts, 600 descents); cost = best random-50 cost over the band counts
searched, as a ratio to the leak-aware plan.

Predictions (written and pushed before any of these 48 layouts was built; only 11ax to 11bd's results were known,
including 11bd's post hoc table):
 D1 (prior 65%) F6 is at or below S6 (within 1e-9) on every one of the 384 draws.
 D2 (prior 55%) F6's worst draw over all 384 draws is <= 1.05.
 D3 (prior 70%) F6's p90 is <= 1.02 in all eight (city, M, s) cells.
 D4 (prior 70%) k_F differs from k_B on at most 5% of the 384 draws (post hoc: 20 of 1 152, 1.7%).
 D5 (prior 40%) k_F differs from k_B on at least 2 of 192 draws in EACH city (the case is not a one-city artefact).
 D6 (prior 35%) F6 is strictly below S6 (by more than 1e-9) on at least one draw (the 11bd break recurs).
 D7 (prior 70%) S6's p90 is <= 1.02 in all eight cells (11bc's H2 / 11bd's C1 on a fifth and sixth set).
 D8 (prior 60%) FU's worst draw over all 384 draws is <= 1.05.
Reported without a prediction: per cell S6, F6, FU and oracle (median, p90, mean, max, effort); the number of draws
whose leak curve is non-monotone anywhere up to k_B, per city; every draw where k_F != k_B with its leak curve and
the three costs; the same comparison pooled with 11bd's post hoc data sets.
Reading fixed in advance: D1 and D2 held says the builder rule becomes F6 (same 300 descents, the budget read as a
first crossing) and the paper's section 6.9 says so. D1 refuted with D8 held says FU becomes the builder rule (the
union costs extra descents only on non-monotone draws). D1 and D8 both refuted says no budget reading fixes the
non-monotone tail at about 300 descents; S6 stays and the paper reports the rate. D6 refuted (no break in 384
draws) says the fix matters on fewer than about 1 in 100 draws and is reported as insurance, not as a gain.

    CHI_DEST=<dir> python3 chicago_extract.py <202404-divvy-tripdata.csv>                       # Chicago points
    OMP_NUM_THREADS=1 FRESH_CACHE=<dir> python3 first_crossing.py --city nyc --build             # ~390 CPU s/layout
    OMP_NUM_THREADS=1 CHI_DEST=<d> FRESH_CACHE=<dir2> python3 first_crossing.py --city chi --build
    OMP_NUM_THREADS=1 FRESH_CACHE=<dir> python3 first_crossing.py --city nyc --analyse            # writes the json
    OMP_NUM_THREADS=1 CHI_DEST=<d> FRESH_CACHE=<dir2> python3 first_crossing.py --city chi --analyse
    python3 first_crossing.py --summarise > first_crossing_results.txt   # from the two committed json.gz files

Limits: as 11ba to 11bd (one Gaussian pair sd in the leak, offsets known exactly, 5-flight offsets, synthetic hub
layouts, one month of one bike-share system for Chicago, the 200 m station spread a choice); 24 layouts per city,
so a cell's p90 is about its 5th-worst of 48 draws, and a rule that differs on 2% of draws differs on about 8 of
384. Preliminary.
"""
import gzip
import json
import os
import statistics as S
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import budget_cv as cv  # noqa: E402
import chicago_transfer as ct  # noqa: E402
import fresh_tail as ft  # noqa: E402
import fresh_tail3 as f3  # noqa: E402

SETS = {"nyc": {12: list(range(1272, 1284)), 16: list(range(1672, 1684))},
        "chi": {12: list(range(1284, 1296)), 16: list(range(1684, 1696))}}
OUTS = {c: os.path.join(HERE, "first_crossing_%s.json.gz" % c) for c in SETS}
NAMES = {"nyc": "NYC", "chi": "Chicago"}
RULES = ("S6", "F6", "FU", "oracle")
EARLIER = (("NYC old (11ax)", "leak_budget.json.gz"), ("NYC fresh 1 (11ba)", "fresh_tail.json.gz"),
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


def non_monotone(leak, upto):
    """True if the leak falls somewhere from one band count to the next, up to `upto` bands."""
    ks = [k for k in sorted(leak) if k <= upto]
    return any(leak[b] < leak[a] for a, b in zip(ks, ks[1:]))


def spacings(x, p, rule):
    kb = cv.budget_rule(x["leak"], p)
    kf = first_crossing(x["leak"], p)
    if rule == "S6":
        ks = range(kb - 2, kb + 4)
    elif rule == "F6":
        ks = range(kf - 2, kf + 4)
    elif rule == "FU":
        ks = range(kf - 2, kb + 4)
    else:
        ks = x["cost"]
    return sorted(j for j in set(ks) if j in x["cost"])


def check_seeds():
    """Seeds of the two new sets that coincide with any earlier layout's or with each other's (should be empty)."""
    prior = set().union(*(f3._seeds(i) for g in (ft.OLD, f3.FIRST, f3.FRESH2, f3.FRESH3, ct.CHI)
                          for m in g for i in g[m]))
    a, b = (set().union(*(f3._seeds(i) for m in SETS[c] for i in SETS[c][m])) for c in ("nyc", "chi"))
    return (prior & (a | b)) | (a & b)


def table(rows, p, P):
    st = {}
    for name in RULES:
        sp = [spacings(x, p, name) for x in rows]
        v = [ft.cost(x, k) for x, k in zip(rows, sp)]
        st[name] = dict(median=S.median(v), p90=ft.p90(v), mean=S.fmean(v), max=max(v),
                        eff=S.fmean(ft.DESC * len(k) for k in sp), v=v)
        P("  %-6s median %.4f  p90 %.4f  mean %.4f  max %.4f  effort %.1f descents  (within 1%%: %d of %d)"
          % (name, st[name]["median"], st[name]["p90"], st[name]["mean"], st[name]["max"], st[name]["eff"],
             sum(c <= 1.01 for c in v), len(v)))
    return st


def leak_str(x):
    return " / ".join("%d:%.2g" % (k, x["leak"][k]) for k in sorted(x["leak"]) if k <= 8)


def verdicts(by_city, p, P=lambda *a: None):
    """Score D1..D8; by_city maps 'nyc' / 'chi' to draw lists (cv.draws). Returns {name: bool}."""
    ok = {"D3": True, "D7": True}
    worse = better = 0
    f6max = fumax = 0.0
    diff = {}
    n_all = 0
    for c in ("nyc", "chi"):
        rows = by_city[c]
        n_all += len(rows)
        diff[c] = 0
        for m in (12, 16):
            for s in cv.SCALES:
                sub = [x for x in rows if x["m"] == m and x["s"] == s]
                P()
                P("## %s, M = %d, s = %s (%d draws)" % (NAMES[c], m, s, len(sub)))
                st = table(sub, p, P)
                for a, b in zip(st["S6"]["v"], st["F6"]["v"]):
                    worse += b > a + 1e-9
                    better += b < a - 1e-9
                f6max = max(f6max, st["F6"]["max"])
                fumax = max(fumax, st["FU"]["max"])
                if st["F6"]["p90"] > 1.02:
                    ok["D3"] = False
                if st["S6"]["p90"] > 1.02:
                    ok["D7"] = False
                nm = sum(non_monotone(x["leak"], cv.budget_rule(x["leak"], p)) for x in sub)
                d = [x for x in sub if cv.budget_rule(x["leak"], p) != first_crossing(x["leak"], p)]
                diff[c] += len(d)
                P("  leak non-monotone up to k_B: %d of %d draws; k_F != k_B: %d" % (nm, len(sub), len(d)))
                for x in d:
                    P("    layout %d: k_B %d, k_F %d, best %d; S6 %.4f, F6 %.4f, FU %.4f; leak %s"
                      % (x["idx"], cv.budget_rule(x["leak"], p), first_crossing(x["leak"], p),
                         min(x["cost"], key=x["cost"].get), ft.cost(x, spacings(x, p, "S6")),
                         ft.cost(x, spacings(x, p, "F6")), ft.cost(x, spacings(x, p, "FU")), leak_str(x)))
    ok["D1"] = worse == 0
    ok["D2"] = f6max <= 1.05
    ok["D4"] = diff["nyc"] + diff["chi"] <= 0.05 * n_all
    ok["D5"] = diff["nyc"] >= 2 and diff["chi"] >= 2
    ok["D6"] = better >= 1
    ok["D8"] = fumax <= 1.05
    P()
    P("  pooled: F6 worse than S6 on %d draws, better on %d, of %d; F6 worst %.4f, FU worst %.4f"
      % (worse, better, n_all, f6max, fumax))
    P("  k_F != k_B: NYC %d of %d, Chicago %d of %d"
      % (diff["nyc"], len(by_city["nyc"]), diff["chi"], len(by_city["chi"])))
    return ok


def pooled(p, P, by_city):
    """Without a prediction: S6 against F6 and FU over every data set scored so far (11ax to 11be)."""
    P()
    P("# Without a prediction: all data sets (11ax to 11be), S6 / F6 / FU, pooled over M and s")
    P("# set                  draws | k differs | S6 max  F6 max  FU max | F6 worse  better | FU mean effort")
    sets = [(n, cv.draws(_load(os.path.join(HERE, f)))) for n, f in EARLIER]
    sets += [("%s (11be)" % NAMES[c], by_city[c]) for c in ("nyc", "chi")]
    tot = [0, 0, 0, 0]
    for name, rows in sets:
        v = {r: [ft.cost(x, spacings(x, p, r)) for x in rows] for r in ("S6", "F6", "FU")}
        d = sum(cv.budget_rule(x["leak"], p) != first_crossing(x["leak"], p) for x in rows)
        w = sum(b > a + 1e-9 for a, b in zip(v["S6"], v["F6"]))
        bt = sum(b < a - 1e-9 for a, b in zip(v["S6"], v["F6"]))
        eff = S.fmean(ft.DESC * len(spacings(x, p, "FU")) for x in rows)
        tot = [tot[0] + len(rows), tot[1] + d, tot[2] + w, tot[3] + bt]
        P("  %-19s %5d | %4d      | %.4f  %.4f  %.4f | %3d      %3d   | %.1f"
          % (name, len(rows), d, max(v["S6"]), max(v["F6"]), max(v["FU"]), w, bt, eff))
    P("  all                 %5d | %4d      | F6 worse on %d, better on %d" % tuple(tot))


def summarise(by_res, P=print):
    p = ft.frozen_p()
    by_city = {c: cv.draws(by_res[c]) for c in by_res}
    P("# Milestone 11be: first-crossing against most-bands budget on fresh layouts in two cities (first_crossing.py's "
      "docstring). %d + %d layouts, %d + %d draws; frozen budget p_N = %.5f; seed clashes: %d"
      % (len(by_res["nyc"]), len(by_res["chi"]), len(by_city["nyc"]), len(by_city["chi"]), p, len(check_seeds())))
    ok = verdicts(by_city, p, P)
    pooled(p, P, by_city)
    P()
    P("  CPU per layout (analysis): median %.1f s" % S.median(r["cpu"] for c in by_res for r in by_res[c]))
    for f in sorted(ok):
        P("# %s -> %s" % (f, "held" if ok[f] else "refuted"))
    return ok


def _load(path):
    with gzip.open(path, "rt") as f:
        return json.load(f)


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        summarise({c: _load(OUTS[c]) for c in SETS})
        sys.exit(0)
    city = sys.argv[sys.argv.index("--city") + 1]
    ft.FRESH = SETS[city]
    ft.OUT = OUTS[city]
    if city == "chi":
        ct.patch()
    cache = os.environ.get("FRESH_CACHE", os.path.join(HERE, "first_crossing_" + city))
    if "--build" in sys.argv:
        ft.build(cache)
    elif "--analyse" in sys.argv:
        ft.analyse_all(cache)
