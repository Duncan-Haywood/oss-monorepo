"""Session 90: a censored pinball objective for LightGBM, with leaf renewal from the censored loss itself.

Session 89 kept each source permit still open on the decision date D as Portnoy pseudo-rows; LightGBM's
quantile leaf renewal then set leaves onto the pseudo-rows' far-right labels and q0.9 predictions reached
25,600 days. Here an open permit enters the loss only as what is known about it: its build time is at least
its window c = D - issue day. The censored pinball loss of a prediction q is

    completed row (label y):   pin_tau(y - q)
    open row (window c):       tau * max(c - q, 0)     (charged only while the prediction is below the window)

Each boosting round grows a tree on this loss's gradient (completed: -tau above, 1 - tau below; open: -tau
while q < c, 0 above), then sets every leaf to the shrunken minimiser of the same loss over the rows in it.
That minimiser is a weighted percentile of the leaf's residuals (y - F for completed rows, c - F for open
ones) with weight 1 per completed row and tau per open row, at the level tau * n_leaf (`leaf_minimiser`).
A leaf moves by at most the learning rate times its largest residual, and an open row's residual is
its window minus the current prediction, never a stand-in label, so session 89's jump to 100,000 days
cannot happen (additive trees can still stack a little past the largest window); with no open rows the update is the ordinary quantile leaf renewal (checked in
tests/test_cpin.py against brute force, and against LightGBM's own quantile objective).

The loss is not a proper scoring rule for the full distribution: an open row whose true build time lies
above the prediction is charged nothing, where a completed row there is charged tau. So open rows pull the
quantile up only to their windows. Whether that is enough is what the run measures.
"""
import os
import numpy as np
import lightgbm as lgb

BASE = dict(learning_rate=0.15, num_leaves=63, min_data_in_leaf=100, feature_fraction=0.8,
            bagging_fraction=0.8, bagging_freq=1, verbose=-1, num_threads=int(os.environ.get("CPIN_THREADS", 4)))  # as boosted.fit_predict;
# CPIN_THREADS (session 92) lets two held-out cities run side by side on 4 cores


def closs(y, q, open_, tau):
    """Censored pinball loss per row (y is the window c for open rows)."""
    d = y - q
    done = np.where(d >= 0, tau * d, (tau - 1) * d)
    return np.where(open_, tau * np.maximum(d, 0.0), done)


def leaf_minimiser(r, open_, leaf, tau, n_leaves):
    """Per leaf, the smallest delta minimising sum closs(r - delta): the weighted tau * n percentile of the
    residuals r, weight 1 for completed rows and tau for open ones. Returns an array of n_leaves (0 where a
    leaf holds no rows)."""
    w = np.where(open_, tau, 1.0)
    o = np.lexsort((r, leaf))
    lf, rs, cw = leaf[o], r[o], np.cumsum(w[o])
    n = np.bincount(leaf, minlength=n_leaves)
    end = np.cumsum(n)
    start = end - n
    base = np.where(start > 0, cw[np.maximum(start - 1, 0)], 0.0)
    out = np.zeros(n_leaves)
    has = n > 0
    target = base + tau * n - 1e-9
    idx = np.searchsorted(cw, target[has], side="left")
    idx = np.clip(idx, start[has], end[has] - 1)
    out[has] = rs[idx]
    assert (lf[idx] == np.flatnonzero(has)).all()
    return out


def fit_one(Xtr, ytr, otr, Xca, yca, oca, Xte, tau, seed, n_max=300, patience=30, params=None):
    """One early-stopped censored-pinball model. y* are labels (completed) or windows (open); o* flags open
    rows. Early stopping uses the mean censored loss on (Xca, yca, oca). Returns (test predictions >= 0,
    best round)."""
    p = dict(BASE, **(params or {}), seed=seed, objective="none")
    ytr, yca = np.asarray(ytr, float), np.asarray(yca, float)
    otr, oca = np.asarray(otr, bool), np.asarray(oca, bool)
    lr = p["learning_rate"]
    f0 = leaf_minimiser(ytr, otr, np.zeros(len(ytr), int), tau, 1)[0]
    F = np.full(len(ytr), f0)
    Fca = np.full(len(yca), f0)
    ds = lgb.Dataset(Xtr, ytr, init_score=F.copy(), free_raw_data=False)
    bst = lgb.Booster(p, ds)

    def fobj(_preds, _data):  # LightGBM's own score cache is stale after set_leaf_output: use F
        g = np.where(otr, np.where(F < ytr, -tau, 0.0),
                     np.where(ytr > F, -tau, np.where(ytr < F, 1 - tau, 0.0)))
        return g, np.ones_like(g)

    best, best_it, since = closs(yca, Fca, oca, tau).mean(), 0, 0
    for i in range(n_max):
        bst.update(fobj=fobj)
        leaf = bst.predict(Xtr, start_iteration=i, num_iteration=1, pred_leaf=True).ravel().astype(int)
        nl = int(leaf.max()) + 1
        delta = leaf_minimiser(ytr - F, otr, leaf, tau, nl)
        for j in range(nl):
            bst.set_leaf_output(i, j, lr * float(delta[j]))
        F += lr * delta[leaf]
        lca = bst.predict(Xca, start_iteration=i, num_iteration=1, pred_leaf=True).ravel().astype(int)
        Fca += lr * delta[lca]
        v = closs(yca, Fca, oca, tau).mean()
        if v < best - 1e-12:
            best, best_it, since = v, i + 1, 0
        else:
            since += 1
            if since >= patience:
                break
    if best_it == 0:
        return np.maximum(np.full(len(Xte), f0), 0), 0
    pr = f0 + bst.predict(Xte, num_iteration=best_it)
    return np.maximum(pr, 0), best_it


def censor(d, decision):
    """(labels-or-windows, open flags) of d as seen on `decision`: completed rows keep y, open rows get c."""
    import pandas as pd
    c = np.array([(decision - s).days for s in pd.to_datetime(d.start).dt.date], dtype=float)
    y = d.y.to_numpy(float)
    o = y > c
    return np.where(o, c, y), o
