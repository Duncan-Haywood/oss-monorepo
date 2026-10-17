"""Closed-loop oscillator x'' = -k (x - 1) - c x' stepped by a twin's fixed-step integrator vs the exact flow.

Units: time in 1/omega0 so the stiffness is k=1 (omega0=1) and the damping is c=2*zeta. Pure Python.
"""
import cmath, math

METHODS = ("explicit", "semi-implicit", "implicit")
__all__ = ["METHODS", "step_matrix", "rho2_exact", "rho2_real", "eigs", "spectral_radius", "equiv_zeta", "equiv_sigma",
           "sigma_first_order", "twin_response", "twin_overshoot", "real_overshoot", "real_rk4_overshoot",
           "tune_c", "richardson_overshoot", "zeta_of_overshoot", "overshoot_of_zeta"]


def step_matrix(method, h, k, c):
    """One-step map on (e, v), e = x - 1. explicit: both updated from old state; semi-implicit: v first then
    e with the new v; implicit (backward Euler): (I - hA)^{-1}."""
    if method == "explicit":
        return [[1.0, h], [-h * k, 1.0 - h * c]]
    if method == "semi-implicit":
        return [[1.0 - h * h * k, h * (1.0 - h * c)], [-h * k, 1.0 - h * c]]
    if method == "implicit":
        d = 1.0 + h * c + h * h * k
        return [[(1.0 + h * c) / d, h / d], [-h * k / d, 1.0 / d]]
    raise ValueError(method)


def rho2_exact(method, h, k, c):
    """Per-step squared modulus of the (complex) eigenvalues = determinant of the step matrix."""
    if method == "explicit":
        return 1.0 - h * c + h * h * k
    if method == "semi-implicit":
        return 1.0 - h * c
    if method == "implicit":
        return 1.0 / (1.0 + h * c + h * h * k)
    raise ValueError(method)


def rho2_real(h, c):
    """Exact flow: e^{-hc} for any k (determinant of expm(hA))."""
    return math.exp(-h * c)


def eigs(M):
    tr = M[0][0] + M[1][1]
    det = M[0][0] * M[1][1] - M[0][1] * M[1][0]
    s = cmath.sqrt(tr * tr / 4.0 - det)
    return tr / 2.0 + s, tr / 2.0 - s


def spectral_radius(method, h, k, c):
    return max(abs(z) for z in eigs(step_matrix(method, h, k, c)))


def equiv_zeta(method, h, k, c):
    """Damping ratio of the continuous-time pole that the twin's eigenvalue z maps to (lambda = ln z / h)."""
    z = eigs(step_matrix(method, h, k, c))[0]
    lam = cmath.log(z) / h
    return -lam.real / abs(lam)


def equiv_sigma(method, h, k, c):
    z = eigs(step_matrix(method, h, k, c))[0]
    return -(cmath.log(z) / h).real


def sigma_first_order(method, h, k, c):
    """Modified-equation prediction sigma_T ~ c/2 + h*b/2 with b = k - c^2/2 (implicit), c^2/2 - k (explicit),
    c^2/2 (semi-implicit): the O(h) damping the integrator adds."""
    b = {"explicit": c * c / 2.0 - k, "semi-implicit": c * c / 2.0, "implicit": k - c * c / 2.0}[method]
    return c / 2.0 + h * b / 2.0


def overshoot_of_zeta(z):
    return math.exp(-math.pi * z / math.sqrt(1.0 - z * z)) if z < 1.0 else 0.0


def zeta_of_overshoot(o):
    L = -math.log(o)
    return L / math.sqrt(math.pi ** 2 + L * L)


def real_overshoot(k, c):
    return overshoot_of_zeta(c / (2.0 * math.sqrt(k)))


def twin_response(method, h, k, c, t_end):
    """Sampled unit-step response x_n of the twin from rest."""
    M = step_matrix(method, h, k, c)
    e, v = -1.0, 0.0
    xs = [0.0]
    for _ in range(int(round(t_end / h))):
        e, v = M[0][0] * e + M[0][1] * v, M[1][0] * e + M[1][1] * v
        xs.append(1.0 + e)
    return xs


def twin_overshoot(method, h, k, c, t_end=None):
    """Peak of the sampled response above 1 (what the twin's log shows). Returns inf if the twin diverges."""
    if spectral_radius(method, h, k, c) >= 1.0:
        return math.inf
    if t_end is None:
        t_end = min(4.0 * math.pi / math.sqrt(k), 60.0)   # the first peak is at t <= pi/omega_d; two periods is ample
    return max(0.0, max(twin_response(method, h, k, c, t_end)) - 1.0)


def real_rk4_overshoot(k, c, dt=1e-3, t_end=None):
    """Independent check of the closed form: RK4 of the ODE at a tiny step."""
    if t_end is None:
        t_end = 4.0 * math.pi / math.sqrt(k)
    e, v, peak = -1.0, 0.0, 0.0
    f = lambda e, v: (v, -k * e - c * v)
    for _ in range(int(round(t_end / dt))):
        a1 = f(e, v); a2 = f(e + dt / 2 * a1[0], v + dt / 2 * a1[1])
        a3 = f(e + dt / 2 * a2[0], v + dt / 2 * a2[1]); a4 = f(e + dt * a3[0], v + dt * a3[1])
        e += dt / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]); v += dt / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1])
        peak = max(peak, e)
    return max(0.0, peak)


def tune_c(method, h, k, target, iters=80, c_max=None):
    """The designer's procedure: the smallest damping c whose twin overshoot is <= target. Scan c upward from
    0 in small steps (an unstable twin counts as infinite overshoot), then bisect the first crossing."""
    step = 0.005 * math.sqrt(k)
    c_max = 8.0 * math.sqrt(k) if c_max is None else c_max
    prev = 0.0
    c = step
    while c <= c_max:
        if twin_overshoot(method, h, k, c) <= target:
            lo, hi = prev, c
            for _ in range(iters):
                mid = (lo + hi) / 2.0
                if twin_overshoot(method, h, k, mid) > target:
                    lo = mid
                else:
                    hi = mid
            return hi
        prev = c
        c += step
    return None


def richardson_overshoot(method, h, k, c):
    """First-order extrapolation 2*o(h/2) - o(h) of the twin's overshoot at fixed c."""
    return 2.0 * twin_overshoot(method, h / 2.0, k, c) - twin_overshoot(method, h, k, c)
