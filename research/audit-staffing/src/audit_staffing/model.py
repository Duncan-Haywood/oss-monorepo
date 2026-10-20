"""Staffing an audit pool for refereed verification.

A cheat with gain G against stake S is deterred iff the audit probability a >= G/(G+S).  Audits then arrive as a Poisson
stream of rate lam*a and need mean service time s, so the pool of c verifiers is an M/G/c queue with offered load
R = lam*a*s.  Exact facts used here:
  * Erlang C: P(wait) = C(c,R), E[Wq] = C s/(c-R), P(Wq>t) = C exp(-(c-R) t/s)  (M/M/c);
  * Halfin-Whitt square-root staffing: c = R + beta sqrt(R), P(wait) -> [1 + beta Phi(beta)/phi(beta)]^-1;
  * Allen-Cunneen: E[Wq] ~ E[Wq(M/M/c)] (ca^2+cs^2)/2 for general arrival/service variability;
  * Little: locked capital = lam*S*(d0 + a*(Wq+s)).
Stake and capacity trade off: substituting a = G/(G+S), the marginal wage saved by one more unit of stake is w s lam G/(G+S)^2
(to first order), so total cost w c + r S lam d0 is minimised near G+S = sqrt(w s G/(r d0)).
"""
import math, heapq, random

__all__ = ["erlang_b", "erlang_c", "mean_wait", "wait_tail", "min_servers", "hw_wait_prob", "hw_beta", "hw_servers",
           "audit_prob", "offered_load", "cost", "best_stake", "stake_star", "simulate", "allen_cunneen",
           "flaky_wait_prob", "flaky_servers"]


def erlang_b(c, R):
    b = 1.0
    for k in range(1, c + 1):
        b = R * b / (k + R * b)
    return b


def erlang_c(c, R):
    """P(an arriving job waits) in M/M/c with offered load R (needs c > R)."""
    if c <= R:
        return 1.0
    b = erlang_b(c, R)
    return c * b / (c - R * (1 - b))


def mean_wait(c, R, s=1.0):
    return math.inf if c <= R else erlang_c(c, R) * s / (c - R)


def wait_tail(c, R, t, s=1.0):
    return erlang_c(c, R) * math.exp(-(c - R) * t / s) if c > R else 1.0


def min_servers(R, target, kind="prob", s=1.0, t=0.0):
    """Least integer c with P(wait)<=target ('prob'), E[Wq]<=target ('mean'), or P(Wq>t)<=target ('tail')."""
    c = max(1, int(math.floor(R)) + 1)
    while True:
        v = {"prob": lambda: erlang_c(c, R), "mean": lambda: mean_wait(c, R, s),
             "tail": lambda: wait_tail(c, R, t, s)}[kind]()
        if v <= target:
            return c
        c += 1


def _phi(x):
    return math.exp(-x * x / 2) / math.sqrt(2 * math.pi)


def _Phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def hw_wait_prob(beta):
    return 1.0 / (1.0 + beta * _Phi(beta) / _phi(beta))


def hw_beta(p):
    """Inverse of hw_wait_prob by bisection: the safety factor beta giving waiting probability p."""
    lo, hi = 0.0, 40.0
    for _ in range(200):
        m = (lo + hi) / 2
        if hw_wait_prob(m) > p:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def hw_servers(R, p):
    return R + hw_beta(p) * math.sqrt(R)


def audit_prob(G, S):
    return G / (G + S)


def offered_load(lam, G, S, s):
    return lam * audit_prob(G, S) * s


def cost(S, lam, G, s, w, r, d0, p_wait):
    """(total cost rate, servers, offered load) with c the least integer keeping P(wait) <= p_wait."""
    R = offered_load(lam, G, S, s)
    c = min_servers(R, p_wait)
    a = audit_prob(G, S)
    locked = lam * S * (d0 + a * (mean_wait(c, R, s) + s))
    return w * c + r * locked, c, R


def best_stake(lam, G, s, w, r, d0, p_wait, S_max=None, n=2000):
    """Grid search for the cost-minimising stake (stake in (0, S_max])."""
    S_max = S_max or 50 * G
    best = None
    for i in range(1, n + 1):
        S = S_max * i / n
        v = cost(S, lam, G, s, w, r, d0, p_wait)
        if best is None or v[0] < best[0]:
            best = (v[0], S, v[1], v[2])
    return best


def stake_star(G, s, w, r, d0):
    """First-order optimum G+S = sqrt(w s G/(r d0)) (ignores safety staffing and finite-c effects); returns S* (may be <=0)."""
    return math.sqrt(w * s * G / (r * d0)) - G


def allen_cunneen(c, R, ca2, cs2, s=1.0):
    return mean_wait(c, R, s) * (ca2 + cs2) / 2


def simulate(c, lam, service, T, rng, batch=None, warm=0.1):
    """FIFO M/G/c (or batch-Poisson/G/c) simulation.  service(rng) draws a service time; batch(rng) draws a batch size
    (batches arrive Poisson with rate lam/E[batch]; pass batch=(sampler, mean)).  Returns (mean wait, P(wait>0), waits)."""
    free = [0.0] * c            # heap of times when each server frees up
    heapq.heapify(free)
    t, waits = 0.0, []
    rate = lam if batch is None else lam / batch[1]
    while t < T:
        t += rng.expovariate(rate)
        k = 1 if batch is None else batch[0](rng)
        for _ in range(k):
            f = heapq.heappop(free)
            start = max(t, f)
            heapq.heappush(free, start + service(rng))
            if t > warm * T:
                waits.append(start - t)
    n = len(waits)
    return sum(waits) / n, sum(1 for x in waits if x > 1e-12) / n, waits


def flaky_wait_prob(c, u, R):
    """P(wait) when each of c verifiers is independently up with probability u for the whole period (static outages):
    E over Binomial(c,u) available servers of C(k,R), counting a saturated pool (k<=R) as waiting with probability 1."""
    tot = 0.0
    for k in range(c + 1):
        pk = math.comb(c, k) * u ** k * (1 - u) ** (c - k)
        tot += pk * (erlang_c(k, R) if k > R else 1.0)
    return tot


def flaky_servers(R, u, p):
    c = max(1, int(R / u))
    while flaky_wait_prob(c, u, R) > p:
        c += 1
    return c
