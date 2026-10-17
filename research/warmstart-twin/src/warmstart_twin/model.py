"""Initialisation (cold-start) bias of a short digital-twin run.  A twin reset to a default state (empty queue, zero error)
and averaged over n steps is biased toward that state.  This module gives the exact bias, variance and MSE of the run mean
for AR(1) output started at x0=a (optionally deleting the first d steps), the exact empty-start bias constant of the M/M/1
waiting time (via Spitzer's identity), and batch-means / MSER-5 helpers."""
import math, random

__all__ = ["ar1_start_bias", "ar1_start_var", "ar1_start_mse", "best_deletion", "ar1_path_from", "ar1_state_tolerance",
           "mm1_bias_const", "mm1_bias_series", "mm1_bias_pred", "mm1_n_star", "mm1_relax", "mm1_stationary_wait", "mm1_waits_from", "mm1_mean_wait", "mm1_asym_var",
           "mser_cut", "batch_ci", "T975"]

T975 = {4: 2.776, 9: 2.262, 19: 2.093, 29: 2.045, 49: 2.010, 99: 1.984}


def ar1_start_bias(n, phi, a, d=0):
    """Exact E[mean of x_{d+1..n}] - 0 for a stationary-mean-0 AR(1) with x_0 = a (deterministic): a * sum phi^k / (n-d)."""
    m = n - d
    return a * phi ** (d + 1) * (1.0 - phi ** m) / ((1.0 - phi) * m)


def ar1_start_var(n, phi, s2=1.0, d=0):
    """Exact Var of mean of x_{d+1..n} given the deterministic start x_0 (marginal variance s2, innovation variance s2(1-phi^2)):
    s2(1-phi^2) sum_j w_j^2, w_j = (1/(n-d)) sum_{k=max(j,d+1)}^n phi^(k-j)."""
    m = n - d
    tot = 0.0
    for j in range(1, n + 1):
        if j <= d + 1:
            w = phi ** (d + 1 - j) * (1.0 - phi ** m) / (1.0 - phi)
        else:
            w = (1.0 - phi ** (n - j + 1)) / (1.0 - phi)
        tot += w * w
    return s2 * (1.0 - phi * phi) * tot / (m * m)


def ar1_start_mse(n, phi, a, d=0, s2=1.0):
    b = ar1_start_bias(n, phi, a, d)
    return b * b + ar1_start_var(n, phi, s2, d)


def best_deletion(n, phi, a, s2=1.0, dmax=None):
    """(d*, mse(d*), mse(0)): the MSE-minimising number of deleted warm-up steps out of a fixed budget n."""
    dmax = n // 2 if dmax is None else dmax
    best = min(range(dmax + 1), key=lambda d: ar1_start_mse(n, phi, a, d, s2))
    return best, ar1_start_mse(n, phi, a, best, s2), ar1_start_mse(n, phi, a, 0, s2)


def ar1_state_tolerance(n, phi, kappa, s2=1.0):
    """Largest |x_0 error| (in units of the marginal sd) for which |bias| <= kappa * sd(run mean), stationary-start variance
    approximated by the exact stationary-run formula: solves phi(1-phi^n)/((1-phi) n) * delta = kappa * sqrt(Var)."""
    v = s2 / (n * n) * (n + 2.0 * sum((n - k) * phi ** k for k in range(1, n)))
    unit = phi * (1.0 - phi ** n) / ((1.0 - phi) * n)
    return kappa * math.sqrt(v) / unit / math.sqrt(s2)


def ar1_path_from(phi, n, rng, x0, s2=1.0):
    """x_1..x_n with x_0 = x0 given."""
    innov = math.sqrt(s2 * (1.0 - phi * phi))
    x, out = x0, []
    for _ in range(n):
        x = phi * x + rng.gauss(0.0, innov)
        out.append(x)
    return out


def mm1_mean_wait(rho):
    return rho / (1.0 - rho)


def mm1_asym_var(rho):
    """lim n Var(mean of n consecutive stationary waits), service rate 1 (Daley 1968; Whitt 1989)."""
    return rho * (2.0 + 5.0 * rho - 4.0 * rho ** 2 + rho ** 3) / (1.0 - rho) ** 4


def mm1_bias_series(rho, tol=1e-13):
    """C = sum_{m>=1} (E W_inf - E W_m) for the M/M/1 wait in queue (service rate 1) started empty with W_1 = 0.
    By Spitzer's identity E W_inf - E W_m = sum_{k>=m} E[S_k^+]/k, so C = sum_{k>=1} E[S_k^+], S_k = Gamma(k,1) - Gamma(k,rho),
    and E[S_k^+] = sum_{i<k} (k-i) NB(i; k, p), p = rho/(1+rho): exact (a finite sum per k).  Slow near rho=1; see mm1_bias_const."""
    p, q = rho / (1.0 + rho), 1.0 / (1.0 + rho)
    lp, lq = math.log(p), math.log(q)
    total, k = 0.0, 1
    while True:
        lt = k * lp                      # log NB pmf at i = 0
        e = 0.0
        for i in range(k):
            e += (k - i) * math.exp(lt)
            lt += math.log((k + i) / (i + 1.0)) + lq
        total += e
        if e < tol and k > 5:
            return total
        k += 1


def mm1_bias_const(rho):
    """Closed form C = rho/(1-rho)^3.  Not derived here: it is the value the exact series mm1_bias_series returns
    (agreement to 1e-11 at rho = 0.3, 0.5, 0.7, 0.9 is checked in tests), i.e. a numerically verified identity."""
    return rho / (1.0 - rho) ** 3


def mm1_n_star(rho):
    """Run length at which the large-n bias C/n equals one asymptotic standard deviation sqrt(V/n): n* = C^2/V
    = rho / ((1-rho)^2 (2+5rho-4rho^2+rho^3))."""
    return mm1_bias_const(rho) ** 2 / mm1_asym_var(rho)


def mm1_relax(rho):
    """Relaxation time (in jobs) of the M/M/1 queue: 1/(1-sqrt(rho))^2 (standard heavy-traffic scale for the spectral gap of the
    discrete-time queue with these rates; a scale, not an exact decay time)."""
    return 1.0 / (1.0 - math.sqrt(rho)) ** 2


def mm1_bias_pred(rho, n):
    """Large-n bias of the mean of the first n empty-start waits: -C(rho)/n."""
    return -mm1_bias_const(rho) / n


def mm1_stationary_wait(rho, rng):
    """Exact draw from the stationary M/M/1 wait in queue: 0 w.p. 1-rho, else Exp(1-rho)."""
    return 0.0 if rng.random() < 1.0 - rho else rng.expovariate(1.0 - rho)


def mm1_waits_from(rho, n, rng, start=0.0):
    """n consecutive waits (service rate 1) with the first wait equal to `start` (0 = empty and idle)."""
    w, out = start, []
    for _ in range(n):
        out.append(w)
        w = max(0.0, w + rng.expovariate(1.0) - rng.expovariate(rho))
    return out


def mser_cut(xs, b=5):
    """MSER-b (White 1997): batch xs into means of b, pick the deletion d (in batches, <= half the run) minimising
    sum_{j>d}(y_j - ybar_d)^2 / (m-d)^2; returns the number of raw observations to delete."""
    m = len(xs) // b
    y = [sum(xs[i * b:(i + 1) * b]) / b for i in range(m)]
    best, bd = None, 0
    suf = [0.0] * (m + 1)
    suf2 = [0.0] * (m + 1)
    for i in range(m - 1, -1, -1):
        suf[i] = suf[i + 1] + y[i]
        suf2[i] = suf2[i + 1] + y[i] * y[i]
    for d in range(m // 2 + 1):
        r = m - d
        ss = suf2[d] - suf[d] ** 2 / r
        v = ss / (r * r)
        if best is None or v < best:
            best, bd = v, d
    return bd * b


def batch_ci(xs, b=30):
    """(mean, half-width) from b contiguous batch means with a Student-t quantile."""
    L = len(xs) // b
    bm = [sum(xs[i * L:(i + 1) * L]) / L for i in range(b)]
    m = sum(bm) / b
    sd = math.sqrt(sum((x - m) ** 2 for x in bm) / (b - 1))
    return m, T975[b - 1] * sd / math.sqrt(b)
