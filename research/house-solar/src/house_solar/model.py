"""Window solar gain by orientation, added to house-energy's degree-day envelope model.

Solar geometry is computed from first principles (declination, hourly beam on a vertical surface, Erbs diffuse
split, isotropic sky) rather than read from a table, so nothing here copies a copyrighted dataset. Monthly outdoor
temperature is a sinusoid fitted to each climate's (HDD65, CDD65) pair, which decides in which months a gain
offsets heating and in which it adds to cooling. Latitudes and clearness indices are ASSUMED inputs.
"""
import math
from dataclasses import replace
from functools import lru_cache

from house_energy.model import (CLIMATES, SYSTEMS, ANNUITY, BTU_PER_KWH, BTU_PER_THERM, WINDOW_FT2, Prices,
                                first_cost, options, ua_parts)

# latitude (deg N), from memory of the cities' positions, rounded to 0.1; clearness index Kt (monthly mean of
# horizontal radiation over extraterrestrial), ASSUMED round values, not read from any dataset.
LATITUDE = {"Miami (1A)": 25.8, "Houston (2A)": 29.8, "Atlanta (3A)": 33.6, "Albuquerque (4B)": 35.0,
            "Baltimore (4A)": 39.2, "Chicago (5A)": 41.9, "Minneapolis (6A)": 44.9, "Duluth (7)": 46.8}
KT = {"Miami (1A)": 0.50, "Houston (2A)": 0.50, "Atlanta (3A)": 0.52, "Albuquerque (4B)": 0.65,
      "Baltimore (4A)": 0.50, "Chicago (5A)": 0.48, "Minneapolis (6A)": 0.50, "Duluth (7)": 0.48}
ORIENT_AZ = {"S": 0.0, "E": -90.0, "W": 90.0, "N": 180.0}  # surface azimuth, 0 = south, east negative
# Glazing solar heat gain coefficient tied to U (low-e coatings lower both); ASSUMED typical values.
SHGC = {0.50: 0.55, 0.35: 0.35, 0.27: 0.30, 0.20: 0.28}
# Share of window area facing each way. EVEN is a stand-in for house-energy's unspecified windows.
SPLITS = {"even": {"S": .25, "E": .25, "W": .25, "N": .25}, "south-heavy": {"S": .60, "E": .15, "W": .15, "N": .10},
          "north-heavy": {"S": .10, "E": .15, "W": .15, "N": .60}, "east-west": {"S": 0.0, "E": .5, "W": .5, "N": 0.0}}
INTERNAL_CREDIT = 0.15   # share of conduction heating load offset by internal gains only (assumed; solar is explicit)
SOLAR_FACTOR = 0.75      # frames, screens, non-normal incidence and dirt: share of SHGC x incident that gets in (assumed)
USEFUL = 0.80            # share of heating-season gain that offsets heating rather than overheating (assumed)
ALBEDO = 0.2
MID_DAYS = (15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349)
MONTH_LEN = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def erbs_diffuse_fraction(kt):
    if kt <= 0.17:
        return 1 - 0.09 * kt
    kt = min(kt, 0.8)
    return 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4


def vertical_day(lat, n, kt, azimuth):
    """Total radiation on a vertical surface for day-of-year n, Btu/ft2 day, plus horizontal total."""
    phi = math.radians(lat)
    gam = math.radians(azimuth)
    dec = math.radians(23.45 * math.sin(2 * math.pi * (284 + n) / 365))
    e0 = 1 + 0.033 * math.cos(2 * math.pi * n / 365)
    kd = erbs_diffuse_fraction(kt)
    tot = hor = 0.0
    for h in range(24):
        w = math.radians(15 * (h + 0.5 - 12))
        cz = math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(w)
        if cz <= 0.02:
            continue
        ih = kt * 1367 * 0.3171 * e0 * cz  # Btu/ft2 h on a horizontal surface
        idf = kd * ih
        ibn = (ih - idf) / cz
        ct = (-math.sin(dec) * math.cos(phi) * math.cos(gam) + math.cos(dec) * math.sin(phi) * math.cos(gam) * math.cos(w)
              + math.cos(dec) * math.sin(gam) * math.sin(w))
        tot += ibn * max(ct, 0.0) + 0.5 * idf + 0.5 * ALBEDO * ih
        hor += ih
    return tot, hor


def fit_temperature(hdd, cdd):
    """Daily mean temperature sinusoid T = Tm + A cos(2 pi (d - 200) / 365) matching annual HDD65 and CDD65.
    Tm is exact (clipping cancels in the sum of T - 65); A is found by bisection on HDD."""
    tm = 65 + (cdd - hdd) / 365.0

    def hdd_of(a):
        return sum(max(65 - (tm + a * math.cos(2 * math.pi * (d - 200) / 365)), 0) for d in range(365))
    lo, hi = 0.0, 80.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if hdd_of(mid) < hdd else (lo, mid)
    return tm, (lo + hi) / 2


@lru_cache(maxsize=None)
def solar_table(climate):
    """Per orientation: (Btu/ft2 incident in heating-weighted months, in cooling-weighted months). In each
    month the incident energy is split by that month's HDD / (HDD + CDD), from the fitted temperature sinusoid."""
    hdd, cdd = CLIMATES[climate]
    tm, a = fit_temperature(hdd, cdd)
    lat, kt = LATITUDE[climate], KT[climate]
    out = {}
    for o, az in ORIENT_AZ.items():
        heat = cool = 0.0
        d0 = 0
        for m, n in enumerate(MID_DAYS):
            days = MONTH_LEN[m]
            h = c = 0.0
            for d in range(d0, d0 + days):
                t = tm + a * math.cos(2 * math.pi * (d - 200) / 365)
                h += max(65 - t, 0)
                c += max(t - 65, 0)
            d0 += days
            share = h / (h + c) if h + c > 0 else 0.5
            tot, _ = vertical_day(lat, n, kt, az)
            heat += tot * days * share
            cool += tot * days * (1 - share)
        out[o] = (heat, cool)
    return out


def energy(p, climate, system, split="even", prices=Prices(), shgc=None):
    hdd, cdd = CLIMATES[climate]
    sysd = SYSTEMS[system]
    parts = ua_parts(p)
    ua = sum(parts.values())
    g = (shgc or SHGC)[p.window_u]
    tab = solar_table(climate)
    sol_heat = sum(WINDOW_FT2 * share * g * SOLAR_FACTOR * tab[o][0] for o, share in SPLITS[split].items())
    sol_cool = sum(WINDOW_FT2 * share * g * SOLAR_FACTOR * tab[o][1] for o, share in SPLITS[split].items())
    heat_load = max(ua * 24 * hdd * (1 - INTERNAL_CREDIT) - USEFUL * sol_heat, 0.0)
    cool_load = (ua - parts["slab edge"]) * 24 * cdd + sol_cool
    ep, gp = prices.elec_per_kwh * prices.energy_mult, prices.gas_per_therm * prices.energy_mult
    heat_cost = (heat_load / sysd["heat_eff"] / BTU_PER_THERM * gp if sysd["heat_fuel"] == "gas"
                 else heat_load / sysd["heat_eff"] / BTU_PER_KWH * ep)
    cool_cost = cool_load / sysd["cool_cop"] / BTU_PER_KWH * ep
    return {"heat_mmbtu": heat_load / 1e6, "cool_mmbtu": cool_load / 1e6, "solar_heat_mmbtu": sol_heat / 1e6,
            "solar_cool_mmbtu": sol_cool / 1e6, "annual_cost": heat_cost + cool_cost, "ua": ua}


def evaluate(p, climate, system, split="even", prices=Prices(), shgc=None):
    e = energy(p, climate, system, split, prices, shgc)
    fc = first_cost(p, prices)
    return {**e, "first_cost": fc, "npc": fc + e["annual_cost"] * ANNUITY}


def optimise(climate, system, split="even", prices=Prices(), shgc=None):
    best = min(options(), key=lambda p: evaluate(p, climate, system, split, prices, shgc)["npc"])
    return best, evaluate(best, climate, system, split, prices, shgc)
