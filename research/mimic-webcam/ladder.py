"""A ladder of fixed generators, scored by a detector the generators never saw.

The reference detector is gradient-boosted trees on every feature group, fitted
on training people against the generator's samples, scored on held-out people.
"""
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

import data as D
import signals as S

LADDER = {
    "L0 constant": dict(S.NAIVE, amp=0.0 + 1e-9),
    "L1 independent Gaussian": S.NAIVE,
    "L2 + AR(1) memory": dict(S.NAIVE, dyn="ar1"),
    "L3 + channel correlation": dict(S.NAIVE, dyn="ar1", cross=True),
    "L4 + per-window level and spread": dict(S.NAIVE, dyn="ar1", cross=True, level="window", amp_src="window"),
    "L5 + holds and spikes": dict(S.NAIVE, dyn="ar1", cross=True, level="window", amp_src="window",
                                  hold=0.65, spike=0.01),
}


def reference_auroc(fake_tr, W_tr, fake_te, W_te, seed):
    X = np.vstack([S.stack(S.feature_groups(W_tr)), S.stack(S.feature_groups(fake_tr))])
    y = np.r_[np.ones(len(W_tr)), np.zeros(len(fake_tr))]
    clf = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.1, random_state=seed).fit(X, y)
    Xt = np.vstack([S.stack(S.feature_groups(W_te)), S.stack(S.feature_groups(fake_te))])
    yt = np.r_[np.ones(len(W_te)), np.zeros(len(fake_te))]
    return float(roc_auc_score(yt, clf.predict_proba(Xt)[:, 1]))


def run(seeds=8):
    X, person, _ = D.load()
    res = {}
    for seed in range(seeds):
        tr, lo, te = S.split(person, seed)
        W_tr = X[np.isin(person, tr)]
        W_te = X[np.isin(person, te)]
        fit = S.Fit(W_tr)
        rng = np.random.default_rng(seed)
        makers = {k: (lambda n, g=g: S.generate(g, fit, n, rng)) for k, g in LADDER.items()}
        makers["replay of training people (copies)"] = lambda n: S.replay(W_tr, n, rng)
        makers["stitched 2.5 s segments (copies)"] = lambda n: S.stitch(W_tr, n, rng)
        for name, mk in makers.items():
            a = reference_auroc(mk(len(W_tr)), W_tr, mk(len(W_te)), W_te, seed)
            res.setdefault(name, []).append(a)
    return res


if __name__ == "__main__":
    seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    res = run(seeds)
    with open("results/ladder.txt", "w") as f:
        f.write("generator\tmean\tmin\tmax\tn_seeds\n")
        for k, v in res.items():
            f.write(f"{k}\t{np.mean(v):.3f}\t{np.min(v):.3f}\t{np.max(v):.3f}\t{len(v)}\n")
    print(open("results/ladder.txt").read())
