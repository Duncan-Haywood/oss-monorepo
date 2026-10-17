"""Cost-function markets with partially informed traders as randomized subspace descent (Frongillo-Reid style).

Setup.  A market maker with cost C(q) = 1/2 q'Aq (A positive definite: the Hessian of any smooth cost function, e.g. LMSR locally) posts
prices p = Aq over d securities.  The true mean payoff is m = A q*.  A trader who can only trade a bundle subspace span(U) (U is d x r:
"the securities I understand") and who believes the truth trades to the point of span(q + U z) closest to q* in the A-norm; a trader
who is only willing to move a fraction kappa of the way (budget, risk aversion, fees) moves kappa of that step.  With error e = q - q*:
    e' = (I - kappa Pi) e,    Pi = U (U'AU)^{-1} U'A   (A-orthogonal projector onto span U).
Identity (exact, any trade): the trader's expected profit under the truth is  (e'Ae - e''Ae')/2, so the market maker's total expected
loss telescopes to (e_0'Ae_0 - e_T'Ae_T)/2 <= e_0'Ae_0/2 whoever trades and however badly.
Noisy beliefs: the trader's target is q* + xi, xi ~ N(0, S), so  e' = e - kappa Pi (e - xi).
Randomness: each round one subspace is drawn from a finite list with given probabilities.
"""
import math, random

__all__ = ["matmul", "transpose", "inv", "eig_sym", "sqrt_sym", "projector", "expected_whitened_projector", "rate_bound",
           "step_second_moment", "second_moment_curve", "asymptotic_rate", "simulate", "equicorrelated", "coordinate_subspaces",
           "noise_floor_diag", "equicorrelated_rate", "conjugate_subspaces", "averaging_error", "binom_pmf", "trade_profit", "best_constant_kappa", "lmsr_run", "anorm2"]


def matmul(X, Y):
    return [[sum(X[i][k] * Y[k][j] for k in range(len(Y))) for j in range(len(Y[0]))] for i in range(len(X))]


def transpose(X):
    return [list(r) for r in zip(*X)]


def inv(X):
    n = len(X)
    M = [list(map(float, X[i])) + [1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        d = M[c][c]
        M[c] = [v / d for v in M[c]]
        for r in range(n):
            if r != c and M[r][c] != 0.0:
                f = M[r][c]
                M[r] = [a - f * b for a, b in zip(M[r], M[c])]
    return [row[n:] for row in M]


def eig_sym(S, sweeps=100):
    """Jacobi eigenvalues/vectors of a symmetric matrix: (values ascending, V with eigenvectors as columns)."""
    n = len(S)
    A = [list(map(float, r)) for r in S]
    V = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for _ in range(sweeps):
        off = sum(A[i][j] ** 2 for i in range(n) for j in range(n) if i != j)
        if off < 1e-30:
            break
        for p in range(n):
            for q in range(p + 1, n):
                if abs(A[p][q]) < 1e-300:
                    continue
                th = (A[q][q] - A[p][p]) / (2 * A[p][q])
                t = (1 if th >= 0 else -1) / (abs(th) + math.sqrt(th * th + 1))
                c = 1 / math.sqrt(t * t + 1); s = t * c
                for k in range(n):
                    akp, akq = A[k][p], A[k][q]
                    A[k][p], A[k][q] = c * akp - s * akq, s * akp + c * akq
                for k in range(n):
                    apk, aqk = A[p][k], A[q][k]
                    A[p][k], A[q][k] = c * apk - s * aqk, s * apk + c * aqk
                for k in range(n):
                    vkp, vkq = V[k][p], V[k][q]
                    V[k][p], V[k][q] = c * vkp - s * vkq, s * vkp + c * vkq
    order = sorted(range(n), key=lambda i: A[i][i])
    return [A[i][i] for i in order], [[V[r][i] for i in order] for r in range(n)]


def sqrt_sym(S):
    w, V = eig_sym(S)
    n = len(S)
    return [[sum(V[i][k] * math.sqrt(max(w[k], 0.0)) * V[j][k] for k in range(n)) for j in range(n)] for i in range(n)]


def anorm2(A, e):
    return sum(e[i] * A[i][j] * e[j] for i in range(len(e)) for j in range(len(e)))


def projector(A, U):
    """A-orthogonal projector Pi = U (U'AU)^{-1} U'A onto the columns of U (d x r)."""
    Ut = transpose(U)
    G = inv(matmul(Ut, matmul(A, U)))
    return matmul(U, matmul(G, matmul(Ut, A)))


def coordinate_subspaces(d):
    """One single-security trader per coordinate, uniformly likely."""
    return [[[1.0 if i == k else 0.0] for i in range(d)] for k in range(d)], [1.0 / d] * d


def equicorrelated(d, c):
    """Unit-diagonal Hessian with common correlation c between securities (overlapping events)."""
    return [[1.0 if i == j else c for j in range(d)] for i in range(d)]


def expected_whitened_projector(A, subs, probs):
    """E[A^{1/2} Pi A^{-1/2}] (symmetric): the average orthogonal projector in whitened coordinates."""
    R = sqrt_sym(A); Ri = inv(R)
    d = len(A)
    E = [[0.0] * d for _ in range(d)]
    for U, pr in zip(subs, probs):
        P = matmul(R, matmul(projector(A, U), Ri))
        for i in range(d):
            for j in range(d):
                E[i][j] += pr * P[i][j]
    return [[(E[i][j] + E[j][i]) / 2 for j in range(d)] for i in range(d)]


def rate_bound(A, subs, probs):
    """rho = lambda_min(E[whitened projector]); E||e'||_A^2 <= (1 - rho) ||e||_A^2 from every state, tight for the worst state."""
    return eig_sym(expected_whitened_projector(A, subs, probs))[0][0]


def step_second_moment(G, A, subs, probs, kappa, S=None):
    """One round of the exact second-moment recursion G = E[e e']:  G' = E[(I-k Pi) G (I-k Pi)'] + k^2 E[Pi S Pi']."""
    d = len(A)
    out = [[0.0] * d for _ in range(d)]
    for U, pr in zip(subs, probs):
        P = projector(A, U)
        M = [[(1.0 if i == j else 0.0) - kappa * P[i][j] for j in range(d)] for i in range(d)]
        T = matmul(M, matmul(G, transpose(M)))
        if S is not None:
            N = matmul(P, matmul(S, transpose(P)))
            T = [[T[i][j] + kappa * kappa * N[i][j] for j in range(d)] for i in range(d)]
        for i in range(d):
            for j in range(d):
                out[i][j] += pr * T[i][j]
    return out


def _tr_AG(A, G):
    d = len(A)
    return sum(A[i][j] * G[j][i] for i in range(d) for j in range(d))


def second_moment_curve(A, e0, subs, probs, T, kappa=1.0, S=None):
    """Exact E||e_t||_A^2 for t = 0..T (no Monte Carlo)."""
    d = len(A)
    G = [[e0[i] * e0[j] for j in range(d)] for i in range(d)]
    out = [_tr_AG(A, G)]
    for _ in range(T):
        G = step_second_moment(G, A, subs, probs, kappa, S)
        out.append(_tr_AG(A, G))
    return out


def asymptotic_rate(A, subs, probs, kappa=1.0, iters=4000):
    """Per-round geometric rate of E||e_t||_A^2 without noise: spectral radius of the second-moment operator (power iteration)."""
    d = len(A)
    G = [[1.0 / (1 + i + j) for j in range(d)] for i in range(d)]  # generic positive start
    lam = 1.0
    for _ in range(iters):
        H = step_second_moment(G, A, subs, probs, kappa)
        nrm = math.sqrt(sum(H[i][j] ** 2 for i in range(d) for j in range(d)))
        lam = nrm / math.sqrt(sum(G[i][j] ** 2 for i in range(d) for j in range(d)))
        G = [[v / nrm for v in r] for r in H]
    return lam


def simulate(A, e0, subs, probs, T, kappa=1.0, sigma=0.0, runs=4000, seed=0):
    """Monte Carlo mean of ||e_t||_A^2 (t=0..T) and of the maker's realised loss (e0'Ae0 - eT'AeT)/2 identity check.
    Belief noise xi ~ N(0, sigma^2 I)."""
    rng = random.Random(seed)
    d = len(A)
    Ps = [projector(A, U) for U in subs]
    acc = [0.0] * (T + 1)
    for _ in range(runs):
        e = list(e0)
        acc[0] += anorm2(A, e)
        for t in range(1, T + 1):
            k = rng.choices(range(len(subs)), probs)[0]
            xi = [rng.gauss(0, sigma) for _ in range(d)]
            P = Ps[k]
            de = [sum(P[i][j] * (e[j] - xi[j]) for j in range(d)) for i in range(d)]
            e = [e[i] - kappa * de[i] for i in range(d)]
            acc[t] += anorm2(A, e)
    return [v / runs for v in acc]


def noise_floor_diag(d, kappa, sigma):
    """A = I, uniform single-coordinate traders: stationary E||e||^2 = d kappa sigma^2/(2-kappa); per-round contraction 1-kappa(2-kappa)/d."""
    return d * kappa * sigma ** 2 / (2 - kappa), 1 - kappa * (2 - kappa) / d


def trade_profit(A, q, q2, qstar):
    """Expected profit of moving the maker from q to q2 when the mean payoff is A q*: <q2-q, A q*> - (C(q2)-C(q)), C = q'Aq/2."""
    d = len(A)
    Aq = [sum(A[i][j] * qstar[j] for j in range(d)) for i in range(d)]
    return sum((q2[i] - q[i]) * Aq[i] for i in range(d)) - 0.5 * (anorm2(A, q2) - anorm2(A, q))


def best_constant_kappa(d, sigma, e0sq_per_coord, T):
    """A = I, coordinate traders: exact per-coordinate mean-square m_T for a constant step; returns (best kappa, its error d*m_T) on a grid."""
    best = None
    for i in range(1, 400):
        k = i / 400
        lam = 1 - k * (2 - k) / d
        v = k * sigma ** 2 / (2 - k)
        m = v + (e0sq_per_coord - v) * lam ** T
        if best is None or m < best[1]:
            best = (k, m)
    return best[0], d * best[1]


def lmsr_run(theta, subs, probs, T, seed=0, runs=300):
    """Real LMSR (softmax prices, last outcome is the numeraire) with traders who each minimise KL(theta||p) exactly over their
    bundle subspace (Newton).  Returns mean KL(theta||p_t) for t=0..T from q=0 (uniform prices)."""
    rng = random.Random(seed)
    d = len(theta) - 1

    def price(q):
        z = [math.exp(v) for v in q] + [1.0]
        s = sum(z)
        return [v / s for v in z]

    def kl(p):
        return sum(t * math.log(t / pp) for t, pp in zip(theta, p) if t > 0)

    acc = [0.0] * (T + 1)
    for _ in range(runs):
        q = [0.0] * d
        acc[0] += kl(price(q))
        for t in range(1, T + 1):
            U = subs[rng.choices(range(len(subs)), probs)[0]]
            r = len(U[0])
            z = [0.0] * r
            for _ in range(50):
                qq = [q[i] + sum(U[i][a] * z[a] for a in range(r)) for i in range(d)]
                p = price(qq)
                g = [sum(U[i][a] * (p[i] - theta[i]) for i in range(d)) for a in range(r)]
                if max(abs(v) for v in g) < 1e-13:
                    break
                A = [[(p[i] if i == j else 0.0) - p[i] * p[j] for j in range(d)] for i in range(d)]
                H = matmul(transpose(U), matmul(A, U))
                Hi = inv(H)
                z = [z[a] - sum(Hi[a][b] * g[b] for b in range(r)) for a in range(r)]
            q = [q[i] + sum(U[i][a] * z[a] for a in range(r)) for i in range(d)]
            acc[t] += kl(price(q))
    return [v / runs for v in acc]


def equicorrelated_rate(d, c):
    """Exact per-round rate of E||e||_A^2 for uniform single-security traders when A has unit diagonal and common correlation c.
    Closed form from the 2-statistic recursion X=sum e_i^2, Y=(sum e_i)^2:
        X' = X(1-(1-c^2)/d) + c^2 (1-2/d) Y,   Y' = (1-c)^2 (X/d + (1-2/d) Y);  rate = top eigenvalue of that 2x2 matrix."""
    a = 1 - (1 - c * c) / d; b = c * c * (1 - 2 / d); g = (1 - c) ** 2 / d; h = (1 - c) ** 2 * (1 - 2 / d)
    tr = a + h; det = a * h - b * g
    return (tr + math.sqrt(max(tr * tr - 4 * det, 0.0))) / 2


def conjugate_subspaces(A):
    """Single-bundle traders along A-conjugate directions (columns of A^{-1/2} V, V orthonormal): whitened coordinate projectors."""
    d = len(A)
    Ri = inv(sqrt_sym(A))
    _, V = eig_sym(A)
    W = matmul(Ri, V)
    return [[[W[i][k]] for i in range(d)] for k in range(d)], [1.0 / d] * d


def binom_pmf(n, p, k):
    return math.comb(n, k) * p ** k * (1 - p) ** (n - k)


def averaging_error(d, sigma, e0sq_per_coord, T):
    """A = I, coordinate traders, per-security step kappa = 1/(n+1) on the n-th visit (running mean of beliefs): exact E||e_T||^2 =
    d [ P(n=0) e0^2 + sum_{n>=1} P(n) sigma^2/n ],  n ~ Bin(T, 1/d)."""
    p = 1.0 / d
    return d * (binom_pmf(T, p, 0) * e0sq_per_coord + sum(binom_pmf(T, p, n) * sigma ** 2 / n for n in range(1, T + 1)))
