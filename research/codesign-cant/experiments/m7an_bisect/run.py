"""Milestone 7an: bisect each flight's critical start offset r_c along 16 ray angles, for milestone 7am's 36 designs.

Each design is flown exactly as milestone 7am flew it (7l's sizing and gains, M6.cond("aware"), each arm's kp box, integrator
feed-forward, its geometry's centre-of-pressure sign, a 45 deg tilt-command limit, lever 0, 18 s, the 64 held-out plants of seed
9999, no cap), but every plant starts at r (cos th, sin th) through poshold.rollout's start_off, with every other draw unchanged.
Per (design, plant, th), r_c is bisected on [0.01, 3] m in 10 halvings after checking alive at 0.01 m and dead at 3 m.
Arms: quiet+O (wind, step, turbulence, noise, yaw steps off) at 16 angles; full at 8. Checks: each finite r_c flown at 1.5 r_c;
7l's cap (perr_max = A_P / kp) at 3 m on every angle. Predictions RC0-RC6 in ../../LOG.md, committed before this file.
"""
import json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("m7am_run", os.path.join(HERE, "..", "m7am_roa_kp", "run.py"))
_saved = sys.modules.pop("run", None)      # 7am does `import run` for m6_poshold; keep this file (or a test's import) out of its way
M7AM = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(M7AM)   # 7am's designs, gains and constants (loads M6, src)
if _saved is not None:
    sys.modules["run"] = _saved
M6, A, P = M7AM.M6, M7AM.A, M7AM.P

R_LO, R_HI, HALVINGS = 0.01, 3.0, 10
ANG_Q = [22.5 * k for k in range(16)]
ANG_F = [45.0 * k for k in range(8)]


def setup():
    ds = M7AM.designs()
    x = np.array([r["x"][:12] for r in ds], float)
    g = M7AM.gains(ds)
    c = M6.cond("aware")
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, c["alpha_max"] * np.clip(x[:, 2], 0, 1), kappa_per_d=c["kappa_per_d"], actuator="hover")
    return ds, g, c, D, sz


def sim(arm, start, cap, S):
    """Deaths (N, E) of all designs at start offsets start (N, E, 2) m."""
    ds, g, c, D, sz = S
    quiet = arm == "quiet+O"

    def ref(episodes, seed, n=None):
        yaw, gust_n, gyro_n, ang_n, u0, off, pn, vn, wsign = M7AM.REF0(episodes, seed, n)
        if quiet:
            gyro_n, ang_n, pn, vn, yaw = (np.zeros_like(a) for a in (gyro_n, ang_n, pn, vn, yaw))
        return yaw, gust_n, gyro_n, ang_n, u0, off, pn, vn, wsign

    P.reference = ref
    P.TILT_CMD_MAX = np.deg2rad(M7AM.TILT)
    dead = np.zeros((len(ds), M6.TEST_EP), bool)
    for geom, sign in M7AM.GEOMS.items():
        ix = [i for i, r in enumerate(ds) if r["geom"] == geom]
        o = P.rollout(M7AM.sz_take(sz, ix), g[ix], c["kappa_per_d"] * D[ix], M6.TEST_EP, M6.TEST_SEED, couple=c["couple"],
                      dist_sign=sign, lever_scale=0.0, ff=1.0, ff_mode="integ", steps=M7AM.STEPS18,
                      perr_max=(M7AM.A_P / g[ix, 6])[:, None, None] if cap else None, start_off=start[ix],
                      gust_mean=0.0 if quiet else 3.0, wind_step=0.0 if quiet else P.WIND_STEP, gust_std=0.0 if quiet else 4.0)
        dead[ix] = o["dead_ep"]
    P.reference = M7AM.REF0
    return dead


def bisect(arg):
    arm, th = arg
    S = setup(); N, E = len(S[0]), M6.TEST_EP
    u = np.array([np.cos(np.deg2rad(th)), np.sin(np.deg2rad(th))])
    at = lambda r: sim(arm, r[..., None] * u, False, S)
    dead_lo = at(np.full((N, E), R_LO)); dead_hi = at(np.full((N, E), R_HI))
    lo, hi = np.full((N, E), R_LO), np.full((N, E), R_HI)
    for _ in range(HALVINGS):
        mid = 0.5 * (lo + hi); d = at(mid)
        hi = np.where(d, mid, hi); lo = np.where(d, lo, mid)
    rc = np.where(dead_lo, 0.0, np.where(dead_hi, hi, np.inf))
    chk = at(np.where(np.isfinite(rc) & (rc > 0), 1.5 * hi, R_LO))
    cap3 = sim(arm, np.full((N, E), R_HI)[..., None] * u, True, S)
    return dict(arm=arm, th=th, rc=np.round(np.where(np.isinf(rc), -1.0, rc), 6).tolist(), lo=np.round(lo, 6).tolist(), dead_15=chk.astype(int).tolist(),
                cap_dead_3=cap3.astype(int).tolist())


def main():
    t0 = time.time()
    tasks = [("quiet+O", th) for th in ANG_Q] + [("full", th) for th in ANG_F]
    with Pool(4) as p:
        out = p.map(bisect, tasks, chunksize=1)
    ds, g = M7AM.designs(), M7AM.gains(M7AM.designs())
    json.dump(dict(r_lo=R_LO, r_hi=R_HI, halvings=HALVINGS, a_p=M7AM.A_P, tilt=M7AM.TILT,
                   designs=[dict(label=r["label"], geom=r["geom"], seed=r["seed"], kp=float(k)) for r, k in zip(ds, g[:, 6])],
                   runs=out, wall_s=time.time() - t0), open(os.path.join(HERE, "results.json"), "w"))
    print(f"wall time {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
