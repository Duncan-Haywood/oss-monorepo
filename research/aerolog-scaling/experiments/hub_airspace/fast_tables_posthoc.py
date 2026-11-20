"""Milestone 11au post hoc (not predicted; written after fast_tables_results.txt was read): are T6's misses search
luck or a narrower spacing that is really better?

T6 found 5 of 384 draws where the best R20 plan over the 10 k-widest spacings costs more than the best over all 30.
For each, this rebuilds (kernel tables, exact to 4e-8 by T1) the winning spacing h* and the widest spacing h_w with
the same band count k, reruns fast_tables' R20 at h* with its seed (reproducing its labels), and scores those labels
at h_w. If F(labels*, h_w) <= F(labels*, h*), the wider spacing is at least as good for the same plan and the miss
came from R20's random starts at h_w (another seed stream), not from the k-widest rule. Also: R200 (200 starts) at
h_w, seed 95000 + the fast_tables seed terms.

Second check, also post hoc: the 30-spacing grid (ref_mix.hgrid) adds H / (2k - 1) rounded to 6 decimals, and for
k = 6 (10.909091) and k = 11 (5.714286) the rounding lands just above H / (2k - 1), so k_cap gives k - 1: no spacing
on the grid has 6 or 11 bands, in this or any earlier milestone that uses the grid. With kernel tables these two
spacings cost about a second per layout, so: at h = H / 11 (6 bands) and H / 21 (11 bands), exact, R200 (seed 97000 +
the fast_tables seed terms) on kernel tables, for every layout and draw, against 11aq's aware F.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 fast_tables_posthoc.py > fast_tables_posthoc_results.txt
"""
import statistics as S
import time
import gzip
import json
import os
import pickle
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import drift_share as ds  # noqa: E402
import drift_share_run as dr  # noqa: E402
import fast_tables as ft  # noqa: E402
import speed_offset as so  # noqa: E402


def main():
    with gzip.open(os.path.join(HERE, "fast_tables.json.gz"), "rt") as f:
        res = json.load(f)
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    _, scales, c10, _ = so._state()
    kern = ft.Kernel(scales)
    isd = ds.load_isd()
    misses = [(r, si, s, dd, x) for r in res for si, s in enumerate(ft.SCALES)
              for dd, x in enumerate(r["cells"][str(s)]) if x["F_lw"] > x["F_l"] * (1 + 1e-12)]
    print("# Milestone 11au post hoc: T6's %d misses (fast_tables_posthoc.py's docstring)" % len(misses))
    print("# M idx s draw | h* k | h_w | F(lab*,h*) | F(lab*,h_w)/F(lab*,h*) | R20 at h_w / F(lab*,h*) | "
          "R200 at h_w / F(lab*,h*)")
    for r, si, s, dd, x in misses:
        m, idx = r["m"], r["idx"]
        L = done[(m, idx)]
        W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
        V = dr.bc.V_of(L["T"], dr.ll.tau_z(ds.Z))
        sup, _ = dr.pair_supports(idx, m, "deliv", np.random.default_rng(idx), isd)
        sup_b = so.with_offsets(sup, so.draw_offsets(c10, m, s, 7000 * dd + idx))
        hs, k = x["h_l"], dr.bb.k_cap(ft.H, x["h_l"], m)
        hw = max(h for h in ft.HG if dr.bb.k_cap(ft.H, h, m) == k)
        seed = 90000 + 1000 * dd + 100 * si + idx
        Ps = ds.PairProblem(W, X, V, *ft.tables_kernel(kern, sup_b, m, hs, k))
        Pw = ds.PairProblem(W, X, V, *ft.tables_kernel(kern, sup_b, m, hw, k))
        lab, F = ft.r_search(Ps, m, k, np.random.default_rng(seed))
        assert abs(F / x["F_l"] - 1) < 1e-6, "R20 at h* not reproduced"
        Fw = Pw.score(lab)
        _, F20 = ft.r_search(Pw, m, k, np.random.default_rng(seed))
        _, F200 = ft.r_search(Pw, m, k, np.random.default_rng(seed + 5000), R=200)
        print("  %d %d %g %d | %.4f %d | %.4f | %.4f | %.6f | %.6f | %.6f"
              % (m, idx, s, dd, hs, k, hw, F, Fw / F, F20 / F, F200 / F))

    print()
    print("# missing band counts: R200 at H/11 (k = 6) and H/21 (k = 11) against 11aq's aware F (best of the 30-grid)")
    t0 = time.process_time()
    for m in (12, 16):
        for si, s in enumerate(ft.SCALES):
            rat = {6: [], 11: []}
            for r in (q for q in res if q["m"] == m):
                idx = r["idx"]
                L = done[(m, idx)]
                W, X = dr.kw.matrix(L["cfD+"], m), dr.kw.matrix(L["opp"], m)
                V = dr.bc.V_of(L["T"], dr.ll.tau_z(ds.Z))
                sup, _ = dr.pair_supports(idx, m, "deliv", np.random.default_rng(idx), isd)
                for dd, x in enumerate(r["cells"][str(s)]):
                    sup_b = so.with_offsets(sup, so.draw_offsets(c10, m, s, 7000 * dd + idx))
                    for kk in (6, 11):
                        h = ft.H / (2 * kk - 1)
                        assert dr.bb.k_cap(ft.H, h, m) == kk
                        P = ds.PairProblem(W, X, V, *ft.tables_kernel(kern, sup_b, m, h, kk))
                        _, F = ft.r_search(P, m, kk, np.random.default_rng(97000 + 1000 * dd + 100 * si + idx), R=200)
                        rat[kk].append(F / x["F_aware"])
            for kk in (6, 11):
                v = rat[kk]
                print("  M = %d, s = %g, k = %2d (h = %.4f m): median %.4f, min %.4f; below the aware F in %d of %d"
                      % (m, s, kk, ft.H / (2 * kk - 1), S.median(v), min(v), sum(1 for q in v if q < 1 - 1e-9), len(v)))
    print("# CPU for the missing-band check (48 layouts x 8 draws x 2 spacings x 200 starts): %.0f s"
          % (time.process_time() - t0))


if __name__ == "__main__":
    main()
