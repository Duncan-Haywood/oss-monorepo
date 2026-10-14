"""Local SGD whose workers compress their reports (companion to noisy-local-sgd and partial-participation).

One mode, curvature a. A worker runs H inner steps of size eta with gradient noise sigma^2 and reports the displacement
d = s x + n (x = offset from the optimum, s = 1-(1-eta a)^H, Var n = Vw = eta^2 sigma^2 (1-q^(2H))/(1-q^2), q = 1-eta a).
The server averages M compressed reports and steps x' = x - alpha * mean(Q(d_i)).

Multiplicative unbiased compressor, E[Q(v)|v] = v, Var[Q(v)|v] = omega v^2 (Bernoulli sparsification keeping each
coordinate w.p. r and rescaling by 1/r has omega = 1/r - 1):
    E x'^2 = ((1-alpha s)^2 + alpha^2 s^2 omega/M) E x^2 + alpha^2 Vw (1+omega)/M
    Stationary variance  alpha Vw (1+omega) / (M s (2 - alpha s c)),   c = 1 + omega/M,   stable iff alpha s c < 2.
Additive compressor (subtractive-dither quantisation, error uniform on +-Delta/2, independent of the value):
    Stationary variance  alpha (Vw + Delta^2/12) / (M s (2 - alpha s)).
"""
import math
import random

__all__ = ["curvature", "worker_noise", "omega_sparse", "c_factor", "floor_multiplicative", "floor_sparse", "floor_dither",
           "alpha_max", "alpha_best", "contraction", "best_contraction", "rounds_to", "omega_participation",
           "c_bandwidth", "m_max_stable", "floor_bandwidth_sparse", "dither_noise", "gauss_bits", "dither_rate_penalty", "dither_entropy", "delta_for_rate", "bandwidth_factor",
           "simulate_var", "empirical_bits"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def worker_noise(eta, a, sigma, H):
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / (1 - q * q)


def omega_sparse(r):
    """Variance-to-square ratio of keep-w.p.-r, rescale-by-1/r sparsification."""
    return 1.0 / r - 1.0


def omega_participation(p):
    """A worker that sends d/p with probability p and nothing otherwise is the same compressor: omega = 1/p - 1."""
    return 1.0 / p - 1.0


def c_factor(M, omega):
    return 1.0 + omega / M


def floor_multiplicative(s, Vw, alpha, M, omega):
    """Stationary variance of x for one mode (inf if unstable)."""
    d = 2 - alpha * s * c_factor(M, omega)
    return math.inf if d <= 0 else alpha * Vw * (1 + omega) / (M * s * d)


def floor_sparse(a_list, eta, sigma, M, r, H, alpha):
    """Stationary excess loss sum (a/2) Var x with independent per-coordinate sparsification at rate r (diagonal Hessian)."""
    om = omega_sparse(r)
    return sum(0.5 * a * floor_multiplicative(curvature(eta, a, H), worker_noise(eta, a, sigma, H), alpha, M, om)
               for a in a_list)


def dither_noise(delta):
    return delta * delta / 12.0


def floor_dither(s, Vw, delta, alpha, M):
    d = 2 - alpha * s
    return math.inf if d <= 0 else alpha * (Vw + dither_noise(delta)) / (M * s * d)


def alpha_max(s, M, omega):
    """Largest stable outer step (uncompressed allows 2/s)."""
    return 2.0 / (s * c_factor(M, omega))


def alpha_best(s, M, omega):
    """Step minimising the per-round mean-square contraction: 1/(s c)."""
    return 1.0 / (s * c_factor(M, omega))


def contraction(alpha_s, M, omega):
    """Per-round mean-square contraction of E x^2 (noise-free part): 1 - 2 alpha s + alpha^2 s^2 c."""
    return 1 - 2 * alpha_s + alpha_s ** 2 * c_factor(M, omega)


def best_contraction(M, omega):
    """1 - 1/c at alpha s = 1/c."""
    return 1.0 - 1.0 / c_factor(M, omega)


def rounds_to(eps, alpha_s, M, omega):
    """Rounds for the noise-free mean square to fall by the factor eps."""
    rho = contraction(alpha_s, M, omega)
    return math.inf if rho >= 1 else math.log(eps) / math.log(rho) if rho > 0 else 1.0


def c_bandwidth(M, B_over_d):
    """c when M workers share a per-round budget of B coordinates-worth (each sends r = B/(M d) of its d coordinates):
    c = 1 + (1/r - 1)/M = 1 + d/B - 1/M, rising with M. Needs M >= B/d so that r <= 1."""
    return 1.0 + 1.0 / B_over_d - 1.0 / M


def m_max_stable(alpha_s, B_over_d):
    """Largest number of workers among which bandwidth B can be split before alpha s c reaches 2 (inf if never):
    c grows with M towards 1 + d/B, so a small outer step tolerates any split but a large one does not."""
    excess = 1.0 + 1.0 / B_over_d - 2.0 / alpha_s
    return math.inf if excess <= 0 else 1.0 / excess


def floor_bandwidth_sparse(s, Vw, alpha, M, B_over_d):
    """Floor with sparsification at fixed total bandwidth: alpha Vw / ((B/d) s (2 - alpha s c)), c = c_bandwidth."""
    d = 2 - alpha * s * c_bandwidth(M, B_over_d)
    return math.inf if d <= 0 else alpha * Vw / (B_over_d * s * d)


def gauss_bits(sd, delta):
    """High-resolution entropy (bits) of a Gaussian of std sd quantised with step delta: 0.5 log2(2 pi e sd^2 / delta^2)."""
    return 0.5 * math.log2(2 * math.pi * math.e * sd * sd / (delta * delta))


def dither_rate_penalty(R):
    """Vq / Vw for a Gaussian report entropy-coded at R bits per coordinate: (pi e / 6) 4^-R (high resolution)."""
    return (math.pi * math.e / 6.0) * 4.0 ** (-R)


def dither_entropy(sd, delta, half_width=12.0, sub=64):
    """Exact entropy (bits) of the dithered index round((v+u)/delta), v ~ N(0, sd^2), u ~ U(-delta/2, delta/2), by quadrature.
    The pre-rounding value w = v+u has density [Phi((w+delta/2)/sd) - Phi((w-delta/2)/sd)]/delta."""
    Phi = lambda z: 0.5 * math.erfc(-z / math.sqrt(2))
    f = lambda w: (Phi((w + delta / 2) / sd) - Phi((w - delta / 2) / sd)) / delta
    K = int(half_width * sd / delta) + 2
    H = 0.0
    for k in range(-K, K + 1):
        lo = (k - 0.5) * delta
        h = delta / sub
        pk = sum(f(lo + (i + 0.5) * h) for i in range(sub)) * h
        if pk > 0:
            H -= pk * math.log2(pk)
    return H


def delta_for_rate(sd, R):
    """Step delta at which dither_entropy(sd, delta) = R bits (bisection on log delta; entropy falls with delta)."""
    lo, hi = math.log(sd * 1e-3), math.log(sd * 1e3)
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if dither_entropy(sd, math.exp(mid)) > R:
            lo = mid
        else:
            hi = mid
    return math.exp(0.5 * (lo + hi))


def bandwidth_factor(R, sd):
    """At fixed total bandwidth B = M R d, the small-step floor is proportional to R (1 + Vq/Vw), Vq = delta^2/12 at the
    step giving R bits for a report of std sd. Returns that factor (per unit d/B) using the exact entropy."""
    dl = delta_for_rate(sd, R)
    return R * (1.0 + dither_noise(dl) / (sd * sd))


def simulate_var(kind, s, Vw, alpha, M, param, rounds, burn, seed=0):
    """Literal simulation of one mode. kind 'sparse' (param r) or 'dither' (param delta) or 'none'. E x^2 after burn-in."""
    rng = random.Random(seed)
    sd = math.sqrt(Vw)
    x, acc, cnt = 0.0, 0.0, 0
    for t in range(rounds):
        tot = 0.0
        for _ in range(M):
            v = s * x + rng.gauss(0, sd)
            if kind == "sparse":
                v = v / param if rng.random() < param else 0.0
            elif kind == "dither":
                u = rng.uniform(-param / 2, param / 2)
                v = round((v + u) / param) * param - u
            tot += v
        x -= alpha * tot / M
        if t >= burn:
            acc += x * x
            cnt += 1
    return acc / cnt


def empirical_bits(sd, delta, n=200000, seed=0):
    """Empirical entropy (bits) of the dithered index round((v+u)/delta) for v ~ N(0, sd^2)."""
    rng = random.Random(seed)
    counts = {}
    for _ in range(n):
        k = round((rng.gauss(0, sd) + rng.uniform(-delta / 2, delta / 2)) / delta)
        counts[k] = counts.get(k, 0) + 1
    return -sum(c / n * math.log2(c / n) for c in counts.values())
