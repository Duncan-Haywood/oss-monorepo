"""Monthly kWh and free-nights kWh for a sample of simulated Texas homes.

Source: NREL End-Use Load Profiles, ResStock AMY2018 release 2 (2018 actual
weather), Open Energy Data Initiative bucket `oedi-data-lake`, CC BY 4.0.
These are building-physics simulations calibrated to the housing stock and to
utility load data, not meter readings: a realistic spread of Texas homes, not
anyone's bill.

Sample (fixed before running): occupied homes without rooftop PV in five large
counties in the Oncor and CenterPoint delivery areas (Harris, Fort Bend,
Dallas, Tarrant, Collin), 200 drawn with numpy seed 2026.

Writes resstock_tx_usage.json: per home its building id, county, building
type, 12 monthly kWh and 12 monthly kWh between 21:00 and 06:00 (every day).
15-minute timestamps mark the END of each interval, so each reading is moved
back 15 minutes before it is given a month and an hour.

Run: python3 -I check/resstock_tx.py (needs pandas, pyarrow, numpy; downloads
about 15 MB of metadata and about 1 GB of timeseries, one file at a time).
"""
import json
import os
import sys
import tempfile
import urllib.request

import numpy as np
import pandas as pd

ROOT = "https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2024/resstock_amy2018_release_2/"
META = ROOT + "metadata_and_annual_results/by_state/state=TX/parquet/TX_baseline_metadata_and_annual_results.parquet"
TS = ROOT + "timeseries_individual_buildings/by_state/upgrade=0/state=TX/{}-0.parquet"
COUNTIES = ["Harris County", "Fort Bend County", "Dallas County", "Tarrant County", "Collin County"]
N = 200
SEED = 2026
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resstock_tx_usage.json")


def fetch(url, path):
    with urllib.request.urlopen(url, timeout=180) as r, open(path, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)


def main():
    tmp = tempfile.mkdtemp()
    mp = os.path.join(tmp, "meta.parquet")
    fetch(META, mp)
    m = pd.read_parquet(mp)
    pool = m[m["in.county_name"].isin(COUNTIES)]
    if "in.vacancy_status" in pool:
        pool = pool[pool["in.vacancy_status"] == "Occupied"]
    if "in.has_pv" in pool:
        pool = pool[pool["in.has_pv"] != "Yes"]
    ids = sorted(pool.index.tolist())
    rng = np.random.default_rng(SEED)
    pick = sorted(rng.choice(ids, size=N, replace=False).tolist())
    homes = []
    for i, b in enumerate(pick):
        p = os.path.join(tmp, "b.parquet")
        fetch(TS.format(b), p)
        t = pd.read_parquet(p, columns=["timestamp", "out.electricity.total.energy_consumption"])
        os.remove(p)
        ts = pd.to_datetime(t["timestamp"]) - pd.Timedelta(minutes=15)
        kwh = t["out.electricity.total.energy_consumption"].to_numpy()
        month = ts.dt.month.to_numpy()
        hour = ts.dt.hour.to_numpy()
        night = (hour >= 21) | (hour < 6)
        months = [round(float(kwh[month == k].sum()), 1) for k in range(1, 13)]
        nights = [round(float(kwh[(month == k) & night].sum()), 1) for k in range(1, 13)]
        row = pool.loc[b]
        homes.append({
            "bldg_id": int(b),
            "county": row["in.county_name"],
            "type": row["in.geometry_building_type_recs"],
            "months": months,
            "nights": nights,
        })
        print(f"{i + 1}/{N} {b} {sum(months):.0f} kWh", file=sys.stderr)
    out = {
        "source": "NREL ResStock AMY2018 release 2 (oedi-data-lake), CC BY 4.0; simulated homes, not meters",
        "counties": COUNTIES,
        "pool": len(ids),
        "seed": SEED,
        "homes": homes,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    main()
