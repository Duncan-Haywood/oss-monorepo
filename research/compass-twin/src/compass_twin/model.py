"""Magnetometer heading model (pure Python, 2-D).

Field in the body frame at true heading psi: m = S * B (cos psi, sin psi) + beta (cos phi, sin phi) + noise, where S = diag(1, r)
is a soft-iron scaling of the second axis and beta (at angle phi) a hard-iron offset. The ideal twin has S = I, beta = 0 and
reads heading = atan2(m_y, m_x).
"""
import math
import random


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def reading(psi, B=1.0, r=1.0, beta=0.0, phi=0.0):
    return (B * math.cos(psi) + beta * math.cos(phi), r * B * math.sin(psi) + beta * math.sin(phi))


def heading(m):
    return math.atan2(m[1], m[0])


def error(psi, **kw):
    """Measured minus true heading."""
    return wrap(heading(reading(psi, **kw)) - psi)


def hard_peak(beta_over_B):
    """Peak |heading error| of a hard-iron offset: asin(beta/B) (beta < B)."""
    return math.asin(beta_over_B)


def hard_first_order(psi, beta_over_B, phi):
    """First-order error (beta/B) sin(phi - psi)."""
    return beta_over_B * math.sin(phi - psi)


def soft_peak(r):
    """Peak |heading error| of axis scaling r = b/a: asin(|1-r|/(1+r)), attained at tan(psi) = 1/sqrt(r)."""
    return math.asin(abs(1 - r) / (1 + r))


def closure_first_order(L, beta_over_B):
    """Loop-closure error of a compass-held square of side L under a hard-iron offset: 2 L beta/B (to first order, any phi)."""
    return 2 * L * beta_over_B


def square_closure(L, compass_held=True, **kw):
    """Drive four legs of length L with commanded headings 0, 90, 180, 270 deg; return distance from start.
    compass_held: the controller steers so the *measured* heading equals the command (actual = command - error, found by
    fixed-point iteration); otherwise the vehicle tracks true heading (zero closure)."""
    x = y = 0.0
    for k in range(4):
        cmd = k * math.pi / 2
        psi = cmd
        if compass_held:
            for _ in range(200):
                psi = cmd - error(psi, **kw)
        x += L * math.cos(psi)
        y += L * math.sin(psi)
    return math.hypot(x, y)


def range_to_fail(tol, beta_over_B, worst=True):
    """Straight-line distance at which cross-track error reaches tol at worst-case heading: tol / sin(asin(beta/B))."""
    return tol / beta_over_B


def solve3(A, b):
    """Solve a 3x3 linear system by Gaussian elimination with partial pivoting."""
    M = [row[:] + [bi] for row, bi in zip(A, b)]
    for i in range(3):
        p = max(range(i, 3), key=lambda k: abs(M[k][i]))
        M[i], M[p] = M[p], M[i]
        for k in range(i + 1, 3):
            f = M[k][i] / M[i][i]
            for j in range(i, 4):
                M[k][j] -= f * M[i][j]
    x = [0.0] * 3
    for i in (2, 1, 0):
        x[i] = (M[i][3] - sum(M[i][j] * x[j] for j in range(i + 1, 3))) / M[i][i]
    return x


def fit_offset(pts):
    """Kasa circle fit: minimise sum (x^2+y^2 + a x + b y + c)^2; centre = (-a/2, -b/2)."""
    Sxx = Sxy = Syy = Sx = Sy = 0.0
    n = len(pts)
    bx = by = bc = 0.0
    for x, y in pts:
        Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y
        z = x * x + y * y
        bx -= z * x; by -= z * y; bc -= z
    a, b, _ = solve3([[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]], [bx, by, bc])
    return -a / 2, -b / 2


def swing_points(n, arc, sigma, beta_xy, B=1.0, rng=None, start=0.0):
    """n readings while the vehicle turns through `arc` radians (uniform), offset beta_xy, isotropic noise sigma."""
    rng = rng or random.Random(0)
    pts = []
    for i in range(n):
        psi = start + arc * (i + 0.5) / n
        pts.append((B * math.cos(psi) + beta_xy[0] + sigma * rng.gauss(0, 1), B * math.sin(psi) + beta_xy[1] + sigma * rng.gauss(0, 1)))
    return pts


def offset_error_rms(n, arc, sigma, trials, rng, B=1.0, beta_xy=(0.2, -0.1)):
    """RMS Euclidean error of the fitted offset over Monte Carlo trials."""
    s = 0.0
    for _ in range(trials):
        c = fit_offset(swing_points(n, arc, sigma, beta_xy, B, rng))
        s += (c[0] - beta_xy[0]) ** 2 + (c[1] - beta_xy[1]) ** 2
    return math.sqrt(s / trials)
