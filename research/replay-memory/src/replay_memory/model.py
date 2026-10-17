"""Partial replay: only m of the tracked task's r examples are stored (companion to replay-law and forgetting-law).
Setting as in replay-law: realizable regression in R^d, training to convergence on a task projects the error e onto its
null space; the tracked task has row space U (rank r), state (a, b) = (|P_U e|^2, |(I-P_U) e|^2) in expectation.
A partial replay trains jointly on a fresh Haar rank-r task P and on V, an m-dim subspace of U (m stored examples).
V + span(P) = V (+) (I-P_V) span(P), and (I-P_V) span(P) is a uniform r-subspace of V-perp (dimension D = d-m), so the
step is: project out V, then take a plain forgetting-law step of rank r in dimension D (everything is zeroed if r >= D).
Averaging over V (uniform in U, equivalent to a fixed V by invariance) gives an exact 2x2 matrix on (a, b):
    a' = lam' (1-m/r) a + c2' (r-m) [ (1-m/r) a + b ]
    b' = lam' b       + c2' (d-r) [ (1-m/r) a + b ],        (lam', c2') = (lam, c2) of forgetting-law at (D, r).
m=0 is the plain step (matrix M of replay-law), m=r is the full replay R; all schedules are matrix products."""
import math
import random

from forgetting_law import c2, lam, haar_projector
from forgetting_law.model import _proj, _unit

__all__ = ["plain", "partial", "full", "start", "curve", "total_none", "total_bernoulli", "total_periodic",
           "total_one_shot", "best_one_shot", "budget_rate", "best_split", "peak", "one_shot_benefit",
           "simulate_curve", "simulate_bernoulli_total"]


def partial(d, r, m):
    """2x2 mean-state matrix of a step that also replays m of the tracked task's r stored examples."""
    D = d - m
    if r >= D:
        return [[0.0, 0.0], [0.0, 0.0]]
    l, c = lam(D, r), c2(D, r)
    k = 1 - m / r
    return [[l * k + c * (r - m) * k, c * (r - m)], [c * (d - r) * k, l + c * (d - r)]]


def plain(d, r):
    return partial(d, r, 0)


def full(d, r):
    return partial(d, r, r)


def start(d, r):
    return [0.0, 1 - r / d]


def _mm(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(2)) for j in range(2)] for i in range(2)]


def _mv(A, v):
    return [A[0][0] * v[0] + A[0][1] * v[1], A[1][0] * v[0] + A[1][1] * v[1]]


def _pow(A, n):
    out = [[1.0, 0.0], [0.0, 1.0]]
    for _ in range(n):
        out = _mm(out, A)
    return out


def _inv_IminusA(A):
    a, b, c, d = 1 - A[0][0], -A[0][1], -A[1][0], 1 - A[1][1]
    det = a * d - b * c
    return [[d / det, -b / det], [-c / det, a / det]]


def curve(d, r, m_at, T):
    """Expected loss after each of steps 1..T; m_at(t) = number of stored examples replayed at step t (0 = none)."""
    s, out = start(d, r), []
    for t in range(1, T + 1):
        s = _mv(partial(d, r, m_at(t)), s)
        out.append(s[0])
    return out


def total_none(d, r):
    return _mv(_inv_IminusA(plain(d, r)), start(d, r))[0]


def total_bernoulli(d, r, q, m):
    """Each step replays m stored examples with probability q (mean matrix (1-q)M + q R_m)."""
    M, R = plain(d, r), partial(d, r, m)
    A = [[(1 - q) * M[i][j] + q * R[i][j] for j in range(2)] for i in range(2)]
    return _mv(_inv_IminusA(A), start(d, r))[0]


def total_periodic(d, r, n, m):
    """Replay m examples on steps n, 2n, ...: cycle matrix C = R_m M^(n-1); a cycle sums M^1..M^(n-1) and C."""
    M, R = plain(d, r), partial(d, r, m)
    C = _mm(R, _pow(M, n - 1))
    S = [[0.0, 0.0], [0.0, 0.0]]
    Mj = [[1.0, 0.0], [0.0, 1.0]]
    for _ in range(n - 1):
        Mj = _mm(Mj, M)
        S = [[S[i][j] + Mj[i][j] for j in range(2)] for i in range(2)]
    S = [[S[i][j] + C[i][j] for j in range(2)] for i in range(2)]  # a partial replay leaves loss on the tracked task
    return _mv(_mm(S, _inv_IminusA(C)), start(d, r))[0]


def total_one_shot(d, r, t, m):
    """A single partial replay at step t."""
    M, R = plain(d, r), partial(d, r, m)
    s, pre = start(d, r), 0.0
    for _ in range(t - 1):
        s = _mv(M, s)
        pre += s[0]
    s = _mv(R, s)
    return pre + _mv(_inv_IminusA(M), s)[0]


def best_one_shot(d, r, m, tmax=400):
    t = min(range(1, tmax + 1), key=lambda u: total_one_shot(d, r, u, m))
    return t, total_one_shot(d, r, t, m)


def one_shot_benefit(d, r, m, tmax=400):
    """Fraction of the full-memory best one-shot saving achieved with m stored examples (best step for each)."""
    z = total_none(d, r)
    return (z - best_one_shot(d, r, m, tmax)[1]) / (z - best_one_shot(d, r, r, tmax)[1])


def peak(d, r, m_at, T):
    c = curve(d, r, m_at, T)
    x = max(c)
    return c.index(x) + 1, x


def budget_rate(d, r, m, c):
    """Bernoulli rate that spends c stored examples per step on average when each replay uses m (capped at 1)."""
    return min(1.0, c / m)


def best_split(d, r, c):
    """Replay size m in 1..r minimising the Bernoulli total at a per-step budget of c examples (rate c/m); returns
    (m*, total, {m: total})."""
    tot = {m: total_bernoulli(d, r, budget_rate(d, r, m, c), m) for m in range(1, r + 1) if c / m <= 1.0}
    m = min(tot, key=tot.get)
    return m, tot[m], tot


def _orth_extend(B, V):
    B = [list(u) for u in B]
    for v in V:
        v = list(v)
        for _ in range(2):
            for u in B:
                p = sum(a * b for a, b in zip(u, v))
                v = [a - p * b for a, b in zip(v, u)]
        n = math.sqrt(sum(a * a for a in v))
        if n > 1e-9:
            B.append([a / n for a in v])
    return B


def _run(d, r, ms, T, rng):
    e = _unit(d, rng)
    U1 = haar_projector(d, r, rng)
    e = [a - b for a, b in zip(e, _proj(U1, e))]
    out = []
    for t in range(1, T + 1):
        U = haar_projector(d, r, rng)
        m = ms(t, rng)
        B = _orth_extend(U1[:m], U) if m > 0 else U
        e = [a - b for a, b in zip(e, _proj(B, e))]
        out.append(sum(x * x for x in _proj(U1, e)))
    return out


def simulate_curve(d, r, ms, T, runs, rng):
    """Mean loss curve; ms(t, rng) -> number of stored examples replayed at step t (first m vectors of a Haar basis of
    U span a uniform m-subspace of U)."""
    acc = [0.0] * T
    for _ in range(runs):
        for i, x in enumerate(_run(d, r, ms, T, rng)):
            acc[i] += x
    return [a / runs for a in acc]


def simulate_bernoulli_total(d, r, q, m, T, runs, rng):
    return sum(simulate_curve(d, r, lambda t, g: m if g.random() < q else 0, T, runs, rng))
