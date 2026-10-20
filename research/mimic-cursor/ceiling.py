"""Is the imitator limited by its search budget or by its component library?

A (1+4) evolution strategy with a far larger budget than the game (GENS
generations x 4 candidates) minimises the cross-validated AUROC of a logistic
regression on *every* feature function (a classifier two-sample test), under
the same copy rule. Writes results/ceiling.json with the reference AUROC of
the best generator from each restart.

Usage: python3 ceiling.py [generations] [restarts]
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import run  # first: sets one thread per process

import numpy as np  # noqa: E402

import game as G  # noqa: E402
import programs as P  # noqa: E402


def one(args):
    restart, gens = args
    pool, test, copyref = run.split()
    P.set_human(pool)
    run.setup_copy(pool, copyref)
    ref, tst = run.fixed_sets(pool, test)
    fref, ftst = P.features(ref), P.features(tst)
    rng = np.random.default_rng(500 + restart)
    ctx = [pool[i] for i in rng.choice(len(pool), 400, replace=False)]
    fh = P.features(ctx)

    def fitness(genome, seed):
        strokes = G.imitate(genome, ctx, seed)
        if G.copy_rate(strokes) > G.MAX_COPY:
            return 2.0
        return G.cv_auroc(P.GROUPS, fh, P.features(strokes), np.random.default_rng(seed))

    cur, trace = P.NAIVE, []
    cur_f = fitness(cur, 0)
    genes = list(P.GENES)
    for gen in range(1, gens + 1):
        cands = [P.mutate(cur, genes[rng.integers(len(genes))], rng) for _ in range(G.BUDGET)]
        fs = [fitness(c, gen) for c in cands]
        cur_f = fitness(cur, gen)  # re-score the incumbent on the same seed
        k = int(np.argmin(fs))
        if fs[k] < cur_f:
            cur, cur_f = cands[k], fs[k]
        if gen % 25 == 0:
            trace.append({"generation": gen, "train_c2st": cur_f})
            print(f"restart {restart} gen {gen}: c2st {cur_f:.3f}", flush=True)
    refa, _ = run.reference_auroc(cur, ref, tst, fref, ftst)
    cr = G.copy_rate(G.imitate(cur, tst, 202))
    return {"restart": restart, "evaluations": gens * (G.BUDGET + 1), "reference": refa,
            "copy_rate": cr, "trace": trace, "genome": cur}


if __name__ == "__main__":
    gens = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    restarts = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    with ProcessPoolExecutor(min(restarts, 4)) as ex:
        out = list(ex.map(one, [(r, gens) for r in range(restarts)]))
    with open(os.path.join(run.RES, "ceiling.json"), "w") as f:
        json.dump(out, f, indent=1)
    for o in out:
        print(f"restart {o['restart']}: reference {o['reference']:.3f}, copy {o['copy_rate']:.3f}")
