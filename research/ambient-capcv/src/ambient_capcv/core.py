"""Can the doubly robust cap be chosen by validation on logged data? (stylised simulation, follow-up to ambient-crossfit)

Builds on ``research/ambient-crossfit`` and ``ambient-drclip`` (world, policy, MAP fit and ``dr_labels`` copied so this project is self-contained).
Nothing is fitted to real users.
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


def dr_labels(X, y, spoke, prop, w_out, cap=np.inf):
    """Doubly robust pseudo-labels for every window: m(x) + (S/pi) * (y - m(x)).

    ``m`` is the outcome model with weights ``w_out``; ``S`` is 1 where the assistant spoke (label seen) and
    ``pi`` the known propensity. Where it stayed silent the pseudo-label is just m(x). The result is a
    soft target in (possibly beyond) [0, 1] for a logistic fit on ALL windows. ``cap`` limits the inverse
    propensity in the correction term (``min(1/pi, cap)``); ``cap=inf`` is the unclipped form of ``ambient-dr``.
    """
    m = sigmoid(X @ w_out)
    return m + np.where(spoke, np.minimum(1.0 / prop, cap), 0.0) * (y - m)


GRID = (2, 5, 10, 20, 50, 100, np.inf)
FIXED = (5, 20, 100, np.inf)
FIT_NAMES = ["biased", "clip10"] + [f"fixed{c}" for c in FIXED] + ["cv", "hindsight", "random_matched", "full"]


def dr_fit(X, y, spoke, prop, prior_w, prior_prec, cap):
    """Plug-in DR fit: outcome model = clip10 fit on labelled windows, pseudo-labels with inverse propensity capped at ``cap``."""
    idx = np.flatnonzero(spoke)
    w_out, _ = fit_map(X[idx], y[idx], prior_w, prior_prec, np.minimum(1.0 / prop[idx], 10))
    w, _ = fit_map(X, dr_labels(X, y, spoke, prop, w_out, cap), prior_w, prior_prec)
    return w


def ips_value(world, w, X, others, y, spoke, prop):
    """Inverse-propensity estimate of the mean per-window utility of the rule (model ``w`` + no wake phrase).

    Unbiased when every window had a positive speaking probability for the rule's action; the wake phrase is ignored
    here (it is the same for every candidate). Uses UNCAPPED weights, so it is noisy but not biased by the cap.
    """
    act = decide(world, w, X, others)
    r = np.where(y > 0, world.benefit, -cost(world, others))
    return float(np.mean(np.where(act & spoke, r / prop, 0.0)))


def select_cap(world, X, others, y, spoke, prop, prior_w, prior_prec, grid=GRID, folds=4):
    """Pick the cap with the best mean IPS value over ``folds`` position-contiguous validation folds.

    For each fold, fit the DR model (at each cap) on the other folds and score it on the held-out fold.
    Returns (best cap, {cap: mean validation value}).
    """
    n = len(y); fold = (np.arange(n) * folds) // n
    score = {c: [] for c in grid}
    for k in range(folds):
        tr, va = fold != k, fold == k
        for c in grid:
            w = dr_fit(X[tr], y[tr], spoke[tr], prop[tr], prior_w, prior_prec, c)
            score[c].append(ips_value(world, w, X[va], others[va], y[va], spoke[va], prop[va]))
    mean = {c: float(np.mean(v)) for c, v in score.items()}
    return max(grid, key=lambda c: mean[c]), mean


def run_logged(world, d, rng, eps=0.005, prior_w=None, prior_prec=1.0, hours=(100,), held=None, w_scorer=None):
    """Run the deployed policy (unweighted refit, epsilon-greedy) and, at ``hours``, fit on the SAME history:

    ``biased``, ``clip10``, ``random_matched``, ``full`` as in ``ambient-drclip``; ``fixed<c>``: plug-in DR at a preset cap;
    ``cv``: plug-in DR at the cap chosen by ``select_cap`` (no peeking at the truth); ``hindsight``: the best cap
    in ``GRID`` by held-out utility, which uses the held-out streams ``held`` and ``w_scorer`` (a function
    (weights, stream)->utility) and so is NOT available to a real assistant. Returns ({hour: {name: weights}},
    {hour: labelled count}, {hour: chosen cap}).
    """
    n = len(d["need"]); X = d["X"]; y = d["need"].astype(float)
    prior_w = PRIOR_W if prior_w is None else prior_w
    w = prior_w.copy()
    spoke = np.zeros(n, bool); prop = np.ones(n)
    fits, nlab, chosen = {}, {}, {}
    for s in range(0, n, BATCH):
        e = min(n, s + BATCH)
        greedy = decide(world, w, X[s:e], d["others"][s:e]) | d["wake"][s:e]
        sp = greedy | (rng.random(e - s) < eps)
        spoke[s:e] = sp; prop[s:e] = np.where(greedy, 1.0, eps)
        idx = np.flatnonzero(spoke[:e])
        w, _ = fit_map(X[idx], y[idx], prior_w, prior_prec)
        h = e / WINDOWS_PER_HOUR
        if h in hours:
            Xe, ye, se, pe, oe = X[:e], y[:e], spoke[:e], prop[:e], d["others"][:e]
            f = {"biased": w.copy()}
            f["clip10"], _ = fit_map(X[idx], y[idx], prior_w, prior_prec, np.minimum(1.0 / prop[idx], 10))
            for c in FIXED:
                f[f"fixed{c}"] = dr_fit(Xe, ye, se, pe, prior_w, prior_prec, c)
            c_cv, _ = select_cap(world, Xe, oe, ye, se, pe, prior_w, prior_prec)
            f["cv"] = dr_fit(Xe, ye, se, pe, prior_w, prior_prec, c_cv)
            if held is not None:
                cand = {c: dr_fit(Xe, ye, se, pe, prior_w, prior_prec, c) for c in GRID}
                best = max(GRID, key=lambda c: np.mean([w_scorer(cand[c], hs) for hs in held]))
                f["hindsight"] = cand[best]
            else:
                f["hindsight"] = f["cv"]
            r = np.sort(rng.choice(e, size=len(idx), replace=False))
            f["random_matched"], _ = fit_map(X[r], y[r], prior_w, prior_prec)
            f["full"], _ = fit_map(Xe, ye, prior_w, prior_prec)
            fits[int(h)] = f; nlab[int(h)] = int(len(idx)); chosen[int(h)] = c_cv
    return fits, nlab, chosen
