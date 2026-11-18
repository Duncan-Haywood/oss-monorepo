"""Milestone 7ab: how much lag coverage is enough? The training-ceiling sweep at the identified floor.

7aa trained the lever-aware arm at the identified 39.1 ms floor (data/motor_lag/) with the plant lag x U(1, 150/39.1), so
training lags spanned 39.1-150 ms, and found the ceiling buys essentially all of the slow tunes' robustness: identified-range
crashes 27, 38 against 170, 178 for 7u's 39.1 ms tune whose ceiling was 78.2 ms (lag x U(1, 2)). 7aa's first next step: sweep
the ceiling at the same floor, c = 100 ms and 200 ms, to find how much coverage is enough and whether more coverage costs
response. Neither ceiling is sourced: they bracket 7aa's 150 ms on each side (78.2 ms is 7u, 150 ms is 7aa).

Training is 7aa's exactly otherwise (arm "aware src_li", closure src_li, 45 deg tilt limit, A_P cap, wide kp box, integrator
feed-forward, margin constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x 2 geometries), certificate corners at
33, 39.1 and c ms. The plant draw keeps its random stream (lag last of the three uniforms), so tau and mass draws are 7aa's
numbers and the lag multiplier is the same quantile remapped to U(1, c / 39.1).
Scoring:
  stress:   7z's held-out set (seed 9999, 64 episodes, four capped conditions, margin test) under 7z's eight laws, for the new
            designs (lag39c100, lag39c200) alongside 7u's lag39 (ceiling 78.2 ms), 7aa's lag39c150 and 7z's lag75;
  response: 7y's step, wind3 and wind6 tests (lever 1, 45 deg, calm, seed 9999, 64 episodes) under the three identified laws,
            for all five sets.
Predictions in ../../LOG.md, committed before the full-budget run.

Usage: python3 run.py            (SMOKE=1: 64 evaluations, 2 seeds, 8 test episodes on seed 4242, never the held-out seed)
"""
import importlib.util, json, os, time, warnings
from multiprocessing import Pool
import numpy as np

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


AA = _load("m7aa", "m7aa_ceiling")  # 7aa: its patch and stress summary; loads 7z, 7x, 7y
Z, X, Y = AA.Z, AA.X, AA.Y
R, M7, U, M6 = X.R, X.M7, X.U, X.M6
A, LS = X.A, X.LS
SMOKE = X.SMOKE
NSEED = R.SEEDS
FLOOR, FAST = AA.FLOOR, AA.FAST
CEILS = {"aware lag39c100": 0.100, "aware lag39c200": 0.200}
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
ORDER = Z.ORDER
SETS = ("aware lag39", "aware lag39c100", "aware lag39c150", "aware lag39c200", "aware lag75")
RESP_SETS = SETS


def patch(ceil):
    """Training-time lag: 39.1 ms D^0, plant lag x U(1, ceil/39.1), certificate corners {33, 39.1, ceil}. None: defaults."""
    if ceil is None:
        AA.patch(False)
        return
    AA.CEIL = ceil
    AA.patch(True)


def check_patch():
    R.set_closure("src_li")
    x = np.array([0.5] * 12)[None]
    out = []
    for arm, c in CEILS.items():
        patch(c)
        cs = sorted({round(A.LAG_K * k[2] * 1000, 1) for k in LS.PLANT_CORNERS})
        pl = A.plant_draw("wide", 4096, 0)
        lo, hi = float(pl["lag"].min() * A.LAG_K), float(pl["lag"].max() * A.LAG_K)
        r1 = float(X.H.margin_rho(x, np.full(1, A.TWR))[0])
        patch(None)
        assert cs == [33.0, 39.1, round(c * 1000, 1)], cs
        assert A.LAG_K == 0.015 and A.PLANT_RANGES["wide"]["lag"] == AA._LAGR and LS.PLANT_CORNERS == AA._CORNERS
        out.append(f"patch check: {arm} corners {cs} ms; training plant lag {lo * 1000:.1f}-{hi * 1000:.1f} ms over 4096 draws; "
                   f"rho at x=0.5 {r1:.4f}")
    return "\n".join(out)


def train(args):
    arm, geom, s, k = args
    f = os.path.join(CACHE, f"{arm.replace(' ', '_')}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    R.set_closure("src_li")
    patch(CEILS[arm])
    base, mod = R.ARMS["aware src_li"]
    out = (arm,) + tuple(mod.train_one(base, geom, s, k)[1:])
    patch(None)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {arm} {geom} seed {s} start {k}: best {out[4]:.3f} (rejected {out[6]})", flush=True)
    return out


def evaluate(law, d):
    return X.evaluate(law, d)


def fly(d, law, test):
    return Y.fly(d, law, test)


def old_designs():
    src = {"aware lag39": "m7w_slow45", "aware lag39c150": "m7aa_ceiling", "aware lag75": "m7z_floor75"}
    out = []
    for lab, sub in src.items():
        for d in json.load(open(os.path.join(HERE, "..", sub, "results.json")))["designs"]:
            if d["seed"] < NSEED and d["label"] == lab:
                out.append(dict(d))
    return out


if __name__ == "__main__":
    t0 = time.time()
    pc = check_patch(); print(pc, flush=True)
    jobs = [(a, g, s, k) for a in CEILS for g in R.GEOMS for s in range(NSEED) for k in range(len(M6.STARTS))]
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    designs = []
    for a in CEILS:
        for g in R.GEOMS:
            for s in range(NSEED):
                b = max((t for t in tr if t[0] == a and t[1] == g and t[2] == s), key=lambda t: t[4])
                designs.append(dict(label=a, closure="src_li", geom=g, seed=s, x=b[5], kp_hi=M7.KP_HI_WIDE, emax=None))
    designs += old_designs()
    with Pool() as p:
        out = p.starmap(evaluate, [(law, d) for law in ORDER for d in designs], chunksize=1)
    t_stress = time.time() - t0 - t_train
    rd = [d for d in designs if d["label"] in RESP_SETS]
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, test) for test in Y.TESTS for law in Y.LAWS for d in rd], chunksize=1)
    Y.SETS = list(RESP_SETS)
    Z.SETS = SETS
    lines = [pc, "", "Milestone 7ab: lever-aware arm trained at 39.1 ms x plant U(1, c / 39.1) for ceilings c = 100 and 200 ms, "
             f"certificate at 33, 39.1 and c ms; held-out {M7.TEST_EP} episodes, seed {M7.TEST_SEED}.", ""]
    lines += Z.stress_summary(out, tr) + Y.summarise(resp)
    lines.append(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s, stress {t_stress:.0f} s)")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(laws=U.LAWS, keys=U.KEYS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED, ceils=CEILS,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=designs, runs=out, resp_tests=Y.TESTS, resp_ep=Y.EP, resp_seed=Y.SEED, resp=Y.rnd(resp)),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print("\n".join(lines))
