"""k-ary bisection dispute game over a hash-chained training trace of T steps.
Each round the prover posts k-1 interior checkpoints; the challenger names the first segment whose endpoint it disputes.
Round cost = a + b(k-1) (a: fixed per-round tx/latency cost, b: per-checkpoint cost). When a segment has <= m steps the
referee re-executes it at cost c per step. Total cost = sum of round costs + c*m."""
import math, hashlib

def rounds(n, k):
    """rounds of uniform k-ary splitting to shrink n steps to a single step"""
    r = 0
    while n > 1:
        n = -(-n // k); r += 1
    return r

def rounds_to(n, k, m):
    r = 0
    while n > m:
        n = -(-n // k); r += 1
    return r

def uniform_cost(T, k, m, a, b, c):
    return rounds_to(T, k, m) * (a + b * (k - 1)) + c * min(m, T)

def k_star(a_over_b):
    """continuous minimiser of (a+b(k-1))/ln k: solves k ln k - k + 1 = a/b (k>=1). Bisection."""
    g = lambda k: k * math.log(k) - k + 1 - a_over_b
    lo, hi = 1.0, 2.0
    while g(hi) < 0: hi *= 2
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if g(mid) < 0 else (lo, mid)
    return (lo + hi) / 2

BINARY_THRESHOLD = 2 * math.log(2) - 1   # a/b below which k=2 is the continuous optimum

def dp_schedule(T, m, a, b, kmax=None):
    """optimal adaptive arity per round: C(n)=min_k a+b(k-1)+C(ceil(n/k)), C(n)=0 for n<=m. Returns (cost, [k1,k2,...])."""
    kmax = kmax or T
    memo = {}
    def C(n):
        if n <= m: return (0.0, ())
        if n in memo: return memo[n]
        best = (math.inf, ())
        seen = set()
        for k in range(2, min(kmax, n) + 1):
            nxt = -(-n // k)
            if nxt in seen and k > 2: continue     # larger k with same next size only costs more
            seen.add(nxt)
            sub = C(nxt)
            v = a + b * (k - 1) + sub[0]
            if v < best[0]: best = (v, (k,) + sub[1])
        memo[n] = best
        return best
    return C(T)

def best_uniform(T, m, a, b, c=0.0, kmax=64):
    return min((uniform_cost(T, k, m, a, b, c), k) for k in range(2, kmax + 1))

def best_leaf(T, a, b, c, adaptive=True):
    """minimise total cost over leaf size m (referee re-executes m steps)"""
    best = (math.inf, None)
    ms = sorted({1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 1024, 2048, 4096} | {T})
    for m in ms:
        if m > T: continue
        cost = (dp_schedule(T, m, a, b)[0] if adaptive else best_uniform(T, m, a, b)[0]) + c * m
        if cost < best[0]: best = (cost, m)
    return best

# ---------- executable protocol on a real hash chain ----------
def H(*xs):
    h = hashlib.sha256()
    for x in xs: h.update(str(x).encode() + b"|")
    return h.hexdigest()

def make_trace(T, corrupt_from=None):
    """states s_0..s_T, s_{t+1}=H(s_t, t). A prover corrupting step j has s_{t}' != s_t for all t>j."""
    s = [H("init")]
    for t in range(T):
        step = H(s[-1], t)
        if corrupt_from is not None and t == corrupt_from: step = H("bad", t)
        s.append(step)
    return s

def dispute(honest, cheat, k, m=1):
    """k-ary dispute. Returns (first_bad_step_segment (lo,hi), rounds, checkpoints_posted). Invariant: states agree at lo, differ at hi."""
    lo, hi = 0, len(honest) - 1
    assert honest[lo] == cheat[lo] and honest[hi] != cheat[hi]
    r = posted = 0
    while hi - lo > m:
        size = hi - lo
        pts = sorted({lo + (size * i) // k for i in range(1, k)} - {lo, hi})   # k-1 interior checkpoints posted by prover
        posted += len(pts); r += 1
        prev = lo
        for p in pts + [hi]:
            if honest[p] != cheat[p]:          # challenger disputes first mismatching checkpoint
                lo, hi = prev, p; break
            prev = p
    return (lo, hi), r, posted
