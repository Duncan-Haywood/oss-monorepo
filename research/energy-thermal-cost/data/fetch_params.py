"""Download the PyPSA technology-data cost tables at pinned revisions and write data/params.csv.

Only the heat-store, heat-pump and resistive-heater rows are kept, with the file's own source
column, so every cost in the project traces to a revision, a row and a primary source.
Usage: python data/fetch_params.py   (needs network; params.csv is committed)
"""
import csv
import io
import urllib.request
from pathlib import Path

RAW = "https://raw.githubusercontent.com/PyPSA/technology-data/{rev}/outputs/costs_{year}.csv"
# basis name -> (git revision, cost year). v0.9.2 is a release tag; the second pins a commit on master.
BASES = {
    "v092_2030": ("v0.9.2", 2030),
    "head_2030": ("65244b4c560112ec4ec73f14baf5f220e15d3ef8", 2030),
}
TECHS = ["Sand-store", "Sand-charger", "decentral water tank storage", "decentral air-sourced heat pump",
         "decentral ground-sourced heat pump", "decentral resistive heater", "central air-sourced heat pump",
         "central resistive heater", "central water tank storage", "central ground-sourced heat pump"]
KEEP = {"investment", "FOM", "lifetime", "efficiency", "discount rate"}


def main():
    out = []
    for basis, (rev, year) in BASES.items():
        txt = urllib.request.urlopen(RAW.format(rev=rev, year=year), timeout=60).read().decode()
        for r in csv.DictReader(io.StringIO(txt)):
            if r["technology"] in TECHS and r["parameter"] in KEEP:
                out.append([basis, rev, year, r["technology"], r["parameter"], r["value"], r["unit"],
                            r["currency_year"], r["source"].split(",")[0][:60]])
    here = Path(__file__).resolve().parent
    with open(here / "params.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["basis", "revision", "cost_year", "technology", "parameter", "value", "unit",
                    "currency_year", "primary_source"])
        w.writerows(out)
    print(len(out), "rows")


if __name__ == "__main__":
    main()
