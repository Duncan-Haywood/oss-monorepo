"""Footage storage for a multi-camera travel kit.

N cameras record H hours a day for D days. Footage must sit on cards while shooting and, to carry less, be
offloaded each night to portable SSDs. This model counts the data, the grams of cards and SSDs, the evening
offload time and the footage that exists on only one copy. Every figure below is ASSUMED (round numbers
typical of the class, not a datasheet), see README.
"""
from dataclasses import dataclass
from itertools import product
from math import ceil

# recording bitrate in Mbit/s at the "high" quality setting (assumed)
CAMERAS = {"360 camera": 120.0, "action camera": 100.0, "phone telephoto": 60.0, "mirrorless body": 200.0}
CARDS = {256: 0.4, 512: 0.5, 1024: 0.6}        # GB -> grams (microSD / SD class, assumed)
SSDS = {1000: 45.0, 2000: 55.0, 4000: 75.0}    # GB -> grams (portable SSD, assumed)
READER_G = 25.0                                # card reader plus cable, per parallel reader (assumed)
READER_MBS = 90.0                              # sustained card-to-SSD copy, MB/s per reader (assumed)
SSD_WRITE_MBS = 400.0                          # sustained write into one portable SSD, MB/s (assumed)
MAX_READERS = 8
PACK_WH_PER_G = 99.0 / 700.0                   # the 99 Wh pack of capture-kit
CAMERA_WATTS = {"360 camera": 5.0, "action camera": 4.5, "phone telephoto": 4.0, "mirrorless body": 6.0}
HEADROOM = 1.1                                 # fill cards and disks only to 1/1.1 of nominal


def gb_per_hour(mbps):
    return mbps * 3600 / 8 / 1000


def day_gb(cams, hours, scale=1.0):
    """GB one shooting day produces: sum over cameras of rate x hours x codec scale."""
    return sum(gb_per_hour(CAMERAS[c]) * hours * scale for c in cams)


@dataclass(frozen=True)
class Plan:
    name: str
    grams: float
    cards: int
    ssds: int
    readers: int
    offload_h: float      # evening copy time per night (0 if none)
    exposed_gb: float     # footage held in one copy at the worst moment


def cards_only(cams, hours, days, scale=1.0, card=512):
    """No offload: enough cards for the whole trip, one copy, every card is a single point of failure."""
    per_cam = [gb_per_hour(CAMERAS[c]) * hours * days * scale * HEADROOM for c in cams]
    n = sum(ceil(x / card) for x in per_cam)
    total = day_gb(cams, hours, scale) * days
    return Plan("cards only", n * CARDS[card], n, 0, 0, 0.0, total)


def card_loads(cams, hours, scale=1.0, card=512, spare=0):
    """GB on each card at the end of one day. A camera needs ceil(day x headroom / card) cards; `spare` extra
    cards per camera means the shooter swaps cards at even intervals, so its day is split evenly over them."""
    loads = []
    for c in cams:
        x = gb_per_hour(CAMERAS[c]) * hours * scale
        k = ceil(x * HEADROOM / card) + spare
        loads += [x / k] * k
    return loads


def schedule_h(loads, readers, mbs=None):
    """Hours to read every card once on `readers` readers, one card per reader at a time, largest card first
    onto the least-loaded reader (LPT). The schedule is one a person can follow, so the time is achievable;
    LPT is within 4/3 of the shortest possible schedule. Readers beyond the number of cards sit idle."""
    mbs = READER_MBS if mbs is None else mbs
    bins = [0.0] * max(1, min(readers, len(loads)))
    for gb in sorted(loads, reverse=True):
        i = bins.index(min(bins))
        bins[i] += gb
    return max(bins) * 1000 / mbs / 3600


def evening_h(loads, readers, copies=2, reads="once"):
    """Evening copy time. reads="once": each card is read once and written to every SSD copy as it passes (the
    multi-destination copy of offload tools), so the time is the card schedule or, if slower, one SSD taking the
    whole day at SSD_WRITE_MBS. reads="per-copy": a separate full pass of the cards for each copy."""
    day = sum(loads)
    one_pass = max(schedule_h(loads, readers), day * 1000 / SSD_WRITE_MBS / 3600)
    if reads == "once":
        return one_pass
    if reads == "per-copy":
        return one_pass * copies
    raise ValueError("reads must be 'once' or 'per-copy'")


def offload(cams, hours, days, scale=1.0, max_offload_h=1.0, copies=2, reads="once", spare=0):
    """Lightest plan with nightly offload to `copies` SSDs whose evening copy fits max_offload_h. Exact search
    over card size, SSD size and 1 to MAX_READERS readers, never more readers than cards (a card is read by one
    reader at a time). Cards are reused each day; each SSD copy takes the whole trip. Exposure is one shooting
    day (before the first offload tonight)."""
    day = day_gb(cams, hours, scale)
    trip = day * days
    best = None
    for card, ssd in product(CARDS, SSDS):
        loads = card_loads(cams, hours, scale, card, spare)
        cards = len(loads)
        n_ssd = ceil(trip * HEADROOM / ssd) * copies
        for readers in range(1, min(MAX_READERS, cards) + 1):
            t = evening_h(loads, readers, copies, reads)
            if t > max_offload_h:
                continue
            g = cards * CARDS[card] + n_ssd * SSDS[ssd] + readers * READER_G
            p = Plan("nightly offload x%d (%s)" % (copies, reads), g, cards, n_ssd, readers, t, day)
            if best is None or p.grams < best.grams:
                best = p
    return best


def offload_hours(cams, hours, scale=1.0, readers=1, copies=1):
    return day_gb(cams, hours, scale) * 1000 / (readers * READER_MBS) / 3600 * copies


def battery_g_per_hour(cam):
    """Grams of 99 Wh pack consumed per recording hour of one camera."""
    return CAMERA_WATTS[cam] / PACK_WH_PER_G


def storage_g_per_hour(cam, card=512):
    """Grams of card per recording hour of one camera, one copy."""
    return gb_per_hour(CAMERAS[cam]) * HEADROOM / card * CARDS[card]
