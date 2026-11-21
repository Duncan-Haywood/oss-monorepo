"""Milestone 24: what a richer survey would record, and the moments it adds.

The BCDJ archive records one cross-section: who had adopted by the survey. Two cheap
additions a rollout's evaluator could budget for:

* an **awareness** question at the end-line survey ("have you heard of the product?"), which
  records who was informed (the model's `informed` set: households that reached a decision);
* adoption **timing**: the period (trimester) in which each adopter took up, from the lender's
  own loan records.

`simulate_tracked` is `complex.simulate` with the informed set and the adoption period kept;
with the same rng it returns the same adoption matrix (`tests/test_measure.py`).

Moments added (all among non-leaders, who are not informed at the start):

* awareness (5): the aware share; take-up among aware households with 0, 1, 2 and 3+ adopting
  neighbours at the survey. Under the information model a household's decision ignores its
  neighbours, so take-up among the aware is flat in that count up to covariates; under
  reinforcement or a threshold it rises.
* timing (5): the per-period adoption hazard among households that had not adopted, by the
  number of adopting neighbours at the start of the period (0, 1, 2, 3+), pooled over periods;
  and the mean adoption period of adopters, divided by the village's number of periods.

Needs numpy only.
"""
from __future__ import annotations

import numpy as np

from . import bcdj


def simulate_tracked(v: bcdj.Village, beta, qN: float, qP: float, S: int, rng,
                     gamma: float = 0.0, theta: float | None = None, delta: float = 0.0):
    """S runs; returns (Y, informed, tadopt): n x S adoption (0/1 float), n x S informed
    (bool), n x S adoption period (int, -1 if never). Same draws as `complex.simulate`."""
    n = v.n
    base = (beta[0] + delta + v.Z @ beta[1:])[:, None]
    U = rng.random((n, S))
    contagious = np.repeat(v.leader[:, None], S, 1)
    informed = np.zeros((n, S), bool)
    adopted = np.zeros((n, S), bool)
    tadopt = -np.ones((n, S), int)
    lq = np.log(np.clip(1 - np.array([qN, qP]), 1e-300, None))
    deg = np.maximum(v.deg, 1)[:, None]
    use_theta = theta is not None and theta <= 1
    for t in range(v.T):
        informed |= contagious
        if gamma != 0.0 or use_theta:
            k = v.A @ adopted
        if gamma != 0.0:
            p = 1 / (1 + np.exp(-(base + gamma * k)))
        else:
            p = 1 / (1 + np.exp(-base))
        new = informed & ~adopted & (U < p)
        if use_theta:
            new |= informed & ~adopted & (k / deg >= theta - 1e-12)
        adopted |= new
        tadopt[new] = t
        lnot = np.where(adopted, lq[1], lq[0]) * informed
        reached = rng.random((n, S)) > np.exp(v.A @ lnot)
        contagious = reached
    return adopted.astype(float), informed, tadopt


def _rate(num, den):
    return np.where(den > 0, num / np.maximum(den, 1), 0.0)


def moments_aware(v: bcdj.Village, Y, aware) -> np.ndarray:
    """S x 5: aware share of non-leaders; take-up among aware non-leaders with 0, 1, 2, 3+
    adopting neighbours. Y, aware: n x S."""
    nl = (~v.leader)[:, None]
    aw = aware.astype(bool) & nl
    out = np.zeros((Y.shape[1], 5))
    out[:, 0] = aw.sum(0) / nl.sum()
    nb = v.A @ Y
    for c, (lo, hi) in enumerate(((0, 0), (1, 1), (2, 2), (3, np.inf))):
        m = aw & (nb >= lo) & (nb <= hi)
        out[:, 1 + c] = _rate((m * Y).sum(0), m.sum(0))
    return out


def moments_timing(v: bcdj.Village, tadopt) -> np.ndarray:
    """S x 5: adoption hazard per period among non-leader non-adopters by adopting neighbours
    at the period's start (0, 1, 2, 3+), pooled over periods; mean adoption period of
    non-leader adopters / T. tadopt: n x S, -1 for never."""
    T = v.T
    S = tadopt.shape[1]
    nl = (~v.leader)[:, None]
    num = np.zeros((S, 4))
    den = np.zeros((S, 4))
    ever = tadopt >= 0
    for t in range(T):
        prior = ever & (tadopt < t)                      # adopted before period t
        k = v.A @ prior
        risk = nl & ~prior
        hit = risk & (tadopt == t)
        for c, (lo, hi) in enumerate(((0, 0), (1, 1), (2, 2), (3, np.inf))):
            m = (k >= lo) & (k <= hi)
            num[:, c] += (hit & m).sum(0)
            den[:, c] += (risk & m).sum(0)
    out = np.zeros((S, 5))
    out[:, :4] = _rate(num, den)
    a = ever & nl
    out[:, 4] = _rate((np.where(a, tadopt, 0)).sum(0), a.sum(0)) / T
    return out


def misreport(aware, rng, miss: float, false: float):
    """Awareness answers with error: an aware household says no with prob miss, an unaware
    one says yes with prob false."""
    r = rng.random(aware.shape)
    return np.where(aware, r >= miss, r < false)
