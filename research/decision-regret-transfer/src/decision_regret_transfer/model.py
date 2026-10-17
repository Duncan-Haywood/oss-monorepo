"""From scoring-rule loss to decision regret (stdlib only).

A verifier reports a fault probability q for a claimed training result whose true fault probability (given the evidence) is eta.
A protocol acts on q with three actions and costs
  accept: A*eta      (pay for a fault we missed)
  reject: R*(1-eta)  (slash an honest worker)
  audit:  c          (re-execute)
The Bayes action is optimal for eta in a region [lo, hi]. If the verifier is scored with a strictly proper rule with Bregman
divergence D(eta, q) (Brier: (eta-q)^2, log: KL), its excess score is D(eta, q). The *calibration function*
    delta(eps) = min { D(eta, q) : decision regret of acting on q at eta >= eps }
is the exact worst-case decision regret for a given excess score; acting on q is optimal only when q is in the region, so the
minimum over q is D(eta, clip(eta, region)) and delta is computed by bisection on the (piecewise-linear, convex) regret.
Averages transfer through the lower convex envelope psi of delta (Jensen): E[regret] <= psi^{-1}(E[D]).
"""
import math

EPS = 1e-12


def brier_D(eta, q):
    return (eta - q) ** 2


def log_D(eta, q):
    """Bernoulli KL(eta || q), the excess log score."""
    q = min(max(q, 1e-12), 1 - 1e-12)
    t = 0.0
    if eta > 0:
        t += eta * math.log(eta / q)
    if eta < 1:
        t += (1 - eta) * math.log((1 - eta) / (1 - q))
    return t


RULES = {"brier": brier_D, "log": log_D}


class Costs:
    """Accept/audit/reject costs. c=None (or c too high to ever be optimal) gives the binary accept/reject problem."""

    def __init__(self, A, R, c=None):
        self.A, self.R, self.c = float(A), float(R), c
        cross = self.A * self.R / (self.A + self.R)
        if c is None or c >= cross:
            self.c = None
            tau = self.R / (self.A + self.R)
            self.regions = {"accept": (0.0, tau), "reject": (tau, 1.0)}
        else:
            self.regions = {"accept": (0.0, c / self.A), "audit": (c / self.A, 1 - c / self.R), "reject": (1 - c / self.R, 1.0)}

    def cost(self, a, eta):
        return {"accept": self.A * eta, "reject": self.R * (1 - eta), "audit": self.c}[a]

    def best(self, eta):
        return min(self.cost(a, eta) for a in self.regions)

    def regret(self, eta, a):
        return self.cost(a, eta) - self.best(eta)

    def action(self, q):
        """Bayes-optimal action if q were the truth (ties go to the first region containing q)."""
        for a, (lo, hi) in self.regions.items():
            if lo <= q <= hi:
                return a

    def max_regret(self):
        return max(self.regret(e, a) for a in self.regions for e in (0.0, 1.0))


def _solve(costs, a, side, eps):
    """eta on `side` (+1 above / -1 below region a) where regret(eta,a) == eps, or None if unreachable."""
    lo_r, hi_r = costs.regions[a]
    edge = hi_r if side > 0 else lo_r
    end = 1.0 if side > 0 else 0.0
    if side * (end - edge) <= 0 or costs.regret(end, a) < eps:
        return None
    x, y = edge, end  # regret(x) < eps <= regret(y), monotone in between
    for _ in range(200):
        m = 0.5 * (x + y)
        if costs.regret(m, a) >= eps:
            y = m
        else:
            x = m
    return y


def delta(costs, rule, eps):
    """Exact calibration function: least excess score at which the decision regret can reach eps."""
    D = RULES[rule]
    best = math.inf
    for a, (lo, hi) in costs.regions.items():
        for side in (+1, -1):
            eta = _solve(costs, a, side, eps)
            if eta is not None:
                best = min(best, D(eta, hi if side > 0 else lo))
    return best


def delta_bruteforce(costs, rule, eps, n=1500):
    """Grid over (eta, q): minimum excess score among pairs whose decision regret is >= eps."""
    D = RULES[rule]
    best = math.inf
    for i in range(n + 1):
        eta = i / n
        for j in range(n + 1):
            q = j / n
            if costs.regret(eta, costs.action(q)) >= eps:
                best = min(best, D(eta, q))
    return best


def envelope(costs, rule, m=400):
    """Lower convex envelope psi of delta on [0, max regret], as a list of (eps, psi) vertices."""
    top = costs.max_regret()
    pts = [(top * k / m, 0.0 if k == 0 else delta(costs, rule, top * k / m)) for k in range(m + 1)]
    pts = [p for p in pts if p[1] < math.inf]
    hull = []
    for p in pts:
        while len(hull) >= 2 and (hull[-1][0] - hull[-2][0]) * (p[1] - hull[-2][1]) <= (hull[-1][1] - hull[-2][1]) * (p[0] - hull[-2][0]):
            hull.pop()
        hull.append(p)
    return hull


def regret_bound(hull, s):
    """Largest mean decision regret consistent with mean excess score s: psi^{-1}(s), capped at the maximum regret."""
    for (x0, y0), (x1, y1) in zip(hull, hull[1:]):
        if s <= y1:
            return x0 + (x1 - x0) * (s - y0) / (y1 - y0) if y1 > y0 else x1
    return hull[-1][0]


def hinge_regret(tau, eta, f):
    """Cost-weighted hinge, l(f,fault)=(1-tau)max(0,1-f), l(f,ok)=tau max(0,1+f), f in [-1,1]: excess risk at (eta, f)."""
    risk = lambda g: eta * (1 - tau) * (1 - g) + (1 - eta) * tau * (1 + g)
    return risk(f) - min(risk(1.0), risk(-1.0))


def expit(x):
    return 1 / (1 + math.exp(-x)) if x >= 0 else math.exp(x) / (1 + math.exp(x))


def logit(p):
    return math.log(p / (1 - p))


def simulate(costs, rule, a, b, slope, shift, sigma, n=100000, seed=0):
    """eta ~ Beta(a,b); verifier reports q = expit(slope*logit(eta)+shift+sigma*z). Returns (mean excess score, mean decision regret)."""
    import random
    rng = random.Random(seed)
    D = RULES[rule]
    S = Rg = 0.0
    for _ in range(n):
        eta = min(max(rng.betavariate(a, b), 1e-9), 1 - 1e-9)
        q = expit(slope * logit(eta) + shift + sigma * rng.gauss(0, 1))
        q = min(max(q, 1e-9), 1 - 1e-9)
        S += D(eta, q)
        Rg += costs.regret(eta, costs.action(q))
    return S / n, Rg / n
