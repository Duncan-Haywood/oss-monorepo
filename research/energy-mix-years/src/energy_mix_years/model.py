"""energy-mix-years: the sourced-cost German least-cost mix (``energy-mix-sourced``) over five weather years.

Reuses that project's model and cost table unchanged; only the hourly input changes (OPSD / ENTSO-E,
2015 to 2019, ``data/de<year>.csv``).
"""
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "energy-mix-sourced" / "src"))
from energy_mix_sourced import model as base  # noqa: E402

YEARS = (2015, 2016, 2017, 2018, 2019)


def load_year(year, hours=None):
    d = pd.read_csv(HERE / "data" / f"de{year}.csv", parse_dates=["utc"]).set_index("utc")
    d.index = d.index.tz_localize(None)
    return d if hours is None else d.iloc[:hours]


def run(year, basis="head_2030", hours=None, **kw):
    d = load_year(year, hours)
    n, _ = base.build(d, base.load_params(basis), **kw)
    base.solve(n)
    return n, d, base.summary(n, d)
