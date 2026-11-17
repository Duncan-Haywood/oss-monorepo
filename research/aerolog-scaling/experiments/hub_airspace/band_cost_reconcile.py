"""Milestone 11ag post hoc reconciliation with 11af (vertical_transit.py), run after both had finished: the loss of
11ad's en-route 4-group plan (best stacking order) against the best 4-band labelling, on this step's terms, with and
without 11af's within-group transit term (same-group cost W + V / 4), at 11af's tau = 3.05 s and this step's 5 s.

    OMP_NUM_THREADS=1 BAND_CACHE=band.pkl python3 band_cost_reconcile.py > band_cost_reconcile_results.txt
(BAND_CACHE is band_cost_run.py's cache.)"""
import pickle, sys, os, multiprocessing as mp
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import band_cost as bc, split_kway as kw
d = pickle.load(open(os.environ.get('BAND_CACHE', 'band.pkl'), 'rb'))
def job(key):
    L = d[key]; m = L['m']; W = kw.matrix(L['cfD+'], m)
    out = {}
    for tau in (3.05, 5.0):
        V = bc.V_of(L['T'], tau)
        for name, Wx in (("mine", W), ("same_group_c", W + V / 4.0)):
            _, F4 = bc.search_bands(Wx, V, 4)
            elab, _ = kw.local_search(W, 4)
            Fe = bc.best_order(Wx, V, elab)[1]
            out[(tau, name)] = Fe / F4
    return key, out
if __name__ == "__main__":
    keys = [k for k in d if k != "mc"]
    with mp.Pool(4) as p:
        res = dict(p.map(job, keys))
    import statistics as S
    for m in (12, 16):
        for tau in (3.05, 5.0):
            for name in ("mine", "same_group_c"):
                v = [res[k][(tau, name)] for k in keys if k[0] == m]
                print("M=%d tau=%.2f %-13s enr_plan mean loss %.4f median %.4f max %.4f" % (m, tau, name, S.mean(v), S.median(v), max(v)))
