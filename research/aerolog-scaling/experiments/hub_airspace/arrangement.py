"""Milestone 11aq: does the planner keep far-apart operator offsets out of neighbouring levels? A direct test of the
mechanism 11ap could only infer.

Why: 11ap's post hoc found the paper's planning rule (h - Z >= 3 sigma_gap) one to two bands too conservative once the
gap error carries an operator-specific static-pressure offset, and its likely explanation was an arrangement effect:
the offsets are a few discrete values per operator, and the planner chooses which operators neighbour each other, so
it can keep pairs with very different offsets out of adjacent levels. 11ao's searches did not record their labellings,
so that was "the likely mechanism, not a measured one" (LOG.md, 11ap, and its "Next").

Run: 11ao's `aware` planner exactly (speed_offset.py: same pressure supports, same seeds, same 200 descents, the blind
and dist plans as starts), the 5 usable en-route flights' offsets, both M (12 and 16, 24 layouts each), D = 4 draws,
s = 1 (the measured offset at 10 m/s) and s = 2; s = 0.25 and 0.5 are skipped (11ao: 5 bands in 96 of 96 draws, no
arrangement to test). Because every seed is 11ao's, the aware plans should be 11ao's: the h* counts must equal
speed_offset_results.txt's distribution lines (checked and printed). Recorded per layout-draw: the aware labels, the
offsets, the blind plan's labels and the pair weights.

Statistics, per layout-draw, on cross-operator pairs (i < j) with conflict weight w_ij = W_ij + W_ji + X_ij + X_ji > 0
(pairs that never meet cannot matter):
  * A(b, lab): the w-weighted mean |b_i - b_j| over pairs one level apart (|lab_i - lab_j| = 1);
  * null: the mean of A over 200 random permutations of b among the operators (labels fixed; seed 9000 + layout-draw);
    R1 = A(b, aware) / null. R1 < 1 means operators with similar offsets are placed next to each other more than
    chance; same for same-level pairs (R0, reported without a prediction);
  * far share: the share of adjacent-pair weight on pairs with |b_i - b_j| > 3 m (at s = 1 that is exactly the pairs
    of the -4.70 m airframe with any other one: the next largest difference is 1.55 - (-1.44) = 2.99 m), against the same share under the
    permutations;
  * F_perm / F_aware: the aware labels and h*, scored under 20 permutations of b (seed 9500 + layout-draw): what the
    arrangement is worth when the offsets are reassigned at random to the operators after planning.
  * blind adjacency: A(b, blind labels) / null for the blind plan, which was chosen without the offsets.

Predictions (written and pushed before this script was run on any layout; 11ao's and 11ap's results were known,
including that blind/aware is a median 1.034 (M = 12) and 1.018 (M = 16) at s = 1):
 P1 at s = 1 the median R1 over layout-draws is at most 0.80 at both M.
 P2 at s = 1 the median far share in the aware plans is at most half the median far share under the permutations,
    at both M.
 P3 at s = 2 the median R1 is at most its value at s = 1, at both M (larger offsets, more sorting).
 P4 at s = 1 the median F_perm / F_aware is at least 1.02 at both M.
 P5 the blind plan's median adjacency ratio is within 0.90 to 1.10 at s = 1 at both M (it never saw the offsets, so
    it is a check of the null, not a hypothesis).
Reported without a prediction: R0 (same-level pairs; at d = 0 an offset adds separation, so the planner could prefer
different offsets in one level), the R1 spread, s = 2's F_perm, and the planner's h* counts against 11ao.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build     # 11ai's inputs (0.15 s, committed)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 arrangement.py > arrangement_results.txt   # writes arrangement_plans.json.gz

Limits: as 11ao (5 flights chosen by their uploaders, offsets drawn at random per operator, one offset for the whole
cruise); the permutation null keeps the multiset of drawn offsets, so a draw where most operators share one airframe
has little to arrange; weights are 11ai's conflict counts, not leak probabilities. Preliminary.
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
import drift_share as ds  # noqa: E402
import drift_share_run as dr  # noqa: E402
import speed_offset as so  # noqa: E402

Z = ds.Z
HG = dr.HG
SCALES = (1.0, 2.0)
DRAWS = so.DRAWS
NULL_PERMS = 200
F_PERMS = 20
FAR = 3.0


def pair_weights(W, X):
    """Symmetric conflict weight per operator pair, zero on the diagonal."""
    w = W + W.T + X + X.T
    w = np.array(w, dtype=float)
    np.fill_diagonal(w, 0.0)
    return w


def adj_stat(b, lab, w, d=1):
    """w-weighted mean |b_i - b_j| over pairs i < j with |lab_i - lab_j| = d; nan if no such pair has weight."""
    b, lab = np.asarray(b, float), np.asarray(lab)
    iu = np.triu_indices(len(lab), 1)
    sel = (np.abs(lab[:, None] - lab[None, :])[iu] == d) & (w[iu] > 0)
    if not sel.any():
        return float("nan")
    ww = w[iu][sel]
    return float((ww * np.abs(b[:, None] - b[None, :])[iu][sel]).sum() / ww.sum())


def far_share(b, lab, w, far=FAR):
    """Share of adjacent-pair weight on pairs whose offsets differ by more than far."""
    b, lab = np.asarray(b, float), np.asarray(lab)
    iu = np.triu_indices(len(lab), 1)
    sel = (np.abs(lab[:, None] - lab[None, :])[iu] == 1) & (w[iu] > 0)
    if not sel.any():
        return float("nan")
    ww = w[iu][sel]
    return float(ww[np.abs(b[:, None] - b[None, :])[iu][sel] > far].sum() / ww.sum())


def perm_null(b, lab, w, n, seed, fn=adj_stat, **kw):
    """Mean of fn over n random permutations of b (labels fixed)."""
    rng = np.random.default_rng(seed)
    vals = [fn(rng.permutation(b), lab, w, **kw) for _ in range(n)]
    vals = [v for v in vals if np.isfinite(v)]
    return float(np.mean(vals)) if vals else float("nan")


def ratio(a, b):
    return a / b if np.isfinite(a) and np.isfinite(b) and b > 0 else float("nan")


def analyse(L):
    phr, scales, c10, _ = so._state()
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    w = pair_weights(np.asarray(W), np.asarray(X))
    isd = ds.load_isd()
    rng = np.random.default_rng(100000 * 0 + idx)        # 11al's / 11ao's seed for "deliv"
    sup, _ = dr.pair_supports(idx, m, "deliv", rng, isd)
    seed = idx + 13
    base = so.plan(phr, scales, W, X, V, sup, m, seed)
    hb, lb, Fb = so.best(base)
    blind_labs = {h: base[h][0] for h in HG}
    res = {"m": m, "idx": idx, "w": w.round(9).tolist(), "blind": [int(x) for x in lb], "h_blind": hb, "cells": {}}
    for s in SCALES:
        dist = so.plan(phr, scales, W, X, V, so.with_spread(sup, c10, s), m, seed, starts=[blind_labs])
        rows = []
        for dd in range(DRAWS):
            b = so.draw_offsets(c10, m, s, 7000 * dd + idx)
            truth = so.plan(phr, scales, W, X, V, so.with_offsets(sup, b), m, seed,
                            starts=[blind_labs, {h: dist[h][0] for h in HG}])
            ha, la, Fa = so.best(truth)
            ld = 100 * dd + idx
            k = dr.bb.k_cap(dr.ll.H_DEPTH, ha, m)
            prng = np.random.default_rng(9500 + ld)
            Fp = []
            for _ in range(F_PERMS):
                bp = prng.permutation(b)
                P = ds.PairProblem(W, X, V, *phr.tables_mix(so.with_offsets(sup, bp), m, ha, scales, k))
                Fp.append(P.score(la))
            rows.append({
                "b": [float(x) for x in b], "labels": [int(x) for x in la], "h": ha, "F": Fa,
                "A1": adj_stat(b, la, w), "N1": perm_null(b, la, w, NULL_PERMS, 9000 + ld),
                "A0": adj_stat(b, la, w, d=0), "N0": perm_null(b, la, w, NULL_PERMS, 9000 + ld, d=0),
                "far": far_share(b, la, w), "far_null": perm_null(b, la, w, NULL_PERMS, 9000 + ld, fn=far_share),
                "B1": adj_stat(b, lb, w), "NB1": perm_null(b, lb, w, NULL_PERMS, 9000 + ld),
                "Fperm": float(np.mean(Fp)) / Fa, "Fperm_max": float(np.max(Fp)) / Fa,
            })
        res["cells"][str(s)] = rows
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.0f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return res


def med(x):
    x = [v for v in x if np.isfinite(v)]
    return S.median(x) if x else float("nan")


def summarise(res, P=print):
    """Print the tables and the predictions from a list of analyse() results."""
    out = {}
    for m in (12, 16):
        R = [r for r in res if r["m"] == m]
        if not R:
            continue
        P()
        P("## M = %d (%d layouts x %d draws)" % (m, len(R), DRAWS))
        P("  s    n    R1 med   p10     p90     R0 med   far     far_null  blind R1  Fperm/F  p90     max")
        for s in SCALES:
            rows = [x for r in R for x in r["cells"][str(s)]]
            r1 = [ratio(x["A1"], x["N1"]) for x in rows]
            r0 = [ratio(x["A0"], x["N0"]) for x in rows]
            rb_ = [ratio(x["B1"], x["NB1"]) for x in rows]
            fp = [x["Fperm"] for x in rows]
            ok = [v for v in r1 if np.isfinite(v)]
            row = dict(r1=med(r1), r0=med(r0), far=med(x["far"] for x in rows),
                       far_null=med(x["far_null"] for x in rows), blind=med(rb_), fperm=med(fp))
            out[(m, s)] = row
            P("  %-3g  %3d  %7.4f  %6.4f  %6.4f  %7.4f  %6.4f  %8.4f  %8.4f  %7.4f  %6.4f  %6.4f" % (
                s, len(ok), row["r1"], np.percentile(ok, 10), np.percentile(ok, 90), row["r0"], row["far"],
                row["far_null"], row["blind"], row["fperm"], np.percentile(fp, 90),
                max(x["Fperm_max"] for x in rows)))
            n_lt = sum(1 for v in ok if v < 1)
            P("       R1 < 1 in %d of %d layout-draws (sign test against 0.5: two-sided p = %.2g)" % (
                n_lt, len(ok), sign_p(n_lt, len(ok))))
        P("  h*_aware distribution (s: h x count), to compare with speed_offset_results.txt")
        for s in SCALES:
            hs = [round(x["h"], 2) for r in R for x in r["cells"][str(s)]]
            P("    %-5g %s" % (s, ", ".join("%g: %d" % (h, hs.count(h)) for h in sorted(set(hs)))))
    P()
    P("# predictions")
    for m in (12, 16):
        if (m, 1.0) in out:
            v = out[(m, 1.0)]["r1"]
            P("  P1 M=%d s=1 median R1 <= 0.80: %.4f -> %s" % (m, v, "held" if v <= 0.80 else "refuted"))
    for m in (12, 16):
        if (m, 1.0) in out:
            o = out[(m, 1.0)]
            P("  P2 M=%d s=1 far share <= half the null's: %.4f vs %.4f -> %s" % (
                m, o["far"], o["far_null"], "held" if o["far"] <= 0.5 * o["far_null"] else "refuted"))
    for m in (12, 16):
        if (m, 2.0) in out:
            a, b = out[(m, 2.0)]["r1"], out[(m, 1.0)]["r1"]
            P("  P3 M=%d median R1 at s=2 <= at s=1: %.4f vs %.4f -> %s" % (m, a, b, "held" if a <= b else "refuted"))
    for m in (12, 16):
        if (m, 1.0) in out:
            v = out[(m, 1.0)]["fperm"]
            P("  P4 M=%d s=1 median Fperm/F_aware >= 1.02: %.4f -> %s" % (m, v, "held" if v >= 1.02 else "refuted"))
    for m in (12, 16):
        if (m, 1.0) in out:
            v = out[(m, 1.0)]["blind"]
            P("  P5 M=%d s=1 blind adjacency ratio in [0.90, 1.10]: %.4f -> %s" % (
                m, v, "held" if 0.90 <= v <= 1.10 else "refuted"))
    return out


def sign_p(k, n):
    """Exact two-sided binomial p for k of n successes at p = 0.5."""
    from math import comb
    if n == 0:
        return float("nan")
    lo = min(k, n - k)
    t = sum(comb(n, i) for i in range(lo + 1)) / 2 ** n
    return min(1.0, 2 * t)


def main(done):
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = pool_.map(analyse, [done[k] for k in keys])
    with gzip.open(os.path.join(HERE, "arrangement_plans.json.gz"), "wt") as f:
        json.dump(res, f, separators=(",", ":"))
    _, _, c10, _ = so._state()
    print("# Milestone 11aq: which operators the aware planner puts next to each other (arrangement.py's docstring). "
          "11ao's aware planner, deliv ages, Z = %.2f m, 5-flight offsets (%s m at 10 m/s), %d draws, s = %s; "
          "null = %d permutations of the offsets, F_perm = %d" % (
              Z, ", ".join("%+.2f" % v for v in sorted(c10)), DRAWS, ", ".join("%g" % s for s in SCALES),
              NULL_PERMS, F_PERMS))
    print("# R1 = weighted mean |b_i - b_j| one level apart / permutation null; R0 the same in one level; far = share "
          "of adjacent weight with |b_i - b_j| > %g m; blind R1 = the blind plan's labels; Fperm/F = aware labels "
          "scored with the offsets permuted" % FAR)
    summarise(res)
    print()
    print("# analysis CPU s per layout: median %.0f" % med(r["cpu"] for r in res))


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(os.path.join(HERE, "arrangement_plans.json.gz"), "rt") as f:
            summarise(json.load(f))
        sys.exit(0)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    if "--one" in sys.argv:
        SCALES = (1.0,)
        so.DRAWS = DRAWS = 1
        k = next(iter(done))
        r = analyse(done[k])
        print(json.dumps({k: v for k, v in r.items() if k != "w"})[:2000])
        sys.exit(0)
    missing = [(m, i) for m in (12, 16) for i in dr.SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
