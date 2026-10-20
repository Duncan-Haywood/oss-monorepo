"""CFAR family in a clutter twin. Cell power = tau * e, e ~ Exp(1) speckle, tau ~ Gamma(nu, 1/nu) unit-mean texture drawn
independently per cell (nu = inf: Gaussian clutter, the twin). Detector: test cell X > alpha * S(reference cells), where S is
the window scale statistic (CA: mean; OS: k-th smallest; LOG: geometric mean).

Estimation trick used throughout: the test cell is integrated out analytically. Given the reference statistic S the false-alarm
probability is h(alpha S) with h(T) = E_tau0[exp(-T/tau0)] (twin: exp(-T)), so a Monte Carlo over reference cells alone
estimates Pfa with far lower variance than simulating the test cell too."""
import math, random

__all__ = ["DETECTORS", "ref_stats", "TextureTables", "twin_pfa", "real_pfa", "twin_pd", "real_pd", "calibrate",
           "os_twin_pfa", "os_twin_alpha", "ca_twin_alpha", "simulate_direct", "mean_se"]

N_DEFAULT = 16


def _stat_fns(N):
    k = int(0.75 * N)
    return {
        "CA": lambda ref: sum(ref) / N,
        "OS75": lambda ref: sorted(ref)[k - 1],
        "OS50": lambda ref: sorted(ref)[N // 2 - 1],
        "LOG": lambda ref: math.exp(sum(math.log(x) for x in ref) / N),
    }


DETECTORS = ("CA", "OS75", "OS50", "LOG")


def ref_stats(nu, N, n, seed):
    """n independent windows of N reference cells; returns {detector: [S_1..S_n]} computed from the same windows."""
    rng = random.Random(seed)
    fns = _stat_fns(N)
    out = {d: [] for d in DETECTORS}
    for _ in range(n):
        if nu == math.inf:
            ref = [rng.expovariate(1.0) for _ in range(N)]
        else:
            ref = [rng.gammavariate(nu, 1.0 / nu) * rng.expovariate(1.0) for _ in range(N)]
        for d in DETECTORS:
            out[d].append(fns[d](ref))
    return out


def mean_se(xs):
    n = len(xs)
    m = sum(xs) / n
    v = sum((x - m) ** 2 for x in xs) / (n - 1)
    return m, math.sqrt(v / n)


class TextureTables:
    """h(T) = E[exp(-T/tau0)] and, for a Rayleigh target of mean power s added to the test cell, the conditional-on-tau0 detection
    probability integrated over tau0, both tabulated on a log-T grid (log-linear interpolation)."""

    def __init__(self, nu, s_list=(), ylo=-12.0, yhi=4.0, n=320, tlo=-9.0, thi=6.0, nt=600):
        self.nu = nu
        if nu == math.inf:
            self.tau, self.w = [1.0], [1.0]
        else:
            h = (yhi - ylo) / n
            lg = nu * math.log(nu) - math.lgamma(nu)
            self.tau, self.w = [], []
            for i in range(n + 1):
                y = ylo + i * h
                self.tau.append(math.exp(y))
                self.w.append(math.exp(lg + nu * y - nu * math.exp(y)) * h * (0.5 if i in (0, n) else 1.0))
            z = sum(self.w)
            self.w = [x / z for x in self.w]
        self.tlo, self.ht = tlo, (thi - tlo) / nt
        Ts = [math.exp(tlo + j * self.ht) for j in range(nt + 1)]
        self.h = [math.log(max(sum(w * math.exp(-T / t) for t, w in zip(self.tau, self.w)), 1e-300)) for T in Ts]
        self.pd = {}
        for s in s_list:
            self.pd[s] = [math.log(max(sum(w * self._pd_cond(T, t, s) for t, w in zip(self.tau, self.w)), 1e-300)) for T in Ts]

    @staticmethod
    def _pd_cond(T, t, s):
        """P(t*e0 + s*e1 > T), e0, e1 iid Exp(1)."""
        if abs(t - s) < 1e-7 * s:
            return (1 + T / s) * math.exp(-T / s)
        return (t * math.exp(-T / t) - s * math.exp(-T / s)) / (t - s)

    def _interp(self, tab, T):
        u = (math.log(T) - self.tlo) / self.ht
        if u <= 0:
            return math.exp(tab[0])
        j = int(u)
        if j >= len(tab) - 1:
            return 0.0
        f = u - j
        return math.exp(tab[j] * (1 - f) + tab[j + 1] * f)

    def hfun(self, T):
        return self._interp(self.h, T)

    def pdfun(self, T, s):
        return self._interp(self.pd[s], T)


def twin_pfa(alpha, S):
    """Gaussian-twin false-alarm probability for a sample of reference statistics S (Rao-Blackwellised over the test cell)."""
    return mean_se([math.exp(-alpha * x) for x in S])


def real_pfa(alpha, S, tables):
    return mean_se([tables.hfun(alpha * x) for x in S])


def twin_pd(alpha, S, s):
    """Twin Pd for a target of mean power s (relative to unit clutter mean): P(e0 + s e1 > alpha S)."""
    return mean_se([TextureTables._pd_cond(alpha * x, 1.0, s) for x in S])[0]


def real_pd(alpha, S, tables, s):
    return mean_se([tables.pdfun(alpha * x, s) for x in S])[0]


def calibrate(target, S, fn, lo=1e-6, hi=1e6):
    """Threshold multiplier alpha with mean-over-S false-alarm function fn(alpha, S)[0] = target (bisection on log alpha)."""
    for _ in range(70):
        mid = math.sqrt(lo * hi)
        if fn(mid, S)[0] > target:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi)


def ca_twin_alpha(pfa, N):
    return N * (pfa ** (-1.0 / N) - 1)


def os_twin_pfa(alpha, N, k):
    """Exact Gaussian-clutter OS-CFAR false-alarm probability (Rohling 1983): k C(N,k) B(k, N-k+1+alpha)."""
    lc = math.lgamma(N + 1) - math.lgamma(k + 1) - math.lgamma(N - k + 1)
    return k * math.exp(lc + math.lgamma(k) + math.lgamma(N - k + 1 + alpha) - math.lgamma(N + 1 + alpha))


def os_twin_alpha(pfa, N, k):
    lo, hi = 1e-6, 1e9
    for _ in range(100):
        mid = math.sqrt(lo * hi)
        if os_twin_pfa(mid, N, k) > pfa:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi)


def simulate_direct(det, alpha, N, nu, trials, seed, s=0.0):
    """Unconditional Monte Carlo of the detector (test cell simulated too); s > 0 adds a Rayleigh target to the test cell."""
    rng = random.Random(seed)
    fn = _stat_fns(N)[det]
    tex = (lambda: 1.0) if nu == math.inf else (lambda: rng.gammavariate(nu, 1 / nu))
    hits = 0
    for _ in range(trials):
        x = tex() * rng.expovariate(1.0) + (s * rng.expovariate(1.0) if s else 0.0)
        ref = [tex() * rng.expovariate(1.0) for _ in range(N)]
        hits += x > alpha * fn(ref)
    return hits / trials
