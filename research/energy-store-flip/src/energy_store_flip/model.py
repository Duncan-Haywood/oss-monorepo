"""Store-minus-heat-pump cost of heat on real German prices, with the sourced capital costs scaled.

Cost model and prices are those of energy-thermal-real, imported unchanged. `m_store` scales the sand store and its
charger capex, `m_hp` the heat pump's capex. Stdlib only.
"""
import copy
import csv
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
for p in ("energy-thermal-real", "energy-thermal-hourly", "energy-thermal-cost", "energy-thermal"):
    sys.path.insert(0, str(ROOT / p / "src"))
import functools  # noqa: E402
import energy_thermal_cost.cost as _cost  # noqa: E402
from energy_thermal_cost import load, store_lcoh, hp_lcoh  # noqa: E402
from energy_thermal_hourly import load_year, cheapest_mean, heating_season_mean  # noqa: E402
from energy_thermal_real import load_prices  # noqa: E402

# The transient sizing does not depend on any cost, so cache it: it dominates the run time otherwise.
_cost.size_for_delivery = functools.lru_cache(maxsize=None)(_cost.size_for_delivery)

YEARS = (2015, 2016, 2017, 2018, 2019)
SCALES = {"house": 1.0e4, "district": 5.0e6}
HP_KEY = {"house": "decentral air-sourced heat pump", "district": "central air-sourced heat pump"}
CASES = [(1, 300, 365, "daily"), (7, 52, 52, "weekly"), (30, 12, 12, "monthly"), (120, 1, 1, "seasonal")]
TD = load("head_2030")
TD_CURRENCY_YEAR = 2025  # every capex row scaled here is in 2025 euros (energy-thermal-cost/data/params.csv, currency_year)
HICP = Path(__file__).resolve().parents[2] / "data" / "hicp_annual.csv"
_PRICES = {}


def hicp(geo="DE"):
    """{year: Eurostat HICP annual average index, 2015 = 100} for `geo` (data/hicp_annual.csv, prc_hicp_aind)."""
    with open(HICP) as f:
        return {int(r["year"]): float(r["hicp_2015_100"]) for r in csv.DictReader(f) if r["geo"] == geo}


def deflator(year, geo="DE", base=TD_CURRENCY_YEAR):
    """Factor that turns `base`-year euros into `year` euros: HICP(year) / HICP(base)."""
    h = hicp(geo)
    return h[year] / h[base]


def diff_real(year, scale, case, geo="DE", m_store=1.0, m_hp=1.0, frac=0.25):
    """`diff` with every capex row deflated from 2025 euros to the price year's euros, so costs and prices share a currency."""
    d = deflator(year, geo)
    return diff(year, scale, case, m_store * d, m_hp * d, frac)


def joint_flip(year, scale, case, lo=0.05, hi=20.0):
    """Common multiplier on all capex (store, charger, heat pump) at which the diff is zero; None if no sign change."""
    f = lambda m: diff(year, scale, case, m, m)  # noqa: E731
    a, b = f(lo), f(hi)
    if a * b > 0:
        return None
    for _ in range(60):
        mid = (lo * hi) ** 0.5
        if f(mid) * a > 0:
            lo = mid
        else:
            hi = mid
    return (lo * hi) ** 0.5


def prices(year):
    """(store price, heat-pump price) in EUR/kWh for `year`: cheapest-quarter mean per cycle is taken per case later."""
    if year not in _PRICES:
        _PRICES[year] = (load_prices(year), heating_season_mean(load_prices(year), load_year(year)))
    return _PRICES[year]


def scaled(m_store=1.0, m_hp=1.0):
    """Copy of the cost table with store+charger capex times m_store and both heat-pump capex rows times m_hp."""
    td = copy.deepcopy(TD)
    for k in ("Sand-store", "Sand-charger"):
        td[k]["investment"] *= m_store
    for k in HP_KEY.values():
        td[k]["investment"] *= m_hp
    return td


def diff(year, scale, case, m_store=1.0, m_hp=1.0, frac=0.25):
    """Store minus heat-pump levelised cost of heat (EUR/kWh) on year's real prices; negative: the store wins."""
    series, hp_p = prices(year)
    td = scaled(m_store, m_hp)
    s, n, w, _ = case
    r = store_lcoh(td, "sand", scale, SCALES[scale], n, s, cheapest_mean(series, w, frac), charge_frac=frac, accounting="first-charge")  # pinned: see energy-thermal-cost README, known gap
    hc, he = hp_lcoh(td, scale, SCALES[scale], hp_p)
    return r["total"] - (hc + he)


def flip_multiplier(year, scale, case, which="store", lo=0.05, hi=20.0):
    """Capex multiplier on the store (`which`='store') or the heat pump ('hp') at which the diff is zero, other cost at 1.

    Returns None when the sign does not change on [lo, hi]. Bisection on a monotone function (the store's cost rises with
    m_store, the pump's with m_hp).
    """
    f = (lambda m: diff(year, scale, case, m_store=m)) if which == "store" else (lambda m: diff(year, scale, case, m_hp=m))
    a, b = f(lo), f(hi)
    if a * b > 0:
        return None
    for _ in range(60):
        mid = (lo * hi) ** 0.5
        if f(mid) * a > 0:
            lo = mid
        else:
            hi = mid
    return (lo * hi) ** 0.5


def win_share(year, scale, case, half_width, n=2000, seed=20261023, scale_all=1.0):
    """Share of draws in which the store wins, m_store and m_hp independent uniform on [1-h, 1+h] (assumed range).

    `scale_all` multiplies both draws (pass `deflator(year)` for the one-currency basis of section E).
    """
    rng = random.Random(seed)
    wins = 0
    for _ in range(n):
        a, b = rng.uniform(1 - half_width, 1 + half_width), rng.uniform(1 - half_width, 1 + half_width)
        wins += diff(year, scale, case, a * scale_all, b * scale_all) < 0
    return wins / n


def variance_split(scale, case, half_width, n=500, seed=20261023):
    """(between-year variance, within-year variance from cost draws, mean diff) of the diff over the five price years."""
    rng = random.Random(seed)
    draws = [(rng.uniform(1 - half_width, 1 + half_width), rng.uniform(1 - half_width, 1 + half_width)) for _ in range(n)]
    per = {y: [diff(y, scale, case, a, b) for a, b in draws] for y in YEARS}
    means = {y: sum(v) / n for y, v in per.items()}
    grand = sum(means.values()) / len(YEARS)
    between = sum((m - grand) ** 2 for m in means.values()) / len(YEARS)
    within = sum(sum((x - means[y]) ** 2 for x in per[y]) / n for y in YEARS) / len(YEARS)
    return between, within, grand
