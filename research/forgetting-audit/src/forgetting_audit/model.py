"""Auditing a continual-learning job from old-task losses (companion to research/forgetting-law).
A trainer sees T random rank-r tasks in R^d that share a solution; task j is trained with step fraction a_j in [0,1]
(a_j=1: to convergence, a_j=0: skipped), i.e. e <- (I - a_j P_j) e for the error e = w - w*, with |e_init| = 1.
For iid a_j with m1 = E a, m2 = E a^2 and a Haar rank-r projector, E[PAP] = c1 A + c2 tr(A) I gives
  E[(I-aP)A(I-aP)] = lam A + m2 c2 tr(A) I,   E tr = rho tr,
  rho = 1 - (2 m1 - m2) r/d,   lam = 1 - 2 m1 r/d + m2 c1,   rho - lam = m2 d c2.
The loss of the task at position t after T tasks (lag k = T-t) has mean
  rho^(t-1) [ (1 - 2 m1 + m2)(r/d) lam^k + (r/d) rho (rho^k - lam^k) ]     (a_t iid with the others)
and a task never trained has mean (r/d) rho^T.  Honest: m1 = m2 = 1 (recovers forgetting-law); skipping with prob s:
m1 = m2 = 1-s; a fixed step fraction a: m1 = a, m2 = a^2."""
import math
import random

__all__ = ["c2", "c1", "moments_skip", "moments_step", "rho", "lam", "audit_mean", "fresh_mean", "skip_ratio",
           "ratio_floor", "window", "haar_projector", "simulate_job", "collect", "z_quantile", "samples_needed",
           "test_power", "compute_saving"]


def c2(d, r):
    return r * (d - r) / (d * (d + 2) * (d - 1))


def c1(d, r):
    return r / d - d * c2(d, r)


def moments_skip(s):
    """Trainer skips each task independently with probability s."""
    return 1 - s, 1 - s


def moments_step(a):
    """Trainer takes a fixed fraction a of the converging step on every task."""
    return a, a * a


def rho(d, r, m=(1.0, 1.0)):
    m1, m2 = m
    return 1 - (2 * m1 - m2) * r / d


def lam(d, r, m=(1.0, 1.0)):
    m1, m2 = m
    return 1 - 2 * m1 * r / d + m2 * c1(d, r)


def audit_mean(d, r, m, t, T):
    """E loss at the final checkpoint on the task at position t (1-based) of T, |e_init| = 1."""
    k = T - t
    a, b = rho(d, r, m), lam(d, r, m)
    m1, m2 = m
    return a ** (t - 1) * ((1 - 2 * m1 + m2) * (r / d) * b ** k + (r / d) * a * (a ** k - b ** k))


def fresh_mean(d, r, m, T):
    """E loss on a task drawn after training (never trained)."""
    return (r / d) * rho(d, r, m) ** T


def skip_ratio(d, r, k):
    """Loss of a task the trainer skipped over loss of an honestly trained one, both at lag k >= 1 (same later tasks):
    1 / (rho (1 - (lam/rho)^k)).  Decreases in k to the floor 1/rho = d/(d-r)."""
    a, b = rho(d, r), lam(d, r)
    return 1 / (a * (1 - (b / a) ** k))


def ratio_floor(d, r):
    return d / (d - r)


def window(d, r, ratio):
    """Largest lag at which a skipped task is still at least `ratio` times an honest one (needs ratio < ... floor
    excluded: returns None if ratio <= floor, i.e. always distinguishable at that ratio)."""
    if ratio <= ratio_floor(d, r):
        return None
    a, b = rho(d, r), lam(d, r)
    x = 1 - 1 / (a * ratio)
    return math.log(x) / math.log(b / a)


def compute_saving(s):
    """Fraction of training compute a skipping trainer saves."""
    return s


# ---------------- simulation ----------------
def haar_projector(d, r, rng):
    U = []
    while len(U) < r:
        v = [rng.gauss(0.0, 1.0) for _ in range(d)]
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


def _loss(U, e):
    return sum(sum(a * b for a, b in zip(u, e)) ** 2 for u in U)


def simulate_job(d, r, T, draw_a, rng):
    """One job: returns (losses at the final checkpoint of the T trained tasks, loss of a fresh task)."""
    e = [rng.gauss(0.0, 1.0) for _ in range(d)]
    n = math.sqrt(sum(x * x for x in e))
    e = [x / n for x in e]
    Us = []
    for _ in range(T):
        U = haar_projector(d, r, rng)
        a = draw_a(rng)
        pe = _proj(U, e)
        e = [x - a * y for x, y in zip(e, pe)]
        Us.append(U)
    return [_loss(U, e) for U in Us], _loss(haar_projector(d, r, rng), e)


def collect(d, r, T, draw_a, jobs, rng):
    """Per-position and fresh single-sample losses over `jobs` independent jobs: (list per t=1..T, fresh list)."""
    per = [[] for _ in range(T)]
    fresh = []
    for _ in range(jobs):
        ls, f = simulate_job(d, r, T, draw_a, rng)
        for i, x in enumerate(ls):
            per[i].append(x)
        fresh.append(f)
    return per, fresh


# ---------------- tests ----------------
def z_quantile(p):
    """Standard normal quantile (Acklam-free bisection on erf)."""
    lo, hi = -10.0, 10.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if 0.5 * (1 + math.erf(mid / math.sqrt(2))) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _mv(xs):
    m = sum(xs) / len(xs)
    return m, sum((x - m) ** 2 for x in xs) / (len(xs) - 1)


def samples_needed(h0, h1, alpha=0.05, power=0.8):
    """Jobs N so that a one-sided z-test on the mean single-job loss (reject when mean > mu0 + z_a s0/sqrt N) has size
    alpha and power `power`: N = ((z_a s0 + z_b s1)/(mu1-mu0))^2."""
    (m0, v0), (m1, v1) = _mv(h0), _mv(h1)
    if m1 <= m0:
        return math.inf
    return ((z_quantile(1 - alpha) * math.sqrt(v0) + z_quantile(power) * math.sqrt(v1)) / (m1 - m0)) ** 2


def test_power(h0, h1, N, alpha, reps, rng):
    """Empirical (size, power) of the z-test with critical value from the H0 pool, resampling N jobs per replicate."""
    m0, v0 = _mv(h0)
    crit = m0 + z_quantile(1 - alpha) * math.sqrt(v0 / N)
    size = sum(sum(rng.choice(h0) for _ in range(N)) / N > crit for _ in range(reps)) / reps
    pw = sum(sum(rng.choice(h1) for _ in range(N)) / N > crit for _ in range(reps)) / reps
    return size, pw
