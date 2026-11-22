"""Milestone 12e: section VII's 100 ms training-lag ceiling at ten seeds per geometry, against 12c's ten-seed 125 ms arm.

Milestones 12c and 12d put the knee of the ceiling sweep at about 150 ms (3.8x the slowest identified lag): 125→150 ms
separates at ten seeds (p = 0.004), 150→200 ms does not (p = 0.08). The pair below, 100 against 125 ms, was separated at six
seeds (identified total 191 against 101 of 2304, p = 0.025), with 100 ms the only six-seed row left in the knee region. This
script trains seeds 6-9 of milestone 7ab's 100 ms arm ("aware lag39c100") in both centre-of-pressure geometries with 7ab's
own patch and train functions (arm "aware src_li", closure src_li, 45 deg tilt limit, A_P cap, wide kp box, integrator
feed-forward, margin constraint at 0.8x the ki ceiling, TWR 2, 3200 CMA-ES evaluations, two starts, certificate corners at
33, 39.1 and 100 ms), then scores all 20 designs (seeds 0-9) on 7z's held-out stress set (seed 9999, 64 episodes, four capped
conditions, eight laws) and 7y's step, wind3 and wind6 response tests (lever 1, 45 deg, calm, seed 9999, 64 episodes). The
125 ms arm's ten seeds are read from ../m12c_ten_seeds_vii/results.json.

Reproduction checks first: 7ab's 100 ms above / seed 0 / start 0 is retrained and must give its stored best training score,
and the re-scored seeds 0-5 must equal 7ac's stored held-out numbers (verify.py re-checks with NaN-aware equality).
Predictions in ../../LOG.md, committed before the full run.

Usage: python3 run.py   (SMOKE=1: 64 evaluations, seeds 6-7, 8 test episodes on seed 4242, never the held-out seed)
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


AB = _load("m7ab", "m7ab_ceilsweep")  # 7ab: patch, train (cached), evaluate, fly; loads 7aa, 7z, 7x, 7y
Z, X, Y = AB.Z, AB.X, AB.Y
R, M7, U, M6 = AB.R, AB.M7, AB.U, AB.M6
SMOKE = AB.SMOKE
CEILS = {"aware lag39c100": 0.100}
AB.CEILS = CEILS
AB.CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
NEW_SEEDS = (6, 7) if SMOKE else (6, 7, 8, 9)
OLD_SEEDS = range(6)
SRC = {"aware lag39c100": "m7ab_ceilsweep"}
ORDER = Z.ORDER


def train(args):
    return AB.train(args)


def evaluate(law, d):
    return AB.evaluate(law, d)


def fly(d, law, test):
    return AB.fly(d, law, test)


def stored(sub):
    return json.load(open(os.path.join(HERE, "..", sub, "results.json")))


def design(a, g, s, x):
    return dict(label=a, closure="src_li", geom=g, seed=s, x=x, kp_hi=M7.KP_HI_WIDE, emax=None)


if __name__ == "__main__":
    t0 = time.time()
    pc = AB.check_patch(); print(pc, flush=True)
    jobs = [(a, g, s, k) for a in CEILS for g in R.GEOMS for s in NEW_SEEDS for k in range(len(M6.STARTS))]
    if not SMOKE:
        jobs = [(a, "above", 0, 0) for a in CEILS] + jobs
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    checks = []
    if not SMOKE:
        for a in CEILS:
            got = [t for t in tr if t[0] == a and t[1] == "above" and t[2] == 0 and t[3] == 0][0][4]
            want = [t for t in stored(SRC[a])["train"] if t["arm"] == a and t["geom"] == "above" and t["seed"] == 0
                    and t["start"] == 0][0]["best"]
            checks.append((f"{a} above seed 0 start 0 best training score", got, want, got == want))
        tr = [t for t in tr if t[2] in NEW_SEEDS]
    old = stored("m7ac_ceil125")
    designs = [d for d in old["designs"] if d["label"] in CEILS and d["seed"] in OLD_SEEDS]
    for a in CEILS:
        for g in R.GEOMS:
            for s in NEW_SEEDS:
                b = max((t for t in tr if t[0] == a and t[1] == g and t[2] == s), key=lambda t: t[4])
                designs.append(design(a, g, s, b[5]))
    with Pool() as p:
        out = p.starmap(evaluate, [(law, d) for law in ORDER for d in designs], chunksize=1)
    t_stress = time.time() - t0 - t_train
    if not SMOKE:
        ref = {(r["set"], r["geom"], r["seed"], r["law_name"]): r for r in old["runs"] if r["set"] in CEILS}
        keys = [k for k in out[0] if k.startswith(("dead_", "J_"))]
        bad = [(r["set"], r["geom"], r["seed"], r["law_name"], k) for r in out if r["seed"] in OLD_SEEDS
               for k in keys if r[k] != ref[(r["set"], r["geom"], r["seed"], r["law_name"])][k]]
        checks.append(("re-scored seeds 0-5 equal 7ac's stored stress numbers (mismatches)", len(bad), 0, not bad))
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, test) for test in Y.TESTS for law in Y.LAWS for d in designs], chunksize=1)
    if not SMOKE:
        rref = {(r["set"], r["geom"], r["seed"], r["law_name"], r["test"]): r for r in old["resp"] if r["set"] in CEILS}
        rr = Y.rnd(resp)
        bad = [(r["set"], r["seed"], r["test"]) for r in rr if r["seed"] in OLD_SEEDS
               and r != rref[(r["set"], r["geom"], r["seed"], r["law_name"], r["test"])]]
        checks.append(("re-scored seeds 0-5 equal 7ac's stored response records, every test (mismatches)", len(bad), 0, not bad))
    sfx = "_smoke" if SMOKE else ""
    json.dump(dict(laws=U.LAWS, keys=U.KEYS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED, ceils=CEILS,
                   new_seeds=list(NEW_SEEDS),
                   checks=[dict(what=c[0], got=c[1], want=c[2], ok=bool(c[3])) for c in checks],
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=designs, runs=out, resp_tests=Y.TESTS, resp_ep=Y.EP, resp_seed=Y.SEED, resp=Y.rnd(resp),
                   wall_s=time.time() - t0, train_s=t_train, stress_s=t_stress),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    for c in checks:
        print("CHECK", "ok " if c[3] else "FAIL", c[0], c[1], c[2])
    print(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s, stress {t_stress:.0f} s)")
