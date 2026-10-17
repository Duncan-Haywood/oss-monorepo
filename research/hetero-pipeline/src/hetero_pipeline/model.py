"""Bottleneck partition of a layer chain across heterogeneous devices.

L layers with compute costs w_i (and memory m_i) are cut into contiguous stages, one per device j with speed v_j and
memory cap M_j.  Stage time is (sum of w in block)/v_j; pipeline throughput is set by the slowest stage, so we minimise
the bottleneck T.  Facts used and checked here:
  * for a FIXED device order, greedy filling is an exact feasibility test for any T (both the time and the memory
    constraint are monotone in the block), so T* is the least feasible T; it is one of the block-sum/speed values, found
    by bisection to machine precision or exactly by candidate search;
  * lower bounds T* >= W/V and T* >= w_max/v_max;
  * upper bound for every order (no memory cap): T* < W/V + w_max*m/V  (each device but possibly the last is filled to
    within w_max of its budget);
  * a speed-blind equal split has bottleneck exactly (W/m)/v_min in the continuous limit, i.e. v_mean/v_min times the
    lower bound.
"""
import itertools, math, random

__all__ = ["feasible", "bottleneck", "best_order_bruteforce", "order_heuristic", "equal_split_time", "lower_bound",
           "upper_bound", "cuts", "random_instance", "local_search_order"]


def feasible(w, v, T, mem=None, cap=None):
    """Greedy fill in the given device order; True iff every layer fits within time T (and memory caps)."""
    i, L = 0, len(w)
    for j, vj in enumerate(v):
        budget, used = T * vj * (1 + 1e-12), 0.0
        m_used = 0.0
        while i < L and used + w[i] <= budget and (mem is None or m_used + mem[i] <= cap[j] + 1e-12):
            used += w[i]
            m_used += mem[i] if mem is not None else 0.0
            i += 1
        if i == L:
            return True
    return i == L


def bottleneck(w, v, mem=None, cap=None, iters=80):
    """Least T for the device order v.  Exact up to bisection tolerance; inf if memory makes it infeasible."""
    hi = sum(w) / min(v) + 1.0
    if not feasible(w, v, hi, mem, cap):
        return math.inf
    lo = 0.0
    for _ in range(iters):
        mid = (lo + hi) / 2
        if feasible(w, v, mid, mem, cap):
            hi = mid
        else:
            lo = mid
    return hi


def cuts(w, v, T, mem=None, cap=None):
    """Block sizes (per device, possibly zero) produced by the greedy at time T."""
    i, out = 0, []
    for j, vj in enumerate(v):
        n, used, m_used = 0, 0.0, 0.0
        while i < len(w) and used + w[i] <= T * vj * (1 + 1e-12) and (mem is None or m_used + mem[i] <= cap[j] + 1e-12):
            used += w[i]
            m_used += mem[i] if mem is not None else 0.0
            i += 1
            n += 1
        out.append(n)
    return out


def _perm_bottleneck(w, v, perm, mem, cap):
    return bottleneck(w, [v[k] for k in perm], mem, [cap[k] for k in perm] if cap else None)


def best_order_bruteforce(w, v, mem=None, cap=None):
    best = (math.inf, None)
    for perm in itertools.permutations(range(len(v))):
        t = _perm_bottleneck(w, v, perm, mem, cap)
        if t < best[0]:
            best = (t, perm)
    return best


def order_heuristic(w, v, kind, mem=None, cap=None):
    """kind: 'given', 'desc' (fast first), 'asc' (slow first), 'valley' (fast at both ends, slow in the middle)."""
    idx = list(range(len(v)))
    if kind == "desc":
        idx.sort(key=lambda k: -v[k])
    elif kind == "asc":
        idx.sort(key=lambda k: v[k])
    elif kind == "valley":
        s = sorted(idx, key=lambda k: -v[k])
        idx = s[0::2] + s[1::2][::-1]
    return _perm_bottleneck(w, v, idx, mem, cap), tuple(idx)


def local_search_order(w, v, mem=None, cap=None, rng=None, restarts=5):
    """Pairwise-swap descent from random starts."""
    rng = rng or random.Random(0)
    best = (math.inf, None)
    for _ in range(restarts):
        p = list(range(len(v)))
        rng.shuffle(p)
        cur = _perm_bottleneck(w, v, p, mem, cap)
        improved = True
        while improved:
            improved = False
            for a in range(len(p)):
                for b in range(a + 1, len(p)):
                    p[a], p[b] = p[b], p[a]
                    t = _perm_bottleneck(w, v, p, mem, cap)
                    if t < cur - 1e-12:
                        cur, improved = t, True
                    else:
                        p[a], p[b] = p[b], p[a]
        if cur < best[0]:
            best = (cur, tuple(p))
    return best


def equal_split_time(w, v):
    """Speed-blind split into contiguous blocks of near-equal layer count, in the given order; returns bottleneck."""
    L, m = len(w), len(v)
    t, i = 0.0, 0
    for j in range(m):
        n = L // m + (1 if j < L % m else 0)
        t = max(t, sum(w[i:i + n]) / v[j])
        i += n
    return t


def lower_bound(w, v):
    return max(sum(w) / sum(v), max(w) / max(v))


def upper_bound(w, v):
    return sum(w) / sum(v) + max(w) * len(v) / sum(v)


def random_instance(rng, L, m, sigma_w=0.0, sigma_v=0.5):
    w = [math.exp(rng.gauss(0, sigma_w)) for _ in range(L)]
    v = [math.exp(rng.gauss(0, sigma_v)) for _ in range(m)]
    return w, v
