"""Independent reference values for ordinal-regression's engine tests.

    PY=$(python3 platform/ci/pyenv.py numpy scipy statsmodels pandas)
    $PY ventures/ordinal-regression/eval/reference.py > ventures/ordinal-regression/eval/reference.json

What it computes, and with what:

* The proportional-odds fits (logit and probit links) by statsmodels'
  OrderedModel, fitted by Newton's method to a gradient below 1e-8.
  statsmodels parametrises the thresholds as the first one and the logs of
  the gaps; the thresholds and their standard errors here are mapped back to
  the plain thresholds by the delta method (Jacobian of the cumulative sum
  of exp).
* The null log-likelihood from the marginal proportions,
  sum n_j log(n_j / n), in closed form.
* Brant's (1990) Wald test of proportional odds, computed here from its
  definition with numpy: J - 1 separate binary logits (statsmodels Logit) for
  Y > j, the cross-covariance (X'W_j X)^-1 X'W_jl X (X'W_l X)^-1 with
  w_jl = pi_l - pi_j pi_l for j < l, and the Wald statistic of equal slopes.
  The JavaScript engine computes the same test with its own Newton code; the
  test checks the two agree.
* A size check of the Brant test under proportional odds: 400 simulated
  data sets (seeded) from a true proportional-odds model; the share of
  p-values below 0.05 is recorded, not asserted to equal 0.05.

The simulated data sets are written to eval/*.csv so the JavaScript tests
read exactly the rows this script fitted.
"""

import json
import os
import sys

import numpy as np
import pandas as pd
import scipy
import statsmodels
import statsmodels.api as sm
from scipy import stats
from statsmodels.miscmodels.ordinal_model import OrderedModel

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def ordered_fit(y_codes, X, names, distr):
    """y_codes: 0..J-1 integer codes. X: n x K array."""
    J = int(y_codes.max()) + 1
    endog = pd.Series(pd.Categorical(y_codes, categories=list(range(J)), ordered=True))
    exog = pd.DataFrame(X, columns=names)
    m = OrderedModel(endog, exog, distr=distr)
    r = m.fit(method="newton", maxiter=200, disp=0, tol=1e-12)
    # polish with a second Newton run from the solution
    r = m.fit(start_params=r.params.values, method="newton", maxiter=200, disp=0, tol=1e-14)
    p = r.params.values
    cov = r.cov_params().values
    K = len(names)
    beta = p[:K]
    raw = p[K:]
    th = np.cumsum(np.concatenate([[raw[0]], np.exp(raw[1:])]))
    # Jacobian of thresholds w.r.t. raw parameters
    Jm = np.zeros((J - 1, J - 1))
    for i in range(J - 1):
        Jm[i, 0] = 1.0
        for k in range(1, i + 1):
            Jm[i, k] = np.exp(raw[k])
    cth = Jm @ cov[K:, K:] @ Jm.T
    grad = m.score(p)
    counts = np.bincount(y_codes, minlength=J)
    n = len(y_codes)
    ll0 = float(np.sum(counts * np.log(counts / n)))
    return {
        "link": distr,
        "names": names,
        "beta": beta.tolist(),
        "beta_se": np.sqrt(np.diag(cov[:K, :K])).tolist(),
        "thresholds": th.tolist(),
        "threshold_se": np.sqrt(np.diag(cth)).tolist(),
        "loglik": float(r.llf),
        "null_loglik": ll0,
        "max_abs_gradient": float(np.max(np.abs(grad))),
        "probs_first5": m.predict(p, exog=exog.iloc[:5]).tolist(),
    }


def brant(y_codes, X, names):
    J = int(y_codes.max()) + 1
    n, K = X.shape
    Xc = np.column_stack([np.ones(n), X])
    fits, pis, invs = [], [], []
    for j in range(J - 1):
        yj = (y_codes > j).astype(float)
        r = sm.Logit(yj, Xc).fit(method="newton", maxiter=100, disp=0, tol=1e-12)
        pi = r.predict(Xc)
        fits.append(r.params)
        pis.append(pi)
        invs.append(np.linalg.inv(Xc.T @ (Xc * (pi * (1 - pi))[:, None])))
    M = J - 1
    big = np.zeros((M * K, M * K))
    for a in range(M):
        for b in range(M):
            if a == b:
                V = invs[a]
            else:
                j, l = min(a, b), max(a, b)
                w = pis[l] - pis[j] * pis[l]
                V = invs[j] @ (Xc.T @ (Xc * w[:, None])) @ invs[l]
                if a > b:
                    V = V.T
            big[a * K:(a + 1) * K, b * K:(b + 1) * K] = V[1:, 1:]
    bstar = np.concatenate([f[1:] for f in fits])
    D = np.zeros(((M - 1) * K, M * K))
    for i in range(M - 1):
        D[i * K:(i + 1) * K, 0:K] = np.eye(K)
        D[i * K:(i + 1) * K, (i + 1) * K:(i + 2) * K] = -np.eye(K)
    db = D @ bstar
    chi = float(db @ np.linalg.solve(D @ big @ D.T, db))
    out = {"omnibus": {"chi2": chi, "df": (M - 1) * K, "p": float(stats.chi2.sf(chi, (M - 1) * K))}, "by": [], "binary_slopes": [f[1:].tolist() for f in fits]}
    for k in range(K):
        rows = [i * K + k for i in range(M - 1)]
        Dk = D[rows]
        dbk = Dk @ bstar
        ck = float(dbk @ np.linalg.solve(Dk @ big @ Dk.T, dbk))
        out["by"].append({"name": names[k], "chi2": ck, "df": M - 1, "p": float(stats.chi2.sf(ck, M - 1))})
    return out


def wine():
    d = pd.read_csv(os.path.join(ROOT, "data", "red-wine-quality.csv"))
    names = [c for c in d.columns if c != "quality"]
    levels = sorted(d.quality.unique())
    y = np.array([levels.index(v) for v in d.quality])
    X = d[names].to_numpy(float)
    return {
        "file": "data/red-wine-quality.csv",
        "levels": [int(v) for v in levels],
        "logit": ordered_fit(y, X, names, "logit"),
        "probit": ordered_fit(y, X, names, "probit"),
        "brant": brant(y, X, names),
    }


def simulate(n, beta, cuts, rng, X=None, nonpo=0.0):
    K = len(beta)
    if X is None:
        X = rng.normal(size=(n, K))
    eta = X @ np.asarray(beta)
    u = rng.uniform(size=n)
    # latent logistic; with nonpo != 0 the first predictor's slope differs above the middle cut
    y = np.zeros(n, dtype=int)
    for j, c in enumerate(cuts):
        shift = nonpo * X[:, 0] if j >= len(cuts) // 2 else 0.0
        p_above = 1 / (1 + np.exp(-(eta + shift - c)))
        y += (u < p_above).astype(int)
    return X, y


def survey(rng):
    """A simulated Likert survey with a three-level group and a numeric covariate."""
    n = 400
    labels = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
    groups = rng.choice(["control", "brochure", "workshop"], size=n, p=[0.4, 0.3, 0.3])
    age = np.round(rng.uniform(18, 75, size=n))
    eta = 0.6 * (groups == "brochure") + 1.3 * (groups == "workshop") - 0.02 * (age - 45)
    cuts = np.array([-2.0, -0.7, 0.4, 1.8])
    u = rng.logistic(size=n)
    y = np.searchsorted(cuts, eta + u)  # 0..4
    df = pd.DataFrame({"group": groups, "age": age.astype(int), "answer": [labels[i] for i in y]})
    path = os.path.join(HERE, "survey.csv")
    df.to_csv(path, index=False)
    X = np.column_stack([(groups == "brochure").astype(float), (groups == "workshop").astype(float), age])
    names = ["group: brochure", "group: workshop", "age"]
    return {
        "file": "eval/survey.csv",
        "levels": labels,
        "reference_group": "control",
        "logit": ordered_fit(y, X, names, "logit"),
        "probit": ordered_fit(y, X, names, "probit"),
        "brant": brant(y, X, names),
    }


def nonpo(rng):
    X, y = simulate(1500, [0.8, -0.5], [-1.5, -0.3, 0.6, 1.8], rng, nonpo=1.2)
    df = pd.DataFrame({"x1": np.round(X[:, 0], 4), "x2": np.round(X[:, 1], 4), "y": y + 1})
    df.to_csv(os.path.join(HERE, "nonpo.csv"), index=False)
    X = df[["x1", "x2"]].to_numpy(float)
    yy = df.y.to_numpy() - 1
    return {"file": "eval/nonpo.csv", "truth": "x1's slope is 0.8 below the middle cut and 2.0 above it; x2 is proportional", "logit": ordered_fit(yy, X, ["x1", "x2"], "logit"), "brant": brant(yy, X, ["x1", "x2"])}


def size_check(rng, reps=400):
    ps = []
    for _ in range(reps):
        X, y = simulate(300, [0.7, -0.4], [-1.2, 0.0, 1.2], rng)
        if len(np.unique(y)) < 4:
            continue
        ps.append(brant(y, X, ["x1", "x2"])["omnibus"]["p"])
    ps = np.array(ps)
    return {"reps": int(len(ps)), "n": 300, "levels": 4, "share_p_below_0.05": float(np.mean(ps < 0.05)), "share_p_below_0.10": float(np.mean(ps < 0.10))}


def main():
    rng = np.random.default_rng(20261119)
    out = {
        "generated_by": "eval/reference.py",
        "versions": {"numpy": np.__version__, "scipy": scipy.__version__, "statsmodels": statsmodels.__version__, "pandas": pd.__version__},
        "wine": wine(),
        "survey": survey(rng),
        "nonpo": nonpo(rng),
        "brant_size": size_check(rng),
    }
    json.dump(out, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
