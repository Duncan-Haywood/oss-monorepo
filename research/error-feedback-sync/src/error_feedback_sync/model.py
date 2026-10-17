"""DiLoCo-style local SGD with *biased* sparsified displacements and error feedback (companion to compressed-sync,
which covered unbiased compressors only).

One mode of outer curvature s (modes are independent; loss adds over modes). A worker's displacement is
d_i = s x - n_i, Var n_i = V. Each of N workers keeps a residual e_i. Every round it forms u_i = e_i + d_i and sends
m_i u_i with m_i ~ Bernoulli(rho) independent of everything else (rand-k, *unscaled*); the unsent part is kept:
e_i' = (1 - m_i) u_i.  Server: x' = x - (alpha/N) sum_i m_i u_i.

Second moments X = E x^2, C = E x e_i, Q = E e_i^2, R = E e_i e_j (i != j) obey a closed linear system (moments()).
Baselines with the same expected bytes (fraction rho of coordinates per round):
  unbiased : send m_i d_i / rho          floor  alpha V (1+w) / (N s ((2-alpha s) - alpha s w / N)),  w = (1-rho)/rho
  dropped  : send m_i d_i (no feedback)  x' = x - (alpha/N) sum m_i d_i, moments in closed form (dropped_var()).
"""
import math
import random

__all__ = ["ef_var_closed", "zmax_closed", "fixed_point_dropped", "fixed_point_ef", "simulate_hetero", "curvature", "worker_noise", "moment_map", "stationary", "ef_var", "spectral_radius", "alpha_max_ef",
           "unbiased_var", "dropped_var", "uncompressed_var", "residual_var", "simulate_ef", "simulate_dense",
           "simulate_topk_ef", "floor"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def worker_noise(eta, a, sigma, H):
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / (1 - q * q)


def moment_map(s, alpha, N, rho):
    """(M, c0): (X,C,Q,R)' = M (X,C,Q,R) + c0 * V, from the closed recursions in the module docstring."""
    p = rho
    b = 1 - p
    a = alpha
    # U1 = Q + 2sC + s^2 X + V ; U2 = R + 2sC + s^2 X
    U1 = [s * s, 2 * s, 1.0, 0.0]
    U2 = [s * s, 2 * s, 0.0, 1.0]
    XC = [s, 1.0, 0.0, 0.0]            # E x u_i = C + s X
    add = lambda *terms: [sum(c * v[k] for c, v in terms) for k in range(4)]
    X = add((1.0, [1, 0, 0, 0]), (-2 * a * p, XC), (a * a * p / N, U1), (a * a * p * p * (N - 1) / N, U2))
    C = add((b, XC), (-a * (N - 1) / N * p * b, U2))
    Q = add((b, U1))
    R = add((b * b, U2))
    return [X, C, Q, R], [a * a * p / N, 0.0, b, 0.0]


def _solve(A, y):
    n = len(y)
    M = [row[:] + [y[i]] for i, row in enumerate(A)]
    for i in range(n):
        piv = max(range(i, n), key=lambda r: abs(M[r][i]))
        M[i], M[piv] = M[piv], M[i]
        for r in range(n):
            if r != i:
                f = M[r][i] / M[i][i]
                M[r] = [x - f * z for x, z in zip(M[r], M[i])]
    return [M[i][n] / M[i][i] for i in range(n)]


def _charpoly(M):
    """Coefficients c[0..n] (c[0]=1) of det(lambda I - M) by Faddeev-LeVerrier."""
    n = len(M)
    c = [1.0]
    Mk = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for k in range(1, n + 1):
        AM = [[sum(M[i][l] * Mk[l][j] for l in range(n)) for j in range(n)] for i in range(n)]
        ck = -sum(AM[i][i] for i in range(n)) / k
        c.append(ck)
        Mk = [[AM[i][j] + (ck if i == j else 0.0) for j in range(n)] for i in range(n)]
    return c


def spectral_radius(M):
    """Largest |eigenvalue| via Durand-Kerner roots of the characteristic polynomial (exact enough for 4x4)."""
    c = _charpoly(M)
    n = len(M)
    roots = [complex(0.4, 0.9) ** k for k in range(n)]
    for _ in range(500):
        new = []
        for i, r in enumerate(roots):
            f = sum(c[k] * r ** (n - k) for k in range(n + 1))
            d = 1.0
            for j, q in enumerate(roots):
                if j != i:
                    d *= (r - q)
            new.append(r - f / d if d != 0 else r)
        if max(abs(a - b) for a, b in zip(new, roots)) < 1e-14:
            roots = new
            break
        roots = new
    return max(abs(r) for r in roots)


def stationary(s, V, alpha, N, rho):
    """Stationary (X, C, Q, R), or None when the moment map is not a contraction."""
    M, c0 = moment_map(s, alpha, N, rho)
    if spectral_radius(M) >= 1 - 1e-12:
        return None
    A = [[(1.0 if i == j else 0.0) - M[i][j] for j in range(4)] for i in range(4)]
    return _solve(A, [c * V for c in c0])


def ef_var(s, V, alpha, N, rho):
    st = stationary(s, V, alpha, N, rho)
    return math.inf if st is None else st[0]


def residual_var(s, V, alpha, N, rho):
    st = stationary(s, V, alpha, N, rho)
    return math.inf if st is None else st[2]


def alpha_max_ef(s, N, rho, hi=None, tol=1e-6):
    """Largest outer step with a contracting moment map (bisection; the stable set is an interval from 0)."""
    lo, hi = 0.0, hi or 4.0 / s
    for _ in range(60):
        mid = (lo + hi) / 2
        if spectral_radius(moment_map(s, mid, N, rho)[0]) < 1 - 1e-9:
            lo = mid
        else:
            hi = mid
    return lo


def zmax_closed(N, rho):
    """Exact stability limit of alpha*s for error feedback: 2(2-rho) N rho / (N rho^2 + 4(1-rho)).
    N=1: 2 rho/(2-rho) (about half of unbiased 2 rho); N -> infinity: 2(2-rho)/rho (above the uncompressed 2)."""
    return 2 * (2 - rho) * N * rho / (N * rho * rho + 4 * (1 - rho))


def ef_var_closed(s, V, alpha, N, rho):
    """Exact stationary E x^2 with error feedback, with z = alpha s and k = 2(1-rho)/(rho(2-rho)):
    uncompressed * [1 - z/2 + (1-1/N) k z (2-z)/2] / (1 - z/zmax)."""
    z = alpha * s
    zm = zmax_closed(N, rho)
    if z >= zm:
        return math.inf
    k = 2 * (1 - rho) / (rho * (2 - rho))
    return uncompressed_var(s, V, alpha, N) * (1 - z / 2 + (1 - 1 / N) * k * z * (2 - z) / 2) / (1 - z / zm)


def fixed_point_dropped(b, rho):
    """Stationary mean when worker i (optimum b_i, common curvature) sends its displacement w.p. rho_i and drops it
    otherwise, no feedback: sum rho_i b_i / sum rho_i (a participation-weighted mean)."""
    return sum(r * x for r, x in zip(rho, b)) / sum(rho)


def fixed_point_ef(b, rho):
    """With error feedback every unit of displacement is eventually sent, so E sent_i = E d_i at stationarity and the
    fixed point is the unweighted mean of the optima whatever the send rates."""
    return sum(b) / len(b)


def uncompressed_var(s, V, alpha, N):
    return alpha * V / (N * s * (2 - alpha * s))


def unbiased_var(s, V, alpha, N, rho):
    w = (1 - rho) / rho
    d = (2 - alpha * s) - alpha * s * w / N
    return math.inf if d <= 0 else alpha * V * (1 + w) / (N * s * d)


def dropped_var(s, V, alpha, N, rho):
    """No feedback, no rescaling: x' = x - (alpha/N) sum m_i (s x - n_i). Stationary E x^2 (exact)."""
    # E x'^2 = E x^2 (1 - alpha rho s)^2 + (alpha/N)^2 [N rho (1-rho) ... ] computed from m-moments:
    # x' = x (1 - alpha s K/N) + (alpha/N) sum m_i n_i, K = sum m_i ~ Bin(N, rho)
    EK, EK2 = N * rho, N * rho * (1 - rho) + (N * rho) ** 2
    mult = 1 - 2 * alpha * s * EK / N + (alpha * s / N) ** 2 * EK2
    if mult >= 1:
        return math.inf
    return (alpha / N) ** 2 * EK * V / (1 - mult)


def floor(var_fn, a_list, eta, sigma, H, *args):
    return sum(0.5 * a * var_fn(curvature(eta, a, H), worker_noise(eta, a, sigma, H), *args) for a in a_list)


def simulate_ef(s, V, alpha, N, rho, rounds, burn, seed=0):
    """Literal simulation of one mode with per-worker residuals; returns (E x^2, E e^2)."""
    rng = random.Random(seed)
    sd = math.sqrt(V)
    x, e = 0.0, [0.0] * N
    ax = ae = 0.0
    cnt = 0
    for t in range(rounds):
        tot = 0.0
        for i in range(N):
            u = e[i] + s * x - rng.gauss(0, sd)
            if rng.random() < rho:
                tot += u
                e[i] = 0.0
            else:
                e[i] = u
        x -= alpha * tot / N
        if t >= burn:
            ax += x * x
            ae += sum(v * v for v in e) / N
            cnt += 1
    return ax / cnt, ae / cnt


def simulate_dense(kind, s, V, alpha, N, rho, rounds, burn, seed=0):
    """One mode, no feedback: kind 'unbiased' (send m d / rho) or 'dropped' (send m d). Returns E x^2."""
    rng = random.Random(seed)
    sd = math.sqrt(V)
    x = 0.0
    acc = 0.0
    cnt = 0
    for t in range(rounds):
        tot = 0.0
        for _ in range(N):
            d = s * x - rng.gauss(0, sd)
            if rng.random() < rho:
                tot += d / rho if kind == "unbiased" else d
        x -= alpha * tot / N
        if t >= burn:
            acc += x * x
            cnt += 1
    return acc / cnt


def simulate_topk_ef(s_list, V_list, alpha, N, k, rounds, burn, seed=0, feedback=True, scale=False):
    """D coupled-by-compressor modes: each worker sends its k largest-magnitude coordinates of e + d (top-k),
    with (feedback=True) or without residual memory. Returns E x_j^2 per mode (a state-dependent compressor
    that the exact theory does not cover)."""
    rng = random.Random(seed)
    D = len(s_list)
    sd = [math.sqrt(v) for v in V_list]
    x = [0.0] * D
    e = [[0.0] * D for _ in range(N)]
    acc, cnt = [0.0] * D, 0
    for t in range(rounds):
        tot = [0.0] * D
        for i in range(N):
            u = [e[i][j] + s_list[j] * x[j] - rng.gauss(0, sd[j]) for j in range(D)]
            keep = sorted(range(D), key=lambda j: -abs(u[j]))[:k]
            for j in range(D):
                if j in keep:
                    tot[j] += u[j]
                    e[i][j] = 0.0
                else:
                    e[i][j] = u[j] if feedback else 0.0
        x = [x[j] - alpha * tot[j] / N for j in range(D)]
        if t >= burn:
            for j in range(D):
                acc[j] += x[j] * x[j]
            cnt += 1
    return [a / cnt for a in acc]


def simulate_hetero(feedback, s, V, alpha, b, rho, rounds, burn, seed=0):
    """Workers with optima b_i (displacement s(x - b_i) - n_i) and send probabilities rho_i, with or without
    residual memory (unscaled, biased). Returns (mean x, E (x - mean x)^2)."""
    rng = random.Random(seed)
    N = len(b)
    sd = math.sqrt(V)
    x = 0.0
    e = [0.0] * N
    sx = sxx = 0.0
    cnt = 0
    for t in range(rounds):
        tot = 0.0
        for i in range(N):
            u = (e[i] if feedback else 0.0) + s * (x - b[i]) - rng.gauss(0, sd)
            if rng.random() < rho[i]:
                tot += u
                e[i] = 0.0
            else:
                e[i] = u if feedback else 0.0
        x -= alpha * tot / N
        if t >= burn:
            sx += x
            sxx += x * x
            cnt += 1
    m = sx / cnt
    return m, sxx / cnt - m * m
