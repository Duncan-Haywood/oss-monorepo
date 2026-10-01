"""Twin as control variate for policy evaluation. Scalar plant x_{t+1} = a x_t + b u_t + w_t, w ~ N(0, s2), x_0 = 0, fixed policy u = -k x.
Rollout cost J = c * sum_{t=1..T} x_t^2 with c = q + r k^2. A twin has gain bhat (same a, k). The twin can replay a fraction lam of the real
disturbance variance: w'_t = sqrt(lam) w_t + sqrt(1-lam) z_t. J = w' M w is a Gaussian quadratic form, so mean, variance and the real/twin
covariance are exact: E J = s2 tr M, Var J = 2 s2^2 tr M^2, Cov(J, J') = 2 s2^2 lam tr(M M')."""
import math, random

__all__ = ["closed_loop", "gram", "mean_cost", "var_cost", "cov_cost", "rho", "bias", "cv_variance", "best_ratio", "best_variance",
           "speedup", "twin_only_crossover", "rollout", "cv_estimate", "real_estimate", "coverage_trial"]


def closed_loop(a, b, k):
    return a - b * k


def gram(alpha, T):
    """(L'L)[s][s'] for x_t = sum_{s<t} alpha^{t-1-s} w_s, t=1..T, s=0..T-1 (closed form geometric sums)."""
    g = 1 - alpha * alpha
    out = []
    for s in range(T):
        row = []
        for u in range(T):
            m, d = max(s, u), abs(s - u)
            row.append(alpha ** d * (1 - alpha ** (2 * (T - m))) / g)
        out.append(row)
    return out


def _tr(A, B):
    return sum(x * y for ra, rb in zip(A, B) for x, y in zip(ra, rb))


def mean_cost(alpha, T, c, s2=1.0):
    G = gram(alpha, T)
    return s2 * c * sum(G[i][i] for i in range(T))


def var_cost(alpha, T, c, s2=1.0):
    G = gram(alpha, T)
    return 2 * s2 * s2 * c * c * _tr(G, G)


def cov_cost(alpha, alpha_t, T, c, lam=1.0, s2=1.0):
    return 2 * s2 * s2 * c * c * lam * _tr(gram(alpha, T), gram(alpha_t, T))


def rho(alpha, alpha_t, T, lam=1.0):
    """Exact correlation between the real and twin rollout cost: lam * tr(GG') / sqrt(tr G^2 tr G'^2)."""
    G, H = gram(alpha, T), gram(alpha_t, T)
    return lam * _tr(G, H) / math.sqrt(_tr(G, G) * _tr(H, H))


def bias(alpha, alpha_t, T, c, s2=1.0):
    """Twin-only bias delta = E J_twin - E J_real."""
    return mean_cost(alpha_t, T, c, s2) - mean_cost(alpha, T, c, s2)


def cv_variance(var_r, n, N, r):
    """Variance of the optimal-coefficient control-variate estimator with n paired and N total twin rollouts (N >= n)."""
    return var_r * ((1 - r * r) / n + r * r / N)


def best_ratio(r, w):
    """Optimal N/n at cost ratio w = c_twin / c_real: rho/sqrt(1-rho^2)/sqrt(w); 1 (twin unused beyond pairing) if that is < 1."""
    if r >= 1:
        return math.inf
    return max(1.0, r / math.sqrt((1 - r * r) * w))


def best_variance(var_r, budget, r, w, c_real=1.0):
    """Minimal variance at total budget: var_r/B * (sqrt((1-rho^2) c_r) + rho sqrt(c_t))^2 when N/n* >= 1, else var_r c_r / B."""
    m = best_ratio(r, w)
    if m == 1.0:
        return var_r * c_real / budget
    return var_r * c_real / budget * (math.sqrt(1 - r * r) + r * math.sqrt(w)) ** 2


def speedup(r, w):
    """Variance ratio real-only / optimal control variate at equal budget."""
    m = best_ratio(r, w)
    if m == 1.0:
        return 1.0
    d = math.sqrt(1 - r * r) + r * math.sqrt(w)
    return math.inf if d == 0 else 1 / (d * d)


def twin_only_crossover(var_r, delta, var_t=0.0, N=math.inf):
    """Real sample size n^ below which the twin-only estimate (MSE delta^2 + var_t/N) beats n real rollouts (var_r/n)."""
    return var_r / (delta * delta + (0 if N == math.inf else var_t / N))


def rollout(alpha, T, c, w):
    x, tot = 0.0, 0.0
    for s in range(T):
        x = alpha * x + w[s]
        tot += x * x
    return c * tot


def _draw(rng, T, s2):
    sd = math.sqrt(s2)
    return [rng.gauss(0, sd) for _ in range(T)]


def _twin_noise(rng, w, lam, s2):
    sl, so = math.sqrt(lam), math.sqrt((1 - lam) * s2)
    return [sl * x + so * rng.gauss(0, 1) for x in w]


def cv_estimate(ys, xs, xs_extra, beta=None):
    """Control-variate estimate from n paired (real y, twin x) and M extra twin rollouts; N = n + M. beta = sample cov/var if None.
    mu = mean(y - g x) + g mean(x_extra) with g = beta M/N. Returns (mu, se-estimate, beta)."""
    n, M = len(ys), len(xs_extra)
    N = n + M
    yb, xb = sum(ys) / n, sum(xs) / n
    sxx = sum((x - xb) ** 2 for x in xs) / (n - 1)
    syy = sum((y - yb) ** 2 for y in ys) / (n - 1)
    sxy = sum((x - xb) * (y - yb) for x, y in zip(xs, ys)) / (n - 1)
    if beta is None:
        beta = sxy / sxx
    g = beta * M / N
    zs = [y - g * x for y, x in zip(ys, xs)]
    zb = sum(zs) / n
    sz = sum((z - zb) ** 2 for z in zs) / (n - 1)
    xe = sum(xs_extra) / M
    mu = zb + g * xe
    xeb_var = sum((x - xe) ** 2 for x in xs_extra) / (M - 1)
    se = math.sqrt(sz / n + g * g * xeb_var / M)
    return mu, se, beta


def real_estimate(ys):
    n = len(ys)
    m = sum(ys) / n
    return m, math.sqrt(sum((y - m) ** 2 for y in ys) / (n - 1) / n)


def coverage_trial(rng, alpha, alpha_t, T, c, s2, lam, n, N, beta=None):
    """One replicate: n paired real/twin rollouts + (N-n) extra twin rollouts. Returns (real est, real se, cv est, cv se, twin-only est, twin-only se)."""
    ys, xs = [], []
    for _ in range(n):
        w = _draw(rng, T, s2)
        ys.append(rollout(alpha, T, c, w))
        xs.append(rollout(alpha_t, T, c, _twin_noise(rng, w, lam, s2)))
    ex = [rollout(alpha_t, T, c, _draw(rng, T, s2)) for _ in range(N - n)]
    mu, se, _ = cv_estimate(ys, xs, ex, beta)
    r, rse = real_estimate(ys)
    allx = xs + ex
    tb = sum(allx) / N
    tse = math.sqrt(sum((x - tb) ** 2 for x in allx) / (N - 1) / N)
    return r, rse, mu, se, tb, tse
