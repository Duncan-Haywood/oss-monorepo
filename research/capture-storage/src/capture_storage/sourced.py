"""Sourced parameters for the storage model: each figure below carries where it came from and the date fetched.

`model.py` keeps its original assumed figures so the first results stay reproducible. `use(PARAMS_...)`
swaps in a set of figures for one block of code and restores the originals afterwards, so every function in
`model.py` can be re-run unchanged under sourced numbers or a sweep.
"""
from contextlib import contextmanager
from . import model

# name -> (value, unit, source, status)   status: "sourced" or "assumed"
PARAMS = {
    "bitrate_action_cam": (120.0, "Mbit/s", "GoPro HERO13 Black max video bit rate, Wikipedia 'GoPro' spec table; DJI Osmo Action 5 Pro 'Max Video Bitrate 120 Mbps', dji.com/osmo-action-5-pro/specs; both fetched 2026-10-21", "sourced"),
    "bitrate_360_cam": (120.0, "Mbit/s", "no spec page was reachable (Insta360 returned 403); set equal to the action cameras it shares a sensor class with", "assumed"),
    "bitrate_phone": (60.0, "Mbit/s", "carried over from model.py", "assumed"),
    "bitrate_mirrorless": (200.0, "Mbit/s", "carried over from model.py; Sony's help page was not reachable", "assumed"),
    "card_g_micro": (0.25, "g", "Wikipedia 'SD card' infobox, microSD weight 0.25 g, fetched 2026-10-21; weight does not depend on capacity", "sourced"),
    "card_g_full": (2.0, "g", "Wikipedia 'SD card' infobox, standard SD weight 2 g, fetched 2026-10-21", "sourced"),
    "reader_mbs_uhs1_ceiling": (104.0, "MB/s", "UHS-I bus speed, SD Association figure as tabulated on Wikipedia 'SD card' (bus speed table), fetched 2026-10-21", "sourced"),
    "reader_mbs_uhs2_ceiling": (312.0, "MB/s", "UHS-II bus speed (half duplex), same table", "sourced"),
    "reader_mbs_model": (90.0, "MB/s", "model.py's original figure; 87% of the UHS-I ceiling", "assumed"),
    "ssd_g": ({1000: 45.0, 2000: 55.0, 4000: 75.0}, "g", "carried over from model.py; Samsung's and SanDisk's pages are scripted and returned no spec text", "assumed"),
    "reader_g": (25.0, "g", "carried over from model.py", "assumed"),
}


def sourced_set(reader_mbs=104.0, full_sd=False):
    """Figures for the model, with sourced values where one was found. reader_mbs defaults to the UHS-I ceiling,
    the fastest a UHS-I card can be read, so the offload times it gives are lower bounds."""
    g = PARAMS["card_g_full" if full_sd else "card_g_micro"][0]
    return {
        "CAMERAS": {"360 camera": PARAMS["bitrate_360_cam"][0], "action camera": PARAMS["bitrate_action_cam"][0],
                    "phone telephoto": PARAMS["bitrate_phone"][0], "mirrorless body": PARAMS["bitrate_mirrorless"][0]},
        "CARDS": {256: g, 512: g, 1024: g},
        "READER_MBS": reader_mbs,
    }


@contextmanager
def use(figures):
    """Temporarily replace model-level figures (dicts are replaced, not mutated)."""
    saved = {k: getattr(model, k) for k in figures}
    try:
        for k, v in figures.items():
            setattr(model, k, v)
        yield
    finally:
        for k, v in saved.items():
            setattr(model, k, v)


def hash_limited_readers(hash_mbs, reader_mbs):
    """How many card readers one CPU core of hashing can keep up with if every byte is hashed once."""
    return hash_mbs / reader_mbs
