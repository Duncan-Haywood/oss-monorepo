"""Milestone 7g: what drives the residual divergence at a doubled centre-of-pressure lever (milestone 7f's first next step)?

Milestone 7f found that every design trained inside a linear ki margin of 0.8x or tighter (M = 1.25, 1.43, 1.67) still diverges on
12-13 of 384 held-out flights at lever 2 (outside the training range) with the tilt-command limit at 45 deg, and that no tighter
margin moves the count. Here the 18 margin-trained designs (and, for contrast, the 6 unconstrained ones) fly the same 64 held-out
flights (seed 9999, lever 2, 45 deg) under probes that each remove one candidate cause:
  base      the 7f condition, re-run with the diagnostics on;
  nocouple  no canted-rotor side force (couple=False: the simulator's ablation, not a vehicle a builder can make);
  noff      the integrator feed-forward off (ff=0) with the same gains;
  nomixer   the attitude-priority mixer bypassed (per-axis clip only);
  cap20     the default 20 deg tilt-command limit (7f's other condition).
Diagnostics per flight: the plant draw (mass, torque and lag scales), the wind-step signs, how it died (60 deg tilt or 5 m), when,
and the share of alive steps with the roll/pitch request at the torque limit and with the gust torque above the plant's torque limit.
Predictions G1-G7 in ../../LOG.md, written and committed before this was run.
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

SIGN = P.cop_signs(1.0)
LEVER, CAP = 2.0, 45.0
TEST_EP, TEST_SEED = M6.TEST_EP, M6.TEST_SEED
ARMS = {"base": {}, "nocouple": dict(couple=False), "noff": dict(ff=0.0), "nomixer": dict(mixer=False), "cap20": dict(cap=20.0)}
KAPPA = M6.cond("aware")["kappa_per_d"]


def designs():
    out = []
    for r in json.load(open(os.path.join(HERE, "..", "m7f_sweep", "results.json")))["runs"]:
        if r["label"] in ("unconstrained", "M=1.25", "M=1.43", "M=1.67"):
            out.append((r["label"], r["seed"], r["x"]))
    return sorted(out)


def sized(xs):
    x = np.asarray(xs, float)
    L = A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L, D, np.deg2rad(80.0) * np.clip(x[:, 2], 0, 1), kappa_per_d=KAPPA, actuator="hover")
    return sz, P.phys_gains(x[:, 3:12]), KAPPA * D


def job(arm):
    kw = dict(ARMS[arm]); cap = kw.pop("cap", CAP)
    P.TILT_CMD_MAX = np.deg2rad(cap)        # module constant read by rollout at call time; this worker process only
    ds = designs(); sz, g, kap = sized([d[2] for d in ds])
    diag = {}
    o = P.rollout(sz, g, kap, TEST_EP, TEST_SEED, dist_sign=SIGN, lever_scale=LEVER, ff=kw.pop("ff", 1.0), ff_mode="integ", diag=diag, **kw)
    # steady gust torque after the wind step (mean wind only, no turbulence) over the plant's roll/pitch torque limit, per flight
    wsign = P.reference(TEST_EP, TEST_SEED)[-1]
    vmax = np.abs(3.0 + P.WIND_STEP * wsign).max(1)                                          # m/s, the larger axis
    pl = A.plant_draw("wide", TEST_EP, TEST_SEED)
    kg = 0.5 * A.RHO * sz["area"] * sz["lever"] * LEVER
    ratio = kg[:, None] * vmax[None] ** 2 / (sz["tau_max"][:, None] * pl["tau"][None])
    return arm, dict(dead=o["dead_ep"].tolist(), pos=o["pos_ep"].tolist(), t_dead=diag["t_dead"].tolist(), dead_tilt=diag["dead_tilt"].tolist(),
                     req=diag["req_at_clip"].tolist(), over=diag["dist_over"].tolist(), tilt=diag["tilt_at_clip"].tolist(),
                     mix=diag["mix_rp"].tolist(), ratio=ratio.tolist())


def summarise(res):
    ds = designs(); labs = np.array([d[0] for d in ds])
    wsign = P.reference(TEST_EP, TEST_SEED)[-1]; pl = A.plant_draw("wide", TEST_EP, TEST_SEED)
    con = labs != "unconstrained"
    L = [f"Milestone 7g: lever {LEVER:g}, tilt-command limit {CAP:g} deg unless the arm says otherwise; {TEST_EP} held-out flights (seed {TEST_SEED}) per design.",
         "constrained = the 18 designs trained with ki <= ceiling / M, M = 1.25, 1.43, 1.67 (6 seeds each); unconstrained = 7b's 6 `integ retrained`.",
         "dead = diverged flights; tilt = share of deaths by the 60 deg tilt test; req/over = median share of alive steps with the roll/pitch",
         "request at the torque limit / the gust torque above the plant's torque limit, for dead and surviving flights.", ""]
    for arm in ARMS:
        r = res[arm]; dead = np.array(r["dead"]); dt = np.array(r["dead_tilt"]); req = np.array(r["req"]); over = np.array(r["over"])
        L.append(f"[{arm}]")
        for name, m in (("constrained", con), ("unconstrained", ~con)):
            d = dead[m]; n = int(d.sum())
            per = {lab: int(dead[labs == lab].sum()) for lab in sorted(set(labs[m]))}
            s = f"  {name}: dead {n} of {d.size} {per}"
            if n:
                s += (f"; tilt {dt[m][d].mean():.2f}; t_dead median {np.median(np.array(r['t_dead'])[m][d]) * A.DT:.2f} s"
                      f"; req dead {np.median(req[m][d]):.3f} alive {np.median(req[m][~d]):.3f}; over dead {np.median(over[m][d]):.3f} alive {np.median(over[m][~d]):.3f}")
            L.append(s)
        L.append("")
    r = res["base"]; dead = np.array(r["dead"])[con]; ratio = np.array(r["ratio"])[con]
    per_ep = dead.sum(0)
    L.append("[base, constrained] flights by episode (the plant and wind draw): designs of 18 dying in each episode that kills any")
    for e in np.nonzero(per_ep)[0]:
        L.append(f"  episode {e:2d}: {per_ep[e]:2d} of 18; wind step signs {wsign[e].astype(int).tolist()}; plant tau {pl['tau'][e]:.2f} mass {pl['mass'][e]:.2f} lag {pl['lag'][e]:.2f}; "
                 f"steady gust torque / plant limit {np.median(ratio[:, e]):.2f} (median over designs)")
    dp = dead.sum(); shared = int(sum(per_ep[e] for e in range(TEST_EP) if per_ep[e] >= 3))
    up = int(sum(per_ep[e] for e in range(TEST_EP) if (wsign[e] > 0).any()))
    L.append(f"  dead pairs in episodes where >= 3 of 18 designs die: {shared} of {dp}; with a rising wind step on some axis: {up} of {dp}")
    rd, ra = ratio[dead], ratio[~dead]
    L.append(f"  steady gust torque / plant limit: dead median {np.median(rd):.2f} (min {rd.min():.2f}); surviving median {np.median(ra):.2f}, "
             f"share of surviving flights above 1: {(ra > 1).mean():.3f}; share of flights above 1 that die: {dead[ratio > 1].mean() if (ratio > 1).any() else float('nan'):.3f}")
    return L


if __name__ == "__main__":
    t0 = time.time()
    with Pool() as p:
        res = dict(p.map(job, list(ARMS), chunksize=1))
    lines = summarise(res) + [f"wall time {time.time() - t0:.0f} s"]
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(designs=[d[:2] for d in designs()], arms=list(ARMS), lever=LEVER, cap=CAP, res=res), open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
