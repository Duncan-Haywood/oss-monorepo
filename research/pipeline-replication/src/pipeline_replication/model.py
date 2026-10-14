"""Pipeline-parallel training with replicated stages and SkipPipe-style stage skipping.

A microbatch crosses L stages. Each stage has r replica workers, each live w.p. a,
independently. With probability rho a stage's whole failure domain is out (all r replicas
together); otherwise replicas fail independently. A microbatch may skip up to s dead
stages; each skipped stage multiplies its usefulness by (1 - kappa).
"""
import math, random

__all__ = ["stage_dead", "binom_pmf", "binom_cdf", "p_ok", "useful_yield", "min_replicas",
           "cost_per_yield", "best_design", "r_approx", "floor_success", "simulate",
           "min_domains"]


def stage_dead(a, r, rho=0.0):
    """P(no live replica at a stage) = rho + (1-rho)(1-a)^r."""
    return rho + (1 - rho) * (1 - a) ** r


def binom_pmf(n, k, q):
    if q <= 0: return 1.0 if k == 0 else 0.0
    if q >= 1: return 1.0 if k == n else 0.0
    return math.exp(math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
                    + k * math.log(q) + (n - k) * math.log1p(-q))


def binom_cdf(n, k, q):
    return sum(binom_pmf(n, j, q) for j in range(0, min(k, n) + 1))


def p_ok(L, q, s):
    """P(at most s of L stages are dead): microbatch can be routed."""
    return binom_cdf(L, s, q)


def useful_yield(L, q, s, kappa):
    """E[(1-kappa)^D ; D <= s] with D ~ Bin(L, q)."""
    return sum(binom_pmf(L, d, q) * (1 - kappa) ** d for d in range(0, min(s, L) + 1))


def floor_success(L, rho, s):
    """Sup over r of P(success): replicas cannot beat the shared-domain floor."""
    return p_ok(L, rho, s)


def min_replicas(L, a, s, eps, rho=0.0, rmax=200):
    """Smallest r with P(microbatch dropped) <= eps, or None if the floor forbids it."""
    if floor_success(L, rho, s) < 1 - eps: return None
    for r in range(1, rmax + 1):
        if 1 - p_ok(L, stage_dead(a, r, rho), s) <= eps: return r
    return None


def r_approx(L, a, s, eps):
    """Poisson-tail approximation (rho=0): q ~ (eps (s+1)!)^(1/(s+1)) / L for small q."""
    qstar = (eps * math.factorial(s + 1)) ** (1.0 / (s + 1)) / L
    return math.log(1 / qstar) / math.log(1 / (1 - a))


def cost_per_yield(L, a, r, s, kappa, rho=0.0):
    """Workers per unit of useful microbatch throughput: L r / yield."""
    y = useful_yield(L, stage_dead(a, r, rho), s, kappa)
    return math.inf if y <= 0 else L * r / y


def best_design(L, a, kappa, rho=0.0, smax=None, rmax=60):
    """Minimise cost_per_yield over (r, s)."""
    smax = L if smax is None else smax
    best = (math.inf, None, None)
    for r in range(1, rmax + 1):
        for s in range(0, smax + 1):
            c = cost_per_yield(L, a, r, s, kappa, rho)
            if c < best[0]: best = (c, r, s)
    return best


def simulate(L, a, r, s, rho, n, seed=0):
    """Monte-Carlo (success rate, mean dead stages | success)."""
    rng = random.Random(seed)
    ok = dead_sum = 0
    for _ in range(n):
        d = 0
        for _ in range(L):
            if rng.random() < rho or all(rng.random() >= a for _ in range(r)):
                d += 1
        if d <= s:
            ok += 1; dead_sum += d
    return ok / n, (dead_sum / ok if ok else float("nan"))


def min_domains(L, a_dom, s, eps):
    """Failure domains per stage when each domain is independently live w.p. a_dom
    (replicas spread one per domain): same as min_replicas with rho=0."""
    return min_replicas(L, a_dom, s, eps)
