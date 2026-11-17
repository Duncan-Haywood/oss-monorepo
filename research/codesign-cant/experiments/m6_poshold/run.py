"""Milestone 6: does the side force of a canted rotor cost position hold more than cant's yaw gain is worth? (H3)

Joint CMA-ES over arm length, propeller diameter, cant, six attitude PID gains and three position gains (12 parameters), on the
attitude-priority mixer with the collective held at hover (milestone 2), TWR 2, kappa = c D with the UIUC median c, hover power
priced at 0.03 per 100 W (milestone 4's 0.3 deg per 100 W in units of the composite). Episodes are 6 s: hold the origin from a
random 0.5 m offset while yaw steps +-30 deg and the mean wind steps by +-3 m/s per axis at 3 s (src/codesign_cant/poshold.py).
Arms:
  nocant  - cant fixed at 0;
  aware   - cant <= 80 deg, side force in the training loop;
  unaware - cant <= 80 deg, side force switched off in training (a designer who ignores it), scored with it on.
6 seeds; two CMA-ES starts per seed (cant coordinate started at 0.4 and 0.8 of the bound), 3200 evaluations each on 16 training
episodes, the start with the better TRAINING score kept. Held-out: 64 wide-plant episodes (seed 9999), each design scored with the
side force on and off, and in calm air (no wind step). Predictions in ../../LOG.md, written before this was run.
"""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from codesign_cant import poshold as P  # noqa: E402

C, LAM = 0.081, 0.03                     # UIUC median c (milestones 1-4, data/propdata_c.csv); power price
TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
BUDGET, SEEDS, STARTS = 3200, 6, (0.4, 0.8)
ARMS = {"nocant": (0, True), "aware": (80, True), "unaware": (80, False)}


def cond(arm, couple=None):
    cap, c = ARMS[arm]
    return dict(alpha_max=np.deg2rad(max(cap, 1e-9)), kappa_per_d=C, lam=LAM, couple=c if couple is None else couple)


def one(args):
    arm, s, k = args
    x0 = [0.5] * 12; x0[2] = STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = P.score(xs, TRAIN_EP, TRAIN_SEED + s, **cond(arm))[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return arm, s, k, float(best), bx.tolist()


def held_out(arm, s, k, bx):
    x = np.array(bx)[None]
    r = dict(arm=arm, seed=s, start=k)
    for tag, kw in (("on", dict(couple=True)), ("off", dict(couple=False)), ("calm", dict(couple=True, wind_step=0.0))):
        sat = np.zeros((1, 2))
        c = cond(arm); c.update(kw)
        J, sz, o = P.score(x, TEST_EP, TEST_SEED, parts=True, sat=sat, **c)
        r.update({f"J_{tag}": float(J[0]), f"pos_{tag}": float(o["pos"][0]), f"late_{tag}": float(o["pos_late"][0]),
                  f"yaw_{tag}": float(o["yaw"][0]), f"att_{tag}": float(o["att"][0]), f"dead_{tag}": float(o["dead"][0]),
                  f"satrp_{tag}": float(sat[0, 0]), f"saty_{tag}": float(sat[0, 1])})
    r.update(alpha_deg=float(np.rad2deg(sz["alpha"][0])), power=float(sz["power"][0]), mass=float(sz["mass"][0]), L=float(sz["L"][0]),
             D=float(sz["D"][0]), lat=float(P.lateral_per_torque(sz["alpha"][0], sz["L"][0], C * sz["D"][0])), x=bx)
    return r


def paired(a, b, key_a, key_b=None):
    d = [x[key_a] - y[key_b or key_a] for x, y in zip(a, b)]
    return float(np.mean(d)), float(np.std(d, ddof=1)), sum(v < 0 for v in d), d


def summarise(out):
    sel = lambda arm: sorted((r for r in out if r["arm"] == arm), key=lambda r: r["seed"])
    m = lambda rs, k: float(np.mean([r[k] for r in rs]))
    n = SEEDS
    lines = [f"Milestone 6: position hold, 6 s episodes with a +-3 m/s wind step at 3 s; mixer prio (collective at hover), TWR 2, kappa = {C} D,",
             f"lam {LAM} per 100 W; {SEEDS} seeds, best of {len(STARTS)} CMA-ES starts x {BUDGET} evaluations; held-out {TEST_EP} wide-plant episodes (seed {TEST_SEED})",
             "J = -sqrt((pos/0.10 m)^2 + (yaw/10 deg)^2) - lam P/100 W. on/off = side force in/out of the held-out rollout; calm = no wind step.",
             "",
             "arm      force  pos m (mean; per seed)                       late m  yaw deg  att deg  J       dead   sat rp  sat yaw"]
    for arm in ARMS:
        rs = sel(arm)
        for tag in ("on", "off", "calm"):
            lines.append(f"{arm:8s} {tag:5s}  {m(rs, 'pos_' + tag):5.3f} ({', '.join(f'{r['pos_' + tag]:.3f}' for r in rs)})  {m(rs, 'late_' + tag):5.3f}  "
                         f"{m(rs, 'yaw_' + tag):6.2f}   {m(rs, 'att_' + tag):6.2f}   {m(rs, 'J_' + tag):6.2f}  {m(rs, 'dead_' + tag):5.3f}  {m(rs, 'satrp_' + tag):5.3f}   {m(rs, 'saty_' + tag):5.3f}")
        lines.append(f"{'':8s} design: cant deg ({', '.join(f'{r['alpha_deg']:.0f}' for r in rs)}), median {np.median([r['alpha_deg'] for r in rs]):.0f}; "
                     f"P_hover {m(rs, 'power'):.0f} W; mass {m(rs, 'mass'):.2f} kg; lat {m(rs, 'lat'):.2f} N per N m")
    lines += ["", "H3 (aware designs): position RMS with the side force on vs off, same design and episodes"]
    rs = sel("aware")
    ratio = [r["pos_on"] / r["pos_off"] for r in rs]
    late = [r["late_on"] / r["late_off"] for r in rs]
    lines.append(f"  pos on/off ratio: mean {np.mean(ratio):.3f} (per seed {', '.join(f'{v:.3f}' for v in ratio)}); late window {np.mean(late):.3f}; "
                 f"H3 refuted if the rise exceeds 20%: {'REFUTED' if np.mean(ratio) > 1.2 else 'not refuted'}")
    mj, sj, kj, _ = paired(rs, rs, "J_off", "J_on")
    lines.append(f"  J with force off minus on: {-mj:+.2f} (sd {sj:.2f}): the side force costs this much composite")
    lines += ["", "Paired by seed, cant (aware) minus no cant, force on (negative = cant better; for J positive = cant better)"]
    a, z = sel("aware"), sel("nocant")
    for key in ("pos_on", "late_on", "yaw_on", "att_on", "pos_calm", "yaw_calm"):
        mu, sd, k, _ = paired(a, z, key)
        lines.append(f"  {key:8s} {mu:+.3f} (sd {sd:.3f}, cant lower in {k} of {n})")
    mu, sd, k, d = paired(z, a, "J_on")
    lines.append(f"  J_on     {-mu:+.2f} (sd {sd:.2f}, cant better in {k} of {n})")
    yaw_gain = -paired(a, z, "yaw_on")[0] / P.YAW_SCALE_DEG
    pos_cost_force = np.mean([(r["pos_on"] - r["pos_off"]) for r in a]) / P.POS_SCALE_M
    lines.append(f"  yaw gain in composite units {yaw_gain:+.2f}; side-force position cost in composite units {pos_cost_force:+.2f}")
    lines += ["", "Ignoring the side force in design: unaware minus aware, both scored with the force on (positive = ignoring it hurts)"]
    u = sel("unaware")
    for key in ("pos_on", "late_on", "yaw_on"):
        mu, sd, k, _ = paired(u, a, key)
        lines.append(f"  {key:8s} {mu:+.3f} (sd {sd:.3f}, unaware lower in {k} of {n})")
    mu, sd, k, _ = paired(a, u, "J_on")
    lines.append(f"  J_on     {-mu:+.2f} worse for unaware (sd {sd:.2f}, unaware better in {k} of {n})")
    lines.append(f"  unaware designs, force off vs on: pos {m(u, 'pos_off'):.3f} -> {m(u, 'pos_on'):.3f} m; dead {m(u, 'dead_off'):.3f} -> {m(u, 'dead_on'):.3f}")
    return lines


if __name__ == "__main__":
    jobs = [(a, s, k) for a in ARMS for s in range(SEEDS) for k in range(len(STARTS))]
    with Pool() as p:
        res = p.map(one, jobs, chunksize=1)
    best = []
    for a in ARMS:
        for s in range(SEEDS):
            cand = sorted((r for r in res if r[0] == a and r[1] == s), key=lambda r: r[2])
            _, _, k, tb, bx = max(cand, key=lambda r: r[3])
            best.append((a, s, k, bx, [round(c[3], 3) for c in cand]))
    with Pool() as p:
        out = p.starmap(held_out, [(a, s, k, bx) for a, s, k, bx, _ in best])
    for r, b in zip(out, best):
        r["train_starts"] = b[4]
    lines = summarise(out)
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(c=C, lam=LAM, budget=BUDGET, runs=out), open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("\n".join(lines))
