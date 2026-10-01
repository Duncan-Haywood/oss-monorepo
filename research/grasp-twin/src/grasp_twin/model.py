"""Grip force of a two-finger pinch chosen in a digital twin (e.g. lab glassware in a manipulation workcell).
Force is measured in units of the minimum load per finger, w0 = W(1+a)/2 (weight W, transport acceleration a g), so a grasp with
friction mu and normal force F holds iff mu F >= 1, and the object is crushed iff F > F_c (fragility). With ln mu ~ N(m, s^2) and
ln F_c ~ N(f, r^2) independent, x = ln F gives expected loss
    J(x) = Ls Phi((-x - m)/s) + Lc Phi((x - f)/r).
Stationarity Ls phi(u)/s = Lc phi(v)/r, u = -(x+m)/s, v = (x-f)/r, is a quadratic in x (closed form below)."""
import math, random, statistics

__all__ = ["Phi", "Params", "loss", "slip", "crush", "x_star", "x_star_numeric", "regret", "twin_policy",
           "dr_params", "fit_plugin", "regret_delta", "simulate_grasps"]


def Phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


class Params:
    """Log-friction (m, s), log-crush-force (f, r), and loss weights (Ls per slip, Lc per crush)."""
    def __init__(self, m, s, f, r, Ls=1.0, Lc=1.0):
        self.m, self.s, self.f, self.r, self.Ls, self.Lc = m, s, f, r, Ls, Lc

    def replace(self, **kw):
        d = dict(m=self.m, s=self.s, f=self.f, r=self.r, Ls=self.Ls, Lc=self.Lc)
        d.update(kw)
        return Params(**d)


def slip(p, x):
    return Phi((-x - p.m) / p.s)


def crush(p, x):
    return Phi((x - p.f) / p.r)


def loss(p, x):
    return p.Ls * slip(p, x) + p.Lc * crush(p, x)


def x_star(p):
    """Optimal log force: the root of (x+m)^2/s^2 - (x-f)^2/r^2 = 2 ln(Ls r/(Lc s)) with J'' > 0 and the lower loss.
    Returns None if both roots are maxima/inflections (no interior optimum; cannot happen for positive weights with -m < f)."""
    k = math.log(p.Ls * p.r / (p.Lc * p.s))
    A = 1 / p.s ** 2 - 1 / p.r ** 2
    B = 2 * p.m / p.s ** 2 + 2 * p.f / p.r ** 2
    C = p.m ** 2 / p.s ** 2 - p.f ** 2 / p.r ** 2 - 2 * k
    if abs(A) < 1e-12:
        roots = [-C / B]
    else:
        disc = B * B - 4 * A * C
        if disc < 0: return None
        q = math.sqrt(disc)
        roots = [(-B - q) / (2 * A), (-B + q) / (2 * A)]
    cands = [x for x in roots if _second_derivative(p, x) > 0]
    return min(cands, key=lambda x: loss(p, x)) if cands else None


def _second_derivative(p, x, e=1e-5):
    return (loss(p, x + e) - 2 * loss(p, x) + loss(p, x - e)) / e ** 2


def x_star_numeric(p, lo=-6.0, hi=8.0, n=4000):
    """Grid search plus golden-section refinement; independent check on x_star."""
    xs = [lo + (hi - lo) * i / n for i in range(n + 1)]
    i = min(range(n + 1), key=lambda j: loss(p, xs[j]))
    a, b = xs[max(i - 1, 0)], xs[min(i + 1, n)]
    g = (math.sqrt(5) - 1) / 2
    for _ in range(100):
        x1, x2 = b - g * (b - a), a + g * (b - a)
        if loss(p, x1) < loss(p, x2): b = x2
        else: a = x1
    return (a + b) / 2


def _opt(p):
    x = x_star(p)
    return x_star_numeric(p) if x is None else x


def twin_policy(real, twin):
    """Real risk of the force that is optimal in the twin. Returns (x_twin, x_real, real_loss_at_twin_x, real_optimum).
    A twin with (near) zero spread has a flat zero-loss plateau and no unique optimum; the numeric fallback then returns
    an arbitrary point of it, so use spreads >= 0.05 or the plateau helpers in experiments/run.py."""
    xt, xr = _opt(twin), _opt(real)
    return xt, xr, loss(real, xt), loss(real, xr)


def regret(real, twin):
    xt, xr, jt, jr = twin_policy(real, twin)
    return jt - jr


def dr_params(twin, width):
    """Domain randomisation: replace the twin's friction spread by `width` (log-friction sd) at the twin's nominal friction."""
    return twin.replace(s=width)


def fit_plugin(real, n, rng):
    """Lognormal MLE of (m, s) from n real friction measurements; crush model and losses taken as known. Returns fitted Params."""
    ys = [rng.gauss(real.m, real.s) for _ in range(n)]
    m = statistics.fmean(ys)
    s = math.sqrt(sum((y - m) ** 2 for y in ys) / n)
    return real.replace(m=m, s=max(s, 1e-6))


def regret_delta(real, n, e=1e-5):
    """Delta-method regret of the plug-in force: 0.5 J''(x*) Var(x_hat), Var from the Fisher information
    (Var m_hat = s^2/n, Var s_hat = s^2/2n, independent) and the sensitivities dx*/dm, dx*/ds by central differences."""
    xs = x_star(real)
    dm = (x_star(real.replace(m=real.m + e)) - x_star(real.replace(m=real.m - e))) / (2 * e)
    ds = (x_star(real.replace(s=real.s + e)) - x_star(real.replace(s=real.s - e))) / (2 * e)
    var = dm ** 2 * real.s ** 2 / n + ds ** 2 * real.s ** 2 / (2 * n)
    return 0.5 * _second_derivative(real, xs) * var


def simulate_grasps(p, x, trials, rng):
    """Monte Carlo of the event model: draw mu and F_c, count slips (mu F < 1) and crushes (F > F_c). Returns (slip_rate, crush_rate)."""
    F = math.exp(x)
    sl = cr = 0
    for _ in range(trials):
        if math.exp(rng.gauss(p.m, p.s)) * F < 1: sl += 1
        if F > math.exp(rng.gauss(p.f, p.r)): cr += 1
    return sl / trials, cr / trials
