"""Milestone 7b: feed forward only the attitude integrator's torque, so no fast loop closes.

Milestone 7 cancelled the canted rotor's side force by predicting it from the whole commanded torque (through the nominal motor
lag, then a low-pass of time constant tau_ff). That evened the two horizontal axes, but the term feeds the proportional and
derivative torque back into the tilt reference, a loop with the motor lag inside it, and under lag and torque uncertainty it added
a divergence tail (two of six `below` seeds diverged on 4 of 64 held-out episodes each). The steady side force that hurts one axis
comes from the steady counter-torque to the gust, and the attitude loop already holds an estimate of that: its integrator. Here the
position loop subtracts lat * ki * integ * tau_max_nom / m_nominal (`poshold.rollout(ff_mode="integ")`), unfiltered, from the
previous step. Same sensors and numbers as milestone 7; no filter constant to tune (12 coordinates, as milestones 6/6b).

Arms, each under both rigid geometries of milestone 6b (centre of pressure above and below the centre of mass):
  integ          - cant <= 80 deg, side force on, integrator feed-forward on in training and test: retrained with milestones
                   6/6b/7's CMA-ES, budget, episodes, seeds and starts; also scored with the feed-forward switched off;
  6b+integ       - milestone 6b's force-aware designs with the integrator feed-forward switched on, not retrained;
  m7 cmd-ff      - milestone 7's retrained designs with its commanded-torque feed-forward (their chosen tau_ff), re-scored;
  6b aware, 6b nocant - milestone 6b's designs as trained, re-scored for paired comparisons.
Held-out: 64 episodes (seed 9999), lever 0, 1 and 2 times the inherited 0.05 + 0.3 L, side force on and off.
Predictions in ../../LOG.md, written and committed before this was run.
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
LEVERS = (0.0, 1.0, 2.0)
SMOKE = os.environ.get("SMOKE") == "1"
BUDGET = 64 if SMOKE else M6.BUDGET
SEEDS = 2 if SMOKE else M6.SEEDS
TRAIN_EP = 4 if SMOKE else M6.TRAIN_EP
TEST_EP = 8 if SMOKE else M6.TEST_EP
TEST_SEED = 4242 if SMOKE else M6.TEST_SEED   # the smoke run never touches the held-out seed


def one(args):
    geom, s, k = args
    x0 = [0.5] * 12; x0[2] = M6.STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask())
        ys = P.score(xs, TRAIN_EP, M6.TRAIN_SEED + s, dist_sign=GEOMS[geom], ff=1.0, ff_mode="integ", **M6.cond("aware"))[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return geom, s, k, float(best), bx.tolist()


def evaluate(geom, arm, s, bx, ff, mode, label):
    x = np.array(bx)[None]
    r = dict(geom=geom, arm=arm, seed=s, label=label, ff=ff, ff_mode=mode, x=bx)
    for lev in LEVERS:
        for couple in (True, False):
            c = M6.cond(arm); c["couple"] = couple
            J, sz, o = P.score(x, TEST_EP, TEST_SEED, parts=True, dist_sign=GEOMS[geom], lever_scale=lev, ff=ff, ff_mode=mode, **c)
            tag = f"{lev:g}_{'on' if couple else 'off'}"
            r.update({f"J_{tag}": float(J[0]), f"pos_{tag}": float(o["pos"][0]), f"late_{tag}": float(o["pos_late"][0]),
                      f"latex_{tag}": float(o["late_x"][0]), f"latey_{tag}": float(o["late_y"][0]), f"yaw_{tag}": float(o["yaw"][0]),
                      f"dead_{tag}": float(o["dead"][0])})
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]))
    return r


LABELS = ["6b nocant", "6b aware", "6b+integ", "m7 cmd-ff", "integ retrained", "integ retrained, ff off"]


def summarise(out):
    sel = lambda g, lab: sorted((r for r in out if r["geom"] == g and r["label"] == lab), key=lambda r: r["seed"])
    f = lambda v: ", ".join(f"{x:.2f}" for x in v)
    L = [f"Milestone 7b: integrator feed-forward in the position loop, rigid centre-of-pressure geometries (signs above {GEOMS['above'].tolist()}, below {GEOMS['below'].tolist()}).",
         f"{SEEDS} seeds, best of {len(M6.STARTS)} CMA-ES starts x {BUDGET} evaluations on {TRAIN_EP} episodes; held-out {TEST_EP} episodes (seed {TEST_SEED}).",
         "6b = milestone 6b's designs (no feed-forward); 6b+integ = same designs, integrator feed-forward on, not retrained; m7 cmd-ff = milestone 7's retrained",
         "designs with its commanded-torque feed-forward; integ retrained = trained with the integrator feed-forward on.",
         "on/off = side force in/out of the held-out rollout. hurt axis: y when above, x when below. lever = multiple of the inherited 0.05 + 0.3 L.",
         "dead = share of held-out episodes that diverged (mean over seeds); seeds dead = per-seed count of diverged episodes.", ""]
    for g in GEOMS:
        hurt, help_ = ("latey", "latex") if g == "above" else ("latex", "latey")
        for lab in LABELS:
            rs = sel(g, lab)
            if not rs:
                continue
            L.append(f"[{g}, {lab}] cant deg {f([r['alpha_deg'] for r in rs])}; hover W {np.mean([r['power'] for r in rs]):.1f}")
            for lev in LEVERS:
                t = f"{lev:g}"
                ratio = [r[f"pos_{t}_on"] / r[f"pos_{t}_off"] for r in rs]
                hr = [r[f"{hurt}_{t}_on"] / r[f"{help_}_{t}_on"] for r in rs]
                nd = [int(round(r[f"dead_{t}_on"] * TEST_EP)) for r in rs]
                L.append(f"  lever {t:3s} pos on {np.mean([r[f'pos_{t}_on'] for r in rs]):.3f} (median {np.median([r[f'pos_{t}_on'] for r in rs]):.3f}) off {np.mean([r[f'pos_{t}_off'] for r in rs]):.3f} "
                         f"on/off {np.mean(ratio):.3f} ({f(ratio)}); late hurt {np.mean([r[f'{hurt}_{t}_on'] for r in rs]):.3f} (median {np.median([r[f'{hurt}_{t}_on'] for r in rs]):.3f}) "
                         f"helped {np.mean([r[f'{help_}_{t}_on'] for r in rs]):.3f} ratio {np.mean(hr):.2f} ({f(hr)}); yaw {np.mean([r[f'yaw_{t}_on'] for r in rs]):.2f}; "
                         f"J {np.mean([r[f'J_{t}_on'] for r in rs]):+.2f}; dead {np.mean([r[f'dead_{t}_on'] for r in rs]):.3f} (seeds dead {nd})")
        base, nc, m7 = sel(g, "6b aware"), sel(g, "6b nocant"), sel(g, "m7 cmd-ff")
        for lab in ("6b+integ", "integ retrained"):
            rs = sel(g, lab)
            if not rs:
                continue
            for ref_lab, ref in (("6b aware", base), ("m7 cmd-ff", m7)):
                for lev in LEVERS:
                    t = f"{lev:g}"
                    dh = [x[f"{hurt}_{t}_on"] - y[f"{hurt}_{t}_on"] for x, y in zip(rs, ref)]
                    dp = [x[f"pos_{t}_on"] - y[f"pos_{t}_on"] for x, y in zip(rs, ref)]
                    dj = [x[f"J_{t}_on"] - y[f"J_{t}_on"] for x, y in zip(rs, ref)]
                    L.append(f"  [{g}] {lab} minus {ref_lab}, lever {t}: hurt axis {np.mean(dh):+.4f} m (lower in {sum(v < 0 for v in dh)} of {len(dh)}), "
                             f"pos {np.mean(dp):+.4f} m (lower in {sum(v < 0 for v in dp)}), J {np.mean(dj):+.3f} (better in {sum(v > 0 for v in dj)})")
            for lev in LEVERS:
                t = f"{lev:g}"
                dy = [x[f"yaw_{t}_on"] - y[f"yaw_{t}_on"] for x, y in zip(rs, nc)]
                djn = [x[f"J_{t}_on"] - y[f"J_{t}_on"] for x, y in zip(rs, nc)]
                L.append(f"  [{g}] {lab} minus 6b nocant, lever {t}: yaw {np.mean(dy):+.2f} deg (lower in {sum(v < 0 for v in dy)}), J {np.mean(djn):+.2f} (better in {sum(v > 0 for v in djn)})")
        L.append("")
    return L


if __name__ == "__main__":
    jobs = [(g, s, k) for g in GEOMS for s in range(SEEDS) for k in range(len(M6.STARTS))]
    with Pool() as p:
        res = p.map(one, jobs, chunksize=1)
    ev = []
    for g in GEOMS:
        for s in range(SEEDS):
            b = max((r for r in res if r[:2] == (g, s)), key=lambda r: r[3])
            ev.append((g, "aware", s, b[4], 1.0, "integ", "integ retrained"))
            ev.append((g, "aware", s, b[4], 0.0, "integ", "integ retrained, ff off"))
    for r in json.load(open(os.path.join(HERE, "..", "m6b_cop", "results.json")))["runs"]:
        if r["source"] != "retrained" or r["seed"] >= SEEDS:
            continue
        ev.append((r["geom"], r["arm"], r["seed"], r["x"], 0.0, "cmd", f"6b {r['arm']}"))
        if r["arm"] == "aware":
            ev.append((r["geom"], "aware", r["seed"], r["x"], 1.0, "integ", "6b+integ"))
    for r in json.load(open(os.path.join(HERE, "..", "m7_ff", "results.json")))["runs"]:
        if r["label"] == "ff retrained" and r["seed"] < SEEDS:
            ev.append((r["geom"], "aware", r["seed"], r["x"], 1.0, "cmd", "m7 cmd-ff"))   # 13 coordinates: tau_ff as chosen
    with Pool() as p:
        out = p.starmap(evaluate, ev)
    lines = summarise(out)
    tag = "_smoke" if SMOKE else ""
    open(os.path.join(HERE, f"results{tag}.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(geoms={k: list(v) for k, v in GEOMS.items()}, levers=LEVERS, budget=BUDGET, runs=out),
              open(os.path.join(HERE, f"results{tag}.json"), "w"), indent=1)
    print("\n".join(lines))
