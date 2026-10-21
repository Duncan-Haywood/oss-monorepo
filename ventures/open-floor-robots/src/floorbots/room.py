"""Room maps: rectangles in metres, rasterised to an occupancy grid.

A room is a union of floor rectangles minus obstacle rectangles (furniture
the robot cannot drive under, wall stubs, kitchen islands). Rectangles are
(x0, y0, x1, y1) in metres with the origin at the lower-left corner of the
room's bounding box. Keep their corners on a 0.1 m grid: the browser port
(sim.mjs) rasterises the same way and must get the same cells.

The grid is row-major: cell (i, j) is column i (x), row j (y), index
j * w + i, centre at ((i + 0.5) * res, (j + 0.5) * res).
"""

from __future__ import annotations

from dataclasses import dataclass, field

Rect = tuple[float, float, float, float]


@dataclass(frozen=True)
class Room:
    name: str
    floor: tuple[Rect, ...]
    obstacles: tuple[Rect, ...] = ()
    dock: tuple[float, float] = (0.3, 0.3)   # where the robot starts and returns to charge
    note: str = ""

    @property
    def size(self) -> tuple[float, float]:
        return (max(r[2] for r in self.floor), max(r[3] for r in self.floor))

    def floor_area(self) -> float:
        """Exact area of floor minus obstacles, assuming floor rectangles don't overlap."""
        return sum((r[2] - r[0]) * (r[3] - r[1]) for r in self.floor) - sum(
            (r[2] - r[0]) * (r[3] - r[1]) for r in self.obstacles)


@dataclass
class Grid:
    w: int
    h: int
    res: float
    free: bytearray          # 1 = floor the robot could clean, 0 = wall or furniture
    room: Room | None = field(default=None, repr=False)

    def idx(self, i: int, j: int) -> int:
        return j * self.w + i

    def inside(self, i: int, j: int) -> bool:
        return 0 <= i < self.w and 0 <= j < self.h

    def is_free(self, i: int, j: int) -> bool:
        return self.inside(i, j) and self.free[j * self.w + i] == 1

    def centre(self, i: int, j: int) -> tuple[float, float]:
        return ((i + 0.5) * self.res, (j + 0.5) * self.res)

    def cell_of(self, x: float, y: float) -> tuple[int, int]:
        return (int(x / self.res), int(y / self.res))

    def free_count(self) -> int:
        return sum(self.free)


def _in(r: Rect, x: float, y: float) -> bool:
    return r[0] < x < r[2] and r[1] < y < r[3]


def rasterise(room: Room, res: float = 0.05) -> Grid:
    W, H = room.size
    w = int(round(W / res))
    h = int(round(H / res))
    free = bytearray(w * h)
    for j in range(h):
        y = (j + 0.5) * res
        for i in range(w):
            x = (i + 0.5) * res
            if any(_in(r, x, y) for r in room.floor) and not any(_in(r, x, y) for r in room.obstacles):
                free[j * w + i] = 1
    return Grid(w, h, res, free, room)


def from_ascii(rows: list[str], res: float = 0.1, name: str = "ascii") -> Grid:
    """Grid from text: '.' floor, anything else blocked; the first row is the top of the room."""
    h = len(rows)
    w = max(len(r) for r in rows)
    free = bytearray(w * h)
    for jj, row in enumerate(rows):
        j = h - 1 - jj
        for i, ch in enumerate(row):
            if ch == ".":
                free[j * w + i] = 1
    return Grid(w, h, res, free, None)


PRESETS: dict[str, Room] = {
    "bedroom": Room(
        "bedroom",
        floor=((0.0, 0.0, 3.6, 3.2),),
        obstacles=(
            (0.0, 0.8, 2.0, 2.4),     # double bed against the left wall (too low to drive under)
            (0.0, 2.4, 0.4, 2.8),     # bedside table
            (2.4, 2.6, 3.6, 3.2),     # wardrobe
        ),
        dock=(3.3, 0.3),
        note="3.6 x 3.2 m bedroom: bed, bedside table, wardrobe",
    ),
    "living": Room(
        "living",
        floor=((0.0, 0.0, 5.0, 4.0),),
        obstacles=(
            (0.3, 3.1, 2.5, 4.0),     # sofa
            (1.0, 1.8, 2.2, 2.4),     # low coffee table
            (3.9, 2.8, 4.8, 3.8),     # armchair
            (1.0, 0.0, 2.6, 0.4),     # TV stand
            (3.2, 0.4, 3.3, 0.5),     # dining table legs
            (4.5, 0.4, 4.6, 0.5),
            (3.2, 1.3, 3.3, 1.4),
            (4.5, 1.3, 4.6, 1.4),
        ),
        dock=(0.3, 0.3),
        note="5 x 4 m living room: sofa, coffee table, armchair, TV stand, four dining-table legs",
    ),
    "apartment": Room(
        "apartment",
        floor=((0.0, 0.0, 7.0, 3.5), (0.0, 3.5, 3.5, 6.0)),
        obstacles=(
            (3.0, 0.0, 3.1, 1.6),     # wall stub between kitchen and living area
            (4.5, 1.2, 5.7, 2.1),     # kitchen island
            (0.2, 5.2, 2.4, 6.0),     # sofa
            (1.2, 3.9, 2.2, 4.6),     # low table
        ),
        dock=(6.7, 0.3),
        note="L-shaped open-plan flat, 7 x 6 m bounding box: kitchen island, wall stub, sofa, low table",
    ),
}
