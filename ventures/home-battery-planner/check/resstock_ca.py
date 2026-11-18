"""Forty California homes with rooftop solar, from NREL's ResStock (AMY2018 release 2, CC BY 4.0), written as
Green Button-style hourly CSVs so the check runs them through the tool's own reader.

python3 -I check/resstock_ca.py OUTDIR   (pandas, pyarrow; downloads ~19 MB of metadata and ~40 small files)

Draw (fixed before any result was seen): occupied single-family detached homes with PV of 5, 7 or 9 kWDC,
sorted by bldg_id, every k-th one so that 40 are taken. Net kWh = total electricity use + PV (ResStock
reports PV as negative consumption). ResStock timestamps are period-ending in local standard time; they
are moved to interval starts and to the wall clock (US daylight saving, 2018 rules) because rate plans
are written on the wall clock. These are building simulations on real 2018 weather, not meters.
"""
import os, sys, urllib.request
import pandas as pd

ROOT = "https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2024/resstock_amy2018_release_2/"
META = ROOT + "metadata_and_annual_results/by_state/state=CA/parquet/CA_baseline_metadata_and_annual_results.parquet"
TS = ROOT + "timeseries_individual_buildings/by_state/upgrade=0/state=CA/{}-0.parquet"
N = 40

def get(url, path):
    if not os.path.exists(path):
        urllib.request.urlretrieve(url, path)
    return path

def main(out):
    os.makedirs(out, exist_ok=True)
    m = pd.read_parquet(get(META, os.path.join(out, "meta.parquet")))
    pool = m[(m["in.has_pv"] == "Yes") & (m["in.geometry_building_type_recs"] == "Single-Family Detached")
             & (m["in.vacancy_status"] == "Occupied") & m["in.pv_system_size"].isin(["5.0 kWDC", "7.0 kWDC", "9.0 kWDC"])]
    pool = pool.reset_index().sort_values("bldg_id")
    step = max(1, len(pool) // N)
    pick = pool.iloc[::step].head(N)
    rows = []
    for _, b in pick.iterrows():
        bid = int(b["bldg_id"])
        t = pd.read_parquet(get(TS.format(bid), os.path.join(out, f"{bid}.parquet")),
                            columns=["timestamp", "out.electricity.total.energy_consumption", "out.electricity.pv.energy_consumption"])
        start = pd.to_datetime(t["timestamp"]) - pd.Timedelta(minutes=15)
        dst = (start >= "2018-03-11 02:00") & (start < "2018-11-04 01:00")
        wall = start + pd.to_timedelta(dst.astype(int), unit="h")
        net = t["out.electricity.total.energy_consumption"] + t["out.electricity.pv.energy_consumption"]
        df = pd.DataFrame({"t": wall, "kwh": net}).set_index("t").resample("h").sum()
        with open(os.path.join(out, f"ca-{bid}.csv"), "w") as f:
            f.write("TYPE,DATE,START TIME,END TIME,USAGE (kWh),NOTES\n")
            for ts, v in df["kwh"].items():
                f.write(f"Electric usage,{ts:%Y-%m-%d},{ts:%H}:00,{ts:%H}:59,{v:.3f},\n")
        rows.append((bid, b["in.county_name"], b["in.pv_system_size"], round(t["out.electricity.total.energy_consumption"].sum()), round(-t["out.electricity.pv.energy_consumption"].sum())))
    pd.DataFrame(rows, columns=["bldg_id", "county", "pv", "use_kwh", "pv_kwh"]).to_csv(os.path.join(out, "homes.csv"), index=False)
    print(f"{len(pool)} homes in the pool, {len(rows)} written to {out}")

if __name__ == "__main__":
    main(sys.argv[1])
