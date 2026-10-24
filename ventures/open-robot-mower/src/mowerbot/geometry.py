"""Plane geometry for lawns: rings, offsets, point tests, segment tests.

A lawn is an outer ring (the mowable boundary) with holes (flowerbeds,
trees, a pond). Rings are lists of (x, y) points in metres, without the
closing point repeated. Everything here is plain floating point with no
dependencies, and sim.mjs mirrors it line for line, so keep the order of
operations stable: the browser port is tested against fixtures this
module writes.
"""

from __future__ import annotations

import math

Point = tuple[float, float]
Ring = list[Point]


def signed_area(ring: Ring) -> float:
    s = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s / 2


def ccw(ring: Ring) -> Ring:
    """The same ring, counter-clockwise."""
    return list(ring) if signed_area(ring) > 0 else list(reversed(ring))


def point_in_ring(p: Point, ring: Ring) -> bool:
    """Even-odd ray cast. Points exactly on an edge may go either way."""
    x, y = p
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y):
            xc = xi + (y - yi) * (xj - xi) / (yj - yi)
            if x < xc:
                inside = not inside
        j = i
    return inside


def offset_ring(ring: Ring, d: float) -> Ring | None:
    """Move every edge of a CCW ring inward by d (outward if d < 0), joining with mitres.

    Returns None when the offset is not a valid ring any more: it flipped,
    collapsed, or crosses itself (a narrow neck of lawn the mower cannot fit
    through at this offset). Mitres longer than 3 d are bevelled, so sharp
    corners do not throw a spike across the lawn.
    """
    r = ccw(ring)
    n = len(r)
    out: Ring = []
    for i in range(n):
        p0, p1, p2 = r[i - 1], r[i], r[(i + 1) % n]
        n1 = _inward(p0, p1)
        n2 = _inward(p1, p2)
        dot = n1[0] * n2[0] + n1[1] * n2[1]
        k = 1 + dot
        if k < 2 / 9:
            # Mitre would be over 3 d long: bevel with two points instead.
            out.append((p1[0] + d * n1[0], p1[1] + d * n1[1]))
            out.append((p1[0] + d * n2[0], p1[1] + d * n2[1]))
        else:
            out.append((p1[0] + d * (n1[0] + n2[0]) / k, p1[1] + d * (n1[1] + n2[1]) / k))
    a0 = signed_area(r)
    a1 = signed_area(out)
    if a1 <= 0 or (d > 0 and a1 >= a0) or self_intersects(out) or _too_close(out, r, abs(d)):
        return None
    return out


def _too_close(out: Ring, ring: Ring, d: float) -> bool:
    """True when the offset comes nearer than d to an original edge: it folded over a narrow neck."""
    m = len(out)
    probes = out + [((out[i][0] + out[(i + 1) % m][0]) / 2, (out[i][1] + out[(i + 1) % m][1]) / 2) for i in range(m)]
    n = len(ring)
    for p in probes:
        for i in range(n):
            if point_segment_distance(p, ring[i], ring[(i + 1) % n]) < d * (1 - 1e-6):
                return True
    return False


def point_segment_distance(p: Point, a: Point, b: Point) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def _inward(a: Point, b: Point) -> Point:
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    return (-dy / L, dx / L)


def _cross(o: Point, a: Point, b: Point) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def segments_cross(a: Point, b: Point, c: Point, d: Point) -> bool:
    """True when segment ab properly crosses cd (touching at an end does not count)."""
    d1 = _cross(c, d, a)
    d2 = _cross(c, d, b)
    d3 = _cross(a, b, c)
    d4 = _cross(a, b, d)
    return ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0))


def self_intersects(ring: Ring) -> bool:
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if segments_cross(a, b, ring[j], ring[(j + 1) % n]):
                return True
    return False


def rotate(p: Point, angle: float) -> Point:
    c, s = math.cos(angle), math.sin(angle)
    return (c * p[0] - s * p[1], s * p[0] + c * p[1])


def path_length(points: list[Point]) -> float:
    return sum(math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
               for i in range(len(points) - 1))


def bbox(rings: list[Ring]) -> tuple[float, float, float, float]:
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)
