"""Milestone 7am: is the start-offset basin's edge an acceleration (kp |e|) or a distance? Milestone 7al's RA2 on designs whose
position kp varies.

Milestone 7al found the 45 deg deaths of designs retrained at that limit are a basin in the start offset, but all its designs sat
at kp ~10 s^-2, so kp * |e| and |e| ranked flights identically. Milestone 7l's 36 designs (t45, t45 cap, t45 cap wide; above and
below; six seeds) include twelve that chose kp 21.7-31.5 in a widened box. Each is flown as 7l scored it (poshold.score's sizing
and gains, M6.cond("aware"), its arm's kp box, integrator feed-forward, its geometry's sign), at a 45 deg tilt-command limit,
lever 0, 64 held-out flights (seed 9999), 18 s, uncapped, with the start offset's half-width scaled by s (poshold.OFFSET =
0.5 s; the same draws, so each flight moves along a fixed ray). Arms: quiet+O (wind, step, turbulence, noise, yaw steps off)
and full at every s; full with 7l's cap at s = 1 and 2; a 6 s check at s = 1, full, with and without the cap (RB0).
Predictions RB0-RB4 in ../../LOG.md, committed before this file.
"""
import json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import run as M6  # noqa: E402
from codesign_cant import aero as A, poshold as P  # noqa: E402

SCALES = [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0]
CAP_SCALES = [1.0, 2.0]
TILT = 45.0
A_P = 3.5                                   # m/s^2, milestone 7l's cap
STEPS18 = 3 * P.STEPS
GEOMS = {"above": P.cop_signs(1.0), "below": P.cop_signs(-1.0)}
OFF0, POS_HI0, REF0 = P.OFFSET, P.POS_HI.copy(), P.reference


def designs():
    d = json.load(open(os.path.join(HERE, "..", "m7l_train45", "results.json")))
    return [r for r in d["runs"] if r["label"] != "7e"]


def gains(ds):
    """Physical gains per design, each under its own arm's kp box (POS_HI is read by phys_gains)."""
    out = []
    for r in ds:
        hi = POS_HI0.copy(); hi[0] = r["kp_hi"]; P.POS_HI = hi
        out.append(P.phys_gains(np.array(r["x"][:12], float)[None, 3:12])[0])
    P.POS_HI = POS_HI0
    return np.array(out)


def fly(arg):
    arm, s, cap, steps = arg
    ds = designs()
    x = np.array([r["x"][:12] for r in ds], float)
    g = gains(ds)
    c = M6.cond("aware")
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, c["alpha_max"] * np.clip(x[:, 2], 0, 1), kappa_per_d=c["kappa_per_d"], actuator="hover")
    quiet = arm == "quiet+O"

    def ref(episodes, seed, n=None):
        yaw, gust_n, gyro_n, ang_n, u0, off, pn, vn, wsign = REF0(episodes, seed, n)
        if quiet:
            gyro_n, ang_n, pn, vn, yaw = (np.zeros_like(a) for a in (gyro_n, ang_n, pn, vn, yaw))
        return yaw, gust_n, gyro_n, ang_n, u0, off, pn, vn, wsign

    P.reference = ref
    P.OFFSET = OFF0 * s
    P.TILT_CMD_MAX = np.deg2rad(TILT)
    dead = np.zeros((len(ds), M6.TEST_EP), bool)
    for geom, sign in GEOMS.items():                      # dist_sign is per call, so one rollout per geometry
        ix = [i for i, r in enumerate(ds) if r["geom"] == geom]
        o = P.rollout(sz_take(sz, ix), g[ix], c["kappa_per_d"] * D[ix], M6.TEST_EP, M6.TEST_SEED, couple=c["couple"],
                      dist_sign=sign, lever_scale=0.0, ff=1.0, ff_mode="integ", steps=steps,
                      perr_max=(A_P / g[ix, 6])[:, None, None] if cap else None,
                      gust_mean=0.0 if quiet else 3.0, wind_step=0.0 if quiet else P.WIND_STEP, gust_std=0.0 if quiet else 4.0)
        dead[ix] = o["dead_ep"]
    P.reference, P.OFFSET = REF0, OFF0
    return dict(arm=arm, s=s, cap=cap, steps=steps, dead=dead.astype(int).tolist())


def sz_take(sz, ix):
    n = len(next(v for v in sz.values() if np.ndim(v) > 0))
    return {k: (np.asarray(v)[ix] if np.ndim(v) > 0 and len(v) == n else v) for k, v in sz.items()}


def main():
    t0 = time.time()
    tasks = [(a, s, False, STEPS18) for a in ("quiet+O", "full") for s in SCALES]
    tasks += [("full", s, True, STEPS18) for s in CAP_SCALES]
    tasks += [("full", 1.0, cap, None) for cap in (False, True)]          # RB0: 7l's own 6 s episode
    with Pool(4) as p:
        out = p.map(fly, tasks, chunksize=1)
    ds = designs()
    off = P.reference(M6.TEST_EP, M6.TEST_SEED, STEPS18)[5]
    json.dump(dict(scales=SCALES, cap_scales=CAP_SCALES, a_p=A_P, tilt=TILT, offset0=OFF0, off=off.tolist(),
                   designs=[dict(label=r["label"], geom=r["geom"], seed=r["seed"], kp=float(k),
                                 stored_base=r["dead_45_0_base"], stored_cap=r["dead_45_0_cap"]) for r, k in zip(ds, gains(ds)[:, 6])],
                   runs=out, wall_s=time.time() - t0), open(os.path.join(HERE, "results.json"), "w"))
    print(f"wall time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
