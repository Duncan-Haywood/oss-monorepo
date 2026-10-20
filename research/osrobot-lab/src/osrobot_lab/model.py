"""A stdlib digital twin of a liquid-handling bench: a protocol checker.

Checks a protocol (a list of command dicts) against a deck before it runs: unknown labware or
wells, tips (none, already attached, used, cross-contamination), volumes (pipette range, source
empty, tip overfill, well overflow), travel collisions, and a time estimate. A Monte Carlo mode
adds assumed pipetting error to track analyte concentration.

Every geometry, speed and error value is ASSUMED (marked below), not measured from any product.
It does not use or reimplement the Opentrons Python API; it is a small stand-alone model.
"""
import math
import random
from dataclasses import dataclass, field

# ---- ASSUMED deck geometry (mm), loosely OT-2-like: 3 columns x 4 rows of slots ----
SLOT_W, SLOT_D = 128.0, 86.0
SLOT_PITCH_X, SLOT_PITCH_Y = 132.5, 90.5
WELL_PITCH = 9.0
# ---- ASSUMED motion and liquid-handling timings ----
GANTRY_SPEED = 300.0      # mm/s horizontal
LIFT_TIME = 0.6           # s per up/down move pair
FLOW = 90.0               # uL/s for aspirate and dispense
PICKUP_TIME, DROP_TIME, SETTLE = 5.0, 3.0, 1.0
TRAVEL_MARGIN = 10.0      # mm above the tallest labware on the deck for the default safe travel height
# ---- ASSUMED pipette ----
P_MIN, P_MAX = 20.0, 300.0


def pipette_cv(v):
    """ASSUMED relative standard deviation of one aspirate or dispense of v uL (placeholder, no calibration data)."""
    return 0.01 + 0.8 / v


@dataclass
class Labware:
    name: str
    slot: int
    rows: int
    cols: int
    height: float            # top of the labware above the deck, mm
    well_max: float          # uL per well
    kind: str                # 'tips' | 'plate' | 'reservoir' | 'tubes'

    def wells(self):
        return [f"{chr(65 + r)}{c + 1}" for c in range(self.cols) for r in range(self.rows)]

    def rc(self, well):
        try:
            r, c = ord(well[0]) - 65, int(well[1:]) - 1
        except (ValueError, IndexError, TypeError):
            return None
        return (r, c) if 0 <= r < self.rows and 0 <= c < self.cols else None

    def origin(self):
        s = self.slot - 1
        return (s % 3) * SLOT_PITCH_X, (s // 3) * SLOT_PITCH_Y

    def xy(self, well):
        r, c = self.rc(well)
        ox, oy = self.origin()
        return ox + 14.4 + c * WELL_PITCH, oy + 11.2 + (self.rows - 1 - r) * WELL_PITCH


def tiprack(name, slot):
    return Labware(name, slot, 8, 12, 64.0, 300.0, "tips")        # ASSUMED heights


def plate96(name, slot):
    return Labware(name, slot, 8, 12, 14.5, 200.0, "plate")


def reservoir(name, slot):
    return Labware(name, slot, 1, 12, 44.0, 15000.0, "reservoir")


def tuberack(name, slot):
    return Labware(name, slot, 4, 6, 85.0, 1500.0, "tubes")


@dataclass
class Finding:
    code: str
    step: int
    msg: str


@dataclass
class Well:
    vol: float = 0.0
    conc: float = 0.0
    liquid: str = ""


@dataclass
class Result:
    findings: list = field(default_factory=list)
    time: float = 0.0
    tips_used: int = 0
    wells: dict = field(default_factory=dict)

    def codes(self):
        return {f.code for f in self.findings}


def _blocked(deck, a, b, z, skip):
    """True if a straight horizontal move from a to b at tip height z passes over labware taller than z."""
    n = max(1, int(math.dist(a, b)))
    for i in range(n + 1):
        x = a[0] + (b[0] - a[0]) * i / n
        y = a[1] + (b[1] - a[1]) * i / n
        for lw in deck.values():
            if lw.name in skip or lw.height <= z:
                continue
            ox, oy = lw.origin()
            if ox <= x <= ox + SLOT_W and oy <= y <= oy + SLOT_D:
                return lw.name
    return None


def check(deck_list, commands, initial, rng=None):
    """Run the protocol on the twin. initial maps (labware, well) -> (vol, conc, liquid).

    With rng (a random.Random), aspirate and dispense volumes get the assumed pipetting error and the
    returned wells hold the resulting volumes and concentrations; findings always come from nominal volumes.
    """
    deck = {lw.name: lw for lw in deck_list}
    res = Result()
    wells = {}
    for lw in deck_list:
        for w in lw.wells():
            wells[(lw.name, w)] = Well()
    for k, (v, c, liq) in initial.items():
        wells[k] = Well(v, c, liq)
    used_tips = set()
    tip = None           # dict: id, vol, conc, liquid, tipwell
    pos = None           # current (x, y)
    prev = ""            # labware of the previous move
    safe_z = max(lw.height for lw in deck_list) + TRAVEL_MARGIN

    def flag(code, i, msg):
        res.findings.append(Finding(code, i, msg))

    for i, cmd in enumerate(commands):
        op = cmd.get("op")
        lwn, w = cmd.get("labware"), cmd.get("well")
        if op in ("drop_tip",) and tip is None:
            flag("NO_TIP", i, "drop_tip with no tip attached")
            continue
        if op == "drop_tip":
            res.time += DROP_TIME
            tip = None
            continue
        if op not in ("pick_up_tip", "aspirate", "dispense"):
            flag("BAD_OP", i, f"unknown op {op!r}")
            continue
        lw = deck.get(lwn)
        if lw is None:
            flag("UNKNOWN_LABWARE", i, f"{lwn!r} is not on the deck")
            continue
        if lw.rc(w) is None:
            flag("UNKNOWN_WELL", i, f"{lwn} has no well {w!r}")
            continue
        # travel
        target = lw.xy(w)
        if pos is not None:
            z = cmd.get("travel_z", safe_z)
            hit = _blocked(deck, pos, target, z, {lw.name, prev})
            if hit:
                flag("COLLISION", i, f"travel at z={z:g} mm crosses {hit}")
            res.time += math.dist(pos, target) / GANTRY_SPEED
        res.time += LIFT_TIME
        pos, prev = target, lwn
        key = (lwn, w)
        if op == "pick_up_tip":
            if lw.kind != "tips":
                flag("NOT_TIPRACK", i, f"{lwn} is not a tip rack")
            elif tip is not None:
                flag("TIP_PRESENT", i, "pick_up_tip while a tip is attached")
            elif key in used_tips:
                flag("TIP_USED", i, f"tip {lwn}:{w} was already used")
            else:
                used_tips.add(key)
                res.tips_used += 1
                tip = {"vol": 0.0, "conc": 0.0, "liquid": ""}
                res.time += PICKUP_TIME
            continue
        v = cmd.get("vol")
        if tip is None:
            flag("NO_TIP", i, f"{op} with no tip attached")
            continue
        if not isinstance(v, (int, float)) or v <= 0 or (v < P_MIN or v > P_MAX):
            flag("VOL_RANGE", i, f"{v} uL is outside the pipette range {P_MIN:g}-{P_MAX:g} uL")
            if not isinstance(v, (int, float)) or v <= 0:
                continue
        res.time += v / FLOW + SETTLE
        wl = wells[key]
        noise = (lambda x: x * (1 + rng.gauss(0, pipette_cv(x)))) if rng else (lambda x: x)
        if op == "aspirate":
            if tip["liquid"] and wl.liquid and tip["liquid"] != wl.liquid:
                flag("CROSS_CONTAM", i, f"tip held {tip['liquid']!r}, now aspirating {wl.liquid!r}")
            if v > wl.vol + 1e-9:
                flag("SOURCE_EMPTY", i, f"aspirate {v:g} uL from {key} holding {wl.vol:g} uL")
            if tip["vol"] + v > P_MAX + 1e-9:
                flag("TIP_OVERFILL", i, f"tip would hold {tip['vol'] + v:g} uL")
            got = min(noise(v), wl.vol)
            wl.vol -= got
            tip["conc"] = (tip["conc"] * tip["vol"] + wl.conc * got) / (tip["vol"] + got) if tip["vol"] + got else 0.0
            tip["vol"] += got
            tip["liquid"] = tip["liquid"] or wl.liquid
        else:
            if v > tip["vol"] + 1e-9 and not rng:
                flag("DISPENSE_EXCESS", i, f"dispense {v:g} uL but the tip holds {tip['vol']:g} uL")
            put = min(noise(v), tip["vol"]) if rng else min(v, tip["vol"])
            if wl.vol + v > lw.well_max + 1e-9:
                flag("OVERFLOW", i, f"{key} would hold {wl.vol + v:g} uL, over its {lw.well_max:g} uL")
            tot = wl.vol + put
            wl.conc = (wl.conc * wl.vol + tip["conc"] * put) / tot if tot else 0.0
            wl.vol = tot
            tip["vol"] -= put
            wl.liquid = wl.liquid or tip["liquid"]
    if tip is not None:
        flag("TIP_LEFT", len(commands), "protocol ends with a tip attached")
    res.wells = wells
    return res


def structural(deck_list, commands):
    """Baseline: only syntax and existence checks (what a parameter validator without a state model sees)."""
    deck = {lw.name: lw for lw in deck_list}
    out = set()
    for cmd in commands:
        if cmd.get("op") not in ("pick_up_tip", "drop_tip", "aspirate", "dispense"):
            out.add("BAD_OP")
            continue
        if cmd["op"] == "drop_tip":
            continue
        lw = deck.get(cmd.get("labware"))
        if lw is None:
            out.add("UNKNOWN_LABWARE")
        elif lw.rc(cmd.get("well")) is None:
            out.add("UNKNOWN_WELL")
        if cmd["op"] in ("aspirate", "dispense") and not (isinstance(cmd.get("vol"), (int, float)) and cmd["vol"] > 0):
            out.add("VOL_RANGE")
    return out
