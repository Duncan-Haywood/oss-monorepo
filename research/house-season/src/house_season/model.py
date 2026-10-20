"""House-schedule's build model with a weather calendar.

`house_schedule` draws a flat 15% weather loss on exterior tasks. Here the loss
depends on the calendar month a task starts in, and concrete cures slower when
it is cold. Everything else (tasks, crews, handoff gaps, inspections, lead
times, interest) is `house_schedule`'s, and the random draws are made in the
same order, so a run with a flat climate reproduces `house_schedule.simulate`.

The monthly loss fractions below are my assumptions, shaped like a cold-winter
and a mild climate. They are not measurements of any place.
"""
import math
import random
from dataclasses import dataclass

from house_schedule.model import _tasks

MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
CAL_PER_WORK = 7 / 5   # calendar days per working day
MONTH_DAYS = 365 / 12


@dataclass(frozen=True)
class Climate:
    name: str
    loss: tuple        # chance an exterior working day is lost, by month
    cure_extra: tuple  # extra fraction of the 7-day concrete cure, by month


CLIMATES = {
    "flat": Climate("flat 15% (house-schedule)", (0.15,) * 12, (0.0,) * 12),
    "cold": Climate("cold winters (assumed)",
                    (0.40, 0.35, 0.28, 0.18, 0.12, 0.10, 0.08, 0.08, 0.10, 0.15, 0.25, 0.35),
                    (1.0, 0.8, 0.5, 0.2, 0, 0, 0, 0, 0, 0.2, 0.5, 0.8)),
    "mild": Climate("mild (assumed)",
                    (0.18, 0.17, 0.15, 0.12, 0.12, 0.12, 0.10, 0.10, 0.11, 0.12, 0.14, 0.17),
                    (0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1)),
}


def month_at(work_day, start_month):
    """Calendar month index (0 = Jan) after `work_day` working days from the 1st of start_month."""
    return int((start_month * MONTH_DAYS + work_day * CAL_PER_WORK) // MONTH_DAYS) % 12


def simulate_seasonal(p, seed, start_month, climate):
    """One build started on the 1st of `start_month` (0 = Jan). Returns (working days, interest % of price)."""
    rng = random.Random(seed)
    t = _tasks(p)
    draws = {k: (rng.gauss(0, 1), rng.gauss(0, 1), rng.expovariate(1.0),
                 rng.random(), rng.expovariate(1.0), rng.expovariate(1.0), rng.random())
             for k in t}
    done, begin, crew_free = {}, {}, {}
    for name, (trade, preds, d, exposed, mat, lead) in t.items():
        zd, zl, eg, uf, ew, er, uw = draws[name]
        ready = max([done[x] for x in preds], default=0.0)
        if trade == "INSP":
            fin = ready + 1.0 + p.insp_wait * ew
            if uf < p.insp_fail:
                fin += p.rework_days + 1.0 + p.insp_wait * er
            done[name], begin[name] = fin, ready
            continue
        mat_at = 0.0
        if mat:
            trig = "foundation" if mat in ("lumber", "shell") else preds[0]
            placed = 0.0 if p.order_early else begin[trig]
            mat_at = placed + lead * math.exp(p.lead_sigma * zl - p.lead_sigma ** 2 / 2)
        free = crew_free.get(trade, 0.0) if trade else 0.0
        start = max(ready, free, mat_at) + (p.gap_mean * eg if trade else 0.0)
        dur = d * math.exp(p.dur_sigma * zd - p.dur_sigma ** 2 / 2)
        m = month_at(start, start_month)
        if exposed:
            w = climate.loss[m]
            dur *= 1 + w / (1 - w) * 2 * uw
        if name == "cure":
            dur *= 1 + climate.cure_extra[m]
        done[name] = start + dur
        begin[name] = start
        if trade:
            crew_free[trade] = done[name]
    T = max(done.values())
    interest = 100 * p.rate * (T / 260.0) * (p.land_share + 0.5 * p.build_share)
    return T, interest


def run_many_seasonal(p, start_month, climate, n=2000, seed0=0):
    out = [simulate_seasonal(p, seed0 + i, start_month, climate) for i in range(n)]
    return [o[0] for o in out], [o[1] for o in out]
