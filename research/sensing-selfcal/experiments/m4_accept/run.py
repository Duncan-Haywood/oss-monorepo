"""Milestone 4: old and new calibrations from disjoint views, for the accept/reject test.

    OMP_NUM_THREADS=1 python3 experiments/m4_accept/run.py      # a few minutes on 4 cores

Per camera and k in {3, 4, 5, 6}: 60 random splits of the 13 views into an "old" set of 7
and a "new" set of k drawn from the other 6 (seed 4000 + 100 k + i). Each distinct view set is
solved once with the milestone-2 solver (k1 model, reference views 0 and n // 2, start 1.3x
Zhang's f). Writes results.json; analyse.py applies the disturbances and the rule.
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m1_real"))
from selfcal import selfcal_fixed_best, zhang  # noqa: E402
from run import load  # noqa: E402

KS = (3, 4, 5, 6)
PER_K = 60
N_OLD = 7
INIT_FACTOR = 1.3
CACHE = {}


def splits(n=13):
    out = []
    for k in KS:
        for i in range(PER_K):
            rng = np.random.default_rng(4000 + 100 * k + i)
            perm = rng.permutation(n)
            old = sorted(int(v) for v in perm[:N_OLD])
            new = sorted(int(v) for v in rng.choice(perm[N_OLD:], size=k, replace=False))
            out.append(dict(k=k, i=i, old=old, new=new))
    return out


def solve(job):
    cam, views, f0 = job
    obs, size = CACHE[cam]
    s = selfcal_fixed_best(obs[list(views)], size, f0, nk=1, refs=(0, len(views) // 2))
    if s is not None:
        s.pop("planarity", None)
    return cam, list(views), s


def main():
    out = {"init_factor": INIT_FACTOR, "n_old": N_OLD, "cams": {}, "splits": splits(), "solutions": []}
    jobs = set()
    for cam in ("left", "right"):
        obs, size, names = load(cam)
        CACHE[cam] = (obs, size)
        z = zhang(list(obs), size, k2=False)
        f0 = INIT_FACTOR * z["f"]
        out["cams"][cam] = dict(size=list(size), f0=f0, names=names)
        jobs.add((cam, tuple(range(len(obs))), f0))
        for sp in out["splits"]:
            jobs.add((cam, tuple(sp["old"]), f0))
            jobs.add((cam, tuple(sp["new"]), f0))
    jobs = sorted(jobs)
    print(len(jobs), "solves", flush=True)
    with Pool(4) as pool:
        for j, (cam, views, s) in enumerate(pool.imap_unordered(solve, jobs)):
            out["solutions"].append(dict(cam=cam, views=views, sol=s))
            if j % 100 == 0:
                print(j, flush=True)
    out["solutions"].sort(key=lambda r: (r["cam"], len(r["views"]), r["views"]))
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump(out, fh)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
