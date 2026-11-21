"""Milestone 7x: tune at 52 ms and at 60 ms, with the certificate also required at the fast identified lag (33 ms); where does
tuning slower stop paying?

Milestone 7w found that tuning at 45 ms (an unsourced floor, 15% beyond the slower identification) beats 7u's 39.1 ms tune in
19 of 20 law x arm-geometry cells, with no cost yet at the fast end (33 ms, NeuroBEM 2021). Its cost showed at the certificate:
two of 24 designs sat on the margin boundary (rho 1.0000-1.0002) at 33 and 36 ms. Its next step asks for slower floors, with
the certificate also checked at 33 ms as a constraint so a slower tune cannot trade away the identified range.

This milestone retunes 7w's lever-aware arm (7i's finding has held five times, so only that arm; closure src_li, 45 deg tilt
limit, A_P cap, wide kp box, integrator feed-forward, margin constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x
2 geometries) at two floors: 52 ms and 60 ms (LAG_K, LAG_EXP 0; plant randomisation lag x U(1, 2) on top). The certificate
corners are the floor, twice the floor and 33 ms (lag multipliers 1, 2 and 0.033 / floor), so every design the search accepts
is certified at the fast identified lag. 52 and 60 ms are NOT sourced: they are tuning floors chosen to bracket a knee.
Scored with 7w's lever-aware 45 ms designs and 7u's lever-aware 39.1 ms designs on 7u's held-out set (seed 9999, 64 episodes,
four capped conditions, unpatched plant draw and margin test) under 7u's five laws plus 52 and 60 ms.
Predictions X1-X7 in ../../LOG.md, committed before the full-budget run.

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
LAWS["stress 52 ms D^0"] = (0.052, 0.0)   # added to 7u's dict, so U.evaluate scores under them too
LAWS["stress 60 ms D^0"] = (0.060, 0.0)
ORDER = ["inherited 15 ms D^1.5", "id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0", "stress 45 ms D^0", "stress 52 ms D^0", "stress 60 ms D^0"]
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
FAST = 0.033
FLOORS = {"aware lag52": 0.052, "aware lag60": 0.060}   # new arm -> tuning floor (s)
_CORNERS = list(LS.PLANT_CORNERS)


def patch(floor):
    """Training-time lag: floor D^0, plant draw x U(1, 2), certificate corners {33 ms, floor, 2 floor}. floor None: defaults."""
    if floor is None:
        A.LAG_K, A.LAG_EXP = 0.015, 1.5
        LS.PLANT_CORNERS[:] = _CORNERS
        return
    A.LAG_K, A.LAG_EXP = floor, 0.0
    fast = [(t, m, FAST / floor) for t, m, l in _CORNERS if l == 1.0]
    LS.PLANT_CORNERS[:] = _CORNERS + fast


def train(args):
    arm, geom, s, k = args
    f = os.path.join(CACHE, f"{arm.replace(' ', '_')}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    R.set_closure("src_li")
    patch(FLOORS[arm])
    base, mod = R.ARMS["aware src_li"]
    out = (arm,) + tuple(mod.train_one(base, geom, s, k)[1:])
    patch(None)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {arm} {geom} seed {s} start {k}: best {out[4]:.3f} (rejected {out[6]})", flush=True)
    return out


def check_patch():
    """The patch reaches the certificate: corners and margin radius at x = 0.5 for each floor, with and without the 33 ms corners."""
    R.set_closure("src_li")
    x = np.array([0.5] * 12)[None]
    rows = []
    for arm, fl in FLOORS.items():
        A.LAG_K, A.LAG_EXP = fl, 0.0
        r0 = float(H.margin_rho(x, np.full(1, A.TWR))[0])
        patch(fl)
        c = sorted({A.LAG_K * c[2] for c in LS.PLANT_CORNERS})
        r1 = float(H.margin_rho(x, np.full(1, A.TWR))[0])
        assert len(c) == 3 and abs(c[0] - FAST) < 1e-9 and abs(c[1] - fl) < 1e-9 and abs(c[2] - 2 * fl) < 1e-9, c
        rows.append(f"{arm} corners {[round(v * 1000, 1) for v in c]} ms, rho at x=0.5 {r1:.4f} (without the 33 ms corners {r0:.4f})")
        patch(None)
    assert LS.PLANT_CORNERS == _CORNERS and A.LAG_K == 0.015
    return "patch check: " + "; ".join(rows)


def evaluate(law_name, d):
    return U.evaluate(law_name, d)


def summarise(out, tr):
    sets = ["aware lag39", "aware lag45", "aware lag52", "aware lag60"]
    Ls = ["Milestone 7x: lever-aware arm trained at 52 and 60 ms (x plant U(1, 2)), certificate at 33 ms, floor and 2 x floor; "
          f"7w's (45 ms) and 7u's (39.1 ms) lever-aware designs alongside. Held-out {M7.TEST_EP} episodes, seed {M7.TEST_SEED}; "
          "dead = diverged flights summed over seeds (per seed); cap on.", ""]
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
            for law in ORDER:
                rs = sorted((r for r in rs0 if r["law_name"] == law), key=lambda r: r["seed"])
                Ls.append(f"  {law:>22} (lag {np.mean([r['lag_s'] for r in rs]) * 1000:5.1f} ms; margin {sum(r['margin_rho'] < 1 for r in rs)}/{len(rs)}"
                          f", max rho {max(r['margin_rho'] for r in rs):.4f}): "
                          + "; ".join(f"{k} {sum(r[f'dead_{k}'] for r in rs):3d}" for k in U.KEYS)
                          + f"  | 45_2 {[r['dead_45_2_cap'] for r in rs]}; J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}")
            Ls.append("")
    return Ls


if __name__ == "__main__":
    t0 = time.time()
    pc = check_patch(); print(pc, flush=True)
    jobs = [(a, g, s, k) for a in FLOORS for g in R.GEOMS for s in range(R.SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        tr = p.map(train, jobs, chunksize=1)
    t_train = time.time() - t0
    designs = []
    for a in FLOORS:
        for g in R.GEOMS:
            for s in range(R.SEEDS):
                b = max((t for t in tr if t[0] == a and t[1] == g and t[2] == s), key=lambda t: t[4])
                designs.append(dict(label=a, closure="src_li", geom=g, seed=s, x=b[5], kp_hi=M7.KP_HI_WIDE, emax=None))
    for d in json.load(open(os.path.join(HERE, "..", "m7w_slow45", "results.json")))["designs"]:
        if d["seed"] < R.SEEDS and d["label"] in ("aware lag45", "aware lag39"):
            designs.append(dict(d))   # 7w's lag45 and 7u's lag39 lever-aware designs
    jobs = [(law, d) for law in ORDER for d in designs]
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
