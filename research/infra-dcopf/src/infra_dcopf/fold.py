"""Fold (saddle-node) diagnostics for the AC power flow (research/grid-linopf, LOG.md 2026-11-14).

newton_jacobian(res): PYPOWER's Newton Jacobian at a power-flow solution, the derivative of the
mismatch (P at PV and PQ buses, Q at PQ buses; per unit) with respect to (angles at PV and PQ buses,
|V| at PQ buses), with Q limits not enforced (as every power flow in this project).
sigma_min(J): its smallest singular value, by inverse power iteration on J^T J with one sparse LU.
At a saddle-node bifurcation of the load-scaled power flow the Jacobian is singular and, along the
path, sigma_min^2 falls linearly in the load scale (Dobson 1992; Canizares 2002), which fold_fit uses.
"""
import numpy as np
from scipy.sparse import csc_matrix, hstack, vstack
from scipy.sparse.linalg import splu
from pypower.api import makeYbus
from pypower.bustypes import bustypes
from pypower.dSbus_dV import dSbus_dV
from pypower.idx_brch import F_BUS, T_BUS
from pypower.idx_bus import BUS_I, VA, VM
from pypower.idx_gen import GEN_BUS


def newton_jacobian(res):
    bus, br, gen = res["bus"].copy(), res["branch"].copy(), res["gen"].copy()
    nb = bus.shape[0]
    row = {int(b): i for i, b in enumerate(bus[:, BUS_I])}
    bus[:, BUS_I] = np.arange(nb)
    br[:, F_BUS] = [row[int(b)] for b in br[:, F_BUS]]
    br[:, T_BUS] = [row[int(b)] for b in br[:, T_BUS]]
    gen[:, GEN_BUS] = [row[int(b)] for b in gen[:, GEN_BUS]]
    Ybus, _, _ = makeYbus(res["baseMVA"], bus, br)
    V = bus[:, VM] * np.exp(1j * np.deg2rad(bus[:, VA]))
    _, pv, pq = bustypes(bus, gen)
    pvpq = np.r_[pv, pq]
    dVm, dVa = dSbus_dV(Ybus, V)
    dVm, dVa = csc_matrix(dVm), csc_matrix(dVa)
    return vstack([hstack([dVa[pvpq][:, pvpq].real, dVm[pvpq][:, pq].real]),
                   hstack([dVa[pq][:, pvpq].imag, dVm[pq][:, pq].imag])]).tocsc()


def sigma_min(J, iters=200, tol=1e-10, seed=0):
    """Smallest singular value of sparse square J: 1 / sqrt(largest eigenvalue of (J^T J)^-1)."""
    try:
        lu = splu(csc_matrix(J))
    except RuntimeError:  # exactly singular
        return 0.0
    x = np.random.default_rng(seed).standard_normal(J.shape[0])
    x /= np.linalg.norm(x)
    lam = 0.0
    for _ in range(iters):
        y = lu.solve(lu.solve(x), trans="T")
        new = float(np.linalg.norm(y))
        if not np.isfinite(new) or new == 0.0:
            return 0.0
        x = y / new
        if abs(new - lam) <= tol * new:
            lam = new
            break
        lam = new
    return float(1.0 / np.sqrt(lam))


def fold_fit(mus, sigmas, window=0.1):
    """Least squares sigma^2 = a (mu_f - mu) on the points within `window` of the last mu.
    Returns (mu_f, a, R^2, n points) or None with fewer than 3 points or a non-falling fit."""
    mus, s2 = np.asarray(mus, float), np.asarray(sigmas, float) ** 2
    keep = mus >= mus.max() - window
    m, y = mus[keep], s2[keep]
    if len(m) < 3:
        return None
    A = np.c_[np.ones_like(m), m]
    (c0, c1), *_ = np.linalg.lstsq(A, y, rcond=None)
    if c1 >= 0:
        return None
    pred = c0 + c1 * m
    ss = float(((y - y.mean()) ** 2).sum())
    r2 = 1.0 - float(((y - pred) ** 2).sum()) / ss if ss > 0 else 0.0
    return float(-c0 / c1), float(-c1), r2, int(len(m))
