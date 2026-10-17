"""Shaper twin.  Real system: cart (M) + damped spring-mass slosh mode (m), as in slosh-twin.  The rigid twin plans a rest-to-rest bang-bang
move of duration T0 (acceleration a0 = 4D/T0^2 <= a_max) and predicts no slosh.  An input shaper convolves the acceleration command with
impulses (A_i, t_i), sum A_i = 1, A_i >= 0, so distance is unchanged and |a| <= a0 still holds.  For an undamped mode the residual is exactly
    R_shaped = V(w) * R_bangbang,   V(w) = |sum_i A_i exp(i w t_i)|,
with ZV  (A = 1/2,1/2 at 0, P/2):        V = |cos(pi (1+eps)/2)| = |sin(pi eps/2)|,
     ZVD (A = 1/4,1/2,1/4 at 0, P/2, P):  V = sin^2(pi eps/2),
P = 2 pi / w_model, eps = w / w_model - 1.
"""
import math


class Tank:
    """Liquid tank on a cart; slosh stiffness k = kappa m so w^2 = kappa (1 + m/M)."""

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

    def with_fill(self, f):
        t = Tank.__new__(Tank)
        t.M, t.m_full, t.zeta, t.fill, t.kappa = self.M, self.m_full, self.zeta, f, self.kappa
        return t


def min_time(D, a_max):
    return 2.0 * math.sqrt(D / a_max)


def shaper(kind, w_model, zeta_model=0.0):
    """Impulse list [(A_i, t_i)].  kind in 'none', 'zv', 'zvd'.  zeta_model > 0 gives the damped ZV / ZVD (Singer & Seering 1990)."""
    if kind == "none":
        return [(1.0, 0.0)]
    wd = w_model * math.sqrt(1.0 - zeta_model ** 2)
    K = math.exp(-zeta_model * math.pi / math.sqrt(1.0 - zeta_model ** 2))
    half = math.pi / wd
    if kind == "zv":
        return [(1.0 / (1.0 + K), 0.0), (K / (1.0 + K), half)]
    if kind == "zvd":
        d = 1.0 + 2.0 * K + K * K
        return [(1.0 / d, 0.0), (2.0 * K / d, half), (K * K / d, 2.0 * half)]
    raise ValueError(kind)


def shaped_time(T0, imps):
    return T0 + imps[-1][1]


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


def accel_segments(D, T0, imps):
    """Breakpoints and constant accelerations of the shaped command: sum_i A_i a0 s(t - t_i), s = +1 on [0, T0/2), -1 on [T0/2, T0)."""
    a0 = 4.0 * D / (T0 * T0)
    pts = sorted({0.0} | {t + o for _, t in imps for o in (0.0, T0 / 2, T0)})
    segs = []
    for lo, hi in zip(pts[:-1], pts[1:]):
        mid = 0.5 * (lo + hi)
        a = 0.0
        for A, t in imps:
            if t <= mid < t + T0 / 2:
                a += A * a0
            elif t + T0 / 2 <= mid < t + T0:
                a -= A * a0
        segs.append((hi - lo, a))
    return segs


def trajectory(tank, D, T0, imps):
    """Exact slosh state under the shaped command.  Returns (peak |z| over segment ends, residual amplitude sqrt(z^2+(z'/w)^2) at the end,
    cart velocity at the end, cart position at the end)."""
    w, zt, mu = tank.w, tank.zeta, tank.mu
    z = v = 0.0
    xc = vc = 0.0
    peak = 0.0
    for h, a in accel_segments(D, T0, imps):
        z, v = _step(z, v, -mu * a, w, zt, h)
        xc += vc * h + 0.5 * a * h * h       # rigid-twin cart-of-mass position/velocity (exact COM of the real system)
        vc += a * h
        peak = max(peak, abs(z))
    return peak, math.hypot(z, v / w), vc, xc


def residual(tank, D, T0, imps):
    return trajectory(tank, D, T0, imps)[1]


def bang_bang_residual(mu, a0, w, T):
    return 4.0 * mu * a0 * math.sin(w * T / 4.0) ** 2 / (w * w)


def V(kind, eps):
    """Undamped shaper insensitivity curve at relative frequency error eps = w/w_model - 1."""
    s = abs(math.sin(math.pi * eps / 2.0))
    return {"none": 1.0, "zv": s, "zvd": s * s}[kind]


def eps_tolerated(kind, rho):
    """Largest |eps| with V(eps) <= rho (rho = tol / unshaped residual), valid for rho < 1."""
    if rho >= 1.0:
        return math.inf
    if kind == "zv":
        return 2.0 / math.pi * math.asin(rho)
    if kind == "zvd":
        return 2.0 / math.pi * math.asin(math.sqrt(rho))
    raise ValueError(kind)


def null_tuned_time(w_model, n):
    return 4.0 * math.pi * n / w_model


def band_design(tank, fills, D, a_max, tol, kind, grid):
    """Shortest move time of family `kind` ('zv','zvd', or 'null' = unshaped null-tuned order n<=12) whose *worst-case* residual over
    the fills is <= tol, searching design frequencies in `grid`.  Returns (time, w_model, detail) or (inf, None, None)."""
    best = (math.inf, None, None)
    T0min = min_time(D, a_max)
    for wm in grid:
        if kind == "null":
            for n in range(1, 13):
                T = null_tuned_time(wm, n)
                if T < T0min - 1e-12:
                    continue
                imps = shaper("none", wm)
                worst = max(residual(tank.with_fill(f), D, T, imps) for f in fills)
                if worst <= tol and T < best[0]:
                    best = (T, wm, n)
                    break
        else:
            imps = shaper(kind, wm)
            worst = max(residual(tank.with_fill(f), D, T0min, imps) for f in fills)
            T = shaped_time(T0min, imps)
            if worst <= tol and T < best[0]:
                best = (T, wm, worst)
    return best
