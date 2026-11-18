"""Milestone 11ai, post hoc (written after level_leak_results.txt was seen): the 2 m h grid skips some band counts
(at H = 120 m it gives k = 12, 9, 7, 5, 4, 3, 2, 1, never 6, 8, 10 or 11), so the grid's h* is the best of the counts
it happens to reach. Here every band count k = 1..M is evaluated at the widest spacing that fits it,
h_k = H / (2k - 1) (wider spacing at the same k only lowers leakage, and with tau = 2Z/w it changes nothing else), so
the choice is over k directly. Same inputs, model, conditions and search as level_leak_run.analyse.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_posthoc.py > level_leak_posthoc_results.txt
"""
import multiprocessing as mp
import os
import pickle
import statistics as S

import numpy as np

import level_leak_run as r

ll, bc, bb, kw = r.ll, r.bc, r.bb, r.kw


def analyse(L):
    m = L["m"]
    W, X = kw.matrix(L["cfD+"], m), kw.matrix(L["opp"], m)
    F1 = float(W.sum())
    lab0, _ = bc.search_bands(W, bc.V_of(L["T"], bb.tau_of(7.62)), bb.k_cap(ll.H_DEPTH, 7.62, m))
    out = {}
    for c in r.conditions():
        name, Z, s, dist, tc = c
        rows = {}
        for k in range(1, m + 1):
            h = ll.H_DEPTH / (2 * k - 1)
            tau = ll.tau_z(Z) if tc == "z" else ll.tau_h(h)
            V = bc.V_of(L["T"], tau)
            pw, px = ll.level_weights(h, Z, s, k, dist)
            lab, F = ll.search(W, X, V, k, pw, px, restarts=r.RESTARTS, seed=L["idx"],
                               starts=[lab0] if max(lab0) < k else [])
            rows[k] = (h, F / F1, ll.parts(W, X, V, lab, pw, px)[1] / F if F else 0.0)
        out[c] = rows
    return (m, L["idx"]), out


def main():
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    keys = [(m, n) for m in (12, 16) for n in r.SIZES[m]]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = dict(pool_.map(analyse, [done[k] for k in keys]))
    print("# Milestone 11ai post hoc: every band count k at its widest spacing h_k = %g / (2k - 1) m; medians over 24 "
          "layouts; best of %d descents" % (ll.H_DEPTH, r.RESTARTS))
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        print()
        print("## M = %d: k* (median, range), h_k* (m), F*/F_1, leak share at k*; then median F/F_1 by k" % m)
        print("  cond     Z     sigma   k*_med k*_range  h*_med   F*/F_1  leak   | " + " ".join("k=%-4d" % k for k in range(1, m + 1)))
        for c in r.conditions():
            ks, fs, lk = [], [], []
            for x in idx:
                rows = res[x][c]
                k = min(rows, key=lambda q: (rows[q][1], q))
                ks.append(k)
                fs.append(rows[k][1])
                lk.append(rows[k][2])
            curve = " ".join("%6.3f" % S.median(res[x][c][k][1] for x in idx) for k in range(1, m + 1))
            print("  %-8s %5.2f  %4.2f   %5.1f   %2d..%-2d   %6.2f   %6.4f  %5.3f  | %s" % (
                c[0], c[1], c[2], S.median(ks), min(ks), max(ks), ll.H_DEPTH / (2 * S.median(ks) - 1),
                S.median(fs), S.median(lk), curve))


if __name__ == "__main__":
    main()
