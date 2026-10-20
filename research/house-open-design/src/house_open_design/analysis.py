"""Lateral, envelope-energy and cost-index numbers for a house_plan Plan, by reusing the sibling projects' models.

Everything here inherits the limits of those models (house-structure, house-energy, house-cost); the README lists them.
"""
import math

from house_cost.model import House as CostHouse, price as cost_price, per_sqft_index
from house_energy.model import (AIR_HEAT_CAP, ANNUITY, BTU_PER_KWH, BTU_PER_THERM, CLIMATES,
                                GAINS_CREDIT, LBL_N, Prices, SYSTEMS, U_DOOR)
from house_framing.model import (ADVANCED_2X6, CONVENTIONAL_2X4, House as FrameHouse, Opening as FrameOpening,
                                 Wall as FrameWall, takeoff as wall_takeoff)
from house_structure.model import demands, line_capacity, segments
from house_plan.takeoff import _bf as nominal_bf
from house_truss.model import board_feet as truss_bf, lightest as lightest_truss

PLATE_FT = 8.0
EDGES = (6, 4, 3, 2)


def _frame_wall(plan, wid):
    wl = plan.wall(wid)
    ops = tuple(FrameOpening(o.offset * 12, o.width * 12, o.sill * 12) for o in plan.openings if o.wall == wid)
    return FrameWall(wl.length * 12, wl.bearing, ops)


def lateral(plan, v_mph=115.0, sds=0.5):
    """Wind and seismic check of the four exterior wall lines (interior partitions get no credit).

    The ridge runs along y, so wind in x hits the E and W faces and is carried by the S and N walls ("across ridge"),
    and wind in y is carried by the E and W walls ("along ridge"), as in house-structure."""
    p = plan.params
    house = FrameHouse(width_ft=p.width, length_ft=p.depth)
    dem = demands(house, v_mph, sds)
    lines = {"across ridge": ("S", "N"), "along ridge": ("E", "W")}
    out = {}
    for d, ids in lines.items():
        walls = [_frame_wall(plan, i) for i in ids]
        for k, idx in (("wind", 0), ("seismic", 1)):
            need = dem[d][idx]
            caps = {e: min(line_capacity(w, e, k) for w in walls) for e in EDGES}
            pick = next((e for e in EDGES if caps[e] >= need), None)
            solid_ft = min(sum(segments(w, 96.0)) for w in walls) / 12
            gov = min(walls, key=lambda w: sum(segments(w, 96.0)))
            out[(d, k)] = {"walls": ids, "need_lb": need, "edge_in": pick, "solid_ft": solid_ft,
                           "cap_at_6_lb": caps[6], "cap_at_2_lb": caps[2],
                           "max_v_mph": v_mph * math.sqrt(caps[pick] / need) if (k == "wind" and pick) else None,
                           "wall_ft": gov.length_in / 12}
    return out


def _r_eff(scheme):
    return wall_takeoff(FrameHouse(), scheme)["r_effective"]


# Assumed envelope packages (not sourced; see README). wall: R of the whole wall including framing, from house-framing.
PACKAGES = {
    "baseline": {"wall_r": _r_eff(CONVENTIONAL_2X4), "attic_r": 30.0, "window_u": 0.35, "ach50": 5.0, "floor_batt_r": 19.0},
    "tight": {"wall_r": _r_eff(ADVANCED_2X6) + 5.0, "attic_r": 49.0, "window_u": 0.27, "ach50": 3.0, "floor_batt_r": 30.0},
}
FLOOR_FRAMING_DERATE = 0.9  # batt in a joist floor delivers about this share of its rating (assumed)
FLOOR_FILMS_SUBFLOOR_R = 2.0  # films, subfloor and finish floor (assumed)


def envelope(plan, pkg):
    """Areas and UA (Btu/h F) of the thermal envelope of a single-storey plan over a vented crawlspace."""
    p = plan.params
    ext = [w for w in plan.walls if w.exterior]
    gross = sum(w.length for w in ext) * PLATE_FT
    win = sum(o.width * o.height for o in plan.openings if o.kind == "window" and plan.wall(o.wall).exterior)
    door = sum(o.width * o.height for o in plan.openings if o.kind == "door" and plan.wall(o.wall).exterior)
    wall = gross - win - door
    area = p.width * p.depth
    ua = {"walls": wall / pkg["wall_r"], "ceiling": area / (pkg["attic_r"] + 1.5), "windows": win * pkg["window_u"],
          "door": door * U_DOOR,
          "floor": area / (pkg["floor_batt_r"] * FLOOR_FRAMING_DERATE + FLOOR_FILMS_SUBFLOOR_R),
          "infiltration": AIR_HEAT_CAP * area * PLATE_FT * pkg["ach50"] / LBL_N}
    return {"wall_ft2": wall, "window_ft2": win, "door_ft2": door, "ua": ua, "ua_total": sum(ua.values())}


def annual_energy(env, climate, system, prices=Prices()):
    """Heating and cooling energy as in house-energy (degree days, no solar or internal-gain model beyond one credit).
    The floor couples to a vented crawlspace, so, as in house-energy's slab edge, it is left out of the cooling load."""
    hdd, cdd = CLIMATES[climate]
    ua = env["ua_total"]
    heat = ua * 24 * hdd * (1 - GAINS_CREDIT)
    cool = (ua - env["ua"]["floor"]) * 24 * cdd
    s = SYSTEMS[system]
    if s["heat_fuel"] == "gas":
        heat_cost = heat / s["heat_eff"] / BTU_PER_THERM * prices.gas_per_therm
    else:
        heat_cost = heat / s["heat_eff"] / BTU_PER_KWH * prices.elec_per_kwh
    cool_cost = cool / s["cool_cop"] / BTU_PER_KWH * prices.elec_per_kwh
    return {"heat_mmbtu": heat / 1e6, "cool_mmbtu": cool / 1e6, "annual_cost": heat_cost + cool_cost,
            "pv30_cost": (heat_cost + cool_cost) * ANNUITY}


def cost_index(plan):
    """house-cost price index of a house this size, one storey, on a lot you pay for and on your own lot.
    The reference (index 100) is the 2,000 sq ft two-storey average house; the model has no dollar figure."""
    p = plan.params
    aspect = max(p.width, p.depth) / min(p.width, p.depth)
    area = p.width * p.depth
    out = {}
    for name, lot in (("with lot", 1.0), ("own lot", 0.0)):
        h = CostHouse(area=area, storeys=1.0, aspect=aspect, lot=lot)
        r = cost_price(h)
        out[name] = {"price_index": r["price"], "construction_index": r["construction"],
                     "per_sqft_vs_reference": per_sqft_index(h)}
    return out


def roof_option(plan, takeoff, snow_psf=30.0):
    """Stick roof (rafters, ceiling joists, ridge) against the lightest passing house-truss W truss at the plan's span.

    Trusses span the plan's width at the rafter spacing along its depth, one more than the bays so both end walls have
    one. The stick figure is the plan's own takeoff; the truss figure is house-truss's pin-jointed NDS check at a
    ground-snow roof load of `snow_psf` on plan (the plan states no snow load). Neither includes waste, hangers, plates
    or bracing, and a truss would be a sealed manufacturer's design."""
    p = plan.params
    sz, W, D = takeoff["sizes"], p.width * 12, p.depth * 12
    roof = {k: 0.0 for k in ("rafter", "ceiling", "ridge")}
    for (size, length), n in takeoff["members"].items():
        bf = nominal_bf(size, length, n)
        if size == sz["rafter"] and length not in (W, D):
            roof["rafter"] += bf  # on the slope; the same size at 24 ft is the girder
        elif size == sz["ceiling"] and length == W:
            roof["ceiling"] += bf
        elif size == sz["ridge"] and length == D:
            roof["ridge"] += bf
    stick_bf = sum(roof.values())
    best = lightest_truss(p.width, float(p.pitch), float(p.rafter_oc), snow_psf=snow_psf)
    if best is None:
        return {"stick": roof, "stick_bf": stick_bf, "truss": None}
    t, per = best
    n = math.ceil(p.depth * 12 / p.rafter_oc) + 1
    return {"stick": roof, "stick_bf": stick_bf, "truss": t, "n_trusses": n, "truss_bf_each": per, "truss_bf": per * n}
