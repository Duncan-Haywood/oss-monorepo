"""Milestone 11ar: can a rule that needs no offset-aware search (sort the blind plan's bands by measured offset, then
size the spacing on the offset differences of the operators actually adjacent) recover what the aware search buys?

Why: 11aq measured the mechanism 11ap inferred: the aware planner puts operators with similar barometer speed
offsets in neighbouring levels (median R1 0.70 at s = 1), which is why the paper's 3-sigma rule, computed on the
fleet's pair-averaged offset spread, asks for 3 bands where the search keeps 5. Its "Next": "a rule that sorts
operators by measured offset and spaces by the adjacent pairs' difference, checked against the search". A practitioner
can apply such a rule with a spreadsheet; the aware search needs the whole planner re-run with every offset.

Rules, per layout, offset draw and spacing h (all scored under the truth: 11ao's supports with b_i - b_j added):
  * blind: 11ao's base plan at h (searched without offsets; the same seeds, so the same labels as 11ao and 11aq);
  * sort: the blind plan's grouping kept, its occupied bands re-ordered by their operators' mean offset, ascending
    or descending onto the same occupied slots, whichever scores lower (two evaluations of F, no search);
  * sort+descent (reported without a prediction): one local descent (PairProblem.descend) from the sort labels under
    the truth: a repair step a planner could afford, not a 200-restart search.
  Each rule's spacing is chosen two ways: (o) the h with the lowest F under the truth (a scan of 30 spacings, scoring
  only); (c) closed form: the most bands k whose widest spacing 120 / (2k - 1) satisfies h - Z >= 3 sigma_adj, with
  sigma_adj = sqrt(sigma_pair^2 + sum_w (b_i - b_j)^2 / sum_w) over the cross-operator pairs one level apart in the
  sort labels at that k's spacing (w = 11ai's conflict weight, as 11aq; sigma_pair = 1.061 m, as 11ap's rule_check).
  The aware search's F and h* are 11aq's, read from arrangement_plans.json.gz (s = 1 and 2, the 5-flight offsets).

Checks (must hold, or the comparison is void): the recomputed blind labels at 11aq's h_blind equal 11aq's recorded
ones for every layout; 11aq's aware labels scored here at its h* equal its recorded F to 1e-9 (relative).

Predictions (written and pushed before this script was run on any layout; 11ao, 11ap and 11aq results were known:
blind/aware median 1.0342 and 1.0183 at s = 1, 1.1631 and 1.1296 at s = 2, M = 12 and 16; aware h* 13.33 m in 80 and
87 of 96 at s = 1 and 24 m in 50 and 57 of 96 at s = 2; at 24 m the aware planner mixes offsets inside one level):
 Q1 at s = 1 the sort rule with spacing (o) recovers at least half of the blind plan's excess over the aware search:
    median F_sort / F_aware - 1 <= 0.5 x (median F_blind / F_aware - 1), at both M.
 Q2 at s = 2 the sort rule (o) recovers less than half of the blind plan's excess, at both M (the aware gain there
    comes from wider spacing and mixing offsets in one level, which re-ordering whole bands cannot do).
 Q3 at s = 1 the closed-form spacing (c) gives a median of at least 4 bands at both M (the fleet rule of 11ap: 3).
 Q4 at s = 2 the closed-form spacing (c) gives a median of 3 bands at both M (search median 3, fleet rule 2).
 Q5 at s = 1 the sort labels at the closed-form spacing (c) cost a median of at most 1.10 x F_aware at both M.
Reported without a prediction: sort+descent, the spread (p90, max) of every ratio, how often (c) equals the aware h*,
and s = 0.5 is not run (11ao: blind/aware 1.0000, nothing to recover).

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build     # 11ai's inputs (0.2 s)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 sort_rule.py > sort_rule_results.txt   # writes sort_rule.json.gz

Limits: as 11ao and 11aq (5 flights chosen by their uploaders, one offset per operator for the whole cruise, offsets
assumed known exactly to the rule); the closed form uses 11ai's conflict counts as weights, not leak probabilities;
spacing (o) uses F itself, so only (c) is a rule a practitioner can apply without the scorer. Preliminary.
"""
import gzip
import json
import math
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
import speed_offset as so  # noqa: E402

Z = ds.Z
HG = dr.HG
H = dr.ll.H_DEPTH
SCALES = (1.0, 2.0)
DRAWS = so.DRAWS
SIGMA_PAIR = math.hypot(0.912, 0.543)


def sort_bands(lab, b, descending=False):
    """Keep the grouping of lab; re-order its occupied bands by the mean offset of their operators onto the same
    occupied slots (lowest slot gets the lowest mean, or the highest when descending)."""
    lab = np.asarray(lab, dtype=int)
    b = np.asarray(b, dtype=float)
    used = sorted(set(int(x) for x in lab))
    means = {u: float(b[lab == u].mean()) for u in used}
    order = sorted(used, key=lambda u: (means[u], u), reverse=descending)
    to = {u: used[r] for r, u in enumerate(order)}
    return tuple(int(to[int(x)]) for x in lab)


def sigma_adj(b, lab, w, sigma_pair=SIGMA_PAIR):
    """sqrt(sigma_pair^2 + w-weighted mean (b_i - b_j)^2 over cross-operator pairs one level apart); sigma_pair
    alone if no weighted pair is adjacent."""
    b, lab = np.asarray(b, float), np.asarray(lab)
    iu = np.triu_indices(len(lab), 1)
    sel = (np.abs(lab[:, None] - lab[None, :])[iu] == 1) & (w[iu] > 0)
    if not sel.any():
        return sigma_pair
    ww = w[iu][sel]
    d2 = ((b[:, None] - b[None, :]) ** 2)[iu][sel]
    return math.sqrt(sigma_pair ** 2 + float((ww * d2).sum() / ww.sum()))


def band_spacing(k):
    return H / (2 * k - 1)


def closed_form(sig_by_k, z=Z):
    """Most bands k (keys of sig_by_k) with band_spacing(k) - z >= 3 sigma_adj(k); the fewest bands if none does."""
    ok = [k for k, sg in sig_by_k.items() if band_spacing(k) - z >= 3.0 * sg]
    return max(ok) if ok else min(sig_by_k)


def h_of_k(k):
    """The grid spacing equal to band_spacing(k)."""
    return min(HG, key=lambda h: abs(h - band_spacing(k)))


def analyse(args):
    L, aware = args
    phr, scales, c10, _ = so._state()
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    w = ar.pair_weights(np.asarray(W), np.asarray(X))
    isd = ds.load_isd()
    rng = np.random.default_rng(100000 * 0 + idx)        # 11al's / 11ao's / 11aq's seed for "deliv"
    sup, _ = dr.pair_supports(idx, m, "deliv", rng, isd)
    seed = idx + 13
    base = so.plan(phr, scales, W, X, V, sup, m, seed)
    hb, lb, _ = so.best(base)
    res = {"m": m, "idx": idx, "blind_ok": [int(x) for x in lb] == aware["blind"] and abs(hb - aware["h_blind"]) < 1e-9,
           "cells": {}}
    kset = sorted({dr.bb.k_cap(H, h, m) for h in HG})
    for s in SCALES:
        rows = []
        for dd in range(DRAWS):
            b = so.draw_offsets(c10, m, s, 7000 * dd + idx)
            rec = aware["cells"][str(s)][dd]
            assert np.allclose(rec["b"], b), "offset draw differs from 11aq's"
            sup_b = so.with_offsets(sup, b)
            per_h = {}
            for h in HG:
                k = dr.bb.k_cap(H, h, m)
                P = ds.PairProblem(W, X, V, *phr.tables_mix(sup_b, m, h, scales, k))
                lab0 = base[h][0]
                cands = [sort_bands(lab0, b), sort_bands(lab0, b, descending=True)]
                Fs = [P.score(c) for c in cands]
                j = int(np.argmin(Fs))
                ls = cands[j]
                ld = P.descend(ls)
                per_h[h] = {"k": k, "F_blind": P.score(lab0), "F_sort": Fs[j], "F_desc": P.score(ld),
                            "sig": sigma_adj(b, ls, w), "sort": list(ls)}
                if abs(h - rec["h"]) < 1e-9:
                    per_h[h]["F_aware_rescored"] = P.score(rec["labels"])
            sig_by_k = {}
            for k in kset:
                hk = h_of_k(k)
                if dr.bb.k_cap(H, hk, m) == k:
                    sig_by_k[k] = per_h[hk]["sig"]
            kc = closed_form(sig_by_k)
            hc = h_of_k(kc)
            def pick(key):
                return min(per_h, key=lambda q: (per_h[q][key], q))
            ho_s, ho_d = pick("F_sort"), pick("F_desc")
            rows.append({
                "F_aware": rec["F"], "h_aware": rec["h"], "bands_aware": len(set(rec["labels"])),
                "F_aware_rescored": per_h[min(per_h, key=lambda q: abs(q - rec["h"]))].get("F_aware_rescored"),
                "F_blind": per_h[hb]["F_blind"], "h_blind": hb,
                "F_sort_o": per_h[ho_s]["F_sort"], "h_sort_o": ho_s, "bands_sort_o": len(set(per_h[ho_s]["sort"])),
                "F_desc_o": per_h[ho_d]["F_desc"], "h_desc_o": ho_d,
                "k_c": kc, "h_c": hc, "F_sort_c": per_h[hc]["F_sort"], "F_desc_c": per_h[hc]["F_desc"],
                "sig_by_k": {str(k): v for k, v in sig_by_k.items()},
            })
        res["cells"][str(s)] = rows
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.0f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return res


def med(x):
    x = [v for v in x if v is not None and np.isfinite(v)]
    return S.median(x) if x else float("nan")


def summarise(res, P=print):
    out = {}
    nb = sum(1 for r in res if r["blind_ok"])
    P("# check: blind labels and h equal 11aq's in %d of %d layouts" % (nb, len(res)))
    bad = [abs(x["F_aware_rescored"] / x["F_aware"] - 1) for r in res for s in r["cells"] for x in r["cells"][s]
           if x["F_aware_rescored"] is not None]
    P("# check: 11aq's aware labels rescored here, max relative difference from its F %.2e over %d draws"
      % (max(bad) if bad else float("nan"), len(bad)))
    for m in (12, 16):
        R = [r for r in res if r["m"] == m]
        if not R:
            continue
        P()
        P("## M = %d (%d layouts x %d draws); ratios to the aware search's F (11aq)" % (m, len(R), DRAWS))
        P("  s    blind    sort(o)  p90      max      desc(o)  sort(c)  p90      max      desc(c)  "
          "bands: aware  sort(o)  (c)   (c)=aware")
        for s in SCALES:
            rows = [x for r in R for x in r["cells"][str(s)]]
            def rat(key):
                return [x[key] / x["F_aware"] for x in rows]
            row = {k: med(rat(k)) for k in ("F_blind", "F_sort_o", "F_desc_o", "F_sort_c", "F_desc_c")}
            row["k_c"] = med(x["k_c"] for x in rows)
            row["bands_aware"] = med(x["bands_aware"] for x in rows)
            out[(m, s)] = row
            so_, sc_ = rat("F_sort_o"), rat("F_sort_c")
            same = sum(1 for x in rows if abs(x["h_c"] - x["h_aware"]) < 1e-6)
            P("  %-3g  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f  %6.1f        %5.1f  %5.1f  %d of %d" % (
                s, row["F_blind"], row["F_sort_o"], np.percentile(so_, 90), max(so_), row["F_desc_o"],
                row["F_sort_c"], np.percentile(sc_, 90), max(sc_), row["F_desc_c"], row["bands_aware"],
                med(x["bands_sort_o"] for x in rows), row["k_c"], same, len(rows)))
        P("  closed-form band count (c), s: k x count")
        for s in SCALES:
            ks = [x["k_c"] for r in R for x in r["cells"][str(s)]]
            P("    %-3g %s" % (s, ", ".join("%d: %d" % (k, ks.count(k)) for k in sorted(set(ks)))))
        P("  median sigma_adj by k at s = 1 (m): %s" % ", ".join(
            "k=%s %.3f" % (k, med(x["sig_by_k"].get(k) for r in R for x in r["cells"]["1.0"]))
            for k in ("2", "3", "4", "5", "6")))
    P()
    P("# predictions")
    for m in (12, 16):
        if (m, 1.0) in out:
            o = out[(m, 1.0)]
            P("  Q1 M=%d s=1 sort(o) excess <= half blind's: %.4f vs 0.5 x %.4f -> %s" % (
                m, o["F_sort_o"] - 1, o["F_blind"] - 1, "held" if o["F_sort_o"] - 1 <= 0.5 * (o["F_blind"] - 1)
                else "refuted"))
    for m in (12, 16):
        if (m, 2.0) in out:
            o = out[(m, 2.0)]
            P("  Q2 M=%d s=2 sort(o) excess > half blind's: %.4f vs 0.5 x %.4f -> %s" % (
                m, o["F_sort_o"] - 1, o["F_blind"] - 1, "held" if o["F_sort_o"] - 1 > 0.5 * (o["F_blind"] - 1)
                else "refuted"))
    for m in (12, 16):
        if (m, 1.0) in out:
            v = out[(m, 1.0)]["k_c"]
            P("  Q3 M=%d s=1 closed-form median bands >= 4: %g -> %s" % (m, v, "held" if v >= 4 else "refuted"))
    for m in (12, 16):
        if (m, 2.0) in out:
            v = out[(m, 2.0)]["k_c"]
            P("  Q4 M=%d s=2 closed-form median bands = 3: %g -> %s" % (m, v, "held" if v == 3 else "refuted"))
    for m in (12, 16):
        if (m, 1.0) in out:
            v = out[(m, 1.0)]["F_sort_c"]
            P("  Q5 M=%d s=1 sort(c) / aware median <= 1.10: %.4f -> %s" % (m, v, "held" if v <= 1.10 else "refuted"))
    return out


def main(done):
    with gzip.open(os.path.join(HERE, "arrangement_plans.json.gz"), "rt") as f:
        aware = {(r["m"], r["idx"]): r for r in json.load(f)}
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = pool_.map(analyse, [(done[k], aware[k]) for k in keys])
    with gzip.open(os.path.join(HERE, "sort_rule.json.gz"), "wt") as f:
        json.dump(res, f, separators=(",", ":"))
    _, _, c10, _ = so._state()
    print("# Milestone 11ar: a sort-and-space rule against the aware search (sort_rule.py's docstring). deliv ages, "
          "Z = %.2f m, 5-flight offsets (%s m at 10 m/s), %d draws, s = %s, %d spacings; sigma_pair = %.3f m" % (
              Z, ", ".join("%+.2f" % v for v in sorted(c10)), DRAWS, ", ".join("%g" % s for s in SCALES), len(HG),
              SIGMA_PAIR))
    print("# blind = 11ao's offset-blind plan; sort = its bands re-ordered by mean offset; desc = one descent from "
          "sort; (o) spacing with the lowest F; (c) closed form h - Z >= 3 sigma_adj on the adjacent pairs")
    summarise(res)
    print()
    print("# analysis CPU s per layout: median %.0f" % med(r["cpu"] for r in res))


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(os.path.join(HERE, "sort_rule.json.gz"), "rt") as f:
            summarise(json.load(f))
        sys.exit(0)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    missing = [(m, i) for m in (12, 16) for i in dr.SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
