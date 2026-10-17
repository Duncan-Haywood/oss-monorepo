"""One-parameter radial lens distortion (pure Python).

A scene point at normalised image-plane coordinates (X, Y) = (x/z, y/z) is imaged at (X, Y)(1 + k1 r^2), r^2 = X^2 + Y^2
(Brown model, first term). The pinhole twin is k1 = 0. The camera has height h above a flat floor and a horizontal optical
axis, so a floor point at range R on the axis column has Y = h/R (rho = h/R below).
"""
import math
import random


def distort(X, Y, k1):
    s = 1.0 + k1 * (X * X + Y * Y)
    return X * s, Y * s


def undistort_radius(rd, k1, it=80):
    """Radius rho with rho (1 + k1 rho^2) = rd, on the monotone branch (bisection)."""
    if k1 >= 0:
        hi = rd + 1.0
    else:
        hi = 1.0 / math.sqrt(3.0 * -k1)  # f(rho) = rho(1+k1 rho^2) peaks here
        if rd > hi * (1.0 + k1 * hi * hi):
            raise ValueError("pixel outside the monotone range of the distortion")
    lo = 0.0
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        if mid * (1.0 + k1 * mid * mid) < rd:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def twin_range(R, h, k1, s=1.0):
    """Range a pinhole twin (scale s on the pixel radius, s = 1 uncalibrated) reads for a floor point at true range R."""
    rho = h / R
    return h * s / (rho * (1.0 + k1 * rho * rho))


def range_ratio(R, h, k1):
    """Closed form of twin_range / R for s = 1: 1 / (1 + k1 h^2 / R^2)."""
    return 1.0 / (1.0 + k1 * h * h / (R * R))


def brake_point(R0, h, k1, s=1.0):
    """True range at which a twin-trained policy 'stop when range = R0' actually stops."""
    rd = h * s / R0  # pixel radius the twin associates with R0
    return h / undistort_radius(rd, k1)


def brake_first_order(R0, h, k1):
    """First-order stopping error R - R0 ~ k1 h^2 / R0 (from rho = rho0 (1 - k1 rho0^2))."""
    return k1 * h * h / R0


def line_bow(d, Y, k1):
    """Lateral image displacement of the scene line X = d at height Y relative to Y = 0: exactly k1 d Y^2."""
    return distort(d, Y, k1)[0] - distort(d, 0.0, k1)[0]


def lsq_scale(k1, rho_max):
    """Focal scale s minimising the integral of (rho_d - s rho)^2 over rho uniform in [0, rho_max]: 1 + 3 k1 rho_max^2 / 5."""
    return 1.0 + 0.6 * k1 * rho_max * rho_max


def fit_scale(k1, rho_max, n=2000):
    """Same scale by discrete least squares over a grid (checks lsq_scale)."""
    num = den = 0.0
    for i in range(1, n + 1):
        rho = rho_max * i / n
        num += rho * rho * (1.0 + k1 * rho * rho)
        den += rho * rho
    return num / den


def grid_points(half=0.6, m=7):
    pts = []
    for i in range(m):
        for j in range(m):
            pts.append((-half + 2 * half * i / (m - 1), -half + 2 * half * j / (m - 1)))
    return pts


def estimate_k1(pts, observed):
    """Least squares k1 from a known planar grid, observed = distorted (x, y) of each point. Linear in k1:
    obs - p = k1 r^2 p  =>  k1 = sum (obs-p).(r^2 p) / sum |r^2 p|^2."""
    num = den = 0.0
    for (X, Y), (x, y) in zip(pts, observed):
        r2 = X * X + Y * Y
        num += (x - X) * r2 * X + (y - Y) * r2 * Y
        den += (r2 * X) ** 2 + (r2 * Y) ** 2
    return num / den


def observe(pts, k1, sigma=0.0, rng=None):
    out = []
    for X, Y in pts:
        x, y = distort(X, Y, k1)
        if sigma:
            x += rng.gauss(0, sigma)
            y += rng.gauss(0, sigma)
        out.append((x, y))
    return out
