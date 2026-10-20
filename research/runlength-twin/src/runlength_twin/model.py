"""How long must a real test run be, when its length is sized in a twin with the wrong plant pole?

Real plant  x' = a x + b u + w,  w ~ N(0, W); a fixed gain K designed in the twin (pole a_t = m a)
gives the real closed-loop pole  ac = a - b K.  The per-step cost is c x^2 with c = q + r K^2, so the
time-averaged cost of an n-step stationary run has relative variance (exact, Gaussian AR(1)):
    Var(mean x^2) / E[x^2]^2 = (2/n) [ (1+rho)/(1-rho) - 2 rho (1-rho^n) / (n (1-rho)^2) ],  rho = ac^2,
because cov(x_t^2, x_{t+k}^2) = 2 cov(x_t, x_{t+k})^2.  The run length for relative half-width eps at
z-level z is n ~ 2 z^2 (1+rho) / ((1-rho) eps^2) (asymptotic) or the smallest n with z*sd <= eps (exact).
"""
import math, random

__all__ = ["riccati_gain", "closed_pole", "rho_of", "rel_var", "rel_var_bruteforce", "n_asym", "n_exact",
           "halfwidth", "coverage", "sizing_ratio", "simulate_rel_var", "pilot_rho", "pilot_size"]


def riccati_gain(a, b, q, r, iters=100000, tol=1e-15):
    P = q
    for _ in range(iters):
        K = a * b * P / (r + b * b * P)
        Pn = q + a * a * P - a * b * P * K
        if abs(Pn - P) < tol * max(1.0, abs(P)):
            P = Pn
            break
        P = Pn
    return a * b * P / (r + b * b * P)


def closed_pole(K, a, b):
    return a - b * K


def rho_of(ac):
    """Lag-one autocorrelation of x^2 (and geometric ratio of its autocorrelation): ac^2."""
    return ac * ac


def rel_var(n, rho):
    """Exact relative variance of the mean of n consecutive stationary x_t^2."""
    if not 0 <= rho < 1:
        raise ValueError("need 0 <= rho < 1 (stable closed loop)")
    if rho == 0:
        return 2.0 / n
    return (2.0 / n) * ((1 + rho) / (1 - rho) - 2 * rho * (1 - rho ** n) / (n * (1 - rho) ** 2))


def rel_var_bruteforce(n, rho):
    """Same quantity from the definition: (1/n^2) sum_{s,t} 2 rho^{|s-t|}."""
    return sum(2 * rho ** abs(s - t) for s in range(n) for t in range(n)) / (n * n)


def n_asym(eps, rho, z=1.959964):
    return 2 * z * z * (1 + rho) / ((1 - rho) * eps * eps)


def n_exact(eps, rho, z=1.959964):
    """Smallest n with z * sqrt(rel_var(n, rho)) <= eps (rel_var is decreasing in n)."""
    lo, hi = 1, 2
    while z * math.sqrt(rel_var(hi, rho)) > eps:
        lo, hi = hi, hi * 2
    while lo < hi:
        mid = (lo + hi) // 2
        if z * math.sqrt(rel_var(mid, rho)) <= eps:
            hi = mid
        else:
            lo = mid + 1
    return lo


def halfwidth(n, rho, z=1.959964):
    return z * math.sqrt(rel_var(n, rho))


def _phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def coverage(n, rho_true, rho_nominal, z=1.959964):
    """Normal-approximation coverage of an interval whose width was set assuming rho_nominal."""
    s = math.sqrt(rel_var(n, rho_true) / rel_var(n, rho_nominal))
    return 2 * _phi(z / s) - 1


def sizing_ratio(rho_true, rho_twin):
    """Asymptotic ratio (run length needed in reality) / (run length sized in the twin)."""
    return ((1 + rho_true) / (1 - rho_true)) * ((1 - rho_twin) / (1 + rho_twin))


def simulate_rel_var(ac, n, reps, seed=0, burn=200):
    """Monte Carlo relative variance of the run mean of x^2 (unit-variance-normalised)."""
    rng = random.Random(seed)
    s = math.sqrt(1 - ac * ac)          # stationary variance 1
    means = []
    for _ in range(reps):
        x = rng.gauss(0, 1)
        for _ in range(burn):
            x = ac * x + s * rng.gauss(0, 1)
        tot = 0.0
        for _ in range(n):
            x = ac * x + s * rng.gauss(0, 1)
            tot += x * x
        means.append(tot / n)
    m = sum(means) / reps
    return sum((v - m) ** 2 for v in means) / (reps - 1) / (m * m)


def pilot_rho(xs):
    """Plug-in rho = phi_hat^2 from the lag-one autocorrelation of a real pilot trajectory."""
    m = sum(xs) / len(xs)
    d = [v - m for v in xs]
    phi = sum(d[i] * d[i + 1] for i in range(len(d) - 1)) / sum(v * v for v in d)
    return min(phi * phi, 0.999)


def pilot_size(xs, eps, z=1.959964):
    return n_exact(eps, pilot_rho(xs), z)
