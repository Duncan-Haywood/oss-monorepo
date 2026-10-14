"""Multi-fidelity evaluation of a controller with a digital twin, scalar LQ. Real plant x' = a x + b u + w, twin x' = a x + bh u + w',
controller u = -k x, so the closed-loop coefficients are c = a - b k (real) and ch = a - bh k (twin). The rollout statistic is the
T-step cost Y = sum_t (q + r k^2) x_t^2 (x_0 = 0). The twin is driven by a disturbance that shares a fraction lam of the real one:
w' = lam w + sqrt(1 - lam^2) z with z an independent copy (lam = 1: the logged disturbance is replayed exactly; lam = 0: independent
simulation). Everything Gaussian, so cost covariances are exact: for jointly Gaussian pairs Cov(g'Ag, g'Bg) = 2 tr(A B) for standard
Gaussian g, and Cov(x_s^2, x'_t^2) = 2 Cov(x_s, x'_t)^2."""
import math, random

__all__ = ["cost", "optimal_gain", "corr_long_run", "corr_finite", "cost_sd_long_run", "mf_variance", "best_split", "mf_gain",
           "breakeven_price", "twin_only_crossover", "simulate_pairs", "mfmc_trial"]


def cost(a, b, k, q=1.0, r=0.1, s2=1.0):
    c = a - b * k
    return math.inf if abs(c) >= 1 else s2 * (q + r * k * k) / (1 - c * c)


def optimal_gain(a, b, q=1.0, r=0.1):
    B = r * (1 - a * a) - q * b * b
    p = (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)
    return a * b * p / (r + b * b * p)


def corr_long_run(c, ch, lam=1.0):
    """Correlation of the real and twin cost sums as T -> infinity. With C = 1/(1 - c ch) (unit noise variance), the long-run
    covariance of the x^2 series is 2 lam^2 C^2 [1/(1-c^2) + 1/(1-ch^2) - 1] and each variance is 2 V^2 [2/(1-c^2) - 1], V = 1/(1-c^2)."""
    C = 1 / (1 - c * ch)
    cov = 2 * lam ** 2 * C * C * (1 / (1 - c * c) + 1 / (1 - ch * ch) - 1)
    v1 = 2 / (1 - c * c) ** 2 * (2 / (1 - c * c) - 1)
    v2 = 2 / (1 - ch * ch) ** 2 * (2 / (1 - ch * ch) - 1)
    return cov / math.sqrt(v1 * v2)


def _gram(c, T):
    """Entries of L'L for x_t = sum_{s<t} c^(t-1-s) w_s (x_0 = 0, t = 1..T): A_ij = c^|i-j| (1 - c^(2(T-max(i,j)))) / (1 - c^2), i, j in 0..T-1."""
    n = T
    return [[c ** abs(i - j) * (1 - c ** (2 * (n - max(i, j)))) / (1 - c * c) for j in range(n)] for i in range(n)]


def corr_finite(c, ch, T, lam=1.0):
    """Exact correlation of the T-step real and twin cost sums (x_0 = 0). Cost forms: Y = w'A w, Y' = w_h'A' w_h. For the twin's
    disturbance w' = lam w + sqrt(1-lam^2) z, Cov(Y, Y') = 2 lam^2 tr(A A'); Var = 2 tr(A^2)."""
    A, Ah = _gram(c, T), _gram(ch, T)
    n = T
    t = lambda X, Y: sum(X[i][j] * Y[i][j] for i in range(n) for j in range(n))
    return lam ** 2 * t(A, Ah) / math.sqrt(t(A, A) * t(Ah, Ah))


def cost_sd_long_run(c, k, q=1.0, r=0.1, s2=1.0):
    """sqrt(T) times the standard deviation of the per-step average cost, T -> infinity: (q + r k^2) s2 sqrt(2 (2/(1-c^2) - 1)) / (1 - c^2)."""
    return (q + r * k * k) * s2 * math.sqrt(2 * (2 / (1 - c * c) - 1)) / (1 - c * c)


def mf_variance(var_r, rho, n, N, exact_beta=True):
    """Variance of the control-variate estimator  mean_real(Y) - beta (mean_twin_on_n(Y') - mean_twin_on_N(Y'))  with n paired
    rollouts and N >= n twin rollouts (nested), at the optimal beta: var_r [1/n - (1/n - 1/N) rho^2]."""
    return var_r * (1 / n - (1 / n - 1 / N) * rho * rho)


def best_split(rho, cr, ct, budget):
    """Optimal (n, N) for a budget n cr + N ct (ignoring integer rounding) and the resulting variance factor var / var_r.
    N/n = sqrt(cr rho^2 / (ct (1 - rho^2))); variance = var_r (sqrt(cr (1-rho^2)) + sqrt(ct) |rho|)^2 / budget."""
    if rho * rho >= 1:
        return budget / ct, budget / ct, 0.0
    ratio = math.sqrt(cr * rho * rho / (ct * (1 - rho * rho)))
    if ratio <= 1:
        return budget / cr, budget / cr, cr / budget
    n = budget / (cr + ratio * ct)
    return n, ratio * n, (math.sqrt(cr * (1 - rho * rho)) + math.sqrt(ct) * abs(rho)) ** 2 / budget


def mf_gain(rho, w):
    """Variance ratio (multi-fidelity / real-only at equal budget) when a twin rollout costs w times a real one:
    (sqrt(1-rho^2) + sqrt(w) |rho|)^2 for a worthwhile twin, else 1."""
    return min(1.0, (math.sqrt(1 - rho * rho) + math.sqrt(w) * abs(rho)) ** 2)


def breakeven_price(rho):
    """Largest twin/real cost ratio w at which the twin still lowers the variance: sqrt(1-rho^2) + sqrt(w) rho < 1."""
    return (1 - math.sqrt(1 - rho * rho)) ** 2 / (rho * rho)


def twin_only_crossover(var_r, cr, var_t, ct, bias):
    """Budget below which spending it all on twin rollouts (MSE bias^2 + var_t ct / B) beats spending it on real ones (var_r cr / B)."""
    return max(0.0, (var_r * cr - var_t * ct)) / (bias * bias)


def simulate_pairs(a, b, bh, k, T, reps, lam, seed, q=1.0, r=0.1, s2=1.0):
    """reps paired rollouts: returns lists (Y real, Y twin) of per-step average cost (x_0 = 0), twin disturbance sharing lam."""
    rng = random.Random(seed)
    c, ch, wgt, cross = a - b * k, a - bh * k, q + r * k * k, math.sqrt(1 - lam * lam)
    s = math.sqrt(s2)
    Y, Yh = [], []
    for _ in range(reps):
        x = xh = 0.0
        y = yh = 0.0
        for _ in range(T):
            w = rng.gauss(0, s)
            wh = lam * w + cross * rng.gauss(0, s)
            x = c * x + w
            xh = ch * xh + wh
            y += x * x
            yh += xh * xh
        Y.append(wgt * y / T)
        Yh.append(wgt * yh / T)
    return Y, Yh


def mfmc_trial(Y, Yh, n, N, beta):
    """One control-variate estimate from the first n paired rollouts and the first N twin rollouts (Yh must hold N values)."""
    mr = sum(Y[:n]) / n
    mh_n = sum(Yh[:n]) / n
    mh_N = sum(Yh[:N]) / N
    return mr - beta * (mh_n - mh_N)
