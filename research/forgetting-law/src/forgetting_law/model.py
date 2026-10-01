"""Sequential training on random rank-r tasks in R^d (realizable: every task is solved by a common w*).
Training on task j to convergence from w is the projection e <- (I-P_j) e on the error e = w - w*, where P_j is the
projector onto the task's row space (a Haar-random r-dim subspace). Loss of task i is ||P_i e||^2.
Exact second-moment identity for a Haar rank-r projector P:  E[P A P] = c1 A + c2 tr(A) I,
  c2 = r(d-r)/(d(d+2)(d-1)),  c1 = r/d - d c2.   (the same with r -> d-r for I-P)
Consequence: E forgetting of a task after k further random tasks = (r/d)(1-r/d)(rho^k - lam^k)|e0|^2,
  rho = 1-r/d, lam = c1(d-r) = rho - r(d-r)/((d+2)(d-1)).
Modular variant: m modules, each task routed to a uniform module; a task is only overwritten by tasks in its module."""
import math
import random

__all__ = ["c2", "c1", "rho", "lam", "forget", "peak_lag", "peak_forget", "total_forget", "forget_mod", "fresh_mod",
           "avg_seen_loss", "objective", "best_modules", "haar_projector", "simulate_forgetting", "simulate_modular",
           "simulate_conflict_floor", "conflict_floor"]


def c2(d, r):
    return r * (d - r) / (d * (d + 2) * (d - 1))


def c1(d, r):
    return r / d - d * c2(d, r)


def rho(d, r):
    return 1 - r / d


def lam(d, r):
    return c1(d, d - r)


def _C(d, r):
    return (r / d) * rho(d, r)


def forget(d, r, k):
    """E loss on a just-learned task after k further random tasks, |e0|=1 (e0 = error before learning it)."""
    return _C(d, r) * (rho(d, r) ** k - lam(d, r) ** k)


def peak_lag(d, r):
    """Real-valued lag maximising forget: (rho/lam)^k = ln lam / ln rho."""
    a, b = rho(d, r), lam(d, r)
    return math.log(math.log(b) / math.log(a)) / math.log(a / b)


def peak_forget(d, r):
    k = peak_lag(d, r)
    return _C(d, r) * (rho(d, r) ** k - lam(d, r) ** k)


def total_forget(d, r):
    """sum_{k>=0} forget(d,r,k)."""
    return _C(d, r) * (1 / (1 - rho(d, r)) - 1 / (1 - lam(d, r)))


def forget_mod(d, r, m, k):
    """m modules, uniform routing: the k later tasks hit the module Binomial(k,1/m) times."""
    a, b = 1 - (1 - rho(d, r)) / m, 1 - (1 - lam(d, r)) / m
    return _C(d, r) * (a ** k - b ** k)


def fresh_mod(d, r, m, T):
    """E loss of a fresh task routed to a uniform module after T tasks, |e0|=1."""
    return (r / d) * (1 - (r / d) / m) ** T


def avg_seen_loss(d, r, m, T):
    """Mean loss over the T tasks seen, after T tasks. The task at position i meets a module error already shrunk by the
    earlier tasks routed there, factor x^(i-1) with x = 1-(r/d)/m, so the sum is C[T x^(T-1) - (x^T-b^T)/(x-b)]."""
    x, b = 1 - (1 - rho(d, r)) / m, 1 - (1 - lam(d, r)) / m
    return _C(d, r) * (T * x ** (T - 1) - (x ** T - b ** T) / (x - b)) / T


def objective(d, r, m, T):
    return avg_seen_loss(d, r, m, T) + fresh_mod(d, r, m, T)


def best_modules(d, r, T, mmax=64):
    return min(range(1, mmax + 1), key=lambda m: objective(d, r, m, T))


def conflict_floor(d, r, tau2):
    """Task optima w*_j = w* + delta_j, delta_j ~ N(0, tau2/d I): stationary E|e|^2 = tau2 and the loss on a task learned
    long ago is 2 r tau2 / d (half from the drifted iterate, half from the task's own offset)."""
    return 2 * r * tau2 / d


def _gauss(rng):
    return rng.gauss(0.0, 1.0)


def haar_projector(d, r, rng):
    """Orthonormal basis (list of r vectors) of a Haar-random r-dim subspace (Gram-Schmidt on Gaussians)."""
    U = []
    while len(U) < r:
        v = [_gauss(rng) for _ in range(d)]
        for u in U:
            p = sum(a * b for a, b in zip(u, v))
            v = [a - p * b for a, b in zip(v, u)]
        n = math.sqrt(sum(a * a for a in v))
        if n > 1e-9:
            U.append([a / n for a in v])
    return U


def _proj(U, e):
    out = [0.0] * len(e)
    for u in U:
        p = sum(a * b for a, b in zip(u, e))
        for i, a in enumerate(u):
            out[i] += p * a
    return out


def _unit(d, rng):
    e = [_gauss(rng) for _ in range(d)]
    n = math.sqrt(sum(a * a for a in e))
    return [a / n for a in e]


def simulate_forgetting(d, r, kmax, runs, rng):
    """Mean over runs of |P_1 e|^2 after learning task 1 then k random tasks, k=0..kmax, from |e_init|=1
    (prediction: forget(d,r,k))."""
    acc = [0.0] * (kmax + 1)
    for _ in range(runs):
        e = _unit(d, rng)
        U1 = haar_projector(d, r, rng)
        pe = _proj(U1, e)
        e = [a - b for a, b in zip(e, pe)]
        for k in range(kmax + 1):
            acc[k] += sum(x * x for x in _proj(U1, e))
            if k < kmax:
                pe = _proj(haar_projector(d, r, rng), e)
                e = [a - b for a, b in zip(e, pe)]
    return [a / runs for a in acc]


def simulate_modular(d, r, m, T, runs, rng):
    """After T random tasks routed to m modules: (mean loss over the T seen tasks, mean loss of a fresh task on a random
    module).  Each module starts at the same unit error."""
    seen_tot = fresh_tot = 0.0
    for _ in range(runs):
        e0 = _unit(d, rng)
        E = [list(e0) for _ in range(m)]
        Us = []
        for t in range(T):
            g = rng.randrange(m)
            U = haar_projector(d, r, rng)
            E[g] = [a - b for a, b in zip(E[g], _proj(U, E[g]))]
            Us.append((g, U))
        seen_tot += sum(sum(x * x for x in _proj(U, E[g])) for g, U in Us) / T
        g = rng.randrange(m)
        fresh_tot += sum(x * x for x in _proj(haar_projector(d, r, rng), E[g]))
    return seen_tot / runs, fresh_tot / runs


def simulate_conflict_floor(d, r, tau2, steps, runs, rng):
    """Shared model, conflicting tasks. Returns (stationary E|e|^2, loss on the task learned `steps` tasks earlier)."""
    sd = math.sqrt(tau2 / d)
    en = ls = 0.0
    for _ in range(runs):
        e = [0.0] * d
        for _ in range(60):                                   # burn-in to stationarity
            U = haar_projector(d, r, rng)
            dl = [sd * _gauss(rng) for _ in range(d)]
            e = _step_conflict(U, e, dl)
        U1 = haar_projector(d, r, rng)
        d1 = [sd * _gauss(rng) for _ in range(d)]
        e = _step_conflict(U1, e, d1)
        for _ in range(steps):
            e = _step_conflict(haar_projector(d, r, rng), e, [sd * _gauss(rng) for _ in range(d)])
        en += sum(x * x for x in e)
        ls += sum(x * x for x in _proj(U1, [a - b for a, b in zip(e, d1)]))
    return en / runs, ls / runs


def _step_conflict(U, e, delta):
    """Train to convergence on the task with optimum w*+delta: e <- (I-P)e + P delta."""
    pe = _proj(U, e)
    pd = _proj(U, delta)
    return [a - b + c for a, b, c in zip(e, pe, pd)]
