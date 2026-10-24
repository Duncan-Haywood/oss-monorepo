"""Handling loads on the wall panels of house-offsite: weight, pick points, plate bending.

Inches, pounds, psi unless a name says otherwise. Panels come from house-offsite (which takes the
walls from house-framing). Densities and the impact factor are handbook-style assumptions of this
project, not measured; the NDS design values are the SPF No. 2 ones house-framing already uses.
"""
from dataclasses import dataclass
import math

from house_framing.model import ADVANCED_2X6, DEPTH, SPF2, House, T, walls_of
from house_offsite.model import panelise, shell_quantities

PCF_LUMBER = 28.0  # lb/ft3, SPF at shipping moisture (specific gravity 0.42 oven-dry, about 12-19% MC)
PSF_OSB = 1.4  # lb/ft2 of 7/16 in OSB
PSF_CLOSED = 0.35  # wrap + batt insulation + rough-in wiring in a closed panel, lb/ft2 of wall
PSF_GLAZED = 6.0  # a window or door unit, lb/ft2 of rough opening
CD_LIFT = 1.25  # NDS load duration factor, loads of seven days or less
FB_PLATE = SPF2["Fb"] * 1.3 * 1.0  # 2x6 size factor 1.3 for bending (flat-use factor is 1.0 on the 5.5 in face)


@dataclass(frozen=True)
class Lift:
    closed: bool = False
    impact: float = 1.5  # dynamic factor on the hook load (jerk, sling snap), assumed
    top_plates: int = 2
    bottom_plates: int = 1


_CACHE = {}


def _frame_lb_per_in(house, scheme):
    """Framing lumber weight per inch of exterior wall, the takeoff spread evenly (corners and tees included)."""
    key = (house, scheme)
    if key not in _CACHE:
        tk = shell_quantities(house, scheme)["takeoff"]
        total = sum(w.length_in for w in walls_of(house, scheme))
        _CACHE[key] = tk["board_feet"] / 12 * PCF_LUMBER / total
    return _CACHE[key]


def hole_height(h, op):
    return h.head_in - op.sill_in


def weight_profile(wall, a, b, house, scheme, lift, step=1.0):
    """Self-weight per inch of wall length (lb/in) at x = a+step/2, ... for the panel [a, b)."""
    frame_plf_in = _frame_lb_per_in(house, scheme)
    n = int(round((b - a) / step))
    out = []
    for i in range(n):
        x = a + (i + 0.5) * step
        wt = frame_plf_in
        hole = 0.0
        for op in wall.openings:
            if op.pos_in <= x < op.pos_in + op.width_in:
                hole = hole_height(house, op)
                wt += PSF_GLAZED * hole / 144 if lift.closed else 0.0
        wt += PSF_OSB * (house.plate_height_in - hole) / 144
        if lift.closed:
            wt += PSF_CLOSED * (house.plate_height_in - hole) / 144
        out.append(wt)
    return out


def panel_weight(profile, step=1.0):
    return sum(profile) * step


def equalised_reactions(n):
    """With a spreader bar or equaliser the hook shares the load equally among n picks."""
    return 1.0 / n


def moment_diagram(profile, picks, step=1.0):
    """Bending moment (lb-in) at each cell edge with equal pick reactions at the given x (from the panel start).

    Statically determinate because the reactions are set: each pick takes W/n (spreader bar or
    equaliser). M(x) = R * sum over picks left of x of (x - p), minus the moment of the weight left of x.
    """
    W = panel_weight(profile, step)
    R = W / len(picks)
    ms, C, D = [0.0], 0.0, 0.0  # running weight and its first moment about the panel start
    for i, w in enumerate(profile):
        C += w * step
        D += w * step * (i * step + step / 2)
        x = (i + 1) * step
        ms.append(sum(R * (x - p) for p in picks if p < x) - (x * C - D))
    return ms


def worst_moment(profile, picks, step=1.0):
    return max(abs(m) for m in moment_diagram(profile, picks, step))


def best_picks(profile, n, step=1.0, grid=6.0):
    """Pick positions (n = 1 to 4) minimising the largest |M|; brute force on a grid (coarser for more picks).

    n = 4 is searched symmetric about the panel centre only, to keep the search small.
    """
    L = len(profile) * step
    xs = [k * grid for k in range(int(L / grid) + 1) if k * grid < L]
    best = None
    if n == 1:
        cands = [(x,) for x in xs]
    elif n == 2:
        cands = [(a, b) for a in xs for b in xs if b > a + 24]
    elif n == 3:
        c = xs[::2]
        cands = [(a, b, d) for a in c for b in c for d in c if a + 24 < b and b + 24 < d]
    else:
        c = [x for x in xs[::2] if x < L / 2 - 12]
        cands = [(a, b, L - b, L - a) for a in c for b in c if a + 12 < b]
    for ps in cands:
        w = worst_moment(profile, ps, step)
        if best is None or w < best[0]:
            best = (w, ps)
    return (best[1], best[0]) if best else (None, math.inf)


def plate_section(lift):
    """Top-plate stack as a beam bent out of the wall plane: depth 5.5 in (the plate width), breadth 1.5 per ply."""
    b = T * lift.top_plates
    d = DEPTH["2x6"]
    return b * d * d / 6  # section modulus, in3


def plate_bending_stress(profile, picks, lift, share_top=0.5, step=1.0):
    """Flat lift-off, wall plane horizontal: half the panel weight reaches the top plate through the studs.

    The top plate spans between the picks as a beam bent about its strong axis (depth 5.5 in), loaded by
    the stud reactions, taken as a share of the panel weight. Sheathing stiffness and the stud-to-plate
    nails are ignored (lower bound on capacity). Returns the stress in psi at the hook load (with impact).
    """
    prof = [w * share_top * lift.impact for w in profile]
    M = worst_moment(prof, picks, step)
    return M / plate_section(lift)


def check_panel(wall, a, b, house, scheme, lift, n):
    prof = weight_profile(wall, a, b, house, scheme, lift)
    picks, _ = best_picks(prof, n)
    W = panel_weight(prof)
    fb = plate_bending_stress(prof, picks, lift)
    Mchord = worst_moment([w * lift.impact for w in prof], picks)
    d = house.plate_height_in - T * lift.top_plates / 2 - T * lift.bottom_plates / 2
    # hanging, wall plane vertical: chord force from in-plane bending, picks on the top plate
    chord = Mchord / d
    ms = moment_diagram([w * lift.impact for w in prof], picks)
    xmax = max(range(len(ms)), key=lambda i: ms[i])  # largest sagging moment, bottom chord in tension there
    cut = any(op.sill_in == 0.0 and op.pos_in <= a + xmax <= op.pos_in + op.width_in for op in wall.openings)
    ft_bottom = chord / (T * lift.bottom_plates * DEPTH["2x6"])
    return {"weight_lb": W, "picks": [round(p + a) for p in picks], "pick_load_lb": W * lift.impact / n,
            "fb_psi": fb, "fb_allow": FB_PLATE * CD_LIFT, "ratio_bending": fb / (FB_PLATE * CD_LIFT),
            "chord_lb": chord, "ft_bottom_psi": ft_bottom, "ft_allow": 450.0 * CD_LIFT,
            "door_cuts_bottom_chord_at_max_moment": cut}


def max_panel_length_ft(n, lift, house=House(), scheme=ADVANCED_2X6, ratio=1.0):
    """Longest solid (opening-free) panel whose plate bending stress is within `ratio` of allowable with n picks."""
    from house_framing.model import Wall
    best = 0
    for ft in range(4, 61, 4):
        w = Wall(ft * 12.0, True, ())
        prof = weight_profile(w, 0, w.length_in, house, scheme, lift)
        picks, _ = best_picks(prof, n)
        if picks is None:  # too short to place n picks 2 ft apart
            continue
        if plate_bending_stress(prof, picks, lift) <= ratio * FB_PLATE * CD_LIFT:
            best = ft
        else:
            break
    return best


NIOSH_RWL_LB = 51.0  # load constant of the revised NIOSH lifting equation (Waters et al. 1993): 23 kg, ideal conditions


def hands_needed(weight_lb, share=1.0):
    """People needed to stay at the NIOSH recommended weight limit each, ideal conditions (best case)."""
    return math.ceil(weight_lb * share / NIOSH_RWL_LB)


def wind_speed_for_swing(weight_lb, face_ft2, swing_deg=10.0, cd=1.5):
    """Wind speed (mph) at which a hung panel, broad face to the wind, hangs `swing_deg` off the vertical.

    Drag F = q Cd A with q = 0.00256 V^2 psf (V in mph, the classic ASCE 7 form at sea level). The panel
    hangs from its picks as a pendulum, so tan(swing) = F / W. A rigid-body estimate: gusts, spin and
    the crane boom are not modelled.
    """
    f = math.tan(math.radians(swing_deg)) * weight_lb
    return math.sqrt(f / (0.00256 * cd * face_ft2))
