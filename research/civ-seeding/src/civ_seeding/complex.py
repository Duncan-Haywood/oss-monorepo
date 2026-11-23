"""Simple and complex contagion on the BCDJ villages: one simulator for three model families.

All three share the information spread of Banerjee et al. (2013), as ported in `bcdj.py`:
leaders are informed at the start; every informed household tells each neighbour, every
period, with probability qP if it adopted and qN if not; T = ceil(months / 4) + 1 periods.
Each household draws one uniform U per simulation.

* information (I): an informed household adopts if U < p(z) = logistic(beta . [1, z]).
  Since U is fixed, only the first informed period can matter: the BCDJ decision rule.
* reinforcement (R, gamma): an informed household adopts in any period where
  U < logistic(beta . [1, z] + gamma * k), k = adopting neighbours at the start of the period.
  The chance of having adopted after k adopters is the logit; gamma = 0 is I exactly.
* fractional threshold (T, theta): an informed household adopts if U < p(z) or at least a
  share theta of its neighbours has adopted. theta = None (or > 1) is I.
* heterogeneous threshold (H, mu, kappa; milestone 28): as T, but each household draws its own
  theta_i ~ Beta(mu * kappa, (1 - mu) * kappa) per simulation (mean mu; kappa -> infinity is T).

Moments: the five BCDJ moments of `bcdj.moments` plus take-up among households with exactly
1, 2 and 3+ adopting neighbours (`moments_ext`, eight in all).
"""
from __future__ import annotations

import numpy as np

from . import bcdj


def simulate(v: bcdj.Village, beta, qN: float, qP: float, S: int, rng,
             gamma: float = 0.0, theta: float | None = None, seeds=None,
             return_informed: bool = False, delta: float = 0.0, shift=None,
             theta_beta=None):
    """S runs; returns an n x S 0/1 adoption matrix (and informed matrix if asked).

    seeds: optional bool n-vector of initially informed households (default: leaders).
    delta: shift of the logit intercept (a reinforcement model with gamma > 0 needs a lower
    intrinsic rate to match the same final take-up as the leader logit).
    shift: optional length-S array added to every household's logit in that simulation, a
    village-level random effect on the base adoption rate (one draw per village and run).
    theta_beta: optional (mu, kappa); each household draws theta_i ~ Beta(mu kappa, (1 - mu)
    kappa) once per simulation, after U, so the other families' random streams are unchanged.
    Overrides theta."""
    n = v.n
    base = beta[0] + delta + v.Z @ beta[1:]
    if shift is not None:
        base = base[:, None] + np.asarray(shift, float)[None, :]
    U = rng.random((n, S))
    seed_mask = v.leader if seeds is None else np.asarray(seeds, bool)
    contagious = np.repeat(seed_mask[:, None], S, 1)
    informed = np.zeros((n, S), bool)
    adopted = np.zeros((n, S), bool)
    lq = np.log(np.clip(1 - np.array([qN, qP]), 1e-300, None))
    deg = np.maximum(v.deg, 1)[:, None]
    use_theta = theta is not None and theta <= 1
    th = theta
    if theta_beta is not None:
        mu, kappa = theta_beta
        th = np.maximum(rng.beta(mu * kappa, (1 - mu) * kappa, (n, S)), 1e-9)
        use_theta = True
    for _ in range(v.T):
        informed |= contagious
        if gamma != 0.0 or use_theta:
            k = v.A @ adopted
        b2 = base if base.ndim == 2 else base[:, None]
        if gamma != 0.0:
            p = 1 / (1 + np.exp(-(b2 + gamma * k)))
        else:
            p = 1 / (1 + np.exp(-b2))
        new = informed & ~adopted & (U < p)
        if use_theta:
            new |= informed & ~adopted & (k / deg >= th - 1e-12)
        adopted |= new
        lnot = np.where(adopted, lq[1], lq[0]) * informed
        reached = rng.random((n, S)) > np.exp(v.A @ lnot)
        contagious = reached
    if return_informed:
        return adopted.astype(float), informed.astype(float)
    return adopted.astype(float)


def moments_ext(v: bcdj.Village, Y: np.ndarray) -> np.ndarray:
    """Eight moments: the BCDJ five, then take-up among households with exactly 1, 2 and 3+
    adopting neighbours. Y is n x S (returns S x 8) or n (returns 8)."""
    one = Y.ndim == 1
    Y = Y[:, None] if one else Y
    m5 = bcdj.moments(v, Y)
    nb = v.A @ Y
    extra = np.zeros((Y.shape[1], 3))
    for c, (lo, hi) in enumerate(((1, 1), (2, 2), (3, np.inf))):
        mask = (nb >= lo) & (nb <= hi)
        cnt = mask.sum(0)
        extra[:, c] = np.where(cnt > 0, (mask * Y).sum(0) / np.maximum(cnt, 1), 0)
    out = np.column_stack([m5, extra])
    return out[0] if one else out


def takeup_by_k(v: bcdj.Village, Y: np.ndarray, kmax: int = 4):
    """Non-leader adopters and counts by number of adopting neighbours 0..kmax (kmax = kmax+).
    Y: n x S. Returns (adopters, households), each of length kmax + 1, summed over S."""
    nb = np.minimum(v.A @ Y, kmax)
    nl = ~v.leader
    a = np.zeros(kmax + 1)
    h = np.zeros(kmax + 1)
    for k in range(kmax + 1):
        m = (nb == k) & nl[:, None]
        a[k] = (m * Y).sum()
        h[k] = m.sum()
    return a, h


def divergence(villages, beta, qN, qP, S=75, seed=0, gamma=0.0, theta=None,
               delta=0.0) -> np.ndarray:
    """G x 8 matrix: mean simulated minus empirical extended moments, per village."""
    D = np.zeros((len(villages), 8))
    for g, v in enumerate(villages):
        rng = np.random.default_rng([seed, v.village])
        sim = moments_ext(v, simulate(v, beta, qN, qP, S, rng, gamma, theta,
                                              delta=delta)).mean(0)
        D[g] = sim - moments_ext(v, v.takeup.astype(float))
    return D


def fit(D: np.ndarray, weights=None, cols=slice(None)):
    """D: (P, G, m) divergences over P grid points. Identity-weighted criterion on the given
    moment columns with village weights; returns (argmin index, criterion vector)."""
    G = D.shape[1]
    w = np.ones(G) / G if weights is None else weights / weights.sum()
    mom = np.einsum("g,pgm->pm", w, D[:, :, cols])
    Q = (mom ** 2).sum(-1)
    return int(np.argmin(Q)), Q


def loo_losses(D_fit: np.ndarray, D_eval: np.ndarray, cols=slice(None)):
    """Leave one village out: fit on the other villages with D_fit, score the held-out
    village's squared divergence at the fitted point with D_eval. Returns (G,) losses and
    the (G,) chosen grid indices."""
    G = D_fit.shape[1]
    loss = np.zeros(G)
    idx = np.zeros(G, int)
    for g in range(G):
        w = np.ones(G)
        w[g] = 0
        i, _ = fit(D_fit, w, cols)
        idx[g] = i
        loss[g] = (D_eval[i, g, cols] ** 2).sum()
    return loss, idx
