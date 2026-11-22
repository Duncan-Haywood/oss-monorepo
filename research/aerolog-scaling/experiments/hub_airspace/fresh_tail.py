"""Milestone 11ba: a pre-registered test, on 24 fresh layouts, of 11az's two answers to the leak budget's
large-offset tail: the five-spacing search W (k_B - 2 .. k_B + 2, 250 descents) and the post hoc cliff rule C(q)
(11ay's three spacings k_B - 1, k_B, k_B + 1 plus the band count k_q a safety-size budget q picks).

Why: 11az's "Next". W closed the tail on 11ax's 384 draws (p90 1.008 to 1.027), and C(q) lowered the worst cell's
p90 (M = 12, s = 2) from 1.0678 to 1.0404 at about 156 descents, but C was written after the data were seen and
every rule in 11ay to 11az was calibrated on those same 48 layouts. This step draws layouts nobody has looked at.

Data: 12 new layouts per fleet size, idx 1224..1235 (M = 12) and 1624..1635 (M = 16). Everything is generated the
way 11ai to 11ax generated the old 48 (layouts 1200..1223, 1600..1623): `random_layouts.draw_layout(pts, idx, m)`
(seed 1100 + idx), `level_leak_run.build_layout` for the inputs, and `leak_budget.analyse` unchanged for the offset
draws (4 per scale, seed 7000 d + idx), the aware plan, the sorted plan's adjacent leaks and 11aw's random-50 at every
band count. No seed of the new layouts coincides with one of the old (checked in `check_seeds`).

Frozen from the old data (nothing is fitted on the fresh draws):
  * p_N = the budget minimising N's mean cost over all 384 old draws (`budget_cv.calibrate`, P_DENSE) = 0.02716.
  * q in Q = (1e-4, Phi(-3), 0.01), as in `tail_rule_posthoc.py`; all three are reported, Phi(-3) is the headline.
Rules on each fresh draw (cost = best random-50 cost ratio to the aware F over the searched band counts):
  N (k_B - 1 .. k_B + 1), W (k_B - 2 .. k_B + 2), C(q) (N plus k_q), B (k_B alone), oracle (all band counts).

Predictions (written and pushed before this script was run on any fresh layout; only the old 384 draws' results,
in leak_budget_results.txt, tail_rule_results.txt and tail_rule_posthoc_results.txt, were known):
 F1 (prior 70%) W has p90 <= 1.03 in all four (M, s) cells (11az's T1 on fresh layouts).
 F2 (prior 80%) W has median <= 1.001 in all four cells.
 F3 (prior 60%) The tail replicates: N's p90 exceeds 1.05 in at least one s = 2 cell.
 F4 (prior 25%) C(Phi(-3))'s p90 at M = 12, s = 2 is at least 0.01 below N's.
 F5 (prior 35%) C(Phi(-3))'s p90 is <= 1.05 in all four cells.
 F6 (prior 85%) C(Phi(-3))'s mean effort is <= 165 descents in every cell.
 F7 (prior 75%) Every N tail draw (cost > 1.05) has its best band count 2 or more away from k_B.
 F8 (prior 65%) W's p90 is at or below C(Phi(-3))'s in all four cells (the plain wide search is at least as good).
Disclosed before these were committed: `summarise` was dry-run on the OLD 384 draws (with the frozen p_N, not
11ay's per-fold budgets) to test the code. There N's p90 at M = 12, s = 2 is 1.0404, not 11ay's LOLO 1.0678, and
C(q)'s p90 equals N's in all four cells at all three q: 11az's post hoc gain of C came with the per-fold budgets and
is absent under one frozen budget. F4 and F5's priors were lowered (from 50% and 45%) after seeing that; W's p90s
there were 1.0081, 1.0112, 1.0124, 1.0267 and every N tail draw was 2 or more band counts from k_B.
Reported without a prediction: B and the oracle per cell; C at the other two q; per tail draw, k_B, k_q, the best
band count and the leak curve; the frozen-budget B's agreement with the aware band count.
Reading fixed in advance: F1 held and F5 refuted says the builder rule is W, as 11az read it. F4 and F5 held says
C(Phi(-3)) is a cheaper alternative (about 155 against 250 descents) worth a sentence in the paper. F3 refuted says
the s = 2 tail of 11ay was in part a property of those 48 layouts, and the fresh p90s are reported as such.

    OMP_NUM_THREADS=1 FRESH_CACHE=fresh python3 fresh_tail.py --build      # inputs, ~390 CPU s per layout
    OMP_NUM_THREADS=1 FRESH_CACHE=fresh python3 fresh_tail.py > fresh_tail_results.txt
    python3 fresh_tail.py --summarise   # from the committed fresh_tail.json.gz

Limits: as 11ax to 11az (one Gaussian pair sd in the leak, offsets known exactly, 5-flight offsets, synthetic
layouts on one city's destinations, random-50 shares 11aw's seed scheme); 24 layouts, 192 draws, so a cell's p90 is
about its 10th-worst of 48 draws. Preliminary.
"""
import gzip
import json
import multiprocessing as mp
import os
import pickle
import statistics as S
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import budget_cv as cv  # noqa: E402

FRESH = {12: list(range(1224, 1236)), 16: list(range(1624, 1636))}
OLD = {12: list(range(1200, 1224)), 16: list(range(1600, 1624))}
Q = (1e-4, cv.P0, 0.01)
DESC = 50
OUT = os.path.join(HERE, "fresh_tail.json.gz")


def check_seeds():
    """The seeds the pipeline derives from idx (layout 1100 + idx, supports idx, plan idx + 13, offsets
    7000 d + idx) never coincide between a fresh and an old layout."""
    def seeds(i):
        return {("layout", 1100 + i), ("sup", i), ("plan", i + 13)} | {("off", 7000 * d + i) for d in range(4)}
    old = set().union(*(seeds(i) for m in OLD for i in OLD[m]))
    new = set().union(*(seeds(i) for m in FRESH for i in FRESH[m]))
    return old & new


def frozen_p():
    with gzip.open(os.path.join(HERE, "leak_budget.json.gz"), "rt") as f:
        return cv.calibrate(cv.draws(json.load(f)), cv.cost_N)


def spacings(x, p, rule, q=None):
    k = cv.budget_rule(x["leak"], p)
    if rule == "B":
        ks = [k]
    elif rule == "N":
        ks = [k - 1, k, k + 1]
    elif rule == "W":
        ks = list(range(k - 2, k + 3))
    elif rule == "C":
        kq = cv.budget_rule(x["leak"], q)
        ks = [k - 1, k, k + 1, kq]
    else:
        ks = list(x["cost"])
    return sorted({j for j in ks if j in x["cost"]})


def cost(x, ks):
    return min(x["cost"][j] for j in ks)


def p90(v):
    return float(np.percentile(v, 90))


def _cache_path(cache, key):
    return os.path.join(cache, "%s_%d_%d.pkl" % key)


def _build(job):
    import level_leak_run as llr
    return llr.build_layout(job)


def _analyse(L):
    import leak_budget as lb
    return lb.analyse((L, None))


def build(cache):
    os.makedirs(cache, exist_ok=True)
    todo = [(m, i) for m in (16, 12) for i in FRESH[m] if not os.path.exists(_cache_path(cache, ("in", m, i)))]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        for L in pool_.imap_unordered(_build, todo):
            with open(_cache_path(cache, ("in", L["m"], L["idx"])), "wb") as f:
                pickle.dump(L, f)


def analyse_all(cache):
    keys = [(m, i) for m in (12, 16) for i in FRESH[m]]
    todo = [k for k in keys if not os.path.exists(_cache_path(cache, ("res",) + k))]
    ins = []
    for k in todo:
        with open(_cache_path(cache, ("in",) + k), "rb") as f:
            ins.append(pickle.load(f))
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        for r in pool_.imap_unordered(_analyse, ins):
            with open(_cache_path(cache, ("res", r["m"], r["idx"])), "wb") as f:
                pickle.dump(r, f)
    res = []
    for k in keys:
        with open(_cache_path(cache, ("res",) + k), "rb") as f:
            res.append(pickle.load(f))
    with gzip.open(OUT, "wt") as f:
        json.dump(res, f, separators=(",", ":"))
    return res


def summarise(res, P=print):
    p = frozen_p()
    rows = cv.draws(res)
    clash = check_seeds()
    P("# Milestone 11ba: fresh-layout test of W and C(q) (fresh_tail.py's docstring). %d fresh layouts, %d draws; "
      "frozen budget p_N = %.5f (all 384 old draws); seed clashes with the old layouts: %d"
      % (len(res), len(rows), p, len(clash)))
    ok = {f: True for f in ("F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8")}
    n_tail_s2 = 0
    for m in (12, 16):
        for s in cv.SCALES:
            sub = [x for x in rows if x["m"] == m and x["s"] == s]
            P()
            P("## M = %d, s = %s (%d draws)" % (m, s, len(sub)))
            st = {}
            cand = [("B", "B", None), ("N", "N", None), ("W", "W", None)] + \
                   [("C(%.3g)" % q, "C", q) for q in Q] + [("oracle", "oracle", None)]
            for name, rule, q in cand:
                sp = [spacings(x, p, rule, q) for x in sub]
                v = [cost(x, k) for x, k in zip(sub, sp)]
                eff = S.fmean(DESC * len(k) for k in sp)
                st[name] = (S.median(v), p90(v), S.fmean(v), max(v), eff, v)
                P("  %-10s median %.4f  p90 %.4f  mean %.4f  max %.4f  effort %.1f descents  (within 1%%: %d of %d)"
                  % (name, st[name][0], st[name][1], st[name][2], st[name][3], eff, sum(c <= 1.01 for c in v),
                     len(v)))
            agree = sum(cv.budget_rule(x["leak"], p) == x["k_aware"] for x in sub)
            P("  frozen-budget B agrees with the aware band count in %d of %d draws" % (agree, len(sub)))
            hc = "C(%.3g)" % cv.P0
            tail = [(x, c) for x, c in zip(sub, st["N"][5]) if c > 1.05]
            P("  N tail draws (cost > 1.05): %d" % len(tail))
            for x, c in tail:
                kb = cv.budget_rule(x["leak"], p)
                kq = cv.budget_rule(x["leak"], cv.P0)
                kbest = min(x["cost"], key=lambda j: x["cost"][j])
                P("    layout %d: N %.4f, W %.4f, C %.4f; k_B %d, k_q %d, best %d (|best - k_B| = %d); leak %s"
                  % (x["idx"], c, cost(x, spacings(x, p, "W")), cost(x, spacings(x, p, "C", cv.P0)), kb, kq, kbest,
                     abs(kbest - kb), " / ".join("%d:%.2g" % (k, x["leak"][k]) for k in sorted(x["leak"]) if k <= 7)))
                if abs(kbest - kb) < 2:
                    ok["F7"] = False
            if s == "2.0":
                n_tail_s2 += st["N"][1] > 1.05
            if st["W"][1] > 1.03:
                ok["F1"] = False
            if st["W"][0] > 1.001:
                ok["F2"] = False
            if m == 12 and s == "2.0" and not st[hc][1] <= st["N"][1] - 0.01:
                ok["F4"] = False
            if st[hc][1] > 1.05:
                ok["F5"] = False
            if st[hc][4] > 165:
                ok["F6"] = False
            if st["W"][1] > st[hc][1] + 1e-12:
                ok["F8"] = False
    if n_tail_s2 == 0:
        ok["F3"] = False
    P()
    P("  CPU per layout (analysis): median %.1f s" % S.median(r["cpu"] for r in res))
    for f in sorted(ok):
        P("# %s -> %s" % (f, "held" if ok[f] else "refuted"))


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(OUT, "rt") as f:
            summarise(json.load(f))
        sys.exit(0)
    cache = os.environ.get("FRESH_CACHE", os.path.join(HERE, "fresh"))
    if "--build" in sys.argv:
        build(cache)
        sys.exit(0)
    summarise(analyse_all(cache))
