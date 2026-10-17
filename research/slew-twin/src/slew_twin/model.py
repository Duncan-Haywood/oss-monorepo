"""Slew twin.  Plant x+ = x + a+, actuator command a+ = a + clip(-k x - a, -r, r): the real actuator can change its
output by at most r per step.  The twin has no rate limit (r = inf), so a+ = -k x and x+ = (1-k) x: first order, never crosses zero.

The system is positively homogeneous: scaling (x0, r) by c scales the whole trajectory by c, so the real response is a
function of rho = x0/r and k only.  The twin is exact iff no command increment exceeds r, i.e. iff
x0 <= r / k: the twin's command increments are -k x0 at t=0 and k^2 x_{t-1} > 0 afterwards, and k^2 <= k.
For k = 1/n the smallest rho = x0/r at which the real loop crosses zero is empirically 2n(2n-1) (not proved).
"""
import math


def step(x, a, k, r=math.inf):
    a = a + max(-r, min(r, -k * x - a))
    return x + a, a


def trajectory(x0, k, r=math.inf, n=200):
    x, a, xs = x0, 0.0, [x0]
    for _ in range(n):
        x, a = step(x, a, k, r)
        xs.append(x)
    return xs


def increment_ratio(k, n=2000):
    """c(k): largest |command increment| of the unlimited twin from x0 = 1, a0 = 0 (equals k for 0 < k <= 1)."""
    x, a, c = 1.0, 0.0, 0.0
    for _ in range(n):
        inc = -k * x - a
        c = max(c, abs(inc))
        x, a = step(x, a, k)
    return c


def valid_amplitude(k, r):
    """Largest x0 for which the rate-limited loop equals the twin exactly."""
    return r / increment_ratio(k)


def undershoot(xs):
    """Largest excursion past zero as a fraction of x0 (0 if the trajectory never crosses)."""
    return max(0.0, -min(xs) / xs[0])


def settle_steps(x0, k, r, tol=0.01, n=400000):
    """First step after which |x| <= tol*x0 for good (checked against a settled velocity too); None if not by n."""
    x, a, last_out = x0, 0.0, 0
    for t in range(1, n + 1):
        x, a = step(x, a, k, r)
        if abs(x) > tol * x0:
            last_out = t
        elif abs(a) < 1e-12 * x0 and abs(x) < 1e-12 * x0:
            return last_out + 1
    return None


def crosses_zero(k, rho, r=1.0):
    """Does the rate-limited loop from x0 = rho*r ever go below zero?"""
    x, a = rho * r, 0.0
    for _ in range(int(4 * k * rho) + int(60 / k) + 100):
        x, a = step(x, a, k, r)
        if x < 0:
            return True
    return False


def critical_ratio(k, iters=60):
    """Bisection for the smallest rho at which the loop crosses zero (assumes crossing is monotone in rho)."""
    lo, hi = k, 6 * (2 - k) / k ** 2 + 10
    for _ in range(iters):
        mid = (lo + hi) / 2
        if crosses_zero(k, mid):
            hi = mid
        else:
            lo = mid
    return hi
