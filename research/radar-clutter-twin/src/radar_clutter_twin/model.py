"""CA-CFAR detection in a clutter twin. Cell power = tau * e, e ~ Exp(1) speckle, tau ~ Gamma(nu, 1/nu) unit-mean texture
drawn independently per cell (nu = inf: Gaussian clutter, the twin). Test cell X vs (alpha/N) * sum of N reference cells."""
import math, random

__all__ = ["alpha_twin", "pfa_twin", "TextureGrid", "pfa_real", "alpha_for_pfa", "inflation_limit", "inflation",
           "simulate_pfa", "sample_power", "nu_moment_estimate", "recalibrated_pfa", "GridCache", "calibration_trials"]


def pfa_twin(alpha, N):
    """Design false-alarm probability under Gaussian clutter: (1 + alpha/N)^-N."""
    return (1 + alpha / N) ** (-N)


def alpha_twin(pfa, N):
    return N * (pfa ** (-1.0 / N) - 1)


class TextureGrid:
    """Quadrature for tau ~ Gamma(nu, 1/nu) on a log grid, plus a table of g(s) = E[1/(1 + s tau)] on a log-s grid."""

    def __init__(self, nu, ylo=-12.0, yhi=4.0, n=320, slo=-6.0, shi=14.0, ns=480):
        self.nu = nu
        h = (yhi - ylo) / n
        lg = nu * math.log(nu) - math.lgamma(nu)
        self.tau, self.w = [], []
        for i in range(n + 1):
            y = ylo + i * h
            self.tau.append(math.exp(y))
            self.w.append(math.exp(lg + nu * y - nu * math.exp(y)) * h * (0.5 if i in (0, n) else 1.0))
        z = sum(self.w)
        self.w = [x / z for x in self.w]
        self.slo, self.hs = slo, (shi - slo) / ns
        self.g = [sum(w / (1 + math.exp(slo + j * self.hs) * t) for t, w in zip(self.tau, self.w)) for j in range(ns + 1)]

    def gfun(self, s):
        u = (math.log(s) - self.slo) / self.hs
        if u <= 0:
            return self.g[0]
        j = int(u)
        if j >= len(self.g) - 1:
            return self.g[-1] * math.exp(-(math.log(s) - (self.slo + (len(self.g) - 1) * self.hs)))  # 1/s tail
        f = u - j
        return self.g[j] * (1 - f) + self.g[j + 1] * f


def pfa_real(alpha, N, grid):
    """Exact CA-CFAR false-alarm probability with iid per-cell texture: E_{tau0} prod_i E_{tau_i} 1/(1 + alpha tau_i/(N tau0)).
    (Speckle integrates out: P(e0 > T/tau0) with T = (alpha/N) sum tau_i e_i gives prod_i (1 + alpha tau_i/(N tau0))^-1.)"""
    return sum(w * grid.gfun(alpha / (N * t)) ** N for t, w in zip(grid.tau, grid.w))


def alpha_for_pfa(target, N, grid, hi=1e9):
    """Threshold multiplier giving false-alarm probability `target` in the textured clutter (bisection on log alpha)."""
    lo = 1e-6
    for _ in range(80):
        mid = math.sqrt(lo * hi)
        if pfa_real(mid, N, grid) > target:
            lo = mid
        else:
            hi = mid
    return hi


def inflation_limit(nu, N):
    """alpha -> inf limit of pfa_real / pfa_twin for nu > 1: Gamma(nu+N) / (Gamma(nu) (nu-1)^N)."""
    return math.exp(math.lgamma(nu + N) - math.lgamma(nu) - N * math.log(nu - 1))


def inflation(alpha, N, grid):
    return pfa_real(alpha, N, grid) / pfa_twin(alpha, N)


def sample_power(nu, n, rng):
    return [rng.gammavariate(nu, 1.0 / nu) * rng.expovariate(1.0) for _ in range(n)]


def simulate_pfa(alpha, N, nu, trials, seed, shared=False):
    """Direct Monte Carlo of the detector on simulated cells (no conditioning). shared=True: one texture draw for the whole
    window (spatially correlated clutter), which the ratio test cancels."""
    rng = random.Random(seed)
    hits = 0
    tex = lambda: rng.gammavariate(nu, 1 / nu) if nu != math.inf else 1.0
    for _ in range(trials):
        t0 = tex()
        x = t0 * rng.expovariate(1.0)
        s = sum((t0 if shared else tex()) * rng.expovariate(1.0) for _ in range(N))
        hits += x > alpha * s / N
    return hits / trials


def nu_moment_estimate(power):
    """Method of moments: E[P^2]/E[P]^2 = 2 (1 + 1/nu). Returns inf when the sample is not heavier than exponential."""
    n = len(power)
    m1 = sum(power) / n
    m2 = sum(p * p for p in power) / n
    r = m2 / (m1 * m1) / 2 - 1
    return math.inf if r <= 1e-3 else 1 / r


def recalibrated_pfa(target, N, nu_hat, nu_true, grid_cache):
    """True false-alarm probability when the threshold is set to hit `target` under the *estimated* texture nu_hat."""
    if math.isinf(nu_hat) or nu_hat > 200:
        alpha = alpha_twin(target, N)
    else:
        alpha = alpha_for_pfa(target, N, grid_cache(nu_hat))
    return pfa_real(alpha, N, grid_cache(nu_true))


class GridCache:
    def __init__(self):
        self.d = {}

    def __call__(self, nu):
        k = round(nu, 3)
        if k not in self.d:
            self.d[k] = TextureGrid(nu)
        return self.d[k]


def calibration_trials(nu_true, n_cells, target, N, trials, seed, cache=None):
    """Draw n_cells real clutter-only power samples, fit nu by moments (clamped below at 0.6), recalibrate; return the sorted
    true/target false-alarm ratios and the fraction of trials where the fit looks Gaussian (nu_hat > 200)."""
    cache = cache or GridCache()
    rng = random.Random(seed)
    out, gauss = [], 0
    for _ in range(trials):
        nu_hat = nu_moment_estimate(sample_power(nu_true, n_cells, rng))
        gauss += nu_hat > 200
        nu_hat = max(nu_hat, 0.6)
        out.append(recalibrated_pfa(target, N, nu_hat, nu_true, cache) / target)
    return sorted(out), gauss / trials
