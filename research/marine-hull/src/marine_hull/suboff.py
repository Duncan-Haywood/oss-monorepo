"""DARPA SUBOFF bare hull (DTRC model 5470, configuration AFF-1) from its published equations.

Equations in feet, x from the nose (Groves, Huang and Chang 1989, DTRC/SHD-1298-01), as coded in two
public implementations read on 2026-11-10 (github.com/Irtiza333/X_geom `suboff.py` and
github.com/cxs503/TensorFVM `suboff_geometry.py`; the constants agree between them):

    0 .. 3.333333 ft          forebody   Rmax [1.126395101 x a^4 + 0.442874707 x^2 a^3 + 1 - a^4 (1.2 x + 1)]^(1/2.1), a = 0.3 x - 1
    3.333333 .. 10.645833     middle     Rmax
    10.645833 .. 13.979167    afterbody  Rmax [rh^2 + rh K0 xi^2 + c3 xi^3 + c4 xi^4 + c5 xi^5 + c6 xi^6]^(1/2), xi = (13.979167 - x)/3.333333
    13.979167 .. 14.291667    aft cap    rh Rmax [1 - (3.2 x - 44.733333)^2]^(1/2)

    Rmax = 5/6 ft, rh = 0.1175, K0 = 10, K1 = 44.6244.

The first implementation quotes the report's bare-hull volume 0.699 m3 and wetted surface 5.988 m2 (via
arXiv:2503.19674, Table 1, not opened here); `hydrostatics()` reproduces both, which is the check.
Stdlib only.
"""
import math

FT = 0.3048
R_MAX = 5.0 / 6.0
X_FORE, X_MID, X_AFT, X_END = 3.333333, 10.645833, 13.979167, 14.291667
RH, K0, K1 = 0.1175, 10.0, 44.6244
LENGTH = X_END * FT          # 4.3561 m
DIAMETER = 2 * R_MAX * FT    # 0.508 m
REFERENCE = {'volume_m3': 0.699, 'wetted_m2': 5.988}
_C = (20 - 20 * RH ** 2 - 4 * RH * K0 - K1 / 3, -45 + 45 * RH ** 2 + 6 * RH * K0 + K1,
      36 - 36 * RH ** 2 - 4 * RH * K0 - K1, -10 + 10 * RH ** 2 + RH * K0 + K1 / 3)


def radius_ft(x):
    """Radius (ft) at x (ft from the nose); 0 outside the hull."""
    if x <= 0 or x >= X_END:
        return 0.0
    if x < X_FORE:
        a = 0.3 * x - 1.0
        f = 1.126395101 * x * a ** 4 + 0.442874707 * x * x * a ** 3 + 1.0 - a ** 4 * (1.2 * x + 1.0)
        return R_MAX * max(f, 0.0) ** (1 / 2.1)
    if x <= X_MID:
        return R_MAX
    if x <= X_AFT:
        xi = (X_AFT - x) / 3.333333
        g = RH ** 2 + RH * K0 * xi ** 2 + sum(c * xi ** (k + 3) for k, c in enumerate(_C))
        return R_MAX * math.sqrt(max(g, 0.0))
    u = 3.2 * x - 44.733333
    return RH * R_MAX * math.sqrt(max(1.0 - u * u, 0.0))


def radius(x_m):
    """Radius (m) at x (m from the nose)."""
    return radius_ft(x_m / FT) * FT


def hydrostatics(n=4000):
    """(volume m3, wetted surface m2) by the trapezoid rule on each part; n panels per part.

    The nose and the cap have infinite slope at their ends, so the surface integrand
    2 pi r sqrt(1 + r'^2) dx is written as 2 pi r ds along the arc (chord lengths), which stays finite.
    """
    vol = area = 0.0
    for a, b in ((0.0, X_FORE), (X_FORE, X_MID), (X_MID, X_AFT), (X_AFT, X_END)):
        # cosine spacing clusters points at the ends where r changes fastest
        xs = [a + (b - a) * 0.5 * (1 - math.cos(math.pi * i / n)) for i in range(n + 1)]
        rs = [radius_ft(x) for x in xs]
        if a == 0.0:
            rs[0] = 0.0
        if b == X_END:
            rs[-1] = 0.0
        for i in range(n):
            dx, r0, r1 = xs[i + 1] - xs[i], rs[i], rs[i + 1]
            vol += math.pi * dx * (r0 * r0 + r0 * r1 + r1 * r1) / 3     # frustum
            area += math.pi * (r0 + r1) * math.hypot(dx, r1 - r0)       # frustum side
    return vol * FT ** 3, area * FT ** 2
