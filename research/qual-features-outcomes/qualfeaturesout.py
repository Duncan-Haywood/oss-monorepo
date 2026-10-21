"""Feature builders and the budget-sweep for qual-features: qualitative codes next to numeric features,
against bag-of-words and LSA text features, at the same number of labelled outcomes."""
import hashlib
import math
import random
import re

import numpy as np
from sklearn.linear_model import LogisticRegressionCV
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

TOKEN = re.compile(r"[a-z']+")


def numeric_features(text):
    """Five cheap numeric features of a comment: log words, log characters, capital share, ? and ! counts."""
    n_words = len(TOKEN.findall(text.lower()))
    letters = [c for c in text if c.isalpha()]
    caps = sum(c.isupper() for c in letters) / len(letters) if letters else 0.0
    return [math.log1p(n_words), math.log1p(len(text)), caps, text.count("?"), text.count("!")]


def null_outcome(item_id):
    """A coin flip fixed by the item id: no feature can predict it, so any AUC above 0.5 is leakage or luck."""
    return hashlib.sha256(item_id.encode()).digest()[0] & 1


def flip_codes(codes, rate, rng):
    """Simulated coder error: each 0/1 cell of `codes` (list of rows) flips independently with probability `rate`."""
    if rate <= 0:
        return [list(r) for r in codes]
    return [[c ^ (rng.random() < rate) for c in r] for r in codes]


def fit_auc(Xtr, ytr, Xte, yte, Cs=(0.01, 0.1, 1.0, 10.0)):
    """Standardise, fit an L2 logistic regression with C picked by 3-fold CV on the training rows, return test AUC.
    Returns None when the training sample has one class only or too few of the rarer class for 3 folds."""
    ytr = np.asarray(ytr)
    if min(ytr.sum(), len(ytr) - ytr.sum()) < 3:
        return None
    sc = StandardScaler(with_mean=not hasattr(Xtr, "tocsr"))
    clf = LogisticRegressionCV(Cs=list(Cs), cv=3, scoring="roc_auc", max_iter=300)
    clf.fit(sc.fit_transform(Xtr), ytr)
    return float(roc_auc_score(yte, clf.decision_function(sc.transform(Xte))))


def sweep(blocks, y, test_idx, pool_idx, sizes, reps, seed, combos):
    """Mean and sd of test AUC for each (feature combination, labelled size), over `reps` random draws of the
    labelled sample from `pool_idx`. `blocks` maps a name to an (items x d) array or sparse matrix;
    `combos` maps a combination name to a list of block names that are concatenated."""
    from scipy.sparse import hstack, issparse
    y = np.asarray(y)
    out = {}
    for n in sizes:
        for name, parts in combos.items():
            aucs = []
            for r in range(reps):
                rng = random.Random(f"{seed}/{n}/{r}")
                idx = np.array(rng.sample(list(pool_idx), n))
                mats = [blocks[p] for p in parts]
                X = hstack(mats).tocsr() if any(issparse(m) for m in mats) else np.hstack(mats)
                a = fit_auc(X[idx], y[idx], X[test_idx], y[test_idx])
                if a is not None:
                    aucs.append(a)
            out[(name, n)] = (float(np.mean(aucs)), float(np.std(aucs)), len(aucs)) if aucs else (float("nan"), 0.0, 0)
    return out
