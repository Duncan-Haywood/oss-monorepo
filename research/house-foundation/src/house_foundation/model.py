"""Four foundations for the house-framing house: footing size, quantities, cost and carbon.

Stylised: every unit price is a (low, mid, high) range from memory, not a quote (see README). Loads are
allowable-stress service loads on the long walls. Soil pressure on basement walls, uplift, expansive soil,
seismic and wind overturning are NOT checked. Units: ft, in, sq ft, cubic yards (cy), lb, USD, kg CO2e.
"""
import random
from dataclasses import dataclass

from house_framing.model import House, Loads

KINDS = ("slab", "fpsf", "crawl", "basement")
NAMES = {"slab": "slab on grade", "fpsf": "frost-protected shallow", "crawl": "crawlspace", "basement": "full basement"}

CONCRETE_PCF = 150.0
WALL_IN = 8.0  # stem and basement wall thickness (assumed)
FOOT_T_IN = 8.0  # footing thickness (assumed)
FOOT_MIN_IN = 16.0  # narrowest footing built (assumed)
SLAB_IN = 4.0
WALL_PSF = 12.0  # wood-frame wall dead load per sq ft of wall face (assumed)
FLOOR_DEAD_PSF, FLOOR_LIVE_PSF = 10.0, 40.0
CRAWL_ABOVE_GRADE_FT = 1.5  # stem top above grade, for clear height under the floor
SILL_ABOVE_GRADE_FT = 8 / 12
BASEMENT_WALL_FT = 9.0  # top of footing to top of wall (8 ft clear above a 4 in slab)
FPSF_DEPTH_FT = 16 / 12

# (low, mid, high). Units in the key. All from memory, none sourced.
PRICES = {
    "concrete": (150, 180, 230),  # USD per cy placed, forms excluded
    "forms": (3, 5, 8),  # USD per sq ft of contact area
    "rebar": (50, 80, 120),  # USD per cy of footing or wall concrete
    "dig": (8, 14, 25),  # USD per cy excavated and backfilled
    "slab": (5.5, 7.5, 10),  # USD per sq ft, 4 in slab with base, vapour barrier and finish
    "foam": (1.2, 1.8, 2.6),  # USD per sq ft, 2 in XPS
    "waterproof": (1.5, 2.5, 4),  # USD per sq ft of below-grade wall
    "drain": (8, 12, 18),  # USD per ft of perimeter drain with gravel
    "sump": (500, 800, 1500),  # USD, sump pit and pump
    "stairs": (2500, 3500, 5500),  # USD, basement stairs and opening
    "floor": (5.5, 8, 11),  # USD per sq ft, framed floor with subfloor over a crawlspace or basement
    "crawl_vb": (0.3, 0.5, 0.8),  # USD per sq ft, ground vapour barrier
    "crawl_fixed": (300, 500, 900),  # USD, vents and access hatch
}
CARBON_KG_CY = (230, 290, 360)  # kg CO2e per cy of concrete, product stage, from memory


@dataclass(frozen=True)
class Site:
    frost_in: float = 48.0  # frost depth: footing bottoms go at least this deep (assumed per climate)
    bearing_psf: float = 2000.0  # allowable soil bearing (assumed; IRC R401.4 has presumptive values, not copied)


def design_load_plf(kind, house=House(), loads=Loads()):
    """Governing allowable-stress line load on the long-wall footing, lb/ft (before footing weight)."""
    roof_d, roof_s = loads.roof_plf()
    wall = WALL_PSF * house.plate_height_in / 12
    d, s, live = roof_d + wall, roof_s, 0.0
    h = {"crawl": CRAWL_ABOVE_GRADE_FT, "basement": BASEMENT_WALL_FT}.get(kind)
    if h:
        d += CONCRETE_PCF * WALL_IN / 12 * h
        d += FLOOR_DEAD_PSF * house.width_ft / 2
        live = FLOOR_LIVE_PSF * house.width_ft / 2
    return max(d + live, d + s, d + 0.75 * (live + s))


def footing_width_in(kind, site=Site(), house=House(), loads=Loads()):
    """Width so that wall load plus footing weight stays within the allowable bearing, floored at FOOT_MIN_IN."""
    q_net = site.bearing_psf - CONCRETE_PCF * FOOT_T_IN / 12
    w = design_load_plf(kind, house, loads) / q_net * 12
    return max(FOOT_MIN_IN, -(-w // 2) * 2)


def quantities(kind, site=Site(), house=House(), loads=Loads()):
    """Physical quantities of one foundation, plus the framed floor if it has one."""
    W, L = house.width_ft, house.length_ft
    perim, area = 2 * (W + L), W * L
    wf = footing_width_in(kind, site, house, loads) / 12
    t = FOOT_T_IN / 12
    wall = WALL_IN / 12
    q = dict(kind=kind, footing_in=wf * 12, struct_cy=0.0, slab_cy=0.0, forms_sf=0.0, dig_cy=0.0, slab_sf=0.0,
             foam_sf=0.0, waterproof_sf=0.0, drain_lf=0.0, floor_sf=0.0, crawl_sf=0.0, stairs=0, sump=0,
             crawl_fixed=0, depth_ft=0.0)
    frost = max(site.frost_in, 12.0) / 12
    if kind in ("slab", "fpsf") and (kind == "fpsf" or frost <= 1.0):
        # monolithic thickened edge: footing and slab poured together
        depth = FPSF_DEPTH_FT if kind == "fpsf" else frost
        q["depth_ft"] = depth
        q["struct_cy"] = perim * wf * (depth - SLAB_IN / 12) / 27
        q["forms_sf"] = perim * (depth + SILL_ABOVE_GRADE_FT)
        q["slab_sf"] = area
        q["dig_cy"] = (perim * (wf + 2) * depth + area * 0.5) / 27
        if kind == "fpsf":
            wing = min(48.0, max(0.0, 0.75 * (site.frost_in - 12))) / 12  # assumed; ASCE 32 has the real design
            q["foam_sf"] = perim * (depth + SILL_ABOVE_GRADE_FT) + perim * wing + 4 * wing * wing
    else:
        if kind == "slab":
            depth, above = frost, SILL_ABOVE_GRADE_FT
        elif kind == "crawl":
            depth, above = frost, CRAWL_ABOVE_GRADE_FT
        else:
            above = SILL_ABOVE_GRADE_FT
            depth = BASEMENT_WALL_FT + t - above
        h = depth + above - t  # stem or wall height above the footing
        q["depth_ft"] = depth
        q["struct_cy"] = perim * (wf * t + wall * h) / 27
        q["forms_sf"] = perim * (2 * t + 2 * h)
        if kind == "basement":
            q["dig_cy"] = (W + 4) * (L + 4) * depth / 27
            q["slab_sf"] = area
            q["waterproof_sf"] = perim * (h - above)
            q["drain_lf"] = perim
            q["sump"], q["stairs"] = 1, 1
            q["floor_sf"] = area
        else:
            q["dig_cy"] = (perim * (wf + 2) * depth + area * 0.5) / 27
            if kind == "slab":
                q["slab_sf"] = area
            else:
                q["crawl_sf"], q["crawl_fixed"], q["floor_sf"] = area, 1, area
    q["slab_cy"] = q["slab_sf"] * SLAB_IN / 12 / 27
    return q


def mid_prices():
    return {k: v[1] for k, v in PRICES.items()} | {"carbon": CARBON_KG_CY[1]}


def draw_prices(rng):
    """One triangular draw of every unit price, shared by all foundation types in the same draw."""
    d = {k: rng.triangular(v[0], v[2], v[1]) for k, v in PRICES.items()}
    d["carbon"] = rng.triangular(CARBON_KG_CY[0], CARBON_KG_CY[2], CARBON_KG_CY[1])
    return d


def cost_of(q, p=None):
    """(USD, kg CO2e) for the quantities q at unit prices p (midpoints by default)."""
    p = p or mid_prices()
    usd = (q["struct_cy"] * (p["concrete"] + p["rebar"]) + q["forms_sf"] * p["forms"] + q["dig_cy"] * p["dig"]
           + q["slab_sf"] * p["slab"] + q["foam_sf"] * p["foam"] + q["waterproof_sf"] * p["waterproof"]
           + q["drain_lf"] * p["drain"] + q["sump"] * p["sump"] + q["stairs"] * p["stairs"]
           + q["floor_sf"] * p["floor"] + q["crawl_sf"] * p["crawl_vb"] + q["crawl_fixed"] * p["crawl_fixed"])
    kg = (q["struct_cy"] + q["slab_cy"]) * p["carbon"]
    return usd, kg


def cheapest(site, p=None, house=House(), kinds=KINDS):
    totals = {k: cost_of(quantities(k, site, house), p)[0] for k in kinds}
    return min(totals, key=totals.get), totals


def monte_carlo(site, n=5000, seed=7, house=House()):
    """Win shares by first cost over n shared price draws, and the basement-minus-crawl increment per added sq ft."""
    rng = random.Random(seed)
    qs = {k: quantities(k, site, house) for k in KINDS}
    wins = dict.fromkeys(KINDS, 0)
    inc = []
    for _ in range(n):
        p = draw_prices(rng)
        tot = {k: cost_of(qs[k], p)[0] for k in KINDS}
        wins[min(tot, key=tot.get)] += 1
        inc.append((tot["basement"] - tot["crawl"]) / (house.width_ft * house.length_ft))
    inc.sort()
    pct = lambda f: inc[int(f * (n - 1))]
    return {"wins": {k: v / n for k, v in wins.items()}, "increment_psf": (pct(0.1), pct(0.5), pct(0.9))}
