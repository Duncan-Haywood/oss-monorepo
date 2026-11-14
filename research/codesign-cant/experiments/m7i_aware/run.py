"""Milestone 7i: a lever-aware objective. Train on centre-of-pressure levers 0, 1 and 2 instead of 1 alone, with thrust-to-weight
fixed at 2 and free, and score out of training at lever 3.

Milestone 7h found that a tuner given thrust-to-weight as a free coordinate buys a little (2.05-2.55) but spends it on efficiency
(larger propellers, lower hover power) and is no more robust at twice the trained lever: nothing in an objective trained at lever 1
asks for robustness to an uncertain centre of pressure. Here the training score is the mean of poshold.score at levers 0, 1 and 2,
6 episodes each (18 episodes per candidate against 7e/7h's 16 at lever 1; the same training seed per lever, so the three levers
see the same plants and gusts). Everything else is milestone 7e/7h's training exactly: integ feed-forward, ki <= ceiling / 1.25 on
both axes and the eight plant corners as a constraint, 3200 CMA-ES evaluations, 6 seeds, 2 starts, both rigid geometries.

Arms:
  aware TWR=2.0   12 coordinates, thrust-to-weight 2 (does the objective alone fix lever 2?)
  aware TWR free  13 coordinates, thrust-to-weight on 1.5..4 starting at 2 (does the tuner now buy authority?)
Baselines, re-scored by the same function (no retraining): 7e's constrained designs (`7e`, lever-1 objective, TWR 2) and 7h's
retrained designs (`7h free`, lever-1 objective, TWR free).
Held-out: 64 episodes (seed 9999), levers 0, 1, 2, 3, tilt-command limits 20, 30 (ArduPilot ANGLE_MAX default) and 45 deg
(PX4 MPC_TILTMAX_AIR default). Lever 3 is outside every arm's training.
Predictions A1-A8 in ../../LOG.md, written and committed before this was run at full budget.
"""
import importlib.util, json, os, sys, time, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import run as M6  # noqa: E402  (milestone 6: constants, cond(), the CMA-ES settings)
from codesign_cant import aero as A, linstab as S  # noqa: E402

_spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_twr", "run.py"))
H = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(H)   # 7h: twr_of, margin_rho (no side effects on import)

P = M6.P
GEOMS = H.GEOMS
TRAIN_LEVERS = (0.0, 1.0, 2.0)
LEVERS = (0.0, 1.0, 2.0, 3.0)
CAPS = (20.0, 30.0, 45.0)
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
EP_PER_LEVER = 2 if SMOKE else 6
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed
DEFAULT_CAP = P.TILT_CMD_MAX
ARMS = ("aware TWR=2.0", "aware TWR free")
CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")


def train_score(xs12, s, geom, twr):
    """Lever-aware training score: mean over TRAIN_LEVERS of poshold.score (J includes the hover-power price)."""
    return np.mean([P.score(xs12, EP_PER_LEVER, M6.TRAIN_SEED + s, dist_sign=GEOMS[geom], lever_scale=lev, ff=1.0, ff_mode="integ",
                            twr=twr, **M6.cond("aware"))[0] for lev in TRAIN_LEVERS], axis=0)


def train_one(arm, geom, s, k):
    free = arm.endswith("free")
    x0 = [0.5] * (13 if free else 12); x0[2] = M6.STARTS[k]
    if free:
        x0[12] = (A.TWR - A.TWR_RANGE[0]) / (A.TWR_RANGE[1] - A.TWR_RANGE[0])
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n, ninf = -1e9, None, 0, 0
    while n < BUDGET:
        xs = np.array(es.ask())
        tw = H.twr_of(xs) if free else np.full(len(xs), A.TWR)
        rho = H.margin_rho(xs[:, :12], tw)
        ok = rho < 1.0
        ys = -100.0 - 10.0 * np.minimum(rho - 1.0, 10.0)
        if ok.any():
            ys[ok] = train_score(xs[ok, :12], s, geom, tw[ok] if free else None)
        n += len(xs); ninf += int((~ok).sum()); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return arm, geom, s, k, float(best), bx.tolist(), ninf


def one(args):
    arm, geom, s, k = args
    f = os.path.join(CACHE, f"{arm.replace(' ', '_').replace('=', '')}_{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    out = train_one(arm, geom, s, k)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {arm} {geom} seed {s} start {k}: best {out[4]:.3f}", flush=True)
    return out


def evaluate(label, geom, s, x12, twr):
    x = np.array(x12, float)[None]
    r = dict(label=label, geom=geom, seed=s, x=list(x12), twr=float(twr))
    for cap in CAPS:
        P.TILT_CMD_MAX = np.deg2rad(cap)    # module constant read by rollout at call time; this worker process only
        for lev in LEVERS:
            J, sz, o = P.score(x, TEST_EP, TEST_SEED, parts=True, dist_sign=GEOMS[geom], lever_scale=lev, ff=1.0, ff_mode="integ", twr=twr, **M6.cond("aware"))
            t = f"{cap:g}_{lev:g}"
            r.update({f"J_{t}": float(J[0]), f"pos_{t}": float(o["pos"][0]), f"dead_{t}": int(round(float(o["dead"][0]) * TEST_EP))})
    P.TILT_CMD_MAX = DEFAULT_CAP
    dp = S.design_params(x, twr=twr, tau_ff=P.TAU_FF)
    g = P.phys_gains(x[:, 3:12])
    L = A.L_RANGE[0] + x[0, 0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[0, 1] * (A.D_RANGE[1] - A.D_RANGE[0])
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]), mass=float(sz["mass"][0]), cost=float(sz["cost"][0]),
             feasible=bool(sz["feasible"][0]), tau_max=float(sz["tau_max"][0]), ki_over_kp=float(g[0, 2] / g[0, 0]), L=float(L), D=float(D),
             tau_per_weight=float(sz["tau_max"][0] / (sz["mass"][0] * A.G)),
             rho=float(S.worst_radius(dp, 1.0, "integ")[0]), ceil=float(S.ki_ceiling(dp, 1.0, "integ")[0]))
    return r


def summarise(out, train, labels):
    Ls = ["Milestone 7i: lever-aware objective (train on levers 0, 1, 2); integrator feed-forward, ki <= ceiling / 1.25 as a constraint.",
          f"{SEEDS} seeds, best of {len(M6.STARTS)} CMA-ES starts x {BUDGET} evaluations on {EP_PER_LEVER} episodes per training lever; held-out {TEST_EP} episodes (seed {TEST_SEED}), side force on.",
          "7e = milestone 7e's constrained designs (lever-1 objective, TWR 2); 7h free = milestone 7h's retrained designs (lever-1 objective, TWR free).",
          "J includes the hover-power price; paired differences are against 7e. tau/W = torque limit per newton of weight (m); dead = diverged episodes, summed (per seed).",
          "rho = worst linear spectral radius at the design's own ki (>= 1: unstable at some plant corner); ceil = ki_ceiling multiple.", ""]
    for geom in GEOMS:
        base = sorted((r for r in out if r["geom"] == geom and r["label"] == "7e"), key=lambda r: r["seed"])
        for lab in labels:
            rs = sorted((r for r in out if r["geom"] == geom and r["label"] == lab), key=lambda r: r["seed"])
            if not rs: continue
            tr = [t for t in train if t[0] == lab and t[1] == geom]
            rej = f"; rejected {np.mean([t[6] for t in tr]) / BUDGET:.2f} of training candidates" if tr else ""
            Ls.append(f"[{geom}, {lab}] TWR {', '.join(f'{r['twr']:.2f}' for r in rs)}; cant {np.mean([r['alpha_deg'] for r in rs]):.1f} deg; "
                      f"L {np.mean([r['L'] for r in rs]):.3f} m; D {np.mean([r['D'] for r in rs]):.3f} m; mass {np.mean([r['mass'] for r in rs]):.3f} kg; "
                      f"hover W {np.mean([r['power'] for r in rs]):.1f}; cost ${np.mean([r['cost'] for r in rs]):.0f}; tau_max {np.mean([r['tau_max'] for r in rs]):.3f} N m; "
                      f"tau/W {np.mean([r['tau_per_weight'] for r in rs]):.4f} m; feasible {sum(r['feasible'] for r in rs)}/{len(rs)}{rej}")
            Ls.append(f"  ki/kp {', '.join(f'{r['ki_over_kp']:.2f}' for r in rs)}; rho {', '.join(f'{r['rho']:.4f}' for r in rs)}; ceil {', '.join(f'{r['ceil']:.2f}' for r in rs)}")
            for cap in CAPS:
                for lev in LEVERS:
                    t = f"{cap:g}_{lev:g}"
                    dj = [a[f"J_{t}"] - b[f"J_{t}"] for a, b in zip(rs, base)]
                    se = np.std(dj, ddof=1) / np.sqrt(len(dj)) if len(dj) > 1 else float("nan")
                    Ls.append(f"  cap {cap:2g}, lever {lev:g}: J {np.mean([r[f'J_{t}'] for r in rs]):+.3f}; minus 7e {np.mean(dj):+.3f} "
                              f"(se {se:.3f}, better in {sum(v > 0 for v in dj)} of {len(dj)}); "
                              f"pos {np.mean([r[f'pos_{t}'] for r in rs]):.3f} m; dead {sum(r[f'dead_{t}'] for r in rs)} {[r[f'dead_{t}'] for r in rs]}")
            Ls.append("")
    return Ls


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(a, g, s, k) for a in ARMS for g in GEOMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        train = p.map(one, jobs, chunksize=1)
    t_train = time.time() - t0
    ev = []
    for r in json.load(open(os.path.join(HERE, "..", "m7e_margin", "results.json")))["runs"]:
        if r["label"] == "constrained" and r["seed"] < SEEDS:
            ev.append(("7e", r["geom"], r["seed"], r["x"][:12], 2.0))
    for r in json.load(open(os.path.join(HERE, "..", "m7h_twr", "results.json")))["runs"]:
        if r["label"] == "free" and r["seed"] < SEEDS:
            ev.append(("7h free", r["geom"], r["seed"], r["x"][:12], r["twr"]))
    for a in ARMS:
        for g in GEOMS:
            for s in range(SEEDS):
                b = max((t for t in train if t[0] == a and t[1] == g and t[2] == s), key=lambda t: t[4])
                ev.append((a, g, s, b[5][:12], float(H.twr_of(b[5])[0]) if a.endswith("free") else A.TWR))
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    labels = ["7e", "7h free", *ARMS]
    lines = summarise(out, train, labels) + [f"wall time {time.time() - t0:.0f} s (training {t_train:.0f} s)"]
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(labels=labels, budget=BUDGET, train_levers=TRAIN_LEVERS, levers=LEVERS, caps=CAPS, margin=H.MARGIN, ep_per_lever=EP_PER_LEVER,
                   train=[dict(arm=t[0], geom=t[1], seed=t[2], start=t[3], best=t[4], x=t[5], rejected=t[6]) for t in train], runs=out),
              open(os.path.join(HERE, f"results{tag}.json"), "w"), indent=1)
    print("\n".join(lines))
