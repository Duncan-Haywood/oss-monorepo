"""Paying the first k of n finishers: workers choose their speed.

Race.  Worker i picks a rate m_i at linear cost c*m_i and finishes at X_i ~ Exp(m_i), independently.  The k earliest
finishers each receive R; the round ends at X_(k).  Worker i is paid with probability
    pi_i = int_0^inf m_i e^{-m_i t} P(Bin(n-1, 1-e^{-m t}) <= k-1) dt        (others all at rate m)
         = sum_{j<k} C(n-1,j) r B(r+n-1-j, j+1),   r = m_i/m                  (u = e^{-m t}, Beta integrals).
At r=1 every term equals 1/n (so pi = k/n) and d/dr of the j-th term is (1/n)(1 - (H_n - H_{n-1-j})), hence
    pi'(1) = (1/n) * sum_{j=0}^{k-1} (1 - (H_n - H_{n-1-j})).
Since pi depends on m_i/m only, the first-order condition R pi'(1)/m = c gives the symmetric equilibrium speed
    m* = R pi'(1) / c            (verified as a global best response numerically).
This telescopes to the closed form pi'(1) = (1-k/n)(H_n-H_{n-k}) (proved by induction on k, checked to 1e-12), so
    m* = R (n-k)(H_n-H_{n-k}) / (n c)   and the harmonic factor cancels in the round time:
    E X_(k) = n c / ((n-k) R)   (exactly), i.e. n c k / ((n-k) B) under a budget B = kR: increasing in k.
k=1 is the Tullock contest (pi = m_i/sum m); k=n pays everybody (pi'(1) = 0, m* = 0: no speed incentive).
Consequences: effort spend n c m* = n R pi'(1) (a share (n-k)(H_n-H_{n-k})/k of the budget kR); for speed alone the
best design is k=1 (winner-take-all), and an interior k appears only once statistical accuracy needs k >= k_min.
"""
import math, random

__all__ = ["harmonic", "pi", "pi_numeric", "dpi", "dpi_numeric", "eq_speed", "best_response", "round_time",
           "dissipation", "dpi_closed", "time_given_budget", "best_k_budget", "sgd_rounds", "total_time", "best_k_accuracy",
           "simulate_race"]


def harmonic(n):
    return sum(1.0 / j for j in range(1, n + 1))


def _logB(a, b):
    return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)


def pi(n, k, r):
    """P(worker with rate r*m is among the first k of n, the other n-1 having rate m)."""
    return sum(math.comb(n - 1, j) * r * math.exp(_logB(r + n - 1 - j, j + 1)) for j in range(k))


def pi_numeric(n, k, r, steps=200000):
    """Independent route: midpoint rule for int_0^1 r u^{r-1} P(Bin(n-1,1-u) <= k-1) du, sub u = v^{1/r}."""
    h, tot = 1.0 / steps, 0.0
    for i in range(steps):
        v = (i + 0.5) * h
        u = v ** (1.0 / r)                       # r u^{r-1} du = dv
        p, q, pmf, cdf = 1 - u, u, u ** (n - 1), 0.0
        for j in range(k):
            cdf += pmf
            pmf *= (n - 1 - j) / (j + 1) * (p / q) if q > 0 else 0.0
        tot += cdf
    return tot * h


def dpi(n, k):
    """Closed form pi'(1) = d pi / d r at r = 1."""
    H = harmonic(n)
    return sum(1.0 - (H - harmonic(n - 1 - j)) for j in range(k)) / n


def dpi_closed(n, k):
    return (1 - k / n) * (harmonic(n) - harmonic(n - k))


def dpi_numeric(n, k, eps=1e-4):
    return (pi(n, k, 1 + eps) - pi(n, k, 1 - eps)) / (2 * eps)


def eq_speed(n, k, R, c):
    return max(0.0, R * dpi(n, k) / c)


def best_response(n, k, R, c, m, grid=4000, top=6.0):
    """Best deviation rate against n-1 rivals at rate m, by grid search on payoff R*pi(r) - c*m*r; returns (rate, payoff)."""
    best = (0.0, 0.0)
    for i in range(1, grid + 1):
        r = top * i / grid
        u = R * pi(n, k, r) - c * m * r
        if u > best[1]:
            best = (m * r, u)
    return best


def round_time(n, k, m):
    return (harmonic(n) - harmonic(n - k)) / m if m > 0 else math.inf


def dissipation(n, k):
    """Share of the prize budget kR spent on speed in equilibrium."""
    return n * dpi(n, k) / k


def time_given_budget(n, k, B, c):
    m = eq_speed(n, k, B / k, c)
    return round_time(n, k, m)


def best_k_budget(n, B, c):
    t, k = min((time_given_budget(n, k, B, c), k) for k in range(1, n))
    return k, t


def sgd_rounds(k, a, eta, sigma2, x0sq, eps):
    """Rounds for quadratic SGD with k-averaged noise to reach E x^2 <= eps (as in straggler-backup); inf if unreachable."""
    rho = 1 - eta * a
    phi = eta * eta * sigma2 / (1 - rho * rho)
    if phi / k >= eps:
        return math.inf
    return max(0, math.ceil(math.log((eps - phi / k) / (x0sq - phi / k)) / (2 * math.log(rho))))


def total_time(n, k, B, c, a, eta, sigma2, x0sq, eps):
    return sgd_rounds(k, a, eta, sigma2, x0sq, eps) * time_given_budget(n, k, B, c)


def best_k_accuracy(n, B, c, a, eta, sigma2, x0sq, eps):
    ts = [(total_time(n, k, B, c, a, eta, sigma2, x0sq, eps), k) for k in range(1, n) if dpi(n, k) > 0]
    t, k = min(ts)
    return k, t


def simulate_race(n, k, rates, rng, trials):
    """Returns (paid-frequency per worker, mean round time X_(k))."""
    paid, tot = [0] * n, 0.0
    for _ in range(trials):
        xs = sorted((rng.expovariate(m), i) for i, m in enumerate(rates))
        for _, i in xs[:k]:
            paid[i] += 1
        tot += xs[k - 1][0]
    return [p / trials for p in paid], tot / trials
