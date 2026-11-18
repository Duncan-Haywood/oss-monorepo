"""Milestone 3o, post hoc (written after analyse.py scored H189-H194): where does the ~3 ms scatter
of the offset estimate come from? known_d at delta = 10 ms on the first N windows with pixel noise,
gyro noise and the generator's linear velocity (unmodelled by known_d) switched on and off separately. Not a hypothesis test.

    OMP_NUM_THREADS=1 python3 diag.py [n_windows] [n_workers]     # writes diag.json
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run  # noqa: E402
import tsba  # noqa: E402
m3k, m3l, m3m = run.m3k, run.m3l, run.m3m
DELTA = 0.010
CASES = {"both": (0.5, 1.0, 1), "pixel_only": (0.5, 0.0, 1), "gyro_only": (0.0, 1.0, 1), "neither": (0.0, 0.0, 1),
         "neither_u0": (0.0, 0.0, 0), "both_u0": (0.5, 1.0, 0),
         "both_ufree": (0.5, 1.0, 1, True)}   # optional 4th: solve with a free linear velocity per keyframe   # last: keep (1) or zero (0) the linear velocity


def data(spec, px):
    rv, tv, X, _ = m3k.window(spec["seed"])
    noise = np.random.default_rng(20_000 + spec["seed"])
    vi, pi, uv = m3k.observe(rv, tv, X, np.array(spec["w"]), np.array(spec["u"]), m3k.TR, noise, noise=px)
    keep = np.bincount(pi, minlength=len(X)) >= 3
    sel = keep[pi]
    remap = -np.ones(len(X), int); remap[keep] = np.arange(keep.sum())
    vi, pi, uv = vi[sel], remap[pi[sel]], uv[sel]
    rng = np.random.default_rng(10_000 + spec["seed"])
    rv0 = rv + np.r_[np.zeros((1, 3)), rng.normal(0, 0.01, (m3k.NKF - 1, 3))]
    return vi, pi, uv, rv0, tv, X[keep] + rng.normal(0, 0.02, X[keep].shape)


def job(spec):
    seed = spec["seed"]
    tk = m3m.kf_times()
    spec_t = dict(spec, w=m3m.w_of_t(seed, tk).tolist())
    out = {"seed": seed}
    for name, (px, gscale, ku, *fu) in CASES.items():
        vi, pi, uv, rv0, tv, X0 = data(dict(spec_t, u=(ku * np.array(spec["u"])).tolist()), px)
        gs, gw = run.gyro_samples(seed, DELTA)
        gw = m3m.w_of_t(seed, gs + DELTA) + gscale * (gw - m3m.w_of_t(seed, gs + DELTA))
        win = tsba.TWindow(vi, pi, uv, m3k.NKF, len(X0), tv, gs, gw, tk, m3k.TR, m3k.H, False, True, est_u=bool(fu))
        start = np.array([m3k.INTR[0] * 1.08, m3k.W / 2, m3k.H / 2, 0.0, 0.0])
        r = win.solve(start, rv0, tv * 1.0, X0)
        out[name] = {"err_ms": 1e3 * (r["delta"] - DELTA), "sd_ms": 1e3 * r["sd_delta"], "status": r["status"],
                     "f": r["intr"][0]}
    return out


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    with Pool(nw) as p:
        res = p.map(job, m3m.ref_specs()[:n])
    S = {}
    for c in CASES:
        e = np.array([r[c]["err_ms"] for r in res if r[c]["status"] > 0])
        S[c] = {"n": len(e), "median_abs_err_ms": float(np.median(np.abs(e))),
                "rms_err_ms": float(np.sqrt((e ** 2).mean())),
                "median_sd_ms": float(np.median([r[c]["sd_ms"] for r in res]))}
    json.dump({"delta_s": DELTA, "summary": S, "jobs": res}, open(os.path.join(HERE, "diag.json"), "w"), indent=1)
    print(json.dumps(S, indent=1))


if __name__ == "__main__":
    main()
