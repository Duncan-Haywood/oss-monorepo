"""Coverage planner: perimeter passes, a pass round each obstacle, then parallel stripes.

Lawn frame: metres, x east, y north, any origin (an RTK base station's
local ENU frame works). `Lawn.outer` is the mowable boundary; `Lawn.holes`
are no-go areas (flowerbeds, trees, a pond). The cutting-disc centre is
kept `margin` inside every edge, which by default puts the cut edge on the
boundary line.

The plan is one polyline the mower drives with the blade on: it never
leaves the lawn, so transits between stripes cut too. Transits that would
cross a hole or leave the boundary are routed round it on a visibility
graph. sim.mjs is a line-for-line port; keep both in step.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from . import geometry as g

Point = g.Point


@dataclass(frozen=True)
class Lawn:
    outer: list[Point]
    holes: list[list[Point]] = field(default_factory=list)
    dock: Point = (0.0, 0.0)
    name: str = "lawn"

    @property
    def area(self) -> float:
        return abs(g.signed_area(self.outer)) - sum(abs(g.signed_area(h)) for h in self.holes)

    def contains(self, p: Point) -> bool:
        return g.point_in_ring(p, self.outer) and not any(g.point_in_ring(p, h) for h in self.holes)

    @staticmethod
    def from_dict(d: dict) -> "Lawn":
        return Lawn([tuple(p) for p in d["outer"]], [[tuple(p) for p in h] for h in d.get("holes", [])],
                    tuple(d.get("dock", d["outer"][0])), d.get("name", "lawn"))


@dataclass(frozen=True)
class Settings:
    cut_width: float = 0.232     # m, blade-tip circle (cad params: 2 x blade_tip_r)
    overlap: float = 0.03        # m, between neighbouring passes
    perimeter_passes: int = 2
    margin: float | None = None  # disc centre to edge; None = cut_width / 2
    speed: float = 0.35          # m/s while cutting
    turn_rate: float = 1.2       # rad/s, turning on the spot

    @property
    def spacing(self) -> float:
        return self.cut_width - self.overlap

    @property
    def edge(self) -> float:
        return self.cut_width / 2 if self.margin is None else self.margin


@dataclass
class Plan:
    angle_deg: float
    path: list[Point]
    stripes: int
    perimeter_loops: int
    obstacle_loops: int
    skipped: list[str]
    settings: Settings

    @property
    def length(self) -> float:
        return g.path_length(self.path)

    @property
    def turning(self) -> float:
        return total_turning(self.path)

    @property
    def time_s(self) -> float:
        return self.length / self.settings.speed + self.turning / self.settings.turn_rate


def total_turning(path: list[Point]) -> float:
    """Sum of heading changes at the vertices, radians."""
    tot = 0.0
    prev = None
    for i in range(len(path) - 1):
        dx, dy = path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]
        if dx * dx + dy * dy < 1e-12:
            continue
        h = math.atan2(dy, dx)
        if prev is not None:
            d = h - prev
            d = math.atan2(math.sin(d), math.cos(d))
            tot += abs(d)
        prev = h
    return tot


class FreeSpace:
    """Where the disc centre may go, and shortest routes inside it."""

    def __init__(self, lawn: Lawn, edge: float):
        outer = g.offset_ring(lawn.outer, edge)
        if outer is None:
            raise ValueError("lawn is narrower than the mower everywhere")
        self.rings = [outer]
        for h in lawn.holes:
            grown = g.offset_ring(h, -edge)
            self.rings.append(grown if grown is not None else g.ccw(h))
        # Graph nodes sit 1 cm inside the free space so their links never graze an edge.
        nodes: list[Point] = []
        o2 = g.offset_ring(lawn.outer, edge + 0.01)
        if o2 is not None:
            nodes += o2
        for h in lawn.holes:
            h2 = g.offset_ring(h, -(edge + 0.01))
            if h2 is not None:
                nodes += h2
        self.nodes = [p for p in nodes if self.inside(p)]
        self._adj: dict[int, list[tuple[int, float]]] | None = None

    def inside(self, p: Point) -> bool:
        return g.point_in_ring(p, self.rings[0]) and not any(g.point_in_ring(p, r) for r in self.rings[1:])

    def clear(self, a: Point, b: Point) -> bool:
        for r in self.rings:
            n = len(r)
            for i in range(n):
                if g.segments_cross(a, b, r[i], r[(i + 1) % n]):
                    return False
        return self.inside(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))

    def _graph(self):
        if self._adj is None:
            adj: dict[int, list[tuple[int, float]]] = {i: [] for i in range(len(self.nodes))}
            for i in range(len(self.nodes)):
                for j in range(i + 1, len(self.nodes)):
                    a, b = self.nodes[i], self.nodes[j]
                    if self.clear(a, b):
                        d = math.hypot(b[0] - a[0], b[1] - a[1])
                        adj[i].append((j, d))
                        adj[j].append((i, d))
            self._adj = adj
        return self._adj

    def route(self, a: Point, b: Point) -> list[Point]:
        """Shortest route a -> b inside the free space (a and b included).

        Plain O(n^2) Dijkstra over the graph nodes, lowest index first on ties,
        so the browser port picks the same route.
        """
        if self.clear(a, b):
            return [a, b]
        adj = self._graph()
        n = len(self.nodes)
        start, goal = n, n + 1
        pts = self.nodes + [a, b]
        from_start = [(i, math.hypot(self.nodes[i][0] - a[0], self.nodes[i][1] - a[1]))
                      for i in range(n) if self.clear(a, self.nodes[i])]
        to_goal = {i: math.hypot(b[0] - self.nodes[i][0], b[1] - self.nodes[i][1])
                   for i in range(n) if self.clear(self.nodes[i], b)}
        dist = [math.inf] * (n + 2)
        prev = [-1] * (n + 2)
        done = [False] * (n + 2)
        dist[start] = 0.0
        while True:
            u, best = -1, math.inf
            for i in range(n + 2):
                if not done[i] and dist[i] < best:
                    u, best = i, dist[i]
            if u < 0 or u == goal:
                break
            done[u] = True
            nbrs = from_start if u == start else adj[u] + ([(goal, to_goal[u])] if u in to_goal else [])
            for v, w in nbrs:
                if dist[u] + w < dist[v]:
                    dist[v] = dist[u] + w
                    prev[v] = u
        if dist[goal] == math.inf:
            return [a, b]  # unreachable: keep the straight line and let coverage show the problem
        out = [goal]
        while out[-1] != start:
            out.append(prev[out[-1]])
        return [pts[i] for i in reversed(out)]


def _loop_from(ring: list[Point], p: Point) -> list[Point]:
    """A ring as a closed walk starting at its vertex nearest p."""
    k, best = 0, math.inf
    for i, q in enumerate(ring):
        d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
        if d < best - 1e-9:
            k, best = i, d
    walk = ring[k:] + ring[:k]
    return walk + [walk[0]]


def stripes(lawn: Lawn, s: Settings, angle: float) -> list[tuple[Point, Point]]:
    """Stripe segments (in lawn coordinates) inside the area the perimeter passes leave."""
    # The stripe area starts half a spacing inside the last loop, so stripe ends that
    # meet its edge at a shallow angle still leave no gap against the loop.
    inset = s.edge + max(0.0, s.perimeter_passes - 0.5) * s.spacing
    outer = g.offset_ring(lawn.outer, inset)
    if outer is None:
        return []
    rings = [outer]
    for h in lawn.holes:
        grown = g.offset_ring(h, -(s.edge + 0.5 * s.spacing))
        rings.append(grown if grown is not None else g.ccw(h))
    rot = [[g.rotate(p, -angle) for p in r] for r in rings]
    _, y0, _, y1 = g.bbox(rot[:1])
    # Stripes run along the region's edges too (1 mm in, off the vertices), so the
    # first and last are one spacing from the last perimeter pass.
    eps = 1e-3
    n = max(1, math.ceil((y1 - y0 - 2 * eps) / s.spacing))
    segs = []
    for k in range(n + 1):
        y = y0 + eps + k * (y1 - y0 - 2 * eps) / n
        xs = []
        for r in rot:
            m = len(r)
            for i in range(m):
                (xa, ya), (xb, yb) = r[i], r[(i + 1) % m]
                if (ya <= y < yb) or (yb <= y < ya):
                    xs.append(xa + (y - ya) * (xb - xa) / (yb - ya))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            if xs[i + 1] - xs[i] > 1e-3:
                segs.append((g.rotate((xs[i], y), angle), g.rotate((xs[i + 1], y), angle)))
    return segs


def plan(lawn: Lawn, s: Settings = Settings(), angle_deg: float | None = None, step_deg: float = 5.0) -> Plan:
    """Plan at a fixed stripe angle, or try every `step_deg` and keep the quickest."""
    if angle_deg is None:
        best = None
        free = FreeSpace(lawn, s.edge)
        a = 0.0
        while a < 180.0 - 1e-9:
            p = _plan(lawn, s, a, free)
            if best is None or p.time_s < best.time_s - 1e-9:
                best = p
            a += step_deg
        return best
    return _plan(lawn, s, angle_deg, FreeSpace(lawn, s.edge))


def _plan(lawn: Lawn, s: Settings, angle_deg: float, free: FreeSpace) -> Plan:
    skipped: list[str] = []
    loops: list[list[Point]] = []
    for i in range(s.perimeter_passes):
        r = g.offset_ring(lawn.outer, s.edge + i * s.spacing)
        if r is None:
            skipped.append(f"perimeter pass {i + 1}: lawn too narrow")
            break
        loops.append(r)
    obstacle: list[list[Point]] = []
    for k, h in enumerate(lawn.holes):
        r = g.offset_ring(h, -s.edge)
        if r is None:
            skipped.append(f"obstacle {k + 1}: no loop at this offset")
            continue
        obstacle.append(r)

    path: list[Point] = [lawn.dock]
    cur = lawn.dock

    def go(points: list[Point]):
        nonlocal cur
        leg = free.route(cur, points[0])
        path.extend(leg[1:])
        path.extend(points[1:])
        cur = path[-1]

    for r in loops:
        go(_loop_from(r, cur))
    todo = list(obstacle)
    while todo:
        k, best = 0, math.inf
        for i, ring in enumerate(todo):
            d = min((p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2 for p in ring)
            if d < best - 1e-9:
                k, best = i, d
        go(_loop_from(todo.pop(k), cur))
    segs = stripes(lawn, s, math.radians(angle_deg))
    n_stripes = len(segs)
    left = list(segs)
    while left:
        best_i, best_d, flip = 0, math.inf, False
        for i, (a, b) in enumerate(left):
            da = (a[0] - cur[0]) ** 2 + (a[1] - cur[1]) ** 2
            db = (b[0] - cur[0]) ** 2 + (b[1] - cur[1]) ** 2
            # Ties (two stripes equally near) go to the first: the 1e-9 keeps
            # float noise from deciding, so the browser port agrees.
            if da < best_d - 1e-9:
                best_i, best_d, flip = i, da, False
            if db < best_d - 1e-9:
                best_i, best_d, flip = i, db, True
        a, b = left.pop(best_i)
        go([b, a] if flip else [a, b])
    go([lawn.dock])
    # Drop zero-length steps (a loop that starts where the last one ended).
    clean = [path[0]]
    for p in path[1:]:
        if (p[0] - clean[-1][0]) ** 2 + (p[1] - clean[-1][1]) ** 2 > 1e-12:
            clean.append(p)
    return Plan(angle_deg, clean, n_stripes, len(loops), len(obstacle), skipped, s)
