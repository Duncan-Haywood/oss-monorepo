"""Collector parameters: every dimension the parts are generated from, in millimetres.

Robot frame: origin on the ground under the middle of the drive axle,
x forward, y to the left, z up. Change a number here and rebuild; the
checks in `check()` say if the change breaks fit, clearance or pickup.

Dimensions of bought-in parts (motor, wheel, bearing, caster, Pi) are the
values the parts below were drawn around. Check them against the datasheet
of what you actually buy before cutting metal.
"""

from __future__ import annotations

import copy
import functools
import math
from dataclasses import dataclass, field


def _bezier_length(pts: tuple, n: int = 24) -> float:
    """Length (mm) of a planar cubic Bezier through control points `pts`, as `n` chords."""
    def at(t):
        u = 1 - t
        return tuple(u**3 * pts[0][i] + 3 * u * u * t * pts[1][i] + 3 * u * t * t * pts[2][i] + t**3 * pts[3][i] for i in (0, 1))

    length, prev = 0.0, at(0.0)
    for k in range(1, n + 1):
        q = at(k / n)
        length += math.dist(prev, q)
        prev = q
    return length


def _bezier_stats(pts: tuple, n: int = 24) -> tuple[float, float, float]:
    """(length mm, peak curvature 1/mm, flattest slope deg) of a planar cubic Bezier through control points `pts`."""
    length = _bezier_length(pts, n)
    kmax, smin = 0.0, 90.0
    for k in range(n + 1):
        t = k / n
        u = 1 - t
        a = tuple(3 * u * u * (pts[1][i] - pts[0][i]) + 6 * u * t * (pts[2][i] - pts[1][i]) + 3 * t * t * (pts[3][i] - pts[2][i]) for i in (0, 1))
        b = tuple(6 * u * (pts[2][i] - 2 * pts[1][i] + pts[0][i]) + 6 * t * (pts[3][i] - 2 * pts[2][i] + pts[1][i]) for i in (0, 1))
        sp = math.hypot(*a)
        if sp > 1e-9:
            kmax = max(kmax, abs(a[0] * b[1] - a[1] * b[0]) / sp ** 3)
            smin = min(smin, math.degrees(math.atan2(abs(a[1]), abs(a[0]))))
    return length, kmax, smin


COLLAR_SOCKET_MM = 25.0  # depth of the hose socket in the sleeve take-up's printed collar
SPIGOT_BOLT_R = 64.0  # M4 ring of the sleeve socket under the shelf (48 until 2026-11-10; the sleeve's wall now sits there)
SPIGOT_FLANGE = 9.0   # sleeve socket's flange under the shelf (5.0 until 2026-11-20: shorter than the insert)
SPIGOT_FLANGE_R = SPIGOT_BOLT_R + 10.0


_SETTLE_BLOCK = 64


# `Feeder._bounce_train` results by the exact inputs they read (perf note 2026-11-18); cleared when full.
_BOUNCE_TRAINS: dict = {}
_BOUNCE_TRAINS_MAX = 4096


def _settle_contracts(r: float, l: float, c: float, g: float, h: float) -> bool:
    """True when one RK4 step of `Feeder.contactor_bounce_train`'s closed-contact ODE cannot grow the deviation
    from equilibrium in the energy norm C ev^2 + L ei^2 (perf note 2026-11-15). In the scaled state
    (sqrt(C) v, sqrt(L) i) the ODE is a skew part plus damping, and the RK4 step is the 2 x 2 matrix
    M = I + X + X^2/2 + X^3/6 + X^4/24 with X = h A; this returns whether M's largest singular value is at most
    1 - 1e-12. While it is, |i - i_eq| stays under the norm, so the settle loop may stop early with the same peak."""
    s = h / math.sqrt(l * c)
    x = ((-g / c * h, s), (-s, -r / l * h))

    def mul(a, b):
        return ((a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]),
                (a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]))
    x2 = mul(x, x)
    x3 = mul(x2, x)
    x4 = mul(x3, x)
    m = [[(1.0 if p == q else 0.0) + x[p][q] + x2[p][q] / 2 + x3[p][q] / 6 + x4[p][q] / 24 for q in (0, 1)]
         for p in (0, 1)]
    a, b, cc, d = m[0][0], m[0][1], m[1][0], m[1][1]
    t, det = a * a + b * b + cc * cc + d * d, a * d - b * cc
    smax = math.sqrt((t + math.sqrt(max(t * t - 4 * det * det, 0.0))) / 2)
    return smax <= 1 - 1e-12


@functools.lru_cache(maxsize=4096)
def _hose_curve_range(ox: float, oz: float, mx: float, mz: float, tilt_rad: float,
                      r_min: float, slope_min: float, step: float = 25.0) -> tuple[float, float] | None:
    """Shortest and longest hose (mm) that leaves the outlet straight down and enters the socket mouth along
    the column axis (tilted `tilt_rad` with the head), as a cubic Bezier with handle lengths from `step` to 900 mm,
    never bending tighter than `r_min` and never flatter than `slope_min` degrees. None if no such curve exists."""
    # The same test as `_bezier_stats(pts)` followed by `kmax <= 1 / r_min and smin >= slope_min`, bit for bit
    # (2026-11-14, perf): the bend and fall are checked point by point and the first failing point rejects the curve,
    # the t-only coefficients are hoisted, and the length is only measured for curves that fit. Every float is formed
    # by the same operations in the same order as in `_bezier_stats`, so the range is identical
    # (tests/test_cad.py, "matches the reference"; docs/history/ci-perf-2026-11-14-open-tennis-hose-curve.md).
    nseg = 24
    ts = [k / nseg for k in range(nseg + 1)]
    deriv = [(3 * (1 - t) * (1 - t), 6 * (1 - t) * t, 3 * t * t, 6 * (1 - t), 6 * t) for t in ts]
    cap = 1 / r_min
    if not (0.0 <= cap and 90.0 >= slope_min):      # kmax starts at 0 and smin at 90 in `_bezier_stats`
        return None
    st, ct = math.sin(tilt_rad), math.cos(tilt_rad)
    lo = hi = None
    n = int(900 / step)
    for i in range(1, n + 1):
        l0 = i * step
        p1z = oz - l0
        for j in range(1, n + 1):
            l1 = j * step
            pts = ((ox, oz), (ox, p1z), (mx - l1 * st, mz + l1 * ct), (mx, mz))
            (x0, z0), (x1, z1), (x2, z2), (x3, z3) = pts
            dx01, dx12, dx23 = x1 - x0, x2 - x1, x3 - x2
            dz01, dz12, dz23 = z1 - z0, z2 - z1, z3 - z2
            sx0, sx1 = x2 - 2 * x1 + x0, x3 - 2 * x2 + x1
            sz0, sz1 = z2 - 2 * z1 + z0, z3 - 2 * z2 + z1
            ok = True
            for c0, c1, c2, e0, e1 in deriv:
                ax = c0 * dx01 + c1 * dx12 + c2 * dx23
                az = c0 * dz01 + c1 * dz12 + c2 * dz23
                sp = math.hypot(ax, az)
                if sp > 1e-9:
                    bx = e0 * sx0 + e1 * sx1
                    bz = e0 * sz0 + e1 * sz1
                    if abs(ax * bz - az * bx) / sp ** 3 > cap or math.degrees(math.atan2(abs(az), abs(ax))) < slope_min:
                        ok = False
                        break
            if not ok:
                continue
            length = _bezier_length(pts, nseg)
            lo = length if lo is None else min(lo, length)
            hi = length if hi is None else max(hi, length)
    return None if lo is None else (lo, hi)


@functools.lru_cache(maxsize=4096)
def _hose_curve_range_3d(o: tuple, m: tuple, u: tuple, r_min: float, slope_min: float,
                         step: float = 25.0, n: int = 24) -> tuple[float, float] | None:
    """3-D form of `_hose_curve_range` (2026-11-10): the hose leaves outlet point `o` straight down and enters socket
    mouth `m` along the unit column axis `u` (pointing out of the socket, up the column), which need not lie in the
    x-z plane once the head turns in azimuth. Same Bezier family, bend limit and fall limit; the fall is measured
    from the horizontal plane (tangent's z against its horizontal length). Shortest and longest fitting hose, or None."""
    # 2026-11-14 (perf): the per-t coefficients are hoisted and the 3-vectors unrolled. Each float is formed by the same
    # operations in the same order as before (e.g. 3 * w * w * d is (3 * w * w) * d), so the range is bit-identical.
    kcap = 1 / r_min
    tan_min = math.tan(math.radians(slope_min))
    ts = [k / n for k in range(n + 1)]
    deriv = [(3 * (1 - t) * (1 - t), 6 * (1 - t) * t, 3 * t * t, 6 * (1 - t), 6 * t) for t in ts]
    place = [((1 - t) ** 3, 3 * (1 - t) * (1 - t) * t, 3 * (1 - t) * t * t, t ** 3) for t in ts[1:]]
    ox, oy, oz = o
    mx, my, mz = m
    ux, uy, uz = u
    lo = hi = None
    cnt = int(900 / step)
    for i in range(1, cnt + 1):
        l0 = i * step
        p1x, p1y, p1z = ox, oy, oz - l0
        for j in range(1, cnt + 1):
            l1 = j * step
            p2x, p2y, p2z = mx + l1 * ux, my + l1 * uy, mz + l1 * uz
            d01x, d01y, d01z = p1x - ox, p1y - oy, p1z - oz
            d12x, d12y, d12z = p2x - p1x, p2y - p1y, p2z - p1z
            d23x, d23y, d23z = mx - p2x, my - p2y, mz - p2z
            s0x, s0y, s0z = p2x - 2 * p1x + ox, p2y - 2 * p1y + oy, p2z - 2 * p1z + oz
            s1x, s1y, s1z = mx - 2 * p2x + p1x, my - 2 * p2y + p1y, mz - 2 * p2z + p1z
            ok = True
            for c0, c1, c2, e0, e1 in deriv:
                a0 = c0 * d01x + c1 * d12x + c2 * d23x
                a1 = c0 * d01y + c1 * d12y + c2 * d23y
                a2 = c0 * d01z + c1 * d12z + c2 * d23z
                h = math.hypot(a0, a1)
                if abs(a2) < tan_min * h - 1e-12:      # flatter than the fall limit
                    ok = False
                    break
                b0 = e0 * s0x + e1 * s1x
                b1 = e0 * s0y + e1 * s1y
                b2 = e0 * s0z + e1 * s1z
                cx = a1 * b2 - a2 * b1
                cy = a2 * b0 - a0 * b2
                cz = a0 * b1 - a1 * b0
                sp = math.sqrt(a0 ** 2 + a1 ** 2 + a2 ** 2)
                if sp > 1e-9 and math.sqrt(cx * cx + cy * cy + cz * cz) > kcap * sp ** 3:
                    ok = False
                    break
            if not ok:
                continue
            length, prev = 0.0, o
            for k0, k1, k2, k3 in place:
                q = (k0 * ox + k1 * p1x + k2 * p2x + k3 * mx, k0 * oy + k1 * p1y + k2 * p2y + k3 * my,
                     k0 * oz + k1 * p1z + k2 * p2z + k3 * mz)
                length += math.dist(prev, q)
                prev = q
            lo = length if lo is None else min(lo, length)
            hi = length if hi is None else max(hi, length)
    return None if lo is None else (lo, hi)


# Copper resistance per metre at 20 C by AWG (standard table), and the outside diameter of silicone-insulated
# fine-strand hook-up wire of that gauge (an assumption: read your reel). Used by the cable checks (2026-11-13).
AWG_OHM_PER_M = {14: 8.29e-3, 16: 13.2e-3, 18: 20.9e-3, 20: 33.3e-3, 22: 52.9e-3, 24: 84.2e-3, 26: 134e-3}
AWG_OD_MM = {14: 3.0, 16: 2.5, 18: 2.0, 20: 1.7, 22: 1.5, 24: 1.3, 26: 1.1}
# Heavier gauges for the battery feed (same standard table), kept apart so the lead-loss tables above stay as they were.
FEED_AWG_OHM_PER_M = {12: 5.21e-3, 10: 3.28e-3, 8: 2.06e-3}
# Current each gauge may carry in a tied bundle on the deck, the figure a branch fuse must not exceed (2026-11-14). An
# assumption on the low side of published chassis-wiring tables: silicone hook-up wire is often rated well above it, so
# read your wire's rating before fusing a branch higher.
AWG_AMPS = {8: 55.0, 10: 40.0, 12: 30.0, 14: 20.0, 16: 15.0, 18: 10.0, 20: 7.5, 22: 5.0, 24: 3.5, 26: 2.2}
# Blade (ATO/ATC) fuse ratings, then MIDI bolt-down ratings above 40 A.
FUSE_SIZES_A = (1.0, 2.0, 3.0, 4.0, 5.0, 7.5, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 50.0, 60.0, 80.0, 100.0)


def fuse_for(amps: float) -> float:
    """Smallest standard fuse rating at or above `amps`."""
    return next(f for f in FUSE_SIZES_A if f >= amps - 1e-9)


def gauge_for(amps: float) -> int:
    """Thinnest gauge in AWG_AMPS that may carry `amps` (a branch wire sized to its fuse)."""
    return max(g for g, a in AWG_AMPS.items() if a >= amps - 1e-9)


def rlc_step(v: float, r: float, l: float, c: float):
    """Current into an uncharged capacitor C switched onto a source V through series R and L, closed form (2026-11-14,
    the contactor inrush). Returns (i(t), t_peak, i_peak). Over-, under- and critically damped cases are each solved
    exactly; tests check them against a brute-force integration."""
    a, w0 = r / (2 * l), 1 / math.sqrt(l * c)
    if a > w0 * (1 + 1e-9):
        d = math.sqrt(a * a - w0 * w0)
        s1, s2 = -a + d, -a - d
        def i(t):
            return v / (l * (s1 - s2)) * (math.exp(s1 * t) - math.exp(s2 * t))
        tp = math.log(s2 / s1) / (s1 - s2)
    elif a < w0 * (1 - 1e-9):
        wd = math.sqrt(w0 * w0 - a * a)
        def i(t):
            return v / (l * wd) * math.exp(-a * t) * math.sin(wd * t)
        tp = math.atan2(wd, a) / wd
    else:
        def i(t):
            return v / l * t * math.exp(-a * t)
        tp = 1 / a
    return i, tp, i(tp)


def time_above(i, tp: float, level: float, horizon: float) -> float:
    """How long a single-humped current i(t) (peak at tp) stays above `level`, by bisection on each side of the peak.
    An underdamped ring's later humps are lower than the first and are ignored (the BMS's delay timer restarts)."""
    if i(tp) <= level:
        return 0.0
    lo, hi = 0.0, tp
    for _ in range(200):
        m = (lo + hi) / 2
        lo, hi = (lo, m) if i(m) > level else (m, hi)
    t_on = hi
    lo, hi = tp, tp + horizon
    if i(hi) > level:
        return horizon
    for _ in range(200):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if i(m) > level else (lo, m)
    return lo - t_on


@functools.lru_cache(maxsize=4096)
def _cable_loop_range(f: tuple, h: tuple, d: tuple, elev_deg: float, shape: tuple, r_min: float, rb: float,
                      step: float = 10.0, hmax: float = 360.0, n: int = 32,
                      target: float | None = None) -> tuple | None:
    """Shortest and longest free cable loop (mm) in the head's mid-plane (y = 0), pivot-relative (x, z), that leaves
    the turntable gland `f` straight up and enters the head clip `h` along `-d` (`d` points from the clip into the
    loop, already turned with the head), as a cubic Bezier with handles `step` to `hmax`, never bending tighter than
    `r_min` and keeping the bundle (radius `rb`) off everything in `shape`:
    (turntable top z, pivot bolt radius, head x0, head x1, head-frame z above which the head is full, lower wheel
    centre z and radius in the head frame, pivot z in the head frame, head-frame standoff circles (x, z, r)...).
    With `target`, also returns the control points of the fitting curve whose length is nearest it.
    None if no curve fits (2026-11-13)."""
    z_tt, bolt_r, hx0, hx1, hz_full, wz, wr, pz, *stand = shape
    c, s = math.cos(math.radians(elev_deg)), math.sin(math.radians(elev_deg))

    def free(x: float, z: float) -> bool:
        if z < z_tt + rb or math.hypot(x, z) < bolt_r + rb:
            return False
        hx, hz = x * c + z * s, -x * s + z * c + pz          # head frame (x from the wheel centres, z from the ball path)
        if hx0 - rb < hx < hx1 + rb and hz > hz_full - rb:
            return False
        if math.hypot(hx, hz - wz) < wr + rb:
            return False
        return all(math.hypot(hx - sx, hz - sz) >= sr + rb for sx, sz, sr in stand)

    kcap = 1 / r_min
    lo = hi = None
    best = None
    cnt = int(hmax / step)
    for i in range(1, cnt + 1):
        p1 = (f[0], f[1] + i * step)
        for j in range(1, cnt + 1):
            p2 = (h[0] + j * step * d[0], h[1] + j * step * d[1])
            pts = (f, p1, p2, h)
            ok, length, prev, prev_a = True, 0.0, f, None
            for k in range(n + 1):
                t = k / n
                u = 1 - t
                q = (u ** 3 * f[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * h[0],
                     u ** 3 * f[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * h[1])
                if 0 < k < n and not free(*q):
                    ok = False
                    break
                a = [3 * u * u * (p1[m] - f[m]) + 6 * u * t * (p2[m] - p1[m]) + 3 * t * t * (h[m] - p2[m]) for m in (0, 1)]
                b = [6 * u * (p2[m] - 2 * p1[m] + f[m]) + 6 * t * (h[m] - 2 * p2[m] + p1[m]) for m in (0, 1)]
                sp = math.hypot(*a)
                # a fold back on itself (handles past each other on one line) has zero cross product: catch it as a
                # tangent that turns more than 90 deg between samples, or stops
                if sp < 1e-6 or (prev_a and a[0] * prev_a[0] + a[1] * prev_a[1] <= 0) \
                        or abs(a[0] * b[1] - a[1] * b[0]) > kcap * sp ** 3:
                    ok = False
                    break
                prev_a = a
                if k:
                    length += math.dist(prev, q)
                prev = q
            if not ok:
                continue
            lo = length if lo is None else min(lo, length)
            hi = length if hi is None else max(hi, length)
            if target is not None and (best is None or abs(length - target) < abs(best[0] - target)):
                best = (length, pts)
    if lo is None:
        return None
    return (lo, hi) if target is None else (lo, hi, best)


def _seg_dist_2d(q: tuple, a: tuple, b: tuple) -> float:
    """Distance from (x, z) point q to the segment a-b."""
    vx, vz = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vz) / (vx * vx + vz * vz)))
    return math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vz)


def _count_below(rows: list, mass: list, lam: float) -> int:
    """Eigenvalues of K x = lam M x below `lam` (Sylvester's inertia: the negative pivots of an LDL^T of K - lam M).

    K is symmetric, given as its lower triangle in profile form: rows[i] = (first column j0, [K[i][j0], ..., K[i][i]]);
    M is diagonal. Fill stays inside each row's profile, so a banded matrix with a few dense border rows (the lift
    belt's loop, both of whose ends sit on the drive pulley) costs little. No pivoting: a zero pivot is nudged
    (2026-11-15, `Feeder.lift_strand_modes`)."""
    n = len(rows)
    first = [r[0] for r in rows]
    lrow: list = [None] * n
    d = [0.0] * n
    neg = 0
    for i in range(n):
        j0, vals = rows[i]
        li = list(vals)
        li[-1] -= lam * mass[i]
        for j in range(j0, i):
            lj, fj = lrow[j], first[j]
            s = li[j - j0]
            for k in range(max(j0, fj), j):
                s -= li[k - j0] * d[k] * lj[k - fj]
            li[j - j0] = s / d[j]
        s = li[-1]
        for k in range(j0, i):
            s -= li[k - j0] * li[k - j0] * d[k]
        if s == 0.0:
            s = -1e-300
        d[i] = s
        lrow[i] = li
        neg += s < 0.0
    return neg


def _modes_below(rows: list, mass: list, f_max_hz: float, tol: float = 1e-5) -> list:
    """Every natural frequency (Hz) of K x = lam M x under `f_max_hz`, by bisection on `_count_below`."""
    lam_max = (2 * math.pi * f_max_hz) ** 2
    n = _count_below(rows, mass, lam_max)
    out = []
    lo = 0.0
    for idx in range(n):
        a, b = lo, lam_max
        while b - a > tol * max(b, 1e-9):
            c = 0.5 * (a + b)
            if _count_below(rows, mass, c) > idx:
                b = c
            else:
                a = c
        lam = 0.5 * (a + b)
        out.append(math.sqrt(max(lam, 0.0)) / (2 * math.pi))
        lo = a
    return out


def _string_beam_rows(h: float, tension: list, ei: float) -> list:
    """Finite-difference stiffness of a pinned-pinned tensioned beam on N + 1 nodes h metres apart, unknowns the N - 1
    interior deflections: -(T w')' + EI w'''' with tension[i] the tension between node i and i + 1, and w = w'' = 0 at
    both ends (a ghost node w_-1 = -w_1). Each row is times h, so the masses are node masses in kg."""
    n = len(tension) - 1
    b = ei / h ** 3
    rows = []
    for i in range(n):                                 # interior node i + 1
        t_l, t_r = tension[i], tension[i + 1]
        diag = (t_l + t_r) / h + 6 * b
        if i == 0:
            diag -= b                                  # pinned end's ghost node
        if i == n - 1:
            diag -= b
        j0 = max(0, i - 2)
        vals = []
        for j in range(j0, i + 1):
            if j == i - 2:
                vals.append(b)
            elif j == i - 1:
                vals.append(-t_l / h - 4 * b)
            else:
                vals.append(diag)
        rows.append((j0, vals))
    return rows


@functools.lru_cache(maxsize=4096)
def _lead_range(f: tuple, df: tuple, e: tuple, de: tuple, keep_out: tuple, r_min: float, rb: float,
                step: float = 5.0, hmax: float = 220.0, n: int = 40, target: float | None = None) -> tuple | None:
    """Shortest and longest free lead (mm) in 3D from `f`, leaving along the unit vector `df`, to `e`, entered along
    `-de` (`de` points from `e` into the lead), as a cubic Bezier with handles `step` to `hmax`, never bending
    tighter than `r_min` and keeping a bundle of radius `rb` (with its clearance) off `keep_out`:
    (z of the turntable top, y of the cheek's outer face, the turntable plate's -y edge (the lead never hangs outboard
    of it, where it could catch on the mast as the head turns), feet as (x0, x1, y_outer, z_top)..., then the actuator
    as ("act", y plane, body radius, (x, z) eye end, (x, z) far end, anchor (x, z), anchor eye radius)). Points within
    1.5 rb of an end are not tested against the face that end sits on (the lead leaves it there). With `target`,
    also returns the control points of the fitting curve whose length is nearest it. None if no curve fits
    (2026-11-14, the elevation actuator's lead)."""
    z_tt, y_face, y_edge, *rest = keep_out
    feet = [k for k in rest if k[0] != "act"]
    _, ay, ar, b0, b1, anc, eye_r = next(k for k in rest if k[0] == "act")

    def free(q: tuple) -> bool:
        x, y, z = q
        if z < z_tt + rb or y < y_edge + rb:
            return False
        if y > y_face - rb and math.dist(q, f) > 1.5 * rb:
            return False
        for x0, x1, yo, zt in feet:
            if x0 - rb < x < x1 + rb and y > yo - rb and z < zt + rb:
                return False
        if abs(y - ay) < ar + rb and math.dist(q, e) > 1.5 * rb:
            if math.hypot(_seg_dist_2d((x, z), b0, b1), y - ay) < ar + rb:
                return False
            if math.hypot(x - anc[0], z - anc[1]) < eye_r + rb:
                return False
        return True

    kcap = 1 / r_min
    lo = hi = best = None
    cnt = int(hmax / step)
    for i in range(1, cnt + 1):
        p1 = tuple(f[m] + i * step * df[m] for m in range(3))
        for j in range(1, cnt + 1):
            p2 = tuple(e[m] + j * step * de[m] for m in range(3))
            ok, length, prev, prev_a = True, 0.0, f, None
            for k in range(n + 1):
                t = k / n
                u = 1 - t
                q = tuple(u ** 3 * f[m] + 3 * u * u * t * p1[m] + 3 * u * t * t * p2[m] + t ** 3 * e[m] for m in range(3))
                if 0 < k < n and not free(q):
                    ok = False
                    break
                a = [3 * u * u * (p1[m] - f[m]) + 6 * u * t * (p2[m] - p1[m]) + 3 * t * t * (e[m] - p2[m]) for m in range(3)]
                b = [6 * u * (p2[m] - 2 * p1[m] + f[m]) + 6 * t * (e[m] - 2 * p2[m] + p1[m]) for m in range(3)]
                sp = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2)
                cr = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
                if sp < 1e-6 or (prev_a and sum(a[m] * prev_a[m] for m in range(3)) <= 0) \
                        or math.sqrt(cr[0] ** 2 + cr[1] ** 2 + cr[2] ** 2) > kcap * sp ** 3:
                    ok = False
                    break
                prev_a = a
                if k:
                    length += math.dist(prev, q)
                prev = q
            if not ok:
                continue
            lo = length if lo is None else min(lo, length)
            hi = length if hi is None else max(hi, length)
            if target is not None and (best is None or abs(length - target) < abs(best[0] - target)):
                best = (length, (f, p1, p2, e))
    if lo is None:
        return None
    return (lo, hi) if target is None else (lo, hi, best)


@dataclass(frozen=True)
class Collector:
    # Tennis ball (ITF 65.4-68.6 mm).
    ball_d: float = 67.0

    # Base plate (laser-cut aluminium).
    plate_t: float = 5.0
    base_x0: float = -260.0       # rear edge
    base_x1: float = 150.0        # front edge
    base_half_w: float = 250.0
    base_z: float = 35.0          # underside height above the ground
    corner_r: float = 15.0

    # Drive: 37 mm-class gearmotor with encoder, 6 mm D shaft, wheel on a hub.
    wheel_d: float = 150.0
    wheel_w: float = 40.0
    wheel_gap: float = 6.0        # base edge to wheel inner face
    motor_d: float = 37.0
    motor_len: float = 125.0      # gearbox + motor + encoder
    motor_face_inset: float = 5.0  # motor output face inside the base edge
    clamp_len: float = 45.0       # printed clamp grips this much gearbox
    clamp_wall: float = 8.0
    clamp_w: float = 64.0         # clamp width across the motor (x)
    clamp_bolt_x: float = 25.5    # cap bolts at x = +/- this: an insert pocket 4 mm clear of the motor bore (2026-11-20)

    # M4 heat-set inserts (short, 5.7 mm long). Check your insert's datasheet: most M4 short inserts want a
    # 5.6 mm hole. The pilots before 2026-11-20 were 4.0-4.4 mm, which no M4 insert fits.
    insert_hole_d: float = 5.6
    insert_depth: float = 6.5

    # Pickup drum ("ball mower" rod cage). Balls squeeze between rods.
    drum_len: float = 450.0       # inside length between the end discs
    disc_r: float = 176.0         # disc rim rolls on the ground
    rod_circle_r: float = 158.0
    rod_d: float = 3.0            # spring-steel (music) wire
    rod_gap_target: float = 53.0  # clear gap between rods; prototype to tune
    ring_inner_r: float = 135.0
    hub_r: float = 30.0
    spoke_w: float = 30.0
    bearing_od: float = 22.0      # 608/F608 bearing, 8 mm bore
    cover_r: float = 148.0
    clamp_ring_t: float = 3.0
    cover_t: float = 3.0
    drum_x: float = 366.0         # drum centre (drum_z = disc_r: it sits on the ground)

    # Yoke arms: pivot on the base, carry the drum.
    arm_t: float = 5.0
    arm_end_r: float = 20.0
    pivot_x: float = 120.0
    pivot_z: float = 70.0
    arm_gap: float = 4.0          # axle spacer length past the cover: the hatch lifts 3 mm off its seat in it
    pivot_shoulder: float = 40.0  # ISO 7379 8 mm shoulder bolt (M6 thread): the arm and pivot block fit its shoulder
    pivot_float: float = 0.5      # shoulder left past the stack, so the arm swings once the nut is tight
    axle_spacer_od: float = 12.0  # 8 mm ID spacer from the arm to the 608's inner race (inner race land ~12.1 mm)
    rivet_nut_hole_d: float = 7.0  # M5 rivet nut body (the disc holes were 5.5 mm before 2026-11-20)

    # Caster at the rear.
    caster_x: float = -225.0
    caster_height: float = 25.0   # bought-in ball caster, mounting face to ground
    # Its flange (2026-11-21): two M4 holes on this pitch along x, screwed up into heat-set inserts in the caster
    # adapter's underside. Assumed figures for a two-hole flange caster; set them from the one you buy and rebuild.
    caster_hole_pitch: float = 38.0
    caster_flange: tuple[float, float, float] = (50.0, 22.0, 3.0)   # x, y, thickness

    # Electronics tray on standoffs.
    tray_t: float = 3.0
    tray_x0: float = -205.0
    tray_x1: float = -85.0
    tray_half_w: float = 115.0
    standoff_h: float = 30.0
    # Raspberry Pi on four M2.5 x 6 mm female-female standoffs (2026-11-21): an M2.5 x 5 up through the tray into
    # each, an M2.5 x 4 down through the board. The standoff is taken as threaded right through, so each screw may
    # use half its length; the two tips must not meet.
    pi_standoff_h: float = 6.0
    pi_pcb_t: float = 1.6
    pi_board: tuple[float, float] = (56.0, 85.0)  # x, y: Pi 4/5 board, holes 3.5 mm in from the corner on 49 x 58

    # Battery envelope (24 V LiFePO4, 10 Ah class), strapped through base slots.
    battery: tuple[float, float, float] = (80.0, 180.0, 100.0)  # x, y, z
    battery_x: float = 90.0

    # Mast (camera) socket.
    mast_d: float = 20.0
    mast_len: float = 1000.0
    mast_x: float = -225.0        # over the caster: the socket and the caster adapter share one set of bolts

    # Yoke-lift switches, the front bumper (2026-11-21). Each arm carries a cam lobe behind its pivot; a roller-lever
    # microswitch on a printed tower sits on the horizontal line behind the pivot, its lever in the arm's plane. The
    # lobe pushes the roller out once the drum has risen `bump_lift_mm` and holds it there for every larger lift (the
    # azimuth home switch's ramp, `Feeder.home_switch_design`, turned on its side). Switch figures are the same
    # D2F-L3 class assumptions as the feeder's home switch.
    bump_lift_mm: float = 10.0        # drum rise at its axle where the switch should click (firmware: forward stops)
    bump_rest_mm: float = 3.0         # the lobe must not touch the roller below this rise (court bumps, a loose pivot)
    bump_sw_body: tuple = (12.8, 6.5, 5.8)  # along the lever's sweep (z here), along its travel (x), across (y)
    bump_sw_hole_pitch: float = 6.5   # its two mounting holes (M2 self-tapping into the tower; assumption)
    bump_sw_lever_mm: float = 5.0     # body face to the roller's far edge, free (assumption)
    bump_sw_roller_r: float = 2.4     # roller radius; its axis along y
    bump_sw_roller_w: float = 3.0     # roller width (inside the arm's 5 mm)
    bump_sw_pretravel_mm: float = 1.2  # roller travel to the click (assumption)
    bump_sw_overtravel_mm: float = 1.0  # roller travel past the click before the lever bottoms (assumption)
    bump_sw_repeat_mm: float = 0.05   # operating-position repeatability at the roller (assumption)
    bump_sw_op_tol_mm: float = 0.3    # operating-position tolerance part to part, at the roller (assumption)
    bump_runout_mm: float = 0.3       # the arm's 8.4 mm hole on the 8 mm shoulder (0.2) plus the lobe's cut error
    bump_free_clear_mm: float = 1.0   # roller's free edge outside the radius the ramp starts from
    bump_roller_r: float = 50.0       # roller's free near edge, mm from the pivot axis (30 put first touch 0.4 mm up)
    bump_cam_ramp_deg: float = 45.0   # lobe lead-in against the roller's travel (roller levers take up to about 45)
    bump_cam_end_deg: float = 45.0    # arm lift (deg) to which the lobe holds the switch closed (past the stop)
    bump_slot_mm: float = 1.5         # tower's travel either way along x in its base-plate slots, to set the click
    bump_tower_t: float = 14.0        # tower thickness along y, inboard of the switch
    bump_tower_len: float = 24.0      # tower length along x (two M4 inserts 12 mm apart)

    notes: list[str] = field(default_factory=list)

    # ---- derived -----------------------------------------------------------
    @property
    def base_top(self) -> float:
        return self.base_z + self.plate_t

    @property
    def axle_z(self) -> float:
        return self.wheel_d / 2

    @property
    def wheel_y(self) -> float:
        """Wheel centre-plane |y|."""
        return self.base_half_w + self.wheel_gap + self.wheel_w / 2

    @property
    def track(self) -> float:
        return 2 * self.wheel_y

    @property
    def motor_face_y(self) -> float:
        return self.base_half_w - self.motor_face_inset

    @property
    def drum_z(self) -> float:
        return self.disc_r

    @property
    def n_rods(self) -> int:
        return max(3, round(2 * math.pi * self.rod_circle_r / (self.rod_gap_target + self.rod_d)))

    @property
    def rod_gap(self) -> float:
        return 2 * math.pi * self.rod_circle_r / self.n_rods - self.rod_d

    @property
    def rod_len(self) -> float:
        return self.drum_len + 2 * self.plate_t

    @property
    def disc_inner_y(self) -> float:
        return self.drum_len / 2

    @property
    def arm_inner_y(self) -> float:
        return self.disc_inner_y + self.plate_t + max(self.cover_t, self.clamp_ring_t) + self.arm_gap

    @property
    def overall(self) -> tuple[float, float]:
        """(length, width) in mm."""
        return (self.drum_x + self.disc_r - self.base_x0, 2 * (self.wheel_y + self.wheel_w / 2))

    def drum_capacity(self, packing: float = 0.55) -> int:
        """Balls the drum holds at a loose random packing, ignoring the hub."""
        inner = math.pi * (self.rod_circle_r - self.rod_d) ** 2 * self.drum_len
        ball = math.pi / 6 * self.ball_d ** 3
        return int(inner * packing / ball)

    def check(self) -> list[str]:
        """Design-rule violations (empty list = all good)."""
        bad = []
        if not 0.70 * self.ball_d <= self.rod_gap <= 0.85 * self.ball_d:
            bad.append(f"rod gap {self.rod_gap:.1f} mm should squeeze a {self.ball_d} mm ball by 15-30%")
        if self.rod_circle_r + self.rod_d / 2 >= self.disc_r - 6:
            bad.append("rods too close to the disc rim")
        if self.rod_circle_r - self.rod_d / 2 - 6 <= self.ring_inner_r:
            bad.append("rods too close to the inside of the disc ring")
        if self.cover_r >= self.disc_r - 20:
            bad.append("cover overlaps the rod clamp ring")
        if self.drum_x - self.disc_r <= self.base_x1 + 20:
            bad.append("drum would hit the base plate")
        if self.base_z < 30:
            bad.append("ground clearance under 30 mm")
        if self.motor_face_y - self.motor_len < 40:
            bad.append("motors collide in the middle")
        if self.axle_z - self.motor_d / 2 - self.base_top < 4:
            bad.append("motor sits on the base plate: under 4 mm of clamp below it; larger wheels or a lower base")
        tray_ok = self.tray_x0 > self.base_x0 + 10 and self.tray_x1 < -self.motor_d
        if not tray_ok:
            bad.append("electronics tray does not fit between the rear edge and the motors")
        if abs(self.mast_x - self.caster_x) > 1e-9:
            bad.append("mast socket and caster adapter share their four bolts: mast_x must equal caster_x")
        # the caster's inserts: inside the 56 mm adapter by 2 mm, and 2 mm clear of the four M4 x 20 counterbores
        ins = self.insert_hole_d / 2
        cx = self.caster_hole_pitch / 2
        if cx + ins > 28 - 2 or math.hypot(20 - cx, 20) - 4.0 - ins < 2:
            bad.append("caster flange holes: an insert would break out of the adapter or into an M4 x 20 counterbore")
        if self.caster_flange[0] < self.caster_hole_pitch + 8:
            bad.append("caster flange too short for its hole pitch")
        bore = self.motor_d / 2 + 0.2
        if self.clamp_bolt_x - self.insert_hole_d / 2 - bore < 3 or self.clamp_w / 2 - self.clamp_bolt_x - self.insert_hole_d / 2 < 2:
            bad.append("motor clamp cap bolts: under 3 mm of plastic to the motor bore or 2 mm to the clamp's side")
        if self.arm_gap < self.cover_t + 0.5:
            bad.append("arm gap: the hatch cover cannot lift clear of the rod clamp ring to come off")
        if self.pivot_depth < 20:
            bad.append("pivot block under 20 mm deep: use a longer pivot shoulder bolt")
        bad += self.check_bump_switch()
        return bad

    @property
    def pivot_depth(self) -> float:
        """Pivot block depth along y: arm plus block fill the shoulder, less the float."""
        return self.pivot_shoulder - self.pivot_float - self.arm_t

    # ---- yoke-lift switches (2026-11-21) --------------------------------------
    @property
    def arm_len(self) -> float:
        return math.hypot(self.drum_x - self.pivot_x, self.drum_z - self.pivot_z)

    @property
    def arm_rest_deg(self) -> float:
        """The pivot-to-axle line's angle above horizontal with the drum on the ground."""
        return math.degrees(math.atan2(self.drum_z - self.pivot_z, self.drum_x - self.pivot_x))

    def drum_rise_mm(self, lift_deg: float) -> float:
        """How far the drum's axle rises when the arms turn up by `lift_deg` from rest."""
        a0 = math.radians(self.arm_rest_deg)
        return self.arm_len * (math.sin(a0 + math.radians(lift_deg)) - math.sin(a0))

    def lift_for_rise(self, rise_mm: float) -> float:
        """Arm lift (deg) that raises the axle by `rise_mm`."""
        a0 = math.radians(self.arm_rest_deg)
        return math.degrees(math.asin(math.sin(a0) + rise_mm / self.arm_len) - a0)

    def bump_switch_design(self) -> dict:
        """Where the yoke-lift switch and each arm's cam lobe sit, and when the switch clicks.

        Angles are arm lift from rest. The roller sits on the horizontal line behind the pivot (world angle 180 deg in
        the x-z plane); as the arm turns up, arm material that sat `lift` degrees above that line comes down onto it.
        Radii about the pivot: the ramp starts `bump_free_clear_mm` inside the roller's free near edge and rises at
        `bump_cam_ramp_deg` to the lobe, pretravel plus half the overtravel outside that edge, so the click lands in
        the middle of the lever's usable travel and stays pressed to `bump_cam_end_deg`. A radial error `d` at the
        roller moves the click by `d / tan(ramp)` of arc, which the arm turns into axle rise at `arm_len` over the cam
        radius. As on the feeder's home cam, a round roller is met `rho (1/cos - 1) / tan` of arc early and the ramp
        is set that much further along."""
        r_c = self.bump_roller_r
        r_base = r_c - self.bump_free_clear_mm
        depth = self.bump_sw_pretravel_mm + self.bump_sw_overtravel_mm / 2
        r_lobe = r_c + depth
        tan = math.tan(math.radians(self.bump_cam_ramp_deg))
        r_mid = (r_base + r_lobe) / 2
        ramp_deg = math.degrees((r_lobe - r_base) / tan / r_mid)
        trip = self.lift_for_rise(self.bump_lift_mm)
        early = math.degrees(self.bump_sw_roller_r * (1 / math.cos(math.radians(self.bump_cam_ramp_deg)) - 1)
                             / tan / r_mid)
        ramp0 = trip - math.degrees((r_c + self.bump_sw_pretravel_mm - r_base) / tan / r_mid) + early
        ramp1 = ramp0 + ramp_deg
        contact = ramp0 + math.degrees((r_c - r_base) / tan / r_mid) - early
        tw, rw, hz = self.bump_sw_body
        r_body_in = r_c + self.bump_sw_lever_mm
        r_body_out = r_body_in + rw
        y_mid = self.arm_inner_y + self.arm_t / 2
        per_mm = lambda d: math.degrees(d / tan / r_c)   # noqa: E731  roller radial mm -> lift deg
        rise = lambda deg: self.drum_rise_mm(trip + deg) - self.bump_lift_mm   # noqa: E731
        tol = per_mm(self.bump_sw_op_tol_mm)
        slot = per_mm(self.bump_slot_mm)
        return {
            "r_roller": r_c, "r_base": r_base, "r_lobe": r_lobe, "depth_mm": depth,
            "r_body_in": r_body_in, "r_body_out": r_body_out, "y_mid": y_mid,
            "y_tower_face": y_mid - hz / 2,
            "x_body": self.pivot_x - (r_body_in + r_body_out) / 2,
            "trip_deg": trip, "ramp0_deg": ramp0, "ramp1_deg": ramp1, "contact_deg": contact,
            "contact_rise_mm": self.drum_rise_mm(contact), "end_rise_mm": self.drum_rise_mm(self.bump_cam_end_deg),
            "repeat_rise_mm": rise(per_mm(self.bump_sw_repeat_mm)),
            "tol_rise_mm": (rise(-tol), rise(tol)),
            "slot_rise_mm": (rise(-slot), rise(slot)),
            "travel_window_mm": (self.bump_sw_pretravel_mm + self.bump_runout_mm,
                                 self.bump_sw_pretravel_mm + self.bump_sw_overtravel_mm - self.bump_runout_mm),
        }

    def bump_cam_profile(self, step_deg: float = 2.0) -> list[tuple[float, float]]:
        """The lobe's outline as (radius about the pivot, lift angle) pairs: from inside the pivot boss out along the
        ramp to the lobe's radius, round the lobe to `bump_cam_end_deg`, and back in round the boss."""
        h = self.bump_switch_design()
        r_in = self.arm_end_r - 2.0
        n = 8
        pts = [(r_in, h["ramp0_deg"])]
        pts += [(h["r_base"] + (h["r_lobe"] - h["r_base"]) * k / n,
                 h["ramp0_deg"] + (h["ramp1_deg"] - h["ramp0_deg"]) * k / n) for k in range(n + 1)]
        m = max(1, math.ceil((self.bump_cam_end_deg - h["ramp1_deg"]) / step_deg))
        pts += [(h["r_lobe"], h["ramp1_deg"] + (self.bump_cam_end_deg - h["ramp1_deg"]) * k / m) for k in range(1, m + 1)]
        pts += [(r_in, self.bump_cam_end_deg - (self.bump_cam_end_deg - h["ramp0_deg"]) * k / m) for k in range(m)]
        return pts

    def arm_stop_deg(self, step: float = 0.05) -> float:
        """Arm lift at which the lobe's ramp comes down onto the base plate: the yoke's hard stop. A lobe point drawn
        at lift k sits (lift - k) degrees below the line behind the pivot once the arm is up by `lift`."""
        pts = [(r, k) for r, k in self.bump_cam_profile() if r > self.arm_end_r]
        lift = 0.0
        while lift < 90.0:
            low = min(self.pivot_z - r * math.sin(math.radians(lift - k)) for r, k in pts if lift > k)  \
                if any(lift > k for _, k in pts) else self.pivot_z
            if low <= self.base_top:
                return lift
            lift += step
        return 90.0

    def check_bump_switch(self) -> list[str]:
        bad = []
        h = self.bump_switch_design()
        lo, hi = h["travel_window_mm"]
        if not lo <= h["depth_mm"] <= hi:
            bad.append(f"bump cam depth {h['depth_mm']:.2f} mm is outside the switch's usable travel {lo:.2f}-{hi:.2f} mm")
        if h["contact_rise_mm"] < self.bump_rest_mm:
            bad.append(f"bump cam meets the roller at {h['contact_rise_mm']:.1f} mm of drum rise, under "
                       f"bump_rest_mm {self.bump_rest_mm:g}: the switch would ride the cam at rest")
        if self.bump_sw_lever_mm < 2 * self.bump_sw_roller_r + 0.2:
            bad.append("bump switch roller would sit inside the switch body (lever shorter than the roller)")
        if self.bump_free_clear_mm < self.bump_runout_mm + 0.2:
            bad.append("bump switch roller could rub the arm before the ramp")
        if h["r_body_in"] - self.bump_slot_mm < h["r_lobe"] + 1.0:
            bad.append("bump switch body (at the slots' inner end) comes within 1 mm of the cam lobe")
        if h["r_base"] - self.bump_slot_mm < self.arm_end_r + 2.0:
            bad.append("bump cam ramp starts inside the arm's pivot boss: move the roller out")
        if self.bump_cam_end_deg < h["ramp1_deg"] + 10:
            bad.append("bump cam lobe is under 10 deg long past its ramp")
        stop = self.arm_stop_deg()
        if self.bump_cam_end_deg < stop:
            bad.append(f"bump cam lobe ends at {self.bump_cam_end_deg:g} deg of lift, before the arm's stop at "
                       f"{stop:.1f} deg: lifted further, the switch reads clear")
        if self.bump_sw_roller_w > self.arm_t - 1.0:
            bad.append("bump switch roller is wider than the arm less 1 mm")
        tower_x1 = h["x_body"] + self.bump_tower_len / 2 + self.bump_slot_mm
        if tower_x1 > self.pivot_x - 22 - 1.0:
            bad.append("bump switch tower (at the slots' front end) comes within 1 mm of the pivot block")
        if h["y_tower_face"] > self.arm_inner_y - 0.2:
            bad.append("bump switch body sticks inboard of the arm's plane: the tower would rub the arm")
        if h["y_tower_face"] - self.bump_tower_t < self.motor_face_y - 0.0 and \
                h["x_body"] - self.bump_tower_len / 2 - self.bump_slot_mm < self.clamp_w / 2 + 1.0:
            bad.append("bump switch tower runs into a motor clamp")
        return bad


DEFAULT = Collector()


@dataclass(frozen=True)
class Feeder:
    """Feeder + moving catch net, in millimetres.

    Frame: origin on the ground at the middle of the net plane, x toward the
    player, y along the net (the base rolls along y), z up. The net hangs in
    the plane x = 0..25. The launcher head pivots about a y axis (elevation) on
    a turntable (azimuth) behind the net.
    """
    ball_d: float = 67.0
    plate_t: float = 5.0

    # Base: 2040 extrusion (20 wide x 40 tall) rectangle on four wheels, plus the
    # 3 m net beam as its front member.
    beam_len: float = 3000.0
    base_depth: float = 700.0     # x extent, rear edge to net plane
    base_half_w: float = 450.0    # side rails' outer faces
    rail_w: float = 20.0
    rail_h: float = 40.0
    rail_z: float = 155.0         # underside of the rails
    wheel_d: float = 150.0
    wheel_w: float = 40.0
    wheel_x: tuple[float, float] = (-100.0, -600.0)
    gearmotor_d: float = 37.0
    gearmotor_len: float = 100.0
    bracket_t: float = 5.0

    # Mast: four posts and a turntable.
    post_dx: float = 80.0         # posts at head_x +- this
    post_half_y: float = 160.0    # 130 until 2026-11-12: nose up 45 deg the head's plates met a rear post at 32.3 deg, short of the hard stops' reach
    mast_top_z: float = 640.0     # underside of the fixed mast plate
    bearing_h: float = 10.0       # lazy-susan bearing
    bearing_d: float = 150.0

    # Launcher head (local frame: origin between the wheels, x to the player).
    wheel_head_d: float = 150.0
    wheel_head_w: float = 45.0
    wheel_gap: float = 54.0       # ball squeezed ~13 mm
    plate_half_y: float = 40.0    # inner face of the head plates: room for a 67 mm ball
    motor_d: float = 63.0
    motor_len: float = 70.0
    motor_pitch: float = 25.0     # M4 square
    head_x0: float = -250.0       # plate rear edge, relative to the wheel centres (the feed shuttle runs back here)
    head_x1: float = 110.0
    head_z0: float = -225.0
    head_z1: float = 190.0
    pivot_z_rel: float = -200.0   # elevation axis below the ball path
    head_x: float = -110.0        # world x of the wheel centres (muzzle ends at the net plane)
    launch_z: float = 1000.0      # ball path height
    elev_min: float = -15.0
    elev_max: float = 45.0
    az_max: float = 30.0          # head turns this far either side of straight ahead (hardware/feeder-catcher.md)
    az_steps: int = 2             # azimuth poses checked from 0 to az_max (the hopper sits on y = 0, so -az mirrors +az)

    # Cheeks that hold the head's pivot bolt.
    cheek_x_half: float = 60.0
    cheek_gap: float = 2.5

    # Net frame.
    pole_d: float = 25.0
    net_w: float = 3000.0
    net_h: float = 2500.0
    camera_bar_len: float = 800.0

    # Wind check
    net_solidity: float = 0.2     # fraction of the net area that is twine
    drag_coeff: float = 1.2
    design_wind: float = 8.0      # m/s steady (Beaufort 5)
    foot_half_y: float = 1450.0

    # Feed: balls queue in a column that drops into the pocket of a sliding
    # shuttle between the head plates; the shuttle carries one ball forward to
    # the wheels, its solid rear closing the column meanwhile. A hose joins the
    # column's top socket to the hopper.
    feed_col_x: float = -125.0    # column axis, relative to the wheel centres
    feed_clear: float = 0.8       # printed parts' gap to each head plate
    feed_stroke: float = 95.0
    feed_floor_t: float = 8.0
    shuttle_h: float = 72.0       # taller than one ball, shorter than two
    socket_h: float = 40.0
    # Front retainer: two printed flexure arms narrow the shuttle's open front so a ball
    # cannot roll out when the head tilts nose-down; the wheels pull it through.
    retain_frac: float = 0.87     # narrowed gap, as a fraction of the ball diameter
    retain_t: float = 1.6         # arm thickness (about four 0.4 mm lines)
    retain_relief: float = 5.0    # gap behind each arm for it to flex into
    retain_len: float = 32.0      # arm length from its root to the free end
    petg_e_mpa: float = 1500.0    # printed PETG bending modulus across layers (assumption)
    petg_strain_max: float = 0.02  # working strain limit for a printed arm (assumption)
    ball_g: float = 57.7          # ITF ball mass is 56 to 59.4 g; the flight model's ball (ballistics.DEFAULT_BALL)
    wheel_pull_n: float = 60.0    # force the wheels put on a ball along the path (assumption: measure it)
    # Launch: top speed and spin the head must reach, and the traction the nip must give.
    launch_v_max: float = 25.0    # m/s off the muzzle (assumption: a fast practice drive)
    launch_topspin_rpm: float = 3000.0  # at that speed (assumption)
    speed_eff: float = 0.85       # exit speed / mean wheel surface speed: tennisbots.launcher.WheelLauncher default
    spin_eff: float = 0.5         # exit spin / no-slip spin: same default
    wheel_rpm_max: float = 7000.0  # same default: motor and bearing limit (assumption)
    ball_stiff_n_mm: float = 20.0  # force per mm of squeeze between the wheels (assumption: measure it)
    wheel_mu: float = 0.8         # rubber on felt (assumption: measure it)
    # Wheel-axle squaring stack (assumptions: laser-cut 5052 plates, spacers cut on a saw; measure the first build).
    seat_gap_mm: float = 0.25     # motor face lifted off the plate at one edge (flatness, burr)
    bore_pos_tol_mm: float = 0.15  # laser bore position error, each plate
    plate_slot_play_mm: float = 0.4  # plates' x-offset from tab-and-slot clearance
    spacer_len_tol_mm: float = 0.3  # spacer length difference front to rear
    # Sleeve take-up (2026-11-10): the hose's top end slides up and down inside a rigid vertical sleeve under the
    # outlet, so the ball path stays a vertical drop plus one falling curve (assumptions: measure the first build).
    sleeve_overlap_mm: float = 20.0   # the collar never comes nearer than this to the sleeve's lower end
    sleeve_clear_mm: float = 14.0     # sleeve bore over the hose OD: room for the printed collar's socket wall
    sleeve_wall_mm: float = 3.0       # rigid tube wall (assumption: a drain or ducting tube; measure yours)
    sleeve_top_mm: float = 20.0       # outlet to the sleeve's top end (the printed socket under the sloped shelf)
    collar_h_mm: float = 40.0         # printed collar bonded on the hose's top end, slides in the sleeve
    collar_tab_mm: float = 12.0       # the collar's tab: as tall as this, and reaching this far past the sleeve's slot
    # Take-up spring and its bracket (2026-11-20; a loose part "on a bracket behind the sleeve" until then). All the
    # spring's figures are assumptions for a small constant-force spring: check them against the one you buy.
    cf_band_w: float = 12.7           # band width (1/2 in., a common width for 2-10 N springs)
    cf_band_t: float = 0.10           # band thickness
    cf_coil_od: float = 30.0          # the coil's outside diameter with the band wound up
    cf_spring_id: float = 17.0        # the coil's natural inside diameter (relaxed, off its drum)
    cf_spool_d: float = 20.0          # printed spool the coil turns on: makers ask 10-20% over the natural ID
    cf_spool_flange_t: float = 1.5    # the spool's two flanges
    cf_wraps_left: float = 1.5        # turns kept on the spool at full extension (makers' minimum)
    cf_band_margin: float = 5.0       # the band's tangent point above the tab's top at the highest pose
    spring_cheek_t: float = 6.0       # the bracket's two cheeks
    spring_axle_len: float = 40.0     # M4 axle screw through both cheeks and the spool, nyloc on the far side
    hose_id: float = 72.0
    hose_od: float = 82.0
    hose_min_bend: float = 150.0  # smallest bend radius the hose tolerates
    feed_min_slope_deg: float = 30.0  # steepest-needed: a ball will not roll down less in a smooth hose (assumption)

    # Hopper: a storage tub on a sloped laser shelf, on four posts on the deck.
    tub_l: float = 440.0
    tub_w: float = 340.0
    tub_h: float = 250.0
    tub_wall: float = 3.0
    packing: float = 0.55         # fraction of the tub's inside volume that balls fill, with a sloped floor
    want_balls: int = 120
    shelf_slope_deg: float = 12.0  # falls toward the net, to the outlet
    hopper_out_x: float = -400.0   # -330 until 2026-11-10; -400 is as far back as the front posts allow (30 mm in from the shelf's front edge)
    hopper_out_z: float = 2025.0   # underside of the shelf at the outlet: the lowest at which the sleeve take-up fits every pose
                                   # (1560 left no hose curve at -15 or +45 deg, 2026-11-03; 1700 needed a pulley loop, 2026-11-10;
                                   # 2000 fitted azimuth 0 only: at +45 deg turned 30 deg the shortest hose was 31 mm too long, 2026-11-10)
    post_front_x: float = -380.0
    post_rear_x: float = -640.0
    shelf_post_y: float = 290.0    # 225 until 2026-11-10 (turned 30 deg at 15-35 deg nose up, the head's plates cut into the front posts); 245 until 2026-11-12 (clear to 31.6 deg only, short of the hard stops' reach)
    # Post-top wedges (2026-11-21): the posts' tops are cut square and the shelf falls 12 deg, so until now a
    # post touched the shelf only along its net-side edge (a 4.3 mm gap at the rear edge) and the shelf's M5s,
    # drilled normal to the plate, met the post's vertical tapped bores 12 deg off. A printed PETG wedge now fills
    # the gap and the M5s run vertical through a printed taper washer, an oversized shelf hole and the wedge.
    post_wedge_min_t: float = 3.0     # wedge's thin (net-side) end; the posts are cut this much shorter
    post_washer_min_t: float = 1.5    # taper washer's thin (uphill) side, under the screw head
    post_washer_d: float = 12.0       # taper washer's outside diameter (an M5 button head is 9.5 mm)
    shelf_post_hole: float = 6.6      # shelf hole for the vertical M5: 5 / cos 12 + 5 tan 12 = 6.17 mm, plus 0.4 play
    print_min_wall: float = 1.2       # thinnest printed section the checks accept, mm (three 0.4 mm perimeters)
    petg_mu: float = 0.3              # PETG on aluminium (assumed; a dry, clean plate)
    # Hopper frame loads and bracing (all assumptions to replace with a measurement).
    tub_mass_kg: float = 1.6          # empty storage tub
    side_load_g: float = 0.25         # sway load at the shelf as a fraction of the full hopper's weight
    side_load_min_n: float = 60.0     # a person leaning on it or a bump, if that is larger
    ext_E_mpa: float = 70000.0        # 6063 aluminium
    ext_I_weak_mm4: float = 9000.0    # 2040 T-slot, weak axis (catalogue figure is about 0.9 cm^4: check yours)
    ext_I_2020_mm4: float = 6000.0    # 2020 T-slot, either axis (about 0.6 cm^4)
    ext_A_2020_mm2: float = 360.0     # 2020 T-slot cross-section
    brace_foot_z: float = 120.0       # lower brace end above the deck
    brace_head_z: float = 120.0       # upper brace end below the shelf underside
    brace_min_factor: float = 3.0     # Euler buckling load over the brace's working load
    # Azimuth drive (2026-11-10): a NEMA 17 stepper hangs under the mast plate at +y and turns the turntable through a
    # bought steel pinion meshing with a printed gear sector bolted under the turntable plate's +y edge. The head turns
    # +-az_max only, so only a sector is made; the rest of the plate is trimmed inside the pinion's reach. Teeth are
    # printed, not cut in the plate: m1.5 slots are about 1.2 mm wide, too fine to laser in 5 mm aluminium.
    az_module: float = 1.5            # mm; a 15-tooth m1.5 pinion with a 5 mm bore is a stock part
    az_pinion_teeth: int = 15
    az_gear_teeth: int = 150          # full-circle count of the sector's teeth (pitch radius 112.5 mm)
    az_pressure_deg: float = 20.0
    az_sector_margin_deg: float = 10.0  # teeth beyond +-az_max at each end (8 until 2026-11-12: the hard stops at +-az_stop_deg need a tooth pitch of full mesh past them)
    az_clear_mm: float = 3.0          # trimmed plate edge inside the pinion's tip circle
    az_gear_gap_mm: float = 1.5       # printed sector's underside above the mast plate
    az_backlash_mm: float = 0.10      # tooth thinning at the pitch circle, printed into the sector (assumption: measure it)
    print_min_gap_mm: float = 0.8     # narrowest slot a 0.4 mm nozzle prints cleanly (two line widths; assumption)
    az_slew_deg: float = 30.0         # largest move between two shots: drill.example.json's corners at y +-2.5 m, x 9.5 m are 29.5 deg apart
    az_slew_s: float = 1.0            # time allowed for it: half of a 2 s feed interval, about a commercial machine's fastest (assumption)
    az_inertia_kgm2: float = 0.35     # turning inertia; the build measures it from the CAD (0.34 nose up 45 deg with the elevation actuator, 0.31 before it) and fails if this is below it
    az_bearing_mu: float = 0.02       # lazy-susan bearing, rolling friction at its ball circle (assumption)
    az_gear_eff: float = 0.90         # spur mesh efficiency, greased (assumption)
    az_shock: float = 1.5             # service factor on the tooth load (stepper start, a knock on the head)
    petg_bend_allow_mpa: float = 10.0  # printed PETG tooth-root bending, well under its ~50 MPa flexural strength (assumption)
    hose_pull_n: float = 5.0          # hose tension at the column socket (the take-up's assumption)
    stepper_torque_nm: float = 0.30   # pull-out torque at the slew speed (assumption: a 0.45 N m 17HS4401 class at 24 V; read your curve)
    stepper_hold_nm: float = 0.40     # holding torque when energised (same class)
    stepper_rotor_kgm2: float = 5.4e-6  # rotor inertia (54 g cm^2, same class)
    stepper_steps: int = 200
    stepper_body_mm: float = 48.0     # 42.3 mm square, this long under its flange
    az_torque_factor: float = 2.0     # pull-out (and holding) torque over the needed torque
    aim_range_m: float = 24.0         # net to the far baseline: where an azimuth error is read as a sideways miss
    # Azimuth home switch (2026-11-12): a subminiature roller-lever switch lies flat on a printed bracket on the mast plate,
    # inside the gear sector's inner edge, its roller pointing out. A cam lobe on the sector's inner edge, from a ramp to
    # the sector's end, holds it closed at every angle at or below `az_home_deg`, so the switch also says which side of
    # home the head is on at power-up (`home_switch_design`). Switch figures are assumptions (a D2F-L3 class part):
    # read your datasheet, and set the bracket's radial slots so it clicks in the middle of the lobe.
    az_home_deg: float = -32.0        # the turntable angle where the switch closes, turning negative (firmware AZ_HOME_DEG)
    home_sw_deg: float = 45.0         # world angle of the switch about the turntable axis, from +x (front, toward +y)
    home_sw_body: tuple = (12.8, 6.5, 5.8)  # tangential, radial, vertical (mm), lying flat (assumption)
    home_sw_hole_pitch: float = 6.5   # its two mounting holes (M2 self-tapping into the bracket; assumption)
    home_sw_lever_mm: float = 5.0     # body front to the roller's outer edge, free (assumption; at least the roller's diameter)
    home_sw_roller_r: float = 2.4     # roller radius; its axis is vertical, lying flat (assumption)
    home_sw_pretravel_mm: float = 1.2  # roller travel to the click (assumption)
    home_sw_overtravel_mm: float = 1.0  # roller travel past the click before the lever bottoms (assumption)
    home_sw_repeat_mm: float = 0.05   # operating-position repeatability at the roller (assumption)
    home_sw_op_tol_mm: float = 0.3    # operating-position tolerance part to part, at the roller (assumption)
    home_sw_free_clear_mm: float = 1.0  # roller's free edge inside the sector's plain inner arc
    home_cam_ramp_deg: float = 45.0   # lobe lead-in against the roller's travel (roller levers take up to about 45)
    home_runout_mm: float = 0.3       # bearing radial runout plus the lobe's print error, after the switch is set (assumption)
    home_bracket_t: float = 2.0       # printed bracket floor under the switch
    home_slot_mm: float = 1.5         # radial adjustment either way in the bracket's M3 slots
    az_microsteps: int = 4            # firmware AZ_MICROSTEPS: sets the step the homing creep can resolve
    # Azimuth hard stops (2026-11-12): two printed blocks on the mast plate, in the bearing gap the gear sector turns in,
    # each with a polyurethane pad glued on its face. The sector's own end faces hit the pads at +-az_stop_deg, past the
    # working range and the home click and before the pinion leaves the teeth (`az_stop_design`). Pad and insert
    # figures are assumptions: read your sheet's datasheet, and push a printed sector into a stop with a scale.
    az_stop_deg: float = 35.0         # turntable angle where a sector end meets its stop's pad, either side
    az_stop_margin_deg: float = 2.0   # stop at least this far past az_max (a runaway at full speed hits it, not a target)
    az_stop_mesh_pitches: float = 1.0  # whole tooth pitches of sector left past the pinion's line at a stop
    stop_pad_r: tuple = (95.0, 107.0)  # pad's radial span about the turntable axis: inside the sector's root circle
    stop_pad_h: float = 6.0           # pad height (z), within the sector's face width
    stop_pad_t: float = 5.0           # pad thickness, along the turning direction (4 mm would compress 49% at the runaway speed, no margin on the 50% counted on)
    stop_pad_e_mpa: float = 5.5       # compression modulus, Shore 70A polyurethane sheet (assumption)
    stop_pad_strain: float = 0.5      # largest compression the pad is counted on (assumption; PU bumpers run 40-50%)
    stop_block_depth: float = 16.0    # printed block behind the pad, along the turning direction
    stop_hit_deg_s: float = 60.0      # speed into a stop: the firmware's AZ_VMAX_DEG_S (a lost-step runaway at full speed)
    insert_shear_n: float = 300.0     # allowed shear on one M4 heat-set insert in PETG (assumption; push-out tests run higher)

    # Elevation drive (2026-11-11): a linear actuator in a plane outboard of the -y (guard-side) cheek pushes a pin on
    # the guard plate. Gravity on the head is measured from the CAD (`feeder.head_moment`); the pin and anchor were
    # chosen by a grid search (README "Elevation drive") for the least peak push with a stock 150 mm stroke.
    elev_pin_x: float = -175.0        # pin, head frame (x from the wheel centres): behind the feed column's rear wall at -161
    elev_pin_z: float = 60.0          # pin, head frame (z from the ball path): above the feed roof (47.5) with room for a nut
    elev_anchor_dx: float = -100.0    # anchor, from the pivot (world x, turns with the turntable, not with elevation)
    elev_anchor_dz: float = -75.0     # anchor, from the pivot (world z): 65 mm above the turntable plate, on the cheek's tab
    elev_act_y: float = -72.0         # actuator's centre plane: outboard of the -y cheek (outer face at -52.5)
    elev_act_r: float = 13.0          # actuator body radius for the clearance check (about a 1 in body; check yours)
    elev_act_stroke: float = 150.0    # stock 6 in stroke
    elev_act_closed: float = 246.0    # hole-to-hole length retracted (read your datasheet): its own retract limit must stop
                                      # the head between +45 deg and `elev_clear_max` (2026-11-11; was 240, which pulled
                                      # the plates into the turntable and mast plates at +48.8 deg)
    elev_clear_max: float = 46.3      # the head plates clear the turntable plate up to +46.36 deg (bisection on the
                                      # swept solids, 2026-11-11; test_cad re-checks both sides)
    elev_act_force_n: float = 220.0   # rated push (assumption: a 50 lb class 12-24 V actuator)
    elev_act_speed_mm_s: float = 20.0  # speed at that load (assumption)
    elev_end_mm: float = 3.0          # kept off each end stop
    elev_force_factor: float = 2.0    # rated push over the largest push needed

    # Shuttle drive (2026-11-11): a hobby servo outboard of the motor plate turns a crank; a rod from the crank pin
    # runs to a pin in the shuttle's side through a slot in the motor plate. An in-line slider-crank with the crank
    # in front: a 180 deg turn of the servo is the whole stroke, and both ends of the stroke are the crank's dead
    # centres, where the shuttle's position does not depend on the servo's angle and loads on the shuttle cannot
    # turn the servo. It replaces the BOM's 100 mm linear actuator, which at 20-30 mm/s needs 3 to 5 s a stroke.
    shuttle_pin_back: float = 20.0    # shuttle pin, ahead of the shuttle's rear end
    shuttle_rod_mm: float = 120.0     # rod, pin centre to pin centre
    shuttle_rod_t: float = 5.0        # rod and crank thickness (printed)
    shuttle_pin_d: float = 5.0        # M4 shoulder bolts: 5 mm shoulder
    servo_l: float = 40.5             # standard-size servo body (assumed dimensions: measure yours)
    servo_w: float = 20.0
    servo_h: float = 40.5             # body below its top face
    servo_flange_l: float = 54.0      # mounting tabs tip to tip
    servo_flange_below: float = 12.0  # tabs' outer face below the top face
    servo_shaft_from_end: float = 10.0
    servo_spline_mm: float = 5.0      # top face to the crank's inner face (spline and round horn)
    servo_range_deg: float = 180.0    # turn between the gate pulses (GATE_LO_US/GATE_HI_US in firmware/esp32/config.py)
    servo_stall_nm: float = 1.75      # 18 kg cm class (DS3218 class at 5 V, as commonly listed; an assumption: read yours)
    servo_s_per_60: float = 0.16      # no-load speed, same class (assumption)
    servo_torque_factor: float = 1.5  # stall torque over the largest torque needed
    feed_mu_slide: float = 0.35       # printed PETG shuttle on PETG and aluminium (assumption: measure it)
    feed_mu_ball: float = 0.6         # felt ball on the shuttle's top (assumption)
    feed_dwell_s: float = 0.10        # shuttle held forward while the wheels take the ball (assumption)
    feed_interval_min_s: float = 2.0  # shortest drill interval to support (about a commercial machine's fastest, as az_slew_s)

    # Cables to the head (2026-11-13). The launcher ESCs, the ESP32 and a 6 V buck for the shuttle servo sit on the
    # base deck; everything that tilts or turns is wired from there. The bundle rises on the turntable axis through the
    # mast and turntable plates' 40 mm holes (it twists there as the head turns, and never swings), leaves a printed
    # gland on the turntable plate straight up and makes one free loop in the head's mid-plane to a printed clip on the
    # head's rear lower standoff. Loose wires in a spiral wrap, so each bends about its own axis: the loop's bend limit
    # is `cable_bend_factor` times the thickest wire, not the bundle. Wire and servo figures are assumptions.
    head_wires: tuple = (("launcher motor phases", 6, 14), ("wheel tachometers", 6, 26),
                         ("shuttle servo signal", 1, 26), ("shuttle servo supply and return", 2, 20))
    turntable_wires: tuple = (("elevation actuator", 2, 18), ("elevation feedback pot", 3, 26))
    bundle_fill: float = 0.6          # wire area over the bundle's circle (assumption)
    cable_bend_factor: float = 10.0   # moving wire's smallest bend radius over its own diameter (assumption)
    cable_clear_mm: float = 3.0       # bundle kept this far off every part
    cable_twist_deg_m: float = 180.0  # twist a free run of loose wires may take, either way, per metre (assumption)
    cable_gland_h: float = 12.0       # the loop leaves the gland this far above the turntable plate
    cable_clip_x: float = -200.0      # head frame: bundle centre at the standoff clip (rear lower standoff at -215, -150)
    cable_clip_z: float = -180.0
    cable_clip_dir_deg: float = 90.0  # head frame: the loop leaves the clip this way (90 = up, toward the ball path)
    cable_clamp_z: float = 420.0      # fixed clamp on the turntable axis, under the mast plate: the twist runs from here
    bearing_bore_d: float = 60.0      # lazy-susan bearing's open centre (assumption: read yours)
    # The bearing's two rings (2026-11-21, `bearing_design`): two pressed-steel flanges stacked with the balls between,
    # each flange `bearing_ring_t` thick, its race a band at `bearing_race_r`; each ring has four M5 holes on the bolt
    # circle and one access hole on it, as a stacked lazy-susan has (all assumptions: read your bearing's drawing).
    bearing_ring_t: float = 2.0       # flange thickness, mm
    bearing_race_r: float = 70.5      # race band's centre radius, mm
    bearing_race_w: float = 5.0       # race band's width, mm
    bearing_race_gap: float = 0.5     # the race bands' halves stand this far apart (the balls, not drawn, fill it)
    bearing_bolt_r: float = 60.0      # both rings' bolt circle (fixed ring at 0, 90, 180, 270 deg; turning at 45 + 90k)
    bearing_access_d: float = 12.0    # access hole in each ring, and in the mast plate under the fixed ring's
    bearing_access_turn_deg: float = 180.0   # turning ring's access hole, at azimuth 0: over a fixed-ring bolt
    bearing_access_fixed_deg: float = 225.0  # fixed ring's (and the mast plate's) access hole: under a turning-ring bolt
    bearing_screw_len: float = 16.0   # M5 button head + nyloc, both rings
    electronics_x: float = -600.0     # ESP32, ESCs and the servo's buck on the deck's M3 grid, behind the battery
    servo_supply_v: float = 6.0       # buck output for the shuttle servo (standard-size servos take 4.8 to 6.8 V)
    servo_stall_v: float = 5.0        # the voltage `servo_stall_nm` is quoted at
    servo_stall_a: float = 3.0        # stall current at `servo_supply_v` (assumption: DS3218 class; read yours)
    servo_lead_awg: int = 20          # servo supply and return from the buck to the servo
    servo_vih: float = 2.4            # servo's signal input threshold (assumption: many accept 3.3 V logic; check yours)
    logic_high_v: float = 3.3         # the ESP32's output high
    # Elevation actuator's lead (2026-11-14): its five wires (`turntable_wires`) leave the bundle at the gland's top,
    # turn -y and run tied straight across the turntable under the pivot, through a grommet hole in the guard-side
    # cheek between its two feet, and make one free span to a zip tie on the actuator's body `elev_lead_tie_mm` from
    # its anchor eye, on the body's front (pivot) side, leaving square off the body. Wherever the real actuator's cable leaves its housing, it is
    # taped along the body to that tie. The tie, not the exit, is what moves with elevation (`elev_lead_design`).
    elev_lead_tie_mm: float = 70.0    # tie on the actuator's body, from its anchor eye along the body (design choice)
    elev_lead_out_mm: float = 10.0    # the lead (with its clearance) may hang this far outboard of the actuator's outer face
    elev_lead_hole_dx: float = 0.0    # grommet hole in the guard-side cheek: x from the pivot (under it: the head stays high)
    elev_lead_hole_d: float = 10.0    # snap-in grommet, 6 mm bore or more, for the 4.4 mm lead
    # The pot's pickup from the motor pair (2026-11-14, `elev_pot_pickup`, `check_elev_pot`). The H-bridge drives the
    # actuator sign-magnitude (PWM + DIR, MDD10A class): one motor wire swings the whole pack voltage at every PWM edge
    # while the other sits still, so twisting the motor pair does not cancel its electric field at the pot wires. Each
    # edge pushes charge through the wire-to-wire capacitance onto the wiper wire; the wiper's own source resistance
    # and a capacitor at the ADC pin take it away. Every capacitance and the pot's resistance are assumptions.
    elev_pwm_hz: float = 20000.0      # firmware Motor(freq=20000)
    elev_pot_ohm: float = 10000.0     # the actuator's feedback pot, end to end (assumption: read yours; swept to 20k)
    elev_pot_pulldown_ohm: float = 100000.0  # wiper to GND at the board (firmware README: a loose wiper reads 0)
    elev_pot_supply_v: float = 3.3    # the pot across 3.3 V, so its whole stroke spans 3.3 V at the ADC
    elev_lead_mutual_pf_m: float = 30.0   # toggling motor wire to the wiper wire, per metre run together (assumption:
                                          # adjacent wires in a tied bundle; swept 10 to 60)
    elev_lead_self_pf_m: float = 40.0     # wiper wire to the pot's own 3.3 V and GND wires beside it (assumption)
    elev_adc_pin_pf: float = 10.0     # ESP32 pad, trace and sample capacitor (assumption)
    elev_act_l_h: float = 1.0e-3      # actuator motor inductance (assumption: small brushed DC motor class)
    elev_lead_mutual_nh_m: float = 50.0   # motor loop to wiper loop mutual inductance per metre (assumption)
    elev_pot_filter_nf: float = 1000.0  # ceramic capacitor from GPIO 39 to GND at the board (design choice: 1 uF X7R)
    elev_deadband_mm: float = 0.5     # firmware LinearAxis deadband_mm
    elev_fw_speed_mm_s: float = 22.0  # firmware ELEV_SPEED_RET_MM_S, the faster direction
    elev_stall_mm: float = 0.5        # firmware LinearAxis stall_mm (a stall resets on any reading this far from the last)
    elev_pot_err_frac: float = 0.5    # a single reading's pickup error at most this share of the deadband
    elev_pot_lag_frac: float = 0.25   # the filter's lag at full speed at most this share of the deadband
    # Deck-side cable run (2026-11-14): from the electronics on the deck to the axis clamp, with the azimuth stepper's and
    # the lift gearmotor's leads branching off it. Fixed wiring, tied every `deck_tie_max_mm` or less: along the deck at
    # y = `deck_cable_y`, up the +y rear mast post's inner face, 30 mm under the cable crossbar to y = 0, under the
    # clamp arm to the axis and up into the clamp's bore (`deck_cable_route`). The stepper and its home switch peel
    # off under the crossbar and drop from the stepper; the lift's lead leaves on the deck and runs under the rear mast
    # rail's end to the gearmotor's back. The stepper driver sits on the deck with the ESP32 (`stepper_driver_carrier`).
    stepper_wires: tuple = (("azimuth stepper coils", 4, 22), ("azimuth home switch", 2, 26))
    lift_wires: tuple = (("lift gearmotor", 2, 20),)
    deck_saddle_base: float = 3.0     # the run lies on the saddles' base plates, this thick, on the deck and the post
    deck_cable_z_low: float = 378.0   # the run's height under the crossbar and the clamp arm
    deck_cable_bend_r: float = 30.0   # fixed run's bend radius (centre line) at its corners
    deck_static_bend_factor: float = 6.0  # a tied (not moving) wire may bend to this times its own diameter (assumption)
    deck_tie_max_mm: float = 200.0    # ties (saddles, hangers, the clamp web) at most this far apart along the run
    stepper_coil_ohm: float = 1.5     # 17HS4401 class coil resistance (assumption: read yours)
    stepper_amps: float = 1.5         # phase current set on the driver (17HS4401 class is rated 1.7 A)
    stepper_lead_frac: float = 0.10   # lead resistance (out and back) at most this share of the coil's
    lift_motor_stall_a: float = 5.5   # 37 mm 24 V gearmotor class stall current (assumption: read yours)
    lift_drop_frac: float = 0.03      # lift lead drop at stall at most this share of the 24 V supply
    supply_v: float = 24.0
    esc_phase_peak_a: float = 30.0    # launcher phase current (RMS) during spin-up (assumption: log yours)
    esc_phase_loss_frac: float = 0.05  # phase extension loss at that current at most this share of the motor's 1 kW peak
    launcher_peak_w: float = 1000.0
    # Power distribution (2026-11-14, `power_distribution`, `check_power`): one fuse per branch after the e-stop
    # contactor, each branch's current from the loads' figures, every load drawing at once (the worst case: a drill
    # starting, wheels spinning up while the base moves and the head aims) held under the BMS's continuous limit. Every
    # current below is an assumption from the part classes in the BOM: read your parts' datasheets and log your build.
    battery_v_min: float = 24.0       # currents are sized at the low-battery cut (firmware config LOW_BATTERY_MV)
    bms_cont_a: float = 30.0          # BMS continuous discharge limit (assumption: a 20 Ah 8S LiFePO4 pack's class)
    bms_use_frac: float = 0.8         # the worst simultaneous load at most this share of it
    launch_wheel_kg: float = 0.40     # one launcher wheel with its hub (assumption: weigh yours)
    launch_wheel_k: float = 0.6       # I / (m r^2) of a wheel: tread mass toward the rim (a solid disc is 0.5)
    launch_rotor_kgm2: float = 2.0e-4  # outrunner rotor (assumption: 63 mm e-skate class)
    launch_drag_w: float = 30.0       # shaft power that holds a wheel at speed, bearings and air (assumption: log yours)
    esc_eff: float = 0.85             # battery to shaft through the ESC and motor (assumption)
    esc_fuse_factor: float = 2.0      # ESC fuse over its ramped peak: room for the speed loop's recovery after a ball
    wheel_spinup_w: float = 100.0     # firmware cap on each wheel's spin-up shaft power (config WHEEL_SPINUP_W)
    wheel_ramp_max_rpm_s: float = 1500.0  # and on its ramp at low speed (config WHEEL_RAMP_MAX_RPM_S): the once-per-rev
                                          # tach reads 0 for the first revolutions, and a faster start let the speed
                                          # loop push the wheel past its ramp (tests/spinup_ramp_sweep.py)
    pi_w: float = 12.0                # Pi 5 and cameras (hardware/electronics.md power budget)
    pi_buck_w: float = 25.0           # the Pi's 5 V 5 A buck at its limit
    buck_eff: float = 0.9             # both bucks (assumption)
    lift_motor_run_a: float = 2.0     # lift gearmotor running (assumption: 37 mm 24 V class near its rated torque)
    agit_motor_run_a: float = 0.8     # agitator gearmotor running (assumption)
    agit_motor_stall_a: float = 2.0   # and stalled (assumption)
    elev_act_run_a: float = 2.0       # elevation actuator at its rated push (assumption: 50 lb 24 V class)
    elev_act_stall_a: float = 3.0     # and at its end stops or stalled (assumption)
    base_motor_run_a: float = 2.0     # each base gearmotor moving the base (assumption: same 37 mm class as the lift)
    base_motor_stall_a: float = 5.5   # and stalled or starting
    hbridge_cont_a: float = 10.0      # dual H-bridge (MDD10A class): base on one channel, elevation on the other
    hbridge_peak_a: float = 30.0      # its peak per channel (a few seconds)
    motor_start_factor: float = 2.0   # a motor starts at its stall current for a few ms: fuse at least stall / this
    main_feed_mm: float = 600.0       # battery terminal to the main fuse, contactor and fuse block, each conductor
                                      # (battery at x -450, the electronics at -600, risers and slack: an estimate)
    main_feed_awg: int = 12
    branch_awg_min: int = 20          # no branch thinner than this: screw terminals and handling (a choice)
    main_feed_drop_frac: float = 0.02
    servo_buck_a: float = 5.0         # the servo's 6 V buck at its limit (BOM: 6 V 5 A)
    # Contactor inrush and precharge (2026-11-14, `contactor_inrush`, `check_inrush`). Closing the contactor connects the
    # ESCs' discharged input capacitors straight to the pack: a series R-L-C whose only limit is the loop's few tens of
    # milliohms. Every figure below except the charger's voltage is an assumption: measure your build (a current clamp
    # or a shunt and a scope on the first closing) and read your parts' datasheets.
    battery_v_max: float = 29.2       # the charger's end voltage (BOM: 29.2 V LiFePO4 charger), the worst case
    pack_ohm: float = 0.040           # pack internal resistance with its BMS FETs and busbars (assumption: 8 cells of
                                      # a 20 Ah LiFePO4 class at a few milliohms each)
    pack_uh: float = 0.2              # pack's own loop inductance (assumption)
    loop_uh_per_m: float = 0.6        # inductance per metre of a two-wire run, out and back counted once (assumption:
                                      # wires laid side by side; twisting lowers it)
    main_fuse_ohm: float = 0.0019     # 30 A ATO blade, cold (the figure a distributor listing gives for Littelfuse
                                      # 0257030, not read on Littelfuse's own sheet: read yours)
    branch_fuse_ohm: float = 0.005    # 15 A ATO blade, cold (assumption)
    contactor_ohm: float = 0.003      # closed contacts and terminals (assumption)
    esc_cap_uf: float = 1000.0        # each launcher ESC's input capacitance (assumption: e-skate ESCs carry several
                                      # hundred uF to about 2,000 uF; count the cans on yours)
    esc_cap_esr_ohm: float = 0.010    # those capacitors' ESR in parallel (assumption)
    esc_lead_mm: float = 400.0        # fuse block to each ESC, each conductor (an estimate on the deck layout)
    bus_other_cap_uf: float = 300.0   # every other switched input: the stepper driver's 100 uF and the bucks' and
                                      # H-bridge's own capacitors (assumption), lumped at the ESCs' node
    contactor_make_a: float = 60.0    # current the contactor may make without eroding or welding its contacts
                                      # (assumption: twice its 30 A rating; few small DC contactors state a
                                      # capacitive make rating, so read yours or ask the maker)
    bms_sc_a: float = 150.0           # BMS short-circuit trip current (assumption: five times its continuous rating)
    bms_sc_delay_us: float = 200.0    # and how long the current must stay above it (assumption: read your BMS's
                                      # settings; many expose it, often a few hundred microseconds)
    precharge_ohm: float = 4.7        # resistor that charges the bus before the contactor closes (0: none)
    precharge_delay_s: float = 0.5    # on-delay between the precharge relay and the contactor (a timer module)
    precharge_relay_a: float = 10.0   # the small relay that switches the resistor
    bus_idle_a: float = 0.3           # what the switched loads draw idling while the bus precharges (assumption):
                                      # it holds the bus below the pack by idle x resistor
    # Start-up loads during the precharge (2026-11-14, `precharge_bus`). A buck or a chopper drive draws constant power
    # once its input passes its start threshold, so it takes more current the lower the bus, and through 4.7 ohm the
    # most a bus can pass is V^2 / 4R (31 W at 24 V). Two loads can start while the bus charges: the stepper driver,
    # if its ENABLE is tied to GND (it holds its phase current from the moment it has power; wired to GPIO 5 since
    # 2026-11-14 and held off until the contactor closes), and the shuttle servo's buck, if the firmware sends a pulse
    # at rest (before 2026-11-14 it held GATE_LO_US from power-up, so a servo left anywhere but home sought it at stall
    # current). Figures are assumptions: read your driver's and buck's sheets.
    switched_start_v: float = 8.0     # bus volts at which a buck or the stepper driver starts (A4988/DRV8825 class
                                      # need 8 V; small bucks' undervoltage lockouts sit near there)
    switched_stop_v: float = 7.0      # and stops again (hysteresis)
    servo_seek_s: float = 0.68        # a seek from anywhere to home at stall current: the loaded back stroke
                                      # (GATE_BACK_MS's cad figure), the worst case after a cut mid-stroke
    servo_pulse_at_rest: bool = False  # firmware: True is the pre-2026-11-14 gate, pulsed from power-up
    stepper_holds_at_power_up: bool = False  # True: ENABLE tied to GND, the pre-2026-11-14 wiring. Since then the
                                      # driver's ENABLE is on GPIO 5 with a pull-up to 3.3 V (off while the ESP32
                                      # boots), and the firmware pulls it low only once the contactor's coil has been
                                      # energised for `stepper_enable_after_ms` (opto on the coil into GPIO 15)
    # Contact bounce (2026-11-14, `contactor_bounce`). The opto sees the coil, not the contacts: the contacts close one
    # pull-in time later and then bounce. Figures are assumptions for a small 24 V DC contactor: read yours.
    contactor_pull_in_ms: float = 50.0  # coil energised to contacts first touching (small DC contactors: 15-50 ms)
    contactor_bounce_ms: float = 10.0   # contacts first touching to staying closed (each bounce opens them)
    stepper_enable_after_ms: float = 150.0  # firmware CONTACTOR_SETTLE_MS: coil seen on this long before ENABLE
    # Regenerative braking (2026-11-14, `regen_braking`, `check_regen`). The firmware lowers a wheel's target at the same
    # capped shaft power it spins up with (controller.SpinupRamp), and an ESC that follows a lower throttle by braking
    # (synchronous rectification, "damped light", a duty-cycle mode) sends that energy back into the bus. Into the pack it
    # is a few amps; into a bus the pack is not taking (contactor open, or a BMS that has stopped charging) it is a few
    # joules into about 2 mF, which lifts the bus past every switched part in about a millisecond. Figures are
    # assumptions: read your BMS's charge settings and your parts' input ratings, and log the bus on a scope.
    bms_charge_a: float = 15.0        # BMS continuous charge limit (assumption: many 30 A 8S LiFePO4 BMSs allow half)
    bms_cell_ovp_v: float = 3.65      # BMS cell over-voltage cut: it stops charging, and the bus loses its sink
    pack_cells: int = 8
    cell_spread_v: float = 0.10       # how far the highest cell sits above the pack's average (assumption)
    regen_eff: float = 0.85           # shaft to bus through motor and ESC while braking (assumption: as esc_eff)
    switched_v_max: float = 30.0      # lowest input rating on the switched bus: the MDD10A-class H-bridge's 30 V
                                      # (A4988 class 35 V, small bucks about 36-40 V; read yours)
    esc_stop_latency_ms: float = 40.0  # firmware sees the bus go and zeroes the ESC command, to the ESC no longer
                                      # braking: one 10 ms tick, up to 20 ms for the next 50 Hz pulse, and one frame
                                      # of the ESC's own input filter (assumption)
    contactor_dropout_ms: float = 5.0  # coil de-energised to contacts open: the fast end, the worst case here
    # Reset at the machine (2026-11-18, `estop_reset_chain`, `check_estop_reset`; quality audit 2026-11-08). Before, the
    # e-stop and the fob fed the precharge relay and the timer straight, so releasing them re-powered the motors and a
    # CLEAR_ESTOP from a phone anywhere on the network was the only other step. Now a small latch relay K0 sits after
    # them: its coil through the RESET button's NO contact or its own hold contact, so it drops on any cut and stays
    # dropped until someone presses RESET on the feeder. The precharge relay and the timer take their feed from K0's
    # node through RESET's NC contact, so power comes back as the button is let go, not while it is held: a button
    # jammed or taped down never powers the motors. Coil figures are assumptions: read your parts' sheets.
    estop_reset_latch: bool = True    # False: the pre-2026-11-18 wiring, a release re-powers the bus
    latch_relay_a: float = 10.0       # K0's contacts (the same 24 V 10 A class relay as the precharge's)
    latch_coil_a: float = 0.04        # K0's own coil (a 24 V sugar-cube relay draws about 0.9 W)
    precharge_coil_a: float = 0.04    # the precharge relay's coil
    timer_module_a: float = 0.03      # the on-delay timer module's own draw
    contactor_coil_a: float = 0.25    # the contactor's coil (24 V coils on 30-50 A DC contactors: about 3-6 W)
    reset_button_dc_a: float = 1.0    # RESET's contact rating switching a 24 V DC coil (DC-13; 22 mm blocks: 1-3 A)
    regen_diode: bool = True         # Schottky across the contactor and precharge relay, anode on the switched bus:
                                      # returns braking current to the pack with the contactor open, and cannot power
                                      # the bus from the pack, so the e-stop still isolates every motor
    regen_diode_vf: float = 0.55      # its forward drop at the braking current (assumption: a 45 V 20 A class part)
    regen_diode_vr: float = 45.0      # and its reverse rating: at least 1.5 x the charger's 29.2 V
    regen_diode_a: float = 20.0       # and its forward current rating
    regen_brake_max_v: float = 27.6   # firmware REGEN_BRAKE_MAX_MV: above this pack reading the ramp coasts instead of
                                      # braking (3.45 V a cell, the top few percent of a LiFePO4's charge)
    # Brakes in a row (2026-11-14, `regen_guard`). The board reads the pack on GPIO 36 every 10 ms tick, and braking
    # lifts that very reading by the charge current x the pack-side resistance (about 0.26 V), so a guard with one
    # threshold flips brake, coast, brake every tick for any pack resting within that rise of it. The firmware keeps a
    # band: braking stops when the reading passes REGEN_BRAKE_MAX_MV and starts again only under it less
    # REGEN_BRAKE_HYST_MV.
    regen_brake_hyst_v: float = 0.7   # firmware REGEN_BRAKE_HYST_MV
    battery_adc_noise_v: float = 0.15  # peak noise on the battery reading, at the battery (assumption: +-14 mV at the
                                      # ESP32's pin through the 11:1 divider; log yours with the motors running)
    pack_wh: float = 512.0            # 24 V 20 Ah LiFePO4 class (hardware/electronics.md power budget)
    # Several bounces in a row (2026-11-14, `contactor_bounce_train`): the bounce window split into n opens, each
    # followed by a re-close, for these counts and these fractions of the window spent open (assumptions: scope yours).
    bounce_counts: tuple = (1, 2, 3, 4, 6, 10)
    bounce_open_fracs: tuple = (0.2, 0.5, 0.8, 1.0)   # 1.0: zero-length closes, one open as long as the window

    # Catch trough (2026-11-13). Balls the net stops slide down its face into a bought half-round gutter hung from the
    # net beam's front face, in front of the net plane. Two runs fall toward the middle, where a printed sump takes
    # them and turns them rearward through an outlet low enough to pass under the net beam (the base is open below
    # its rails). Gutter, rolling and ball figures are assumptions: tilt a gutter with a ball in it to measure.
    trough_w: float = 125.0           # half-round gutter, inside diameter (a 5 in half-round class)
    trough_wall: float = 1.8          # gutter wall (vinyl class; measure yours)
    trough_x0: float = 30.0           # gutter's back edge, in front of the net plane (net at x 0..25)
    trough_end_z: float = 204.0       # gutter's inside bottom at the longer run's outer end (y = -net_w / 2); 190 until
                                      # the lift (2026-11-13) moved the sump off centre and raised its outlet
    trough_slope_deg: float = 3.0     # each run falls this much toward the sump
    trough_crr: float = 0.03          # rolling resistance, felt ball on a smooth gutter (assumption: measure it)
    trough_slope_factor: float = 1.5  # slope's tangent over trough_crr, so a ball that stops on the run starts again
    ball_inertia_k: float = 0.6       # I / (m r^2) of a ball: a thin shell is 2/3, solid 2/5 (assumption)
    sump_half: float = 60.0           # runs end this far either side of y = 0; balls drop into the sump between them
    sump_wall: float = 4.0
    sump_out_z: float = 80.0          # outlet's bottom (a ball rolls out on it) above the court; 50 until 2026-11-13: the
                                      # lift's boot needs the height for its flights to turn under the floor
    trough_hanger_y: tuple = (-1300.0, -850.0, -400.0, 50.0, 500.0, 950.0, 1350.0)  # one hanger at each y (signed)
    ground_min_mm: float = 40.0       # nothing in the trough path closer to the court than this
    tub_drop_clear_mm: float = 30.0   # a returning ball must clear the tub's rim by this much

    # Ball lift (2026-11-13): closes the loop from the sump to the tub, 2.3 m up. A cleated belt (a flight elevator, as
    # golf-range ball elevators are): an AT5 timing belt runs over a pulley at each end of a vertical 2040 spine; pairs
    # of short printed fingers on it carry one ball each up a channel whose front is a rod (`lift_design`). The sump
    # sits off centre at the lift's foot, so its outlet turns straight into the boot with no duct under the deck. The
    # column stands between the mast rails at y = lift_y, outside the head's turning circle; the gearmotor drives the
    # bottom pulley; at the top the balls ride over the pulley under a hood and roll down a chute into the tub.
    # Belt, finger and motor figures are assumptions: measure the first build.
    lift_x: float = -90.0             # ball channel's centre (x): between the mast rails (front at -40..-20, rear at -200..-180)
    lift_y: float = 300.0             # ball line (y): the head's turning parts stay inside about 260 mm of the axis
    lift_gap: float = 3.0             # channel depth (belt face to the front rod) and width, over the ball diameter
    lift_pulley_teeth: int = 16       # AT5 pulley: pitch diameter 25.5 mm (small, so the flights turn low in the boot)
    lift_belt_pitch: float = 5.0      # AT5 polyurethane timing belt, welded endless to length
    lift_belt_t: float = 2.7          # its total thickness
    lift_belt_back: float = 1.5       # back face outside the pitch line on a pulley (assumption: read your belt's sheet)
    lift_belt_w: float = 25.0
    lift_finger_l: float = 16.0       # flight fingers stick out this far from the belt's back
    lift_finger_t: float = 5.0        # finger thickness (along the belt)
    lift_finger_w: float = 30.0       # a flight's plate spans this across the belt (the two fingers joined: see the caps)
    lift_flight_pitch: float = 150.0  # target spacing; rounded so a whole number of flights fit the belt
    lift_finger_clear: float = 1.5    # a finger's top passes this far under the boot floor before it meets a ball
    lift_ground_mm: float = 30.0      # boot's underside above the court (the wheel brackets come down to 30)
    lift_wall: float = 3.0            # printed walls of the boot and head
    lift_motor_rpm: float = 200.0     # the base drive's 37 mm gearmotor class at 24 V (assumption: read yours)
    lift_motor_nm: float = 0.6        # its rated torque (assumption)
    lift_torque_factor: float = 2.0   # rated torque over the largest needed (every flight loaded)
    lift_mu_back: float = 0.2         # belt's tooth side sliding on a UHMW strip on the spine (assumption)
    lift_crr_wall: float = 0.05       # ball rolling up the front rod while a finger pushes it there (assumption)
    lift_rate_min: float = 36.0       # balls a minute the lift must take (a 1.7 s feed interval)
    lift_rod_d: float = 10.0          # aluminium rods: the channel's front and sides above the boot
    lift_clip_max_mm: float = 500.0   # rod clips at most this far apart
    lift_hood_deg: float = 115.0      # the hood guides a ball over the top pulley to this angle past the top
    lift_drop_deg: float = 30.0       # the head's drop floor, where a finger following the ball pushes it off
    chute_slope_deg: float = 8.0      # chute from the head to the tub (a bought tube, the take-up sleeve's size)
    chute_target: tuple = (-360.0, 120.0)  # plan point over the tub where the chute ends
    lift_strut_z: float = 1700.0      # 2020 strut from the spine to the +y front hopper post
    # Top pulley's tensioner (2026-11-13): the head slides on the spine in vertical slots and two M5 jack screws in it
    # push down on the top rod clip, so the head can be lowered to put the belt on and raised to tension it
    # (`lift_tension_design`). Belt stiffness, mass and length tolerance are assumptions: read your belt's sheet.
    lift_belt_kg_m: float = 0.085     # AT5 25 mm PU belt with steel cords, kg per metre (assumption)
    lift_belt_cspec_n: float = 60000.0  # its force per unit strain (assumption: the sheet's c_spec x width)
    lift_belt_len_tol_mm: float = 2.0  # welded endless length, +- this (assumption: ask the welder)
    lift_tooth_h: float = 1.2         # AT5 tooth height
    lift_install_mm: float = 5.0      # head lowered this far under the shortest belt's free length to slip the belt on
    lift_tension_factor: float = 1.0  # static tension at the drive pulley over the lift's pull: the slack strand keeps half
    lift_top_kg: float = 0.65         # head (0.51 kg of PETG at the package's infill), top pulley, axle and bearings
    lift_jack_y: float = 28.0         # jack screws stand this far either side of the ball line, in the head's side walls
    lift_jack_nut_n: float = 200.0    # load one captive M5 nut in a printed PETG pocket takes (assumption)
    lift_clip_slip_n: float = 150.0   # load one M5 + T-nut holds a clip on the spine by friction (assumption)
    # Flight caps (2026-11-15): a flight is a PU cleat the belt supplier welds to the belt's back (a screw through the
    # belt does not fit an AT5 tooth) with a printed cap screwed to its leading face. The cap is the finger plate a ball
    # sits on, two cheeks round the cleat's ends and a pad that lies on the belt's back behind the cleat, not bonded to
    # it: on the straight the pad takes the plate's moment as a couple over a long arm, and round a pulley the belt
    # falls away under it, so the pad never stops the belt wrapping (`lift_flight_design`). A cleat alone would take
    # the moment across its own few-mm foot, pressing the belt into the spine's strip with several times the force.
    lift_cleat_h: float = 12.0        # welded cleat's height off the belt's back (a stock straight PU cleat, cut to width)
    lift_cleat_t: float = 3.0         # its thickness along the belt
    lift_cleat_foot: float = 5.0      # its welded foot along the belt (assumption: ask the welder)
    lift_cleat_weld_n: float = 300.0  # pull one cleat's weld takes before it peels (assumption: ask the welder)
    lift_cap_gap: float = 0.5         # cap's plate and cheeks stand this far off the belt's back
    lift_cap_pad_t: float = 2.0       # pad's thickness: it passes under a waiting ball, inside the channel's gap
    lift_cap_cheek: float = 2.25      # cheeks outside the cleat's ends, inside the 30 mm plate
    lift_cap_sweep_clear: float = 1.0  # pad's far corner turns this far inside the finger tips' sweep round a pulley
    lift_cap_pin_x: float = 7.5       # the two M3 through the plate and the cleat, this far off the belt's back
    lift_cap_pin_y: float = 7.0       # and this far either side of the ball line
    # The caps' M3 joint (2026-11-21, `lift_flight_design`, guide joint "lift flight cap through its cleat"): an ISO
    # 10642 countersunk screw through the plate (5 mm) and the cleat (3 mm), a washer on the cleat's PU trailing face
    # and a nyloc. A plain nut on a cleat that creeps under it and flexes round both pulleys every lap is held only by
    # its preload, and PU gives that up; the nyloc stays put when the preload goes. 8 mm of stack, 0.5 of washer and a
    # 4 mm nyloc with two threads proud ask for 13.5 mm, so the screw is 14 (12 until 2026-11-21: a nyloc never fit).
    lift_cap_screw: float = 14.0      # M3 countersunk screw's length, head included (a countersunk is measured overall)
    lift_cap_csk_d: float = 6.9       # the plate's 90 deg countersink at the face: over the head's 6.72 mm maximum
    lift_stall_factor: float = 2.5    # gearmotor's stall torque over its rated (assumption: read yours); a jam meets it
    lift_cap_allow_mpa: float = 20.0  # bending stress allowed in a printed PETG plate printed flat (assumption)
    # Lift jam cutoff (2026-11-15, `lift_jam_cutoff`, `check_lift_jam`; firmware `controller.LiftRun`, config LIFT_JAM_*;
    # tests/lift_jam_sweep.py). A ball caught at a pulley stalls the gearmotor, and a MOSFET with nothing watching it
    # holds the stall (118 N on one flight cap, 5.5 A in the winding) for the whole run-on, restarted by every ball fed;
    # the 3 A branch fuse at 1.8x its rating may take seconds or never open once the winding warms. A 0.05 ohm shunt in
    # the MOSFET's source, an RC filter and an LM393 comparator against a divider from 3.3 V pull GPIO 0 low while the
    # motor draws more than the trip current; the firmware cuts the motor when that lasts LIFT_JAM_TRIP_MS, ignoring
    # the first LIFT_JAM_BLANK_MS of each start (a motor starts at stall current). Motor figures are assumptions.
    lift_motor_noload_a: float = 0.3  # no-load current (assumption: 37 mm 24 V class)
    lift_motor_mh: float = 2.0        # winding inductance (assumption)
    lift_rotor_kgm2: float = 3.0e-6   # rotor inertia at the motor's own shaft (assumption: a 555-size motor)
    lift_gear_ratio: float = 30.0     # gearbox (assumption: a 6,000 rpm motor down to 200 rpm)
    lift_hot_rise_k: float = 80.0     # winding over ambient when hot: copper's resistance rises 0.393 %/K
    # Where the shunt sits (2026-11-15, cad/README.md "Lift current sense inside the diode loop"): "high", in the
    # motor's + lead between the lift fuse and the motor, with the flyback diode's cathode on the motor side of it,
    # read by an INA186-class current-sense amplifier, so the motor's current flows through it while the MOSFET is
    # on and while the diode freewheels, and the filtered reading is I x R x gain at any duty; "low", in the MOSFET
    # module's source as first landed, where the filter sees duty x I (0.05 ohm, 2.4k: the figures before it moved).
    lift_sense_side: str = "high"
    lift_shunt_ohm: float = 0.01      # the shunt (1%, 2512 or a four-terminal part): 0.05 ohm low-side before
    lift_shunt_tol: float = 0.01      # its tolerance (high side only: the low-side figures as landed left it out)
    lift_shunt_w: float = 1.0         # its rating: 3 W for the 0.05 ohm low-side part
    lift_sense_gain: float = 50.0     # INA186A2 (TI SBOS318B: gains 25/50/100/200/500 V/V for A1-A5, inputs -0.2 to
                                      # 40 V common mode whatever the supply, so it sits on the 29.2 V pack)
    lift_sense_gain_tol: float = 0.01   # INA186 gain error, maximum (datasheet: +-1%)
    lift_sense_amp_offset_v: float = 50e-6  # INA186 input offset, maximum (datasheet: +-50 uV)
    lift_sense_r1: float = 100e3      # comparator's reference divider from 3.3 V: top (1%)
    lift_sense_r2: float = 33e3      # and bottom (1%): 3.9k before the slip coupling, 2.7k until the duty followed the
                                      # battery, 2.4k low side after it; 33k high side (819 mV, 1.64 A), searched over the E24
                                      # values for 0.005-0.02 ohm and gains 25-200 with every lift rule passing (2026-11-15)
    lift_sense_rc_s: float = 1.0e-3   # 10k + 100 nF from the amplifier's output (the shunt, low side) to the comparator
    lift_sense_offset_v: float = 0.009  # LM393 input offset over temperature, worst case (datasheet: 9 mV)
    # The amplifier against the 20 kHz PWM (2026-11-15, cad/README.md "Sense amplifier against the PWM ripple";
    # `lift_sense_ripple`, `check_lift_sense_ripple`; tests/lift_sense_ripple_sweep.py). TI SBOS318B, frequency response
    # (CLOAD 10 pF), as quoted from the datasheet: -3 dB bandwidth 45, 37, 35, 33 and 27 kHz for A1 to A5; slew rate
    # 0.3 V/us (VS 5 V, VOUT 0.5 to 4.5 V); gain error specified for VOUT 0.1 V to VS - 0.1 V.
    lift_pwm_hz: float = 20000.0      # firmware main.py: PWM(Pin(LIFT_PIN), freq=20000)
    lift_sense_bw_hz: float = 37e3    # INA186A2's -3 dB bandwidth (A1 45k, A3 35k, A4 33k, A5 27k)
    lift_sense_slew_v_us: float = 0.3  # INA186 slew rate
    lift_sense_headroom_v: float = 0.1  # output kept this far under its 3.3 V supply (the gain error's test range)
    lift_sense_ripple_share: float = 0.1  # ripple at the comparator, in motor amps, under this share of the trip's spread
    lift_sense_slew_factor: float = 3.0   # the amplifier's slew rate over the steepest ripple edge it must follow
    lift_rail_tol: float = 0.03       # 3.3 V rail
    lift_res_tol: float = 0.01
    lift_duty: float = 1.0            # config LIFT_DUTY: with the shunt low side (in the MOSFET's source) the filter sees duty x I
    lift_stall_trip_margin: float = 1.25  # hot stall current at the low-battery cut over the highest trip current
    lift_jam_blank_ms: float = 400.0  # config LIFT_JAM_BLANK_MS: over-current ignored this long after each start (300 before the slip hub lowered the trip)
    lift_jam_trip_ms: float = 10.0    # config LIFT_JAM_TRIP_MS: over-current on two ticks 10 ms apart cuts the motor
    lift_jam_rest_ms: float = 2000.0  # config LIFT_JAM_REST_MS: off this long before a retry
    lift_jam_retries: int = 1         # config LIFT_JAM_RETRIES: then it stays off (FLAG_LIFT_JAM) until the bus drops
    lift_blank_factor: float = 3.0    # blanking over the longest a normal start stays over the trip current
    lift_ramp_ms: float = 100.0       # config LIFT_RAMP_MS: each start ramps the duty up this long (2026-11-15, the jaw
                                      # coupling's play rang a switched start to 2.3x its torque; tests/lift_jam_sweep.py)
    lift_v_ref: float = 24.0          # config LIFT_V_REF_MV / 1000: over it the duty is lift_duty x lift_v_ref / battery, so the
                                      # belt keeps its 24 V speed to 29.2 V (2026-11-15, "Lift duty follows the battery"); 0: fixed
    lift_duty_min: float = 0.82       # config LIFT_DUTY_MIN: the regulated duty's floor (24 / 29.2 = 0.822); the jam rules are
                                      # taken at it, so a reading over the charger's voltage cannot lift the trip further
    ball_k_n_m: float = 14300.0       # a ball's stiffness: ITF forward deformation 5.6-7.4 mm under 8.165 kg; the stiff end
    # Lift slip coupling (2026-11-15, `lift_slip_design`, `check_lift_slip`; cad `lift_slip_hub`; tests/lift_jam_sweep.py).
    # The cutoff stops a held stall, but the gearmotor's rotor (18 kg at the belt through 30:1) met a jammed ball within
    # a quarter period, before any cut, and put 149-172 N on one flight cap (it allows 156 N). A friction slip hub
    # between the gearmotor's shaft and the drive pulley lets the rotor run on while the belt stops: the cap then sees
    # the hub's slip torque plus the belt's own 1.4 kg, and the motor's current while it slides is over the cutoff's
    # trip, so the cutoff still cuts and latches. Friction figures are assumptions; the slip torque is set on the bench.
    lift_slip_nm: float = 0.9         # slip torque the hub is set to (bench: a belt strip round the pulley, 71 N on a scale;
                                      # 1.0 N m, 79 N, from "Lift duty follows the battery" until the high-side sense made
                                      # the trip the same at every duty: cad/README.md "Slip hub back to 0.9 N m", 2026-11-15)
    lift_slip_tol: float = 0.2        # +- on it: setting, wear, damp, temperature (assumption)
    lift_slip_kinetic: float = 0.8    # sliding over sticking friction of the facing on aluminium (assumption)
    lift_slip_mu: float = 0.3         # facing on the pulley's face, sliding (assumption: a fibre or cork-composite washer)
    lift_slip_faces: int = 2          # a facing each side of the pulley
    lift_slip_od: float = 20.0        # facing washers and the D-bore plates, mm (inside the pulley's flange)
    lift_slip_id: float = 6.5         # facing washers ride the shaft
    lift_slip_facing_t: float = 1.5   # facing washer thickness
    lift_slip_plate_t: float = 2.0    # laser-cut steel plate with a 6 mm D bore: keyed to the shaft, slides along it
    lift_slip_spring_t: float = 0.5   # disc springs between plate B and collar B: DIN 2093 B 12.5 x 6.2 x 0.5 class, four in
                                      # series (was one A 12.5 x 6.2 x 0.7 to 2026-11-16: cad/README.md "Slip hub wear")
    lift_slip_collar_w: float = 6.0   # 6 mm shaft collars (12 mm OD), set screw on the shaft's flat
    lift_slip_collar_d: float = 12.0
    lift_slip_start_factor: float = 1.5  # lowest sticking torque over what a cold start passes through the hub
    lift_slip_trip_margin: float = 1.1   # motor's current while the hub slides at its lowest, over the highest trip
    # Slip hub wear (2026-11-16, `lift_slip_spring`, `lift_slip_wear`, `check_lift_slip_wear`; tests/lift_jam_sweep.py
    # --wear). The disc springs' load comes from their geometry (Almen-Laszlo, DIN 2093 without bearing flats), so the
    # hub's torque after the facings lose thickness is read off the springs' curve, not assumed. One A-series disc set to
    # the hub's 208 N sits 65 um into its 300 um stroke at about 3 N/um: 10 um of facing loss cost 15% of the torque and
    # 40 um cost 61%. Four B-series discs in series sit 670 um in and keep 95% after 40 um.
    lift_slip_spring_h0: float = 0.35    # cone height (free height less thickness); B 12.5: l0 0.85 (read yours)
    lift_slip_spring_de: float = 12.5
    lift_slip_spring_di: float = 6.2
    lift_slip_spring_count: int = 4      # discs stacked in series, alternating: the stroke and the wear budget scale with it
    lift_slip_spring_e_mpa: float = 206e3
    lift_slip_spring_nu: float = 0.3
    lift_slip_spring_flat_max: float = 0.8  # the set deflection at most this share of the stack's stroke (stay off flat)
    lift_slip_set_tol: float = 0.05      # bench setting: the scale's reading and the set screw's shift (of lift_slip_tol)
    lift_slip_mu_spread: float = 0.10    # facing friction over damp, heat and glaze after bedding in (of lift_slip_tol)
    lift_slip_loss_um: float = 15.0      # facing thickness lost after the final set, both facings: compression set left
                                         # once the hub is bedded in and set again (assumed; cork-rubber creeps most). Fresh
                                         # facings lose more as they bed in, so the bench set is done twice (plate notes)
    lift_slip_wear_mm3_kj: float = 5.0   # facing's specific wear by sliding (assumed: dry lining about 0.3, cork-rubber more)
    lift_slip_jams: int = 300            # jams the hub must take before it needs a re-set on the bench
    lift_slip_facing_cte: float = 1.5e-4  # facing's thickness per K (cork-rubber; lining about 3e-5): grows warm, shrinks cold
    lift_slip_temp_k: tuple = (-15.0, 25.0)  # facing temperature from the bench set's: a cold court to a hot box
    lift_slip_loss_sweep_um: tuple = (0.0, 10.0, 20.0, 40.0, 80.0, 160.0)
    # Lift drive shaft (2026-11-15, `lift_shaft_design`, `check_lift_shaft`; cad `lift_shaft_parts`, `lift_motor_spacer`).
    # The slip hub's stack needs 63 mm of 6 mm D shaft past the gearmotor's face, and a stock 37 mm gearmotor has
    # about 15. So the pulley rides a separate 6 mm D shaft carried in a flanged bearing in each of the boot's +-y walls,
    # and a jaw coupling inside a printed spacer joins it to the gearmotor's own shaft. The bearings take the belt's
    # load; the coupling passes torque and forgives the spacer's print error, so the gearmotor's output bearing
    # carries nothing sideways (it carried the whole belt load 38 mm out before).
    gm_shaft_len: float = 15.0        # 37 mm gearmotor's 6 mm D output shaft past its face (assumption: read yours)
    lift_gm_len: float = 75.0         # the lift's gearmotor, face to back: a 37 mm, 520-motor class with no encoder
                                      # (the lift needs none; assumption: measure yours). The base drive's 100 mm
                                      # (`gearmotor_len`, encoder included) would put its back into the +y drive
                                      # bracket at y = 450 once the spacer sets it out
    lift_gm_bracket_clear: float = 3.0  # its back end short of the +y drive bracket's inner face
    gm_radial_n: float = 50.0         # its output's allowed side load at gm_radial_at mm from the face (assumption: read yours)
    gm_radial_at: float = 10.0
    lift_bearing_od: float = 19.0     # F626-2Z flanged ball bearing, 6 x 19 x 6 mm, flange 22 x 1.5
    lift_bearing_w: float = 6.0
    lift_bearing_flange_d: float = 22.0
    lift_bearing_flange_t: float = 1.5
    lift_bearing_c0_n: float = 1000.0  # its static load rating (626 class about 1 kN, assumption: read yours)
    # The bearings' press fit in printed PETG (2026-11-15, `bearing_fit_ring_design`; cad/README.md "Bearing fit test
    # ring"). A printed hole comes out smaller than drawn by an amount that depends on the printer, the slicer and the
    # hole's axis, so the drawn size is set from a test ring printed on the same machine, not from a figure here.
    lift_bearing_fit_mm: float = 0.05  # each pocket's bore drawn this far over the bearing's radius (set from the ring)
    bearing_ring_steps: tuple = (-0.03, 0.00, 0.03, 0.05, 0.08, 0.12)   # the ring's six bores, radius over, mm (the
                                      # first is drawn under size, for a printer with hole compensation)
    bearing_ring_pitch: float = 44.0  # cell size: each bore has 22 mm of material round its centre
    print_hole_under_mm: float = 0.15  # a sideways-printed hole's diameter short of drawn (FDM holes commonly print
                                      # 0.1-0.3 mm small; assumption: the ring measures yours)
    print_hole_under_sweep: tuple = (0.0, 0.05, 0.15, 0.25, 0.35)   # hole compensation on, to an over-extruding printer
    petg_hoop_e_mpa: float = 2000.0   # PETG modulus round the bore (1.9-2.1 GPa moulded; the higher figure is the
                                      # conservative one for the hoop check; petg_e_mpa is the bending modulus across layers)
    petg_nu: float = 0.38             # PETG Poisson's ratio
    petg_steel_mu: float = 0.3        # steel ring on printed PETG, dry (assumption)
    fit_hoop_allow_mpa: float = 10.0  # sustained hoop stress at a printed bore (PETG creeps; same allowance as the gear teeth)
    fit_slip_mm: float = 0.05         # diametral clearance up to which a bearing still slides in snug, not rattling
    fit_dt_k: float = 25.0            # the boot warmer than when the bearing went in (sun, the gearmotor beside it)
    petg_cte: float = 6.0e-5          # PETG expansion per K (the hole grows away from the steel ring)
    steel_cte: float = 1.2e-5
    lift_bearing_race_d: float = 16.0  # the outer ring's raceway diameter, 626 class (assumption: read yours)
    lift_bearing_cn_min_um: float = 2.0  # least radial internal clearance of a CN 626 (ISO 5753, bore 6-10 mm)
    lift_coupler_d: float = 20.0      # jaw (spider) coupling, 6 to 6 mm bores, 20 mm OD x 25 mm, clamp or set-screw hubs
    lift_coupler_l: float = 25.0
    lift_coupler_spider: float = 4.0  # the spider's gap between the two hubs' bores
    lift_coupler_nm: float = 2.0      # its rated torque (20 mm aluminium jaw class, assumption: read yours)
    lift_coupler_factor: float = 1.5  # rated torque over the slip hub's highest sticking torque
    # Coupling dynamics (2026-11-15, `lift_coupler_model`; tests/lift_jam_sweep.py, a three-inertia plant). The spider
    # is an elastomer spring between the rotor (through the gearbox) and the drive shaft, and a worn or loose spider
    # leaves a gap the jaws cross before they bite. Every figure is an assumed class figure, swept in the test.
    lift_coupler_k_nm_rad: float = 20.0   # torsional stiffness, 20 mm jaw with a 92-98 Shore A spider (assumption)
    lift_coupler_k_sweep: tuple = (5.0, 20.0, 80.0)   # soft spider to a hard one, N m/rad
    lift_coupler_backlash_deg: float = 1.0   # total free play at the output: a used spider (assumption; 0 new, preloaded)
    lift_coupler_backlash_sweep: tuple = (0.0, 1.0, 3.0, 5.0)   # 5: a worn spider plus the gearbox's own play
    lift_coupler_zeta: float = 0.06   # the spider's damping ratio (relative damping about 0.75, polyurethane; assumption)
    # The belt as a spring (2026-11-15; cad/README.md "Lift belt stretch"; `lift_belt_model`): each strand is c_spec / centre
    # stiff, the two in parallel while the slack strand keeps tension; part of the belt's mass rides on that spring.
    lift_belt_zeta: float = 0.05      # the belt mode's damping ratio (PU on steel cords, small; assumption)
    lift_belt_cspec_sweep: tuple = (0.5, 1.0, 2.0)   # c_spec as a share of `lift_belt_cspec_n`: the sheet's figure is unread
    # Tooth jump at the drive pulley (2026-11-15; cad/README.md "Lift tooth jump"; `lift_tooth_jump_design`). A hood
    # jam slackens the down strand, so the 16-tooth drive pulley holds the whole pull on its 8 teeth in mesh with
    # nothing on the slack side. Two checks: tooth strength against the catalogue's specific tooth force, and
    # ratcheting (the belt climbing out over the teeth), which no catalogue figure covers. Figures are assumptions.
    lift_jam_belt_n: float = 90.0     # largest net belt pull at a hood jam (tests/lift_jam_sweep.py --belt and --chain, every
                                      # c_spec; 89 until the duty was held to the battery, then 100 with the 1.0 N m hub,
                                      # eval/lift-belt-chain-2026-11-15.txt; 90 with the 0.9 N m hub, eval/lift-slip-0p9-2026-11-15.txt)
    lift_tooth_fuspec_n_mm: float = 3.6   # AT5 specific tooth force per mm of width at 0 rpm (Optibelt ALPHA LINEAR and
                                      # Ammeraal PU AT5 sheets, as quoted in search results: 3.6 and 3.64; sheets unread)
    lift_tooth_fuspec_1200_n_mm: float = 2.478  # the same at 1200 rpm (Optibelt, as quoted; straight line between)
    lift_tooth_mesh_max: int = 12     # catalogues count at most 12 teeth in mesh
    lift_tooth_flank_deg: float = 25.0  # AT flank half-angle (a 50 deg trapezoid; assumption: read your profile)
    lift_tooth_flank_sweep: tuple = (25.0, 30.0, 35.0)   # 30 and 35: a loaded tooth bends and meets the flank steeper
    lift_tooth_mu: float = 0.0        # PU flank on aluminium; 0 is the worst case for climbing
    lift_tooth_mu_sweep: tuple = (0.0, 0.15, 0.3)
    lift_tooth_root_mm: float = 2.5   # AT5 tooth's width at its root along the belt (assumption)
    lift_tooth_g_mpa: float = 15.0    # PU's shear modulus (92 Shore A class; assumption): sets the tooth's stiffness
    lift_tooth_g_sweep: tuple = (8.0, 15.0, 40.0)
    lift_tooth_jump_factor: float = 1.5   # wrap's hold over the flanks' push-out at the nominal figures
    # Strands as strings (2026-11-15; cad/README.md "Lift strand modes"; `lift_strand_modes`, tests/lift_strand_sweep.py)
    lift_flight_kg: float = 0.005     # a welded cleat and its printed cap (as `lift_motor_model` counts them; weigh one)
    lift_coupler_hub_l: float = 10.5  # each aluminium hub's length (the bore length above)
    lift_shaft_clear: float = 1.5     # coupling to the bearing's flange, and to the gearmotor's face at least
    lift_shaft_allow_mpa: float = 80.0  # stainless D shaft in rotating bending at the running load (fatigue; assumption)
    lift_shaft_static_mpa: float = 120.0  # at a jam's load: a few turns while the hub slides, so against yield
                                      # (303/304 about 205 MPa, assumption) over 1.7, not fatigue
    lift_shaft_E_mpa: float = 193000.0  # stainless steel
    lift_shaft_defl_mm: float = 0.05  # largest sag at the pulley under the worst belt load
    lift_spacer_end: float = 4.0      # printed spacer: the gearmotor end's thickness (the motor's M3s seat on it)

    # Hopper agitator (2026-11-13): balls piled over a 75 mm outlet for 67 mm balls bridge it (two or three on the floor
    # round the hole, each held in by the others), and the feed column then runs dry. A printed two-arm stirrer turns
    # over the outlet on a shaft normal to the tub floor, from a small gearmotor under the shelf beside the take-up
    # sleeve. The arms sweep at a ball's centre height, so they push every floor ball (the ones that make a bridge)
    # sideways at its equator and never wedge one down against the floor. Motor figures are assumptions: read yours.
    agit_back: float = 95.0           # shaft up the slope from the outlet's centre (along the shelf)
    agit_side: float = -40.0          # and across it (y): clear of the spring drum behind the sleeve and of the spigot flange
    agit_arm_l: float = 115.0         # shaft axis to an arm's tip; two arms, opposite
    agit_arm_w: float = 16.0          # arm depth in the turning direction (its bending depth)
    agit_arm_h: float = 12.0          # arm height, centred a ball's radius above the tub floor
    agit_hub_d: float = 22.0          # hub where the arms join
    agit_boss_d: float = 16.0         # boss from just over the tub floor up to the arms; grips the shaft's top end
    agit_floor_hole: float = 12.0     # the shaft's hole in the tub floor (under half a ball, so none sinks in)
    agit_shelf_hole: float = 10.0     # and in the shelf
    agit_mount_d: float = 44.0        # printed motor mount under the shelf: the motor's face screws up into it from
    agit_mount_t: float = 8.0         #   counterbores in its top, then M4 from above through the shelf into its inserts
    agit_collar_d: float = 13.0       # the gearbox face's raised collar, in the mount's centre hole (assumption)
    agit_mount_bolt_r: float = 17.0   # its three M4 inserts
    agit_motor_d: float = 25.0        # concentric planetary gearmotor, 25 mm class (assumption: read yours)
    agit_motor_len: float = 60.0      # body and gearbox (assumption)
    agit_motor_pcd: float = 17.0      # its four M3 face holes (assumption: read yours)
    agit_shaft_d: float = 6.0         # D shaft (assumption)
    agit_shaft_len: float = 25.0      # out of the gearbox face (assumption: read yours; a shorter one needs a thinner mount)
    agit_motor_rpm: float = 20.0      # at 24 V (assumption)
    agit_motor_nm: float = 1.5        # rated torque (assumption)
    agit_motor_stall_nm: float = 3.0  # stall torque, the most a jammed arm sees (assumption)
    agit_torque_factor: float = 2.0   # rated torque over the largest needed (both arms ploughing a full tub)
    agit_wall_clear: float = 10.0     # arm tips clear the tub's inside walls by at least this
    agit_overshoot: float = 10.0      # arm tips reach at least this far past the outlet's centre

    # ---- derived -----------------------------------------------------------
    @property
    def rail_top(self) -> float:
        return self.rail_z + self.rail_h

    @property
    def pivot_z(self) -> float:
        return self.launch_z + self.pivot_z_rel

    @property
    def head_gap_axis(self) -> float:
        """Wheel centre height above/below the ball path."""
        return self.wheel_head_d / 2 + self.wheel_gap / 2

    @property
    def mast_plate_z(self) -> float:
        return self.mast_top_z

    @property
    def turntable_top(self) -> float:
        return self.mast_top_z + self.plate_t + self.bearing_h + self.plate_t

    @property
    def net_top(self) -> float:
        return self.rail_top + self.net_h

    @property
    def pole_top(self) -> float:
        return self.net_top - 15.0

    @property
    def wheel_y(self) -> float:
        return self.base_half_w + self.bracket_t + 2.0 + self.wheel_w / 2

    @property
    def net_area(self) -> float:
        return self.net_w * self.net_h / 1e6

    @property
    def wind_force_n(self) -> float:
        """Steady drag on the net at design_wind (N): 0.5 rho Cd A solidity v^2."""
        return 0.5 * 1.2 * self.drag_coeff * self.net_area * self.net_solidity * self.design_wind ** 2

    def ballast_kg(self, structure_kg: float) -> float:
        """Ballast, centred between the wheel lines, so the design wind cannot tip the base.

        The wind pushes at the net's mid-height. The base tips about the near
        wheel line from either direction; the weight acts midway between the
        two wheel lines. Conservative: it ignores the feet and the net's own
        flex.
        """
        h = (self.rail_top + self.net_top) / 2 / 1000
        arm = abs(self.wheel_x[0] - self.wheel_x[1]) / 2 / 1000
        need = self.wind_force_n * h / (9.81 * arm)
        return max(0.0, need - structure_kg)

    # ---- feed geometry (head frame: x forward, z up from the ball path) --------
    @property
    def shuttle_z0(self) -> float:
        return -self.ball_d / 2 + 0.5

    @property
    def floor_top(self) -> float:
        return -self.ball_d / 2

    @property
    def roof_bottom(self) -> float:
        return self.shuttle_z0 + self.shuttle_h + 0.5

    @property
    def hole_d(self) -> float:
        return self.ball_d + 3.0

    @property
    def col_top(self) -> float:
        return self.head_z1 + 1.5

    @property
    def mouth_rel(self) -> tuple[float, float]:
        """Hose socket mouth, head frame (x, z)."""
        return (self.feed_col_x, self.col_top + self.socket_h)

    @property
    def nip_x(self) -> float:
        """Ball-centre x at which the ball first touches both wheels."""
        reach = self.wheel_head_d / 2 + self.ball_d / 2
        return -math.sqrt(reach ** 2 - self.head_gap_axis ** 2)

    def mouth_world(self, elev_deg: float) -> tuple[float, float]:
        """World (x, z) of the socket mouth with the head tilted `elev_deg` nose up about the pivot."""
        mx, mz = self.mouth_rel
        dx, dz = mx, mz - self.pivot_z_rel
        t = math.radians(elev_deg)
        return (self.head_x + dx * math.cos(t) - dz * math.sin(t),
                self.pivot_z + dx * math.sin(t) + dz * math.cos(t))

    @property
    def shelf_origin(self) -> tuple[float, float]:
        """World (x, z) of the shelf's underside centre; the shelf falls toward +x."""
        s = math.radians(self.shelf_slope_deg)
        a = self.shelf_l / 2 - 55.0
        return (self.hopper_out_x - a * math.cos(s), self.hopper_out_z + a * math.sin(s))

    @property
    def retain_gap(self) -> float:
        return self.retain_frac * self.ball_d

    @property
    def retain_defl(self) -> float:
        """How far each arm must spring outward to let the ball through."""
        return (self.ball_d - self.retain_gap) / 2

    @property
    def retain_arm_n(self) -> float:
        """Side force of one arm at full deflection (end-loaded cantilever; worst case)."""
        i = self.shuttle_h * self.retain_t ** 3 / 12
        return 3 * self.petg_e_mpa * i * self.retain_defl / self.retain_len ** 3

    @property
    def retain_arm_strain(self) -> float:
        return 3 * self.retain_t * self.retain_defl / (2 * self.retain_len ** 2)

    @property
    def retain_pass_n(self) -> float:
        """Pull along the path to drag a ball through both arms (frictionless contact on the ball's circle)."""
        half = self.retain_gap / 2
        r = self.ball_d / 2
        return 2 * self.retain_arm_n * math.sqrt(r * r - half * half) / half

    @property
    def retain_hold_n(self) -> float:
        """Ball weight along the path at the steepest nose-down tilt."""
        return self.ball_g / 1000 * 9.81 * math.sin(math.radians(-self.elev_min))

    @property
    def nip_len(self) -> float:
        """Distance the ball's centre travels while it touches both wheels (rigid-ball geometry), mm."""
        return -2 * self.nip_x

    @property
    def launch_rpm(self) -> tuple[float, float]:
        """(top, bottom) wheel rpm for `launch_v_max` with `launch_topspin_rpm`, as WheelLauncher.wheel_rpm."""
        r = self.wheel_head_d / 2000
        total = 2 * self.launch_v_max / self.speed_eff
        diff = 2 * (self.ball_d / 2000) * self.launch_topspin_rpm * 2 * math.pi / 60 / self.spin_eff
        per = 60 / (2 * math.pi * r)
        return (total + diff) / 2 * per, (total - diff) / 2 * per

    @property
    def launch_force_n(self) -> float:
        """Mean push along the path to take a ball from rest to `launch_v_max` within the nip."""
        if self.nip_len <= 0:
            return math.inf
        return self.ball_g / 1000 * self.launch_v_max ** 2 / (2 * self.nip_len / 1000)

    @property
    def launch_traction_n(self) -> float:
        """Most the two wheels can push with, at the full squeeze (Coulomb friction, both sides)."""
        return 2 * self.wheel_mu * self.ball_stiff_n_mm * (self.ball_d - self.wheel_gap)

    @property
    def shuttle_rear(self) -> float:
        """Rear end of the shuttle: it still shuts the column when pushed fully forward."""
        return self.feed_col_x - self.hole_d / 2 - 2.0 - self.feed_stroke

    def shelf_underside_z(self, x: float) -> float:
        cx, cz = self.shelf_origin
        return cz - (x - cx) * math.tan(math.radians(self.shelf_slope_deg))

    @property
    def shelf_l(self) -> float:
        return self.tub_l + 20.0

    @property
    def shelf_w(self) -> float:
        return 2 * (self.shelf_post_y + 25.0)

    def tub_capacity(self) -> int:
        inside = (self.tub_l - 2 * self.tub_wall) * (self.tub_w - 2 * self.tub_wall) * (self.tub_h - self.tub_wall)
        return int(self.packing * inside / (math.pi / 6 * self.ball_d ** 3))

    # ---- hopper frame: four posts, then two diagonal braces each way ----------
    @property
    def hopper_load_n(self) -> float:
        """Weight on the posts: the full tub of balls, the tub and the 5 mm aluminium shelf (density 2.7 g/cm^3)."""
        shelf_kg = self.shelf_l * self.shelf_w * self.plate_t * 2.7e-6
        return 9.81 * (self.tub_capacity() * self.ball_g / 1000 + self.tub_mass_kg + shelf_kg)

    @property
    def hopper_side_load_n(self) -> float:
        return max(self.side_load_g * self.hopper_load_n, self.side_load_min_n)

    @property
    def post_len(self) -> float:
        """Mean post length, deck to shelf underside."""
        xs = (self.post_front_x, self.post_rear_x)
        return sum(self.post_top_z(x) for x in xs) / 2 - (self.rail_top + self.plate_t)

    def post_top_z(self, x: float) -> float:
        """A hopper post's square-cut top: the shelf's underside over its net-side edge, less the wedge's thin end."""
        return self.shelf_underside_z(x + 10.0) - self.post_wedge_min_t

    def post_wedge_rise(self) -> float:
        """How much thicker a wedge is at its rear (uphill) edge than at its net-side edge: 20 mm of post at the slope."""
        return 20.0 * math.tan(math.radians(self.shelf_slope_deg))

    def post_screw_stack(self) -> tuple[float, float, float]:
        """(washer, shelf, wedge) lengths a vertical M5 on the post's centre line passes through, mm."""
        t = math.tan(math.radians(self.shelf_slope_deg))
        washer = self.post_washer_min_t + self.post_washer_d / 2 * t
        shelf = self.plate_t / math.cos(math.radians(self.shelf_slope_deg))
        wedge = self.post_wedge_min_t + 10.0 * t
        return washer, shelf, wedge

    def post_shelf_screw_len(self) -> int:
        """Shortest stock M5 length (5 mm steps) with at least 2 d of thread in the post's tapped bore."""
        grip = sum(self.post_screw_stack())
        return int(math.ceil((grip + 10.0) / 5.0) * 5)

    def check_post_wedge(self) -> list[str]:
        """The shelf meets each post over its whole top, and the vertical M5 through the slope fits."""
        bad = []
        s = math.radians(self.shelf_slope_deg)
        if self.post_wedge_min_t < 2.5 * self.print_min_wall:
            bad.append(f"post wedge thin end {self.post_wedge_min_t:g} mm is under {2.5 * self.print_min_wall:g} mm "
                       "(a wall either side of the screw hole's top edge)")
        if self.post_washer_min_t < self.print_min_wall:
            bad.append(f"taper washer thin side {self.post_washer_min_t:g} mm is under {self.print_min_wall:g} mm")
        need = 5.0 / math.cos(s) + self.plate_t * math.tan(s)
        if self.shelf_post_hole < need + 0.3:
            bad.append(f"shelf hole {self.shelf_post_hole:g} mm does not pass a vertical M5 through a {self.plate_t:g} mm "
                       f"plate at {self.shelf_slope_deg:g} deg (needs {need:.2f} + 0.3)")
        if self.post_washer_d < self.shelf_post_hole + 2 * 2.0:
            bad.append(f"taper washer {self.post_washer_d:g} mm leaves under 2 mm of seat round the {self.shelf_post_hole:g} mm hole")
        # the full tub presses on the sloped wedge faces; its downhill share must not slide the shelf on friction alone
        if math.tan(s) >= self.petg_mu:
            bad.append(f"at {self.shelf_slope_deg:g} deg the shelf would slide on the wedges (tan {math.tan(s):.2f} >= "
                       f"mu {self.petg_mu:g}); the screws would carry it in bending")
        return bad


    def brace_ends(self, axis: str) -> tuple[tuple[float, float], tuple[float, float]]:
        """Centre-line ends (a, z) of a diagonal in the x-z plane (axis 'x', a = x) or the y-z plane ('y', a = y).

        x braces rise from the rear post's foot to the front post's head, on the outer face of each side pair of
        posts; the y brace rises from the left rear post's foot to the right rear post's head, behind the pair.
        """
        z0 = self.rail_top + self.plate_t + self.brace_foot_z
        if axis == "x":
            return (self.post_rear_x, z0), (self.post_front_x, self.shelf_underside_z(self.post_front_x + 10.0) - self.brace_head_z)
        return (-self.shelf_post_y, z0), (self.shelf_post_y, self.shelf_underside_z(self.post_rear_x + 10.0) - self.brace_head_z)

    def brace_len(self, axis: str) -> float:
        (a0, z0), (a1, z1) = self.brace_ends(axis)
        return math.hypot(a1 - a0, z1 - z0)

    def brace_force_n(self, axis: str) -> float:
        """Axial force in one diagonal under the side load, taking the posts' ends as pins (M5 joints carry no
        useful moment). Two x braces share a load toward the net; the one y brace takes the whole load along it
        (the shelf, bolted to all four posts, holds the front pair's heads to the rear pair's in plan)."""
        (a0, z0), (a1, z1) = self.brace_ends(axis)
        return self.hopper_side_load_n / (2 if axis == "x" else 1) * self.brace_len(axis) / abs(a1 - a0)

    def brace_buckling_n(self, axis: str) -> float:
        """Euler load of a pinned 2020 diagonal."""
        return math.pi ** 2 * self.ext_E_mpa * self.ext_I_2020_mm4 / self.brace_len(axis) ** 2

    def post_buckling_n(self) -> float:
        """Euler load of one pinned, unbraced 2040 post about its weak axis."""
        return math.pi ** 2 * self.ext_E_mpa * self.ext_I_weak_mm4 / self.post_len ** 2

    def check_hopper_frame(self) -> list[str]:
        bad = []
        per_post = self.hopper_load_n / 4
        if self.post_buckling_n() < 4 * per_post:
            bad.append(f"a hopper post buckles at {self.post_buckling_n():.0f} N, under 4x its {per_post:.0f} N share")
        for ax in ("x", "y"):
            f, cr = self.brace_force_n(ax), self.brace_buckling_n(ax)
            if cr < self.brace_min_factor * f:
                bad.append(f"{ax} brace carries {f:.0f} N and buckles at {cr:.0f} N (needs {self.brace_min_factor:g}x)")
        return bad

    def hose_chords(self, steps: int = 4) -> list[tuple[float, float, float]]:
        """(elevation, chord mm, slope deg) from the hopper outlet to the socket mouth over the elevation range."""
        out = []
        for i in range(steps + 1):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / steps
            mx, mz = self.mouth_world(e)
            dx, dz = self.hopper_out_x - mx, self.hopper_out_z - mz
            out.append((e, math.hypot(dx, dz), math.degrees(math.atan2(dz, abs(dx)))))
        return out

    def hose_pose_ranges(self, steps: int = 4) -> list[tuple[float, tuple[float, float] | None]]:
        """(elevation, (shortest, longest) hose mm that fits that pose, or None) with the hose leaving the outlet
        straight down and entering the socket along the column axis, never tighter than `hose_min_bend` and
        never flatter than `feed_min_slope_deg` (`_hose_curve_range`). Unlike `hose_chords` this uses the end directions."""
        out = []
        for i in range(steps + 1):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / steps
            mx, mz = self.mouth_world(e)
            out.append((e, _hose_curve_range(self.hopper_out_x, self.hopper_out_z, mx, mz, math.radians(e),
                                             self.hose_min_bend, self.feed_min_slope_deg)))
        return out

    def hose_take_up_mm(self) -> float | None:
        """Hose length a fixed cut cannot absorb over the elevation range: the longest shortest-fit minus the
        shortest longest-fit. 0 or less means one cut length fits every pose; None if some pose has no fit at all."""
        r = [x for _, x in self.hose_pose_ranges()]
        if any(x is None for x in r):
            return None
        return max(lo for lo, _ in r) - min(hi for _, hi in r)

    def take_up_stroke_mm(self, ratio: float = 2.0) -> float | None:
        """Travel of a take-up that absorbs `hose_take_up_mm`: a spring-loaded pulley the hose loops round moves
        1/ratio of the hose length it pays out (ratio 2 for a single floating pulley). None if some pose has no fit."""
        t = self.hose_take_up_mm()
        return None if t is None else max(t, 0.0) / ratio

    def take_up_design(self, tension_n: float = 5.0, margin_mm: float = 30.0) -> dict | None:
        """A floating-pulley take-up sized from the pose ranges (2026-11-04). Rejected 2026-11-10: the 180 deg wrap turns
        the ball path uphill (`pulley_take_up_passes_balls`); kept to compare with `sleeve_take_up_design`. The hose runs fixed length `fixed_mm` plus
        twice the pulley's travel x (ratio 2). Fixed length is the shortest longest-fit, so x never goes below 0; each
        pose needs x in [(lo - fixed)/2, (hi - fixed)/2]. Pulley diameter is twice the hose's minimum bend radius; the
        track is the stroke plus one pulley diameter plus a margin at each end. The spring pulls the pulley with twice the
        hose tension `tension_n` (an assumption: enough to keep the hose taut without dragging the head). Returns None if
        some pose has no fit; `ok` is False if the same x cannot be chosen monotonically (never in practice) or a pose
        window is empty."""
        r = self.hose_pose_ranges()
        if any(x is None for _, x in r):
            return None
        fixed = min(hi for _, (lo, hi) in r)
        poses = []
        for e, (lo, hi) in r:
            xlo, xhi = max(0.0, (lo - fixed) / 2), (hi - fixed) / 2
            poses.append((e, xlo, xhi))
        stroke = max(xlo for _, xlo, _ in poses)
        # park the pulley at the lowest x each pose allows; it must stay inside the stroke
        ok = all(xlo <= xhi + 1e-9 and xlo <= stroke + 1e-9 for _, xlo, xhi in poses)
        d = 2 * self.hose_min_bend
        return {"fixed_mm": fixed, "stroke_mm": stroke, "pulley_d_mm": d, "track_mm": stroke + d + 2 * margin_mm,
                "spring_n": 2 * tension_n, "poses": poses, "ok": ok}

    def pulley_wrap_max_deg(self) -> float:
        """Largest angle a ball-carrying hose may wrap round a pulley (2026-11-10). On a horizontal axle the hose's
        direction turns by the wrap angle; starting from straight down it must stay at least `feed_min_slope_deg`
        below horizontal, so the wrap can be at most 90 - that. A floating pulley stores hose only with a 180 deg wrap,
        which turns the hose back upward on one leg: balls that roll by gravity cannot climb it."""
        return 90.0 - self.feed_min_slope_deg

    def pulley_take_up_passes_balls(self) -> bool:
        """False whenever a floating-pulley take-up is needed: its 180 deg wrap exceeds `pulley_wrap_max_deg`."""
        return 180.0 <= self.pulley_wrap_max_deg()

    def mouth_world_3d(self, elev_deg: float, az_deg: float) -> tuple[tuple, tuple]:
        """Socket mouth (x, y, z) and the column's unit axis (up the column, out of the socket) with the head tilted
        `elev_deg` nose up and turned `az_deg` on the turntable, whose axis is the vertical through (head_x, 0)."""
        mx, mz = self.mouth_world(elev_deg)
        t, a = math.radians(elev_deg), math.radians(az_deg)
        r = mx - self.head_x
        pos = (self.head_x + r * math.cos(a), r * math.sin(a), mz)
        axis = (-math.sin(t) * math.cos(a), -math.sin(t) * math.sin(a), math.cos(t))
        return pos, axis

    def _ranges_from(self, ox: float, oz: float, steps: int = 4, az: bool = True):
        """(elevation, azimuth, hose range or None) for each pose, from a start point straight above (ox, 0, oz).
        Azimuth 0 uses the planar `_hose_curve_range`; turned poses use `_hose_curve_range_3d` (added 2026-11-10:
        before that the take-up was sized at azimuth 0 only). `az=False` gives the azimuth-0 poses alone."""
        azs = [0.0] if not az or self.az_max <= 0 else [self.az_max * k / self.az_steps for k in range(self.az_steps + 1)]
        out = []
        for i in range(steps + 1):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / steps
            for a in azs:
                if a == 0.0:
                    mx, mz = self.mouth_world(e)
                    rng = _hose_curve_range(ox, oz, mx, mz, math.radians(e), self.hose_min_bend, self.feed_min_slope_deg)
                else:
                    m, u = self.mouth_world_3d(e, a)
                    m = tuple(round(v, 9) for v in m)
                    u = tuple(round(v, 12) for v in u)
                    rng = _hose_curve_range_3d((ox, 0.0, oz), m, u, self.hose_min_bend, self.feed_min_slope_deg)
                out.append((e, a, rng))
        return out

    def sleeve_take_up_design(self, tension_n: float = 5.0, step_mm: float = 25.0, max_mm: float = 600.0,
                              azimuth: bool = True) -> dict | None:
        """A take-up that keeps the ball path falling (2026-11-10). A rigid vertical sleeve hangs `sleeve_mm` under the
        hopper outlet; the hose's top end slides inside it, held up by a constant-force spring, so the free hose starts at
        the sleeve's lower end and its free length changes by the slide. Balls drop straight down the sleeve into the hose,
        then follow the one falling curve that `_hose_curve_range` checks. `sleeve_mm` (outlet to the sleeve's lower
        end) must hold the stroke (longest shortest-fit minus shortest longest-fit, from the lower start), the collar,
        the gap under the shelf and `sleeve_overlap_mm`. Searches sleeve lengths
        upward in `step_mm`; None if no length up to `max_mm` works (a longer sleeve lowers the start, which can only
        be done while every pose still has a curve). The spring pulls `tension_n` on one hose leg (assumption).
        Poses are (elevation, azimuth, slide low, slide high); since 2026-11-10 they include the head turned to
        `az_max` (`azimuth=False` sizes at azimuth 0 alone, as before)."""
        ox, oz = self.hopper_out_x, self.hopper_out_z
        ls = self.sleeve_overlap_mm
        seen_fit = False
        while ls <= max_mm + 1e-9:
            r = self._ranges_from(ox, oz - ls, az=azimuth)
            if any(x is None for _, _, x in r):
                if seen_fit:
                    return None    # dropping further only loses poses
                ls += step_mm
                continue
            seen_fit = True
            fixed = min(hi for _, _, (lo, hi) in r)
            stroke = max(0.0, max(lo for _, _, (lo, hi) in r) - fixed)
            if stroke + self.sleeve_overlap_mm + self.collar_h_mm + self.sleeve_top_mm <= ls + 1e-9:
                poses = [(e, a, max(0.0, lo - fixed), hi - fixed) for e, a, (lo, hi) in r]
                return {"sleeve_mm": ls, "start_z": oz - ls, "stroke_mm": stroke, "free_mm": (fixed, fixed + stroke),
                        "hose_cut_mm": math.ceil((fixed + stroke + self.sleeve_overlap_mm + COLLAR_SOCKET_MM) / 10) * 10,
                        "tube_mm": ls - self.sleeve_top_mm, "collar_travel": (ls - self.sleeve_overlap_mm - stroke, ls - self.sleeve_overlap_mm),
                        "sleeve_id_mm": self.hose_od + self.sleeve_clear_mm, "spring_n": tension_n, "poses": poses}
            ls += step_mm
        return None

    def lowest_sleeve_outlet(self, xs=(-600.0, -550.0, -500.0, -450.0, -400.0, -350.0),
                             z_lo: float = 1650.0, z_hi: float = 2100.0, z_step: float = 25.0) -> list[tuple]:
        """For each outlet x, the lowest outlet height (to `z_step`) at which `sleeve_take_up_design` works, with its
        design: (x, z or None, design or None). Slow (a few seconds per x): for the README, not the build."""
        from dataclasses import replace
        out = []
        for x in xs:
            hit = (x, None, None)
            z = z_lo
            while z <= z_hi + 1e-9:
                d = replace(self, hopper_out_x=float(x), hopper_out_z=float(z)).sleeve_take_up_design()
                if d is not None:
                    hit = (x, z, d)
                    break
                z += z_step
            out.append(hit)
        return out

    def hose_take_up_by_elev_max(self, maxes=(15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0)):
        """(top elevation, take-up mm or None) with the hose fitted over elev_min..that top elevation instead of the
        full range, to show what each extra degree of nose-up costs the hose. Same bend and fall limits."""
        from dataclasses import replace
        return [(m, replace(self, elev_max=float(m)).hose_take_up_mm()) for m in maxes]

    @property
    def hose_len(self) -> float:
        """Cut length: the longest chord with 5% spare, rounded up to 10 mm."""
        return math.ceil(max(c for _, c, _ in self.hose_chords()) * 1.05 / 10) * 10

    def hose_bow_radius(self) -> float:
        """Smallest bend radius, taking the hose as a circular arc of its cut length across the shortest chord."""
        c = min(c for _, c, _ in self.hose_chords())
        length = self.hose_len
        if length <= c:
            return math.inf
        lo, hi = c / 2, 1e6   # arc length 2 r asin(c / 2r) falls from pi c / 2 toward c as r grows
        if length >= math.pi * c / 2:  # more than a semicircle: radius is c/2 or less
            return c / 2
        for _ in range(80):
            r = (lo + hi) / 2
            if 2 * r * math.asin(c / (2 * r)) > length:
                lo = r
            else:
                hi = r
        return (lo + hi) / 2

    def check(self) -> list[str]:
        bad = []
        if not 0.80 * self.ball_d <= self.wheel_gap <= 0.90 * self.ball_d:
            bad.append(f"launcher wheel gap {self.wheel_gap:g} mm should squeeze a {self.ball_d:g} mm ball by 10-20%")
        if self.plate_half_y < self.ball_d / 2 + 5:
            bad.append("head plates are too close to the ball path")
        if self.wheel_head_w / 2 + 5 > self.plate_half_y:
            bad.append("launcher wheel touches the head plates")
        if self.rail_z < self.wheel_d / 2 + self.gearmotor_d / 2 + 4:
            bad.append("rails too low for the drive motors")
        if self.turntable_top - self.pivot_z > -60:
            bad.append("pivot is less than 60 mm above the turntable")
        if self.head_x1 + self.head_x < -5 or self.head_x1 + self.head_x > 60:
            bad.append("muzzle is not at the net plane (0 to 60 mm through it)")
        if abs(self.foot_half_y) * 2 > self.beam_len:
            bad.append("feet are beyond the ends of the net beam")
        if self.cheek_x_half > self.head_x1:
            bad.append("cheeks reach past the muzzle")
        bad += self.check_feed()
        bad += self.check_hopper_frame()
        bad += self.check_post_wedge()
        bad += self.check_launch()
        bad += self.check_azimuth()
        bad += self.check_home_switch()
        bad += self.check_bearing()
        bad += self.check_az_stops()
        bad += self.check_cables()
        bad += self.check_deck_cables()
        bad += self.check_power()
        bad += self.check_inrush()
        bad += self.check_regen()
        bad += self.check_estop_reset()
        bad += self.check_trough()
        bad += self.check_lift()
        bad += self.check_lift_jam()
        bad += self.check_lift_sense_ripple()
        bad += self.check_lift_slip()
        bad += self.check_lift_tooth()
        bad += self.check_lift_strand()
        bad += self.check_lift_shaft()
        bad += self.check_bearing_fit_ring()
        bad += self.check_agitator()
        bad += self.check_spring_bracket()
        return bad

    # ---- azimuth drive (2026-11-10) -------------------------------------------
    @property
    def az_gear_r(self) -> float:
        return self.az_module * self.az_gear_teeth / 2

    @property
    def az_pinion_r(self) -> float:
        return self.az_module * self.az_pinion_teeth / 2

    @property
    def az_centre_dist(self) -> float:
        """Turntable axis to the stepper shaft, mm. The stepper sits on +y, under the mast plate."""
        return self.az_gear_r + self.az_pinion_r

    @property
    def az_ratio(self) -> float:
        return self.az_gear_teeth / self.az_pinion_teeth

    @property
    def az_trim_r(self) -> float:
        """Radius the turntable plate is trimmed to outside the toothed sector: inside the pinion's tip circle."""
        return self.az_centre_dist - (self.az_pinion_r + self.az_module) - self.az_clear_mm

    @property
    def az_sector_half_deg(self) -> float:
        return self.az_max + self.az_sector_margin_deg

    @property
    def az_gear_inner_r(self) -> float:
        """Inner edge of the printed sector."""
        return self.az_gear_r - 1.25 * self.az_module - 18.0

    @property
    def az_bolt_r(self) -> float:
        """M4 bolts through the plate into the sector's heat-set inserts."""
        return (self.az_gear_inner_r + self.az_trim_r) / 2

    def az_tooth_half_angle(self, r: float) -> float:
        """Half the gear tooth's angular thickness (rad) at radius r: involute flank, thinned by `az_backlash_mm` at
        the pitch circle."""
        a = math.radians(self.az_pressure_deg)
        rp = self.az_gear_r
        rb = rp * math.cos(a)
        inv = lambda x: math.tan(x) - x  # noqa: E731
        ar = math.acos(min(1.0, rb / r))
        s_p = math.pi * self.az_module / 2 - self.az_backlash_mm
        return s_p / (2 * rp) + inv(a) - inv(ar)

    def az_root_gap_mm(self) -> float:
        """Narrowest slot in the printed sector: the tooth space at the root circle (no fillet)."""
        rr = self.az_gear_r - 1.25 * self.az_module
        return rr * (2 * math.pi / self.az_gear_teeth - 2 * self.az_tooth_half_angle(rr))

    def az_tip_land_mm(self) -> float:
        ra = self.az_gear_r + self.az_module
        return ra * 2 * self.az_tooth_half_angle(ra)

    @property
    def az_gear_face_mm(self) -> float:
        """Printed sector thickness: it fills the bearing gap under the turntable plate, less `az_gear_gap_mm`."""
        return self.bearing_h - self.az_gear_gap_mm

    def az_hose_torque_nm(self) -> float:
        """Hose pull about the turntable axis, worst pose. A taut hose without bending stiffness pulls its end toward
        its other end, so the force is `hose_pull_n` along the chord from the socket mouth to the hose's start (the
        take-up sleeve's lower end, or the outlet if no sleeve fits); its moment about the vertical axis is zero with
        the head straight ahead and grows as it turns. The hose's own bending and twisting stiffness is not modelled:
        hang a hose and measure the torque with a spring scale on the head."""
        t = self.sleeve_take_up_design()
        sx, sz = self.hopper_out_x, (t["start_z"] if t else self.hopper_out_z)
        azs = [self.az_max * k / self.az_steps for k in range(self.az_steps + 1)] if self.az_max > 0 else [0.0]
        worst = 0.0
        for i in range(5):
            e = self.elev_min + (self.elev_max - self.elev_min) * i / 4
            for a in azs:
                (mx, my, mz), _ = self.mouth_world_3d(e, a)
                dx, dy, dz = sx - mx, -my, sz - mz
                n = math.sqrt(dx * dx + dy * dy + dz * dz)
                rx, ry = mx - self.head_x, my
                worst = max(worst, abs(rx * dy - ry * dx) / n * self.hose_pull_n / 1000)
        return worst

    def azimuth_drive(self, inertia_kgm2: float | None = None, load_n: float = 60.0) -> dict:
        """Size the stepper and the gear sector for a `az_slew_deg` move in `az_slew_s` (triangular speed profile:
        half the time speeding up, half slowing down). `inertia_kgm2` is the turning inertia about the turntable axis
        (default `az_inertia_kgm2`; the build measures it from the CAD); `load_n` is the weight on the bearing.

        Torques at the turntable: inertia x peak angular acceleration, the bearing's rolling friction
        (mu x load x ball-circle radius) and the hose bound. The motor sees them through the ratio and mesh efficiency,
        plus its own rotor and the pinion speeding up. Tooth bending is Lewis' equation, Y = 0.484 - 2.87/z for 20 deg
        full-depth teeth, face width = the printed sector's thickness, tangential load x `az_shock`. Aim resolution is one full step
        at the output; backlash is `az_backlash_mm` over the pitch radius."""
        j = self.az_inertia_kgm2 if inertia_kgm2 is None else inertia_kgm2
        th = math.radians(self.az_slew_deg)
        t = self.az_slew_s
        alpha = 4 * th / t ** 2
        omega = 2 * th / t
        t_inertia = j * alpha
        t_bearing = self.az_bearing_mu * load_n * self.bearing_d / 2 / 1000
        t_hose = self.az_hose_torque_nm()
        t_out = t_inertia + t_bearing + t_hose
        rp_m = (self.az_pinion_r + self.az_module) / 1000
        pinion_j = 0.5 * (7850 * math.pi * rp_m ** 2 * 0.012) * rp_m ** 2   # steel disc, 12 mm long (bound)
        t_motor = t_out / (self.az_ratio * self.az_gear_eff) + (self.stepper_rotor_kgm2 + pinion_j) * alpha * self.az_ratio
        rpm = omega * self.az_ratio * 60 / (2 * math.pi)
        f_t = t_out / (self.az_gear_r / 1000) * self.az_shock
        y = 0.484 - 2.87 / self.az_gear_teeth
        sigma = f_t / (self.az_gear_face_mm * self.az_module * y)
        step = self.stepper_steps * self.az_ratio
        step_deg = 360 / step
        back_deg = math.degrees(self.az_backlash_mm / self.az_gear_r)
        hold_static = (t_bearing + t_hose) / (self.az_ratio * self.az_gear_eff)
        return {
            "alpha_rad_s2": alpha, "omega_rad_s": omega, "inertia_kgm2": j,
            "torque_inertia_nm": t_inertia, "torque_bearing_nm": t_bearing, "torque_hose_nm": t_hose,
            "torque_out_nm": t_out, "torque_motor_nm": t_motor, "motor_rpm": rpm,
            "torque_margin": self.stepper_torque_nm / t_motor, "hold_margin": self.stepper_hold_nm / max(hold_static, 1e-9),
            "tooth_force_n": f_t, "tooth_stress_mpa": sigma, "lewis_y": y,
            "step_deg": step_deg, "step_miss_mm": math.tan(math.radians(step_deg)) * self.aim_range_m * 1000,
            "backlash_deg": back_deg, "backlash_miss_mm": math.tan(math.radians(back_deg)) * self.aim_range_m * 1000,
            "root_gap_mm": self.az_root_gap_mm(), "tip_land_mm": self.az_tip_land_mm(),
            "fastest_slew_s": self.fastest_slew_s(j, load_n),
        }

    def fastest_slew_s(self, inertia_kgm2: float, load_n: float = 60.0) -> float:
        """Shortest `az_slew_s` that still keeps `az_torque_factor` on the motor (bisection; the hose and friction terms
        do not shrink with time, so a slow enough move always passes unless they alone eat the margin)."""
        from dataclasses import replace
        lo, hi = 0.02, 10.0
        if replace(self, az_slew_s=hi)._margin_only(inertia_kgm2, load_n) < self.az_torque_factor:
            return math.inf
        for _ in range(50):
            mid = (lo + hi) / 2
            m = replace(self, az_slew_s=mid)._margin_only(inertia_kgm2, load_n)
            lo, hi = (lo, mid) if m >= self.az_torque_factor else (mid, hi)
        return hi

    def _margin_only(self, j: float, load_n: float) -> float:
        th = math.radians(self.az_slew_deg)
        alpha = 4 * th / self.az_slew_s ** 2
        t_out = j * alpha + self.az_bearing_mu * load_n * self.bearing_d / 2 / 1000 + self.az_hose_torque_nm()
        rp_m = (self.az_pinion_r + self.az_module) / 1000
        pinion_j = 0.5 * (7850 * math.pi * rp_m ** 2 * 0.012) * rp_m ** 2
        t_motor = t_out / (self.az_ratio * self.az_gear_eff) + (self.stepper_rotor_kgm2 + pinion_j) * alpha * self.az_ratio
        return self.stepper_torque_nm / t_motor

    def check_azimuth(self, inertia_kgm2: float | None = None) -> list[str]:
        bad = []
        d = self.azimuth_drive(inertia_kgm2)
        if d["torque_margin"] < self.az_torque_factor:
            bad.append(f"azimuth stepper needs {d['torque_motor_nm']:.3f} N m for {self.az_slew_deg:g} deg in "
                       f"{self.az_slew_s:g} s against {self.stepper_torque_nm:g} N m pull-out ({self.az_torque_factor:g}x wanted)")
        if d["hold_margin"] < self.az_torque_factor:
            bad.append("azimuth stepper cannot hold the head against the hose and bearing drag")
        if d["tooth_stress_mpa"] > self.petg_bend_allow_mpa:
            bad.append(f"printed azimuth gear teeth bend at {d['tooth_stress_mpa']:.1f} MPa (allowed {self.petg_bend_allow_mpa:g})")
        if d["root_gap_mm"] < self.print_min_gap_mm:
            bad.append(f"printed azimuth gear slots are {d['root_gap_mm']:.2f} mm wide, under {self.print_min_gap_mm:g} mm")
        if d["tip_land_mm"] < self.print_min_gap_mm:
            bad.append("printed azimuth gear teeth come to a point")
        if self.az_gear_face_mm < 6.0:
            bad.append("bearing gap too thin for the printed azimuth gear sector")
        # The trimmed plate must clear everything bolted to it (cheek feet, bearing bolts) and the bearing itself.
        foot_r = max(math.hypot(35.0 + 12.0, self.plate_half_y + self.plate_t + self.cheek_gap + self.plate_t + 20.0), 0)
        if self.az_trim_r < max(foot_r, self.bearing_d / 2) + 5:
            bad.append("turntable plate trimmed for the pinion cuts into the cheek feet or the bearing")
        if self.az_sector_half_deg + 90 > 180 - 5 or self.az_gear_inner_r < self.bearing_d / 2 + 5:
            bad.append("azimuth gear sector does not fit outside the bearing")
        if self.az_bolt_r + 6 > self.az_trim_r or self.az_bolt_r - 6 < self.az_gear_inner_r:
            bad.append("azimuth gear sector's bolts miss the turntable plate")
        # The stepper's square body under the mast plate must sit inside the plate and clear the +y posts.
        half = 42.3 / 2
        if self.az_centre_dist + half > self.post_half_y + 40 - 5:
            bad.append("azimuth stepper overhangs the mast plate")
        if self.post_dx - 10 < half + 5:
            bad.append("azimuth stepper hits the mast posts")
        return bad

    # ---- azimuth home switch (2026-11-12) -------------------------------------
    def az_sector_ends_deg(self) -> tuple[float, float]:
        """Plate angles (deg from +x) of the gear sector's two ends, as `feeder.az_gear_profile` draws them: the outer
        teeth's root corners plus a quarter pitch."""
        pitch = 2 * math.pi / self.az_gear_teeth
        n = int(math.radians(self.az_sector_half_deg) // pitch)
        rr = self.az_gear_r - 1.25 * self.az_module
        e = n * pitch + self.az_tooth_half_angle(rr) + pitch / 4
        return 90.0 - math.degrees(e), 90.0 + math.degrees(e)

    def home_switch_design(self) -> dict:
        """Where the home switch and its cam lobe sit, and what the switch can tell the firmware.

        Radii about the turntable axis: the roller's free outer edge sits `home_sw_free_clear_mm` inside the sector's
        plain inner arc, so the arc never touches it; the lobe's face is pretravel plus half the overtravel further in,
        so the click lands in the middle of the lever's usable travel. Plate angle under the switch is
        `home_sw_deg - az` (the turntable turns counter-clockwise for positive az), so a lobe from the trip angle to the
        sector's high end holds the switch closed for every az at or below `az_home_deg`, down past where the pinion
        runs off the teeth. On the ramp the roller moves `tan(ramp)` mm in per mm of arc, so a radial error `d` moves the
        trip by `d / tan(ramp)` of arc: repeatability sets how alike two homings are, the part tolerance only shifts
        the home (calibrate AZ_HOME_DEG once). A round roller meets the ramp at the ramp's own angle round its rim, so
        it is touched, and pushed, rho (1/cos(ramp) - 1) / tan(ramp) of arc sooner than its tip would be; the ramp is
        set that much further along so the click still lands at `az_home_deg`."""
        ri = self.az_gear_inner_r
        r_c = ri - self.home_sw_free_clear_mm
        depth = self.home_sw_pretravel_mm + self.home_sw_overtravel_mm / 2
        r_lobe = r_c - depth
        tan = math.tan(math.radians(self.home_cam_ramp_deg))
        r_mid = (ri + r_lobe) / 2
        ramp_deg = math.degrees((ri - r_lobe) / tan / r_mid)
        trip = self.home_sw_deg - self.az_home_deg                       # plate angle under the switch at home
        to_trip = math.degrees((ri - r_c + self.home_sw_pretravel_mm) / tan / r_mid)
        cr = math.radians(self.home_cam_ramp_deg)
        early = math.degrees(self.home_sw_roller_r * (1 / math.cos(cr) - 1) / tan / r_mid)
        ramp0 = trip - to_trip + early                                   # ramp starts on the plain arc
        ramp1 = ramp0 + ramp_deg                                         # full depth from here to the end
        contact = ramp0 + math.degrees((ri - r_c) / tan / r_mid) - early  # roller first touched (on its rim)
        lo_end, hi_end = self.az_sector_ends_deg()
        tw, rw, hz = self.home_sw_body
        r_body_out = r_c - self.home_sw_lever_mm
        r_body_in = r_body_out - rw
        rep_deg = math.degrees(self.home_sw_repeat_mm / tan / r_c)
        tol_deg = math.degrees(self.home_sw_op_tol_mm / tan / r_c)
        micro_deg = 360 / (self.stepper_steps * self.az_microsteps * self.az_ratio)
        miss = lambda d: math.tan(math.radians(d)) * self.aim_range_m * 1000  # noqa: E731
        pinion_off = 90.0 - hi_end            # az where the pinion leaves the teeth turning negative
        return {
            "r_inner": ri, "r_roller": r_c, "r_lobe": r_lobe, "depth_mm": depth,
            "r_body_in": r_body_in, "r_body_out": r_body_out,
            "z_floor": self.mast_top_z + self.plate_t, "z_body_top": self.mast_top_z + self.plate_t + self.home_bracket_t + hz,
            "ramp0_deg": ramp0, "ramp1_deg": ramp1, "trip_plate_deg": trip, "sector_ends_deg": (lo_end, hi_end),
            "az_contact": self.home_sw_deg - contact, "az_closed_to": self.home_sw_deg - hi_end,
            "az_pinion_off": pinion_off, "az_lo_end_passes": self.home_sw_deg - lo_end,
            "repeat_deg": rep_deg, "repeat_miss_mm": miss(rep_deg), "tol_deg": tol_deg, "tol_miss_mm": miss(tol_deg),
            "microstep_deg": micro_deg, "microstep_miss_mm": miss(micro_deg),
            "travel_window_mm": (self.home_sw_pretravel_mm + self.home_runout_mm,
                                 self.home_sw_pretravel_mm + self.home_sw_overtravel_mm - self.home_runout_mm),
            "off_cam_max_deg": self.az_home_deg - pinion_off,
        }

    def check_home_switch(self) -> list[str]:
        bad = []
        h = self.home_switch_design()
        if not self.az_home_deg < -self.az_max:
            bad.append(f"azimuth home {self.az_home_deg:g} deg is inside the working range +-{self.az_max:g}")
        if h["az_contact"] > -self.az_max - 0.5:
            bad.append(f"home cam touches the switch roller at {h['az_contact']:.2f} deg, within 0.5 deg of the working range")
        if self.az_home_deg - 1.0 < h["az_pinion_off"]:
            bad.append("azimuth home is within 1 deg of where the pinion runs off the gear sector")
        if h["az_closed_to"] > h["az_pinion_off"]:
            bad.append("home cam ends before the pinion leaves the teeth: a head turned past it reads open")
        lo, hi = h["travel_window_mm"]
        if not lo <= h["depth_mm"] <= hi:
            bad.append(f"home cam depth {h['depth_mm']:.2f} mm is outside the switch's usable travel {lo:.2f}-{hi:.2f} mm")
        if self.home_sw_lever_mm < 2 * self.home_sw_roller_r + 0.2:
            bad.append("home switch roller would sit inside the switch body (lever shorter than the roller)")
        if self.home_sw_free_clear_mm < self.home_runout_mm + 0.2:
            bad.append("home switch roller could rub the sector's plain inner arc")
        if not h["ramp0_deg"] > h["sector_ends_deg"][0] + 2 or h["ramp1_deg"] > h["sector_ends_deg"][1] - 2:
            bad.append("home cam lobe does not fit on the gear sector")
        corner = math.hypot(h["r_body_out"] + self.home_slot_mm, self.home_sw_body[0] / 2)
        if corner > h["r_lobe"] - 1.0:
            bad.append("home switch body (at the slots' outer end) comes within 1 mm of the cam lobe")
        if h["r_body_in"] - self.home_slot_mm < self.bearing_d / 2 + 1.0:
            bad.append("home switch bracket runs into the turntable bearing")
        if h["z_body_top"] > self.mast_top_z + self.plate_t + self.bearing_h - 1.0:
            bad.append("home switch is taller than the bearing gap")
        if abs((self.home_sw_deg - 90.0 + 180) % 360 - 180) < 25:
            bad.append("home switch sits by the pinion")
        return bad

    # ---- turntable bearing's rings and screws (2026-11-21) ----------------------

    def bearing_design(self) -> dict:
        """The lazy-susan's two rings and their eight M5 screws. Both rings' screw heads sit in the gap between the
        flanges: the fixed ring's screws go down through it and the mast plate (nyloc under the plate, head reached
        through the turning ring's access hole), the turning ring's up through it and the turntable plate (head reached
        from below through the mast plate's and the fixed ring's access holes, nyloc on the plate). The heads pass
        each other as the turntable turns, so the gap must hold two heads."""
        t, d = self.bearing_ring_t, 5
        gap = self.bearing_h - 2 * t
        head_k, head_d = 2.75, 9.5                          # ISO 7380 M5 button head, mm
        nyloc, pitch = 5.0, 0.8                             # DIN 985 M5
        grip = t + self.plate_t
        past = self.bearing_screw_len - grip
        need = nyloc + 2 * pitch
        # the gap at the heads' radius: between the flanges, inside the race band
        r_head_out = self.bearing_bolt_r + head_d / 2
        r_race_in = self.bearing_race_r - self.bearing_race_w / 2
        return {
            "gap_mm": gap, "head_pass_mm": gap - 2 * head_k, "grip_mm": grip, "past_mm": past, "need_mm": need,
            "head_to_race_mm": r_race_in - r_head_out,
            "access_clear_mm": (self.bearing_access_d - head_d) / 2,
            "access_to_race_mm": r_race_in - (self.bearing_bolt_r + self.bearing_access_d / 2),
            "access_to_bore_mm": self.bearing_bolt_r - self.bearing_access_d / 2 - self.bearing_bore_d / 2,
            "old_past_mm": 12.0 - grip, "old_nut_need_mm": 4.7 + 2 * pitch,   # the M5 x 12 + ISO 4032 nut it replaced
            "tail_top_z": self.turntable_top + past,
        }

    def check_bearing(self) -> list[str]:
        bad = []
        b = self.bearing_design()
        if b["head_pass_mm"] < 0.3:
            bad.append(f"turntable bearing: the two rings' M5 heads pass {b['head_pass_mm']:.2f} mm apart in the "
                       f"{b['gap_mm']:.1f} mm gap (0.3 needed)")
        if b["past_mm"] < b["need_mm"]:
            bad.append(f"turntable bearing: M5 x {self.bearing_screw_len:g} leaves {b['past_mm']:g} mm past the "
                       f"{b['grip_mm']:g} mm stack, {b['need_mm']:g} needed for the nyloc and two threads")
        if b["head_to_race_mm"] < 1.0:
            bad.append("turntable bearing: the screw heads reach the race band")
        if b["access_clear_mm"] < 0.5:
            bad.append("turntable bearing: an M5 button head does not pass the access hole")
        if b["access_to_race_mm"] < 1.0 or b["access_to_bore_mm"] < 1.0:
            bad.append("turntable bearing: the access hole breaks into the race or the bore")
        if self.bearing_race_r + self.bearing_race_w / 2 > self.bearing_d / 2 - 0.5:
            bad.append("turntable bearing: the race band runs off the rings")
        return bad

    # ---- azimuth hard stops (2026-11-12) --------------------------------------
    def az_stop_world_deg(self) -> tuple[float, float]:
        """World angles (deg from +x, counter-clockwise) of the two pads' contact faces: the sector's low end meets the
        negative stop turning negative, its high end the positive stop turning positive."""
        lo, hi = self.az_sector_ends_deg()
        return lo - self.az_stop_deg, hi + self.az_stop_deg

    @property
    def az_reach_deg(self) -> float:
        """Furthest the head can turn either side: to a stop, plus the pad squeezed to `stop_pad_strain`. Everything
        that turns must clear everything fixed out to here, not just to `az_max` (the sweeps check it)."""
        return self.az_stop_deg + math.degrees(self.stop_pad_strain * self.stop_pad_t / (sum(self.stop_pad_r) / 2))

    def az_stop_design(self, inertia_kgm2: float | None = None) -> dict:
        """What the hard stops must take, and where they sit.

        Position: past `az_max` by `az_stop_margin_deg`; past the home click by the bracket slots' whole adjustment
        (a radial shift `home_slot_mm` moves the click by that much arc on the 45 deg ramp) plus 0.5 deg; and with
        `az_stop_mesh_pitches` of teeth left beyond the pinion's line, so the pinion is in full mesh when the stall
        torque arrives (`last tooth centre - pitches x pitch` at the pinion's plate angle 90 - az).

        Impact: the head runs into a pad at `stop_hit_deg_s` (the firmware's top speed: a lost-step runaway, not a
        commanded move, since the firmware clamps targets to +-az_max). Its kinetic energy, with the rotor and pinion
        reflected through the ratio, goes into the pad as a linear spring k = E A / t; the peak force sqrt(2 E k) must
        come with a compression under `stop_pad_strain`. The stepper keeps pushing at its holding torque through the
        mesh, which adds its tangential force at the pad. The worst sector insert carries the direct share plus the
        moment of that force about the three inserts' centroid. Stalled against a stop, the pinion's tooth load at
        holding torque is checked with the same Lewis form as the drive."""
        j = self.az_inertia_kgm2 if inertia_kgm2 is None else inertia_kgm2
        pitch = 360.0 / self.az_gear_teeth
        n = int(self.az_sector_half_deg // pitch)
        last_tooth = 90.0 + n * pitch
        stop_mesh_max = last_tooth - self.az_stop_mesh_pitches * pitch - 90.0
        slot_deg = math.degrees(self.home_slot_mm / math.tan(math.radians(self.home_cam_ramp_deg))
                                / self.home_switch_design()["r_roller"])
        rp_m = (self.az_pinion_r + self.az_module) / 1000
        pinion_j = 0.5 * (7850 * math.pi * rp_m ** 2 * 0.012) * rp_m ** 2
        j_all = j + (self.stepper_rotor_kgm2 + pinion_j) * self.az_ratio ** 2
        w = math.radians(self.stop_hit_deg_s)
        energy_j = 0.5 * j_all * w * w
        r0, r1 = self.stop_pad_r
        area = (r1 - r0) * self.stop_pad_h
        k = self.stop_pad_e_mpa * area / self.stop_pad_t * 1000          # N/m
        x_mm = math.sqrt(2 * energy_j / k) * 1000
        f_impact = k * x_mm / 1000
        r_c = (r0 + r1) / 2
        f_stall = self.stepper_hold_nm * self.az_ratio * self.az_gear_eff / (r_c / 1000)
        f_peak = f_impact + f_stall
        cap_j = 0.5 * k * (self.stop_pad_strain * self.stop_pad_t / 1000) ** 2
        fastest = math.degrees(math.sqrt(2 * cap_j / j_all))
        # Inserts: the force acts tangentially at r_c on the sector's high end (the low end mirrors it).
        lo_end, hi_end = self.az_sector_ends_deg()
        bolts = [(self.az_bolt_r * math.cos(math.radians(a)), self.az_bolt_r * math.sin(math.radians(a)))
                 for a in (90.0 - (self.az_sector_half_deg - 6.0), 90.0, 90.0 + (self.az_sector_half_deg - 6.0))]
        cx, cy = sum(b[0] for b in bolts) / 3, sum(b[1] for b in bolts) / 3
        a = math.radians(hi_end)
        px, py = r_c * math.cos(a), r_c * math.sin(a)
        fx, fy = f_peak * math.sin(a), -f_peak * math.cos(a)                # the pad pushes the end back (clockwise)
        m = (px - cx) * fy - (py - cy) * fx                                  # N mm about the centroid
        r2 = sum((bx - cx) ** 2 + (by - cy) ** 2 for bx, by in bolts)
        insert = max(math.hypot(fx / 3 - m * (by - cy) / r2, fy / 3 + m * (bx - cx) / r2) for bx, by in bolts)
        f_tooth = self.stepper_hold_nm / (self.az_pinion_r / 1000)          # the steel pinion pushes the printed teeth
        y_gear = 0.484 - 2.87 / self.az_gear_teeth
        sigma = f_tooth / (self.az_gear_face_mm * self.az_module * y_gear)
        block_bear = f_peak / 2 / (4.0 * (self.bearing_h - self.az_gear_gap_mm))  # two M4 screws bearing in the block
        return {
            "world_deg": self.az_stop_world_deg(), "last_tooth_deg": last_tooth, "stop_mesh_max_deg": stop_mesh_max,
            "slot_deg": slot_deg, "stop_home_min_deg": -self.az_home_deg + slot_deg + 0.5,
            "pinion_off_deg": hi_end - 90.0,
            "inertia_all_kgm2": j_all, "energy_j": energy_j, "pad_k_n_mm": k / 1000, "pad_x_mm": x_mm,
            "pad_strain": x_mm / self.stop_pad_t, "pad_capacity_j": cap_j, "fastest_hit_deg_s": fastest,
            "force_impact_n": f_impact, "force_stall_n": f_stall, "force_peak_n": f_peak,
            "pad_pressure_mpa": f_peak / area, "insert_n": insert, "stall_tooth_n": f_tooth, "stall_tooth_mpa": sigma,
            "block_bearing_mpa": block_bear,
        }

    def check_az_stops(self, inertia_kgm2: float | None = None) -> list[str]:
        bad = []
        d = self.az_stop_design(inertia_kgm2)
        s = self.az_stop_deg
        if s < self.az_max + self.az_stop_margin_deg:
            bad.append(f"azimuth hard stops at +-{s:g} deg are within {self.az_stop_margin_deg:g} deg of the working range")
        if s < d["stop_home_min_deg"]:
            bad.append(f"azimuth hard stop at -{s:g} deg can land before the home click (needs {d['stop_home_min_deg']:.2f})")
        if s > d["stop_mesh_max_deg"]:
            bad.append(f"azimuth hard stops at +-{s:g} deg leave under {self.az_stop_mesh_pitches:g} tooth pitch of mesh "
                       f"(at most {d['stop_mesh_max_deg']:.2f} deg)")
        if d["pad_strain"] > self.stop_pad_strain:
            bad.append(f"azimuth stop pad compresses {d['pad_strain']:.0%} at {self.stop_hit_deg_s:g} deg/s "
                       f"(allowed {self.stop_pad_strain:.0%})")
        if d["insert_n"] > self.insert_shear_n:
            bad.append(f"azimuth gear sector's worst insert takes {d['insert_n']:.0f} N at a stop "
                       f"(allowed {self.insert_shear_n:g} N)")
        if d["stall_tooth_mpa"] > self.petg_bend_allow_mpa:
            bad.append(f"stalled against a stop, the printed teeth bend at {d['stall_tooth_mpa']:.1f} MPa")
        if max(d["pad_pressure_mpa"], d["block_bearing_mpa"]) > self.petg_bend_allow_mpa:
            bad.append("azimuth stop block or the sector's end face is crushed at a stop")
        r0, r1 = self.stop_pad_r
        rr = self.az_gear_r - 1.25 * self.az_module
        if r1 + 2.0 > rr - 1.0 or r0 - 1.0 < self.home_switch_design()["r_lobe"] + 1.0:
            bad.append("azimuth stop pad is not inside the sector's end face (root circle to cam lobe)")
        if self.stop_pad_h > self.az_gear_face_mm - 1.0:
            bad.append("azimuth stop pad is taller than the sector's face")
        lo, hi = d["world_deg"]
        if min(abs(lo - self.home_sw_deg), abs(hi - self.home_sw_deg)) < 15 or min(abs(lo - 90), abs(hi - 90)) < 25:
            bad.append("an azimuth stop block sits by the home switch or the pinion")
        return bad

    # ---- elevation drive (2026-11-11) -----------------------------------------
    def _rot_pivot(self, x: float, z: float, elev_deg: float) -> tuple[float, float]:
        t = math.radians(elev_deg)
        return x * math.cos(t) - z * math.sin(t), x * math.sin(t) + z * math.cos(t)

    def elev_pin_rel(self, elev_deg: float) -> tuple[float, float]:
        """(x, z) of the actuator pin from the pivot, world frame, with the head tilted `elev_deg` nose up."""
        return self._rot_pivot(self.elev_pin_x, self.elev_pin_z - self.pivot_z_rel, elev_deg)

    def elev_act_len(self, elev_deg: float) -> float:
        """Actuator length, anchor hole to pin hole (mm), measured in its own (x-z) plane."""
        px, pz = self.elev_pin_rel(elev_deg)
        return math.hypot(px - self.elev_anchor_dx, pz - self.elev_anchor_dz)

    def _elevs(self, steps: int = 24) -> list[float]:
        return [self.elev_min + (self.elev_max - self.elev_min) * i / steps for i in range(steps + 1)]

    def elev_hose_moment_nm(self, elev_deg: float) -> float:
        """Nose-up moment (N m) of the hose pull about the pivot: `hose_pull_n` at the socket mouth along the chord to
        the hose's start (the sleeve's lower end, or the outlet). Same taut-string bound as `az_hose_torque_nm`."""
        t = self.sleeve_take_up_design()
        sx, sz = self.hopper_out_x, (t["start_z"] if t else self.hopper_out_z)
        mx, mz = self.mouth_world(elev_deg)
        dx, dz = sx - mx, sz - mz
        n = math.hypot(dx, dz)
        fx, fz = self.hose_pull_n * dx / n, self.hose_pull_n * dz / n
        rx, rz = mx - self.head_x, mz - self.pivot_z
        return (rx * fz - rz * fx) / 1000

    def elevation_drive(self, gravity_nm: dict[float, float]) -> dict:
        """Size the elevation actuator. `gravity_nm` maps elevation (deg) to the head's nose-up gravity moment about
        the pivot (N m), measured from the CAD by `feeder.head_moment`; it is interpolated linearly between the
        measured poses. Push needed at each pose = (gravity + hose) moment over the actuator's lever arm about the
        pivot (the pin's moment arm along the actuator's line), with the hose taut or slack, whichever needs more;
        positive is a push. The window is what a bought
        actuator must span: retracted no longer than the shortest pose, extended no shorter than the longest. Rate is
        degrees per second at `elev_act_speed_mm_s`, from the length's slope with elevation (the slowest pose).
        Inertia is left out: at 20 mm/s the head's angular speed is a few degrees per second."""
        ks = sorted(gravity_nm)

        def g(e: float) -> float:
            for a, b in zip(ks, ks[1:]):
                if a - 1e-9 <= e <= b + 1e-9:
                    return gravity_nm[a] + (gravity_nm[b] - gravity_nm[a]) * (e - a) / (b - a)
            return gravity_nm[ks[0]] if e < ks[0] else gravity_nm[ks[-1]]

        rows = []
        for e in self._elevs():
            px, pz = self.elev_pin_rel(e)
            dx, dz = px - self.elev_anchor_dx, pz - self.elev_anchor_dz
            length = math.hypot(dx, dz)
            ux, uz = dx / length, dz / length
            arm = px * uz - pz * ux          # nose-up moment (m per N, x1000) of a unit push along anchor -> pin
            hose = self.elev_hose_moment_nm(e)
            # the hose may pull anywhere from 0 to hose_pull_n (slack or taut): take the worse end
            push = max((-(g(e) + k * hose) * 1000 / arm for k in (0.0, 1.0)), key=abs)
            h = 0.25
            rate = h / abs(self.elev_act_len(e + h) - self.elev_act_len(e - h)) * 2  # deg per mm
            rows.append({"elev": e, "len_mm": length, "arm_mm": arm, "gravity_nm": g(e),
                         "hose_nm": hose, "push_n": push, "deg_per_mm": rate})
        lens = [r["len_mm"] for r in rows]
        pushes = [r["push_n"] for r in rows]
        peak = max(pushes, key=abs)
        return {
            "rows": rows, "len_min_mm": min(lens), "len_max_mm": max(lens), "travel_mm": max(lens) - min(lens),
            # retracted: no margin at that end, because the actuator's own limit is the safe stop past +45 deg
            "closed_max_mm": min(lens), "closed_min_mm": self.elev_act_len(self.elev_clear_max),
            "extended_min_mm": max(lens) + self.elev_end_mm,
            "push_peak_n": peak, "push_min_n": min(pushes, key=abs), "one_way": all(x > 0 for x in pushes) or all(x < 0 for x in pushes),
            "arm_min_mm": min(abs(r["arm_mm"]) for r in rows), "force_margin": self.elev_act_force_n / abs(peak),
            "full_sweep_s": (max(lens) - min(lens)) / self.elev_act_speed_mm_s,
            "deg_per_s_min": min(r["deg_per_mm"] for r in rows) * self.elev_act_speed_mm_s,
            "deg_per_s_max": max(r["deg_per_mm"] for r in rows) * self.elev_act_speed_mm_s,
            "monotonic": all(b > a for a, b in zip(lens, lens[1:])) or all(b < a for a, b in zip(lens, lens[1:])),
        }


    # ---- shuttle drive (2026-11-11) -------------------------------------------
    @property
    def shuttle_zc(self) -> float:
        """Head-frame z of the shuttle's mid-height: the line its pin and rod work on."""
        return self.shuttle_z0 + self.shuttle_h / 2

    @property
    def shuttle_pin_x(self) -> float:
        """Head-frame x of the shuttle pin with the shuttle retracted (pocket under the column)."""
        return self.shuttle_rear + self.shuttle_pin_back

    @property
    def crank_r(self) -> float:
        return self.feed_stroke / 2

    @property
    def crank_x(self) -> float:
        """Head-frame x of the servo shaft: the crank points back at the retracted dead centre."""
        return self.shuttle_pin_x + self.shuttle_rod_mm + self.crank_r

    @property
    def drive_y0(self) -> float:
        """Outer face of the motor plate (+y), where the drive's layers start."""
        return self.plate_half_y + self.plate_t

    @property
    def servo_top_y(self) -> float:
        return self.drive_y0 + 1.0 + 2 * self.shuttle_rod_t + 1.0 + self.servo_spline_mm

    def shuttle_kinematics(self, theta_deg: float) -> tuple[float, float, float]:
        """(slider pin x, crank pin x, crank pin z) in the head frame at crank angle `theta_deg` (0 = retracted dead
        centre, 180 = forward)."""
        t = math.radians(theta_deg)
        r, L = self.crank_r, self.shuttle_rod_mm
        cx, cz = self.crank_x - r * math.cos(t), self.shuttle_zc + r * math.sin(t)
        return cx - math.sqrt(L * L - (r * math.sin(t)) ** 2), cx, cz

    def shuttle_drive(self, shuttle_kg: float, steps: int = 180) -> dict:
        """Size the servo slider-crank that moves the shuttle (2026-11-11).

        Load on the shuttle, each way: the column of balls standing on its top (sleeve, hose and column full,
        single file, plus a tub's depth over the outlet; all their weight on the bottom ball, conservative) at
        `feed_mu_ball`, the shuttle and one ball sliding at `feed_mu_slide`, and their weight along the path uphill
        (forward at the top tilt, back at the bottom tilt). The pin sits off the shuttle's centre line, so the push
        cocks it between the head plates: a drawer of guide length l pushed at offset e needs
        1 / (1 - 2 mu e / l) more force and jams when e >= l / (2 mu). The rod's angle presses the shuttle on its
        floor or roof, adding mu tan(phi). Torque at the crank from virtual work, T = F dx/dtheta, and the stroke time
        from a linear torque-speed line (no-load speed at zero torque, stopped at stall). Every friction, mass and
        servo figure is an assumption to replace with a measurement."""
        t = self.sleeve_take_up_design() or {}
        stack_mm = (t.get("tube_mm", 0.0) + t.get("hose_cut_mm", self.hose_len)
                    + (self.col_top + self.socket_h - (self.shuttle_z0 + self.shuttle_h)) + self.tub_h)
        balls = stack_mm / self.ball_d
        gN = 9.81
        ball_n = self.ball_g / 1000 * gN
        column_n = balls * ball_n
        e = self.drive_y0 + 1.0 + self.shuttle_rod_t / 2
        guide = self.feed_col_x + 60.0 - self.shuttle_rear
        mu = self.feed_mu_slide
        cock = 2 * mu * e / guide
        friction = self.feed_mu_ball * column_n + mu * (shuttle_kg * gN + ball_n)
        up_fwd = (shuttle_kg * gN + ball_n) * math.sin(math.radians(max(0.0, self.elev_max)))
        up_back = shuttle_kg * gN * math.sin(math.radians(max(0.0, -self.elev_min)))
        w0 = math.radians(60.0) / self.servo_s_per_60
        r, L = self.crank_r / 1000, self.shuttle_rod_mm / 1000
        out = {}
        for way, load in (("fwd", friction + up_fwd), ("back", friction + up_back)):
            peak_t = peak_f = 0.0
            time = 0.0
            dth = math.radians(self.servo_range_deg) / steps
            for i in range(steps):
                th = (i + 0.5) * dth
                s = r * math.sin(th)
                root = math.sqrt(L * L - s * s)
                phi = math.asin(s / L)
                denom = 1 - cock - mu * math.tan(phi)
                f = load / denom if denom > 0 else math.inf
                dxdth = r * math.sin(th) + r * r * math.sin(th) * math.cos(th) / root
                torque = f * abs(dxdth)
                peak_t, peak_f = max(peak_t, torque), max(peak_f, f)
                frac = torque / self.servo_stall_nm
                time += dth / (w0 * (1 - frac)) if frac < 1 else math.inf
            out[way] = {"load_n": load, "peak_force_n": peak_f, "peak_torque_nm": peak_t, "stroke_s": time}
        drop_mm = self.shuttle_h
        drop_s = math.sqrt(2 * drop_mm / 1000 / (gN * math.cos(math.radians(max(abs(self.elev_min), abs(self.elev_max))))))
        peak = max(out["fwd"]["peak_torque_nm"], out["back"]["peak_torque_nm"])
        cycle = out["fwd"]["stroke_s"] + self.feed_dwell_s + out["back"]["stroke_s"] + drop_s
        x_ret = self.shuttle_kinematics(0)[0]
        x_fwd = self.shuttle_kinematics(180)[0]
        return {"stack_balls": balls, "column_n": column_n, "offset_mm": e, "guide_mm": guide,
                "jam_offset_mm": guide / (2 * mu), "cock_factor": 1 / (1 - cock),
                "rod_angle_max_deg": math.degrees(math.asin(self.crank_r / self.shuttle_rod_mm)),
                "stroke_mm": x_fwd - x_ret, "fwd": out["fwd"], "back": out["back"], "peak_torque_nm": peak,
                "torque_margin": self.servo_stall_nm / peak if peak > 0 else math.inf,
                "no_load_stroke_s": math.radians(self.servo_range_deg) / w0, "drop_s": drop_s, "cycle_s": cycle,
                "balls_per_min": 60 / cycle,
                "actuator_cycle_s": 2 * self.feed_stroke / self.elev_act_speed_mm_s + self.feed_dwell_s + drop_s}

    def check_shuttle_drive(self, shuttle_kg: float) -> list[str]:
        bad = []
        d = self.shuttle_drive(shuttle_kg)
        if abs(d["stroke_mm"] - self.feed_stroke) > 0.01:
            bad.append(f"shuttle crank gives {d['stroke_mm']:.1f} mm of stroke, not {self.feed_stroke:g}")
        if d["offset_mm"] >= d["jam_offset_mm"] / 2:
            bad.append(f"shuttle pin is {d['offset_mm']:.0f} mm off the shuttle's centre line; it jams at "
                       f"{d['jam_offset_mm']:.0f} mm (2x wanted)")
        if d["torque_margin"] < self.servo_torque_factor:
            bad.append(f"shuttle servo needs {d['peak_torque_nm']:.2f} N m against {self.servo_stall_nm:g} N m stall "
                       f"({self.servo_torque_factor:g}x wanted)")
        if d["cycle_s"] > self.feed_interval_min_s:
            bad.append(f"shuttle cycle {d['cycle_s']:.2f} s is longer than the {self.feed_interval_min_s:g} s drill interval")
        if self.shuttle_pin_x - self.shuttle_pin_d < self.shuttle_rear + 4 or \
                self.shuttle_pin_x + self.shuttle_pin_d > self.feed_col_x - self.hole_d / 2:
            bad.append("shuttle pin is not in the shuttle's solid rear")
        if self.shuttle_pin_x - self.shuttle_pin_d < self.head_x0 + 6:
            bad.append("shuttle slot runs off the motor plate's rear edge")
        if self.crank_x + self.servo_flange_l > self.head_x1:
            bad.append("shuttle servo is off the front of the motor plate")
        return bad

    # ---- cables to the head (2026-11-13) ----------------------------------------
    def bundle_od(self, wires: tuple) -> float:
        """Diameter (mm) of a loose round bundle of `wires` ((name, count, AWG), ...) at `bundle_fill`."""
        area = sum(n * AWG_OD_MM[g] ** 2 for _, n, g in wires)
        return math.sqrt(area / self.bundle_fill)

    @property
    def cable_bend_r(self) -> float:
        """Smallest bend radius of the moving loop: the thickest head wire's, since loose wires bend one by one."""
        return self.cable_bend_factor * max(AWG_OD_MM[g] for _, _, g in self.head_wires)

    def elev_act_limits(self) -> tuple[float, float]:
        """Elevation (deg) at the actuator's own limits: fully extended (nose down) and fully retracted (nose up). A
        runaway or a hand on the head can drive it anywhere between, so the cables must reach both, not only the
        +-range the drills use."""
        def at(length: float) -> float:
            lo, hi = -80.0, 80.0                     # the actuator shortens as the nose rises
            for _ in range(60):
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if self.elev_act_len(mid) > length else (lo, mid)
            return (lo + hi) / 2
        return at(self.elev_act_closed + self.elev_act_stroke), at(self.elev_act_closed)

    def _loop_shape(self) -> tuple:
        rb = self.bundle_od(self.head_wires) / 2 + self.cable_clear_mm
        stand = tuple((x, z, 5.0) for x, z in ((-215.0, -150.0), (95.0, -150.0)))   # feeder._standoffs, lower pair
        shape = (self.turntable_top - self.pivot_z, 8.0, self.head_x0, self.head_x1,
                 self.floor_top - self.feed_floor_t, self.head_gap_axis * -1, self.wheel_head_d / 2, self.pivot_z_rel, *stand)
        return shape, rb

    def cable_loop_poses(self) -> list[float]:
        ext, ret = self.elev_act_limits()
        return [ext, self.elev_min, 0.0, 15.0, 30.0, self.elev_max, ret]

    def cable_loop_ends(self, elev_deg: float) -> tuple[tuple, tuple, tuple]:
        """Pivot-relative (x, z) of the gland exit and the head clip, and the direction from the clip into the loop
        (`cable_clip_dir_deg` in the head frame, turned with the head), with the head at `elev_deg`."""
        c, s = math.cos(math.radians(elev_deg)), math.sin(math.radians(elev_deg))
        f = (0.0, self.turntable_top + self.cable_gland_h - self.pivot_z)
        hx, hz = self.cable_clip_x, self.cable_clip_z - self.pivot_z_rel
        dx, dz = math.cos(math.radians(self.cable_clip_dir_deg)), math.sin(math.radians(self.cable_clip_dir_deg))
        return f, (hx * c - hz * s, hx * s + hz * c), (dx * c - dz * s, dx * s + dz * c)

    def cable_loop_design(self) -> dict | None:
        """Size the free loop between the turntable gland and the head clip (2026-11-13).

        Each pose, from the actuator's extended limit to its retracted limit, gets the range of loop lengths that fit
        (`_cable_loop_range`); the wire is cut once, so it must fit every pose. Returns the common window, the cut
        length in its middle, the curve each pose takes at that length (pivot-relative control points), the loop's
        furthest reach from the turntable axis and its lowest point. None if no single length fits every pose."""
        shape, rb = self._loop_shape()
        r_min = self.cable_bend_r
        ranges = {}
        for e in self.cable_loop_poses():
            f, h, d = self.cable_loop_ends(e)
            ranges[e] = _cable_loop_range(f, h, d, e, shape, r_min, rb)
            if ranges[e] is None:
                return None
        lo = max(r[0] for r in ranges.values())
        hi = min(r[1] for r in ranges.values())
        if lo > hi:
            return {"ranges": ranges, "window": None, "rb": rb, "r_min": r_min}
        cut = (lo + hi) / 2
        curves = {}
        for e in ranges:
            f, h, d = self.cable_loop_ends(e)
            curves[e] = _cable_loop_range(f, h, d, e, shape, r_min, rb, target=cut)[2]
        def pts(ctrl, n=32):
            out = []
            for k in range(n + 1):
                t = k / n
                u = 1 - t
                out.append(tuple(u ** 3 * ctrl[0][m] + 3 * u * u * t * ctrl[1][m] + 3 * u * t * t * ctrl[2][m] + t ** 3 * ctrl[3][m]
                                 for m in (0, 1)))
            return out
        reach = max(abs(q[0]) for _, c in curves.values() for q in pts(c))
        low = min(q[1] for _, c in curves.values() for q in pts(c))
        return {"ranges": ranges, "window": (lo, hi), "cut_mm": cut, "curves": curves, "rb": rb, "r_min": r_min,
                "reach_mm": reach, "lowest_z": self.pivot_z + low, "fit_err_mm": max(abs(l - cut) for l, _ in curves.values())}

    def cable_twist(self) -> dict:
        """The bundle's run on the turntable axis (2026-11-13): it twists by the head's azimuth between the fixed clamp
        under the mast plate and the gland on the turntable plate. Returns the run's length, the twist rate at the
        hard stops' reach, the bundle's diameter there (head and turntable wires) and the room it has in the plates'
        40 mm holes and the bearing's open centre."""
        run = self.turntable_top + self.cable_gland_h - self.cable_clamp_z
        od = self.bundle_od(self.head_wires + self.turntable_wires)
        rate = self.az_reach_deg / (run / 1000) if run > 0 else math.inf
        # outer wire's stretch at that twist: a helix of radius od/2 over the run
        helix = math.sqrt(1 + (od / 2 * math.radians(self.az_reach_deg) / run) ** 2) - 1 if run > 0 else math.inf
        return {"run_mm": run, "rate_deg_m": rate, "od_mm": od, "hole_gap_mm": (40.0 - od) / 2,
                "bore_gap_mm": (self.bearing_bore_d - od) / 2, "helix_strain": helix,
                "clamp_below_stepper_mm": self.mast_top_z - self.stepper_body_mm - self.cable_clamp_z}

    def servo_supply(self, peak_torque_nm: float, cut_mm: float | None = None) -> dict:
        """The shuttle servo's 6 V supply (2026-11-13). The buck sits on the deck with the ESP32, so its return shares
        the ESP32's ground. At stall the servo draws `servo_stall_a`; the leads' resistance takes some of the voltage,
        and the return's drop lifts the servo's ground above the ESP32's, which eats into the 3.3 V signal. Run
        length: deck to the axis, up the axis to the gland, the free loop, and the head from the clip to the servo.
        Stall torque is taken as proportional to the terminal voltage below `servo_stall_v` and no higher above it
        (conservative). Returns every AWG's result and the chosen gauge's."""
        cut = cut_mm if cut_mm is not None else 400.0
        servo_x, servo_z = self.crank_x, self.shuttle_zc
        head = abs(self.cable_clip_x - servo_x) + abs(self.cable_clip_z - servo_z) + self.servo_top_y
        # deck to the clamp along the routed deck-side run (2026-11-14; a straight deck-to-axis estimate until then), the
        # twisting run up to the gland, the free loop, and the head
        run = (self.deck_cable_route()["to_clamp_mm"] + self.cable_twist()["run_mm"] + cut + head) / 1000
        r_motor = self.servo_supply_v / self.servo_stall_a
        rows = {}
        for awg, ohm in sorted(AWG_OHM_PER_M.items()):
            r_lead = run * ohm
            i = self.servo_supply_v / (r_motor + 2 * r_lead)
            v_term = i * r_motor
            ground = i * r_lead
            torque = self.servo_stall_nm * min(1.0, v_term / self.servo_stall_v)
            rows[awg] = {"v_term": v_term, "ground_shift_v": ground, "signal_high_v": self.logic_high_v - ground,
                         "stall_nm": torque, "torque_margin": torque / peak_torque_nm if peak_torque_nm > 0 else math.inf}
        return {"run_m": run, "stall_a": self.servo_stall_a, "awg": rows, "chosen": rows[self.servo_lead_awg],
                "buck_w": self.servo_supply_v * self.servo_stall_a}

    def check_cables(self, peak_servo_nm: float | None = None) -> list[str]:
        bad = []
        t = self.cable_twist()
        if t["rate_deg_m"] > self.cable_twist_deg_m:
            bad.append(f"cable twists {t['rate_deg_m']:.0f} deg/m on the turntable axis at the {self.az_reach_deg:.1f} deg reach "
                       f"({self.cable_twist_deg_m:g} allowed): lower the clamp")
        if t["hole_gap_mm"] < 2 or t["bore_gap_mm"] < 2:
            bad.append(f"the {t['od_mm']:.1f} mm bundle does not pass the plates' 40 mm holes or the bearing's open centre")
        if t["clamp_below_stepper_mm"] < 10:
            bad.append("the axis cable clamp is not below the azimuth stepper")
        d = self.cable_loop_design()
        if d is None or d["window"] is None:
            bad.append("no single cable length makes a loop from the turntable gland to the head clip at every elevation "
                       "between the actuator's limits")
        if peak_servo_nm is not None:
            s = self.servo_supply(peak_servo_nm, d["cut_mm"] if d and d["window"] else None)["chosen"]
            if s["torque_margin"] < self.servo_torque_factor:
                bad.append(f"shuttle servo at {s['v_term']:.2f} V on stall has {s['torque_margin']:.2f}x the torque it needs "
                           f"({self.servo_torque_factor:g}x wanted): heavier servo leads")
            if s["signal_high_v"] < self.servo_vih + 0.3:
                bad.append(f"servo ground rises {s['ground_shift_v']:.2f} V at stall, leaving the signal {s['signal_high_v']:.2f} V "
                           f"against a {self.servo_vih:g} V threshold: heavier servo leads")
        bad += self.check_elev_lead()
        bad += self.check_elev_pot()
        return bad

    # ---- the elevation actuator's lead (2026-11-14) ---------------------------------
    @property
    def elev_lead_od(self) -> float:
        return self.bundle_od(self.turntable_wires)

    @property
    def elev_lead_bend_r(self) -> float:
        """Free span's smallest bend radius: `cable_bend_factor` times its thickest wire (the actuator's 18 AWG)."""
        return self.cable_bend_factor * max(AWG_OD_MM[g] for _, _, g in self.turntable_wires)

    @property
    def elev_lead_static_r(self) -> float:
        """Tied run's bend radius out of the gland: `deck_static_bend_factor` times its thickest wire, 12 mm at least."""
        return max(12.0, self.deck_static_bend_factor * max(AWG_OD_MM[g] for _, _, g in self.turntable_wires))

    @property
    def elev_cheek_outer_y(self) -> float:
        return -(self.plate_half_y + self.plate_t + self.cheek_gap + self.plate_t)

    def elev_lead_hole(self) -> tuple[float, float, float]:
        """World (x, y, z) of the lead's centre where it leaves the guard-side cheek's grommet hole (the cheek's outer
        face). Its height is the gland's top plus the tied run's bend: the run leaves the gland straight up and turns
        -y across the turntable at that height."""
        return (self.head_x + self.elev_lead_hole_dx, self.elev_cheek_outer_y,
                self.turntable_top + self.cable_gland_h + self.elev_lead_static_r)

    def elev_lead_fixed_path(self) -> list[tuple[float, float, float]]:
        """Corner points of the tied run: up out of the gland's bore on its -y wall, a corner at the hole's height
        (rounded to `elev_lead_static_r`), across -y through the cheek to its outer face."""
        bore = self.bundle_od(self.head_wires + self.turntable_wires) + 1.0
        y0 = -(bore / 2 - self.elev_lead_od / 2)
        hx, hy, hz = self.elev_lead_hole()
        z0 = self.turntable_top + self.cable_gland_h
        return [(self.head_x, y0, z0), (self.head_x, y0, hz), (hx, hy, hz)] if hx == self.head_x else \
            [(self.head_x, y0, z0), (self.head_x, y0, hz), (hx, y0 - 1e-3, hz), (hx, hy, hz)]

    def elev_lead_tie(self, elev_deg: float) -> tuple[tuple, tuple, tuple]:
        """With the head at `elev_deg`: world (x, y, z) of the lead's centre at the tie on the actuator's body, the
        unit vector it leaves the body along (the body's front normal, in its x-z plane), and the body's axis as two
        world (x, z) points (eye end, far end of the body)."""
        ax, az = self.head_x + self.elev_anchor_dx, self.pivot_z + self.elev_anchor_dz
        px, pz = self.elev_pin_rel(elev_deg)
        px, pz = self.head_x + px, self.pivot_z + pz
        ln = math.hypot(px - ax, pz - az)
        ux, uz = (px - ax) / ln, (pz - az) / ln
        nx, nz = uz, -ux                                      # the normal on the pivot's (+x) side
        if nx < 0:
            nx, nz = -nx, -nz
        cx, cz = ax + ux * self.elev_lead_tie_mm, az + uz * self.elev_lead_tie_mm
        r = self.elev_act_r + self.elev_lead_od / 2
        eye = 12.0                                            # feeder.ELEV_EYE_MM
        body = ((ax + ux * eye, az + uz * eye), (ax + ux * (self.elev_act_closed - eye), az + uz * (self.elev_act_closed - eye)))
        return (cx + nx * r, self.elev_act_y, cz + nz * r), (nx, 0.0, nz), body

    def _elev_lead_keep_out(self, elev_deg: float) -> tuple:
        _, _, body = self.elev_lead_tie(elev_deg)
        yo = self.elev_cheek_outer_y
        foot_y = yo - 20.0                                     # feeder.cheek_foot: 20 mm deep outboard of the cheek
        feet = tuple((self.head_x + sx * 35.0 - 12.0, self.head_x + sx * 35.0 + 12.0, foot_y, self.turntable_top + 60.0)
                     for sx in (-1, 1))
        anchor = (self.head_x + self.elev_anchor_dx, self.pivot_z + self.elev_anchor_dz)
        edge = self.elev_act_y - self.elev_act_r - self.elev_lead_out_mm
        return (self.turntable_top, yo, edge, *feet, ("act", self.elev_act_y, self.elev_act_r, body[0], body[1], anchor, 10.0))

    def elev_lead_poses(self) -> list[float]:
        return self.cable_loop_poses()

    def elev_lead_range(self, elev_deg: float, target: float | None = None) -> tuple | None:
        hole = self.elev_lead_hole()
        tie, n, _ = self.elev_lead_tie(elev_deg)
        rb = self.elev_lead_od / 2 + self.cable_clear_mm
        return _lead_range(hole, (0.0, -1.0, 0.0), tie, n, self._elev_lead_keep_out(elev_deg), self.elev_lead_bend_r, rb,
                           target=target)

    def elev_lead_design(self) -> dict:
        """Size the actuator's free lead (2026-11-14) as `cable_loop_design` sizes the head's loop: every pose from the
        actuator's extended to its retracted limit gets the range of lengths that fit (`_lead_range`), the cut is the
        middle of the common window, and each pose's curve at that length is kept. Also the tied run's length and the
        whole lead from the H-bridge on the deck, and its drop at the actuator's stall."""
        ranges = {e: self.elev_lead_range(e) for e in self.elev_lead_poses()}
        out = {"ranges": ranges, "window": None, "r_min": self.elev_lead_bend_r, "od_mm": self.elev_lead_od,
               "rb": self.elev_lead_od / 2 + self.cable_clear_mm}
        pts = self.elev_lead_fixed_path()
        r = self.elev_lead_static_r
        out["fixed_mm"] = sum(math.dist(pts[k], pts[k + 1]) for k in range(len(pts) - 1)) - 2 * r + math.pi / 2 * r
        ties = [self.elev_lead_tie(e)[0] for e in ranges]
        out["tie_travel_mm"] = max(math.dist(a, b) for a in ties for b in ties)
        if any(v is None for v in ranges.values()):
            return out
        lo, hi = max(v[0] for v in ranges.values()), min(v[1] for v in ranges.values())
        if lo > hi:
            return out
        cut = (lo + hi) / 2
        curves = {e: self.elev_lead_range(e, target=cut)[2] for e in ranges}
        run_m = (self.deck_cable_route()["to_clamp_mm"] + self.cable_twist()["run_mm"] + out["fixed_mm"] + cut
                 + self.elev_lead_tie_mm) / 1000
        g = self.turntable_wires[0][2]
        drop = self.elev_act_stall_a * 2 * run_m * AWG_OHM_PER_M[g]
        out.update({"window": (lo, hi), "cut_mm": cut, "curves": curves,
                    "fit_err_mm": max(abs(c[0] - cut) for c in curves.values()),
                    "run_m": run_m, "motor_awg": g, "stall_drop_v": drop, "stall_drop_frac": drop / self.supply_v})
        return out

    def elev_lead_curve(self, elev_deg: float) -> tuple | None:
        """Control points of the free span at the cut length with the head at `elev_deg` (any elevation between the
        actuator's limits, not only the design poses), or None if the cut does not fit there."""
        d = self.elev_lead_design()
        if d["window"] is None:
            return None
        if elev_deg in d["curves"]:
            return d["curves"][elev_deg][1]
        r = self.elev_lead_range(elev_deg, target=d["cut_mm"])
        if r is None or not r[0] - 1e-6 <= d["cut_mm"] <= r[1] + 1e-6:
            return None
        return r[2][1]

    def check_elev_lead(self) -> list[str]:
        """The hole's place first (cheap; a hole on a foot stops there), then the free span's fit and the motor pair."""
        bad = []
        hx, hy, hz = self.elev_lead_hole()
        rh = self.elev_lead_hole_d / 2
        if rh < self.elev_lead_od / 2 + 1.5:
            bad.append(f"the cheek's {self.elev_lead_hole_d:g} mm grommet hole is too small for the {self.elev_lead_od:.1f} mm lead")
        if hz - rh - self.turntable_top < 8.0:
            bad.append("the lead's grommet hole is too close to the cheek's bottom edge")
        for sx in (-1, 1):   # the cheek's feet (24 mm wide at 35 mm either side) and their M4 bolts, 30 mm up
            fx = self.head_x + sx * 35.0
            if abs(hx - fx) < 12.0 + rh + 3.0:
                bad.append("the lead's grommet hole is on a cheek foot or its bolt")
        if bad:
            return bad
        d = self.elev_lead_design()
        if d["window"] is None:
            bad.append("no single length makes the elevation actuator's lead from the cheek's grommet to its tie on the "
                       "body at every elevation between the actuator's limits: move the tie (elev_lead_tie_mm) or the hole")
            return bad
        g = d["motor_awg"]
        if AWG_AMPS[g] < self.elev_act_stall_a - 1e-9:
            bad.append(f"elevation actuator's motor wires ({g} AWG, {AWG_AMPS[g]:g} A) are under its {self.elev_act_stall_a:g} A stall")
        if d["stall_drop_frac"] > self.lift_drop_frac:
            bad.append(f"elevation actuator's lead ({g} AWG, {d['run_m']:.2f} m) drops {d['stall_drop_v']:.2f} V at its "
                       f"{self.elev_act_stall_a:g} A stall, over {self.lift_drop_frac:.0%} of {self.supply_v:g} V")
        return bad

    # ---- the pot's pickup from the motor pair (2026-11-14) -----------------------------
    def _elev_pot_node(self, filter_nf=None, pot_ohm=None, mutual_pf_m=None) -> dict | None:
        d = self.elev_lead_design()
        if d["window"] is None:
            return None
        run = d["run_m"]
        cf = (self.elev_pot_filter_nf if filter_nf is None else filter_nf) * 1e-9
        r_pot = self.elev_pot_ohm if pot_ohm is None else pot_ohm
        cm = (self.elev_lead_mutual_pf_m if mutual_pf_m is None else mutual_pf_m) * run * 1e-12
        c = cf + self.elev_lead_self_pf_m * run * 1e-12 + self.elev_adc_pin_pf * 1e-12
        v = self.battery_v_max
        r_th = 1.0 / (4.0 / r_pot + 1.0 / self.elev_pot_pulldown_ohm)
        return {"run_m": run, "cm": cm, "c": c, "v": v, "a": v * cm / (c + cm), "r_th": r_th, "tau": r_th * (c + cm),
                "period": 1.0 / self.elev_pwm_hz}

    @staticmethod
    def _elev_pot_levels(n: dict, duty: float) -> tuple[float, float]:
        """Steady-state error (V) just after the rising edge and just after the falling edge at `duty`."""
        if not 0 < duty < 1:
            return 0.0, 0.0
        k1, k2 = math.exp(-duty * n["period"] / n["tau"]), math.exp(-(1 - duty) * n["period"] / n["tau"])
        e0 = n["a"] * (1 - k2) / (1 - k1 * k2)
        return e0, e0 * k1 - n["a"]

    def elev_pot_error_v(self, duty: float, phase: float, filter_nf=None, pot_ohm=None, mutual_pf_m=None) -> float:
        """The wiper node's error (V) at `phase` (0..1 of a PWM period from the rising edge) with the H-bridge at
        `duty` (its sign only picks which motor wire toggles), the capacitive term of `elev_pot_pickup`. For the
        firmware simulation (tests/pot_pickup_sweep.py)."""
        n = self._elev_pot_node(filter_nf, pot_ohm, mutual_pf_m)
        duty = abs(duty)
        if n is None or not 0 < duty < 1:
            return 0.0
        e0, e1 = self._elev_pot_levels(n, duty)
        ph = phase % 1.0
        if ph < duty:
            return e0 * math.exp(-ph * n["period"] / n["tau"])
        return e1 * math.exp(-(ph - duty) * n["period"] / n["tau"])

    def elev_pot_pickup(self, filter_nf: float | None = None, pot_ohm: float | None = None,
                        mutual_pf_m: float | None = None) -> dict | None:
        """What the actuator's PWM puts on the pot reading (2026-11-14). The motor pair and the three pot wires share
        `elev_lead_design()["run_m"]` from the H-bridge to the actuator. Sign-magnitude drive: at each PWM edge one motor
        wire steps by the pack voltage V, pushing a charge V Cm onto the wiper node (Cm = the mutual capacitance along the
        run), whose capacitance to ground C is the filter, the pin and the wiper wire's capacitance to the pot's own supply
        wires. The step is a = V Cm / (C + Cm) (edges faster than the node's time constant: conservative). Between edges
        the node returns to the wiper's true voltage through the wiper's source resistance (the pot's two halves in
        parallel, worst at mid-travel R/4, in parallel with the pull-down) with tau = R C. In the steady state the error
        just after the rising edge is e0 = a (1 - k2) / (1 - k1 k2), just after the falling edge e0 k1 - a (k1, k2 the
        decays over the on- and off-times); its time average is zero, so many readings at random phase average out,
        but one reading per tick can land anywhere. Every duty from the loop's minimum to just under 1 is tried. The
        magnetic term (the motor current's ripple slope through the mutual inductance, V / L at most) is added after
        the filter's attenuation at the PWM frequency. Returns None when the lead has no cut length."""
        n = self._elev_pot_node(filter_nf, pot_ohm, mutual_pf_m)
        if n is None:
            return None
        run, cm, c, v, a, r_th, tau, period = (n[k] for k in ("run_m", "cm", "c", "v", "a", "r_th", "tau", "period"))
        mm_per_v = self.elev_act_stroke / self.elev_pot_supply_v
        worst = {"err_v": 0.0}
        thr = self.elev_pot_err_frac * self.elev_deadband_mm / mm_per_v
        bad_frac = 0.0                    # share of a period a single reading would be off by more than that
        for k in range(36, 100):          # duty 0.36 (just over the firmware's min_duty) to 0.99
            duty = k / 100
            e0, e1 = self._elev_pot_levels(n, duty)
            t_hi = min(tau * math.log(e0 / thr), duty * period) if e0 > thr else 0.0
            t_lo = min(tau * math.log(-e1 / thr), (1 - duty) * period) if -e1 > thr else 0.0
            bad_frac = max(bad_frac, (t_hi + t_lo) / period)
            if max(e0, -e1) > worst["err_v"]:
                worst = {"duty": duty, "err_v": max(e0, -e1), "pp_v": e0 - e1, "e0_v": e0, "e1_v": e1}
        m = self.elev_lead_mutual_nh_m * run * 1e-9
        v_ind = m * v / self.elev_act_l_h                       # before the filter (largest at a low duty)
        v_ind_f = v_ind / math.sqrt(1 + (2 * math.pi * self.elev_pwm_hz * tau) ** 2)
        err_v = worst["err_v"] + v_ind_f / 2
        pp_v = worst["pp_v"] + v_ind_f
        rail = a > self.elev_pot_supply_v                       # a step that size leaves the ADC's range from anywhere
        return {"run_m": run, "cm_pf": cm * 1e12, "c_nf": c * 1e9, "edge_v": v, "step_v": a, "r_th_ohm": r_th,
                "tau_us": tau * 1e6, "duty": worst["duty"], "err_v": err_v, "pp_v": pp_v, "ind_v": v_ind,
                "ind_filtered_v": v_ind_f, "err_mm": err_v * mm_per_v, "pp_mm": pp_v * mm_per_v,
                "lag_mm": tau * self.elev_fw_speed_mm_s, "settle_ms": 5 * tau * 1e3, "clips_rail": rail,
                "bad_read_frac": bad_frac}

    def check_elev_pot(self) -> list[str]:
        bad = []
        p = self.elev_pot_pickup()
        if p is None:
            return bad                    # check_elev_lead already says the lead has no length
        fix = "a larger capacitor from GPIO 39 to GND (elev_pot_filter_nf), or a separate shielded pot cable"
        if p["err_mm"] > self.elev_pot_err_frac * self.elev_deadband_mm + 1e-9:
            bad.append(f"the actuator's PWM puts up to {p['err_v'] * 1e3:.1f} mV ({p['err_mm']:.2f} mm of stroke) on one pot "
                       f"reading, over {self.elev_pot_err_frac:.0%} of the {self.elev_deadband_mm:g} mm deadband: {fix}")
        if p["pp_mm"] > self.elev_stall_mm - 1e-9:
            bad.append(f"pot readings swing {p['pp_mm']:.2f} mm with the PWM phase, at least the {self.elev_stall_mm:g} mm the "
                       f"stall check needs to see: a jammed actuator would never fault: {fix}")
        if p["lag_mm"] > self.elev_pot_lag_frac * self.elev_deadband_mm + 1e-9:
            bad.append(f"the pot filter's {p['tau_us'] / 1e3:.1f} ms time constant lags the moving actuator by "
                       f"{p['lag_mm']:.2f} mm, over {self.elev_pot_lag_frac:.0%} of the deadband: a smaller filter capacitor")
        return bad

    # ---- deck-side cable run (2026-11-14) ------------------------------------------
    @property
    def deck_cable_y(self) -> float:
        """The run's centre line (y) on the deck and up the post: on the saddles' base plates against the +y rear
        mast post's inner face."""
        od = self.bundle_od(self.head_wires + self.turntable_wires + self.stepper_wires + self.lift_wires)
        return self.post_half_y - self.rail_w - self.deck_saddle_base - od / 2

    @property
    def deck_cable_end_z(self) -> float:
        """Where the drawn run stops, 1 mm under the axis clamp's bore (the bundle carries on up through it)."""
        return self.cable_clamp_z - 11.0

    def deck_cable_paths(self) -> dict[str, tuple]:
        """Corner points (world x, y, z) of the three fixed runs, before their corners are rounded:
        "main" from the electronics to the axis clamp's underside, "stepper" from the stepper's underside to the main
        run under the crossbar, "lift" from the main run on the deck to the lift gearmotor's back end."""
        dt = self.rail_top + self.plate_t                     # deck top
        y = self.deck_cable_y
        r = self.bundle_od(self.head_wires + self.turntable_wires + self.stepper_wires + self.lift_wires) / 2 + self.deck_saddle_base
        zl = self.deck_cable_z_low
        post_x = self.head_x - self.post_dx                   # rear mast posts' centre (x), the crossbar's too
        x0 = self.electronics_x + 40.0
        main = ((x0, y, dt + r), (post_x, y, dt + r), (post_x, y, zl), (post_x, 0.0, zl), (self.head_x, 0.0, zl),
                (self.head_x, 0.0, self.deck_cable_end_z))
        sx = self.head_x
        sy = self.az_centre_dist
        stepper = ((sx, sy, self.mast_top_z - self.stepper_body_mm - 2.0), (sx, sy, zl), (post_x + 6.0, sy, zl))
        rl = self.bundle_od(self.lift_wires) / 2
        ly = self.lift_y + self.lift_shaft_geometry()["motor_face_y"] + self.lift_gm_len  # gearmotor's back end
        lx = self.lift_x_pulley
        yb = (ly + self.base_half_w) / 2                     # between its back and the +y drive bracket
        xg = post_x - self.rail_w / 2 - 10.0                  # the gap between the deck's front edge and the rear mast rail
        y_turn = self.base_half_w - self.rail_w - 20.0        # inside the side rail
        z_motor = self.lift_z_bottom
        lift = ((post_x - 60.0, y, dt + rl), (post_x - 60.0, y_turn, dt + rl), (xg, y_turn, dt + rl), (xg, y_turn, z_motor),
                (xg, yb, z_motor), (lx, yb, z_motor))
        return {"main": main, "stepper": stepper, "lift": lift}

    @staticmethod
    def _rounded(pts: tuple, rad: float, n_arc: int = 6) -> tuple[list, float, float]:
        """`pts` with every inner corner replaced by an arc of radius `rad` tangent to both legs (points along it).
        Returns (points, length along the rounded path, the shortest leg left straight)."""
        def sub(a, b):
            return tuple(a[i] - b[i] for i in range(3))
        def norm(v):
            m = math.sqrt(sum(c * c for c in v))
            return (tuple(c / m for c in v) if m > 1e-12 else v), m
        out = [pts[0]]
        length = 0.0
        prev = pts[0]
        straight_min = math.inf
        for k in range(1, len(pts) - 1):
            a, b, c = pts[k - 1], pts[k], pts[k + 1]
            u, _ = norm(sub(b, a))
            w, _ = norm(sub(c, b))
            cosang = max(-1.0, min(1.0, sum(u[i] * w[i] for i in range(3))))
            turn = math.acos(cosang)
            if turn < 1e-9:
                continue
            t = rad * math.tan(turn / 2)
            p0 = tuple(b[i] - u[i] * t for i in range(3))
            p1 = tuple(b[i] + w[i] * t for i in range(3))
            leg = norm(sub(p0, prev))[1] if p0 != prev else 0.0
            straight_min = min(straight_min, leg)
            length += leg
            # arc centre: from p0 along the bisector direction toward the inside
            bis, _ = norm(tuple(w[i] - u[i] for i in range(3)))
            centre = tuple(b[i] + bis[i] * rad / math.cos(turn / 2) for i in range(3))
            v0, _ = norm(sub(p0, centre))
            v1, _ = norm(sub(p1, centre))
            for j in range(n_arc + 1):
                f = j / n_arc
                # slerp between v0 and v1
                om = turn
                s0, s1 = math.sin((1 - f) * om) / math.sin(om), math.sin(f * om) / math.sin(om)
                out.append(tuple(centre[i] + rad * (s0 * v0[i] + s1 * v1[i]) for i in range(3)))
            length += rad * turn
            prev = p1
        leg = norm(sub(pts[-1], prev))[1]
        straight_min = min(straight_min, leg)
        length += leg
        out.append(pts[-1])
        return out, length, straight_min

    def deck_cable_route(self) -> dict:
        """The deck-side cable run (2026-11-14): each run's rounded path, its length, its bundle's diameter and the
        lengths each wire group is cut to, from the electronics on the deck. The head's wires then add the twisting run
        on the axis, the free loop and the head's own run (`servo_supply` uses the routed length)."""
        paths = self.deck_cable_paths()
        rad = self.deck_cable_bend_r
        r_lift = max(12.0, self.deck_static_bend_factor * max(AWG_OD_MM[g] for _, _, g in self.lift_wires))
        r_step = max(12.0, self.deck_static_bend_factor * max(AWG_OD_MM[g] for _, _, g in self.stepper_wires))
        main, l_main, s_main = self._rounded(paths["main"], rad)
        step, l_step, s_step = self._rounded(paths["stepper"], r_step)
        lift, l_lift, s_lift = self._rounded(paths["lift"], r_lift)
        # where the branches leave the main run, measured along it
        dt = self.rail_top + self.plate_t
        lift_at = abs(paths["lift"][0][0] - paths["main"][0][0])
        p = paths["main"]
        rise = (p[2][2] - p[1][2])
        step_at = (abs(p[1][0] - p[0][0]) + rise + abs(p[2][1] - self.az_centre_dist)) - rad * (2 - math.pi / 2)
        grip = 60.0                                            # tails at each end: terminals, connectors, slack
        head_axis = l_main + grip                              # electronics to the clamp's bore
        stepper_len = step_at + l_step + grip
        lift_len = lift_at + l_lift + grip
        thickest = max(AWG_OD_MM[g] for _, _, g in self.head_wires + self.turntable_wires + self.stepper_wires + self.lift_wires)
        return {
            "main": main, "stepper": step, "lift": lift,
            "len_mm": {"main": l_main, "stepper": l_step, "lift": l_lift},
            "straight_min_mm": min(s_main, s_step, s_lift),
            "bend_r": {"main": rad, "stepper": r_step, "lift": r_lift},
            "bend_min_mm": self.deck_static_bend_factor * thickest,
            "od_mm": {"deck": self.bundle_od(self.head_wires + self.turntable_wires + self.stepper_wires + self.lift_wires),
                      "post": self.bundle_od(self.head_wires + self.turntable_wires + self.stepper_wires),
                      "axis": self.bundle_od(self.head_wires + self.turntable_wires),
                      "stepper": self.bundle_od(self.stepper_wires), "lift": self.bundle_od(self.lift_wires)},
            "to_clamp_mm": head_axis, "stepper_lead_mm": stepper_len, "lift_lead_mm": lift_len,
            "deck_z": dt,
        }

    def deck_cable_ties(self) -> dict[str, list]:
        """Where the fixed run is held (2026-11-14): saddles on the deck (M3 into new deck holes), T-nut saddles in the
        post's inner slot, hangers on the crossbar's underside and the clamp arm's web, as world (x, y, z) of the
        bundle's centre at each tie."""
        paths = self.deck_cable_paths()
        m = paths["main"]
        (x0, y, zd), (xp, _, _), (_, _, zl) = m[0], m[1], m[2]
        rad = self.deck_cable_bend_r
        deck_end = xp - rad - 15.0
        n = max(2, math.ceil((deck_end - x0) / self.deck_tie_max_mm) + 1)
        deck = [(x0 + (deck_end - x0) * i / (n - 1), y, zd) for i in range(n)]
        z_lo, z_hi = zd + rad + 15.0, zl - rad - 15.0
        k = max(2, math.ceil((z_hi - z_lo) / self.deck_tie_max_mm) + 1)
        post = [(xp, y, z_lo + (z_hi - z_lo) * i / (k - 1)) for i in range(k)]
        bar = [(xp, yy, zl) for yy in (y - rad - 15.0, rad + 15.0)]
        arm = [((xp + self.head_x) / 2, 0.0, zl)]
        return {"deck": deck, "post": post, "crossbar": bar, "arm": arm}

    def deck_cable_electrics(self) -> dict:
        """Lead losses on the routed lengths (2026-11-14): the stepper's coils, the lift motor at stall and the launcher
        phases' extension (ESCs on the deck), each for every AWG in the table, with the chosen gauge's verdict."""
        d = self.deck_cable_route()
        loop = self.cable_loop_design()
        cut = loop["cut_mm"] if loop and loop.get("window") else 400.0
        head_run = abs(self.cable_clip_x) + abs(self.cable_clip_z - self.head_z0) + self.plate_half_y + self.plate_t + 100.0
        phase_m = (d["to_clamp_mm"] + self.cable_twist()["run_mm"] + cut + head_run) / 1000
        step_m, lift_m = d["stepper_lead_mm"] / 1000, d["lift_lead_mm"] / 1000
        rows = {}
        for awg, ohm in sorted(AWG_OHM_PER_M.items()):
            r_coil = 2 * step_m * ohm
            r_lift = 2 * lift_m * ohm
            r_phase = phase_m * ohm
            rows[awg] = {"stepper_frac": r_coil / self.stepper_coil_ohm,
                         "stepper_w": 2 * self.stepper_amps ** 2 * r_coil,
                         "lift_drop_v": self.lift_motor_stall_a * r_lift,
                         "lift_frac": self.lift_motor_stall_a * r_lift / self.supply_v,
                         "phase_mohm": r_phase * 1000,
                         "phase_w": 2 * 3 * self.esc_phase_peak_a ** 2 * r_phase,       # two motors, three phases
                         "phase_frac": 3 * self.esc_phase_peak_a ** 2 * r_phase / self.launcher_peak_w}
        g_step = next(g for _, _, g in self.stepper_wires[:1])
        g_lift = self.lift_wires[0][2]
        g_phase = self.head_wires[0][2]
        return {"stepper_m": step_m, "lift_m": lift_m, "phase_m": phase_m, "awg": rows,
                "stepper": rows[g_step], "lift": rows[g_lift], "phase": rows[g_phase],
                "gauges": {"stepper": g_step, "lift": g_lift, "phase": g_phase}}

    def check_deck_cables(self) -> list[str]:
        bad = []
        d = self.deck_cable_route()
        for run, r in d["bend_r"].items():
            groups = {"main": self.head_wires + self.turntable_wires + self.stepper_wires + self.lift_wires,
                      "stepper": self.stepper_wires, "lift": self.lift_wires}[run]
            need = self.deck_static_bend_factor * max(AWG_OD_MM[g] for _, _, g in groups)
            if r < need - 1e-9:
                bad.append(f"deck cable {run} run bends at {r:g} mm, under {need:g} mm for its thickest wire")
        if d["straight_min_mm"] < 0:
            bad.append("deck cable corners overlap: a leg is shorter than its two bends need")
        if self.deck_cable_z_low + self.deck_cable_bend_r > self.deck_cable_end_z + 1e-6:
            bad.append("deck cable cannot turn up into the axis clamp: lower deck_cable_z_low")
        if self.deck_cable_z_low + d["od_mm"]["deck"] / 2 > self.cable_clamp_z - 10.0 - 2.0:
            bad.append("deck cable under the crossbar touches it")
        t = self.deck_cable_ties()
        seq = [q for name in ("deck", "post", "crossbar", "arm") for q in t[name]]
        seq.append((self.head_x, 0.0, self.cable_clamp_z))            # the clamp itself holds the end
        gap = max(math.dist(a, b) for a, b in zip(seq, seq[1:]))
        if gap > self.deck_tie_max_mm + 1e-6:
            bad.append(f"deck cable ties are up to {gap:.0f} mm apart ({self.deck_tie_max_mm:g} allowed)")
        e = self.deck_cable_electrics()
        if e["stepper"]["stepper_frac"] > self.stepper_lead_frac:
            bad.append(f"stepper lead ({e['gauges']['stepper']} AWG, {e['stepper_m']:.2f} m) is {e['stepper']['stepper_frac']:.0%} "
                       f"of the coil's resistance ({self.stepper_lead_frac:.0%} allowed): heavier wire")
        if e["lift"]["lift_frac"] > self.lift_drop_frac:
            bad.append(f"lift lead ({e['gauges']['lift']} AWG, {e['lift_m']:.2f} m) drops {e['lift']['lift_drop_v']:.2f} V at the "
                       f"{self.lift_motor_stall_a:g} A stall ({self.lift_drop_frac:.0%} of {self.supply_v:g} V allowed): heavier wire")
        if e["phase"]["phase_frac"] > self.esc_phase_loss_frac:
            bad.append(f"launcher phase extension ({e['gauges']['phase']} AWG, {e['phase_m']:.2f} m) loses "
                       f"{e['phase']['phase_frac']:.1%} of a motor's peak at {self.esc_phase_peak_a:g} A: heavier wire")
        return bad

    # ---- power distribution (2026-11-14) ---------------------------------------
    @property
    def launch_wheel_kgm2(self) -> float:
        """One launcher wheel and its motor's rotor, turning together."""
        r = self.wheel_head_d / 2000
        return self.launch_wheel_k * self.launch_wheel_kg * r * r + self.launch_rotor_kgm2

    def spinup_s(self, rpm: float, power_w: float | None = None) -> float:
        """Seconds the firmware's ramp (`controller.SpinupRamp`) takes a wheel from rest to `rpm`: a constant
        `wheel_ramp_max_rpm_s` until the shaft power I w a reaches `power_w` (default `wheel_spinup_w`), then constant
        power, so rpm^2 grows at 2 k with k = P / I (60 / 2 pi)^2."""
        p = self.wheel_spinup_w if power_w is None else power_w
        k = p / self.launch_wheel_kgm2 * (60 / (2 * math.pi)) ** 2
        rpm_c = k / self.wheel_ramp_max_rpm_s
        if rpm <= rpm_c:
            return rpm / self.wheel_ramp_max_rpm_s
        return rpm_c / self.wheel_ramp_max_rpm_s + (rpm * rpm - rpm_c * rpm_c) / (2 * k)

    def power_distribution(self) -> dict:
        """Branch currents, fuses and wire gauges after the main fuse, the contactor's and main fuse's ratings, and the
        worst simultaneous draw against the BMS (2026-11-14). A branch fuse is the smallest standard rating at or above
        1.25 times its running current and at or above a motor's stall current over `motor_start_factor` (a motor
        starts at stall current for a few ms; a blade fuse at twice its rating takes 0.15 s or more to open), and its
        wire the thinnest gauge in AWG_AMPS that carries the fuse's rating. The launcher ESCs draw what the firmware's
        spin-up ramp allows, (WHEEL_SPINUP_W + drag) / (efficiency x volts), fused at `esc_fuse_factor` times that, since
        the speed loop's recovery after each ball is not modelled. The Pi's buck sits before the contactor, so the Pi and
        the ESP32 it feeds stay up through an e-stop and report it; every other branch is switched."""
        v, eff = self.battery_v_min, self.buck_eff
        e = self.deck_cable_electrics()
        coil = self.stepper_coil_ohm * (1 + e["stepper"]["stepper_frac"])
        esc_a = (self.wheel_spinup_w + self.launch_drag_w) / (self.esc_eff * v)
        stepper_a = 2 * self.stepper_amps ** 2 * coil / (eff * v)
        rows = [
            # name, running A, peak A, least fuse A, switched
            ("launcher ESC, top", esc_a, esc_a, self.esc_fuse_factor * esc_a, True),
            ("launcher ESC, bottom", esc_a, esc_a, self.esc_fuse_factor * esc_a, True),
            ("dual H-bridge: base (two gearmotors) and elevation actuator",
             2 * self.base_motor_run_a + self.elev_act_run_a, 2 * self.base_motor_stall_a + self.elev_act_stall_a, None, True),
            ("lift gearmotor MOSFET", self.lift_motor_run_a, self.lift_motor_stall_a, None, True),
            ("agitator gearmotor MOSFET", self.agit_motor_run_a, self.agit_motor_stall_a, None, True),
            ("azimuth stepper driver", stepper_a, stepper_a, None, True),
            ("servo buck, 6 V", self.servo_supply_v * self.servo_stall_a / (eff * v), self.servo_supply_v * self.servo_stall_a / (eff * v),
             1.25 * self.servo_supply_v * self.servo_buck_a / (eff * v), True),
            ("Pi buck, 5 V (before the contactor)", self.pi_w / (eff * v), self.pi_w / (eff * v), 1.25 * self.pi_buck_w / (eff * v), False),
        ]
        branches = []
        for name, run, peak, least, switched in rows:
            if least is None:
                least = max(1.25 * run, peak / self.motor_start_factor)
            fuse = fuse_for(least)
            branches.append({"name": name, "run_a": run, "peak_a": peak, "fuse_a": fuse, "awg": min(gauge_for(fuse), self.branch_awg_min),
                             "switched": switched})
        total = sum(b["run_a"] for b in branches)
        switched = sum(b["run_a"] for b in branches if b["switched"])
        others = total - 2 * esc_a
        budget = self.bms_use_frac * self.bms_cont_a
        main = fuse_for(1.25 * total)
        ohm = {**AWG_OHM_PER_M, **FEED_AWG_OHM_PER_M}[self.main_feed_awg]
        drop = total * 2 * self.main_feed_mm / 1000 * ohm
        top = self.wheel_rpm_max
        return {"branches": branches, "esc_a": esc_a, "total_a": total, "switched_a": switched, "budget_a": budget,
                "spinup_w_max": (budget - others) * self.esc_eff * v / 2 - self.launch_drag_w,
                "main_fuse_a": main, "contactor_a": main, "main_drop_v": drop, "main_drop_frac": drop / v,
                "inertia_kgm2": self.launch_wheel_kgm2, "spinup_s": {"launch": self.spinup_s(max(self.launch_rpm)),
                                                                      "top": self.spinup_s(top)},
                "unramped_esc_a": (self.launcher_peak_w / self.esc_eff) / v,
                "hbridge": {"base_run_a": 2 * self.base_motor_run_a, "base_peak_a": 2 * self.base_motor_stall_a,
                            "elev_run_a": self.elev_act_run_a, "elev_peak_a": self.elev_act_stall_a}}

    def check_power(self) -> list[str]:
        bad = []
        d = self.power_distribution()
        if d["total_a"] > d["budget_a"] + 1e-9:
            bad.append(f"every load at once draws {d['total_a']:.1f} A, over {self.bms_use_frac:.0%} of the BMS's "
                       f"{self.bms_cont_a:g} A ({d['budget_a']:.1f} A): lower wheel_spinup_w to {max(d['spinup_w_max'], 0):.0f} W or less")
        if d["main_fuse_a"] > AWG_AMPS[self.main_feed_awg] + 1e-9:
            bad.append(f"main fuse {d['main_fuse_a']:g} A is over what the {self.main_feed_awg} AWG battery feed carries "
                       f"({AWG_AMPS[self.main_feed_awg]:g} A): heavier feed")
        if d["main_drop_frac"] > self.main_feed_drop_frac + 1e-9:
            bad.append(f"battery feed drops {d['main_drop_v']:.2f} V at {d['total_a']:.1f} A "
                       f"({self.main_feed_drop_frac:.0%} of {self.battery_v_min:g} V allowed): heavier or shorter feed")
        by = {b["name"]: b for b in d["branches"]}
        g_lift = self.lift_wires[0][2]
        if by["lift gearmotor MOSFET"]["fuse_a"] > AWG_AMPS[g_lift] + 1e-9:
            bad.append(f"lift lead ({g_lift} AWG, {AWG_AMPS[g_lift]:g} A) is under its {by['lift gearmotor MOSFET']['fuse_a']:g} A fuse")
        g_step = self.stepper_wires[0][2]
        if self.stepper_amps > AWG_AMPS[g_step] + 1e-9:
            bad.append(f"stepper coils ({g_step} AWG, {AWG_AMPS[g_step]:g} A) under the driver's {self.stepper_amps:g} A")
        if self.servo_buck_a > AWG_AMPS[self.servo_lead_awg] + 1e-9:
            bad.append(f"servo supply ({self.servo_lead_awg} AWG, {AWG_AMPS[self.servo_lead_awg]:g} A) is under the "
                       f"buck's {self.servo_buck_a:g} A limit")
        h = d["hbridge"]
        for ch, run, peak in (("base", h["base_run_a"], h["base_peak_a"]), ("elevation", h["elev_run_a"], h["elev_peak_a"])):
            if run > self.hbridge_cont_a + 1e-9 or peak > self.hbridge_peak_a + 1e-9:
                bad.append(f"H-bridge {ch} channel: {run:g} A running and {peak:g} A peak, over its "
                           f"{self.hbridge_cont_a:g} A / {self.hbridge_peak_a:g} A")
        return bad

    def contactor_inrush(self) -> dict:
        """Current through the contactor when it closes onto the switched bus (2026-11-14), with and without the
        precharge. The loop is a series R-L-C: the pack, the 12 AWG feed out and back, the main fuse and the contactor,
        then the two launcher ESC branches in parallel (each its fuse, its 16 AWG lead out and back and its capacitors'
        ESR) into every switched capacitor at once. A direct close starts from an empty bus at the charger's voltage.
        With the precharge, a relay first charges the bus through `precharge_ohm` while the idle loads draw
        `bus_idle_a`, then an on-delay closes the contactor across what is left:
        idle x R + (V - idle x R) exp(-t / RC). The current that heats a fuse is the same for any damping,
        integral of i^2 dt = C V^2 / (2 R), a quarter of it in each ESC branch."""
        v = self.battery_v_max
        ohm = {**AWG_OHM_PER_M, **FEED_AWG_OHM_PER_M}
        feed_m = 2 * self.main_feed_mm / 1000
        esc_m = 2 * self.esc_lead_mm / 1000
        g_esc = next(b["awg"] for b in self.power_distribution()["branches"] if b["name"] == "launcher ESC, top")
        r_branch = esc_m * ohm[g_esc] + self.branch_fuse_ohm + self.esc_cap_esr_ohm
        r = self.pack_ohm + feed_m * ohm[self.main_feed_awg] + self.main_fuse_ohm + self.contactor_ohm + r_branch / 2
        l = (self.pack_uh + self.loop_uh_per_m * (feed_m / 2 + esc_m / 4)) * 1e-6
        c = (2 * self.esc_cap_uf + self.bus_other_cap_uf) * 1e-6

        def event(step_v: float, extra_a: float = 0.0) -> dict:
            if step_v <= 0:
                return {"step_v": 0.0, "peak_a": extra_a, "t_peak_us": 0.0, "bms_over_us": 0.0, "i2t": 0.0}
            i, tp, ip = rlc_step(step_v, r, l, c)
            over = time_above(lambda t: i(t) + extra_a, tp, self.bms_sc_a, 50 * r * c + 50 * math.sqrt(l * c))
            return {"step_v": step_v, "peak_a": ip + extra_a, "t_peak_us": tp * 1e6, "bms_over_us": over * 1e6,
                    "i2t": c * step_v ** 2 / (2 * r)}

        direct = event(v)
        zeta = r / (2 * math.sqrt(l / c))
        # an underdamped loop rings the bus past the pack's voltage (the capacitors' rating must cover it)
        overshoot = math.exp(-math.pi * zeta / math.sqrt(1 - zeta * zeta)) if zeta < 1 else 0.0
        out = {"r_ohm": r, "l_h": l, "c_f": c, "r_branch_ohm": r_branch, "tau_us": r * c * 1e6,
               "damping": zeta, "bus_peak_v": v * (1 + overshoot), "direct": direct,
               "esc_branch_i2t": direct["i2t"] / 4, "precharge": None}
        if self.precharge_ohm > 0:
            rp = self.precharge_ohm + r
            tau = rp * c
            held = min(self.bus_idle_a * rp, v)
            residual = held + (v - held) * math.exp(-self.precharge_delay_s / tau)
            out["precharge"] = {"peak_a": v / rp, "tau_ms": tau * 1e3, "residual_v": residual,
                                "energy_j": 0.5 * c * v * v, "fault_w": v * v / self.precharge_ohm,
                                "fault_j": v * v / self.precharge_ohm * self.precharge_delay_s,
                                "close": event(residual, self.bus_idle_a)}
        out["closing"] = out["precharge"]["close"] if out["precharge"] else direct
        if self.precharge_ohm > 0:
            # The same closing with the switched loads that start during the precharge, at both ends of the battery's
            # range: constant-power loads hurt most at the low end, the step's energy at the high one.
            out["startup"] = {}
            for name, vp in (("full", v), ("low", self.battery_v_min)):
                b = self.precharge_bus(vp, r, c)
                b["close"] = event(b["gap_v"], b["load_a"])
                out["startup"][name] = b
            worst = max(out["startup"].values(), key=lambda b: b["close"]["peak_a"])
            if worst["close"]["peak_a"] > out["closing"]["peak_a"]:
                out["closing"] = worst["close"]
        return out

    def startup_loads(self, v_pack: float) -> list[tuple[str, float, float]]:
        """Constant-power loads that start while the bus precharges: (name, input watts, seconds or inf)."""
        loads = []
        if self.stepper_holds_at_power_up:
            d = self.power_distribution()
            stepper = next(b for b in d["branches"] if b["name"] == "azimuth stepper driver")
            loads.append(("stepper driver holding", stepper["run_a"] * self.battery_v_min, math.inf))
        if self.servo_pulse_at_rest:
            loads.append(("shuttle servo seeking home", self.servo_supply_v * self.servo_stall_a / self.buck_eff,
                          self.servo_seek_s))
        return loads

    def precharge_bus(self, v_pack: float, r_loop: float | None = None, c_bus: float | None = None) -> dict:
        """The bus during the precharge with the start-up loads (2026-11-14): C dV/dt = (Vpack - V) / R - idle - sum
        P / V over the loads that have started (above `switched_start_v`, until they fall below `switched_stop_v`;
        a seeking servo for `servo_seek_s` of powered time), stepped at a 400th of the time constant to the
        contactor's on-delay. With no start-up loads it is the closed form in `contactor_inrush`, which the tests check.
        Returns the gap left when the contactor closes, the loads' current then, the loads' restarts (a bus that
        cannot carry them chatters at their threshold) and the highest V^2 / 4R power the resistor can pass."""
        if r_loop is None or c_bus is None:
            d = self.contactor_inrush()
            r_loop, c_bus = d["r_ohm"], d["c_f"]
        rp = self.precharge_ohm + r_loop
        loads = self.startup_loads(v_pack)
        dt = rp * c_bus / 400
        n = int(math.ceil(self.precharge_delay_s / dt))
        dt = self.precharge_delay_s / n
        vb, on, used, starts = 0.0, [False] * len(loads), [0.0] * len(loads), [0] * len(loads)

        def draw(vx):
            a = self.bus_idle_a
            for k, (_, w, dur) in enumerate(loads):
                if on[k] and used[k] < dur:
                    a += w / max(vx, 1e-6)
            return a

        # The loop below is `draw` inlined (perf note 2026-11-15): the loads drawing during a step are fixed for
        # that step, so their watts are listed once per step and summed in the same order as `draw`, which keeps
        # every float the same. Without start-up loads (the common case) the per-load loops vanish.
        idle, stop_v, start_v = self.bus_idle_a, self.switched_stop_v, self.switched_start_v
        ks, durs = range(len(loads)), [dur for _, _, dur in loads]
        watts = [w for _, w, _ in loads]
        for _ in range(n):
            act = []
            for k in ks:
                if on[k] and vb < stop_v:
                    on[k] = False
                elif not on[k] and vb >= start_v:
                    on[k] = True
                    starts[k] += 1
                if on[k] and used[k] < durs[k]:
                    act.append(watts[k])
            a = idle
            if act:
                x = 1e-6 if vb < 1e-6 else vb
                for w in act:
                    a += w / x
            k1 = ((v_pack - vb) / rp - a) / c_bus
            vm = vb + k1 * dt / 2
            a = idle
            if act:
                x = 1e-6 if vm < 1e-6 else vm
                for w in act:
                    a += w / x
            vb += ((v_pack - vm) / rp - a) / c_bus * dt
            for k in ks:
                if on[k]:
                    used[k] += dt
        return {"v_pack": v_pack, "bus_v": vb, "gap_v": v_pack - vb, "load_a": draw(vb),
                "loads": [{"name": nm, "w": w, "starts": starts[k], "on_at_close": on[k] and used[k] < dur}
                          for k, (nm, w, dur) in enumerate(loads)],
                "max_w": v_pack ** 2 / (4 * rp)}

    def contactor_bounce(self) -> dict:
        """What the contactor makes when it bounces after the precharge (2026-11-14). While the contacts are open the
        precharge relay is still closed, so the bus does not collapse: it relaxes from the pack's volts toward
        Vpack - I x Rp with the precharge time constant, I being what the switched loads draw. Each re-close is then
        an R-L-C step across that gap, with I flowing on top. One bounce of `contactor_bounce_ms` (the whole bounce
        open, the worst case) is solved with the idle loads only and with the stepper driver enabled too (as it would
        be if the firmware enabled it the moment the coil was energised). Also checks that the firmware's delay
        before ENABLE outlasts pull-in and bounce, so the driver's step load never lands on bouncing contacts."""
        d = self.contactor_inrush()
        r, l, c = d["r_ohm"], d["l_h"], d["c_f"]
        rp = self.precharge_ohm + r if self.precharge_ohm > 0 else math.inf
        tau = rp * c
        stepper = next(b for b in self.power_distribution()["branches"] if b["name"] == "azimuth stepper driver")
        out = {"tau_ms": tau * 1e3, "open_ms": self.contactor_bounce_ms,
               "settle_ms": self.contactor_pull_in_ms + self.contactor_bounce_ms,
               "enable_after_ms": self.stepper_enable_after_ms,
               "enable_margin_ms": self.stepper_enable_after_ms - self.contactor_pull_in_ms - self.contactor_bounce_ms}
        for name, load in (("idle", self.bus_idle_a), ("stepper enabled", self.bus_idle_a + stepper["run_a"])):
            if math.isinf(rp):  # no precharge: an open contact leaves the loads on the capacitors alone
                gap = min(load * self.contactor_bounce_ms / 1e3 / c, self.battery_v_max)
            else:
                gap = load * rp * (1 - math.exp(-self.contactor_bounce_ms / 1e3 / tau))
            peak = (rlc_step(gap, r, l, c)[2] if gap > 0 else 0.0) + load
            out[name] = {"load_a": load, "gap_v": gap, "peak_a": peak}
        return out

    def contactor_bounce_train(self, load_a: float, n: int, open_frac: float) -> dict:
        """The contactor's bounce as n opens in a row (2026-11-14). `contactor_bounce` takes the whole window as one
        open after a close that had fully charged the bus. Here the window `contactor_bounce_ms` starts at the first
        touch and alternates close (1 - open_frac) x window / n, open open_frac x window / n, n times, then stays shut.
        Closed: L di/dt = Vpack - R i - v and C dv/dt = i + (Vpack - v) / Rp - load, from the precharged bus and no
        current (R, L, C as `contactor_inrush`; the precharge relay stays closed throughout). Open: the contact
        current stops (its 1/2 L i^2 goes into the arc) and the bus relaxes toward Vpack - load x Rp. A short close can
        open before the bus has caught up, so a re-close can start from a larger gap than one long bounce leaves.
        Returns each make's peak and each break's current. RK4 at a 60th of the loop's fastest time constant."""
        return self._bounce_train(self.contactor_inrush(), load_a, n, open_frac)

    def _bounce_train(self, d: dict, load_a: float, n: int, open_frac: float) -> dict:
        """`contactor_bounce_train` given `contactor_inrush()` as `d`. The result depends only on the numbers read
        below, and the CAD suite's mutated Feeders repeat them: 1,330 of 1,899 trains (perf note 2026-11-18), so each
        result is kept under those numbers' exact bit patterns and handed out as a deep copy."""
        pre = d["precharge"]
        key = tuple((type(x).__name__, x.hex() if isinstance(x, float) else x) for x in (
            d["r_ohm"], d["l_h"], d["c_f"], self.battery_v_max, self.precharge_ohm,
            pre["residual_v"] if pre else None, self.contactor_bounce_ms, load_a, n, open_frac))
        hit = _BOUNCE_TRAINS.get(key)
        if hit is None:
            hit = self._bounce_train_run(d, load_a, n, open_frac)
            if len(_BOUNCE_TRAINS) >= _BOUNCE_TRAINS_MAX:
                _BOUNCE_TRAINS.clear()
            _BOUNCE_TRAINS[key] = hit
        return copy.deepcopy(hit)

    def _bounce_train_run(self, d: dict, load_a: float, n: int, open_frac: float) -> dict:
        r, l, c = d["r_ohm"], d["l_h"], d["c_f"]
        vp = self.battery_v_max
        rp = self.precharge_ohm + r if self.precharge_ohm > 0 else math.inf
        v = vp - (d["precharge"]["residual_v"] if d["precharge"] else vp)
        i = 0.0
        win = self.contactor_bounce_ms / 1e3
        t_open, t_shut = open_frac * win / n, (1 - open_frac) * win / n
        settle = 20 * max(r * c, math.sqrt(l * c))
        h0 = min(math.sqrt(l * c), r * c, l / r) / 60

        makes, breaks, arc_j = [], [], 0.0
        has_rp = rp != math.inf
        g = 0.0 if rp == math.inf else 1 / rp
        i_eq = load_a / (1 + r * g)  # where the closed loop settles: C dv/dt = 0 and L di/dt = 0
        v_eq = vp - r * i_eq
        for k in range(n + 1):
            dur = t_shut if k < n else settle
            steps = max(int(math.ceil(dur / h0)), 1)
            h, peak, gap = dur / steps, 0.0, vp - v
            # Only the settle phase's peak is used, never its end state, so it may stop once the current provably
            # cannot reach the peak again (perf note 2026-11-15, `_settle_contracts`); the shut phases run in full.
            stop = k == n and _settle_contracts(r, l, c, g, h)
            done = 0
            while done < steps:
                blk = min(_SETTLE_BLOCK, steps - done) if stop else steps - done
                done += blk
                # RK4 on the closed-contact ODE above, written out inline rather than through a `deriv(v, i)` helper
                # (65 M calls in the CAD suite; perf note 2026-11-15). Same float operations in the same order as that
                # helper had, so results are bit-identical; `if i > peak` is what max(peak, i) picked.
                if has_rp:
                    for _ in range(blk):
                        a1, b1 = (i + (vp - v) / rp - load_a) / c, (vp - r * i - v) / l
                        vv, ii = v + a1 * h / 2, i + b1 * h / 2
                        a2, b2 = (ii + (vp - vv) / rp - load_a) / c, (vp - r * ii - vv) / l
                        vv, ii = v + a2 * h / 2, i + b2 * h / 2
                        a3, b3 = (ii + (vp - vv) / rp - load_a) / c, (vp - r * ii - vv) / l
                        vv, ii = v + a3 * h, i + b3 * h
                        a4, b4 = (ii + (vp - vv) / rp - load_a) / c, (vp - r * ii - vv) / l
                        v += (a1 + 2 * a2 + 2 * a3 + a4) * h / 6
                        i += (b1 + 2 * b2 + 2 * b3 + b4) * h / 6
                        if i > peak:
                            peak = i
                else:  # no precharge resistor: the precharge current is 0.0, kept as `+ 0.0` so the floats match
                    for _ in range(blk):
                        a1, b1 = (i + 0.0 - load_a) / c, (vp - r * i - v) / l
                        vv, ii = v + a1 * h / 2, i + b1 * h / 2
                        a2, b2 = (ii + 0.0 - load_a) / c, (vp - r * ii - vv) / l
                        vv, ii = v + a2 * h / 2, i + b2 * h / 2
                        a3, b3 = (ii + 0.0 - load_a) / c, (vp - r * ii - vv) / l
                        vv, ii = v + a3 * h, i + b3 * h
                        a4, b4 = (ii + 0.0 - load_a) / c, (vp - r * ii - vv) / l
                        v += (a1 + 2 * a2 + 2 * a3 + a4) * h / 6
                        i += (b1 + 2 * b2 + 2 * b3 + b4) * h / 6
                        if i > peak:
                            peak = i
                if stop and done < steps:
                    ev, ei = v - v_eq, i - i_eq
                    # |i - i_eq| can never exceed the energy norm sqrt(C/L ev^2 + ei^2) while each step contracts it;
                    # the margins cover rounding (about 1e-8 A over a whole settle) with a factor of 100 to spare.
                    if i_eq + math.sqrt(c / l * ev * ev + ei * ei) * (1 + 1e-6) + 1e-6 * (1 + abs(peak)) < peak:
                        break
            makes.append({"gap_v": gap, "peak_a": peak})
            if k == n:
                break
            breaks.append(i)
            arc_j += 0.5 * l * i * i
            i = 0.0
            if rp == math.inf:
                v = max(v - load_a * t_open / c, 0.0)
            else:
                floor = vp - load_a * rp
                v = floor + (v - floor) * math.exp(-t_open / (rp * c))
        return {"n": n, "open_frac": open_frac, "makes": makes, "breaks_a": breaks, "arc_j": arc_j,
                "peak_a": max(m["peak_a"] for m in makes), "max_gap_v": max(m["gap_v"] for m in makes),
                "break_a": max(breaks) if breaks else 0.0}

    def contactor_bounces(self) -> dict:
        """Every bounce train in `bounce_counts` x `bounce_open_fracs`, with the idle loads and with the stepper driver
        enabled, and the worst make and break of each."""
        stepper = next(b for b in self.power_distribution()["branches"] if b["name"] == "azimuth stepper driver")
        d, out = self.contactor_inrush(), {}  # once per call, not once per train (perf note 2026-11-18)
        for name, load in (("idle", self.bus_idle_a), ("stepper enabled", self.bus_idle_a + stepper["run_a"])):
            runs = [self._bounce_train(d, load, n, f) for n in self.bounce_counts for f in self.bounce_open_fracs]
            worst = max(runs, key=lambda x: x["peak_a"])
            out[name] = {"runs": runs, "worst": worst, "break_a": max(x["break_a"] for x in runs),
                         "arc_j": max(x["arc_j"] for x in runs), "makes_max": max(len(x["makes"]) for x in runs)}
        return out

    def check_inrush(self) -> list[str]:
        bad = []
        if not self.stepper_holds_at_power_up:
            cb = self.contactor_bounce()
            if cb["enable_margin_ms"] < 0:
                bad.append(f"firmware enables the stepper driver {cb['enable_after_ms']:g} ms after the contactor's coil, "
                           f"before its contacts have closed and stopped bouncing ({self.contactor_pull_in_ms:g} ms pull-in "
                           f"+ {self.contactor_bounce_ms:g} ms bounce): raise CONTACTOR_SETTLE_MS / stepper_enable_after_ms")
            worst = max(cb["idle"]["peak_a"], cb["stepper enabled"]["peak_a"])
            if worst > self.contactor_make_a + 1e-9:
                bad.append(f"contactor makes {worst:.0f} A re-closing after a {self.contactor_bounce_ms:g} ms bounce, over the "
                           f"{self.contactor_make_a:g} A it may make")
            tr = self.contactor_bounces()["idle"]["worst"]
            if tr["peak_a"] > self.contactor_make_a + 1e-9:
                bad.append(f"contactor makes {tr['peak_a']:.0f} A re-closing in a train of {tr['n']} bounces "
                           f"({tr['open_frac']:.0%} of {self.contactor_bounce_ms:g} ms open), over the "
                           f"{self.contactor_make_a:g} A it may make")
        d = self.contactor_inrush()
        cl, pre = d["closing"], d["precharge"]
        how = "closing onto the precharged bus" if pre else "closing onto an empty bus"
        if pre and cl is not pre["close"]:
            b = max(d["startup"].values(), key=lambda x: x["close"]["peak_a"])
            names = ", ".join(x["name"] for x in b["loads"] if x["on_at_close"]) or "the start-up loads"
            how = (f"closing at {b['v_pack']:g} V onto a bus held {b['gap_v']:.1f} V short by {names} "
                   f"(firmware: no servo pulse at rest, stepper ENABLE held off until the contactor closes)")
        fix = "" if pre else ": add the precharge (precharge_ohm)"
        if cl["peak_a"] > self.contactor_make_a + 1e-9:
            bad.append(f"contactor makes {cl['peak_a']:.0f} A {how}, over the {self.contactor_make_a:g} A it may make{fix}"
                       + (f" or lengthen precharge_delay_s ({pre['close']['step_v']:.2f} V left with no start-up loads)"
                          if pre and pre["close"]["peak_a"] > self.contactor_make_a + 1e-9 else ""))
        if cl["bms_over_us"] > self.bms_sc_delay_us + 1e-9:
            bad.append(f"inrush stays over the BMS's {self.bms_sc_a:g} A short-circuit trip for {cl['bms_over_us']:.0f} us "
                       f"{how}, past its {self.bms_sc_delay_us:g} us delay: the BMS would cut the Pi too{fix}")
        if pre:
            if pre["peak_a"] > self.precharge_relay_a + 1e-9:
                bad.append(f"precharge relay makes {pre['peak_a']:.1f} A, over its {self.precharge_relay_a:g} A: "
                           f"a larger precharge_ohm")
            if pre["peak_a"] > self.bms_sc_a:
                bad.append(f"precharge current {pre['peak_a']:.0f} A is over the BMS's short-circuit trip")
        return bad

    # ---- regenerative braking (2026-11-14) --------------------------------------
    def coast_s(self, rpm_from: float, rpm_to: float) -> float:
        """A lower bound on the seconds a wheel takes to coast from `rpm_from` down to `rpm_to` with the ESC not
        driving it (2026-11-14). `launch_drag_w` holds a wheel at the drill's top speed; bearing drag is about constant
        torque and air drag grows with speed, so below that speed the real drag torque is at most launch_drag_w / w_top,
        and coasting at that constant torque, t = I (w1 - w2) / tau, is the fastest it can be."""
        w = 2 * math.pi / 60
        tau = self.launch_drag_w / (max(self.launch_rpm) * w)
        return self.launch_wheel_kgm2 * (rpm_from - rpm_to) * w / tau

    def regen_braking(self) -> dict:
        """What the launcher wheels send back when the firmware lowers their targets (2026-11-14). The ramp lowers each
        target at `wheel_spinup_w` of shaft power at most (drag ignored: it only takes some of that), so an ESC that
        brakes puts at most 2 P x regen_eff on the bus. Three cases: (1) into the pack, with the contactor closed: the
        charge current against the BMS, and the highest cell against its over-voltage cut; (2) the e-stop opens the
        contactor mid-brake and braking goes on for the firmware's stop latency less the contacts' drop-out: with no
        return path, C V dV/dt = P lifts the bus by V^2 = V0^2 + 2 P t / C, and with `regen_diode` the bus is held at
        the pack plus the diode's drop; (3) the pack stops taking charge with the contactor closed (cell over-voltage,
        a cold BMS's charge block): nothing in the design responds inside the time the bus takes to pass
        `switched_v_max`, so the firmware must not brake where (1) puts a cell near its cut."""
        e = self.contactor_inrush()
        c = e["c_f"]
        p_bus = 2 * self.wheel_spinup_w * self.regen_eff
        pi_a = self.pi_w / (self.buck_eff * self.battery_v_max)
        # the pack-side resistance the braking current crosses: pack, feed out and back, main fuse
        ohm = {**AWG_OHM_PER_M, **FEED_AWG_OHM_PER_M}
        r_pack = self.pack_ohm + 2 * self.main_feed_mm / 1000 * ohm[self.main_feed_awg] + self.main_fuse_ohm
        guarded = self.regen_brake_max_v < self.battery_v_max
        v_brake = min(self.regen_brake_max_v, self.battery_v_max)       # highest pack reading the firmware brakes at

        def into_pack(v):
            i_bus = p_bus / v
            i_chg = max(i_bus - self.bus_idle_a - pi_a, 0.0)
            v_term = v + i_chg * r_pack
            return {"pack_v": v, "bus_a": i_bus, "charge_a": i_chg, "terminal_v": v_term,
                    "top_cell_v": v_term / self.pack_cells + self.cell_spread_v,
                    "bus_v": v_term + i_bus * self.contactor_ohm}

        def isolated(v0):
            t = max(self.esc_stop_latency_ms - self.contactor_dropout_ms, 0.0) / 1e3
            net = p_bus                                                  # idle loads ignored: they take under 5%
            return {"v0": v0, "window_ms": t * 1e3,
                    "to_limit_ms": max(c * (self.switched_v_max ** 2 - v0 ** 2) / (2 * net), 0.0) * 1e3,
                    "peak_v": math.sqrt(v0 * v0 + 2 * net * t / c), "joules": net * t}

        top = max(self.launch_rpm)
        step = 0.8 * top
        brake = into_pack(v_brake)
        out = {"bus_w": p_bus, "c_f": c, "r_pack_ohm": r_pack, "guarded": guarded, "brake_max_v": v_brake,
               "wheel_j": 0.5 * self.launch_wheel_kgm2 * (top * 2 * math.pi / 60) ** 2, "top_rpm": top,
               "brake": brake, "unguarded": into_pack(self.battery_v_max),
               "estop": {"full": isolated(self.battery_v_max), "brake": isolated(v_brake), "low": isolated(self.battery_v_min)},
               "diode_bus_v": brake["terminal_v"] + self.regen_diode_vf if self.regen_diode else None,
               "refused": isolated(v_brake),
               "slow_20pct": {"brake_s": self.spinup_s(top) - self.spinup_s(step), "coast_s": self.coast_s(top, step)},
               "coast_to_rest_s": self.coast_s(top, 0.0)}
        return out

    def regen_guard(self, hyst_v: float | None = None) -> dict:
        """The firmware's brake-or-coast choice over a slow-down (2026-11-14). Each 10 ms tick reads the pack (GPIO 36,
        between the main fuse and the contactor), and that reading carries the last tick's current across the pack-side
        resistance: while both wheels brake it reads high by the charge current x R (`regen_braking`'s case 1), while
        they coast it reads low by the Pi's and idle loads' draw x R, and on top of either sits up to
        `battery_adc_noise_v`, taken alternating high and low (the worst for flipping). The guard stops braking when the
        reading passes `regen_brake_max_v` and allows it again only under that less `hyst_v` (0: one threshold, the
        first firmware). Swept over resting pack voltages around the threshold for the 20% slow-down's length;
        a flip is one change of mode. Also: how much one slow-down charges the pack, so brakes in a row cannot creep
        it toward the cut."""
        hyst = self.regen_brake_hyst_v if hyst_v is None else hyst_v
        d = self.regen_braking()
        rpk = d["r_pack_ohm"]
        rise = d["brake"]["charge_a"] * rpk
        pi_a = self.pi_w / (self.buck_eff * self.battery_v_max)
        sag = (pi_a + self.bus_idle_a) * rpk
        hold_sag = (2 * self.launch_drag_w / (self.esc_eff * self.battery_v_min) + pi_a + self.bus_idle_a) * rpk
        top = self.regen_brake_max_v
        ticks = max(int(math.ceil(d["slow_20pct"]["brake_s"] / 0.01)), 2)
        noise = self.battery_adc_noise_v
        sweep, flips_max, band = [], 0, []
        steps = int(round((rise + sag + 2 * noise + 0.4) / 0.005))
        for k in range(steps + 1):
            ocv = top - rise - noise - 0.2 + 0.005 * k
            ok, braked, flips = True, False, 0
            for t in range(ticks):
                reading = ocv + (rise if braked else -sag) + (noise if t % 2 else -noise)
                if ok and reading > top + 1e-12:
                    ok, flips = False, flips + 1
                elif not ok and reading < top - hyst - 1e-12:
                    ok, flips = True, flips + 1
                braked = ok
            sweep.append((ocv, flips))
            flips_max = max(flips_max, flips)
            if flips > 1:
                band.append(ocv)
        slow_j = 2 * (d["wheel_j"] - 0.5 * self.launch_wheel_kgm2 * (0.8 * d["top_rpm"] * 2 * math.pi / 60) ** 2) \
            * self.regen_eff
        return {"hyst_v": hyst, "rise_v": rise, "coast_sag_v": sag, "hold_sag_v": hold_sag, "noise_v": noise,
                "needed_hyst_v": rise + sag + 2 * noise, "ticks": ticks, "flips_max": flips_max,
                "chatter_band_v": (min(band), max(band)) if band else None, "sweep": sweep,
                "slow_j": slow_j, "slows_per_pct": self.pack_wh * 3600 * 0.01 / slow_j,
                # a loaded reading admits braking from a pack resting higher than the threshold: the top cell then
                "loaded_top_cell_v": (top + hold_sag + rise) / self.pack_cells + self.cell_spread_v}

    def estop_reset_chain(self, events: list[tuple[float, str, bool]], until_s: float,
                          no_welded: bool = False) -> dict:
        """The feeder's control chain as switch logic (2026-11-18), stepped at 1 ms from power-up (the pack connected at
        t = 0). `events` are (t_s, "estop" | "fob" | "reset", pressed / cut / held). The e-stop's NC contact and the
        fob's relay are in series and feed node S. With `estop_reset_latch`, K0's coil sits on S through RESET's NO
        contact in parallel with K0's own hold contact, and the precharge relay and the timer take their feed P from
        K0 through RESET's NC contact; without it P is S. The timer closes the contactor's coil once P has been on for
        `precharge_delay_s` without a break and drops it with P. `no_welded` is RESET's NO contact stuck closed with
        the button let go (its NC still closed), the single fault that defeats the latch.
        Returns the contactor coil's on intervals [(on_s, off_s or None)] and the latch's state at the end."""
        ev = sorted(events)
        state = {"estop": False, "fob": False, "reset": False}
        k0 = False
        p_since = None
        coil = False
        spans: list[list] = []
        n = int(round(until_s * 1000))
        j = 0
        for ms in range(n + 1):
            t = ms / 1000
            while j < len(ev) and ev[j][0] <= t + 1e-9:
                state[ev[j][1]] = ev[j][2]
                j += 1
            s = not state["estop"] and not state["fob"]
            if self.estop_reset_latch:
                k0 = s and (state["reset"] or no_welded or k0)
                p = k0 and not state["reset"]
            else:
                p = s
            if not p:
                p_since = None
            elif p_since is None:
                p_since = t
            on = p and t - p_since >= self.precharge_delay_s - 1e-9
            if on and not coil:
                spans.append([t, None])
            elif coil and not on:
                spans[-1][1] = t
            coil = on
        return {"spans": [tuple(x) for x in spans], "latched": k0, "coil_on": coil}

    def estop_reset(self) -> dict:
        """The reset scenarios `check_estop_reset` judges (2026-11-18). Times in seconds from power-up; the drill
        scenarios start from a reset pressed at 1.0 s and let go at 1.3 s, so the bus is up from 1.3 s + the delay."""
        d = self.precharge_delay_s
        up = [(1.0, "reset", True), (1.3, "reset", False)]
        out = {
            "power_up": self.estop_reset_chain([], 10.0),
            "reset_held": self.estop_reset_chain([(1.0, "reset", True)], 10.0),
            "reset": self.estop_reset_chain(up, 10.0),
            "estop_released": self.estop_reset_chain(up + [(4.0, "estop", True), (5.0, "estop", False)], 30.0),
            "fob_restored": self.estop_reset_chain(up + [(4.0, "fob", True), (5.0, "fob", False)], 30.0),
            "reset_after_release": self.estop_reset_chain(
                up + [(4.0, "estop", True), (5.0, "estop", False), (8.0, "reset", True), (8.2, "reset", False)], 30.0),
            "reset_taped_down": self.estop_reset_chain(
                up + [(4.0, "estop", True), (4.5, "reset", True), (5.0, "estop", False)], 30.0),
            "reset_while_running": self.estop_reset_chain(up + [(4.0, "reset", True), (4.4, "reset", False)], 10.0),
            "no_welded": self.estop_reset_chain([(4.0, "estop", True), (5.0, "estop", False)], 30.0, no_welded=True),
            "power_up_reset_at": 1.3 + d,
            "after_reset_at": 8.2 + d,
        }
        # what K0's hold contact and RESET's NC contact carry once the bus is up: both coils ahead of the contactor,
        # the timer module and the contactor's coil (the timer's own contact switches the last from P)
        out["feed_a"] = self.precharge_coil_a + self.timer_module_a + self.contactor_coil_a
        return out

    def check_estop_reset(self) -> list[str]:
        """Releasing the e-stop or the fob must not re-power the motors by itself (2026-11-18; ISO 13850 asks the same
        of an emergency stop: its reset must not restart the machine, and a restart is a separate, deliberate act)."""
        bad = []
        r = self.estop_reset()
        if not self.estop_reset_latch:
            return ["no reset latch: releasing the e-stop or the fob re-powers the motors with nobody at the machine, and "
                    "a CLEAR_ESTOP from any phone on the network is then the only other step (set estop_reset_latch)"]
        if r["power_up"]["spans"]:
            bad.append("the bus comes up at power-up without RESET")
        if r["reset_held"]["spans"]:
            bad.append("the bus comes up while RESET is held: a jammed button would restart the machine")
        sp = r["reset"]["spans"]
        if not sp or abs(sp[0][0] - r["power_up_reset_at"]) > 0.002 or sp[0][1] is not None:
            bad.append(f"RESET let go at 1.3 s does not bring the bus up at {r['power_up_reset_at']:.1f} s and hold it: {sp}")
        for k in ("estop_released", "fob_restored", "reset_taped_down"):
            s = r[k]["spans"]
            if len(s) != 1 or s[0][1] is None or r[k]["coil_on"]:
                bad.append(f"{k.replace('_', ' ')}: the bus comes back without a RESET at the machine ({s})")
        s = r["reset_after_release"]["spans"]
        if len(s) != 2 or abs(s[1][0] - r["after_reset_at"]) > 0.002:
            bad.append(f"RESET after the e-stop's release does not bring the bus back at {r['after_reset_at']:.1f} s ({s})")
        s = r["reset_while_running"]["spans"]
        if len(s) < 1 or s[0][1] is None or abs(s[0][1] - 4.0) > 0.002:
            bad.append(f"RESET pressed while running does not drop the bus ({s})")
        a = r["feed_a"]
        if a > self.latch_relay_a + 1e-9:
            bad.append(f"K0's hold contact carries {a:.2f} A, over its {self.latch_relay_a:g} A")
        if a > self.reset_button_dc_a + 1e-9:
            bad.append(f"RESET's NC contact carries {a:.2f} A of coil current, over its {self.reset_button_dc_a:g} A DC rating")
        return bad

    def check_regen(self) -> list[str]:
        bad = []
        d = self.regen_braking()
        b = d["brake"]
        cut = self.bms_cell_ovp_v
        if b["charge_a"] > self.bms_use_frac * self.bms_charge_a + 1e-9:
            bad.append(f"braking both wheels charges the pack at {b['charge_a']:.1f} A, over {self.bms_use_frac:.0%} of the "
                       f"BMS's {self.bms_charge_a:g} A charge limit: lower wheel_spinup_w")
        if b["top_cell_v"] > cut - 0.02 + 1e-9:
            bad.append(f"braking at a {b['pack_v']:g} V pack lifts the highest cell to {b['top_cell_v']:.2f} V, at the BMS's "
                       f"{cut:g} V cut: the BMS stops charging and the bus has no sink (lower regen_brake_max_v / "
                       f"REGEN_BRAKE_MAX_MV)")
        if b["bus_v"] > self.switched_v_max + 1e-9:
            bad.append(f"braking into the pack holds the bus at {b['bus_v']:.2f} V, over the switched parts' "
                       f"{self.switched_v_max:g} V")
        if self.regen_brake_max_v < self.battery_v_max:
            g = self.regen_guard()
            if g["flips_max"] > 1:
                bad.append(f"the brake guard flips {g['flips_max']} times in one slow-down for a pack resting at "
                           f"{g['chatter_band_v'][0]:.2f} to {g['chatter_band_v'][1]:.2f} V: braking lifts its own reading "
                           f"{g['rise_v']:.2f} V and the reading carries {g['noise_v']:g} V of noise; widen "
                           f"regen_brake_hyst_v / REGEN_BRAKE_HYST_MV to at least {g['needed_hyst_v']:.2f} V")
            if g["loaded_top_cell_v"] > cut - 0.02 + 1e-9:
                bad.append(f"a slow-down that starts while the wheels hold speed reads the pack {g['hold_sag_v']:.2f} V low, "
                           f"so braking can start from a pack resting above the threshold and lift the highest cell to "
                           f"{g['loaded_top_cell_v']:.2f} V, at the BMS's {cut:g} V cut (lower regen_brake_max_v)")
        es = d["estop"]["brake"]
        if not self.regen_diode:
            if es["peak_v"] > self.switched_v_max + 1e-9:
                bad.append(f"an e-stop while the wheels brake leaves {es['window_ms']:.0f} ms of braking ({es['joules']:.1f} J) "
                           f"on the isolated bus: it passes {self.switched_v_max:g} V after {es['to_limit_ms']:.2f} ms and "
                           f"would reach {es['peak_v']:.0f} V; fit regen_diode across the contactor")
        else:
            if d["diode_bus_v"] > self.switched_v_max + 1e-9:
                bad.append(f"with the contactor open the diode holds the braking bus at {d['diode_bus_v']:.2f} V, over "
                           f"{self.switched_v_max:g} V")
            if self.regen_diode_vr < 1.5 * self.battery_v_max - 1e-9:
                bad.append(f"regen diode's {self.regen_diode_vr:g} V reverse rating is under 1.5 x the charger's "
                           f"{self.battery_v_max:g} V")
            if self.regen_diode_a < 2 * b["bus_a"] - 1e-9:
                bad.append(f"regen diode's {self.regen_diode_a:g} A is under twice the {b['bus_a']:.1f} A braking current")
        return bad

    def check_elevation(self, gravity_nm: dict[float, float]) -> list[str]:
        bad = []
        d = self.elevation_drive(gravity_nm)
        if self.elev_act_closed > d["closed_max_mm"]:
            bad.append(f"elevation actuator is {self.elev_act_closed:g} mm retracted; the shortest pose needs "
                       f"{d['closed_max_mm']:.1f} mm or less")
        if self.elev_act_closed < d["closed_min_mm"]:
            bad.append(f"elevation actuator is {self.elev_act_closed:g} mm retracted: fully retracted it pulls the head past "
                       f"+{self.elev_clear_max:g} deg into the turntable plate (needs {d['closed_min_mm']:.1f} mm or more)")
        if self.elev_act_closed + self.elev_act_stroke < d["extended_min_mm"]:
            bad.append(f"elevation actuator reaches {self.elev_act_closed + self.elev_act_stroke:g} mm; the longest pose needs "
                       f"{d['extended_min_mm']:.0f} mm")
        if not d["monotonic"]:
            bad.append("elevation actuator length is not monotonic over the range (the pin passes its dead centre)")
        if d["force_margin"] < self.elev_force_factor:
            bad.append(f"elevation actuator must push {abs(d['push_peak_n']):.0f} N against {self.elev_act_force_n:g} N rated "
                       f"({self.elev_force_factor:g}x wanted)")
        if not self.elev_pin_x - 8 > self.head_x0 + 10 or self.elev_pin_x + 8 > self.feed_col_x - self.hole_d / 2 - 2:
            bad.append("elevation pin is off the head plate or inside the feed column")
        if self.elev_pin_z - 8 < self.roof_bottom + self.feed_floor_t or self.elev_pin_z + 12 > self.head_z1:
            bad.append("elevation pin's nut hits the feed roof or the pin is off the plate")
        y_cheek = self.plate_half_y + self.plate_t + self.cheek_gap + self.plate_t
        if -self.elev_act_y - self.elev_act_r < y_cheek + 4:
            bad.append("elevation actuator rubs the -y cheek")
        return bad

    def check_launch(self) -> list[str]:
        bad = []
        rt, rb = self.launch_rpm
        if rb < 0 or max(rt, rb) > self.wheel_rpm_max:
            bad.append(f"launch of {self.launch_v_max:g} m/s with {self.launch_topspin_rpm:g} rpm topspin needs wheels at "
                       f"{rt:.0f} and {rb:.0f} rpm, outside 0 to {self.wheel_rpm_max:g}")
        if self.launch_force_n * 1.5 > self.launch_traction_n:
            bad.append(f"nip pushes at most {self.launch_traction_n:.0f} N but {self.launch_v_max:g} m/s needs "
                       f"{self.launch_force_n:.0f} N over {self.nip_len:.0f} mm (1.5x margin)")
        if self.head_x1 < -self.nip_x + self.ball_d / 2 + 5:
            bad.append("head plates end before the ball has left the wheels")
        return bad

    def launch_window(self, topspin_rpm: float | None = None) -> tuple[float, float, str]:
        """(slowest, fastest, binding limit) muzzle speed in m/s that passes the wheel-rpm and
        nip-traction checks of `check_launch` at the given topspin (default `launch_topspin_rpm`).
        The slowest is set by the bottom wheel: at low speed the spin difference would need it to run
        backwards. The fastest is set by the wheels' rpm limit or by the nip's traction ("wheel rpm"
        or "nip traction"). Returns (0, 0, ...) if no speed passes. Bisection on `check_launch`'s tests."""
        from dataclasses import replace
        spin = self.launch_topspin_rpm if topspin_rpm is None else topspin_rpm

        def state(v: float) -> tuple[bool, bool, bool]:
            q = replace(self, launch_v_max=v, launch_topspin_rpm=spin)
            rt, rb = q.launch_rpm
            return rb >= 0, max(rt, rb) <= q.wheel_rpm_max, q.launch_force_n * 1.5 <= q.launch_traction_n

        lo, hi = 0.0, 200.0
        for _ in range(60):  # slowest: the bottom wheel stops running backwards
            mid = (lo + hi) / 2
            lo, hi = (lo, mid) if state(mid)[0] else (mid, hi)
        vmin = hi
        if not all(state(vmin)):
            return 0.0, 0.0, "wheel rpm" if not state(vmin)[1] else "nip traction"
        lo, hi = vmin, 200.0
        for _ in range(60):  # fastest: rpm and traction limits both tighten with speed
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if all(state(mid)) else (lo, mid)
        return vmin, lo, ("wheel rpm" if not state(hi)[1] else "nip traction")

    def plate_clearance(self, v: float | None = None) -> dict:
        """Ball against the head plates after release (2026-11-09). The ball leaves the wheels with its centre at
        -nip_x and is free of the plates when its centre is a ball radius past `head_x1`; over that run it has
        `plate_half_y - ball_d/2` either side. Returns the side gap, the run, the transit time at `v` (default
        `launch_v_max`), the largest yaw error (deg) that still clears and the sideways speed that would just touch.
        Topspin and gravity act in the plates' plane (z), and the plates span head_z0..head_z1 around the ball, so
        only yaw (a wheel pair out of square with the plates, or a sideways push from a worn wheel) can hit them."""
        v = self.launch_v_max if v is None else v
        r = self.ball_d / 2
        gap = self.plate_half_y - r
        run = self.head_x1 + r + self.nip_x
        yaw = math.degrees(math.atan2(gap, run)) if run > 0 else 90.0
        t = run / 1000 / v if v > 0 else math.inf
        return {"gap_mm": gap, "run_mm": run, "transit_ms": t * 1000, "yaw_tol_deg": yaw,
                "side_speed_ms": gap / 1000 / t if t > 0 else math.inf}

    def axle_squaring(self) -> dict:
        """Wheel-axle yaw against the head plates (2026-11-09): the tolerance stack for `plate_clearance`'s limit.
        The axle's direction is set by two things: the motor face seating on the motor plate (flatness and burrs
        lift one edge by `seat_gap_mm` over the motor diameter) and the two bores not being exactly opposite each
        other (laser position error on each plate plus the plates' x-offset from their spacer slots) over the span
        between the bearings. Plates that are not parallel add the spacer length difference over the plate length.
        Returns each term in degrees, the worst-case sum, the root-sum-square, the limit and the margin
        (limit / worst case). All the tolerances are assumptions to replace with a measurement."""
        span = 2 * (self.plate_half_y + self.plate_t / 2)
        seat = math.degrees(math.atan2(self.seat_gap_mm, self.motor_d))
        bores = math.degrees(math.atan2(2 * self.bore_pos_tol_mm + self.plate_slot_play_mm, span))
        length = self.head_x1 - self.head_x0
        par = math.degrees(math.atan2(self.spacer_len_tol_mm, length))
        terms = {"motor_seat_deg": seat, "bore_offset_deg": bores, "plate_parallel_deg": par}
        worst = sum(terms.values())
        rss = math.sqrt(sum(v * v for v in terms.values()))
        limit = self.plate_clearance()["yaw_tol_deg"]
        return {**terms, "worst_deg": worst, "rss_deg": rss, "limit_deg": limit,
                "margin": limit / worst if worst > 0 else math.inf}

    def retain_strain_bad(self) -> str:
        if not 0.5 < self.retain_frac < 0.95:
            return "retainer gap must be 50 to 95% of the ball diameter"
        if self.retain_arm_strain > self.petg_strain_max:
            return f"retainer arm strain {self.retain_arm_strain:.1%} is over the {self.petg_strain_max:.0%} limit"
        if self.retain_pass_n * 1.5 > self.wheel_pull_n:
            return f"wheels ({self.wheel_pull_n:g} N) may not pull a ball through the retainer ({self.retain_pass_n:.0f} N)"
        if self.retain_pass_n < 3 * self.retain_hold_n:
            return "retainer is too weak to hold a ball at the steepest nose-down tilt"
        if self.retain_gap / 2 + self.retain_t + self.retain_relief + 3 > self.plate_half_y - self.feed_clear - 0.2:
            return "retainer arms and relief do not fit across the shuttle"
        return ""

    # ---- catch trough (2026-11-13) ---------------------------------------------
    @property
    def sump_y(self) -> float:
        """Sump's centre along the net: its outlet runs straight back under the beam and turns +y into the lift's boot
        on an arc whose end meets the channel's -y wall (`lift_turn_r`)."""
        return self.lift_y - (self.ball_d + self.lift_gap) / 2 - self.lift_turn_r

    @property
    def trough_runs(self) -> tuple[float, float]:
        """Plan lengths of the -y and +y runs, sump edge to the outer end."""
        return (self.net_w / 2 + self.sump_y - self.sump_half, self.net_w / 2 - self.sump_y - self.sump_half)

    @property
    def trough_run_len(self) -> float:
        """Plan length of the longer run."""
        return max(self.trough_runs)

    @property
    def trough_low_z(self) -> float:
        """Gutter's inside bottom at the sump's edges (both runs end there)."""
        return self.trough_end_z - self.trough_run_len * math.tan(math.radians(self.trough_slope_deg))

    def trough_z_at(self, d: float) -> float:
        """Gutter's inside bottom at distance d along the net from the sump's centre."""
        return self.trough_low_z + (max(abs(d), self.sump_half) - self.sump_half) * math.tan(math.radians(self.trough_slope_deg))

    def trough_bottom_z(self, y: float) -> float:
        """Gutter's inside bottom at y."""
        return self.trough_z_at(y - self.sump_y)

    @property
    def tub_rim_z(self) -> tuple[float, float]:
        """World z of the tub's top rim at its low (net-side) and high ends: the envelope in `feeder.envelopes`
        rotated by the shelf slope about the shelf origin."""
        s = math.radians(self.shelf_slope_deg)
        _, oz = self.shelf_origin
        h = self.plate_t + self.tub_h
        return (oz - self.tub_l / 2 * math.sin(s) + h * math.cos(s),
                oz + self.tub_l / 2 * math.sin(s) + h * math.cos(s))

    def trough_design(self) -> dict:
        """Gravity return from the net to the sump, and how far the balls are then below the tub.

        A ball rolling from rest at the outer end down a run of length L falling at angle a, against rolling
        resistance crr, reaches v^2 = 2 g L (sin a - crr cos a) / (1 + k), with k = I / (m r^2). The time is that of
        uniform acceleration, on the longer run. `lift_mm` is the height the ball must then gain, from the sump outlet's
        floor to clear the tub's lower rim: the feeder-catcher note's "rolls into the hopper" needs this lift, which
        `lift_design` provides.
        """
        a = math.radians(self.trough_slope_deg)
        L = self.trough_run_len / math.cos(a) / 1000
        acc = 9.81 * (math.sin(a) - self.trough_crr * math.cos(a)) / (1 + self.ball_inertia_k)
        v = math.sqrt(2 * acc * L) if acc > 0 else 0.0
        t = math.sqrt(2 * L / acc) if acc > 0 else math.inf
        low = self.trough_low_z
        rim_low, rim_high = self.tub_rim_z
        return {
            "run_len_mm": self.trough_run_len, "runs_mm": self.trough_runs, "drop_mm": self.trough_end_z - low, "low_z": low,
            "end_speed_m_s": v, "run_time_s": t, "accel_m_s2": acc,
            "queue_balls": int(sum(self.trough_runs) // self.ball_d),
            "outlet_floor_z": self.sump_out_z, "tub_rim_low_z": rim_low, "tub_rim_high_z": rim_high,
            "lift_mm": rim_low + self.tub_drop_clear_mm - self.sump_out_z,
        }

    def trough_lift_power_w(self, balls_per_min: float) -> float:
        """Mechanical power to lift returning balls at `balls_per_min` through `lift_mm` (no losses)."""
        return balls_per_min / 60 * self.ball_g / 1000 * 9.81 * self.trough_design()["lift_mm"] / 1000

    def check_trough(self) -> list[str]:
        bad = []
        if self.trough_w < 1.5 * self.ball_d:
            bad.append(f"gutter {self.trough_w:g} mm across is under 1.5 balls: a ball sliding off the net can miss it")
        t = math.tan(math.radians(self.trough_slope_deg))
        if t < self.trough_slope_factor * self.trough_crr:
            bad.append(f"trough falls {self.trough_slope_deg:g} deg (tan {t:.3f}); a stopped ball needs tan "
                       f"{self.trough_slope_factor * self.trough_crr:.3f} to start again")
        if self.trough_x0 < 25.0 + 3.0:
            bad.append("gutter's back edge is in the net plane")
        if self.trough_low_z - self.trough_wall < self.ground_min_mm:
            bad.append("gutter's low end is too near the court")
        if self.trough_low_z - self.sump_wall < self.sump_out_z + self.ball_d / 2:
            bad.append("sump floor cannot fall from the gutter to the outlet")
        if self.sump_out_z < self.ground_min_mm:
            bad.append("sump outlet is too near the court")
        if self.lift_inlet_top_at_beam() > self.rail_z - 0.5:
            bad.append("sump outlet is too high to pass a ball under the net beam")
        if any(not (self.sump_half + 40 <= abs(y - self.sump_y) and abs(y) <= self.net_w / 2 - 60)
               for y in self.trough_hanger_y):
            bad.append("a trough hanger is off the gutter run")
        return bad

    # ---- ball lift (2026-11-13) --------------------------------------------------
    @property
    def lift_pd(self) -> float:
        """Pulley pitch diameter."""
        return self.lift_belt_pitch * self.lift_pulley_teeth / math.pi

    @property
    def lift_r_out(self) -> float:
        """Radius of the belt's back face on a pulley."""
        return self.lift_pd / 2 + self.lift_belt_back

    @property
    def lift_r_in(self) -> float:
        """Radius of the belt's tooth tips on a pulley: the pulleys and the spine stay inside it."""
        return self.lift_r_out - self.lift_belt_t

    @property
    def lift_r_sweep(self) -> float:
        """Radius the finger tips sweep round a pulley."""
        return self.lift_r_out + self.lift_finger_l

    @property
    def lift_depth(self) -> float:
        """Channel depth (belt's back to the front rod) and width."""
        return self.ball_d + self.lift_gap

    @property
    def lift_x_belt(self) -> float:
        """x of the up-going belt's back face (the balls ride in front of it, +x)."""
        return self.lift_x - self.lift_depth / 2

    @property
    def lift_x_front(self) -> float:
        return self.lift_x + self.lift_depth / 2

    @property
    def lift_x_pulley(self) -> float:
        return self.lift_x_belt - self.lift_r_out

    @property
    def lift_turn_r(self) -> float:
        """Plan radius of the inlet's turn: from the sump's straight outlet (ending at the beam's rear face) to a ball
        rolling +y against the belt."""
        return -self.rail_w - (self.lift_x_belt + self.ball_d / 2)

    @property
    def lift_z_bottom(self) -> float:
        """Bottom pulley's axis: low enough that the fingers turn under the floor, high enough that the boot clears the
        court."""
        return self.lift_ground_mm + self.lift_wall + self.lift_r_sweep

    @property
    def lift_floor_z(self) -> float:
        """Boot floor where a ball waits against the belt: a finger turning onto the straight passes under it."""
        return self.lift_z_bottom + self.lift_finger_t / 2 + self.lift_finger_clear

    @property
    def lift_inlet_len(self) -> float:
        """Ball-centre path from the sump's rear wall to where it waits: the straight outlet under the beam, the turn,
        and across the channel to its +y wall."""
        stub = self.trough_x0 + self.sump_wall + self.rail_w
        return stub + math.pi / 2 * self.lift_turn_r + self.lift_depth / 2 + self.lift_gap / 2

    @property
    def lift_inlet_slope(self) -> float:
        """Tangent of the inlet floor's fall, sump outlet to the boot floor (uniform)."""
        return (self.sump_out_z - self.lift_floor_z) / self.lift_inlet_len

    def lift_inlet_top_at_beam(self) -> float:
        """Top of the outlet stub where it enters under the net beam (x = 0), the highest point under it."""
        x_a = self.trough_x0 + self.sump_wall
        return self.sump_out_z - self.lift_inlet_slope * x_a + self.hose_id + self.sump_wall

    def tub_rim_at(self, x: float) -> float:
        """World z of the tub's top rim at x (it falls toward the net with the shelf)."""
        s = math.radians(self.shelf_slope_deg)
        ox, _ = self.shelf_origin
        h = self.plate_t + self.tub_h
        x_front = ox + self.tub_l / 2 * math.cos(s) + h * math.sin(s)
        return self.tub_rim_z[0] + (x_front - x) * math.tan(s)

    def tub_opening_x(self) -> tuple[float, float]:
        """x span of the tub's top opening (inside the walls)."""
        s = math.radians(self.shelf_slope_deg)
        ox, _ = self.shelf_origin
        h = self.plate_t + self.tub_h
        xf = ox + self.tub_l / 2 * math.cos(s) + h * math.sin(s)
        xr = ox - self.tub_l / 2 * math.cos(s) + h * math.sin(s)
        return xr + self.tub_wall, xf - self.tub_wall

    def lift_release(self) -> tuple[float, float, float]:
        """(x, z of the ball's centre, radius) where the hood lets it go, relative to the top pulley's axis."""
        rc = self.lift_r_out + self.ball_d / 2
        a = math.radians(self.lift_hood_deg)
        return -rc * math.sin(a), rc * math.cos(a), rc

    LIFT_THROAT = 40.0   # drop floor's plan length, from outside the finger path to the chute's socket

    @property
    def lift_drop_edge(self) -> tuple[float, float]:
        """Plan point where the head's drop floor starts: just outside the returning fingers' path."""
        return self.lift_x_pulley - self.lift_r_sweep - 1.5, self.lift_y

    def lift_chute_dir(self) -> tuple[float, float]:
        """Plan unit vector from the drop floor's edge to `chute_target`: the drop floor falls this way, then the chute."""
        (x0, y0), (xt, yt) = self.lift_drop_edge, self.chute_target
        ln = math.hypot(xt - x0, yt - y0)
        return (xt - x0) / ln, (yt - y0) / ln

    def lift_chute_plan(self) -> tuple[tuple[float, float], tuple[float, float], float]:
        """(start, end, plan length) of the chute's bore: from its socket at the drop floor's far end to `chute_target`."""
        (x0, y0), (ux, uy) = self.lift_drop_edge, self.lift_chute_dir()
        start, end = (x0 + ux * self.LIFT_THROAT, y0 + uy * self.LIFT_THROAT), tuple(self.chute_target)
        return start, end, math.hypot(end[0] - start[0], end[1] - start[1])

    @property
    def lift_z_top(self) -> float:
        """Top pulley's axis: set so the chute's end clears the tub's rim (`tub_drop_clear_mm`) with the ball's bottom.
        Going down from the axis: the ball's centre at release, its radius and 1 mm to the drop floor, the drop floor's
        fall, then the chute's fall."""
        _, zr, _ = self.lift_release()
        _, (xt, _), lc = self.lift_chute_plan()
        need = self.tub_rim_at(xt) + self.tub_drop_clear_mm + self.sump_wall
        fall = (self.LIFT_THROAT * math.tan(math.radians(self.lift_drop_deg))
                + lc * math.tan(math.radians(self.chute_slope_deg)))
        return need + fall + self.ball_d / 2 + 1.0 - zr

    def lift_clip_z(self) -> list[float]:
        """Rod clips' bottom faces: one on the base plate, then evenly up to just under the head."""
        z0 = self.rail_top + self.plate_t
        z1 = self.lift_clip_top_z - 12.0                                # the top one: the jack screws stand on it
        n = max(1, math.ceil((z1 - z0) / self.lift_clip_max_mm))
        return [z0 + k * (z1 - z0) / n for k in range(n + 1)]

    LIFT_JACK_K = 3.5                  # M5 hex head's height: it sits between the top clip and the head
    LIFT_HEAD_BOLT_Z = (45.0, 62.0)    # head's M5s into the spine's +-y slots, above the head's underside

    @property
    def lift_clip_top_z(self) -> float:
        """Top face of the top rod clip: under the head's lowest position by a jack screw's head and 1 mm."""
        return self.lift_head_z0 + self.lift_head_lowest() - self.LIFT_JACK_K - 1.0

    @property
    def lift_spine_top_z(self) -> float:
        """The spine stops under the top pulley's tooth tips with the head at its lowest."""
        return self.lift_z_top + self.lift_head_lowest() - self.lift_r_in - 3.0

    def lift_head_lowest(self) -> float:
        """How far below its CAD position the head must come down to put the belt on (negative)."""
        return self.lift_tension_design()["off_lo_mm"]

    @property
    def lift_head_z0(self) -> float:
        """Underside of the printed head: the chute's socket and drop floor sit in it."""
        start, _, _ = self.lift_chute_plan()
        _, zr, _ = self.lift_release()
        z_socket = self.lift_z_top + zr - self.ball_d / 2 - 1.0 - self.LIFT_THROAT * math.tan(math.radians(self.lift_drop_deg))
        return z_socket - self.sump_wall - 12.0

    def lift_design(self) -> dict:
        """Belt, speed, capacity and drive of the lift.

        Capacity: a ball waits on the boot floor against the belt; the next one can roll in only once that one has
        been lifted a ball's height, and it then rolls a ball's diameter from rest down the inlet's slope (uniform
        acceleration with rolling resistance and a rolling ball's inertia, as on the trough). It is picked up by the
        first flight to pass after that, so the rate is one ball per whole number of flight intervals.

        Load: every flight on the up strand carrying a ball (the belt runs on after a burst). Per ball: its weight;
        rolling up the front rod, which the finger pushes it against (the finger holds the ball off centre, so the rod
        takes weight x offset / height of the contact); and the belt's sliding on the spine's strip, where the finger's
        moment is taken as a couple over the cap's pad (`lift_flight_design`).
        """
        r = self.ball_d / 2
        w = self.ball_g / 1000 * 9.81
        c = self.lift_z_top - self.lift_z_bottom
        teeth = round((2 * c + math.pi * self.lift_pd) / self.lift_belt_pitch)
        belt = teeth * self.lift_belt_pitch
        n_fl = max(1, round(belt / self.lift_flight_pitch))
        pitch = belt / n_fl
        v = math.pi * self.lift_pd * self.lift_motor_rpm / 60000
        t_fl = pitch / 1000 / v
        a = math.atan(self.lift_inlet_slope)
        acc = 9.81 * (math.sin(a) - self.trough_crr * math.cos(a)) / (1 + self.ball_inertia_k)
        t_roll = math.sqrt(2 * self.ball_d / 1000 / acc) if acc > 0 else math.inf
        t_clear = self.ball_d / 1000 / v
        k = math.ceil((t_roll + t_clear) / t_fl) if math.isfinite(t_roll) else math.inf
        rate = 60 / (k * t_fl) if math.isfinite(k) else 0.0
        off = self.lift_gap + r - self.lift_finger_l
        dz = math.sqrt(max(r * r - off * off, 1e-9))
        n_wall = off / dz
        per_ball = w * (1 + self.lift_crr_wall * n_wall + self.lift_mu_back * self.lift_finger_l / self.lift_flight_design()["arm_mm"])
        up = int(c // pitch)
        pull = up * per_ball
        torque = pull * self.lift_pd / 2 / 1000
        (xs, ys), (xt, yt), lc = self.lift_chute_plan()
        _, zr, _ = self.lift_release()
        z_socket = self.lift_z_top + zr - r - 1.0 - self.LIFT_THROAT * math.tan(math.radians(self.lift_drop_deg))
        z_end = z_socket - lc * math.tan(math.radians(self.chute_slope_deg))
        transit = c / 1000 / v
        return {
            "centre_mm": c, "belt_teeth": teeth, "belt_mm": belt, "flights": n_fl, "flight_pitch_mm": pitch,
            "speed_m_s": v, "transit_s": transit, "flight_interval_s": t_fl, "roll_in_s": t_roll, "clear_s": t_clear,
            "flights_per_ball": k, "rate_per_min": rate, "inlet_slope_deg": math.degrees(a), "inlet_mm": self.lift_inlet_len,
            "finger_offset_mm": off, "rod_load_ratio": n_wall, "per_ball_n": per_ball, "balls_up": up, "pull_n": pull,
            "torque_nm": torque, "torque_margin": self.lift_motor_nm / torque if torque > 0 else math.inf,
            "power_w": pull * v, "z_bottom": self.lift_z_bottom, "z_top": self.lift_z_top, "floor_z": self.lift_floor_z,
            "boot_bottom_z": self.lift_z_bottom - self.lift_r_sweep - self.lift_wall,
            "chute_plan_mm": lc, "chute_mm": lc / math.cos(math.radians(self.chute_slope_deg)),
            "chute_start": (xs, ys, z_socket), "chute_end": (xt, yt, z_end), "rim_at_end_z": self.tub_rim_at(xt),
            "head_top_z": self.lift_z_top + self.lift_r_out + self.lift_depth + self.lift_wall,
            # balls still on their way when the last one is fed: the far end of the trough plus the lift
            "run_on_s": self.trough_design()["run_time_s"] + transit + 2.0,
        }

    def lift_tension_design(self) -> dict:
        """Tension, take-up travel and setting figures for the top pulley.

        Tension: the bottom pulley drives and pulls in the down strand, so running, the down strand is the tight one
        there and the up strand, which it pays out, the slack one (until 2026-11-15 this said the reverse; the figures
        are symmetric, so none changed). With a static tension T0 at the drive pulley the strands carry T0 +- pull / 2; `lift_tension_factor` = 1 keeps half the pull in the slack strand
        (a 16-tooth pulley has only 8 teeth in mesh, so it must not go slack). Each strand also hangs its own weight from
        the top pulley, so the top pulley carries 2 (T0 + strand weight).

        Travel (head offsets from the CAD position, + up): the belt's free centre distance is (length - pi d) / 2 for
        its welded length +- `lift_belt_len_tol_mm`; the tension stretches it by length x mean tension / c_spec, which
        adds half that to the centre distance. The head must come down to the shortest belt's free centre less
        `lift_install_mm` (the belt slips on with the head there) and up to the longest belt's tensioned centre.

        Setting it: a bare strand of length L, mass m per metre and tension T rings at f = sqrt(T / m) / (2 L)
        (`ring_hz`); with the flights' mass it rings lower, `lift_pluck_design`, which is the figure a builder counts.
        Pushed sideways at mid-span with a force P it moves P L / (4 T), whatever its mass.
        """
        d = self.lift_design()
        g = 9.81
        pull = d["pull_n"]
        t0 = self.lift_tension_factor * pull
        span = d["centre_mm"] / 1000
        w_strand = self.lift_belt_kg_m * span * g
        t_mean = t0 + w_strand / 2                       # mean along a strand, tight and slack averaged
        stretch_mm = d["belt_mm"] * t_mean / self.lift_belt_cspec_n
        c_free = (d["belt_mm"] - math.pi * self.lift_pd) / 2
        tol = self.lift_belt_len_tol_mm / 2
        off_lo = c_free - tol - d["centre_mm"] - self.lift_install_mm
        off_hi = c_free + tol + stretch_mm / 2 - d["centre_mm"]
        off_set = c_free + stretch_mm / 2 - d["centre_mm"]        # the belt as ordered, tensioned
        top_n = 2 * (t0 + w_strand)
        jack_n = top_n + self.lift_top_kg * g                     # the two jack screws hold the head up off the clip
        t_top = t0 + w_strand                                     # tension at the top of a strand (it hangs from there)
        return {
            "t0_n": t0, "slack_n": t0 - pull / 2, "tight_n": t0 + pull / 2, "strand_weight_n": w_strand,
            "stretch_mm": stretch_mm, "free_centre_mm": c_free, "off_lo_mm": off_lo, "off_hi_mm": off_hi,
            "off_set_mm": off_set, "travel_mm": off_hi - off_lo, "top_load_n": top_n, "jack_n": jack_n,
            "jack_each_n": jack_n / 2, "clip_n": jack_n,
            "ring_hz": math.sqrt(t0 / self.lift_belt_kg_m) / (2 * span),
            "ring_hz_top": math.sqrt(t_top / self.lift_belt_kg_m) / (2 * span),
            "push_1n_mm": 1.0 * span * 1000 / (4 * t0),
        }

    M3_NUT_AC = 6.4                    # M3 nut across corners
    M3_HOLE = 3.4
    M3_WASHER_OD = 7.0                 # ISO 7089 M3 washer
    M3_CSK_HEAD_D = 6.72               # ISO 10642 M3 head diameter, maximum (5.54 minimum, a worn or cheap head)
    M3_CSK_HEAD_K = 1.86               # its head height, maximum

    def lift_flight_design(self) -> dict:
        """A flight's printed cap on its welded cleat, in the flight's own frame: x off the belt's back, z along the
        travel with z = 0 the middle of the finger plate (the plate spans +-finger_t/2, the leading face up), the
        cleat behind it and the pad behind that.

        Moment: a ball's weight W sits on the plate up to finger_l out, so the plate puts a moment W finger_l into the
        belt. It tips the plate's tip back, so the pad presses into the belt (and the belt into the spine's strip) while
        the cleat's foot pulls the belt off it. The pad's pressure is taken as rising linearly from its near end (the
        cap pivots on the cleat's foot), so the push acts two thirds of the way along the pad. `lift_design` uses
        that arm for the belt's sliding on the strip. With no cap the couple is across the cleat's foot, taken as half
        the foot.

        The pad's length: round a pulley the pad stays a tangent while the belt wraps away under it, so its far corner
        swings out to sqrt(r_out^2 + L^2) from the pulley's axis; that must stay inside the finger tips' sweep, which
        the boot, the hood and the belt's envelope are drawn round.

        Jam: a ball caught between a plate and the boot or the hood stops the belt, and the gearmotor's stall torque
        then pushes on one plate: its root bending stress and the weld's peel are checked at that pull.
        """
        r_out, sweep = self.lift_r_out, self.lift_r_sweep
        h = self.lift_finger_t / 2
        z_cleat0, z_cleat1 = -h - self.lift_cleat_t, -h                 # cleat's trailing and leading faces
        z_pad0 = z_cleat0 - 0.5                                          # pad starts just behind the cleat
        reach = math.sqrt(max((sweep - self.lift_cap_sweep_clear) ** 2 - r_out ** 2, 0.0))
        z_pad1 = -reach                                                  # far end, measured from the plate's middle
        pad_l = z_pad0 - z_pad1
        z_foot = (z_cleat0 + z_cleat1) / 2
        arm = (z_foot - z_pad0) + 2 * pad_l / 3
        arm_cleat = self.lift_cleat_foot / 2
        w = self.ball_g / 1000 * 9.81
        n_pad = w * self.lift_finger_l / arm
        n_cleat = w * self.lift_finger_l / arm_cleat
        jam_n = self.lift_motor_nm * self.lift_stall_factor / (self.lift_pd / 2000)
        z_plate = self.lift_finger_w * self.lift_finger_t ** 2 / 6
        jam_mpa = jam_n * self.lift_finger_l / z_plate
        jam_peel_n = jam_n * self.lift_finger_l / arm
        nut_low = self.lift_cap_pin_x - max(self.M3_NUT_AC, self.M3_WASHER_OD) / 2
        csk_depth = (self.lift_cap_csk_d - self.M3_HOLE) / 2               # a 90 deg cone: depth = radial step
        return {
            "pad_mm": pad_l, "pad_z": (z_pad1, z_pad0), "cleat_z": (z_cleat0, z_cleat1), "arm_mm": arm,
            "arm_cleat_mm": arm_cleat, "pad_push_n": n_pad, "cleat_push_n": n_cleat,
            "pad_corner_r": math.sqrt(r_out ** 2 + reach ** 2), "jam_n": jam_n, "jam_mpa": jam_mpa,
            "jam_peel_n": jam_peel_n, "nut_clear_mm": nut_low - self.lift_cap_pad_t,
            "pin_edge_mm": self.lift_cleat_h - self.lift_cap_pin_x - self.M3_HOLE / 2,
            "pad_gap_mm": self.lift_gap - self.lift_cap_pad_t,
            "cap_len_mm": h - z_pad1,
            # a 90 deg head in a 90 deg seat sits this far proud of the plate's leading face (negative: under it)
            "csk_depth_mm": csk_depth, "head_proud_mm": (self.M3_CSK_HEAD_D - self.lift_cap_csk_d) / 2,
            "screw_past_mm": self.lift_cap_screw - self.lift_finger_t - self.lift_cleat_t,
        }

    def check_lift(self) -> list[str]:
        bad = []
        d = self.lift_design()
        r = self.ball_d / 2
        if self.lift_inlet_slope < self.trough_slope_factor * self.trough_crr:
            bad.append(f"lift inlet falls only {d['inlet_slope_deg']:.1f} deg from the sump to the boot floor; a stopped ball "
                       f"needs tan {self.trough_slope_factor * self.trough_crr:.3f} to start again")
        if not 0.0 < d["finger_offset_mm"] < 0.8 * r:
            bad.append(f"lift fingers ({self.lift_finger_l:g} mm) do not hold a ball against the front rod "
                       f"(offset {d['finger_offset_mm']:.1f} mm of a {r:g} mm radius)")
        if d["rate_per_min"] < self.lift_rate_min:
            bad.append(f"lift takes about {d['rate_per_min']:.0f} balls a minute, under the {self.lift_rate_min:g} wanted")
        if d["torque_margin"] < self.lift_torque_factor:
            bad.append(f"lift motor's {self.lift_motor_nm:g} N m is {d['torque_margin']:.1f}x the {d['torque_nm']:.2f} N m "
                       f"needed with every flight loaded; {self.lift_torque_factor:g}x wanted")
        front_rail = self.head_x + self.post_dx - self.rail_w / 2
        rear_rail = self.head_x - self.post_dx + self.rail_w / 2
        if self.lift_x_front + self.lift_wall > front_rail - 2.0:
            bad.append("lift boot's front wall meets the front mast rail")
        if self.lift_x_pulley - self.lift_r_sweep < rear_rail + 3.0:
            bad.append("lift's returning fingers meet the rear mast rail")
        xr, xf = self.tub_opening_x()
        (xt, yt) = self.chute_target
        ro = self.hose_id / 2 + self.sump_wall
        if not (xr + ro <= xt <= xf - ro and abs(yt) + ro <= self.tub_w / 2 - self.tub_wall):
            bad.append("chute does not end over the tub's opening")
        if not 90.0 < self.lift_hood_deg < 150.0:
            bad.append("lift hood must let the ball go between 90 and 150 deg past the top")
        if self.lift_drop_deg < 20.0:
            bad.append("lift head's drop floor is too flat to turn a finger's push toward the chute")
        if self.chute_slope_deg < math.degrees(math.atan(self.trough_slope_factor * self.trough_crr)):
            bad.append("chute is too flat for a stopped ball to start again")
        t = self.lift_tension_design()
        if t["slack_n"] <= 0:
            bad.append(f"lift belt's slack strand goes slack ({t['slack_n']:.1f} N): raise lift_tension_factor over 0.5")
        if t["off_lo_mm"] > -self.lift_tooth_h:
            bad.append("lift head cannot come down far enough to slip the belt over the top pulley's teeth")
        if t["jack_each_n"] > self.lift_jack_nut_n:
            bad.append(f"lift tensioner's jack screws take {t['jack_each_n']:.0f} N each, over a printed nut's "
                       f"{self.lift_jack_nut_n:g} N")
        if t["clip_n"] > 2 * self.lift_clip_slip_n:
            bad.append(f"lift tensioner pushes the top clip down with {t['clip_n']:.0f} N, more than its two T-nuts hold")
        f = self.lift_flight_design()
        if f["pad_mm"] < 5.0:
            bad.append("lift flight caps have no room for a pad behind the cleat inside the fingers' sweep")
        if f["pad_gap_mm"] < 0.5:
            bad.append("lift flight caps' pads are too thick to pass under a waiting ball in the channel's gap")
        if f["nut_clear_mm"] < 0.5:
            bad.append("lift flight caps' M3 nuts sit on the pad: raise lift_cap_pin_x")
        if f["pin_edge_mm"] < 1.5:
            bad.append("lift flight caps' M3 holes are too near the cleat's top")
        if f["jam_mpa"] > self.lift_cap_allow_mpa:
            bad.append(f"lift flight plate takes {f['jam_mpa']:.0f} MPa when a jam stalls the motor, over "
                       f"{self.lift_cap_allow_mpa:g} MPa")
        if f["jam_peel_n"] > self.lift_cleat_weld_n:
            bad.append(f"lift cleat's weld peels at a stalled jam ({f['jam_peel_n']:.0f} N over "
                       f"{self.lift_cleat_weld_n:g} N)")
        if f["head_proud_mm"] > 0.0:
            bad.append(f"lift flight caps' countersinks ({self.lift_cap_csk_d:g} mm) are narrower than an M3 countersunk "
                       f"head ({self.M3_CSK_HEAD_D:g} mm): it stands {f['head_proud_mm']:.2f} mm proud on the seat's rim")
        if f["csk_depth_mm"] > self.M3_CSK_HEAD_K or f["csk_depth_mm"] > self.lift_finger_t / 2:
            bad.append("lift flight caps' countersinks are deeper than the head or half the plate")
        if self.lift_cap_pin_y + max(self.M3_NUT_AC, self.M3_WASHER_OD) / 2 > self.lift_belt_w / 2 or self.lift_cap_cheek < 1.5:
            bad.append("lift flight caps' screws or cheeks do not fit the cleat's width")
        if self.lift_belt_w / 2 + self.lift_cap_cheek > self.lift_finger_w / 2 + 1e-9:
            bad.append("lift flight caps' cheeks stand outside the plate")
        return bad

    def lift_motor_model(self) -> dict:
        """The lift gearmotor as a DC motor seen at its output shaft, from the assumed class figures.

        Winding resistance from the stall current at `supply_v`; torque per amp from the stall torque (rated x
        `lift_stall_factor`, the figure the flight caps' jam check uses) over the stall current less the no-load current;
        back-EMF per rad/s from the no-load speed. Their ratio is the gearbox and motor's efficiency the figures imply
        (low for a spur gearbox: the stall torque assumed is on the cautious side for the cap). Inertia at the output is
        the rotor's times the ratio squared, plus the belt, its caps and 15 balls at the pulley's radius."""
        r = self.lift_pd / 2000
        rw = self.supply_v / self.lift_motor_stall_a
        t_stall = self.lift_motor_nm * self.lift_stall_factor
        kt = t_stall / (self.lift_motor_stall_a - self.lift_motor_noload_a)
        w0 = self.lift_motor_rpm * 2 * math.pi / 60
        ke = (self.supply_v - self.lift_motor_noload_a * rw) / w0
        d = self.lift_design()
        moving_kg = self.lift_belt_kg_m * d["belt_mm"] / 1000 + d["flights"] * 0.005 + d["balls_up"] * self.ball_g / 1000
        j = self.lift_rotor_kgm2 * self.lift_gear_ratio ** 2 + moving_kg * r * r
        lead_ohm = self.deck_cable_electrics()["lift"]["lift_drop_v"] / self.lift_motor_stall_a
        return {"r_m": r, "winding_ohm": rw, "lead_ohm": lead_ohm, "kt": kt, "ke": ke, "efficiency": kt / ke,
                "stall_nm": t_stall, "noload_rad_s": w0, "j_kgm2": j, "moving_kg": moving_kg,
                "m_eff_kg": j / (r * r), "l_h": self.lift_motor_mh / 1000,
                "tau_e_s": self.lift_motor_mh / 1000 / rw, "tau_m_s": j * rw / (kt * ke)}

    def lift_duty_at(self, volts: float) -> float:
        """The lift's running duty on a battery at `volts` (firmware `LiftRun.run_duty`): `lift_duty`, scaled by
        `lift_v_ref` / volts above `lift_v_ref`, never under `lift_duty_min`; `lift_v_ref` 0 keeps it fixed."""
        if not self.lift_v_ref:
            return self.lift_duty
        return self.lift_duty * max(self.lift_duty_min, min(1.0, self.lift_v_ref / volts))

    def lift_shunt_series(self, duty: float) -> float:
        """The shunt's share of the lift motor's mean loop resistance at `duty`: all of it high side (in the diode's
        loop it carries the current all cycle), duty x R low side (in the MOSFET's source it carries it only while on)."""
        return self.lift_shunt_ohm if self.lift_sense_side == "high" else duty * self.lift_shunt_ohm

    def lift_jam_cutoff(self) -> dict:
        """Trip current, its spread, and what it does to a start and to a jam (2026-11-15).

        Trip: the comparator switches when the filtered shunt voltage, duty x I x R_shunt, passes the divider's
        reference. Its spread takes the 3.3 V rail, both resistors at their tolerance and the comparator's offset at its
        worst. The lowest trip must leave the motor `lift_torque_factor` times the full belt's torque (the torque rule
        `check_lift` applies to the motor); the highest must sit `lift_stall_trip_margin` under the stall current with
        the winding hot and the pack at its low-battery cut, through the lead and the shunt, or a jam would never trip.

        Start: from rest the motor draws its stall current, falling with the mechanical time constant toward its
        running current; the time it stays over the lowest trip current (first-order, full belt, cold winding at the
        charger's voltage) times `lift_blank_factor` must fit in the blanking time. tests/lift_jam_sweep.py checks the
        same on the real firmware with the electrical lag and the filter.

        Stall: with the cutoff a stalled motor is cut after at most blank + trip + one 10 ms tick (+ the filter), and
        retried `lift_jam_retries` times; without it the stall holds for the run-on (and again after every ball fed).

        Duty (2026-11-15, "Lift duty follows the battery"): the shunt sees current only while the MOSFET conducts, so
        the trip in motor amps is the reference over duty x R_shunt, and a duty held down on a full pack raises it. The
        motor's mean voltage is duty x V less I x (winding + lead) less duty x I x R_shunt. So every rule is taken at
        both packs at its own duty (`lift_duty_at`): the stall margin at the worse of the hot 24 V and hot 29.2 V
        stalls, the start at the worse of the two cold starts. `trip_*_a` stay the full-duty figures (at the cut).

        High side (`lift_sense_side` "high", 2026-11-15, "Lift current sense inside the diode loop"): the shunt is in
        the motor's + lead inside the loop the flyback diode closes, so it carries the motor's current at every point
        of the PWM cycle, and an INA186-class amplifier gives gain x I x R_shunt at any duty. The trip in motor amps is
        the reference over gain x R_shunt, its spread taking the amplifier's gain error and input offset and the
        shunt's tolerance as well, and it is the same on both packs (`trip_hi_a_full_pack` = `trip_hi_a`). The motor's
        mean voltage is duty x V less I x (winding + lead + R_shunt)."""
        m = self.lift_motor_model()
        g = lambda tol: 3.3 * (1 + tol * self.lift_rail_tol)          # noqa: E731
        def vref(sign):
            r1 = self.lift_sense_r1 * (1 - sign * self.lift_res_tol)
            r2 = self.lift_sense_r2 * (1 + sign * self.lift_res_tol)
            return g(sign) * r2 / (r1 + r2) + sign * self.lift_sense_offset_v
        v_nom = 3.3 * self.lift_sense_r2 / (self.lift_sense_r1 + self.lift_sense_r2)
        # the lowest duty the firmware can drive is the floor, which the full pack's duty sits at or over
        d_lo = self.lift_duty_at(self.battery_v_min)
        d_hi = self.lift_duty * self.lift_duty_min if self.lift_v_ref else self.lift_duty
        high = self.lift_sense_side == "high"
        if high:
            rs, gain = self.lift_shunt_ohm, self.lift_sense_gain
            def amps(sign):
                return (vref(sign) / (gain * (1 - sign * self.lift_sense_gain_tol) * rs * (1 - sign * self.lift_shunt_tol))
                        + sign * self.lift_sense_amp_offset_v / rs)
            i_nom, i_lo, i_hi = v_nom / (gain * rs), amps(-1), amps(1)
        else:
            to_a = 1 / (self.lift_shunt_ohm * d_lo)
            i_nom, i_lo, i_hi = v_nom * to_a, vref(-1) * to_a, vref(1) * to_a

        def trip_at(i_trip, duty):
            """The trip in motor amps at `duty`: fixed high side; low side, the cut's figure scaled by d_lo / duty."""
            return i_trip if high else i_trip * d_lo / duty
        d = self.lift_design()
        i_run = self.lift_motor_noload_a + d["torque_nm"] / m["kt"]
        trip_nm_lo = m["kt"] * (i_lo - self.lift_motor_noload_a)
        hot_ohm = m["winding_ohm"] * (1 + 0.00393 * self.lift_hot_rise_k)

        def stall(v, duty, ohm):
            return duty * v / (ohm + m["lead_ohm"] + self.lift_shunt_series(duty))

        def over_s(i_stall, i_trip):
            if not (i_trip > i_run and i_stall > i_trip):
                return math.inf if i_trip <= i_run else 0.0
            return m["tau_m_s"] * math.log((i_stall - i_run) / (i_trip - i_run))

        packs = ((self.battery_v_min, d_lo), (self.battery_v_max, d_hi))
        margins = [stall(v, du, hot_ohm) / trip_at(i_hi, du) for v, du in packs]
        starts = [over_s(stall(v, du, m["winding_ohm"]), trip_at(i_lo, du)) for v, du in packs]
        i_stall_hot = stall(self.battery_v_min, d_lo, hot_ohm)
        i_stall_cold = max(stall(v, du, m["winding_ohm"]) for v, du in packs)
        start_over_s = max(starts)
        i_unreg = stall(self.battery_v_max, self.lift_duty, m["winding_ohm"])   # no good battery reading: fixed duty
        dwell_s = (self.lift_jam_blank_ms + self.lift_jam_trip_ms + 10.0) / 1000 + 3 * self.lift_sense_rc_s
        stall_w = i_stall_cold ** 2 * m["winding_ohm"]
        run_on_s = d["run_on_s"]
        fuse = next(b["fuse_a"] for b in self.power_distribution()["branches"] if b["name"].startswith("lift"))
        f = self.lift_flight_design()
        plate_n = self.lift_cap_allow_mpa * self.lift_finger_w * self.lift_finger_t ** 2 / 6 / self.lift_finger_l
        weld_n = self.lift_cleat_weld_n * f["arm_mm"] / self.lift_finger_l
        return {
            "vref_v": v_nom, "trip_a": i_nom, "trip_lo_a": i_lo, "trip_hi_a": i_hi, "run_a": i_run,
            "trip_nm_lo": trip_nm_lo, "trip_factor": trip_nm_lo / d["torque_nm"],
            "stall_hot_a": i_stall_hot, "stall_cold_a": i_stall_cold, "stall_margin": min(margins),
            "stall_margin_lo_v": margins[0], "stall_margin_hi_v": margins[1], "duty_lo_v": d_lo, "duty_hi_v": d_hi,
            "trip_hi_a_full_pack": trip_at(i_hi, d_hi), "trip_lo_a_full_pack": trip_at(i_lo, d_hi),
            "sense": self.lift_sense_side, "sense_v_per_a": (self.lift_sense_gain if high else 1.0) * self.lift_shunt_ohm, "start_over_lo_v_s": starts[0], "start_over_hi_v_s": starts[1],
            "start_over_s": start_over_s, "blank_s": self.lift_jam_blank_ms / 1000, "dwell_s": dwell_s,
            "stall_w": stall_w, "attempt_j": stall_w * dwell_s, "cutoff_j": stall_w * dwell_s * (1 + self.lift_jam_retries),
            "uncut_j": stall_w * run_on_s, "run_on_s": run_on_s, "fuse_a": fuse, "fuse_ratio": i_stall_hot / fuse,
            "shunt_stall_w": i_unreg ** 2 * self.lift_shunt_ohm, "stall_unregulated_a": i_unreg, "shunt_run_w": i_run ** 2 * self.lift_shunt_ohm,
            "shunt_drop_v": i_unreg * self.lift_shunt_ohm, "plate_allow_n": plate_n, "weld_allow_n": weld_n,
            "motor": m,
        }

    def check_lift_jam(self) -> list[str]:
        bad = []
        c = self.lift_jam_cutoff()
        if c["trip_factor"] < self.lift_torque_factor:
            bad.append(f"lift jam cutoff can trip at {c['trip_lo_a']:.2f} A ({c['trip_nm_lo']:.2f} N m), under "
                       f"{self.lift_torque_factor:g}x the full belt's torque: raise lift_sense_r2")
        if c["stall_margin"] < self.lift_stall_trip_margin:
            v = self.battery_v_min if c["stall_margin_lo_v"] <= c["stall_margin_hi_v"] else self.battery_v_max
            bad.append(f"lift jam cutoff may never trip: a hot stall at {v:g} V, at its duty, is only "
                       f"{c['stall_margin']:.2f}x the highest trip there; "
                       f"{self.lift_stall_trip_margin:g}x wanted: lower lift_sense_r2 or raise lift_shunt_ohm")
        if not math.isfinite(c["start_over_s"]):
            bad.append("lift jam cutoff's trip is under the full belt's running current: every run would trip")
        elif self.lift_blank_factor * c["start_over_s"] > c["blank_s"]:
            bad.append(f"lift jam cutoff's {self.lift_jam_blank_ms:g} ms blanking is under {self.lift_blank_factor:g}x the "
                       f"{c['start_over_s'] * 1000:.0f} ms a start stays over the trip current: it would trip on starting")
        if c["shunt_stall_w"] > self.lift_shunt_w:
            bad.append(f"lift shunt takes {c['shunt_stall_w']:.1f} W at stall, over its {self.lift_shunt_w:g} W")
        if 2 * self.lift_ramp_ms > self.lift_jam_blank_ms:
            bad.append(f"lift soft start's {self.lift_ramp_ms:g} ms ramp is over half the {self.lift_jam_blank_ms:g} ms "
                       f"blanking: the motor would reach full duty with too little blanking left to settle")
        if self.lift_jam_trip_ms < 10.0:
            bad.append("lift jam cutoff needs over-current on two ticks (10 ms) so one stray reading cannot trip it")
        return bad

    def lift_sense_ripple(self, duty: float | None = None, volts: float | None = None, amps: float | None = None) -> dict:
        """The 20 kHz PWM ripple through the high-side sense path, analytic (2026-11-15; cad/README.md "Sense amplifier
        against the PWM ripple"; tests/lift_sense_ripple_sweep.py checks it against a switched simulation).

        Ripple: with the motor's electrical time constant (L / R, 0.46 ms) long against the 50 us period, the current is
        a triangle, rising while the MOSFET conducts (the pack less the back-EMF and the loop's I x R across L) and
        falling while the diode freewheels (the diode's drop plus the same across L). With the mean voltage balancing
        them, its peak to peak is (V + Vd) x D x (1 - D) / (L x f), largest at D = 0.5 (the soft start passes it) and
        zero at full duty. High side the shunt carries the whole triangle; the amplifier's single pole and the 1 ms RC
        pass each harmonic of the asymmetric triangle at their gains (harmonic n of a triangle rising for D of the
        period: pp x |sin(pi n D)| / (pi^2 n^2 D (1 - D))), and the ripple left at the comparator is twice their sum,
        an upper bound. A linear filter passes the mean untouched; what could move it is non-linear: the amplifier
        slewing (the steepest edge is the on-phase's, (V + Vd) x (1 - D) / L x gain x R) or its output reaching the
        rail on the triangle's peaks (which reads low). Delay: the pole's 1 / (2 pi BW).

        `duty`, `volts`, `amps` default to the worst case each rule wants: D = 0.5 at the charger's voltage (most
        ripple), and the held duty's cold stall for the rail."""
        m = self.lift_motor_model()
        c = self.lift_jam_cutoff()
        v = self.battery_v_max if volts is None else volts
        d = 0.5 if duty is None else duty
        vd = 0.7
        f, l, g = self.lift_pwm_hz, m["l_h"], c["sense_v_per_a"]
        if self.lift_sense_side != "high":
            g = self.lift_shunt_ohm        # low side the comparator sees the shunt itself (and only while on)
        pp_a = (v + vd) * d * (1 - d) / (l * f)
        bw = self.lift_sense_bw_hz if self.lift_sense_side == "high" else math.inf
        rc = self.lift_sense_rc_s

        def gain_at(hz):
            amp = 1 / math.sqrt(1 + (hz / bw) ** 2) if math.isfinite(bw) else 1.0
            return amp / math.sqrt(1 + (2 * math.pi * hz * rc) ** 2)
        comp_pp_v = 0.0
        if 0 < d < 1:
            for n in range(1, 60):
                comp_pp_v += 2 * pp_a * g * abs(math.sin(math.pi * n * d)) / (math.pi ** 2 * n * n * d * (1 - d)) * gain_at(n * f)
        edge_v_us = (v + vd) * (1 - d) / l * g / 1e6
        i_mean = c["stall_cold_a"] if amps is None else amps
        rail = 3.3 * (1 - self.lift_rail_tol) - self.lift_sense_headroom_v
        peak_v = (i_mean + pp_a / 2) * g
        spread_a = c["trip_hi_a"] - c["trip_lo_a"]
        return {"duty": d, "volts": v, "pp_a": pp_a, "amp_pp_v": pp_a * g * (1 / math.sqrt(1 + (f / bw) ** 2) if math.isfinite(bw) else 1.0),
                "comp_pp_v": comp_pp_v, "comp_pp_a": comp_pp_v / g, "spread_a": spread_a,
                "ripple_share": comp_pp_v / g / spread_a, "edge_v_us": edge_v_us,
                "slew_factor": self.lift_sense_slew_v_us / edge_v_us if edge_v_us > 0 else math.inf,
                "delay_us": 1e6 / (2 * math.pi * bw) if math.isfinite(bw) else 0.0, "rail_v": rail, "peak_v": peak_v,
                "clips": peak_v > rail, "rc_corner_hz": 1 / (2 * math.pi * rc)}

    def check_lift_sense_ripple(self) -> list[str]:
        bad = []
        if self.lift_sense_side != "high":
            return bad
        r = self.lift_sense_ripple()
        if r["ripple_share"] > self.lift_sense_ripple_share:
            bad.append(f"lift sense: {r['comp_pp_a'] * 1000:.0f} mA of PWM ripple reaches the comparator at D = 0.5, over "
                       f"{self.lift_sense_ripple_share:.0%} of the trip's {r['spread_a'] * 1000:.0f} mA spread: lengthen "
                       f"lift_sense_rc_s or raise lift_pwm_hz")
        worst_edge = max(self.lift_sense_ripple(duty=dd)["edge_v_us"] for dd in (0.1, 0.5, 0.82))
        if self.lift_sense_slew_v_us < self.lift_sense_slew_factor * worst_edge:
            bad.append(f"lift sense amplifier's {self.lift_sense_slew_v_us:g} V/us slew is under "
                       f"{self.lift_sense_slew_factor:g}x the ripple's steepest edge ({worst_edge:.3f} V/us): it would "
                       f"slew-limit and bend the mean it reads")
        held = self.lift_sense_ripple(duty=self.lift_duty_at(self.battery_v_max))
        c = self.lift_jam_cutoff()
        vref_hi = c["trip_hi_a"] * c["sense_v_per_a"]
        if held["clips"] and held["rail_v"] < 2 * vref_hi:
            bad.append(f"lift sense amplifier clips at {held['rail_v']:.2f} V on the held duty's stall, under twice the "
                       f"highest reference ({vref_hi:.2f} V): a clipped stall might not read over the trip")
        return bad

    def lift_slip_design(self) -> dict:
        """The drive pulley's friction slip hub (2026-11-15; cad/README.md "Lift slip coupling").

        Two inertias joined by friction: the motor side (the rotor through the gearbox, `lift_rotor_kgm2` x ratio^2) and
        the belt side (belt, caps and balls at the pulley's radius). Stuck, the hub passes whatever keeps them turning
        together; past its sticking torque it slides and passes the sliding torque, `lift_slip_kinetic` of it, until the
        two speeds meet again.

        Start: from rest the motor puts out its cold stall torque; stuck, the belt side takes the full belt's torque
        plus its share of the acceleration, J_belt / J_total of the rest. The lowest sticking torque must be
        `lift_slip_start_factor` times that and `lift_torque_factor` times the full belt's torque.
        Trip: while it slides at speed the motor draws its no-load current plus sliding torque / kt; at the lowest
        sliding torque that must be `lift_slip_trip_margin` over the cutoff's highest trip, or a jam would slide for
        the whole run-on with nothing cut and no flag.
        Impact (estimate; tests/lift_jam_sweep.py runs it on the real firmware): stuck, the hub slips once the ball's
        force is T_stick / r / (1 - J_belt / J_total); then the belt side is a mass on the ball's spring under the
        sliding torque, so its peak is F0 + sqrt((F_slip - F0)^2 + k m v^2), F0 = (T_slide - T_belt) / r, at the
        highest torques and the cold pack's speed. It must stay under the cap plate's allowance.
        Spring: the axial force F that makes T = mu F r_eff n (r_eff of an annulus, 2/3 (R^3 - r^3) / (R^2 - r^2))."""
        m = self.lift_motor_model()
        c = self.lift_jam_cutoff()
        d = self.lift_design()
        r = m["r_m"]
        j_m = self.lift_rotor_kgm2 * self.lift_gear_ratio ** 2
        j_b = m["moving_kg"] * r * r
        share = j_b / (j_m + j_b)
        t_belt = d["torque_nm"]
        t_f = m["kt"] * self.lift_motor_noload_a
        t_stall_cold = m["kt"] * (c["stall_cold_a"] - self.lift_motor_noload_a)
        t_start = t_belt + share * (t_stall_cold - t_f - t_belt)
        lo, hi = self.lift_slip_nm * (1 - self.lift_slip_tol), self.lift_slip_nm * (1 + self.lift_slip_tol)
        slide_lo, slide_hi = lo * self.lift_slip_kinetic, hi * self.lift_slip_kinetic
        i_slide_lo = self.lift_motor_noload_a + slide_lo / m["kt"]
        v_cold = d["speed_m_s"] * self.battery_v_max / self.supply_v
        f0 = (slide_hi - t_belt) / r
        f_slip = hi / r / (1 - share)
        peak = f0 + math.sqrt((f_slip - f0) ** 2 + self.ball_k_n_m * m["moving_kg"] * v_cold ** 2)
        ro, ri = self.lift_slip_od / 2000, self.lift_slip_id / 2000
        r_eff = 2 / 3 * (ro ** 3 - ri ** 3) / (ro ** 2 - ri ** 2)
        spring_n = self.lift_slip_nm / (self.lift_slip_mu * r_eff * self.lift_slip_faces)
        w0 = m["noload_rad_s"] * self.battery_v_max / self.supply_v
        slide_w = slide_hi * w0
        # the stack along the shaft from the pulley's faces (the pulley is belt_w + 5 wide, centred on lift_y)
        half = (self.lift_belt_w + 5.0) / 2
        motor_side = self.lift_slip_facing_t + self.lift_slip_plate_t + self.lift_slip_collar_w
        far_side = motor_side + self.lift_slip_spring()["stack_mm"]
        wall_in = self.lift_depth / 2
        shaft_mm = wall_in + self.lift_wall + half + far_side         # from the gearmotor's face
        rigid_shaft_mm = wall_in + self.lift_wall + half
        return {
            "j_motor": j_m, "j_belt": j_b, "belt_share": share, "start_nm": t_start, "stick_lo_nm": lo,
            "stick_hi_nm": hi, "slide_lo_nm": slide_lo, "slide_hi_nm": slide_hi, "start_factor": lo / t_start,
            "belt_factor": lo / t_belt, "slide_lo_a": i_slide_lo, "trip_margin": i_slide_lo / c["trip_hi_a_full_pack"],
            "peak_n": peak, "plate_allow_n": c["plate_allow_n"],
            "plate_margin": c["plate_allow_n"] / peak, "set_n": self.lift_slip_nm / r, "set_lo_n": lo / r,
            "set_hi_n": hi / r, "r_eff_mm": r_eff * 1000, "spring_n": spring_n, "slide_w": slide_w,
            "slide_j": slide_w * c["dwell_s"], "half_pulley_mm": half, "motor_side_mm": motor_side,
            "far_side_mm": far_side, "wall_gap_mm": wall_in - half - motor_side, "far_gap_mm": wall_in - half - far_side,
            "shaft_mm": shaft_mm, "rigid_shaft_mm": rigid_shaft_mm,
        }

    def check_lift_slip(self) -> list[str]:
        bad = []
        s = self.lift_slip_design()
        if s["start_factor"] < self.lift_slip_start_factor:
            bad.append(f"lift slip hub may slip on a start: its lowest {s['stick_lo_nm']:.2f} N m is "
                       f"{s['start_factor']:.2f}x the {s['start_nm']:.2f} N m a cold start passes "
                       f"({self.lift_slip_start_factor:g}x wanted): raise lift_slip_nm")
        if s["belt_factor"] < self.lift_torque_factor:
            bad.append(f"lift slip hub's lowest {s['stick_lo_nm']:.2f} N m is under {self.lift_torque_factor:g}x the full "
                       f"belt's torque: raise lift_slip_nm")
        if s["trip_margin"] < self.lift_slip_trip_margin:
            bad.append(f"lift slip hub sliding at {s['slide_lo_nm']:.2f} N m draws {s['slide_lo_a']:.2f} A, "
                       f"{s['trip_margin']:.2f}x the cutoff's highest trip at the lowest duty "
                       f"({self.lift_slip_trip_margin:g}x wanted): "
                       f"a jam would slide unseen; lower lift_sense_r2 or raise lift_slip_nm")
        if s["peak_n"] > s["plate_allow_n"]:
            bad.append(f"lift slip hub lets a jam put {s['peak_n']:.0f} N on a flight cap, over its plate's "
                       f"{s['plate_allow_n']:.0f} N: lower lift_slip_nm or lift_slip_tol")
        if min(s["wall_gap_mm"], s["far_gap_mm"]) < 2.0:
            bad.append(f"lift slip hub's stack leaves {min(s['wall_gap_mm'], s['far_gap_mm']):.1f} mm to the boot's wall "
                       f"(2 mm wanted)")
        sp = self.lift_slip_spring()
        if sp["set_share"] > self.lift_slip_spring_flat_max:
            bad.append(f"lift slip hub needs {s['spring_n']:.0f} N of spring, {sp['set_share']:.0%} of the disc stack's "
                       f"stroke ({sp['flat_n']:.0f} N flat; {self.lift_slip_spring_flat_max:.0%} wanted): a bigger facing "
                       f"or a stiffer spring")
        return bad + self.check_lift_slip_wear()

    def disc_spring_n(self, s_mm: float, t: float = None, h0: float = None) -> float:
        """One disc spring's load at deflection `s_mm` (Almen-Laszlo, as DIN 2093 for springs without bearing flats):
        F = 4E/(1-nu^2) t^4/(K1 De^2) (s/t) [(h0/t - s/t)(h0/t - s/2t) + 1], K1 = (1/pi) ((d-1)/d)^2 /
        ((d+1)/(d-1) - 2/ln d), d = De/Di. Checked against DIN 2093 A 8 (8 x 4.2 x 0.4, h0 0.2): 210 N at 0.75 h0."""
        t = self.lift_slip_spring_t if t is None else t
        h0 = self.lift_slip_spring_h0 if h0 is None else h0
        de, di = self.lift_slip_spring_de, self.lift_slip_spring_di
        d = de / di
        k1 = ((d - 1) / d) ** 2 / ((d + 1) / (d - 1) - 2 / math.log(d)) / math.pi
        e = self.lift_slip_spring_e_mpa / (1 - self.lift_slip_spring_nu ** 2)
        a, b = h0 / t, s_mm / t
        return 4 * e * t ** 4 / (k1 * de * de) * b * ((a - b) * (a - b / 2) + 1)

    def lift_slip_spring(self) -> dict:
        """The slip hub's disc stack (2026-11-16; cad/README.md "Slip hub wear"): `lift_slip_spring_count` discs in
        series share the load and add their deflections. The set deflection is where the stack gives the hub's axial
        force (T = mu F r_eff n); the rate there is what turns lost facing thickness into lost torque."""
        ro, ri = self.lift_slip_od / 2000, self.lift_slip_id / 2000
        r_eff = 2 / 3 * (ro ** 3 - ri ** 3) / (ro ** 2 - ri ** 2)
        need = self.lift_slip_nm / (self.lift_slip_mu * r_eff * self.lift_slip_faces)
        n, h0 = self.lift_slip_spring_count, self.lift_slip_spring_h0
        stroke = n * h0

        def load(s_total):
            return self.disc_spring_n(min(max(s_total, 0.0), stroke) / n)

        lo, hi = 0.0, stroke
        for _ in range(60):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if load(mid) < need else (lo, mid)
        s_set = (lo + hi) / 2
        rate = (load(s_set + 1e-3) - load(s_set - 1e-3)) / 2e-3 / 1000          # N per um
        return {"need_n": need, "set_mm": s_set, "stroke_mm": stroke, "set_share": s_set / stroke,
                "flat_n": load(stroke), "rate_n_um": rate, "stack_mm": n * (self.lift_slip_spring_t + h0) - s_set,
                "load": load}

    def lift_slip_wear(self) -> dict:
        """The hub's torque as the facings lose thickness (2026-11-16; cad/README.md "Slip hub wear").

        The bench set fixes collar B, so every micron the facings lose (bedding-in, compression set, sliding wear, a
        cold facing shrinking) comes off the disc stack's deflection, and a warm facing growing adds to it. The torque
        scales with the stack's load: T(L) = T_set F(s_set - L) / F(s_set). The band the jam sweep proves
        (`lift_slip_tol` either side of `lift_slip_nm`) must hold the worn hub at its lowest setting and friction,
        T_set (1 - set_tol)(1 - mu_spread) F(s_set - L)/F(s_set), and the new hub at its highest, warm,
        T_set (1 + set_tol)(1 + mu_spread) F(s_set + growth)/F(s_set).
        Loss L = `lift_slip_loss_um` (bedding and set) + the cold shrink + `lift_slip_jams` jams of sliding wear at
        `lift_slip_wear_mm3_kj` over the facings' faces (each jam slides `lift_slip_design`'s slide_j). The budget is
        the largest L that keeps the worn corner in the band."""
        sp = self.lift_slip_spring()
        d = self.lift_slip_design()
        f0, load, s_set = sp["need_n"], sp["load"], sp["set_mm"]
        both_t_um = 2 * self.lift_slip_facing_t * 1000
        shrink_um = -self.lift_slip_temp_k[0] * self.lift_slip_facing_cte * both_t_um
        grow_um = self.lift_slip_temp_k[1] * self.lift_slip_facing_cte * both_t_um
        area = math.pi / 4 * (self.lift_slip_od ** 2 - self.lift_slip_id ** 2)          # one face, mm^2
        jam_um = self.lift_slip_wear_mm3_kj * 1e-3 * d["slide_j"] / (self.lift_slip_faces * area) * 1000
        loss_um = self.lift_slip_loss_um + shrink_um + self.lift_slip_jams * jam_um

        def ratio(l_um):
            return load(s_set - l_um / 1000) / f0

        low_k = (1 - self.lift_slip_set_tol) * (1 - self.lift_slip_mu_spread)
        high_k = (1 + self.lift_slip_set_tol) * (1 + self.lift_slip_mu_spread)
        floor = 1 - self.lift_slip_tol
        a, b = 0.0, s_set * 1000
        if low_k * ratio(0) < floor:
            budget = 0.0
        else:
            for _ in range(60):
                m = (a + b) / 2
                a, b = (m, b) if low_k * ratio(m) >= floor else (a, m)
            budget = a
        nm = self.lift_slip_nm
        return {
            "set_um": s_set * 1000, "rate_n_um": sp["rate_n_um"], "shrink_um": shrink_um, "grow_um": grow_um,
            "jam_um": jam_um, "loss_um": loss_um, "budget_um": budget,
            "jams_to_budget": max(0.0, budget - self.lift_slip_loss_um - shrink_um) / jam_um if jam_um > 0 else math.inf,
            "lo_nm": nm * low_k * ratio(loss_um), "hi_nm": nm * high_k * ratio(-grow_um),
            "band_lo_nm": nm * floor, "band_hi_nm": nm * (1 + self.lift_slip_tol),
            "sweep": [(l, ratio(l), nm * low_k * ratio(l)) for l in self.lift_slip_loss_sweep_um],
        }

    def check_lift_slip_wear(self) -> list[str]:
        w = self.lift_slip_wear()
        bad = []
        if w["lo_nm"] < w["band_lo_nm"]:
            bad.append(f"lift slip hub's facings lose {w['loss_um']:.0f} um after the set (bedding, a cold shrink, "
                       f"{self.lift_slip_jams} jams), over the disc stack's {w['budget_um']:.0f} um budget: the worn hub "
                       f"falls to {w['lo_nm']:.2f} N m, under the {w['band_lo_nm']:.2f} N m the jam sweep proves; more "
                       f"discs in series (lift_slip_spring_count) or thinner ones")
        if w["hi_nm"] > w["band_hi_nm"]:
            bad.append(f"lift slip hub's warm facings ({w['grow_um']:.0f} um of growth at {w['rate_n_um']:.2f} N/um) "
                       f"lift it to {w['hi_nm']:.2f} N m, over the {w['band_hi_nm']:.2f} N m the jam sweep proves; more "
                       f"discs in series or a facing that grows less")
        return bad

    @staticmethod
    def d_shaft_section(d: float = 6.0, flat: float = 0.5, n: int = 720) -> dict:
        """Section of a D shaft (diameter d, flat cut `flat` deep): area, the least second moment about any axis
        through the centroid, the section modulus about that axis to the farthest fibre, and a torsion modulus
        taken from the round of the across-flat size (conservative)."""
        r = d / 2
        xf = r - flat
        pts = []
        for k in range(n):
            a = 2 * math.pi * k / n
            x, y = r * math.cos(a), r * math.sin(a)
            pts.append((min(x, xf), y if x <= xf else math.copysign(math.sqrt(max(r * r - xf * xf, 0.0)), y)))
        A = cx = cy = 0.0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
            c = x0 * y1 - x1 * y0
            A += c / 2
            cx += (x0 + x1) * c / 6
            cy += (y0 + y1) * c / 6
        cx, cy = cx / A, cy / A
        ixx = iyy = 0.0
        q = [(x - cx, y - cy) for x, y in pts]
        for (x0, y0), (x1, y1) in zip(q, q[1:] + q[:1]):
            c = x0 * y1 - x1 * y0
            ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c / 12      # about the x axis (bending that puts the flat in y)
            iyy += (x0 * x0 + x0 * x1 + x1 * x1) * c / 12
        z_x = ixx / max(abs(y) for _, y in q)
        z_y = iyy / max(abs(x) for x, _ in q)
        d_flat = r + xf
        return {"area": A, "i_min": min(ixx, iyy), "z_min": min(z_x, z_y), "zp": math.pi * d_flat ** 3 / 16,
                "centroid_x": cx}

    def lift_shaft_design(self) -> dict:
        """The lift's drive shaft (2026-11-15; cad/README.md "Lift drive shaft").

        Along y from the ball line (+y is the gearmotor's side): the boot's motor face is recessed to the channel's
        wall, y_out = depth / 2. A flanged bearing sits in a counterbored pocket just inside it, and another in the
        -y wall with its flange flush with that wall's outer face. The jaw coupling starts `lift_shaft_clear` past the
        near flange; the gearmotor's face is set so its shaft fills the coupling's hub but stops `lift_shaft_clear`
        short of the spider at least, and the printed spacer between the boot and the motor is that long. The D shaft
        runs from 0.5 mm short of the spider to 0.5 mm inside the far bearing's outer face.

        Loads: the belt's two strands both pull up on the drive pulley. Taut, they sum to 2 T0 whatever the torque;
        past T = 2 T0 r the slack strand goes slack and the sum is T / r. The largest torque the pulley can pass is the
        slip hub's highest sticking torque (past it the hub slides), so the worst belt load is max(2 T0, T_hi / r).
        The shaft is simply supported by the two bearings with that load at the pulley, plus the torque, combined by
        von Mises on the D section's weakest axis. Running, 2 T0 turns with the shaft as fully reversed bending for
        every revolution of its life: a fatigue allowance. A jam's T_hi / r lasts a few revolutions (the hub slides
        and the cutoff stops the motor in 49-179 ms, tests/lift_jam_sweep.py): a static allowance. The sag that
        matters for the belt is the running one.
        Before this the pulley sat on the gearmotor's own shaft, so the whole load sat `rigid_arm_mm` out from the
        gearbox's face: `old_gm_moment_nm` against the assumed allowance `gm_radial_n` at `gm_radial_at`."""
        g = self.lift_shaft_geometry()
        s = self.lift_slip_design()
        t = self.lift_tension_design()
        r = self.lift_pd / 2000
        yn, yf = g["bearing_y"]
        f_run = 2 * t["t0_n"]
        f_jam = max(f_run, s["stick_hi_nm"] / r)
        a, b = yn, -yf
        span = a + b
        sec = self.d_shaft_section()
        m_nmm = f_jam * a * b / span
        sigma = m_nmm / sec["z_min"]
        tau = s["stick_hi_nm"] * 1000 / sec["zp"]
        vm = math.sqrt(sigma ** 2 + 3 * tau ** 2)
        t_run = self.lift_design()["torque_nm"]
        sig_run = f_run * a * b / span / sec["z_min"]
        vm_run = math.sqrt(sig_run ** 2 + 3 * (t_run * 1000 / sec["zp"]) ** 2)
        k = 3 * self.lift_shaft_E_mpa * sec["i_min"] * span
        rigid_arm = self.lift_depth / 2 + self.lift_wall     # the pulley's centre from the gearmotor's face before
        return {
            **g, "f_run_n": f_run, "f_jam_n": f_jam, "near_n": f_jam * b / span, "far_n": f_jam * a / span,
            "span_mm": span, "moment_nmm": m_nmm, "bend_mpa": sigma, "shear_mpa": tau, "vm_mpa": vm,
            "vm_run_mpa": vm_run, "defl_mm": f_run * a * a * b * b / k, "defl_jam_mm": f_jam * a * a * b * b / k,
            "section": sec, "coupler_factor": self.lift_coupler_nm / s["stick_hi_nm"],
            "rigid_arm_mm": rigid_arm, "old_gm_moment_nm": f_jam * rigid_arm / 1000,
            "gm_allow_nm": self.gm_radial_n * self.gm_radial_at / 1000,
            "old_gm_ratio": f_jam * rigid_arm / (self.gm_radial_n * self.gm_radial_at),
        }

    def lift_coupler_model(self) -> dict:
        """The drive shaft's side of the jaw coupling as an inertia, and the coupling as a spring with a gap
        (2026-11-15; cad/README.md "Lift coupling dynamics"; tests/lift_jam_sweep.py).

        Three inertias: the rotor through the gearbox (`j_motor`); the drive shaft with what is keyed to it
        (`j_shaft`: the 6 mm D shaft, the coupling's far aluminium hub, the slip hub's two steel plates and two
        collars, all as solid discs or tubes, the spider counted half); the pulley, belt, caps and balls (`j_belt`).
        The coupling joins the first two: torque k (twist - gap / 2) once the jaws touch, nothing inside the gap, plus
        the spider's damping on the coupled mode. The slip hub joins the last two. `f_*_hz` are the drive's torsional
        modes: with the hub stuck (rotor against shaft and belt) and sliding (rotor against the shaft alone)."""
        steel, alu, pu = 7900.0, 2700.0, 1200.0
        g = self.lift_shaft_geometry()

        def disc(rho, od, idd, l):                    # mm in, kg m^2 out
            ro, ri, l = od / 2000, idd / 2000, l / 1000
            m = rho * math.pi * (ro * ro - ri * ri) * l
            return 0.5 * m * (ro * ro + ri * ri)

        parts = {
            "shaft": disc(steel, 6.0, 0.0, g["shaft_mm"]),
            "coupler_hub": disc(alu, self.lift_coupler_d, 6.0, self.lift_coupler_hub_l),
            "spider_half": 0.5 * disc(pu, self.lift_coupler_d, 6.0, self.lift_coupler_spider),
            "plates": 2 * disc(steel, self.lift_slip_od, 6.0, self.lift_slip_plate_t),
            "collars": 2 * disc(steel, self.lift_slip_collar_d, 6.0, self.lift_slip_collar_w),
        }
        j_s = sum(parts.values())
        s = self.lift_slip_design()
        j_m, j_b = s["j_motor"], s["j_belt"]
        k = self.lift_coupler_k_nm_rad
        stuck = math.sqrt(k * (1 / j_m + 1 / (j_s + j_b))) / (2 * math.pi)
        sliding = math.sqrt(k * (1 / j_m + 1 / j_s)) / (2 * math.pi)
        return {"j_motor": j_m, "j_shaft": j_s, "j_belt": j_b, "parts": parts, "k_nm_rad": k,
                "backlash_rad": math.radians(self.lift_coupler_backlash_deg), "zeta": self.lift_coupler_zeta,
                "f_stuck_hz": stuck, "f_sliding_hz": sliding}

    def lift_belt_model(self, cspec_factor: float = 1.0) -> dict:
        """The belt's stretch as a fourth inertia (2026-11-15; cad/README.md "Lift belt stretch"; tests/lift_jam_sweep.py).

        The belt loop leaves the drive pulley on the up strand and comes back to it on the down strand, so the drive
        pulley holds both ends. The pulley pulls the down strand in, so that is the tight one and the up strand, paid
        out, the slack one (until 2026-11-15 this said the reverse; the model is symmetric, so no figure changed). Each strand, `centre_mm` long, is c_spec / centre stiff along its length.
        Turning the pulley by x (at its pitch radius) against the rest of the loop pulls the tight strand by x and pays
        the slack one out by x: tensions T0 + k x and T0 - k x, each floored at zero (the slack strand goes slack once
        k x passes T0, and then only the tight one holds). T0 is the static tension `lift_tension_design` sets.

        Mass: the loop's moving mass M (belt, caps, balls; `lift_motor_model`) as a bar fixed at both ends to the pulley,
        2 x centre long. Its first mode is matched by a lumped mass 4 M / pi^2 at the loop's middle (the top pulley) on
        the two strands in parallel; the rest, (1 - 4 / pi^2) M, moves with the drive pulley, so the total inertia is
        kept. The balls ride the up strand only, so this spreads them evenly round the loop: an assumption, like the
        belt's c_spec, which is swept (`lift_belt_cspec_sweep`).

        Modes with the hub stuck: the rotor (j_motor), the jaw coupling, the shaft side and pulley (j_shaft + j_pulley),
        the belt's spring (2 k r^2 as a torsional stiffness at the pulley), the belt's mass (j_mass). `f_belt_hz` is the
        belt mass on its spring with the pulley held; `f_stuck_hz` and `f_upper_hz` the chain's two modes."""
        d = self.lift_design()
        m = self.lift_motor_model()
        cm = self.lift_coupler_model()
        r = m["r_m"]
        k_strand = self.lift_belt_cspec_n * cspec_factor / (d["centre_mm"] / 1000)
        share = 4 / math.pi ** 2
        mass = m["moving_kg"]
        j_mass = share * mass * r * r
        j_pulley = (1 - share) * mass * r * r
        k_t = 2 * k_strand * r * r
        j1, j2, j3 = cm["j_motor"], cm["j_shaft"] + j_pulley, j_mass
        k1 = cm["k_nm_rad"]
        b = k1 * (1 / j1 + 1 / j2) + k_t * (1 / j2 + 1 / j3)
        c = k1 * k_t * (j1 + j2 + j3) / (j1 * j2 * j3)
        disc = math.sqrt(b * b - 4 * c)
        lo, hi = (b - disc) / 2, (b + disc) / 2
        t = self.lift_tension_design()
        return {"k_strand_n_m": k_strand, "k_torsion_nm_rad": k_t, "mass_kg": mass, "mass_share": share,
                "j_mass": j_mass, "j_pulley": j_pulley, "t0_n": t["t0_n"], "zeta": self.lift_belt_zeta,
                "slack_at_n": 2 * t["t0_n"],               # net belt force at which the slack strand goes slack
                "f_belt_hz": math.sqrt(k_t / j_mass) / (2 * math.pi),
                "f_stuck_hz": math.sqrt(lo) / (2 * math.pi), "f_upper_hz": math.sqrt(hi) / (2 * math.pi),
                "f_rigid_hz": cm["f_stuck_hz"]}

    def lift_tooth_jump_design(self, cspec_factor: float = 1.0, g_mpa: float | None = None,
                               flank_deg: float | None = None, mu: float | None = None, slack_n: float = 0.0,
                               pulley_teeth: int | None = None, pull_n: float | None = None) -> dict:
        """Will a jam's pull jump a tooth on the drive pulley? (2026-11-15; cad/README.md "Lift tooth jump").

        Strength: the catalogue's specific tooth force F_Uspec (N per mm of width per tooth in mesh, falling with the
        pulley's speed) x width x teeth in mesh (at most `lift_tooth_mesh_max`) is the pull the teeth carry.

        Ratcheting: a tooth pushed along by a force Q on a flank inclined `flank_deg` to the radius, sliding against
        friction mu, pushes the belt outward with Q tan(flank - atan mu). The wrap holds the belt down with its tension:
        per unit length T / r, so the whole wrap holds (1 / r) x the integral of T along it. The belt jumps when the
        teeth's summed push-out passes that hold (one tooth climbing alone hands its load on to the next).
        How the pull spreads over the wrap is a shear-lag problem: each tooth is a spring k_t (PU in shear over its root,
        G x root x width / height) between the pulley and the belt, and the belt between teeth stretches by T p / EA,
        EA = c_spec. So T'' = T / L^2 with L = sqrt(EA p / k_t), T = T1 at the tight strand's entry and T2 at the slack
        exit. Integral of T over the wrap's length l = L (T1 + T2) tanh(l / 2 L); push-out = (T1 - T2) tan(flank - atan mu).
        With T2 = 0 the margin does not depend on the pull at all: stiff teeth crowd the load onto the first teeth,
        where little tension is left behind them to hold the belt down. A soft tooth (L >> l) gives back the even
        share (T1 + T2) x wrap angle / 2."""
        z = pulley_teeth or self.lift_pulley_teeth
        g = self.lift_tooth_g_mpa if g_mpa is None else g_mpa
        flank = self.lift_tooth_flank_deg if flank_deg is None else flank_deg
        mu = self.lift_tooth_mu if mu is None else mu
        pull = self.lift_jam_belt_n if pull_n is None else pull_n
        p = self.lift_belt_pitch / 1000
        r = p * z / (2 * math.pi)
        wrap = math.pi                                   # equal pulleys: half a turn each
        l = wrap * r
        mesh = int(z * wrap / (2 * math.pi))
        rpm = self.lift_motor_rpm
        f0, f1 = self.lift_tooth_fuspec_n_mm, self.lift_tooth_fuspec_1200_n_mm
        fuspec = f0 + (f1 - f0) * min(rpm, 1200.0) / 1200.0
        allow = fuspec * self.lift_belt_w * min(mesh, self.lift_tooth_mesh_max)
        k_t = g * self.lift_tooth_root_mm * self.lift_belt_w / self.lift_tooth_h * 1000   # N/m per tooth
        ea = self.lift_belt_cspec_n * cspec_factor
        lam = math.sqrt(ea * p / k_t)
        t2 = slack_n
        t1 = pull + t2
        hold = lam * (t1 + t2) * math.tanh(l / (2 * lam)) / r
        push = (t1 - t2) * math.tan(math.radians(flank) - math.atan(mu))
        # slack-side tension that brings this case's margin up to the factor (both strands taut: T1 + T2 = pull + 2 T2)
        ratio = lam * math.tanh(l / (2 * lam)) / r / max(1e-9, math.tan(math.radians(flank) - math.atan(mu)))
        t2_need = max(0.0, (self.lift_tooth_jump_factor / ratio - 1) * pull / 2)
        return {"teeth": z, "mesh": mesh, "r_mm": r * 1000, "rpm": rpm, "fuspec_n_mm": fuspec, "allow_n": allow,
                "pull_n": pull, "strength_margin": allow / pull, "k_tooth_n_m": k_t, "lambda_teeth": lam / p,
                "hold_n": hold, "push_n": push, "jump_margin": hold / push if push > 0 else float("inf"),
                "first_tooth_share": 1 - math.sinh((l - p) / lam) / math.sinh(l / lam) if t2 == 0 else None,
                "slack_need_n": t2_need, "t0_need_n": t2_need + pull / 2 if t2_need > 0 else 0.0}

    def lift_tooth_jump_sweep(self, pulley_teeth: int | None = None) -> dict:
        """Every corner of c_spec x tooth stiffness x flank x friction with the slack strand at zero."""
        rows = []
        for cs in self.lift_belt_cspec_sweep:
            for g in self.lift_tooth_g_sweep:
                for fl in self.lift_tooth_flank_sweep:
                    for mu in self.lift_tooth_mu_sweep:
                        d = self.lift_tooth_jump_design(cs, g, fl, mu, pulley_teeth=pulley_teeth)
                        rows.append({"cspec": cs, "g_mpa": g, "flank": fl, "mu": mu, "margin": d["jump_margin"],
                                     "lambda_teeth": d["lambda_teeth"], "t0_need_n": d["t0_need_n"]})
        rows.sort(key=lambda x: x["margin"])
        return {"rows": rows, "worst": rows[0], "fail": [x for x in rows if x["margin"] < 1.0]}

    def check_lift_tooth(self) -> list[str]:
        bad = []
        d = self.lift_tooth_jump_design()
        if d["strength_margin"] < 1.0:
            bad.append(f"lift drive pulley's {d['mesh']} teeth in mesh carry {d['allow_n']:.0f} N, under a jam's "
                       f"{d['pull_n']:.0f} N: a wider belt or more teeth")
        if d["jump_margin"] < self.lift_tooth_jump_factor:
            bad.append(f"lift belt may jump a tooth on the drive pulley at a jam: the wrap holds {d['hold_n']:.0f} N "
                       f"against the flanks' {d['push_n']:.0f} N push-out ({d['jump_margin']:.2f}x, "
                       f"{self.lift_tooth_jump_factor:g}x wanted)")
        return bad

    # ---- lift strands' sideways modes and the loop's axial modes (2026-11-15; cad/README.md "Lift strand modes") ----
    def lift_strand_tension(self, strand: str, loaded_every: int = 1, t0_factor: float = 1.0,
                            running: bool = True) -> dict:
        """Tension along one strand, bottom (drive pulley) to top, at h = flight pitch / `LIFT_FD_PER_PITCH` spacing.

        The drive pulley is at the bottom and turns so the up strand leaves it: the belt it pulls in is the down strand,
        so running, the down strand is the tight one at the drive pulley (T0 + P / 2) and the up strand the slack one
        (T0 - P / 2), P the loaded flights' pull (`lift_design` per ball: weight, rod and strip friction). Going up,
        each strand adds its own belt and flight weight, and the up strand each loaded flight's pull too, so both meet
        the top pulley at T0 + P / 2 + their weight. Flights sit half a pitch off each pulley's tangent point, a ball on
        every `loaded_every`-th flight of the up strand (0: none). Stopped, P is 0 and the friction goes."""
        d = self.lift_design()
        g = 9.81
        span = d["centre_mm"] / 1000
        pitch = d["flight_pitch_mm"] / 1000
        npp = self.LIFT_FD_PER_PITCH
        h = pitch / npp
        n = max(4, round(span / h))
        h = span / n
        fl_nodes = [i for i in range(1, n) if (i - npp // 2) % npp == 0]
        up_loaded = set(fl_nodes[::loaded_every]) if loaded_every else set()     # the up strand's, either way
        loaded = up_loaded if strand == "up" else set()
        per_ball = d["per_ball_n"] if running else self.ball_g / 1000 * g
        pull = per_ball * len(up_loaded)
        t0 = self.lift_tension_factor * d["pull_n"] * t0_factor     # as `lift_tension_design` sets it
        t = t0 + (pull / 2 if strand == "down" else -pull / 2)
        w = self.lift_belt_kg_m * g * h
        tension = []
        for i in range(n):                             # segment from node i to node i + 1
            if i > 0 and i in fl_nodes:
                t += self.lift_flight_kg * g
                if i in loaded:
                    t += per_ball
            tension.append(t + w * (i + 0.5))
        return {"h_m": h, "n": n, "span_m": span, "tension": tension, "flight_nodes": fl_nodes, "loaded_nodes": sorted(loaded),
                "pull_n": pull, "t_bottom_n": tension[0], "t_top_n": tension[-1], "t_min_n": min(tension)}

    LIFT_FD_PER_PITCH = 16              # finite-difference nodes per flight pitch (9.4 mm): mode 40 within about 1%

    def lift_strand_modes(self, strand: str = "down", axis: str = "flat", loaded_every: int = 1,
                          t0_factor: float = 1.0, edge_ei_factor: float = 1.0, ball_moves: bool = True,
                          pin_loaded: bool = False, running: bool = True, f_max_hz: float = 100.0) -> dict:
        """Sideways (string) modes of one strand between the pulleys' tangent points, pinned there.

        `axis` "flat" moves the belt off its face (toward the balls or the spine), "edge" across its width. The strand
        is a tensioned beam: tension from `lift_strand_tension`, the belt's mass per metre, each flight's 5 g, and on
        the up strand a ball on each loaded flight when `ball_moves` (across the width a ball sits on the finger and is
        free in the channel's 3 mm, so it goes with the belt or, sliding, does not: both are run). Bending stiffness:
        flat, polyurethane alone (E = 3 G, the tooth's shear modulus) over the belt's thickness; edge, the steel cords
        spread across the width, c_spec w^2 / 12, times `edge_ei_factor` (the cords' real spread is unread; PU alone,
        E t w^3 / 12, is the floor). `pin_loaded`: the loaded up strand off its face, where each loaded flight's pad is
        pressed onto the spine's strip by its ball's moment and the ball is held by the front rod, so those flights
        are nodes (a penalty spring) and the spans between them ring on their own."""
        tp = self.lift_strand_tension(strand, loaded_every, t0_factor, running)
        h, n = tp["h_m"], tp["n"]
        w_m, t_m = self.lift_belt_w / 1000, self.lift_belt_t / 1000
        e_pu = 3 * self.lift_tooth_g_mpa * 1e6
        if axis == "flat":
            ei = e_pu * w_m * t_m ** 3 / 12
        else:
            ei_cord = self.lift_belt_cspec_n * w_m ** 2 / 12
            ei = max(e_pu * t_m * w_m ** 3 / 12, ei_cord * edge_ei_factor)
        rows = _string_beam_rows(h, tp["tension"], ei)
        mass = [self.lift_belt_kg_m * h] * (n - 1)
        for i in tp["flight_nodes"]:
            mass[i - 1] += self.lift_flight_kg
            if i in tp["loaded_nodes"] and ball_moves and not pin_loaded:
                mass[i - 1] += self.ball_g / 1000
        if pin_loaded:
            for i in tp["loaded_nodes"]:
                j0, vals = rows[i - 1]
                rows[i - 1] = (j0, vals[:-1] + [vals[-1] + 1e9])
        modes = _modes_below(rows, mass, f_max_hz) if tp["t_min_n"] > 0 else []
        c = math.sqrt(min(tp["tension"]) / self.lift_belt_kg_m) if tp["t_min_n"] > 0 else 0.0
        return {"modes_hz": modes, "ei_nm2": ei, "t_bottom_n": tp["t_bottom_n"], "t_top_n": tp["t_top_n"],
                "t_min_n": tp["t_min_n"], "pull_n": tp["pull_n"], "loaded": len(tp["loaded_nodes"]),
                "wave_m_s": c, "slack": tp["t_min_n"] <= 0}

    def lift_pluck_design(self) -> dict:
        """The tension-setting figure (2026-11-15): the stopped, empty strand's fundamental from `lift_strand_modes`,
        with the flights' mass and the strand's own weight in the tension. The bare formula sqrt(T0 / m) / 2L that
        `lift_tension_design` gives (`ring_hz`) leaves out the 32 flights' 5 g each, 0.033 kg/m on top of the belt's
        0.085, so it reads high; a builder who tensions to it sets (bare / real)^2 times T0. A mode's frequency is the
        same wherever the strand is plucked."""
        t = self.lift_tension_design()
        f = self.lift_strand_modes("down", "flat", loaded_every=0, running=False, f_max_hz=6.0)["modes_hz"]
        return {"pluck_hz": f[0], "second_hz": f[1], "bare_hz": t["ring_hz"],
                "over_tension": (t["ring_hz"] / f[0]) ** 2, "t0_n": t["t0_n"]}

    def lift_speed_range(self) -> dict:
        """The belt's speed as a share of nominal (`lift_motor_rpm`), lowest at the 24 V cut with every flight loaded
        (the motor's resistance and its lead's drop under the full belt's current), highest on the charger's 29.2 V
        with an empty belt (no-load current), each at its duty (`lift_duty_at`). At a fixed duty (`lift_v_ref` 0) the
        speed followed the battery, 0.91 to 1.23; held to `lift_v_ref` it spans only the load and the IR drop
        (2026-11-15, "Lift duty follows the battery"). `fixed_lo`/`fixed_hi` are the fixed duty's figures."""
        m = self.lift_motor_model()
        d = self.lift_design()
        r = m["winding_ohm"] + m["lead_ohm"]
        w0 = m["noload_rad_s"]
        i_full = self.lift_motor_noload_a + d["torque_nm"] / m["kt"]

        def speed(v, duty, i):
            return (v * duty - i * (r + self.lift_shunt_series(duty))) / m["ke"] / w0
        lo = speed(self.supply_v, self.lift_duty_at(self.supply_v), i_full)
        hi = speed(self.battery_v_max, self.lift_duty_at(self.battery_v_max), self.lift_motor_noload_a)
        f_lo = speed(self.supply_v, self.lift_duty, i_full)
        f_hi = speed(self.battery_v_max, self.lift_duty, self.lift_motor_noload_a)
        return {"lo": lo, "hi": hi, "i_full_a": i_full, "fixed_lo": f_lo, "fixed_hi": f_hi}

    def lift_strand_excitations(self, speed_factor: float = 1.0) -> dict:
        """What shakes a strand, Hz, at `speed_factor` x the belt's nominal speed. Direct: flights passing a point
        (each one bumps onto and off the pulleys, and every loaded one onto the strip) and their 2nd and 3rd
        harmonics, balls at the inlet's highest rate, a pulley's turn (run-out), the teeth meshing and twice that.
        Tension: the drive's torsional modes with the hub stuck (`lift_belt_model`, 38 and 78 Hz) shake both strands'
        tension, which drives a string mode at half the shaking frequency hardest (principal parametric resonance)
        and at the same frequency next; and the loaded flights reaching the top shake it at the ball rate."""
        d = self.lift_design()
        v = d["speed_m_s"] * speed_factor
        f_fl = v / (d["flight_pitch_mm"] / 1000)
        b = self.lift_belt_model()
        return {"flight": f_fl, "flight_x2": 2 * f_fl, "flight_x3": 3 * f_fl, "ball": f_fl / d["flights_per_ball"],
                "pulley_rev": v / (math.pi * self.lift_pd / 1000), "mesh": v / (self.lift_belt_pitch / 1000),
                "mesh_x2": 2 * v / (self.lift_belt_pitch / 1000),
                "drive_half": b["f_stuck_hz"] / 2, "drive": b["f_stuck_hz"],
                "drive_upper_half": b["f_upper_hz"] / 2, "drive_upper": b["f_upper_hz"]}

    def lift_belt_axial_modes(self, loaded_every: int = 1, cspec_factor: float = 1.0, stuck: bool = True,
                              balls_on_up: bool = True, f_max_hz: float = 150.0, nodes_per_pitch: int | None = None) -> dict:
        """The belt loop's stretch modes with its mass where it really is (the open item after "Lift belt stretch").

        The loop runs from the drive pulley up the up strand, over the top pulley (half a wrap, free to turn: its own
        inertia is left out, as in `lift_belt_model`) and down the down strand back to the drive pulley, as a bar of
        c_spec on nodes h apart, flights' 5 g every pitch all round, a ball on every `loaded_every`-th flight of the up
        strand (or, `balls_on_up` False, the same balls spread evenly round the loop, which is what the lumped model
        assumes). Both ends sit on the drive pulley (at its pitch radius), which with the shaft side and the half wrap
        on it is one mass; `stuck` couples it through the jaw coupling to the rotor (the hub stuck), else the pulley is
        held. The first held mode is what `lift_belt_model`'s `f_belt_hz` lumps; stuck, the first two are its
        `f_stuck_hz` and `f_upper_hz`."""
        c = self.lift_belt_chain(loaded_every, cspec_factor, balls_on_up, nodes_per_pitch)
        n, k, mass, r, cm = c["n"], c["k_n_m"], list(c["mass"]), c["r_m"], self.lift_coupler_model()
        rows = []
        for i in range(n - 1):
            j0 = max(0, i - 1)
            rows.append((j0, [-k, 2 * k] if i > 0 else [2 * k]))
        # the pulley: both ends of the loop on it, the shaft side and the belt on its half wrap
        m_p = cm["j_shaft"] / r ** 2 + c["m_wrap_kg"]
        p_row = [0.0] * (n - 1) + [2 * k]
        p_row[0] -= k
        p_row[n - 2] -= k
        if stuck:
            kc = cm["k_nm_rad"] / r ** 2
            rows.append((0, p_row[:-1] + [p_row[-1] + kc]))
            rows.append((n - 1, [-kc, kc]))
            mass += [m_p, cm["j_motor"] / r ** 2]
        else:
            pass                                        # pulley held: the ends are fixed
        modes = _modes_below(rows, mass, f_max_hz)
        return {"modes_hz": modes, "balls": len(c["ball_nodes"]), "nodes": n, "moving_kg": sum(mass[:n - 1]) + c["m_wrap_kg"]}

    def lift_belt_chain(self, loaded_every: int = 1, cspec_factor: float = 1.0, balls_on_up: bool = True,
                        nodes_per_pitch: int | None = None) -> dict:
        """The belt loop as a chain of point masses on springs (2026-11-15; `lift_belt_axial_modes` solves its modes,
        tests/lift_jam_sweep.py `chain=` runs it in time). Node i (0 .. n - 2) sits s = (i + 1) h along the loop from
        the drive pulley, up strand first, over the top pulley's half wrap and down the down strand; both ends are on
        the drive pulley. Segment j (0 .. n - 1) joins node j - 1 to node j, the pulley standing in at both ends, k =
        c_spec / h. Flights every pitch, a ball on every `loaded_every`-th flight of the up strand (or spread evenly
        round the loop). `ball_nodes` are the loaded flights' nodes (the up strand's, either way), `up_nodes` and
        `down_nodes` the straight strands' nodes, `top_node` the last node of the up strand (the hood). Even
        `nodes_per_pitch` (default `LIFT_FD_PER_PITCH` // 2) put every flight on a node."""
        d = self.lift_design()
        r = self.lift_pd / 2000
        span = d["centre_mm"] / 1000
        wrap = math.pi * r
        total = 2 * span + wrap
        pitch = d["flight_pitch_mm"] / 1000
        npp = nodes_per_pitch or self.LIFT_FD_PER_PITCH // 2
        n = max(8, round(total / (pitch / npp)))
        h = total / n
        ea = self.lift_belt_cspec_n * cspec_factor
        mass = [self.lift_belt_kg_m * h] * (n - 1)     # interior nodes 1 .. n - 1 (s = i h from the pulley, up strand first)
        n_fl = d["flights"]
        fl_s = [(k + 0.5) * pitch for k in range(n_fl) if (k + 0.5) * pitch < total]
        up_fl = [s for s in fl_s if s < span]
        loaded = up_fl[::loaded_every] if loaded_every else []
        ball_kg = self.ball_g / 1000

        def node(s):
            return min(n - 2, max(0, round(s / h) - 1))
        for s in fl_s:
            mass[node(s)] += self.lift_flight_kg
        if balls_on_up:
            for s in loaded:
                mass[node(s)] += ball_kg
        else:
            spread = ball_kg * len(loaded) / (n - 1)
            mass = [m + spread for m in mass]
        top = node(span)
        bottom_down = node(span + wrap)
        return {"n": n, "h_m": h, "k_n_m": ea / h, "mass": mass, "r_m": r, "m_wrap_kg": self.lift_belt_kg_m * wrap,
                "ball_nodes": [node(s) for s in loaded], "flight_nodes": [node(s) for s in fl_s],
                "up_flight_nodes": [node(s) for s in up_fl], "up_nodes": list(range(0, top + 1)),
                "down_nodes": list(range(bottom_down, n - 1)), "top_node": top, "span_m": span}

    def lift_strand_cases(self) -> list:
        """The strands and axes `tests/lift_strand_sweep.py` runs, as keyword sets for `lift_strand_modes`."""
        return [
            {"name": "down, off its face", "strand": "down", "axis": "flat"},
            {"name": "down, across", "strand": "down", "axis": "edge"},
            {"name": "up empty, off its face", "strand": "up", "axis": "flat", "loaded_every": 0},
            {"name": "up empty, across", "strand": "up", "axis": "edge", "loaded_every": 0},
            {"name": "up loaded, across, balls go with it", "strand": "up", "axis": "edge"},
            {"name": "up loaded, across, balls slide", "strand": "up", "axis": "edge", "ball_moves": False},
            {"name": "up loaded, off its face, pinned at the pads", "strand": "up", "axis": "flat", "pin_loaded": True},
        ]

    def check_lift_strand(self) -> list[str]:
        bad = []
        for le in (1, 2):
            t = self.lift_strand_tension("up", le)
            if t["t_min_n"] <= 0:
                bad.append(f"lift's up strand goes slack running with a ball on every {le} flight(s) "
                           f"({t['t_min_n']:.1f} N at the drive pulley): raise lift_tension_factor")
        pl = self.lift_pluck_design()
        if not 0.0 < pl["pluck_hz"] < pl["bare_hz"]:
            bad.append(f"lift tension-setting figure {pl['pluck_hz']:.2f} Hz is not under the bare belt's {pl['bare_hz']:.2f} Hz")
        r = self.lift_run_on_resonance()
        if r["hits"]:
            bad.append(f"lift's empty belt (the run-on after each ball) rings at {', '.join(r['hits'])} inside the flights' "
                       f"passing band ({r['flight_lo_hz']:.2f}-{r['flight_hi_hz']:.2f} Hz, x1-3, +-{r['band']:.0%}): hold the "
                       f"belt's speed (lift_v_ref) or move lift_tension_factor")
        return bad

    def lift_run_on_resonance(self, band: float = 0.05) -> dict:
        """The empty belt's first three string modes (both strands at T0: the run-on after each ball, `lift_strand_modes`
        down, off its face) against the flights' passing rate and its 2nd and 3rd harmonics over the belt's speed range
        (`lift_speed_range`), each band widened by `band` (2026-11-15, "Lift duty follows the battery"). `hits` names
        every mode inside a band; at a fixed duty the 2.12 Hz fundamental sat in the x1 band."""
        s = self.lift_speed_range()
        lo, hi = self.lift_strand_excitations(s["lo"]), self.lift_strand_excitations(s["hi"])
        modes = self.lift_strand_modes("down", "flat", loaded_every=0)["modes_hz"][:3]
        hits = []
        for i, f in enumerate(modes):
            for k in ("flight", "flight_x2", "flight_x3"):
                if lo[k] * (1 - band) <= f <= hi[k] * (1 + band):
                    hits.append(f"n{i + 1} {f:.2f} Hz ({k})")
        return {"modes_hz": modes, "hits": hits, "flight_lo_hz": lo["flight"], "flight_hi_hz": hi["flight"], "band": band,
                "clearance": modes[0] / (hi["flight"] * (1 + band))}

    def lift_shaft_geometry(self) -> dict:
        """Positions along y for `lift_shaft_design` (geometry only, so the cable route can use it without the motor
        model, which itself reads the cable route)."""
        dep, w, B = self.lift_depth, self.lift_wall, self.lift_bearing_w
        y_out = dep / 2
        y_far = -(dep / 2 + w)
        yn = y_out - B / 2                                   # bearing centres
        yf = y_far + B / 2
        half = (self.lift_belt_w + 5.0) / 2                  # as lift_slip_design: the pulley, then the far stack
        near_side = self.lift_slip_facing_t + self.lift_slip_plate_t + self.lift_slip_collar_w
        far_side = near_side + self.lift_slip_spring()["stack_mm"]
        pocket_near = half + near_side + 1.0                 # the boot's slip-hub pocket: the motor side's stack
        pocket = half + far_side + 1.0                       # and the far side's, with the disc stack (2026-11-16)
        bore = (self.lift_coupler_l - self.lift_coupler_spider) / 2
        gap = max(self.lift_shaft_clear, self.gm_shaft_len - bore)
        c0 = y_out + self.lift_shaft_clear                   # coupling's near end
        c1 = c0 + self.lift_coupler_l
        face = c1 + gap
        sh0, sh1 = y_far + 0.5, c0 + bore - 0.5
        return {
            "bearing_y": (yn, yf), "coupler_y": (c0, c1), "coupler_bore_mm": bore, "motor_gap_mm": gap,
            "motor_face_y": face, "spacer_mm": face - y_out, "engage_mm": min(bore, self.gm_shaft_len - gap),
            "shaft_y": (sh0, sh1), "shaft_mm": sh1 - sh0, "near_web_mm": yn - B / 2 - pocket_near,
            "far_web_mm": -pocket - (yf + B / 2),
        }

    def check_lift_shaft(self) -> list[str]:
        bad = []
        d = self.lift_shaft_design()
        if d["engage_mm"] < 0.6 * d["coupler_bore_mm"]:
            bad.append(f"lift gearmotor's shaft enters the coupling only {d['engage_mm']:.1f} mm of its "
                       f"{d['coupler_bore_mm']:.1f} mm hub (60% wanted): a longer gm_shaft_len or a shorter coupling")
        if d["coupler_factor"] < self.lift_coupler_factor:
            bad.append(f"lift coupling's {self.lift_coupler_nm:g} N m is {d['coupler_factor']:.2f}x the slip hub's highest "
                       f"sticking torque ({self.lift_coupler_factor:g}x wanted): a bigger coupling")
        if d["vm_run_mpa"] > self.lift_shaft_allow_mpa:
            bad.append(f"lift drive shaft sees {d['vm_run_mpa']:.0f} MPa running under {d['f_run_n']:.0f} N "
                       f"(fatigue allow {self.lift_shaft_allow_mpa:g}): bearings closer together or a larger shaft")
        if d["vm_mpa"] > self.lift_shaft_static_mpa:
            bad.append(f"lift drive shaft sees {d['vm_mpa']:.0f} MPa at a jam's {d['f_jam_n']:.0f} N "
                       f"(allow {self.lift_shaft_static_mpa:g}): bearings closer together or a larger shaft")
        if d["defl_mm"] > self.lift_shaft_defl_mm:
            bad.append(f"lift drive shaft sags {d['defl_mm']:.3f} mm at the pulley ({self.lift_shaft_defl_mm:g} allowed)")
        if max(d["near_n"], d["far_n"]) > self.lift_bearing_c0_n / 4:
            bad.append(f"lift shaft bearing carries {max(d['near_n'], d['far_n']):.0f} N, over a quarter of its "
                       f"{self.lift_bearing_c0_n:g} N static rating")
        if min(d["near_web_mm"], d["far_web_mm"]) < 1.5:
            bad.append(f"lift shaft bearing pocket leaves {min(d['near_web_mm'], d['far_web_mm']):.1f} mm to the slip "
                       f"hub's pocket (1.5 mm wanted)")
        back = self.lift_y + d["motor_face_y"] + self.lift_gm_len
        if back > self.base_half_w - self.lift_gm_bracket_clear:
            bad.append(f"lift gearmotor's back end at y = {back:.1f} is within {self.lift_gm_bracket_clear:g} mm of the "
                       f"drive bracket's inner face ({self.base_half_w:.1f}): a shorter gearmotor (lift_gm_len) "
                       f"or a shorter coupling")
        if self.lift_coupler_d + 2.0 > self.gearmotor_d - 2 * 3.0:
            bad.append("lift motor spacer's bore (coupling + 2 mm) leaves under 3 mm of wall inside the motor's diameter")
        return bad

    def bearing_fit(self, over: float, shrink: float, b: float | None = None) -> dict:
        """One flanged bearing pressed into a printed bore drawn `over` mm over its radius, on a printer whose
        sideways holes come out `shrink` mm small on the diameter (2026-11-15; cad/README.md "Bearing fit test ring").

        Diametral interference i = shrink - 2 over. Below zero the bearing is loose: up to `fit_slip_mm` it slides in
        snug, past that it rocks. Under the window's floor it presses in but goes slack when the boot warms ("light"). Above zero the steel ring (about 130 times stiffer than PETG) is taken as rigid and
        the PETG round it as a thick-walled cylinder of outer radius b (Lame): the bore's radial give for a pressure p
        is p r / E ((b^2 + r^2) / (b^2 - r^2) + nu), so p = E (i / 2) / (r C). The hoop stress at the bore is
        p (b^2 + r^2) / (b^2 - r^2); the force to press it in (and the most it takes to push out) is mu p pi d L over
        the outer ring's length in the bore (the flange sits in its counterbore). The pressure also squeezes the outer
        ring: a ring of raceway diameter d_r loaded outside by p closes 2 p r^2 d_r / (E_s (r^2 - (d_r/2)^2)) on the
        diameter, taken from the bearing's internal clearance. b is the cell's half-pitch unless given."""
        r = self.lift_bearing_od / 2
        b = self.bearing_ring_pitch / 2 if b is None else b
        k = (b * b + r * r) / (b * b - r * r)
        c = k + self.petg_nu
        i = shrink - 2 * over
        length = self.lift_bearing_w - self.lift_bearing_flange_t
        p = max(i, 0.0) * self.petg_hoop_e_mpa / (2 * r * c)
        rr = self.lift_bearing_race_d / 2
        close_um = 2 * p * r * r * rr / (200000.0 * (r * r - rr * rr)) * 2 * 1000
        if i < -self.fit_slip_mm:
            kind = "loose"
        elif i < 0:
            kind = "slip"
        elif i < self.bearing_fit_window(b)[0]:
            kind = "light"
        elif p * k > self.fit_hoop_allow_mpa:
            kind = "tight"
        else:
            kind = "press"
        return {"interference_mm": i, "pressure_mpa": p, "hoop_mpa": p * k, "press_n": self.petg_steel_mu * p * math.pi
                * 2 * r * length, "race_close_um": close_um, "kind": kind, "b_mm": b, "compliance": c}

    def bearing_fit_window(self, b: float | None = None) -> tuple[float, float]:
        """The diametral interference a printed bore can take: from what `fit_dt_k` of warming takes away (PETG
        grows about five times as fast as the steel ring) to the hoop allowance."""
        r = self.lift_bearing_od / 2
        b = self.bearing_ring_pitch / 2 if b is None else b
        k = (b * b + r * r) / (b * b - r * r)
        lo = 2 * r * (self.petg_cte - self.steel_cte) * self.fit_dt_k
        return lo, self.fit_hoop_allow_mpa * 2 * r * (k + self.petg_nu) / (self.petg_hoop_e_mpa * k)

    def bearing_fit_ring_design(self) -> dict:
        """The ring's six bores across the swept printers, and the boot's drawn size on the assumed one.

        The window (still tight when warm, to the hoop allowance) is narrower than the spread of printed-hole error across
        printers, so no drawn size suits every printer: the ring's steps are close enough that one bore lands inside
        the window whatever the printer's error in the sweep (`covered`), and the person reads which.
        `boot_b_mm` is the material round the boot's pockets: out to the boot's bottom face under the pulley, which
        the CAD shows 90-96% solid round both pockets (the counterbore and the spine's slot aside; a test checks it).
        The ring's cells are softer than the boot, so a bore that presses firm on the ring presses firmer in the boot
        by `boot_factor` (the ring's compliance over the boot's), and the hoop check is made on the boot."""
        lo, hi = self.bearing_fit_window()
        steps = list(self.bearing_ring_steps)
        table = {s: [self.bearing_fit(o, s) for o in steps] for s in self.print_hole_under_sweep}
        covered = {s: [o for o, f in zip(steps, rows) if f["kind"] == "press"] for s, rows in table.items()}
        boot_b = self.lift_r_sweep + self.lift_wall   # the boot's bottom wall under the pulley (measured ~90% solid to here)
        r = self.lift_bearing_od / 2
        kb = (boot_b ** 2 + r * r) / (boot_b ** 2 - r * r)
        ring = self.bearing_fit(self.lift_bearing_fit_mm, self.print_hole_under_mm)
        boot = self.bearing_fit(self.lift_bearing_fit_mm, self.print_hole_under_mm, b=boot_b)
        gaps = [2 * (b2 - b1) for b1, b2 in zip(steps, steps[1:])]
        return {"window_mm": (lo, hi), "table": table, "covered": covered, "boot_b_mm": boot_b,
                "boot_factor": ring["compliance"] / (kb + self.petg_nu), "ring": ring, "boot": boot,
                "max_gap_mm": max(gaps) if gaps else 0.0}

    def pick_bore_over(self, results: list[str]) -> dict:
        """The drawn size to use from the fit ring: one word per bore in `bearing_ring_steps` order, each one of
        drops, slides, presses, hard (needs a hard squeeze), cracks (whitens or cracks the ring).

        Take the middle of the run of bores it presses into (the tighter of two middles), so the fit has a step of
        margin both ways: towards slack as the boot warms and towards creep. A ring with no "presses" falls back to
        the loosest "hard" bore that did not crack, flagged, or to nothing."""
        words = ("drops", "slides", "presses", "hard", "cracks")
        if len(results) != len(self.bearing_ring_steps) or any(w not in words for w in results):
            raise ValueError(f"want {len(self.bearing_ring_steps)} words, each one of {', '.join(words)}")
        ok = [o for o, w in zip(self.bearing_ring_steps, results) if w == "presses"]
        if ok:
            return {"over": sorted(ok)[(len(ok) - 1) // 2], "note": f"middle of {len(ok)} bore(s) that press in"}
        hard = [o for o, w in zip(self.bearing_ring_steps, results) if w == "hard"]
        if hard:
            return {"over": max(hard), "note": "no bore pressed in easily: the loosest hard one; check it after a week"}
        if all(w in ("drops", "slides") for w in results):
            return {"over": None, "note": "every bore is loose: add tighter steps (smaller bearing_ring_steps) and reprint"}
        return {"over": None, "note": "every bore is tight or cracked: add looser steps and reprint"}

    def check_bearing_fit_ring(self) -> list[str]:
        bad = []
        d = self.bearing_fit_ring_design()
        lo, hi = d["window_mm"]
        steps = sorted(self.bearing_ring_steps)
        if len(steps) < 2 or steps != list(self.bearing_ring_steps):
            bad.append("bearing fit ring wants two or more bore steps in rising order")
        if d["max_gap_mm"] > hi - lo:
            bad.append(f"bearing fit ring's steps are {d['max_gap_mm']:.2f} mm apart on the diameter, wider than the "
                       f"{hi - lo:.2f} mm window a printed bore can take: a bore could miss it on some printer")
        missed = [s for s, c in d["covered"].items() if not c]
        if missed:
            bad.append(f"bearing fit ring has no bore in the press window for a printer whose holes print "
                       f"{', '.join(f'{s:g}' for s in missed)} mm small: widen bearing_ring_steps")
        if self.bearing_ring_pitch / 2 - self.lift_bearing_flange_d / 2 < 4.0:
            bad.append("bearing fit ring's cells leave under 4 mm of material outside the flange's counterbore")
        if d["boot"]["kind"] != "press":
            bad.append(f"lift bearing pockets drawn {self.lift_bearing_fit_mm:g} mm over are {d['boot']['kind']} on a "
                       f"printer whose holes print {self.print_hole_under_mm:g} mm small: set lift_bearing_fit_mm "
                       f"from the fit ring")
        return bad

    # ---- hopper agitator (2026-11-13) ------------------------------------------
    @property
    def outlet_a(self) -> float:
        """Outlet centre along the shelf from the shelf's centre (the shelf frame's x)."""
        return self.shelf_l / 2 - 55.0

    @property
    def agit_xy(self) -> tuple[float, float]:
        """Agitator shaft in the shelf frame (x along the shelf from its centre, y across)."""
        return (self.outlet_a - self.agit_back, self.agit_side)

    def agit_z(self) -> dict:
        """Heights in the shelf frame (z = 0 at the shelf's underside, normal to it)."""
        floor = self.plate_t + self.tub_wall
        arm_c = floor + self.ball_d / 2
        face = -self.agit_mount_t
        return {"floor": floor, "arm_bottom": arm_c - self.agit_arm_h / 2, "arm_top": arm_c + self.agit_arm_h / 2,
                "motor_face": face, "shaft_top": face + self.agit_shaft_len, "boss_bottom": floor + 1.0,
                "set_screw": face + self.agit_shaft_len - 3.0}

    def agitator_design(self) -> dict:
        """Reach, clearances, load, rate and strength of the hopper agitator.

        Load (conservative): every arm ploughs a full tub. A floor ball carries the balls stacked over it (the tub's
        depth at `packing`, no wall support), and the arm shoves it out from under them, so it slides on the floor
        and under the ball above at `feed_mu_ball`: F = mu (2 W_above + w) per ball, spread along the arm at one ball
        per diameter, so the torque per arm is F / d times (L^2 - r_hub^2) / 2.
        Rate: each arm crossing the outlet breaks a bridge, taken as one ball freed a pass (an assumption to
        measure), so arms x rpm must meet `lift_rate_min`, the feed rate the lift is sized for.
        Strength: a jammed arm takes the motor's whole stall torque at its root (the hub's edge)."""
        xs, ys = self.agit_xy
        r = self.ball_d / 2
        w = self.ball_g / 1000 * 9.81
        dist = math.hypot(self.agit_back, self.agit_side)
        x_in, y_in = self.tub_l / 2 - self.tub_wall, self.tub_w / 2 - self.tub_wall
        wall = min(x_in - xs, xs + x_in, y_in - ys, ys + y_in) - self.agit_arm_l
        h_in = self.tub_h - self.tub_wall
        above = self.packing * h_in * self.ball_d ** 2 / (math.pi / 6 * self.ball_d ** 3) - 1.0
        per_ball = self.feed_mu_ball * (2 * above * w + w)
        r_hub = self.agit_hub_d / 2
        torque = 2 * per_ball / self.ball_d * (self.agit_arm_l ** 2 - r_hub ** 2) / 2 / 1000
        z_mod = self.agit_arm_h * self.agit_arm_w ** 2 / 6
        omega = self.agit_motor_rpm * 2 * math.pi / 60
        z = self.agit_z()
        return {
            "shaft_xy": (xs, ys), "outlet_dist_mm": dist, "overshoot_mm": self.agit_arm_l - dist, "wall_clear_mm": wall,
            "balls_over_one": above, "per_ball_n": per_ball, "torque_nm": torque,
            "torque_margin": self.agit_motor_nm / torque if torque > 0 else math.inf, "power_w": torque * omega,
            "passes_per_min": 2 * self.agit_motor_rpm, "tip_speed_m_s": omega * self.agit_arm_l / 1000,
            "root_stress_mpa": self.agit_motor_stall_nm * 1000 / z_mod,
            "tip_force_stall_n": self.agit_motor_stall_nm * 1000 / self.agit_arm_l,
            "arm_band_mm": (z["arm_bottom"] - z["floor"], z["arm_top"] - z["floor"]),
            "shaft_above_floor_mm": z["shaft_top"] - z["floor"], "ball_r": r,
        }

    def check_agitator(self) -> list[str]:
        bad = []
        d = self.agitator_design()
        z = self.agit_z()
        r_out = 75.0 / 2
        if d["outlet_dist_mm"] - self.agit_hub_d / 2 < r_out:
            bad.append("agitator hub sits over the outlet hole")
        if d["overshoot_mm"] < self.agit_overshoot:
            bad.append(f"agitator arms reach only {d['overshoot_mm']:.0f} mm past the outlet's centre; "
                       f"{self.agit_overshoot:g} wanted")
        if d["wall_clear_mm"] < self.agit_wall_clear:
            bad.append(f"agitator tips pass {d['wall_clear_mm']:.0f} mm from the tub's wall; {self.agit_wall_clear:g} wanted")
        if self.agit_floor_hole >= self.ball_d / 2:
            bad.append("agitator's floor hole is wide enough for a ball to sink into")
        if not self.agit_shaft_d + 2.0 <= self.agit_shelf_hole <= self.agit_floor_hole:
            bad.append("agitator shaft does not pass the shelf and tub-floor holes with 1 mm all round")
        if self.agit_boss_d - self.agit_shaft_d < 8.0:
            bad.append("agitator boss wall under 4 mm round the shaft (room for the set screw's insert)")
        if z["shaft_top"] - z["boss_bottom"] < 6.0:
            bad.append(f"agitator hub grips only {z['shaft_top'] - z['boss_bottom']:.1f} mm of the shaft; 6 wanted")
        if z["set_screw"] < z["boss_bottom"] + 2.0:
            bad.append("agitator's set screw is below the hub's boss")
        if d["torque_margin"] < self.agit_torque_factor:
            bad.append(f"agitator motor's {self.agit_motor_nm:g} N m is {d['torque_margin']:.1f}x the {d['torque_nm']:.2f} N m "
                       f"needed; {self.agit_torque_factor:g}x wanted")
        if d["passes_per_min"] < self.lift_rate_min:
            bad.append(f"agitator crosses the outlet {d['passes_per_min']:.0f} times a minute, under the "
                       f"{self.lift_rate_min:g} balls a minute fed")
        if d["root_stress_mpa"] > self.petg_bend_allow_mpa:
            bad.append(f"agitator arm root at the motor's stall: {d['root_stress_mpa']:.1f} MPa, over "
                       f"{self.petg_bend_allow_mpa:g} MPa for printed PETG")
        return bad

    # ---- take-up spring bracket (2026-11-20) ----------------------------------------

    def shelf_plane_z(self, x: float) -> float:
        """Underside of the shelf at world x on y = 0 (the plane through the outlet)."""
        return self.hopper_out_z - (x - self.hopper_out_x) * math.tan(math.radians(self.shelf_slope_deg))

    def spring_bracket_design(self) -> dict | None:
        """Where the take-up's constant-force spring sits, and what its bracket must clear (None without a sleeve).

        The band hangs straight down from the coil's front tangent to a screw in the rear face of the collar's tab,
        outside the sleeve (the band is wider than the slot, so it cannot run in it). So the band's line is the tab's
        rear face, and the coil's centre is a coil radius behind that. The tangent point has to stay above the tab
        at the collar's highest pose (0 deg elevation) or the band would wrap the tab; the coil then has to fit
        under the sleeve socket's flange, which sits under the shelf. The coil shrinks as band pays out, so the band
        leans a little at the lowest pose: reported, not a fault unless it is large. The bracket hangs from the
        shelf behind the flange on two M4 screws; the axle is an M4 screw through both cheeks and the spool."""
        t = self.sleeve_take_up_design()
        if t is None:
            return None
        s = math.radians(self.shelf_slope_deg)
        ox, oz = self.hopper_out_x, self.hopper_out_z
        bore = self.hose_od + self.sleeve_clear_mm
        od = bore + 2 * self.sleeve_wall_mm
        tab_rear_x = ox - (od / 2 + self.collar_tab_mm + 1.0)       # as feeder.take_up_parts draws the tab
        tab_top = (oz - t["collar_travel"][0] + self.collar_h_mm, oz - t["collar_travel"][1] + self.collar_h_mm)
        anchor = (tab_top[0] - self.collar_tab_mm / 2, tab_top[1] - self.collar_tab_mm / 2)
        band_x = tab_rear_x - self.cf_band_t / 2
        r1 = self.cf_coil_od / 2
        drum_x, drum_z = band_x - r1, tab_top[0] + self.cf_band_margin
        r0 = math.sqrt(max(r1 ** 2 - self.cf_band_t * t["stroke_mm"] / math.pi, 0.0))  # coil radius fully out
        lean = math.degrees(math.atan2(r1 - r0, drum_z - anchor[1]))
        flange_rear_x = ox - SPIGOT_FLANGE_R * math.cos(s)
        flange_bottom = self.shelf_plane_z(flange_rear_x) - SPIGOT_FLANGE / math.cos(s)
        cup_r = od / 2 + 6.0                                          # the socket's cup, as feeder.hopper_spigot
        spool_w = self.cf_band_w + 2 * self.cf_spool_flange_t + 1.0
        cheek_in = spool_w / 2 + 0.5
        outer_w = 2 * (cheek_in + self.spring_cheek_t)
        band_len = (drum_z - anchor[1]) + self.cf_wraps_left * math.pi * self.cf_spool_d + 20.0
        # two M4 up through the shelf, behind the flange (insert pocket's edge 2 mm clear), along the coil
        x_screw_front = flange_rear_x - 2.0 - 2.8
        screws_x = (x_screw_front, x_screw_front - 14.0)
        return {"band_x": band_x, "tab_rear_x": tab_rear_x, "tab_top": tab_top, "anchor_z": anchor,
                "drum_x": drum_x, "drum_z": drum_z, "coil_r": (r1, r0), "lean_deg": lean,
                "coil_top": drum_z + r1, "flange_rear_x": flange_rear_x, "flange_bottom": flange_bottom,
                "cup_clear_mm": (ox - cup_r) - band_x, "spool_w": spool_w, "cheek_in": cheek_in,
                "outer_w": outer_w, "band_len_mm": band_len, "screws_x": screws_x,
                "pad_bottom": drum_z + r1 + 3.0, "shelf_at_drum": self.shelf_plane_z(drum_x),
                "axle_spare_mm": self.spring_axle_len - outer_w, "spool_ratio": self.cf_spool_d / self.cf_spring_id,
                "stroke_mm": t["stroke_mm"]}

    def check_spring_bracket(self) -> list[str]:
        d = self.spring_bracket_design()
        if d is None:
            return []
        bad = []
        if d["cup_clear_mm"] < 3.0:
            bad.append(f"take-up spring's band passes {d['cup_clear_mm']:.1f} mm behind the sleeve socket's cup; 3 wanted")
        if d["coil_top"] > d["flange_bottom"] - 3.0:
            bad.append(f"take-up spring's coil reaches {d['coil_top']:.0f} mm, within 3 mm of the socket flange's "
                       f"underside ({d['flange_bottom']:.0f} mm): lower the outlet's collar travel or use a smaller coil")
        if d["shelf_at_drum"] - d["pad_bottom"] < 10.0:
            bad.append("take-up spring bracket's pad over the coil is under 10 mm thick (room for an M4 insert)")
        if not 1.1 <= d["spool_ratio"] <= 1.2:
            bad.append(f"take-up spring's spool is {d['spool_ratio']:.2f}x its natural ID; makers ask 1.1-1.2x")
        if d["lean_deg"] > 2.0:
            bad.append(f"take-up spring's band leans {d['lean_deg']:.1f} deg at the lowest pose; 2 allowed")
        need = 5.0 + 2 * 0.7   # M4 nyloc plus two threads (guide.NYLOC_H, PITCH)
        if d["axle_spare_mm"] < need:
            bad.append(f"take-up spring's M4 x {self.spring_axle_len:g} axle leaves {d['axle_spare_mm']:.1f} mm past "
                       f"the {d['outer_w']:.1f} mm cheeks; {need:g} needed for the nyloc and two threads")
        return bad

    def check_feed(self) -> list[str]:
        bad = []
        if not self.ball_d < self.shuttle_h < 2 * self.ball_d - 5:
            bad.append("shuttle must be taller than one ball and shorter than two, or it does not meter")
        tube_od = 2 * self.plate_half_y - 2 * self.feed_clear
        if tube_od < self.hole_d + 6:
            bad.append("column wall under 3 mm between the head plates")
        if self.feed_col_x + tube_od / 2 > -self.wheel_head_d / 2 - 3:
            bad.append("feed column touches the top wheel")
        if not self.nip_x <= self.feed_col_x + self.feed_stroke <= 0:
            bad.append("feed stroke does not carry the ball to the wheels")
        if self.feed_col_x - self.hole_d / 2 - 10 < self.head_x0:
            bad.append("feed column is behind the head plates")
        if self.hose_id < self.ball_d + 3 or self.hose_od > self.hole_d + 15:
            bad.append("hose does not pass a ball, or is too wide for its socket")
        if self.tub_capacity() < self.want_balls:
            bad.append(f"tub holds about {self.tub_capacity()} balls, under the {self.want_balls} wanted")
        if self.retain_strain_bad():
            bad.append(self.retain_strain_bad())
        slopes = [s for _, _, s in self.hose_chords()]
        if min(slopes) < self.feed_min_slope_deg:
            bad.append(f"hose chord falls only {min(slopes):.0f} deg at its flattest; balls need {self.feed_min_slope_deg:g}")
        if self.hose_bow_radius() < self.hose_min_bend:
            bad.append(f"hose bows to a {self.hose_bow_radius():.0f} mm radius when the head is at its closest pose; "
                       f"the hose allows {self.hose_min_bend:g}")
        return bad


DEFAULT_FEEDER = Feeder()
