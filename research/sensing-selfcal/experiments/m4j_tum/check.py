"""Milestone 4j, H64: does each TUM unit's linearised twin predict the nonlinear solver?

    OMP_NUM_THREADS=1 python3 experiments/m4j_tum/check.py      # ~10 min on 4 cores, after run.py

Milestone 4i's check.py (H59) with the TUM units: synthetic corners from each unit's twin plus iid
noise at its real 13-view rms, solved cold by the same solver; 4 random view sets of each size
4..7, 40 draws per set. Writes check.json.
"""
import importlib.util, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import analyse  # noqa: E402  (patches the milestone 4g/4i modules for the TUM units)

_spec = importlib.util.spec_from_file_location("m4icheck", os.path.join(ROOT, "experiments", "m4i_geomref", "check.py"))
chk = importlib.util.module_from_spec(_spec)
sys.path.insert(0, os.path.join(ROOT, "experiments", "m4i_geomref"))
_spec.loader.exec_module(chk)
twin = analyse.twin
chk.twin = twin
chk.twin.NPT = analyse.tu.NPT
CAMS = analyse.CAMS
SEED = 202611145
SIZES = (4, 5, 6, 7)
SETS_PER_SIZE = 4
DRAWS = 40
CACHE = chk.CACHE


def init():
    twin.NPT = analyse.tu.NPT
    for cam in CAMS:
        CACHE[cam] = analyse.load_unit(cam)


def solve(job):
    # a module-level wrapper: the pool pickles functions by module name, and the imported
    # milestone-4i module has none a worker could re-import
    return chk.solve(job)


def jobs_for(cam):
    tw = CACHE[cam][0]
    rng = np.random.default_rng([SEED, CAMS.index(cam)])
    E = twin.noise(rng, "iid", DRAWS, tw) * tw["rms"]
    out = []
    for n in SIZES:
        for _ in range(SETS_PER_SIZE):
            v = tuple(sorted(rng.choice(13, n, replace=False).tolist()))
            out += [(cam, "iid", 1.0, v, d, E[:, d]) for d in range(DRAWS)]
    return out


def main():
    init()
    jobs = jobs_for("fr1") + jobs_for("fr3")
    print(len(jobs), "solves", flush=True)
    rows = []
    with Pool(4, initializer=init) as pool:
        for i, r in enumerate(pool.imap_unordered(solve, jobs, chunksize=8)):
            rows.append(r)
    S = chk.summarise(rows)
    h = {cam: [S[f"{cam}/iidx1/n{n}"]["sd_ratio_median"] for n in SIZES] for cam in CAMS}
    h["holds"] = bool(all(0.8 <= x <= 1.25 for cam in CAMS for x in h[cam]))
    with open(os.path.join(HERE, "check.json"), "w") as fh:
        json.dump(dict(H64=h, summary=S, seed=SEED), fh, indent=1)
    print("H64", "holds" if h["holds"] else "REFUTED", json.dumps(h))
    for k, v in S.items():
        print(k, json.dumps(v))
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
