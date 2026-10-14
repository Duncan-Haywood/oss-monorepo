"""Gust twin.  Vehicle position error x held by PD feedback against a wind-gust force d (unit mass):
    x'' = -kp x - kd x' + d.
Real gust: Ornstein-Uhlenbeck, d' = -a d + sqrt(2 a s2) w, marginal variance s2, correlation time 1/a.
Twin gust (variance-matched): iid N(0, s2) each step of length dt, held constant over the step.
Spectrum-matched white twin: white noise with the real low-frequency density, E[w w'] = (2 s2 / a) delta.
Exact stationary variance of x under the real gust (Lyapunov equation):
    Var_real = s2 (a + kd) / (kd kp (a^2 + a kd + kp)).
"""
import math
import random


def real_var(kp, kd, a, s2):
    return s2 * (a + kd) / (kd * kp * (a * a + a * kd + kp))


def white_var(kp, kd, q):
    """Stationary Var(x) of x'' + kd x' + kp x = w with E[w w'] = q delta:  q / (2 kd kp)."""
    return q / (2.0 * kd * kp)


def psd_matched_var(kp, kd, a, s2):
    return white_var(kp, kd, 2.0 * s2 / a)


def twin_var_continuum(kp, kd, s2, dt):
    """Small-dt value of the variance-matched twin: white density s2 dt."""
    return white_var(kp, kd, s2 * dt)


def ratio_real_over_psd(kp, kd, a):
    """Var_real / Var_psd-matched = a (a + kd) / (a^2 + a kd + kp) < 1: the spectrum-matched twin always overstates."""
    return a * (a + kd) / (a * a + a * kd + kp)


def ratio_real_over_twin(kp, kd, a, dt):
    """Var_real / Var_variance-matched-twin (small dt) = 2 (a + kd) / (dt (a^2 + a kd + kp))."""
    return 2.0 * (a + kd) / (dt * (a * a + a * kd + kp))


def crossover_dt(kp, kd, a):
    """Step at which the continuum variance-matched twin would happen to be exact."""
    return 2.0 * (a + kd) / (a * a + a * kd + kp)


# ---- small dense linear algebra on lists ----
def mm(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(len(B))) for j in range(len(B[0]))] for i in range(len(A))]


def mt(A):
    return [list(r) for r in zip(*A)]


def madd(A, B):
    return [[x + y for x, y in zip(r, s)] for r, s in zip(A, B)]


def expm(A, terms=18):
    """Matrix exponential by scaling and squaring with a Taylor series."""
    n = len(A)
    nrm = max(sum(abs(x) for x in r) for r in A)
    s = max(0, int(math.ceil(math.log2(nrm))) + 1) if nrm > 0.5 else 0
    B = [[x / 2 ** s for x in r] for r in A]
    E = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    T = [r[:] for r in E]
    for k in range(1, terms):
        T = [[x / k for x in r] for r in mm(T, B)]
        E = madd(E, T)
    for _ in range(s):
        E = mm(E, E)
    return E


def dlyap(Phi, Q, iters=60):
    """Solve P = Phi P Phi' + Q by doubling."""
    P, F = [r[:] for r in Q], [r[:] for r in Phi]
    for _ in range(iters):
        P = madd(P, mm(mm(F, P), mt(F)))
        F = mm(F, F)
    return P


def cholesky(S, jitter=1e-14):
    n = len(S)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = S[i][j] - sum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                L[i][i] = math.sqrt(max(s, 0.0) + jitter)
            else:
                L[i][j] = s / L[j][j]
    return L


def real_matrices(kp, kd, a, s2):
    """Joint (x, v, d) linear SDE: A, and noise intensity Q on d."""
    A = [[0, 1, 0], [-kp, -kd, 1], [0, 0, -a]]
    Q = [[0, 0, 0], [0, 0, 0], [0, 0, 2 * a * s2]]
    return A, Q


def real_discrete(kp, kd, a, s2, dt):
    """Exact discretisation of the joint SDE (Van Loan): Phi, Qd."""
    A, Q = real_matrices(kp, kd, a, s2)
    n = 3
    M = [[0.0] * (2 * n) for _ in range(2 * n)]
    for i in range(n):
        for j in range(n):
            M[i][j] = -A[i][j] * dt
            M[i + n][j + n] = A[j][i] * dt
            M[i][j + n] = Q[i][j] * dt
    E = expm(M)
    Phi = mt([[E[i + n][j + n] for j in range(n)] for i in range(n)])
    Qd = mm(Phi, [[E[i][j + n] for j in range(n)] for i in range(n)])
    Qd = [[(Qd[i][j] + Qd[j][i]) / 2 for j in range(n)] for i in range(n)]
    return Phi, Qd


def real_var_exact_discrete(kp, kd, a, s2, dt):
    Phi, Qd = real_discrete(kp, kd, a, s2, dt)
    return dlyap(Phi, Qd)[0][0]


def twin_discrete(kp, kd, dt):
    """Exact zero-order-hold discretisation of x'' = -kp x - kd x' + d with d held over the step: Phi (2x2), Gamma (2)."""
    M = [[0, 1, 0], [-kp, -kd, 1], [0, 0, 0]]
    E = expm([[x * dt for x in r] for r in M])
    return [[E[0][0], E[0][1]], [E[1][0], E[1][1]]], [E[0][2], E[1][2]]


def twin_var_exact(kp, kd, s2, dt):
    """Stationary Var(x) of the variance-matched twin (iid N(0,s2) per step, held) at step dt."""
    Phi, G = twin_discrete(kp, kd, dt)
    Q = [[s2 * G[i] * G[j] for j in range(2)] for i in range(2)]
    return dlyap(Phi, Q)[0][0]


def simulate_real(kp, kd, a, s2, dt, steps, seed, burn=2000):
    Phi, Qd = real_discrete(kp, kd, a, s2, dt)
    L = cholesky(Qd)
    rng = random.Random(seed)
    x = [0.0, 0.0, math.sqrt(s2) * rng.gauss(0, 1)]
    acc, n = 0.0, 0
    for k in range(steps + burn):
        z = [rng.gauss(0, 1) for _ in range(3)]
        w = [sum(L[i][j] * z[j] for j in range(i + 1)) for i in range(3)]
        x = [sum(Phi[i][j] * x[j] for j in range(3)) + w[i] for i in range(3)]
        if k >= burn:
            acc += x[0] * x[0]
            n += 1
    return acc / n


def simulate_twin(kp, kd, s2, dt, steps, seed, burn=2000):
    Phi, G = twin_discrete(kp, kd, dt)
    rng = random.Random(seed)
    s = math.sqrt(s2)
    x = [0.0, 0.0]
    acc, n = 0.0, 0
    for k in range(steps + burn):
        d = s * rng.gauss(0, 1)
        x = [Phi[0][0] * x[0] + Phi[0][1] * x[1] + G[0] * d, Phi[1][0] * x[0] + Phi[1][1] * x[1] + G[1] * d]
        if k >= burn:
            acc += x[0] * x[0]
            n += 1
    return acc / n


def fit_ou_from_lag1(samples, delta):
    """Fit (a, s2) of an OU gust from samples at spacing delta: rho = exp(-a delta), s2 = sample variance."""
    n = len(samples)
    m = sum(samples) / n
    c0 = sum((x - m) ** 2 for x in samples) / n
    c1 = sum((samples[i] - m) * (samples[i + 1] - m) for i in range(n - 1)) / n
    rho = c1 / c0
    return -math.log(rho) / delta, c0


def normal_sf(z):
    return 0.5 * math.erfc(z / math.sqrt(2.0))


def exceedance(margin, var):
    """P(|x| > margin) for x ~ N(0, var)."""
    return 2.0 * normal_sf(margin / math.sqrt(var))


def margin_for(eps, var):
    """Symmetric margin with P(|x| > m) = eps, by bisection on the normal tail."""
    lo, hi = 0.0, 40.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if 2 * normal_sf(mid) > eps:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2 * math.sqrt(var)
