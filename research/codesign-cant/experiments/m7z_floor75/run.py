"""Milestone 7z: tune the lever-aware arm at a 75 ms floor and score it on both 7x's lever-2 stress test and 7y's lever-1
response test, so the tuning-floor frontier gets its next point.

Milestones 7u-7x found that each slower tuning floor (39.1, 45, 52, 60 ms D^0, plant randomisation x U(1, 2)) crashes less in
the held-out stress test (lever 2, 45 deg, cap) at every identified lag, with no knee up to 60 ms. Milestone 7y measured the
price at lever 1 in calm air: each step slower costs about 0.1 s of rise time on a 1 m step, halves the overshoot and adds
millimetres of wind drift. Its first next step: a 75 ms floor scored on both tests. 75 ms is NOT sourced: it is the next
bracket (25% beyond 60 ms, 92% beyond the slower identification, 39.1 ms).

Training is 7x's exactly (arm "aware src_li", closure src_li, 45 deg tilt limit, A_P cap, wide kp box, integrator
feed-forward, margin constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x 2 geometries) with the floor at 75 ms
and the certificate corners at 33 ms, the floor and twice the floor (7x's patch, unchanged). Scoring:
  stress:   7x's held-out set (seed 9999, 64 episodes, four capped conditions, margin test) under 7x's seven laws plus 75 ms
            D^0, for 7x's lag45, lag52 and lag60 designs and the new lag75 designs (7x's sets reproduce 7x's counts);
  response: 7y's step, wind3 and wind6 tests (lever 1, 45 deg, no turbulence or yaw steps, seed 9999, 64 episodes) under the
            three identified laws, for lag60 (reproduces 7y) and lag75.
Predictions Z1-Z7 in ../../LOG.md, committed before the full-budget run.

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


X = _load("m7x", "m7x_knee")       # 7x's train, patch, evaluate (7u's), laws with 52 and 60 ms
Y = _load("m7y", "m7y_response")   # 7y's fly and response tests
R, M7, U, M6 = X.R, X.M7, X.U, X.M6
SMOKE = X.SMOKE
NSEED = R.SEEDS
X.FLOORS.clear(); X.FLOORS["aware lag75"] = 0.075
X.CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
U.LAWS["stress 75 ms D^0"] = (0.075, 0.0)
ORDER = X.ORDER + ["stress 75 ms D^0"]
OLD = ("aware lag45", "aware lag52", "aware lag60")
SETS = OLD + ("aware lag75",)
RESP_SETS = ("aware lag60", "aware lag75")


def fly(d, law, test):
    return Y.fly(d, law, test)


def train(args):
    return X.train(args)


def evaluate(law, d):
    return X.evaluate(law, d)


def stress_summary(out, tr):
    Ls = ["== stress (7x's held-out set; dead = L2-45 diverged flights summed over seeds; cap on) ==", ""]
    for g in R.GEOMS:
        for s in SETS:
            rs0 = [r for r in out if r["set"] == s and r["geom"] == g]
            if not rs0: continue
            t = [x for x in tr if x[0] == s and x[1] == g]
            rej = f"; rejected {np.mean([x[6] for x in t]) / R.BUDGET:.2f} of training candidates" if t else ""
            one = sorted((r for r in rs0 if r["law_name"] == ORDER[0]), key=lambda r: r["seed"])
            Ls.append(f"[{g}, {s}] D {np.mean([r['D'] for r in one]):.3f} m; L {np.mean([r['L'] for r in one]):.3f} m; "
                      f"""mass {np.mean([r['mass'] for r in one]):.3f} kg ({', '.join(f'{r["mass"]:.3f}' for r in one)}); """
                      f"pos kp {np.mean([r['pos_kp'] for r in one]):.2f}{rej}")
            for law in ORDER:
                rs = sorted((r for r in rs0 if r["law_name"] == law), key=lambda r: r["seed"])
                Ls.append(f"  {law:>22} (margin {sum(r['margin_rho'] < 1 for r in rs)}/{len(rs)}, max rho {max(r['margin_rho'] for r in rs):.4f}): "
                          + "; ".join(f"{k} {sum(r[f'dead_{k}'] for r in rs):3d}" for k in U.KEYS)
                          + f"  | 45_2 {[r['dead_45_2_cap'] for r in rs]}; J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}")
            Ls.append("")
    return Ls


if __name__ == "__main__":
    t0 = time.time()
    pc = X.check_patch(); print(pc, flush=True)
    jobs = [(a, g, s, k) for a in X.FLOORS for g in R.GEOMS for s in range(NSEED) for k in range(len(M6.STARTS))]
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    designs = []
    for g in R.GEOMS:
        for s in range(NSEED):
            b = max((t for t in tr if t[1] == g and t[2] == s), key=lambda t: t[4])
            designs.append(dict(label="aware lag75", closure="src_li", geom=g, seed=s, x=b[5], kp_hi=M7.KP_HI_WIDE, emax=None))
    for d in json.load(open(os.path.join(HERE, "..", "m7x_knee", "results.json")))["designs"]:
        if d["seed"] < NSEED and d["label"] in OLD:
            designs.append(dict(d))
    with Pool() as p:
        out = p.starmap(evaluate, [(law, d) for law in ORDER for d in designs], chunksize=1)
    t_stress = time.time() - t0 - t_train
    rd = [d for d in designs if d["label"] in RESP_SETS]
    with Pool() as p:
        resp = p.starmap(fly, [(d, law, test) for test in Y.TESTS for law in Y.LAWS for d in rd], chunksize=1)
    Y.SETS = list(RESP_SETS)
    lines = [pc, "", f"Milestone 7z: lever-aware arm trained at 75 ms (x plant U(1, 2)), certificate at 33, 75 and 150 ms; "
             f"held-out {M7.TEST_EP} episodes, seed {M7.TEST_SEED}.", ""]
    lines += stress_summary(out, tr) + Y.summarise(resp)
    lines.append(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s, stress {t_stress:.0f} s)")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    # only the per-episode response lists are rounded (7y's rnd); designs and stress runs keep full precision, because the
    # margin test is strict (rho < 1) and certified designs sit at rho 0.99999x, which 5-digit rounding turns into 1.0
    json.dump(dict(laws=U.LAWS, keys=U.KEYS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=designs, runs=out, resp_tests=Y.TESTS, resp_ep=Y.EP, resp_seed=Y.SEED, resp=Y.rnd(resp)),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), separators=(",", ":"))
    print("\n".join(lines))
