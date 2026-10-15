"""CRPS versus log score for a verifier reporting a Gaussian N(m, s^2) for a continuous quantity
(e.g. benign floating-point drift) whose true law is N(mu, sigma^2). Stdlib only.

Closed forms (z=(y-m)/s, tau^2=s^2+sigma^2, d=m-mu):
  CRPS(F,y)          = s [ z(2Phi(z)-1) + 2phi(z) - 1/sqrt(pi) ]
  E CRPS             = tau [ 2phi(d/tau) + (d/tau)(2Phi(d/tau)-1) ] - s/sqrt(pi)
  excess CRPS (d=0)  = sigma/sqrt(pi) * ( sqrt(2(1+r^2)) - r - 1 ),  r = s/sigma
  excess log  (d=0)  = ln r + 1/(2 r^2) - 1/2
"""
import math

__all__ = ["Phi", "phi", "Phi_inv", "crps_gauss", "crps_threshold_integral", "crps_energy", "exp_crps",
           "excess_crps", "excess_log", "log_score", "log_slope", "crps_slope", "plugin_excess_crps",
           "crps_scale_floor", "mean_curvature_crps", "scale_curvature_crps"]

SQPI = math.sqrt(math.pi)


def phi(z):
    return math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)


def Phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def Phi_inv(u):
    lo, hi = -40.0, 40.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if Phi(mid) < u:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def crps_gauss(m, s, y):
    z = (y - m) / s
    return s * (z * (2 * Phi(z) - 1) + 2 * phi(z) - 1 / SQPI)


def crps_threshold_integral(m, s, y, half_width=12.0, n=12000):
    """CRPS as the integral over thresholds t of the Brier score of the event {Y<=t}."""
    a, b = min(m, y) - half_width * s, max(m, y) + half_width * s
    tot = 0.0
    for lo, hi, ind in ((a, y, 0.0), (y, b, 1.0)):   # split at y: the indicator is constant on each side
        h = (hi - lo) / n
        for k in range(n):
            t = lo + (k + 0.5) * h
            tot += (Phi((t - m) / s) - ind) ** 2 * h
    return tot


def crps_energy(sample, y):
    """Energy form E|X-y| - 0.5 E|X-X'| on an empirical sample (X, X' independent draws)."""
    n = len(sample)
    a = sum(abs(x - y) for x in sample) / n
    xs = sorted(sample)
    # sum_{i,j}|xi-xj| = 2 sum_i (2i-n+1) x_i for sorted x (0-indexed)
    pair = 2 * sum((2 * i - n + 1) * x for i, x in enumerate(xs)) / (n * n)
    return a - 0.5 * pair


def exp_crps(m, s, mu, sigma):
    tau = math.hypot(s, sigma)
    z = (m - mu) / tau
    return tau * (2 * phi(z) + z * (2 * Phi(z) - 1)) - s / SQPI


def excess_crps(m, s, mu, sigma):
    return exp_crps(m, s, mu, sigma) - exp_crps(mu, sigma, mu, sigma)


def log_score(m, s, y):
    """Negative log density (loss; smaller is better)."""
    return math.log(s) + 0.5 * math.log(2 * math.pi) + (y - m) ** 2 / (2 * s * s)


def excess_log(m, s, mu, sigma):
    """KL(N(mu,sigma) || N(m,s))."""
    return math.log(s / sigma) + (sigma ** 2 + (m - mu) ** 2) / (2 * s * s) - 0.5


def log_slope(m, s, y):
    """d(log loss)/dy: unbounded in y and blows up as 1/s^2."""
    return (y - m) / (s * s)


def crps_slope(m, s, y):
    """d CRPS/dy = 2 Phi(z) - 1, always in (-1, 1)."""
    return 2 * Phi((y - m) / s) - 1


def crps_scale_floor(sigma):
    """sup over s->0 of the excess CRPS at d=0: an arbitrarily overconfident report costs at most this."""
    return sigma * (math.sqrt(2) - 1) / SQPI


def mean_curvature_crps(sigma):
    """excess CRPS ~ d^2 * this for small mean error d (log score: 1/(2 sigma^2))."""
    return 1 / (2 * SQPI * sigma)


def scale_curvature_crps(sigma):
    """excess CRPS ~ delta^2 * this for s = sigma(1+delta) (log score: 1)."""
    return sigma / (4 * SQPI)


def plugin_excess_crps(n, sigma=1.0):
    """Leading-order expected excess of the Gaussian plug-in fit from n samples:
    sigma/sqrt(pi) * (1/(2n) + 1/(8n)) = 5 sigma / (8 sqrt(pi) n).  (log score: 1/n)."""
    return 5 * sigma / (8 * SQPI * n)
