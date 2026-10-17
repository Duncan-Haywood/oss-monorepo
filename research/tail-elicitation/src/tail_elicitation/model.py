"""Joint elicitation of (VaR_tau, ES_tau) of a positive drift Y (upper tail).
ES_tau(F) = E[Y | Y >= VaR_tau] = min_v m(v),  m(v) = v + E[(Y-v)+]/(1-tau)   (Rockafellar-Uryasev).
Scale-invariant Fissler-Ziegel score, e>0:
  S(v,e,y) = ln e - 1 + (v + (y-v)+/(1-tau)) / e  + lam*(1{y<=v}-tau)*(v-y)
(lam>=0 adds the classical quantile-part of the FZ family; lam=0 is the 0-homogeneous member.)
"""
import math, random

class Dist:
    """finite distribution: sorted support ys with probabilities ps"""
    def __init__(self, ys, ps):
        z = sorted(zip(ys, ps)); self.ys = [a for a, _ in z]; self.ps = [b for _, b in z]
        assert abs(sum(self.ps) - 1) < 1e-9
    def cdf(self, t): return sum(p for y, p in zip(self.ys, self.ps) if y <= t)
    def mean(self): return sum(p * y for y, p in zip(self.ys, self.ps))
    def call(self, v): return sum(p * max(y - v, 0.0) for y, p in zip(self.ys, self.ps))   # E(Y-v)+
    def var(self, tau):
        c = 0.0
        for y, p in zip(self.ys, self.ps):
            c += p
            if c >= tau - 1e-12: return y
    def m(self, v, tau): return v + self.call(v) / (1 - tau)
    def es(self, tau): return self.m(self.var(tau), tau)
    def mix(self, other, w=0.5):
        d = {}
        for y, p in zip(self.ys, self.ps): d[y] = d.get(y, 0) + w * p
        for y, p in zip(other.ys, other.ps): d[y] = d.get(y, 0) + (1 - w) * p
        return Dist(list(d), list(d.values()))

def score(v, e, y, tau, lam=0.0):
    return math.log(e) - 1 + (v + max(y - v, 0.0) / (1 - tau)) / e + lam * ((1.0 if y <= v else 0.0) - tau) * (v - y)

def pinball(v, y, tau):
    return ((1.0 if y <= v else 0.0) - tau) * (v - y)

def expected_score(d, v, e, tau, lam=0.0):
    return sum(p * score(v, e, y, tau, lam) for y, p in zip(d.ys, d.ps))

def profile_e(d, v, tau):
    """for fixed v the score-minimising e is m(v); the profile score is ln m(v) (lam-independent)"""
    return d.m(v, tau)

def argmin_expected(d, tau, lam=0.0, grid=4001):
    """joint minimiser of the expected score, by dense grid over v with exact inner minimisation over e"""
    lo, hi = d.ys[0], d.ys[-1]
    best = (math.inf, None, None)
    cand = sorted({lo + (hi - lo) * i / (grid - 1) for i in range(grid)} | set(d.ys))
    for v in cand:
        if v <= 0: continue
        e = profile_e(d, v, tau)
        s = expected_score(d, v, e, tau, lam)
        if s < best[0] - 1e-15: best = (s, v, e)
    return best

def excess_e(r):
    """expected score excess of reporting e = r*ES at the true VaR: ln r + 1/r - 1 (Itakura-Saito), ~ (r-1)^2/2"""
    return math.log(r) + 1 / r - 1

def excess_v(d, v, tau):
    """excess of reporting (v, ES) vs truth (VaR, ES), lam=0: (1/(ES(1-tau))) * int_{VaR}^{v} (F(t)-tau) dt, exact for finite d"""
    q, E = d.var(tau), d.es(tau)
    pts = sorted(set([q, v] + [y for y in d.ys if min(q, v) < y < max(q, v)]))
    tot = 0.0
    for a, b in zip(pts, pts[1:]):
        tot += (d.cdf(a) - tau) * (b - a)          # F is right-continuous step, constant on [a,b)
    sign = 1.0 if v >= q else -1.0
    return sign * tot / (E * (1 - tau))

# ---------- sampling ----------
def lognormal(rng, s): return math.exp(rng.gauss(0, s))
def pareto(rng, a): return (1 - rng.random()) ** (-1.0 / a)

def true_pair_lognormal(s, tau):
    """closed form: VaR = exp(s z), ES = exp(s^2/2) Phi(s - z)/(1-tau)"""
    z = _ppf(tau); Phi = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
    return math.exp(s * z), math.exp(s * s / 2) * Phi(s - z) / (1 - tau)

def true_pair_pareto(a, tau):
    v = (1 - tau) ** (-1.0 / a)
    return v, v * a / (a - 1)

def _ppf(p):
    lo, hi = -10.0, 10.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if 0.5 * (1 + math.erf(mid / math.sqrt(2))) < p: lo = mid
        else: hi = mid
    return (lo + hi) / 2

def paired_detection(sampler, tau, v, e_true, r, n_sim, rng, lam=0.0):
    """paired score difference of a forecaster with ES misreported by factor r vs the truth, same v.
    returns (mean, sd, samples-needed for mean/se >= 2 : 4 sd^2/mean^2)"""
    ds = []
    for _ in range(n_sim):
        y = sampler(rng)
        ds.append(score(v, r * e_true, y, tau, lam) - score(v, e_true, y, tau, lam))
    mu = sum(ds) / n_sim; sd = math.sqrt(sum((x - mu) ** 2 for x in ds) / (n_sim - 1))
    return mu, sd, 4 * sd * sd / (mu * mu) if mu > 0 else math.inf
