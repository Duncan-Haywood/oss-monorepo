"""Auditing a digital twin against the real plant. Scalar LQ plant x' = a x + b u + w, w ~ N(0,1). The twin says the input gain is bh;
the deployed controller is u = -k*(bh) x + e with dither e ~ N(0, v). The auditor sees (x, u, x') and tests H0: bh = b with a
Gaussian-mixture e-process on the residual r = x' - a x - bh u = (b - bh) u + w."""
import math
import random

__all__ = ["cost", "optimal_gain", "regret", "stationary", "info_rate", "dither_cost_rate", "log_e", "predicted_delay",
           "audit_run", "peeking_z_alarm", "gain_slope", "regret_curvature", "dither_payoff_threshold"]


def cost(a, b, k, q=1.0, r=0.1, s2=1.0):
    c = a - b * k
    return math.inf if abs(c) >= 1 else s2 * (q + r * k * k) / (1 - c * c)


def optimal_gain(a, b, q=1.0, r=0.1):
    B = r * (1 - a * a) - q * b * b
    p = (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)
    return a * b * p / (r + b * b * p)


def regret(a, b, k, q=1.0, r=0.1, s2=1.0):
    return cost(a, b, k, q, r, s2) - cost(a, b, optimal_gain(a, b, q, r), q, r, s2)


def stationary(a, b, k, v=0.0):
    """Var x in closed loop under the true gain b with dither variance v: x' = (a-bk)x + b e + w."""
    c = a - b * k
    return (1 + b * b * v) / (1 - c * c)


def info_rate(a, b, k, v=0.0):
    """U = E u^2 per step = Fisher information about the gain error b per unit noise variance (u = -kx + e)."""
    return k * k * stationary(a, b, k, v) + v


def dither_cost_rate(a, b, k, q=1.0, r=0.1, v=1.0):
    """Extra stage cost per unit dither variance: r v + q b^2 v / (1-c^2) (the cost is linear in v)."""
    c = a - b * k
    return v * (r + q * b * b / (1 - c * c))


def log_e(S, R, tau2):
    """log of the mixture likelihood ratio, prior N(0, tau2) on the gain error, from S = sum u^2, R = sum u r."""
    return -0.5 * math.log1p(tau2 * S) + tau2 * R * R / (2 * (1 + tau2 * S))


def predicted_delay(db, U, alpha=0.05, tau2=1.0, nmax=10 ** 7):
    """First n at which the mixture e-process, fed its noiseless drift R = db*S, S = nU, crosses 1/alpha (n is found by doubling + bisection)."""
    L = math.log(1 / alpha)
    f = lambda n: log_e(n * U, db * n * U, tau2) - L
    lo, hi = 1.0, 2.0
    while f(hi) < 0:
        lo, hi = hi, hi * 2
        if hi > nmax:
            return math.inf
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
    return hi


def audit_run(a, b, bh, rng, v=0.0, alpha=0.05, tau2=1.0, horizon=20000, q=1.0, r=0.1):
    """Closed-loop audit of a twin with gain bh against the plant with gain b. Returns the step at which the e-process crosses 1/alpha
    (None if never within the horizon). The state starts in the real closed loop's stationary law."""
    k = optimal_gain(a, bh, q, r)
    c = a - b * k
    x = rng.gauss(0, math.sqrt(stationary(a, b, k, v)))
    sd = math.sqrt(v)
    L = math.log(1 / alpha)
    S = R = 0.0
    for t in range(1, horizon + 1):
        u = -k * x + (sd * rng.gauss(0, 1) if v else 0.0)
        w = rng.gauss(0, 1)
        xn = a * x + b * u + w
        res = xn - a * x - bh * u
        S += u * u
        R += u * res
        if log_e(S, R, tau2) >= L:
            return t
        x = xn
        if abs(x) > 1e9:
            return t
    return None


def peeking_z_alarm(rng, n, z=1.96):
    """Under H0 residuals are N(0,1) for any predictable u; a fixed-n z-test looked at after every step. Returns whether it ever rejects."""
    S = R = 0.0
    for _ in range(n):
        u = rng.gauss(0, 1)
        S += u * u
        R += u * rng.gauss(0, 1)
        if S > 0 and abs(R) / math.sqrt(S) > z:
            return True
    return False


def gain_slope(a, b, q=1.0, r=0.1, h=1e-5):
    return (optimal_gain(a, b + h, q, r) - optimal_gain(a, b - h, q, r)) / (2 * h)


def regret_curvature(a, b, q=1.0, r=0.1, h=1e-4):
    """J_kk at the optimum, by central differences."""
    k = optimal_gain(a, b, q, r)
    return (cost(a, b, k + h, q, r) - 2 * cost(a, b, k, q, r) + cost(a, b, k - h, q, r)) / h ** 2


def dither_payoff_threshold(a, b, bh, q=1.0, r=0.1):
    """Dither lowers the expected cost paid before detection iff regret/U0 > dither cost per unit of added information
    (both linear in v). Returns (regret per unit information, dither price per unit information)."""
    k = optimal_gain(a, bh, q, r)
    c = a - b * k
    U0 = info_rate(a, b, k)
    kap_u = 1 + k * k * b * b / (1 - c * c)
    kap_c = r + q * b * b / (1 - c * c)
    return regret(a, b, k, q, r) / U0, kap_c / kap_u
