"""Milestone 11af post hoc (written after vertical_transit_results.txt was seen; nothing here was predicted).

Two questions the pre-registered run raised:
 Q1 Without the constant own-fleet term c_ii (own transits through own traffic, mostly at the own hub, the same for
    every partition), how much of the partition-dependent cost do groups remove, and how is what is left split
    between en-route sharing and transits?
 Q2 Every layout used all 8 groups at every tau up to 12 s. How much larger would the cross-operator transit charge
    have to be (a multiplier f on c, standing for thicker conflict layers, slower climbs or a vertical conflict
    rule stricter than one band) before the best stack uses fewer groups? f = 1, 2, 4, 8, 16 at tau = 3.05 s.

    OMP_NUM_THREADS=1 VT_CACHE=vt.pkl python3 vertical_transit_posthoc.py > vertical_transit_posthoc_results.txt
Needs the VT_CACHE written by vertical_transit_run.py (recomputes it, ~50 min on 4 cores, if absent)."""
import multiprocessing as mp
import os
import pickle
import statistics as S
import time

import numpy as np

import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_vt_run_posthoc", os.path.join(HERE, "vertical_transit_run.py"))
vr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vr)
vt = vr.vt
HEAD = vr.HEAD
FS = (1, 2, 4, 8, 16)


def _scaled(job):
    key, W, c, f = job
    cs = c * f
    np.fill_diagonal(cs, np.diag(c))          # own-fleet term is not scaled: it does not change any choice
    pos, T = vt.local_search_T(W, cs, 8, restarts=vr.RESTARTS, seed=9000 + key[1])
    return key, f, vt.used(pos), T, vt.total(W, cs, (0,) * W.shape[0])


def main():
    t0 = time.time()
    cache = os.environ.get("VT_CACHE")
    if not (cache and os.path.exists(cache)):
        vr.main()
    done = pickle.load(open(cache, "rb"))
    P = print
    P("# Milestone 11af post hoc (vertical_transit_posthoc.py; written after the main results were seen)")
    P("## Q1: tau = %.2f s, own-fleet term c_ii removed. D = T - trace(c) (partition-dependent cost); D1 = all in one "
      "group; at the best stack with at most 8 groups: en = en-route weight still shared, xs = cross transits through "
      "the other band of the own group, xb = cross transits through lower groups" % HEAD)
    for m in (12, 16):
        rows = []
        for n in vr.SIZES[m]:
            d = done[(m, n)]
            W, c = d["W"], vt.c_matrix(d["tt"], HEAD)
            cx = c - np.diag(np.diag(c))
            pos = d["res"][(HEAD, 8)]["pos"]
            p = np.array(pos)
            same = p[:, None] == p[None, :]
            below = p[None, :] < p[:, None]
            en, xs, xb = float((W * same).sum()), float((cx * same).sum()), float((4 * cx * below).sum())
            D1 = float(W.sum() + cx.sum())
            rows.append((en + xs + xb) / D1)
            rows[-1] = (rows[-1], en / D1, xs / D1, xb / D1, (en + xs + xb) / float(W.sum()))
        P("M=%d medians: D_best/D1 %.4f; en %.4f, xs %.4f, xb %.4f of D1; D_best / total en-route weight %.4f "
          "[11ad, no transit charge: k = 8 keeps 0.029 / 0.022]" % ((m,) + tuple(S.median(r[q] for r in rows)
                                                                    for q in range(5))))
    P()
    P("## Q2: groups used by the best stack (at most 8) when the cross-operator transit charge is multiplied by f")
    jobs = []
    for m in (12, 16):
        for n in vr.SIZES[m]:
            d = done[(m, n)]
            c = vt.c_matrix(d["tt"], HEAD)
            for f in FS:
                jobs.append(((m, n), d["W"], c, f))
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        out = pool_.map(_scaled, jobs)
    for m in (12, 16):
        for f in FS:
            u = [o[2] for o in out if o[0][0] == m and o[1] == f]
            r = [o[3] / o[4] for o in out if o[0][0] == m and o[1] == f]
            P("M=%d f=%2d: groups used %s; median %.1f; median T_best/T1 %.4f" % (
                m, f, " ".join("%d:%d" % (g, u.count(g)) for g in sorted(set(u))), S.median(u), S.median(r)))
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
