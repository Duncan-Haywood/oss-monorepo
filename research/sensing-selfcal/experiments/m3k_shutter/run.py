"""Milestone 3k: how much focal-length error can a rolling shutter put into a 1.2 s self-calibration window?

Synthetic windows shaped like milestone 3b's TUM windows (12 keyframes over 1.1 s, a hand-held path,
points 1.5-5 m away, 0.5 px noise, the fr1 board intrinsics), rendered through a rolling-shutter
camera (rs.py) and solved with milestone 3b's global-shutter bundle adjustment (nfba.bundle, all five
intrinsics free) from the start milestone 3h's tests use (f x 1.08, centred principal point, k = 0).
Each rolling-shutter solve is paired with a global-shutter solve of the same scene and noise, so the
reported shift e_rs = (f_rs - f_gs) / f_true is the rolling shutter's own effect.

  A: constant angular velocity about one camera axis (pitch x, yaw y, roll z) at 0.25-2 rad/s, readout
     t_r = 1/30 s (the whole frame period at 30 Hz, an upper bound for any 30 Hz camera).
  B: hand-held: each keyframe's angular velocity drawn independently, N(0, sigma^2) per axis,
     sigma in {0.3, 1.0} rad/s, linear velocity N(0, 0.3^2) m/s per axis, t_r = 1/30 s.

    OMP_NUM_THREADS=1 python3 run.py [n_workers]       # about a minute on 4 cores
Writes results.json. H167-H171 were written in ../../LOG.md before this script first ran.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rs  # noqa: E402
from rs import nfba  # noqa: E402

INTR = np.array([518.28, 315.7, 260.1, 0.25, -0.75])   # fr1 board: f (milestone 3c reference), c, k (3i's board_ref, rounded)
W, H = 640, 480
NKF, T_WIN = 12, 33 / 30.0            # milestone 3b: 12 keyframes, every 3rd frame at 30 Hz
TR = 1 / 30.0
AXES = {"pitch": 0, "yaw": 1, "roll": 2}
RATES = (0.25, 0.5, 1.0, 2.0)
SEEDS_A = range(8)
SIGMAS = (0.3, 1.0)
SEEDS_B = range(30)


def window(seed, npt=400):
    """Keyframe poses on a smooth hand-held path: a random rotation of 15 deg and a translation of
    0.25 m spread linearly over the window, plus small jitter; points in front of the first view."""
    rng = np.random.default_rng(seed)
    a = rng.normal(size=3); a /= np.linalg.norm(a)
    b = rng.normal(size=3); b /= np.linalg.norm(b)
    s = np.linspace(0, 1, NKF)
    rv = np.outer(s, a * np.radians(15)) + np.r_[np.zeros((1, 3)), rng.normal(0, 0.01, (NKF - 1, 3))]
    tv = np.outer(s, b * 0.25) + np.r_[np.zeros((1, 3)), rng.normal(0, 0.01, (NKF - 1, 3))]
    z = rng.uniform(1.5, 5.0, npt)
    X = np.c_[rng.uniform(-0.6, 0.6, npt) * z, rng.uniform(-0.45, 0.45, npt) * z, z]
    return rv, tv, X, rng


def observe(rv, tv, X, ws, us, t_r, noise_rng, noise=0.5):
    vi, pi, uv, tau = [], [], [], []
    for v in range(NKF):
        u, z, ta = rs.project_rs(INTR, rv[v], tv[v], X, ws[v], us[v], t_r, H)
        ok = (z > 0.1) & (u[:, 0] > 0) & (u[:, 0] < W) & (u[:, 1] > 0) & (u[:, 1] < H)
        for p in np.nonzero(ok)[0]:
            vi.append(v); pi.append(p); uv.append(u[p]); tau.append(ta[p])
    uv = np.array(uv) + noise_rng.normal(0, noise, (len(uv), 2))
    return np.array(vi), np.array(pi), uv


def solve(vi, pi, uv, rv, tv, X, seed):
    keep = np.bincount(pi, minlength=len(X)) >= 3
    sel = keep[pi]
    remap = -np.ones(len(X), int); remap[keep] = np.arange(keep.sum())
    vi, pi, uv = vi[sel], remap[pi[sel]], uv[sel]
    Xs = X[keep]
    rng = np.random.default_rng(10_000 + seed)
    prob = nfba.Problem(vi, pi, uv, NKF, len(Xs), tv)
    start = np.array([INTR[0] * 1.08, W / 2, H / 2, 0.0, 0.0])
    rv0 = rv + np.r_[np.zeros((1, 3)), rng.normal(0, 0.01, (NKF - 1, 3))]
    X0 = Xs + rng.normal(0, 0.02, Xs.shape)
    info, (intr, *_), q = nfba.bundle(prob, start, rv0, tv * 1.0, X0)
    cov, sig, _, _ = nfba.intr_cov(prob, q)
    return {"status": info["status"], "iters": info["iters"], "intr": intr.tolist(),
            "sd_f": float(np.sqrt(cov[0, 0])), "sigma": sig, "n_obs": int(len(vi))}


def job(spec):
    t = time.time()
    rv, tv, X, rng = window(spec["seed"])
    ws, us = np.array(spec["w"]), np.array(spec["u"])
    out = dict(spec)
    for name, t_r in (("gs", 0.0), ("rs", TR)):
        noise = np.random.default_rng(20_000 + spec["seed"])     # same noise draw for both
        vi, pi, uv = observe(rv, tv, X, ws, us, t_r, noise)
        out[name] = solve(vi, pi, uv, rv, tv, X, spec["seed"])
        if name == "gs":
            # first-order bias of each keyframe from its global-shutter pixels and pitch rate
            pred = []
            for v in range(NKF):
                m = vi == v
                pred.append(rs.first_order_bias(uv[m], INTR, ws[v][0], TR, H))
            out["pred_kf"] = [p[0] for p in pred]
            out["share_kf"] = [p[1] for p in pred]
            out["n_kf"] = [int((vi == v).sum()) for v in range(NKF)]
    out["seconds"] = time.time() - t
    return out


def specs():
    out = []
    for ax, i in AXES.items():
        for r in RATES:
            for s in SEEDS_A:
                w = np.zeros((NKF, 3)); w[:, i] = r
                out.append({"part": "A", "axis": ax, "rate": r, "seed": s, "w": w.tolist(),
                            "u": np.zeros((NKF, 3)).tolist()})
    for sg in SIGMAS:
        for s in SEEDS_B:
            g = np.random.default_rng(30_000 + s + int(1000 * sg))
            out.append({"part": "B", "sigma": sg, "seed": 100 + s,
                        "w": g.normal(0, sg, (NKF, 3)).tolist(), "u": g.normal(0, 0.3, (NKF, 3)).tolist()})
    return out


def main():
    nw = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    jobs = specs()
    print(len(jobs), "jobs", flush=True)
    with Pool(nw) as p:
        res = list(p.imap(job, jobs))
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump({"intr": INTR.tolist(), "t_r": TR, "size": [W, H], "jobs": res}, fh, indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
