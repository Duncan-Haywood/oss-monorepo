"""A full year of 15-minute load for a set of simulated US commercial buildings.

Source: NREL, "End-Use Load Profiles for the U.S. Building Stock", ComStock
AMY2018 release 1 (2021), Open Energy Data Initiative,
https://data.openei.org/submissions/4520 (CC BY 4.0). These are building
energy simulations (EnergyPlus, actual 2018 weather), not meters: realistic
load shapes and full calendar years, which a ratchet needs, but no real
site's bill.

Selection rule (fixed, so anyone gets the same buildings): for each state in
STATES and each building type in TYPES, the lowest bldg_id whose floor area
is between 20,000 and 200,000 sq ft. Electricity is
`out.electricity.total.energy_consumption` (kWh per 15 minutes, timestamp at
the interval's end, standard time); kW = 4 x kWh, labelled by the interval's
start so each calendar month holds its own readings.

Writes check/data/comstock_year.json: [{building, type, state, sqft, walls[], kw[]}].
Usage (needs pyarrow; downloads ~85 MB of metadata plus ~3 MB per building):

    python3 check/fetch_comstock.py
"""
import json
import os
import sys
import urllib.request
from datetime import timedelta

import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = ("https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/"
        "end-use-load-profiles-for-us-building-stock/2021/comstock_amy2018_release_1")
STATES = ["TX", "CO"]
TYPES = ["Warehouse", "RetailStandalone", "MediumOffice", "PrimarySchool", "Outpatient", "SmallHotel"]


def get(url, path):
    if not os.path.exists(path):
        urllib.request.urlretrieve(url, path)
    return path


def main():
    cache = os.path.join(HERE, "data", "comstock_cache")
    os.makedirs(cache, exist_ok=True)
    meta = pq.read_table(get(f"{BASE}/metadata/metadata.parquet", os.path.join(cache, "metadata.parquet")),
                         columns=["bldg_id", "in.building_type", "in.sqft", "in.state_abbreviation"]).to_pylist()
    out = []
    for st in STATES:
        for ty in TYPES:
            rows = sorted((r for r in meta if r["in.state_abbreviation"] == st and r["in.building_type"] == ty
                           and 20000 <= r["in.sqft"] <= 200000), key=lambda r: r["bldg_id"])
            if not rows:
                continue
            r = rows[0]
            bid = r["bldg_id"]
            url = f"{BASE}/timeseries_individual_buildings/by_state/upgrade=0/state={st}/{bid}-0.parquet"
            t = pq.read_table(get(url, os.path.join(cache, f"{bid}.parquet")),
                              columns=["timestamp", "out.electricity.total.energy_consumption"]).to_pydict()
            walls, kw = [], []
            for ts, kwh in zip(t["timestamp"], t["out.electricity.total.energy_consumption"]):
                start = ts - timedelta(minutes=15)
                if start.year != 2018:
                    continue
                walls.append(start.strftime("%Y-%m-%dT%H:%M"))
                kw.append(round(4 * kwh, 4))
            out.append(dict(building=f"{st}-{ty}-{bid}", type=ty, state=st, sqft=r["in.sqft"], walls=walls, kw=kw))
            print(out[-1]["building"], len(kw), "readings, peak", max(kw), "kW", file=sys.stderr)
    with open(os.path.join(HERE, "data", "comstock_year.json"), "w") as f:
        json.dump(out, f)


if __name__ == "__main__":
    main()
