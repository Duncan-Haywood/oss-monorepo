"""Where to carry the power train: shank-mounted versus waist-mounted with a Bowden cable.

Builds on garment-assistpower (mass of motor and battery) and garment-assist (ankle model).
Mass penalty is location weighted: a kg at the waist costs `mass_sens` of whole-body power, a kg at
the shank costs `shank_ratio` times that. Every constant is ASSUMED (see README), none is sourced.
"""
import sys, os
from dataclasses import dataclass
_here = os.path.dirname(__file__)
for p in ("garment-assist", "garment-assistpower"):
    sys.path.insert(0, os.path.join(_here, "..", "..", "..", p, "src"))
from garment_assist.model import Body, evaluate
from garment_assistpower.powertrain import PowerTrain, suit_mass


@dataclass(frozen=True)
class Layout:
    shank_ratio: float = 3.0     # penalty per kg at the shank / penalty per kg at the waist (assumed, swept)
    bowden_eff: float = 0.8      # cable transmission efficiency, waist layout only (assumed)
    cable_kg: float = 0.3        # cable, sheaths and ankle anchor kept at the shank in the waist layout (assumed)


def net_change(layout, gain, hours, shank_ratio, pt: PowerTrain = PowerTrain(), lay: Layout = Layout(), b: Body = Body()):
    """Net whole-body change (%) for layout 'shank' or 'waist' (negative = saving)."""
    if layout not in ("shank", "waist"):
        raise ValueError(layout)
    r0 = evaluate("active", gain, b=b)               # no mass penalty
    eff = pt.drive_eff * (lay.bowden_eff if layout == "waist" else 1.0)
    pt2 = PowerTrain(**{**pt.__dict__, "drive_eff": eff})
    total, motor, batt, _ = suit_mass(gain, hours, pt2, b)
    if layout == "shank":
        eq_kg = shank_ratio * total
    else:
        eq_kg = (total - pt.fixed_kg) + shank_ratio * (pt.fixed_kg + lay.cable_kg)
    return r0["dwhole_pct"] + 100 * pt.mass_sens * eq_kg


def break_even_ratio(gain, hours, pt: PowerTrain = PowerTrain(), lay: Layout = Layout(), b: Body = Body()):
    """Shank/waist penalty ratio above which the waist layout wins (solved in closed form, both nets are linear in it)."""
    f = lambda k: net_change("shank", gain, hours, k, pt, lay, b) - net_change("waist", gain, hours, k, pt, lay, b)
    f0, f1 = f(0.0), f(1.0)
    slope = f1 - f0
    return None if slope <= 0 else -f0 / slope
