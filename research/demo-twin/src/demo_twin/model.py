"""Cloning an expert from logs recorded in a digital twin, scalar plant with actuator saturation.

Plant x' = a x + b sat(u) + w, w ~ N(0, s2), sat clips to [-U, U]; cost q x^2 + r sat(u)^2 per step.
The expert commands u = -k0 x (k0 = unsaturated LQ gain). A clone is a linear command u = -kappa x, still clipped by the plant.
Stationary laws are computed on a grid (deterministic), and checked against Monte Carlo in the tests.
"""
import math, random

__all__ = ["sat", "lq_gain", "Grid", "stationary", "stationary_cost", "moments", "bc_gain", "bc_gain_gaussian",
           "gaussian_sat_prob", "gaussian_masses", "imitation_gap", "twin_bc_gain", "dagger_gain", "best_linear_gain", "simulate_cost"]


def sat(u, U):
    return max(-U, min(U, u))


def _riccati(a, b, q, r):
    B = r * (1 - a * a) - q * b * b
    return (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)


def lq_gain(a, b, q=1.0, r=0.1):
    p = _riccati(a, b, q, r)
    return a * b * p / (r + b * b * p)


def _cdf(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


class Grid:
    """Uniform state grid on [-L, L] with cell width h; the chain is discretised by exact Gaussian cell masses."""

    def __init__(self, L=12.0, h=0.2):
        self.h = h
        self.n = int(round(2 * L / h)) + 1
        self.x = [-L + i * h for i in range(self.n)]


def stationary(a, b, s2, U, kappa, grid=None, tol=1e-13, maxit=20000):
    """Stationary density (cell masses) of x' = a x + b sat(-kappa x) + w. Returns (grid, masses)."""
    g = grid or Grid()
    n, h, x = g.n, g.h, g.x
    sd = math.sqrt(s2)
    rows = []
    for xi in x:
        m = a * xi + b * sat(-kappa * xi, U)
        lo = max(0, int((m - 7 * sd - x[0]) / h) - 1)
        hi = min(n - 1, int((m + 7 * sd - x[0]) / h) + 2)
        r = []
        for j in range(lo, hi + 1):
            # mass of N(m, s2) in cell j; the two edge cells absorb the tails
            up = 1.0 if j == n - 1 else _cdf((x[j] + h / 2 - m) / sd)
            dn = 0.0 if j == 0 else _cdf((x[j] - h / 2 - m) / sd)
            r.append(up - dn)
        rows.append((lo, r))
    p = [math.exp(-xx * xx / 4) for xx in x]
    z = sum(p)
    p = [v / z for v in p]
    for _ in range(maxit):
        q = [0.0] * n
        for i, (lo, r) in enumerate(rows):
            pi = p[i]
            if pi > 0:
                for j, w in enumerate(r):
                    q[lo + j] += pi * w
        z = sum(q)
        q = [v / z for v in q]
        d = max(abs(u - v) for u, v in zip(p, q))
        p = q
        if d < tol:
            break
    return g, p


def moments(g, p, U, kappa):
    """(E x^2, E sat(u)^2, E x sat(u)) under the stationary law with policy u = -kappa x."""
    exx = sum(w * xx * xx for xx, w in zip(g.x, p))
    ua = [sat(-kappa * xx, U) for xx in g.x]
    euu = sum(w * u * u for u, w in zip(ua, p))
    exu = sum(w * xx * u for xx, u, w in zip(g.x, ua, p))
    return exx, euu, exu


def stationary_cost(a, b, s2, U, kappa, q=1.0, r=0.1, grid=None):
    """Average cost per step of the (clipped) linear policy on the plant; grid-based, +inf if the chain escapes the grid."""
    g, p = stationary(a, b, s2, U, kappa, grid)
    if p[0] + p[-1] > 1e-6:
        return math.inf
    exx, euu, _ = moments(g, p, U, kappa)
    return q * exx + r * euu


def bc_gain(g, p, U, k_expert):
    """Least-squares gain from logged (state, applied action) pairs with states drawn from the mass function p.

    kappa = -E[x sat(-k_expert x)] / E[x^2]. Logging the command instead of the applied action returns k_expert exactly.
    """
    exx = sum(w * xx * xx for xx, w in zip(g.x, p))
    exu = sum(w * xx * sat(-k_expert * xx, U) for xx, w in zip(g.x, p))
    return -exu / exx


def gaussian_masses(g, v):
    """Cell masses of N(0, v) on the grid: coverage a twin can impose by resetting to sampled states."""
    sd, h = math.sqrt(v), g.h
    return [(1.0 if j == g.n - 1 else _cdf((xx + h / 2) / sd)) - (0.0 if j == 0 else _cdf((xx - h / 2) / sd))
            for j, xx in enumerate(g.x)]


def gaussian_sat_prob(k, v, U):
    """P(|k x| < U) for x ~ N(0, v)."""
    return 2 * _cdf(U / (k * math.sqrt(v))) - 1


def bc_gain_gaussian(k_expert, v, U):
    """Stein's lemma: for Gaussian states, E[x sat(-k x)] = -k v P(|kx| < U), so the clone's gain is k P(|kx|<U)."""
    return k_expert * gaussian_sat_prob(k_expert, v, U)


def twin_bc_gain(twin, k_expert, grid=None):
    """Clone trained on applied actions from the expert running in the twin (ah, bh, s2h, Uh)."""
    ah, bh, s2h, Uh = twin
    g, p = stationary(ah, bh, s2h, Uh, k_expert, grid)
    return bc_gain(g, p, Uh, k_expert)


def dagger_gain(plant, U, k_expert, iters=40, grid=None, tol=1e-10):
    """Fixed point of DAgger with applied-action labels: refit on the states the current clone visits in `plant` (a, b, s2).

    kappa <- -E_{rho(kappa)}[x sat(-k_expert x)] / E_{rho(kappa)}[x^2]; returns (kappa, path)."""
    a, b, s2 = plant
    kappa = k_expert
    path = [kappa]
    for _ in range(iters):
        g, p = stationary(a, b, s2, U, kappa, grid)
        new = bc_gain(g, p, U, k_expert)
        path.append(new)
        done = abs(new - kappa) < tol
        kappa = new
        if done:
            break
    return kappa, path


def best_linear_gain(plant, U, q=1.0, r=0.1, lo=0.05, hi=3.0, grid=None, it=40):
    """Golden-section search for the clipped-linear gain minimising real stationary cost."""
    a, b, s2 = plant
    f = lambda k: stationary_cost(a, b, s2, U, k, q, r, grid)
    gr = (math.sqrt(5) - 1) / 2
    c, d = hi - gr * (hi - lo), lo + gr * (hi - lo)
    fc, fd = f(c), f(d)
    for _ in range(it):
        if fc < fd:
            hi, d, fd = d, c, fc
            c = hi - gr * (hi - lo)
            fc = f(c)
        else:
            lo, c, fc = c, d, fd
            d = lo + gr * (hi - lo)
            fd = f(d)
    k = (lo + hi) / 2
    return k, f(k)


def imitation_gap(plant, U, kappa, k_expert, q=1.0, r=0.1, grid=None):
    """Real cost of the clone minus real cost of the expert (same clipped plant)."""
    a, b, s2 = plant
    return stationary_cost(a, b, s2, U, kappa, q, r, grid) - stationary_cost(a, b, s2, U, k_expert, q, r, grid)


def simulate_cost(a, b, s2, U, kappa, n, seed, q=1.0, r=0.1, burn=1000):
    rng = random.Random(seed)
    x, tot, sd = 0.0, 0.0, math.sqrt(s2)
    for t in range(n + burn):
        u = sat(-kappa * x, U)
        if t >= burn:
            tot += q * x * x + r * u * u
        x = a * x + b * u + sd * rng.gauss(0, 1)
    return tot / n
