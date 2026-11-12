"""Milestone 2b: are the low-cant `prio` designs at lam > 0 local optima of CMA-ES?

In run.py the `prio` cant <= 80 arm split at lam 0.1-1: some seeds kept 31-36 deg of cant, others fell to 0-13 deg with a
held-out score 4-6 deg worse. This reruns the `prio` arms (cant <= 0 and <= 80, lam 0.3 and 1.0) with three CMA-ES starts per
seed, the cant coordinate started at 0.05, 0.4 and 0.8 of the bound (4, 32 and 64 deg), the same budget per start (1920), and
keeps the start with the best TRAINING score; held-out numbers are only computed for that one. The no-cant arm gets the same
three starts, so both arms have three times run.py's budget.  Predictions in ../../LOG.md, written before this was run.
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np
import cma

np.seterr(all="ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run as M          # noqa: E402

STARTS = (0.05, 0.4, 0.8)
ARMS = [("prio", cap, lam) for lam in (0.3, 1.0) for cap in (0, 80)]


def one(args):
    (mix, cap, lam), s, k = args
    cond = M.cond_of(mix, cap, lam)
    x0 = [0.5] * 9; x0[2] = STARTS[k]
    es = cma.CMAEvolutionStrategy(x0, 0.25, {"bounds": [0, 1], "seed": 100 * (s + 1) + k, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < M.BUDGET:
        xs = np.array(es.ask()); ys = M.A.score(xs[:, :3], xs[:, 3:], M.TRAIN_EP, M.TRAIN_SEED + s, **cond)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return (mix, cap, lam), s, k, float(best), bx.tolist()


if __name__ == "__main__":
    jobs = [(a, s, k) for a in ARMS for s in range(M.SEEDS) for k in range(len(STARTS))]
    with Pool() as p:
        res = p.map(one, jobs)
    lines = ["Best of 3 CMA-ES starts (cant started at 4, 32, 64 deg of an 80 deg bound), chosen by training score; mixer prio, TWR 2, held-out 64 episodes",
             "lam  cant  rms deg (per seed)                        J        P_hover W  chosen cant deg     start picked   train J of starts (per seed)"]
    out = []
    for arm in ARMS:
        rows = []
        for s in range(M.SEEDS):
            cand = [r for r in res if r[0] == arm and r[1] == s]
            _, _, k, tb, bx = max(cand, key=lambda r: r[3])
            bx = np.array(bx); cond = M.cond_of(*arm)
            J, sz, ax = M.A.score(bx[None, :3], bx[None, 3:], M.TEST_EP, M.TEST_SEED, per_axis=True, **cond)
            rows.append(dict(mix=arm[0], cap=arm[1], lam=arm[2], seed=s, start=k, J=float(J[0]), rms=float(np.sqrt((ax[0] ** 2).mean())),
                             alpha_deg=float(np.rad2deg(cond["alpha_max"] * np.clip(bx[2], 0, 1))), power=float(sz["power"][0]),
                             train=[round(c[3], 2) for c in sorted(cand, key=lambda r: r[2])]))
        out += rows
        lines.append(f"{arm[2]:3.1f}  {arm[1]:3d}   {np.mean([r['rms'] for r in rows]):6.2f} ({', '.join(f'{r['rms']:.2f}' for r in rows)})  "
                     f"{np.mean([r['J'] for r in rows]):7.2f}  {np.mean([r['power'] for r in rows]):8.0f}   {', '.join(f'{r['alpha_deg']:.0f}' for r in rows):18s}  "
                     f"{', '.join(str(STARTS[r['start']]) for r in rows):13s}  {'; '.join('/'.join(str(v) for v in r['train']) for r in rows)}")
    lines += ["", "Paired by seed: cant <= 80 minus no cant (negative = cant better)"]
    for lam in (0.3, 1.0):
        a = [r for r in out if r["cap"] == 80 and r["lam"] == lam]; b = [r for r in out if r["cap"] == 0 and r["lam"] == lam]
        dr = [x["rms"] - y["rms"] for x, y in zip(a, b)]; dj = [y["J"] - x["J"] for x, y in zip(a, b)]
        lines.append(f"  lam {lam:3.1f}: RMS {np.mean(dr):+.2f} deg (sd {np.std(dr, ddof=1):.2f}, better in {sum(x < 0 for x in dr)} of 5); "
                     f"composite {np.mean(dj):+.2f} (sd {np.std(dj, ddof=1):.2f}, better in {sum(x < 0 for x in dj)} of 5)")
    open(os.path.join(HERE, "restarts.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(HERE, "restarts.json"), "w"), indent=1)
    print("\n".join(lines))
