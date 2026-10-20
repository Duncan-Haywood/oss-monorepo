"""Run the feedback-level ablation: three scripted readers (score only, failure summary, full rollout logs) and three
baselines (random search, CMA-ES, GP-EI Bayesian optimisation), 8 seeds x 40 designs each. About 35 minutes on 4 cores.
Writes results.json and results.txt."""
import json, os, sys, time
os.environ.setdefault("OMP_NUM_THREADS", "1"); os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
from concurrent.futures import ProcessPoolExecutor as Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_headroom import Problem
from codesign_headroom.optimisers import random_search, cma_es, bayes_opt
from codesign_headroom.readers import reader
from codesign_headroom.problem import FRESH, success_rate

BUDGET, SEEDS, TARGET = 40, list(range(8)), 0.80
POINTS = [10, 20, 30, 40]
METHODS = {
    "random search": random_search, "CMA-ES": cma_es, "Bayesian opt (GP-EI)": bayes_opt,
    "reader L0: score only": lambda p, b, s: reader(p, b, s, 0),
    "reader L1: failure summary": lambda p, b, s: reader(p, b, s, 1),
    "reader L2: full rollout logs": lambda p, b, s: reader(p, b, s, 2),
}


def best_rec(recs):
    feas = [r for r in recs if r["feasible"]]
    return max(feas, key=lambda r: r["success"]) if feas else None


def curve(recs):
    return [max([r["success"] for r in recs[:n] if r["feasible"]] or [0.0]) for n in range(1, len(recs) + 1)]


def job(args):
    name, seed = args
    p = Problem()
    recs = METHODS[name](p, BUDGET, seed)
    assert p.n_evals == BUDGET
    b = best_rec(recs)
    d, _ = p.design(b["x"]) if b else (None, None)
    fresh = success_rate(d, b["force_n"], FRESH) if b else 0.0
    for r in recs:
        r.pop("diag", None)
    return name, seed, dict(recs=recs, curve=curve(recs), fresh=fresh)


def evals_to(c, target):
    return next((i + 1 for i, v in enumerate(c) if v >= target), None)


if __name__ == "__main__":
    t0 = time.time()
    res = {"budget": BUDGET, "seeds": SEEDS, "target": TARGET, "points": POINTS, "methods": {m: [] for m in METHODS}}
    with Pool(4) as pool:
        for name, seed, r in pool.map(job, [(m, s) for s in SEEDS for m in METHODS]):
            res["methods"][name].append(r); print("finished", name, seed, "%.0f s" % (time.time() - t0), flush=True)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"))
    L = ["Best feasible test success (40 held-out scenes) after n designs; median [min-max] over %d seeds." % len(SEEDS),
         "%-30s" % "method" + "".join("%18s" % ("n=%d" % n) for n in POINTS)]
    for m in METHODS:
        C = np.array([r["curve"] for r in res["methods"][m]])
        L.append("%-30s" % m + "".join("%18s" % ("%.3f [%.2f-%.2f]" % (np.median(C[:, n - 1]), C[:, n - 1].min(), C[:, n - 1].max())) for n in POINTS))
    L += ["", "Designs evaluated to first reach test success >= %.2f (seeds that never reach it counted as >%d):" % (TARGET, BUDGET),
          "%-30s%10s%12s%14s" % ("method", "reached", "median", "mean(cap 41)")]
    for m in METHODS:
        e = [evals_to(r["curve"], TARGET) for r in res["methods"][m]]
        got = [v for v in e if v]
        L.append("%-30s%7d/%d%12s%14.1f" % (m, len(got), len(e), ("%.1f" % np.median([v or BUDGET + 1 for v in e])), np.mean([v or BUDGET + 1 for v in e])))
    L += ["", "Share of proposals that are feasible (print time cap) and mean test success of feasible proposals:"]
    for m in METHODS:
        rs = [x for r in res["methods"][m] for x in r["recs"]]
        fe = [x for x in rs if x["feasible"]]
        L.append("%-30s feasible %.2f   mean success of feasible %.3f" % (m, len(fe) / len(rs), np.mean([x["success"] for x in fe])))
    L += ["", "Winner's curse: each run's best design (by test success) re-scored on 100 fresh scenes."]
    for m in METHODS:
        bt = [max(r["curve"]) for r in res["methods"][m]]; fr = [r["fresh"] for r in res["methods"][m]]
        L.append("%-30s test median %.3f, fresh median %.3f (mean drop %.3f)" % (m, np.median(bt), np.median(fr), np.mean(np.array(bt) - np.array(fr))))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L)); print("done in %.0f s" % (time.time() - t0))
