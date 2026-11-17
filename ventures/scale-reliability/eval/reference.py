"""Independent reference values for engine.test.mjs, written to eval/reference.json.

Run with pingouin, factor_analyzer, numpy, scipy and pandas installed:
    python3 eval/reference.py
Nothing here is imported by the tool; it exists only to check the engine.
- alpha and its Feldt interval: pingouin.cronbach_alpha (listwise deletion; it rounds the
  interval to 3 decimals), and the same interval unrounded from scipy.stats.f.
- standardised one-factor loadings: factor_analyzer FactorAnalyzer(method="minres") on the data.
- unstandardised loadings: scipy.optimize.minimize of the off-diagonal unweighted
  least-squares loss on the covariance matrix (a different algorithm from the engine's
  iterated principal axes).
- lambda-2, lambda-6, standardised alpha, item-rest correlations, alpha if deleted: numpy,
  straight from the formulas.
"""
import json
import pathlib

import factor_analyzer
import numpy as np
import pandas as pd
import pingouin
import scipy
from factor_analyzer import FactorAnalyzer
from scipy.optimize import minimize
from scipy.stats import f

HERE = pathlib.Path(__file__).resolve().parent
CSV = HERE.parent / "data" / "phq9-nhanes-2017-2018.csv"


def alpha(C):
    k = C.shape[0]
    return k / (k - 1) * (1 - np.trace(C) / C.sum())


def uls_loadings(C):
    k = C.shape[0]
    iu = np.triu_indices(k, 1)

    def loss(l):
        return ((C - np.outer(l, l))[iu] ** 2).sum()

    start = np.sqrt(np.clip(np.diag(C) * 0.5, 1e-6, None))
    res = minimize(loss, start, method="BFGS", options={"gtol": 1e-12, "maxiter": 10000})
    l = res.x
    return l if l.sum() > 0 else -l


def omega(l, C):
    u = np.diag(C) - l ** 2
    return float(l.sum() ** 2 / (l.sum() ** 2 + u.sum()))


def main():
    df = pd.read_csv(CSV).drop(columns=["seqn"])
    X = df.dropna().to_numpy(float)
    C = np.cov(X, rowvar=False)
    R = np.corrcoef(X, rowvar=False)
    k = C.shape[0]
    n = X.shape[0]
    a, ci = pingouin.cronbach_alpha(data=df, nan_policy="listwise", ci=0.95)
    off = C - np.diag(np.diag(C))
    l2 = 1 - np.trace(C) / C.sum() + np.sqrt(k / (k - 1) * (off ** 2).sum()) / C.sum()
    l6 = 1 - (1 / np.diag(np.linalg.inv(C))).sum() / C.sum()
    rbar = (R.sum() - k) / (k * (k - 1))
    fa = FactorAnalyzer(n_factors=1, rotation=None, method="minres")
    fa.fit(X)
    ls = fa.loadings_[:, 0]
    ls = ls if ls.sum() > 0 else -ls
    lu = uls_loadings(C)
    items = []
    for i in range(k):
        rest = X[:, [j for j in range(k) if j != i]].sum(axis=1)
        Ci = np.delete(np.delete(C, i, 0), i, 1)
        items.append({
            "name": df.columns[i],
            "itemRest": float(np.corrcoef(X[:, i], rest)[0, 1]),
            "alphaIfDeleted": float(alpha(Ci)),
            "loading": float(lu[i]),
            "standardizedLoading": float(ls[i]),
        })
    out = {
        "data": "data/phq9-nhanes-2017-2018.csv",
        "n": int(X.shape[0]),
        "k": int(k),
        "alpha": float(a),
        "feldt95Pingouin": [float(ci[0]), float(ci[1])],
        "feldt95": [float(1 - (1 - a) * f.ppf(0.975, n - 1, (n - 1) * (k - 1))), float(1 - (1 - a) * f.ppf(0.025, n - 1, (n - 1) * (k - 1)))],
        "standardizedAlpha": float(k * rbar / (1 + (k - 1) * rbar)),
        "lambda2": float(l2),
        "lambda6": float(l6),
        "omega": omega(lu, C),
        "omegaStandardized": omega(ls, R),
        "eigenvalues": [float(v) for v in sorted(np.linalg.eigvalsh(R), reverse=True)],
        "items": items,
        "versions": {"pingouin": pingouin.__version__, "factor_analyzer": "0.5.1", "scikit-learn": __import__("sklearn").__version__, "numpy": np.__version__, "scipy": scipy.__version__, "pandas": pd.__version__},
    }
    (HERE / "reference.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps({k2: v for k2, v in out.items() if k2 not in ("items", "eigenvalues")}, indent=1))


if __name__ == "__main__":
    main()
