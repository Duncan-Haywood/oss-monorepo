"""Milestone 7: dollars per clean sheet, by robot class and house volume.

Milestone 5 gave the seconds of each stage of a sheathing cycle and the missed nails each pipeline
leaves (every missed nail is re-driven, so every sheet ends clean). This module turns seconds into
dollars for four ways of sheathing a wall:

* ``hand``: a crew, at `buildbot-taskbook`'s minutes (carry 0.8, hold and square 1.5, nail 62 x 0.1
  person-minutes a sheet), scaled by the taskbook's one-third-to-three-times sweep. Its own missed
  nails are not modelled.
* ``h1``: a walking Unitree H1. Nailing with re-stancing takes the walking-G1 time of
  `buildbot-mobilebase` (84.7 s at 5 s a step to 264.7 s at 20 s). A person carries the sheet to the
  ledger (milestone 3b: neither humanoid can carry the 21.8 kg sheet).
* ``base``: a G1 on a drive-and-lift base (`buildbot-mobilebase`: 54 to 121 s of nailing). A person
  carries the sheet; the lift can also hang and tack it without a ledger (milestone 5's lift-tack).
* ``gantry``: a nailing bridge over a framing table in a plant (`buildbot-custom`: nailing 20 to 115 s,
  scan 10 to 60 s, load 30 to 180 s). The table's fence plays the ledger.

Ownership is the capital recovery of the price over its life plus upkeep, spread over the sheets
of V houses a year and capped at the capacity of the machine's hours (beyond it, a fleet: the cost
per sheet stops falling). People are the loaded wage times the seconds they spend. Doubled joint
framing charges a stud and a framer's time per sheet.
"""
import math

import numpy as np

WAGE = 29.12                   # $/h, BLS median carpenter, May 2025 (buildbot-cost)
SHEETS_PER_HOUSE = 32          # wall sheets, buildbot-taskbook house
HOURS_PER_YEAR = 2000.0        # machine hours available a year
HAND_MIN = {"carry": 0.8, "hold": 1.5, "nail": 62 * 0.1}   # person-minutes a sheet, taskbook S1, S2, S4
CLASSES = ("hand", "h1", "base", "gantry")
ROBOTS = ("h1", "base", "gantry")
VOLUMES = (10, 30, 100, 300, 1000)


def _u(rng, lo, hi, n):
    return rng.uniform(lo, hi, n)


def _logu(rng, lo, hi, n):
    return np.exp(rng.uniform(math.log(lo), math.log(hi), n))


def draw(n=4000, seed=11):
    """Common random numbers for every class. Ranges and sources: README, milestone 7."""
    rng = np.random.default_rng(seed)
    return {
        "burden": _u(rng, 1.0, 1.6, n),
        "hand_mult": _logu(rng, 1 / 3, 3.0, n),              # taskbook sweep of its own minutes
        "stud_usd": _u(rng, 3.41, 5.56, n),                  # 2x4 92 5/8 in precut, retail listings
        "t_frame": _u(rng, 60.0, 120.0, n),                  # framer seconds for the extra joint stud
        "interest": _u(rng, 0.04, 0.10, n),
        # stage times (milestone 5's sweep)
        "t_place": _u(rng, 15.0, 60.0, n), "t_ledger": _u(rng, 0.0, 20.0, n),
        "t_read": _u(rng, 1.0, 3.0, n), "t_fix": _u(rng, 15.0, 60.0, n),
        # site robots
        "supervision": _u(rng, 0.1, 1.0, n),
        "site_life_y": _u(rng, 2.0, 7.0, n), "site_upkeep": _u(rng, 0.05, 0.20, n),
        "g1_usd": _u(rng, 13500.0, 21600.0, n), "h1_usd": _u(rng, 90000.0, 150000.0, n),
        "base_usd": _u(rng, 10000.0, 40000.0, n),
        "u_nail": rng.uniform(0.0, 1.0, n),                  # where in its range each robot nails (shared)
        # gantry
        "gantry_usd": _logu(rng, 40000.0, 600000.0, n), "gantry_life_y": _u(rng, 7.0, 20.0, n),
        "gantry_upkeep": _u(rng, 0.03, 0.12, n), "operator": _u(rng, 0.0, 0.5, n),
        "g_nail": _u(rng, 20.0, 115.0, n), "g_scan": _u(rng, 10.0, 60.0, n), "g_load": _u(rng, 30.0, 180.0, n),
    }


def crf(i, years):
    """Capital recovery factor: the yearly payment that repays 1 over `years` at rate i."""
    return i / (1.0 - (1.0 + i) ** -years)


def loaded(p):
    return WAGE * p["burden"]


def hand_cost(p):
    """Dollars a sheet for the hand crew (person-minutes x loaded wage)."""
    minutes = sum(HAND_MIN.values()) * p["hand_mult"]
    return minutes / 60.0 * loaded(p)


def stud_cost(p):
    """Dollars a sheet for the extra joint stud of doubled framing: lumber and a framer's time."""
    return p["stud_usd"] + p["t_frame"] / 3600.0 * loaded(p)


def robot_spec(cls, p):
    """Price, life, upkeep, nailing seconds and person-hours per robot-hour for a robot class."""
    if cls == "h1":
        return dict(price=p["h1_usd"], life=p["site_life_y"], upkeep=p["site_upkeep"],
                    t_nail=84.7 + p["u_nail"] * (264.7 - 84.7), people=p["supervision"])
    if cls == "base":
        return dict(price=p["g1_usd"] + p["base_usd"], life=p["site_life_y"], upkeep=p["site_upkeep"],
                    t_nail=54.0 + p["u_nail"] * (121.0 - 54.0), people=p["supervision"])
    if cls == "gantry":
        return dict(price=p["gantry_usd"], life=p["gantry_life_y"], upkeep=p["gantry_upkeep"],
                    t_nail=p["g_nail"], people=p["operator"])
    raise ValueError(cls)


def robot_seconds(cls, p, missed, reads):
    """Machine seconds a sheet: place, sense, nail and rework (milestone 5's stages)."""
    s = robot_spec(cls, p)
    if cls == "gantry":
        place, sense = p["g_load"], p["g_scan"]
    else:
        place = p["t_place"] + (p["t_ledger"] if reads["ledger"] else 0.0)
        sense = reads["n"] * p["t_read"]
    return place + sense + s["t_nail"] + missed * p["t_fix"]


def robot_cost(cls, p, volume, missed, reads, doubled):
    """Dollars per clean sheet for a robot class at `volume` houses a year (arrays over draws)."""
    s = robot_spec(cls, p)
    sec = robot_seconds(cls, p, missed, reads)
    annual = s["price"] * (crf(p["interest"], s["life"]) + s["upkeep"])
    capacity = HOURS_PER_YEAR * 3600.0 / sec
    sheets = np.minimum(volume * SHEETS_PER_HOUSE, capacity)
    own = annual / sheets
    people = s["people"] * sec / 3600.0 * loaded(p)
    if cls != "gantry":                                   # a person carries the sheet to the wall
        people = people + HAND_MIN["carry"] * p["hand_mult"] / 60.0 * loaded(p)
    total = own + people + (stud_cost(p) if doubled else 0.0)
    return {"total": total, "own": own, "people": people, "seconds": sec,
            "stud": stud_cost(p) if doubled else 0.0 * total}
