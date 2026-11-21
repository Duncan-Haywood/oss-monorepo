"""Milestone 7r: retune under the sourced, exactly solved closure, and re-ask 7i's question.

7q found that the sizing closure the programme trained on since milestone 0 was (a) solved by a 60-step damped iteration that had
not converged where the tuners settled, and (b) built on component constants 12-72% off listed data. With all three constants
sourced and Li-ion cells (closure `src_li`: 209.9 Wh/kg, motor 0.0290 (T/9 N)^1.041 kg, FM ETA 0.426, solved exactly), every one of
7o's 48 designs closes at 15 min at about 0.75 kg, half the mass the tuners had settled at, and on their old gains they crash 20-33
more flights of 64 per design at lever 2, 45 deg. Those gains were tuned on the heavier vehicles. This milestone retunes.

Arms (everything as 7l `t45 cap wide` and 7m `aware cap wide`: 45 deg tilt-command limit and the A_P cap in training, position-kp
box 0.1-31.6 s^-2, integrator feed-forward, margin test as a constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds, 2 starts, both
rigid geometries), with only the closure changed to `src_li`:
  7l src_li     lever-1 objective (7l's)
  aware src_li  lever-aware objective, levers 0, 1, 2 (7i / 7m's)
Re-scored by the same held-out function (7m's 26 conditions, 64 episodes, seed 9999):
  the new designs under src_li; 7l `t45 cap wide` and 7m `aware cap wide` under inh60 (as published) and under src_li (not retuned).
A design without a fixed point at 15 min sizes to the 20 kg clamp, which the $300 cost cap marks infeasible (score -99), so the
tuner sees closure failure as infeasibility. Predictions R1-R7 in ../../LOG.md, committed before the full-budget run.
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


M7 = _load("m7m", "m7m_aware_wide")
L7, H, GEOMS = M7.L7, M7.H, M7.GEOMS
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
for mod in (M7, L7):
    mod.SMOKE, mod.BUDGET, mod.SEEDS = SMOKE, BUDGET, SEEDS
    mod.TEST_EP = 8 if SMOKE else M6.TEST_EP
    mod.TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed
L7.TRAIN_EP = 4 if SMOKE else M6.TRAIN_EP
M7.EP_PER_LEVER = 2 if SMOKE else 6
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")

FIT = json.load(open(os.path.join(HERE, "..", "m7q_closure", "closure.json")))
INH = dict(WH_KG=150.0, MOTOR_K=0.045, MOTOR_EXP=1.2, FM=0.65, SIZE_SOLVE="iter60")
SRC_LI = dict(WH_KG=FIT["battery"]["liion"]["median"], MOTOR_K=FIT["motor"]["k"], MOTOR_EXP=FIT["motor"]["exp"],
              FM=FIT["power"]["5 in (R-series FPV)"]["median"] / A.ETA, SIZE_SOLVE="exact")   # 7q's src_li, exactly
CLOSURES = {"inh60": INH, "src_li": SRC_LI}
ARMS = {"7l src_li": ("t45 cap wide", L7), "aware src_li": ("aware cap wide", M7)}


def set_closure(name):
    for k, v in CLOSURES[name].items():
        setattr(A, k, v)


def train(args):
    arm, geom, s, k = args
    f = os.path.join(CACHE, f"{arm.replace(' ', '_')}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    set_closure("src_li")
    base, mod = ARMS[arm]
    out = (arm,) + tuple(mod.train_one(base, geom, s, k)[1:])
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {arm} {geom} seed {s} start {k}: best {out[4]:.3f} (rejected {out[6]})", flush=True)
    return out


def endurance_max(x12):
    """Longest endurance (min) at which the exact closure has a fixed point below the clamp (as 7q), under the current closure."""
    x = np.array(x12, float)
    L = A.L_RANGE[0] + x[0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[1] * (A.D_RANGE[1] - A.D_RANGE[0])
    c = M6.cond("aware"); al = c["alpha_max"] * np.clip(x[2], 0, 1)
    keep, solve, lo, hi = A.ENDURANCE_MIN, A.SIZE_SOLVE, 0.5, 120.0
    A.SIZE_SOLVE = "exact"
    for _ in range(40):
        A.ENDURANCE_MIN = 0.5 * (lo + hi)
        m = float(A.size(L, D, al, kappa_per_d=c["kappa_per_d"], actuator="hover")["mass"])
        lo, hi = (A.ENDURANCE_MIN, hi) if m < A.M_CLAMP else (lo, A.ENDURANCE_MIN)
    A.ENDURANCE_MIN, A.SIZE_SOLVE = keep, solve
    return lo


def evaluate(label, closure, geom, s, x12, kp_hi):
    set_closure(closure)
    r = M7.evaluate(label, geom, s, x12, kp_hi)
    L7.setup(None, kp_hi)
    r["margin_rho"] = float(H.margin_rho(np.array(x12, float)[None], np.full(1, A.TWR))[0])
    L7.setup()
    x = np.array(x12, float)[None]
    c = M6.cond("aware")
    sz = A.size(A.L_RANGE[0] + x[:, 0] * (A.L_RANGE[1] - A.L_RANGE[0]), A.D_RANGE[0] + x[:, 1] * (A.D_RANGE[1] - A.D_RANGE[0]),
                c["alpha_max"] * np.clip(x[:, 2], 0, 1), kappa_per_d=c["kappa_per_d"], actuator="hover")
    r.update(closure=closure, feasible=bool(sz["feasible"][0]), cost=float(sz["cost"][0]), wh=float(sz["wh"][0]),
             emax=endurance_max(x12), closes=bool(sz["mass"][0] < A.M_CLAMP))
    r["label"] = f"{label} [{closure}]"
    return r


KEY = ("45_1_cap", "20_2_cap", "45_2_cap", "45_2_base", "20_3_cap", "45_3_cap", "45_0_cap")


def summarise(out, tr, labels):
    Ls = ["dead = diverged flights of 64 per seed, summed (per seed); J = held-out score (higher is better); C excludes power.", ""]
    for geom in GEOMS:
        for lab in labels:
            rs = sorted((r for r in out if r["geom"] == geom and r["label"] == lab), key=lambda r: r["seed"])
            if not rs: continue
            t = [x for x in tr if x[0] == lab and x[1] == geom]
            rej = f"; rejected {np.mean([x[6] for x in t]) / BUDGET:.2f} of training candidates" if t else ""
            Ls.append(f"[{geom}, {lab}] L {np.mean([r['L'] for r in rs]):.3f} m; D {np.mean([r['D'] for r in rs]):.3f} m; cant {np.mean([r['alpha_deg'] for r in rs]):.1f} deg; "
                      f"mass {np.mean([r['mass'] for r in rs]):.3f} kg; hover W {np.mean([r['power'] for r in rs]):.1f}; tau/W {np.mean([r['tau_per_weight'] for r in rs]):.4f} m; "
                      f"cost ${np.mean([r['cost'] for r in rs]):.0f}{rej}")
            Ls.append(f"""  mass {', '.join(f'{r["mass"]:.3f}' for r in rs)}; pos kp {', '.join(f'{r["pos_kp"]:.2f}' for r in rs)}; """
                      f"""pos ki {', '.join(f'{r["pos_ki"]:.3f}' for r in rs)}; att kp {', '.join(f'{r["att_kp"]:.2f}' for r in rs)}""")
            for k in KEY:
                Ls.append(f"  {k:>10}: dead {sum(r[f'dead_{k}'] for r in rs):4d} {[r[f'dead_{k}'] for r in rs]}; "
                          f"J median {np.median([r[f'J_{k}'] for r in rs]):+.3f}; pos {np.mean([r[f'pos_{k}'] for r in rs]):.3f} m")
            Ls.append("")
    return Ls


def old_designs():
    ev = []
    for r in json.load(open(os.path.join(HERE, "..", "m7m_aware_wide", "results.json")))["runs"]:
        if r["seed"] < SEEDS and r["label"] in ("7l t45 cap wide", "aware cap wide"):
            for cl in CLOSURES:
                ev.append((r["label"], cl, r["geom"], r["seed"], r["x"][:12], r["kp_hi"]))
    return ev


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(a, g, s, k) for a in ARMS for g in GEOMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    ev = old_designs()
    for a in ARMS:
        for g in GEOMS:
            for s in range(SEEDS):
                b = max((t for t in tr if t[0] == a and t[1] == g and t[2] == s), key=lambda t: t[4])
                ev.append((a, "src_li", g, s, b[5][:12], M7.KP_HI_WIDE))
    with Pool() as p:
        out = p.starmap(evaluate, ev, chunksize=1)
    labels = ["7l t45 cap wide [inh60]", "aware cap wide [inh60]", "7l t45 cap wide [src_li]", "aware cap wide [src_li]",
              "7l src_li [src_li]", "aware src_li [src_li]"]
    trl = [(f"{t[0]} [src_li]",) + tuple(t[1:]) for t in tr]
    lines = [f"Milestone 7r: retuned under closure src_li ({SRC_LI}); old designs re-scored under inh60 and src_li, not retuned.",
             "Validity per design (label: feasible / closes at 15 min / margin rho < 1; emax min):"]
    for lab in labels:
        rs = [r for r in out if r["label"] == lab]
        lines.append(f"  {lab}: feasible {sum(r['feasible'] for r in rs)}/{len(rs)}, closes {sum(r['closes'] for r in rs)}/{len(rs)}, "
                     f"""margin {sum(r['margin_rho'] < 1 for r in rs)}/{len(rs)}; emax {', '.join(f'{r["emax"]:.1f}' for r in sorted(rs, key=lambda r: (r['geom'], r['seed'])))}""")
    lines.append("")
    lines += summarise(out, trl, labels)
    lines.append(f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s)")
    sfx = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{sfx}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(labels=labels, budget=BUDGET, closures=CLOSURES, arms={a: v[0] for a, v in ARMS.items()},
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr], runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
