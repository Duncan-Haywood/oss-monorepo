"""Run random search, CMA-ES and GP-EI Bayesian optimisation (8 seeds, 40 evaluations each), add the session
agent's four committed rounds, and write results.json / results.txt. About 15 minutes on 4 cores."""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_gripper import Problem, random_search, cma_es, bayes_opt, best_curve, score_proposals
from codesign_gripper.problem import FRESH, success_rate, finger_stats, clip, NAMES

BUDGET, SEEDS = 40, list(range(8))
METHODS = {"random search": random_search, "CMA-ES": cma_es, "Bayesian opt (GP-EI)": bayes_opt}
POINTS = [10, 20, 30, 40]


def job(args):
    name, seed = args
    p = Problem()
    recs = METHODS[name](p, BUDGET, seed)
    assert p.n_evals == BUDGET
    return name, seed, recs


def fresh_of(rec):
    """Success of a finished design with its trained force on the 100 scenes never used in the search."""
    st = finger_stats(rec["x"]); p = Problem()
    d, _ = p.design(rec["x"])
    return success_rate(d, rec["force_n"], FRESH) if rec["feasible"] else 0.0


def best_rec(recs):
    feas = [r for r in recs if r["feasible"]]
    return max(feas, key=lambda r: r["success"]) if feas else None


if __name__ == "__main__":
    t0 = time.time()
    with Pool(4) as pool:
        out = pool.map(job, [(m, s) for m in METHODS for s in SEEDS], chunksize=1)
    agent = score_proposals(Problem(), [os.path.join(HERE, "..", "proposals", "round%d.json" % k) for k in (1, 2, 3, 4)])
    res = {"budget": BUDGET, "seeds": SEEDS, "points": POINTS, "methods": {}, "agent": {"recs": agent}}
    for m in METHODS:
        runs = [r for (n, s, r) in out if n == m]
        res["methods"][m] = {"recs": runs, "curves": [best_curve(r, POINTS) for r in runs]}
    # winner's curse check: re-score each run's best design on 100 fresh scenes
    with Pool(4) as pool:
        for m in METHODS:
            bests = [best_rec(r) for r in res["methods"][m]["recs"]]
            res["methods"][m]["fresh"] = pool.map(fresh_of, [b for b in bests if b])
            res["methods"][m]["best_test"] = [b["success"] for b in bests if b]
        ab = best_rec(agent)
        res["agent"]["best"] = ab
        res["agent"]["fresh"] = fresh_of(ab)
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"))
    L = ["Best feasible test success (40 held-out scenes) after n evaluations; baselines: median [min-max] over %d seeds." % len(SEEDS),
         "%-22s" % "method" + "".join("%18s" % ("n=%d" % n) for n in POINTS)]
    for m in METHODS:
        C = np.array(res["methods"][m]["curves"])
        L.append("%-22s" % m + "".join("%18s" % ("%.3f [%.2f-%.2f]" % (np.median(C[:, i]), C[:, i].min(), C[:, i].max())) for i in range(len(POINTS))))
    L.append("%-22s" % "session agent (n=1)" + "".join("%18.3f" % v for v in best_curve(agent, POINTS)))
    L.append("")
    L.append("Feasible share of proposals: " + ", ".join("%s %.2f" % (m, np.mean([r["feasible"] for runs in res["methods"][m]["recs"] for r in runs])) for m in METHODS)
             + ", session agent %.2f" % np.mean([r["feasible"] for r in agent]))
    L.append("")
    L.append("Winner's curse: each run's best design (by test success) re-scored on 100 fresh scenes with its trained force.")
    for m in METHODS:
        bt, fr = res["methods"][m]["best_test"], res["methods"][m]["fresh"]
        L.append("%-22s test median %.3f, fresh median %.3f (mean drop %.3f over %d seeds)" % (m, np.median(bt), np.median(fr), np.mean(np.array(bt) - np.array(fr)), len(bt)))
    L.append("%-22s test %.3f, fresh %.3f   design %s" % ("session agent", ab["success"], res["agent"]["fresh"], dict(zip(NAMES, [round(v, 2) for v in ab["x"]]))))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L)); print("done in %.0f s" % (time.time() - t0))
