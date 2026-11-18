"""Reference numbers for reference.test.mjs, from statsmodels and scipy run as
external programs (no code from them is in the engine).

- Probit: statsmodels Probit (Newton), params and cov_params().
- OLS on the selected rows: statsmodels OLS, nonrobust, HC1 and cluster.
- Heckman two-step: the probit above, then statsmodels OLS with the inverse
  Mills ratio (scipy norm.pdf / norm.cdf); the Heckman-Greene covariance is
  written here in numpy from Greene (1981), separately from the engine.
- Maximum likelihood: the log-likelihood written here with scipy's
  norm.logcdf, maximised by scipy BFGS then Nelder-Mead from the two-step
  start and polished by Newton steps on statsmodels' numerical gradient and
  Hessian; covariance from statsmodels' numerical Hessian (approx_hess3) of
  the log-likelihood and, for robust and
  clustered errors, its numerical per-row scores (approx_fprime of
  loglikeobs). No analytic gradient is used, so this checks the engine's.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
import statsmodels
import statsmodels.api as sm
from scipy.optimize import minimize
from scipy.stats import norm
from statsmodels.tools.numdiff import approx_fprime, approx_hess3

HERE = Path(__file__).resolve().parent
DATA = "data/wages-simulated.csv"
df = pd.read_csv(HERE.parent / DATA)
df["region"] = df["region"].astype(str)


def design(cols, frame):
    parts = [pd.Series(1.0, index=frame.index, name="const")]
    for c in cols:
        if c == "region":
            dm = pd.get_dummies(frame[c], prefix=c, prefix_sep="=", dtype=float)
            parts.append(dm[sorted(dm.columns)[1:]])
        else:
            parts.append(frame[c].astype(float))
    return pd.concat(parts, axis=1)


def loglikeobs(theta, X, Z, s, y):
    kx, kz = X.shape[1], Z.shape[1]
    b, g = theta[:kx], theta[kx:kx + kz]
    rho, sigma = np.tanh(theta[kx + kz]), np.exp(theta[kx + kz + 1])
    c = Z @ g
    out = norm.logcdf(-c)
    sel = s == 1
    e = (y[sel] - X[sel] @ b) / sigma
    A = (c[sel] + rho * e) / np.sqrt(1 - rho**2)
    out[sel] = norm.logcdf(A) - np.log(sigma) + norm.logpdf(e)
    return out


def case(name, xcols, zextra):
    zcols = xcols + [c for c in zextra if c not in xcols]
    s = df["works"].to_numpy()
    Zdf = design(zcols, df)
    Z = Zdf.to_numpy()
    sel = s == 1
    Xfull = design(xcols, df)
    X = np.zeros_like(Xfull.to_numpy())
    X[sel] = Xfull.to_numpy()[sel]
    y = np.where(sel, df["log_wage"].fillna(0).to_numpy(), 0.0)
    Xs, ys = X[sel], y[sel]
    counties = df["county"].to_numpy()

    pr = sm.Probit(s, Z).fit(method="newton", tol=1e-14, maxiter=100, disp=0)
    gamma, Vg = pr.params, pr.cov_params()

    ols = {}
    for se, kw in [("conventional", {}), ("robust", {"cov_type": "HC1"}), ("clustered", {"cov_type": "cluster", "cov_kwds": {"groups": counties[sel]}})]:
        f = sm.OLS(ys, Xs).fit(**kw)
        ols[se] = {"params": f.params.tolist(), "se": f.bse.tolist()}

    c = Z[sel] @ gamma
    lam = norm.pdf(c) / norm.cdf(c)
    Xstar = np.column_stack([Xs, lam])
    two = sm.OLS(ys, Xstar).fit()
    bl = two.params[-1]
    delta = lam * (lam + c)
    n1 = len(ys)
    sigma = np.sqrt(two.ssr / n1 + bl**2 * delta.mean())
    rho = bl / sigma
    XXi = np.linalg.inv(Xstar.T @ Xstar)
    F = (Xstar * delta[:, None]).T @ Z[sel]
    Q = rho**2 * F @ Vg @ F.T
    mid = (Xstar * (1 - rho**2 * delta)[:, None]).T @ Xstar + Q
    V = sigma**2 * XXi @ mid @ XXi
    lam_r2 = sm.OLS(lam, Xs).fit().rsquared

    start = np.concatenate([two.params[:-1], gamma, [np.arctanh(np.clip(rho, -0.9, 0.9))], [np.log(sigma)]])
    negll = lambda t: -loglikeobs(t, X, Z, s, y).sum()
    bf = minimize(negll, start, method="BFGS", options={"gtol": 1e-10, "maxiter": 5000})
    res = minimize(negll, bf.x, method="Nelder-Mead", options={"xatol": 1e-12, "fatol": 1e-13, "maxiter": 200000, "maxfev": 400000})
    th = res.x if res.fun <= bf.fun else bf.x
    # polish with Newton steps on statsmodels' numerical gradient and Hessian
    for _ in range(8):
        gr = approx_fprime(th, lambda t: loglikeobs(t, X, Z, s, y).sum(), centered=True)
        H = approx_hess3(th, lambda t: loglikeobs(t, X, Z, s, y).sum())
        th = th - np.linalg.solve(H, gr)
    H = approx_hess3(th, lambda t: loglikeobs(t, X, Z, s, y).sum())
    Hinv = np.linalg.inv(-H)
    G = approx_fprime(th, lambda t: loglikeobs(t, X, Z, s, y), centered=True)
    covs = {"conventional": Hinv}
    covs["robust"] = Hinv @ (G.T @ G) @ Hinv
    ids = pd.factorize(counties)[0]
    Gc = np.zeros((ids.max() + 1, G.shape[1]))
    np.add.at(Gc, ids, G)
    ng = Gc.shape[0]
    covs["clustered"] = Hinv @ (Gc.T @ Gc) @ Hinv * ng / (ng - 1)
    ll = loglikeobs(th, X, Z, s, y).sum()
    ll_indep = pr.llf + (-n1 / 2) * (np.log(2 * np.pi) + np.log(sm.OLS(ys, Xs).fit().ssr / n1) + 1)

    return {
        "name": name, "regressors": xcols, "selection": zextra,
        "x_names": list(Xfull.columns), "z_names": list(Zdf.columns),
        "probit": {"params": gamma.tolist(), "se": np.sqrt(np.diag(Vg)).tolist(), "llf": pr.llf, "llnull": pr.llnull},
        "ols": ols,
        "twostep": {"params": two.params.tolist(), "se": np.sqrt(np.diag(V)).tolist(), "sigma": sigma, "rho": rho,
                    "lambda_t": two.tvalues[-1], "lambda_r2": lam_r2},
        "mle": {"params": th.tolist(), "llf": ll, "ll_indep": ll_indep, "grad_max": float(np.abs(approx_fprime(th, lambda t: loglikeobs(t, X, Z, s, y).sum(), centered=True)).max()),
                "se": {k: np.sqrt(np.diag(v)).tolist() for k, v in covs.items()}},
    }


cases = [
    case("full", ["educ", "exper", "exper_sq", "region"], ["kids_under6", "kids_6_18", "other_income"]),
    case("small", ["educ", "exper"], ["kids_under6", "other_income"]),
]
out = {"data": DATA, "outcome": "log_wage", "selected": "works", "cluster": "county",
       "versions": {"statsmodels": statsmodels.__version__, "scipy": scipy.__version__, "numpy": np.__version__, "pandas": pd.__version__},
       "cases": cases}
(HERE / "reference.json").write_text(json.dumps(out, indent=1) + "\n")
for c in cases:
    print(c["name"], "mle ll", round(c["mle"]["llf"], 6), "grad", c["mle"]["grad_max"], "rho", np.tanh(c["mle"]["params"][-2]))
