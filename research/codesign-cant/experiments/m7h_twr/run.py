"""Milestone 7h: thrust-to-weight (motor headroom) as a design variable, scored at twice the trained centre-of-pressure lever.

Milestone 7g found that the residual lever-2 divergence of the margin-constrained designs is a tilt-over that starts in the
attitude-priority mixer: the gust torque outgrows the differential thrust the hover polytope allows, and no gain, margin or
airmode fixes it; about 25% more roll/pitch authority would. Every design so far was sized at thrust-to-weight 2 (aero.TWR).
Here CMA-ES also chooses thrust-to-weight on aero.TWR_RANGE = 1.5..4 (a 13th coordinate). Bigger motors weigh more
(0.045 (Tmax / 9 N)^1.2 kg each, inherited fit) and cost more, so hover power, which the objective prices, and the $300 cap
push back. Training is milestone 7e's exactly (integ feed-forward, ki <= ceiling / 1.25 as a constraint on both axes and the
eight plant corners, 3200 evaluations, 16 episodes at lever 1, 6 seeds, 2 starts), for both rigid geometries.

Two arms:
  free     retrained with thrust-to-weight free (the 13th coordinate starts at 0.2, i.e. thrust-to-weight 2.0, the old value);
  retrofit milestone 7e's constrained designs with their gains unchanged, re-sized at thrust-to-weight 2.0 (as trained) and at
           the largest value on a 0.05 grid for which the sizing still closes (mass below the 20 kg clamp, under the $300 cap):
           "buy bigger motors, keep the airframe and the tune". A smoke run found that the 15-minute endurance closure runs away
           above about 2.1 (`above`) to 2.5 (`below`) on these airframes, so 2.5 and 3.0, planned first, do not exist for most.
           The PID outputs are shares of the nominal torque limit, so bigger motors also raise the loop gain; the linear test
           (linstab) is reported for each.
Held-out: 64 episodes (seed 9999), lever 0, 1, 2, side force on, tilt-command limits 20 and 45 deg.
Predictions H1-H6 in ../../LOG.md, written and committed before this was run at full budget.
"""
import json, os, sys, time, warnings
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

P = M6.P
GEOMS = {"above": P.cop_signs(1.0), "below": P.cop_signs(-1.0)}
LEVERS = (0.0, 1.0, 2.0)
CAPS = (20.0, 45.0)
MARGIN = 1.25
TWR_GRID = np.round(np.arange(2.0, 4.0001, 0.05), 2)
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
TRAIN_EP = 4 if SMOKE else M6.TRAIN_EP
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed
DEFAULT_CAP = P.TILT_CMD_MAX


def twr_of(xs):
    """13th unit coordinate -> thrust-to-weight on aero.TWR_RANGE."""
    return A.TWR_RANGE[0] + (A.TWR_RANGE[1] - A.TWR_RANGE[0]) * np.clip(np.atleast_2d(xs)[:, 12], 0, 1)


def max_closable(x12):
    """Largest thrust-to-weight on TWR_GRID at which aero.size closes (mass below the 20 kg clamp) and the design is feasible."""
    x = np.asarray(x12, float); c = M6.cond("aware")
    L = A.L_RANGE[0] + x[0] * (A.L_RANGE[1] - A.L_RANGE[0]); D = A.D_RANGE[0] + x[1] * (A.D_RANGE[1] - A.D_RANGE[0])
    sz = A.size(L + 0 * TWR_GRID, D, c["alpha_max"] * np.clip(x[2], 0, 1), kappa_per_d=c["kappa_per_d"], twr=TWR_GRID, actuator="hover")
    ok = (sz["mass"] < 19.0) & sz["feasible"]
    # the closure fails from some value upwards; take the last grid point before the first failure
    return float(TWR_GRID[np.argmin(ok)] - 0.05) if not ok.all() else float(TWR_GRID[-1])


def margin_rho(x12, twr):
    """Milestone 7e's feasibility test at the design's own thrust-to-weight: < 1 means feasible."""
    dp = S.design_params(x12, twr=twr, tau_ff=P.TAU_FF)
    q = dict(dp); q["ki"] = dp["ki"] * MARGIN
    return np.maximum(S.worst_radius(dp, 1.0, "integ"), S.worst_radius(q, 1.0, "integ"))


CACHE = os.path.join(HERE, ".cache_smoke" if SMOKE else ".cache")   # one file per finished CMA-ES run, so a stopped job resumes


def one(args):
    geom, s, k = args
    f = os.path.join(CACHE, f"{geom}_{s}_{k}.json")
    if os.path.exists(f):
        return tuple(json.load(open(f)))
    out = train_one(geom, s, k)
    os.makedirs(CACHE, exist_ok=True)
    json.dump(list(out), open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    print(f"trained {geom} seed {s} start {k}: best {out[3]:.3f}", flush=True)
    return out


def train_one(geom, s, k):
    x0 = [0.5] * 13; x0[2] = M6.STARTS[k]; x0[12] = (A.TWR - A.TWR_RANGE[0]) / (A.TWR_RANGE[1] - A.TWR_RANGE[0])
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n, ninf = -1e9, None, 0, 0
    while n < BUDGET:
        xs = np.array(es.ask()); tw = twr_of(xs)
        rho = margin_rho(xs[:, :12], tw)
        ok = rho < 1.0
        ys = -100.0 - 10.0 * np.minimum(rho - 1.0, 10.0)
        if ok.any():
            ys[ok] = P.score(xs[ok, :12], TRAIN_EP, M6.TRAIN_SEED + s, dist_sign=GEOMS[geom], ff=1.0, ff_mode="integ", twr=tw[ok], **M6.cond("aware"))[0]
        n += len(xs); ninf += int((~ok).sum()); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return geom, s, k, float(best), bx.tolist(), ninf


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
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]), mass=float(sz["mass"][0]), cost=float(sz["cost"][0]),
             feasible=bool(sz["feasible"][0]), tau_max=float(sz["tau_max"][0]), ki_over_kp=float(g[0, 2] / g[0, 0]),
             rho=float(S.worst_radius(dp, 1.0, "integ")[0]), ceil=float(S.ki_ceiling(dp, 1.0, "integ")[0]))
    return r


def summarise(out, train, labels):
    L = ["Milestone 7h: thrust-to-weight (TWR) as a design variable; integrator feed-forward, ki <= ceiling / 1.25 as a constraint.",
         f"{SEEDS} seeds, best of {len(M6.STARTS)} CMA-ES starts x {BUDGET} evaluations on {TRAIN_EP} episodes (lever 1); held-out {TEST_EP} episodes (seed {TEST_SEED}), side force on.",
         "retrofit = milestone 7e's constrained designs, gains unchanged, re-sized at TWR 2.0 (7e as trained) or the largest TWR whose sizing still closes (max).",
         "free = retrained with TWR on 1.5..4. J includes the hover-power price; paired differences are against retrofit TWR=2.0.",
         "rho = worst linear spectral radius at the design's own ki (>= 1: unstable at some plant corner); ceil = ki_ceiling multiple; dead = diverged episodes, summed (per seed).", ""]
    for geom in GEOMS:
        base = sorted((r for r in out if r["geom"] == geom and r["label"] == "retrofit TWR=2.0"), key=lambda r: r["seed"])
        for lab in labels:
            rs = sorted((r for r in out if r["geom"] == geom and r["label"] == lab), key=lambda r: r["seed"])
            if not rs: continue
            tr = [t for t in train if t[0] == geom] if lab == "free" else []
            rej = f"; rejected {np.mean([t[5] for t in tr]) / BUDGET:.2f} of training candidates" if tr else ""
            L.append(f"[{geom}, {lab}] TWR {', '.join(f'{r['twr']:.2f}' for r in rs)}; cant {np.mean([r['alpha_deg'] for r in rs]):.1f} deg; "
                     f"mass {np.mean([r['mass'] for r in rs]):.3f} kg; hover W {np.mean([r['power'] for r in rs]):.1f}; cost ${np.mean([r['cost'] for r in rs]):.0f}; "
                     f"feasible {sum(r['feasible'] for r in rs)}/{len(rs)}{rej}")
            L.append(f"  ki/kp {', '.join(f'{r['ki_over_kp']:.2f}' for r in rs)}; rho {', '.join(f'{r['rho']:.4f}' for r in rs)}; ceil {', '.join(f'{r['ceil']:.2f}' for r in rs)}")
            for cap in CAPS:
                for lev in LEVERS:
                    t = f"{cap:g}_{lev:g}"
                    dj = [a[f"J_{t}"] - b[f"J_{t}"] for a, b in zip(rs, base)]
                    se = np.std(dj, ddof=1) / np.sqrt(len(dj)) if len(dj) > 1 else float("nan")
                    L.append(f"  cap {cap:2g}, lever {lev:g}: J {np.mean([r[f'J_{t}'] for r in rs]):+.3f}; minus TWR=2.0 {np.mean(dj):+.3f} "
                             f"(se {se:.3f}, better in {sum(v > 0 for v in dj)} of {len(dj)}); "
                             f"pos {np.mean([r[f'pos_{t}'] for r in rs]):.3f} m; dead {sum(r[f'dead_{t}'] for r in rs)} {[r[f'dead_{t}'] for r in rs]}")
            L.append("")
    return L


if __name__ == "__main__":
    t0 = time.time()
    jobs = [(g, s, k) for g in GEOMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        train = p.map(one, jobs, chunksize=1)
    ev = []
    for r in json.load(open(os.path.join(HERE, "..", "m7e_margin", "results.json")))["runs"]:
        if r["label"] == "constrained" and r["seed"] < SEEDS:
            ev.append(("retrofit TWR=2.0", r["geom"], r["seed"], r["x"][:12], 2.0))
            ev.append(("retrofit max", r["geom"], r["seed"], r["x"][:12], max_closable(r["x"][:12])))
    for g in GEOMS:
        for s in range(SEEDS):
            b = max((t for t in train if t[0] == g and t[1] == s), key=lambda t: t[3])
            ev.append(("free", g, s, b[4][:12], float(twr_of(b[4])[0])))
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    labels = ["retrofit TWR=2.0", "retrofit max", "free"]
    lines = summarise(out, train, labels) + [f"wall time {time.time() - t0:.0f} s"]
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(labels=labels, budget=BUDGET, levers=LEVERS, caps=CAPS, margin=MARGIN,
                   train=[dict(geom=t[0], seed=t[1], start=t[2], best=t[3], x=t[4], rejected=t[5]) for t in train], runs=out),
              open(os.path.join(HERE, f"results{tag}.json"), "w"), indent=1)
    print("\n".join(lines))
