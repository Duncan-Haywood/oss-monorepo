"""Proposers for the hanger design loop: random search and CMA-ES on the unit box."""
import math

import numpy as np

from .model import Hanger

# design bounds: half width (cm), arm slope (deg), bow (cm), end radius (cm)
BOUNDS = np.array([[12.0, 30.0], [0.0, 40.0], [-2.0, 3.0], [0.15, 3.0]])


def to_hanger(u):
    v = BOUNDS[:, 0] + np.clip(u, 0, 1) * (BOUNDS[:, 1] - BOUNDS[:, 0])
    return Hanger(w=float(v[0]), slope=float(v[1]), bow=float(v[2]), r=float(v[3]))


def random_search(f, dim, budget, seed):
    """Uniform samples on [0,1]^dim; returns (best u, best f, history of best-so-far)."""
    rng = np.random.default_rng(seed)
    best, fb, hist = None, math.inf, []
    for _ in range(budget):
        u = rng.random(dim)
        v = f(u)
        if v < fb:
            best, fb = u, v
        hist.append(fb)
    return best, fb, hist


def cmaes(f, dim, budget, seed, sigma=0.25, x0=None):
    """Plain (mu/mu_w, lambda)-CMA-ES (Hansen's tutorial defaults) on [0,1]^dim, clipping samples."""
    rng = np.random.default_rng(seed)
    lam = 4 + int(3 * math.log(dim))
    mu = lam // 2
    w = np.log(mu + 0.5) - np.log(np.arange(1, mu + 1))
    w /= w.sum()
    mueff = 1 / (w * w).sum()
    cc = (4 + mueff / dim) / (dim + 4 + 2 * mueff / dim)
    cs = (mueff + 2) / (dim + mueff + 5)
    c1 = 2 / ((dim + 1.3) ** 2 + mueff)
    cmu = min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((dim + 2) ** 2 + mueff))
    damps = 1 + 2 * max(0, math.sqrt((mueff - 1) / (dim + 1)) - 1) + cs
    chin = math.sqrt(dim) * (1 - 1 / (4 * dim) + 1 / (21 * dim * dim))
    m = rng.random(dim) if x0 is None else np.array(x0, float)
    C, pc, ps = np.eye(dim), np.zeros(dim), np.zeros(dim)
    best, fb, hist, used = None, math.inf, [], 0
    while used < budget:
        vals, eig = np.linalg.eigh(C)
        Bm, Dv = eig, np.sqrt(np.maximum(vals, 1e-20))
        n = min(lam, budget - used)
        Z = rng.standard_normal((n, dim))
        Y = Z * Dv @ Bm.T
        X = np.clip(m + sigma * Y, 0, 1)
        F = []
        for x in X:
            v = f(x)
            F.append(v)
            used += 1
            if v < fb:
                best, fb = x.copy(), v
            hist.append(fb)
        if n < lam:
            break
        idx = np.argsort(F)[:mu]
        Ysel = (X[idx] - m) / sigma
        yw = w @ Ysel
        m = m + sigma * yw
        Cinv_half = Bm @ np.diag(1 / Dv) @ Bm.T
        ps = (1 - cs) * ps + math.sqrt(cs * (2 - cs) * mueff) * Cinv_half @ yw
        hs = np.linalg.norm(ps) / math.sqrt(1 - (1 - cs) ** (2 * used / lam)) < (1.4 + 2 / (dim + 1)) * chin
        pc = (1 - cc) * pc + hs * math.sqrt(cc * (2 - cc) * mueff) * yw
        C = (1 - c1 - cmu) * C + c1 * (np.outer(pc, pc) + (1 - hs) * cc * (2 - cc) * C) \
            + cmu * (Ysel.T * w) @ Ysel
        sigma *= math.exp((cs / damps) * (np.linalg.norm(ps) / chin - 1))
        sigma = min(sigma, 1.0)
    return best, fb, hist
