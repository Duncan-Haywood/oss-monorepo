"""Milestone 11al planner analysis (predictions P3, P5, P6 in drift_share.py's docstring). Needs numpy.

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build      # 11ai's inputs, unchanged
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 drift_share_run.py > drift_share_results.txt
"""
import importlib.util
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
import drift_share as ds  # noqa: E402


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ll = _load("hub_airspace_level_leak_11al", "level_leak.py")
bc = _load("hub_airspace_band_cost_11al", "band_cost.py")
bb = _load("hub_airspace_band_budget_11al", "band_budget.py")
kw = _load("hub_airspace_split_kway_11al", "split_kway.py")
rm = _load("hub_airspace_ref_mix_11al", "ref_mix.py")
rl = _load("hub_airspace_random_layouts_11al", "random_layouts.py")
SIZES = {12: range(1200, 1224), 16: range(1600, 1624)}
RESTARTS = 200
HG = rm.hgrid()
Z = ds.Z
_PTS = None


def pair_supports(idx, m, mission, rng, isd):
    """{(i, j): compressed pressure-part samples} for i <= j, and the per-drone drift sd s0 over all operators."""
    global _PTS
    if _PTS is None:
        _PTS = rl.load_nyc(10000.0)
    hubs, radii, speeds, _ = rl.draw_layout(_PTS, idx, m)
    mt = []
    for h, r, v in zip(hubs, radii, speeds):
        mine = [(x, y) for x, y in _PTS if 0 < (x - h[0]) ** 2 + (y - h[1]) ** 2 <= r * r]
        mt.append(ds.mission_minutes(h, mine, v))
    ages = [ds.drone_ages(rng, ds.N_MC, mission, mt[i]) for i in range(m)]
    sup = {}
    for i in range(m):
        for j in range(i, m):
            d = math.dist(hubs[i], hubs[j]) / 1000.0
            sup[(i, j)] = ds.compress(ds.gap_samples(rng, isd, ages[i], ages[j], d))
    s0 = float(np.std(np.concatenate([ds.drift_samples(rng, isd, a) for a in ages])))
    return sup, s0


def tables(sup, m, h, s, k):
    pw = np.zeros((m, m, k))
    px = np.zeros((m, m, k))
    for (i, j), dl in sup.items():
        a, b = ds.weights_from(h, Z, s, k, dl)
        pw[i, j] = pw[j, i] = a
        px[i, j] = px[j, i] = b
    return pw, px


def blind(W, X, V, sigma, seed):
    """11ai's planner (one Gaussian sigma for every pair) at every h: {h: (k, labels)}."""
    one = np.zeros(W.shape[0], dtype=bool)
    out = {}
    for h in HG:
        k = bb.k_cap(ll.H_DEPTH, h, W.shape[0])
        lab, F = rm.Problem(W, X, V, one, h, Z, sigma, 0.0, k).search(restarts=RESTARTS, seed=seed)
        out[h] = (k, lab, F)
    return out


def best(rows):
    h = min(rows, key=lambda q: (rows[q][-1], q))
    return h, rows[h]


def analyse(L):
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = kw.matrix(L["cfD+"], m), kw.matrix(L["opp"], m)
    V = bc.V_of(L["T"], ll.tau_z(Z))
    isd = ds.load_isd()
    res = {"F1": float(W.sum()), "cond": {}}
    for sn in ds.SIGMA_NS:
        none = blind(W, X, V, sn, idx)
        hn, (kn, ln, Fn0) = best(none)
        for mi, mission in enumerate(ds.MISSIONS):
            rng = np.random.default_rng(100000 * mi + idx)
            sup, s0 = pair_supports(idx, m, mission, rng, isd)
            s_ind = math.sqrt(sn ** 2 + s0 ** 2)
            ind = blind(W, X, V, s_ind, idx + 7)
            hi, (ki, li, _) = best(ind)
            aware, probs = {}, {}
            for h in HG:
                k = bb.k_cap(ll.H_DEPTH, h, m)
                Pp = ds.PairProblem(W, X, V, *tables(sup, m, h, sn * math.sqrt(2.0), k))
                lab, F = Pp.search(restarts=RESTARTS, seed=idx + 13, starts=[none[h][1], ind[h][1]])
                aware[h] = (k, lab, F)
                probs[h] = Pp
            ha, (ka, la, Fa) = best(aware)
            res["cond"][(sn, mission)] = {
                "s0": s0, "s_ind": s_ind, "aware": (ha, len(set(la)), Fa), "none": (hn, probs[hn].score(ln), Fn0),
                "indep": (hi, probs[hi].score(li)),
                "pair_sd": float(np.median([np.sqrt(np.mean(np.concatenate([v, -v]) ** 2)) for v in sup.values()]))}
    res["cpu"] = time.process_time() - t0
    print("M=%d layout %d analysed, %.0f CPU s" % (m, idx, res["cpu"]), file=sys.stderr, flush=True)
    return (m, idx), res


def med(x):
    return S.median(list(x))


def main(done):
    keys = [(m, n) for m in (12, 16) for n in SIZES[m]]
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        res = dict(pool_.map(analyse, [done[k] for k in keys]))
    pickle.dump(res, open(os.path.join(HERE, "drift_share_res.pkl"), "wb")) if os.environ.get("DRIFT_KEEP") else None
    P = print
    P("# Milestone 11al: planners under a shared take-off-zero barometric drift (drift_share.py). Z = %.2f m, H = %g m, "
      "%d spacings, best of %d descents, 48 layouts, %d Monte Carlo draws per operator pair" % (
          Z, ll.H_DEPTH, len(HG), RESTARTS, ds.N_MC))
    P("# aware = per-pair tables (shared field: time part over the take-off difference + space part at the hub "
      "separation, plus N(0, 2 sigma_n^2) noise); none = 11ai at sigma_n; indep = 11ai at sqrt(sigma_n^2 + s0^2).")
    P("# All plans scored under the aware (shared-field) F. F_none0 = the none plan under its own model (no pressure).")
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        P()
        P("## M = %d (24 layouts)" % m)
        P("  sigma_n  mission  s0_med  pair_sd_med  h*_aware  bands  h*_none  same_h  none/aware  max   h*_indep  "
          "indep/aware  max    aware/F_none0")
        for sn in ds.SIGMA_NS:
            for mission in ds.MISSIONS:
                R = [res[k]["cond"][(sn, mission)] for k in idx]
                P("  %4.2f     %-6s   %5.3f   %6.3f       %6.2f   %4.1f   %6.2f   %2d/24   %6.4f   %6.4f  %6.2f    "
                  "%6.4f   %6.4f   %6.4f" % (
                      sn, mission, med(r["s0"] for r in R), med(r["pair_sd"] for r in R), med(r["aware"][0] for r in R),
                      med(r["aware"][1] for r in R), med(r["none"][0] for r in R),
                      sum(abs(r["aware"][0] - r["none"][0]) < 1e-9 for r in R),
                      med(r["none"][1] / r["aware"][2] for r in R), max(r["none"][1] / r["aware"][2] for r in R),
                      med(r["indep"][0] for r in R), med(r["indep"][1] / r["aware"][2] for r in R),
                      max(r["indep"][1] / r["aware"][2] for r in R), med(r["aware"][2] / r["none"][2] for r in R)))
        P("  aware h* distribution per condition (h: layouts)")
        for sn in ds.SIGMA_NS:
            for mission in ds.MISSIONS:
                hs = [round(res[k]["cond"][(sn, mission)]["aware"][0], 2) for k in idx]
                P("    %4.2f %-6s %s" % (sn, mission, ", ".join("%g: %d" % (h, hs.count(h)) for h in sorted(set(hs)))))
    P()
    P("# analysis CPU s per layout: median %.0f" % med(res[k]["cpu"] for k in keys))


if __name__ == "__main__":
    done = pickle.load(open(os.environ["LEAK_CACHE"], "rb"))
    if "--one" in sys.argv:
        k = next(iter(done))
        print(analyse(done[k])[1])
        sys.exit(0)
    missing = [(m, i) for m in (12, 16) for i in SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
