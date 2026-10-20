"""Permutation-calibrated cross-validated C2ST on pendulum twins.

Statistic: pooled out-of-fold AUROC of a 5-fold cross-validated boosted-tree classifier on n real + n twin trajectories.
Rule `cv_perm`: refit the whole cross-validation on B label permutations; p = (1 + #{null stat >= observed}) / (B + 1).
Under the null (real and twin trajectories exchangeable) the labels are exchangeable, so this p-value is valid
for any B and any classifier, at alpha = k / (B + 1) exactly. Compared with `holdout` of ../free-c2stexact
(train on half, rank-sum on the other half), which is also valid but trains on half the data.
Stylised and simulated only.
"""
import sys
from pathlib import Path
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "mimic-twinc2st"))
sys.path.insert(0, str(HERE.parent / "free-c2stexact"))
import twin  # noqa: E402
import exact  # noqa: E402

REAL = exact.REAL


def clf(seed):
    return HistGradientBoostingClassifier(max_iter=60, learning_rate=0.15, random_state=seed)


def cv_auc(X, y, seed=0, folds=5):
    """Pooled out-of-fold AUROC."""
    p = np.empty(len(y))
    for tr, te in StratifiedKFold(folds, shuffle=True, random_state=seed).split(X, y):
        p[te] = clf(seed).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
    return float(roc_auc_score(y, p))


def perm_pvalue(X, y, B, seed=0):
    """Permutation p-value of the cross-validated AUROC. Returns (p, observed, null array)."""
    obs = cv_auc(X, y, seed)
    r = np.random.default_rng(seed + 10_000)
    null = np.array([cv_auc(X, r.permutation(y), seed) for _ in range(B)])
    return (1 + int((null >= obs).sum())) / (B + 1), obs, null


def replicate(seed, n, twin_params, feat, B):
    """Return the cv_perm p-value together with the free-c2stexact holdout and cv_naive p-values on the same data."""
    r = np.random.default_rng(seed)
    real = twin.dataset(r, n, REAL["visc"], REAL["coul"], REAL["sd"], REAL["kind"])[2]
    tw = twin.dataset(r, n, twin_params["visc"], twin_params["coul"], twin_params["sd"], twin_params["kind"])[2]
    base = exact.three_pvalues(real, tw, feat, seed)
    X = twin.features(np.vstack([real, tw]), feat)
    y = np.r_[np.ones(n), np.zeros(n)].astype(int)
    p, _, _ = perm_pvalue(X, y, B, seed)
    return dict(cv_naive=base["cv_naive"], holdout=base["holdout"], cv_perm=p)
