"""Milestone 11ad driver: best k-way layer partitions (k = 2, 3, 4, 8) of 12 and 16 operators on cf_D+, the planner
rules' picks, and recursive bisection (predictions in split_kway.py's docstring). Needs numpy.

    OMP_NUM_THREADS=1 KWAY_CACHE=kway.pkl python3 split_kway_run.py > split_kway_results.txt   # ~60 min, 4 cores
KWAY_CACHE=<file.pkl> caches per-layout results (written after every layout) so the analysis can be re-run."""
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


kw = _load("hub_airspace_split_kway_11ad", "split_kway.py")
ssr = _load("hub_airspace_split_scale_run_11ad", "split_scale_run.py")
sc = ssr.sc
SIZES = ssr.SIZES
RULES = ssr.RULES
TIERS = ssr.TIERS
KEYS = ["cfD+"] + RULES
KS = (2, 3, 4, 8)
RESTARTS = 200


def run_layout(job):
    L = ssr.run_layout(job)
    m = L["m"]
    t = time.process_time()
    Ws = np.stack([kw.matrix(L[k], m) for k in KEYS])
    picks, how = {}, {}
    for k in KS:
        exact = k == 2 or (m == 12 and k in (3, 4))
        if exact:
            arg, _ = kw.exhaustive(Ws, k)
            for q, key in enumerate(KEYS):
                picks[(key, k)] = kw.canonical(arg[q])
        else:
            for q, key in enumerate(KEYS):
                picks[(key, k)] = kw.local_search(Ws[q], k, restarts=RESTARTS, seed=1000 * k + m)[0]
        how[k] = "exact" if exact else "search"
    ls = {}
    if m == 12:   # P8: does the local search reach the exhaustive optimum?
        for k in (3, 4):
            ls[k] = kw.local_search(Ws[0], k, restarts=RESTARTS, seed=1000 * k + m)[0]
    rb = {key: kw.recursive_bisection(Ws[q]) for q, key in enumerate(KEYS) if key in ("cfD+", "gas_d", "gas_d+")}
    L["kway_cpu"] = time.process_time() - t
    out = {"m": m, "idx": L["idx"], "W": Ws[0], "picks": picks, "how": how, "ls": ls, "rb": rb,
           "shares": L["shares"], "cpu": L["cpu"], "kway_cpu": L["kway_cpu"]}
    print("M=%d layout %d done, %.0f + %.0f CPU s" % (m, L["idx"], sum(L["cpu"].values()), L["kway_cpu"]),
          file=sys.stderr, flush=True)
    return out


def main():
    t0 = time.time()
    cache = os.environ.get("KWAY_CACHE")
    done = {}
    if cache and os.path.exists(cache):
        done = pickle.load(open(cache, "rb"))
    todo = [(m, i) for m in (16, 12) for i in SIZES[m] if (m, i) not in done]
    if todo:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            for L in pool_.imap_unordered(run_layout, todo):
                done[(L["m"], L["idx"])] = L
                if cache:
                    pickle.dump(done, open(cache + ".tmp", "wb"))
                    os.replace(cache + ".tmp", cache)
    P = print
    P("# Milestone 11ad: k-way layer partitions of 12 and 16 operators on cf_D+ (split_kway.py)")
    P("# semi + log2(k) group bits, R = %.0f m, Lambda = %d/h; same 48 layouts as 11ac; search: exhaustive for k = 2 "
      "and for k = 3, 4 at M = 12, else best of %d single-move descents" % (ssr.R, ssr.LAM, RESTARTS))
    ret, stake, LD, RB = {}, {}, {}, {}
    chk = {}
    for m in (12, 16):
        for n in SIZES[m]:
            D = done[(m, n)]
            W = D["W"]
            tot = float(W.sum())
            ret[(n, 1)] = 1.0
            ret[(n, "floor")] = float(np.trace(W)) / tot
            for k in KS:
                b = float(kw.score(W, D["picks"][("cfD+", k)]))
                ret[(n, k)] = b / tot
                stake[(n, k)] = kw.random_expected(W, k) / b
                for key in RULES:
                    LD[(key, n, k)] = float(kw.score(W, D["picks"][(key, k)])) / b
            b4 = float(kw.score(W, D["picks"][("cfD+", 4)]))
            for key, lab in D["rb"].items():
                RB[(key, n)] = float(kw.score(W, lab)) / b4
            for k, lab in D["ls"].items():
                chk[(n, k)] = float(kw.score(W, lab)) / float(kw.score(W, D["picks"][("cfD+", k)]))
        P()
        P("## M = %d: retained weight (best k-way score / total en-route weight); floor = same-operator share; "
          "stake_k = random k-way / best" % m)
        P("idx   floor   ret_2   ret_3   ret_4   ret_8  r4/r2  stake_2 stake_4 stake_8  rb_cf  rb_gd")
        for n in SIZES[m]:
            P("%4d  %.4f  %.4f  %.4f  %.4f  %.4f  %.3f  %6.3f  %6.3f  %6.3f  %.4f  %.4f" % (
                n, ret[(n, "floor")], ret[(n, 2)], ret[(n, 3)], ret[(n, 4)], ret[(n, 8)], ret[(n, 4)] / ret[(n, 2)],
                stake[(n, 2)], stake[(n, 4)], stake[(n, 8)], RB[("cfD+", n)], RB[("gas_d", n)]))
        idx = SIZES[m]
        P("medians: floor %.4f, ret_2 %.4f, ret_3 %.4f, ret_4 %.4f, ret_8 %.4f, r4/r2 %.3f, stake_2 %.3f, stake_4 %.3f, "
          "stake_8 %.3f" % tuple(S.median(v) for v in (
              [ret[(n, "floor")] for n in idx], [ret[(n, 2)] for n in idx], [ret[(n, 3)] for n in idx],
              [ret[(n, 4)] for n in idx], [ret[(n, 8)] for n in idx], [ret[(n, 4)] / ret[(n, 2)] for n in idx],
              [stake[(n, 2)] for n in idx], [stake[(n, 4)] for n in idx], [stake[(n, 8)] for n in idx])))
        for k in KS:
            P()
            P("## M = %d, k = %d (%s): loss_D = cf_D+ score of the rule's pick / cf_D+'s best" % (
                m, k, done[(m, idx[0])]["how"][k]))
            P("rule      mean_D  95% boot CI        med_D   min_D   max_D   w0.5%  same")
            for key in RULES:
                d = [LD[(key, n, k)] for n in idx]
                lo, hi = sc.boot_ci(d)
                P("%-8s  %.4f  [%.4f, %.4f]  %.4f  %.4f  %.4f  %5d  %4d" % (
                    key, S.mean(d), lo, hi, S.median(d), min(d), max(d), sum(v <= 1.005 for v in d),
                    sum(abs(v - 1.0) < 1e-12 for v in d)))
        P()
        P("CPU s per layout (mean / max): weights %.1f / %.1f, k-way analysis %.1f / %.1f" % (
            S.mean(sum(done[(m, n)]["cpu"].values()) for n in idx), max(sum(done[(m, n)]["cpu"].values()) for n in idx),
            S.mean(done[(m, n)]["kway_cpu"] for n in idx), max(done[(m, n)]["kway_cpu"] for n in idx)))

    P()
    P("## Prediction checks")
    med = {(m, k): S.median(ret[(n, k)] for n in SIZES[m]) for m in (12, 16) for k in KS}
    P("(1) median ret_4: M=12 %.4f, M=16 %.4f; both in [0.10, 0.20]: %s" % (
        med[(12, 4)], med[(16, 4)], all(0.10 <= med[(m, 4)] <= 0.20 for m in (12, 16))))
    r42 = {m: S.median(ret[(n, 4)] / ret[(n, 2)] for n in SIZES[m]) for m in (12, 16)}
    P("(2) median ret_4/ret_2: M=12 %.3f, M=16 %.3f; both in [0.35, 0.60]: %s" % (
        r42[12], r42[16], all(0.35 <= r42[m] <= 0.60 for m in (12, 16))))
    s4 = {m: S.median(stake[(n, 4)] for n in SIZES[m]) for m in (12, 16)}
    up = sum(stake[(n, 4)] > stake[(n, 2)] for m in (12, 16) for n in SIZES[m])
    P("(3) median stake_4: M=12 %.3f, M=16 %.3f (>= 1.6); stake_4 > stake_2 in %d/48 (>= 40): %s" % (
        s4[12], s4[16], up, all(s4[m] >= 1.6 for m in (12, 16)) and up >= 40))
    mt = {m: {key: S.mean(LD[(key, n, 4)] for n in SIZES[m]) for key in RULES} for m in (12, 16)}
    P("(4) gas_d k=4 mean loss_D: M=12 %.4f <= 1.010, M=16 %.4f <= 1.020: %s" % (
        mt[12]["gas_d"], mt[16]["gas_d"], mt[12]["gas_d"] <= 1.010 and mt[16]["gas_d"] <= 1.020))
    for m in (12, 16):
        P("(5) M=%d k=4 tier means: %s; holds: %s" % (m, " | ".join(
            ", ".join("%s %.4f" % (key, mt[m][key]) for key in t) for t in TIERS), sc.tiers_hold(mt[m], TIERS)))
    P("(6) dist k=4 mean: M=12 %.4f, M=16 %.4f; both >= 1.10: %s" % (
        mt[12]["dist"], mt[16]["dist"], mt[12]["dist"] >= 1.10 and mt[16]["dist"] >= 1.10))
    ok7 = True
    for m in (12, 16):
        v = [RB[("cfD+", n)] for n in SIZES[m]]
        worse = sum(x > 1.0 + 1e-12 for x in v)
        ok = worse >= 12 and 1.002 <= S.mean(v) <= 1.05
        ok7 = ok7 and ok
        P("(7) M=%d recursive bisection of cf_D+: worse than joint 4-way in %d/24 (>= 12), mean %.4f (in [1.002, "
          "1.05]), median %.4f, max %.4f; gas_d's recursive bisection mean %.4f: %s" % (
              m, worse, S.mean(v), S.median(v), max(v), S.mean(RB[("gas_d", n)] for n in SIZES[m]), ok))
    P("(7) both sizes: %s" % ok7)
    hit = {k: sum(abs(chk[(n, k)] - 1.0) < 1e-9 for n in SIZES[12]) for k in (3, 4)}
    P("(8) local search reaches the exhaustive optimum at M=12: k=3 %d/24, k=4 %d/24 (both 24): %s; worst ratio %.6f" % (
        hit[3], hit[4], hit[3] == 24 and hit[4] == 24, max(chk.values())))
    below = [(key, n, k) for (key, n, k), v in LD.items() if v < 1.0 - 1e-12]
    P("search cells where a rule's pick beat cf_D+'s own best found (loss_D < 1): %d%s" % (
        len(below), (": " + ", ".join("%s/%d/k%d %.5f" % (a, b, c, LD[(a, b, c)]) for a, b, c in below[:12])) if below else ""))
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
