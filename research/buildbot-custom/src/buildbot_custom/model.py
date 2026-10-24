"""A purpose-built sheathing-nailing gantry against a stock humanoid (research/buildbot-taskbook, -fasten, -cost).

The costliest hand task the humanoids are poor at is fastening sheathing (taskbook: fastening is the largest verb; the roof deck
is out of reach of both robots). A Cartesian bridge over a panel table does it the way prefab plants do: the sheet is laid on a
framed panel, a vision scan finds the studs, and a nailer on a two-axis carriage fires the schedule. This module computes
(1) the cycle time of the 62-nail schedule of one 4x8 sheet from axis speed, acceleration and fire time,
(2) the positioning scatter the nail windows allow, and (3) the house volume at which the machine pays against the
taskbook's crew-hours, next to the humanoids of buildbot-cost. Stdlib only. Machine price and axis performance are swept.
"""
import json
import math
import random
from math import erf, sqrt
from pathlib import Path

HERE = Path(__file__).resolve().parent
TASKBOOK = HERE.parents[2] / "buildbot-taskbook" / "experiments" / "taskbook.json"

IN = 0.0254
STUD_FACE = 1.5 * IN
NAIL_D = 0.131 * IN          # 8d common shank (buildbot-fasten)
EDGE_MIN = 0.375 * IN
SHEET = (48 * IN, 96 * IN)
SPACING = 16 * IN
WAGE = 29.12                 # BLS carpenter median, May 2025 (buildbot-cost)
NAILS_PER_S_MAX = 8.0        # Kyocera Senco SmartLoad nailers for bridge systems: "up to eight nails per second" (trade listing)


def band(face, kind):
    """(centre, half-width) of the band a nail may land in; same as buildbot_fasten.model.band."""
    r = NAIL_D / 2
    lo = EDGE_MIN if kind != "open" else r
    hi = (face / 2 if kind == "centre" else face) - r
    return (lo + hi) / 2, (hi - lo) / 2


def schedule():
    """(y, z, half-window, axis, kind) of the 62 nails of one 4x8 sheet standing on end; same layout as buildbot_fasten."""
    w, h = SHEET
    out = []
    c, hw = band(STUD_FACE, "centre")
    for k in range(17):
        for y in (c, w - c):
            out.append((y, k * 6 * IN, hw, "y", "joint"))
    cb, hb = band(STUD_FACE, "flush")
    ct, ht = band(2 * STUD_FACE, "flush")
    for k in range(1, 8):
        out.append((k * 6 * IN, cb, hb, "z", "bottom"))
        out.append((k * 6 * IN, h - ct, ht, "z", "top"))
    cf, hf = band(STUD_FACE, "open")
    for ys in (SPACING, 2 * SPACING):
        for k in range(1, 8):
            out.append((ys + cf - STUD_FACE / 2, k * 12 * IN, hf, "y", "field"))
    return out


def move_time(d, v, a):
    """Rest-to-rest move of length d (m) with a trapezoidal velocity profile (peak speed v m/s, acceleration a m/s^2)."""
    d = abs(d)
    if d == 0:
        return 0.0
    if d >= v * v / a:
        return d / v + v / a
    return 2 * math.sqrt(d / a)


def leg_time(p, q, v, a):
    """Two independent axes: the move takes as long as the slower one."""
    return max(move_time(p[0] - q[0], v, a), move_time(p[1] - q[1], v, a))


def order(nails, mode):
    """Visiting order. 'rows': serpentine along z-columns (a stud at a time); 'greedy': nearest neighbour from the corner."""
    pts = [(n[0], n[1]) for n in nails]
    if mode == "greedy":
        left, cur, out = pts[:], (0.0, 0.0), []
        while left:
            nxt = min(left, key=lambda p: (p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2)
            left.remove(nxt)
            out.append(nxt)
            cur = nxt
        return out
    cols = sorted({round(p[0], 6) for p in pts})
    out = []
    for i, c in enumerate(cols):
        col = sorted([p for p in pts if round(p[0], 6) == c], key=lambda p: p[1], reverse=bool(i % 2))
        out += col
    return out


def sheet_cycle(nails, v, a, t_fire, mode="rows", t_scan=0.0, t_load=0.0, home=(0.0, 0.0)):
    """Seconds to nail one sheet: stop-and-fire at every nail (t_fire includes settling), plus scan and load times.
    Returns (total, travel, firing)."""
    pts = order(nails, mode)
    travel, cur = 0.0, home
    for p in pts:
        travel += leg_time(cur, p, v, a)
        cur = p
    firing = t_fire * len(pts)
    return t_scan + t_load + travel + firing, travel, firing


def nail_success(half, sigma):
    return 1.0 if sigma <= 0 else erf(half / (sigma * sqrt(2)))


def sheet_success(nails, sigma):
    """Chance every nail lands in its window for isotropic Gaussian tip scatter sigma (m), independent per nail."""
    p = 1.0
    for n in nails:
        p *= nail_success(n[2], sigma)
    return p


def required_sigma(nails, target=0.95):
    lo, hi = 1e-6, 0.1
    for _ in range(60):
        mid = (lo + hi) / 2
        if sheet_success(nails, mid) >= target:
            lo = mid
        else:
            hi = mid
    return lo


def load_tasks(path=TASKBOOK):
    return json.loads(Path(path).read_text())["tasks"]


def nailing_hours(tasks, recount=True):
    """Crew-hours of hand nailing of wall (S4) and roof (R3) sheathing. The taskbook now books 62 nails a sheet, the count of
    buildbot-fasten, so recount (kept for old callers) is a no-op."""
    wall = next(t for t in tasks if t["id"] == "S4")
    roof = next(t for t in tasks if t["id"] == "R3")
    hw = wall["crew_hours_mid_A"]
    return {"wall": hw, "roof": roof["crew_hours_mid_A"], "wall_sheets": wall["cycles"] / 62, "roof_sheets": roof["cycles"] / 62}


def annual_cost(price, life_y, rate, upkeep):
    """Capital recovery of `price` over life_y years at interest `rate`, plus yearly upkeep as a fraction of price."""
    crf = price / life_y if rate == 0 else price * rate / (1 - (1 + rate) ** -life_y)
    return crf + upkeep * price


def breakeven_houses(price, life_y, rate, upkeep, hours_saved_per_house, loaded_wage, operator_h_per_house=0.0):
    """Houses a year at which the machine's annual cost equals the wages it saves; inf if it saves nothing per house."""
    per_house = (hours_saved_per_house - operator_h_per_house) * loaded_wage
    return math.inf if per_house <= 0 else annual_cost(price, life_y, rate, upkeep) / per_house


def draw(rng):
    return {"price": math.exp(rng.uniform(math.log(40e3), math.log(600e3))), "life_y": rng.uniform(7.0, 20.0),
            "rate": rng.uniform(0.04, 0.10), "upkeep": rng.uniform(0.03, 0.12), "burden": rng.uniform(1.0, 1.6),
            "wage": rng.uniform(25.0, 35.0), "operator_share": rng.uniform(0.0, 0.5)}


def houses_needed(hours, p):
    """Break-even houses a year for a draw p, when the machine takes `hours` of nailing and the operator keeps
    operator_share of those hours (loading, clearing jams, reloading nails)."""
    return breakeven_houses(p["price"], p["life_y"], p["rate"], p["upkeep"], hours, p["wage"] * p["burden"],
                            operator_h_per_house=hours * p["operator_share"])


def quantiles(xs, qs=(0.05, 0.5, 0.95)):
    xs = sorted(xs)
    return [xs[min(len(xs) - 1, int(q * len(xs)))] for q in qs]


def simulate(hours, n=4000, seed=1):
    rng = random.Random(seed)
    xs = [houses_needed(hours, draw(rng)) for _ in range(n)]
    return quantiles(xs)
