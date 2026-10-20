"""One UAV leg of length D flown at constant airspeed v against a headwind w that is constant during the leg but uniform across
flights, w ~ U[mu-a, mu+a]. Units: speed in units of V0 (the zero-wind minimum-energy-per-distance airspeed), so the dimensionless
power is P(v) = (v^3 + 1/v)/2 (parasitic + induced; P(1) = 1) and the energy of a leg is E = D P(v)/(v - w) (ground speed v - w).
A constant-wind twin has a = 0. Everything real is exact for the uniform law:
    expected energy per distance  J(v) = P(v) h(v),  h(v) = (1/2a) ln((v-mu+a)/(v-mu-a))   (v > mu+a, else infinite),
    Jensen factor  J(v)/(P(v)/(v-mu)) = artanh(x)/x with x = a/(v-mu),
    depletion probability of battery B = D P(v)(1+m)/(v-mu):  1/2 - (v-mu) m / (2 a (1+m)) clipped to [0,1]."""
import math, random, statistics

__all__ = ["P", "dP", "Params", "energy_per_dist", "twin_energy", "jensen_factor", "v_twin", "v_opt", "regret",
           "depletion_prob", "margin_for", "fit_uniform", "simulate_energy", "stall_prob"]


def P(v):
    return (v ** 3 + 1.0 / v) / 2


def dP(v):
    return (3 * v ** 2 - 1.0 / v ** 2) / 2


class Params:
    """Wind mean mu and half-width a (both in units of V0)."""
    def __init__(self, mu, a):
        self.mu, self.a = mu, a

    def replace(self, **kw):
        d = dict(mu=self.mu, a=self.a)
        d.update(kw)
        return Params(**d)


def _h(p, v):
    g = v - p.mu
    if p.a == 0:
        return 1.0 / g if g > 0 else math.inf
    if g <= p.a:
        return math.inf
    return math.log((g + p.a) / (g - p.a)) / (2 * p.a)


def energy_per_dist(p, v):
    """E[energy per unit distance] at airspeed v under wind law p (infinite if the wind can stall the aircraft)."""
    return P(v) * _h(p, v)


def twin_energy(p, v):
    return P(v) / (v - p.mu) if v > p.mu else math.inf


def jensen_factor(p, v):
    x = p.a / (v - p.mu)
    return 1.0 if x == 0 else math.atanh(x) / x


def _bisect(f, lo, hi, n=200):
    flo = f(lo)
    for _ in range(n):
        mid = (lo + hi) / 2
        if (f(mid) > 0) == (flo > 0): lo = mid
        else: hi = mid
    return (lo + hi) / 2


def v_twin(mu):
    """Minimiser of P(v)/(v-mu): the root above mu of 2 v^5 - 3 mu v^4 - 2 v + mu = 0 (from P'(v)(v-mu) = P(v))."""
    return _bisect(lambda v: 2 * v ** 5 - 3 * mu * v ** 4 - 2 * v + mu, max(mu, 0.0) + 1e-9, 6.0) if mu > 0 else 1.0 if mu == 0 else \
        _bisect(lambda v: 2 * v ** 5 - 3 * mu * v ** 4 - 2 * v + mu, 0.05, 6.0)


def v_opt(p):
    """Minimiser of J(v) on (mu+a, 6): golden section (J is unimodal there). Exactly v_twin when a = 0."""
    lo, hi = p.mu + p.a + 1e-9, 6.0
    g = (math.sqrt(5) - 1) / 2
    a, b = lo, hi
    for _ in range(200):
        x1, x2 = b - g * (b - a), a + g * (b - a)
        if energy_per_dist(p, x1) < energy_per_dist(p, x2): b = x2
        else: a = x1
    return (a + b) / 2


def regret(real, v):
    """Excess expected energy per distance of flying v instead of the real optimum (may be infinite)."""
    return energy_per_dist(real, v) - energy_per_dist(real, v_opt(real))


def stall_prob(real, v):
    """Probability that the wind meets or exceeds the airspeed (no progress, energy infinite)."""
    return min(1.0, max(0.0, (real.mu + real.a - v) / (2 * real.a)))


def depletion_prob(real, v, m, plan_mu=None):
    """P(leg energy > B) for B = twin energy at v (twin mean wind plan_mu, default real mu) times (1+m)."""
    pm = real.mu if plan_mu is None else plan_mu
    B = twin_energy(Params(pm, 0.0), v) * (1 + m)          # per unit distance
    # energy per distance P/(v-w) > B  <=>  w > v - P/B
    thr = v - P(v) / B
    return min(1.0, max(0.0, (real.mu + real.a - thr) / (2 * real.a)))


def margin_for(real, v, eps):
    """Smallest relative margin m over the twin's nominal energy with real depletion probability <= eps (None if no finite margin)."""
    g = v - real.mu
    q = real.a * (1 - 2 * eps) / g
    return q / (1 - q) if 0 <= q < 1 else (0.0 if q < 0 else None)


def fit_uniform(real, n, rng):
    """Moment fit of (mu, a) from n logged real winds: mean and sqrt(3) * sd."""
    ws = [rng.uniform(real.mu - real.a, real.mu + real.a) for _ in range(n)]
    m = statistics.fmean(ws)
    s = math.sqrt(sum((w - m) ** 2 for w in ws) / n)
    return Params(m, math.sqrt(3) * s)


def simulate_energy(real, v, trials, rng):
    """Monte Carlo of E[energy per distance] and stall rate at airspeed v (stalled legs are counted, energy set to inf)."""
    tot, stalls = 0.0, 0
    for _ in range(trials):
        w = rng.uniform(real.mu - real.a, real.mu + real.a)
        if v - w <= 0: stalls += 1
        else: tot += P(v) / (v - w)
    return (tot / trials if stalls == 0 else math.inf), stalls / trials
