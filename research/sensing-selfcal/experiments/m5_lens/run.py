"""Milestone 5: bend-aware (released-object) Zhang reference, a k2 lens term in the
target-free solver, and the structure of the residuals.

    OMP_NUM_THREADS=1 python3 experiments/m5_lens/run.py      # a few minutes on 4 cores

All-view fits per camera: Zhang flat and released-object (k1, k1+k2), target-free
k1 and k1+k2 (with residual neighbour correlations). Then milestone 2's 560 subsets
(same views and reference views, from m2_spread/results.json) re-solved with k1+k2.
Writes results.json.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m1_real"))
from selfcal import (selfcal_fixed_analytic, selfcal_fixed_best, zhang, zhang_ro,  # noqa: E402
                     neighbour_corr, board_points, planarity)
from run import load  # noqa: E402

M2 = os.path.join(ROOT, "experiments", "m2_spread", "results.json")
CACHE = {}


def zhang_resid(z, corners, obj):
    K = np.array([[z["f"], 0, z["cx"]], [0, z["f"], z["cy"]], [0, 0, 1.0]])
    d = np.array([z["k1"], z["k2"], 0, 0, 0])
    out = []
    for c, rv, tv in zip(corners, z["rvecs"], z["tvecs"]):
        uv, _ = cv2.projectPoints(obj.astype(np.float64), rv, tv, K, d)
        out.append(uv.reshape(-1, 2) - c)
    return np.array(out)


def scalars(d):
    return {k: float(v) for k, v in d.items() if np.isscalar(v)}


def one(job):
    cam, kind, k, i, idx, refs, f0 = job
    obs, size = CACHE[cam]
    t = time.time()
    s = selfcal_fixed_best(obs[list(idx)], size, f0, nk=2, refs=refs)
    if s is not None:
        s.pop("planarity", None)
    return dict(cam=cam, kind=kind, k=k, i=i, views=list(idx), selfcal_k2=s, seconds=time.time() - t)


def main():
    m2 = json.load(open(M2))
    out = {"init_factor": m2["init_factor"], "cams": {}, "subsets": []}
    jobs = []
    for cam in ("left", "right"):
        obs, size, names = load(cam)
        CACHE[cam] = (obs, size)
        f0 = m2["init_factor"] * m2["cams"][cam]["zhang_k1"]["f"]
        c = {}
        flat = board_points()
        for nk in (1, 2):
            z = zhang(list(obs), size, k2=nk > 1)
            ro = zhang_ro(list(obs), size, k2=nk > 1)
            c[f"zhang_flat_k{nk}"] = dict(scalars(z), resid_corr=neighbour_corr(zhang_resid(z, obs, flat)))
            c[f"zhang_ro_k{nk}"] = dict(scalars(ro), resid_corr=neighbour_corr(zhang_resid(ro, obs, ro["obj"])),
                                        board_planarity=scalars(planarity(ro["obj"])),
                                        board_heights=planarity(ro["obj"])["heights"])
            best = None
            for ref in (0, len(obs) // 2):
                s = selfcal_fixed_analytic(obs, size, f0, nk=nk, ref=ref, keep_resid=True)
                if best is None or s["cost"] < best["cost"]:
                    best = s
            pl = best.pop("planarity")
            c[f"selfcal_k{nk}"] = dict(scalars(best), resid_corr=neighbour_corr(best.pop("resid")),
                                       board_planarity=scalars(pl), board_heights=pl["heights"])
            print(cam, nk, {kk: round(c[kk]["cy"], 2) for kk in c if kk.endswith(f"k{nk}")}, flush=True)
        out["cams"][cam] = c
        for r in m2["subsets"]:
            if r["cam"] == cam:
                jobs.append((cam, r["kind"], r["k"], r["i"], tuple(r["views"]), tuple(r["refs"]), f0))
    with Pool(4) as pool:
        for j, r in enumerate(pool.imap_unordered(one, jobs)):
            out["subsets"].append(r)
            if j % 80 == 0:
                print(j, "/", len(jobs), round(r["seconds"], 1), flush=True)
    out["subsets"].sort(key=lambda r: (r["cam"], r["kind"], r["k"], r["i"]))
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
