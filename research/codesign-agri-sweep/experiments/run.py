"""Sweep the assumed constants of the codesign-agri model over 100 Latin-hypercube worlds. In each world: a
reference optimum (best of 3 CMA-ES runs of 400 evaluations and 2000 random designs), then random search, CMA-ES and
GP-EI Bayesian optimisation at 40 evaluations and 8 seeds each, using the optimisers of codesign-agri unchanged.
Writes results.json (per world) and results.txt (summary)."""
import json, os, sys
from multiprocessing import Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "codesign-agri", "src"))
from codesign_agri_sweep import world as W
from codesign_agri import optimisers as O

N_WORLDS, SEEDS, BUDGET = 100, 8, 40
METHODS = {"random search": O.random_search, "CMA-ES": O.cma_es, "Bayesian opt (GP-EI)": O.bayes_opt}


def one_world(args):
    i, p = args
    ev = W.make_evaluator(p)
    ref = [max(O.random_search(2000, 1000, evaluate=ev), key=lambda r: r["J"])]
    for s in range(3):
        ref.append(max(O.cma_es(400, 2000 + s, evaluate=ev), key=lambda r: r["J"]))
    ref = max(ref, key=lambda r: r["J"])
    out = {"world": i, "params": p, "ref": ref, "final": {}, "first": {}, "bestx": {}}
    for name, f in METHODS.items():
        fin, first, bx = [], [], []
        for s in range(SEEDS):
            rs = f(BUDGET, s, evaluate=ev)
            b = max(rs, key=lambda r: r["J"])
            fin.append(b["J"]); bx.append(b["x"])
            hit = [k + 1 for k, r in enumerate(rs) if r["J"] >= ref["J"] - 0.02]
            first.append(hit[0] if hit else None)
        out["final"][name] = fin; out["first"][name] = first; out["bestx"][name] = bx
    return out


if __name__ == "__main__":
    worlds = W.draw_worlds(N_WORLDS, seed=0)
    nominal = one_world((-1, W.NOMINAL))
    with Pool(4) as pool:
        res = pool.map(one_world, list(enumerate(worlds)), chunksize=1)
    json.dump({"nominal": nominal, "worlds": res}, open(os.path.join(HERE, "results.json"), "w"))
    print("done", len(res))
