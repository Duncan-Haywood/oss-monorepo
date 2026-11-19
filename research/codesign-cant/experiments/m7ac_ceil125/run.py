"""Milestone 7ac: where is the knee in training-lag coverage? A 125 ms ceiling at the identified 39.1 ms floor.

7ab swept the ceiling c of the training lag range (plant lag x U(1, c / 39.1)) at the identified 39.1 ms floor and found the
identified-range crash count falls in steps, 170 / 82 / 27 / 17 (centre of pressure above) and 178 / 109 / 38 / 36 (below) at
c = 78.2 / 100 / 150 / 200 ms, while rise time on a 1 m step jumps from about 1.5 s at 100 ms to 1.8-2.2 s at 150 ms. The knee is
somewhere between 100 and 150 ms, and so is the rise-time jump; 7ab's second next step places it with a ceiling at 125 ms (the
midpoint, not sourced).

Training is 7ab's exactly (arm "aware src_li", closure src_li, 45 deg tilt limit, A_P cap, wide kp box, integrator feed-forward,
margin constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x 2 geometries), certificate corners at 33, 39.1 and
125 ms, through 7ab's own patch and train functions. Same random stream, so tau and mass draws are 7ab's.
Scoring: 7z's held-out stress set (seed 9999, 64 episodes, four capped conditions, margin test, eight laws) and 7y's step, wind3
and wind6 response tests (lever 1, 45 deg, calm, seed 9999, 64 episodes, three identified laws) for six sets: 7u's lag39
(c = 78.2), 7ab's lag39c100, the new lag39c125, 7aa's lag39c150, 7ab's lag39c200 and 7z's lag75. The old designs are re-scored,
which doubles as the reproduction check.
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


AB = _load("m7ab", "m7ab_ceilsweep")  # 7ab: its patch, train, evaluate and fly; loads 7aa, 7z, 7x, 7y
Z, X, Y = AB.Z, AB.X, AB.Y
R, M7, U, M6 = AB.R, AB.M7, AB.U, AB.M6
SMOKE = AB.SMOKE
NSEED = AB.NSEED
CEILS = {"aware lag39c125": 0.125}
AB.CEILS = CEILS
AB.CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
ORDER = Z.ORDER
SETS = ("aware lag39", "aware lag39c100", "aware lag39c125", "aware lag39c150", "aware lag39c200", "aware lag75")


def train(args):
    return AB.train(args)


def evaluate(law, d):
    return X.evaluate(law, d)


def fly(d, law, test):
    return Y.fly(d, law, test)


def old_designs():
    src = {"aware lag39": "m7w_slow45", "aware lag39c100": "m7ab_ceilsweep", "aware lag39c150": "m7aa_ceiling",
           "aware lag39c200": "m7ab_ceilsweep", "aware lag75": "m7z_floor75"}
    out = []
    for lab, sub in src.items():
        for d in json.load(open(os.path.join(HERE, "..", sub, "results.json")))["designs"]:
            if d["seed"] < NSEED and d["label"] == lab:
                out.append(dict(d))
    return out


if __name__ == "__main__":
    t0 = time.time()
    pc = AB.check_patch(); print(pc, flush=True)
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
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, test) for test in Y.TESTS for law in Y.LAWS for d in designs], chunksize=1)
    Y.SETS = list(SETS)
    Z.SETS = SETS
    lines = [pc, "", "Milestone 7ac: lever-aware arm trained at 39.1 ms x plant U(1, 125 / 39.1) (ceiling 125 ms), "
             f"certificate at 33, 39.1 and 125 ms; held-out {M7.TEST_EP} episodes, seed {M7.TEST_SEED}.", ""]
    lines += Z.stress_summary(out, tr) + Y.summarise(resp)
    lines.append(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s, stress {t_stress:.0f} s)")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(laws=U.LAWS, keys=U.KEYS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED, ceils=CEILS,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=designs, runs=out, resp_tests=Y.TESTS, resp_ep=Y.EP, resp_seed=Y.SEED, resp=Y.rnd(resp)),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print("\n".join(lines))
