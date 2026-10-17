"""Pooling n calibrated experts whose errors are correlated (shared training data).

Model. Binary label y in {-1,+1}, uniform. Expert i sees x_i = mu*y + e_i, e ~ N(0, sigma^2 R), R equicorrelated
with correlation rho. Each expert reports its own calibrated posterior logit l_i = 2*mu*x_i/sigma^2 (it ignores the
others). Given y=+1, l_i ~ N(s2/2, s2) with s2 = (2*mu/sigma)^2 -- the calibrated "variance = 2 x mean" signature.
The pool is p = sigmoid(a * mean_i l_i); a=1 is the geometric (log) pool, a=n the naive independence sum.
Bayes-optimal a* = n/(1+(n-1)rho) = n_eff (derivation in paper/whitepaper.md).
"""
from math import exp, log, sqrt, pi, log1p


def sigmoid(z):
    if z >= 0:
        return 1.0 / (1.0 + exp(-z))
    e = exp(z)
    return e / (1.0 + e)


def logloss(z):
    """log(1+exp(-z)): loss of predicting logit z when the label agrees with the sign convention y*z."""
    return -z + log1p(exp(z)) if z < 0 else log1p(exp(-z))


def n_eff(n, rho):
    return n / (1.0 + (n - 1) * rho)


def a_star(n, rho):
    return n_eff(n, rho)


def pooled_logit_stats(n, rho, s2):
    """Given y=+1, Zbar = mean_i l_i ~ N(m, v): m = s2/2, v = s2 (1+(n-1)rho)/n."""
    return s2 / 2.0, s2 * (1 + (n - 1) * rho) / n


def _gauss_expect(f, m, v, K=4001, width=9.0):
    """E f(Z), Z~N(m,v), trapezoid on +-width sd."""
    sd = sqrt(v)
    h = 2 * width * sd / (K - 1)
    tot = 0.0
    for k in range(K):
        z = m - width * sd + k * h
        tot += f(z) * exp(-0.5 * ((z - m) / sd) ** 2) / (sd * sqrt(2 * pi))
    return tot * h


def expected_logloss(a, n, rho, s2):
    """Exact expected log-loss of the exponent-a pool (label symmetry lets us condition on y=+1)."""
    m, v = pooled_logit_stats(n, rho, s2)
    return _gauss_expect(lambda z: logloss(a * z), m, v)


def best_exponent(n, rho, s2, lo=0.0, hi=None, iters=50):
    """Numerical argmin_a of expected_logloss (convex in a): ternary search, independent of the closed form."""
    hi = 2.0 * n if hi is None else hi
    for _ in range(iters):
        m1, m2 = lo + (hi - lo) / 3, hi - (hi - lo) / 3
        if expected_logloss(m1, n, rho, s2) < expected_logloss(m2, n, rho, s2):
            hi = m2
        else:
            lo = m1
    return (lo + hi) / 2


def bayes_logloss(n, rho, s2):
    """Loss of the Bayes pool a = n_eff."""
    return expected_logloss(a_star(n, rho), n, rho, s2)


def sample_logits(n, rho, s2, T, rng):
    """T rounds of (y, [l_1..l_n]) from the generative model; a shared factor gives correlation rho >= 0."""
    s = sqrt(s2)
    out = []
    for _ in range(T):
        y = 1 if rng.random() < 0.5 else -1
        w = rng.gauss(0, 1)
        out.append((y, [y * s2 / 2 + s * (sqrt(rho) * w + sqrt(1 - rho) * rng.gauss(0, 1)) for _ in range(n)]))
    return out


def empirical_pool_loss(data, rule):
    """Mean log-loss of a pooling rule mapping a list of logits to a probability of y=+1."""
    tot = 0.0
    for y, ls in data:
        p = min(max(rule(ls), 1e-12), 1 - 1e-12)
        tot += -log(p if y == 1 else 1 - p)
    return tot / len(data)


def estimate_rho(data):
    """Method of moments from labelled logits. With d_i = y*l_i - m_hat (m_hat = mean of y*l), the within-label
    residuals have Var s2 and pairwise Cov rho*s2, so rho_hat = mean pairwise product / mean square."""
    n = len(data[0][1])
    m_hat = sum(y * sum(ls) / n for y, ls in data) / len(data)
    sq = cr = 0.0
    for y, ls in data:
        d = [y * l - m_hat for l in ls]
        s = sum(d)
        q = sum(x * x for x in d)
        sq += q
        cr += (s * s - q) / 2.0
    T = len(data)
    return (cr / (T * n * (n - 1) / 2)) / (sq / (T * n))


def ogd_exponent(data, n, a0=1.0, eta=0.5, a_max=None):
    """Online gradient descent on the exponent a of sigmoid(a*mean l). Returns (a_path, per-round losses).
    Loss is convex in a; gradient is -y*Zbar*sigmoid(-y*a*Zbar)."""
    a_max = float(n) if a_max is None else a_max
    a, path, losses = a0, [], []
    for t, (y, ls) in enumerate(data, 1):
        z = sum(ls) / n
        losses.append(logloss(y * a * z))
        a = min(max(a - eta / sqrt(t) * (-y * z * sigmoid(-y * a * z)), 0.0), a_max)
        path.append(a)
    return path, losses
