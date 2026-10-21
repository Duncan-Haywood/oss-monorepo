"""Combine the 8 original `codesign-headroom` runs with the 16 new ones from search.py (24 runs per method), score each
run's final design (best feasible by 40-scene test success after 40 designs) on the 600 scenes `codesign-power` used,
and write results.json and results.txt. Designs already scored by `codesign-power` are not re-simulated. About 10 minutes."""
import json, os, sys, time
os.environ.setdefault("OMP_NUM_THREADS", "1"); os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
from concurrent.futures import ProcessPoolExecutor as Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(R, "codesign-headroom", "src")); sys.path.insert(0, os.path.join(R, "codesign-power", "src"))
from codesign_headroom import Problem
from codesign_headroom.problem import scenarios, run_scenes
from codesign_power import best_design, boot_ci, diff_ci
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_seeds import perm_p, runs_needed

N_SCENES, SCENE_SEED = 600, 4004
SCENES = scenarios(N_SCENES, SCENE_SEED)
REF = "random search"


def job(args):
    x, force = args
    d, _ = Problem().design(list(x))
    return [bool(r["success"]) for r in run_scenes(d, force, SCENES)]


if __name__ == "__main__":
    t0 = time.time()
    old = json.load(open(os.path.join(R, "codesign-headroom", "experiments", "results.json")))
    new = json.load(open(os.path.join(HERE, "search.json")))
    prev = {}
    for r in json.load(open(os.path.join(R, "codesign-power", "experiments", "results.json")))["records"]:
        if not r.get("none"):
            assert (r["n_scenes"] if "n_scenes" in r else N_SCENES) == N_SCENES
            prev[(tuple(r["x"]), r["force_n"])] = r["outcomes"]
    methods = list(old["methods"])
    runs = []   # (method, seed, source, final design record or None)
    for m in methods:
        for seed, run in zip(old["seeds"], old["methods"][m]):
            runs.append((m, seed, "headroom", best_design(run["recs"], 40)))
        for seed, recs in sorted(new["methods"][m].items(), key=lambda kv: int(kv[0])):
            runs.append((m, int(seed), "new", best_design(recs, 40)))
    need = {(tuple(b["x"]), b["force_n"]) for _, _, _, b in runs if b is not None} - set(prev)
    with Pool(4) as pool:
        done = dict(zip(sorted(need), pool.map(job, sorted(need), chunksize=2)))
    done.update({k: v for k, v in prev.items()})
    recs = []
    for m, seed, src, b in runs:
        if b is None:
            recs.append(dict(method=m, seed=seed, source=src, test=0.0, true=0.0, none=True)); continue
        out = done[(tuple(b["x"]), b["force_n"])]
        recs.append(dict(method=m, seed=seed, source=src, test=b["success"], true=float(np.mean(out)), x=b["x"], force_n=b["force_n"], outcomes=out))
    json.dump(dict(n_scenes=N_SCENES, scene_seed=SCENE_SEED, records=recs), open(os.path.join(HERE, "results.json"), "w"))
    get = lambda m, src=None: np.array([r["true"] for r in recs if r["method"] == m and (src is None or r["source"] == src)])
    L = ["Final designs after 40 evaluations, 600-scene success (scene seed %d); 8 original runs (seeds 0-7), 16 new (seeds 8-23)." % SCENE_SEED,
         "mean [95% bootstrap interval over runs]; SD is the run-to-run standard deviation of the final design's true success.", "",
         "%-30s%6s%24s%8s%26s%24s" % ("method", "runs", "all runs", "SD", "original 8 only", "new 16 only")]
    for m in methods:
        a, o, n = get(m), get(m, "headroom"), get(m, "new")
        L.append("%-30s%6d%24s%8.3f%26s%24s" % (m, len(a), "%.3f [%.3f, %.3f]" % boot_ci(a), a.std(ddof=1), "%.3f [%.3f, %.3f]" % boot_ci(o), "%.3f [%.3f, %.3f]" % boot_ci(n)))
    L += ["", "Difference in true success, method minus %s (all %d runs per method; bootstrap interval and two-sided permutation p):" % (REF, len(get(REF)))]
    for m in methods:
        if m == REF: continue
        d, lo, hi = diff_ci(get(m), get(REF))
        L.append("%-30s%+8.3f  [%+.3f, %+.3f]  p=%.3f%s" % (m, d, lo, hi, perm_p(get(m), get(REF)), "" if lo <= 0 <= hi else "   <- interval excludes 0"))
    L += ["", "Feedback levels against each other:"]
    for a, b in (("reader L1: failure summary", "reader L0: score only"), ("reader L2: full rollout logs", "reader L0: score only"), ("reader L2: full rollout logs", "reader L1: failure summary")):
        d, lo, hi = diff_ci(get(a), get(b))
        L.append("%-30s - %-28s%+8.3f  [%+.3f, %+.3f]  p=%.3f" % (a, b, d, lo, hi, perm_p(get(a), get(b))))
    L += ["", "Same comparison on the original 8 runs alone, to see whether earlier conclusions held (method minus random search):"]
    for m in methods:
        if m == REF: continue
        d, lo, hi = diff_ci(get(m, "headroom"), get(REF, "headroom"))
        L.append("%-30s%+8.3f  [%+.3f, %+.3f]" % (m, d, lo, hi))
    sd = float(np.sqrt(np.mean([get(m).var(ddof=1) for m in methods])))
    L += ["", "Pooled run-to-run SD %.3f. Runs per method needed to detect a true difference of 0.02 / 0.03 with 80%% power (two-sided 5%%, normal approximation): %d / %d." % (sd, runs_needed(0.02, sd), runs_needed(0.03, sd))]
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L)); print("done in %.0f s" % (time.time() - t0))
