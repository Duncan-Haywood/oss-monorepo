"""codesign-agri's three baselines (random search, CMA-ES, GP-EI Bayesian optimisation; budget 40, 20 seeds) on the same 600 fruit with the
stem pull-off median set to 3.17 (measured, bend+pull), 3.5 (codesign-agri's assumed value), 6, 10 and 13.94 N (measured, pull only), and the
grip-force bound at the parent's 8 N or the sourced 10 N limit. A 400-evaluation Bayesian run per cell (5 seeds) gives a reference optimum."""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_agri_pulloff import pulloff as P
O = P.O

MEDIANS = (P.PULL_BEND, P.BASE_MEDIAN, 6.0, 10.0, P.PULL_ONLY)
BOUNDS = (8.0, P.GRIP_LIMIT)
METHODS = {"random search": O.random_search, "CMA-ES": O.cma_es, "Bayesian opt (GP-EI)": O.bayes_opt}
BUDGET, SEEDS, LONG, LONG_SEEDS = 40, 20, 400, 5


def job(a):
    med, fmax, name, seed, budget = a
    P.set_grip_bound(fmax)
    recs = METHODS[name](budget, seed, evaluate=P.make_evaluate(med))
    best = max(recs, key=lambda r: r["J"])
    return dict(med=med, fmax=fmax, name=name, seed=seed, budget=budget, J=best["J"], x=best["x"], good=best["good"], bruised=best["bruised"],
                slipped=best["slipped"], missed=best["missed"], cost=best["cost"])


if __name__ == "__main__":
    jobs = [(m, f, n, s, BUDGET) for m in MEDIANS for f in BOUNDS for n in METHODS for s in range(SEEDS)]
    jobs += [(m, f, "Bayesian opt (GP-EI)", 100 + s, LONG) for m in MEDIANS for f in BOUNDS for s in range(LONG_SEEDS)]
    with Pool() as p:
        out = p.map(job, jobs)
    L = ["Median best J at 40 evaluations over 20 seeds (random | CMA-ES | Bayes), then reference best J of 5 Bayesian runs of 400 evaluations",
         "median pull-off N, grip bound N | random | CMA-ES | Bayes | reference best J (design w,l,E,Fg,n; clean/bruised/slipped/missed; USD)"]
    for f in BOUNDS:
        for m in MEDIANS:
            c = [np.median([r["J"] for r in out if r["med"] == m and r["fmax"] == f and r["name"] == n and r["budget"] == BUDGET]) for n in METHODS]
            ref = max((r for r in out if r["med"] == m and r["fmax"] == f and r["budget"] == LONG), key=lambda r: r["J"])
            L.append(f"{m:5.2f} N, {f:4.1f} N | {c[0]:.3f} | {c[1]:.3f} | {c[2]:.3f} | {ref['J']:.3f} ({', '.join(f'{v:.2f}' for v in ref['x'])}; "
                     f"{ref['good']:.2f}/{ref['bruised']:.2f}/{ref['slipped']:.2f}/{ref['missed']:.2f}; {ref['cost']:.0f})")
    L.append("")
    L.append("Ranking at 40 evaluations (cells where Bayes > CMA-ES > random by median):")
    n_ok = 0
    for f in BOUNDS:
        for m in MEDIANS:
            c = [np.median([r["J"] for r in out if r["med"] == m and r["fmax"] == f and r["name"] == n and r["budget"] == BUDGET]) for n in METHODS]
            ok = c[2] > c[1] > c[0]; n_ok += ok
            L.append(f"  {m:5.2f} N, {f:4.1f} N: {'yes' if ok else 'no'}")
    L.append(f"  {n_ok} of {len(MEDIANS) * len(BOUNDS)}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(L))
