"""Equal-budget comparison: random search, CMA-ES and GP-EI Bayesian optimisation (20 seeds each) against the
session agent's 4 rounds x 10 proposals (proposals/round*.json). Writes results.txt and results.json."""
import glob, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_sar import optimisers as O

BUDGET, SEEDS = 40, 20
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
    lines = [f"Best objective J after n simulator evaluations (budget {BUDGET}); J = distance/20 m - 0.05 falls - 0.02 recoveries - 0.002 J/m, designs over the 120 USD cap score -1.",
             f"Baselines: median [min, max] over {SEEDS} seeds. Session agent: one run of 4 rounds x 10.", "",
             "method | " + " | ".join(f"n={n}" for n in POINTS)]
    for n, cs in curves.items():
        c = np.array(cs)
        if len(c) > 1:
            cells = [f"{np.median(c[:, i]):.3f} [{c[:, i].min():.3f}, {c[:, i].max():.3f}]" for i in range(len(POINTS))]
        else:
            cells = [f"{c[0, i]:.3f}" for i in range(len(POINTS))]
        lines.append(f"{n} | " + " | ".join(cells))
    ab = max(r["J"] for r in agent)
    lines += ["", f"At n=40, seeds that matched or beat the agent's best (J = {ab:.3f}):"]
    for n in METHODS:
        c = np.array(curves[n])
        lines.append(f"{n}: {(c[:, -1] >= ab - 1e-9).sum()} of {SEEDS}")
    lines += ["", "Evaluations to first reach J >= 0.78 (median over seeds that reach it; seeds that never do in brackets):"]
    for n in METHODS:
        first = []
        for nn, s, rs in out:
            if nn != n: continue
            hit = [i + 1 for i, r in enumerate(rs) if r["J"] >= 0.78]
            first.append(hit[0] if hit else None)
        got = [f for f in first if f]
        lines.append(f"{n}: {np.median(got) if got else 'never'} ({first.count(None)} of {SEEDS} never)")
    ag = [i + 1 for i, r in enumerate(agent) if r["J"] >= 0.78]
    lines.append(f"session agent: {ag[0] if ag else 'never'}")
    lines += ["", "Fraction of evaluations over the cost cap:"]
    for n in METHODS:
        rs = [r for nn, s, x in out if nn == n for r in x]
        lines.append(f"{n}: {np.mean([not r['feasible'] for r in rs]):.3f}")
    lines.append(f"session agent: {np.mean([not r['feasible'] for r in agent]):.3f}")
    allrecs = [r for _, _, rs in out for r in rs] + agent
    best = max((r for r in allrecs if r["feasible"]), key=lambda r: (r["J"], -r["cost"]))
    lines += ["", f"Best design seen in any run (cheapest at the top J): x = {[round(v, 2) for v in best['x']]} (R mm, L mm, F mm, T N m, B Wh), "
              f"J = {best['J']:.3f}, cost {best['cost']:.0f} USD, mass {best['mass']:.2f} kg, distance {best['distance_m']:.1f} m of 20"]
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"curves": curves, "agent": agent, "best": best,
               "baseline_evals": {n: [x for nn, s, x in out if nn == n] for n in METHODS}},
              open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
