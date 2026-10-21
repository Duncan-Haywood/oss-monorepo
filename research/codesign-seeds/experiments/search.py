"""Run 16 NEW seeds (8..23) of the six `codesign-headroom` methods, 40 designs each, protocol unchanged. About 40 minutes
on 4 cores. Writes search.json with each run's evaluated designs (x, feasible, 40-scene test success, trained force)."""
import json, os, sys, time
os.environ.setdefault("OMP_NUM_THREADS", "1"); os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
from concurrent.futures import ProcessPoolExecutor as Pool, as_completed
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "codesign-headroom", "src")); sys.path.insert(0, os.path.join(HERE, "..", "..", "codesign-headroom", "experiments"))
from run import METHODS, BUDGET          # the headroom experiment's own method table
from codesign_headroom import Problem

SEEDS = list(range(8, 24))
KEEP = ("x", "feasible", "success", "force_n")


def job(args):
    name, seed = args
    p = Problem()
    recs = METHODS[name](p, BUDGET, seed)
    assert p.n_evals == BUDGET
    return name, seed, [{k: r[k] for k in KEEP} for r in recs]


if __name__ == "__main__":
    t0 = time.time()
    res = {"budget": BUDGET, "seeds": SEEDS, "methods": {m: {} for m in METHODS}}
    with Pool(4) as pool:
        futs = [pool.submit(job, (m, s)) for s in SEEDS for m in METHODS]
        for f in as_completed(futs):
            name, seed, recs = f.result()
            res["methods"][name][str(seed)] = recs
            print("finished", name, seed, "%.0f s" % (time.time() - t0), flush=True)
            json.dump(res, open(os.path.join(HERE, "search.json"), "w"))
    print("done in %.0f s" % (time.time() - t0))
