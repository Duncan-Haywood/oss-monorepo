"""Grinding attacks on hash-derived spot-check challenges. Stdlib only.

A prover commits to a T-step training trace, corrupts k steps, and the challenge (q distinct
steps to open) is derived by hashing the commitment (Fiat-Shamir). The prover escapes iff the
challenge misses all k corrupted steps: probability p. Because the challenge is visible before
submission and a failed try costs only c, the prover re-rolls (a different corrupted set, or a
salt) until it misses. G = gain from an undetected corruption, c = cost of one re-roll.
"""
import hashlib, math, random

__all__ = ["log_comb", "p_avoid", "p_avoid_repl", "bits", "q_for_bits", "q_for_deterrence",
           "grind_profit", "grind_profit_budget", "beacon_profit", "q_for_beacon",
           "lam_p", "pow_cost_opt", "overhead", "overhead_best_bruteforce", "simulate_grind"]


def log_comb(n, r):
    return math.lgamma(n + 1) - math.lgamma(r + 1) - math.lgamma(n - r + 1)


def p_avoid(T, k, q):
    """P(q distinct uniformly sampled steps miss all k corrupted) = C(T-k,q)/C(T,q)."""
    if q > T - k:
        return 0.0
    return math.exp(log_comb(T - k, q) - log_comb(T, q))


def p_avoid_repl(T, k, q):
    """Same with replacement: (1-k/T)^q."""
    return (1 - k / T) ** q


def bits(T, k, q):
    """Grinding work in bits: log2(1/p)."""
    p = p_avoid(T, k, q)
    return math.inf if p == 0 else -math.log2(p)


def _min_q(T, k, ok):
    lo, hi = 0, T
    if not ok(hi):
        return None
    while lo < hi:
        mid = (lo + hi) // 2
        lo, hi = (lo, mid) if ok(mid) else (mid + 1, hi)
    return lo


def q_for_bits(T, k, b):
    """Smallest q with p_avoid <= 2^-b."""
    return _min_q(T, k, lambda q: p_avoid(T, k, q) <= 2.0 ** (-b))


def q_for_deterrence(T, k, G, c):
    """Smallest q with c/p >= G, i.e. p <= c/G: the expected cost of grinding exceeds the gain."""
    return _min_q(T, k, lambda q: p_avoid(T, k, q) * G <= c)


def grind_profit(G, c, p):
    """Sequential re-roller (sees each challenge before committing): expected profit G - c/p if
    pG > c else 0 (every try has expected gain pG - c independent of history, so keep trying)."""
    return max(0.0, G - c / p) if p > 0 else 0.0


def grind_profit_budget(G, c, p, N):
    """At most N tries: (1-(1-p)^N)(G - c/p) when profitable to start, else 0."""
    if p * G <= c:
        return 0.0
    return (1 - (1 - p) ** N) * (G - c / p)


def beacon_profit(G, F, p):
    """Challenge from a beacon revealed after commitment: one shot, caught w.p. 1-p, slashed F."""
    return p * G - (1 - p) * F


def q_for_beacon(T, k, G, F):
    """Smallest q with beacon_profit <= 0, i.e. p <= F/(G+F)."""
    return _min_q(T, k, lambda q: beacon_profit(G, F, p_avoid(T, k, q)) <= 0)


def lam_p(T, k):
    """-ln(1-k/T): nats of grinding work per sampled step (with replacement)."""
    return -math.log(1 - k / T)


def pow_cost_opt(v, lp, c0):
    """Optimal proof-of-work cost x on the challenge: per-try cost c0+x, honest pays x once,
    verifier pays v per opened step with q=ln(G/(c0+x))/lp. Overhead J=x+(v/lp)ln(G/(c0+x));
    dJ/dx=0 gives x* = v/lp - c0 (0 if negative)."""
    return max(0.0, v / lp - c0)


def overhead(x, v, lp, c0, G):
    return x + (v / lp) * math.log(G / (c0 + x))


def overhead_best_bruteforce(v, lp, c0, G, grid=200000, xmax=None):
    xmax = xmax or 4 * v / lp
    best = min(range(grid + 1), key=lambda i: overhead(xmax * i / grid, v, lp, c0, G))
    return xmax * best / grid


def simulate_grind(T, k, q, trials=2000, seed=0):
    """Real SHA-256 grinding: each try picks a random k-subset S of steps to corrupt, hashes
    (S, nonce) to a commitment, derives q distinct challenge steps from the digest, and stops
    when the challenge misses S. Returns (mean tries, first-try success rate)."""
    rng = random.Random(seed)
    tot, first = 0, 0
    for t in range(trials):
        tries = 0
        while True:
            tries += 1
            S = tuple(sorted(rng.sample(range(T), k)))
            digest = hashlib.sha256(repr((t, tries, S)).encode()).digest()
            ch = random.Random(int.from_bytes(digest, "big")).sample(range(T), q)
            if not set(S) & set(ch):
                break
        tot += tries
        first += tries == 1
    return tot / trials, first / trials
