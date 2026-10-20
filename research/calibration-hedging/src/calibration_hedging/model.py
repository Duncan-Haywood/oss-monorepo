"""Calibration hedging on a grid of K+1 forecasts p_i = i/K.

A calibration slashing test asks that among rounds where a verifier forecast p_i the outcome frequency be near p_i.
Let S_i(t) = sum over rounds with forecast p_i of (y - p_i) and Phi = sum_i S_i^2.  Playing q, the expected change of
Phi is 2 sum_i q_i S_i (y - p_i) + E(y - p)^2 <= 2 v_t + 1, where v_t is the value of the 2x(K+1) matrix game
"forecaster picks i, nature picks y in {0,1}" with payoff S_i (y - p_i).  Nature's mixed strategy pi is answered by the
grid point nearest pi, which pays at most |S_i|/(2K), so v_t <= max_i |S_i| / (2K) <= sqrt(Phi)/(2K).  Solving
u_{t+1}^2 <= (u_t + 1/(2K))^2 + 1 for u_t = sqrt(E Phi_t) gives u_T <= T/(2K) + sqrt(T), hence against ANY outcome
sequence, adaptive or not, with no information at all,
    E[ECE] <= sqrt(K+1) * (1/(2K) + 1/sqrt(T)).
This is a crude worst case (Cauchy-Schwarz over bins); measured ECE is several times smaller.
"""
import math, random

__all__ = ["mix", "hedge_step", "ece", "brier", "run", "adaptive_adversary", "informed_brier", "min_rounds",
           "game_value", "ece_bound"]


def game_value(S, K, q):
    """max over y in {0,1} of sum_i q_i S_i (y - p_i)."""
    return max(sum(w * S[i] * (y - i / K) for i, w in q.items()) for y in (0, 1))


def mix(S, K):
    """Minimax distribution over grid indices 0..K for the matrix game with payoff S_i (y - p_i); support size <= 2."""
    h0 = [-S[i] * i / K for i in range(K + 1)]
    h1 = [S[i] * (1 - i / K) for i in range(K + 1)]
    best, arg = None, None
    for i in range(K + 1):
        v = max(h0[i], h1[i])
        if best is None or v < best - 1e-15:
            best, arg = v, {i: 1.0}
    for i in range(K + 1):
        for j in range(i + 1, K + 1):
            if S[i] * S[j] > 0:
                continue
            lam = 0.5 if S[i] == S[j] else S[j] / (S[j] - S[i])   # equalises the two outcomes' payoffs
            if not 0 <= lam <= 1:
                continue
            v = lam * h0[i] + (1 - lam) * h0[j]
            if v < best - 1e-15:
                best, arg = v, {i: lam, j: 1 - lam}
    return arg


def hedge_step(S, K, rng):
    """Draw a grid index from the hedger's mixture; returns (index, mixture)."""
    q = mix(S, K)
    u, acc = rng.random(), 0.0
    for i, w in q.items():
        acc += w
        if u < acc:
            return i, q
    return list(q)[-1], q


def ece(counts, sums, K, T):
    """Calibration error sum_i (n_i/T)|ybar_i - p_i| = sum_i |S_i|/T with S_i = sum(y) - p_i n_i."""
    return sum(abs(sums[i] - counts[i] * i / K) for i in range(K + 1)) / T


def brier(ps, ys):
    return sum((p - y) ** 2 for p, y in zip(ps, ys)) / len(ys)


def adaptive_adversary(q, K):
    """Sees the forecast distribution (not the draw); sets y=1 iff the expected forecast is below 1/2."""
    mean = sum(w * i / K for i, w in q.items())
    return 1 if mean < 0.5 else 0


def run(T, K, adversary, seed=0):
    """Play T rounds; adversary(q, K, t, rng) -> y in {0,1}.  Returns (ECE, Brier, forecasts, outcomes, sum S^2)."""
    rng = random.Random(seed)
    S = [0.0] * (K + 1)
    counts, sums = [0] * (K + 1), [0.0] * (K + 1)
    ps, ys = [], []
    for t in range(T):
        i, q = hedge_step(S, K, rng)
        y = adversary(q, K, t, rng)
        S[i] += y - i / K
        counts[i] += 1
        sums[i] += y
        ps.append(i / K)
        ys.append(y)
    return ece(counts, sums, K, T), brier(ps, ys), ps, ys, sum(s * s for s in S)


def informed_brier(ys):
    """A verifier who knows the adversary's rule forecasts y exactly: Brier 0.  Base-rate forecaster's Brier:"""
    m = sum(ys) / len(ys)
    return m * (1 - m)


def ece_bound(K, T):
    """Worst-case expected calibration error of the hedger (see module docstring)."""
    return math.sqrt(K + 1) * (1 / (2 * K) + 1 / math.sqrt(T))


def min_rounds(K, eps):
    """Rounds after which ece_bound(K, T) <= eps, or None if eps <= sqrt(K+1)/(2K) (grid too coarse)."""
    floor = math.sqrt(K + 1) / (2 * K)
    if eps <= floor:
        return None
    return math.ceil((K + 1) / (eps - floor) ** 2)
