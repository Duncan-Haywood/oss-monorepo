"""Fit on exploration windows only (stylised simulation).

Builds on ``research/ambient-labelmatch`` (world, decision rule, MAP logistic fit and the deployed
epsilon-greedy learner, copied so this project is self-contained). Nothing is fitted to real users.
"""
from dataclasses import dataclass

import numpy as np

WINDOWS_PER_HOUR = 360
BATCH = 60  # windows between refits (10 minutes)


@dataclass(frozen=True)
class World:
    prevalence: float = 0.03
    d_prime: float = 2.0
    p_wake_need: float = 0.15
    p_wake_other: float = 0.002
    p_kw_need: float = 0.45
    p_kw_other: float = 0.08
    p_others: float = 0.30
    others_cost: float = 2.0
    benefit: float = 3.0


def simulate(world: World, hours: float, rng: np.random.Generator) -> dict:
    n = int(round(hours * WINDOWS_PER_HOUR))
    need = rng.random(n) < world.prevalence
    wake = rng.random(n) < np.where(need, world.p_wake_need, world.p_wake_other)
    kw = rng.random(n) < np.where(need, world.p_kw_need, world.p_kw_other)
    score = rng.normal(np.where(need, world.d_prime, 0.0), 1.0)
    others = rng.random(n) < world.p_others
    X = np.column_stack([score, kw, others, np.ones(n)]).astype(float)
    return dict(need=need, X=X, wake=wake, others=others)


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def fit_map(X, y, w0, prior_prec=1.0, sample_weight=None, iters=40):
    """Weighted MAP logistic regression with a N(w0, 1/prior_prec) prior.

    ``sample_weight`` multiplies each window's log-likelihood term (inverse-propensity weights).
    """
    k = len(w0)
    if len(y) == 0:
        return w0.copy(), np.eye(k) / prior_prec
    sw = np.ones(len(y)) if sample_weight is None else sample_weight
    w = w0.copy()
    for _ in range(iters):
        p = sigmoid(X @ w)
        g = X.T @ (sw * (p - y)) + prior_prec * (w - w0)
        H = (X * (sw * p * (1 - p))[:, None]).T @ X + prior_prec * np.eye(k)
        step = np.linalg.solve(H, g)
        w -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    return w, np.linalg.inv(H)


def cost(world: World, others):
    return np.where(others, world.others_cost, 1.0)


def decide(world, w, X, others):
    p = sigmoid(X @ w)
    return p * world.benefit > (1 - p) * cost(world, others)


PRIOR_W = np.array([0.0, 0.0, 0.0, -3.5])
INFORMED_W = np.array([1.0, 0.0, 0.0, -3.5])


def oracle_weights(world, rng, hours=2000):
    d = simulate(world, hours, rng)
    w, _ = fit_map(d["X"], d["need"].astype(float), PRIOR_W, prior_prec=1e-2)
    return w


def run_fixed(world, d, w):
    sp = decide(world, w, d["X"], d["others"]) | d["wake"]
    need = d["need"]
    return np.where(sp & need, world.benefit, 0.0) - np.where(sp & ~need, cost(world, d["others"]), 0.0)


FIT_NAMES = ["biased", "explore_only", "explore_matched", "random_matched", "full"]


def run_logged(world, d, rng, eps=0.005, prior_w=None, prior_prec=1.0, hours=(100,)):
    """Run the deployed policy of ``ambient-labelmatch`` (unweighted refit on windows where it spoke,
    epsilon-greedy) and, at the given hours, fit models on the SAME history, all with the same prior.

    A window is *explored* when the model said no, no wake phrase was heard, and the epsilon coin came up:
    the policy spoke only because of the coin, so which of those windows get labelled does not depend on
    the model or on the need. Fits:

    * ``biased``: windows where the policy spoke (the deployed learner; reproduces ``ambient-labelmatch``);
    * ``explore_only``: only the explored windows, unweighted;
    * ``explore_matched``: a uniformly random subset of ALL windows so far, of the same size as the
      explored set (not deployable; separates label volume from the choice of windows);
    * ``random_matched``: as in ``ambient-labelmatch``, as large as the ``biased`` label set;
    * ``full``: every window so far.

    Returns ({hour: {name: weights}}, {hour: {"spoke": n, "explored": n}}).
    """
    n = len(d["need"]); X = d["X"]; y = d["need"].astype(float)
    prior_w = PRIOR_W if prior_w is None else prior_w
    w = prior_w.copy()
    spoke = np.zeros(n, bool); explored = np.zeros(n, bool)
    fits, counts = {}, {}
    for s in range(0, n, BATCH):
        e = min(n, s + BATCH)
        greedy = decide(world, w, X[s:e], d["others"][s:e]) | d["wake"][s:e]
        coin = rng.random(e - s) < eps
        spoke[s:e] = greedy | coin; explored[s:e] = coin & ~greedy
        idx = np.flatnonzero(spoke[:e])
        w, _ = fit_map(X[idx], y[idx], prior_w, prior_prec)       # the deployed (biased) learner
        h = e / WINDOWS_PER_HOUR
        if h in hours:
            f = {"biased": w.copy()}
            ex = np.flatnonzero(explored[:e])
            f["explore_only"], _ = fit_map(X[ex], y[ex], prior_w, prior_prec)
            r = np.sort(rng.choice(e, size=len(idx), replace=False))
            f["random_matched"], _ = fit_map(X[r], y[r], prior_w, prior_prec)
            r2 = np.sort(rng.choice(e, size=len(ex), replace=False))
            f["explore_matched"], _ = fit_map(X[r2], y[r2], prior_w, prior_prec)
            f["full"], _ = fit_map(X[:e], y[:e], prior_w, prior_prec)
            fits[int(h)] = f
            counts[int(h)] = {"spoke": int(len(idx)), "explored": int(len(ex))}
    return fits, counts


def run_online(world, d, rng, eps=0.02, learner="explore_only", prior_w=None, prior_prec=1.0):
    """Epsilon-greedy online policy whose learner refits every 10 minutes on ``learner``:
    ``"biased"`` (every window where it spoke, as in ``ambient-bandit``) or ``"explore_only"`` (only the
    windows where it spoke because of the epsilon coin). The wake phrase always makes it speak.

    Returns per-window utility, a dismissed-window array and the final weights.
    """
    n = len(d["need"]); X = d["X"]
    util = np.zeros(n); dismissed = np.zeros(n, bool)
    prior_w = PRIOR_W if prior_w is None else prior_w
    w = prior_w.copy()
    spoke = np.zeros(n, bool); explored = np.zeros(n, bool)
    y = d["need"].astype(float)
    for s in range(0, n, BATCH):
        sl = slice(s, min(n, s + BATCH))
        Xb, ob = X[sl], d["others"][sl]
        greedy = decide(world, w, Xb, ob) | d["wake"][sl]
        coin = rng.random(len(greedy)) < eps
        sp = greedy | coin
        need = d["need"][sl]
        util[sl] = np.where(sp & need, world.benefit, 0.0) - np.where(sp & ~need, cost(world, ob), 0.0)
        dismissed[sl] = sp & ~need
        spoke[sl] = sp; explored[sl] = coin & ~greedy
        idx = np.flatnonzero((explored if learner == "explore_only" else spoke)[:sl.stop])
        w, _ = fit_map(X[idx], y[idx], prior_w, prior_prec)
    return util, dismissed, w
