"""Milestone 3h: does the first-order conditioning of milestones 3f/3g predict the re-solve?

On real images where the re-solve can be run: OpenCV's stereo calibration set (../../data, two
cameras, 13 views each). Each window is a random subset of one camera's views; the correspondences are
the board's detected corners (one track per corner), the board's geometry withheld, solved by milestone
3b's natural-feature solver (`nfba`: robust soft-L1 LM, f, cx, cy, k1, k2 free). Then, for each window
and each target distortion k_t = k + t (k_ref - k), t in TS, where k_ref is Zhang's k1 + k2 calibration
of that camera from all 13 views:
  f_c  = first-order conditioned f (milestone 3g's formula, from the window's own covariance),
  f_p  = the re-solve with k1, k2 pinned at k_t, started from the free solution,
and the sd of f with k pinned, first order (sd ratio) and re-solved (pinned covariance).

    python3 run.py            # ~5-10 min on 4 cores; writes results.json
H149-H153 were written in ../../LOG.md before this script first ran.
"""
import glob, json, os, sys, time
from multiprocessing import Pool
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, HERE)
from selfcal import detect, zhang, init_fronto  # noqa: E402
from pinned import bundle_pinned, intr_cov_pinned, condition  # noqa: E402  (puts m3b_natural on the path)
import nfba  # noqa: E402

SIZES = (4, 6, 8)
PER_SIZE = 25
TS = (0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0)
STARTS = (0.8, 1.0, 1.25)      # starting f as a multiple of the image width (640 px)
PIN = (3, 4)


def load(cam):
    cs = []
    size = None
    for f in sorted(glob.glob(os.path.join(ROOT, "data", f"{cam}*.jpg"))):
        c, size = detect(f)
        if c is not None:
            cs.append(c)
    return np.array(cs), size


def to_view0(X, poses):
    """Re-express init_fronto's points and poses in view 0's camera frame (nfba's gauge)."""
    R0 = cv2.Rodrigues(poses[0, :3])[0]
    t0 = poses[0, 3:]
    Xn = X @ R0.T + t0
    rv, tv = np.zeros((len(poses), 3)), np.zeros((len(poses), 3))
    for v in range(len(poses)):
        Rv = cv2.Rodrigues(poses[v, :3])[0]
        Rn = Rv @ R0.T
        rv[v] = cv2.Rodrigues(Rn)[0].ravel()
        tv[v] = poses[v, 3:] - Rn @ t0
    rv[0] = 0.0
    tv[0] = 0.0
    return Xn, rv, tv


def problem(obs, size, f0):
    nv, npt = obs.shape[:2]
    X, poses = init_fronto(obs, size, f0, ref=0)
    X, rv, tv = to_view0(X, poses)
    vi = np.repeat(np.arange(nv), npt)
    pi = np.tile(np.arange(npt), nv)
    uv = obs.reshape(-1, 2).astype(np.float64)
    return nfba.Problem(vi, pi, uv, nv, npt, tv), rv, tv, X


def free_solve(obs, size):
    best = None
    for s in STARTS:
        f0 = s * size[0]
        prob, rv, tv, X = problem(obs, size, f0)
        intr0 = np.array([f0, size[0] / 2.0, size[1] / 2.0, 0.0, 0.0])
        info, sol, q = nfba.bundle(prob, intr0, rv, tv, X)
        if not np.isfinite(info["cost"]):
            continue
        if best is None or info["cost"] < best[0]["cost"]:
            best = (info, sol, q, prob, s)
    return best


def one(job):
    cam, n, i, idx = job
    obs, size, ref = CACHE[cam]
    sub = obs[list(idx)]
    t0 = time.time()
    best = free_solve(sub, size)
    out = {"cam": cam, "n": n, "i": i, "views": [int(v) for v in idx]}
    if best is None:
        out["why"] = "no_solution"
        return out
    info, (intr, rv, tv, X), q, prob, s = best
    cov, sig, rms_in, inl = nfba.intr_cov(prob, q)
    out.update(why="ok" if info["status"] > 0 else "maxiter", start=s, intr=intr.tolist(), cov=cov.tolist(),
               sigma=sig, cost=info["cost"])
    kref = np.array([ref["k1"], ref["k2"]])
    k = intr[3:5]
    pins = []
    for t in TS:
        kt = k + t * (kref - k)
        fc, ratio_c = condition(intr, cov, PIN, kt)
        i0 = intr.copy()
        i0[3:5] = kt
        pinfo, (ip, *_), qp = bundle_pinned(prob, i0, rv, tv, X, pinned=PIN)
        cp, free, sigp = intr_cov_pinned(prob, qp, pinned=PIN)
        pins.append({"t": t, "k_target": kt.tolist(), "fc": fc, "sd_ratio_c": ratio_c, "fp": float(ip[0]),
                     "intr_p": ip.tolist(), "sd_p": float(np.sqrt(cp[0, 0])), "sigma_p": sigp,
                     "status_p": pinfo["status"], "cost_p": pinfo["cost"],
                     "k_kept": bool(np.allclose(ip[3:5], kt, atol=1e-12))})
    out["pinned"] = pins
    out["seconds"] = time.time() - t0
    return out


CACHE = {}


def main():
    res = {"sizes": SIZES, "per_size": PER_SIZE, "ts": TS, "starts": STARTS, "cams": {}, "windows": []}
    jobs = []
    for cam in ("left", "right"):
        obs, size = load(cam)
        z = zhang(list(obs), size, k2=True)
        ref = {k: float(z[k]) for k in ("f", "cx", "cy", "k1", "k2", "sf")}
        CACHE[cam] = (obs, size, ref)
        res["cams"][cam] = {"n_views": len(obs), "size": list(size), "zhang_k1k2": ref}
        rng = np.random.default_rng({"left": 31, "right": 32}[cam])
        for n in SIZES:
            for i in range(PER_SIZE):
                jobs.append((cam, n, i, tuple(sorted(rng.choice(len(obs), size=n, replace=False)))))
    with Pool(4) as pool:
        for j, r in enumerate(pool.imap_unordered(one, jobs)):
            res["windows"].append(r)
            if j % 10 == 0:
                print(j, len(jobs), r["cam"], r["n"], r.get("why"), flush=True)
    res["windows"].sort(key=lambda r: (r["cam"], r["n"], r["i"]))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("wrote results.json")


if __name__ == "__main__":
    main()
