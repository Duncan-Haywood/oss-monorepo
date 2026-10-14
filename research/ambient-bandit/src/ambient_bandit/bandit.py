"""Online learning of an interruption policy from accept/dismiss feedback only.

Reuses the simulated listening windows of ``research/ambient-interject`` (a copy of the generator
is kept here so the project is self-contained). The assistant sees features x of each 10 s window
and chooses speak / stay silent. Feedback arrives only when it speaks: an *accept* (help was
wanted, benefit ``b``) or a *dismiss* (annoyance ``c``, x ``others_cost`` when others talk).
Silence yields no label, so a policy that stops speaking stops learning: that is the exploration
problem. Everything here is a stylised simulation; nothing is fitted to real users.
"""
from dataclasses import dataclass, replace

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
    benefit: float = 3.0   # value of an accepted interruption; a plain false one costs 1


def simulate(world: World, hours: float, rng: np.random.Generator) -> dict:
    n = int(round(hours * WINDOWS_PER_HOUR))
    need = rng.random(n) < world.prevalence
    wake = rng.random(n) < np.where(need, world.p_wake_need, world.p_wake_other)
    kw = rng.random(n) < np.where(need, world.p_kw_need, world.p_kw_other)
    score = rng.normal(np.where(need, world.d_prime, 0.0), 1.0)
    others = rng.random(n) < world.p_others
    X = np.column_stack([score, kw, others, np.ones(n)]).astype(float)  # wake is answered outright, not a feature
    return dict(need=need, X=X, wake=wake, others=others)


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def fit_map(X, y, w0, prior_prec=1.0, iters=30):
    """MAP logistic regression with a N(w0, 1/prior_prec) prior; returns (w, posterior covariance)."""
    w = w0.copy()
    for _ in range(iters):
        p = sigmoid(X @ w) if len(y) else np.zeros(0)
        g = X.T @ (p - y) + prior_prec * (w - w0) if len(y) else prior_prec * (w - w0)
        H = (X * (p * (1 - p))[:, None]).T @ X + prior_prec * np.eye(len(w)) if len(y) else prior_prec * np.eye(len(w))
        step = np.linalg.solve(H, g)
        w -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    return w, np.linalg.inv(H)


def cost(world: World, others):
    return np.where(others, world.others_cost, 1.0)


def decide(world, w, X, others):
    """Speak iff expected benefit exceeds expected annoyance: p*b > (1-p)*c."""
    p = sigmoid(X @ w)
    return p * world.benefit > (1 - p) * cost(world, others)


# prior belief: need is rare (intercept logit(0.03)), nothing else known
PRIOR_W = np.array([0.0, 0.0, 0.0, -3.5])


def run_online(world, d, mode, rng, eps=0.005, prior_prec=1.0, forget_hours=None, prior_w=None):
    """Run one policy over the stream ``d``. mode: greedy | eps | thompson.

    Returns per-window utility array and per-window 'dismissed' array. Windows are processed in
    batches of ``BATCH``: the policy is fixed within a batch, then refit on all labelled windows
    (those where it spoke). ``forget_hours`` keeps only the most recent labelled windows.
    """
    n = len(d["need"]); X = d["X"]
    util = np.zeros(n); dismissed = np.zeros(n, bool); spoke = np.zeros(n, bool)
    prior_w = PRIOR_W if prior_w is None else prior_w
    w, cov = prior_w.copy(), np.eye(len(PRIOR_W)) / prior_prec
    labelled_idx = []
    for s in range(0, n, BATCH):
        sl = slice(s, min(n, s + BATCH))
        Xb, ob = X[sl], d["others"][sl]
        wuse = rng.multivariate_normal(w, cov) if mode == "thompson" else w
        sp = decide(world, wuse, Xb, ob)
        if mode == "eps":
            sp = sp | (rng.random(len(sp)) < eps)
        sp = sp | d["wake"][sl]  # an explicit wake phrase is always answered
        need = d["need"][sl]
        util[sl] = np.where(sp & need, world.benefit, 0.0) - np.where(sp & ~need, cost(world, ob), 0.0)
        dismissed[sl] = sp & ~need; spoke[sl] = sp
        labelled_idx.extend(np.flatnonzero(sp) + s)
        idx = np.array(labelled_idx, dtype=int)
        if forget_hours is not None:
            idx = idx[idx >= (sl.stop - forget_hours * WINDOWS_PER_HOUR)]
        w, cov = fit_map(X[idx], d["need"][idx].astype(float), prior_w, prior_prec)
    return util, dismissed, spoke


def oracle_weights(world, rng, hours=2000):
    """Logistic fit on a large fully labelled sample: the best this feature set can do offline."""
    d = simulate(world, hours, rng)
    w, _ = fit_map(d["X"], d["need"].astype(float), PRIOR_W, prior_prec=1e-2)
    return w


def run_fixed(world, d, w):
    sp = decide(world, w, d["X"], d["others"]) | d["wake"]
    need = d["need"]
    return np.where(sp & need, world.benefit, 0.0) - np.where(sp & ~need, cost(world, d["others"]), 0.0)
