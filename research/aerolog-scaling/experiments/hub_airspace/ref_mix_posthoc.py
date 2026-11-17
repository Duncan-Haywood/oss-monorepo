"""Milestone 11aj post hoc (written after ref_mix_results.txt was read, so no predictions): what does it cost to force
the two altitude-reference classes into separate blocks of the stack, as a rule "baro operators below, GNSS above"
would? For each layout and condition, the best segregated plan at the aware planner's h: every split position t and
both orders (class A at positions <= t, class B at >= t), best of 40 descents each with the other positions masked,
plus the aware plan when it is already segregated.

    OMP_NUM_THREADS=1 REFMIX_KEEP=1 LEAK_CACHE=leak.pkl python3 ref_mix_run.py > ref_mix_results.txt   # writes ref_mix_res.pkl
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 ref_mix_posthoc.py > ref_mix_posthoc_results.txt
"""
import importlib.util
import multiprocessing as mp
import os
import pickle
import statistics as S
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ref_mix_run_posthoc", os.path.join(HERE, "ref_mix_run.py"))
rr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rr)
rm, ll, bc, kw = rr.rm, rr.ll, rr.bc, rr.kw
CONDS = [(7.62, 1.0, 0.5, 1.0), (7.62, 1.0, 0.5, 3.0), (7.62, 1.0, 0.5, 5.0), (7.62, 0.5, 0.5, 5.0), (7.62, 1.0, 0.25, 5.0)]
RESTARTS = 40
BIG = 1e9


def masked_search(P, allowed, seed):
    """P.descend with positions outside `allowed` (m x k bool) priced out; random starts inside the mask."""
    G = P._pair_table()
    m, k = allowed.shape
    pen = np.where(allowed, 0.0, BIG)
    rng = np.random.default_rng(seed)
    ar = np.arange(m)
    best, arg = np.inf, None
    for _ in range(RESTARTS):
        lab = np.array([rng.choice(np.nonzero(allowed[i])[0]) for i in range(m)])
        cost = G[ar[:, None], ar[None, :], :, lab[None, :]].sum(axis=1)
        while True:
            c = cost + pen
            d = c - c[ar, lab][:, None]
            i, a = np.unravel_index(int(d.argmin()), d.shape)
            if not d[i, a] < -1e-12 * max(1.0, abs(c[i, lab[i]])):
                break
            cost += G[:, i, :, a] - G[:, i, :, lab[i]]
            lab[i] = a
        f = P.score(lab)
        if f < best:
            best, arg = f, tuple(int(x) for x in lab)
    return arg, best


def analyse(args):
    L, R = args
    m, idx = L["m"], L["idx"]
    W, X = kw.matrix(L["cfD+"], m), kw.matrix(L["opp"], m)
    out = {}
    for c in CONDS:
        Z, s, q, sm = c
        r = R["cond"][c]
        h, k, la, Fa, _ = r["aware"]
        cls = r["cls"]
        P = rm.Problem(W, X, bc.V_of(L["T"], ll.tau_z(Z)), cls, h, Z, s, sm, k)
        best, arg = (Fa, la) if r["seg"] else (np.inf, None)
        for t in range(k):
            for lowcls in (True, False):
                allowed = np.zeros((m, k), dtype=bool)
                low = cls == lowcls
                allowed[low, :t + 1] = True
                allowed[~low, t:] = True
                lab, f = masked_search(P, allowed, idx + t)
                if f < best:
                    best, arg = f, lab
        out[c] = {"Fseg": best, "Fa": Fa, "spacer": rm.spacer_at_interface(arg, cls), "Fmand": r["mandate"][1],
                  "Fnaive": r["naive"][2]}
    print("M=%d layout %d" % (m, idx), file=sys.stderr, flush=True)
    return (m, idx), out


def main():
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    res = pickle.load(open(os.path.join(HERE, "ref_mix_res.pkl"), "rb"))
    keys = sorted(res)
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        out = dict(pool_.map(analyse, [(done[k], res[k]) for k in keys]))
    print("# Milestone 11aj post hoc: forced segregation of the two reference classes at the aware planner's h "
          "(best of every split position and order, %d descents each)" % RESTARTS)
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        print()
        print("## M = %d" % m)
        print("  Z     sigma  q     s_m   seg/aware_med  seg/aware_max  seg/mand_med  naive/mand_med  aware/mand_med  "
              "spacer_in_seg")
        for c in CONDS:
            O = [out[k][c] for k in idx]
            r1 = [o["Fseg"] / o["Fa"] for o in O]
            print("  %-5.2f %-5.2f  %-4.2f  %-4.1f  %8.4f       %8.4f       %8.4f      %8.4f        %8.4f        %2d / 24" % (
                c + (S.median(r1), max(r1), S.median(o["Fseg"] / o["Fmand"] for o in O),
                     S.median(o["Fnaive"] / o["Fmand"] for o in O), S.median(o["Fa"] / o["Fmand"] for o in O),
                     sum(o["spacer"] for o in O))))


if __name__ == "__main__":
    main()
