"""Repeat codesign-aero-robust's tuning over independent replicates (new CMA-ES seed, training seed and held-out seed
each time) to put intervals on the airframe ranking. Per replicate and airframe: gains tuned on the nominal and on the
wide randomised plant, scored on held-out nominal and wide plants. Writes results.txt and results.json."""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, ".."))
from codesign_aero_seeds import aero as A
import seeds as S

N, INNER, TRAIN_EP, TEST_EP, REPS = 9, 96, 16, 64, 6
Lm = lambda x: A.L_RANGE[0] + x * (A.L_RANGE[1] - A.L_RANGE[0])
Dm = lambda x: A.D_RANGE[0] + x * (A.D_RANGE[1] - A.D_RANGE[0])


def cells():
    return np.array([(a, b) for a in np.linspace(0, 1, N) for b in np.linspace(0, 1, N) if A.size(Lm(a), Dm(b))["feasible"]])


def ev(xd, gu, plant, seed, ep):
    return A.score(xd, gu, episodes=ep, seed=seed, plant=plant)[0]


def tune(xd, plant, es_seed, train_seed):
    es = cma.CMAEvolutionStrategy([0.5] * 3, 0.25, {"bounds": [0, 1], "seed": es_seed, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < INNER:
        xs = np.array(es.ask()); ys = ev(np.tile(xd, (len(xs), 1)), xs, plant, train_seed, TRAIN_EP); n += len(xs)
        es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best:
            best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    return bx


def replicate(r):
    C = cells(); es_seed, train_seed, test_seed = 8 + 13 * r, 100 + 17 * r, 9999 + 31 * r
    out = {}
    for gk, pl in (("nominal", None), ("wide", "wide")):
        g = [tune(c, pl, es_seed, train_seed) for c in C]
        for pk, pp in (("nominal", None), ("wide", "wide")):
            out[f"{gk}|{pk}"] = (-np.array([ev(C[i:i + 1], g[i][None], pp, test_seed, TEST_EP)[0] for i in range(len(C))])).tolist()
    return out


if __name__ == "__main__":
    C = cells(); M = len(C)
    with Pool(min(REPS, os.cpu_count() or 1)) as p:
        reps = p.map(replicate, range(REPS))
    T = {k: np.array([r[k] for r in reps]) for k in reps[0]}
    lines = []
    P = lambda s="": (lines.append(s), print(s))
    P(f"{REPS} independent replicates (CMA-ES seed, training seed and 64-episode held-out seed all differ); {M} feasible airframes; {INNER} evaluations of {TRAIN_EP} training episodes per tuning")
    P("\nheld-out RMS roll error (deg) of every airframe, mean over replicates; range of the per-replicate median and best:")
    for k, v in T.items():
        P(f"  gains|plant {k:15s} median-cell {np.median(v, 1).mean():5.2f} (replicate range {np.median(v,1).min():.2f}-{np.median(v,1).max():.2f}); best-cell {v.min(1).mean():5.2f} (range {v.min(1).min():.2f}-{v.min(1).max():.2f})")
    P("\nranking reliability: Spearman between pairs of independent replicates (15 pairs):")
    for k, v in T.items():
        s = S.pairwise_spearman(v)
        P(f"  {k:15s} mean {np.mean(s):.2f}, min {min(s):.2f}, max {max(s):.2f}")
    nw = [S.spearman(T["nominal|nominal"][r], T["nominal|wide"][r]) for r in range(REPS)]
    P(f"\nnominal vs wide ranking inside a replicate (nominal-tuned gains): Spearman mean {np.mean(nw):.2f}, range {min(nw):.2f}-{max(nw):.2f}  (codesign-aero-robust's single run: 0.75)")
    P("\nwhich airframe wins (lowest held-out error) per replicate:")
    for k in ("nominal|nominal", "nominal|wide", "wide|wide"):
        wc = S.winner_counts(T[k])
        P(f"  {k:15s} " + "; ".join(f"L {Lm(C[c,0]):.3f} D {Dm(C[c,1]):.3f} x{n}" for c, n in sorted(wc.items(), key=lambda t: -t[1])))
    for k in ("nominal|wide", "wide|wide"):
        t5 = [S.top_set(T[k][r], 5) for r in range(REPS)]
        ov = [len(t5[i] & t5[j]) for i in range(REPS) for j in range(i + 1, REPS)]
        freq = {}
        for t in t5:
            for c in t: freq[c] = freq.get(c, 0) + 1
        always = sum(1 for n in freq.values() if n == REPS)
        P(f"  {k:15s} top-5 overlap between replicate pairs: mean {np.mean(ov):.1f}/5, min {min(ov)}/5; cells in every replicate's top 5: {always}")
    nopt = [int(np.argmin(T["nominal|nominal"][r])) for r in range(REPS)]
    wr = [int(S.ranks(T["wide|wide"][r])[nopt[r]]) + 1 for r in range(REPS)]
    P(f"  rank on the wide plant (wide-tuned gains) of each replicate's own nominal-optimum airframe: {wr} of {M}")
    gain = [float(np.median(T["nominal|wide"][r] - T["wide|wide"][r])) for r in range(REPS)]
    P(f"\nmedian-airframe gain from tuning gains on the wide plant (deg): mean {np.mean(gain):+.2f}, per replicate " + ", ".join(f"{g:+.2f}" for g in gain))
    for k in ("nominal|wide", "wide|wide"):
        ind = S.indistinguishable_from_best(T[k])
        P(f"airframes statistically indistinguishable from the best mean (paired, within 2 SE, n={REPS}), {k}: {len(ind)}/{M}")
    json.dump({"cells": C.tolist(), "L": [Lm(x) for x in C[:, 0]], "D": [Dm(x) for x in C[:, 1]],
               "rms": {k: v.tolist() for k, v in T.items()}}, open(os.path.join(HERE, "results.json"), "w"))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
