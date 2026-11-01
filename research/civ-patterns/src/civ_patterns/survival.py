"""Survival analysis with right censoring and left truncation (delayed entry).

Small and dependency-light (numpy, scipy.optimize) so every number in the write-ups can be traced
to these few functions.

Data convention: for each unit, `entry` is the age at which it comes under observation (0 unless
left-truncated), `time` is the age at exit, and `event` is 1 if the exit was the event (a regime
or polity ending) and 0 if it was censoring (still alive when observation stopped).
"""
import numpy as np
from scipy.optimize import minimize


def kaplan_meier(time, event, entry=None):
    """Product-limit estimate. Returns (t, S) at each distinct event age (step function, S just
    after t). With `entry`, the risk set at age t is the units with entry < t <= time."""
    time = np.asarray(time, float)
    event = np.asarray(event, int)
    entry = np.zeros_like(time) if entry is None else np.asarray(entry, float)
    ts = np.unique(time[event == 1])
    S, out = 1.0, []
    for t in ts:
        at_risk = np.sum((entry < t) & (time >= t))
        d = np.sum((time == t) & (event == 1))
        if at_risk > 0:
            S *= 1 - d / at_risk
        out.append(S)
    return ts, np.array(out)


def km_median(time, event, entry=None):
    t, S = kaplan_meier(time, event, entry)
    below = np.nonzero(S <= 0.5)[0]
    return float(t[below[0]]) if len(below) else float("nan")


def _design(X, n):
    if X is None:
        return np.zeros((n, 0))
    X = np.asarray(X, float)
    return X.reshape(n, -1)


def fit_weibull(time, event, entry=None, X=None, shape=None):
    """Weibull proportional-hazards model: h(t | x) = k/lam (t/lam)**(k-1) exp(x b).

    Cumulative hazard H(t) = (t/lam)**k exp(x b). Log likelihood with delayed entry a:
    sum[event (log h(t))] - sum[H(t) - H(a)]. `shape=1` fixes k = 1 (exponential).
    Returns dict(k, lam, beta, loglik, n_params, aic, cov) where cov is the inverse Hessian of the
    negative log likelihood in the (log k, log lam, beta) parametrisation.
    """
    t = np.maximum(np.asarray(time, float), 1e-9)
    e = np.asarray(event, float)
    n = len(t)
    a = np.zeros(n) if entry is None else np.asarray(entry, float)
    Xm = _design(X, n)
    p = Xm.shape[1]

    def unpack(th):
        if shape is None:
            lk, ll, b = th[0], th[1], th[2:]
        else:
            lk, ll, b = np.log(shape), th[0], th[1:]
        return np.exp(lk), np.exp(ll), b

    def nll(th):
        k, lam, b = unpack(th)
        eta = Xm @ b if p else 0.0
        H = ((t / lam) ** k - (a / lam) ** k) * np.exp(eta)
        logh = np.log(k) - np.log(lam) + (k - 1) * np.log(t / lam) + eta
        return -(np.sum(e * logh) - np.sum(H))

    lam0 = np.log(np.sum(t - a) / max(e.sum(), 1))
    th0 = ([0.0] if shape is None else []) + [lam0] + [0.0] * p
    res = minimize(nll, np.array(th0), method="BFGS")
    res = minimize(nll, res.x, method="Nelder-Mead", options={"maxiter": 20000, "xatol": 1e-8,
                                                             "fatol": 1e-10}) if not res.success else res
    k, lam, b = unpack(res.x)
    cov = _num_cov(nll, res.x)
    npar = len(res.x)
    return {"k": float(k), "lam": float(lam), "beta": np.array(b, float), "loglik": float(-res.fun),
            "n_params": npar, "aic": float(2 * npar + 2 * res.fun), "cov": cov, "theta": res.x,
            "fixed_shape": shape}


def _num_cov(f, x, h=1e-4):
    """Inverse of a central-difference Hessian (standard errors for the fitted parameters)."""
    m = len(x)
    H = np.zeros((m, m))
    for i in range(m):
        for j in range(i, m):
            ei = np.zeros(m); ej = np.zeros(m)
            ei[i] = h; ej[j] = h
            H[i, j] = H[j, i] = (f(x + ei + ej) - f(x + ei - ej) - f(x - ei + ej) + f(x - ei - ej)) / (4 * h * h)
    try:
        return np.linalg.inv(H)
    except np.linalg.LinAlgError:
        return np.full((m, m), np.nan)


def shape_ci(fit, z=1.96):
    """95% Wald interval on the Weibull shape k (log scale)."""
    if fit["fixed_shape"] is not None:
        return (fit["k"], fit["k"])
    se = np.sqrt(fit["cov"][0, 0])
    return (float(np.exp(np.log(fit["k"]) - z * se)), float(np.exp(np.log(fit["k"]) + z * se)))


def cum_hazard(fit, t, X=None):
    t = np.asarray(t, float)
    Xm = _design(X, t.size) if X is not None else np.zeros((t.size, 0))
    eta = Xm @ fit["beta"] if len(fit["beta"]) else 0.0
    return (t / fit["lam"]) ** fit["k"] * np.exp(eta)


def prob_end_within(fit, age, horizon, X=None):
    """P(event before age + horizon | alive at age) = 1 - S(age + h) / S(age)."""
    age = np.asarray(age, float)
    return 1 - np.exp(-(cum_hazard(fit, age + horizon, X) - cum_hazard(fit, age, X)))


def weibull_median(fit, X=None):
    """Median lifetime from birth, for covariate row X (or baseline)."""
    eta = float(np.asarray(X, float) @ fit["beta"]) if X is not None and len(fit["beta"]) else 0.0
    return fit["lam"] * (np.log(2) / np.exp(eta)) ** (1 / fit["k"])


def brier(p, y):
    p = np.asarray(p, float); y = np.asarray(y, float)
    return float(np.mean((p - y) ** 2))


def log_loss(p, y, eps=1e-6):
    p = np.clip(np.asarray(p, float), eps, 1 - eps); y = np.asarray(y, float)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def auc(p, y):
    """Probability a random positive outranks a random negative (ties count half)."""
    p = np.asarray(p, float); y = np.asarray(y, int)
    pos, neg = p[y == 1], p[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    gt = (pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
    return float(gt / (len(pos) * len(neg)))


def bootstrap_diff(p1, p2, y, metric=brier, reps=2000, seed=0):
    """95% percentile interval of metric(p1) - metric(p2) over bootstrap resamples of units."""
    rng = np.random.default_rng(seed)
    p1, p2, y = map(np.asarray, (p1, p2, y))
    n = len(y)
    d = []
    for _ in range(reps):
        i = rng.integers(0, n, n)
        d.append(metric(p1[i], y[i]) - metric(p2[i], y[i]))
    return float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))


class PiecewiseHazard:
    """Piecewise-constant hazard by age band, estimated separately per stratum (events divided by
    time at risk in each band; no proportional-hazards assumption). A band with no exposure in a
    stratum falls back to the pooled rate for that band."""

    def __init__(self, bands=(0, 2, 5, 10, 20, 40, 80, np.inf)):
        self.bands = np.asarray(bands, float)

    def fit(self, time, event, strata=None, entry=None):
        t = np.asarray(time, float); e = np.asarray(event, int)
        a = np.zeros_like(t) if entry is None else np.asarray(entry, float)
        s = np.zeros(len(t), int) if strata is None else np.asarray(strata)
        self.rates = {}
        b = self.bands

        def rates(m):
            r = []
            for lo, hi in zip(b[:-1], b[1:]):
                expo = np.clip(np.minimum(t[m], hi) - np.maximum(a[m], lo), 0, None).sum()
                ev = np.sum(e[m] & (t[m] >= lo) & (t[m] < hi))
                r.append((ev, expo))
            return r

        pooled = rates(np.ones(len(t), bool))
        self.pooled = np.array([ev / ex if ex > 0 else 0.0 for ev, ex in pooled])
        for k in np.unique(s):
            rr = rates(s == k)
            self.rates[k] = np.array([ev / ex if ex > 0 else self.pooled[i] for i, (ev, ex) in enumerate(rr)])
        return self

    def cum(self, age, stratum=0):
        r = self.rates.get(stratum, self.pooled)
        b = self.bands
        return float(sum(r[i] * max(0.0, min(age, b[i + 1]) - b[i]) for i in range(len(r))))

    def prob_end_within(self, ages, horizon, strata=None):
        strata = [0] * len(ages) if strata is None else list(strata)
        return np.array([1 - np.exp(-(self.cum(x + horizon, s) - self.cum(x, s))) for x, s in zip(ages, strata)])
