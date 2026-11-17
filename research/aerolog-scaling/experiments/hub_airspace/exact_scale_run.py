"""Milestone 11ae driver: exact_D on eight 12-operator and four 16-operator layouts, against cf_D+, for two-layer
splits, four-group partitions and recursive bisection (predictions in exact_scale.py's docstring). Needs numpy.

    OMP_NUM_THREADS=1 ESCALE_CACHE=escale.pkl python3 exact_scale_run.py > exact_scale_results.txt   # ~2 h, 4 cores
ESCALE_CACHE=<file.pkl> caches per-layout results (written after every layout) so the analysis can be re-run."""
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


es = _load("hub_airspace_exact_scale_11ae", "exact_scale.py")
ed = _load("hub_airspace_exact_dense_11ae", "exact_dense.py")
kw = _load("hub_airspace_split_kway_11ae", "split_kway.py")
ssr = _load("hub_airspace_split_scale_run_11ae", "split_scale_run.py")
rl = ssr.rl
LAYOUTS = es.LAYOUTS
KEYS = ["cfD+", "E", "gas_d", "gas_d+"]
RESTARTS = 200


def run_layout(job):
    m, idx = job
    L = ssr.run_layout(job)
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx, m)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    stats = {}
    c0 = time.process_time()
    E = ed.exact_terms(mix, speeds, ssr.LAM, R=ssr.R, stats=stats)
    cpu_E = time.process_time() - c0
    t = time.process_time()
    W = {"cfD+": kw.matrix(L["cfD+"], m), "E": kw.matrix(E["all"], m), "E_even": kw.matrix(E["even"], m),
         "E_odd": kw.matrix(E["odd"], m), "gas_d": kw.matrix(L["gas_d"], m), "gas_d+": kw.matrix(L["gas_d+"], m)}
    Ws = np.stack([W[k] for k in KEYS])
    picks = {}
    for k in (2, 4):
        if k == 2 or m == 12:
            arg, _ = kw.exhaustive(Ws, k)
            for q, key in enumerate(KEYS):
                picks[(key, k)] = kw.canonical(arg[q])
        else:
            for q, key in enumerate(KEYS):
                picks[(key, k)] = kw.local_search(Ws[q], k, restarts=RESTARTS, seed=4000 + m)[0]
    rb = {key: kw.recursive_bisection(W[key]) for key in ("cfD+", "E")}
    out = {"m": m, "idx": idx, "W": W, "picks": picks, "rb": rb, "cpu": L["cpu"], "cpu_E": cpu_E,
           "part_cpu": time.process_time() - t, "stats_E": stats, "all_E": sum(E["all"].values()),
           "all_cf": sum(L["cfD+"].values())}
    print("M=%d layout %d done: weights %.0f, exact_D %.0f CPU s" % (m, idx, sum(L["cpu"].values()), cpu_E),
          file=sys.stderr, flush=True)
    return out


def main():
    t0 = time.time()
    cache = os.environ.get("ESCALE_CACHE")
    done = {}
    if cache and os.path.exists(cache):
        done = pickle.load(open(cache, "rb"))
    todo = [(m, i) for m in (16, 12) for i in LAYOUTS[m] if (m, i) not in done]
    if todo:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            for L in pool_.imap_unordered(run_layout, todo):
                done[(L["m"], L["idx"])] = L
                if cache:
                    pickle.dump(done, open(cache + ".tmp", "wb"))
                    os.replace(cache + ".tmp", cache)
    P = print
    sc = kw.score
    P("# Milestone 11ae: exact_D (exact_dense.exact_terms, K = %d) against cf_D+ with 12 and 16 operators (exact_scale.py)"
      % ed.K_ZONE)
    P("# semi, R = %.0f m, Lambda = %d/h; layouts %s and %s; k = 2 exhaustive; k = 4 exhaustive at M = 12, best of %d "
      "descents at M = 16" % (ssr.R, ssr.LAM, LAYOUTS[12], LAYOUTS[16], RESTARTS))
    res = {}
    for m in (12, 16):
        P()
        P("## M = %d per layout" % m)
        P("idx   cfD+/E   r_pair  even/all  odd/all  same2  lossE2  lossD2  ret2_E  ret2_cf  same4  lossE4  ret4_E  "
          "ret4_cf  rbE    rbcf   gdE2    gdD2    gdE4    gdD4   CPU_E")
        for n in LAYOUTS[m]:
            D = done[(m, n)]
            W, pk = D["W"], D["picks"]
            WE, WC = W["E"], W["cfD+"]
            tE, tC = es.enroute_total(WE), es.enroute_total(WC)
            r = {"ratio": tC / tE, "r": es.pearson(es.cross_pairs(WC), es.cross_pairs(WE)),
                 "even": es.enroute_total(W["E_even"]) / tE, "odd": es.enroute_total(W["E_odd"]) / tE, "tE": tE,
                 "tC": tC, "cpu": D["cpu_E"]}
            for k in (2, 4):
                bE, bC = pk[("E", k)], pk[("cfD+", k)]
                r[("same", k)] = tuple(bE) == tuple(bC)
                r[("lossE", k)] = es.loss(WE, bC, bE, sc)
                r[("retE", k)] = float(sc(WE, bE)) / tE
                r[("retC", k)] = float(sc(WC, bC)) / tC
                for g in ("gas_d", "gas_d+"):
                    r[(g, "E", k)] = es.loss(WE, pk[(g, k)], bE, sc)
                    r[(g, "D", k)] = es.loss(WC, pk[(g, k)], bC, sc)
            r["rbE"] = es.loss(WE, D["rb"]["E"], pk[("E", 4)], sc)
            r["rbC"] = es.loss(WC, D["rb"]["cfD+"], pk[("cfD+", 4)], sc)
            res[(m, n)] = r
            P("%4d  %.4f  %.5f  %.5f  %.5f  %5s  %.4f  %.4f  %.4f  %.4f  %5s  %.4f  %.4f  %.4f  %.4f  %.4f  %.4f  %.4f  "
              "%.4f  %.4f  %5.0f" % (
                  n, r["ratio"], r["r"], r["even"], r["odd"], r[("same", 2)], r[("lossE", 2)], 1.0, r[("retE", 2)],
                  r[("retC", 2)], r[("same", 4)], r[("lossE", 4)], r[("retE", 4)], r[("retC", 4)], r["rbE"], r["rbC"],
                  r[("gas_d", "E", 2)], r[("gas_d", "D", 2)], r[("gas_d", "E", 4)], r[("gas_d", "D", 4)], r["cpu"]))
        idx = LAYOUTS[m]
        rs = [res[(m, n)] for n in idx]
        P("M=%d: pooled cfD+/E %.4f (sd over layouts %.4f, range %.4f to %.4f); all-zone cfD+/E pooled %.4f" % (
            m, es.pooled_ratio([x["tC"] for x in rs], [x["tE"] for x in rs]), S.pstdev([x["ratio"] for x in rs]),
            min(x["ratio"] for x in rs), max(x["ratio"] for x in rs),
            sum(done[(m, n)]["all_cf"] for n in idx) / sum(done[(m, n)]["all_E"] for n in idx)))
        for g in ("gas_d", "gas_d+"):
            P("M=%d %s: mean loss_E k=2 %.4f (loss_D %.4f), k=4 %.4f (loss_D %.4f)" % (
                m, g, S.mean(x[(g, "E", 2)] for x in rs), S.mean(x[(g, "D", 2)] for x in rs),
                S.mean(x[(g, "E", 4)] for x in rs), S.mean(x[(g, "D", 4)] for x in rs)))
        P("M=%d CPU s per layout: exact_D mean %.0f max %.0f; cf_D+ mean %.0f; partitions mean %.0f; box-candidate "
          "fraction %s" % (m, S.mean(x["cpu"] for x in rs), max(x["cpu"] for x in rs),
                           S.mean(done[(m, n)]["cpu"]["cfD+"] for n in idx), S.mean(done[(m, n)]["part_cpu"] for n in idx),
                           _cand(done, m, idx)))

    P()
    P("## Prediction checks")
    ok = {}
    for m in (12, 16):
        rs = [res[(m, n)] for n in LAYOUTS[m]]
        nl = len(rs)
        pr = es.pooled_ratio([x["tC"] for x in rs], [x["tE"] for x in rs])
        ok[(1, m)] = 1.000 <= pr <= 1.010
        P("(1) M=%d pooled cfD+/E %.4f in [1.000, 1.010]: %s" % (m, pr, ok[(1, m)]))
        w1 = sum(abs(x["ratio"] - 1) <= 0.01 for x in rs)
        ok[(2, m)] = w1 >= (7 if m == 12 else 3)
        P("(2) M=%d within 1%%: %d/%d (>= %d): %s" % (m, w1, nl, 7 if m == 12 else 3, ok[(2, m)]))
        rmin = min(x["r"] for x in rs)
        ok[(3, m)] = rmin >= 0.99
        P("(3) M=%d min pair-weight r %.5f >= 0.99: %s" % (m, rmin, ok[(3, m)]))
        s2 = sum(x[("same", 2)] for x in rs)
        l2 = S.mean(x[("lossE", 2)] for x in rs)
        ok[(4, m)] = s2 >= (5 if m == 12 else 2) and l2 <= 1.002
        P("(4) M=%d k=2 cfD+ split = exact_D best in %d/%d (>= %d), mean loss_E %.5f (<= 1.002), max %.5f: %s" % (
            m, s2, nl, 5 if m == 12 else 2, l2, max(x[("lossE", 2)] for x in rs), ok[(4, m)]))
        l4 = S.mean(x[("lossE", 4)] for x in rs)
        ok[(5, m)] = l4 <= 1.005
        P("(5) M=%d k=4 cfD+ partition = exact_D best in %d/%d, mean loss_E %.5f (<= 1.005), min %.5f, max %.5f: %s" % (
            m, sum(x[("same", 4)] for x in rs), nl, l4, min(x[("lossE", 4)] for x in rs),
            max(x[("lossE", 4)] for x in rs), ok[(5, m)]))
        d2 = max(abs(x[("retE", 2)] - x[("retC", 2)]) for x in rs)
        d4 = max(abs(x[("retE", 4)] - x[("retC", 4)]) for x in rs)
        ok[(6, m)] = d2 <= 0.01 and d4 <= 0.01
        P("(6) M=%d max |ret_E - ret_cf|: k=2 %.4f, k=4 %.4f (<= 0.01); median ret_E k=2 %.4f, k=4 %.4f: %s" % (
            m, d2, d4, S.median(x[("retE", 2)] for x in rs), S.median(x[("retE", 4)] for x in rs), ok[(6, m)]))
        rbE = S.mean(x["rbE"] for x in rs)
        ok[(7, m)] = rbE >= 1.05
        P("(7) M=%d recursive bisection on exact_D: mean %.4f (>= 1.05), median %.4f, worse in %d/%d; on cf_D+ %.4f: %s"
          % (m, rbE, S.median(x["rbE"] for x in rs), sum(x["rbE"] > 1 + 1e-12 for x in rs), nl,
             S.mean(x["rbC"] for x in rs), ok[(7, m)]))
        dev = max(abs(S.mean(x[(g, "E", k)] for x in rs) - S.mean(x[(g, "D", k)] for x in rs))
                  for g in ("gas_d", "gas_d+") for k in (2, 4))
        ok[(8, m)] = dev <= 0.005
        P("(8) M=%d max |mean loss_E - mean loss_D| over gas_d(+), k=2,4: %.5f (<= 0.005): %s" % (m, dev, ok[(8, m)]))
        q = max(max(abs(x["even"] - 1), abs(x["odd"] - 1)) for x in rs)
        ok[(9, m)] = q <= 0.001
        P("(9) M=%d max sub-rule deviation %.5f (<= 0.001): %s" % (m, q, ok[(9, m)]))
        cm = S.mean(x["cpu"] for x in rs)
        ok[(10, m)] = cm <= (3000 if m == 12 else 6000)
        P("(10) M=%d mean exact_D CPU %.0f s (<= %d): %s" % (m, cm, 3000 if m == 12 else 6000, ok[(10, m)]))
    for p in range(1, 11):
        P("P%d: %s" % (p, "held" if ok[(p, 12)] and ok[(p, 16)] else "refuted"))
    below = [(m, n) for (m, n), x in res.items() if x[("lossE", 4)] < 1 - 1e-12]
    P("k=4 cells where cf_D+'s partition beat exact_D's own search (loss_E < 1): %s" % (below or "none"))
    P("# wall time %.0f s" % (time.time() - t0))


def _cand(done, m, idx):
    vals = []
    for n in idx:
        st = done[(m, n)]["stats_E"]
        if st.get("pairs"):
            vals.append(st.get("cand", 0) / st["pairs"])
    return "%.3f" % S.mean(vals) if vals else "n/a"


if __name__ == "__main__":
    main()
