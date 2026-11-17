"""Milestone 3l: does a gyro-aided rolling-shutter term in the window solve remove the focal shift
milestone 3k measured, and can a single 1.2 s window estimate the readout time itself?

The windows, motion and noise are milestone 3k's (../m3k_shutter/run.py: `window`, `observe`,
`specs`), rendered with a 1/30 s rolling shutter. Each is solved with rsba.Window (all five
intrinsics free, milestone 3k's start: f x 1.08, centred c, k = 0) under these models:

  clean   global-shutter rendering, no shutter term: the reference f_gs
  none    rolling-shutter rendering, no shutter term (milestone 3k's 'rs' solve, this solver)
  known   gyro w per keyframe, t_r = 1/30 s known, u = 0
  known_u as known, plus a free linear velocity u per keyframe
  est     gyro w, t_r free (start 0), u = 0
  est_u   gyro w, t_r free, u free
  bias1   as known, gyro bias 1 deg/s per axis (random sign, fixed over the window)
  bias5   as known, gyro bias 5 deg/s per axis
  null    global-shutter rendering solved with 'est': does a shutter appear where there is none?

Gyro: true w + bias + white noise 0.1 deg/s per axis per keyframe (not from a datasheet; the
Bosch and TDK pages were unreachable from this container, so the bias is swept instead).
e = (f_model - f_clean) / f_true.

    OMP_NUM_THREADS=1 python3 run.py [n_workers] [limit]
Writes results.json. H172-H177 were written in ../../LOG.md before this script first ran in full.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "m3k_shutter"))
import importlib.util  # noqa: E402
import rsba  # noqa: E402

_spec = importlib.util.spec_from_file_location("m3k_run", os.path.join(HERE, "..", "m3k_shutter", "run.py"))
m3k = importlib.util.module_from_spec(_spec)   # milestone 3k's run.py (same file name as this one)
_spec.loader.exec_module(m3k)

TR = m3k.TR
NOISE_DPS = 0.1
DEG = np.pi / 180


def gyro(w, seed, bias_dps):
    g = np.random.default_rng(40_000 + seed)
    b = g.choice([-1.0, 1.0], 3) * bias_dps * DEG
    return np.asarray(w) + b + g.normal(0, NOISE_DPS * DEG, np.shape(w))


def data(spec, t_r):
    rv, tv, X, _ = m3k.window(spec["seed"])
    noise = np.random.default_rng(20_000 + spec["seed"])        # milestone 3k's noise draw
    vi, pi, uv = m3k.observe(rv, tv, X, np.array(spec["w"]), np.array(spec["u"]), t_r, noise)
    keep = np.bincount(pi, minlength=len(X)) >= 3
    sel = keep[pi]
    remap = -np.ones(len(X), int); remap[keep] = np.arange(keep.sum())
    vi, pi, uv = vi[sel], remap[pi[sel]], uv[sel]
    Xs = X[keep]
    rng = np.random.default_rng(10_000 + spec["seed"])           # milestone 3k's start perturbation
    rv0 = rv + np.r_[np.zeros((1, 3)), rng.normal(0, 0.01, (m3k.NKF - 1, 3))]
    X0 = Xs + rng.normal(0, 0.02, Xs.shape)
    return vi, pi, uv, rv0, tv, X0


def solve(d, w_meas, t_r, est_tr=False, est_u=False):
    vi, pi, uv, rv0, tv, X0 = d
    win = rsba.Window(vi, pi, uv, m3k.NKF, len(X0), tv, w_meas, t_r, m3k.H, est_tr, est_u)
    start = np.array([m3k.INTR[0] * 1.08, m3k.W / 2, m3k.H / 2, 0.0, 0.0])
    return win.solve(start, rv0, tv * 1.0, X0, 0.0 if est_tr else None)


MODELS = ("clean", "none", "known", "known_u", "est", "est_u", "bias1", "bias5", "null")


def job(spec):
    t0 = time.time()
    w = np.array(spec["w"])
    d_rs, d_gs = data(spec, TR), data(spec, 0.0)
    g0 = gyro(w, spec["seed"], 0.0)
    out = dict(spec)
    out["clean"] = solve(d_gs, g0, 0.0)
    out["none"] = solve(d_rs, g0, 0.0)
    out["known"] = solve(d_rs, g0, TR)
    out["est"] = solve(d_rs, g0, TR, est_tr=True)
    out["null"] = solve(d_gs, g0, TR, est_tr=True)
    if spec["part"] == "B" and spec.get("sigma") == 0.3:
        out["known_u"] = solve(d_rs, g0, TR, est_u=True)
        out["est_u"] = solve(d_rs, g0, TR, est_tr=True, est_u=True)
        out["bias1"] = solve(d_rs, gyro(w, spec["seed"], 1.0), TR)
        out["bias5"] = solve(d_rs, gyro(w, spec["seed"], 5.0), TR)
    out["seconds"] = time.time() - t0
    return out


def specs():
    out = [s for s in m3k.specs() if s["part"] == "B"]
    out += [s for s in m3k.specs() if s["part"] == "A" and s["axis"] in ("pitch", "yaw") and s["rate"] == 1.0]
    return out


def main():
    nw = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    jobs = specs()
    if len(sys.argv) > 2:
        jobs = jobs[: int(sys.argv[2])]
    print(len(jobs), "jobs", flush=True)
    res = []
    with Pool(nw) as p:
        for i, r in enumerate(p.imap(job, jobs)):
            res.append(r)
            print(i, round(r["seconds"], 1), flush=True)
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump({"intr": m3k.INTR.tolist(), "t_r": TR, "gyro_noise_dps": NOISE_DPS, "jobs": res}, fh, indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
