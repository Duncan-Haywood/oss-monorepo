"""Milestone 6b: H3 under a rigid centre-of-pressure offset, retrained, with the lever swept.

Milestone 6's gust torque had one sign per run, applied to both axes (dist_sign +1 inherited, -1 the post-hoc flip). Its post-hoc
check found that the sign decides H3. A rigid body cannot have either: drag F acting at r = (0, 0, h) gives tau = r x F =
(-h Fy, h Fx), so the roll and pitch signs are opposite (`poshold.cop_signs`). With the side-force map F_y = lat tau_x,
F_x = lat tau_y (from the allocation rows), the steady counter-torque's side force then *adds to* the wind push on one horizontal
axis and *opposes* it on the other, whichever side of the centre of mass the centre of pressure is on (y hurt when h > 0, x hurt
when h < 0). This run retrains milestone 6's `aware` and `nocant` arms under both rigid geometries (h above, h below), same
budget and seeds, and scores every design on the 64 held-out episodes with the force on and off and the lever scaled 0, 0.5, 1, 2.
It also re-scores milestone 6's trained designs under the two rigid geometries (no retraining). Predictions in ../../LOG.md,
written and committed before this was run.
"""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m6_poshold"))
import run as M6  # noqa: E402  (milestone 6: constants, cond(), the CMA-ES settings)

P = M6.P
GEOMS = {"above": P.cop_signs(1.0), "below": P.cop_signs(-1.0)}
ARMS = ("nocant", "aware")
LEVERS = (0.0, 0.5, 1.0, 2.0)
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
TRAIN_EP = 4 if SMOKE else M6.TRAIN_EP
TEST_EP = 8 if SMOKE else M6.TEST_EP


def one(args):
    geom, arm, s, k = args
    ds = GEOMS[geom]
    x0 = [0.5] * 12; x0[2] = M6.STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = P.score(xs, TRAIN_EP, M6.TRAIN_SEED + s, dist_sign=ds, **M6.cond(arm))[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return geom, arm, s, k, float(best), bx.tolist()


def evaluate(geom, arm, s, bx, source):
    x = np.array(bx)[None]
    r = dict(geom=geom, arm=arm, seed=s, source=source, x=bx)
    for lev in LEVERS:
        for couple in (True, False):
            c = M6.cond(arm); c["couple"] = couple
            J, sz, o = P.score(x, TEST_EP, M6.TEST_SEED, parts=True, dist_sign=GEOMS[geom], lever_scale=lev, **c)
            tag = f"{lev:g}_{'on' if couple else 'off'}"
            r.update({f"J_{tag}": float(J[0]), f"pos_{tag}": float(o["pos"][0]), f"late_{tag}": float(o["pos_late"][0]),
                      f"latex_{tag}": float(o["late_x"][0]), f"latey_{tag}": float(o["late_y"][0]), f"yaw_{tag}": float(o["yaw"][0]),
                      f"dead_{tag}": float(o["dead"][0])})
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]), lever=float(sz["lever"][0]),
             lat=float(P.lateral_per_torque(sz["alpha"][0], sz["L"][0], M6.C * sz["D"][0])))
    return r


def summarise(out):
    sel = lambda g, a, src: sorted((r for r in out if r["geom"] == g and r["arm"] == a and r["source"] == src), key=lambda r: r["seed"])
    f = lambda v: ", ".join(f"{x:.2f}" for x in v)
    L = [f"Milestone 6b: rigid centre-of-pressure offset (roll, pitch gust-torque signs: above {list(GEOMS['above'])}, below {list(GEOMS['below'])}).",
         f"{SEEDS} seeds, best of {len(M6.STARTS)} CMA-ES starts x {BUDGET} evaluations on {TRAIN_EP} episodes; held-out {TEST_EP} episodes (seed {M6.TEST_SEED}).",
         "retrained = trained under that geometry; m6 = milestone 6's designs (trained with signs (+1, +1)) re-scored. lever = multiple of the inherited 0.05 + 0.3 L.",
         "hurt axis: y when above, x when below (the counter-torque's side force adds to the drag there).", ""]
    for g in GEOMS:
        hurt, help_ = ("latey", "latex") if g == "above" else ("latex", "latey")
        for src in ("retrained", "m6"):
            for a in ARMS:
                rs = sel(g, a, src)
                if not rs:
                    continue
                L.append(f"[{g}, {src}, {a}] cant deg {f([r['alpha_deg'] for r in rs])}; lat x lever {np.mean([r['lat'] * r['lever'] for r in rs]):.2f}")
                for lev in LEVERS:
                    t = f"{lev:g}"
                    ratio = [r[f"pos_{t}_on"] / r[f"pos_{t}_off"] for r in rs]
                    hr = [r[f"{hurt}_{t}_on"] / r[f"{help_}_{t}_on"] for r in rs]
                    L.append(f"  lever {t:3s} pos on {np.mean([r[f'pos_{t}_on'] for r in rs]):.3f} off {np.mean([r[f'pos_{t}_off'] for r in rs]):.3f} "
                             f"on/off {np.mean(ratio):.3f} ({f(ratio)}); late hurt/helped axis {np.mean(hr):.2f}; "
                             f"yaw {np.mean([r[f'yaw_{t}_on'] for r in rs]):.2f}; J {np.mean([r[f'J_{t}_on'] for r in rs]):+.2f}; dead {np.mean([r[f'dead_{t}_on'] for r in rs]):.3f}")
        a, z = sel(g, "aware", "retrained"), sel(g, "nocant", "retrained")
        for lev in LEVERS:
            t = f"{lev:g}"
            dy = [x[f"yaw_{t}_on"] - y[f"yaw_{t}_on"] for x, y in zip(a, z)]
            dj = [x[f"J_{t}_on"] - y[f"J_{t}_on"] for x, y in zip(a, z)]
            dp = [x[f"pos_{t}_on"] - y[f"pos_{t}_on"] for x, y in zip(a, z)]
            L.append(f"  [{g}] lever {t}: aware minus nocant (retrained, force on): yaw {np.mean(dy):+.2f} deg (cant lower in {sum(v < 0 for v in dy)} of {len(dy)}); "
                     f"pos {np.mean(dp):+.3f} m (cant lower in {sum(v < 0 for v in dp)}); J {np.mean(dj):+.2f} (cant better in {sum(v > 0 for v in dj)})")
        m = sel(g, "aware", "m6")
        d = [x["pos_1_on"] / x["pos_1_off"] - y["pos_1_on"] / y["pos_1_off"] for x, y in zip(a, m)]
        L.append(f"  [{g}] retrained minus m6 on/off ratio at lever 1: {np.mean(d):+.3f} (retraining lower in {sum(v < 0 for v in d)} of {len(d)})")
        L.append("")
    return L


if __name__ == "__main__":
    jobs = [(g, a, s, k) for g in GEOMS for a in ARMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        res = p.map(one, jobs, chunksize=1)
    ev = []
    for g in GEOMS:
        for a in ARMS:
            for s in range(SEEDS):
                cand = [r for r in res if r[:3] == (g, a, s)]
                b = max(cand, key=lambda r: r[4])
                ev.append((g, a, s, b[5], "retrained"))
    m6 = json.load(open(os.path.join(HERE, "..", "m6_poshold", "results.json")))["runs"]
    for g in GEOMS:
        for r in m6:
            if r["arm"] in ARMS and r["seed"] < SEEDS:
                ev.append((g, r["arm"], r["seed"], r["x"], "m6"))
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    lines = summarise(out)
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(geoms={k: list(v) for k, v in GEOMS.items()}, levers=LEVERS, budget=BUDGET, runs=out),
              open(os.path.join(HERE, f"results{tag}.json"), "w"), indent=1)
    print("\n".join(lines))
