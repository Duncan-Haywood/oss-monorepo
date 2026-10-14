"""Doppler velocity aliasing.  A radar with unambiguous velocity V reports wrap(y) = y - 2V*round(y/2V) in [-V, V].
Twin: reports y = mu + e, e ~ N(0, s^2) (unlimited unambiguous velocity).  Real: reports wrap(y).
All quantities are for the mean of n independent returns off one target of true radial speed mu."""
import math, random

__all__ = ["wrap", "bias", "mse1", "mse_mean", "twin_mse", "mse_ratio", "safe_speed", "unwrap_fail_prob",
           "mse_unwrapped", "sample_wrapped", "mc_mean_mse", "mc_unwrapped_mse"]


def _phi(z):
    return math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)


def _Phi(z):
    return 0.5 * math.erfc(-z / math.sqrt(2))


def wrap(y, V):
    return y - 2 * V * math.floor((y + V) / (2 * V))


def _kmax(mu, s, V):
    return int(math.ceil((abs(mu) + 12 * s) / (2 * V))) + 1


def bias(mu, s, V):
    """Exact E[wrap(y)] - mu = -2V E[k], k = floor((y+V)/2V), E[k] = sum_{j>=1} P(y >= (2j-1)V) - P(y < -(2j-1)V)."""
    tot = 0.0
    for j in range(1, _kmax(mu, s, V) + 1):
        t = (2 * j - 1) * V
        tot += _Phi((mu - t) / s) - _Phi((-t - mu) / s)
    return -2 * V * tot


def mse1(mu, s, V):
    """Exact E[(wrap(y)-mu)^2] for one return: sum over wrap cells k of the Gaussian partial moments of (s z - 2Vk)."""
    K = _kmax(mu, s, V)
    tot = 0.0
    for k in range(-K, K + 1):
        a = ((2 * k - 1) * V - mu) / s
        b = ((2 * k + 1) * V - mu) / s
        m0 = _Phi(b) - _Phi(a)
        m1 = _phi(a) - _phi(b)
        m2 = m0 + a * _phi(a) - b * _phi(b)
        tot += s * s * m2 - 4 * V * k * s * m1 + 4 * V * V * k * k * m0
    return tot


def mse_mean(n, mu, s, V):
    """Exact real MSE of the mean of n wrapped returns: bias^2 + Var_1/n (Var_1 = mse1 - bias^2)."""
    b = bias(mu, s, V)
    return b * b + (mse1(mu, s, V) - b * b) / n


def twin_mse(n, s):
    return s * s / n


def mse_ratio(n, mu, s, V):
    """Real MSE over the MSE the twin claims."""
    return mse_mean(n, mu, s, V) / twin_mse(n, s)


def safe_speed(tol, s, V):
    """Largest mu in [0, V] with |bias| <= tol (bias is increasing in mu on [0,V]); bisection."""
    lo, hi = 0.0, V
    if abs(bias(hi, s, V)) <= tol:
        return V
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if abs(bias(mid, s, V)) <= tol:
            lo = mid
        else:
            hi = mid
    return lo


def unwrap_fail_prob(s, sp, V):
    """Unwrapping each return to the lattice point nearest a prior speed p = mu + N(0, sp^2): wrong iff |e-ep| > V."""
    S = math.hypot(s, sp)
    return 2 * _Phi(-V / S)


def mse_unwrapped(s, sp, V):
    """Exact MSE of one prior-unwrapped return: s^2 + 4V^2 E[J^2] - 4V (s^2/S^2) E[dJ], d = e-ep ~ N(0,S^2),
    J = round(d/2V), using E[e J] = (s^2/S^2) E[d J]."""
    S = math.hypot(s, sp)
    EJ2 = EdJ = 0.0
    for k in range(1, int(12 * S / (2 * V)) + 3):
        pk = _Phi(((2 * k + 1) * V) / S) - _Phi(((2 * k - 1) * V) / S)
        EJ2 += 2 * k * k * pk
        EdJ += 2 * k * S * (_phi((2 * k - 1) * V / S) - _phi((2 * k + 1) * V / S))
    return s * s + 4 * V * V * EJ2 - 4 * V * (s * s / (S * S)) * EdJ


def sample_wrapped(n, mu, s, V, rng):
    return [wrap(mu + rng.gauss(0, s), V) for _ in range(n)]


def mc_mean_mse(n, mu, s, V, reps, rng):
    """Monte Carlo (MSE, standard error) of the mean of n wrapped returns."""
    v = [(sum(sample_wrapped(n, mu, s, V, rng)) / n - mu) ** 2 for _ in range(reps)]
    m = sum(v) / reps
    se = math.sqrt(sum((x - m) ** 2 for x in v) / (reps - 1) / reps)
    return m, se


def mc_unwrapped_mse(mu, s, sp, V, reps, rng):
    v = []
    for _ in range(reps):
        y = mu + rng.gauss(0, s)
        p = mu + rng.gauss(0, sp)
        w = wrap(y, V)
        u = w + 2 * V * round((p - w) / (2 * V))
        v.append((u - mu) ** 2)
    m = sum(v) / reps
    se = math.sqrt(sum((x - m) ** 2 for x in v) / (reps - 1) / reps)
    return m, se
