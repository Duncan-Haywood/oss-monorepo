"""A scalar Kalman filter tuned inside a digital twin whose noise levels are wrong.
Real plant: x' = a x + w (var Q), sensor y = x + v (var R).  The twin has (Qt, Rt); the filter uses the twin's
steady-state gain Kt, which depends only on a and rho_t = Qt/Rt.  Posterior error e = x - xhat obeys
e' = (1-K)(a e + w) - K v, so its stationary variance under any fixed gain K is exact."""
import math, random

__all__ = ["prior_var", "opt_gain", "opt_mse", "mse", "twin_claim", "regret", "innovation_cov", "lag1_cov",
           "simulate", "mehra_gain", "retuned_regret"]


def prior_var(a, Q, R):
    """Stationary prior error variance of the optimal filter (positive root of the Riccati equation)."""
    b = a * a * R + Q - R
    return 0.5 * (b + math.sqrt(b * b + 4.0 * Q * R))


def opt_gain(a, Q, R):
    p = prior_var(a, Q, R)
    return p / (p + R)


def opt_mse(a, Q, R):
    p = prior_var(a, Q, R)
    return p * R / (p + R)


def mse(K, a, Q, R):
    """Stationary posterior error variance under fixed gain K; infinite if |(1-K)a| >= 1."""
    d = 1.0 - (1.0 - K) ** 2 * a * a
    if d <= 0.0:
        return math.inf
    return ((1.0 - K) ** 2 * Q + K * K * R) / d


def twin_claim(a, Qt, Rt):
    """The MSE the twin itself reports for its own optimal filter."""
    return opt_mse(a, Qt, Rt)


def regret(a, Q, R, rho_t):
    """Real MSE of the gain tuned at Qt/Rt = rho_t, over the real optimum, minus 1."""
    K = opt_gain(a, rho_t, 1.0)
    return mse(K, a, Q, R) / opt_mse(a, Q, R) - 1.0


def _prior_under_gain(K, a, Q, R):
    return (Q + a * a * K * K * R) / (1.0 - a * a * (1.0 - K) ** 2)


def innovation_cov(K, a, Q, R):
    """Var of the innovation nu = y - a xhat_prev under gain K."""
    return _prior_under_gain(K, a, Q, R) + R


def lag1_cov(K, a, Q, R):
    """Cov(nu_k, nu_{k+1}) = a[(1-K) Pi - K R]; zero iff K is the optimal gain (Mehra 1970)."""
    return a * ((1.0 - K) * _prior_under_gain(K, a, Q, R) - K * R)


def simulate(a, Q, R, K, n, rng, burn=200):
    """Run fixed-gain filter on the real plant; return (innovations, squared posterior errors) after burn-in."""
    x, xh = 0.0, 0.0
    nus, errs = [], []
    sq, sr = math.sqrt(Q), math.sqrt(R)
    for k in range(n + burn):
        x = a * x + rng.gauss(0, sq)
        y = x + rng.gauss(0, sr)
        pred = a * xh
        nu = y - pred
        xh = pred + K * nu
        if k >= burn:
            nus.append(nu)
            errs.append((x - xh) ** 2)
    return nus, errs


def mehra_gain(nus, K, a, floor=1e-6):
    """Retune from innovations of a filter running with gain K: c0 = Pi+R, c1 = a(Pi - K c0) give Pi and R,
    then Q from the stationary-prior relation; returns (Khat, Qhat, Rhat, clipped)."""
    n = len(nus)
    c0 = sum(v * v for v in nus) / n
    c1 = sum(nus[i] * nus[i + 1] for i in range(n - 1)) / (n - 1)
    Pi = c1 / a + K * c0
    R = c0 - Pi
    Q = Pi * (1.0 - a * a * (1.0 - K) ** 2) - a * a * K * K * R
    clipped = R <= floor * c0 or Q <= floor * c0
    R = max(R, floor * c0)
    Q = max(Q, floor * c0)
    return opt_gain(a, Q, R), Q, R, clipped


def retuned_regret(a, Q, R, rho_t, n, reps, seed=0):
    """Mean and median real regret after one Mehra retune from n innovations; also the clipped fraction."""
    rng = random.Random(seed)
    K0 = opt_gain(a, rho_t, 1.0)
    star = opt_mse(a, Q, R)
    rs, clip = [], 0
    for _ in range(reps):
        nus, _ = simulate(a, Q, R, K0, n, rng)
        K1, _, _, c = mehra_gain(nus, K0, a)
        clip += c
        rs.append(mse(K1, a, Q, R) / star - 1.0)
    rs.sort()
    return sum(rs) / reps, rs[reps // 2], clip / reps
