"""Train under L0, L1, L2 and domain randomisation (DR); test on L0, L1, L2 and the held-out target T."""
import json, sys, time
from multiprocessing import Pool
import numpy as np
from robofab_insert.env import LEVELS, NAIVE, PARAM_NAMES
from robofab_insert.train import cem, random_search, success_rate

CONDS = ["L0", "L1", "L2", "DR"]
SEEDS = list(range(5))
N_TEST = 200


def job(args):
    method, cond, seed = args
    fn = cem if method == "cem" else random_search
    p = fn(cond, seed)
    return method, cond, seed, p.tolist(), {k: success_rate(p, f, N_TEST) for k, f in LEVELS.items()}


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(m, c, s) for m in ("cem", "random") for c in CONDS for s in SEEDS]
    with Pool() as pool:
        res = pool.map(job, jobs, chunksize=1)
    ref = {"naive": {k: success_rate(NAIVE, f, N_TEST) for k, f in LEVELS.items()}}
    json.dump({"results": res, "reference": ref, "params": PARAM_NAMES}, open("experiments/results.json", "w"))
    out = []
    out.append(f"held-out success rate, {N_TEST} fixed test scenarios per cell; mean (min-max) over {len(SEEDS)} training seeds")
    out.append("naive straight push (no search): " + "  ".join(f"{k}={v:.3f}" for k, v in ref["naive"].items()))
    for m in ("cem", "random"):
        out.append(f"\n[{m}] rows = training condition, columns = test fidelity")
        out.append("train  " + "".join(f"{k:>20}" for k in LEVELS))
        for c in CONDS:
            rows = np.array([[r[4][k] for k in LEVELS] for r in res if r[0] == m and r[1] == c])
            out.append(f"{c:<6}" + "".join(f"{rows[:, j].mean():>9.3f} ({rows[:, j].min():.2f}-{rows[:, j].max():.2f})" for j in range(4)))
    out.append(f"\nwall time {time.time()-t0:.0f} s")
    open("experiments/results.txt", "w").write("\n".join(out) + "\n")
    print("\n".join(out))
