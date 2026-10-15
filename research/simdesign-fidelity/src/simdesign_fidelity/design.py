"""Minimum-mass sizing of the cantilever depth h at fixed L, b, F under a tip-deflection and a
top-fibre stress limit, using any of the models. Mass is rho * L * h * b, so the lightest
feasible design is the smallest h that satisfies both limits; the response of every model is
monotone decreasing in h, so a damped power-law fixed point finds each limit's h."""
import numpy as np
from .models import Material, MODELS


def _fixed_point(f, limit, h0, expo, tol=2e-3, iters=12):
    h = h0
    for _ in range(iters):
        v = f(h)
        hn = h * (v / limit) ** (1.0 / expo)
        if abs(hn - h) < tol * h:
            return hn
        h = hn
    return h


def size_h(model, case, delta_max, mat=Material(), n=None):
    """Return (h, h_from_deflection, h_from_stress, n_solves)."""
    calls = [0]

    def resp(i):
        def g(h):
            calls[0] += 1
            return MODELS[model](case.L, h, case.b, case.F, mat, n)[i]
        return g
    h_d = _fixed_point(resp(0), delta_max, 10.0, 3.0)
    h_s = _fixed_point(resp(1), mat.sigma_allow, 10.0, 2.0)
    return max(h_d, h_s), h_d, h_s, calls[0]


def evaluate_design(h, case, delta_max, mat=Material(), truth="fe3d", n=None):
    """Judge a depth h with the reference model: constraint utilisations (>1 = violated)."""
    d, s = MODELS[truth](case.L, h, case.b, case.F, mat, n)
    return {"defl_util": d / delta_max, "stress_util": s / mat.sigma_allow,
            "mass_g": mat.density * case.L * h * case.b}
