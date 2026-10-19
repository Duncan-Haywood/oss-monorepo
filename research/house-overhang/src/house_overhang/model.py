"""Roof-overhang shading of south glass, added to house-solar.

A horizontal overhang of projection P (ft), whose underside sits OFFSET ft above the window head, shades a
window of height WIN_H. For a surface at azimuth 0 (south) with the sun at altitude alt and azimuth az, the
profile angle is atan(tan(alt) / cos(az)); the shadow reaches P * tan(profile) - OFFSET down the glass.
Only beam radiation is shaded; diffuse and ground-reflected terms are left whole (an overhang also blocks part
of the sky, which this ignores, so it slightly overstates the gain left under a deep overhang). Window height,
offset and the overhang price are ASSUMED. Everything else is house-solar's.
"""
import math
from functools import lru_cache

from house_energy.model import CLIMATES, ANNUITY, WINDOW_FT2, Prices, first_cost
from house_solar.model import (ALBEDO, KT, LATITUDE, MID_DAYS, MONTH_LEN, SPLITS,
                               erbs_diffuse_fraction, fit_temperature)
from house_solar import model as hs

_BASE_TABLE = hs.solar_table  # captured before energy() swaps in the shaded table

WIN_H = 4.0          # window height, ft (assumed)
OFFSET = 0.5         # gap from window head to overhang underside, ft (assumed)
OVERHANG_COST = 12.0  # $ per ft of window width per ft of projection, extra rafter tail, soffit and fascia (assumed)
PROJECTIONS = (0.0, 1.0, 2.0, 3.0, 4.0)


def shaded_fraction(proj, alt, sun_az, surf_az=0.0, h=WIN_H, offset=OFFSET):
    """Share of the glass in shadow at one instant. Angles in radians; sun_az measured from south."""
    if proj <= 0 or alt <= 0:
        return 0.0
    c = math.cos(sun_az - surf_az)
    if c <= 0:
        return 0.0
    prof = math.atan(math.tan(alt) / c)
    return min(max((proj * math.tan(prof) - offset) / h, 0.0), 1.0)


def vertical_day_shaded(lat, n, kt, azimuth, proj):
    """As house_solar.vertical_day, with the beam term reduced by the overhang's shaded fraction."""
    phi, gam = math.radians(lat), math.radians(azimuth)
    dec = math.radians(23.45 * math.sin(2 * math.pi * (284 + n) / 365))
    e0 = 1 + 0.033 * math.cos(2 * math.pi * n / 365)
    kd = erbs_diffuse_fraction(kt)
    tot = 0.0
    for hr in range(24):
        w = math.radians(15 * (hr + 0.5 - 12))
        cz = math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(w)
        if cz <= 0.02:
            continue
        ih = kt * 1367 * 0.3171 * e0 * cz
        idf = kd * ih
        ibn = (ih - idf) / cz
        ct = (-math.sin(dec) * math.cos(phi) * math.cos(gam) + math.cos(dec) * math.sin(phi) * math.cos(gam) * math.cos(w)
              + math.cos(dec) * math.sin(gam) * math.sin(w))
        alt = math.asin(min(cz, 1.0))
        sun_az = math.atan2(math.sin(w), math.sin(phi) * math.cos(w) - math.cos(phi) * math.tan(dec))
        sh = shaded_fraction(proj, alt, sun_az, gam)
        tot += ibn * max(ct, 0.0) * (1 - sh) + 0.5 * idf + 0.5 * ALBEDO * ih
    return tot


@lru_cache(maxsize=None)
def solar_table_shaded(climate, proj):
    """house_solar.solar_table with the overhang on the south face only: {orientation: (heat, cool)} Btu/ft2."""
    base = _BASE_TABLE(climate)
    hdd, cdd = CLIMATES[climate]
    tm, a = fit_temperature(hdd, cdd)
    lat, kt = LATITUDE[climate], KT[climate]
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
        tot = vertical_day_shaded(lat, n, kt, 0.0, proj)
        heat += tot * days * share
        cool += tot * days * (1 - share)
    out = dict(base)
    out["S"] = (heat, cool)
    return out


def energy(p, climate, system, split="south-heavy", proj=0.0, prices=Prices(), shgc=None):
    """house_solar.energy with the shaded south table, plus the overhang's first cost in the result."""
    saved = hs.solar_table
    hs.solar_table = lambda c: solar_table_shaded(c, proj)
    try:
        e = hs.energy(p, climate, system, split, prices, shgc)
    finally:
        hs.solar_table = saved
    e["overhang_cost"] = OVERHANG_COST * proj * (WINDOW_FT2 * SPLITS[split]["S"] / WIN_H)
    return e


def evaluate(p, climate, system, split="south-heavy", proj=0.0, prices=Prices(), shgc=None):
    e = energy(p, climate, system, split, proj, prices, shgc)
    fc = first_cost(p, prices) + e["overhang_cost"]
    return {**e, "first_cost": fc, "npc": fc + e["annual_cost"] * ANNUITY}


def optimise(climate, system, split="south-heavy", projections=PROJECTIONS, prices=Prices(), shgc=None):
    """Exhaustive over house-energy's packages x projections. Returns (package, projection, result)."""
    from house_energy.model import options
    best = min(((p, pr) for p in options() for pr in projections),
               key=lambda x: evaluate(x[0], climate, system, split, x[1], prices, shgc)["npc"])
    return best[0], best[1], evaluate(best[0], climate, system, split, best[1], prices, shgc)
