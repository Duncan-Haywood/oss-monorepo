"""Stale rollouts: how much is an off-policy sample worth when the policy has moved?

Model.  A peer generated x ~ pi_b = N(mu_b, s^2) with an older policy; the learner's current policy is pi = N(mu, s^2).
Shift delta = (mu - mu_b)/s, importance weight w(x) = pi/pi_b = exp(delta z - delta^2/2) with z = (x-mu_b)/s ~ N(0,1) under pi_b.
Exact moments under pi_b (Gaussian integrals):
    E w = 1,   E w^2 = e^{delta^2}      so   Var w = e^{delta^2} - 1  and  ESS/n ~= 1/E w^2 = e^{-delta^2}.
Truncated weights w_c = min(w, c), c >= 1, cut at z <= t with t = (ln c + delta^2/2)/delta (delta > 0):
    E w_c            = Phi(t-delta) + c (1-Phi(t))                     (mass lost: 1 - E w_c >= 0)
    E w_c^2          = e^{delta^2} Phi(t-2 delta) + c^2 (1-Phi(t))
    E[w_c s z]       = s [ delta Phi(t-delta) - phi(t-delta) + c phi(t) ]   vs the true E_pi[x-mu_b] = s delta   (bias s*(...))
Estimating the policy-mean shift with n samples (target: delta), the per-sample estimators
    plain IS      : w z            unbiased, Var = E w^2 z^2 - delta^2,   E w^2 z^2 = e^{delta^2}(1 + 4 delta^2)
    truncated IS  : w_c z          bias b(c), Var from the moments below, MSE = b^2 + Var/n.
E[w_c^2 z^2] = e^{delta^2} int_{z<=t} z^2 phi(z-2 delta) dz + c^2 int_{z>t} z^2 phi(z) dz, with
    int_{z<=t} z^2 phi(z-m) dz = (1+m^2) Phi(u) - (u+2m) phi(u),  u = t-m   (checked against Monte Carlo to 3 digits).
A learner who needs ESS/n >= rho accepts staleness while delta <= sqrt(ln(1/rho)); with a per-version drift of `drift`
standard deviations, the window is k_max = floor(sqrt(ln(1/rho))/drift).
"""
import math, random

__all__ = ["Phi", "phi", "second_moment", "ess_fraction", "trunc_mean_weight", "trunc_second_weight", "trunc_mass_lost",
           "trunc_cut", "plain_moments", "trunc_moments", "mse_trunc", "mse_plain", "best_cap", "max_shift", "window",
           "effective_size", "simulate"]


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def phi(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def second_moment(delta):
    return math.exp(delta * delta)


def ess_fraction(delta):
    return math.exp(-delta * delta)


def trunc_cut(delta, c):
    """z-threshold t with w <= c iff z <= t (delta > 0)."""
    return (math.log(c) + 0.5 * delta * delta) / delta


def trunc_mean_weight(delta, c):
    t = trunc_cut(delta, c)
    return Phi(t - delta) + c * (1.0 - Phi(t))


def trunc_mass_lost(delta, c):
    return 1.0 - trunc_mean_weight(delta, c)


def trunc_second_weight(delta, c):
    t = trunc_cut(delta, c)
    return math.exp(delta * delta) * Phi(t - 2 * delta) + c * c * (1.0 - Phi(t))


def _tail_z2(t):
    """int_{z>t} z^2 phi(z) dz."""
    return t * phi(t) + (1.0 - Phi(t))


def plain_moments(delta):
    """(mean, second moment) of w z under pi_b: mean delta, E w^2 z^2 = e^{d^2}(1+4 d^2)."""
    return delta, math.exp(delta * delta) * (1.0 + 4.0 * delta * delta)


def trunc_moments(delta, c):
    """(mean, second moment) of min(w,c) z under pi_b, closed forms."""
    t = trunc_cut(delta, c)
    mean = delta * Phi(t - delta) - phi(t - delta) + c * phi(t)
    u = t - 2 * delta
    lower = math.exp(delta * delta) * ((1.0 + 4 * delta * delta) * Phi(u) - u * phi(u) - 4 * delta * phi(u))
    return mean, lower + c * c * _tail_z2(t)


def mse_plain(delta, n):
    m, s2 = plain_moments(delta)
    return (s2 - m * m) / n


def mse_trunc(delta, c, n):
    m, s2 = trunc_moments(delta, c)
    return (m - delta) ** 2 + (s2 - m * m) / n


def best_cap(delta, n, grid=None):
    """Cap minimising the MSE of the truncated-IS shift estimator (log grid); returns (c, mse)."""
    grid = grid or [math.exp(0.02 * i) for i in range(0, 600)]
    best = min(grid, key=lambda c: mse_trunc(delta, c, n))
    return best, mse_trunc(delta, best, n)


def max_shift(rho):
    """Largest shift (in policy std devs) keeping ESS/n >= rho."""
    return math.sqrt(math.log(1.0 / rho))


def window(rho, drift):
    """Number of policy versions a rollout may lag and still keep ESS/n >= rho when each version moves the mean by `drift` s."""
    return int(math.floor(max_shift(rho) / drift + 1e-12))


def effective_size(n, delta):
    """Kish ESS of n stale samples of shift delta (= n e^{-delta^2} in expectation at the population level)."""
    return n * ess_fraction(delta)


def simulate(delta, c, n, rng):
    """Draw n samples z ~ N(0,1); return (mean w, mean w^2, mean w z, mean min(w,c) z, mean min(w,c), Kish ESS/n)."""
    sw = sw2 = swz = scz = sc = 0.0
    for _ in range(n):
        z = rng.gauss(0, 1)
        w = math.exp(delta * z - 0.5 * delta * delta)
        wc = min(w, c)
        sw += w; sw2 += w * w; swz += w * z; scz += wc * z; sc += wc
    return sw / n, sw2 / n, swz / n, scz / n, sc / n, (sw * sw / sw2) / n
