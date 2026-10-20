"""Derive data/de2019.csv (hourly, Germany, 2019) from the OPSD time-series package.

Source: Open Power System Data, time_series 2020-10-06, 60-min single-index CSV
(https://data.open-power-system-data.org/time_series/2020-10-06/), ENTSO-E
Transparency Platform data, licence CC BY 4.0. Columns used: DE_load_actual_entsoe_transparency,
DE_{solar,wind_onshore}_generation_actual and _capacity.  Capacity factor = actual generation /
installed capacity (hour by hour).  Usage: python prepare.py path/to/time_series_60min_singleindex.csv
"""
import sys
import pandas as pd

cols = ["utc_timestamp", "DE_load_actual_entsoe_transparency", "DE_solar_generation_actual",
        "DE_solar_capacity", "DE_wind_onshore_generation_actual", "DE_wind_onshore_capacity"]
d = pd.read_csv(sys.argv[1], usecols=cols)
d = d[d.utc_timestamp.str.startswith("2019")].reset_index(drop=True)
d[cols[1:]] = d[cols[1:]].interpolate(limit_direction="both")
out = pd.DataFrame({
    "utc": d.utc_timestamp,
    "load_mw": d[cols[1]].round(0),
    "solar_cf": (d[cols[2]] / d[cols[3]]).clip(0, 1).round(4),
    "wind_cf": (d[cols[4]] / d[cols[5]]).clip(0, 1).round(4),
})
assert len(out) == 8760, len(out)
out.to_csv("de2019.csv", index=False)
print(out.describe())
