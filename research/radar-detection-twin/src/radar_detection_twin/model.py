"""CA-CFAR and OS-CFAR detection with a Swerling-I target, threshold set in a Gaussian-clutter twin, deployed in gamma-textured
clutter. Cell power = tau * e, e ~ Exp(1) speckle, tau ~ Gamma(nu, 1/nu) unit-mean texture drawn independently per cell
(nu = inf: Gaussian clutter, the twin). A target adds a constant local SNR s: the test cell is tau0 * (1+s) * e0 (compound model, the
target shares the cell's texture). Test cell X vs alpha * (mean of N reference cells) for CA, alpha * (k-th smallest of N) for OS.
The texture quadrature and the CA-CFAR law repeat research/radar-clutter-twin so this project runs on its own."""
import math, random

__all__ = ["pfa_ca_twin", "alpha_ca_twin", "pfa_os_twin", "alpha_os_twin", "TextureGrid", "pfa_ca_real", "pfa_os_real",
           "alpha_for_pfa", "snr_for_pd", "simulate", "pd_fn"]


def pfa_ca_twin(alpha, N):
    """(1 + alpha/N)^-N."""
    return (1 + alpha / N) ** (-N)


def alpha_ca_twin(pfa, N):
    return N * (pfa ** (-1.0 / N) - 1)


def pfa_os_twin(alpha, N, k):
    """OS-CFAR under exponential clutter: prod_{i=0}^{k-1} (N-i)/(N-i+alpha)."""
    p = 1.0
    for i in range(k):
        p *= (N - i) / (N - i + alpha)
    return p


def alpha_os_twin(pfa, N, k):
    lo, hi = 1e-9, 1e9
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if pfa_os_twin(mid, N, k) > pfa:
            lo = mid
        else:
            hi = mid
    return hi


class TextureGrid:
    """Quadrature for tau ~ Gamma(nu, 1/nu) on a log grid, a table of g(s) = E[1/(1 + s tau)] on a log-s grid (CA-CFAR), and a
    table of the marginal cell-power survival S(z) = E exp(-z/tau) on a log-z grid (OS-CFAR)."""

    def __init__(self, nu, ylo=-12.0, yhi=6.0, n=500, slo=-6.0, shi=14.0, ns=480, zlo=-20.0, zhi=30.0, nz=3000):
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
        self.zlo, self.hz = zlo, (zhi - zlo) / nz
        self.z = [math.exp(zlo + j * self.hz) for j in range(nz + 1)]
        self.S = [sum(w * math.exp(-x / t) for t, w in zip(self.tau, self.w)) for x in self.z]
        self.logS = [math.log(s) if s > 1e-300 else -690.0 for s in self.S]

    def gfun(self, s):
        u = (math.log(s) - self.slo) / self.hs
        if u <= 0:
            return self.g[0]
        j = int(u)
        if j >= len(self.g) - 1:
            return self.g[-1] * math.exp(-(math.log(s) - (self.slo + (len(self.g) - 1) * self.hs)))
        f = u - j
        return self.g[j] * (1 - f) + self.g[j + 1] * f

    def surv(self, x):
        """Marginal survival S(x), log-linear interpolation of the table."""
        u = (math.log(x) - self.zlo) / self.hz
        if u <= 0:
            return 1.0
        j = int(u)
        if j >= len(self.z) - 1:
            return 0.0
        f = u - j
        return math.exp(self.logS[j] * (1 - f) + self.logS[j + 1] * f)


def pfa_ca_real(alpha, N, grid):
    """Exact CA-CFAR probability of exceeding the threshold: E_{tau0} prod_i E_{tau_i} 1/(1 + alpha tau_i/(N tau0))."""
    return sum(w * grid.gfun(alpha / (N * t)) ** N for t, w in zip(grid.tau, grid.w))


def pfa_os_real(alpha, N, k, grid):
    """Exact OS-CFAR probability with iid textured cells: integral of S(alpha z) k C(N,k) F^{k-1} (1-F)^{N-k} dF over the
    marginal cdf F = 1 - S of the reference cells (midpoint rule on the z grid; F(Z_(k)) has a Beta(k, N-k+1) law)."""
    c = math.log(k) + math.lgamma(N + 1) - math.lgamma(k + 1) - math.lgamma(N - k + 1)
    tot, S = 0.0, grid.S
    for j in range(len(S) - 1):
        dF = S[j] - S[j + 1]
        if dF <= 0:
            continue
        Sm = 0.5 * (S[j] + S[j + 1])
        Fm = 1 - Sm
        if Fm <= 0 or Sm <= 0:
            continue
        zm = math.sqrt(grid.z[j] * grid.z[j + 1])
        tot += grid.surv(alpha * zm) * math.exp(c + (k - 1) * math.log(Fm) + (N - k) * math.log(Sm)) * dF
    return tot


def pd_fn(kind, N, k=None, grid=None):
    """Return f(alpha, snr) -> exceedance probability (Pfa at snr=0, Pd otherwise). grid=None: Gaussian twin. The target scales the
    test cell by (1+snr), the same as dividing alpha by (1+snr) in the false-alarm law."""
    if grid is None:
        if kind == "ca":
            return lambda a, s: pfa_ca_twin(a / (1 + s), N)
        return lambda a, s: pfa_os_twin(a / (1 + s), N, k)
    if kind == "ca":
        return lambda a, s: pfa_ca_real(a / (1 + s), N, grid)
    return lambda a, s: pfa_os_real(a / (1 + s), N, k, grid)


def alpha_for_pfa(target, fn, hi=1e6):
    """Threshold multiplier giving false-alarm probability `target` under exceedance function fn (snr=0), by bisection."""
    lo = 1e-3
    for _ in range(60):
        mid = math.sqrt(lo * hi)
        if fn(mid, 0.0) > target:
            lo = mid
        else:
            hi = mid
    return hi


def snr_for_pd(fn, alpha, pd, hi=1e9):
    """Smallest local SNR (linear, relative to clutter mean) giving detection probability `pd`."""
    lo = 1e-3
    for _ in range(80):
        mid = math.sqrt(lo * hi)
        if fn(alpha, mid) < pd:
            lo = mid
        else:
            hi = mid
    return hi


def simulate(alpha, N, nu, trials, seed, kind="ca", k=None, snr=0.0, shared=False):
    """Direct Monte Carlo of the detector on simulated cells."""
    rng = random.Random(seed)
    hits = 0
    tex = lambda: rng.gammavariate(nu, 1 / nu) if nu != math.inf else 1.0
    for _ in range(trials):
        t0 = tex()
        x = t0 * (1 + snr) * rng.expovariate(1.0)
        ref = [(t0 if shared else tex()) * rng.expovariate(1.0) for _ in range(N)]
        thr = alpha * sum(ref) / N if kind == "ca" else alpha * sorted(ref)[k - 1]
        hits += x > thr
    return hits / trials
