"""Does a zero-initialised residual network on top of the tuned PID (a linear skip path) get below the PID error floor on the wide randomised plant?
Six airframes, 3 seeds. Arms at equal total evaluations (576): pid576 (CMA-ES on 3 gains), skip576 (PID tuned at 96, then 480 evaluations on a 31-parameter residual
starting at zero). Also pid96 (the PID the skip arm starts from). Scored on 64 held-out wide-plant episodes."""
import json, os, sys, warnings
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_skip import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED, SEEDS = 16, 64, 100, 9999, 3
ROBUST = os.path.join(HERE, "..", "..", "codesign-aero-robust", "experiments", "results.json")


def tune(xd, ctrl, budget, seed, pop=16, base=None, sigma=0.25):
    """CMA-ES on unit parameters. ctrl 'pid' -> 3 gains; 'skip' -> residual network (31) on top of base PID unit gains (3)."""
    dim = 3 if ctrl == "pid" else A.NP
    x0 = 0.5 if ctrl == "skip" else 0.5
    es = cma.CMAEvolutionStrategy([x0] * dim, sigma, {"bounds": [0, 1], "seed": seed + 1, "popsize": pop, "verbose": -9})
    wrap = (lambda xs: xs) if ctrl == "pid" else (lambda xs: np.concatenate([np.tile(base, (len(xs), 1)), xs], axis=1))
    best, bx, n = -1e9, None, 0
    if ctrl == "skip":      # the zero residual is the incumbent, so the result is never worse than the PID on the training episodes
        z = np.full((1, dim), 0.5)
        best = A.score(xd[None], wrap(z), TRAIN_EP, TRAIN_SEED + seed, plant="wide", ctrl=ctrl)[0][0]; bx = z[0]
    while n < budget:
        xs = np.array(es.ask())
        ys = A.score(np.tile(xd, (len(xs), 1)), wrap(xs), TRAIN_EP, TRAIN_SEED + seed, plant="wide", ctrl=ctrl)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best:
            best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return bx


def test(xd, g, ctrl):
    return -A.score(xd[None], g[None], TEST_EP, TEST_SEED, plant="wide", ctrl=ctrl)[0][0]


if __name__ == "__main__":
    R = json.load(open(ROBUST))
    w = np.array(R["rms"]["wide|wide"]); order = np.argsort(w)
    pick = [int(order[i]) for i in (0, 9, 19, 29, 39, 49)]
    names = ["pid96", "pid576", "skip576"]
    res = {a: np.zeros((len(pick), SEEDS)) for a in names}
    resid = np.zeros((len(pick), SEEDS))      # max |residual parameter| (unit offset from 0.5) kept by the skip arm; 0 = fell back to the PID
    for j, c in enumerate(pick):
        xd = np.array(R["cells"][c])
        for s in range(SEEDS):
            g96 = tune(xd, "pid", 96, s)
            res["pid96"][j, s] = test(xd, g96, "pid")
            res["pid576"][j, s] = test(xd, tune(xd, "pid", 576, s), "pid")
            r = tune(xd, "skip", 480, s, base=g96, sigma=0.1)
            res["skip576"][j, s] = test(xd, np.concatenate([g96, r]), "skip")
            resid[j, s] = np.abs(r - 0.5).max()
        print("airframe", j, flush=True)
    L = [R["L"][c] for c in pick]; D = [R["D"][c] for c in pick]
    lines = [f"6 airframes at wide-tuned PID rank 1,10,20,30,40,50 of 50 in codesign-aero-robust; {SEEDS} CMA-ES seeds each; skip = tuned PID + zero-initialised {A.NP}-parameter residual MLP ({A.H} tanh units, parameter scale {A.RSCALE}); train {TRAIN_EP} wide-plant episodes, held-out {TEST_EP} (different seed)",
             "held-out RMS roll error (deg), mean (min-max) over seeds:"]
    for j in range(len(pick)):
        lines.append(f"  L {L[j]:.3f} D {D[j]:.3f} (robust-study rank {[1,10,20,30,40,50][j]}): " + "  ".join(
            f"{a} {res[a][j].mean():5.2f} ({res[a][j].min():5.2f}-{res[a][j].max():5.2f})" for a in names))
    for a in names:
        lines.append(f"{a}: mean over airframes {res[a].mean():.3f}; best airframe by seed-mean = index {int(np.argmin(res[a].mean(1)))}")
    d = res["pid576"] - res["skip576"]
    lines.append("pid576 minus skip576 per airframe, mean over seeds (positive = skip better): " + " ".join(f"{x:+.3f}" for x in d.mean(1)))
    lines.append(f"pid576 minus skip576 over all {d.size} airframe-seed pairs: mean {d.mean():+.3f}, skip better in {int((d > 0).sum())}, worse in {int((d < 0).sum())}")
    d2 = res["pid96"] - res["skip576"]
    lines.append(f"pid96 minus skip576 over all pairs: mean {d2.mean():+.3f}, skip better in {int((d2 > 0).sum())} of {d2.size}")
    lines.append(f"skip arms that kept a nonzero residual: {int((resid > 0).sum())} of {resid.size}; largest kept offset {resid.max():.3f} (unit scale, 0.5 = full range)")
    def sp(a, b):
        ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b)); return float(np.corrcoef(ra, rb)[0, 1])
    lines.append(f"Spearman of airframe means, pid576 vs skip576: {sp(res['pid576'].mean(1), res['skip576'].mean(1)):.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"L": L, "D": D, "res": {k: v.tolist() for k, v in res.items()}, "resid": resid.tolist()}, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
