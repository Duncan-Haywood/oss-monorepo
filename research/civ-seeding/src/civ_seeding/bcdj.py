"""The information model of Banerjee, Chandrasekhar, Duflo and Jackson (2013), re-implemented.

A Python port of the authors' replication code (`GMMDiffusion/diffusion_model.m`,
`moments.m`, `divergence_model.m`, `Main_models_1_3.m` in doi:10.7910/DVN/U3BIHX), vectorised
over simulations. Kept faithful on purpose, quirks included, so that the reproduction checks the
published estimate rather than our reading of the paper:

* Leaders are informed at the start. A household decides once, in the period it is first
  informed, and adopts with probability logistic(beta . [1, z]); beta is a logit of leaders'
  take-up on the six covariates (leaders are the only households known to be informed).
* Every informed household tells each neighbour, every period, with probability qP if it
  adopted and qN if it did not (the Matlab code keeps every ever-informed household
  "contagious"). The village runs T = ceil(months / 4) + 1 periods (trimesters).
* Moments (version 1): (1) take-up among households with no adopting neighbour; (2) take-up
  among neighbours of adopting leaders who touch no non-adopting leader; (3) the same next to
  non-adopting leaders only; (4) mean over non-isolated households of own take-up times the
  share of neighbours adopting; (5) the same with second neighbours, divided by degree (as in
  the code). Moments 2 and 3 classify households by the *observed* leader take-up in both data
  and simulation (`moments.m` caches its network statistics on the first, empirical, call).

Needs numpy only.
"""
from __future__ import annotations

import gzip
import json
import os
from dataclasses import dataclass

import numpy as np

DATA = os.path.join(os.path.dirname(__file__), "..", "..", "data", "bcdj_villages.json.gz")

# Grid of Main_models_1_3.m (modelType 3).
QN_GRID = np.r_[np.arange(0, 0.0101, 0.001), np.arange(0.05, 1.0001, 0.05)]
QP_GRID = np.r_[np.arange(0, 0.1001, 0.005), np.arange(0.15, 1.0001, 0.05)]


@dataclass
class Village:
    village: int
    months: int
    A: np.ndarray        # n x n 0/1 adjacency (giant component)
    takeup: np.ndarray   # n, 0/1
    leader: np.ndarray   # n, bool
    Z: np.ndarray        # n x 6 covariates
    # cached network statistics
    deg: np.ndarray = None
    sec: np.ndarray = None
    nb_taking_leader: np.ndarray = None
    nb_nontaking_leader: np.ndarray = None
    period_months: int = 4  # trimesters, the code's default; 3 = quarters, 1 = months

    @property
    def n(self):
        return self.A.shape[0]

    @property
    def T(self):
        return int(np.ceil(self.months / self.period_months)) + 1

    def prepare(self):
        A = self.A
        self.deg = A.sum(1)
        A2 = (A @ A) > 0
        np.fill_diagonal(A2, False)
        self.sec = (A2 & (A == 0)).astype(float)
        tl = self.leader & (self.takeup == 1)
        nl = self.leader & (self.takeup == 0)
        near_t = (A[:, tl].sum(1) > 0) if tl.any() else np.zeros(self.n, bool)
        near_n = (A[:, nl].sum(1) > 0) if nl.any() else np.zeros(self.n, bool)
        # moments.m: (minDistInfectedLeaders == 1) - (minDistNonInfectedLeaders == 1) > 0.
        # A leader is at distance 0 from itself, so its own group never counts as "at 1".
        near_t &= ~tl
        near_n &= ~nl
        self.nb_taking_leader = near_t & ~near_n
        self.nb_nontaking_leader = near_n & ~near_t
        return self


def load(path: str = DATA) -> list[Village]:
    with gzip.open(path, "rt") as f:
        meta = json.load(f)
    out = []
    for v in meta["villages"]:
        n = v["n"]
        A = np.zeros((n, n))
        e = np.array(v["edges"], dtype=int)
        A[e[:, 0], e[:, 1]] = 1
        A[e[:, 1], e[:, 0]] = 1
        out.append(Village(v["village"], v["months"], A, np.array(v["takeup"]),
                           np.array(v["leader"], bool), np.array(v["covariates"])).prepare())
    return out


def logit_fit(X: np.ndarray, y: np.ndarray, iters: int = 50):
    """Logistic regression with intercept by Newton-Raphson; returns (beta, se)."""
    Xc = np.column_stack([np.ones(len(X)), X])
    b = np.zeros(Xc.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Xc @ b))
        H = Xc.T @ (Xc * (p * (1 - p))[:, None])
        step = np.linalg.solve(H, Xc.T @ (y - p))
        b += step
        if np.abs(step).max() < 1e-10:
            break
    p = 1 / (1 + np.exp(-Xc @ b))
    H = Xc.T @ (Xc * (p * (1 - p))[:, None])
    return b, np.sqrt(np.diag(np.linalg.inv(H)))


def leader_logit(villages):
    X = np.vstack([v.Z[v.leader] for v in villages])
    y = np.concatenate([v.takeup[v.leader] for v in villages])
    return logit_fit(X, y)


def adopt_prob(v: Village, beta) -> np.ndarray:
    return 1 / (1 + np.exp(-(beta[0] + v.Z @ beta[1:])))


def simulate(v: Village, beta, qN: float, qP: float, S: int, rng, p=None,
             return_informed: bool = False):
    """S runs of the information model; returns an n x S 0/1 adoption matrix
    (and the n x S informed matrix if return_informed)."""
    n = v.n
    p = adopt_prob(v, beta) if p is None else p
    informed_before = np.zeros((n, S), bool)
    contagious = np.repeat(v.leader[:, None], S, 1)
    adopted = np.zeros((n, S), bool)
    lq = np.log(np.clip(1 - np.array([qN, qP]), 1e-300, None))
    for _ in range(v.T):
        new = contagious & ~informed_before
        adopted |= new & (rng.random((n, S)) < p[:, None])
        informed_before |= contagious
        # log of prob a neighbour is *not* told by this household this period
        lnot = np.where(adopted, lq[1], lq[0]) * contagious
        reached = rng.random((n, S)) > np.exp(v.A @ lnot)
        contagious = reached | informed_before
    if return_informed:
        return adopted.astype(float), informed_before.astype(float)
    return adopted.astype(float)


def moments(v: Village, Y: np.ndarray) -> np.ndarray:
    """Version-1 moments of adoption matrix Y (n x S, or n); returns S x 5 (or 5)."""
    one = Y.ndim == 1
    Y = Y[:, None] if one else Y
    S = Y.shape[1]
    nb = v.A @ Y
    nh = v.deg > 0
    out = np.zeros((S, 5))
    zero = (nb == 0) & nh[:, None]
    cnt = zero.sum(0)
    out[:, 0] = np.where(cnt > 0, (zero * Y).sum(0) / np.maximum(cnt, 1), 0)
    for k, mask in ((1, v.nb_taking_leader), (2, v.nb_nontaking_leader)):
        out[:, k] = (Y[mask].sum(0) / mask.sum()) if mask.any() else 0
    d = v.deg[nh][:, None]
    out[:, 3] = (Y[nh] * nb[nh] / d).sum(0) / nh.sum()
    out[:, 4] = (Y[nh] * (v.sec @ Y)[nh] / d).sum(0) / nh.sum()
    return out[0] if one else out


def divergence(villages, beta, qN, qP, S=75, seed=0) -> np.ndarray:
    """G x 5 matrix of mean simulated minus empirical moments (common random numbers)."""
    D = np.zeros((len(villages), 5))
    for g, v in enumerate(villages):
        rng = np.random.default_rng([seed, v.village])
        sim = moments(v, simulate(v, beta, qN, qP, S, rng)).mean(0)
        D[g] = sim - moments(v, v.takeup.astype(float))
    return D


def gmm_estimate(Dgrid: np.ndarray, weights=None):
    """Dgrid: (len qN, len qP, G, m). Identity-weighted criterion, as in the paper's code.
    weights: G village weights (Bayesian bootstrap); default equal. Returns (i, j, Q)."""
    G = Dgrid.shape[2]
    w = np.ones(G) / G if weights is None else weights / weights.sum()
    mom = np.einsum("g,ijgm->ijm", w, Dgrid)
    Q = (mom ** 2).sum(-1)
    i, j = np.unravel_index(np.argmin(Q), Q.shape)
    return i, j, Q
