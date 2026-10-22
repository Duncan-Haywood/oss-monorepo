"""Does a zero-initialised cross-axis residual network beat per-axis PID once roll, pitch and yaw are coupled (Euler's equations, weak yaw authority)?
Arms (equal total evaluations): pid96, pid576, pid2496 (CMA-ES on 6 PID gains); skip576, skip2496 (PID tuned at 96, then 480 / 2400 evaluations on an 83-parameter residual
from zero); gc96 (the 96-evaluation PID plus analytic gyroscopic compensation, no search). Held-out: 64 wide-plant episodes, different seed.
MAIN: Iz/Ix 1.9, reference scale 1, yaw authority x1, 6 airframes x 5 seeds. SWEEP: Iz/Ix {1.0, 1.9, 3.0} x reference scale {1, 2} x yaw authority {1, 3}, 3 airframes x 3 seeds, pid576 / skip576 / gc96."""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_coupled import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
ROBUST = os.path.join(HERE, "..", "..", "codesign-aero-robust", "experiments", "results.json")


def tune(xd, kind, budget, seed, cond, base=None, sigma=0.25):
    dim = 6 if kind == "pid" else A.NP
    es = cma.CMAEvolutionStrategy([0.5] * dim, sigma, {"bounds": [0, 1], "seed": seed + 1, "popsize": 16, "verbose": -9})
    wrap = (lambda xs: xs) if kind == "pid" else (lambda xs: np.concatenate([np.tile(base, (len(xs), 1)), xs], axis=1))
    ctrl = "pid" if kind == "pid" else "skip"
    sc = lambda g: A.score(np.tile(xd, (len(g), 1)), g, TRAIN_EP, TRAIN_SEED + seed, ctrl=ctrl, **cond)[0]
    best, bx, n = -1e9, None, 0
    if kind == "skip":
        z = np.full((1, dim), 0.5); best = sc(wrap(z))[0]; bx = z[0]     # zero residual is the incumbent
    while n < budget:
        xs = np.array(es.ask()); ys = sc(wrap(xs)); n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return bx


def test(xd, g, ctrl, cond, diag=None):
    J, _, ax = A.score(xd[None], g[None], TEST_EP, TEST_SEED, ctrl=ctrl, per_axis=True, diag=diag, **cond)
    return float(-J[0]), ax[0]


def cell(args):
    xd, s, cond, arms = args
    out, g96 = {}, tune(xd, "pid", 96, s, cond)
    out["pid96"] = test(xd, g96, "pid", cond)
    if "gc96" in arms:
        d = np.zeros(1); out["gc96"] = test(xd, g96, "pidgc", cond); test(xd, g96, "pid", cond, diag=d); out["gyro_share"] = float(d[0])
    if "pid576" in arms: out["pid576"] = test(xd, tune(xd, "pid", 576, s, cond), "pid", cond)
    if "skip576" in arms:
        r = tune(xd, "skip", 480, s, cond, base=g96, sigma=0.1); out["skip576"] = test(xd, np.concatenate([g96, r]), "skip", cond)
        out["resid576"] = float(np.abs(r - 0.5).max())
    if "pid2496" in arms: out["pid2496"] = test(xd, tune(xd, "pid", 2496, s, cond), "pid", cond)
    if "skip2496" in arms:
        r = tune(xd, "skip", 2400, s, cond, base=g96, sigma=0.1); out["skip2496"] = test(xd, np.concatenate([g96, r]), "skip", cond)
    return out


def tab(rows, arm):
    return np.array([r[arm][0] for r in rows]), np.array([r[arm][1] for r in rows])


if __name__ == "__main__":
    R = json.load(open(ROBUST)); order = np.argsort(np.array(R["rms"]["wide|wide"]))
    pick = [int(order[i]) for i in (0, 9, 19, 29, 39, 49)]
    X = [np.array(R["cells"][c]) for c in pick]
    main_cond = dict(iz_ratio=1.9, ref_scale=1.0, kappa_scale=1.0)
    main_arms = ("gc96", "pid576", "skip576", "pid2496", "skip2496")
    jobs = [(X[j], s, main_cond, main_arms) for j in range(6) for s in range(5)]
    with Pool() as p:
        rows = p.map(cell, jobs)
        sweep_conds = [dict(iz_ratio=iz, ref_scale=rs, kappa_scale=ks) for iz in (1.0, 1.9, 3.0) for rs in (1.0, 2.0) for ks in (1.0, 3.0)]
        sjobs = [(X[j], s, c, ("gc96", "pid576", "skip576")) for c in sweep_conds for j in (0, 2, 4) for s in range(3)]
        srows = p.map(cell, sjobs)
    lines = [f"MAIN: Iz/Ix 1.9, reference 15/15/30 deg steps, yaw authority kappa {A.KAPPA} m/N; 6 airframes (robust-study wide-PID rank 1,10,20,30,40,50) x 5 seeds; held-out {TEST_EP} wide-plant episodes",
             "combined RMS attitude error (deg) = sqrt(mean over roll, pitch, yaw of per-axis RMS^2), mean over seeds; roll/pitch RMS in brackets:"]
    arms = ("pid96", "gc96", "pid576", "skip576", "pid2496", "skip2496")
    res = {a: tab(rows, a)[0].reshape(6, 5) for a in arms}
    ax = {a: tab(rows, a)[1].reshape(6, 5, 3) for a in arms}
    for a in arms:
        rp = np.sqrt((ax[a][:, :, :2] ** 2).mean(axis=2)).mean()
        lines.append(f"  {a:9s} mean over airframes {res[a].mean():6.3f}  (roll/pitch RMS {rp:5.2f}, yaw RMS {ax[a][:, :, 2].mean():5.2f})")
    def pair(a, b, label):
        d = res[a] - res[b]
        lines.append(f"{label}: mean {d.mean():+.3f} deg, second better in {int((d > 0).sum())} of {d.size} pairs, worse in {int((d < 0).sum())}; seed-to-seed SD of the difference {d.std(ddof=1):.3f}")
    pair("pid576", "skip576", "pid576 minus skip576")
    pair("pid2496", "skip2496", "pid2496 minus skip2496")
    pair("pid96", "gc96", "pid96 minus gc96 (analytic gyroscopic compensation)")
    gs = np.array([r["gyro_share"] for r in rows])
    lines.append(f"peak share of the torque limit taken by w x (I w) over the held-out episodes (pid96): median {np.median(gs):.3f}, max {gs.max():.3f}")
    lines.append(f"skip576 arms that kept a nonzero residual: {int(sum(r['resid576'] > 0 for r in rows))} of {len(rows)}")
    lines.append("")
    lines.append("SWEEP (3 airframes x 3 seeds each; mean combined RMS error, deg): Iz/Ix, reference scale, yaw authority x kappa")
    lines.append("  Iz/Ix  ref  yaw   pid576  skip576  gc96   pid96-gc96  gyro share(max)")
    sw = []
    for i, c in enumerate(sweep_conds):
        rr = srows[i * 9:(i + 1) * 9]
        m = {a: np.mean([r[a][0] for r in rr]) for a in ("pid96", "gc96", "pid576", "skip576")}
        gmax = max(r["gyro_share"] for r in rr)
        lines.append(f"  {c['iz_ratio']:4.1f}  {c['ref_scale']:3.0f}  x{c['kappa_scale']:.0f}   {m['pid576']:6.2f}  {m['skip576']:7.2f}  {m['gc96']:5.2f}   {m['pid96'] - m['gc96']:+8.3f}   {gmax:.3f}")
        sw.append(dict(cond=c, mean=m, gyro_share_max=gmax))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"main": {a: res[a].tolist() for a in arms}, "sweep": sw, "L": [R["L"][c] for c in pick], "D": [R["D"][c] for c in pick]}, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
