"""Derive data/price<year>.csv (hourly day-ahead price, EUR/MWh, 2015-2019) and data/capacity.csv from OPSD.

Source: Open Power System Data, time_series 2020-10-06, 60-min single-index CSV
(https://data.open-power-system-data.org/time_series/2020-10-06/), ENTSO-E Transparency Platform data, CC BY 4.0.
Germany shared one bidding zone with Austria (and Luxembourg) until 30 Sept 2018, so AT_price_day_ahead is used
up to that date and DE_LU_price_day_ahead after it (the package lists them as separate columns; they overlap on
only 47 hours).
Gaps (51 hours in 2015, 2 or 3 in each other year) are filled by linear interpolation; 29 Feb 2016 is dropped, as in
../../energy-mix-years/data/prepare.py, so every year has 8,760 hours aligned to de<year>.csv.
Usage: python prepare.py path/to/time_series_60min_singleindex.csv
"""
import csv
import sys

COLS = ["utc_timestamp", "AT_price_day_ahead", "DE_LU_price_day_ahead", "DE_solar_capacity", "DE_wind_onshore_capacity"]
CUT = "2018-09-30T22:00:00Z"   # the zone split took effect on 2018-10-01 00:00 CET/CEST = 22:00 UTC on 30 Sept


def interp(v):
    idx = [i for i, x in enumerate(v) if x is not None]
    out = list(v)
    for i, x in enumerate(v):
        if x is None:
            lo = max([j for j in idx if j < i], default=None)
            hi = min([j for j in idx if j > i], default=None)
            if lo is None:
                out[i] = v[hi]
            elif hi is None:
                out[i] = v[lo]
            else:
                out[i] = v[lo] + (v[hi] - v[lo]) * (i - lo) / (hi - lo)
    return out


def num(s):
    return float(s) if s != "" else None


rows = {y: [] for y in range(2015, 2020)}
with open(sys.argv[1]) as f:
    for r in csv.DictReader(f):
        y = int(r["utc_timestamp"][:4])
        if y in rows and not r["utc_timestamp"].startswith(f"{y}-02-29"):
            ts = r["utc_timestamp"]
            p = num(r["AT_price_day_ahead"]) if ts < CUT else num(r["DE_LU_price_day_ahead"])
            rows[y].append((ts, p, num(r["DE_solar_capacity"]), num(r["DE_wind_onshore_capacity"])))
cap = []
for y, d in rows.items():
    assert len(d) == 8760, (y, len(d))
    missing = sum(x[1] is None for x in d)
    price = interp([x[1] for x in d])
    with open(f"price{y}.csv", "w", newline="") as o:
        w = csv.writer(o)
        w.writerow(["utc", "price_eur_mwh"])
        for x, p in zip(d, price):
            w.writerow([x[0].replace("Z", "") + "Z", round(p, 2)])
    sc = [x[2] for x in d if x[2] is not None]
    wc = [x[3] for x in d if x[3] is not None]
    cap.append((y, round(sum(sc) / len(sc) / 1e3, 1), round(sum(wc) / len(wc) / 1e3, 1)))
    print(y, "filled", missing, "hours; mean price", round(sum(price) / len(price), 2))
with open("capacity.csv", "w", newline="") as o:
    w = csv.writer(o)
    w.writerow(["year", "solar_gw", "wind_onshore_gw"])
    w.writerows(cap)
