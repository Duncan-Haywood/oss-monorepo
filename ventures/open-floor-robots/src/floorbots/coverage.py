"""Coverage planning: edge pass, then boustrophedon lanes, on an occupancy grid.

1. Configuration space. A cell is reachable by the robot's centre when every
   cell within (robot radius + margin) of it is floor. Out-of-grid counts as
   wall.
2. Region. The 4-connected reachable cells around the dock.
3. Edge pass (wall following). The region's boundary cells, chained
   nearest-first. This is the pass where a side brush earns its keep.
4. Boustrophedon decomposition (Choset's cell decomposition, discretised).
   Sweep the region column by column; a run of cells continues one cell
   while it overlaps exactly one run in the next column and that run
   overlaps only it. Every split or merge starts a new cell.
5. Lanes. Inside each cell, back-and-forth columns spaced by the cleaning
   width minus the overlap. Cells are visited nearest-entry-first.
6. Connections. A straight move when the line stays in the region,
   otherwise a breadth-first path, pruned by line of sight.

Everything here is integer cell arithmetic with fixed tie-breaks, so the
browser port (sim.mjs) produces the same path; `fixtures.py` checks it.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field

from .room import Grid

Cell = tuple[int, int]
EDGE = "edge"
LANE = "lane"
LINK = "link"


@dataclass
class Plan:
    grid: Grid
    reach: bytearray                 # 1 = in the robot-centre region
    waypoints: list[Cell]            # in cell coordinates
    phases: list[str]                # phase of the segment ending at waypoints[k] (phases[0] = "start")
    lanes: int = 0
    cells: int = 0
    lane_spacing: float = 0.0
    notes: list[str] = field(default_factory=list)

    def points(self) -> list[tuple[float, float]]:
        return [self.grid.centre(i, j) for i, j in self.waypoints]

    def length(self, phase: str | None = None) -> float:
        res = self.grid.res
        total = 0.0
        for k in range(1, len(self.waypoints)):
            if phase is None or self.phases[k] == phase:
                (a, b), (c, d) = self.waypoints[k - 1], self.waypoints[k]
                total += math.sqrt((c - a) * (c - a) + (d - b) * (d - b)) * res
        return total

    def turning(self) -> float:
        """Total absolute heading change at the waypoints, in radians."""
        total = 0.0
        prev = None
        for k in range(1, len(self.waypoints)):
            (a, b), (c, d) = self.waypoints[k - 1], self.waypoints[k]
            if a == c and b == d:
                continue
            h = math.atan2(d - b, c - a)
            if prev is not None:
                dh = abs(h - prev)
                if dh > math.pi:
                    dh = 2 * math.pi - dh
                total += dh
            prev = h
        return total


# ---------------------------------------------------------------- c-space

def disk(radius_cells: float) -> list[Cell]:
    """Integer offsets within radius_cells, in a fixed order."""
    rr = radius_cells * radius_cells
    n = int(math.floor(radius_cells))
    return [(di, dj) for dj in range(-n, n + 1) for di in range(-n, n + 1) if di * di + dj * dj <= rr]


def body(radius_cells: float) -> list[Cell]:
    """Offsets of every cell a disk at a cell centre overlaps at all (conservative, for collision)."""
    rr = radius_cells * radius_cells
    n = int(math.ceil(radius_cells + 0.5))
    out = []
    for dj in range(-n, n + 1):
        for di in range(-n, n + 1):
            x = max(0.0, abs(di) - 0.5)
            y = max(0.0, abs(dj) - 0.5)
            if x * x + y * y < rr:
                out.append((di, dj))
    return out


def cspace(grid: Grid, radius: float) -> bytearray:
    offs = body(radius / grid.res)
    w, h, free = grid.w, grid.h, grid.free
    out = bytearray(w * h)
    for j in range(h):
        for i in range(w):
            if not free[j * w + i]:
                continue
            ok = 1
            for di, dj in offs:
                ii, jj = i + di, j + dj
                if ii < 0 or jj < 0 or ii >= w or jj >= h or not free[jj * w + ii]:
                    ok = 0
                    break
            out[j * w + i] = ok
    return out


def nearest_cell(grid: Grid, mask: bytearray, x: float, y: float) -> Cell:
    """The mask cell nearest (x, y); ties go to the lowest index."""
    ci, cj = grid.cell_of(x, y)
    best, bd = None, None
    for j in range(grid.h):
        for i in range(grid.w):
            if mask[j * grid.w + i]:
                d = (i - ci) * (i - ci) + (j - cj) * (j - cj)
                if bd is None or d < bd:
                    best, bd = (i, j), d
    if best is None:
        raise ValueError("the robot fits nowhere in this room")
    return best


def region(grid: Grid, mask: bytearray, start: Cell) -> bytearray:
    w = grid.w
    out = bytearray(len(mask))
    out[start[1] * w + start[0]] = 1
    q = deque([start])
    while q:
        i, j = q.popleft()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ii, jj = i + di, j + dj
            if 0 <= ii < w and 0 <= jj < grid.h:
                k = jj * w + ii
                if mask[k] and not out[k]:
                    out[k] = 1
                    q.append((ii, jj))
    return out


# ---------------------------------------------------------------- paths

def line_clear(grid: Grid, reach: bytearray, a: Cell, b: Cell) -> bool:
    d2 = (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])
    n = max(1, int(math.ceil(math.sqrt(d2) * 4)))
    w = grid.w
    for k in range(n + 1):
        x = a[0] + (b[0] - a[0]) * k / n
        y = a[1] + (b[1] - a[1]) * k / n
        i, j = int(math.floor(x + 0.5)), int(math.floor(y + 0.5))
        if not (0 <= i < w and 0 <= j < grid.h) or not reach[j * w + i]:
            return False
    return True


def bfs_path(grid: Grid, reach: bytearray, a: Cell, b: Cell) -> list[Cell]:
    """Shortest 4-connected path a -> b inside reach (inclusive), pruned by line of sight."""
    w = grid.w
    start, goal = a[1] * w + a[0], b[1] * w + b[0]
    parent = {start: -1}
    q = deque([start])
    while q:
        k = q.popleft()
        if k == goal:
            break
        i, j = k % w, k // w
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ii, jj = i + di, j + dj
            if 0 <= ii < w and 0 <= jj < grid.h:
                kk = jj * w + ii
                if reach[kk] and kk not in parent:
                    parent[kk] = k
                    q.append(kk)
    if goal not in parent:
        raise ValueError(f"no path from {a} to {b}")
    raw = []
    k = goal
    while k != -1:
        raw.append((k % w, k // w))
        k = parent[k]
    raw.reverse()
    # Line-of-sight pruning: from each anchor jump to the furthest visible cell.
    out = [raw[0]]
    i = 0
    while i < len(raw) - 1:
        j = len(raw) - 1
        while j > i + 1 and not line_clear(grid, reach, raw[i], raw[j]):
            j -= 1
        out.append(raw[j])
        i = j
    return out


def _link(grid, reach, path, phases, target, phase):
    """Append target to path, via a detour if the straight line leaves the region."""
    a = path[-1]
    if a == target:
        return
    if line_clear(grid, reach, a, target):
        path.append(target)
        phases.append(phase)
        return
    for c in bfs_path(grid, reach, a, target)[1:]:
        path.append(c)
        phases.append(LINK)
    phases[-1] = phase if phase != LINK else LINK


# ---------------------------------------------------------------- edge pass

def boundary(grid: Grid, reach: bytearray) -> list[Cell]:
    w, h = grid.w, grid.h
    out = []
    for j in range(h):
        for i in range(w):
            if not reach[j * w + i]:
                continue
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ii, jj = i + di, j + dj
                if not (0 <= ii < w and 0 <= jj < h) or not reach[jj * w + ii]:
                    out.append((i, j))
                    break
    return out


def edge_order(cells: list[Cell], start: Cell) -> list[Cell]:
    """Greedy nearest-neighbour chain; ties go to the earliest cell in row-major order."""
    left = list(cells)
    used = [False] * len(left)
    cur = start
    out = []
    for _ in range(len(left)):
        best, bd = -1, None
        for k, c in enumerate(left):
            if used[k]:
                continue
            d = (c[0] - cur[0]) * (c[0] - cur[0]) + (c[1] - cur[1]) * (c[1] - cur[1])
            if bd is None or d < bd:
                best, bd = k, d
        used[best] = True
        cur = left[best]
        out.append(cur)
    return out


# ---------------------------------------------------------------- boustrophedon

def columns(grid: Grid, reach: bytearray) -> list[list[tuple[int, int]]]:
    """Per column i, the runs (j0, j1) of region cells, bottom to top."""
    w, h = grid.w, grid.h
    out = []
    for i in range(w):
        runs = []
        j = 0
        while j < h:
            if reach[j * w + i]:
                j0 = j
                while j < h and reach[j * w + i]:
                    j += 1
                runs.append((j0, j - 1))
            else:
                j += 1
        out.append(runs)
    return out


def _overlap(a, b) -> bool:
    return a[0] <= b[1] and b[0] <= a[1]


def decompose(grid: Grid, reach: bytearray) -> list[dict]:
    """Boustrophedon cells: each {'c0': first column, 'runs': [(j0, j1) per column]}."""
    cols = columns(grid, reach)
    cells = []
    active = {}      # run index in previous column -> cell index
    prev = []
    for i, runs in enumerate(cols):
        now = {}
        for r, run in enumerate(runs):
            ups = [p for p, pr in enumerate(prev) if _overlap(pr, run)]
            if len(ups) == 1:
                p = ups[0]
                downs = [q for q, qr in enumerate(runs) if _overlap(prev[p], qr)]
                if len(downs) == 1 and p in active:
                    c = active[p]
                    cells[c]["runs"].append(run)
                    now[r] = c
                    continue
            cells.append({"c0": i, "runs": [run]})
            now[r] = len(cells) - 1
        active = now
        prev = runs
    return cells


def _lane_columns(c0: int, n: int, step: int) -> list[int]:
    cols = list(range(0, n, step))
    if cols[-1] != n - 1:
        cols.append(n - 1)
    return [c0 + k for k in cols]


def _uncovered(run, segs):
    out = []
    j = run[0]
    for a, b in sorted(segs):
        if a > j:
            out.append((j, a - 1))
        j = max(j, b + 1)
    if j <= run[1]:
        out.append((j, run[1]))
    return out


def lane_set(cell: dict, step: int) -> list[tuple[int, int, int]]:
    """Lanes (column, j0, j1) for one cell, in column order.

    Regular lanes every `step` columns cover `step // 2` columns either side,
    but only over their own run. Where a neighbouring column's run is taller,
    the overhang would be missed, so short patch lanes fill it.
    """
    c0, runs = cell["c0"], cell["runs"]
    n = len(runs)
    h = step // 2
    lanes = [(c, runs[c - c0][0], runs[c - c0][1]) for c in _lane_columns(c0, n, step)]
    cov = [[] for _ in range(n)]

    def mark(col, j0, j1):
        for k in range(max(0, col - c0 - h), min(n - 1, col - c0 + h) + 1):
            a, b = max(j0, runs[k][0]), min(j1, runs[k][1])
            if a <= b:
                cov[k].append((a, b))

    for lane in lanes:
        mark(*lane)
    for k in range(n):
        for a, b in _uncovered(runs[k], cov[k]):
            kk = min(n - 1, k + h)
            while kk > k and not (runs[kk][0] <= a and b <= runs[kk][1]):
                kk -= 1
            lane = (c0 + kk, a, b)
            lanes.append(lane)
            mark(*lane)
    return sorted(lanes)


def _cell_lanes(lanes: list[tuple[int, int, int]], reverse: bool, up: bool) -> list[tuple[Cell, Cell]]:
    out = []
    for col, j0, j1 in (lanes[::-1] if reverse else lanes):
        out.append(((col, j0), (col, j1)) if up else ((col, j1), (col, j0)))
        up = not up
    return out


def plan(grid: Grid, robot_radius: float = 0.165, clean_width: float = 0.17, overlap: float = 0.10,
         start: tuple[float, float] | None = None, edge: bool = True, margin: float = 0.01) -> Plan:
    if not 0 <= overlap < 0.9:
        raise ValueError("overlap must be in [0, 0.9)")
    mask = cspace(grid, robot_radius + margin)
    if start is None:
        start = grid.room.dock if grid.room else (grid.w * grid.res / 2, grid.h * grid.res / 2)
    s = nearest_cell(grid, mask, *start)
    reach = region(grid, mask, s)
    path, phases = [s], ["start"]
    if edge:
        for c in edge_order(boundary(grid, reach), s):
            a = path[-1]
            # Only steps to a neighbouring boundary cell follow the wall; a jump is a transit move.
            near = (c[0] - a[0]) * (c[0] - a[0]) + (c[1] - a[1]) * (c[1] - a[1]) <= 2
            _link(grid, reach, path, phases, c, EDGE if near else LINK)
    step = max(1, int(math.floor(clean_width * (1 - overlap) / grid.res + 1e-9)))
    cells = decompose(grid, reach)
    sets = [lane_set(c, step) for c in cells]
    done = [False] * len(cells)
    lanes = 0
    for _ in range(len(cells)):
        cur = path[-1]
        best, bd = None, None
        for k in range(len(cells)):
            if done[k]:
                continue
            for reverse in (False, True):
                for up in (True, False):
                    first = _cell_lanes(sets[k], reverse, up)[0][0]
                    d = (first[0] - cur[0]) * (first[0] - cur[0]) + (first[1] - cur[1]) * (first[1] - cur[1])
                    if bd is None or d < bd:
                        best, bd = (k, reverse, up), d
        k, reverse, up = best
        done[k] = True
        for a, b in _cell_lanes(sets[k], reverse, up):
            if a == b:   # a one-cell lane: clean on the way in
                _link(grid, reach, path, phases, a, LANE)
            else:
                _link(grid, reach, path, phases, a, LINK)
                _link(grid, reach, path, phases, b, LANE)
            lanes += 1
    _link(grid, reach, path, phases, s, LINK)  # back to the dock
    wp, ph = simplify(path, phases)
    return Plan(grid, reach, wp, ph, lanes=lanes, cells=len(cells), lane_spacing=step * grid.res)


def simplify(path: list[Cell], phases: list[str]) -> tuple[list[Cell], list[str]]:
    """Drop repeated points and interior points of straight same-phase runs."""
    wp, ph = [path[0]], [phases[0]]
    for c, p in zip(path[1:], phases[1:]):
        if c == wp[-1]:
            continue
        if len(wp) >= 2 and ph[-1] == p:
            (ax, ay), (bx, by) = wp[-2], wp[-1]
            cross = (bx - ax) * (c[1] - ay) - (by - ay) * (c[0] - ax)
            dot = (bx - ax) * (c[0] - bx) + (by - ay) * (c[1] - by)
            if cross == 0 and dot > 0:
                wp[-1] = c
                continue
        wp.append(c)
        ph.append(p)
    return wp, ph


# ---------------------------------------------------------------- coverage

def paint(grid: Grid, path: list[Cell], phases: list[str], radius: dict[str, float],
          into: bytearray | None = None) -> bytearray:
    """Mark floor cells within radius[phase] of each segment (sampled every half cell)."""
    w, h = grid.w, grid.h
    out = into if into is not None else bytearray(w * h)
    offsets = {p: disk(r / grid.res) for p, r in radius.items()}
    for k in range(1, len(path)):
        offs = offsets.get(phases[k])
        if not offs:
            continue
        (ax, ay), (bx, by) = path[k - 1], path[k]
        d2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay)
        n = max(1, int(math.ceil(math.sqrt(d2) * 2)))
        for s in range(n + 1):
            ci = int(math.floor(ax + (bx - ax) * s / n + 0.5))
            cj = int(math.floor(ay + (by - ay) * s / n + 0.5))
            for di, dj in offs:
                i, j = ci + di, cj + dj
                if 0 <= i < w and 0 <= j < h and grid.free[j * w + i]:
                    out[j * w + i] = 1
    return out


def coverage(grid: Grid, painted: bytearray) -> float:
    return sum(painted) / max(1, grid.free_count())
