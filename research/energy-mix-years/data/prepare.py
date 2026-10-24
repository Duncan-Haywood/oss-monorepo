"""Derive data/de<year>.csv (hourly, Germany, 2015-2019) from the OPSD time-series package.

Source: Open Power System Data, time_series 2020-10-06, 60-min single-index CSV
(https://data.open-power-system-data.org/time_series/2020-10-06/), ENTSO-E Transparency Platform
data, licence CC BY 4.0. Same columns and method as ../../energy-mix/data/prepare.py: capacity factor =
actual generation / installed capacity, gaps interpolated. 29 February is dropped in 2016 so every year
has 8,760 hours.  Usage: python prepare.py path/to/time_series_60min_singleindex.csv
"""
import sys
import pandas as pd

cols = ["utc_timestamp", "DE_load_actual_entsoe_transparency", "DE_solar_generation_actual",
        "DE_solar_capacity", "DE_wind_onshore_generation_actual", "DE_wind_onshore_capacity"]
raw = pd.read_csv(sys.argv[1], usecols=cols)
for y in range(2015, 2020):
    d = raw[raw.utc_timestamp.str.startswith(str(y))].copy()
    d = d[~d.utc_timestamp.str.startswith(f"{y}-02-29")].reset_index(drop=True)
    d[cols[1:]] = d[cols[1:]].interpolate(limit_direction="both")
    out = pd.DataFrame({
        "utc": d.utc_timestamp,
        "load_mw": d[cols[1]].round(0),
        "solar_cf": (d[cols[2]] / d[cols[3]]).clip(0, 1).round(4),
        "wind_cf": (d[cols[4]] / d[cols[5]]).clip(0, 1).round(4),
    })
    assert len(out) == 8760, (y, len(out))
    out.to_csv(f"de{y}.csv", index=False)
    print(y, out.load_mw.sum() / 1e6, "TWh", out.solar_cf.mean().round(4), out.wind_cf.mean().round(4))
