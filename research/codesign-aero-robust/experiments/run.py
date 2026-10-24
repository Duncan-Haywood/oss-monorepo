"""Does the airframe ranking of codesign-aero survive widened plant randomisation? Grid of airframes, each with gains tuned
(a) on the nominal plant, (b) on the narrow and (c) on the wide randomised plant; every cell then scored on a held-out
nominal, narrow and wide plant. Writes results.txt and results.json."""
import json, os, sys, warnings
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_robust import aero as A

N, INNER, TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 9, 96, 16, 64, 100, 9999


def ev(xd, gu, plant, seed, ep):
    return A.score(xd, gu, episodes=ep, seed=seed, plant=plant)[0]


def tune(xd, plant, seed=7):
    es = cma.CMAEvolutionStrategy([0.5] * 3, 0.25, {"bounds": [0, 1], "seed": seed + 1, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < INNER:
        xs = np.array(es.ask()); ys = ev(np.tile(xd, (len(xs), 1)), xs, plant, TRAIN_SEED, TRAIN_EP); n += len(xs)
        es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best:
            best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return bx


def ranks(v):
    r = np.empty(len(v)); r[np.argsort(v)] = np.arange(len(v)); return r


def spearman(a, b):
    return float(np.corrcoef(ranks(a), ranks(b))[0, 1])


if __name__ == "__main__":
    lines, R = [], {}
    P = lambda s="": (lines.append(s), print(s))
    Lm = lambda x: A.L_RANGE[0] + x * (A.L_RANGE[1] - A.L_RANGE[0]); Dm = lambda x: A.D_RANGE[0] + x * (A.D_RANGE[1] - A.D_RANGE[0])
    cells, tuned = [], {"nominal": [], "narrow": [], "wide": []}
    for a in np.linspace(0, 1, N):
        for b in np.linspace(0, 1, N):
            if A.size(Lm(a), Dm(b))["feasible"]:
                cells.append((a, b))
                for k, pl in (("nominal", None), ("narrow", "narrow"), ("wide", "wide")):
                    tuned[k].append(tune(np.array([a, b]), pl))
    C = np.array(cells); M = len(C)
    # held-out RMS error (deg, lower better) of every cell, for each gain set, on each plant
    T = {}
    for gk in tuned:
        for pk, pl in (("nominal", None), ("narrow", "narrow"), ("wide", "wide")):
            T[(gk, pk)] = -np.array([ev(C[i:i + 1], tuned[gk][i][None], pl, TEST_SEED, TEST_EP)[0] for i in range(M)])
    P(f"{M} feasible airframes on a {N}x{N} grid; gains tuned per cell by CMA-ES, {INNER} evaluations of {TRAIN_EP} training episodes; held-out 64 episodes (different seed)")
    P("plant multipliers drawn uniformly per episode (assumed): " + "; ".join(f"{k}: " + ", ".join(f"{q} {lo}-{hi}" for q, (lo, hi) in v.items()) for k, v in A.PLANT_RANGES.items()))
    P("\\nmedian / best held-out RMS roll error (deg), rows = gains tuned on, columns = evaluated on:")
    for gk in tuned:
        P(f"  tuned on {gk:8s} " + "  ".join(f"{pk}: med {np.median(T[(gk, pk)]):5.2f} best {T[(gk, pk)].min():5.2f}" for pk in ("nominal", "narrow", "wide")))
    P("\\nairframe ranking, nominal-tuned gains (the codesign-aero pipeline):")
    base = T[("nominal", "nominal")]
    for pk in ("narrow", "wide"):
        v = T[("nominal", pk)]
        top = lambda x, k: set(np.argsort(x)[:k])
        nb, vb = int(np.argmin(base)), int(np.argmin(v))
        P(f"  nominal vs {pk}: Spearman {spearman(base, v):.2f}; nominal optimum (L {Lm(C[nb,0]):.3f}, D {Dm(C[nb,1]):.3f}) scores {v[nb]:.2f} on {pk} vs {v.min():.2f} for the {pk} optimum (regret {v[nb]-v.min():+.2f} deg, rank {int(ranks(v)[nb])+1}/{M}); top-5 overlap {len(top(base,5)&top(v,5))}/5")
    P("\\nrobust tuning (gains tuned on the wide plant), evaluated on the wide plant:")
    w, wn = T[("wide", "wide")], T[("nominal", "wide")]
    nb, wb = int(np.argmin(T[("nominal", "nominal")])), int(np.argmin(w))
    P(f"  wide optimum: L {Lm(C[wb,0]):.3f}, D {Dm(C[wb,1]):.3f}, {w[wb]:.2f} deg; nominal-pipeline optimum airframe with wide-tuned gains {w[nb]:.2f} deg (rank {int(ranks(w)[nb])+1}/{M})")
    P(f"  gain from tuning on the wide plant, median over cells: {np.median(wn - w):+.2f} deg; cells where it helps by >0.5 deg: {np.mean((wn - w) > 0.5):.2f}")
    P(f"  Spearman of wide-tuned vs nominal-tuned rankings on the wide plant: {spearman(w, wn):.2f}")
    P(f"  cells above 20 deg RMS on the wide plant: nominal-tuned {int(np.sum(wn > 20))}/{M}, wide-tuned {int(np.sum(w > 20))}/{M}")
    R = {"cells": C.tolist(), "L": [Lm(x) for x in C[:, 0]], "D": [Dm(x) for x in C[:, 1]],
         "rms": {f"{g}|{p}": T[(g, p)].tolist() for (g, p) in T}, "spearman_nominal_vs_wide": spearman(base, T[("nominal", "wide")]),
         "spearman_nominal_vs_narrow": spearman(base, T[("nominal", "narrow")])}
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines).replace("\\n", "\n") + "\n")
    json.dump(R, open(os.path.join(HERE, "results.json"), "w"))
