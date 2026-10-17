"""Bracket sizing problem, reusing the finite-element model of ../simdesign-bracket.

Minimise mass over (w, r, b) subject to a peak-stress and a tip-deflection limit. The limits here are
tighter than in simdesign-bracket, so that its published optimum is not the answer.
"""
import os, sys
import numpy as np

_BR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "simdesign-bracket", "src")
if _BR not in sys.path:
    sys.path.insert(0, _BR)
from simdesign_bracket import Params, Material, solve, mass_g  # noqa: E402

LB = np.array([3.0, 0.0, 4.0])    # w, r, b (mm)
UB = np.array([25.0, 15.0, 30.0])


class Problem:
    """Counts every FE evaluation. `evaluate(x)` returns a dict with mass, stress, tip, violation, feasible."""

    def __init__(self, sigma_allow=15.0, delta_max=2.5, mesh_h=1.5, F=100.0):
        self.mat = Material(sigma_allow=sigma_allow)
        self.delta_max, self.mesh_h, self.F = delta_max, mesh_h, F
        self.n_evals = 0

    def evaluate(self, x):
        x = np.clip(np.asarray(x, float), LB, UB)
        p = Params(w=float(x[0]), r=float(x[1]), b=float(x[2]), F=self.F)
        self.n_evals += 1
        m = mass_g(p, self.mat)
        s = solve(p, self.mat, self.mesh_h)
        viol = max(0.0, s["max_vm_mpa"] / self.mat.sigma_allow - 1) + max(0.0, s["tip_deflection_mm"] / self.delta_max - 1)
        return {"x": [float(v) for v in x], "mass_g": m, "stress_mpa": s["max_vm_mpa"],
                "tip_mm": s["tip_deflection_mm"], "violation": viol, "feasible": viol <= 0.0}

    @staticmethod
    def penalised(r):
        """Scalar objective used by the model-based optimisers: mass inflated by constraint violation."""
        return r["mass_g"] * (1 + 20 * r["violation"]) + (1000 * r["violation"] if r["violation"] > 0 else 0.0)
