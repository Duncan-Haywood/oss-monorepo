"""Device catalogue and kit search copied from capture-realkit (sourced figures, read 2026-10-21); kept here so the project is self-contained.

Original docstring:

Kit optimiser for multi-angle travel filming.

A kit is cameras (some with lenses), mounts and spare battery packs. Its *variety* is the number of
distinct shots (focal band x viewpoint) it can make: a band is covered by a camera (or a camera+lens),
a viewpoint by a mount. Its *hours* is carried watt-hours over the draw of the cameras that run at once.
Device figures come from the sources in SOURCES (retailer and manufacturer pages read 2026-10-21); the few
that no source gave are listed in ASSUMED and are swept in experiments/run.py. See README.
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
    Camera("Insta360 X4 (360)", 203, (14, 24), 8.8, 3.9),
    Camera("DJI Osmo Action 4", 145, (14, 24), 6.8, 2.5),
    Camera("iPhone 15 Pro Max", 221, (14, 24, 50, 135), 17.2, 4.0),
    Camera("Sony a7C II body", 514, (), 16.4, 9.8, lens_mount=True),
)
LENSES = (
    Lens("Sony FE 24-70 f/2.8 GM II", 695, (24, 35, 50)),
    Lens("Sony FE 70-200 f/4 G II", 794, (85, 135)),
    Lens("Sony FE 85 f/1.8", 371, (85,)),
)
MOUNTS = (
    Mount("selfie pole", 200, "pole"),
    Mount("mini tripod", 150, "stand"),
    Mount("Peak Design carbon travel tripod", 1270, "stand"),
    Mount("telescoping mast", 1200, "high"),
)
PACKS = (
    Pack("Anker Prime 20K (72 Wh)", 540, 72.0),
    Pack("Anker 737 24K (88.8 Wh)", 630, 88.8),
    Pack("160 Wh pack (illustrative)", 1100, 160.0),    # over the carry-on limit: the search must never pick it
)
MAX_PACKS = 2

# Where each figure came from (read 2026-10-21). "derived" = arithmetic on a sourced figure.
SOURCES = {
    "Insta360 X4 (360)": "203 g, 2290 mAh, 135 min at 5.7K30 lab test: Insta360 listings via retailers (Louis.ie, Fotofabrikas). Wh = 2.29 Ah x 3.85 V (voltage assumed, as DJI's). Draw = Wh / 2.25 h (derived). Bands: capture-crop.",
    "DJI Osmo Action 4": "145 g, 6.8 Wh, operating time 160 min at 1080p24: DJI spec page https://www.dji.com/osmo-action-4/specs. Draw derived. Bands assumed from a wide action lens.",
    "iPhone 15 Pro Max": "221 g: Apple tech specs; 4441 mAh: Smartprix (Swappa says 4422); Wh = mAh x 3.87 V (voltage assumed). Lens bands 13/24/48/120 mm equivalent (general knowledge, 5x tele per a retailer), snapped to the nearest band. Recording draw ASSUMED 4 W: Apple publishes video playback only (23 h).",
    "Sony a7C II body": "514 g with battery and card: retailer listings. NP-FZ100 16.4 Wh (2.28 Ah x 7.2 V, general knowledge). Draw from a listed 100 min video life (unverified, not Sony's own page).",
    "Sony FE 24-70 f/2.8 GM II": "695 g: Wikipedia and several retailers.",
    "Sony FE 70-200 f/4 G II": "794 g: The Digital Picture (manufacturer 28 oz, measured 794.3 g).",
    "Sony FE 85 f/1.8": "371 g: Camera Decision only; one source.",
    "Peak Design carbon travel tripod": "1.27 kg: Leica Store Miami listing, Robert's Camera.",
    "Anker Prime 20K (72 Wh)": "72 Wh, 539 to 540 g: Galaxus listings.",
    "Anker 737 24K (88.8 Wh)": "88.8 Wh, 630 g: Currys, Digitec, Galaxus listings (Alza says 635 g).",
}
# Fields no source gave. Swept by +-ASSUMED_SPREAD in experiments/run.py.
ASSUMED = ("iPhone draw 4 W", "selfie pole 200 g", "mini tripod 150 g", "telescoping mast 1200 g", "160 Wh pack mass",
           "viewpoint labels and which bands each device covers")
ASSUMED_SPREAD = 0.3



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
