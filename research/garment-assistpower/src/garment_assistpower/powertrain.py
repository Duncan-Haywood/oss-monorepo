"""Power-train mass model on top of garment-assist's one-joint ankle model.

All power-train constants are ASSUMED round numbers (see README), not datasheet values.
The suit's mass depends on its gain (bigger torque -> bigger motor, more electrical energy ->
bigger battery) and that mass feeds back into metabolic cost, so we solve for the net effect.
"""
import sys, os
from dataclasses import dataclass
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-assist", "src"))
from garment_assist.model import Body, evaluate, profiles


@dataclass(frozen=True)
class PowerTrain:
    legs: int = 2
    fixed_kg: float = 0.6            # textile, cables, electronics, per suit (assumed)
    motor_nm_per_kg: float = 8.0     # peak torque per kg of motor+gearbox at the joint (assumed)
    drive_eff: float = 0.6           # electrical -> mechanical positive work (assumed)
    cell_wh_per_kg: float = 150.0    # pack-level specific energy (assumed)
    reserve: float = 1.2             # battery oversize factor (assumed)
    mass_sens: float = 0.01          # fractional whole-body power per kg carried (assumed, swept)


def suit_mass(gain, hours, pt: PowerTrain = PowerTrain(), b: Body = Body()):
    """Return (total kg, motor kg, battery kg, electrical W averaged over the cycle)."""
    r = evaluate("active", gain, b=b)
    peak_nm = gain * b.peak_torque * b.mass
    motor = pt.legs * peak_nm / pt.motor_nm_per_kg
    elec_w = pt.legs * r["suit_w"] / pt.drive_eff
    batt = elec_w * hours / pt.cell_wh_per_kg * pt.reserve
    return pt.fixed_kg + motor + batt, motor, batt, elec_w


def net_change(gain, hours, pt: PowerTrain = PowerTrain(), b: Body = Body()):
    """Whole-body metabolic change (%) with mass from the power train.

    Convention inherited from garment-assist: its metabolic power (base_w) is taken to cover both
    ankles (it is divided by ankle_share to get the whole body), while the torque trace and the
    suit's mechanical power are per ankle. So the metabolic saving is used as is, and the suit's
    electrical power is `legs` times the per-ankle figure.
    """
    m, motor, batt, elec_w = suit_mass(gain, hours, pt, b)
    r = evaluate("active", gain, mass_added=m, mass_sens=pt.mass_sens, b=b)
    return dict(mass_kg=m, motor_kg=motor, batt_kg=batt, elec_w=elec_w, dwhole_pct=r["dwhole_pct"])


def best_gain(hours, pt: PowerTrain = PowerTrain(), b: Body = Body(), grid=None):
    grid = grid or [i / 100 for i in range(2, 61, 2)]
    res = [(net_change(g, hours, pt, b)["dwhole_pct"], g) for g in grid]
    return min(res)
