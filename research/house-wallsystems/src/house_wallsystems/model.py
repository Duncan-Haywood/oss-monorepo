"""Six exterior wall systems for the house-framing house: cost, carbon, R-value, labour, heat-loss cost.

Stylised: every per-square-foot figure is a (low, mid, high) range from memory, not a quote or an EPD
(see README). The point is which conclusions survive the ranges. Units: ft, sq ft, USD, kg CO2e, h.
"""
import random
from dataclasses import dataclass

from house_framing.model import CONVENTIONAL_2X6, House, walls_of


@dataclass(frozen=True)
class System:
    name: str
    cost: tuple  # USD per sq ft of net wall, structure + insulation + sheathing, before cladding and interior finish
    carbon: tuple  # kg CO2e per sq ft, product stage A1-A3, biogenic carbon not credited
    r: tuple  # whole-wall R (h ft2 F / Btu), thermal bridging included
    hours: float  # on-site labour hours per sq ft (crew hours, not including a printer or crane operator)


SYSTEMS = [
    System("wood 2x6 + batt", (6, 8, 10), (1.2, 2.0, 3.0), (13, 15, 17), 0.12),
    System("steel stud + batt", (8, 10, 13), (4, 6, 9), (7, 9, 11), 0.13),
    System("ICF", (14, 17, 22), (10, 14, 20), (18, 22, 24), 0.15),
    System("SIP", (11, 14, 17), (3, 5, 7), (19, 21, 23), 0.07),
    System("CLT + exterior foam", (18, 22, 30), (4, 6, 8), (13, 15, 18), 0.05),
    System("3D-printed double wall", (10, 15, 20), (8, 11, 16), (8, 12, 16), 0.06),
]


def net_wall_area(house=House()):
    """Gross exterior wall area less rough openings, from the framing model's walls (sq ft)."""
    h = house.plate_height_in
    return sum((w.length_in * h - sum(o.width_in * (house.head_in - o.sill_in) for o in w.openings)) / 144
               for w in walls_of(house, CONVENTIONAL_2X6))


@dataclass(frozen=True)
class Climate:
    hdd: float = 5000.0  # heating degree days F, base 65 (assumed)
    price_kwh: float = 0.15  # USD per kWh of electricity (assumed)
    cop: float = 3.0  # heat pump seasonal COP (assumed)
    years: int = 30
    discount: float = 0.05


def heat_loss_cost(area, r, c=Climate()):
    """Present value of 30 years of heating the heat lost through the wall (USD)."""
    kwh = area / r * c.hdd * 24 / 3412 / c.cop
    annuity = (1 - (1 + c.discount) ** -c.years) / c.discount
    return kwh * c.price_kwh * annuity


def evaluate(system, area, which=1, c=Climate()):
    """which indexes the (low, mid, high) tuples: 0, 1 or 2."""
    cost, carbon, r = system.cost[which] * area, system.carbon[which] * area, system.r[which]
    return {"cost": cost, "carbon": carbon, "r": r, "hours": system.hours * area,
            "heat_pv": heat_loss_cost(area, r, c)}


def sample(system, rng):
    """One draw of (cost, carbon, R) per sq ft, triangular between low and high with the mid as mode."""
    t = lambda v: rng.triangular(v[0], v[2], v[1])
    return t(system.cost), t(system.carbon), t(system.r)


def monte_carlo(area, n=20000, seed=1, c=Climate(), systems=SYSTEMS):
    """Independent draws per system. Returns per-system dicts of win counts and rank sums, and the draws kept for pairs."""
    rng = random.Random(seed)
    wins = {s.name: {"cost": 0, "carbon": 0, "total": 0} for s in systems}
    pair = {s.name: 0 for s in systems}  # draws where the system's first-cost beats wood's
    for _ in range(n):
        d = {s.name: sample(s, rng) for s in systems}
        cost = {k: v[0] * area for k, v in d.items()}
        carbon = {k: v[1] * area for k, v in d.items()}
        total = {k: cost[k] + heat_loss_cost(area, v[2], c) for k, v in d.items()}
        wins[min(cost, key=cost.get)]["cost"] += 1
        wins[min(carbon, key=carbon.get)]["carbon"] += 1
        wins[min(total, key=total.get)]["total"] += 1
        for k in pair:
            pair[k] += cost[k] < cost[systems[0].name]
    return {"wins": {k: {m: x / n for m, x in v.items()} for k, v in wins.items()},
            "beats_wood_first_cost": {k: v / n for k, v in pair.items()}}


def pareto(points):
    """Names not dominated on (cost, carbon, -R): nobody else is at least as good on all three and better on one."""
    out = []
    for a, (ca, ka, ra) in points.items():
        if not any(cb <= ca and kb <= ka and rb >= ra and (cb, kb, rb) != (ca, ka, ra)
                   for b, (cb, kb, rb) in points.items() if b != a):
            out.append(a)
    return out
