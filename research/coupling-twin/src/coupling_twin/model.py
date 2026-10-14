"""Coupling twin.  Two axes, discrete-time integral loop x+ = x - k*G*x, with actuator coupling G = [[1, c12], [c21, 1]].

The twin models each axis alone (G = I), so for gain k it predicts per-step decay |1-k| and stability iff 0 < k < 2.
The real loop has eigenvalues 1 - k(1 +- r) of I - kG, where r = sqrt(c12*c21) (real if p = c12*c21 >= 0, imaginary if p < 0,
in which case the modulus is sqrt((1-k)^2 + k^2 |p|)).  Everything below is closed form; `simulate` checks it by iteration.
"""
import math
import random


def spectral_radius(k, c12, c21):
    p = c12 * c21
    if p >= 0:
        r = math.sqrt(p)
        return max(abs(1 - k * (1 + r)), abs(1 - k * (1 - r)))
    return math.sqrt((1 - k) ** 2 + k * k * (-p))


def stable_gain_limit(c12, c21):
    """Supremum of k > 0 with spectral radius < 1; 0.0 when no positive gain is stable."""
    p = c12 * c21
    if p >= 0:
        r = math.sqrt(p)
        return 2.0 / (1 + r) if r < 1 else 0.0
    return 2.0 / (1 - p)


def simulate(k, c12, c21, x0, n):
    """Iterate x+ = x - k G x; returns the list of Euclidean norms |x_t| for t = 0..n."""
    a, b = x0
    out = [math.hypot(a, b)]
    for _ in range(n):
        a, b = a - k * (a + c12 * b), b - k * (c21 * a + b)
        out.append(math.hypot(a, b))
    return out


def steps_to_tol(rho, tol):
    """Smallest t with rho^t <= tol for 0 < rho < 1 (the decay-rate prediction of a mode with modulus rho)."""
    return math.ceil(math.log(tol) / math.log(rho))


def fitted_diag_gain(c, corr):
    """Population OLS slope of y1 = u1 + c u2 on u1 alone when corr(u1,u2) = corr and the inputs have equal variance."""
    return 1 + c * corr


def real_rate_twin_fit(c, corr):
    """Spectral radius of the real loop when the gain is k = 1/b_hat (twin-deadbeat for the fitted diagonal gain)."""
    return spectral_radius(1 / fitted_diag_gain(c, corr), c, c)


def sample_logs(n, c, corr, sigma, rng):
    """n logged (u1, u2, y1) with unit-variance inputs of correlation `corr`, y1 = u1 + c u2 + N(0, sigma^2)."""
    rows = []
    s = math.sqrt(1 - corr * corr)
    for _ in range(n):
        u1 = rng.gauss(0, 1)
        u2 = corr * u1 + s * rng.gauss(0, 1)
        rows.append((u1, u2, u1 + c * u2 + sigma * rng.gauss(0, 1)))
    return rows


def fit_diag(rows):
    """Per-axis (twin) fit: slope of y1 on u1 only."""
    return sum(u1 * y for u1, _, y in rows) / sum(u1 * u1 for u1, _, _ in rows)


def fit_full(rows):
    """Two-regressor OLS of y1 on (u1, u2); returns (b11, c12)."""
    s11 = sum(a * a for a, _, _ in rows)
    s12 = sum(a * b for a, b, _ in rows)
    s22 = sum(b * b for _, b, _ in rows)
    t1 = sum(a * y for a, _, y in rows)
    t2 = sum(b * y for _, b, y in rows)
    d = s11 * s22 - s12 * s12
    return (s22 * t1 - s12 * t2) / d, (s11 * t2 - s12 * t1) / d


def mc_fit(n, c, corr, sigma, reps, seed=0):
    """Mean and variance of the diagonal fit and of the full-fit coupling estimate over `reps` log sets."""
    rng = random.Random(seed)
    d, f = [], []
    for _ in range(reps):
        rows = sample_logs(n, c, corr, sigma, rng)
        d.append(fit_diag(rows))
        f.append(fit_full(rows)[1])
    m = lambda v: sum(v) / len(v)
    var = lambda v: sum((x - m(v)) ** 2 for x in v) / (len(v) - 1)
    return m(d), var(d), m(f), var(f)
