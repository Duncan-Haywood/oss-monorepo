"""Ground-effect twin: altitude hold of a rotorcraft near the ground, twin without ground effect vs real vehicle with it.

Thrust multiplier at constant power (Cheeseman & Bennett 1955): G(z) = 1/(1 - (Rr/(4z))^2), z = rotor height, Rr = rotor radius,
valid for z >= Rr/2 here. Unit mass, gravity g. Controller: thrust command T_c = g + kp (zr - z) - kd z' (gravity feedforward,
no integrator), actual thrust T = G(z) T_c. The twin has G = 1.

Linearisation about the real equilibrium z_e (G(z_e) T_c = g):  d'' = -(G kp) d - (G kd) d' - (G'/G) g d ... the last term is a
physical stiffness (thrust falls as the vehicle rises) and is not delayed; the controller terms see the measurement one sample late.
"""
import cmath
import math

G0 = 9.81


def ge(z, Rr):
    return 1.0 / (1.0 - (Rr / (4.0 * z)) ** 2)


def dge(z, Rr):
    a = (Rr / 4.0) ** 2
    return -2.0 * a / (z ** 3 * (1.0 - a / z ** 2) ** 2)


def equilibrium(zr, kp, Rr, g=G0, use_ge=True):
    """Height z_e solving G(z)(g + kp(zr - z)) = g (hover with gravity feedforward and no integrator)."""
    if not use_ge:
        return zr
    f = lambda z: ge(z, Rr) * (g + kp * (zr - z)) - g
    lo, hi = max(Rr / 2.0, 1e-9), zr + g / kp + 10.0 * Rr
    # f(lo) > 0 when the pull-up is strong, f(hi) < 0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def offset_approx(zr, kp, Rr, g=G0):
    """First-order offset z_e - zr ~ (G-1) g / (G kp + S), G and S = -G' g / G evaluated at the target height zr."""
    G = ge(zr, Rr)
    return (G - 1.0) * g / (G * kp - dge(zr, Rr) * g / G)


def simulate_hold(zr, z0, kp, kd, Rr, dt=0.001, T=5.0, use_ge=True, g=G0):
    z, v = z0, 0.0
    for _ in range(int(T / dt)):
        Tc = g + kp * (zr - z) - kd * v
        a = (ge(z, Rr) if use_ge else 1.0) * Tc - g
        v += a * dt
        z += v * dt
    return z, v


# ---- discrete-time stability with one-sample controller delay ------------------------------------------------------

def poly_from_matrix(A):
    """Characteristic polynomial coefficients (Faddeev-LeVerrier), highest degree first."""
    n = len(A)
    I = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    M = [row[:] for row in I]
    coeffs = [1.0]
    for k in range(1, n + 1):
        AM = [[sum(A[i][l] * M[l][j] for l in range(n)) for j in range(n)] for i in range(n)]
        c = -sum(AM[i][i] for i in range(n)) / k
        coeffs.append(c)
        M = [[AM[i][j] + (c if i == j else 0.0) for j in range(n)] for i in range(n)]
    return coeffs


def poly_roots(c, iters=500):
    n = len(c) - 1
    roots = [(0.4 + 0.9j) ** k for k in range(n)]
    for _ in range(iters):
        new = []
        for i, r in enumerate(roots):
            num = sum(c[k] * r ** (n - k) for k in range(n + 1))
            den = 1.0
            for j, s in enumerate(roots):
                if j != i:
                    den *= (r - s)
            new.append(r - num / den)
        roots = new
    return roots


def spectral_radius(Kp, Kd, stiff, dt):
    """Loop d'' = -Kp d(t-dt) - Kd d'(t-dt) + stiff*(-d)  [stiff >= 0 is an undelayed restoring stiffness].
    Semi-implicit Euler, state (d, v, d_prev, v_prev)."""
    # v+ = v + dt(-Kp d_prev - Kd v_prev - stiff d);  d+ = d + dt v+
    A = [
        [1.0 - dt * dt * stiff, dt, -dt * dt * Kp, -dt * dt * Kd],
        [-dt * stiff, 1.0, -dt * Kp, -dt * Kd],
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
    ]
    return max(abs(r) for r in poly_roots(poly_from_matrix(A)))


def stable(Kp, Kd, stiff, dt):
    return spectral_radius(Kp, Kd, stiff, dt) < 1.0 - 1e-9


def gain_margin(kp, kd, dt, stiff=0.0, hi=1000.0):
    """Largest multiplier m on (Kp, Kd) (not on the undelayed stiffness) keeping the delayed loop stable."""
    lo = 1.0
    if not stable(kp, kd, stiff, dt):
        return 0.0
    while stable(hi * kp, hi * kd, stiff, dt) and hi < 1e6:
        hi *= 2.0
    lo, h = 1.0, hi
    for _ in range(60):
        mid = 0.5 * (lo + h)
        if stable(mid * kp, mid * kd, stiff, dt):
            lo = mid
        else:
            h = mid
    return lo


def real_margin(zr, kp, kd, dt, Rr, g=G0, with_stiffness=True):
    """Gain margin of the real loop at its equilibrium height: largest multiplier on the effective delayed gains (G kp, G kd)
    that keeps the sampled loop stable (1.0 = on the stability boundary; a value below 1 means unstable).
    The undelayed restoring stiffness S = -(G'/G) g is added when with_stiffness."""
    ze = equilibrium(zr, kp, Rr, g)
    G = ge(ze, Rr)
    stiff = -dge(ze, Rr) / G * g if with_stiffness else 0.0
    return ze, G, stiff, gain_margin(G * kp, G * kd, dt, stiff)


def critical_height(kp, kd, dt, Rr, lo=None, hi=None, g=G0):
    """Smallest target height zr (bisection) at which the real loop is still stable; below it the twin-designed gains destabilise it.
    Returns None when the loop is stable down to the model limit."""
    lo = lo if lo is not None else 0.5 * Rr * 1.01
    hi = hi if hi is not None else 10.0 * Rr
    if real_margin(lo, kp, kd, dt, Rr, g)[3] >= 1.0:
        return None
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if real_margin(mid, kp, kd, dt, Rr, g)[3] >= 1.0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def max_gain_scale(zr, kp, kd, dt, Rr, g=G0):
    """Largest scale a on the designed (kp, kd) for which the real loop at target height zr is stable."""
    lo, hi = 1e-3, 1e4
    for _ in range(80):
        mid = (lo * hi) ** 0.5
        ze = equilibrium(zr, mid * kp, Rr, g)
        G = ge(ze, Rr)
        st = -dge(ze, Rr) / G * g
        if stable(G * mid * kp, G * mid * kd, st, dt):
            lo = mid
        else:
            hi = mid
    return lo


def simulate_delayed(zr, kp, kd, dt, Rr, d0, T=20.0, use_ge=True, g=G0):
    """Nonlinear sampled loop (same scheme as spectral_radius): command uses the previous sample; returns |z - z_e| at the end
    and the peak over the run, starting from z_e + d0."""
    ze = equilibrium(zr, kp, Rr, g, use_ge)
    z, v = ze + d0, 0.0
    zp, vp = z, v
    peak = abs(d0)
    for _ in range(int(T / dt)):
        Tc = g + kp * (zr - zp) - kd * vp
        zp, vp = z, v
        a = (ge(z, Rr) if use_ge else 1.0) * Tc - g
        v += a * dt
        z += v * dt
        if z < 0.3 * Rr:
            return float("inf"), float("inf")  # crashed into the singular region of the model
        peak = max(peak, abs(z - ze))
        if peak > 100:
            return float("inf"), float("inf")
    return abs(z - ze), peak
