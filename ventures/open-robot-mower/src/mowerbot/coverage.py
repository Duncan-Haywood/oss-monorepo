"""How much of the lawn a path actually cuts, on a raster.

Each grid cell (default 5 cm) counts as cut when its centre lies within
half the cut width of the path the disc centre followed with the blade on.
Each path segment sweeps a capsule (a rectangle with round ends), and the
capsule is convex, so on every grid row it covers one interval: we compute
that interval exactly and mark the cells in it. sim.mjs ports this.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from . import geometry as g
from .planner import Lawn

Point = g.Point


@dataclass
class Coverage:
    lawn_area: float          # m^2, raster estimate of the lawn
    cut_area: float           # m^2 of lawn cut at least once
    missed_area: float        # m^2 of lawn never cut
    intrusion_area: float     # m^2 of no-go area (holes) the blade passed over
    outside_area: float       # m^2 outside the boundary the blade passed over
    passes_mean: float        # mean times each cut cell was passed over

    @property
    def fraction(self) -> float:
        return self.cut_area / self.lawn_area if self.lawn_area else 0.0


class Raster:
    def __init__(self, lawn: Lawn, res: float = 0.05, pad: float = 0.5):
        x0, y0, x1, y1 = g.bbox([lawn.outer])
        self.x0, self.y0 = x0 - pad, y0 - pad
        self.res = res
        self.nx = int(math.ceil((x1 + pad - self.x0) / res))
        self.ny = int(math.ceil((y1 + pad - self.y0) / res))
        # 0 outside, 1 lawn, 2 hole
        self.kind = bytearray(self.nx * self.ny)
        for j in range(self.ny):
            y = self.y0 + (j + 0.5) * res
            for i in range(self.nx):
                p = (self.x0 + (i + 0.5) * res, y)
                if g.point_in_ring(p, lawn.outer):
                    self.kind[j * self.nx + i] = 2 if any(g.point_in_ring(p, h) for h in lawn.holes) else 1
        self.hits = [0] * (self.nx * self.ny)

    def sweep(self, a: Point, b: Point, r: float) -> None:
        res = self.res
        jlo = max(0, int(math.floor((min(a[1], b[1]) - r - self.y0) / res)))
        jhi = min(self.ny - 1, int(math.floor((max(a[1], b[1]) + r - self.y0) / res)))
        for j in range(jlo, jhi + 1):
            y = self.y0 + (j + 0.5) * res
            iv = capsule_row(a, b, r, y)
            if iv is None:
                continue
            ilo = max(0, int(math.ceil((iv[0] - self.x0) / res - 0.5)))
            ihi = min(self.nx - 1, int(math.floor((iv[1] - self.x0) / res - 0.5)))
            row = j * self.nx
            for i in range(ilo, ihi + 1):
                self.hits[row + i] += 1

    def sweep_path(self, path: list[Point], r: float) -> None:
        for k in range(len(path) - 1):
            self.sweep(path[k], path[k + 1], r)

    def result(self) -> Coverage:
        cell = self.res * self.res
        lawn = cut = intr = out = 0
        passes = 0
        for k, kind in enumerate(self.kind):
            h = self.hits[k]
            if kind == 1:
                lawn += 1
                if h:
                    cut += 1
                    passes += h
            elif h:
                if kind == 2:
                    intr += 1
                else:
                    out += 1
        return Coverage(lawn * cell, cut * cell, (lawn - cut) * cell, intr * cell, out * cell,
                        passes / cut if cut else 0.0)


def capsule_row(a: Point, b: Point, r: float, y: float) -> tuple[float, float] | None:
    """x-interval where the horizontal line at y meets the capsule of radius r round segment ab."""
    lo, hi = math.inf, -math.inf
    for c in (a, b):
        dy = y - c[1]
        if dy * dy <= r * r:
            h = math.sqrt(r * r - dy * dy)
            lo = min(lo, c[0] - h)
            hi = max(hi, c[0] + h)
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    if L > 1e-12:
        ux, uy = dx / L, dy / L
        # Band: |cross(u, p - a)| <= r and 0 <= dot(u, p - a) <= L, with p = (x, y).
        # Each is linear in x: c0 + c1 * x within [lo_k, hi_k].
        tlo, thi = -math.inf, math.inf
        for c0, c1, vlo, vhi in ((ux * (y - a[1]) + uy * a[0], -uy, -r, r),        # cross = ux*(y-ay) - uy*(x-ax)
                                 (-ux * a[0] + uy * (y - a[1]), ux, 0.0, L)):      # dot = ux*(x-ax) + uy*(y-ay)
            if abs(c1) < 1e-15:
                if not (vlo <= c0 <= vhi):
                    tlo, thi = math.inf, -math.inf
                continue
            x1, x2 = (vlo - c0) / c1, (vhi - c0) / c1
            if x1 > x2:
                x1, x2 = x2, x1
            tlo, thi = max(tlo, x1), min(thi, x2)
        if tlo <= thi:
            lo, hi = min(lo, tlo), max(hi, thi)
    return (lo, hi) if lo <= hi else None


def of_path(lawn: Lawn, path: list[Point], cut_width: float, res: float = 0.05) -> Coverage:
    r = Raster(lawn, res)
    r.sweep_path(path, cut_width / 2)
    return r.result()
