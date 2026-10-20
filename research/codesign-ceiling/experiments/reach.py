"""Reachability sweep. For ~150 feasible Sobol designs and every scene in TEST (40) and FRESH (100), roll out the grasp at
a fixed force grid (plus each design's own force cap). A scene is *reachable* in a condition if some design holds it at some
allowed force (an oracle that picks design and force per scene, so an upper bound on any single design). Writes reach.json.
About 20 minutes on 4 cores."""
import json, os, sys, time
os.environ.setdefault("OMP_NUM_THREADS", "1")
from concurrent.futures import ProcessPoolExecutor as Pool
import numpy as np
from scipy.stats import qmc
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_ceiling import Problem, LB, UB, TEST, FRESH, finger_stats, ASSUMED
from codesign_ceiling.sim import rollout

GRID = [2.0, 4.0, 8.0, 15.0, 30.0, 60.0]
N_DESIGNS = int(os.environ.get("N_DESIGNS", 150))


def designs():
    pts = qmc.Sobol(5, seed=7).random(1024)
    out = []
    for u in pts:
        x = LB + u * (UB - LB)
        st = finger_stats(x)
        if st["print_min"] <= ASSUMED["time_cap_min"]:
            out.append(x)
        if len(out) == N_DESIGNS:
            break
    return out


def job(x):
    p = Problem()
    d, st = p.design(x)
    forces = sorted(set(GRID + [round(float(st["f_max"]), 3)]))
    scenes = TEST + FRESH
    ok = {str(f): [bool(rollout(d, o, f)["success"]) for o in scenes] for f in forces}
    return dict(x=[float(v) for v in x], f_max=float(st["f_max"]), f_break=float(st["f_break_n"]), mu=float(st["mu"]),
                print_min=float(st["print_min"]), ok=ok)


if __name__ == "__main__":
    xs = designs()
    t = time.time()
    with Pool(4) as pool:
        res = list(pool.map(job, xs, chunksize=1))
    json.dump(dict(designs=res, scenes=TEST + FRESH, n_test=len(TEST), grid=GRID, seconds=time.time() - t),
              open(os.path.join(HERE, "reach.json"), "w"))
    print("done", len(res), "designs", round(time.time() - t), "s")
