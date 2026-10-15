"""Slosh twin.  Real system: a cart (mass M) carrying a liquid modelled as a damped spring-mass slosh mode (mass m, stiffness k,
damping c); force F acts on the cart.  Twin: one rigid mass M + m.
Centre of mass obeys (M+m) xc'' = F exactly, so the twin gets the *gross* motion right.  Relative slosh z = x_m - x_cart obeys
    z'' + 2 zeta w z' + w^2 z = -mu a(t),   a = F/(M+m),  mu = (M+m)/M,  w^2 = k (1/m + 1/M).
Twin prediction: z = 0.  Bang-bang move of distance D and duration T (accelerate a0 = 4D/T^2 for T/2, then brake):
undamped residual slosh amplitude sqrt(z^2 + (z'/w)^2) = 4 mu a0 sin^2(w T / 4) / w^2.
"""
import math


class Tank:
    """Liquid tank on a cart.  The slosh stiffness is k = kappa m (pendulum-like), so frequency depends on fill f = m / m_full only
    through the mass ratio: w^2 = kappa (1 + m/M)."""

    def __init__(self, M=80.0, m_full=20.0, w_full=math.pi, zeta=0.0, fill=1.0):
        self.M, self.m_full, self.zeta, self.fill = M, m_full, zeta, fill
        self.kappa = w_full ** 2 / (1.0 + m_full / M)

    @property
    def m(self):
        return self.fill * self.m_full

    @property
    def mu(self):
        return (self.M + self.m) / self.M

    @property
    def w(self):
        return math.sqrt(self.kappa * (1.0 + self.m / self.M))

    @property
    def k(self):
        return self.kappa * self.m

    def with_fill(self, f):
        t = Tank.__new__(Tank)
        t.M, t.m_full, t.zeta, t.fill, t.kappa = self.M, self.m_full, self.zeta, f, self.kappa
        return t


def bang_bang_accel(D, T):
    return 4.0 * D / (T * T)


def min_time(D, a_max):
    """Fastest rest-to-rest bang-bang move of the rigid twin under |a| <= a_max."""
    return 2.0 * math.sqrt(D / a_max)


def residual_formula(mu, a0, w, T):
    """Undamped residual amplitude after a bang-bang move of duration T."""
    return 4.0 * mu * a0 * math.sin(w * T / 4.0) ** 2 / (w * w)


def _step(z, v, u, w, zeta, h):
    """Exact propagation of z'' + 2 zeta w z' + w^2 z = u over h with constant u (zeta < 1)."""
    wp = u / (w * w)
    w0 = z - wp
    if zeta == 0.0:
        c, s = math.cos(w * h), math.sin(w * h)
        return wp + w0 * c + v / w * s, v * c - w * w0 * s
    wd = w * math.sqrt(1.0 - zeta * zeta)
    e = math.exp(-zeta * w * h)
    c, s = math.cos(wd * h), math.sin(wd * h)
    B = (v + zeta * w * w0) / wd
    return wp + e * (w0 * c + B * s), e * (v * c - (zeta * w * v + w * w * w0) / wd * s)


def slosh_trajectory(tank, D, T, n=2000):
    """Exact slosh state over a bang-bang move sampled at n points per half; returns (peak |z| during the move, residual amplitude
    at t = T, z(T))."""
    a0 = bang_bang_accel(D, T)
    w, zt, mu = tank.w, tank.zeta, tank.mu
    z = v = 0.0
    peak = 0.0
    h = T / (2 * n)
    for half, sign in ((0, 1.0), (1, -1.0)):
        for _ in range(n):
            z, v = _step(z, v, -mu * sign * a0, w, zt, h)
            peak = max(peak, abs(z))
    return peak, math.hypot(z, v / w), z


def residual(tank, D, T):
    return slosh_trajectory(tank, D, T, n=1)[1]


def simulate_two_mass(tank, D, T, dt=1e-3):
    """RK4 of the full two-body system under F = (M+m) a(t) with the twin's bang-bang a(t).  Returns (x_cart(T), x_com(T), z(T), z'(T))."""
    M, m, k = tank.M, tank.m, tank.k
    c = 2.0 * tank.zeta * math.sqrt(k * M * m / (M + m))         # so that 2 zeta w = c (1/m + 1/M)
    a0 = bang_bang_accel(D, T)

    def f(sign, s):
        x1, v1, x2, v2 = s
        fs = k * (x2 - x1) + c * (v2 - v1)
        return [v1, ((M + m) * sign * a0 + fs) / M, v2, -fs / m]

    s = [0.0, 0.0, 0.0, 0.0]
    nh = max(1, int(round(T / 2 / dt)))
    dt = T / 2 / nh
    for sign in (1.0, -1.0):
        for _ in range(nh):
            k1 = f(sign, s)
            k2 = f(sign, [s[i] + dt / 2 * k1[i] for i in range(4)])
            k3 = f(sign, [s[i] + dt / 2 * k2[i] for i in range(4)])
            k4 = f(sign, [s[i] + dt * k3[i] for i in range(4)])
            s = [s[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) for i in range(4)]
    x1, v1, x2, v2 = s
    return x1, (M * x1 + m * x2) / (M + m), x2 - x1, v2 - v1


def null_times(w, n_max):
    """Move times with zero undamped residual: T = 4 pi n / w (n whole slosh periods per half-move)."""
    return [4.0 * math.pi * n / w for n in range(1, n_max + 1)]


def window_halfwidth(tol, mu, a0, w):
    """Half-width in T of the window around a null where residual <= tol (valid while a0 is held fixed; see whitepaper)."""
    rho = tol * w * w / (4.0 * mu * a0)
    return 4.0 / w * math.asin(math.sqrt(rho)) if rho < 1.0 else math.inf


def planned_time(w_model, n):
    return 4.0 * math.pi * n / w_model


def planned_residual(tank, w_model, D, n):
    """Residual on the real tank of the move whose time T_n = 4 pi n / w_model is a null of the *twin's* slosh frequency:
    4 mu a0(T_n) sin^2(pi n eps) / w^2 with eps = w / w_model - 1 (exact for undamped slosh)."""
    T = planned_time(w_model, n)
    eps = tank.w / w_model - 1.0
    return 4.0 * tank.mu * bang_bang_accel(D, T) * math.sin(math.pi * n * eps) ** 2 / tank.w ** 2


def smallest_safe_order(tank, w_model, D, tol, a_max, n_max=400):
    """Smallest null order n (1, 2, ...) whose twin-planned move of distance D respects a0 <= a_max and is within tol on the real
    tank; None if none <= n_max.  At fixed D the acceleration is 4D/T_n^2, so higher orders are gentler."""
    for n in range(1, n_max + 1):
        if bang_bang_accel(D, planned_time(w_model, n)) > a_max:
            continue
        if planned_residual(tank, w_model, D, n) <= tol:
            return n
    return None


def first_unsafe_order_fixed_accel(tank, w_model, a0, tol, n_max=400):
    """Same, but holding the acceleration a0 fixed (distance a0 T_n^2 / 4 grows with n): residual 4 mu a0 sin^2(pi n eps)/w^2.
    Smallest n that exceeds tol."""
    eps = tank.w / w_model - 1.0
    for n in range(1, n_max + 1):
        if 4.0 * tank.mu * a0 * math.sin(math.pi * n * eps) ** 2 / tank.w ** 2 > tol:
            return n
    return None


def envelope_time(tank, D, tol):
    """Move time beyond which the residual is <= tol for *every* T (no tuning to nulls): 16 mu D / (w^2 T^2) <= tol."""
    return 4.0 * math.sqrt(tank.mu * D / tol) / tank.w


def order_estimate(tol, mu, a0, w, eps):
    """Order threshold asin(sqrt(rho)) / (pi |eps|), rho = tol w^2 / (4 mu a0); at fixed a0 the first unsafe order is floor(.) + 1
    (while pi n |eps| < pi/2, where sin is monotone)."""
    rho = tol * w * w / (4.0 * mu * a0)
    return math.asin(math.sqrt(rho)) / (math.pi * abs(eps))


def fastest_safe_time(tank, D, a_max, tol, T_hi=60.0, dT=2e-3):
    """Smallest T >= T_min with real residual <= tol (scan upward)."""
    T = min_time(D, a_max)
    while T < T_hi:
        if residual(tank, D, T) <= tol:
            return T
        T += dT
    return math.inf
