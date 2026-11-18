"""Milestone 7y: what does tuning slower cost at lever 1? A 1 m position step and a calm-to-wind step, scored on 7x's designs.

Milestones 7u-7x found that tuning the lever-aware arm at a slower motor lag than the one flown cuts crashes in the held-out
stress test (lever 2, 45 deg) at every identified lag, with no knee up to a 60 ms floor; the price showed as mass (+4-8%),
a softer position loop (kp 18 against 22.5 1/s^2) and about 5% worse median tracking cost at lever 1. The stress test rewards a
slow, heavy vehicle by construction, so 7x's next step asks for a test that charges the softer loop in units a builder states:
how long a position step takes to settle, how far it overshoots, and how far the vehicle drifts when the wind steps.

No retraining. The 48 lever-aware designs of 7x (7u's 39.1 ms, 7w's 45 ms, 7x's 52 and 60 ms floors; 6 seeds x 2 geometries)
are flown under the three identified laws (33, 36, 39.1 ms D^0) at lever 1, 45 deg tilt limit, A_P cap, integrator
feed-forward, the evaluation's plant randomisation ("wide": mass, torque and lag drawn per episode), sensor noise as the
held-out set, seed 9999, 64 episodes, 6 s. Two tests, each with turbulence and yaw steps switched off so the response is the
loop's own:
  step:   start 1 m off the hold point on x (0 on y), still air; settle time = first time after which |e| stays within 0.05 m,
          overshoot = largest excursion past the hold point (m), and RMS error over the episode.
  wind W: start on the hold point, calm; the mean wind steps from 0 to W m/s along x at 1 s (W = 3 m/s, the held-out set's
          wind-step size `poshold.WIND_STEP`, and 6 m/s); peak drift from the hold point after the step, RMS over the 5 s after
          it, and the mean offset over the last 1 s (what the integrator has not yet removed).
Predictions Y1-Y6 in ../../LOG.md, committed before the full run.

Usage: python3 run.py            (SMOKE=1: 8 episodes on seed 4242, 2 seeds per set; never the held-out seed)
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import run as M6  # noqa: E402
from codesign_cant import aero as A, poshold as P  # noqa: E402


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


U = _load("m7u", "m7u_slow_end")
R, M7, L7, H = U.R, U.M7, U.L7, U.H
SMOKE = os.environ.get("SMOKE") == "1"
EP = 8 if SMOKE else 64
SEED = 4242 if SMOKE else 9999
LAWS = {"id 33 ms D^0": (0.033, 0.0), "mid 36 ms D^0": (0.036, 0.0), "id 39.1 ms D^0": (0.0391, 0.0)}
SETS = ["aware lag39", "aware lag45", "aware lag52", "aware lag60"]
TESTS = {"step": dict(off=1.0, wind=0.0), "wind3": dict(off=0.0, wind=3.0), "wind6": dict(off=0.0, wind=6.0)}
STEP_M, BAND = 1.0, 0.05
T_WIND = 1.0
TILT = 45.0
_REF = P.reference


def ref_patch(off):
    """Keep the held-out sensor noise and seeds, drop turbulence and yaw steps, fix the start offset and the wind direction (+x)."""
    def ref(episodes, seed, steps=None):
        yaw, gust_n, gyro_n, ang_n, u0, o, pn, vn, ws = _REF(episodes, seed, steps)
        o = np.zeros_like(o); o[:, 0] = off
        ws = np.zeros_like(ws); ws[:, 1] = 1.0   # rollout's v[..., 1] drives x (wind[:, :, 1] -> vel x)
        return np.zeros_like(yaw), np.zeros_like(gust_n), gyro_n, ang_n, np.zeros_like(u0), o, pn, vn, ws
    return ref


def fly(d, law, test):
    A.LAG_K, A.LAG_EXP = LAWS[law]
    R.set_closure(d["closure"])
    L7.setup(TILT, d["kp_hi"])
    cfg = TESTS[test]
    P.reference = ref_patch(cfg["off"]); P.T_WIND_STEP = T_WIND
    x = np.array(d["x"][:12], float)[None]
    c = M6.cond("aware")
    Lm = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0])
    D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    alpha = c["alpha_max"] * np.clip(x[:, 2], 0, 1)
    sz = A.size(Lm, D, alpha, kappa_per_d=c["kappa_per_d"], twr=None, actuator="hover")
    tr = []
    o = P.rollout(sz, P.phys_gains(x[:, 3:12]), c["kappa_per_d"] * D, EP, SEED, gust_std=0.0, gust_mean=0.0, couple=c["couple"],
                  wind_step=cfg["wind"], dist_sign=H.GEOMS[d["geom"]], lever_scale=1.0, ff=1.0, ff_mode="integ",
                  perr_max=L7.perr_of(x, True), trace=tr)
    P.reference = _REF; P.T_WIND_STEP = 3.0
    L7.setup()
    A.LAG_K, A.LAG_EXP = 0.015, 1.5
    pos = np.stack(tr, 0)[:, 0]               # (T, E, 2)
    t = (np.arange(pos.shape[0]) + 1) * A.DT
    dead = o["dead_ep"][0]
    r = dict(set=d["label"], geom=d["geom"], seed=d["seed"], law_name=law, test=test, dead=int(dead.sum()),
             mass=float(sz["mass"][0]), pos_kp=float(P.phys_gains(x[:, 3:12])[0, 6]))
    e = np.sqrt((pos ** 2).sum(-1))           # distance from the hold point (T, E)
    if test == "step":
        out = np.abs(e) > BAND
        last = np.where(out.any(0), (out.shape[0] - 1 - np.argmax(out[::-1], 0)), -1)
        settle = np.where(out[-1], np.nan, t[np.clip(last + 1, 0, len(t) - 1)])   # never settled in 6 s -> NaN
        settle = np.where(dead, np.nan, settle)
        over = np.nanmax(np.maximum(-pos[:, :, 0], 0.0), 0)
        rise = np.argmax(pos[:, :, 0] <= 0.1 * STEP_M, 0) * A.DT          # time to 90% of the step
        r.update(settle=settle.tolist(), over=over.tolist(), rise=np.where(dead, np.nan, rise).tolist(),
                 rms=np.sqrt(np.nanmean(e ** 2, 0)).tolist(),
                 tail_off=np.nanmean(e[-int(1.0 / A.DT):], 0).tolist(),                  # post hoc: mean distance over the last 1 s
                 tail_pp=(np.nanmax(pos[-int(1.0 / A.DT):, :, 0], 0) - np.nanmin(pos[-int(1.0 / A.DT):, :, 0], 0)).tolist())   # and x peak-to-peak
    else:
        k = int(T_WIND / A.DT)
        r.update(peak=np.nanmax(e[k:], 0).tolist(), rms=np.sqrt(np.nanmean(e[k:] ** 2, 0)).tolist(),
                 resid=np.nanmean(e[-int(1.0 / A.DT):], 0).tolist())
    return r


def med(v):
    v = np.asarray(v, float)
    return float(np.nanmedian(v)) if np.isfinite(v).any() else float("nan")


def summarise(out):
    Ls = [f"Milestone 7y: lever 1, {TILT:g} deg, cap, integrator feed-forward, plant 'wide', {EP} episodes, seed {SEED}; no turbulence, "
          "no yaw steps. Per set and geometry: the median over seeds of each design's median over episodes; dead summed.", ""]
    for test in TESTS:
        Ls.append(f"== {test} ==")
        for law in LAWS:
            for g in R.GEOMS:
                for s in SETS:
                    rs = sorted((r for r in out if r["test"] == test and r["law_name"] == law and r["geom"] == g and r["set"] == s),
                                key=lambda r: r["seed"])
                    if not rs: continue
                    dead = sum(r["dead"] for r in rs)
                    if test == "step":
                        st = [med(r["settle"]) for r in rs]
                        uns = sum(int(np.isnan(np.asarray(r["settle"], float)).sum()) for r in rs) - dead
                        Ls.append(f"  {law:>15} {g:>5} {s:>11}: settle {med(st):.3f} s (per seed {', '.join(f'{v:.2f}' for v in st)}); "
                                  f"rise90 {med([med(r['rise']) for r in rs]):.3f} s; overshoot {med([med(r['over']) for r in rs]) * 100:.1f} cm; "
                                  f"rms {med([med(r['rms']) for r in rs]):.3f} m; unsettled {uns}; dead {dead}")
                    else:
                        pk = [med(r["peak"]) for r in rs]
                        Ls.append(f"  {law:>15} {g:>5} {s:>11}: peak {med(pk) * 100:.1f} cm (per seed {', '.join(f'{v * 100:.1f}' for v in pk)}); "
                                  f"rms {med([med(r['rms']) for r in rs]) * 100:.1f} cm; resid {med([med(r['resid']) for r in rs]) * 100:.1f} cm; dead {dead}")
            Ls.append("")
    return Ls


if __name__ == "__main__":
    t0 = time.time()
    designs = [d for d in json.load(open(os.path.join(HERE, "..", "m7x_knee", "results.json")))["designs"]
               if d["label"] in SETS and d["seed"] < (2 if SMOKE else 6)]
    assert len(designs) == (16 if SMOKE else 48), len(designs)
    jobs = [(d, law, test) for test in TESTS for law in LAWS for d in designs]
    with Pool() as p:
        out = p.starmap(fly, jobs, chunksize=1)
    lines = summarise(out) + [f"wall time {time.time() - t0:.0f} s"]
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(laws=LAWS, tests=TESTS, ep=EP, seed=SEED, runs=out), open(os.path.join(HERE, f"results{sfx}.json"), "w"))
    print("\n".join(lines))
