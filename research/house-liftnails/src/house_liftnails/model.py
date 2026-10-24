"""Nail load path of a hung wall panel: sheathing-to-top-plate nails, stud-to-sheathing nails, stud end nails.

Inches, pounds, psi. Panels and weights come from house-panellift. Lateral nail strength is the NDS
single-shear yield-limit (European yield model) set of equations, written out from first principles;
no NDS table is copied. Every nail input below is an assumption of this project.
"""
import math
from dataclasses import dataclass

from house_framing.model import ADVANCED_2X6, T, House
from house_panellift.model import CD_LIFT, PCF_LUMBER, Lift, panel_weight, weight_profile


@dataclass(frozen=True)
class Nail:
    d: float = 0.131  # 8d common shank diameter, in
    length: float = 2.5
    fyb: float = 100000.0  # bending yield strength, psi (assumed)
    g_main: float = 0.42  # SPF specific gravity
    g_side: float = 0.50  # OSB, assumed
    t_side: float = 0.4375  # 7/16 in sheathing
    kd: float = 2.2  # NDS reduction term for D <= 0.17 in


def dowel_bearing(g, d):
    """Dowel bearing strength Fe = 16600 G^1.84 (psi), nails with D < 1/4 in."""
    return 16600.0 * g ** 1.84


def yield_modes(n=Nail()):
    """Single-shear lateral design value per nail for each mode (lb), before the load duration factor."""
    d = n.d
    ts, tm = n.t_side, n.length - n.t_side
    fem, fes = dowel_bearing(n.g_main, d), dowel_bearing(n.g_side, d)
    re, rt = fem / fes, tm / ts
    rd = n.kd
    k1 = (math.sqrt(re + 2 * re ** 2 * (1 + rt + rt ** 2) + rt ** 2 * re ** 3) - re * (1 + rt)) / (1 + re)
    k2 = -1 + math.sqrt(2 * (1 + re) + 2 * n.fyb * (1 + 2 * re) * d ** 2 / (3 * fem * tm ** 2))
    k3 = -1 + math.sqrt(2 * (1 + re) / re + 2 * n.fyb * (2 + re) * d ** 2 / (3 * fem * ts ** 2))
    return {
        "Im": d * tm * fem / rd,
        "Is": d * ts * fes / rd,
        "II": k1 * d * ts * fes / rd,
        "IIIm": k2 * d * tm * fem / ((1 + 2 * re) * rd),
        "IIIs": k3 * d * ts * fem / ((2 + re) * rd),
        "IV": d ** 2 / rd * math.sqrt(2 * fem * n.fyb / (3 * (1 + re))),
    }


def nail_capacity(n=Nail(), cd=CD_LIFT):
    """Adjusted lateral value Z' (lb) and the governing mode."""
    m = yield_modes(n)
    mode = min(m, key=m.get)
    return m[mode] * cd, mode


def withdrawal_side_grain(n=Nail(), pen=None, g=0.42):
    """NDS side-grain withdrawal W = 1380 G^2.5 D lb per inch of penetration, for scale only."""
    return 1380.0 * g ** 2.5 * n.d * (pen if pen is not None else n.length)


def stud_len(house, scheme):
    return house.plate_height_in - (1 + scheme.top_plates) * T


def check_nails(wall, a, b, house, scheme, lift, spacing_top=6.0, spacing_field=12.0, n=Nail(), stud_depth=5.5):
    """Hung vertical, impact applied. Returns demand per nail and its ratio to Z' on each link of the path."""
    prof = weight_profile(wall, a, b, house, scheme, lift)
    W = panel_weight(prof)
    length = b - a
    plate_lb_in = PCF_LUMBER * T * stud_depth / 1728.0
    w_top = lift.top_plates * plate_lb_in * length
    w_below = W - w_top  # all that hangs from the sheathing-to-top-plate nails
    z, mode = nail_capacity(n)
    n_top = max(1, int(length / spacing_top))
    d_top = w_below * lift.impact / n_top
    # one stud and its share of the bottom plate, all of it taken by the field nails down the stud
    ls = stud_len(house, scheme)
    w_stud = PCF_LUMBER * T * stud_depth / 1728.0 * ls + plate_lb_in * scheme.spacing * lift.bottom_plates
    n_field = max(1, int(ls / spacing_field))
    d_field = w_stud * lift.impact / n_field
    return {"weight_lb": W, "below_lb": w_below, "n_top": n_top, "z_lb": z, "mode": mode,
            "demand_top_lb": d_top, "ratio_top": d_top / z,
            "need_fraction": d_top / z,  # fraction of the top-row nails that must share the load to hold
            "stud_lb": w_stud, "n_field": n_field, "demand_field_lb": d_field, "ratio_field": d_field / z}


def stud_end_nail_demand(house, scheme, lift, stud_depth=5.5):
    """Bare-frame hang: each stud's weight (plus its bottom-plate share) in end-grain withdrawal. NDS gives no
    design value for end-grain withdrawal, so the credited capacity is zero. Returns (demand per stud lb, credit lb)."""
    ls = stud_len(house, scheme)
    plate_lb_in = PCF_LUMBER * T * stud_depth / 1728.0
    w = PCF_LUMBER * T * stud_depth / 1728.0 * ls + plate_lb_in * scheme.spacing * lift.bottom_plates
    return w * lift.impact, 0.0
