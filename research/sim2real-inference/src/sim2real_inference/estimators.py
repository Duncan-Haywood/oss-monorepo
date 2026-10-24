"""One estimator family for E[R] from n paired (real R, twin T on the same context) episodes plus m extra twin-only episodes.
All members have the form  mean(R) - lam * (mean(T_paired) - mean(T_all)); they differ only in lam:
  real_only: lam = 0 (ignores the twin)        ppi: lam = 1 (prediction-powered inference, Angelopoulos et al. 2023)
  ppi_pp: lam = power-tuned (PPI++, Angelopoulos et al. 2023b)    cv: lam = OLS slope (classical control variate)
Each is unbiased whatever the twin's bias, because E[T_paired] = E[T_all]."""
import math

__all__ = ["Phi", "Phi_inv", "t_quantile", "moments", "ols_slope", "estimate", "interval", "var_cv", "var_ppi",
           "worth_threshold", "rho_star", "optimal_alloc", "context_rho", "LAMBDAS"]


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def Phi_inv(p):
    lo, hi = -12.0, 12.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if Phi(mid) < p else (lo, mid)
    return 0.5 * (lo + hi)


def _t_cdf(x, nu):
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


def t_quantile(p, nu):
    if p < 0.5:
        return -t_quantile(1 - p, nu)
    lo, hi = 0.0, 1e4
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if _t_cdf(mid, nu) < p else (lo, mid)
    return 0.5 * (lo + hi)


def moments(s, se, g, tau):
    """(sigma_R, sigma_T, cov, rho) for R = mu + s c + se e, T = mu + b + g s c + tau e' (c context, e, e' independent)."""
    sR = math.sqrt(s * s + se * se)
    sT = math.sqrt(g * g * s * s + tau * tau)
    cov = g * s * s
    return sR, sT, cov, cov / (sR * sT)


def context_rho(eta, noise_free):
    """Paired correlation when the context explains a share eta of the real variance: eta for a faithful stochastic twin,
    sqrt(eta) for a noise-free twin (twin-evaluation)."""
    return math.sqrt(eta) if noise_free else eta


def ols_slope(R, T):
    n = len(R)
    mr, mt = sum(R) / n, sum(T) / n
    sxy = sum((r - mr) * (t - mt) for r, t in zip(R, T))
    sxx = sum((t - mt) ** 2 for t in T)
    return sxy / sxx if sxx > 0 else 0.0


def _var(x):
    m = sum(x) / len(x)
    return sum((v - m) ** 2 for v in x) / (len(x) - 1)


def _lam_ppi_pp(R, T, extra):
    """PPI++ power tuning for the mean: lam = cov(R,T) / ((1 + n/N) var(T)), N the total number of twin episodes."""
    n, N = len(R), len(R) + len(extra)
    mr, mt = sum(R) / n, sum(T) / n
    cov = sum((r - mr) * (t - mt) for r, t in zip(R, T)) / (n - 1)
    vt = _var(list(T) + list(extra))
    return cov / ((1 + n / (N - n) if N > n else 2.0) * vt) if vt > 0 else 0.0


def _lam(method, R, T, extra):
    if method == "real_only":
        return 0.0
    if method == "ppi":
        return 1.0
    if method == "cv":
        return ols_slope(R, T)
    if method == "ppi_pp":
        return _lam_ppi_pp(R, T, extra)
    raise ValueError(method)


LAMBDAS = ("real_only", "ppi", "ppi_pp", "cv")


def estimate(method, R, T, extra):
    """Point estimate of E[R]. R, T are the n paired episodes; extra the m twin-only episodes (fresh contexts)."""
    n, N = len(R), len(R) + len(extra)
    lam = _lam(method, R, T, extra)
    tN = (sum(T) + sum(extra)) / N
    return sum(R) / n - lam * (sum(T) / n - tN)


def interval(method, R, T, extra, level=0.95):
    """Plug-in t interval: residual variance of R - lam T over the n pairs plus lam^2 var(T)/N for the twin mean."""
    n, N = len(R), len(R) + len(extra)
    lam = _lam(method, R, T, extra)
    res = [r - lam * t for r, t in zip(R, T)]
    dof = n - 2 if method == "cv" else n - 1
    se2 = _var(res) * (n - 1) / dof / n
    if lam != 0:
        se2 += lam * lam * _var(list(T) + list(extra)) / N
    est = estimate(method, R, T, extra)
    q = t_quantile(0.5 + level / 2, dof)
    h = q * math.sqrt(se2)
    return est - h, est + h


def var_cv(sR, rho, n, N):
    """Variance of the control-variate estimator with the optimal fixed lam (n paired, N >= n twin episodes in all)."""
    return sR * sR * ((1 - rho * rho) / n + rho * rho / N)


def var_ppi(sR, sT, rho, n, N, lam=1.0):
    """Exact variance for any fixed lam (lam = 1 is PPI). Writing f = 1 - n/N, the estimator is
    mean(R) - lam f mean(T_paired) + lam f mean(T_extra), whose three parts are independent except R with T_paired."""
    f = 1.0 - n / N
    v = sR * sR / n + (lam * f) ** 2 * sT * sT / n - 2 * lam * f * rho * sR * sT / n
    if N > n:
        v += (lam * f) ** 2 * sT * sT / (N - n)
    return v


def rho_star(r):
    """Smallest correlation for which a twin at cost ratio r = c_T/c_R pays: 2 sqrt(r)/(1+r)."""
    return 2 * math.sqrt(r) / (1 + r)


def worth_threshold(rho):
    """The twin pays iff c_T/c_R < (1 - sqrt(1-rho^2))^2 / rho^2 (inverse of rho_star)."""
    return (1 - math.sqrt(1 - rho * rho)) ** 2 / (rho * rho)


def optimal_alloc(C, cR, cT, sR, rho):
    """Budget C = n cR + N cT. Returns (n, N, V) minimising var_cv, or real-only (n, 0, sR^2/n) if the twin does not pay."""
    if cT / cR >= worth_threshold(rho):
        n = C / cR
        return n, 0.0, sR * sR / n
    a, b = 1 - rho * rho, rho * rho
    den = math.sqrt(a * cR) + math.sqrt(b * cT)
    return C * math.sqrt(a / cR) / den, C * math.sqrt(b / cT) / den, sR * sR * den * den / C
