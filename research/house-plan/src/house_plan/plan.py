"""A house plan as data: rooms, walls and openings on a rectangular footprint, from a few parameters.

Coordinates are feet. x runs west to east along the width W, y runs south (front) to north (back)
along the depth D. The ridge runs along y, so rafters span W and bear on the two walls of length D.
Layout: a living/kitchen zone along the front; along the back a bedroom zone of depth `bed_depth`
holding `n_bed` bedrooms side by side and a bathroom at the east end.
"""
from dataclasses import dataclass, field

BATH_W = 6.0  # bathroom width, ft
DOOR_W, DOOR_H = 3.0, 6.667  # exterior door, ft
INT_DOOR_W = 2.5
WIN_H = 4.0  # window height, ft (sill 3 ft)
SILL_FT = 3.0


@dataclass(frozen=True)
class Params:
    width: float = 28.0
    depth: float = 28.0
    n_bed: int = 2
    bed_depth: float = 12.0
    win_w: float = 4.0  # width of each window, ft
    pitch: int = 6  # roof rise per 12 of run
    stud_oc: int = 16
    joist_oc: int = 16
    rafter_oc: int = 24
    overhang: float = 1.0


@dataclass(frozen=True)
class Room:
    name: str
    kind: str  # living, bedroom, bath
    x: float
    y: float
    w: float
    d: float

    @property
    def area(self):
        return self.w * self.d


@dataclass(frozen=True)
class Wall:
    id: str
    x0: float
    y0: float
    x1: float
    y1: float
    exterior: bool
    bearing: bool  # carries the roof and ceiling load

    @property
    def length(self):
        return abs(self.x1 - self.x0) + abs(self.y1 - self.y0)  # walls are axis-aligned


@dataclass(frozen=True)
class Opening:
    wall: str
    offset: float  # ft from the wall's start to the opening's near edge
    width: float
    height: float
    sill: float  # ft above the floor (0 for a door)
    kind: str  # door or window
    room: str


@dataclass
class Plan:
    params: Params
    rooms: list = field(default_factory=list)
    walls: list = field(default_factory=list)
    openings: list = field(default_factory=list)

    def wall(self, wid):
        return next(w for w in self.walls if w.id == wid)

    @property
    def living_area(self):
        return self.params.width * self.params.depth


def _spread(lo, hi, n, w):
    """Offsets of n windows of width w spaced evenly in [lo, hi] (equal gaps at the ends and between)."""
    gap = (hi - lo - n * w) / (n + 1)
    return [lo + gap * (i + 1) + w * i for i in range(n)]


def make_plan(p: Params) -> Plan:
    W, D, b = p.width, p.depth, p.bed_depth
    plan = Plan(p)
    front = D - b
    bed_w = (W - BATH_W) / p.n_bed
    plan.rooms.append(Room("living", "living", 0, 0, W, front))
    for i in range(p.n_bed):
        plan.rooms.append(Room(f"bed{i + 1}", "bedroom", i * bed_w, front, bed_w, b))
    plan.rooms.append(Room("bath", "bath", W - BATH_W, front, BATH_W, b))
    # exterior walls run counter-clockwise from the south-west corner; the roof bears on east and west
    plan.walls += [
        Wall("S", 0, 0, W, 0, True, False),
        Wall("E", W, 0, W, D, True, True),
        Wall("N", W, D, 0, D, True, False),
        Wall("W", 0, D, 0, 0, True, True),
    ]
    # interior walls: the band wall between living and the back zone, then bedroom and bath dividers
    plan.walls.append(Wall("I-band", 0, front, W, front, False, False))
    for i in range(1, p.n_bed):
        plan.walls.append(Wall(f"I-bed{i}", i * bed_w, front, i * bed_w, D, False, False))
    plan.walls.append(Wall("I-bath", W - BATH_W, front, W - BATH_W, D, False, False))

    # openings
    plan.openings.append(Opening("S", W / 2 - DOOR_W / 2, DOOR_W, DOOR_H, 0.0, "door", "living"))
    # living room windows: spread along the front wall on both sides of the door, and along each side wall
    k = max(2, int(W / (p.win_w + 4)))
    gap = DOOR_W / 2 + 0.75
    left, right = (0.0, W / 2 - gap), (W / 2 + gap, W)
    for n, (lo, hi) in ((k - k // 2, left), (k // 2, right)):
        for off in _spread(lo, hi, n, p.win_w):
            plan.openings.append(Opening("S", off, p.win_w, WIN_H, SILL_FT, "window", "living"))
    n_side = max(1, int(front / (p.win_w + 4)))
    for wid in ("W", "E"):
        for off in _spread(0.0, front, n_side, p.win_w):
            plan.openings.append(Opening(wid, off, p.win_w, WIN_H, SILL_FT, "window", "living"))
    for i in range(p.n_bed):
        # the N wall runs east to west, so a room starting at x0 with width bed_w starts at W - x0 - bed_w along it
        x0 = i * bed_w
        nwin = 1 + (bed_w >= 14)
        for off in _spread(W - x0 - bed_w, W - x0, nwin, p.win_w):
            plan.openings.append(Opening("N", off, p.win_w, WIN_H, SILL_FT, "window", f"bed{i + 1}"))
        # door from the living zone into each bedroom, on the band wall
        plan.openings.append(Opening("I-band", x0 + bed_w / 2 - INT_DOOR_W / 2, INT_DOOR_W, 6.667, 0.0, "door", f"bed{i + 1}"))
    plan.openings.append(Opening("N", 1.5, 2.0, 2.0, 4.5, "window", "bath"))  # small bath window, west end of the bath
    plan.openings.append(Opening("I-band", W - BATH_W / 2 - INT_DOOR_W / 2, INT_DOOR_W, 6.667, 0.0, "door", "bath"))
    return plan
