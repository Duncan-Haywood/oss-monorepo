"""Milestone 3s: on TUM, a *causal* prior on k1 and the principal point, built only from the same camera's
EARLIER windows (in recording order), added to milestone 3n's rolling-shutter window solve. Milestone 3r's
prior used every other window of the camera, later ones included; a robot has only its past.

Usage: OMP_NUM_THREADS=1 python3 run.py <tum dir> [n_workers, default 4]
<tum dir> holds the sequences extracted by ../m3b_natural/fetch.sh. Writes results.json.

Recording order: windows by their first frame's timestamp (rgb.txt), across sequences of one camera, so on
the Kinect (fr1) every fr1/xyz window precedes every fr1/desk window (checked at run time and stored).
Only counted windows (milestone 3p's rule, which uses nothing but the window itself) enter a prior.

    est_c    cx, cy, k1; mu, s = median and robust sd (1.4826 MAD) of milestone 3p's `est` values over
             the camera's earlier counted windows; a prior only once N_MIN earlier windows exist
    est_cr   the same, but the earlier windows' values are their own est_cr solutions (the est value for a
             window that had no prior yet): the prior is updated from the robot's own prior-steadied
             history, so each camera's windows run in sequence

Windows with fewer than N_MIN earlier counted windows get no prior (their est_c = est). Plan and hypotheses:
LOG.md, milestone 3s planned.
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")


def _load(name, path):
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


N_MIN = 5
NAMES = ("cx", "cy", "k1")
IDX = {"cx": 1, "cy": 2, "k1": 3}


def mad_sd(x):
    x = np.asarray(x, float)
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def causal_prior(history):
    """history: list of intrinsics vectors (earlier counted windows, oldest first).
    Returns [(j, mu, s), ...] or None when fewer than N_MIN windows exist."""
    if len(history) < N_MIN:
        return None
    H = np.asarray(history, float)
    return [(IDX[n], float(np.median(H[:, IDX[n]])), mad_sd(H[:, IDX[n]])) for n in NAMES]


def order(windows, t0):
    """windows: counted m3p rows; t0: {(seq, window): first-frame timestamp}. Per unit, time-ordered list."""
    out = {}
    for w in sorted(windows, key=lambda w: t0[(w["seq"], w["window"])]):
        out.setdefault(w["unit"], []).append(w)
    return out


def first_times(tum, rows, m3b):
    nk = m3b.NKF * m3b.STEP
    t0, cache = {}, {}
    for w in rows:
        if w["seq"] not in cache:
            cache[w["seq"]] = m3b.frames(os.path.join(tum, m3b.SEQS[w["seq"]][0]))
        t0[(w["seq"], w["window"])] = float(cache[w["seq"]][w["window"] * nk][0])
    return t0


def solve(tum, seq, w, best, sig, prior, mods):
    """One window's prior solve (milestone 3r's job, one model). prior: [(j, mu, s)] in intrinsics units."""
    import cv2
    m3b, m3n, m3r, nfba = mods["m3b"], mods["m3n"], mods["m3r"], mods["nfba"]
    d = os.path.join(tum, m3b.SEQS[seq][0])
    fr = m3b.frames(d)
    gt = m3b.groundtruth(d)
    nk = m3b.NKF * m3b.STEP
    idx = [w * nk + i * m3b.STEP for i in range(m3b.NKF)]
    kt = np.array([fr[i][0] for i in idx])
    rates = np.array([m3n.body_rate(gt, t, m3r.D) for t in kt])
    feats = [nfba.features(cv2.imread(os.path.join(d, fr[i][1]), cv2.IMREAD_GRAYSCALE)) for i in idx]
    r = nfba.solve_window(feats, m3r.SIZE, best["f0"])
    if "intr" not in r:
        return {"status_nfba": r["status"]}
    vi, pi, uv, X = r.pop("data")
    rv, tv = np.array(r.pop("rv")), np.array(r.pop("tv"))
    win = m3r.PWindow(vi, pi, uv, m3b.NKF, len(X), tv, kt.copy(), -rates, kt, 0.0, m3r.H, est_tr=True,
                      est_delta=False, prior=[(j, mu, sc / sig) for j, mu, sc in prior])
    win.gyro = -rates
    win.rates = lambda delta, _g=-rates: _g
    out = win.solve(np.array(r["intr"]), rv, tv, X, 0.0)
    out["nfba_f"] = r["intr"][0]
    return out


def mods():
    for p in ("m3b_natural", "m3l_gyro", "m3o_offset", "m3n_tumrs"):
        if os.path.join(EXP, p) not in sys.path:
            sys.path.insert(0, os.path.join(EXP, p))
    import nfba
    return {"nfba": nfba, "m3b": _load("m3b_run", os.path.join(EXP, "m3b_natural", "run.py")),
            "m3n": _load("m3n_run", os.path.join(EXP, "m3n_tumrs", "run.py")),
            "m3r": _load("m3r_run", os.path.join(EXP, "m3r_prior", "run.py"))}


def one(args):
    """est_c for one window: prior from milestone 3p's est on the camera's earlier counted windows."""
    tum, w, hist, best = args
    pr = causal_prior(hist)
    if pr is None:
        return (w["seq"], w["window"]), None
    s = solve(tum, w["seq"], w["window"], best, w["solves"]["est"]["rms_px"], pr, mods())
    s["prior"] = pr
    print("est_c", w["seq"], w["window"], round(s["intr"][0], 1), s["status"], flush=True)
    return (w["seq"], w["window"]), s


def chain(args):
    """est_cr: one camera's windows in recording order, each prior from the earlier windows' own est_cr
    solutions (est for a window that had no prior yet), so the chain is sequential."""
    tum, unit, ws, best = args
    M = mods()
    hist, out = [], {}
    for w in ws:
        pr = causal_prior(hist)
        s = None
        if pr is not None:
            s = solve(tum, w["seq"], w["window"], best[(w["seq"], w["window"])], w["solves"]["est"]["rms_px"],
                      pr, M)
            s["prior"] = pr
        out[(w["seq"], w["window"])] = s
        ok = s is not None and s.get("status", 0) > 0
        hist.append(list(s["intr"]) if ok else list(w["solves"]["est"]["intr"]))
        print("est_cr", unit, len(hist), w["seq"], w["window"], round(s["intr"][0], 1) if ok else None,
              flush=True)
    return out


def main():
    tum = sys.argv[1]
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    M = mods()
    m3n_an = _load("m3n_an", os.path.join(EXP, "m3n_tumrs", "analyse.py"))
    res3p = json.load(open(os.path.join(EXP, "m3p_tumvel", "results.json")))
    rows = [w for w in res3p["windows"] if m3n_an.counted(w)[0]]
    t0 = first_times(tum, rows, M["m3b"])
    units = order(rows, t0)
    best = M["m3n"].m3b_best()
    with Pool(nw) as p:
        cr = [p.apply_async(chain, ((tum, u, ws, best),)) for u, ws in units.items()]
        cj = []
        for u, ws in units.items():
            for k, w in enumerate(ws):
                hist = [list(v["solves"]["est"]["intr"]) for v in ws[:k]]
                cj.append(p.apply_async(one, ((tum, w, hist, best[(w["seq"], w["window"])]),)))
        c = dict(j.get() for j in cj)
        r = {}
        for j in cr:
            r.update(j.get())
    res = []
    for u, ws in units.items():
        for k, w in enumerate(ws):
            key = (w["seq"], w["window"])
            res.append({"seq": key[0], "unit": u, "window": key[1], "rank": k, "t0": t0[key],
                        "solves": {"est_c": c[key], "est_cr": r[key]}})
    with open(os.path.join(HERE, "results.json"), "w") as fh:
        json.dump({"n_min": N_MIN, "names": NAMES, "windows": res}, fh, indent=1)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
