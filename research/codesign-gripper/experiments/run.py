"""Equal-budget comparison: random search, CMA-ES and GP-EI Bayesian optimisation (10 seeds each) against the
session agent's 4 rounds x 10 proposals (proposals/round*.json). Writes results.txt and results.json."""
import glob, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_gripper import optimisers as O

BUDGET, SEEDS = 40, 10
POINTS = (10, 20, 30, 40)
METHODS = {"random search": O.random_search, "CMA-ES": O.cma_es, "Bayesian opt (GP-EI)": O.bayes_opt}


def job(a):
    name, seed = a
    return name, seed, METHODS[name](BUDGET, seed)


if __name__ == "__main__":
    with Pool(4) as p:
        out = p.map(job, [(n, s) for n in METHODS for s in range(SEEDS)])
    agent = O.score_proposals(sorted(glob.glob(os.path.join(HERE, "..", "proposals", "round*.json"))))
    curves = {n: [O.best_curve(r, POINTS) for nn, s, r in out if nn == n] for n in METHODS}
    curves["session agent"] = [O.best_curve(agent, POINTS)]
    lines = [f"Best objective J = success rate - 0.01 x plastic grams, after n simulator evaluations (budget {BUDGET}).",
             f"Baselines: median [min, max] over {SEEDS} seeds. Session agent: one run of 4 rounds x 10.", "",
             "method | " + " | ".join(f"n={n}" for n in POINTS)]
    for n, cs in curves.items():
        c = np.array(cs)
        if len(c) > 1:
            cells = [f"{np.median(c[:, i]):.3f} [{c[:, i].min():.3f}, {c[:, i].max():.3f}]" for i in range(len(POINTS))]
        else:
            cells = [f"{c[0, i]:.3f}" for i in range(len(POINTS))]
        lines.append(f"{n} | " + " | ".join(cells))
    lines += ["", "At n=40, seeds that matched or beat the agent's best:"]
    ab = max(r["J"] for r in agent)
    for n in METHODS:
        c = np.array(curves[n])
        lines.append(f"{n}: {(c[:, -1] >= ab - 1e-9).sum()} of {SEEDS}  (agent best J = {ab:.3f})")
    allrecs = [r for _, _, rs in out for r in rs] + agent
    lines += ["", "Fraction of evaluations holding all 8 objects (success = 1.0):"]
    for n in METHODS:
        rs = [r for nn, s, x in out if nn == n for r in x]
        lines.append(f"{n}: {np.mean([r['success'] >= 1 for r in rs]):.3f}")
    lines.append(f"session agent: {np.mean([r['success'] >= 1 for r in agent]):.3f}")
    best = max(allrecs, key=lambda r: r["J"])
    lines += ["", f"Best design seen in any run: x = {[round(v, 2) for v in best['x']]} (L, t, w, a), J = {best['J']:.3f}, "
              f"plastic {best['plastic_g']:.2f} g, force {best['force_N']:.1f} N"]
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"curves": curves, "agent": agent, "best": best,
               "baseline_evals": {n: [x for nn, s, x in out if nn == n] for n in METHODS}},
              open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
