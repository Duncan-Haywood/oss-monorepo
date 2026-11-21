"""Milestone 7t: retune at the motor lag two published identifications give for this class of vehicle.

Every design since milestone 0 flew a first-order motor lag of 0.015 (D / 0.127 m)^1.5 s, inherited and ASSUMED. Milestone 7s swept
the law and found the orderings survive but the counts, the stability certificate and the retuned designs' parity with the published
ones depend on it, and that at 30 ms almost no design passes the margin test. This milestone takes the lag from published system
identifications of 5-5.1 inch, 2306-motor quadrotors of about 0.75 kg (`data/motor_lag/identified.csv`):
  33 ms   Bauersfeld et al. 2021 (NeuroBEM, RSS), first-order rotor-speed time constant identified on their platform;
  39.1 ms Foehn et al. 2022 (Agilicious, Science Robotics), the motor time constant of their 5.1-inch, 2306 2400 kV platform.
Both are larger than the inherited 15 ms at 0.127 m. Neither says how the lag scales with propeller diameter, and the design range
(0.106-0.134 m) sits close to the identified 0.127-0.130 m, so the training law drops the unsourced exponent:
  lag = 36 ms (midpoint of the two identifications) for every propeller (LAG_K 0.036, LAG_EXP 0).

Arms: exactly 7r's `7l src_li` and `aware src_li` (closure src_li solved exactly, 45 deg tilt limit, A_P cap, kp box 0.1-31.6 s^-2,
integrator feed-forward, margin test as a constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x 2 geometries) with only
the lag law changed. The law sets the vehicle and the controller's nominal model together, as in 7s; the plant randomisation
(lag x 1-2) stays on top.
Held-out (seed 9999, 64 episodes, 7s's four capped conditions) under five laws: the training law (36 ms, D^0), the two identified
values (33 and 39.1 ms, D^0), 36 ms with the inherited exponent (D^1.5), and the inherited law (15 ms, D^1.5). Designs scored: the
24 new ones and 7r's 24 retuned ones. Predictions T1-T8 in ../../LOG.md, committed before the full-budget run.

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
TRAIN_LAW = (LAG_ID["train_K_s"], 0.0)
LAWS = {"train 36 ms D^0": TRAIN_LAW, "id 33 ms D^0": (0.033, 0.0), "id 39.1 ms D^0": (0.0391, 0.0),
        "36 ms D^1.5": (TRAIN_LAW[0], 1.5), "inherited 15 ms D^1.5": (0.015, 1.5)}
ARMS = {"7l lag36": "7l src_li", "aware lag36": "aware src_li"}   # new arm -> 7r arm it copies


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
    sets = ["7l src_li [src_li]", "aware src_li [src_li]", "7l lag36", "aware lag36"]
    Ls = [f"Milestone 7t: retuned at lag {TRAIN_LAW[0] * 1000:g} ms (D^0) on closure src_li; 7r's retuned designs (15 ms, D^1.5) "
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
    for pair in (("7l src_li [src_li]", "aware src_li [src_li]"), ("7l lag36", "aware lag36")):
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
    for r in json.load(open(os.path.join(HERE, "..", "m7r_retune", "results.json")))["runs"]:
        if r["label"] in ("7l src_li [src_li]", "aware src_li [src_li]") and r["seed"] < R.SEEDS:
            designs.append(dict(label=r["label"], closure="src_li", geom=r["geom"], seed=r["seed"], x=r["x"], kp_hi=r["kp_hi"], emax=r["emax"]))
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
