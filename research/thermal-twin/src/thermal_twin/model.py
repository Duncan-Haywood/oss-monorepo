"""Thermal twin.  A motor holds a constant load torque tau.  Winding temperature rise theta obeys C theta' = R i^2 - theta/Rth.
Real torque constant k(theta) = k0 (1 - alpha theta) (magnet derating), winding resistance R(theta) = R0 (1 + beta theta).
Holding needs k(theta) i = tau, so i = tau / (k0 (1 - alpha theta)).  Twin: alpha = beta = 0, i = tau/k0, theta = c tau^2.

Nondimensional: phi = alpha theta, lam = alpha c tau^2 with c = R0 Rth / k0^2, time in units of Rth C.  For beta = 0
    phi' = g(phi) = lam / (1 - phi)^2 - phi,
steady states solve phi (1 - phi)^2 = lam, which has a solution iff lam <= 4/27 (fold at phi = 1/3).  The twin says phi = lam.
"""
import math

LAM_C = 4.0 / 27.0      # fold of phi (1-phi)^2 = lam (beta = 0)
PHI_C = 1.0 / 3.0


def twin_phi(lam):
    """Constant-gain twin steady state."""
    return lam


def steady_phi(lam, beta_over_alpha=0.0):
    """Smallest steady state phi in [0, 1) of phi (1 - phi)^2 = lam (1 + b phi), b = beta/alpha, or None (no hold)."""
    b = beta_over_alpha

    def h(p):
        return p * (1 - p) ** 2 - lam * (1 + b * p)

    # h(0) = -lam < 0; scan for the first sign change, then bisect
    n = 20000
    prev = 0.0
    for i in range(1, n + 1):
        p = i / n
        if h(p) >= 0:
            lo, hi = prev, p
            for _ in range(80):
                mid = 0.5 * (lo + hi)
                if h(mid) >= 0:
                    hi = mid
                else:
                    lo = mid
            return 0.5 * (lo + hi)
        prev = p
    return None


def lam_max(beta_over_alpha=0.0):
    """Largest lam with a steady hold: max over phi of phi (1-phi)^2 / (1 + b phi)."""
    b = beta_over_alpha
    best, arg = 0.0, 0.0
    n = 200000
    for i in range(1, n):
        p = i / n
        v = p * (1 - p) ** 2 / (1 + b * p)
        if v > best:
            best, arg = v, p
    return best, arg


def rhs(phi, lam, b=0.0):
    return lam * (1 + b * phi) / (1 - phi) ** 2 - phi


def simulate(lam, t_end, dt=1e-3, b=0.0, phi0=0.0):
    """RK4 on phi' = rhs, stopping when phi >= 0.999 (torque constant gone).  Returns (times, phis)."""
    ts, ps = [0.0], [phi0]
    t, p = 0.0, phi0
    n = int(round(t_end / dt))
    for _ in range(n):
        k1 = rhs(p, lam, b)
        k2 = rhs(p + dt / 2 * k1, lam, b)
        k3 = rhs(p + dt / 2 * k2, lam, b)
        k4 = rhs(p + dt * k3, lam, b)
        p += dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        t += dt
        ts.append(t)
        ps.append(p)
        if p >= 0.999:
            break
    return ts, ps


def runaway_time(lam, b=0.0, phi_end=0.999, n=200000):
    """Time to go from phi = 0 to phi_end for lam > lam_max: int dphi / g(phi) (midpoint rule; g > 0 throughout)."""
    h = phi_end / n
    s = 0.0
    for i in range(n):
        p = (i + 0.5) * h
        g = rhs(p, lam, b)
        if g <= 0:
            return math.inf
        s += h / g
    return s


def ghost_time(eps):
    """Near-fold passage time 4 pi / (9 sqrt(eps)), eps = lam - 4/27 (beta = 0)."""
    return 4 * math.pi / (9 * math.sqrt(eps))


def current_ratio(phi):
    """Real holding current over the twin's: 1 / (1 - phi)."""
    return 1.0 / (1 - phi)


def tau_overestimate(phi_limit):
    """Twin-admissible torque (theta <= theta_max) over real-admissible torque, beta = 0: 1/(1-phi_m) for phi_m <= 1/3,
    sqrt(phi_m / (4/27)) above (fold-limited)."""
    if phi_limit <= PHI_C:
        return 1.0 / (1 - phi_limit)
    return math.sqrt(phi_limit / LAM_C)
