"""Does a 31-parameter neural roll controller trained by CMA-ES beat the 3-gain PID on the wide randomised plant, and does it
change which airframe is best? Six airframes spanning the wide-tuned ranking of codesign-aero-robust; per airframe and seed:
PID (96 evaluations), MLP at the same 96 evaluations, MLP at 960 evaluations; scored on 64 held-out wide-plant episodes."""
import json, os, sys, warnings
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_mlp import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED, SEEDS = 16, 64, 100, 9999, 3
ROBUST = os.path.join(HERE, "..", "..", "codesign-aero-robust", "experiments", "results.json")


def tune(xd, ctrl, budget, seed, pop=16):
    dim = 3 if ctrl == "pid" else A.NP
    es = cma.CMAEvolutionStrategy([0.5] * dim, 0.25, {"bounds": [0, 1], "seed": seed + 1, "popsize": pop, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < budget:
        xs = np.array(es.ask())
        ys = A.score(np.tile(xd, (len(xs), 1)), xs, TRAIN_EP, TRAIN_SEED + seed, plant="wide", ctrl=ctrl)[0]
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
    arms = [("pid96", "pid", 96), ("mlp96", "mlp", 96), ("mlp960", "mlp", 960)]
    res = {a: np.zeros((len(pick), SEEDS)) for a, _, _ in arms}
    for j, c in enumerate(pick):
        xd = np.array(R["cells"][c])
        for s in range(SEEDS):
            for name, ctrl, b in arms:
                res[name][j, s] = test(xd, tune(xd, ctrl, b, s), ctrl)
        print("airframe", j, flush=True)
    L = [R["L"][c] for c in pick]; D = [R["D"][c] for c in pick]
    lines = [f"6 airframes at wide-tuned PID rank 1,10,20,30,40,50 of 50 in codesign-aero-robust; {SEEDS} CMA-ES seeds each; {A.NP}-parameter MLP ({A.H} tanh units) vs 3-gain PID; train {TRAIN_EP} wide-plant episodes, held-out {TEST_EP} (different seed)",
             "held-out RMS roll error (deg), mean (min-max) over seeds; PID/MLP trained on the wide randomised plant:"]
    for j in range(len(pick)):
        lines.append(f"  L {L[j]:.3f} D {D[j]:.3f} (robust-study rank {[1,10,20,30,40,50][j]}): " + "  ".join(
            f"{a} {res[a][j].mean():5.2f} ({res[a][j].min():5.2f}-{res[a][j].max():5.2f})" for a, _, _ in arms))
    for a, _, _ in arms:
        lines.append(f"{a}: mean over airframes {res[a].mean():.2f}; best airframe by seed-mean = index {int(np.argmin(res[a].mean(1)))}")
    d = (res["pid96"] - res["mlp960"]).mean(1)
    lines.append("PID96 minus MLP960 per airframe (positive = MLP better): " + " ".join(f"{x:+.2f}" for x in d))
    d2 = (res["pid96"] - res["mlp96"]).mean(1)
    lines.append("PID96 minus MLP96 per airframe (equal evaluations): " + " ".join(f"{x:+.2f}" for x in d2))
    def sp(a, b):
        ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b)); return float(np.corrcoef(ra, rb)[0, 1])
    lines.append(f"Spearman of airframe means, PID96 vs MLP960: {sp(res['pid96'].mean(1), res['mlp960'].mean(1)):.2f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"L": L, "D": D, "res": {k: v.tolist() for k, v in res.items()}}, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
