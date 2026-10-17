"""Rolling-shutter imaging of a moving rectangle (pure Python).

Row r is exposed at t = r * k, k = tau / H (readout time over rows). The target is a Wd x Hd rectangle whose centre is at
(cx, cy) at t = 0, rotated by theta, translating at (u, w) px/s. The global-shutter twin is k = 0.
"""
import math
import random


class Rect:
    def __init__(self, wd=200.0, hd=120.0, theta=0.0, cx=320.0, cy=240.0, u=0.0, w=0.0):
        self.wd, self.hd, self.theta, self.cx, self.cy, self.u, self.w = wd, hd, theta, cx, cy, u, w

    def coords(self, x, r, t):
        """(a, b): position of pixel (x, r) in the target frame at time t; a along n=(cos, sin), b along m=(-sin, cos)."""
        c, s = math.cos(self.theta), math.sin(self.theta)
        dx, dy = x - (self.cx + self.u * t), r - (self.cy + self.w * t)
        return c * dx + s * dy, -s * dx + c * dy


def fit_line(xs, ys):
    """Least squares y = alpha + beta x; returns (alpha, beta)."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    beta = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my - beta * mx, beta


def _bisect(f, lo, hi, it=60):
    flo = f(lo)
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        if (f(mid) > 0) == (flo > 0):
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def measure(rect, k, noise=0.0, rng=None, frac=0.3):
    """Image the rectangle with a rolling shutter and measure its four edges (forward simulation, no closed forms).

    Vertical edges: for every row in the middle of the target, bisect the column where the target-frame coordinate a
    equals +-Wd/2 at that row's own exposure time. Horizontal edges: for every column in the middle, find the integer
    rows between which b - (+-Hd/2) changes sign (each row at its own time) and interpolate linearly.
    Returns (t_v, t_h, dr): tan-orientation from vertical edges (= n_y'/n_x'), slope dr/dc of horizontal edges, and the
    row gap between the two horizontal edges at the centre column."""
    rng = rng or random.Random(0)
    g = (lambda: rng.gauss(0.0, noise)) if noise else (lambda: 0.0)
    rows = range(int(rect.cy - frac * rect.hd), int(rect.cy + frac * rect.hd) + 1)
    betas = []
    for sgn in (+1, -1):
        xs, rs = [], []
        for r in rows:
            t = r * k
            f = lambda x: rect.coords(x, r, t)[0] - sgn * rect.wd / 2
            x = _bisect(f, rect.cx - rect.wd, rect.cx + rect.wd)
            xs.append(x + g())
            rs.append(float(r))
        betas.append(fit_line(rs, xs)[1])                    # dx/dr
    beta = sum(betas) / 2
    cols = range(int(rect.cx - frac * rect.wd), int(rect.cx + frac * rect.wd) + 1)
    gam, icpt = [], []
    for sgn in (+1, -1):
        cs, ys = [], []
        for c in cols:
            lo, hi = int(rect.cy - 2 * rect.hd), int(rect.cy + 2 * rect.hd)
            prev = None
            for r in range(lo, hi + 1):
                v = rect.coords(c, r, r * k)[1] - sgn * rect.hd / 2
                if prev is not None and (prev[1] > 0) != (v > 0):
                    y = prev[0] + (r - prev[0]) * prev[1] / (prev[1] - v)
                    break
                prev = (r, v)
            cs.append(float(c))
            ys.append(y + g())
        a, b = fit_line(cs, ys)
        gam.append(b)
        icpt.append(a + b * rect.cx)
    return -beta, sum(gam) / 2, abs(icpt[0] - icpt[1])


def predict(rect, k):
    """Closed forms: apparent edge normals n' = (cos th, sin th (1 - w k) - cos th u k), m' = (-sin th, cos th (1 - w k) + sin th u k)."""
    th = rect.theta
    a, b = rect.w * k, rect.u * k
    t_v = math.tan(th) * (1 - a) - b
    s = 1 - a + math.tan(th) * b
    t_h = math.tan(th) / s
    dr = rect.hd / (math.cos(th) * s)
    return t_v, t_h, dr


def naive_theta(t_v, t_h):
    """Orientation estimate that a global-shutter twin would certify: mean of the two edge-family angles."""
    return 0.5 * (math.atan(t_v) + math.atan(t_h))


def solve(t_v, t_h, dr, hd, k):
    """Rolling-shutter-aware estimate of (theta, u, w) from one frame of a rectangle of known height hd."""
    sin_th = t_h * hd / dr
    th = math.asin(sin_th)
    tan = math.tan(th)
    s = hd / (dr * math.cos(th))
    one_minus_a = (s + tan * t_v) / (1 + tan * tan)
    b = tan * one_minus_a - t_v
    return th, b / k, (1 - one_minus_a) / k
