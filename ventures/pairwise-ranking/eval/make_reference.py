"""Independent reference fits for pairwise-ranking's tests.

Run with Python 3.13, numpy 2, scipy 1.16 and statsmodels 0.14:

    python3 eval/make_reference.py > eval/reference.json

Nothing here is shared with engine.mjs. Two independent routes:

* Binary models (ties dropped, or counted as half a win each), with or
  without a home term: a logistic regression in statsmodels (GLM, binomial
  family) on a +1/-1 design matrix, the textbook way to fit Bradley-Terry
  (Agresti, Categorical Data Analysis, 3rd ed., section 11.6).
* Davidson's (1970) tie model, with an optional home factor, and any model
  with a normal prior: the likelihood written directly in Davidson's form,
    P(i wins) = H p_i / (H p_i + p_j + nu sqrt(H p_i p_j)),
  maximised by scipy's BFGS from a non-zero start, with standard errors from
  a central-difference Hessian.

Strengths are centred to mean zero, with the covariance transformed to
match, so they compare one-for-one with the engine's output.
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np
import scipy
import statsmodels
import statsmodels.api as sm
from scipy.optimize import minimize
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components

HERE = Path(__file__).resolve().parent


def load_pl():
    games = []
    with open(HERE.parent / "data" / "premier-league-2023-24.csv", newline="") as f:
        for r in csv.DictReader(f):
            x, y = int(r["home_goals"]), int(r["away_goals"])
            games.append((r["home"], r["away"], "i" if x > y else "j" if x < y else "tie"))
    return games


def players_of(games):
    return sorted({g[0] for g in games} | {g[1] for g in games})


def centre(beta_full, cov_free, n, free_idx):
    """beta_full: n strengths (reference ones at 0). cov_free: covariance of the
    free strengths. Returns centred strengths and their covariance."""
    m = len(free_idx)
    A = np.zeros((n, m))
    for q, k in enumerate(free_idx):
        A[k, q] = 1.0
    C = np.eye(n) - np.ones((n, n)) / n
    lam = C @ beta_full
    cov = C @ A @ cov_free @ A.T @ C.T
    return lam, cov


def glm_fit(games, home, ties):
    """ties: 'drop' or 'half'."""
    pl = players_of(games)
    n = len(pl)
    idx = {p: k for k, p in enumerate(pl)}
    rows, y = [], []
    for a, b, o in games:
        if o == "tie" and ties == "drop":
            continue
        x = np.zeros(n - 1 + (1 if home else 0))
        i, j = idx[a], idx[b]
        if i < n - 1:
            x[i] += 1
        if j < n - 1:
            x[j] -= 1
        if home:
            x[n - 1] = 1
        rows.append(x)
        y.append(1.0 if o == "i" else 0.0 if o == "j" else 0.5)
    X, y = np.array(rows), np.array(y)
    res = sm.GLM(y, X, family=sm.families.Binomial()).fit(tol=1e-13, maxiter=200)
    params, cov = np.asarray(res.params), np.asarray(res.cov_params())
    beta = np.concatenate([params[: n - 1], [0.0]])
    lam, covc = centre(beta, cov[: n - 1, : n - 1], n, list(range(n - 1)))
    out = {"players": pl, "lambda": lam.tolist(), "se": np.sqrt(np.diag(covc)).tolist(),
           "loglik": float(res.llf)}
    if home:
        out["alpha"] = float(params[n - 1])
        out["alpha_se"] = float(np.sqrt(cov[n - 1, n - 1]))
    used = [g for g in games if not (g[2] == "tie" and ties == "drop")]
    return used, out


def davidson_negll(theta, data, n, home, tie_model, prior_sd):
    """theta: n-1 log-strengths (last player fixed at 0) or n with a prior,
    then log H (if home), then log nu (if tie_model)."""
    m = n if prior_sd else n - 1
    lam = np.concatenate([theta[:m], [] if prior_sd else [0.0]])
    k = m
    logH = theta[k] if home else 0.0
    k += 1 if home else 0
    lognu = theta[k] if tie_model else -np.inf
    p = np.exp(lam)
    H, nu = np.exp(logH), np.exp(lognu)
    ll = 0.0
    for i, j, o, w in data:
        num_i = H * p[i]
        num_j = p[j]
        num_t = nu * np.sqrt(H * p[i] * p[j]) if tie_model else 0.0
        den = num_i + num_j + num_t
        if o == "i":
            ll += w * np.log(num_i / den)
        elif o == "j":
            ll += w * np.log(num_j / den)
        else:
            ll += w * np.log(num_t / den)
    if prior_sd:
        ll -= 0.5 * np.sum(lam ** 2) / prior_sd ** 2
    return -ll


def num_hessian(f, x, h=1e-4):
    d = len(x)
    H = np.zeros((d, d))
    for a in range(d):
        for b in range(a, d):
            def at(da, db):
                z = x.copy()
                z[a] += da
                z[b] += db
                return f(z)
            v = (at(h, h) - at(h, -h) - at(-h, h) + at(-h, -h)) / (4 * h * h)
            H[a, b] = H[b, a] = v
    return H


def direct_fit(games, home, tie_model, prior_sd=0.0):
    pl = players_of(games)
    n = len(pl)
    idx = {p: k for k, p in enumerate(pl)}
    data = [(idx[a], idx[b], o, 1.0) for a, b, o in games if tie_model or o != "tie"]
    m = n if prior_sd else n - 1
    d = m + (1 if home else 0) + (1 if tie_model else 0)
    x0 = np.full(d, 0.1)
    f = lambda t: davidson_negll(t, data, n, home, tie_model, prior_sd)
    res = minimize(f, x0, method="BFGS", options={"gtol": 1e-10, "maxiter": 5000})
    res = minimize(f, res.x, method="Nelder-Mead", options={"xatol": 1e-12, "fatol": 1e-14, "maxiter": 20000}) if not res.success else res
    theta = res.x
    cov = np.linalg.inv(num_hessian(f, theta))
    if prior_sd:
        lam, covc = centre(theta[:n], cov[:n, :n], n, list(range(n)))
    else:
        beta = np.concatenate([theta[: n - 1], [0.0]])
        lam, covc = centre(beta, cov[: n - 1, : n - 1], n, list(range(n - 1)))
    out = {"players": pl, "lambda": lam.tolist(), "se": np.sqrt(np.diag(covc)).tolist(), "loglik": float(-res.fun)}
    k = m
    if home:
        out["alpha"], out["alpha_se"] = float(theta[k]), float(np.sqrt(cov[k, k]))
        k += 1
    if tie_model:
        out["delta"], out["delta_se"] = float(theta[k]), float(np.sqrt(cov[k, k]))
    return out


def strongly_connected(games):
    pl = players_of(games)
    idx = {p: k for k, p in enumerate(pl)}
    r, c = [], []
    for a, b, o in games:
        i, j = idx[a], idx[b]
        if o in ("i", "tie"):
            r.append(i); c.append(j)
        if o in ("j", "tie"):
            r.append(j); c.append(i)
    g = csr_matrix((np.ones(len(r)), (r, c)), shape=(len(pl), len(pl)))
    return connected_components(g, directed=True, connection="strong")[0] == 1


def random_games(rng, n, games_per_pair, tie_rate, home_adv):
    names = [f"P{k:02d}" for k in range(n)]
    lam = rng.normal(0, 0.8, n)
    games = []
    for i in range(n):
        for j in range(n):
            if i == j or rng.random() < 0.3:
                continue
            for _ in range(games_per_pair):
                ui, uj = lam[i] + home_adv, lam[j]
                ut = np.log(tie_rate) + (ui + uj) / 2 if tie_rate else -np.inf
                p = np.exp([ui, uj, ut]); p /= p.sum()
                o = rng.choice(["i", "j", "tie"], p=p)
                games.append((names[i], names[j], str(o)))
    return games


def main():
    pl = load_pl()
    cases = []
    for name, home, ties in [("pl-decisive-plain", False, "drop"), ("pl-decisive-home", True, "drop"), ("pl-half-home", True, "half")]:
        used, ref = glm_fit(pl, home, ties)
        cases.append({"name": name, "method": "statsmodels GLM binomial", "home": home, "ties": ties, "priorSd": 0, "games": [list(g) for g in pl], **ref})
    for name, home in [("pl-davidson-home", True), ("pl-davidson-neutral", False)]:
        cases.append({"name": name, "method": "scipy BFGS, Davidson likelihood", "home": home, "ties": "davidson", "priorSd": 0, "games": [list(g) for g in pl], **direct_fit(pl, home, True)})
    rng = np.random.default_rng(20261118)
    made = 0
    while made < 24:
        n = int(rng.integers(3, 11))
        home = bool(made % 2)
        tie_rate = [0.0, 0.4, 0.9][made % 3]
        games = random_games(rng, n, int(rng.integers(1, 4)), tie_rate, 0.35 if home else 0.0)
        if not games or not strongly_connected(games):
            continue
        has_tie = any(g[2] == "tie" for g in games)
        if has_tie:
            ref = {"method": "scipy BFGS, Davidson likelihood", "ties": "davidson", **direct_fit(games, home, True)}
        else:
            ref = {"method": "statsmodels GLM binomial", "ties": "drop", **glm_fit(games, home, "drop")[1]}
        # Skip draws whose maximum is at (or near) infinity: Ford's condition
        # covers the strengths, not a home or tie term, and an optimiser's
        # stopping point on a ridge is not a reference value. The engine's
        # handling of those cases has its own test.
        if max(abs(v) for v in ref["lambda"] + [ref.get("alpha", 0), ref.get("delta", 0)]) > 6:
            continue
        cases.append({"name": f"random-{made}", "home": home, "priorSd": 0, "games": [list(g) for g in games], **ref})
        made += 1
    # A result set with no finite MLE, fitted with a normal prior.
    games = [("A", "B", "i"), ("A", "C", "i"), ("B", "C", "i"), ("C", "B", "tie"), ("B", "D", "j"), ("D", "C", "i"), ("C", "D", "i")]
    cases.append({"name": "prior-unbeaten", "method": "scipy BFGS, Davidson likelihood with normal prior", "home": False, "ties": "davidson", "priorSd": 1.5, "games": [list(g) for g in games], **direct_fit(games, False, True, 1.5)})
    json.dump({"tool": f"numpy {np.__version__}, scipy {scipy.__version__}, statsmodels {statsmodels.__version__}", "python": sys.version.split()[0], "cases": cases}, sys.stdout, indent=None)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
