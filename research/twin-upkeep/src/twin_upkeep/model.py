"""Twin upkeep in the scalar LQ setting. Plant x' = a x + b_t u + w, w ~ N(0, s2); the input gain drifts as a stationary AR(1),
b_t - mu = rho (b_{t-1} - mu) + eta, eta ~ N(0, qd). The twin is a Kalman filter for b_t, fed the regressor u_t = -k x_t + nu xi_t
(nu is the excitation, or dither, budget). The controller plays the certainty-equivalent gain k*(predicted b). Mean-field: the
information energy per step is v = E u^2, replacing the random regressor u_t^2 in the Riccati recursion."""
import math, random

__all__ = ["cost", "optimal_gain", "gain_slope", "cost_curvature", "pred_var", "post_var", "energy", "dither_cost", "regret_rate",
           "excess_rate", "best_dither", "dither_threshold", "stale_var", "frozen_rate", "instability_prob", "simulate"]


def cost(a, b, k, q=1.0, r=0.1, s2=1.0):
    c = a - b * k
    return math.inf if abs(c) >= 1 else s2 * (q + r * k * k) / (1 - c * c)


def optimal_gain(a, b, q=1.0, r=0.1):
    B = r * (1 - a * a) - q * b * b
    p = (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)
    return a * b * p / (r + b * b * p)


def gain_slope(a, b, q=1.0, r=0.1, h=1e-5):
    """dk*/db by central difference."""
    return (optimal_gain(a, b + h, q, r) - optimal_gain(a, b - h, q, r)) / (2 * h)


def cost_curvature(a, b, q=1.0, r=0.1, s2=1.0, h=1e-4):
    """J_kk at the optimal gain for plant b, by central difference."""
    k = optimal_gain(a, b, q, r)
    return (cost(a, b, k + h, q, r, s2) - 2 * cost(a, b, k, q, r, s2) + cost(a, b, k - h, q, r, s2)) / (h * h)


def pred_var(qd, rho, s2, v):
    """Steady-state predictive variance m of b_t before it is observed: the positive root of  v/s2 m^2 + (1-rho^2 - qd v/s2) m - qd = 0.
    For rho = 1 (random walk) this is qd/2 + sqrt(qd^2/4 + qd s2 / v)."""
    s = v / s2
    B = 1 - rho * rho - qd * s
    return (-B + math.sqrt(B * B + 4 * s * qd)) / (2 * s)


def post_var(qd, rho, s2, v):
    """Steady-state variance after the observation, P = m / (1 + m v / s2)."""
    m = pred_var(qd, rho, s2, v)
    return m / (1 + m * v / s2)


def energy(a, b, k, nu, s2=1.0):
    """Steady state Var(x) and information energy v = E u^2 for u = -k x + nu xi on a plant with gain b."""
    c = a - b * k
    V = (s2 + b * b * nu * nu) / (1 - c * c)
    return V, k * k * V + nu * nu


def dither_cost(a, b, k, nu, q=1.0, r=0.1, s2=1.0):
    """Extra stage cost of the excitation: (q + r k^2) b^2 nu^2 / (1 - c^2) + r nu^2 (exact, steady state)."""
    c = a - b * k
    return (q + r * k * k) * b * b * nu * nu / (1 - c * c) + r * nu * nu


def regret_rate(a, b, m, q=1.0, r=0.1, s2=1.0):
    """Second-order excess cost of a certainty-equivalent gain whose plant estimate has predictive variance m: J_kk (k*')^2 m / 2."""
    return 0.5 * cost_curvature(a, b, q, r, s2) * gain_slope(a, b, q, r) ** 2 * m


def excess_rate(a, b, qd, rho, nu, q=1.0, r=0.1, s2=1.0):
    """Excess stage cost over a clairvoyant controller: tracking regret at m(nu) plus the excitation cost."""
    k = optimal_gain(a, b, q, r)
    _, v = energy(a, b, k, nu, s2)
    return regret_rate(a, b, pred_var(qd, rho, s2, v), q, r, s2) + dither_cost(a, b, k, nu, q, r, s2)


def best_dither(a, b, qd, rho, q=1.0, r=0.1, s2=1.0, hi=3.0):
    """Excitation nu* minimising excess_rate, found by grid then golden search on nu^2; returns (nu*, excess at nu*, excess at 0)."""
    f = lambda t: excess_rate(a, b, qd, rho, math.sqrt(t), q, r, s2)
    grid = [hi * hi * i / 400 for i in range(401)]
    j = min(range(len(grid)), key=lambda i: f(grid[i]))
    lo_, hi_ = grid[max(j - 1, 0)], grid[min(j + 1, 400)]
    g = (math.sqrt(5) - 1) / 2
    c, d = hi_ - g * (hi_ - lo_), lo_ + g * (hi_ - lo_)
    fc, fd = f(c), f(d)
    for _ in range(100):
        if fc < fd:
            hi_, d, fd = d, c, fc
            c = hi_ - g * (hi_ - lo_); fc = f(c)
        else:
            lo_, c, fc = c, d, fd
            d = lo_ + g * (hi_ - lo_); fd = f(d)
    t = (lo_ + hi_) / 2
    if t < 1e-6 or f(0.0) <= f(t):
        t = 0.0
    return math.sqrt(t), f(t), f(0.0)


def dither_threshold(a, b, rho, q=1.0, r=0.1, s2=1.0, lo=1e-9, hi=1.0):
    """Smallest drift variance qd at which any excitation pays (d excess / d nu^2 < 0 at nu = 0), by bisection."""
    def slope(qd):
        e = 1e-6
        return excess_rate(a, b, qd, rho, math.sqrt(e), q, r, s2) - excess_rate(a, b, qd, rho, 0.0, q, r, s2)
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if slope(mid) < 0:
            hi = mid
        else:
            lo = mid
    return hi


def stale_var(t, p0, qd, rho):
    """Error variance of a twin frozen t steps ago with error variance p0: rho^{2t} p0 + qd (1 - rho^{2t}) / (1 - rho^2)."""
    z = rho ** (2 * t)
    return z * p0 + (qd / (1 - rho * rho) * (1 - z) if rho < 1 else qd * t)


def frozen_rate(a, b, t, p0, qd, rho, q=1.0, r=0.1, s2=1.0):
    """Excess stage cost t steps after the twin was last synchronised and then frozen."""
    return regret_rate(a, b, stale_var(t, p0, qd, rho), q, r, s2)


def instability_prob(a, b, sd, q=1.0, r=0.1):
    """Probability that a Gaussian plant-estimate error of sd `sd` destabilises the certainty-equivalent gain: the fixed gain k*(b)
    is stable on plant b+e iff e in ((a-1)/k - b, (a+1)/k - b)."""
    k = optimal_gain(a, b, q, r)
    Phi = lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2)))
    lo, hi = (a - 1) / k - b, (a + 1) / k - b
    return 1 - (Phi(hi / sd) - Phi(lo / sd))


def simulate(a, mu, qd, rho, nu, T, seed=0, q=1.0, r=0.1, s2=1.0, oracle=False):
    """Closed loop with a Kalman twin (oracle=True: the controller sees the true b_t). Returns (mean stage cost, mean squared
    prediction error of b, fraction of steps where the played gain destabilises the current plant)."""
    rng = random.Random(seed)
    sd_b = math.sqrt(qd / (1 - rho * rho)) if rho < 1 else 0.0
    b = mu + sd_b * rng.gauss(0, 1)
    bh, P = mu, sd_b ** 2
    x, tot, err2, unst = 0.0, 0.0, 0.0, 0
    burn = T // 10
    for t in range(T + burn):
        bp = mu + rho * (bh - mu)
        m = rho * rho * P + qd
        b = mu + rho * (b - mu) + math.sqrt(qd) * rng.gauss(0, 1)
        w, xi = rng.gauss(0, math.sqrt(s2)), rng.gauss(0, 1)
        use = b if oracle else max(bp, 0.2)
        k = optimal_gain(a, use, q, r)
        u = -k * x + nu * xi
        if t >= burn:
            tot += q * x * x + r * u * u
            err2 += (bp - b) ** 2
            unst += abs(a - b * k) >= 1
        xn = a * x + b * u + w
        if not oracle:
            y = xn - a * x
            K = m * u / (s2 + m * u * u)
            bh = bp + K * (y - bp * u)
            P = (1 - K * u) * m
        x = xn
        if abs(x) > 1e6:
            return math.inf, err2 / max(t - burn, 1), unst / max(t - burn, 1)
    return tot / T, err2 / T, unst / T


__all__ += ["pred_var_slope", "info_price", "info_value", "pred_cov2", "regret_rate2", "excess_rate2", "best_dither2", "simulate2"]


def pred_var_slope(qd, rho, s2, v):
    """dm/dv at the steady state, by implicit differentiation of  F(m,v) = (v/s2) m^2 + (1-rho^2 - qd v/s2) m - qd = 0."""
    m = pred_var(qd, rho, s2, v)
    s = v / s2
    return -((m * m - qd * m) / s2) / (2 * s * m + 1 - rho * rho - qd * s)


def info_price(a, b, q=1.0, r=0.1, s2=1.0):
    """Shadow price gamma = d(excitation cost)/d(information energy) at nu = 0: cost per unit of E u^2 that dither buys."""
    k = optimal_gain(a, b, q, r)
    c = a - b * k
    return ((q + r * k * k) * b * b / (1 - c * c) + r) / (1 + k * k * b * b / (1 - c * c))


def info_value(a, b, qd, rho, nu=0.0, q=1.0, r=0.1, s2=1.0):
    """Marginal value of information energy, -d(tracking regret)/dv, at excitation nu. Dither at nu = 0 pays iff info_value > info_price."""
    k = optimal_gain(a, b, q, r)
    _, v = energy(a, b, k, nu, s2)
    return -0.5 * cost_curvature(a, b, q, r, s2) * gain_slope(a, b, q, r) ** 2 * pred_var_slope(qd, rho, s2, v)


def _mat_inv(A):
    d = A[0][0] * A[1][1] - A[0][1] * A[1][0]
    return [[A[1][1] / d, -A[0][1] / d], [-A[1][0] / d, A[0][0] / d]]


def _mm(A, B):
    return [[sum(A[i][l] * B[l][j] for l in range(2)) for j in range(2)] for i in range(2)]


def _add(A, B):
    return [[A[i][j] + B[i][j] for j in range(2)] for i in range(2)]


def _tr(A):
    return [[A[0][0], A[1][0]], [A[0][1], A[1][1]]]


def pred_cov2(qa, qb, s2, V, k, nu, rho=1.0, iters=200):
    """Steady predictive covariance P of (a, b) for a two-parameter twin whose parameters follow AR(1) drifts (common rho, innovation
    variances qa, qb). Information per step M = V [1,-k][1,-k]^T/s2 + nu^2 e2 e2^T/s2 (the closed-loop regressor (x,u)), and
    P = Q + rho^2 P (I + M P)^-1, solved by the structured doubling algorithm (quadratic convergence, so slow blind-direction
    dynamics cost nothing). Returns None when there is no steady state (nu = 0 with rho = 1: the blind direction random-walks away)."""
    if nu == 0.0 and rho >= 1.0:
        return None
    M = [[V / s2, -k * V / s2], [-k * V / s2, (k * k * V + nu * nu) / s2]]
    A, G, H = [[rho, 0.0], [0.0, rho]], M, [[qa, 0.0], [0.0, qb]]
    I2 = [[1.0, 0.0], [0.0, 1.0]]
    for _ in range(iters):
        W = _mat_inv(_add(I2, _mm(G, H)))
        AW = _mm(A, W)
        H2 = _add(H, _mm(_mm(_tr(A), _mm(H, W)), A))
        G2 = _add(G, _mm(_mm(AW, G), _tr(A)))
        A = _mm(AW, A)
        if max(abs(H2[i][j] - H[i][j]) for i in range(2) for j in range(2)) < 1e-15 * (1 + abs(H2[1][1])):
            H = H2
            break
        G, H = G2, H2
        if max(abs(H[i][j]) for i in range(2) for j in range(2)) > 1e12:
            return None
    return H


def _grad_gain(a, b, q, r, h=1e-5):
    return ((optimal_gain(a + h, b, q, r) - optimal_gain(a - h, b, q, r)) / (2 * h),
            (optimal_gain(a, b + h, q, r) - optimal_gain(a, b - h, q, r)) / (2 * h))


def regret_rate2(a, b, Pp, q=1.0, r=0.1, s2=1.0):
    """Second-order regret 1/2 J_kk g^T P_pred g of a certainty-equivalent gain from a two-parameter twin, g = grad k*(a,b)."""
    ga, gb = _grad_gain(a, b, q, r)
    quad = ga * ga * Pp[0][0] + 2 * ga * gb * Pp[0][1] + gb * gb * Pp[1][1]
    return 0.5 * cost_curvature(a, b, q, r, s2) * quad


def excess_rate2(a, b, qa, qb, nu, rho=1.0, q=1.0, r=0.1, s2=1.0):
    k = optimal_gain(a, b, q, r)
    V, _ = energy(a, b, k, nu, s2)
    Pp = pred_cov2(qa, qb, s2, V, k, nu, rho)
    if Pp is None:
        return math.inf
    return regret_rate2(a, b, Pp, q, r, s2) + dither_cost(a, b, k, nu, q, r, s2)


def best_dither2(a, b, qa, qb, rho=1.0, q=1.0, r=0.1, s2=1.0, lo=1e-4, hi=2.0, n=160):
    """Excitation nu* minimising excess_rate2: geometric grid on [lo, hi], then golden search in log nu. Returns
    (nu*, excess at nu*, excess at 0), with nu* = 0 if no excitation beats nu = 0."""
    f = lambda nu: excess_rate2(a, b, qa, qb, nu, rho, q, r, s2)
    grid = [lo * (hi / lo) ** (i / n) for i in range(n + 1)]
    j = min(range(n + 1), key=lambda i: f(grid[i]))
    l, h = math.log(grid[max(j - 1, 0)]), math.log(grid[min(j + 1, n)])
    g = (math.sqrt(5) - 1) / 2
    c, d = h - g * (h - l), l + g * (h - l)
    fc, fd = f(math.exp(c)), f(math.exp(d))
    for _ in range(80):
        if fc < fd:
            h, d, fd = d, c, fc
            c = h - g * (h - l); fc = f(math.exp(c))
        else:
            l, c, fc = c, d, fd
            d = l + g * (h - l); fd = f(math.exp(d))
    nu = math.exp((l + h) / 2)
    e0 = f(0.0)
    return (nu, f(nu), e0) if f(nu) < e0 else (0.0, e0, e0)


def simulate2(a0, b0, qa, qb, rho, nu, T, seed=0, q=1.0, r=0.1, s2=1.0, oracle=False):
    """Closed loop with a two-parameter Kalman twin of (a, b), both stationary AR(1) around (a0, b0). Returns
    (mean stage cost, mean squared error of the played gain vs k*(a_t,b_t))."""
    rng = random.Random(seed)
    sa, sb = (math.sqrt(qa / (1 - rho * rho)), math.sqrt(qb / (1 - rho * rho))) if rho < 1 else (0.0, 0.0)
    a, b = a0 + sa * rng.gauss(0, 1), b0 + sb * rng.gauss(0, 1)
    th, P = [a0, b0], [[sa * sa, 0.0], [0.0, sb * sb]]
    k0 = optimal_gain(a0, b0, q, r)
    V0, _ = energy(a0, b0, k0, nu, s2)
    Pp0 = pred_cov2(qa, qb, s2, V0, k0, nu, rho)
    if Pp0 is not None:  # start the twin at its steady-state posterior
        M = [[V0 / s2, -k0 * V0 / s2], [-k0 * V0 / s2, (k0 * k0 * V0 + nu * nu) / s2]]
        Ii = _mat_inv(Pp0)
        P = _mat_inv([[Ii[0][0] + M[0][0], Ii[0][1] + M[0][1]], [Ii[1][0] + M[1][0], Ii[1][1] + M[1][1]]])
    x, tot, kerr = 0.0, 0.0, 0.0
    burn = T // 10
    for t in range(T + burn):
        thp = [a0 + rho * (th[0] - a0), b0 + rho * (th[1] - b0)]
        Pp = [[rho * rho * P[0][0] + qa, rho * rho * P[0][1]], [rho * rho * P[1][0], rho * rho * P[1][1] + qb]]
        a = a0 + rho * (a - a0) + math.sqrt(qa) * rng.gauss(0, 1)
        b = b0 + rho * (b - b0) + math.sqrt(qb) * rng.gauss(0, 1)
        w, xi = rng.gauss(0, math.sqrt(s2)), rng.gauss(0, 1)
        ah, bh = (a, b) if oracle else (thp[0], max(thp[1], 0.3))
        k = optimal_gain(ah, bh, q, r)
        u = -k * x + nu * xi
        if t >= burn:
            tot += q * x * x + r * u * u
            kerr += (k - optimal_gain(a, b, q, r)) ** 2
        xn = a * x + b * u + w
        if not oracle:
            Pphi = (Pp[0][0] * x + Pp[0][1] * u, Pp[1][0] * x + Pp[1][1] * u)
            den = s2 + x * Pphi[0] + u * Pphi[1]
            innov = xn - (thp[0] * x + thp[1] * u)
            th = [thp[0] + Pphi[0] * innov / den, thp[1] + Pphi[1] * innov / den]
            P = [[Pp[i][j] - Pphi[i] * Pphi[j] / den for j in range(2)] for i in range(2)]
        x = xn
        if abs(x) > 1e6:
            return math.inf, math.inf
    return tot / T, kerr / T
