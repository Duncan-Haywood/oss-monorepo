"""What is a stock humanoid worth on a house site? Net saving per replaced crew-hour, break-even slowdown, Monte Carlo.

Hours come from research/buildbot-taskbook (taskbook.json). A robot may take a task only if the taskbook's static payload
test passes for it. The robot then takes `slowdown` robot-hours per replaced crew-hour, costs `rate` dollars per hour of
use (purchase over life plus upkeep) and needs `supervision` person-hours per robot-hour. No robot skill is simulated here
(buildbot-carry/-fasten/-cohold are not built), so slowdown, success and supervision are swept, not measured.
"""
import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
TASKBOOK = HERE.parents[2] / "buildbot-taskbook" / "experiments" / "taskbook.json"

# Sourced inputs (see README "Inputs"). Prices are launch prices from press reports, not a current quote.
WAGE_CARPENTER = 29.12      # US median hourly pay, carpenters, May 2025 (BLS Occupational Outlook Handbook)
PRICE_USD = {"G1": 16000.0, "H1": 90000.0}   # base-model launch prices (heise 2024-05; press 2024-08)
NAHB_PRICE = 665298.0       # NAHB, Cost of Constructing a Home in 2024: average sales price
NAHB_CONSTRUCTION = 428215.0  # ... total construction cost (64.4% of price)
FRAMING_STAGE_SHARE = 0.166   # house-cost STAGE_SHARES["framing"], NAHB 2024
FRAMING_MATERIAL_SHARE = 0.45  # house-cost's own assumption, not survey data


def load_tasks(path=TASKBOOK):
    return json.loads(Path(path).read_text())["tasks"]


def eligible_hours(tasks, robot, scenario="A"):
    """Crew-hours of the tasks whose payload verdict for `robot` is 'yes' (hand tasks only)."""
    key = {"H1": "h1_payload", "G1": "g1_payload"}[robot]
    hk = "crew_hours_mid_" + ("B" if scenario == "B" else "A")
    return sum(t[hk] for t in tasks if t[key] == "yes")


def total_hours(tasks, scenario="A"):
    hk = "crew_hours_mid_" + ("B" if scenario == "B" else "A")
    return sum(t[hk] for t in tasks)


def cost_implied_framing_hours(loaded_wage):
    """Framing labour hours an average NAHB house implies: stage cost x labour share / loaded wage."""
    return NAHB_CONSTRUCTION * FRAMING_STAGE_SHARE * (1 - FRAMING_MATERIAL_SHARE) / loaded_wage


def robot_rate(price, life_h, upkeep_per_year, used_h_per_year):
    """Dollars per hour of use: price over its life plus yearly upkeep (fraction of price) over yearly use."""
    return price * (1.0 / life_h + upkeep_per_year / used_h_per_year)


def net_per_replaced_hour(loaded_wage, rate, slowdown, supervision):
    """Dollars saved per crew-hour replaced: the wage avoided less `slowdown` robot-hours of ownership and supervision."""
    return loaded_wage - slowdown * (rate + supervision * loaded_wage)


def breakeven_slowdown(loaded_wage, rate, supervision):
    """Robot-hours per replaced crew-hour at which the saving is zero."""
    return loaded_wage / (rate + supervision * loaded_wage)


def _logu(rng, lo, hi):
    return math.exp(rng.uniform(math.log(lo), math.log(hi)))


def draw(rng):
    return {"wage": rng.uniform(25.0, 35.0), "burden": rng.uniform(1.0, 1.6),
            "slowdown": _logu(rng, 1.0, 10.0), "supervision": rng.uniform(0.1, 1.0),
            "success": rng.uniform(0.3, 1.0), "price_mult": rng.uniform(1.0, 2.0),
            "life_h": _logu(rng, 2000.0, 10000.0), "upkeep": rng.uniform(0.05, 0.20),
            "used_h": _logu(rng, 500.0, 2000.0)}


def saving_per_house(hours, robot, p):
    """Net dollars saved on a house with `hours` eligible crew-hours, success fraction p['success'] of them done by robot."""
    w = p["wage"] * p["burden"]
    rate = robot_rate(PRICE_USD[robot] * p["price_mult"], p["life_h"], p["upkeep"], p["used_h"])
    return hours * p["success"] * net_per_replaced_hour(w, rate, p["slowdown"], p["supervision"])


def simulate(hours, robot, n=4000, seed=1):
    rng = random.Random(seed)
    out = [saving_per_house(hours, robot, draw(rng)) for _ in range(n)]
    out.sort()
    q = lambda f: out[min(n - 1, int(f * n))]
    return {"p_positive": sum(x > 0 for x in out) / n, "p5": q(0.05), "median": q(0.5), "p95": q(0.95), "max": out[-1]}


def share_of_price(dollars):
    return dollars / NAHB_PRICE
