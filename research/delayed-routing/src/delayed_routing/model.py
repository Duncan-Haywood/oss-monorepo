"""Hedge / LMSR routing when expert feedback arrives late (heterogeneous device latency).

Feedback for round t (a loss vector in [0,1]^N) becomes usable at decision time t + 1 + delays[t].
Outstanding count d_t = #{s < t : feedback of s not yet usable at t}; D = sum_t d_t.
"""
import math, random

__all__ = ["play", "outstanding", "bound", "eta_opt", "eta_oracle", "eta_adaptive", "bernoulli_losses",
           "switching_losses", "punish_leader", "geometric_delays", "mixed_delays", "run_stats", "lmsr_liquidity"]


def outstanding(delays):
    """d_t for every decision time t: rounds s<t whose feedback is not yet usable at t."""
    T = len(delays); diff = [0] * (T + 2)
    for s, d in enumerate(delays):
        lo, hi = s + 1, min(T - 1, s + d)          # decisions s+1..s+d see feedback s as missing
        if d > 0 and lo <= hi:
            diff[lo] += 1; diff[hi + 1] -= 1
    out, c = [], 0
    for t in range(T):
        c += diff[t]; out.append(c)
    return out


def bound(N, T, D, eta):
    """Regret <= ln N/eta + eta*T/8 + eta*D/2 for fixed eta (losses in [0,1]); D = sum of outstanding counts."""
    return math.log(N) / eta + eta * T / 8 + eta * D / 2


def eta_opt(N, T, D):
    return math.sqrt(math.log(N) / (T / 8 + D / 2))


def eta_oracle(N, T):
    """Ignores delay: classical Hedge rate."""
    return math.sqrt(8 * math.log(N) / T)


def eta_adaptive(N):
    """Anytime rate from observable quantities only: eta_t = sqrt(ln N / (t/8 + (sum of outstanding so far)/2 + 1))."""
    def f(t, dsum):
        return math.sqrt(math.log(N) / (t / 8 + dsum / 2 + 1.0))
    return f


def play(losses, delays, eta, adversary=None):
    """Run delayed Hedge. `eta` is a float or a callable (t, dsum_so_far) -> rate.
    `adversary(p, t)` may generate the loss vector adaptively (delays still given upfront); else `losses` is used.
    Returns dict(regret, alg_loss, best_loss, D, T, N, losses)."""
    T = len(delays); N = len(losses[0]) if losses else 0
    if adversary is not None:
        N = len(adversary(None, -1))
    arrive = [[] for _ in range(T + 1)]
    L = [0.0] * N; alg = 0.0; cum = [0.0] * N; dsum = 0; out = outstanding(delays); used = []
    for t in range(T):
        for s in arrive[t]:
            for i in range(N): L[i] += used[s][i]
        e = eta(t, dsum) if callable(eta) else eta
        m = min(L); w = [math.exp(-e * (x - m)) for x in L]; z = sum(w); p = [x / z for x in w]
        ell = adversary(p, t) if adversary is not None else losses[t]
        used.append(ell)
        alg += sum(pi * li for pi, li in zip(p, ell))
        for i in range(N): cum[i] += ell[i]
        dsum += out[t]
        a = t + 1 + delays[t]
        if a < T: arrive[a].append(t)
    best = min(cum)
    return dict(regret=alg - best, alg_loss=alg, best_loss=best, D=dsum, T=T, N=N, losses=used)


# ---- loss generators -------------------------------------------------------------------------------
def bernoulli_losses(T, N, gap, seed):
    r = random.Random(seed)
    return [[1.0 if r.random() < (0.5 - gap if i == 0 else 0.5) else 0.0 for i in range(N)] for _ in range(T)]


def switching_losses(T, N, block, seed):
    """Best expert changes each block: the current best has loss 0, everyone else loss 1 w.p. 0.9."""
    r = random.Random(seed); out = []; b = 0
    for t in range(T):
        if t % block == 0: b = r.randrange(N)
        out.append([0.0 if i == b else (1.0 if r.random() < 0.9 else 0.0) for i in range(N)])
    return out


def punish_leader(N=2):
    """Adaptive adversary: loss 1 on the expert the learner currently trusts most, 0 elsewhere."""
    def adv(p, t):
        if p is None: return [0.0] * N
        k = max(range(N), key=lambda i: p[i]); v = [0.0] * N; v[k] = 1.0
        return v
    return adv


# ---- delay generators ------------------------------------------------------------------------------
def geometric_delays(T, mean, seed):
    r = random.Random(seed)
    if mean <= 0: return [0] * T
    q = 1.0 / (1.0 + mean); out = []
    for _ in range(T):
        d = 0
        while r.random() > q: d += 1
        out.append(d)
    return out


def mixed_delays(T, frac_slow, slow, seed):
    """Heterogeneous fleet: a fraction of rounds are served by slow devices with delay `slow`, the rest are instant."""
    r = random.Random(seed)
    return [slow if r.random() < frac_slow else 0 for _ in range(T)]


def run_stats(vals):
    n = len(vals); m = sum(vals) / n
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / max(n - 1, 1))
    return m, sd / math.sqrt(n)


def lmsr_liquidity(eta):
    """LMSR with liquidity b = 1/eta is Hedge with rate eta; worst-case market-maker loss is b ln N."""
    return 1.0 / eta
