"""Gaussian-signal model: theta in {0,1}, signal s ~ N((2 theta - 1) mu, 1), prior pi.
True posterior logit L = logit(pi) + 2 mu s, p = expit(L). A verifier reports r = expit(a L + b)
(a = calibration slope, b = shift). Quadrature is trapezoid on a fine grid (exact to ~1e-12 for Gaussians)."""
import math, random

__all__ = ["expit", "logit", "expect", "brier", "rel_brier", "log_loss", "rel_log", "unc_brier",
           "local_excess", "fisher", "brier_hess", "predicted_excess", "fit_logistic",
           "simulate_recal", "crossing_slope", "worse_than_prior_slope"]


def expit(x):
    if x >= 0:
        return 1 / (1 + math.exp(-x))
    e = math.exp(x)
    return e / (1 + e)


def logit(p):
    return math.log(p / (1 - p))


def _grid(mu, n=4001, width=9.0):
    lo, hi = -mu - width, mu + width
    h = (hi - lo) / (n - 1)
    return [lo + i * h for i in range(n)], h


def _phi(s, m):
    return math.exp(-0.5 * (s - m) ** 2) / math.sqrt(2 * math.pi)


def expect(h, pi, mu):
    """E[h(theta, s, L, p)] over the joint law."""
    xs, dx = _grid(mu)
    lp = logit(pi)
    tot = 0.0
    for i, s in enumerate(xs):
        w = dx * (0.5 if i in (0, len(xs) - 1) else 1.0)
        L = lp + 2 * mu * s
        p = expit(L)
        tot += w * (pi * _phi(s, mu) * h(1, s, L, p) + (1 - pi) * _phi(s, -mu) * h(0, s, L, p))
    return tot


def unc_brier(pi):
    return pi * (1 - pi)


def brier(pi, mu, a=1.0, b=0.0):
    return expect(lambda th, s, L, p: (expit(a * L + b) - th) ** 2, pi, mu)


def rel_brier(pi, mu, a, b=0.0):
    """Miscalibration term E[(r-p)^2]; equals brier(a,b) - brier(1,0) exactly."""
    return expect(lambda th, s, L, p: (expit(a * L + b) - p) ** 2, pi, mu)


def log_loss(pi, mu, a=1.0, b=0.0):
    def h(th, s, L, p):
        r = min(max(expit(a * L + b), 1e-300), 1 - 1e-16)
        return -math.log(r if th else 1 - r)
    return expect(h, pi, mu)


def rel_log(pi, mu, a, b=0.0):
    """E[KL(p || r)]; equals log_loss(a,b) - log_loss(1,0) exactly."""
    def h(th, s, L, p):
        r = min(max(expit(a * L + b), 1e-300), 1 - 1e-16)
        return p * math.log(p / r) + (1 - p) * math.log((1 - p) / (1 - r))
    return expect(h, pi, mu)


def local_excess(pi, mu, a, b=0.0):
    """Small-distortion law: E[(p(1-p))^2 ((a-1)L + b)^2]."""
    return expect(lambda th, s, L, p: (p * (1 - p)) ** 2 * ((a - 1) * L + b) ** 2, pi, mu)


def _mat(pi, mu, wfun):
    m = [[0.0, 0.0], [0.0, 0.0]]
    for i, j, f in ((0, 0, lambda L: L * L), (0, 1, lambda L: L), (1, 1, lambda L: 1.0)):
        v = expect(lambda th, s, L, p: wfun(p) * f(L), pi, mu)
        m[i][j] = v
        m[j][i] = v
    return m


def fisher(pi, mu):
    """Logistic Fisher information per sample for (a, b) at the truth: E[p(1-p) x x^T], x=(L,1)."""
    return _mat(pi, mu, lambda p: p * (1 - p))


def brier_hess(pi, mu):
    """Hessian of expected Brier in (a,b) at the truth: 2 E[(p(1-p))^2 x x^T]."""
    m = _mat(pi, mu, lambda p: (p * (1 - p)) ** 2)
    return [[2 * v for v in row] for row in m]


def predicted_excess(pi, mu, n):
    """Asymptotic excess Brier of an n-sample logistic recalibration: (1/2n) tr(H I^-1)."""
    H, I = brier_hess(pi, mu), fisher(pi, mu)
    det = I[0][0] * I[1][1] - I[0][1] ** 2
    inv = [[I[1][1] / det, -I[0][1] / det], [-I[0][1] / det, I[0][0] / det]]
    tr = sum(H[i][k] * inv[k][i] for i in range(2) for k in range(2))
    return tr / (2 * n)


def fit_logistic(Ls, ys, iters=50, ridge=1e-6):
    a, b = 1.0, 0.0
    for _ in range(iters):
        g0 = g1 = 0.0
        h00 = h01 = h11 = 0.0
        for L, y in zip(Ls, ys):
            r = expit(a * L + b)
            w = r * (1 - r)
            g0 += (r - y) * L; g1 += (r - y)
            h00 += w * L * L; h01 += w * L; h11 += w
        g0 += ridge * (a - 1); h00 += ridge; h11 += ridge
        det = h00 * h11 - h01 * h01
        da = (h11 * g0 - h01 * g1) / det
        db = (-h01 * g0 + h00 * g1) / det
        a -= da; b -= db
        if abs(da) + abs(db) < 1e-10:
            break
    return a, b


def simulate_recal(pi, mu, n, trials, seed=0):
    """Mean excess Brier (exact quadrature) of the map fitted on n labelled outcomes, vs the calibrated one."""
    rng = random.Random(seed)
    lp = logit(pi)
    base = brier(pi, mu)
    tot = 0.0
    for _ in range(trials):
        Ls, ys = [], []
        for _ in range(n):
            th = 1 if rng.random() < pi else 0
            s = rng.gauss(mu if th else -mu, 1.0)
            Ls.append(lp + 2 * mu * s); ys.append(th)
        a, b = fit_logistic(Ls, ys)
        tot += brier(pi, mu, a, b) - base
    return tot / trials


def _bisect(f, lo, hi, it=60):
    flo = f(lo)
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        fm = f(mid)
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return 0.5 * (lo + hi)


def _loss(rule):
    return brier if rule == "brier" else log_loss


def crossing_slope(pi, mu_a, mu_b, lo, hi, rule="brier"):
    """Slope a in [lo,hi] at which verifier A (resolution mu_a, slope a) ties calibrated verifier B
    (resolution mu_b) under the raw score `rule` ('brier' or 'log')."""
    f = _loss(rule)
    tb = f(pi, mu_b)
    return _bisect(lambda a: f(pi, mu_a, a) - tb, lo, hi)


def worse_than_prior_slope(pi, mu, lo, hi, rule="brier"):
    """Slope above which the verifier's raw loss exceeds the constant-prior forecaster's
    (pi(1-pi) for Brier, binary entropy for log)."""
    f = _loss(rule)
    u = unc_brier(pi) if rule == "brier" else -(pi * math.log(pi) + (1 - pi) * math.log(1 - pi))
    return _bisect(lambda a: f(pi, mu, a) - u, lo, hi)
