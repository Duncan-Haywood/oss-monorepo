"""Milestone 7v: train across the identified motor lag (33-39.1 ms) instead of at one end of it.

Milestone 7u found that tuning at the slow end of two published identifications (39.1 ms Agilicious 2022, against 33 ms NeuroBEM
2021; `data/motor_lag/identified.csv`) beats 7t's midpoint tune (36 ms) in every cell and keeps the certificate across the range.
Its first next step asks whether that gain comes from the slow value itself or from conservatism the search finds by other routes.

What "tuning at a lag" means in these arms (read from `poshold.rollout` and `linstab`, checked in this milestone's smoke run): the
integrator feed-forward (ff_mode "integ") uses no internal lag model, so the design's lag enters only as (a) the floor of the
training plants (vehicle lag x plant randomisation U(1, 2)) and (b) the plant corners of the margin certificate (lag x {1, 2}).
A 39.1 ms tune never trains on, or certifies at, a plant faster than 39.1 ms. This milestone's arms train on the whole range:

  7l lagrand, aware lagrand   7u's two arms exactly (closure src_li, 45 deg tilt limit, A_P cap, wide kp box, integrator
                              feed-forward, margin constraint, TWR 2, 3200 CMA-ES evaluations, 6 seeds x 2 starts x 2 geometries),
                              with the training lag per episode = 33 ms x U(1, 39.1/33) x U(1, 2) (so 33-78.2 ms, the identified
                              range times 7u's plant randomisation), and the certificate's lag corners at 33 ms x {1, 2 x 39.1/33}
                              (33 and 78.2 ms: 7u's slow corner and the fast identification, so the range's ends are both certified).

Scored with 7u's 24 (39.1 ms) and 7t's 24 (36 ms) on 7u's held-out set (seed 9999, 64 episodes, four capped conditions, margin
test) under 7u's five laws (33, 36, 39.1 ms D^0; stress 45 ms D^0, NOT sourced; inherited 15 ms D^1.5). Held-out scoring uses
the unpatched plant draw and certificate, as in 7t and 7u. Predictions V1-V7 in ../../LOG.md, committed before the full-budget run.

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


U = _load("m7u", "m7u_slow_end")   # 7u's evaluate, summary helpers and laws (loads 7r / 7s with the SMOKE-aware budgets)
R, S7, M7, L7, H = U.R, U.S7, U.M7, U.L7, U.H
SMOKE = U.SMOKE
KEYS, LAWS = U.KEYS, U.LAWS
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")
FAST, SLOW = U.LAWS["id 33 ms D^0"][0], U.TRAIN_LAW[0]   # 0.033, 0.0391
ARMS = {"7l lagrand": "7l src_li", "aware lagrand": "aware src_li"}   # new arm -> 7r arm it copies
_DRAW, _CORNERS = A.plant_draw, list(LS.PLANT_CORNERS)


def lagrand_draw(kind, episodes, seed):
    """7u's plant draw with the vehicle lag also drawn per episode: lag multiplier on the 33 ms base = U(1, 39.1/33) x U(1, 2)."""
    pl = _DRAW(kind, episodes, seed)
    if kind is not None:
        pl = dict(pl); pl["lag"] = pl["lag"] * np.random.default_rng(seed + 271828).uniform(1.0, SLOW / FAST, size=episodes)
    return pl


def patch(on):
    """Training-time lag model: base 33 ms D^0, per-episode range draw, certificate corners at 33 and 78.2 ms. Off: 7u's defaults."""
    A.LAG_K, A.LAG_EXP = (FAST, 0.0) if on else (0.015, 1.5)
    A.plant_draw = lagrand_draw if on else _DRAW
    hi = 2.0 * SLOW / FAST
    LS.PLANT_CORNERS[:] = [(t, m, (1.0 if l == 1.0 else hi)) for t, m, l in _CORNERS] if on else _CORNERS


def train(args):
    arm, geom, s, k = args
    f = os.path.join(CACHE, f"{arm.replace(' ', '_')}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    R.set_closure("src_li")
    patch(True)
    base, mod = R.ARMS[ARMS[arm]]
    out = (arm,) + tuple(mod.train_one(base, geom, s, k)[1:])
    patch(False)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {arm} {geom} seed {s} start {k}: best {out[4]:.3f} (rejected {out[6]})", flush=True)
    return out


def check_patch():
    """The patch reaches the training objective and the certificate: same design, different score and radius with it on."""
    R.set_closure("src_li")
    x = np.array([0.5] * 12)[None]
    A.LAG_K, A.LAG_EXP = SLOW, 0.0
    r0 = float(H.margin_rho(x, np.full(1, A.TWR))[0])
    c0 = sorted({A.LAG_K * c[2] for c in LS.PLANT_CORNERS})
    patch(True)
    r1 = float(H.margin_rho(x, np.full(1, A.TWR))[0])
    c1 = sorted({A.LAG_K * c[2] for c in LS.PLANT_CORNERS})
    pl1 = A.plant_draw("wide", 8, 7)["lag"] * FAST
    patch(False)
    assert abs(c1[0] - FAST) < 1e-9 and abs(c1[1] - 2 * SLOW) < 1e-9 and abs(c0[0] - SLOW) < 1e-9, (c0, c1)
    assert pl1.min() >= FAST - 1e-12 and pl1.max() <= 2 * SLOW + 1e-12 and A.plant_draw is _DRAW and LS.PLANT_CORNERS == _CORNERS
    return (f"patch check: certificate lag corners {[round(c * 1000, 1) for c in c0]} ms (39.1 ms tune) vs {[round(c * 1000, 1) for c in c1]} ms (range tune); "
            f"margin rho at x=0.5 {r0:.4f} vs {r1:.4f}; training lags {pl1.min() * 1000:.1f}-{pl1.max() * 1000:.1f} ms on 8 draws")


def evaluate(law_name, d):
    """7u's evaluate (unpatched plant draw and certificate), wrapped so the pool can pickle it."""
    return U.evaluate(law_name, d)


def summarise(out, tr):
    sets = ["7l lag36", "aware lag36", "7l lag39", "aware lag39", "7l lagrand", "aware lagrand"]
    Ls = ["Milestone 7v: trained across 33-39.1 ms (x plant U(1, 2)), certificate at 33 and 78.2 ms; 7u's (39.1 ms) and 7t's (36 ms) "
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
                          + "; ".join(f"{k} {sum(r[f'dead_{k}'] for r in rs):3d}" for k in KEYS)
                          + f"  | 45_2 {[r['dead_45_2_cap'] for r in rs]}; J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}")
            Ls.append("")
    return Ls


if __name__ == "__main__":
    t0 = time.time()
    pc = check_patch(); print(pc, flush=True)
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
    json.dump(dict(laws=LAWS, keys=KEYS, budget=R.BUDGET, test_ep=M7.TEST_EP, test_seed=M7.TEST_SEED,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in tr],
                   designs=designs, runs=out),
              open(os.path.join(HERE, f"results{sfx}.json"), "w"), indent=1)
    print("\n".join(lines))
