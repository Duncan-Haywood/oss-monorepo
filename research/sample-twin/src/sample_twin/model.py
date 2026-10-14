"""Sample twin.  Real plant: double integrator x'' = u under a PD law u = -kp x - kd v computed at sample instants kT and
held constant (zero-order hold) over each period T.  Twin: continuous-time closed loop x'' + kd x' + kp x = 0, stable for
every kp, kd > 0 (overshoot exp(-pi zeta/sqrt(1-zeta^2)) with kp = wn^2, kd = 2 zeta wn, whatever wn).
Exact discretisation: x+ = x + T v + T^2 u/2, v+ = v + T u, i.e. the step matrix
    A = [[1 - kp T^2/2, T - kd T^2/2], [-kp T, 1 - kd T]],   tr A = 2 - kd T - kp T^2/2,   det A = 1 - kd T + kp T^2/2.
Jury's conditions reduce to  kp T/2 < kd < 2/T  (and kp > 0).
"""
import cmath
import math


def gains(wn, zeta):
    return wn * wn, 2.0 * zeta * wn


def step_matrix(kp, kd, T):
    return [[1 - kp * T * T / 2, T - kd * T * T / 2], [-kp * T, 1 - kd * T]]


def eigenvalues(kp, kd, T):
    tr = 2 - kd * T - kp * T * T / 2
    det = 1 - kd * T + kp * T * T / 2
    s = cmath.sqrt(tr * tr / 4 - det)
    return tr / 2 + s, tr / 2 - s


def spectral_radius(kp, kd, T):
    return max(abs(z) for z in eigenvalues(kp, kd, T))


def is_stable(kp, kd, T):
    """Closed-form Jury region for kp > 0."""
    return kp > 0 and kp * T / 2 < kd < 2.0 / T


def critical_wnT(zeta):
    """Largest wn*T with kp = wn^2, kd = 2 zeta wn inside the region: min(4 zeta, 1/zeta)."""
    return min(4 * zeta, 1 / zeta)


def design_poles(rho, phi, T):
    """Gains placing both closed-loop poles at rho e^{+-i phi} (discrete): tr = 2 rho cos(phi), det = rho^2."""
    tr, det = 2 * rho * math.cos(phi), rho * rho
    kp = (1 + det - tr) / (T * T)
    kd = (3 - tr - det) / (2 * T)
    return kp, kd


def twin_overshoot(zeta):
    return math.exp(-math.pi * zeta / math.sqrt(1 - zeta * zeta)) if zeta < 1 else 0.0


def simulate(kp, kd, T, x0, n, v0=0.0):
    """Exact sampled states (x_k, v_k), k = 0..n, via the step recurrence."""
    x, v = x0, v0
    out = [(x, v)]
    for _ in range(n):
        u = -kp * x - kd * v
        x, v = x + T * v + T * T * u / 2, v + T * u
        out.append((x, v))
    return out


def simulate_rk4(kp, kd, T, x0, n, sub=200, v0=0.0):
    """Independent check: RK4 on the continuous plant with the input held over each period (sub substeps)."""
    x, v = x0, v0
    h = T / sub
    out = [(x, v)]
    for _ in range(n):
        u = -kp * x - kd * v
        for _ in range(sub):
            # x' = v, v' = u (u constant): RK4 is exact for this polynomial flow, still run it as a check
            k1x, k1v = v, u
            k2x, k2v = v + h / 2 * k1v, u
            k3x, k3v = v + h / 2 * k2v, u
            k4x, k4v = v + h * k3v, u
            x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
            v += h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        out.append((x, v))
    return out


def inter_sample_extremes(kp, kd, T, x0, n, m=20):
    """Minimum of x(t) over the whole continuous trajectory (evaluated at m points per period)."""
    x, v = x0, 0.0
    lo = x
    for _ in range(n):
        u = -kp * x - kd * v
        for j in range(1, m + 1):
            tau = T * j / m
            lo = min(lo, x + v * tau + u * tau * tau / 2)
        x, v = x + T * v + T * T * u / 2, v + T * u
    return lo


def overshoot(kp, kd, T, n, x0=1.0):
    """Largest excursion past the target (x < 0), as a fraction of x0, over the continuous trajectory; inf if unstable."""
    if spectral_radius(kp, kd, T) >= 1:
        return math.inf
    return max(0.0, -inter_sample_extremes(kp, kd, T, x0, n) / x0)


def settle_time(kp, kd, T, n, x0=1.0, tol=0.02):
    """Last sample time at which the scaled state norm sqrt(x^2 + (v/sqrt(kp))^2) exceeds tol |x0| (inf if the loop is
    unstable or the run ends outside the band).  The norm, not x alone, so a weakly excited slow mode still counts."""
    if spectral_radius(kp, kd, T) >= 1:
        return math.inf
    w = math.sqrt(kp)
    last = -1
    for i, (x, v) in enumerate(simulate(kp, kd, T, x0, n)):
        if math.hypot(x, v / w) > tol * abs(x0):
            last = i
    return math.inf if last == n else (last + 1) * T
