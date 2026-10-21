"""Download sourced storage costs and write data/techdata.csv and data/atb.csv (both committed).

* PyPSA technology-data at a pinned commit, cost years 2020, 2030 and 2050: the rows for the five
  technologies the model uses (battery, vanadium flow, pumped hydro, adiabatic compressed air in a
  cavern, hydrogen via electrolyser, underground store and fuel cell), with the file's own source column.
* NREL Annual Technology Baseline 2024 (v4.0.0, from the OEDI data lake, CC BY 4.0): utility-scale battery
  overnight capital cost by duration and scenario, and pumped-storage overnight capital cost by site class.
Usage: python data/fetch_params.py   (needs network; streams the 100 MB ATB file, about 10 s)
"""
import csv
import io
import urllib.request
from pathlib import Path

REV = "65244b4c560112ec4ec73f14baf5f220e15d3ef8"
TD = "https://raw.githubusercontent.com/PyPSA/technology-data/{rev}/outputs/costs_{year}.csv"
ATB = "https://oedi-data-lake.s3.amazonaws.com/ATB/electricity/csv/2024/v4.0.0/ATBe.csv"
TECHS = ["battery storage", "battery inverter", "Vanadium-Redox-Flow-bicharger", "Vanadium-Redox-Flow-store",
         "Pumped-Storage-Hydro-bicharger", "Pumped-Storage-Hydro-store",
         "Compressed-Air-Adiabatic-bicharger", "Compressed-Air-Adiabatic-store",
         "electrolysis", "fuel cell", "hydrogen storage underground"]
KEEP = {"investment", "FOM", "lifetime", "efficiency"}


def techdata(here):
    out = []
    for year in (2020, 2030, 2050):
        txt = urllib.request.urlopen(TD.format(rev=REV, year=year), timeout=60).read().decode()
        for r in csv.DictReader(io.StringIO(txt)):
            if r["technology"] in TECHS and r["parameter"] in KEEP:
                out.append([REV[:8], year, r["technology"], r["parameter"], r["value"], r["unit"],
                            r["currency_year"], r["source"].split(",")[0][:40]])
    with open(here / "techdata.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["revision", "cost_year", "technology", "parameter", "value", "unit", "currency_year", "primary_source"])
        w.writerows(out)
    return len(out)


def atb(here):
    out = []
    resp = urllib.request.urlopen(ATB, timeout=120)
    for r in csv.DictReader(io.TextIOWrapper(resp, encoding="utf-8")):
        t, p, v = r["technology"], r["core_metric_parameter"], r["core_metric_variable"]
        if p not in ("OCC", "Fixed O&M") or v not in ("2024", "2030") or r["core_metric_case"] != "Market":
            continue
        if t == "Utility-Scale Battery Storage" or (t == "Pumped Storage Hydropower" and r["techdetail"].startswith("NatlClass")):
            out.append([t, r["techdetail"], r["scenario"], p, v, r["units"], r["value"]])
    with open(here / "atb.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["technology", "techdetail", "scenario", "parameter", "year", "units", "value"])
        w.writerows(out)
    return len(out)


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    print(techdata(here), "technology-data rows;", atb(here), "ATB rows")
