"""Partial replay: only m of the tracked task's r examples are stored (companion to replay-law and forgetting-law).
Setting as in replay-law: realizable regression in R^d, training to convergence on a task projects the error e onto its
null space; the tracked task has row space U (rank r). A partial replay trains jointly on a fresh Haar rank-r task P and
on V, an m-dim subspace of U (m stored examples). V + span(P) = V (+) (I-P_V) span(P), and (I-P_V) span(P) is a uniform
r-subspace of V-perp (dimension D = d-m), so the step is: project out V, then take a plain forgetting-law step of rank r
in dimension D (everything is zeroed if r >= D).

Fixed buffer (the default, and what a learner with a stored buffer does): V is drawn once and kept. The expected state
is then exactly the 3-vector (v, u, o) = E(|P_V e|^2, |P_{U-V} e|^2, |(I-P_U) e|^2), dimensions (m, r-m, d-r), since a
Haar step keeps E[e e^T] invariant under rotations that fix V and U. A plain step maps x_i -> lam x_i + c2 dim_i (v+u+o);
a replay zeroes v and maps u, o the same way with (lam', c2') = (lam, c2) at (D, r) over u+o. Loss on the task is v+u.

Fresh subset (fresh=True): each replay uses a newly drawn uniform m-subset of the task's examples (the whole task is
available but only m are replayed). Averaging over V each time gives an exact 2x2 matrix on (a, b) = (v+u, o):
    a' = lam' (1-m/r) a + c2' (r-m) [ (1-m/r) a + b ]
    b' = lam' b       + c2' (d-r) [ (1-m/r) a + b ].
Versions before 2026-11-14 applied this 2x2 matrix to a fixed buffer, which it does not describe after the second
replay (quality audit 2026-11-08: 0.0061 vs 0.0071 simulated at d=12 r=4 m=2 step 6; the fixed-buffer law gives 0.0070).
One-shot results are the same either way. m=0 is the plain step (replay-law's M), m=r is the full replay R."""
import math
import random

from forgetting_law import c2, lam, haar_projector
from forgetting_law.model import _proj, _unit

__all__ = ["plain", "partial", "full", "buffer_plain", "buffer_replay", "start", "curve", "total_none",
           "total_bernoulli", "total_periodic", "total_one_shot", "best_one_shot", "budget_rate", "best_split", "peak",
           "one_shot_benefit", "simulate_curve", "simulate_bernoulli_total"]


def partial(d, r, m):
    """2x2 mean-state matrix on (a, b) of a step that replays a freshly drawn m-subset of the task's r examples."""
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


def buffer_plain(d, r, m):
    """3x3 matrix on (v, u, o) of a step without replay, for a fixed buffer of m stored examples."""
    l, c = lam(d, r), c2(d, r)
    dims = (m, r - m, d - r)
    return [[(l if i == j else 0.0) + c * dims[i] for j in range(3)] for i in range(3)]


def buffer_replay(d, r, m):
    """3x3 matrix on (v, u, o) of a step that replays the fixed buffer of m stored examples."""
    D = d - m
    if r >= D:
        return [[0.0] * 3 for _ in range(3)]
    l, c = lam(D, r), c2(D, r)
    dims = (m, r - m, d - r)
    return [[0.0] * 3] + [[0.0] + [(l if i == j else 0.0) + c * dims[i] for j in (1, 2)] for i in (1, 2)]


def start(d, r, fresh=False):
    return [0.0, 1 - r / d] if fresh else [0.0, 0.0, 1 - r / d]


def _mm(A, B):
    n = len(A)
    return [[sum(A[i][k] * B[k][j] for k in range(n)) for j in range(n)] for i in range(n)]


def _mv(A, v):
    return [sum(a * x for a, x in zip(row, v)) for row in A]


def _eye(n):
    return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]


def _add(A, B, a=1.0, b=1.0):
    return [[a * x + b * y for x, y in zip(ra, rb)] for ra, rb in zip(A, B)]


def _pow(A, n):
    out = _eye(len(A))
    for _ in range(n):
        out = _mm(out, A)
    return out


def _solve(A, v):
    """x with (I - A) x = v (Gaussian elimination with partial pivoting)."""
    n = len(A)
    M = [[(1.0 if i == j else 0.0) - A[i][j] for j in range(n)] + [v[i]] for i in range(n)]
    for col in range(n):
        piv = max(range(col, n), key=lambda i: abs(M[i][col]))
        M[col], M[piv] = M[piv], M[col]
        for i in range(n):
            if i != col:
                f = M[i][col] / M[col][col]
                M[i] = [x - f * y for x, y in zip(M[i], M[col])]
    return [M[i][n] / M[i][i] for i in range(n)]


def _loss(s):
    return s[0] if len(s) == 2 else s[0] + s[1]


def _mats(d, r, m, fresh):
    """(no-replay step, replay step) for a buffer of m examples."""
    if fresh:
        return plain(d, r), partial(d, r, m)
    return buffer_plain(d, r, m), buffer_replay(d, r, m)


def curve(d, r, m_at, T, fresh=False):
    """Expected loss after each of steps 1..T; m_at(t) = number of stored examples replayed at step t (0 = none).
    A fixed buffer has one size: every non-zero m_at(t) must be equal."""
    sizes = {m_at(t) for t in range(1, T + 1)} - {0}
    if not fresh and len(sizes) > 1:
        raise ValueError("a fixed buffer has one size; got replay sizes %s" % sorted(sizes))
    m = sizes.pop() if sizes else 0
    M, R = _mats(d, r, m, fresh)
    s, out = start(d, r, fresh), []
    for t in range(1, T + 1):
        s = _mv(R if m_at(t) else M, s)
        out.append(_loss(s))
    return out


def total_none(d, r):
    return _solve(plain(d, r), start(d, r, True))[0]


def total_bernoulli(d, r, q, m, fresh=False):
    """Each step replays the m stored examples with probability q (mean matrix (1-q)M + qR)."""
    M, R = _mats(d, r, m, fresh)
    return _loss(_solve(_add(M, R, 1 - q, q), start(d, r, fresh)))


def total_periodic(d, r, n, m, fresh=False):
    """Replay m examples on steps n, 2n, ...: cycle matrix C = R M^(n-1); a cycle sums M^1..M^(n-1) and C."""
    M, R = _mats(d, r, m, fresh)
    C = _mm(R, _pow(M, n - 1))
    S, Mj = [[0.0] * len(M) for _ in M], _eye(len(M))
    for _ in range(n - 1):
        Mj = _mm(Mj, M)
        S = _add(S, Mj)
    S = _add(S, C)  # a partial replay leaves loss on the tracked task
    return _loss(_mv(S, _solve(C, start(d, r, fresh))))


def total_one_shot(d, r, t, m, fresh=False):
    """A single partial replay at step t (fixed buffer and fresh subset agree: there is only one replay)."""
    M, R = _mats(d, r, m, fresh)
    s, pre = start(d, r, fresh), 0.0
    for _ in range(t - 1):
        s = _mv(M, s)
        pre += _loss(s)
    s = _mv(R, s)
    return pre + _loss(_solve(M, s))


def best_one_shot(d, r, m, tmax=400):
    t = min(range(1, tmax + 1), key=lambda u: total_one_shot(d, r, u, m))
    return t, total_one_shot(d, r, t, m)


def one_shot_benefit(d, r, m, tmax=400):
    """Fraction of the full-memory best one-shot saving achieved with m stored examples (best step for each)."""
    z = total_none(d, r)
    return (z - best_one_shot(d, r, m, tmax)[1]) / (z - best_one_shot(d, r, r, tmax)[1])


def peak(d, r, m_at, T, fresh=False):
    c = curve(d, r, m_at, T, fresh)
    x = max(c)
    return c.index(x) + 1, x


def budget_rate(d, r, m, c):
    """Bernoulli rate that spends c stored examples per step on average when each replay uses m (capped at 1)."""
    return min(1.0, c / m)


def best_split(d, r, c, fresh=False):
    """Replay size m in 1..r minimising the Bernoulli total at a per-step budget of c examples (rate c/m); returns
    (m*, total, {m: total})."""
    tot = {m: total_bernoulli(d, r, budget_rate(d, r, m, c), m, fresh) for m in range(1, r + 1) if c / m <= 1.0}
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


def _run(d, r, ms, T, rng, fresh=False):
    e = _unit(d, rng)
    U1 = haar_projector(d, r, rng)
    e = [a - b for a, b in zip(e, _proj(U1, e))]
    out = []
    for t in range(1, T + 1):
        U = haar_projector(d, r, rng)
        m = ms(t, rng)
        # fresh: a new uniform m-subspace of span(U1) at each replay (a random rotation of U1's basis)
        V = _orth_extend([], [_proj(U1, _unit(d, rng)) for _ in range(m)]) if fresh else U1[:m]
        B = _orth_extend(V, U) if m > 0 else U
        e = [a - b for a, b in zip(e, _proj(B, e))]
        out.append(sum(x * x for x in _proj(U1, e)))
    return out


def simulate_curve(d, r, ms, T, runs, rng, fresh=False):
    """Mean loss curve; ms(t, rng) -> number of stored examples replayed at step t. Fixed buffer: the first m vectors
    of a Haar basis of U, kept for the whole run; fresh: a new uniform m-subspace of U at every replay."""
    acc = [0.0] * T
    for _ in range(runs):
        for i, x in enumerate(_run(d, r, ms, T, rng, fresh)):
            acc[i] += x
    return [a / runs for a in acc]


def simulate_bernoulli_total(d, r, q, m, T, runs, rng, fresh=False):
    return sum(simulate_curve(d, r, lambda t, g: m if g.random() < q else 0, T, runs, rng, fresh))
