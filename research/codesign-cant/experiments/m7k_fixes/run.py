"""Milestone 7k: can a builder remove the 45-deg opening-transient crash in the controller, without retuning, and what does it cost?

Milestone 7j traced the retrained `above` designs' lever-0 crashes at a 45 deg tilt-command limit to the opening transient: the
position loop (kp at the top of its box, 10 s^-2) asks for a lean near 27 deg per axis to close a 0.5 m start offset, the 20 deg
training limit clipped that, 45 deg passes it, and the attitude loop then saturates the hover thrust polytope. Its advice was "tune
at the limit you fly". This milestone tests four controller-side fixes a builder could make to an existing tune instead
(`poshold.rollout`, all inert at their defaults, tests/test_poshold.py):
  cone      the tilt limit applied to the magnitude of the roll/pitch command, as PX4's MPC_TILTMAX_AIR does to the thrust
            vector, where the simulator so far clipped each axis on its own (combined tilt up to ~55 deg at a 45 deg limit);
  rate r    the roll/pitch reference slewed at most r rad/s (0.5, 1, 2; swept, no sourced default fits this simplified loop);
  perr e    the position error entering the proportional term clipped to e m (0.15, 0.25, 0.35; 0.36 m x kp 10 is the 20 deg lean);
  ramp v    the setpoint starting at the vehicle and moving to the hold point at v m/s (0.5, 1, 2), a speed-limited trajectory.
No training. The 48 designs milestone 7i scored (7e, 7h free, aware TWR=2.0, aware TWR free; 6 seeds; both rigid geometries), the
64 held-out episodes (seed 9999), integrator feed-forward, side force on; levers 0, 1, 2; tilt-command limits 20, 30, 45 deg.
A second block repeats lever 0 and 1 at 45 deg with the start offset at 1.0 m (twice the training offset: a larger reposition).
Predictions K1-K9 in ../../LOG.md, written and committed before this was run on the held-out seed.
"""
import json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))       # m7j_lever0/run.py imports m6_poshold/run.py as `run`
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("m7j_run", os.path.join(HERE, "..", "m7j_lever0", "run.py"))
M7J = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(M7J)   # designs(), sizes(), SETS
from codesign_cant import poshold as P  # noqa: E402

SMOKE = os.environ.get("SMOKE") == "1"
TEST_EP = 8 if SMOKE else 64
TEST_SEED = 4242 if SMOKE else 9999          # the smoke run never touches the held-out seed
SETS = M7J.SETS
RETRAINED = SETS[1:]
FIXES = {"base": {}, "cone": dict(tilt_cone=True),
         "rate 0.5": dict(tilt_rate=0.5), "rate 1": dict(tilt_rate=1.0), "rate 2": dict(tilt_rate=2.0),
         "perr 0.15": dict(perr_max=0.15), "perr 0.25": dict(perr_max=0.25), "perr 0.35": dict(perr_max=0.35),
         "ramp 0.5": dict(sp_rate=0.5), "ramp 1": dict(sp_rate=1.0), "ramp 2": dict(sp_rate=2.0)}
CAPS, LEVERS = (20.0, 30.0, 45.0), (0.0, 1.0, 2.0)
JOBS = [(g, c, l, f, 0.5) for g in ("above", "below") for c in CAPS for l in LEVERS for f in FIXES] + \
       [(g, 45.0, l, f, 1.0) for g in ("above", "below") for l in (0.0, 1.0) for f in FIXES]


def job(arg):
    geom, cap, lever, fix, offset = arg
    P.TILT_CMD_MAX = np.deg2rad(cap)            # module constants read by rollout/reference at call time; this worker only
    P.OFFSET = offset
    ds = [d for d in M7J.designs() if d[1] == geom]
    sz, g, kap = M7J.sizes(ds)
    o = P.rollout(sz, g, kap, TEST_EP, TEST_SEED, dist_sign=P.cop_signs(1.0 if geom == "above" else -1.0), lever_scale=lever,
                  ff=1.0, ff_mode="integ", **FIXES[fix])
    C = np.sqrt((o["pos"] / P.POS_SCALE_M) ** 2 + (o["yaw"] / P.YAW_SCALE_DEG) ** 2)
    return dict(geom=geom, cap=cap, lever=lever, fix=fix, offset=offset, sets=[d[0] for d in ds], seeds=[d[2] for d in ds],
                dead=o["dead_ep"].sum(1).astype(int).tolist(), C=C.tolist(), pos=o["pos"].tolist())


def pick(outs, geom, cap, lever, fix, offset=0.5):
    return next(o for o in outs if (o["geom"], o["cap"], o["lever"], o["fix"], o["offset"]) == (geom, cap, lever, fix, offset))


def summarise(outs):
    L = [f"Milestone 7k: controller-side fixes, no retuning. {TEST_EP} held-out episodes (seed {TEST_SEED}), integrator feed-forward, side force on.",
         f"dead = diverged episodes summed over a group's designs (retrained: 18 designs, {18 * TEST_EP} flights; 7e: 6, {6 * TEST_EP}).",
         "dC = mean over the group's designs of the paired change in held-out cost C = sqrt((pos/0.10 m)^2 + (yaw/10 deg)^2) against base",
         "(positive = worse; J = -C - power term, and the power term does not change), with its se and how many designs got worse.", ""]
    for offset, caps, levers in ((0.5, CAPS, LEVERS), (1.0, (45.0,), (0.0, 1.0))):
        L.append(f"=== start offset +-{offset:g} m per axis ===")
        for geom in ("above", "below"):
            for grp, members in (("retrained", RETRAINED), ("7e", ("7e",))):
                for cap in caps:
                    for lever in levers:
                        b = pick(outs, geom, cap, lever, "base", offset)
                        i = [k for k, s in enumerate(b["sets"]) if s in members]
                        cb = np.asarray(b["C"])[i]
                        cells = []
                        for f in FIXES:
                            o = pick(outs, geom, cap, lever, f, offset)
                            d = int(np.asarray(o["dead"])[i].sum())
                            if f == "base":
                                cells.append(f"base {d} (C {cb.mean():.3f})")
                                continue
                            dc = np.asarray(o["C"])[i] - cb
                            cells.append(f"{f} {d} (dC {dc.mean():+.3f} se {dc.std(ddof=1) / np.sqrt(len(dc)):.3f}, {int((dc > 0).sum())}/{len(dc)} worse)")
                        L.append(f"[{geom}, {grp}] cap {cap:g} lever {lever:g}: " + "; ".join(cells))
                L.append("")
    return L


if __name__ == "__main__":
    t0 = time.time()
    with Pool() as p:
        outs = p.map(job, JOBS, chunksize=1)
    lines = summarise(outs) + [f"wall time {time.time() - t0:.0f} s"]
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(fixes=FIXES, test_seed=TEST_SEED, episodes=TEST_EP, runs=outs), open(os.path.join(HERE, f"results{tag}.json"), "w"))
    print("\n".join(lines))
