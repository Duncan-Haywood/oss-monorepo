"""Selective reporting under proper scoring. Stdlib only.

State theta ~ Bern(pi). Verifier signal s | theta ~ N((2 theta - 1) mu, 1), so the posterior log-odds
are logit(pi) + 2 mu s. Reporting costs c and pays the score *gain over an anchor* alpha:
    gain(p) = E_p[S(p,y) - S(alpha,y)]  = (p - alpha)^2 (Brier)  or  KL(p || alpha) (log).
A truthful verifier reports iff gain(p(s)) >= c, i.e. iff s lies outside an interval (a, b): silence
(s in (a,b)) is itself evidence about theta.
"""
import math, random

__all__ = ["logit", "expit", "Phi", "region_brier", "region_log", "abstain_prob", "abstain_lr",
           "posterior_after_abstain", "mutual_info", "expected_payment", "reporter_base_rate",
           "simulate", "aggregate", "kl"]


def logit(p):
    return math.log(p / (1 - p))


def expit(x):
    return 1 / (1 + math.exp(-x)) if x >= 0 else math.exp(x) / (1 + math.exp(x))


def Phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def kl(p, q):
    t = 0.0
    if p > 0:
        t += p * math.log(p / q)
    if p < 1:
        t += (1 - p) * math.log((1 - p) / (1 - q))
    return t


def _s_of_p(p, pi, mu):
    return (logit(p) - logit(pi)) / (2 * mu)


def region_brier(pi, alpha, mu, c):
    """Abstention interval (a, b) in signal space for Brier gain (p-alpha)^2 >= c: closed form."""
    r = math.sqrt(c)
    hi = alpha + r
    lo = alpha - r
    b = _s_of_p(hi, pi, mu) if hi < 1 else math.inf
    a = _s_of_p(lo, pi, mu) if lo > 0 else -math.inf
    return a, b


def _kl_root(alpha, c, up):
    """Belief p on the given side of alpha with KL(p||alpha) = c, or None if unreachable."""
    end = 1.0 if up else 0.0
    if kl(end, alpha) < c:
        return None
    lo, hi = (alpha, end) if up else (end, alpha)
    for _ in range(200):
        m = (lo + hi) / 2
        f = kl(m, alpha) - c
        if up:
            lo, hi = (m, hi) if f < 0 else (lo, m)
        else:
            lo, hi = (lo, m) if f < 0 else (m, hi)
    return (lo + hi) / 2


def region_log(pi, alpha, mu, c):
    """Abstention interval for log-score gain KL(p||alpha) >= c (bisection on the boundary belief)."""
    if c <= 0:
        s0 = _s_of_p(alpha, pi, mu)
        return s0, s0
    ph = _kl_root(alpha, c, True)
    pl = _kl_root(alpha, c, False)
    return (_s_of_p(pl, pi, mu) if pl is not None else -math.inf,
            _s_of_p(ph, pi, mu) if ph is not None else math.inf)


def abstain_prob(theta, mu, reg):
    a, b = reg
    m = mu if theta == 1 else -mu
    hi = 1.0 if b == math.inf else Phi(b - m)
    lo = 0.0 if a == -math.inf else Phi(a - m)
    return hi - lo


def abstain_lr(mu, reg):
    """Likelihood ratio of one abstention: P(abstain|theta=1)/P(abstain|theta=0)."""
    d = abstain_prob(0, mu, reg)
    return 1.0 if d == 0 else abstain_prob(1, mu, reg) / d


def posterior_after_abstain(pi, mu, reg):
    n1 = pi * abstain_prob(1, mu, reg)
    n0 = (1 - pi) * abstain_prob(0, mu, reg)
    return n1 / (n1 + n0)


def _H(p):
    return 0.0 if p <= 0 or p >= 1 else -(p * math.log(p) + (1 - p) * math.log(1 - p))


def _dens(s, pi, mu):
    n = lambda x: math.exp(-x * x / 2) / math.sqrt(2 * math.pi)
    return pi * n(s - mu) + (1 - pi) * n(s + mu)


def _integrate(f, lo=-12.0, hi=12.0, n=24000):
    h = (hi - lo) / n
    return h * (sum(f(lo + (i + 0.5) * h) for i in range(n)))


def mutual_info(pi, mu, reg):
    """I(theta; report-or-silence) in nats, by quadrature. reg=(0,0)-width interval = full reporting."""
    a, b = reg
    hprior = _H(pi)
    def g(s):
        if a < s < b:
            return 0.0
        return _dens(s, pi, mu) * _H(expit(logit(pi) + 2 * mu * s))
    cond = _integrate(g)
    pa = pi * abstain_prob(1, mu, reg) + (1 - pi) * abstain_prob(0, mu, reg)
    cond += pa * _H(posterior_after_abstain(pi, mu, reg)) if pa > 0 else 0.0
    return hprior - cond


def expected_payment(pi, alpha, mu, reg, rule="brier"):
    """E[gain(p(s)) 1{report}] per verifier (payment above the anchor's score, unit scale)."""
    a, b = reg
    def g(s):
        if a < s < b:
            return 0.0
        p = expit(logit(pi) + 2 * mu * s)
        return _dens(s, pi, mu) * ((p - alpha) ** 2 if rule == "brier" else kl(p, alpha))
    return _integrate(g)


def reporter_base_rate(pi, mu, reg):
    """P(theta=1 | verifier reports): the naive 'pool the reported outcomes' base rate."""
    r1 = pi * (1 - abstain_prob(1, mu, reg))
    r0 = (1 - pi) * (1 - abstain_prob(0, mu, reg))
    return r1 / (r1 + r0)


def simulate(pi, mu, reg, n, trials, seed=0):
    """Yield (theta, reporter signals list, number of abstainers) for `trials` jobs with n verifiers."""
    rng = random.Random(seed)
    a, b = reg
    out = []
    for _ in range(trials):
        th = 1 if rng.random() < pi else 0
        m = mu if th else -mu
        rep, k = [], 0
        for _ in range(n):
            s = rng.gauss(m, 1)
            if a < s < b:
                k += 1
            else:
                rep.append(s)
        out.append((th, rep, k))
    return out


def aggregate(pi, mu, reg, rep, k, use_silence):
    """Posterior P(theta=1) from reporters' signals (equivalently truthful reports) and k silences."""
    z = logit(pi) + sum(2 * mu * s for s in rep)
    if use_silence and k:
        z += k * math.log(abstain_lr(mu, reg))
    return expit(z)
