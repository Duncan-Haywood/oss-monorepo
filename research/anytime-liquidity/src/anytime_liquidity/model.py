"""LMSR with time-varying liquidity b_t == Hedge with rate eta_t = 1/b_t. Stdlib only.

Round t: prices w_i ∝ exp(-L_i(t-1)/b_t) over N outcomes/experts, losses in [0,1].
The market maker's implied subsidy is b_T ln N; regret of the routed mixture is bounded by
b_T ln N + sum_t 1/(8 b_t).
"""
import math, random

__all__ = ["softmax_w", "run", "bound", "b_fixed", "b_sqrt", "c_star", "bound_fixed_opt",
           "bound_anytime_opt", "anytime_ratio", "run_doubling", "run_adahedge", "sqrt_sum_gap",
           "adversary_losses", "iid_losses"]


def softmax_w(L, b):
    m = min(L)
    e = [math.exp(-(x - m) / b) for x in L]
    s = sum(e)
    return [x / s for x in e]


def b_fixed(T, N):
    """Horizon-aware liquidity minimising the bound: b = sqrt(T/(8 ln N))."""
    return math.sqrt(T / (8 * math.log(N)))


def c_star(N):
    return 1 / (2 * math.sqrt(math.log(N)))


def b_sqrt(t, N, c=None):
    """Anytime liquidity b_t = c sqrt(t)."""
    return (c if c is not None else c_star(N)) * math.sqrt(t)


def bound(bs, N):
    """b_T ln N + sum 1/(8 b_t) for a nondecreasing liquidity schedule bs[0..T-1]."""
    return bs[-1] * math.log(N) + sum(1 / (8 * b) for b in bs)


def bound_fixed_opt(T, N):
    return math.sqrt(T * math.log(N) / 2)


def bound_anytime_opt(T, N):
    """Bound at b_t = c* sqrt(t): exact sum (not the integral bound sqrt(T lnN))."""
    return bound([b_sqrt(t, N) for t in range(1, T + 1)], N)


def anytime_ratio():
    """Limiting price of not knowing T: sqrt(2)."""
    return math.sqrt(2)


def run(losses, bfun):
    """Play the market; bfun(t) gives b_t (t from 1). Returns (regret, learner loss, best loss)."""
    N = len(losses[0])
    L = [0.0] * N
    tot = 0.0
    for t, l in enumerate(losses, 1):
        w = softmax_w(L, bfun(t))
        tot += sum(wi * li for wi, li in zip(w, l))
        for i in range(N):
            L[i] += l[i]
    return tot - min(L), tot, min(L)


def run_doubling(losses):
    """Restart at t=2^k with the horizon-aware b for horizon 2^k; keeps per-epoch regret bound."""
    N = len(losses[0])
    T = len(losses)
    tot_regret, s, k = 0.0, 0, 0
    while s < T:
        n = 2 ** k
        seg = losses[s:s + n]
        b = b_fixed(n, N)
        r, _, _ = run(seg, lambda t: b)
        tot_regret += r  # sum of per-epoch regrets upper-bounds the regret of the concatenation
        s += n
        k += 1
    return tot_regret


def sqrt_sum_gap():
    """doubling trick constant: sum_k sqrt(2^k) <= sqrt(2)/(sqrt(2)-1) sqrt(T)."""
    return math.sqrt(2) / (math.sqrt(2) - 1)


def run_adahedge(losses):
    """AdaHedge / self-tuning liquidity: b_t = Delta_{t-1}/ln N, Delta = cumulative mixability
    gap sum_s (h_s - m_s). Returns (regret, Delta_T, final b, list of b_t)."""
    N = len(losses[0])
    lnN = math.log(N)
    L = [0.0] * N
    tot, Delta, bs = 0.0, 0.0, []
    for l in losses:
        b = max(Delta / lnN, 1e-9) if Delta > 0 else 1e-9
        bs.append(b)
        w = softmax_w(L, b)
        h = sum(wi * li for wi, li in zip(w, l))
        if Delta > 0:
            m = -b * math.log(sum(wi * math.exp(-li / b) for wi, li in zip(w, l)))
        else:
            m = min(l)  # eta -> inf: mix loss is the minimum loss
        Delta += max(0.0, h - m)
        tot += h
        for i in range(N):
            L[i] += l[i]
    return tot - min(L), Delta, bs[-1], bs


def iid_losses(T, N, gap, seed=0):
    """Expert 0 has Bernoulli(1/2-gap/2) loss, others Bernoulli(1/2+gap/2)."""
    r = random.Random(seed)
    return [[float(r.random() < 0.5 - gap / 2)] + [float(r.random() < 0.5 + gap / 2) for _ in range(N - 1)]
            for _ in range(T)]


def adversary_losses(T, N, b_of_t, seed=0):
    """Adaptive adversary that always puts loss 1 on the currently heaviest-weighted
    half of experts (best-response to the market's prices), loss 0 on the rest."""
    L = [0.0] * N
    out = []
    for t in range(1, T + 1):
        w = softmax_w(L, b_of_t(t))
        order = sorted(range(N), key=lambda i: -w[i])
        heavy = set(order[: N // 2])
        l = [1.0 if i in heavy else 0.0 for i in range(N)]
        out.append(l)
        for i in range(N):
            L[i] += l[i]
    return out
