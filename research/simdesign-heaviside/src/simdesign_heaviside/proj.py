"""Density filter + tanh Heaviside projection for SIMP topology optimisation.

Builds on the Q4 SIMP code of ``simdesign-topopt`` (finite-element solve, compliance, sensitivity
and the 99-line sensitivity filter), which is imported rather than copied. What is new here:

* density filter (Bruns and Tortorelli 2001; Bourdin 2001): xt = Hn x, Hn the row-normalised
  cone-weight matrix, the physical field being a function of xt;
* smoothed Heaviside projection (Guest et al. 2004; the tanh form of Wang, Lazarov and Sigmund
  2011): xp = (tanh(b*eta) + tanh(b*(xt - eta))) / (tanh(b*eta) + tanh(b*(1 - eta)));
* beta continuation, and a volume constraint on the projected field, via the optimality-criteria
  update with chain-rule sensitivities;
* discrete-design measures: grey share, checkerboard share, and a morphological minimum length
  scale of the solid and void phases.
"""
import os, sys
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "simdesign-topopt", "src"))
from simdesign_topopt import fe_compliance, mbb_problem, cantilever_problem  # noqa: E402
from simdesign_topopt.simp import _filter_matrix  # noqa: E402


def density_filter_matrix(nelx, nely, rmin):
    """Row-normalised cone filter: xt = Hn @ x.ravel(). rmin in elements (weights max(0, rmin-dist))."""
    H = _filter_matrix(nelx, nely, rmin)
    s = np.asarray(H.sum(axis=1)).ravel()
    return H.multiply(1.0 / s[:, None]).tocsr()


def project(xt, beta, eta=0.5):
    """tanh projection; beta -> 0 gives the identity, large beta a step at eta."""
    if beta < 1e-9:
        return xt.copy()
    d = np.tanh(beta * eta) + np.tanh(beta * (1 - eta))
    return (np.tanh(beta * eta) + np.tanh(beta * (xt - eta))) / d


def dproject(xt, beta, eta=0.5):
    if beta < 1e-9:
        return np.ones_like(xt)
    d = np.tanh(beta * eta) + np.tanh(beta * (1 - eta))
    return beta * (1 - np.tanh(beta * (xt - eta)) ** 2) / d


def topopt(nelx, nely, volfrac, rmin, problem=mbb_problem, penal=3.0, betas=(1, 2, 4, 8, 16, 32, 64),
           iters_per_beta=30, eta=0.5, mode="heaviside", max_iter=200, tol=0.01, move=0.2):
    """Minimise compliance of the projected field with the volume fraction on the projected field.

    mode: 'density' (density filter, no projection, beta 0 throughout, up to max_iter iterations
    with the 99-line stopping rule), 'heaviside' (density filter + projection, beta continuation
    over ``betas``, ``iters_per_beta`` iterations each).
    Returns the design variables x, filtered xt, physical field xp, compliance history (of xp),
    and the final beta.
    """
    f, fixed = problem(nelx, nely)
    Hn = density_filter_matrix(nelx, nely, rmin)
    x = np.full(nelx * nely, volfrac)
    hist = []
    schedule = [0.0] * max_iter if mode == "density" else [b for b in betas for _ in range(iters_per_beta)]
    xp = xt = None
    for it, beta in enumerate(schedule, 1):
        xt = Hn @ x
        xp = project(xt, beta, eta)
        c, _, dc = fe_compliance(xp.reshape(nely, nelx), nelx, nely, f, fixed, penal)
        hist.append(c)
        dpr = dproject(xt, beta, eta)
        dcdx = Hn.T @ (dc.reshape(-1) * dpr)
        dvdx = np.maximum(Hn.T @ dpr, 1e-9)
        l1, l2 = 0.0, 1e9
        while (l2 - l1) / (l1 + l2) > 1e-4:
            lmid = 0.5 * (l1 + l2)
            xnew = np.clip(x * np.sqrt(np.maximum(-dcdx, 0) / (lmid * dvdx)),
                           np.maximum(0.0, x - move), np.minimum(1.0, x + move))
            if project(Hn @ xnew, beta, eta).mean() > volfrac:
                l1 = lmid
            else:
                l2 = lmid
        change = float(np.abs(xnew - x).max())
        x = xnew
        if mode == "density" and change < tol:
            break
    beta = schedule[-1]
    xt = Hn @ x
    xp = project(xt, beta, eta)
    c, _, _ = fe_compliance(xp.reshape(nely, nelx), nelx, nely, f, fixed, penal)
    hist.append(c)
    return {"x": x.reshape(nely, nelx), "xt": xt.reshape(nely, nelx), "xp": xp.reshape(nely, nelx),
            "compliance": c, "history": hist, "beta": beta, "iterations": it,
            "volume": float(xp.mean())}


def grey_share(x):
    return float(np.mean((x > 0.1) & (x < 0.9)))


def checker_share(x):
    b = x > 0.5
    a, c, d, e = b[:-1, :-1], b[:-1, 1:], b[1:, :-1], b[1:, 1:]
    return float(np.mean((a == e) & (c == d) & (a != c)))


def _disk(d):
    r = (d - 1) / 2
    yy, xx = np.mgrid[:d, :d]
    return (yy - r) ** 2 + (xx - r) ** 2 <= (r + 0.5) ** 2


def retained_after_opening(mask, d):
    """Share of True pixels that survive a morphological opening with a diameter-d disk (outside
    the grid counts as False). Opening with a round element always rounds convex corners, so even
    a thick rectangle retains slightly less than 100%."""
    op = ndimage.binary_opening(mask, structure=_disk(d), border_value=0)
    return float(op.sum() / max(mask.sum(), 1))


def min_length_scale(mask, dmax=21, keep=0.98):
    """Largest odd disk diameter d (pixels) such that an opening with a diameter-d disk retains at
    least ``keep`` of the True pixels: the phase is then built from features at least about d wide.
    Returns 1 when even d = 3 fails (features one pixel wide are present)."""
    best = 1
    for d in range(3, dmax + 1, 2):
        if retained_after_opening(mask, d) >= keep:
            best = d
        else:
            break
    return best
