"""Eliciting the alpha-mode of a drift distribution with the window loss 1[|y-r|>alpha].

The exact mode is not elicitable, but the centre of the width-2*alpha window with the most mass is:
the expected loss is 1 - M(r), M(r) = F(r+alpha) - F(r-alpha), so the report minimising it is the
alpha-mode  argmax_r M(r)  and the regret of reporting r is  M(r*) - M(r)  (bounded in [0, 1]).
Distributions are finite mixtures of a location family: kind "normal" or "cauchy" with scale s.
"""
import math

__all__ = ["cdf", "pdf", "mixture_cdf", "mixture_pdf", "window_mass", "alpha_mode", "window_regret",
           "curvature", "best_alpha", "cauchy_best_alpha", "critical_alpha", "mixture_mean",
           "sq_regret", "diff_stats", "detection_n", "empirical_alpha_mode"]

SQ2 = math.sqrt(2.0)


def cdf(x, kind="normal", s=1.0):
    if kind == "normal":
        return 0.5 * (1 + math.erf(x / (s * SQ2)))
    return 0.5 + math.atan(x / s) / math.pi


def pdf(x, kind="normal", s=1.0):
    if kind == "normal":
        return math.exp(-0.5 * (x / s) ** 2) / (s * math.sqrt(2 * math.pi))
    return 1.0 / (math.pi * s * (1 + (x / s) ** 2))


def mixture_cdf(x, comps, kind="normal", s=1.0):
    """comps = [(weight, centre), ...]"""
    return sum(w * cdf(x - c, kind, s) for w, c in comps)


def mixture_pdf(x, comps, kind="normal", s=1.0):
    return sum(w * pdf(x - c, kind, s) for w, c in comps)


def window_mass(r, alpha, comps, kind="normal", s=1.0):
    return mixture_cdf(r + alpha, comps, kind, s) - mixture_cdf(r - alpha, comps, kind, s)


def alpha_mode(alpha, comps, kind="normal", s=1.0, n=4001):
    """global maximiser of the window mass: grid over the component hull, then golden-section polish"""
    cs = [c for _, c in comps]
    lo, hi = min(cs) - 3 * s, max(cs) + 3 * s
    step = (hi - lo) / (n - 1)
    f = lambda r: window_mass(r, alpha, comps, kind, s)
    best = max(range(n), key=lambda i: f(lo + i * step))
    a, b = lo + max(best - 1, 0) * step, lo + min(best + 1, n - 1) * step
    g = (math.sqrt(5) - 1) / 2
    x1, x2 = b - g * (b - a), a + g * (b - a)
    for _ in range(80):
        if f(x1) > f(x2):
            b, x2 = x2, x1
            x1 = b - g * (b - a)
        else:
            a, x1 = x1, x2
            x2 = a + g * (b - a)
    return 0.5 * (a + b)


def window_regret(r, alpha, comps, kind="normal", s=1.0):
    return window_mass(alpha_mode(alpha, comps, kind, s), alpha, comps, kind, s) - window_mass(r, alpha, comps, kind, s)


def curvature(alpha, kind="normal", s=1.0):
    """regret ~ curvature * delta^2 for a small shift from the mode of a symmetric unimodal law:
    curvature = -M''(0)/2 = -f'(alpha) = alpha*phi(alpha/s)/s^3 (normal), 2a/(pi s^3 (1+u^2)^2) (Cauchy)"""
    if kind == "normal":
        return alpha * math.exp(-0.5 * (alpha / s) ** 2) / (s ** 3 * math.sqrt(2 * math.pi))
    u = alpha / s
    return 2 * alpha / (math.pi * s ** 3 * (1 + u * u) ** 2)


def best_alpha(s=1.0):
    """normal: alpha*phi(alpha/s) is maximised at alpha = s"""
    return s


def cauchy_best_alpha(s=1.0):
    """Cauchy: u/(1+u^2)^2 is maximised at u = 1/sqrt(3)"""
    return s / math.sqrt(3)


def critical_alpha(mu, s=1.0):
    """Equal 50/50 normal mixture at 0 and mu: the window mass has a single alpha-mode (at mu/2)
    iff alpha >= alpha*, the root of ln((a+alpha)/(a-alpha)) = 2*a*alpha/s^2 with a = mu/2.
    For mu <= 2s the mixture is unimodal for every alpha and 0 is returned."""
    a = mu / 2
    if a <= s:
        return 0.0
    g = lambda al: math.log((a + al) / (a - al)) - 2 * a * al / s ** 2
    lo, hi = 1e-9, a * (1 - 1e-12)     # g<0 just above 0 (bimodal), g->+inf at a: one sign change
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if g(mid) < 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def mixture_mean(comps):
    return sum(w * c for w, c in comps)


def sq_regret(r, comps):
    """squared-loss regret of report r (squared loss elicits the mean): (r - mean)^2"""
    return (r - mixture_mean(comps)) ** 2


def diff_stats(r, r_star, alpha, comps, kind="normal", s=1.0):
    """paired per-task loss difference L(r)-L(r*) in {-1,0,+1}: exact mean (= regret) and variance,
    from the masses of the two windows and their overlap."""
    def mass(lo, hi):
        return mixture_cdf(hi, comps, kind, s) - mixture_cdf(lo, comps, kind, s)
    a, b = r_star - alpha, r_star + alpha
    c, d = r - alpha, r + alpha
    lo, hi = max(a, c), min(b, d)
    overlap = mass(lo, hi) if hi > lo else 0.0
    p_plus = mass(a, b) - overlap      # only r*'s window: L(r*)=0, L(r)=1 -> +1
    p_minus = mass(c, d) - overlap     # only r's window: -1
    mean = p_plus - p_minus
    return mean, (p_plus + p_minus) - mean ** 2


def detection_n(mean, var, z=1.645):
    return z * z * var / (mean * mean)


def empirical_alpha_mode(xs, alpha):
    """centre of the width-2*alpha window holding the most sample points (exact, O(n log n))"""
    xs = sorted(xs)
    j, best, arg = 0, -1, xs[0]
    for i, x in enumerate(xs):
        while xs[j] < x - 2 * alpha:
            j += 1
        if i - j + 1 > best:
            best, arg = i - j + 1, 0.5 * (x + xs[j])
    return arg
