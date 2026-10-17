"""Shrinking a real-plant parameter estimate toward a digital twin's prediction (whitened units, noise variance s^2 = 1 unless stated).
Real data give X = theta_hat ~ N(theta, s^2 I_d); the twin predicts theta_T; delta = theta - theta_T is the unknown twin discrepancy and
lam = |delta|^2/s^2 its size in noise units.  Estimators of theta (risk = E|est - theta|^2 / s^2):
  real-only   X                         risk d
  twin-only   theta_T                   risk lam
  oracle blend  theta_T + w*(X-theta_T), w* = lam/(lam+d)   risk d lam/(lam+d)  (needs the unknown lam)
  James-Stein theta_T + (1-(d-2)s^2/|X-theta_T|^2)(X-theta_T)   risk d - (d-2)^2 E[1/chi2_d(lam)],  E[1/chi2_d(lam)] = E[1/(d-2+2K)], K~Poisson(lam/2)."""
import math, random

__all__ = ["js_risk", "js_risk_at_zero", "oracle_blend_risk", "oracle_weight", "twin_only_risk", "crossover_lam", "bayes_js_ratio",
           "n_equivalent", "hadamard", "js_estimate", "js_plus_estimate", "js_unknown_var", "js_blocks", "sample_chi2", "sample_x", "mc_risk"]


def _inv_chi2_mean(d, lam):
    """E[1/Q], Q ~ noncentral chi-square(d, lam), d >= 3: sum over K ~ Poisson(lam/2) of 1/(d-2+2K)."""
    if lam == 0:
        return 1.0 / (d - 2)
    mu = lam / 2.0
    kmax = int(mu + 12 * math.sqrt(mu) + 60)
    tot = 0.0
    for k in range(kmax + 1):
        logp = -mu + k * math.log(mu) - math.lgamma(k + 1)
        tot += math.exp(logp) / (d - 2 + 2 * k)
    return tot


def js_risk(d, lam):
    """Exact risk of the (negative-part) James-Stein estimator toward the twin, in units of s^2.  d >= 3."""
    return d - (d - 2) ** 2 * _inv_chi2_mean(d, lam)


def js_risk_at_zero(d):
    """A perfect twin (lam = 0): risk 2, whatever the dimension; the saving over real-only is 1 - 2/d."""
    return 2.0


def oracle_blend_risk(d, lam):
    return d * lam / (lam + d)


def oracle_weight(d, lam):
    return lam / (lam + d)


def twin_only_risk(lam):
    return lam


def crossover_lam(d):
    """Discrepancy at which twin-only ties real-only (lam = d)."""
    return float(d)


def bayes_js_ratio(tau2_over_s2):
    """d -> infinity, delta_i iid N(0, tau^2): JS risk / real-only risk -> tau^2/(tau^2+s^2)."""
    return tau2_over_s2 / (1 + tau2_over_s2)


def n_equivalent(n, sigma2, tau2):
    """Real samples a large-d twin with per-parameter discrepancy variance tau^2 is worth: n_eq = n + sigma^2/tau^2."""
    return n + sigma2 / tau2


def hadamard(k):
    """Sylvester Hadamard matrix of order 2^k (rows are +-1; H^T H = m I)."""
    H = [[1]]
    for _ in range(k):
        H = [row + row for row in H] + [row + [-x for x in row] for row in H]
    return H


def js_estimate(x, center, s2):
    d = len(x)
    diff = [a - b for a, b in zip(x, center)]
    q = sum(v * v for v in diff)
    f = 1.0 - (d - 2) * s2 / q
    return [c + f * v for c, v in zip(center, diff)]


def js_plus_estimate(x, center, s2):
    d = len(x)
    diff = [a - b for a, b in zip(x, center)]
    q = sum(v * v for v in diff)
    f = max(0.0, 1.0 - (d - 2) * s2 / q)
    return [c + f * v for c, v in zip(center, diff)]


def js_blocks(x, center, s2, g):
    """Positive-part JS applied separately to consecutive blocks of g parameters (last block merged if it would be smaller than 3)."""
    d = len(x)
    cuts = list(range(0, d, g))
    if len(cuts) > 1 and d - cuts[-1] < 3:
        cuts.pop()
    cuts.append(d)
    out = []
    for a, b in zip(cuts[:-1], cuts[1:]):
        out += js_plus_estimate(x[a:b], center[a:b], s2)
    return out


def js_unknown_var(x, center, s2_hat, nu, stein_factor=True):
    """JS with an estimated noise variance s2_hat (nu df); factor c = (d-2) nu/(nu+2) (True) or the plug-in d-2 (False); positive part."""
    d = len(x)
    c = (d - 2) * (nu / (nu + 2.0) if stein_factor else 1.0)
    diff = [a - b for a, b in zip(x, center)]
    q = sum(v * v for v in diff)
    f = max(0.0, 1.0 - c * s2_hat / q)
    return [cc + f * v for cc, v in zip(center, diff)]


def sample_chi2(nu, rng):
    return sum(rng.gauss(0, 1) ** 2 for _ in range(nu))


def sample_x(delta, s, rng):
    """theta_hat given theta_T = 0: X_i ~ N(delta_i, s^2)."""
    return [d + s * rng.gauss(0, 1) for d in delta]


def mc_risk(est, delta, s, reps, seed):
    """Monte-Carlo total risk / s^2 and per-coordinate risk / s^2 of est(x) (twin centre 0), with common random numbers by seed."""
    rng = random.Random(seed)
    d = len(delta)
    tot, per = 0.0, [0.0] * d
    for _ in range(reps):
        x = sample_x(delta, s, rng)
        e = est(x)
        for i in range(d):
            v = (e[i] - delta[i]) ** 2
            per[i] += v
            tot += v
    return tot / reps / s ** 2, [p / reps / s ** 2 for p in per]
