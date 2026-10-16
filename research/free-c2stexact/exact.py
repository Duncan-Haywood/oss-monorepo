"""Size and power of three significance rules for a classifier two-sample test (C2ST) on pendulum twins.

Reuses the simulator and features of ../mimic-twinc2st. Rules, all one-sided at alpha:
  cv_naive   5-fold cross-validated pooled AUROC, p-value from the Mann-Whitney (rank-sum) normal approximation
             as if the n+n out-of-fold scores were independent (they are not: every score comes from a model
             trained on the others' data).
  cv_fold_t  one-sample t-test that the mean of the 5 per-fold AUROCs exceeds 0.5 (the folds are not independent).
  holdout    train on half of the data, score the other half, exact-null Mann-Whitney p-value. With the training
             half independent of the test half, the test scores of the two classes are exchangeable under the
             null, so the rank-sum test is valid for any classifier.
Stylised and simulated only.
"""
import sys
from pathlib import Path
import numpy as np
from scipy import stats
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mimic-twinc2st"))
import twin  # noqa: E402

REAL = dict(visc=0.1, coul=0.3, sd=0.02, kind="student3")


def clf(seed):
    return HistGradientBoostingClassifier(max_iter=60, learning_rate=0.15, random_state=seed)


def mw_p(scores_pos, scores_neg):
    """One-sided p-value that scores_pos tend to exceed scores_neg (rank-sum, normal approximation, tie-corrected)."""
    return float(stats.mannwhitneyu(scores_pos, scores_neg, alternative="greater", method="asymptotic").pvalue)


def three_pvalues(real, twin_x, feat, seed=0):
    """p-values of the three rules for one pair of samples (rows = trajectories)."""
    X = twin.features(np.vstack([real, twin_x]), feat)
    y = np.r_[np.ones(len(real)), np.zeros(len(twin_x))].astype(int)
    p = np.empty(len(y))
    fold_auc = []
    for tr, te in StratifiedKFold(5, shuffle=True, random_state=seed).split(X, y):
        s = clf(seed).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
        p[te] = s
        fold_auc.append(roc_auc_score(y[te], s))
    cv_naive = mw_p(p[y == 1], p[y == 0])
    fa = np.array(fold_auc)
    t = stats.ttest_1samp(fa, 0.5, alternative="greater")
    cv_fold_t = float(t.pvalue)
    tr, te = train_test_split(np.arange(len(y)), test_size=0.5, stratify=y, random_state=seed)
    s = clf(seed).fit(X[tr], y[tr]).predict_proba(X[te])[:, 1]
    holdout = mw_p(s[y[te] == 1], s[y[te] == 0])
    return dict(cv_naive=cv_naive, cv_fold_t=cv_fold_t, holdout=holdout)


def replicate(seed, n, twin_params, feat):
    r = np.random.default_rng(seed)
    real = twin.dataset(r, n, REAL["visc"], REAL["coul"], REAL["sd"], REAL["kind"])[2]
    tw = twin.dataset(r, n, twin_params["visc"], twin_params["coul"], twin_params["sd"], twin_params["kind"])[2]
    return three_pvalues(real, tw, feat, seed)


def wilson(k, n, z=1.96):
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h
