"""House-schedule's build with a chosen order time for every material, and what holding it costs.

`house_schedule` orders a material when the task before its user starts, or at
day 0 for free. Here each material is ordered `k` mean-lead-times before the day
its task is *planned* to start (the planned day is the mean start in a baseline
build), never before day 0. k = 0 orders just in time on the plan; a large k is
day 0. Material that arrives before its task starts sits on site and costs
money: a deposit financed from the order, storage and handling, and a chance of
damage or theft per month held.

Material values (share of construction cost), the deposit, the storage rate and
the damage rate are my assumptions, not measurements. Random draws are made in
the same order as `house_schedule.simulate`, so a run is comparable with it.
"""
import math
import random
from dataclasses import dataclass

from house_schedule.model import Params, _tasks

# share of construction cost, assumed (windows and cabinets are the long-lead items)
MATERIAL_SHARE = {"concrete": 0.04, "lumber": 0.15, "roofing": 0.03, "windows": 0.06,
                  "hvac": 0.05, "cabinets": 0.07, "siding": 0.04, "shell": 0.20}
DAYS_PER_YEAR = 260.0


@dataclass(frozen=True)
class Carry:
    deposit: float = 0.20          # share of a material's value paid when ordered
    storage_rate: float = 0.12     # per year of its value, handling and storage while on site
    damage_rate: float = 0.20      # per year of its value, expected loss from damage or theft on site


def _draws(t, rng):
    return {k: (rng.gauss(0, 1), rng.gauss(0, 1), rng.expovariate(1.0),
                rng.random(), rng.expovariate(1.0), rng.expovariate(1.0), rng.random())
            for k in t}


def _trigger(t, name):
    """House-schedule's baseline rule: lumber and the shell are ordered when the foundation starts, the rest when the task before starts."""
    return "foundation" if t[name][4] in ("lumber", "shell") else t[name][1][0]


def _build(p, seed, order_at, plan=None):
    """One build. `order_at(task, lead, plan, begin, tasks)` gives the day the order goes in.
    Returns (working days, [(material, placed, arrived, used)], start day of every task)."""
    rng = random.Random(seed)
    t = _tasks(p)
    draws = _draws(t, rng)
    done, begin, crew_free, held = {}, {}, {}, []
    for name, (trade, preds, d, exposed, mat, lead) in t.items():
        zd, zl, eg, uf, ew, er, uw = draws[name]
        ready = max([done[x] for x in preds], default=0.0)
        if trade == "INSP":
            fin = ready + 1.0 + p.insp_wait * ew
            if uf < p.insp_fail:
                fin += p.rework_days + 1.0 + p.insp_wait * er
            done[name], begin[name] = fin, ready
            continue
        mat_at, placed = 0.0, 0.0
        if mat:
            placed = order_at(name, lead, plan, begin, t)
            mat_at = placed + lead * math.exp(p.lead_sigma * zl - p.lead_sigma ** 2 / 2)
        free = crew_free.get(trade, 0.0) if trade else 0.0
        start = max(ready, free, mat_at) + (p.gap_mean * eg if trade else 0.0)
        dur = d * math.exp(p.dur_sigma * zd - p.dur_sigma ** 2 / 2)
        if exposed and p.weather_loss > 0:
            dur *= 1 + p.weather_loss / (1 - p.weather_loss) * 2 * uw
        done[name], begin[name] = start + dur, start
        if trade:
            crew_free[trade] = start + dur
        if mat:
            held.append((mat, placed, mat_at, start))
    return max(done.values()), held, begin


def _baseline_rule(name, lead, plan, begin, t):
    return begin[_trigger(t, name)]


def plan_begins(p=Params(), n=400, seed0=100000):
    """Planned start day of each task: its mean start over n baseline builds (other seeds than the experiments)."""
    tot = {}
    for i in range(n):
        for k, v in _build(p, seed0 + i, _baseline_rule)[2].items():
            tot[k] = tot.get(k, 0.0) + v / n
    return tot


def _lead_rule(k):
    """Order k mean lead times before the planned start of the task that uses the material, not before day 0."""
    def rule(name, lead, plan, begin, t):
        return max(0.0, plan[name] - k * lead)
    return rule


def simulate_ordered(p, seed, k=None, plan=None, carry=Carry(), baseline=False):
    """One build under an ordering policy: k lead times ahead of plan, or the baseline rule.
    Returns (working days, interest % of price, carrying cost % of price)."""
    rule = _baseline_rule if baseline else _lead_rule(k)
    T, held, _ = _build(p, seed, rule, plan)
    interest = 100 * p.rate * (T / DAYS_PER_YEAR) * (p.land_share + 0.5 * p.build_share)
    cost = 0.0
    for mat, placed, arrived, used in held:
        v = MATERIAL_SHARE[mat] * p.build_share * 100          # % of price
        on_site = max(0.0, used - arrived) / DAYS_PER_YEAR      # years sitting on site
        deposit_yrs = max(0.0, arrived - placed) / DAYS_PER_YEAR
        # the rest is paid on delivery: financed from arrival, the deposit from the order. Neither
        # is charged for the interval a just-in-time order would also have been financed.
        fin = p.rate * (carry.deposit * deposit_yrs + on_site)
        cost += v * (fin + (carry.storage_rate + carry.damage_rate) * on_site)
    return T, interest, cost


def run_many_ordered(p, n=2000, seed0=0, **kw):
    out = [simulate_ordered(p, seed0 + i, **kw) for i in range(n)]
    return [o[0] for o in out], [o[1] for o in out], [o[2] for o in out]
