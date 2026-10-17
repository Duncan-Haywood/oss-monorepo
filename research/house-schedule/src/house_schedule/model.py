"""Discrete-event model of building one house, in working days.

Every duration, probability and lead time here is an assumption of mine, not a
measurement. The model is for comparing levers against each other, not for
predicting how long a real house takes.

A task has: a trade (one crew per trade), predecessors, a nominal duration,
whether weather can stop it, and optionally a material with a lead time. A task
starts at max(predecessors done, crew free, material arrived) plus a random
handoff gap (the crew arriving late). Inspections are tasks with a wait and a
chance of failure that costs rework and a second wait.
"""
import math
import random
from dataclasses import dataclass, field, replace

# name: (trade, preds, days, weather_exposed, material, lead_days)
TASKS = {
    "site_prep":       ("site",     [],                                  5, True,  None,       0),
    "foundation":      ("concrete", ["site_prep"],                       8, True,  "concrete", 3),
    "cure":            (None,       ["foundation"],                      7, False, None,       0),
    "insp_found":      ("INSP",     ["cure"],                            0, False, None,       0),
    "framing":         ("framer",   ["insp_found"],                     15, True,  "lumber",   10),
    "roof":            ("roofer",   ["framing"],                         5, True,  "roofing",  10),
    "windows":         ("framer",   ["roof"],                            3, True,  "windows",  30),
    "rough_plumb":     ("plumber",  ["windows"],                         5, False, None,       0),
    "rough_elec":      ("electric", ["rough_plumb"],                     5, False, None,       0),
    "rough_hvac":      ("hvac",     ["rough_elec"],                      5, False, "hvac",     15),
    "insp_rough":      ("INSP",     ["rough_hvac"],                      0, False, None,       0),
    "insulation":      ("insul",    ["insp_rough"],                      3, False, None,       0),
    "insp_insul":      ("INSP",     ["insulation"],                      0, False, None,       0),
    "drywall":         ("drywall",  ["insp_insul"],                     10, False, None,       0),
    "paint":           ("painter",  ["drywall"],                         6, False, None,       0),
    "cabinets":        ("finish",   ["paint"],                           8, False, "cabinets", 35),
    "flooring":        ("floor",    ["cabinets"],                        5, False, None,       0),
    "siding":          ("siding",   ["windows"],                         8, True,  "siding",   10),
    "finish_mep":      ("plumber",  ["flooring"],                        6, False, None,       0),
    "insp_final":      ("INSP",     ["finish_mep", "siding"],            0, False, None,       0),
}


@dataclass(frozen=True)
class Params:
    gap_mean: float = 2.0         # mean days a crew arrives late (exponential)
    weather_loss: float = 0.15    # chance an exposed working day is lost
    dur_sigma: float = 0.20       # lognormal sigma on task durations
    lead_sigma: float = 0.30      # lognormal sigma on lead times
    insp_wait: float = 3.0        # mean days to get an inspector (1 + exponential)
    insp_fail: float = 0.15       # chance an inspection fails
    rework_days: float = 3.0      # days to fix, then wait for reinspection
    parallel_rough: bool = False  # run plumbing, electrical, hvac rough-in together
    order_early: bool = False     # order every material at day 0
    prefab_shell: bool = False    # factory wall and roof panels, craned in
    prefab_lead: float = 25.0     # factory lead time for the shell, days
    prefab_frame_days: float = 5.0   # on-site days to set the shell (was framing 15 + roof 5)
    rate: float = 0.08            # annual interest rate on the money drawn
    land_share: float = 0.137     # NAHB 2024 lot share of price
    build_share: float = 0.644    # NAHB 2024 construction share of price
    notes: str = field(default="", compare=False)


def _tasks(p):
    t = {k: list(v) for k, v in TASKS.items()}
    if p.parallel_rough:
        t["rough_elec"][1] = ["windows"]
        t["rough_hvac"][1] = ["windows"]
        t["insp_rough"][1] = ["rough_plumb", "rough_elec", "rough_hvac"]
    if p.prefab_shell:
        # roof folds into the shell; framing becomes the set of the panels
        t["framing"][2] = p.prefab_frame_days
        t["framing"][4:6] = ["shell", p.prefab_lead]
        t["roof"][2] = 0
        t["roof"][4:6] = [None, 0]
    return t


def critical_path(p=Params()):
    """Longest path with no randomness, no gaps, no weather, no failures,
    inspections after the 1-day minimum wait, materials ordered at day 0."""
    t = _tasks(p)
    done = {}
    for name in t:  # TASKS is in topological order
        trade, preds, d, _, mat, lead = t[name]
        wait = 1.0 if trade == "INSP" else 0.0
        ready = max([done[x] for x in preds], default=0.0)
        done[name] = max(ready, lead if mat else 0.0) + d + wait
    return max(done.values())


def simulate(p, seed):
    """One build. Returns (working days to finish, interest as % of price)."""
    rng = random.Random(seed)
    t = _tasks(p)
    # draw all random numbers per task up front so levers share noise (common random numbers)
    draws = {k: (rng.gauss(0, 1), rng.gauss(0, 1), rng.expovariate(1.0),
                 rng.random(), rng.expovariate(1.0), rng.expovariate(1.0), rng.random())
             for k in t}
    done, begin, crew_free = {}, {}, {}
    for name, (trade, preds, d, exposed, mat, lead) in t.items():
        zd, zl, eg, uf, ew, er, uw = draws[name]
        ready = max([done[x] for x in preds], default=0.0)
        if trade == "INSP":
            wait = 1.0 + p.insp_wait * ew
            fin = ready + wait
            if uf < p.insp_fail:
                fin += p.rework_days + 1.0 + p.insp_wait * er
            done[name] = fin
            begin[name] = ready
            continue
        mat_at = 0.0
        if mat:
            # an order goes in when the trigger task starts: day 0 if ordering early,
            # else when the task's first predecessor starts (lumber and the shell:
            # when the foundation starts)
            trig = "foundation" if mat in ("lumber", "shell") else preds[0]
            placed = 0.0 if p.order_early else begin[trig]
            mat_at = placed + lead * math.exp(p.lead_sigma * zl - p.lead_sigma ** 2 / 2)
        free = crew_free.get(trade, 0.0) if trade else 0.0
        start = max(ready, free, mat_at) + (p.gap_mean * eg if trade else 0.0)
        dur = d * math.exp(p.dur_sigma * zd - p.dur_sigma ** 2 / 2)
        if exposed and p.weather_loss > 0:
            # expected stretch d/(1-w), spread uniformly from none to twice the mean extra
            dur *= 1 + p.weather_loss / (1 - p.weather_loss) * 2 * uw
        fin = start + dur
        done[name] = fin
        begin[name] = start
        if trade:
            crew_free[trade] = fin
    T = max(done.values())
    # money: land from day 0, construction drawn roughly linearly over the build
    years = T / 260.0
    interest = 100 * p.rate * years * (p.land_share + 0.5 * p.build_share)
    return T, interest


def run_many(p, n=2000, seed0=0):
    out = [simulate(p, seed0 + i) for i in range(n)]
    return [o[0] for o in out], [o[1] for o in out]
