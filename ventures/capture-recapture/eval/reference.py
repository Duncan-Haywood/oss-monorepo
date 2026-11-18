"""Independent reference for engine.mjs (run: python3 eval/reference.py > eval/reference.json).

engine.mjs profiles the nuisance probabilities out in closed form from the
sufficient statistics (n_j, u_j, M_j). This script does not: it enumerates
every one of the 2^k capture histories, builds each cell probability from
the model's parameters, and maximises the full multinomial log-likelihood
over those parameters numerically (scipy.optimize.minimize on logits) for
each N. The log-likelihood at whole-number N is checked against
scipy.stats.multinomial.logpmf. The whole-number MLE is found by scanning N,
and the profile-likelihood limits by scipy.optimize.brentq on continuous N.
Chi-square quantiles come from scipy.stats.chi2.
"""
import itertools, json
import numpy as np
import scipy
from scipy import optimize, stats
from scipy.special import gammaln, expit

rng = np.random.default_rng(20261118)

def cell_probs(model, theta, k):
    hs = list(itertools.product([0, 1], repeat=k))
    if model == "M0":
        p = [expit(theta[0])] * k
        probs = [np.prod([p[j] if h[j] else 1 - p[j] for j in range(k)]) for h in hs]
    elif model == "Mt":
        p = expit(np.asarray(theta))
        probs = [np.prod([p[j] if h[j] else 1 - p[j] for j in range(k)]) for h in hs]
    else:  # Mb: p before first capture, c after
        p, c = expit(theta[0]), expit(theta[1])
        probs = []
        for h in hs:
            pr, seen = 1.0, False
            for x in h:
                q = c if seen else p
                pr *= q if x else 1 - q
                seen = seen or bool(x)
            probs.append(pr)
    return hs, np.array(probs)

NPAR = {"M0": lambda k: 1, "Mt": lambda k: k, "Mb": lambda k: 2}

def loglik(model, theta, N, counts, k):
    hs, probs = cell_probs(model, theta, k)
    r = sum(counts.values())
    ll = gammaln(N + 1) - gammaln(N - r + 1)
    for h, pr in zip(hs, probs):
        n = counts.get(h, 0) if any(h) else 0
        if any(h):
            ll += -gammaln(n + 1) + (n * np.log(pr) if n else 0.0)
        else:
            ll += (N - r) * np.log(pr) if N > r else 0.0
    return ll

def profile(model, N, counts, k):
    npar = NPAR[model](k)
    best = None
    for start in (np.zeros(npar), np.full(npar, -1.5), np.full(npar, 1.0)):
        res = optimize.minimize(lambda t: -loglik(model, t, N, counts, k), start, method="L-BFGS-B", options={"ftol": 1e-15, "gtol": 1e-11, "maxiter": 5000})
        if best is None or res.fun < best.fun:
            best = res
    return -best.fun, best.x

def check_scipy(model, N, counts, k, theta):
    hs, probs = cell_probs(model, theta, k)
    r = sum(counts.values())
    x = [counts.get(h, 0) if any(h) else N - r for h in hs]
    # scipy's multinomial includes log N! - sum log x!; ours drops log (N-r)! into the same place.
    return float(stats.multinomial.logpmf(x, N, probs))

def fit(model, counts, k, conf=0.95):
    r = sum(counts.values())
    L = lambda N: profile(model, N, counts, k)[0]
    # whole-number scan: coarse, then every integer near the coarse best
    grid = sorted(set(int(round(r + t)) for t in np.concatenate([[0, 1, 2, 3, 5], np.geomspace(1, r * 200, 120)])))
    vals = [L(N) for N in grid]
    i = int(np.argmax(vals))
    if i == len(grid) - 1:
        return None
    lo, hi = grid[max(0, i - 1)], grid[min(len(grid) - 1, i + 1)]
    ints = list(range(lo, hi + 1))
    ivals = [L(N) for N in ints]
    j = int(np.argmax(ivals))
    Nhat = ints[j]
    # profile limits on continuous N, around the continuous maximum
    cont = optimize.minimize_scalar(lambda N: -L(N), bounds=(r, hi + 1), method="bounded", options={"xatol": 1e-9})
    lmax = max(-cont.fun, ivals[j])
    target = lmax - stats.chi2.ppf(conf, 1) / 2
    g = lambda N: L(N) - target
    lower = float(r) if g(r) >= 0 else optimize.brentq(g, r, cont.x, xtol=1e-10)
    up = max(cont.x * 2, r + 1)
    while g(up) > 0 and up < r * 1e5:
        up *= 2
    upper = None if g(up) > 0 else optimize.brentq(g, cont.x, up, xtol=1e-10)
    ll_int, theta = profile(model, Nhat, counts, k)
    return {"N": Nhat, "logLikAtN": ll_int, "lower": lower, "upper": upper, "scipyLogpmf": check_scipy(model, Nhat, counts, k, theta), "ownAtN": loglik(model, theta, Nhat, counts, k)}

def simulate(N, p_fn, k):
    counts = {}
    for i in range(N):
        h = tuple(int(rng.random() < p_fn(i, j)) for j in range(k))
        if any(h):
            counts[h] = counts.get(h, 0) + 1
    return counts

cases = []
specs = [
    ("M0 N=200 p=0.25 k=4", 200, 4, lambda i, j: 0.25),
    ("Mt N=150 k=3", 150, 3, lambda i, j: [0.3, 0.15, 0.4][j]),
    ("Mt N=80 k=5", 80, 5, lambda i, j: [0.2, 0.35, 0.3, 0.1, 0.25][j]),
    ("M0 N=60 p=0.4 k=2", 60, 2, lambda i, j: 0.4),
]
hp = rng.beta(1.5, 4, 300)
specs.append(("Mh N=300 beta(1.5,4) k=4", 300, 4, lambda i, j: hp[i]))
for name, N, k, pf in specs:
    cases.append({"name": name, "k": k, "counts": simulate(N, pf, k)})
# Mb: trap-happy, by sequential simulation
counts = {}
for i in range(120):
    h, seen = [], False
    for j in range(4):
        x = int(rng.random() < (0.45 if seen else 0.2))
        h.append(x); seen = seen or bool(x)
    if any(h):
        counts[tuple(h)] = counts.get(tuple(h), 0) + 1
cases.append({"name": "Mb N=120 p=0.2 c=0.45 k=4", "k": 4, "counts": counts})

out = {"versions": {"numpy": np.__version__, "scipy": scipy.__version__}, "cases": [], "chi2": []}
for c in cases:
    entry = {"name": c["name"], "histories": ["".join(map(str, h)) for h in c["counts"]], "counts": list(c["counts"].values()), "models": {}}
    for model in ("M0", "Mt", "Mb"):
        entry["models"][model] = fit(model, c["counts"], c["k"])
    out["cases"].append(entry)
for conf in (0.8, 0.9, 0.95, 0.99):
    out["chi2"].append({"p": conf, "q": float(stats.chi2.ppf(conf, 1)), "z": float(stats.norm.ppf((1 + conf) / 2))})
print(json.dumps(out, indent=1))
