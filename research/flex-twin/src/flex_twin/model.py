"""Flex twin.  Real plant: motor inertia J1 and load inertia J2 joined by a spring k and damper c (two-mass system), force u acts on J1.
Twin: one rigid inertia M = J1 + J2.  Loop: u = kp (r - y) - kd y', with y the LOAD position (non-collocated) or the MOTOR position (collocated).

Rigid twin:  M y'' = u  ->  closed loop M s^2 + kd s + kp, stable for every kp, kd > 0.
Real plant, characteristic polynomials a4 s^4 + a3 s^3 + a2 s^2 + a1 s + a0:
    non-collocated  J1J2, cM, kM + kd c, kp c + kd k, kp k
    collocated      J1J2, cM + kd J2, kM + kp J2 + kd c, kp c + kd k, kp k
Tuning by the twin: kp = M w^2, kd = 2 zeta M w.  With ws^2 = kM/(J1J2) (flexible-mode frequency), delta = c/(2 ws J1J2/M)
(modal damping ratio) and eps = w/ws, the non-collocated polynomial in p = s/ws is, independently of the mass ratio,
    p^4 + 2 delta p^3 + (1 + 4 zeta delta eps) p^2 + (2 zeta eps + 2 delta eps^2) p + eps^2.
"""


def hurwitz4(a4, a3, a2, a1, a0):
    """Routh-Hurwitz: all roots of a4 s^4 + ... + a0 in the open left half-plane."""
    return (min(a4, a3, a2, a1, a0) > 0 and a3 * a2 > a4 * a1
            and a3 * a2 * a1 > a4 * a1 * a1 + a3 * a3 * a0)


def coeffs(J1, J2, k, c, kp, kd, collocated=False):
    M = J1 + J2
    if collocated:
        return (J1 * J2, c * M + kd * J2, k * M + kp * J2 + kd * c, kp * c + kd * k, kp * k)
    return (J1 * J2, c * M, k * M + kd * c, kp * c + kd * k, kp * k)


def params(mu, delta, ws=1.0, M=1.0):
    """Physical parameters with total inertia M, J2/M = r where mu = r(1-r), flexible frequency ws and modal damping ratio delta."""
    r = (1 - (1 - 4 * mu) ** 0.5) / 2          # load fraction, the smaller root (mu <= 1/4)
    J1, J2 = M * (1 - r), M * r
    k = ws * ws * J1 * J2 / M
    c = 2 * delta * ws * J1 * J2 / M
    return J1, J2, k, c


def twin_gains(M, eps, zeta, ws=1.0):
    w = eps * ws
    return M * w * w, 2 * zeta * M * w


def real_stable(mu, delta, eps, zeta, collocated=False):
    J1, J2, k, c = params(mu, delta)
    kp, kd = twin_gains(J1 + J2, eps, zeta)
    return hurwitz4(*coeffs(J1, J2, k, c, kp, kd, collocated))


def eps_crit(mu, delta, zeta, hi=100.0):
    """Largest bandwidth ratio eps = w/ws below which the non-collocated loop is stable, by bisection; 0.0 if unstable for all small eps."""
    if not real_stable(mu, delta, 1e-6, zeta):
        return 0.0
    lo, h = 1e-6, hi
    if real_stable(mu, delta, h, zeta):
        return float("inf")
    for _ in range(200):
        m = 0.5 * (lo + h)
        if real_stable(mu, delta, m, zeta):
            lo = m
        else:
            h = m
    return lo


def cubic(eps, delta, zeta):
    """Third Hurwitz condition for the non-collocated loop reduces to cubic(eps) < 0."""
    d, z = delta, zeta
    return d * d * eps ** 3 + (2 * z * d - 4 * z * d ** 3) * eps ** 2 + (z * z - 4 * z * z * d * d) * eps - d * z


def eps_crit_cubic(delta, zeta):
    """Smallest positive root of cubic(eps) = 0 (bisection on the sign change); equals eps_crit when the other conditions hold."""
    lo, hi = 0.0, 1.0
    while cubic(hi, delta, zeta) < 0:
        hi *= 2
        if hi > 1e9:
            return float("inf")
    for _ in range(200):
        m = 0.5 * (lo + hi)
        if cubic(m, delta, zeta) < 0:
            lo = m
        else:
            hi = m
    return lo


def simulate(J1, J2, k, c, kp, kd, n, dt, x2_0=0.0, r=0.0, collocated=False, twin=False):
    """RK4 of the closed loop from rest with load (or rigid) position x2_0 and reference r.  Returns the list of y after each step."""
    M = J1 + J2

    def f(s):
        x1, x2, v1, v2 = s
        if twin:
            y, yd = x2, v2
            return (0.0, v2, 0.0, (kp * (r - y) - kd * yd) / M)
        y, yd = (x1, v1) if collocated else (x2, v2)
        u = kp * (r - y) - kd * yd
        fs = k * (x1 - x2) + c * (v1 - v2)
        return (v1, v2, (u - fs) / J1, fs / J2)

    s = (x2_0, x2_0, 0.0, 0.0)
    out = []
    for _ in range(n):
        a = f(s)
        b = f(tuple(si + 0.5 * dt * ai for si, ai in zip(s, a)))
        c2 = f(tuple(si + 0.5 * dt * bi for si, bi in zip(s, b)))
        d = f(tuple(si + dt * ci for si, ci in zip(s, c2)))
        s = tuple(si + dt / 6 * (ai + 2 * bi + 2 * ci + di) for si, ai, bi, ci, di in zip(s, a, b, c2, d))
        out.append(s[0] if (collocated and not twin) else s[1])
    return out


def settle_time(ys, dt, target, tol=0.02):
    """First time after which |y - target| <= tol*|target| for the rest of the record; None if never."""
    last = None
    for i, y in enumerate(ys):
        if abs(y - target) > tol * abs(target):
            last = i
    if last is None:
        return 0.0
    if last == len(ys) - 1:
        return None
    return (last + 1) * dt
