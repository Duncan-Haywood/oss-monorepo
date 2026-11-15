"""Builds data/aep-2017-day-by-hour.csv from research/infra-dcopf/data/AEP_hourly.csv.

One row per day of 2017, one column per hour ending (he01..he24), load in MW.
The extract stamps each reading with the hour it ends (PJM's convention): the
file lists a day as 01:00 ... 23:00 and then the next date's 00:00, which is
that day's hour ending 24. So 2017-03-05 00:00 is he24 of 2017-03-04, and
2018-01-01 00:00 is he24 of 2017-12-31.
The extract skips the 03:00 stamp on 2017-03-12 (spring forward): that cell is left blank.
It repeats 02:00 on 2017-11-05 (fall back): the first of the two readings is kept.
Run from the repository root: python3 ventures/robust-pca/eval/extract_example.py
"""
import csv
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "research/infra-dcopf/data/AEP_hourly.csv"
OUT = ROOT / "ventures/robust-pca/data/aep-2017-day-by-hour.csv"

cells = {}
with SRC.open() as f:
    for row in csv.DictReader(f):
        ts = row["Datetime"]
        day, hour = ts[:10], int(ts[11:13])
        if hour == 0:  # hour ending 24 of the day before
            day, hour = str(date.fromisoformat(day) - timedelta(days=1)), 24
        if not day.startswith("2017-"):
            continue
        cells.setdefault((day, hour), row["AEP_MW"])  # keep the first of a repeated hour

days = sorted({d for d, _ in cells})
with OUT.open("w", newline="") as f:
    f.write("date," + ",".join(f"he{h:02d}" for h in range(1, 25)) + "\n")
    for d in days:
        vals = []
        for h in range(1, 25):
            v = cells.get((d, h))
            vals.append("" if v is None else str(int(float(v))))
        f.write(d + "," + ",".join(vals) + "\n")
print(len(days), "days written to", OUT.relative_to(ROOT))
