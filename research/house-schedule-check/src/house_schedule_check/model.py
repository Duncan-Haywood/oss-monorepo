"""Monte Carlo schedule of a stylised single-family house build.

Tasks form a precedence graph. Each trade has one crew, so tasks of the same trade run one at a time. A crew
that has been away (it worked elsewhere in between) pays a re-mobilisation gap and may be late. Weather-exposed
tasks lose working days at random. Inspections wait for an inspector and can fail, forcing rework. Long-lead
items arrive a lead time after they are ordered. All numbers are assumptions, not data (see the README).
Durations are working days; one working day = 1.4 calendar days.
"""
import random
from dataclasses import dataclass

CAL = 1.4  # calendar days per working day (5-day week)

# name, trade, mean working days, predecessors, weather-exposed, inspection after, long-lead item needed
TASKS = [
    ("site",       "civil",   5, [],                       True,  False, None),
    ("foundation", "concrete", 10, ["site"],                True,  True,  None),
    ("framing",    "framer",  15, ["foundation"],          True,  True,  "trusses"),
    ("roof",       "roofer",   5, ["framing"],             True,  False, None),
    ("windows",    "framer",   3, ["framing"],             True,  False, "windows"),
    ("mep_rough",  "mep",     12, ["roof", "windows"],     False, True,  None),
    ("insulation", "insulator", 4, ["mep_rough"],           False, True,  None),
    ("drywall",    "drywall", 12, ["insulation"],          False, False, None),
    ("siding",     "siding",   8, ["windows", "roof"],     True,  False, None),
    ("finishes",   "finish",  15, ["drywall"],             False, False, None),
    ("mep_final",  "mep",      5, ["finishes"],            False, True,  None),
    ("exterior",   "civil",    5, ["siding"],              True,  False, None),
    ("final",      "gc",       2, ["mep_final", "exterior"], False, True,  None),
]
LEADS = {"trusses": (15, 30), "windows": (20, 45)}  # working days from order, uniform (assumption)


@dataclass(frozen=True)
class Scenario:
    name: str
    order_early: bool = False      # order long-lead items at day 0 instead of when the predecessor starts
    panel_share: float = 0.0       # share of framing/roof/window work moved to a factory (off the weather, in parallel)
    panel_cut: float = 0.5         # onsite time saved on the moved share (panels are made in parallel with the foundation)
    merge_trades: bool = False     # one multi-skilled crew does framer+roofer+siding (fewer handoffs)
    rain_p: float = 0.15           # chance a weather-exposed working day is lost
    inspect_fail: float = 0.15
    handoff_gap: float = 2.0       # mean working days to re-mobilise a returning crew
    sd_frac: float = 0.25          # sd of task duration as a share of mean


SCENARIOS = [
    Scenario("baseline"),
    Scenario("order long-lead items day 0", order_early=True),
    Scenario("prefab wall/roof panels", panel_share=0.6),
    Scenario("one framing crew (fewer handoffs)", merge_trades=True),
    Scenario("all three", order_early=True, panel_share=0.6, merge_trades=True),
]


def _trade(trade, sc):
    return "framer" if sc.merge_trades and trade in ("roofer", "siding") else trade


def simulate(sc, rng):
    """One build. Returns (working days to finish, balance-weighted working days the drawn loan is outstanding)."""
    lead = {k: rng.uniform(*v) for k, v in LEADS.items()}
    finish, start, crew_free, spend = {}, {}, {}, []
    for name, trade, mean, preds, wx, insp, item in TASKS:
        trade = _trade(trade, sc)
        ready = max([finish[p] for p in preds], default=0.0)
        if item:  # long-lead item
            ordered = 0.0 if sc.order_early else max(start[q] for q in preds)  # baseline: when the last predecessor starts
            ready = max(ready, ordered + lead[item])
        dur = max(1.0, rng.gauss(mean, sc.sd_frac * mean))
        prefab = name in ("framing", "roof", "windows")
        if prefab:
            dur *= 1 - sc.panel_share * sc.panel_cut
        free = crew_free.get(trade)
        t = ready
        if free is not None and free > ready:
            t = free                                  # crew still busy: wait
        elif free is None or ready - free > 1:
            t = ready + rng.expovariate(1 / sc.handoff_gap)  # crew is not on site: pay to bring it in (first call or after leaving)
        if wx:
            p = sc.rain_p * (1 - sc.panel_share * 0.6 if prefab else 1)
            for _ in range(int(round(dur))):
                while rng.random() < p:
                    dur += 1
        end = t + dur
        if insp:
            end += rng.uniform(1, 3)                  # wait for the inspector
            while rng.random() < sc.inspect_fail:
                end += 2 + rng.uniform(1, 3)          # rework, then wait for the reinspection
        crew_free[trade] = end
        start[name] = t
        finish[name] = end
        spend.append((end, mean))
    total = max(finish.values())
    wsum = sum(w for _, w in spend)
    return total, sum(w / wsum * (total - e) for e, w in spend)  # cost drawn as each task finishes


def run(sc, n=4000, seed=1):
    rng = random.Random(seed)
    out = [simulate(sc, rng) for _ in range(n)]
    d = sorted(x[0] for x in out)
    return {"mean": sum(d) / n, "p90": d[int(0.9 * n)], "carry": sum(x[1] for x in out) / n}


def interest_share(carry_days, rate=0.08):
    """Interest on the drawn balance as a share of construction cost, at an annual rate (assumed 8%)."""
    return rate * carry_days * CAL / 365
