"""Ranking agreement between cheap and expensive cantilever models.

Reuses the four models of research/simdesign-fidelity (imported by path, not copied).
A design is (L, h, b). Its merit is stiffness per unit mass, F / (tip deflection * mass),
higher is better. A model is useful for search if it orders designs like the 3D reference.
"""
import os, sys
import numpy as np

_FID = os.path.join(os.path.dirname(__file__), "..", "..", "..", "simdesign-fidelity", "src")
sys.path.insert(0, os.path.abspath(_FID))
from simdesign_fidelity.models import Material, beam_eb, beam_timoshenko, fe2d, fe3d  # noqa: E402

F = 100.0
MAT = Material()


def sample_designs(n, seed):
    """n designs, log-uniform: L 20-160 mm, h 4-30 mm, b 5-60 mm, keeping L/h >= 2.

    The L/h floor is needed because simdesign-fidelity reads stress in the slab
    x in [h, 1.6h] from the clamp, which must lie inside the beam.
    """
    r = np.random.default_rng(seed)
    lo, hi = np.log([20, 4, 5]), np.log([160, 30, 60])
    out = np.empty((0, 3))
    while len(out) < n:
        d = np.exp(r.uniform(lo, hi, size=(n, 3)))
        out = np.vstack([out, d[d[:, 0] / d[:, 1] >= 2]])
    return out[:n]


def merit(model, L, h, b):
    d = model(L, h, b)
    return F / d / (MAT.density * L * h * b)


MODELS = {
    "euler": lambda L, h, b: beam_eb(L, h, b, F, MAT)[0],
    "timoshenko": lambda L, h, b: beam_timoshenko(L, h, b, F, MAT)[0],
    "fe2d": lambda L, h, b: fe2d(L, h, b, F, MAT, n=4)[0],
    "fe3d": lambda L, h, b: fe3d(L, h, b, F, MAT, n=2)[0],
}


def kendall_tau(a, b):
    """Kendall tau-a between two score vectors (no ties expected for continuous scores)."""
    a, b = np.asarray(a), np.asarray(b)
    n = len(a)
    s = np.sign(a[:, None] - a[None, :]) * np.sign(b[:, None] - b[None, :])
    return float(s[np.triu_indices(n, 1)].sum() / (n * (n - 1) / 2))


def topk_overlap(a, b, k):
    ta, tb = set(np.argsort(-np.asarray(a))[:k]), set(np.argsort(-np.asarray(b))[:k])
    return len(ta & tb) / k
