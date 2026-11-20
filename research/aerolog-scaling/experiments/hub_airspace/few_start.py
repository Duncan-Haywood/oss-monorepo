"""Milestone 11at: how many restarts does the offset-aware search need, and do greedy starts buy them cheaper?

Why: 11as's "Next". At the measured offset (s = 1) one offset-ordered greedy insertion plus one descent cost a
median 1.0637 (M = 12) and 1.0705 (M = 16) of 11aq's aware search (200 random starts plus 2 warm starts per
spacing), worse than the offset-blind plan (1.0342 and 1.0183). 11as read this as "the planner's value there is its
restarts over the conflict structure". That reading has a price that was never measured: how the search's result
falls with the number of starts, and whether starts built by a perturbed greedy insertion reach the search's
result with fewer starts than random ones.

Planners, per layout, offset draw and spacing h (built and scored under the truth: 11ao's supports with b_i - b_j
added, the same tables, seeds and draws as 11aq to 11as):
  * random-R: R uniform random labellings, each followed by PairProblem.descend, the best kept (the search of 11aq
    without its 2 warm starts, with a new seed: 60000 + 1000 * draw + 100 * scale index + idx, one stream per
    spacing). R in RS_RANDOM, nested (the best of the first R of the same 200 starts).
  * greedy-R: R greedy insertions (11as's `greedy` on the pair-cost table), each followed by one descent, the best
    kept. Start 0 is 11as's ascending offset order, start 1 the descending one (so greedy-2 is at least as good as
    11as's greedy-off+descent); start r >= 2 uses a random direction and the order of sgn * b_i + 0.5 * sd(b) * N(0,
    1), ties broken at random (seed 80000 + the same terms). R in RS_GREEDY, nested.
  Spacing (o) = for each planner and R separately, the h with the lowest F over the 30 spacings. All ratios are to
  11aq's aware F (arrangement_plans.json.gz) for the same layout and draw; the blind ratio is read from 11ar's
  sort_rule.json.gz.

Check (or the comparison is void): 11aq's aware labels rescored here at its h* equal its recorded F to 1e-9
(relative), for every draw.

Predictions (written and pushed before this script was run on any layout; 11ao to 11as results were known: blind /
aware median 1.0342 and 1.0183 at s = 1, 1.1631 and 1.1296 at s = 2; greedy-off+descent 1.0637, 1.0705 at s = 1 and
1.0408, 1.0528 at s = 2; M = 12 and 16):
 R1 at s = 1 greedy-10 (o) has a lower median ratio than the blind plan, at both M (ten perturbed insertions
    cover the restarts that one pass lacks).
 R2 at R = 1, 5 and 10 greedy-R (o) has a lower median ratio than random-R (o), at both s and both M (12 cells).
 R3 at s = 1 random-10 (o) has a median ratio above 1.01 at both M (the search needs more than ten starts to come
    within 1% of its 200-start result).
 R4 random-200 (o) has a median ratio at or below 1.005 at both s and both M (the 200-start search has converged:
    a new seed moves its median by under half a percent).
 R5 at s = 2 greedy-5 (o) has a median ratio at or below 1.02, at both M.
Reported without a prediction: every R on both curves, p90 and max of the ratios, the fewest starts at which each
curve's median comes within 1% and 0.1% of the aware search, the share of draws where random-200 beats the aware
search (it lacks the warm starts but has a new seed), and the CPU time of the starts.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build     # 11ai's inputs (0.2 s)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl FEW_CACHE=fcache python3 few_start.py > few_start_results.txt
    # writes few_start.json.gz; FEW_CACHE (optional) keeps per-layout results so a stopped run resumes

Limits: as 11ao to 11as (5 flights chosen by their uploaders, one offset per operator for the whole cruise,
offsets assumed known exactly to the planners); both planners use the pair-cost tables (the model), so this prices
the search, not the model; spacing (o) uses F itself; one perturbation family for the greedy starts. Preliminary.
"""
import gzip
import json
import multiprocessing as mp
import os
import pickle
import statistics as S
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import arrangement as ar  # noqa: E402
import drift_share as ds  # noqa: E402
import drift_share_run as dr  # noqa: E402
import greedy_rule as gr  # noqa: E402
import speed_offset as so  # noqa: E402

Z = ds.Z
HG = dr.HG
H = dr.ll.H_DEPTH
SCALES = (1.0, 2.0)
DRAWS = so.DRAWS
RS_RANDOM = (1, 2, 5, 10, 20, 50, 100, 200)
RS_GREEDY = (1, 2, 5, 10, 20, 50)
JITTER = 0.5


def perturbed_order(b, rng, jitter=JITTER):
    """A random direction and the order of sgn * b_i + jitter * sd(b) * N(0, 1), ties at random."""
    b = np.asarray(b, dtype=float)
    sgn = 1.0 if rng.random() < 0.5 else -1.0
    sd = float(b.std()) if len(b) > 1 else 0.0
    key = sgn * b + jitter * sd * rng.standard_normal(len(b))
    tie = rng.random(len(b))
    return sorted(range(len(b)), key=lambda i: (float(key[i]), float(tie[i])))


def greedy_orders(b, deg, n, rng):
    """n insertion orders: 11as's ascending and descending offset orders, then perturbed ones."""
    out = [gr.offset_order(b, deg), gr.offset_order(b, deg, descending=True)]
    while len(out) < n:
        out.append(perturbed_order(b, rng))
    return out[:n]


def best_of_prefix(F, Rs):
    """{R: min(F[:R])} for each R in Rs (nested best-of curves)."""
    run = np.minimum.accumulate(np.asarray(F, dtype=float))
    return {R: float(run[R - 1]) for R in Rs}


def first_within(curve, target):
    """Smallest R whose value is <= target, or None."""
    for R in sorted(curve):
        if curve[R] <= target:
            return R
    return None


def analyse(args):
    L, aware, prev = args
    phr, scales, c10, _ = so._state()
    t0 = time.process_time()
    t_rand = t_greedy = 0.0
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    deg = ar.pair_weights(np.asarray(W), np.asarray(X)).sum(axis=1)
    isd = ds.load_isd()
    rng = np.random.default_rng(100000 * 0 + idx)        # 11al's to 11as's seed for "deliv"
    sup, _ = dr.pair_supports(idx, m, "deliv", rng, isd)
    res = {"m": m, "idx": idx, "cells": {}}
    for si, s in enumerate(SCALES):
        rows = []
        for dd in range(DRAWS):
            b = so.draw_offsets(c10, m, s, 7000 * dd + idx)
            rec = aware["cells"][str(s)][dd]
            assert np.allclose(rec["b"], b), "offset draw differs from 11aq's"
            sup_b = so.with_offsets(sup, b)
            rrng = np.random.default_rng(60000 + 1000 * dd + 100 * si + idx)
            grng = np.random.default_rng(80000 + 1000 * dd + 100 * si + idx)
            per_h = {}
            resc = None
            for h in HG:
                k = dr.bb.k_cap(H, h, m)
                P = ds.PairProblem(W, X, V, *phr.tables_mix(sup_b, m, h, scales, k))
                G = P._pair_table()
                t1 = time.process_time()
                Fr = [P.score(P.descend(tuple(int(x) for x in rrng.integers(0, k, m)))) for _ in range(max(RS_RANDOM))]
                t2 = time.process_time()
                Fg = [P.score(P.descend(gr.greedy(G, o))) for o in greedy_orders(b, deg, max(RS_GREEDY), grng)]
                t3 = time.process_time()
                t_rand += t2 - t1
                t_greedy += t3 - t2
                per_h[h] = {"rand": best_of_prefix(Fr, RS_RANDOM), "greedy": best_of_prefix(Fg, RS_GREEDY)}
                if abs(h - rec["h"]) < 1e-9:
                    resc = P.score(rec["labels"])
            row = {"F_aware": rec["F"], "F_aware_rescored": resc, "F_blind": prev["cells"][str(s)][dd]["F_blind"]}
            for name, Rs in (("rand", RS_RANDOM), ("greedy", RS_GREEDY)):
                for R in Rs:
                    hb = min(per_h, key=lambda q: (per_h[q][name][R], q))
                    row["%s_%d" % (name, R)] = per_h[hb][name][R]
                    row["h_%s_%d" % (name, R)] = hb
            rows.append(row)
        res["cells"][str(s)] = rows
    res["cpu"] = time.process_time() - t0
    res["cpu_rand"] = t_rand
    res["cpu_greedy"] = t_greedy
    print("M=%d layout %d analysed, %.0f CPU s (200 random starts %.1f s, 50 greedy starts %.1f s)"
          % (m, idx, res["cpu"], t_rand, t_greedy), file=sys.stderr, flush=True)
    return res


def med(x):
    x = [v for v in x if v is not None and np.isfinite(v)]
    return S.median(x) if x else float("nan")


def summarise(res, P=print):
    out = {}
    bad = [abs(x["F_aware_rescored"] / x["F_aware"] - 1) for r in res for s in r["cells"] for x in r["cells"][s]
           if x["F_aware_rescored"] is not None]
    P("# check: 11aq's aware labels rescored here, max relative difference from its F %.2e over %d draws"
      % (max(bad) if bad else float("nan"), len(bad)))
    for m in (12, 16):
        R_ = [r for r in res if r["m"] == m]
        if not R_:
            continue
        for s in SCALES:
            rows = [x for r in R_ for x in r["cells"][str(s)]]
            blind = med(x["F_blind"] / x["F_aware"] for x in rows)
            P()
            P("## M = %d, s = %g (%d layouts x %d draws): median ratio to the aware search's F (11aq), p90, max; "
              "blind plan %.4f" % (m, s, len(R_), DRAWS, blind))
            P("  planner     R    median   p90      max      <blind      <aware")
            curves = {}
            for name, Rs in (("random", RS_RANDOM), ("greedy", RS_GREEDY)):
                key = "rand" if name == "random" else "greedy"
                curves[name] = {}
                for R in Rs:
                    rat = [x["%s_%d" % (key, R)] / x["F_aware"] for x in rows]
                    curves[name][R] = med(rat)
                    out[(m, s, name, R)] = med(rat)
                    lb = sum(1 for x in rows if x["%s_%d" % (key, R)] < x["F_blind"])
                    la = sum(1 for x in rows if x["%s_%d" % (key, R)] < x["F_aware"] * (1 - 1e-9))
                    P("  %-8s  %4d   %7.4f  %7.4f  %7.4f  %2d of %d   %2d of %d" % (
                        name, R, med(rat), np.percentile(rat, 90), max(rat), lb, len(rows), la, len(rows)))
            for name in curves:
                P("    %s: fewest starts with median within 1%%: %s; within 0.1%%: %s" % (
                    name, first_within(curves[name], 1.01), first_within(curves[name], 1.001)))
            out[(m, s, "blind")] = blind
    P()
    P("# predictions")
    for m in (12, 16):
        g, bl = out.get((m, 1.0, "greedy", 10)), out.get((m, 1.0, "blind"))
        if g is not None:
            P("  R1 M=%d s=1 greedy-10(o) < blind: %.4f vs %.4f -> %s" % (m, g, bl, "held" if g < bl else "refuted"))
    for m in (12, 16):
        for s in SCALES:
            for R in (1, 5, 10):
                g, r = out.get((m, s, "greedy", R)), out.get((m, s, "random", R))
                if g is not None:
                    P("  R2 M=%d s=%g R=%d greedy < random: %.4f vs %.4f -> %s" % (
                        m, s, R, g, r, "held" if g < r else "refuted"))
    for m in (12, 16):
        r = out.get((m, 1.0, "random", 10))
        if r is not None:
            P("  R3 M=%d s=1 random-10(o) > 1.01: %.4f -> %s" % (m, r, "held" if r > 1.01 else "refuted"))
    for m in (12, 16):
        for s in SCALES:
            r = out.get((m, s, "random", 200))
            if r is not None:
                P("  R4 M=%d s=%g random-200(o) <= 1.005: %.4f -> %s" % (m, s, r, "held" if r <= 1.005 else "refuted"))
    for m in (12, 16):
        g = out.get((m, 2.0, "greedy", 5))
        if g is not None:
            P("  R5 M=%d s=2 greedy-5(o) <= 1.02: %.4f -> %s" % (m, g, "held" if g <= 1.02 else "refuted"))
    return out


def main(done):
    with gzip.open(os.path.join(HERE, "arrangement_plans.json.gz"), "rt") as f:
        aware = {(r["m"], r["idx"]): r for r in json.load(f)}
    with gzip.open(os.path.join(HERE, "sort_rule.json.gz"), "rt") as f:
        prev = {(r["m"], r["idx"]): r for r in json.load(f)}
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    if "--quick" in sys.argv:
        keys = keys[:1]
    cache = os.environ.get("FEW_CACHE")
    if cache:
        os.makedirs(cache, exist_ok=True)
    def path(k):
        return os.path.join(cache, "%d_%d.json" % k) if cache else None
    have = {k: json.load(open(path(k))) for k in keys if cache and os.path.exists(path(k))}
    todo = [k for k in keys if k not in have]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        for k, r in zip(todo, pool_.imap(analyse, [(done[k], aware[k], prev[k]) for k in todo])):
            have[k] = r
            if cache:
                with open(path(k), "w") as f:
                    json.dump(r, f)
    res = [have[k] for k in keys]
    if "--quick" not in sys.argv:
        with gzip.open(os.path.join(HERE, "few_start.json.gz"), "wt") as f:
            json.dump(res, f, separators=(",", ":"))
    _, _, c10, _ = so._state()
    print("# Milestone 11at: restart curves of the aware search, random against perturbed-greedy starts "
          "(few_start.py's docstring). deliv ages, Z = %.2f m, 5-flight offsets (%s m at 10 m/s), %d draws, s = %s, "
          "%d spacings" % (Z, ", ".join("%+.2f" % v for v in sorted(c10)), DRAWS,
                           ", ".join("%g" % s for s in SCALES), len(HG)))
    print("# random = best of R uniform random starts, each descended; greedy = best of R greedy insertions "
          "(11as's two offset orders, then perturbed), each descended; (o) = the spacing with the lowest F per R")
    summarise(res)
    print()
    print("# CPU s per layout: analysis median %.0f; 200 random starts x 30 spacings x %d draws median %.1f; "
          "50 greedy starts median %.1f" % (med(r["cpu"] for r in res), 2 * DRAWS, med(r["cpu_rand"] for r in res),
                                             med(r["cpu_greedy"] for r in res)))


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(os.path.join(HERE, "few_start.json.gz"), "rt") as f:
            summarise(json.load(f))
        sys.exit(0)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    missing = [(m, i) for m in (12, 16) for i in dr.SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
