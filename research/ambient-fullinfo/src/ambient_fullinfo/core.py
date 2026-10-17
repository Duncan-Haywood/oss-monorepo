"""Does selection bias hurt? Compare biased, IPS and full-information fits on the same history (stylised simulation).

Builds on ``research/ambient-ips`` and ``research/ambient-bandit`` (window generator, decision rule and MAP
logistic fit copied from ``ambient-ips`` so this project is self-contained). Nothing is fitted to real users.
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


def run_online(world, d, rng, eps=0.02, weighting="ips", prior_w=None, prior_prec=1.0,
               forget_hours=None, max_weight=None):
    """Epsilon-greedy online policy with known propensities.

    In each window the policy speaks if the model says so or a wake phrase was heard (propensity 1),
    otherwise it speaks with probability ``eps`` (propensity ``eps``). ``weighting``:
    ``"ips"`` weights each labelled window by 1/propensity; ``"none"`` is the unweighted refit of
    ``ambient-bandit``. ``max_weight`` optionally clips the weights (biased but lower variance).
    Returns per-window utility, dismissed and spoke arrays, and ``snap``: the fitted weights at the
    end of every 10th hour (hour -> weights), so a model can be scored without exploration.
    """
    n = len(d["need"]); X = d["X"]
    util = np.zeros(n); dismissed = np.zeros(n, bool); spoke = np.zeros(n, bool)
    prior_w = PRIOR_W if prior_w is None else prior_w
    w = prior_w.copy()
    idx_all, wt_all = [], []
    snap = {}
    for s in range(0, n, BATCH):
        sl = slice(s, min(n, s + BATCH))
        Xb, ob, wake = X[sl], d["others"][sl], d["wake"][sl]
        greedy = decide(world, w, Xb, ob) | wake            # propensity 1
        explore = rng.random(len(greedy)) < eps
        sp = greedy | explore
        prop = np.where(greedy, 1.0, eps)
        need = d["need"][sl]
        util[sl] = np.where(sp & need, world.benefit, 0.0) - np.where(sp & ~need, cost(world, ob), 0.0)
        dismissed[sl] = sp & ~need; spoke[sl] = sp
        idx_all.extend(np.flatnonzero(sp) + s)
        wt = 1.0 / prop[sp]
        if max_weight is not None:
            wt = np.minimum(wt, max_weight)
        wt_all.extend(wt)
        idx = np.array(idx_all, dtype=int); wts = np.array(wt_all)
        if forget_hours is not None:
            keep = idx >= (sl.stop - forget_hours * WINDOWS_PER_HOUR)
            idx, wts = idx[keep], wts[keep]
        if weighting == "none":
            wts = None
        w, _ = fit_map(X[idx], d["need"][idx].astype(float), prior_w, prior_prec, wts)
        if sl.stop % (10 * WINDOWS_PER_HOUR) == 0:
            snap[sl.stop // WINDOWS_PER_HOUR] = w.copy()
    return util, dismissed, spoke, snap


def oracle_weights(world, rng, hours=2000):
    d = simulate(world, hours, rng)
    w, _ = fit_map(d["X"], d["need"].astype(float), PRIOR_W, prior_prec=1e-2)
    return w


def run_fixed(world, d, w):
    sp = decide(world, w, d["X"], d["others"]) | d["wake"]
    need = d["need"]
    return np.where(sp & need, world.benefit, 0.0) - np.where(sp & ~need, cost(world, d["others"]), 0.0)


def run_logged(world, d, rng, eps=0.005, prior_w=None, prior_prec=1.0, hours=(20, 50, 100)):
    """Run the deployed policy (unweighted refit on windows where it spoke, as in ``ambient-bandit``,
    epsilon-greedy exploration) and, at the given hours, fit three models on the SAME history:

    * ``biased``: unweighted, labelled (spoke) windows only;
    * ``ips``: the same windows weighted by 1/propensity;
    * ``full``: every window so far, with its true label. A real assistant never observes the label of
      a window where it stayed silent, so this is an oracle-data reference, not a deployable method.

    All fits share the prior and prior precision. Returns {hour: {name: weights}} and the number of
    labelled windows seen by hour.
    """
    n = len(d["need"]); X = d["X"]; y = d["need"].astype(float)
    prior_w = PRIOR_W if prior_w is None else prior_w
    w = prior_w.copy()
    spoke = np.zeros(n, bool); prop = np.ones(n)
    fits, nlab = {}, {}
    for s in range(0, n, BATCH):
        e = min(n, s + BATCH)
        greedy = decide(world, w, X[s:e], d["others"][s:e]) | d["wake"][s:e]
        sp = greedy | (rng.random(e - s) < eps)
        spoke[s:e] = sp; prop[s:e] = np.where(greedy, 1.0, eps)
        idx = np.flatnonzero(spoke[:e])
        w, _ = fit_map(X[idx], y[idx], prior_w, prior_prec)       # the deployed (biased) learner
        h = e / WINDOWS_PER_HOUR
        if h in hours:
            wi, _ = fit_map(X[idx], y[idx], prior_w, prior_prec, 1.0 / prop[idx])
            wf, _ = fit_map(X[:e], y[:e], prior_w, prior_prec)
            fits[int(h)] = {"biased": w.copy(), "ips": wi, "full": wf}
            nlab[int(h)] = int(len(idx))
    return fits, nlab
