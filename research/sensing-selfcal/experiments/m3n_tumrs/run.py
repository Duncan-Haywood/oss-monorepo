"""Milestone 3n: the TUM rolling-shutter test. Re-solve milestone 3b's natural-feature windows with
milestone 3l's rolling-shutter term, driven by per-keyframe angular rates from TUM's motion capture,
with the readout time free.

Usage: OMP_NUM_THREADS=1 python3 run.py <tum dir> [n_workers] [limit]
<tum dir> holds the sequences extracted by ../m3b_natural/fetch.sh. Writes results.json.

Per window (milestone 3b's 12 keyframes, every 3rd frame):
  1. SIFT tracks and milestone 3b's nfba solve from the starting f that won in milestone 3b
     (results.json there); its solution is the start for every model below.
  2. rsba.Window solves (all five intrinsics free, robust LM, milestone 3l's solver):
       none    t_r = 0 fixed: milestone 3b's model in this solver (check: equals 3b's f)
       est     mocap rates, t_r free from 0
       est_u   mocap rates, t_r free, a free linear velocity per keyframe
       shuf    rates taken from another window of the same sequence (5 windows on, circular),
               t_r free: a null that keeps the rates' size but not their timing
       est10, est40   as est with the rate differenced over +-10 and +-40 ms instead of +-20 ms

Rates. TUM's groundtruth.txt gives the pose of the colour camera's optical centre in the mocap
world at 100 Hz (tx ty tz qx qy qz qw; Sturm et al. 2012). The body rate at a keyframe's timestamp t
is w_b = log(R(t - d)^T R(t + d)) / (2d), with R slerped between mocap samples, d = 20 ms. The
rolling-shutter model (rsba.project) moves camera-frame points by exp([w tau]x), so a body rate w_b
enters as w = -w_b. A positive estimated t_r therefore means rows are exposed top to bottom.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m3b_natural"))
sys.path.insert(0, os.path.join(HERE, "..", "m3l_gyro"))
import nfba  # noqa: E402
import rsba  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m3b_run", os.path.join(HERE, "..", "m3b_natural", "run.py"))
m3b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m3b)

SIZE, H = (640, 480), 480
SHUF = 5
DELTAS = (0.010, 0.020, 0.040)


def quat_to_R(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def slerp(q0, q1, a):
    q0, q1 = q0 / np.linalg.norm(q0), q1 / np.linalg.norm(q1)
    d = float(np.dot(q0, q1))
    if d < 0:
        q1, d = -q1, -d
    if d > 0.9995:
        q = q0 + a * (q1 - q0)
        return q / np.linalg.norm(q)
    th = np.arccos(d)
    return (np.sin((1 - a) * th) * q0 + np.sin(a * th) * q1) / np.sin(th)


def R_at(gt, t):
    """Camera-to-world rotation at time t, slerped between mocap samples; None if t is outside the
    record or the nearest samples are more than 50 ms apart (a mocap gap)."""
    ts = gt[:, 0]
    j = int(np.searchsorted(ts, t))
    if j <= 0 or j >= len(ts) or ts[j] - ts[j - 1] > 0.05:
        return None
    a = (t - ts[j - 1]) / (ts[j] - ts[j - 1])
    return quat_to_R(slerp(gt[j - 1, 4:8], gt[j, 4:8], a))


def log_so3(R):
    c = np.clip((np.trace(R) - 1) / 2, -1, 1)
    th = np.arccos(c)
    v = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return v / 2 if th < 1e-9 else v * th / (2 * np.sin(th))


def body_rate(gt, t, d):
    """Angular velocity in the camera frame (rad/s), or NaNs where mocap is missing."""
    Ra, Rb = R_at(gt, t - d), R_at(gt, t + d)
    if Ra is None or Rb is None:
        return np.full(3, np.nan)
    return log_so3(Ra.T @ Rb) / (2 * d)


def m3b_best():
    res = json.load(open(os.path.join(HERE, "..", "m3b_natural", "results.json")))
    out = {}
    for w in res["windows"]:
        sols = [s for s in w["starts"] if "intr" in s]
        if sols:
            b = min(sols, key=lambda s: s["cost"])
            out[(w["seq"], w["window"])] = {"f0": b["f0"], "f": b["intr"][0], "status": b["status"]}
    return out


def window_rates(gt, fr, w, d):
    idx = [w * m3b.NKF * m3b.STEP + i * m3b.STEP for i in range(m3b.NKF)]
    return np.array([body_rate(gt, fr[i][0], d) for i in idx])


def job(args):
    tum, key, w, nwin, best = args
    t0 = time.time()
    d = os.path.join(tum, m3b.SEQS[key][0])
    fr = m3b.frames(d)
    gt = m3b.groundtruth(d)
    idx = [w * m3b.NKF * m3b.STEP + i * m3b.STEP for i in range(m3b.NKF)]
    out = {"seq": key, "unit": m3b.SEQS[key][1], "window": w, "frames": [idx[0], idx[-1]],
           "f0": best["f0"], "f_3b": best["f"]}
    rates = {dd: window_rates(gt, fr, w, dd) for dd in DELTAS}
    shuf = window_rates(gt, fr, (w + SHUF) % nwin, 0.020)
    out["rates"] = rates[0.020].tolist()
    out["rates_shuf"] = shuf.tolist()
    if not np.isfinite(rates[0.020]).all():
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
    sols = {}

    def run(name, rates_, est_tr, est_u):
        g = np.nan_to_num(-rates_) if rates_ is not None else np.zeros((nv, 3))
        win = rsba.Window(vi, pi, uv, nv, npt, tv, g, 0.0, H, est_tr, est_u)
        s = win.solve(intr0, rv, tv, X, 0.0 if est_tr else None)
        s.pop("u", None)
        sols[name] = s

    run("none", None, False, False)
    run("est", rates[0.020], True, False)
    run("est_u", rates[0.020], True, True)
    if np.isfinite(shuf).all():
        run("shuf", shuf, True, False)
    run("est10", rates[0.010], True, False)
    run("est40", rates[0.040], True, False)
    out["solves"] = sols
    out["status"] = "ok"
    out["seconds"] = time.time() - t0
    return out


def main():
    tum = sys.argv[1]
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    best = m3b_best()
    jobs = []
    for key, (name, _) in m3b.SEQS.items():
        n = len(m3b.frames(os.path.join(tum, name))) // (m3b.NKF * m3b.STEP)
        for w in range(n):
            if (key, w) in best:
                jobs.append((tum, key, w, n, best[(key, w)]))
    jobs = jobs[:limit] if limit else jobs
    print(len(jobs), "windows", flush=True)
    res = []
    with Pool(nw) as p:
        for r in p.imap_unordered(job, jobs):
            res.append(r)
            s = r.get("solves", {})
            print(r["seq"], r["window"], r["status"], round(r.get("seconds", 0)),
                  {k: round(v["t_r"] * 1e3, 1) for k, v in s.items()}, flush=True)
    res.sort(key=lambda r: (r["seq"], r["window"]))
    with open(os.path.join(HERE, "results.json" if not limit else "pilot.json"), "w") as fh:
        json.dump({"shuf_offset": SHUF, "deltas": DELTAS, "windows": res}, fh, indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
