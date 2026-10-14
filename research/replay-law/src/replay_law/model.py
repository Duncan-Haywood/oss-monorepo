"""Replaying one task while a stream of random rank-r tasks is learned (companion to forgetting-law).
Setting: realizable regression in R^d, training to convergence on a task projects the error e onto its null space.
Track one task with row space U (rank r). Let a = |P_U e|^2 (its loss) and b = |(I-P_U) e|^2.
A plain step on a fresh Haar task P:  E[e'e'^T] = lam ee^T + c2 |e|^2 I  (forgetting-law), so on the state (a, b)
    a' = (lam + c2 r) a + c2 r b,      b' = c2 (d-r) a + (lam + c2 (d-r)) b          (matrix M)
A replay step trains jointly on the fresh task and the tracked task, i.e. projects onto U + span(P).  That kills a and,
because span(P) seen from the complement of U is a uniform r-subspace of a (d-r)-dim space, shrinks b by 1 - r/(d-r)
(to 0 once 2r >= d):   a' = 0, b' = kappa b, kappa = max(0, 1-r/(d-r))              (matrix R)
Both maps are linear in the state, so the *expected* loss curve under any schedule (fixed, random or one-shot) is an exact
product of 2x2 matrices, starting from s0 = (0, 1-r/d) just after the task is learned from a unit isotropic error."""
import math
import random

from forgetting_law import c2, lam, haar_projector
from forgetting_law.model import _proj, _unit

__all__ = ["plain", "replay", "start", "curve", "total_none", "total_bernoulli", "total_periodic", "total_one_shot",
           "best_one_shot", "peak", "replay_rate_for", "simulate_curve", "simulate_bernoulli_total"]


def plain(d, r):
    l, c = lam(d, r), c2(d, r)
    return [[l + c * r, c * r], [c * (d - r), l + c * (d - r)]]


def replay(d, r):
    return [[0.0, 0.0], [0.0, max(0.0, 1 - r / (d - r)) if 2 * r < d else 0.0]]


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


def curve(d, r, is_replay, T):
    """Expected loss of the tracked task after each of steps 1..T; is_replay(t) says whether step t also replays it."""
    M, R = plain(d, r), replay(d, r)
    s, out = start(d, r), []
    for t in range(1, T + 1):
        s = _mv(R if is_replay(t) else M, s)
        out.append(s[0])
    return out


def total_none(d, r):
    """Sum over all lags of the expected loss with no replay; equals forgetting-law's total_forget."""
    return _mv(_inv_IminusA(plain(d, r)), start(d, r))[0]


def total_bernoulli(d, r, q):
    """Each step replays the task independently with probability q: the mean state obeys A = (1-q)M + qR."""
    M, R = plain(d, r), replay(d, r)
    A = [[(1 - q) * M[i][j] + q * R[i][j] for j in range(2)] for i in range(2)]
    return _mv(_inv_IminusA(A), start(d, r))[0]


def total_periodic(d, r, n):
    """Replay on steps n, 2n, ...: a cycle is n-1 plain steps then a replay step, C = R M^(n-1)."""
    M, R = plain(d, r), replay(d, r)
    C = _mm(R, _pow(M, n - 1))
    S = [[0.0, 0.0], [0.0, 0.0]]
    Mj = [[1.0, 0.0], [0.0, 1.0]]
    for _ in range(n - 1):
        Mj = _mm(Mj, M)
        S = [[S[i][j] + Mj[i][j] for j in range(2)] for i in range(2)]
    return _mv(_mm(S, _inv_IminusA(C)), start(d, r))[0]


def total_one_shot(d, r, t):
    """A single replay at step t (t >= 1), none afterwards: prefix of the no-replay curve + the tail from the restart."""
    M, R = plain(d, r), replay(d, r)
    s, pre = start(d, r), 0.0
    for _ in range(t - 1):
        s = _mv(M, s)
        pre += s[0]
    s = _mv(R, s)
    return pre + _mv(_inv_IminusA(M), s)[0]


def best_one_shot(d, r, tmax=400):
    """(t*, total ratio to no replay) minimising total_one_shot over 1..tmax."""
    t = min(range(1, tmax + 1), key=lambda u: total_one_shot(d, r, u))
    return t, total_one_shot(d, r, t) / total_none(d, r)


def peak(d, r, is_replay, T):
    c = curve(d, r, is_replay, T)
    m = max(c)
    return c.index(m) + 1, m


def replay_rate_for(d, r, frac):
    """Smallest Bernoulli replay rate q (bisection) with total_bernoulli <= frac * total_none."""
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if total_bernoulli(d, r, mid) <= frac * total_none(d, r):
            hi = mid
        else:
            lo = mid
    return hi


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


def _run(d, r, replays, T, rng):
    e = _unit(d, rng)
    U1 = haar_projector(d, r, rng)
    e = [a - b for a, b in zip(e, _proj(U1, e))]
    out = []
    for t in range(1, T + 1):
        U = haar_projector(d, r, rng)
        B = _orth_extend(U1, U) if replays(t, rng) else U
        e = [a - b for a, b in zip(e, _proj(B, e))]
        out.append(sum(x * x for x in _proj(U1, e)))
    return out


def simulate_curve(d, r, replays, T, runs, rng):
    """Mean loss curve of the tracked task; replays(t, rng) -> bool (may be random)."""
    acc = [0.0] * T
    for _ in range(runs):
        for i, x in enumerate(_run(d, r, replays, T, rng)):
            acc[i] += x
    return [a / runs for a in acc]


def simulate_bernoulli_total(d, r, q, T, runs, rng):
    """Mean over runs of the summed loss over T steps under Bernoulli(q) replay (truncated total)."""
    return sum(simulate_curve(d, r, lambda t, g: g.random() < q, T, runs, rng))
