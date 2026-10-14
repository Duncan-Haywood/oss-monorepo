"""Minimum-mass design under a process's rules. Differential evolution (SciPy) with a penalty."""
from dataclasses import dataclass
import numpy as np
from scipy.optimize import differential_evolution
from .model import Params
from .dfm import Process, BOUNDS, evaluate

PENALTY = 1000.0  # grams per unit relative violation
BARRIER = 500.0   # grams added to any infeasible design, so a feasible one always beats it


def _search(proc: Process, b_fixed, seed: int, popsize: int, maxiter: int, h: float, measure: str):
    n_fe = [0]
    bounds = [BOUNDS["w"], BOUNDS["r"]] + ([] if b_fixed is not None else [(BOUNDS["b"][0], min(BOUNDS["b"][1], proc.b_max))])

    def f(x):
        b = b_fixed if b_fixed is not None else x[2]
        p = Params(w=float(x[0]), r=float(x[1]), b=float(b))
        e = evaluate(proc, p, h=h, measure=measure)
        if e["fe"] is not None:
            n_fe[0] += 1
        return e["mass_g"] + (0.0 if e["feasible"] else BARRIER + PENALTY * e["penalty"])

    res = differential_evolution(f, bounds, seed=seed, popsize=popsize, maxiter=maxiter, tol=1e-6,
                                 polish=False, init="sobol", updating="immediate")
    b = b_fixed if b_fixed is not None else res.x[2]
    return Params(w=float(res.x[0]), r=float(res.x[1]), b=float(b)), n_fe[0]


def optimise(proc: Process, seed: int = 0, popsize: int = 8, maxiter: int = 25, h: float = 2.5, measure: str = "peak") -> dict:
    """Search all allowed depths (stock list) or a continuous depth. Returns the best design found."""
    best = None
    n_fe = 0
    depths = [s for s in proc.b_stock if s <= proc.b_max] or [None]
    for b in depths:
        p, n = _search(proc, b, seed, popsize if b is None else max(4, popsize // 2), maxiter if b is None else maxiter // 2 + 5, h, measure)
        n_fe += n
        e = evaluate(proc, p, h=h, measure=measure)
        if e["feasible"] and (best is None or e["mass_g"] < best[1]["mass_g"]):
            best = (p, e)
    if best is None:
        return {"process": proc.name, "feasible": False, "n_fe": n_fe}
    p, e = best
    return {"process": proc.name, "feasible": True, "params": p, "mass_g": e["mass_g"],
            "stress_mpa": e["fe"]["max_vm_mpa"], "peak_mpa": e["fe"]["peak_mpa"], "tip_mm": e["fe"]["tip_deflection_mm"], "n_fe": n_fe}
