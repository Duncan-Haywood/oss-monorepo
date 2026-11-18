"""Milestone 11aj driver (predictions in ref_mix.py's docstring). Needs numpy. Reuses 11ai's input cache:

    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build      # 11ai's W, X, A, B (seconds: read from leak_inputs.json.gz)
    OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 ref_mix_run.py > ref_mix_results.txt
REFMIX_KEEP=1 also writes ref_mix_res.pkl (per-layout plans) next to this file."""
import importlib.util
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


rm = _load("hub_airspace_ref_mix_11aj", "ref_mix.py")
ll = rm.ll
bc = _load("hub_airspace_band_cost_11aj", "band_cost.py")
bb = _load("hub_airspace_band_budget_11aj", "band_budget.py")
kw = _load("hub_airspace_split_kway_11aj", "split_kway.py")
SIZES = {12: range(1200, 1224), 16: range(1600, 1624)}
RESTARTS = 200
Z_MAIN, Z_SENS = 7.62, 4.572
HG = rm.hgrid()


def conditions():
    """(Z, sigma, q, sigma_m): the main grid plus the 15 ft sensitivity."""
    out = [(Z_MAIN, s, q, sm) for s in rm.SIGMAS for q in rm.QS for sm in rm.SIGMA_MS]
    out.append((Z_SENS, 1.0, 0.5, 3.0))
    return out


def blind(W, X, V, Z, sigma, seed):
    """11ai's planner at one sigma for every h (every pair same-class): {h: (k, labels, own objective)}.
    Uses ref_mix.Problem with one class, whose score is level_leak.score (tests) and whose descent is faster."""
    rows = {}
    one = np.zeros(W.shape[0], dtype=bool)
    for h in HG:
        k = bb.k_cap(ll.H_DEPTH, h, W.shape[0])
        lab, F = rm.Problem(W, X, V, one, h, Z, sigma, 0.0, k).search(restarts=RESTARTS, seed=seed)
        rows[h] = (k, lab, F)
    return rows


def best(rows):
    h = min(rows, key=lambda q: (rows[q][2], q))
    return h, rows[h]


def analyse(L):
    t0 = time.process_time()
    m, idx = L["m"], L["idx"]
    W, X = kw.matrix(L["cfD+"], m), kw.matrix(L["opp"], m)
    res = {"F1": float(W.sum()), "cond": {}}
    naive, cautious = {}, {}
    for c in conditions():
        Z, s, q, sm = c
        V = bc.V_of(L["T"], ll.tau_z(Z))
        if (Z, s) not in naive:
            naive[(Z, s)] = blind(W, X, V, Z, s, idx)
        s_eff = (s ** 2 + sm ** 2 / 2) ** 0.5
        if (Z, s_eff) not in cautious:
            cautious[(Z, s_eff)] = naive[(Z, s)] if sm == 0 else blind(W, X, V, Z, s_eff, idx + 7)
        nv, ct = naive[(Z, s)], cautious[(Z, s_eff)]
        cls = rm.classes(m, q, 1000 * idx + int(100 * q))
        aware = {}
        for h in HG:
            k = nv[h][0]
            P = rm.Problem(W, X, V, cls, h, Z, s, sm, k)
            lab, F = P.search(restarts=RESTARTS, seed=idx + 13, starts=[nv[h][1], ct[h][1]])
            aware[h] = (k, lab, F, P.mix_part(lab))
        ha, (ka, la, Fa, mixa) = best(aware)
        hn, (kn, ln, _) = best(nv)
        hc, (kc, lc, _) = best(ct)
        true = lambda h, lab: rm.Problem(W, X, V, cls, h, Z, s, sm, nv[h][0]).score(lab)
        mand = ll.score(W, X, V, nv[hn][1], *ll.level_weights(hn, Z, s, nv[hn][0]))
        res["cond"][c] = {
            "aware": (ha, ka, la, Fa, mixa), "naive": (hn, ln, true(hn, ln)), "cautious": (hc, lc, true(hc, lc)),
            "mandate": (hn, mand), "cls": cls, "seg": rm.segregated(la, cls), "spacer": rm.spacer_at_interface(la, cls),
            "used": len(set(la)), "curve": {h: aware[h][2] for h in HG}}
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
    P("# Milestone 11aj: mixed altitude references (ref_mix.py). H = %g m, %d spacings (%.2f..%.2f m), best of %d "
      "descents, 48 layouts; F = losses of separation per hour" % (ll.H_DEPTH, len(HG), HG[0], HG[-1], RESTARTS))
    P("# aware = knows each operator's class; naive = 11ai at sigma; cautious = 11ai at sqrt(sigma^2 + sigma_m^2/2); "
      "mandate = one reference for all (11ai at sigma). All plans scored under the true pair-dependent F.")
    for m in (12, 16):
        idx = [k for k in keys if k[0] == m]
        P()
        P("## M = %d (24 layouts)" % m)
        P("  Z     sigma  q     s_m   h*_aw  k_used  seg  spacer  mix_share  aw/mand  naive/aw  caut/aw  h*_naive  h*_caut  "
          "aw/F1  naive/mand  caut/mand")
        for c in conditions():
            R = [res[k]["cond"][c] for k in idx]
            P("  %-5.2f %-5.2f  %-4.2f  %-4.1f  %5.2f  %5.1f   %2d   %2d     %6.4f    %6.4f   %6.4f    %6.4f   %6.2f    %6.2f   "
              "%6.4f   %6.4f      %6.4f" % (c[0], c[1], c[2], c[3], med(r["aware"][0] for r in R), med(r["used"] for r in R),
                         sum(r["seg"] for r in R), sum(r["spacer"] for r in R), med(r["aware"][4] / r["aware"][3] for r in R),
                         med(r["aware"][3] / r["mandate"][1] for r in R), med(r["naive"][2] / r["aware"][3] for r in R),
                         med(r["cautious"][2] / r["aware"][3] for r in R), med(r["naive"][0] for r in R),
                         med(r["cautious"][0] for r in R), med(r["aware"][3] / res[k]["F1"] for r, k in zip(R, idx)),
                         med(r["naive"][2] / r["mandate"][1] for r in R), med(r["cautious"][2] / r["mandate"][1] for r in R)))
        c0 = (Z_MAIN, 1.0, 0.5, 0.0)
        R = [res[k]["cond"][c0] for k in idx]
        dev = max(max(abs(r["aware"][3] / r["mandate"][1] - 1), abs(r["naive"][2] / r["mandate"][1] - 1)) for r in R)
        P("P0 sigma_m = 0 (Z 7.62, sigma 1, q 0.5): max |ratio - 1| over aware, naive vs mandate = %.2e; median h* %.2f"
          % (dev, med(r["aware"][0] for r in R)))
        P("  ranges at Z 7.62, sigma 1, q 0.5, s_m 3: naive/aw %.3f..%.3f, caut/aw %.3f..%.3f, aw/mand %.3f..%.3f"
          % _ranges(res, idx))
    P()
    P("# analysis CPU s per layout: median %.0f" % med(res[k]["cpu"] for k in keys))
    if os.environ.get("REFMIX_KEEP"):
        pickle.dump(res, open(os.path.join(HERE, "ref_mix_res.pkl"), "wb"))


def _ranges(res, idx):
    R = [res[k]["cond"][(Z_MAIN, 1.0, 0.5, 3.0)] for k in idx]
    out = []
    for f in (lambda r: r["naive"][2] / r["aware"][3], lambda r: r["cautious"][2] / r["aware"][3],
              lambda r: r["aware"][3] / r["mandate"][1]):
        v = [f(r) for r in R]
        out += [min(v), max(v)]
    return tuple(out)


if __name__ == "__main__":
    cache = os.environ.get("LEAK_CACHE")
    done = pickle.load(open(cache, "rb"))
    if "--one" in sys.argv:
        k = next(iter(done))
        print(analyse(done[k])[1]["cpu"])
        sys.exit(0)
    missing = [(m, i) for m in (12, 16) for i in SIZES[m] if (m, i) not in done]
    if missing:
        sys.exit("cache incomplete: %d layouts missing (run level_leak_run.py --build first)" % len(missing))
    main(done)
