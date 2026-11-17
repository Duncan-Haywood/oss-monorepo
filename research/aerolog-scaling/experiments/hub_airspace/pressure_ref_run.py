"""Milestone 11ak driver, planner part (predictions P5, P6 in pressure_ref.py's docstring). Needs numpy. Reuses 11ai's
input cache and 11aj's planners, with the mixed-pair loss probabilities taken from the sourced mismatch:

    python3 pressure_stats.py > pressure_stats_results.txt                       # writes pressure_mismatch_samples.json
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build      # 11ai's W, X, A, B
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 pressure_ref_run.py > pressure_ref_results.txt
"""
import importlib.util
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


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rmr = _load("hub_airspace_ref_mix_run_11ak", "ref_mix_run.py")
pr = _load("hub_airspace_pressure_ref_11ak", "pressure_ref.py")
rm, ll, bc, bb, kw = rmr.rm, rmr.ll, rmr.bc, rmr.bb, rmr.kw
SIZES, RESTARTS, HG = rmr.SIZES, rmr.RESTARTS, rmr.HG
Z, SIGMA = rmr.Z_MAIN, 1.0
DISTS = ("S1_JFK", "S2_JFK_LGA")
QS = (0.5, 0.25)
SAMPLES = json.load(open(os.path.join(HERE, "pressure_mismatch_samples.json")))


class EmpProblem(rm.Problem):
    """11aj's Problem with the mixed-pair (pw, px) from an empirical mismatch distribution (pressure_ref)."""

    def __init__(self, W, X, V, cls, h, Z, sigma, dist, k):
        super().__init__(W, X, V, cls, h, Z, sigma, 0.0, k)
        pw, px = _mix_weights(h, Z, sigma, k, dist)
        self.pwm, self.pxm = np.array(pw), np.array(px)


_CACHE = {}


def _mix_weights(h, Z, sigma, k, dist):
    key = (round(h, 6), Z, sigma, k, dist)
    if key not in _CACHE:
        d = SAMPLES[dist]
        _CACHE[key] = pr.weights_mixture(h, Z, sigma, k, d["centres"], d["counts"])
    return _CACHE[key]


def analyse(L):
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = kw.matrix(L["cfD+"], m), kw.matrix(L["opp"], m)
    V = bc.V_of(L["T"], ll.tau_z(Z))
    res = {"F1": float(W.sum()), "cond": {}}
    nv = rmr.blind(W, X, V, Z, SIGMA, idx)
    hn, (kn, ln, _) = rmr.best(nv)
    mand = ll.score(W, X, V, ln, *ll.level_weights(hn, Z, SIGMA, kn))
    for dist in DISTS:
        sm = SAMPLES[dist]["sd"]
        s_eff = (SIGMA ** 2 + sm ** 2 / 2) ** 0.5
        ct = rmr.blind(W, X, V, Z, s_eff, idx + 7)
        hc, (kc, lc, _) = rmr.best(ct)
        for q in QS:
            cls = rm.classes(m, q, 1000 * idx + int(100 * q))
            emp = lambda h: EmpProblem(W, X, V, cls, h, Z, SIGMA, dist, nv[h][0])
            gau = lambda h: rm.Problem(W, X, V, cls, h, Z, SIGMA, sm, nv[h][0])
            ag, ae = {}, {}
            for h in HG:
                Pg, Pe = gau(h), emp(h)
                lg, Fg = Pg.search(restarts=RESTARTS, seed=idx + 13, starts=[nv[h][1], ct[h][1]])
                le, Fe = Pe.search(restarts=RESTARTS, seed=idx + 17, starts=[nv[h][1], ct[h][1], lg])
                ag[h] = (lg, Fg, Pe.score(lg))
                ae[h] = (le, Fe, Pe.mix_part(le), Pg.score(le))
            hg = min(ag, key=lambda q_: (ag[q_][1], q_))           # the Gaussian planner picks h on its own model
            he = min(ae, key=lambda q_: (ae[q_][1], q_))
            res["cond"][(dist, q)] = {
                "emp": (he, ae[he][0], ae[he][1], ae[he][2], ae[he][3]), "gauss": (hg, ag[hg][0], ag[hg][2], ag[hg][1]),
                "naive": (hn, emp(hn).score(ln)), "cautious": (hc, emp(hc).score(lc)), "mandate": mand,
                "seg": rm.segregated(ae[he][0], cls), "used": len(set(ae[he][0])),
                "same_plan": ae[he][1] / ae[he][3]}
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.0f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return (m, idx), res


def med(x):
    return S.median(list(x))


def main(done):
    keys = [(m, n) for m in (12, 16) for n in SIZES[m]]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = dict(pool_.map(analyse, [done[k] for k in keys]))
    P = print
    P("# Milestone 11ak: planners under the sourced reference mismatch (pressure_ref.py). Z = %.2f m, sigma = %g m, "
      "H = %g m, %d spacings, best of %d descents, 48 layouts" % (Z, SIGMA, ll.H_DEPTH, len(HG), RESTARTS))
    P("# emp = aware planner on the empirical mismatch; gauss = aware planner assuming a Gaussian of the same sd; "
      "naive = 11ai at sigma; cautious = 11ai at sqrt(sigma^2 + sd^2/2); mandate = one reference. All scored under "
      "the empirical F.")
    for d in DISTS:
        P("# %s: sd %.3f m, %d minute samples" % (d, SAMPLES[d]["sd"], SAMPLES[d]["n"]))
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        P()
        P("## M = %d (24 layouts)" % m)
        P("  dist        q     h*_emp  k_used  seg  mix_share  emp/mand  gauss/emp  naive/emp  caut/emp  h*_gauss  "
          "h*_caut  Femp/Fgau(same plan)  naive/mand  max gauss/emp  max naive/emp")
        for d in DISTS:
            for q in QS:
                R = [res[k]["cond"][(d, q)] for k in idx]
                P("  %-10s  %-4.2f  %6.2f  %5.1f   %2d    %6.4f    %6.4f   %6.4f     %6.4f     %6.4f    %6.2f    %6.2f"
                  "     %6.4f              %6.4f      %6.4f         %6.4f"
                  % (d, q, med(r["emp"][0] for r in R), med(r["used"] for r in R), sum(r["seg"] for r in R),
                     med(r["emp"][3] / r["emp"][2] for r in R), med(r["emp"][2] / r["mandate"] for r in R),
                     med(r["gauss"][2] / r["emp"][2] for r in R), med(r["naive"][1] / r["emp"][2] for r in R),
                     med(r["cautious"][1] / r["emp"][2] for r in R), med(r["gauss"][0] for r in R),
                     med(r["cautious"][0] for r in R), med(r["same_plan"] for r in R),
                     med(r["naive"][1] / r["mandate"] for r in R), max(r["gauss"][2] / r["emp"][2] for r in R),
                     max(r["naive"][1] / r["emp"][2] for r in R)))
    P()
    P("# analysis CPU s per layout: median %.0f" % med(res[k]["cpu"] for k in keys))


if __name__ == "__main__":
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    if "--one" in sys.argv:
        print(analyse(done[next(iter(done))])[1]["cpu"])
        sys.exit(0)
    missing = [(m, i) for m in (12, 16) for i in SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
