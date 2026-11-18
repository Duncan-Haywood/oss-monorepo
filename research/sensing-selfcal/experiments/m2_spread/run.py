"""Milestone 2: gauge-fixed solver, view spread, near-critical subsets, precision gate.

    python3 experiments/m2_spread/run.py      # ~10 min on 4 cores

Reruns milestone 1's 400 random subsets (same seeds, same reference views) with the
gauge-fixed LM solver, and adds, per camera and for sizes 3-6, the 20 subsets of the
13 views whose board normals are closest to parallel. Writes results.json.
"""
import itertools, json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m1_real"))
from selfcal import zhang, selfcal_fixed_best, board_normals, spread_deg  # noqa: E402
from run import load, strip, SIZES, PER_SIZE, INIT_FACTOR  # noqa: E402  (milestone 1's loader and seeds)

NEAR_SIZES = (3, 4, 5, 6)
NEAR_PER = 20
CACHE = {}


def one(job):
    cam, kind, k, i, idx, refs, f0 = job
    obs, size, _, normals = CACHE[cam]
    sub = obs[list(idx)]
    t = time.time()
    s = selfcal_fixed_best(sub, size, f0, nk=1, refs=refs)
    dt = time.time() - t
    z = zhang(list(sub), size, k2=False)
    return dict(cam=cam, kind=kind, k=k, i=i, views=[int(v) for v in idx], refs=list(refs),
                spread_deg=spread_deg(normals[list(idx)]), selfcal=s, seconds=dt, zhang=strip(z))


def main():
    out = {"init_factor": INIT_FACTOR, "cams": {}, "subsets": []}
    jobs = []
    for cam in ("left", "right"):
        obs, size, names = load(cam)
        zr = zhang(list(obs), size, k2=False)
        normals = board_normals(zr["rvecs"])
        CACHE[cam] = (obs, size, names, normals)
        f0 = INIT_FACTOR * zr["f"]
        n = len(obs)
        full = selfcal_fixed_best(obs, size, f0, nk=1, refs=[0, n // 2])
        full07 = selfcal_fixed_best(obs, size, 0.7 * zr["f"], nk=1, refs=[0, n // 2])
        full_k2 = selfcal_fixed_best(obs, size, f0, nk=2, refs=[0, n // 2])
        ang = np.degrees(np.arccos(np.clip(normals @ normals.T, -1, 1)))
        out["cams"][cam] = dict(images=names, zhang_k1=strip(zr), selfcal_all=full, selfcal_all_init07=full07,
                                selfcal_all_k2=full_k2, spread_all_deg=spread_deg(normals),
                                normal_angles_deg=np.round(ang, 2).tolist())
        print(cam, "zhang", round(zr["f"], 3), "fixed", round(full["f"], 3), "status", full["status"],
              "nfev", full["nfev"], flush=True)
        # Milestone 1's random subsets: same generator, same draws, same reference views.
        rng = np.random.default_rng({"left": 1, "right": 2}[cam])
        for k in SIZES:
            for i in range(PER_SIZE):
                idx = tuple(sorted(rng.choice(n, size=k, replace=False)))
                r2 = np.random.default_rng(1000 * k + i)
                refs = tuple(int(r) for r in r2.choice(len(idx), size=min(2, len(idx)), replace=False))
                jobs.append((cam, "random", k, i, idx, refs, f0))
        # Near-critical: the NEAR_PER smallest-spread subsets of each size.
        for k in NEAR_SIZES:
            combos = list(itertools.combinations(range(n), k))
            sp = np.array([ang[np.ix_(c, c)].max() for c in combos])
            for i, j in enumerate(np.argsort(sp, kind="stable")[:NEAR_PER]):
                jobs.append((cam, "near", k, i, combos[j], (0, k // 2), f0))
    with Pool(4) as pool:
        for j, r in enumerate(pool.imap_unordered(one, jobs)):
            out["subsets"].append(r)
            if j % 50 == 0:
                print(j, "/", len(jobs), flush=True)
    out["subsets"].sort(key=lambda r: (r["cam"], r["kind"], r["k"], r["i"]))
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump(out, fh, indent=1)


if __name__ == "__main__":
    main()
