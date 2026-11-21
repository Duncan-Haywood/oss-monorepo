"""Milestone 7u: tune at the slow end of the identified motor lag, and ask whether that alone covers the identified range.

Milestone 7t retuned at 36 ms, the midpoint of two published identifications of 5-5.1 inch, 2306-motor quadrotors (33 ms NeuroBEM
2021, 39.1 ms Agilicious 2022; `data/motor_lag/identified.csv`), and found the error asymmetric: designs tuned for a slower lag than
they fly lose little, designs tuned for a faster one fail outright. Its first next step asks whether tuning at the slow end alone is
enough. This milestone retunes 7t's two arms with only the lag changed to 39.1 ms (LAG_K 0.0391, LAG_EXP 0, vehicle and nominal
model together; plant randomisation lag x 1-2 on top) and scores the 24 new designs with 7t's 24 (36 ms) on the held-out set (seed
9999, 64 episodes, 7s's four capped conditions, margin test) under: the two identified values and the midpoint (33, 36, 39.1 ms,
D^0), a stress value of 45 ms (D^0; NOT sourced: 15% beyond the slower identification, standing in for an unidentified slower
motor or a sagging pack), and the inherited 15 ms D^1.5. Predictions U1-U8 in ../../LOG.md, committed before the full-budget run.

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
from codesign_cant import aero as A  # noqa: E402


def _load(name, sub):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", sub, "run.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


R = _load("m7r", "m7r_retune")   # sets SMOKE-aware budgets on 7l / 7m modules from the SMOKE environment variable
S7 = _load("m7s", "m7s_lag")     # 7s's per-law evaluation (four capped conditions, margin test)
M7, L7, H = R.M7, R.L7, R.H
SMOKE = R.SMOKE
for mod in (M7, L7):
    mod.TEST_EP = 8 if SMOKE else 64
    mod.TEST_SEED = 4242 if SMOKE else 9999
KEYS = S7.KEYS
M7.conditions = lambda: S7.COND   # 7s's four capped conditions (S7 patches its own copy of the module, not this one)
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
LAG_ID = json.load(open(os.path.join(HERE, "..", "..", "data", "motor_lag", "lag_law.json")))
TRAIN_LAW = (LAG_ID["fit_rows"]["Agilicious 2022"], 0.0)   # the slower identification, 39.1 ms
LAWS = {"id 33 ms D^0": (0.033, 0.0), "mid 36 ms D^0": (LAG_ID["train_K_s"], 0.0), "id 39.1 ms D^0": TRAIN_LAW,
        "stress 45 ms D^0": (0.045, 0.0), "inherited 15 ms D^1.5": (0.015, 1.5)}
ARMS = {"7l lag39": "7l src_li", "aware lag39": "aware src_li"}   # new arm -> 7r arm it copies


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


def evaluate(law_name, d):
    """As 7s's evaluate (law set on vehicle and nominal model, four capped conditions, margin test), keeping the position kp."""
    A.LAG_K, A.LAG_EXP = LAWS[law_name]
    R.set_closure(d["closure"])
    r = M7.evaluate(d["label"], d["geom"], d["seed"], d["x"][:12], d["kp_hi"])
    L7.setup(None, d["kp_hi"])
    rho = float(H.margin_rho(np.array(d["x"][:12], float)[None], np.full(1, A.TWR))[0])
    L7.setup()
    out = dict(set=d["label"], geom=d["geom"], seed=d["seed"], law_name=law_name, law=list(LAWS[law_name]), mass=r["mass"],
               D=r["D"], L=r["L"], lag_s=float(A.LAG_K * (r["D"] / A.LAG_D0) ** A.LAG_EXP), margin_rho=rho, pos_kp=r["pos_kp"],
               power=r["power"], alpha_deg=r["alpha_deg"])
    out.update({f"dead_{k}": r[f"dead_{k}"] for k in KEYS})
    out.update({f"J_{k}": r[f"J_{k}"] for k in KEYS})
    A.LAG_K, A.LAG_EXP = 0.015, 1.5
    return out


def summarise(out, tr):
    sets = ["7l lag36", "aware lag36", "7l lag39", "aware lag39"]
    Ls = [f"Milestone 7u: retuned at lag {TRAIN_LAW[0] * 1000:g} ms (D^0) on closure src_li; 7t's designs (36 ms, D^0) "
          f"alongside. Held-out {M7.TEST_EP} episodes, seed {M7.TEST_SEED}; dead = diverged flights summed over seeds (per seed); cap on.", ""]
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
                          + "; ".join(f"{k} {sum(r[f'dead_{k}'] for r in rs):3d}" for k in KEYS)
                          + f"  | 45_2 {[r['dead_45_2_cap'] for r in rs]}; J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}")
            Ls.append("")
    Ls.append("Spearman rho, mass against dead_45_2_cap per design, over the 24 designs of each pair of sets per geometry:")
    for pair in (("7l lag36", "aware lag36"), ("7l lag39", "aware lag39")):
        for law in LAWS:
            parts = []
            for g in R.GEOMS:
                rs = [r for r in out if r["law_name"] == law and r["geom"] == g and r["set"] in pair]
                parts.append(f"{g} {S7.spearman([r['mass'] for r in rs], [r['dead_45_2_cap'] for r in rs]):+.2f}")
            Ls.append(f"  {pair[1].split(' ')[1]:>9} {law:>22}: " + ", ".join(parts))
    return Ls


if __name__ == "__main__":
    t0 = time.time()
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
    for d in json.load(open(os.path.join(HERE, "..", "m7t_lag_src", "results.json")))["designs"]:
        if d["label"] in ("7l lag36", "aware lag36") and d["seed"] < R.SEEDS:
            designs.append(dict(d))
    jobs = [(law, d) for law in LAWS for d in designs]
    with Pool() as p:
        out = p.starmap(evaluate, jobs, chunksize=1)
    lines = summarise(out, tr)
    lines.append(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s)")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(laws=LAWS, keys=KEYS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=designs, runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
