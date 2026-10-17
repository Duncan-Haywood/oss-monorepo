"""Policy evaluation with a digital twin as a control variate.
Scenario context c ~ N(0,1) (object pose, friction, start state) is observable and can be replayed in the twin.
Real return  R = mu + s*c + se*e     (e ~ N(0,1) execution noise, cannot be seeded)
Twin return  T = mu + b + g*s*c + tau*e'   (b = twin bias, g = context sensitivity, tau = twin execution noise)
The twin cannot share execution noise with reality, so the paired correlation is set by the context share only."""
import math, random

__all__ = ["Phi", "Phi_inv", "t_cdf", "t_quantile", "moments", "sample_pairs", "sample_twin", "cv_estimate",
           "cv_interval", "var_cv", "optimal_alloc", "worth_threshold", "ols_slope"]


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def Phi_inv(p):
    lo, hi = -12.0, 12.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if Phi(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def t_cdf(x, nu):
    """Student-t CDF for integer nu >= 1 (finite closed forms in theta = atan(x/sqrt(nu)))."""
    th = math.atan(x / math.sqrt(nu))
    c, s = math.cos(th), math.sin(th)
    if nu % 2 == 1:
        acc, term = c, c
        for k in range(1, (nu - 1) // 2):
            term *= c * c * (2.0 * k) / (2.0 * k + 1.0)
            acc += term
        body = th + s * acc if nu > 1 else th
        return 0.5 + body / math.pi
    acc, term = 1.0, 1.0
    for k in range(1, nu // 2):
        term *= c * c * (2.0 * k - 1.0) / (2.0 * k)
        acc += term
    return 0.5 + 0.5 * s * acc


def t_quantile(p, nu):
    lo, hi = 0.0, 1e4
    if p < 0.5:
        return -t_quantile(1 - p, nu)
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if t_cdf(mid, nu) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def moments(s, se, g, tau):
    """Return (sigma_R, sigma_T, cov, rho) of the paired (R, T)."""
    sR = math.sqrt(s * s + se * se)
    sT = math.sqrt(g * g * s * s + tau * tau)
    cov = g * s * s
    return sR, sT, cov, cov / (sR * sT)


def sample_pairs(n, mu, s, se, b, g, tau, rng):
    """n real episodes and the twin replayed on the same n contexts."""
    R, T = [], []
    for _ in range(n):
        c = rng.gauss(0, 1)
        R.append(mu + s * c + se * rng.gauss(0, 1))
        T.append(mu + b + g * s * c + tau * rng.gauss(0, 1))
    return R, T


def sample_twin(m, mu, s, b, g, tau, rng):
    """m extra twin-only episodes on fresh contexts drawn from the (known) scenario distribution."""
    return [mu + b + g * s * rng.gauss(0, 1) + tau * rng.gauss(0, 1) for _ in range(m)]


def ols_slope(R, T):
    n = len(R)
    mr, mt = sum(R) / n, sum(T) / n
    sxy = sum((r - mr) * (t - mt) for r, t in zip(R, T))
    sxx = sum((t - mt) ** 2 for t in T)
    return sxy / sxx if sxx > 0 else 0.0


def cv_estimate(R, T, extra, lam=None):
    """Unbiased estimate of E[R]:  mean(R) - lam * (mean(T on the n paired) - mean(T on all N = n + len(extra)))."""
    n, N = len(R), len(R) + len(extra)
    if lam is None:
        lam = ols_slope(R, T)
    tN = (sum(T) + sum(extra)) / N
    return sum(R) / n - lam * (sum(T) / n - tN)


def cv_interval(R, T, extra, level=0.95):
    """Plug-in interval: residual variance of R - lam*T on n pairs (n-2 dof) plus twin-mean variance."""
    n, N = len(R), len(R) + len(extra)
    lam = ols_slope(R, T)
    res = [r - lam * t for r, t in zip(R, T)]
    mr = sum(res) / n
    s2 = sum((x - mr) ** 2 for x in res) / (n - 2)
    allT = list(T) + list(extra)
    mT = sum(allT) / N
    sT2 = sum((x - mT) ** 2 for x in allT) / (N - 1)
    se = math.sqrt(s2 / n + lam * lam * sT2 / N)
    est = cv_estimate(R, T, extra, lam)
    q = t_quantile(0.5 + level / 2, n - 2)
    return est - q * se, est + q * se


def var_cv(sR, rho, n, N):
    """Exact variance of the control-variate estimator with the optimal fixed coefficient (N >= n, paired subset)."""
    return sR * sR * ((1 - rho * rho) / n + rho * rho / N)


def worth_threshold(rho):
    """The twin is worth its cost iff c_T / c_R < (1 - sqrt(1-rho^2))^2 / rho^2."""
    return (1 - math.sqrt(1 - rho * rho)) ** 2 / (rho * rho)


def optimal_alloc(C, cR, cT, sR, rho):
    """Budget C = n cR + N cT, N >= n.  Returns (n, N, V) minimising var_cv (continuous), or real-only if the twin is not worth it."""
    a, b = 1 - rho * rho, rho * rho
    if cT / cR >= worth_threshold(rho):
        n = C / cR
        return n, 0.0, sR * sR / n
    den = math.sqrt(a * cR) + math.sqrt(b * cT)
    n = C * math.sqrt(a / cR) / den
    N = C * math.sqrt(b / cT) / den
    return n, N, sR * sR * den * den / C
