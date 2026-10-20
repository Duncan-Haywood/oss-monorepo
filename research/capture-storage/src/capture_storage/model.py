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


def offload(cams, hours, days, scale=1.0, max_offload_h=1.0, copies=2):
    """Best plan with nightly offload to `copies` SSDs; searches card size, SSD size and reader count for the
    lightest kit whose evening copy fits max_offload_h. Cards are reused each day (one day's footage per camera);
    each SSD copy takes the whole trip. Exposure is one shooting day (before the first offload tonight)."""
    day = day_gb(cams, hours, scale)
    trip = day * days
    best = None
    for card, ssd, readers in product(CARDS, SSDS, range(1, 9)):
        per_cam = [gb_per_hour(CAMERAS[c]) * hours * scale * HEADROOM for c in cams]
        cards = sum(ceil(x / card) for x in per_cam)
        n_ssd = ceil(trip * HEADROOM / ssd) * copies
        t = day * 1000 / (readers * READER_MBS) / 3600     # hours to copy one day, readers in parallel
        # writing a second copy doubles the bytes moved through the same readers
        t *= copies
        if t > max_offload_h:
            continue
        g = cards * CARDS[card] + n_ssd * SSDS[ssd] + readers * READER_G
        p = Plan("nightly offload x%d" % copies, g, cards, n_ssd, readers, t, day)
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
