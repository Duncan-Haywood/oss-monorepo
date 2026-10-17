"""Heterogeneous exponential races paying the first k of n finishers (extends speed-race).

Worker i picks a rate x_i at cost c_i * x_i**p and finishes at X_i ~ Exp(x_i).  The first k finishers get R.
Win probability of a worker at rate x against others at rates (m_j):   with s = 1 - e^{-x t}  (so t = -ln(1-s)/x),
    pi = int_0^1 P( N(t(s)) <= k-1 ) ds,   N(t) = sum_j Bernoulli(1 - e^{-m_j t})   (Poisson-binomial),
which for identical rivals reduces to speed-race's Beta sum.  pi is homogeneous of degree 0 in all rates jointly, so the
elasticity e_i = x_i dpi_i/dx_i is a function of rate ratios only, and the first-order condition R e_i = p c_i x_i**p gives
    x_i = (R e_i / (p c_i))**(1/p),                                      (elasticity fixed point)
solved by damped iteration.  Symmetric case: e = (1-k/n)(H_n-H_{n-k}) exactly (proved in the paper), so
    x* = (R e/(p c))**(1/p),   round time (H_n-H_{n-k})/x*.
"""
import math, random

__all__ = ["harmonic", "e_sym", "sym_speed", "sym_round_time", "win_prob", "elasticity", "solve", "best_response_gain",
           "expected_kth", "simulate", "exit_ratio", "entry_payoff", "mean_cost_time"]


def harmonic(n):
    return sum(1.0 / j for j in range(1, n + 1))


def e_sym(n, k):
    return (1 - k / n) * (harmonic(n) - harmonic(n - k))


def sym_speed(n, k, R, c, p=1.0):
    return (R * e_sym(n, k) / (p * c)) ** (1.0 / p)


def sym_round_time(n, k, R, c, p=1.0):
    x = sym_speed(n, k, R, c, p)
    return (harmonic(n) - harmonic(n - k)) / x if x > 0 else math.inf


def _cdf_le(rates_t, k):
    """P(#successes <= k-1) for independent Bernoulli(q) with q in rates_t (DP truncated at k)."""
    dp = [1.0] + [0.0] * (k - 1)
    for q in rates_t:
        for j in range(k - 1, 0, -1):
            dp[j] = dp[j] * (1 - q) + dp[j - 1] * q
        dp[0] *= (1 - q)
    return sum(dp)


def win_prob(x, others, k, steps=1500):
    """P(worker at rate x is among first k) against rivals at `others` (list of rates); midpoint rule in s with s=1-w^2."""
    if len(others) < k:
        return 1.0
    tot, h = 0.0, 1.0 / steps
    for i in range(steps):
        w = (i + 0.5) * h                      # 1-s = w^2 concentrates nodes near s=1 where t blows up
        t = -2.0 * math.log(w) / x
        qs = [1.0 - math.exp(-m * t) for m in others]
        tot += _cdf_le(qs, k) * 2.0 * w        # ds = 2 w dw
    return tot * h


def elasticity(x, others, k, steps=1500, eps=1e-4):
    a, b = x * (1 + eps), x * (1 - eps)
    return x * (win_prob(a, others, k, steps) - win_prob(b, others, k, steps)) / (a - b)


def solve(counts, costs, k, R=1.0, p=1.0, steps=800, iters=200, damp=0.5, tol=1e-9):
    """Type-symmetric equilibrium: counts[t] workers of type t with cost costs[t]; returns rates per type."""
    T = len(counts)
    m = [sym_speed(sum(counts), k, R, costs[t], p) for t in range(T)]
    for _ in range(iters):
        new = []
        for t in range(T):
            others = []
            for u in range(T):
                others += [m[u]] * (counts[u] - (1 if u == t else 0))
            e = elasticity(m[t], others, k, steps)
            new.append((max(R * e, 0.0) / (p * costs[t])) ** (1.0 / p))
        nm = [(1 - damp) * m[t] + damp * new[t] for t in range(T)]
        d = max(abs(nm[t] - m[t]) for t in range(T))
        m = nm
        if d < tol:
            break
    return m


def _others(counts, m, t):
    o = []
    for u in range(len(counts)):
        o += [m[u]] * (counts[u] - (1 if u == t else 0))
    return o


def best_response_gain(counts, costs, m, k, t, R=1.0, p=1.0, grid=120, top=4.0, steps=800):
    """Payoff gain of the best deviation for a type-t worker over staying at m[t] (<= 0 up to grid error means equilibrium)."""
    others = _others(counts, m, t)
    stay = R * win_prob(m[t], others, k, steps) - costs[t] * m[t] ** p
    best = max(R * win_prob(m[t] * top * i / grid, others, k, steps) - costs[t] * (m[t] * top * i / grid) ** p
               for i in range(1, grid + 1))
    return max(best, 0.0) - stay


def expected_kth(rates, k, steps=4000):
    """E X_(k) = int_0^inf P(N(t) <= k-1) dt for independent exponentials (Poisson-binomial), same substitution t=-2 ln w."""
    tot, h = 0.0, 1.0 / steps
    for i in range(steps):
        w = (i + 0.5) * h
        t = -2.0 * math.log(w)
        qs = [1.0 - math.exp(-r * t) for r in rates]
        tot += _cdf_le(qs, k) * 2.0 / w
    return tot * h


def simulate(rates, k, rng, trials):
    """Returns (paid frequency per worker, mean X_(k))."""
    n = len(rates)
    paid, tot = [0] * n, 0.0
    for _ in range(trials):
        xs = sorted((rng.expovariate(m), i) for i, m in enumerate(rates))
        for _, i in xs[:k]:
            paid[i] += 1
        tot += xs[k - 1][0]
    return [q / trials for q in paid], tot / trials


def exit_ratio(n_fast, k):
    """Cost ratio c_slow/c_fast at and above which slow workers stay out (rate 0) in equilibrium, k < n_fast.
    Entering at rate x -> 0 wins with probability x * E[X_(k) of the fast workers], and E X_(k) = n_f c_f/((n_f-k) R) at the
    fast-only equilibrium, so entry pays iff c_s < n_f c_f/(n_f-k).  For k >= n_fast slow workers can always win: no exit."""
    return math.inf if k >= n_fast else n_fast / (n_fast - k)


def entry_payoff(x, n_fast, k, cost_fast, cost_slow, R=1.0):
    """Payoff of one slow worker entering at rate x against n_fast fast workers at their fast-only equilibrium
    and every other slow worker idle."""
    xf = sym_speed(n_fast, k, R, cost_fast)
    return R * win_prob(x, [xf] * n_fast, k) - cost_slow * x


def mean_cost_time(n, k, R, costs):
    """Empirical benchmark n * mean(cost) / ((n-k) R): the homogeneous round time with the mean cost (not a theorem)."""
    return n * (sum(costs) / len(costs)) / ((n - k) * R)
