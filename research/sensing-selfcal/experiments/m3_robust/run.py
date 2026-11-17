"""Milestone 3: cluster-robust (sandwich) and leave-one-view-out jackknife sigma.

    OMP_NUM_THREADS=1 python3 experiments/m3_robust/run.py      # ~30 min on 4 cores

Re-solves milestone 2's 560 subsets (the same views and reference views, read from
m2_spread/results.json) with the same solver, which now also reports the sandwich
sigmas, and adds the leave-one-view-out jackknife for subsets of 4 or more views.
Writes results.json.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m1_real"))
from selfcal import selfcal_fixed_best, jackknife_sf  # noqa: E402
from run import load  # noqa: E402

M2 = os.path.join(ROOT, "experiments", "m2_spread", "results.json")
CACHE = {}


def one(job):
    cam, kind, k, i, idx, refs, f0 = job
    obs, size = CACHE[cam]
    sub = obs[list(idx)]
    t = time.time()
    s = selfcal_fixed_best(sub, size, f0, nk=1, refs=refs)
    if s is not None:
        s.pop("planarity", None)
    j = jackknife_sf(sub, size, f0) if k >= 4 else None
    return dict(cam=cam, kind=kind, k=k, i=i, views=list(idx), selfcal=s, jack=j, seconds=time.time() - t)


def main():
    m2 = json.load(open(M2))
    out = {"init_factor": m2["init_factor"], "cams": {}, "subsets": []}
    jobs = []
    for cam in ("left", "right"):
        obs, size, names = load(cam)
        CACHE[cam] = (obs, size)
        c = m2["cams"][cam]
        f0 = m2["init_factor"] * c["zhang_k1"]["f"]
        n = len(obs)
        full = selfcal_fixed_best(obs, size, f0, nk=1, refs=[0, n // 2])
        full.pop("planarity", None)
        full_j = jackknife_sf(obs, size, f0)
        out["cams"][cam] = dict(zhang_k1=c["zhang_k1"], selfcal_all=full, jack_all=full_j)
        print(cam, "f", round(full["f"], 3), "sf", round(full["sf"], 3), "cr_view", round(full["sf_cr_view"], 3),
              "jack", round(full_j["sf_jack"], 3), flush=True)
        for r in m2["subsets"]:
            if r["cam"] == cam:
                jobs.append((cam, r["kind"], r["k"], r["i"], tuple(r["views"]), tuple(r["refs"]), f0))
    with Pool(4) as pool:
        for j, r in enumerate(pool.imap_unordered(one, jobs)):
            out["subsets"].append(r)
            if j % 40 == 0:
                print(j, "/", len(jobs), round(r["seconds"], 1), flush=True)
    out["subsets"].sort(key=lambda r: (r["cam"], r["kind"], r["k"], r["i"]))
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
