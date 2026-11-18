"""Milestone 6: where the column-wise residual correlation comes from, and whether a
different corner localiser or a column-clustered sandwich sigma fixes the 2x.

    OMP_NUM_THREADS=1 python3 experiments/m6_detector/run.py      # ~15 min on 4 cores

For each camera and each detector (cornerSubPix with an 11x11 half-window as in
milestones 1-5, a 5x5 half-window, and findChessboardCornersSB with CALIB_CB_ACCURACY):
the all-view flat-board Zhang fit and the all-view target-free fit (k1), the residuals'
neighbour correlations and column/row structure; then milestone 2's 560 subsets (same
views and reference views) re-solved with that detector's corners. Writes results.json.
"""
import glob, json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import (detect, selfcal_fixed_analytic, selfcal_fixed_best, zhang,  # noqa: E402
                     neighbour_corr, residual_structure)

M2 = os.path.join(ROOT, "experiments", "m2_spread", "results.json")
METHODS = ("subpix11", "subpix5", "sb")
CACHE = {}


def load(cam, method):
    cs, names = [], []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", f"{cam}*.jpg"))):
        c, size = detect(f, method=method)
        if c is not None:
            cs.append(c); names.append(os.path.basename(f))
    return np.array(cs), size, names


def scalars(d):
    return {k: float(v) for k, v in d.items() if np.isscalar(v)}


def one(job):
    cam, method, kind, k, i, idx, refs, f0 = job
    obs, size = CACHE[(cam, method)]
    t = time.time()
    s = selfcal_fixed_best(obs[list(idx)], size, f0, nk=1, refs=refs)
    if s is not None:
        s.pop("planarity", None)
    return dict(cam=cam, method=method, kind=kind, k=k, i=i, views=list(idx), selfcal=s, seconds=time.time() - t)


def main():
    m2 = json.load(open(M2))
    out = {"init_factor": m2["init_factor"], "cams": {}, "subsets": []}
    jobs = []
    for cam in ("left", "right"):
        f0 = m2["init_factor"] * m2["cams"][cam]["zhang_k1"]["f"]
        out["cams"][cam] = {"zhang_k1_subpix11_m2": m2["cams"][cam]["zhang_k1"]["f"]}
        base = None
        for method in METHODS:
            obs, size, names = load(cam, method)
            assert len(obs) == 13, (cam, method, len(obs))
            CACHE[(cam, method)] = (obs, size)
            if base is None:
                base = obs
            z = zhang(list(obs), size, k2=False)
            best = None
            for ref in (0, len(obs) // 2):
                s = selfcal_fixed_analytic(obs, size, f0, nk=1, ref=ref, keep_resid=True)
                if best is None or s["cost"] < best["cost"]:
                    best = s
            best.pop("planarity")
            res = best.pop("resid")
            shift = obs - base
            out["cams"][cam][method] = dict(
                zhang_k1=scalars(z), selfcal_k1=scalars(best), resid_corr=neighbour_corr(res),
                structure=residual_structure(res, obs),
                shift_from_subpix11=dict(rms_px=float(np.sqrt((shift ** 2).sum(-1).mean())),
                                         max_px=float(np.linalg.norm(shift, axis=-1).max())))
            print(cam, method, "f", round(best["f"], 3), "cy", round(best["cy"], 2), "rms", round(best["rms"], 3),
                  "vert", round(out["cams"][cam][method]["resid_corr"]["vertical"], 3), flush=True)
            for r in m2["subsets"]:
                if r["cam"] == cam:
                    jobs.append((cam, method, r["kind"], r["k"], r["i"], tuple(r["views"]), tuple(r["refs"]), f0))
    with Pool(4) as pool:
        for j, r in enumerate(pool.imap_unordered(one, jobs, chunksize=4)):
            out["subsets"].append(r)
            if j % 200 == 0:
                print(j, "/", len(jobs), round(r["seconds"], 1), flush=True)
    out["subsets"].sort(key=lambda r: (r["cam"], r["method"], r["kind"], r["k"], r["i"]))
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
