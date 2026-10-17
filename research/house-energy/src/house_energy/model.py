"""Cost-optimal envelope by climate, BEopt-style but degree-day based (no EnergyPlus).

Net present cost (NPC) = extra first cost of the envelope package + present value of 30 years of heating and
cooling energy. Every input in ASSUMED is an assumption, not a sourced price; experiments sweep them.
"""
from dataclasses import dataclass, replace
from itertools import product

from house_framing.model import (House, CONVENTIONAL_2X4, CONVENTIONAL_2X6, ADVANCED_2X6, takeoff)

HOUSE = House()
FLOOR_FT2 = HOUSE.width_ft * HOUSE.length_ft
VOLUME_FT3 = FLOOR_FT2 * 8.0
PERIMETER_FT = 2 * (HOUSE.width_ft + HOUSE.length_ft)
WINDOW_FT2 = 8 * 3.0 * 4.0 + 74 / 12 * 80 / 12  # eight 36x48 windows plus the 74x80 slider
DOOR_FT2 = 38 / 12 * 80 / 12
U_DOOR = 0.35
AIR_HEAT_CAP = 0.018  # Btu/ft3 F
LBL_N = 20.0  # ACH50 to natural ACH, LBL rule of thumb for a one-storey house in the mid climate
GAINS_CREDIT = 0.25  # share of the degree-day heating load offset by internal and solar gains (assumed)
YEARS = 30
DISCOUNT = 0.03  # real discount rate (assumed)
ANNUITY = sum(1 / (1 + DISCOUNT) ** t for t in range(1, YEARS + 1))

# (HDD base 65 F, CDD base 65 F), rounded to the nearest 100 from memory of NOAA 1991-2020 normals: NOT checked
# against the source in this run. Each is a stand-in for its ASHRAE/IECC climate zone, not a weather file.
CLIMATES = {
    "Miami (1A)": (100, 4400), "Houston (2A)": (1400, 2900), "Atlanta (3A)": (2900, 1800),
    "Albuquerque (4B)": (4300, 1300), "Baltimore (4A)": (4700, 1200), "Chicago (5A)": (6200, 900),
    "Minneapolis (6A)": (7600, 800), "Duluth (7)": (9500, 400),
}
# Heating fuel and equipment. cooling COP is seasonal (assumed). kind: price unit.
SYSTEMS = {
    "gas furnace + AC": {"heat_eff": 0.95, "heat_fuel": "gas", "cool_cop": 3.5},
    "heat pump": {"heat_eff": 2.5, "heat_fuel": "elec", "cool_cop": 3.5},
}

BTU_PER_KWH, BTU_PER_THERM = 3412.0, 100000.0


@dataclass(frozen=True)
class Prices:
    gas_per_therm: float = 1.30  # assumed, order of US residential averages
    elec_per_kwh: float = 0.16  # assumed
    cost_mult: float = 1.0  # scales every first cost
    energy_mult: float = 1.0  # scales both energy prices


# ASSUMED first costs, USD, unsourced, installed.
LUMBER_PER_BF = 0.90
COST_PER_PIECE = 4.0  # framing labour per cut member
BATT_PER_FT2 = {"2x4": 0.60, "2x6": 1.00}
FOAM_PER_FT2_R5 = 0.90  # 1 in continuous foam sheathing, installed
ATTIC_PER_FT2_PER_R = 0.035
WINDOW_PER_FT2 = {0.50: 25.0, 0.35: 38.0, 0.27: 50.0, 0.20: 75.0}
AIR_SEAL = {7.0: 0.0, 5.0: 400.0, 3.0: 900.0, 1.5: 2200.0}
SLAB_EDGE = {0: 0.0, 10: 3.0}  # R-10, 2 ft deep; USD per linear foot
F_FACTOR = {0: 0.73, 10: 0.54}  # Btu/h ft F, slab perimeter, unheated slab, ASHRAE-style (approximate)

WALLS = {"conv 2x4": CONVENTIONAL_2X4, "conv 2x6": CONVENTIONAL_2X6, "adv 2x6": ADVANCED_2X6,
         "adv 2x6 + R5 foam": ADVANCED_2X6}
ATTIC_R = (19, 30, 38, 49, 60)
WINDOW_U = (0.50, 0.35, 0.27, 0.20)
ACH50 = (7.0, 5.0, 3.0, 1.5)
SLAB_R = (0, 10)


@dataclass(frozen=True)
class Package:
    wall: str = "conv 2x4"
    attic_r: int = 30
    window_u: float = 0.35
    ach50: float = 5.0
    slab_r: int = 0


def options():
    return [Package(*c) for c in product(WALLS, ATTIC_R, WINDOW_U, ACH50, SLAB_R)]


def baseline():
    return Package()


_WALL_CACHE = {}


def wall_numbers(name):
    if name not in _WALL_CACHE:
        t = takeoff(HOUSE, WALLS[name])
        foam = name.endswith("foam")
        r = t["r_effective"] + (5.0 if foam else 0.0)
        stud = WALLS[name].stud
        cost = (t["board_feet"] * LUMBER_PER_BF + t["pieces"] * COST_PER_PIECE
                + t["opaque_ft2"] * BATT_PER_FT2[stud] + (t["opaque_ft2"] * FOAM_PER_FT2_R5 if foam else 0.0))
        _WALL_CACHE[name] = (t["opaque_ft2"] / r, cost)
    return _WALL_CACHE[name]


def ua_parts(p):
    ua_wall, _ = wall_numbers(p.wall)
    return {
        "walls": ua_wall,
        "ceiling": FLOOR_FT2 / (p.attic_r + 1.5),
        "windows": WINDOW_FT2 * p.window_u,
        "door": DOOR_FT2 * U_DOOR,
        "slab edge": PERIMETER_FT * F_FACTOR[p.slab_r],
        "infiltration": AIR_HEAT_CAP * VOLUME_FT3 * p.ach50 / LBL_N,
    }


def first_cost(p, prices=Prices()):
    _, wall_cost = wall_numbers(p.wall)
    c = (wall_cost + FLOOR_FT2 * ATTIC_PER_FT2_PER_R * p.attic_r + WINDOW_FT2 * WINDOW_PER_FT2[p.window_u]
         + AIR_SEAL[p.ach50] + PERIMETER_FT * SLAB_EDGE[p.slab_r])
    return c * prices.cost_mult


def energy(p, climate, system, prices=Prices()):
    """Annual heating and cooling energy (MMBtu delivered to the load) and annual energy cost (USD)."""
    hdd, cdd = CLIMATES[climate] if isinstance(climate, str) else climate
    sysd = SYSTEMS[system]
    ua = sum(ua_parts(p).values())
    heat_load = ua * 24 * hdd * (1 - GAINS_CREDIT)  # Btu/yr
    # the slab edge couples to the ground, not the outdoor air, so it adds no cooling load in this model
    cool_load = (ua - ua_parts(p)["slab edge"]) * 24 * cdd
    elec_p = prices.elec_per_kwh * prices.energy_mult
    gas_p = prices.gas_per_therm * prices.energy_mult
    if sysd["heat_fuel"] == "gas":
        heat_cost = heat_load / sysd["heat_eff"] / BTU_PER_THERM * gas_p
    else:
        heat_cost = heat_load / sysd["heat_eff"] / BTU_PER_KWH * elec_p
    cool_cost = cool_load / sysd["cool_cop"] / BTU_PER_KWH * elec_p
    return {"heat_mmbtu": heat_load / 1e6, "cool_mmbtu": cool_load / 1e6, "annual_cost": heat_cost + cool_cost,
            "ua": ua}


def evaluate(p, climate, system, prices=Prices()):
    e = energy(p, climate, system, prices)
    fc = first_cost(p, prices)
    return {**e, "first_cost": fc, "npc": fc + e["annual_cost"] * ANNUITY}


def optimise(climate, system, prices=Prices()):
    """Exhaustive search over every package (640). Returns (best package, its evaluation)."""
    best = min(options(), key=lambda p: evaluate(p, climate, system, prices)["npc"])
    return best, evaluate(best, climate, system, prices)
