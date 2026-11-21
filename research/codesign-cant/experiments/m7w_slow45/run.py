"""Milestone 7w: tune at a slower floor (45 ms) than the slower identification, to find where tuning slower stops paying.

Milestone 7u found that tuning at 39.1 ms (the slower of two published identifications, Agilicious 2022, against 33 ms NeuroBEM
2021; `data/motor_lag/identified.csv`) beats 7t's 36 ms midpoint tune in all 16 law x arm-geometry cells. Milestone 7v found the
gain is the slow floor of the training plants, not the width of the draw. Its next step asks where tuning slower stops paying.

This milestone retunes 7u's two arms exactly (closure src_li, 45 deg tilt limit, A_P cap, wide kp box, integrator feed-forward,
margin constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x 2 geometries) with only the lag changed to 45 ms (LAG_K
0.045, LAG_EXP 0; plant randomisation lag x U(1, 2) on top, so training plants 45-90 ms; certificate corners 45 and 90 ms). 45 ms
is NOT sourced: it is 7u's stress value, 15% beyond the slower identification, used here as a tuning floor on purpose to bracket
the optimum from above. Scored with 7u's 24 (39.1 ms) and 7t's 24 (36 ms) on 7u's held-out set (seed 9999, 64 episodes, four
capped conditions, margin test) under 7u's five laws. Predictions W1-W7 in ../../LOG.md, committed before the full-budget run.

Usage: python3 run.py            (SMOKE=1: 64 evaluations, 2 seeds, 8 test episodes on seed 4242, never the held-out seed)
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
from codesign_cant import aero as A, linstab as LS  # noqa: E402


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


U = _load("m7u", "m7u_slow_end")   # 7u's evaluate, laws and SMOKE-aware budgets
R, M7, H = U.R, U.M7, U.H
SMOKE = U.SMOKE
LAWS = U.LAWS
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
TRAIN_LAW = LAWS["stress 45 ms D^0"]   # (0.045, 0.0)
ARMS = {"7l lag45": "7l src_li", "aware lag45": "aware src_li"}   # new arm -> 7r arm it copies


def train(args):
    arm, geom, s, k = args
    f = os.path.join(CACHE, f"{arm.replace(' ', '_')}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    R.set_closure("src_li")
    A.LAG_K, A.LAG_EXP = TRAIN_LAW
    base, mod = R.ARMS[ARMS[arm]]
    out = (arm,) + tuple(mod.train_one(base, geom, s, k)[1:])
    A.LAG_K, A.LAG_EXP = 0.015, 1.5
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {arm} {geom} seed {s} start {k}: best {out[4]:.3f} (rejected {out[6]})", flush=True)
    return out


def check_lag():
    """The training lag reaches the certificate: corners at 45 and 90 ms under the training law, 39.1 and 78.2 ms under 7u's."""
    R.set_closure("src_li")
    x = np.array([0.5] * 12)[None]
    rows = []
    for law in (U.TRAIN_LAW, TRAIN_LAW):
        A.LAG_K, A.LAG_EXP = law
        rows.append((sorted({A.LAG_K * c[2] for c in LS.PLANT_CORNERS}), float(H.margin_rho(x, np.full(1, A.TWR))[0])))
    A.LAG_K, A.LAG_EXP = 0.015, 1.5
    assert abs(rows[1][0][0] - 0.045) < 1e-9 and abs(rows[1][0][-1] - 0.090) < 1e-9, rows
    return ("lag check: certificate lag corners " + " vs ".join(f"{[round(c * 1000, 1) for c in r[0]]} ms (rho at x=0.5 {r[1]:.4f})" for r in rows)
            + " (39.1 ms tune vs 45 ms tune)")


def evaluate(law_name, d):
    return U.evaluate(law_name, d)


def summarise(out, tr):
    sets = ["7l lag36", "aware lag36", "7l lag39", "aware lag39", "7l lag45", "aware lag45"]
    Ls = ["Milestone 7w: trained at 45 ms (x plant U(1, 2)), certificate at 45 and 90 ms; 7u's (39.1 ms) and 7t's (36 ms) "
          f"designs alongside. Held-out {M7.TEST_EP} episodes, seed {M7.TEST_SEED}; dead = diverged flights summed over seeds (per seed); cap on.", ""]
    for g in R.GEOMS:
        for s in sets:
            rs0 = [r for r in out if r["set"] == s and r["geom"] == g]
            if not rs0: continue
            t = [x for x in tr if x[0] == s and x[1] == g]
            rej = f"; rejected {np.mean([x[6] for x in t]) / R.BUDGET:.2f} of training candidates" if t else ""
            one = [r for r in rs0 if r["law_name"] == "inherited 15 ms D^1.5"]
            Ls.append(f"[{g}, {s}] D {np.mean([r['D'] for r in one]):.3f} m; L {np.mean([r['L'] for r in one]):.3f} m; "
                      f"""mass {np.mean([r['mass'] for r in one]):.3f} kg ({', '.join(f'{r["mass"]:.3f}' for r in sorted(one, key=lambda r: r['seed']))}); """
                      f"pos kp {np.mean([r['pos_kp'] for r in one]):.2f}{rej}")
            for law in LAWS:
                rs = sorted((r for r in rs0 if r["law_name"] == law), key=lambda r: r["seed"])
                Ls.append(f"  {law:>22} (lag {np.mean([r['lag_s'] for r in rs]) * 1000:5.1f} ms; margin {sum(r['margin_rho'] < 1 for r in rs)}/{len(rs)}): "
                          + "; ".join(f"{k} {sum(r[f'dead_{k}'] for r in rs):3d}" for k in U.KEYS)
                          + f"  | 45_2 {[r['dead_45_2_cap'] for r in rs]}; J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}")
            Ls.append("")
    return Ls


if __name__ == "__main__":
    t0 = time.time()
    pc = check_lag(); print(pc, flush=True)
    jobs = [(a, g, s, k) for a in ARMS for g in R.GEOMS for s in range(R.SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    designs = []
    for a in ARMS:
        for g in R.GEOMS:
            for s in range(R.SEEDS):
                b = max((t for t in tr if t[0] == a and t[1] == g and t[2] == s), key=lambda t: t[4])
                designs.append(dict(label=a, closure="src_li", geom=g, seed=s, x=b[5], kp_hi=M7.KP_HI_WIDE, emax=None))
    for d in json.load(open(os.path.join(HERE, "..", "m7u_slow_end", "results.json")))["designs"]:
        if d["seed"] < R.SEEDS:
            designs.append(dict(d))   # 7u's lag39 designs and the 7t lag36 designs 7u scored
    jobs = [(law, d) for law in LAWS for d in designs]
    with Pool() as p:
        out = p.starmap(evaluate, jobs, chunksize=1)
    lines = [pc, ""] + summarise(out, tr)
    lines.append(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s)")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(laws=LAWS, keys=U.KEYS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=designs, runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
