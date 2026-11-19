"""Milestone 11as: does an operator-level greedy rule (insert operators one at a time, in order of their measured
barometer offset, into the band that is cheapest given the operators already placed) recover what the offset-aware
search buys, where 11ar's band-level sort did not?

Why: 11ar's "Next". Re-ordering the blind plan's whole bands by mean offset (11ar's sort rule) cost more than it
saved at the measured offset (median 1.0995 and 1.1279 of the aware search at s = 1, M = 12 and 16, against the
blind plan's 1.0342 and 1.0183), and its reading was that the aware search wins "by moving single operators while
keeping them [the conflict graph and the climb cost]". A greedy insertion acts on single operators and sees the
conflict graph, the climb cost and the offsets at every step, with no restarts: one pass of m x k pair-cost sums.

Rules, per layout, offset draw and spacing h (all built and scored under the truth: 11ao's supports with b_i - b_j
added, the same tables, seeds and draws as 11aq and 11ar):
  * greedy-off: operators in ascending offset order (ties: larger total conflict weight first), each into the band
    a in 0..k-1 minimising sum_j G[i, j, a, lab_j] over the operators j already placed (G = PairProblem's pair-cost
    table: the overlap terms of W and X plus the climb term V; ties to the lower band); also run in descending offset
    order, and the lower F of the two kept (two passes, as 11ar kept the better of ascending and descending);
  * greedy-deg: the same insertion in order of total conflict weight, largest first (the largest-first colouring
    heuristic), ties by operator index: an insertion that does not use the offsets for its order (the tables still
    carry them);
  * greedy-off+descent: one PairProblem.descend from greedy-off (as 11ar's sort+descent).
  Spacing (o) = the h with the lowest F over the 30 spacings (scoring only). The blind, sort(o) and sort+descent(o)
  ratios are read from 11ar's sort_rule.json.gz and the aware search's F from 11aq's arrangement_plans.json.gz.

Check (or the comparison is void): 11aq's aware labels scored here at its h* equal its recorded F to 1e-9
(relative), for every draw.

Predictions (written and pushed before this script was run on any layout; 11ao to 11ar results were known: blind /
aware median 1.0342 and 1.0183 at s = 1, 1.1631 and 1.1296 at s = 2; sort(o) 1.0995, 1.1279 and 1.1623, 1.1725;
sort+descent(o) 1.0628, 1.0716 and 1.0520, 1.0605; M = 12 and 16):
 G1 at s = 1 greedy-off (o) has a higher median ratio to the aware search than the blind plan, at both M (one pass
    without restarts loses to a 200-restart search when the offsets matter little).
 G2 at s = 2 greedy-off (o) has a lower median ratio than the blind plan, at both M.
 G3 greedy-off (o) has a lower median ratio than 11ar's sort (o), at both s and both M (it keeps the conflict
    structure while placing offsets).
 G4 at s = 2 greedy-off+descent (o) has a median ratio at or below 11ar's sort+descent (o), at both M.
 G5 at s = 2 the offset order beats the conflict-weight order: median F_greedy-off(o) / F_greedy-deg(o) < 1 at
    both M.
Reported without a prediction: greedy-off+descent at s = 1, the spread (p90, max) of each ratio, per-draw win counts
against the blind plan, the band counts chosen, and the CPU time of a greedy pass against 11aq's search.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build     # 11ai's inputs (0.2 s)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 greedy_rule.py > greedy_rule_results.txt  # writes greedy_rule.json.gz

Limits: as 11ao to 11ar (5 flights chosen by their uploaders, one offset per operator for the whole cruise, offsets
assumed known exactly to the rule); the greedy rule needs the pair-cost table (the scorer's tables), so it saves the
search, not the model; spacing (o) uses F itself. Preliminary.
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
import speed_offset as so  # noqa: E402

Z = ds.Z
HG = dr.HG
H = dr.ll.H_DEPTH
SCALES = (1.0, 2.0)
DRAWS = so.DRAWS


def greedy(G, order):
    """Insert operators in `order`, each into the band minimising its pair cost to those already placed
    (G[i, j, a, b] = cost of i in band a with j in band b); ties to the lower band. Returns labels."""
    m, k = G.shape[0], G.shape[2]
    lab = np.full(m, -1, dtype=int)
    placed = []
    for i in order:
        if placed:
            pj = np.array(placed)
            cost = G[i, pj, :, lab[pj]].sum(axis=0)          # (k,)
        else:
            cost = np.zeros(k)
        a = int(np.argmin(cost))                            # first minimum: lowest band on ties
        lab[i] = a
        placed.append(i)
    return tuple(int(x) for x in lab)


def offset_order(b, deg, descending=False):
    """Operators by offset (ascending, or descending), ties by larger total conflict weight, then index."""
    sgn = -1.0 if descending else 1.0
    return sorted(range(len(b)), key=lambda i: (sgn * float(b[i]), -float(deg[i]), i))


def degree_order(deg):
    """Largest total conflict weight first, ties by index."""
    return sorted(range(len(deg)), key=lambda i: (-float(deg[i]), i))


def analyse(args):
    L, aware, prev = args
    phr, scales, c10, _ = so._state()
    t0 = time.process_time()
    tg = 0.0
    m, idx = L["m"], L["idx"]
    W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
    V = dr.bc.V_of(L["T"], dr.ll.tau_z(Z))
    w = ar.pair_weights(np.asarray(W), np.asarray(X))
    deg = w.sum(axis=1)
    isd = ds.load_isd()
    rng = np.random.default_rng(100000 * 0 + idx)        # 11al's / 11ao's / 11aq's / 11ar's seed for "deliv"
    sup, _ = dr.pair_supports(idx, m, "deliv", rng, isd)
    res = {"m": m, "idx": idx, "cells": {}}
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
                t1 = time.process_time()
                G = P._pair_table()
                ca = greedy(G, offset_order(b, deg))
                cd = greedy(G, offset_order(b, deg, descending=True))
                fa, fd = P.score(ca), P.score(cd)
                lo = ca if fa <= fd else cd
                lg = greedy(G, degree_order(deg))
                tg += time.process_time() - t1
                ld = P.descend(lo)
                per_h[h] = {"F_off": min(fa, fd), "F_deg": P.score(lg), "F_offd": P.score(ld),
                            "bands_off": len(set(lo)), "dir": "asc" if fa <= fd else "desc"}
                if abs(h - rec["h"]) < 1e-9:
                    per_h[h]["F_aware_rescored"] = P.score(rec["labels"])
            def pick(key):
                return min(per_h, key=lambda q: (per_h[q][key], q))
            ho, hg, hd = pick("F_off"), pick("F_deg"), pick("F_offd")
            pr = prev["cells"][str(s)][dd]
            rows.append({
                "F_aware": rec["F"], "h_aware": rec["h"], "bands_aware": len(set(rec["labels"])),
                "F_aware_rescored": per_h[min(per_h, key=lambda q: abs(q - rec["h"]))].get("F_aware_rescored"),
                "F_blind": pr["F_blind"], "F_sort_o": pr["F_sort_o"], "F_sdesc_o": pr["F_desc_o"],
                "F_off_o": per_h[ho]["F_off"], "h_off_o": ho, "bands_off_o": per_h[ho]["bands_off"],
                "dir_off_o": per_h[ho]["dir"],
                "F_deg_o": per_h[hg]["F_deg"], "h_deg_o": hg,
                "F_offd_o": per_h[hd]["F_offd"], "h_offd_o": hd,
            })
        res["cells"][str(s)] = rows
    res["cpu"] = time.process_time() - t0
    res["cpu_greedy"] = tg
    print("M=%d layout %d analysed, %.0f CPU s (greedy passes %.2f s)" % (m, idx, res["cpu"], tg),
          file=sys.stderr, flush=True)
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
    keys = ("F_blind", "F_sort_o", "F_sdesc_o", "F_off_o", "F_deg_o", "F_offd_o")
    for m in (12, 16):
        R = [r for r in res if r["m"] == m]
        if not R:
            continue
        P()
        P("## M = %d (%d layouts x %d draws); median ratio to the aware search's F (11aq); p90 / max for greedy-off"
          % (m, len(R), DRAWS))
        P("  s    blind    sort(o)  sdesc(o) g-off(o) p90      max      g-deg(o) g-offd(o) off/deg  "
          "bands: aware g-off  off<blind  offd<blind")
        for s in SCALES:
            rows = [x for r in R for x in r["cells"][str(s)]]
            def rat(key):
                return [x[key] / x["F_aware"] for x in rows]
            row = {k: med(rat(k)) for k in keys}
            od = med(x["F_off_o"] / x["F_deg_o"] for x in rows)
            row["off_deg"] = od
            out[(m, s)] = row
            go = rat("F_off_o")
            wins = sum(1 for x in rows if x["F_off_o"] < x["F_blind"])
            winsd = sum(1 for x in rows if x["F_offd_o"] < x["F_blind"])
            P("  %-3g  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f   %7.4f  %5.1f  %5.1f  %2d of %d   %2d of %d"
              % (s, row["F_blind"], row["F_sort_o"], row["F_sdesc_o"], row["F_off_o"], np.percentile(go, 90),
                 max(go), row["F_deg_o"], row["F_offd_o"], od, med(x["bands_aware"] for x in rows),
                 med(x["bands_off_o"] for x in rows), wins, len(rows), winsd, len(rows)))
        for s in SCALES:
            rows = [x for r in R for x in r["cells"][str(s)]]
            hs = [round(x["h_off_o"], 2) for x in rows]
            P("    s=%g greedy-off (o) spacing m x count: %s; descending order chosen in %d of %d" % (
                s, ", ".join("%g: %d" % (h, hs.count(h)) for h in sorted(set(hs))),
                sum(1 for x in rows if x["dir_off_o"] == "desc"), len(rows)))
    P()
    P("# predictions")
    for m in (12, 16):
        o = out.get((m, 1.0))
        if o:
            P("  G1 M=%d s=1 greedy-off(o) > blind: %.4f vs %.4f -> %s" % (
                m, o["F_off_o"], o["F_blind"], "held" if o["F_off_o"] > o["F_blind"] else "refuted"))
    for m in (12, 16):
        o = out.get((m, 2.0))
        if o:
            P("  G2 M=%d s=2 greedy-off(o) < blind: %.4f vs %.4f -> %s" % (
                m, o["F_off_o"], o["F_blind"], "held" if o["F_off_o"] < o["F_blind"] else "refuted"))
    for m in (12, 16):
        for s in SCALES:
            o = out.get((m, s))
            if o:
                P("  G3 M=%d s=%g greedy-off(o) < sort(o): %.4f vs %.4f -> %s" % (
                    m, s, o["F_off_o"], o["F_sort_o"], "held" if o["F_off_o"] < o["F_sort_o"] else "refuted"))
    for m in (12, 16):
        o = out.get((m, 2.0))
        if o:
            P("  G4 M=%d s=2 greedy-off+descent(o) <= sort+descent(o): %.4f vs %.4f -> %s" % (
                m, o["F_offd_o"], o["F_sdesc_o"], "held" if o["F_offd_o"] <= o["F_sdesc_o"] else "refuted"))
    for m in (12, 16):
        o = out.get((m, 2.0))
        if o:
            P("  G5 M=%d s=2 median greedy-off/greedy-deg < 1: %.4f -> %s" % (
                m, o["off_deg"], "held" if o["off_deg"] < 1 else "refuted"))
    return out


def main(done):
    with gzip.open(os.path.join(HERE, "arrangement_plans.json.gz"), "rt") as f:
        aware = {(r["m"], r["idx"]): r for r in json.load(f)}
    with gzip.open(os.path.join(HERE, "sort_rule.json.gz"), "rt") as f:
        prev = {(r["m"], r["idx"]): r for r in json.load(f)}
    keys = [(m, n) for m in (12, 16) for n in dr.SIZES[m]]
    if "--quick" in sys.argv:
        keys = keys[:1]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = pool_.map(analyse, [(done[k], aware[k], prev[k]) for k in keys])
    if "--quick" not in sys.argv:
        with gzip.open(os.path.join(HERE, "greedy_rule.json.gz"), "wt") as f:
            json.dump(res, f, separators=(",", ":"))
    _, _, c10, _ = so._state()
    print("# Milestone 11as: an operator-level greedy rule against the aware search (greedy_rule.py's docstring). "
          "deliv ages, Z = %.2f m, 5-flight offsets (%s m at 10 m/s), %d draws, s = %s, %d spacings" % (
              Z, ", ".join("%+.2f" % v for v in sorted(c10)), DRAWS, ", ".join("%g" % s for s in SCALES), len(HG)))
    print("# blind, sort, sdesc (sort+descent) = 11ar's; g-off = greedy insertion in offset order (better of "
          "ascending and descending); g-deg = in conflict-weight order; g-offd = one descent from g-off; (o) = the "
          "spacing with the lowest F")
    summarise(res)
    print()
    print("# analysis CPU s per layout: median %.0f; greedy passes (3 per spacing and draw) per layout: median %.2f s"
          % (med(r["cpu"] for r in res), med(r["cpu_greedy"] for r in res)))


if __name__ == "__main__":
    if "--summarise" in sys.argv:
        with gzip.open(os.path.join(HERE, "greedy_rule.json.gz"), "rt") as f:
            summarise(json.load(f))
        sys.exit(0)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    missing = [(m, i) for m in (12, 16) for i in dr.SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
