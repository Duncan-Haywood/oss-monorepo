"""Kit optimiser for multi-angle travel filming.

A kit is cameras (some with lenses), mounts and spare battery packs. Its *variety* is the number of
distinct shots (focal band x viewpoint) it can make: a band is covered by a camera (or a camera+lens),
a viewpoint by a mount. Its *hours* is carried watt-hours over the draw of the cameras that run at once.
Every device figure below is ASSUMED (round numbers typical of the class, not a datasheet), see README.
"""
from dataclasses import dataclass
from itertools import product

BANDS = (14, 24, 35, 50, 85, 135)          # full-frame-equivalent mm
VIEWPOINTS = ("pole", "stand", "high")      # held 0.8 m / stood back 1.5-3 m / raised above head
CARRY_ON_WH_LIMIT = 100.0                   # per battery, FAA PackSafe (checked 2026-10-19)


@dataclass(frozen=True)
class Camera:
    name: str
    grams: int
    bands: tuple          # bands it covers with no lens change
    wh: float             # internal battery
    watts: float          # recording draw
    lens_mount: bool = False


@dataclass(frozen=True)
class Lens:
    name: str
    grams: int
    bands: tuple


@dataclass(frozen=True)
class Mount:
    name: str
    grams: int
    viewpoint: str


@dataclass(frozen=True)
class Pack:
    name: str
    grams: int
    wh: float


CAMERAS = (
    Camera("360 camera", 200, (14, 24), 6.9, 5.0),
    Camera("action camera", 120, (14, 24), 5.0, 4.5),
    Camera("phone telephoto", 200, (24, 50, 85), 15.0, 4.0),
    Camera("mirrorless body", 450, (), 12.0, 6.0, lens_mount=True),
)
LENSES = (
    Lens("24-70 zoom", 550, (24, 35, 50)),
    Lens("70-200 zoom", 1100, (85, 135)),
    Lens("85 prime", 400, (85,)),
)
MOUNTS = (
    Mount("selfie pole", 200, "pole"),
    Mount("mini tripod", 150, "stand"),
    Mount("travel tripod", 900, "stand"),
    Mount("telescoping mast", 1200, "high"),
)
PACKS = (
    Pack("20 Wh pack", 250, 20.0),
    Pack("60 Wh pack", 500, 60.0),
    Pack("99 Wh pack", 700, 99.0),
    Pack("160 Wh pack", 1100, 160.0),    # over the carry-on limit: the search must never pick it
)
MAX_PACKS = 2


@dataclass(frozen=True)
class Kit:
    cameras: tuple
    lenses: tuple
    mounts: tuple
    packs: tuple      # Pack objects, repeats allowed


def grams(k):
    return sum(c.grams for c in k.cameras) + sum(l.grams for l in k.lenses) + \
        sum(m.grams for m in k.mounts) + sum(p.grams for p in k.packs)


def legal(k):
    """Every battery, internal or spare, at or under 100 Wh."""
    return all(c.wh <= CARRY_ON_WH_LIMIT for c in k.cameras) and all(p.wh <= CARRY_ON_WH_LIMIT for p in k.packs)


def bands(k):
    out = set()
    for c in k.cameras:
        out.update(c.bands)
        if c.lens_mount:
            for l in k.lenses:
                out.update(l.bands)
    return out


def variety(k):
    """Distinct (band, viewpoint) shots: a band needs a camera that covers it, a viewpoint needs a mount."""
    return len(bands(k)) * len({m.viewpoint for m in k.mounts})


def hours(k):
    """Carried Wh over the draw of the cameras that can run at once (one per mount, worst-case draw first)."""
    if not k.cameras:
        return 0.0
    wh = sum(c.wh for c in k.cameras) + sum(p.wh for p in k.packs)
    active = sorted((c.watts for c in k.cameras), reverse=True)[:max(1, len(k.mounts))]
    return wh / sum(active)


def score(k):
    return (variety(k), round(hours(k), 6))


def _subsets(items):
    for mask in product((0, 1), repeat=len(items)):
        yield tuple(i for i, b in zip(items, mask) if b)


def _pack_multisets(packs, n):
    def rec(i, left):
        if i == len(packs):
            yield ()
            return
        for c in range(left + 1):
            for rest in rec(i + 1, left - c):
                yield (packs[i],) * c + rest
    yield from rec(0, n)


def all_kits():
    """Every kit: camera subset, lens subset (only if a lens-mount body is in), mount subset, up to MAX_PACKS packs."""
    for cams in _subsets(CAMERAS):
        has_mount = any(c.lens_mount for c in cams)
        for lens in (_subsets(LENSES) if has_mount else [()]):
            for mts in _subsets(MOUNTS):
                for pk in _pack_multisets(PACKS, MAX_PACKS):
                    yield Kit(cams, lens, mts, pk)


def exact(budget_g, kits=None, min_hours=0.0):
    """Best legal kit within budget and recording hours: most variety, then most hours, then lightest."""
    best, bs = None, None
    for k in (kits if kits is not None else all_kits()):
        if grams(k) > budget_g or not legal(k) or hours(k) < min_hours:
            continue
        s = (score(k), -grams(k))
        if bs is None or s > bs:
            best, bs = k, s
    return best


def greedy(budget_g):
    """Add the single item with the best marginal (variety, hours) gain per gram until nothing fits or helps."""
    k = Kit((), (), (), ())
    pool = [("cameras", c) for c in CAMERAS] + [("lenses", l) for l in LENSES] + \
           [("mounts", m) for m in MOUNTS] + [("packs", p) for p in PACKS]
    while True:
        best, bgain = None, 0.0
        for field, item in pool:
            if field != "packs" and item in getattr(k, field):
                continue
            if field == "packs" and len(k.packs) >= MAX_PACKS:
                continue
            nk = Kit(*(getattr(k, f) + ((item,) if f == field else ()) for f in ("cameras", "lenses", "mounts", "packs")))
            if grams(nk) > budget_g or not legal(nk):
                continue
            dv = variety(nk) - variety(k)
            dh = hours(nk) - hours(k)
            gain = (dv + 0.1 * dh) / item.grams
            if gain > bgain:
                best, bgain = nk, gain
        if best is None:
            return k
        k = best


def describe(k):
    if k is None:
        return "(nothing fits)"
    names = [c.name for c in k.cameras] + [l.name for l in k.lenses] + [m.name for m in k.mounts] + [p.name for p in k.packs]
    return ", ".join(names) or "(empty)"
