"""Deciding from a pilot whether a biased digital twin is worth using as a control variate (see ../twin-evaluation).
Real return R = mu + s*c + se*e, noise-free or noisy twin T = mu + b + g*s*c + tau*e'; the context c is replayed in the twin.
Costs: a real episode c_R, a twin episode c_T (r = c_T/c_R).  Optimal control-variate variance (budget C, sigma_R^2 = 2):
  V*(rho) = sigma_R^2 c_R (sqrt(1-rho^2) + rho sqrt(r))^2 / C   if rho > rho*(r),  else real-only sigma_R^2 c_R / C."""
import math, random

__all__ = ["rho_star", "rel_var", "rel_var_forced", "alloc_forced", "plan_regret_curvature", "gain", "gain_slope", "alloc", "var_of_alloc", "rel_regret_alloc", "sample_corr",
           "regret_law", "sample_pairs", "sample_twin", "ols_slope", "cv_estimate", "cv_interval", "t_quantile",
           "two_stage"]


def rho_star(r):
    """Smallest correlation for which the twin pays: rho* = 2 sqrt(r)/(1+r)  (equivalent to r < (1-sqrt(1-rho^2))^2/rho^2)."""
    return 2 * math.sqrt(r) / (1 + r)


def rel_var(rho, r):
    """Optimal variance relative to real-only at the same budget (N >= n, twin used only if it pays)."""
    if rho <= rho_star(r):
        return 1.0
    return (math.sqrt(1 - rho * rho) + rho * math.sqrt(r)) ** 2


def rel_var_forced(rho, r):
    """Variance relative to real-only if the twin is used with its optimal plan even where that is worse than real-only."""
    return (math.sqrt(1 - rho * rho) + rho * math.sqrt(r)) ** 2


def alloc_forced(rho_hat, C, cR, cT):
    """Optimal (n, N) assuming correlation rho_hat, without the real-only fallback."""
    a, b = 1 - rho_hat ** 2, rho_hat ** 2
    den = math.sqrt(a * cR) + math.sqrt(b * cT)
    return C * math.sqrt(a / cR) / den, C * math.sqrt(b / cT) / den


def plan_regret_curvature(rho, r, h=1e-3):
    """d^2/d rho_hat^2 of  Var(plan for rho_hat on a twin of correlation rho)/Var(oracle) at rho_hat = rho (finite differences,
    C = cR = 1).  Plug-in regret is then ~ curvature/2 * (1-rho^2)^2 / m."""
    def f(x):
        n, N = alloc_forced(x, 1.0, 1.0, r)
        n0, N0 = alloc_forced(rho, 1.0, 1.0, r)
        return var_of_alloc(n, N, rho) / var_of_alloc(n0, N0, rho)
    return (f(rho + h) - 2 * f(rho) + f(rho - h)) / (h * h)


def gain(rho, r):
    return 1.0 - rel_var(rho, r)


def gain_slope(r):
    """-d rel_var / d rho at rho*: 2 sqrt(r) (1+r)/(1-r).  The gain is linear (not quadratic) in rho - rho*."""
    return 2 * math.sqrt(r) * (1 + r) / (1 - r)


def alloc(rho_hat, C, cR, cT):
    """Continuous optimal (n, N) for budget C = n cR + N cT if the twin is believed to have correlation rho_hat (N = 0: real-only)."""
    r = cT / cR
    if rho_hat <= rho_star(r):
        return C / cR, 0.0
    a, b = 1 - rho_hat ** 2, rho_hat ** 2
    den = math.sqrt(a * cR) + math.sqrt(b * cT)
    return C * math.sqrt(a / cR) / den, C * math.sqrt(b / cT) / den


def var_of_alloc(n, N, rho, sR2=1.0):
    """True variance (in units of sigma_R^2) of the control-variate estimator with n paired and N total twin episodes."""
    if N <= 0:
        return sR2 / n
    return sR2 * ((1 - rho * rho) / n + rho * rho / N)


def rel_regret_alloc(rho_hat, rho, C, cR, cT):
    """Variance of the allocation planned for rho_hat, run on a twin whose true correlation is rho, over the oracle's."""
    n, N = alloc(rho_hat, C, cR, cT)
    n0, N0 = alloc(rho, C, cR, cT)
    return var_of_alloc(n, N, rho) / var_of_alloc(n0, N0, rho) - 1.0


def sample_corr(rho, m, rng):
    """Sample correlation of m bivariate-normal pairs with correlation rho."""
    xs, ys = [], []
    k = math.sqrt(1 - rho * rho)
    for _ in range(m):
        x = rng.gauss(0, 1)
        xs.append(x)
        ys.append(rho * x + k * rng.gauss(0, 1))
    mx, my = sum(xs) / m, sum(ys) / m
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy)


def regret_law(rho, r, m):
    """Large-m decision regret of the rule 'use the twin iff rho_hat > rho*', averaged over a prior with density f near rho*,
    in units of the real-only variance:  f * slope * (1-rho*^2)^2 / (2m).  Returns the per-unit-density factor."""
    return gain_slope(r) * (1 - rho * rho) ** 2 / (2 * m)


# --- full simulation of the two-stage procedure -----------------------------------------------------------------------
def sample_pairs(n, mu, s, se, b, g, tau, rng):
    R, T = [], []
    for _ in range(n):
        c = rng.gauss(0, 1)
        R.append(mu + s * c + se * rng.gauss(0, 1))
        T.append(mu + b + g * s * c + tau * rng.gauss(0, 1))
    return R, T


def sample_twin(k, mu, s, b, g, tau, rng):
    return [mu + b + g * s * rng.gauss(0, 1) + tau * rng.gauss(0, 1) for _ in range(k)]


def ols_slope(R, T):
    n = len(R)
    mr, mt = sum(R) / n, sum(T) / n
    sxy = sum((r - mr) * (t - mt) for r, t in zip(R, T))
    sxx = sum((t - mt) ** 2 for t in T)
    return sxy / sxx if sxx > 0 else 0.0


def cv_estimate(R, T, extra):
    n, N = len(R), len(R) + len(extra)
    lam = ols_slope(R, T)
    return sum(R) / n - lam * (sum(T) / n - (sum(T) + sum(extra)) / N)


def t_quantile(p, nu):
    """Student-t quantile by bisection on the CDF (integer nu >= 1, closed-form CDF in theta = atan(x/sqrt(nu)))."""
    def cdf(x):
        th = math.atan(x / math.sqrt(nu))
        c, s = math.cos(th), math.sin(th)
        if nu % 2 == 1:
            acc, term = c, c
            for k in range(1, (nu - 1) // 2):
                term *= c * c * (2.0 * k) / (2.0 * k + 1.0)
                acc += term
            return 0.5 + (th + s * acc if nu > 1 else th) / math.pi
        acc, term = 1.0, 1.0
        for k in range(1, nu // 2):
            term *= c * c * (2.0 * k - 1.0) / (2.0 * k)
            acc += term
        return 0.5 + 0.5 * s * acc
    if p < 0.5:
        return -t_quantile(1 - p, nu)
    lo, hi = 0.0, 1e4
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if cdf(mid) < p else (lo, mid)
    return 0.5 * (lo + hi)


def cv_interval(R, T, extra, level=0.95):
    n, N = len(R), len(R) + len(extra)
    lam = ols_slope(R, T)
    res = [r - lam * t for r, t in zip(R, T)]
    mr = sum(res) / n
    s2 = sum((x - mr) ** 2 for x in res) / (n - 2)
    allT = list(T) + list(extra)
    mT = sum(allT) / N
    sT2 = sum((x - mT) ** 2 for x in allT) / (N - 1)
    se = math.sqrt(s2 / n + lam * lam * sT2 / N)
    est = cv_estimate(R, T, extra)
    q = t_quantile(0.5 + level / 2, n - 2)
    return est - q * se, est + q * se


def two_stage(m, C, cR, cT, mu, s, se, b, g, tau, rng):
    """Pilot of m real episodes (each replayed in the twin), plan (n, N) from the pilot correlation, then finish the budget.
    Returns (estimate, interval, used_twin, n, N).  Pilot pairs are reused in the final estimator."""
    R, T = sample_pairs(m, mu, s, se, b, g, tau, rng)
    mr, mt = sum(R) / m, sum(T) / m
    sxy = sum((x - mr) * (y - mt) for x, y in zip(R, T))
    sxx = sum((x - mr) ** 2 for x in R)
    syy = sum((y - mt) ** 2 for y in T)
    rho_hat = sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else 0.0
    left = C - m * (cR + cT)                       # pilot paid for its real episodes and their twin replays
    n_t, N_t = alloc(rho_hat, C, cR, cT)
    if N_t <= 0 or rho_hat <= 0:                   # real-only: spend everything on real episodes (the pilot's twin runs are wasted)
        n = max(m, int((C - m * cT) // cR))
        R2, _ = sample_pairs(n - m, mu, s, se, b, g, tau, rng)
        Rall = R + R2
        mean = sum(Rall) / n
        v = sum((x - mean) ** 2 for x in Rall) / (n - 1)
        q = t_quantile(0.975, n - 1)
        h = q * math.sqrt(v / n)
        return mean, (mean - h, mean + h), False, n, 0
    n = max(m, int(round(n_t)))
    N = max(n, int(round((C - n * cR) / cT)))
    R2, T2 = sample_pairs(n - m, mu, s, se, b, g, tau, rng)
    ex = sample_twin(N - n, mu, s, b, g, tau, rng)
    Rall, Tall = R + R2, T + T2
    lo, hi = cv_interval(Rall, Tall, ex)
    return cv_estimate(Rall, Tall, ex), (lo, hi), True, n, N
