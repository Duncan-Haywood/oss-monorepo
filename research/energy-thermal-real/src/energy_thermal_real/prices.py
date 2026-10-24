"""Real German day-ahead prices (OPSD / ENTSO-E) aligned to the hourly rows of ../energy-mix-years, and helpers."""
import csv
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"


def load_prices(year):
    """EUR/kWh for each of the 8,760 hours of `year` (day-ahead, EUR/MWh in the file, divided by 1000)."""
    with open(DATA / f"price{year}.csv") as f:
        return [float(r["price_eur_mwh"]) / 1000.0 for r in csv.DictReader(f)]


def load_utc(year):
    with open(DATA / f"price{year}.csv") as f:
        return [r["utc"] for r in csv.DictReader(f)]


def load_capacity(year):
    """(solar GW, onshore wind GW), the year's mean installed capacity in the OPSD package."""
    with open(DATA / "capacity.csv") as f:
        for r in csv.DictReader(f):
            if int(r["year"]) == year:
                return float(r["solar_gw"]), float(r["wind_onshore_gw"])
    raise KeyError(year)


def pearson(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    saa = sum((x - ma) ** 2 for x in a)
    sbb = sum((y - mb) ** 2 for y in b)
    return sab / (saa * sbb) ** 0.5


def negative_hours(prices):
    return sum(1 for p in prices if p < 0)


def break_even_price(f, lo=-0.2, hi=0.5):
    """Price p at which f(p) = 0 for f increasing in p (bisection)."""
    for _ in range(60):
        mid = (lo + hi) / 2
        if f(mid) > 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2
