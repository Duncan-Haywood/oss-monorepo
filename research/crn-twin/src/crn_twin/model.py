"""Seed-paired policy comparison in a digital twin (common random numbers, CRN).
A twin episode has T steps; step t adds w_t * z to the return, where z is the next unread draw of a seeded stream.
Policy A reads z_t at step t.  Policy B sometimes consumes an extra draw first (a replan, a re-sampled sensor
noise): with probability q per step its read pointer advances by one, so at step t it reads z_{t+D_t}, D_t ~ Bin(t,q).
Both policies get the same seed (same stream), but their outcomes are only as correlated as the pointers stay aligned."""
import math, random

__all__ = ["weights", "rho_exact", "sum_w2", "sample_pair", "diff_var_exact", "n_required", "t_quantile",
           "paired_test_power"]


def weights(kind, T, gamma=0.9):
    if kind == "flat":
        return [1.0] * T
    if kind == "discount":
        return [gamma ** t for t in range(T)]
    if kind == "ramp":
        return [float(t + 1) for t in range(T)]
    if kind == "terminal":
        return [0.0] * (T - 1) + [1.0]
    raise ValueError(kind)


def sum_w2(w):
    return sum(x * x for x in w)


def rho_exact(w, q):
    """Correlation of the two returns: sum_t sum_d Bin(t,q)(d) w_t w_{t+d} / sum w^2 (w_s = 0 beyond T)."""
    T = len(w)
    pmf = [1.0]
    cov = 0.0
    for t in range(1, T + 1):
        new = [0.0] * (t + 1)
        for d, p in enumerate(pmf):
            new[d] += p * (1 - q)
            new[d + 1] += p * q
        pmf = new
        for d, p in enumerate(pmf):
            if t + d <= T:
                cov += p * w[t - 1] * w[t + d - 1]
    return cov / sum_w2(w)


def sample_pair(w, q, rng, mode="stream", sigma=1.0):
    """Noise parts of (R_A, R_B) under one shared seed.  mode='counter': draw for step t is keyed by t (extras come
    from a separate stream), so the pointers never desynchronise."""
    T = len(w)
    z = [rng.gauss(0.0, 1.0) for _ in range(2 * T + 1)]
    a = sum(w[t] * z[t] for t in range(T))
    off, b = 0, 0.0
    for t in range(T):
        if rng.random() < q:
            off += 1
        b += w[t] * z[t + (off if mode == "stream" else 0)]
    return sigma * a, sigma * b


def diff_var_exact(w, q, sigma=1.0, paired=True):
    v = sigma * sigma * sum_w2(w)
    return 2 * v * (1 - rho_exact(w, q)) if paired else 2 * v


def n_required(var_diff, gap, alpha=0.05, power=0.9):
    zq = _phi_inv(1 - alpha / 2) + _phi_inv(power)
    return zq * zq * var_diff / (gap * gap)


def _phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _phi_inv(p):
    lo, hi = -12.0, 12.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if _phi(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def _t_cdf(x, nu):
    th = math.atan(x / math.sqrt(nu))
    c, s = math.cos(th), math.sin(th)
    if nu % 2 == 1:
        acc, term = c, c
        for k in range(1, (nu - 1) // 2):
            term *= c * c * (2.0 * k) / (2.0 * k + 1.0)
            acc += term
        body = th + s * acc if nu > 1 else th
        return 0.5 + body / math.pi
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
        if _t_cdf(mid, nu) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def paired_test_power(w, q, gap, n, reps, rng, mode="stream", alpha=0.05):
    """Fraction of reps in which a two-sided paired t-test on n seed-paired episodes detects R_A - R_B = gap."""
    crit = t_quantile(1 - alpha / 2, n - 1)
    hit = 0
    for _ in range(reps):
        d = []
        for _ in range(n):
            a, b = sample_pair(w, q, rng, mode)
            d.append(gap + a - b)
        m = sum(d) / n
        sd = math.sqrt(sum((x - m) ** 2 for x in d) / (n - 1))
        if sd == 0.0 or abs(m) / (sd / math.sqrt(n)) > crit:
            hit += 1
    return hit / reps
