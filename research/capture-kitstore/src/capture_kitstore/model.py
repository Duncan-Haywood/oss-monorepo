"""Kit and storage chosen together.

`catalogue.py` is the capture-realkit catalogue (sourced cameras, lenses, mounts, packs). This module adds the
footage those cameras make and the lightest storage kit that gets a day of it backed up each evening (the
capture-storage model: cards reused daily, SSD copies holding the whole trip, parallel card readers).
A camera with no card slot (the phone) still produces data; it is offloaded over a reader-equivalent cable and
counted as one more stream through the same readers (an assumption, see README).
"""
from dataclasses import dataclass
from math import ceil
from itertools import product
from .catalogue import (CAMERAS, LENSES, MOUNTS, PACKS, BANDS, VIEWPOINTS, Kit, all_kits, grams as kit_grams,
                        legal, variety, hours)

# camera name prefix -> Mbit/s. Only the action-camera figure is sourced (capture-storage PARAMS).
BITRATE = {"Insta360": 120.0, "DJI": 120.0, "iPhone": 60.0, "Sony": 200.0}
BITRATE_STATUS = {"Insta360": "assumed (page 403)", "DJI": "sourced, dji.com spec 120 Mbps",
                  "iPhone": "assumed", "Sony": "assumed"}
SSD_G = {1000: 45.0, 2000: 55.0, 4000: 75.0}     # GB -> g (assumed, capture-storage)
CARD_G, CARD_GB = 0.25, 512                      # microSD mass sourced (Wikipedia SD card infobox); size is a choice
READER_G = 25.0                                  # assumed
READER_MBS = 104.0                               # UHS-I bus ceiling (sourced): a best case
HEADROOM = 1.1
MAX_READERS = 8


def bitrate(cam):
    return next(v for k, v in BITRATE.items() if cam.name.startswith(k))


def active(k):
    """Cameras recording at once: one per mount, highest draw first (the same rule `hours` uses)."""
    return sorted(k.cameras, key=lambda c: -c.watts)[:max(1, len(k.mounts))]


def day_gb(k, rec_hours, scale=1.0):
    return sum(bitrate(c) * 3600 / 8 / 1000 * rec_hours * scale for c in active(k))


@dataclass(frozen=True)
class Storage:
    grams: float
    cards: int
    ssds: int
    readers: int
    day_gb: float
    offload_h: float


def storage(k, rec_hours=4.0, days=7, copies=2, max_offload_h=1.0, scale=1.0, reader_mbs=None):
    """Lightest cards + SSDs + readers whose nightly copy of one day fits max_offload_h; None if none within
    MAX_READERS. A kit with no camera needs none (zero grams)."""
    reader_mbs = reader_mbs or READER_MBS
    day = day_gb(k, rec_hours, scale)
    if day == 0:
        return Storage(0.0, 0, 0, 0, 0.0, 0.0)
    trip = day * days
    per_cam = [bitrate(c) * 3600 / 8 / 1000 * rec_hours * scale * HEADROOM for c in active(k)]
    cards = sum(ceil(x / CARD_GB) for x in per_cam)
    best = None
    for ssd, readers in product(SSD_G, range(1, MAX_READERS + 1)):
        t = day * 1000 / (readers * reader_mbs) / 3600 * copies
        if t > max_offload_h:
            continue
        n_ssd = ceil(trip * HEADROOM / ssd) * copies
        g = cards * CARD_G + n_ssd * SSD_G[ssd] + readers * READER_G
        if best is None or g < best.grams:
            best = Storage(g, cards, n_ssd, readers, day, t)
    return best


def total_grams(k, st):
    return kit_grams(k) + (st.grams if st else 0.0)


def exact_joint(budget_g, kits, min_hours=4.0, with_storage=True, **kw):
    """Best legal kit whose kit + storage weight fits budget_g: most variety, then hours, then lightest.
    Returns (kit, storage) or (None, None)."""
    best, bs = (None, None), None
    for k in kits:
        if not legal(k) or hours(k) < min_hours:
            continue
        st = storage(k, min_hours, **kw) if with_storage else Storage(0, 0, 0, 0, 0, 0)
        if st is None:
            continue
        g = total_grams(k, st)
        if g > budget_g:
            continue
        s = ((variety(k), round(hours(k), 6)), -g)
        if bs is None or s > bs:
            best, bs = (k, st), s
    return best


def describe(k):
    names = [c.name for c in k.cameras] + [l.name for l in k.lenses] + [m.name for m in k.mounts] + [p.name for p in k.packs]
    return ", ".join(names) or "(empty)"
