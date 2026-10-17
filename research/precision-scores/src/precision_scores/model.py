"""Quadratic Bregman scores for a verifier's vector report of an expected drift/update.

A verifier reports r in R^d for the mean mu = E[y] of a d-dimensional outcome y with covariance Sigma (e.g. the expected
difference between a worker's update and a trusted re-execution, one coordinate per layer).  For A positive definite,
    S_A(r, y) = -(y - r)^T A (y - r)
is strictly proper for the mean (it is the Bregman score of phi(x) = x^T A x / 2 up to scale): E S_A(r, y) = -tr(A Sigma) - D^T A D
with D = r - mu, so a misreport D costs exactly D^T A D and truth is the unique maximiser.  Every proper score for the mean is a
Bregman score (Savage; Banerjee et al.), and A is its curvature: quadratic scores are the family with constant curvature.

Detection against a trusted reference that reports mu: the per-task gap G = S_A(mu, y) - S_A(r, y) = D^T A D - 2 D^T A e, with
e = y - mu, has mean D^T A D and variance 4 D^T A Sigma A D, exactly and for any noise law with covariance Sigma (only the
linear term is random).  The per-task signal to noise ratio is  snr_A(D) = D^T A D / (2 sqrt(D^T A Sigma A D)).
Cauchy-Schwarz with u = A D:  D^T u <= sqrt(D^T Sigma^{-1} D) sqrt(u^T Sigma u), so
    snr_A(D) <= (1/2) sqrt(D^T Sigma^{-1} D) = snr_{Sigma^{-1}}(D)   for every A and every D:
the precision score A = Sigma^{-1} is uniformly most detectable among quadratic scores.  Tasks needed for one-sided z-test power:
n = 4 z^2 / (D^T Sigma^{-1} D) with z = z_alpha + z_beta.  Efficiency of A relative to it is eff_A(D) = (snr_A / snr_prec)^2 =
(D^T A D)^2 / ((D^T A Sigma A D)(D^T Sigma^{-1} D)) in (0, 1]; for A = I it is (D^T D)^2 / ((D^T Sigma D)(D^T Sigma^{-1} D)) >=
4 k / (1 + k)^2 with k the condition number of Sigma (Kantorovich), attained by a D that puts half its squared norm on each
extreme eigenvector, so an isotropic (Brier-type) score needs up to (1+k)^2 / (4k) times more tasks.
"""
import math, random

__all__ = ["matmul", "matvec", "quad", "cholesky", "solve_chol", "inverse", "identity", "diag_of", "random_spd", "sample_gaussian",
           "sample_t", "expected_score", "misreport_cost", "gap_mean", "gap_var", "snr", "efficiency", "kantorovich",
           "tasks_needed", "extremal_direction", "cov_estimate", "power_sim", "worst_direction_search", "cond_number"]


def identity(d):
    return [[1.0 if i == j else 0.0 for j in range(d)] for i in range(d)]


def matvec(A, x):
    return [sum(a * b for a, b in zip(row, x)) for row in A]


def matmul(A, B):
    Bt = list(zip(*B))
    return [[sum(a * b for a, b in zip(row, col)) for col in Bt] for row in A]


def quad(A, x, y=None):
    y = x if y is None else y
    return sum(xi * v for xi, v in zip(x, matvec(A, y)))


def cholesky(S):
    d = len(S); L = [[0.0] * d for _ in range(d)]
    for i in range(d):
        for j in range(i + 1):
            s = S[i][j] - sum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                if s <= 0:
                    raise ValueError("matrix not positive definite")
                L[i][i] = math.sqrt(s)
            else:
                L[i][j] = s / L[j][j]
    return L


def solve_chol(L, b):
    d = len(L); z = [0.0] * d
    for i in range(d):
        z[i] = (b[i] - sum(L[i][k] * z[k] for k in range(i))) / L[i][i]
    x = [0.0] * d
    for i in reversed(range(d)):
        x[i] = (z[i] - sum(L[k][i] * x[k] for k in range(i + 1, d))) / L[i][i]
    return x


def inverse(S):
    L = cholesky(S); d = len(S)
    cols = [solve_chol(L, [1.0 if i == j else 0.0 for i in range(d)]) for j in range(d)]
    return [[cols[j][i] for j in range(d)] for i in range(d)]


def diag_of(S):
    d = len(S)
    return [[S[i][i] if i == j else 0.0 for j in range(d)] for i in range(d)]


def cond_number(S):
    """Condition number by power iteration on S and S^{-1} (S symmetric positive definite)."""
    def top(M):
        v = [1.0 + .1 * i for i in range(len(M))]
        for _ in range(500):
            w = matvec(M, v); n = math.sqrt(sum(x * x for x in w)); v = [x / n for x in w]
        return sum(a * b for a, b in zip(v, matvec(M, v)))
    return top(S) * top(inverse(S))


def random_spd(d, rng, kappa=10.0):
    """SPD matrix with eigenvalues log-uniform on [1, kappa] in a random orthonormal basis (Gram-Schmidt)."""
    Q = []
    while len(Q) < d:
        v = [rng.gauss(0, 1) for _ in range(d)]
        for q in Q:
            c = sum(a * b for a, b in zip(v, q)); v = [a - c * b for a, b in zip(v, q)]
        n = math.sqrt(sum(a * a for a in v))
        if n > 1e-8:
            Q.append([a / n for a in v])
    lam = [1.0, kappa] + [math.exp(rng.uniform(0, math.log(kappa))) for _ in range(d - 2)]
    return [[sum(lam[k] * Q[k][i] * Q[k][j] for k in range(d)) for j in range(d)] for i in range(d)]


def sample_gaussian(L, rng):
    z = [rng.gauss(0, 1) for _ in range(len(L))]
    return [sum(L[i][k] * z[k] for k in range(i + 1)) for i in range(len(L))]


def sample_t(L, rng, nu=5.0):
    """Multivariate t noise rescaled to covariance L L^T (nu > 2): heavy tails, same second moments."""
    g = sample_gaussian(L, rng)
    chi = sum(rng.gauss(0, 1) ** 2 for _ in range(int(nu))) / nu
    return [x * math.sqrt((nu - 2) / nu) / math.sqrt(chi) for x in g]


def expected_score(A, Sigma, D):
    """E S_A(mu + D, y) = -tr(A Sigma) - D^T A D."""
    d = len(A)
    tr = sum(A[i][k] * Sigma[k][i] for i in range(d) for k in range(d))
    return -tr - quad(A, D)


def misreport_cost(A, D):
    return quad(A, D)


def gap_mean(A, D):
    return quad(A, D)


def gap_var(A, Sigma, D):
    u = matvec(A, D)
    return 4 * quad(Sigma, u)


def snr(A, Sigma, D):
    return gap_mean(A, D) / math.sqrt(gap_var(A, Sigma, D))


def efficiency(A, Sigma, D):
    """(snr_A / snr_precision)^2: fraction of the precision score's detection power (1 = optimal)."""
    P = inverse(Sigma)
    return snr(A, Sigma, D) ** 2 / snr(P, Sigma, D) ** 2


def kantorovich(kappa):
    return 4 * kappa / (1 + kappa) ** 2


def extremal_direction(eigvals_diag):
    """For diagonal Sigma = diag(lambda): D with half its squared norm on the min and on the max eigen-coordinate."""
    lam = list(eigvals_diag); i, j = lam.index(min(lam)), lam.index(max(lam))
    D = [0.0] * len(lam); D[i] = D[j] = math.sqrt(0.5)
    return D


def tasks_needed(Sigma, D, z=2.49, A=None):
    """Tasks for a one-sided z-test with power ~0.8 at level 0.05 (z = 1.645 + 0.842): n = z^2 / snr_A(D)^2."""
    A = inverse(Sigma) if A is None else A
    return z * z / snr(A, Sigma, D) ** 2


def cov_estimate(Sigma, m, rng, mean_known=True):
    """Sample covariance from m i.i.d. Gaussian draws (mean known); independent of the verifier's report and of the scored tasks."""
    L = cholesky(Sigma); d = len(Sigma)
    S = [[0.0] * d for _ in range(d)]
    for _ in range(m):
        e = sample_gaussian(L, rng)
        for i in range(d):
            for j in range(d):
                S[i][j] += e[i] * e[j] / m
    return S


def power_sim(A, Sigma, D, n, trials, rng, noise="gauss"):
    """Rejection rate of the one-sided t-test (t > 1.645) on n per-task gaps G_k = D^T A D - 2 D^T A e_k, with the standard
    error estimated from the data.  Predicted power is about P(N(sqrt(n) snr, 1) > 1.645)."""
    L = cholesky(Sigma); u = matvec(A, D); m = quad(A, D); hits = 0
    for _ in range(trials):
        g = []
        for _ in range(n):
            e = sample_gaussian(L, rng) if noise == "gauss" else sample_t(L, rng)
            g.append(m - 2 * sum(a * b for a, b in zip(u, e)))
        mean = sum(g) / n; var = sum((x - mean) ** 2 for x in g) / (n - 1)
        hits += mean / math.sqrt(var / n) > 1.645
    return hits / trials


def worst_direction_search(A, Sigma, rng, tries=4000):
    """Minimum efficiency over random directions (a lower estimate of the infimum)."""
    d = len(A); worst = 1.0
    for _ in range(tries):
        D = [rng.gauss(0, 1) for _ in range(d)]
        worst = min(worst, efficiency(A, Sigma, D))
    return worst
