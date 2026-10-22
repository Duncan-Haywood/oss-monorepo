"""Does tilting the rotors (a yaw-authority design variable) beat every control-law change the earlier projects tried? codesign-aero-coupled found yaw (authority-limited) dominates the attitude error.
GRID: 6 airframes x 8 cant angles (0..35 deg) x 5 seeds, PID tuned by CMA-ES (192 evaluations, 16 wide-plant training episodes), scored on 64 held-out episodes.
JOINT: CMA-ES over (L, D, cant, 6 gains) vs (L, D, 6 gains) with cant fixed at 0, equal 1920 evaluations, 5 seeds; the cost cap (300) and the 1.05 propeller-clearance rule stay.
KAPPA sweep: the assumed reaction-torque ratio x {0.5, 1, 3} on 3 airframes, to see whether cant matters if the real ratio is larger."""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_cant import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
ROBUST = os.path.join(HERE, "..", "..", "codesign-aero-robust", "experiments", "results.json")
ALPHAS = (0, 5, 10, 15, 20, 25, 30, 35)
GRID_BUDGET, JOINT_BUDGET = 192, 1920


def tune_gains(xd, seed, cond, budget=GRID_BUDGET):
    es = cma.CMAEvolutionStrategy([0.5] * 6, 0.25, {"bounds": [0, 1], "seed": seed + 1, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < budget:
        xs = np.array(es.ask()); ys = A.score(np.tile(xd, (len(xs), 1)), xs, TRAIN_EP, TRAIN_SEED + seed, **cond)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return bx


def test(xd, g, cond):
    J, sz, ax = A.score(xd[None], g[None], TEST_EP, TEST_SEED, per_axis=True, **cond)
    return dict(rms=float(-J[0]), ok=bool(sz["feasible"][0]), roll_pitch=float(np.sqrt((ax[0][:2] ** 2).mean())), yaw=float(ax[0][2]),
                cost=float(sz["cost"][0]), mass=float(sz["mass"][0]), tau_yaw=float(sz["tau_yaw"][0]), tau_max=float(sz["tau_max"][0]))


def grid_cell(args):
    xd, a_deg, s, cond = args
    x3 = np.array([xd[0], xd[1], np.deg2rad(a_deg) / A.ALPHA_MAX])
    return test(x3, tune_gains(x3, s, cond), cond)


def joint_cell(args):
    s, free = args
    dim = 9 if free else 8
    es = cma.CMAEvolutionStrategy([0.5] * dim, 0.25, {"bounds": [0, 1], "seed": s + 1, "popsize": 16, "verbose": -9})
    split = lambda xs: (np.concatenate([xs[:, :2], xs[:, 2:3] if free else np.zeros((len(xs), 1))], axis=1), xs[:, 3:] if free else xs[:, 2:])
    best, bx, n = -1e9, None, 0
    while n < JOINT_BUDGET:
        xs = np.array(es.ask()); xd, g = split(xs); ys = A.score(xd, g, TRAIN_EP, TRAIN_SEED + s)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    xd, g = split(bx[None])
    r = test(xd[0], g[0], {}); r["alpha_deg"] = float(np.rad2deg(A.ALPHA_MAX * xd[0, 2])); r["L"] = float(A.L_RANGE[0] + xd[0, 0] * (A.L_RANGE[1] - A.L_RANGE[0]))
    r["D"] = float(A.D_RANGE[0] + xd[0, 1] * (A.D_RANGE[1] - A.D_RANGE[0])); r["train"] = float(-best)
    return r


if __name__ == "__main__":
    R = json.load(open(ROBUST)); order = np.argsort(np.array(R["rms"]["wide|wide"]))
    pick = [int(order[i]) for i in (0, 9, 19, 29, 39, 49)]
    X = [np.array(R["cells"][c]) for c in pick]
    with Pool() as p:
        gjobs = [(X[j], a, s, {}) for j in range(6) for a in ALPHAS for s in range(5)]
        grid = p.map(grid_cell, gjobs)
        kappas = (0.5, 3.0)
        kjobs = [(X[j], a, s, dict(kappa_scale=k)) for k in kappas for j in (0, 2, 4) for a in ALPHAS for s in range(3)]
        kgrid = p.map(grid_cell, kjobs)
        joint = p.map(joint_cell, [(s, free) for free in (False, True) for s in range(5)])
    G = np.array([g["rms"] for g in grid]).reshape(6, len(ALPHAS), 5)
    OK = np.array([g["ok"] for g in grid]).reshape(6, len(ALPHAS), 5)
    def gm(key): return np.array([g[key] for g in grid]).reshape(6, len(ALPHAS), 5)
    lines = [f"GRID: combined RMS attitude error (deg), held-out {TEST_EP} wide-plant episodes, PID tuned {GRID_BUDGET} evaluations; mean over 6 airframes x 5 seeds (feasible cells only; n = feasible cells of 30)",
             "  cant   rms    roll/pitch  yaw    yaw-torque limit (N m)  mass (kg)  cost ($)   n"]
    summary = []
    for i, a in enumerate(ALPHAS):
        ok = OK[:, i, :]
        mean = lambda m: float(m[:, i, :][ok].mean()) if ok.any() else float("nan")
        row = dict(alpha=a, rms=mean(G), roll_pitch=mean(gm("roll_pitch")), yaw=mean(gm("yaw")), tau_yaw=mean(gm("tau_yaw")), mass=mean(gm("mass")), cost=mean(gm("cost")), n=int(ok.sum()))
        summary.append(row)
        lines.append(f"  {a:3d}   {row['rms']:6.2f}  {row['roll_pitch']:6.2f}    {row['yaw']:6.2f}  {row['tau_yaw']:8.4f}  {row['mass']:9.3f}  {row['cost']:8.1f}  {row['n']:3d}")
    lines.append("")
    lines.append("Paired change against cant 0 on the same airframe and seed (deg, negative = cant helps); airframes feasible at both only:")
    paired = []
    for i, a in enumerate(ALPHAS[1:], 1):
        both = OK[:, i, :] & OK[:, 0, :]
        d = (G[:, i, :] - G[:, 0, :])[both]
        paired.append(dict(alpha=a, mean=float(d.mean()) if d.size else float("nan"), better=int((d < 0).sum()), n=int(d.size), sd=float(d.std(ddof=1)) if d.size > 1 else float("nan")))
        lines.append(f"  cant {a:2d}: mean {paired[-1]['mean']:+.3f}, cant better in {paired[-1]['better']} of {paired[-1]['n']} pairs, SD {paired[-1]['sd']:.3f}")
    lines.append("")
    lines.append("KAPPA SWEEP (3 airframes x 3 seeds): mean combined RMS error (deg) by cant, for the assumed reaction-torque ratio x0.5 and x3 (x1 is the GRID rows for the same airframes: see results.json)")
    ks = {}
    for ki, k in enumerate(kappas):
        blk = kgrid[ki * 3 * len(ALPHAS) * 3:(ki + 1) * 3 * len(ALPHAS) * 3]
        arr = np.array([b["rms"] for b in blk]).reshape(3, len(ALPHAS), 3); okk = np.array([b["ok"] for b in blk]).reshape(3, len(ALPHAS), 3)
        ks[k] = [float(arr[:, i, :][okk[:, i, :]].mean()) if okk[:, i, :].any() else float("nan") for i in range(len(ALPHAS))]
        lines.append(f"  kappa x{k}: " + "  ".join(f"{a}:{v:.2f}" for a, v in zip(ALPHAS, ks[k])))
    lines.append("")
    lines.append(f"JOINT co-design of (L, D, cant, gains), {JOINT_BUDGET} evaluations, held-out {TEST_EP} episodes, 5 seeds")
    for name, rs in (("cant fixed at 0", joint[:5]), ("cant free (0..35 deg)", joint[5:])):
        lines.append(f"  {name:22s} rms {np.mean([r['rms'] for r in rs]):6.2f} (per seed {', '.join(f'{r['rms']:.2f}' for r in rs)}); yaw RMS {np.mean([r['yaw'] for r in rs]):.2f}; "
                     f"chosen cant {', '.join(f'{r['alpha_deg']:.0f}' for r in rs)} deg; mass {np.mean([r['mass'] for r in rs]):.2f} kg, cost {np.mean([r['cost'] for r in rs]):.0f}")
    d = np.array([a["rms"] - b["rms"] for a, b in zip(joint[:5], joint[5:])])
    lines.append(f"  fixed-0 minus free-cant, per seed: {', '.join(f'{x:+.2f}' for x in d)} (positive = free cant better); mean {d.mean():+.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(alphas=list(ALPHAS), summary=summary, paired=paired, kappa={str(k): v for k, v in ks.items()}, joint=joint, L=[R["L"][c] for c in pick], D=[R["D"][c] for c in pick]),
              open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
