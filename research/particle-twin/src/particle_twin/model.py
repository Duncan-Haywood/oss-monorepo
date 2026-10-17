"""Bootstrap particle filter weights: Gaussian-sensor twin vs a real sensor with outliers.

State x ~ N(0, P) per dimension (the prior particles are drawn from it). Measurement y = x + v. The filter weights each
particle by the Gaussian likelihood the twin believes, w(x) = exp(-(y-x)^2 / (2 R)). Real noise is a Gaussian scale mixture
with components (weight w_c, variance R_c); the twin is the single component R_c = R.

With N particles the effective sample size is ESS = (sum w)^2 / sum w^2. For large N it converges to N * rho(y) with

    rho(y) = E[w]^2 / E[w^2] = c0 * exp(-a y^2),   c0 = sqrt(R (2P+R)) / (P+R),   a = P / ((P+R)(2P+R)),

exact Gaussian integrals. In d independent dimensions rho_d = prod_j rho(y_j). Over y ~ N(0, S), S = P + R_c, E exp(-a y^2) =
(1 + 2 a S)^(-1/2), so the expected ESS fraction is closed form too.
"""
import math
import random


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def mixture(eps, kappa, R=1.0):
    """Inlier N(0, R) w.p. 1-eps, outlier N(0, kappa^2 R) w.p. eps."""
    return [(1.0 - eps, R), (eps, kappa * kappa * R)]


def c0(P, R):
    return math.sqrt(R * (2.0 * P + R)) / (P + R)


def a_coef(P, R):
    return P / ((P + R) * (2.0 * P + R))


def rho(y, P, R):
    """Large-N ESS fraction for one dimension and measurement y."""
    return c0(P, R) * math.exp(-a_coef(P, R) * y * y)


def mean_ess_fraction(P, R, comps, d=1):
    """Exact large-N E[ESS/N] over y ~ mixture, d iid dimensions: sum_c w_c [c0 (1 + 2 a S_c)^(-1/2)]^d."""
    a, c = a_coef(P, R), c0(P, R)
    return sum(w * (c * (1.0 + 2.0 * a * (P + Rc)) ** -0.5) ** d for w, Rc in comps)


def prob_ess_below(theta, P, R, comps):
    """Exact P(rho(y) < theta), d = 1: |y| > y_theta, y_theta^2 = ln(c0/theta)/a."""
    c = c0(P, R)
    if theta >= c:
        return 1.0
    yt = math.sqrt(math.log(c / theta) / a_coef(P, R))
    return sum(w * 2.0 * (1.0 - Phi(yt / math.sqrt(P + Rc))) for w, Rc in comps)


def abs_quantile(delta, P, comps):
    """t with P(|y| > t) = delta for y ~ mixture of N(0, P + R_c)."""
    lo, hi = 0.0, 1e4
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        tail = sum(w * 2.0 * (1.0 - Phi(mid / math.sqrt(P + Rc))) for w, Rc in comps)
        if tail > delta:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def particles_needed(n_min, delta, P, R, comps, d=1):
    """Large-N approximation to the N with ESS >= n_min with probability >= 1 - delta (d = 1): n_min / rho(t_delta)."""
    assert d == 1
    t = abs_quantile(delta, P, comps)
    return n_min / rho(t, P, R)


def particles_for_mean(n_min, P, R, comps, d=1):
    """N such that the expected ESS (large-N) is n_min."""
    return n_min / mean_ess_fraction(P, R, comps, d)


def sample_y(rng, P, comps):
    u, acc = rng.random(), 0.0
    for w, Rc in comps:
        acc += w
        if u <= acc:
            break
    return math.sqrt(P + Rc) * rng.gauss(0.0, 1.0)


def _ess_from_logw(lws):
    """ESS and normalised weights from log-weights, shifted by the max so far-tail measurements do not underflow."""
    m = max(lws)
    ws = [math.exp(l - m) for l in lws]
    s1 = sum(ws)
    return s1 * s1 / sum(w * w for w in ws), ws, s1


def pf_step(rng, N, P, R, y):
    """One bootstrap-filter weighting step for scalar y: returns (ESS, posterior-mean estimate)."""
    sp = math.sqrt(P)
    xs = [sp * rng.gauss(0.0, 1.0) for _ in range(N)]
    ess, ws, s1 = _ess_from_logw([-0.5 * (y - x) ** 2 / R for x in xs])
    return ess, sum(w * x for w, x in zip(ws, xs)) / s1


def sample_ess(rng, N, P, R, comps, trials, d=1):
    """Mean ESS/N and list of ESS values, y_j drawn from the mixture, d dimensions, N particles."""
    sp = math.sqrt(P)
    out = []
    for _ in range(trials):
        ys = [sample_y(rng, P, comps) for _ in range(d)]
        lws = []
        for _ in range(N):
            lws.append(sum(-0.5 * (y - sp * rng.gauss(0.0, 1.0)) ** 2 / R for y in ys))
        out.append(_ess_from_logw(lws)[0])
    return sum(out) / (len(out) * N), out


def estimator_msd(rng, N, P, R, comps, trials):
    """Mean square deviation of the particle posterior mean from the exact Kalman update K y (twin R used for both)."""
    K = P / (P + R)
    tot = 0.0
    for _ in range(trials):
        y = sample_y(rng, P, comps)
        m = pf_step(rng, N, P, R, y)[1]
        tot += (m - K * y) ** 2
    return tot / trials
