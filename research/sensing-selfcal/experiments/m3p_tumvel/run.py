"""Milestone 3p: TUM with the motion-capture linear velocity in the rolling-shutter window solve, and
the mocap-camera time offset free.

Usage: OMP_NUM_THREADS=1 python3 run.py <tum dir> [n_workers] [limit]
<tum dir> holds the sequences extracted by ../m3b_natural/fetch.sh. Writes results.json
(partial.jsonl checkpoints finished windows, so a rerun resumes).

Milestone 3n's free-velocity model (est_u, 3 x 12 more unknowns) converged in 6 of 54 windows, and
milestone 3o found on synthetic windows that leaving the velocity out biases a free time offset by
about 3 ms. TUM's ground truth gives the camera's translation too, so here the velocity is an input,
not an unknown. Per window (milestone 3b's 12 keyframes, every 3rd frame), from milestone 3b's nfba
solution (as milestone 3n), all five intrinsics free, robust LM, the readout t_r free from 0:

    est      mocap rates, u = 0                     (milestone 3n's est; check: equals its f)
    est_mu   mocap rates, u_i from mocap            (velocity known)
    mu_shuf  mocap rates, u_i from the window 5 on   (a null: the velocity's size, not its timing)
    est_d    mocap rate signal, u = 0, offset delta free from 0
    est_mud  mocap rate signal, u_i from mocap, delta free from 0

Velocity. With R the camera-to-world rotation and c the optical centre from TUM's ground truth
(Sturm et al. 2012), a camera-frame point moves as d/dt[R^T (X - c)] = -w_b x (.) - R^T c', so
rsba's u_i = -s R_i^T c'(t_i), c' a central difference of the linearly interpolated position over
+-20 ms. s (window units per metre) is the ratio of the rms spread of the nfba solution's camera
centres to that of the mocap centres at the keyframes; the window's gauge holds one translation
component at its start, so its scale stays the start's. u_i is held at the camera stamp t_i when
delta is free (over 20 ms a hand-held velocity changes by a few per cent).

Offset. est_d and est_mud read the rate as a signal g(s) = -w_b(s) sampled every 5 ms on the mocap
clock, keyframe i taking g(t_i - delta) (milestone 3o's tsba.TWindow); delta > 0 means the
camera's motion at its stamp t_i is what the mocap reports at t_i - delta.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
for p in ("m3b_natural", "m3l_gyro", "m3o_offset", "m3n_tumrs"):
    sys.path.insert(0, os.path.join(HERE, "..", p))
import nfba  # noqa: E402
import rsba  # noqa: E402
import tsba  # noqa: E402
import importlib.util  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


m3b = _load("m3b_run", os.path.join(HERE, "..", "m3b_natural", "run.py"))
m3n = _load("m3n_run", os.path.join(HERE, "..", "m3n_tumrs", "run.py"))

SIZE, H = (640, 480), 480
SHUF = 5
D = 0.020          # s, differencing half-span for rates and velocities (milestone 3n)
GRID = 0.005       # s, rate-signal spacing for the offset models
PAD = 0.10         # s, signal extends this far past the window's first and last stamps


class UWindow(tsba.TWindow):
    """tsba.TWindow with the per-keyframe linear velocity fixed at u_fix instead of zero."""

    def __init__(self, *a, u_fix=None, **k):
        super().__init__(*a, **k)
        self.u_fix = None if u_fix is None else np.asarray(u_fix, float)

    def from_q(self, c, x):
        intr, rv, tv, X, t_r, u = super().from_q(c, x)
        if self.u_fix is not None and not self.est_u:
            u = self.u_fix
        return intr, rv, tv, X, t_r, u


def pos_at(gt, t):
    ts = gt[:, 0]
    j = int(np.searchsorted(ts, t))
    if j <= 0 or j >= len(ts) or ts[j] - ts[j - 1] > 0.05:
        return None
    a = (t - ts[j - 1]) / (ts[j] - ts[j - 1])
    return (1 - a) * gt[j - 1, 1:4] + a * gt[j, 1:4]


def world_vel(gt, t, d=D):
    pa, pb = pos_at(gt, t - d), pos_at(gt, t + d)
    if pa is None or pb is None:
        return np.full(3, np.nan)
    return (pb - pa) / (2 * d)


def cam_vel(gt, t, d=D):
    """-R^T c'(t): the camera-frame velocity of a static point, metres per second."""
    R = m3n.R_at(gt, t)
    if R is None:
        return np.full(3, np.nan)
    return -R.T @ world_vel(gt, t, d)


def centres_mocap(gt, ts):
    out = [pos_at(gt, t) for t in ts]
    return None if any(p is None for p in out) else np.array(out)


def centres_window(rv, tv):
    """Camera centres -R_i^T t_i of the window's poses (x_cam = R_i X + t_i)."""
    out = []
    for r, t in zip(rv, tv):
        R, _ = cv2.Rodrigues(np.asarray(r, float))
        out.append(-R.T @ t)
    return np.array(out)


def spread(C):
    return float(np.sqrt(((C - C.mean(0)) ** 2).sum(1).mean()))


def job(args):
    tum, key, w, nwin, best = args
    t0 = time.time()
    d = os.path.join(tum, m3b.SEQS[key][0])
    fr = m3b.frames(d)
    gt = m3b.groundtruth(d)
    nk = m3b.NKF * m3b.STEP
    idx = [w * nk + i * m3b.STEP for i in range(m3b.NKF)]
    idx_s = [((w + SHUF) % nwin) * nk + i * m3b.STEP for i in range(m3b.NKF)]
    kt = np.array([fr[i][0] for i in idx])
    kt_s = np.array([fr[i][0] for i in idx_s])
    out = {"seq": key, "unit": m3b.SEQS[key][1], "window": w, "frames": [idx[0], idx[-1]],
           "f0": best["f0"], "f_3b": best["f"]}
    rates = np.array([m3n.body_rate(gt, t, D) for t in kt])
    vel = np.array([cam_vel(gt, t) for t in kt])
    vel_s = np.array([cam_vel(gt, t) for t in kt_s])
    gs = np.arange(kt[0] - PAD, kt[-1] + PAD + 1e-9, GRID)
    gw = np.array([m3n.body_rate(gt, s, D) for s in gs])
    Cm = centres_mocap(gt, kt)
    out["vel_mps"] = vel.tolist()
    if not (np.isfinite(rates).all() and np.isfinite(vel).all() and np.isfinite(gw).all() and Cm is not None):
        out["status"] = "mocap_gap"
        return out
    feats = [nfba.features(cv2.imread(os.path.join(d, fr[i][1]), cv2.IMREAD_GRAYSCALE)) for i in idx]
    r = nfba.solve_window(feats, SIZE, best["f0"])
    if "intr" not in r:
        out["status"] = r["status"]
        return out
    vi, pi, uv, X = r.pop("data")
    rv, tv = np.array(r.pop("rv")), np.array(r.pop("tv"))
    out["nfba"] = {k: r[k] for k in ("status", "intr", "sd", "n_tracks", "n_obs", "rms_inlier", "cost")}
    nv, npt = m3b.NKF, len(X)
    intr0 = np.array(r["intr"])
    s = spread(centres_window(rv, tv)) / spread(Cm)
    out["scale"] = s
    out["mocap_spread_m"] = spread(Cm)
    out["speed_mps"] = float(np.median(np.linalg.norm(vel, axis=1)))
    u = s * vel
    u_s = s * vel_s if np.isfinite(vel_s).all() else None
    sols = {}

    def run(name, u_fix, est_delta):
        win = UWindow(vi, pi, uv, nv, npt, tv, gs, -gw, kt, 0.0, H, est_tr=True,
                      est_delta=est_delta, u_fix=u_fix)
        if not est_delta:                      # keyframe rates exactly as milestone 3n's est
            win.gyro = -rates
            win.rates = lambda delta, _g=-rates: _g
        sols[name] = win.solve(intr0, rv, tv, X, 0.0)

    run("est", None, False)
    run("est_mu", u, False)
    if u_s is not None:
        run("mu_shuf", u_s, False)
    run("est_d", None, True)
    run("est_mud", u, True)
    out["solves"] = sols
    out["status"] = "ok"
    out["seconds"] = time.time() - t0
    return out


def main():
    tum = sys.argv[1]
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    best = m3n.m3b_best()
    jobs = []
    for key, (name, _) in m3b.SEQS.items():
        n = len(m3b.frames(os.path.join(tum, name))) // (m3b.NKF * m3b.STEP)
        for w in range(n):
            if (key, w) in best:
                jobs.append((tum, key, w, n, best[(key, w)]))
    jobs = jobs[:limit] if limit else jobs
    part = os.path.join(HERE, "partial.jsonl" if not limit else "pilot.jsonl")
    res = [json.loads(l) for l in open(part)] if os.path.exists(part) else []
    done = {(r["seq"], r["window"]) for r in res}
    todo = [j for j in jobs if (j[1], j[2]) not in done]
    print(len(jobs), "windows,", len(todo), "to run", flush=True)
    with Pool(nw) as p, open(part, "a") as fh:
        for r in p.imap_unordered(job, todo):
            res.append(r)
            fh.write(json.dumps(r) + "\n"); fh.flush()
            sv = r.get("solves", {})
            print(r["seq"], r["window"], r["status"], round(r.get("seconds", 0)),
                  {k: (round(v["intr"][0], 1), round(v["t_r"] * 1e3, 1), round(v["delta"] * 1e3, 1), v["status"])
                   for k, v in sv.items()}, flush=True)
    res.sort(key=lambda r: (r["seq"], r["window"]))
    if not limit:
        with open(os.path.join(HERE, "results.json"), "w") as fh:
            json.dump({"shuf_offset": SHUF, "d": D, "grid": GRID, "windows": res}, fh, indent=1)
        os.remove(part)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
