"""Route planning for the ball-collecting rover.

Two modes:

* **Seen balls** (camera on): visit every detected ball, shortest-first,
  improved with 2-opt, detouring around keep-out zones, with a trip to the
  dump point whenever the hopper fills.
* **Blind sweep** (no camera, or nothing detected): a back-and-forth lawn-mower
  pattern with lanes one pickup-width apart, split around keep-out zones.

Keep-out zones are where the rover must not drive while someone is
practising: the player's hitting area, the feeder and its catch net, a
coach's basket. They are inflated by the rover's half-width before planning.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field

from . import court
from .court import Rect

Point = tuple[float, float]


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def segment_hits_rect(a: Point, b: Point, r: Rect) -> bool:
    """True if segment a-b passes through the interior of r (Liang-Barsky clip)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, a[0] - r.x0), (dx, r.x1 - a[0]), (-dy, a[1] - r.y0), (dy, r.y1 - a[1])):
        if p == 0:
            if q <= 0:
                return False
            continue
        t = q / p
        if p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 >= t1:
            return False
    # Touching an edge or a corner is allowed; require a real overlap.
    return t1 - t0 > 1e-9


@dataclass
class Planner:
    keep_out: list[Rect] = field(default_factory=list)
    rover_half_width: float = 0.30
    clearance: float = 0.05

    def __post_init__(self) -> None:
        pad = self.rover_half_width + self.clearance
        self._zones = [z.inflate(pad) for z in self.keep_out]
        # Graph nodes sit just outside each inflated corner.
        self._nodes: list[Point] = []
        for z in self._zones:
            for c in z.inflate(1e-3).corners():
                if not self.blocked(c):
                    self._nodes.append(c)

    def blocked(self, p: Point) -> bool:
        return any(z.contains(p[0], p[1]) and not _on_edge(z, p) for z in self._zones)

    def clear(self, a: Point, b: Point) -> bool:
        return not any(segment_hits_rect(a, b, z) for z in self._zones)

    def path(self, a: Point, b: Point) -> tuple[float, list[Point]]:
        """Shortest collision-free path a -> b through keep-out corners (visibility graph)."""
        if self.clear(a, b):
            return _dist(a, b), [a, b]
        nodes = [a, b] + self._nodes
        dist = {0: 0.0}
        prev: dict[int, int] = {}
        heap = [(0.0, 0)]
        done: set[int] = set()
        while heap:
            d, i = heapq.heappop(heap)
            if i in done:
                continue
            done.add(i)
            if i == 1:
                break
            for j, pj in enumerate(nodes):
                if j in done or j == i or not self.clear(nodes[i], pj):
                    continue
                nd = d + _dist(nodes[i], pj)
                if nd < dist.get(j, math.inf):
                    dist[j] = nd
                    prev[j] = i
                    heapq.heappush(heap, (nd, j))
        if 1 not in dist:
            raise ValueError(f"no path from {a} to {b}")
        route = [b]
        k = 1
        while k != 0:
            k = prev[k]
            route.append(nodes[k])
        return dist[1], route[::-1]

    # -- seen-ball routing ---------------------------------------------------

    def order(self, start: Point, balls: list[Point]) -> list[Point]:
        """Visiting order: nearest-neighbour then 2-opt on path length."""
        reachable = [b for b in balls if not self.blocked(b)]
        cache: dict[tuple[Point, Point], float] = {}

        def d(p: Point, q: Point) -> float:
            key = (p, q) if p <= q else (q, p)
            if key not in cache:
                cache[key] = self.path(p, q)[0]
            return cache[key]

        tour: list[Point] = []
        left = list(reachable)
        cur = start
        while left:
            nxt = min(left, key=lambda b: d(cur, b))
            left.remove(nxt)
            tour.append(nxt)
            cur = nxt
        improved = True
        while improved:
            improved = False
            seq = [start] + tour
            for i in range(1, len(seq) - 1):
                for j in range(i + 1, len(seq)):
                    a, b = seq[i - 1], seq[i]
                    c = seq[j]
                    e = seq[j + 1] if j + 1 < len(seq) else None
                    before = d(a, b) + (d(c, e) if e else 0.0)
                    after = d(a, c) + (d(b, e) if e else 0.0)
                    if after < before - 1e-9:
                        seq[i:j + 1] = reversed(seq[i:j + 1])
                        improved = True
            tour = seq[1:]
        return tour

    def collect(self, start: Point, balls: list[Point], *, capacity: int = 75,
                dump: Point | None = None, speed: float = 0.6) -> "Route":
        """Full route: every reachable ball, with dump trips when the hopper is full."""
        dump = dump or start
        stops = self.order(start, balls)
        waypoints = [start]
        length = 0.0
        load = 0
        cur = start
        events: list[tuple[str, Point]] = []
        for b in stops:
            if load >= capacity:
                n, seg = self.path(cur, dump)
                length += n
                waypoints += seg[1:]
                events.append(("dump", dump))
                cur, load = dump, 0
            n, seg = self.path(cur, b)
            length += n
            waypoints += seg[1:]
            events.append(("pick", b))
            cur = b
            load += 1
        n, seg = self.path(cur, dump)
        length += n
        waypoints += seg[1:]
        events.append(("dump", dump))
        skipped = [b for b in balls if self.blocked(b)]
        return Route(waypoints, length, length / speed, events, skipped)

    # -- blind sweep ---------------------------------------------------------

    def sweep(self, area: Rect, lane_spacing: float) -> list[Point]:
        """Lawn-mower waypoints covering `area`, lanes along x, split around keep-outs."""
        if lane_spacing <= 0:
            raise ValueError("lane_spacing must be positive")
        pad = self.rover_half_width
        y = area.y0 + pad
        lanes: list[list[tuple[Point, Point]]] = []
        while y <= area.y1 - pad + 1e-9:
            segs = [(area.x0 + pad, area.x1 - pad)]
            for z in self._zones:
                if z.y0 < y < z.y1:
                    nxt = []
                    for s0, s1 in segs:
                        if z.x1 <= s0 or z.x0 >= s1:
                            nxt.append((s0, s1))
                            continue
                        if z.x0 > s0:
                            nxt.append((s0, z.x0))
                        if z.x1 < s1:
                            nxt.append((z.x1, s1))
                    segs = nxt
            lanes.append([((s0, y), (s1, y)) for s0, s1 in segs if s1 - s0 > 1e-6])
            y += lane_spacing
        pts: list[Point] = []
        for k, lane in enumerate(lanes):
            ordered = lane if k % 2 == 0 else [(b, a) for a, b in reversed(lane)]
            for a, b in ordered:
                if pts:
                    _, seg = self.path(pts[-1], a)
                    pts += seg[1:]
                else:
                    pts.append(a)
                pts.append(b)
        return pts


def _on_edge(z: Rect, p: Point, eps: float = 1e-9) -> bool:
    return (abs(p[0] - z.x0) < eps or abs(p[0] - z.x1) < eps
            or abs(p[1] - z.y0) < eps or abs(p[1] - z.y1) < eps)


@dataclass
class Route:
    waypoints: list[Point]
    length: float        # m
    duration: float      # s at the planning speed, excluding pickup and turn time
    events: list[tuple[str, Point]]
    skipped: list[Point]  # balls inside a keep-out zone, left for later

    @property
    def picks(self) -> int:
        return sum(1 for e, _ in self.events if e == "pick")


def practice_zones(player_x: tuple[float, float] = (court.HALF_LENGTH - 6.5, court.HALF_LENGTH + 3.0),
                   feeder_y: float = 0.0, feeder_half_width: float = 2.0) -> list[Rect]:
    """Default keep-outs while someone is hitting: the player's back court and the feeder.

    The player is assumed to be on the +x half between the service line and
    3 m behind the baseline; the feeder and its catch net sit behind the -x
    baseline. Pass your own rectangles for a coach feeding by hand.
    """
    w = court.DOUBLES_WIDTH / 2 + 1.5
    return [
        Rect(player_x[0], -w, player_x[1], w),
        Rect(-court.HALF_LENGTH - 3.0, feeder_y - feeder_half_width, -court.HALF_LENGTH + 0.5,
             feeder_y + feeder_half_width),
    ]
