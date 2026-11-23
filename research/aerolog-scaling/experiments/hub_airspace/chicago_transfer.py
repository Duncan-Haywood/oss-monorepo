"""Milestone 11bd: does the leak budget frozen on NYC (p_N = 0.02716) and the six-spacing builder rule S6 transfer
to a second city? 24 layouts drawn on Chicago destinations (Divvy trip ends, chicago_extract.py), everything else
unchanged.

Why: 11bc's "Next" ("a second city's destinations to test whether the leak budget 0.027 transfers"). Every number
since 11a, including the budget (fitted on 11ax's 384 NYC draws) and the S6 window (chosen on three NYC data sets),
comes from one city's destinations. A planner in another city would take p_N and S6 off the shelf; this step asks
whether that is safe. Chicago differs in ways that matter to the model: destinations fill a half disc west of Lake
Michigan instead of a near-full disc, sit farther out (median 3.3 km from the hub against 2.4 km), and come from
bike-share ends spread about stations (chicago_extract.py) rather than ride-hail pickups.

Data: 12 layouts per fleet size, idx 1260..1271 (M = 12) and 1660..1671 (M = 16), generated exactly as 11ba to 11bc
(fresh_tail.build / analyse_all unchanged; random_layouts.draw_layout's hub disc of 7 km, 800 m separation, radii
1.5 to 8 km, 200-destination floor), except that `load_nyc` returns the Chicago points. No derived seed coincides
with any NYC layout's (`check_seeds`), though with other destinations a shared seed would not repeat a layout.

Frozen (nothing is fitted on these draws): p_N = 0.02716 (fresh_tail.frozen_p, 11ax's NYC draws); rules B, N, W, U3,
S6, oracle as 11bc (cost = best random-50 cost ratio to the leak-aware plan over the band counts searched).

Predictions (written and pushed before any Chicago layout was built; only NYC results were known):
 C1 (prior 55%) S6's p90 is <= 1.02 in all four (M, s) cells (NYC pooled 72 layouts: 1.0000 to 1.0128).
 C2 (prior 50%) S6's worst draw over all 192 draws is <= 1.05 (NYC pooled worst 1.0489).
 C3 (prior 65%) W's p90 is <= 1.03 in all four cells (held on four NYC sets).
 C4 (prior 75%) S6's median is <= 1.001 in all four cells.
 C5 (prior 50%) The frozen budget is near the city's own: p_CHI, the budget minimising N's mean cost on these draws
                (budget_cv.calibrate, in sample, so a best case for Chicago), is within a factor of 3 of 0.02716.
 C6 (prior 60%) The frozen budget costs N at most 0.005 in mean cost over p_CHI's in-sample N, pooled over draws.
 C7 (prior 65%) The tail's side replicates: of N's tail draws (cost > 1.05), at least 80% have their best band
                count above k_B (at least 5 needed; fewer, untestable).
 C8 (prior 50%) The frozen-budget B matches the leak-aware band count in at least 40% of draws pooled (NYC first
                fresh set: 23 to 31 of 48 per cell).
Reported without a prediction: per cell B, N, W, U3, S6, oracle; the leak-aware band count's distribution against
NYC's 72 fresh layouts; per tail draw k_B, best, W, S6.
Reading fixed in advance: C1, C3 and C4 held says S6 with NYC's budget is usable in a second city's geometry, and the
paper says "two cities" with these numbers. C1 or C3 refuted says the budget or the window is city-specific; the paper
then says the rule needs a per-city calibration and C5 / C6 say how far off NYC's budget was. C2 alone refuted (a
rare tail draw) is reported as such and does not change the builder rule.

    CHI_DEST=<dir> python3 chicago_extract.py <202404-divvy-tripdata.csv>                    # seconds
    OMP_NUM_THREADS=1 CHI_DEST=<dir> FRESH_CACHE=<dir2> python3 chicago_transfer.py --build    # ~390 CPU s per layout
    OMP_NUM_THREADS=1 CHI_DEST=<dir> FRESH_CACHE=<dir2> python3 chicago_transfer.py > chicago_transfer_results.txt
    python3 chicago_transfer.py --summarise   # from the committed chicago_transfer.json.gz, no Divvy file needed

Limits: as 11ba to 11bc (one Gaussian pair sd in the leak, offsets known exactly, 5-flight offsets, synthetic hub
layouts; the offsets, speeds and radii are the same swept ranges as NYC's, so only the destinations change); one month
of one bike-share system as the demand proxy; the 200 m station spread is a choice, not a measurement; 24 layouts, so
a cell's p90 is about its 5th-worst of 48 draws. Preliminary.
"""
import gzip
import json
import multiprocessing as mp
import os
import statistics as S
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import budget_cv as cv  # noqa: E402
import chicago_extract as ce  # noqa: E402
import fresh_tail as ft  # noqa: E402
import fresh_tail3 as f3  # noqa: E402

CHI = {12: list(range(1260, 1272)), 16: list(range(1660, 1672))}
OUT = os.path.join(HERE, "chicago_transfer.json.gz")
NYC_SETS = ("fresh_tail.json.gz", "fresh_tail2.json.gz", "fresh_tail3.json.gz")


def load_chicago(dmax=10000.0):
    pts = json.load(open(ce.out_path()))["points_m"]
    return [(x, y) for x, y in pts if 0 < x * x + y * y <= dmax * dmax]


def check_seeds():
    prior = set().union(*(f3._seeds(i) for g in (ft.OLD, f3.FIRST, f3.FRESH2, f3.FRESH3) for m in g for i in g[m]))
    new = set().union(*(f3._seeds(i) for m in CHI for i in CHI[m]))
    return prior & new


def patch():
    """Point the layout builder at Chicago. Workers are forked after this, so they inherit the patch."""
    import level_leak_run as llr
    llr.rl.load_nyc = load_chicago
    mp.set_start_method("fork", force=True)
    return llr


def verdicts(rows, p, P=lambda *a: None):
    ok = {f: True for f in ("C1", "C3", "C4")}
    s6max = 0.0
    up = n_tail = agree = 0
    for m in (12, 16):
        for s in cv.SCALES:
            sub = [x for x in rows if x["m"] == m and x["s"] == s]
            P()
            P("## M = %d, s = %s (%d draws)" % (m, s, len(sub)))
            st = f3.table(sub, p, P)
            a = sum(cv.budget_rule(x["leak"], p) == x["k_aware"] for x in sub)
            agree += a
            P("  frozen-budget B agrees with the aware band count in %d of %d draws" % (a, len(sub)))
            tail = [(x, c) for x, c in zip(sub, st["N"]["v"]) if c > 1.05]
            P("  N tail draws (cost > 1.05): %d" % len(tail))
            for x, c in tail:
                kb = cv.budget_rule(x["leak"], p)
                kbest = min(x["cost"], key=x["cost"].get)
                n_tail += 1
                up += kbest > kb
                P("    layout %d: N %.4f, W %.4f, S6 %.4f; k_B %d, best %d (%s); leak %s"
                  % (x["idx"], c, ft.cost(x, f3.spacings(x, p, "W")), ft.cost(x, f3.spacings(x, p, "S6")), kb,
                     kbest, "above" if kbest > kb else ("below" if kbest < kb else "at"),
                     " / ".join("%d:%.2g" % (k, x["leak"][k]) for k in sorted(x["leak"]) if k <= 7)))
            s6max = max(s6max, st["S6"]["max"])
            if st["S6"]["p90"] > 1.02:
                ok["C1"] = False
            if st["W"]["p90"] > 1.03:
                ok["C3"] = False
            if st["S6"]["median"] > 1.001:
                ok["C4"] = False
    ok["C2"] = s6max <= 1.05
    p_chi = cv.calibrate(rows, cv.cost_N)
    m_fro = S.fmean(cv.cost_N(x, p) for x in rows)
    m_chi = S.fmean(cv.cost_N(x, p_chi) for x in rows)
    ok["C5"] = p / 3 <= p_chi <= 3 * p
    ok["C6"] = m_fro - m_chi <= 0.005
    ok["C7"] = (up >= 0.8 * n_tail) if n_tail >= 5 else None
    ok["C8"] = agree >= 0.4 * len(rows)
    P()
    P("  S6 worst draw over all %d draws: %.4f" % (len(rows), s6max))
    P("  p_CHI (in-sample N budget) %.5f against frozen %.5f (ratio %.2f); N mean cost %.4f frozen, %.4f at p_CHI"
      % (p_chi, p, p_chi / p, m_fro, m_chi))
    P("  N tail draws pooled: %d, best band count above k_B in %d" % (n_tail, up))
    P("  frozen-budget B agrees with the aware band count in %d of %d draws" % (agree, len(rows)))
    return ok


def k_dist(rows):
    out = {}
    for x in rows:
        out[x["k_aware"]] = out.get(x["k_aware"], 0) + 1
    return " ".join("%d:%d" % kv for kv in sorted(out.items()))


def summarise(res, P=print, nyc=()):
    p = ft.frozen_p()
    rows = cv.draws(res)
    P("# Milestone 11bd: Chicago transfer test of the NYC budget and S6 (chicago_transfer.py's docstring). %d layouts, "
      "%d draws; frozen budget p_N = %.5f; seed clashes with any NYC layout: %d"
      % (len(res), len(rows), p, len(check_seeds())))
    ok = verdicts(rows, p, P)
    if nyc:
        nr = [x for e in nyc for x in cv.draws(e)]
        P()
        P("# Without a prediction: leak-aware band count k_aware, draws per value (M = 12 | M = 16)")
        for name, rr in (("Chicago", rows), ("NYC 72 fresh", nr)):
            P("  %-13s %s | %s" % (name, k_dist([x for x in rr if x["m"] == 12]), k_dist([x for x in rr if x["m"] == 16])))
        P("  NYC 72 fresh, N mean cost at the frozen budget %.4f, at its own in-sample budget %.4f (p %.5f)"
          % (S.fmean(cv.cost_N(x, p) for x in nr), S.fmean(cv.cost_N(x, cv.calibrate(nr, cv.cost_N)) for x in nr),
             cv.calibrate(nr, cv.cost_N)))
    P()
    P("  CPU per layout (analysis): median %.1f s" % S.median(r["cpu"] for r in res))
    for f in ("C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"):
        v = ok[f]
        P("# %s -> %s" % (f, "untestable (fewer than 5 tail draws)" if v is None else ("held" if v else "refuted")))
    return ok


def _load(path):
    with gzip.open(path, "rt") as f:
        return json.load(f)


if __name__ == "__main__":
    ft.FRESH = CHI
    ft.OUT = OUT
    nyc = [_load(os.path.join(HERE, n)) for n in NYC_SETS]
    if "--summarise" in sys.argv:
        summarise(_load(OUT), nyc=nyc)
        sys.exit(0)
    patch()
    cache = os.environ.get("FRESH_CACHE", os.path.join(HERE, "chicago_cache"))
    if "--build" in sys.argv:
        ft.build(cache)
        sys.exit(0)
    summarise(ft.analyse_all(cache), nyc=nyc)
