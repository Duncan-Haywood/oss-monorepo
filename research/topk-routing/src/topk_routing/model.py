"""Top-k routing as a capped-simplex Hedge market (stdlib only).

Each round a router must choose k distinct experts out of N (mixture-of-experts
top-k gating).  Fractional plays live in K = {p in [0,1]^N : sum p = k}.  The
market price of expert i is p_i = min(1, lam * w_i) with w_i = exp(-eta L_i)
and a shadow price lam that makes the prices sum to k.
"""
import math, random

__all__ = ["cap_project", "gen_kl", "hedge_topk", "best_k_loss", "regret_bound",
           "tuned_eta", "systematic_sample", "poisson_var", "systematic_var_sim",
           "bernoulli_stream", "leader_chasing_stream", "switching_stream"]


def cap_project(w, k):
    """Exact KL projection of positive weights w onto {p<=1, sum p = k}.
    Returns (p, lam, m) with p_i = min(1, lam*w_i) and m saturated experts."""
    n = len(w)
    if not 0 < k <= n:
        raise ValueError("need 0 < k <= n")
    if k == n:
        return [1.0] * n, float("inf"), n
    order = sorted(range(n), key=lambda i: -w[i])
    s = sorted(w, reverse=True)
    suf = [0.0] * (n + 1)          # suffix sums, no cancellation
    for i in range(n - 1, -1, -1):
        suf[i] = suf[i + 1] + s[i]
    for m in range(k):
        lam = (k - m) / suf[m]
        if lam * s[m] <= 1.0 + 1e-12 and (m == 0 or lam * s[m - 1] >= 1.0 - 1e-12):
            break
    p = [min(1.0, lam * x) for x in w]
    return p, lam, m


def gen_kl(q, w):
    """Generalised KL(q||w) = sum q ln(q/w) - q + w (q ln q = 0 at q = 0)."""
    return sum((a * math.log(a / b) if a > 0 else 0.0) - a + b for a, b in zip(q, w))


def hedge_topk(losses, k, eta, cap=True):
    """Lazy (FTRL) capped Hedge.  Returns (expected losses per round, cum loss
    vector, per-round (lam, saturated count)).  cap=False replaces the projection
    by plain normalisation to sum k (may exceed 1: not a valid k-subset play)."""
    n = len(losses[0])
    L = [0.0] * n
    plays = []
    tot = 0.0
    for l in losses:
        lo = min(L)
        w = [math.exp(-eta * (x - lo)) for x in L]
        if cap:
            p, lam, m = cap_project(w, k)
        else:
            z = sum(w); p = [k * x / z for x in w]; lam = k / z; m = sum(x > 1 for x in p)
        tot += sum(a * b for a, b in zip(p, l))
        plays.append((lam, m))
        L = [a + b for a, b in zip(L, l)]
    return tot, L, plays


def best_k_loss(L, k):
    return sum(sorted(L)[:k])


def tuned_eta(n, k, T):
    return math.sqrt(2.0 * math.log(n / k) / T)


def regret_bound(n, k, T, eta):
    return k * math.log(n / k) / eta + eta * T * k / 2.0


def systematic_sample(p, rng):
    """Madow systematic sampling: exactly round(sum p) distinct indices with
    inclusion probabilities exactly p_i (p_i <= 1)."""
    u = rng.random()
    out, c = [], 0.0
    for i, x in enumerate(p):
        lo, hi = c, c + x
        # count integers-plus-u in [lo, hi)
        a = math.ceil(lo - u); b = math.ceil(hi - u)
        if b > a:
            out.append(i)
        c = hi
    return out


def poisson_var(p, l):
    """Variance of sum_i B_i l_i with independent B_i ~ Bernoulli(p_i)."""
    return sum(a * (1 - a) * b * b for a, b in zip(p, l))


def systematic_var_sim(p, l, trials, rng):
    m = m2 = 0.0
    for _ in range(trials):
        s = sum(l[i] for i in systematic_sample(p, rng))
        m += s; m2 += s * s
    m /= trials
    return m2 / trials - m * m


def bernoulli_stream(means, T, rng):
    return [[1.0 if rng.random() < m else 0.0 for m in means] for _ in range(T)]


def leader_chasing_stream(n, k, T, rng):
    """Adversary that gives loss 1 to the k currently smallest-cumulative-loss
    experts (the ones a follow-the-leader router would choose) and 0 to the rest,
    breaking ties at random."""
    L = [0.0] * n
    out = []
    for _ in range(T):
        order = sorted(range(n), key=lambda i: (L[i], rng.random()))
        hit = set(order[:k])
        l = [1.0 if i in hit else 0.0 for i in range(n)]
        out.append(l); L = [a + b for a, b in zip(L, l)]
    return out


def switching_stream(n, k, T, period, rng):
    """Experts in a random good block of size k have mean loss .2, others .6;
    the block is redrawn every `period` rounds."""
    out = []
    for t in range(T):
        if t % period == 0:
            good = set(rng.sample(range(n), k))
        out.append([1.0 if rng.random() < (0.2 if i in good else 0.6) else 0.0 for i in range(n)])
    return out
