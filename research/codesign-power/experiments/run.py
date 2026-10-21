"""Re-score the final designs of every `codesign-headroom` run on N_SCENES new scenes (same generator, new seed).

For each of 6 methods x 8 seeds x checkpoints n in (10, 20, 40), take the design the run would hand over after n
evaluations (best feasible by its 40-scene test success), run it on the large scene set with the grasp force the run
trained for it, and keep the per-scene outcomes. Nothing is re-optimised. About 8 minutes on 4 cores.
Writes results.json (per-design records) and results.txt."""
import json, os, sys, time
os.environ.setdefault("OMP_NUM_THREADS", "1"); os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
from concurrent.futures import ProcessPoolExecutor as Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src")); sys.path.insert(0, os.path.join(HERE, "..", "..", "codesign-headroom", "src"))
from codesign_headroom import Problem
from codesign_headroom.problem import scenarios, success_rate, run_scenes
from codesign_power import best_design, boot_ci, diff_ci, spearman

SRC = os.path.join(HERE, "..", "..", "codesign-headroom", "experiments", "results.json")
N_SCENES, SCENE_SEED, CHECKPOINTS = 600, 4004, (10, 20, 40)
SCENES = scenarios(N_SCENES, SCENE_SEED)


def job(args):
    method, seed, n, x, force = args
    d, _ = Problem().design(x)
    out = [bool(r["success"]) for r in run_scenes(d, force, SCENES)]
    return method, seed, n, out


if __name__ == "__main__":
    t0 = time.time()
    src = json.load(open(SRC))
    jobs, meta = [], {}
    for m, runs in src["methods"].items():
        for seed, run in zip(src["seeds"], runs):
            for n in CHECKPOINTS:
                b = best_design(run["recs"], n)
                meta[(m, seed, n)] = None if b is None else dict(test=b["success"], force_n=b["force_n"], x=b["x"])
                if b is not None:
                    jobs.append((m, seed, n, b["x"], b["force_n"]))
    uniq = {}
    for j in jobs:
        uniq.setdefault((tuple(j[3]), j[4]), j)       # a design chosen at several checkpoints is simulated once
    with Pool(4) as pool:
        done = dict(zip(uniq, pool.map(job, uniq.values(), chunksize=2)))
    recs = []
    for (m, seed, n), b in meta.items():
        if b is None:
            recs.append(dict(method=m, seed=seed, n=n, test=0.0, true=0.0, none=True)); continue
        out = done[(tuple(b["x"]), b["force_n"])][3]
        recs.append(dict(method=m, seed=seed, n=n, test=b["test"], true=float(np.mean(out)), x=b["x"], force_n=b["force_n"], outcomes=out))
    json.dump(dict(n_scenes=N_SCENES, scene_seed=SCENE_SEED, records=recs), open(os.path.join(HERE, "results.json"), "w"))
    methods = list(src["methods"])
    L = ["Final designs of codesign-headroom (8 seeds per method) re-scored on %d new scenes (seed %d)." % (N_SCENES, SCENE_SEED),
         "True success = mean over the 8 runs of the design's success on the large set; [95%% bootstrap interval over runs]. A design's own scene noise is about 0.015 (binomial, n=%d); 'test' is the 40-scene score the run selected on." % N_SCENES, ""]
    for n in CHECKPOINTS:
        L.append("After %d designs evaluated:" % n)
        L.append("%-30s%10s%24s%12s" % ("method", "test(40)", "true(%d) [95%% CI]" % N_SCENES, "optimism"))
        for m in methods:
            R = [r for r in recs if r["method"] == m and r["n"] == n]
            t = np.array([r["test"] for r in R]); v = np.array([r["true"] for r in R])
            mu, lo, hi = boot_ci(v)
            L.append("%-30s%10.3f%24s%12.3f" % (m, t.mean(), "%.3f [%.3f, %.3f]" % (mu, lo, hi), (t - v).mean()))
        L.append("")
    L.append("Differences in true success at n=40, method minus random search (bootstrap over runs):")
    ref = "random search"
    get = lambda m, n=40: np.array([r["true"] for r in recs if r["method"] == m and r["n"] == n])
    for m in methods:
        if m == ref: continue
        d, lo, hi = diff_ci(get(m), get(ref))
        L.append("%-30s%+8.3f  [%+.3f, %+.3f]%s" % (m, d, lo, hi, "" if lo <= 0 <= hi else "   <- interval excludes 0"))
    L += ["", "Feedback levels against each other at n=40:"]
    for a, b in (("reader L1: failure summary", "reader L0: score only"), ("reader L2: full rollout logs", "reader L0: score only"), ("reader L2: full rollout logs", "reader L1: failure summary")):
        d, lo, hi = diff_ci(get(a), get(b))
        L.append("%-30s - %-28s%+8.3f  [%+.3f, %+.3f]" % (a, b, d, lo, hi))
    allr = [r for r in recs if not r.get("none")]
    L += ["", "Rank agreement between the 40-scene test score and true success over all %d re-scored designs: Spearman %.3f" % (len(allr), spearman([r["test"] for r in allr], [r["true"] for r in allr]))]
    uq = {(tuple(r["x"]), r["force_n"]): r for r in allr}.values()
    L.append("Same, over the %d distinct designs: Spearman %.3f; best true success of any design %.3f, worst %.3f" % (
        len(uq), spearman([r["test"] for r in uq], [r["true"] for r in uq]), max(r["true"] for r in uq), min(r["true"] for r in uq)))
    # how often does the method ordering by 40-scene medians match the ordering by true means?
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L)); print("done in %.0f s" % (time.time() - t0))
