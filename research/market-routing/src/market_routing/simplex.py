"""Simplex helpers (pure stdlib)."""
import math


def softmax(z):
    m = max(z)
    e = [math.exp(v - m) for v in z]
    s = sum(e)
    return [v / s for v in e]


def project_simplex(v):
    """Euclidean projection of ``v`` onto the probability simplex.

    Sort-based algorithm of Held et al. / Duchi et al. (2008). The result is
    the "sparsemax" of Martins & Astudillo (2016): it contains exact zeros.
    """
    n = len(v)
    u = sorted(v, reverse=True)
    css = 0.0
    theta = 0.0
    for k in range(1, n + 1):
        css += u[k - 1]
        t = (css - 1.0) / k
        if u[k - 1] - t > 0:
            theta = t
    return [max(x - theta, 0.0) for x in v]
