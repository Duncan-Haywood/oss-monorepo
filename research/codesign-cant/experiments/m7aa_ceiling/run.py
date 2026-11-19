"""Milestone 7aa: separate the tuning floor from the ceiling. Is the 75 ms tune's robustness bought by its slow floor or by its
150 ms ceiling?

Milestones 7u-7z tuned the lever-aware arm with the vehicle lag at a floor F (D^0) and the plant randomisation lag x U(1, 2), so
every training plant had lag in [F, 2F] and the certificate corners were 33 ms, F and 2F. Raising F moved both ends at once: the
75 ms tune (7z) trained up to 150 ms, the 39.1 ms tune (7u) only up to 78.2 ms. 7z's first next step: train at the identified
floor (39.1 ms, the slower of the two published identifications, data/motor_lag/) with the ceiling at 150 ms, i.e. plant lag
x U(1, 150 / 39.1) = U(1, 3.836), certificate corners at 33, 39.1 and 150 ms. 150 ms is NOT sourced: it is 7z's ceiling,
kept so the only change against 7z is the floor.

Training is 7z's exactly otherwise (arm "aware src_li", closure src_li, 45 deg tilt limit, A_P cap, wide kp box, integrator
feed-forward, margin constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x 2 geometries). The plant draw keeps its
random stream: lag is the last of the three draws, so tau and mass are the same numbers as in 7z and the lag multiplier is the
same quantile remapped to the wider interval.
Scoring:
  stress:   7z's held-out set (seed 9999, 64 episodes, four capped conditions, margin test) under 7z's eight laws, for the new
            designs (lag39c150), 7u's lag39 designs (7w's results.json), 7x's lag60 and 7z's lag75 designs;
  response: 7y's step, wind3 and wind6 tests (lever 1, 45 deg, no turbulence or yaw steps, seed 9999, 64 episodes) under the
            three identified laws, for lag39, lag39c150 and lag75.
Predictions in ../../LOG.md, committed before the full-budget run.

Usage: python3 run.py            (SMOKE=1: 64 evaluations, 2 seeds, 8 test episodes on seed 4242, never the held-out seed)
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


Z = _load("m7z", "m7z_floor75")    # 7z's laws (with 75 ms), stress summary; loads 7x (evaluate) and 7y (fly, response tests)
X, Y = Z.X, Z.Y
R, M7, U, M6 = X.R, X.M7, X.U, X.M6
A, LS = X.A, X.LS
SMOKE = X.SMOKE
NSEED = R.SEEDS
ARM = "aware lag39c150"
FLOOR, CEIL, FAST = 0.0391, 0.150, X.FAST
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
_CORNERS = list(LS.PLANT_CORNERS)
_LAGR = tuple(A.PLANT_RANGES["wide"]["lag"])
ORDER = Z.ORDER
SETS = ("aware lag39", ARM, "aware lag60", "aware lag75")
RESP_SETS = ("aware lag39", ARM, "aware lag75")


def patch(on):
    """Training-time lag: 39.1 ms D^0, plant lag x U(1, 150/39.1), certificate corners {33, 39.1, 150 ms}. Off: defaults."""
    if not on:
        A.LAG_K, A.LAG_EXP = 0.015, 1.5
        A.PLANT_RANGES["wide"]["lag"] = _LAGR
        LS.PLANT_CORNERS[:] = _CORNERS
        return
    hi = CEIL / FLOOR
    A.LAG_K, A.LAG_EXP = FLOOR, 0.0
    A.PLANT_RANGES["wide"]["lag"] = (1.0, hi)
    base = [(t, m, (1.0 if l == 1.0 else hi)) for t, m, l in _CORNERS]
    LS.PLANT_CORNERS[:] = base + [(t, m, FAST / FLOOR) for t, m, l in base if l == 1.0]


def check_patch():
    R.set_closure("src_li")
    x = np.array([0.5] * 12)[None]
    patch(True)
    c = sorted({round(A.LAG_K * c[2] * 1000, 1) for c in LS.PLANT_CORNERS})
    pl = A.plant_draw("wide", 4096, 0)
    lo, hi = float(pl["lag"].min() * A.LAG_K), float(pl["lag"].max() * A.LAG_K)
    r1 = float(X.H.margin_rho(x, np.full(1, A.TWR))[0])
    patch(False)
    assert c == [33.0, 39.1, 150.0], c
    assert LS.PLANT_CORNERS == _CORNERS and A.LAG_K == 0.015 and A.PLANT_RANGES["wide"]["lag"] == _LAGR
    return (f"patch check: {ARM} corners {c} ms; training plant lag {lo * 1000:.1f}-{hi * 1000:.1f} ms over 4096 draws; "
            f"rho at x=0.5 {r1:.4f}")


def train(args):
    arm, geom, s, k = args
    f = os.path.join(CACHE, f"{arm.replace(' ', '_')}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    R.set_closure("src_li")
    patch(True)
    base, mod = R.ARMS["aware src_li"]
    out = (arm,) + tuple(mod.train_one(base, geom, s, k)[1:])
    patch(False)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {arm} {geom} seed {s} start {k}: best {out[4]:.3f} (rejected {out[6]})", flush=True)
    return out


def evaluate(law, d):
    return X.evaluate(law, d)


def fly(d, law, test):
    return Y.fly(d, law, test)


def old_designs():
    src = {"aware lag39": "m7w_slow45", "aware lag60": "m7x_knee", "aware lag75": "m7z_floor75"}
    out = []
    for lab, sub in src.items():
        for d in json.load(open(os.path.join(HERE, "..", sub, "results.json")))["designs"]:
            if d["seed"] < NSEED and d["label"] == lab:
                out.append(dict(d))
    return out


if __name__ == "__main__":
    t0 = time.time()
    pc = check_patch(); print(pc, flush=True)
    jobs = [(ARM, g, s, k) for g in R.GEOMS for s in range(NSEED) for k in range(len(M6.STARTS))]
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    designs = []
    for g in R.GEOMS:
        for s in range(NSEED):
            b = max((t for t in tr if t[1] == g and t[2] == s), key=lambda t: t[4])
            designs.append(dict(label=ARM, closure="src_li", geom=g, seed=s, x=b[5], kp_hi=M7.KP_HI_WIDE, emax=None))
    designs += old_designs()
    with Pool() as p:
        out = p.starmap(evaluate, [(law, d) for law in ORDER for d in designs], chunksize=1)
    t_stress = time.time() - t0 - t_train
    rd = [d for d in designs if d["label"] in RESP_SETS]
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, test) for test in Y.TESTS for law in Y.LAWS for d in rd], chunksize=1)
    Y.SETS = list(RESP_SETS)
    Z.SETS = SETS
    lines = [pc, "", f"Milestone 7aa: lever-aware arm trained at 39.1 ms x plant U(1, {CEIL / FLOOR:.3f}) (ceiling 150 ms), "
             f"certificate at 33, 39.1 and 150 ms; held-out {M7.TEST_EP} episodes, seed {M7.TEST_SEED}.", ""]
    lines += Z.stress_summary(out, tr) + Y.summarise(resp)
    lines.append(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s, stress {t_stress:.0f} s)")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    # full precision for designs and stress runs (7z's process note: the margin test is strict, rho < 1)
    json.dump(dict(laws=U.LAWS, keys=U.KEYS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=designs, runs=out, resp_tests=Y.TESTS, resp_ep=Y.EP, resp_seed=Y.SEED, resp=Y.rnd(resp)),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print("\n".join(lines))
