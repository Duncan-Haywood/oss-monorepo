"""Local-optimum noise check. The parent run (run.py) left 7 of 25 designs in poor local optima at 3200 evaluations, so its cant-vs-no-cant J comparison was weak (3-4 of 5 seeds).
Here each seed gets the same 3200-evaluation CMA-ES run, then RESTARTS (sigma 0.1, popsize 16) from its best point for 3200 more, and the same is done for 8 seeds instead of 5.
Held-out 64 wide-plant episodes, physical (coupled) model. Reports J, pos, yaw per bound, paired by seed against bound 0. No LLM is used."""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_cant_poshold import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
BUDGET, SEEDS, BOUNDS = 3200, 8, (0, 35, 80)


def run_es(x0, sigma, seed, am, s):
    es = cma.CMAEvolutionStrategy(list(x0), sigma, {"bounds": [0, 1], "seed": seed, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = A.score_pos(xs[:, :3], xs[:, 3:], TRAIN_EP, TRAIN_SEED + s, alpha_max=am, couple=True)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return best, bx


def held(bx, am):
    J, sz, pos, yaw = A.score_pos(bx[None, :3], bx[None, 3:], TEST_EP, TEST_SEED, alpha_max=am, couple=True, parts=True)
    return dict(J=float(-J[0]), pos=float(pos[0]), yaw=float(yaw[0]), ok=bool(sz["feasible"][0]), alpha_deg=float(np.rad2deg(am * bx[2])))


def cell(args):
    cap, s = args
    am = np.deg2rad(max(cap, 1e-9))
    b1, x1 = run_es([0.5] * 12, 0.25, s + 1, am, s)
    b2, x2 = run_es(x1, 0.1, s + 101, am, s)
    if b2 < b1: x2 = x1
    return dict(cap=cap, seed=s, first=held(x1, am), restarted=held(x2, am))


if __name__ == "__main__":
    with Pool() as p:
        out = p.map(cell, [(c, s) for c in BOUNDS for s in range(SEEDS)])
    L = [f"Restart check: {BUDGET}+{BUDGET} evaluations, {SEEDS} seeds, held-out {TEST_EP} episodes, physical model. J = sqrt((pos/{A.POS_SCALE_M} m)^2+(yaw/{A.YAW_SCALE_DEG} deg)^2)", ""]
    for stage in ("first", "restarted"):
        L.append(f"[{stage}]  bound  meanJ  medianJ  worst J  pos m  yaw deg   J per seed")
        for c in BOUNDS:
            r = [o[stage] for o in out if o["cap"] == c]
            Js = [x["J"] for x in r]
            L.append(f"        {c:4d}  {np.mean(Js):5.2f}  {np.median(Js):6.2f}  {max(Js):6.2f}  {np.mean([x['pos'] for x in r]):.3f}  {np.mean([x['yaw'] for x in r]):6.2f}   " + ", ".join(f"{v:.2f}" for v in Js))
        L.append("")
        base = {o["seed"]: o[stage] for o in out if o["cap"] == 0}
        for c in BOUNDS[1:]:
            for k in ("J", "pos", "yaw"):
                d = [o[stage][k] - base[o["seed"]][k] for o in out if o["cap"] == c]
                L.append(f"  {stage} bound {c} minus bound 0, {k}: mean {np.mean(d):+.3f}, better in {sum(x < 0 for x in d)} of {len(d)}")
        L.append("")
    open(os.path.join(HERE, "results_restart.txt"), "w").write("\n".join(L) + "\n")
    json.dump(out, open(os.path.join(HERE, "results_restart.json"), "w"))
    print("\n".join(L))
