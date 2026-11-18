"""Milestone 7q: does the programme's sizing closure survive component constants taken from listed data, and what does the swap do
to the 48 fixed designs of milestones 7o and 7p?

7p found that the closure (15 min endurance, battery, motor-mass fit, propulsive efficiency; all inherited and ASSUMED) multiplies a
frame-mass change 6-15 times. fit.py sources its three component constants from data/components/ (closure.json). Closures:

  inh60:   WH_KG 150, motor 0.045 (T/9 N)^1.2, FM ETA 0.4875, closure by the inherited 60-step damped iteration (reproduces 7o/7p)
  inh:     the same constants, closure solved exactly (aero.SIZE_SOLVE = "exact": smallest fixed point, or none)
  bat:     inh with the listed LiPo median specific energy
  mot:     inh with the motor-mass law fitted to bench tables and listings
  eff:     inh with FM ETA from SunnySky's 5-inch bench runs at half maximum thrust
  src:     bat + mot + eff (the sourced LiPo closure)
  src_li:  src with the listed Li-ion median specific energy (the chemistry long-endurance builds carry)
All but inh60 solve the closure exactly. Per design and closure it also records the longest endurance that still closes (emax).

Everything else (frame law 0.05 + 0.8 L, payload 0.25 kg, electronics 0.06 kg, endurance 15 min, DOD 0.8, TWR 2, cost model) is
unchanged, so only the component constants move. The designs are not retuned. Per design: sizing at its own L under all six closures,
the closure gain dm/dm_frame (mass change per kg of frame, by finite difference, +10 g), the margin test, feasibility, and held-out
flights (64 episodes, seed 9999, cap on: lever 1 at 45 deg, lever 2 at 20 and 45 deg, lever 3 at 20 deg); and 7p's arm grid
(0.085-0.150 m, 5 mm) under inh, src and src_li. SIZING_ONLY=1 skips the flights. Predictions Q1-Q7 in ../../LOG.md, committed first.
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7o", os.path.join(HERE, "..", "m7o_arm_sweep", "run.py"))
O = importlib.util.module_from_spec(spec); spec.loader.exec_module(O)
A, M6, L7, P, H, GEOMS = O.A, O.M6, O.L7, O.P, O.H, O.GEOMS
SMOKE = os.environ.get("SMOKE") == "1"
SIZING_ONLY = os.environ.get("SIZING_ONLY") == "1"
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED
SEEDS = 2 if SMOKE else M6.SEEDS
O.SEEDS = SEEDS
FIT = json.load(open(os.path.join(HERE, "closure.json")))
INH = dict(WH_KG=150.0, MOTOR_K=0.045, MOTOR_EXP=1.2, FM=0.65, SIZE_SOLVE="exact")
LIPO, LIION = FIT["battery"]["lipo"]["median"], FIT["battery"]["liion"]["median"]
MK, ME = FIT["motor"]["k"], FIT["motor"]["exp"]
FM_SRC = FIT["power"]["5 in (R-series FPV)"]["median"] / A.ETA   # A.ETA stays 0.75; FM carries the change so FM ETA = the bench value
CLOSURES = {"inh60": dict(INH, SIZE_SOLVE="iter60"),   # exactly what milestones 0-7p ran
            "inh": INH,                                  # the same constants, closure solved exactly
            "bat": dict(INH, WH_KG=LIPO),
            "mot": dict(INH, MOTOR_K=MK, MOTOR_EXP=ME),
            "eff": dict(INH, FM=FM_SRC),
            "src": dict(INH, WH_KG=LIPO, MOTOR_K=MK, MOTOR_EXP=ME, FM=FM_SRC),
            "src_li": dict(INH, WH_KG=LIION, MOTOR_K=MK, MOTOR_EXP=ME, FM=FM_SRC)}
GRID_MODES = ("inh60", "inh", "src_li")
GRID = [round(0.085 + 0.005 * i, 3) for i in range(14)]
CONDS = O.CONDS


def endurance_max(L, D, al, c):
    """Longest endurance (min) for which the exact closure has a fixed point below the clamp, by bisection on [0.5, 120]."""
    lo, hi = 0.5, 120.0
    keep = A.ENDURANCE_MIN
    for _ in range(40):
        A.ENDURANCE_MIN = 0.5 * (lo + hi)
        m = float(O._size(L, D, al, kappa_per_d=c["kappa_per_d"], actuator="hover")["mass"])
        lo, hi = (A.ENDURANCE_MIN, hi) if m < A.M_CLAMP else (lo, A.ENDURANCE_MIN)
    A.ENDURANCE_MIN = keep
    return lo


def set_closure(name):
    A.FRAME0, A.FRAME_K = 0.05, 0.8
    for k, v in CLOSURES[name].items():
        setattr(A, k, v)


def eval_points(X, D, al, c, kp_hi, geom, rec, key):
    L7.setup(None, kp_hi)
    rec[f"{key}_rho"] = [float(v) for v in H.margin_rho(X, np.full(len(X), A.TWR))]
    L7.setup()
    Ls = O.L_of_u(X[:, 0])
    sz = O._size(Ls, D, al, kappa_per_d=c["kappa_per_d"], actuator="hover")
    A.FRAME0 = 0.06   # +10 g of frame; reset to the exact constant (7p: a sub-micron change flips marginal flights)
    sz2 = O._size(Ls, D, al, kappa_per_d=c["kappa_per_d"], actuator="hover")
    A.FRAME0 = 0.05
    rec[f"{key}_gain"] = ((sz2["mass"] - sz["mass"]) / 0.01).tolist()
    for f in ("mass", "power", "cost", "wh", "Tmax"):
        rec[f"{key}_{f}"] = np.asarray(sz[f], float).tolist()
    rec[f"{key}_motor"] = (A.MOTOR_K * (np.asarray(sz["Tmax"]) / 9.0) ** A.MOTOR_EXP).tolist()
    rec[f"{key}_feasible"] = [bool(v) for v in sz["feasible"]]
    rec[f"{key}_tau_per_weight"] = (sz["tau_max"] / (sz["mass"] * A.G)).tolist()
    if SIZING_ONLY:
        return
    for t, lev in CONDS:
        L7.setup(t, kp_hi, None)
        J, _, o = P.score(X, TEST_EP, TEST_SEED, parts=True, dist_sign=GEOMS[geom], lever_scale=lev, ff=1.0, ff_mode="integ",
                          perr_max=L7.perr_of(X, True), **M6.cond("aware"))
        rec[f"{key}_dead_{t:g}_{lev:g}"] = [int(round(float(v) * TEST_EP)) for v in o["dead"]]
        rec[f"{key}_J_{t:g}_{lev:g}"] = [float(v) for v in J]
    L7.setup()


def design(label, geom, s, x12, kp_hi):
    x0 = np.array(x12, float)
    L0 = float(O.L_of_u(x0[0]))
    D = A.D_RANGE[0] + x0[1] * (A.D_RANGE[1] - A.D_RANGE[0])
    c = M6.cond("aware"); al = c["alpha_max"] * np.clip(x0[2], 0, 1)
    rec = dict(label=label, geom=geom, seed=s, L0=L0, D=float(D), grid=GRID)
    O.PIN.clear()
    for name in CLOSURES:   # own L, coordinate untouched
        set_closure(name)
        eval_points(x0[None], D, al, c, kp_hi, geom, rec, f"own_{name}")
        if name != "inh60":
            rec[f"own_{name}_emax"] = endurance_max(L0, D, al, c)
    for name in GRID_MODES:
        set_closure(name)
        X = np.repeat(x0[None], len(GRID), axis=0); X[:, 0] = [O.u_of_L(L) for L in GRID]
        eval_points(X, D, al, c, kp_hi, geom, rec, f"grid_{name}")
    set_closure("inh")
    return rec


if __name__ == "__main__":
    t0 = time.time()
    with Pool() as p:
        out = p.starmap(design, O.sets(), chunksize=1)
    sfx = "_sizing" if SIZING_ONLY else ("_smoke" if SMOKE else "")
    json.dump(dict(closures=CLOSURES, grid=GRID, conds=CONDS, test_ep=TEST_EP, test_seed=TEST_SEED, seconds=time.time() - t0, runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print(f"{len(out)} designs, {time.time() - t0:.0f} s")
