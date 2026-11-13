"""Monthly 15-minute load series for five real buildings, from Open Power System Data.

Source: Open Power System Data, "Data Package Household Data", version
2020-04-15, https://doi.org/10.25832/household_data/2020-04-15 (CC BY 4.0).
Measured by ISC Konstanz in the CoSSMic project: three small industrial
sites and two public buildings in Konstanz, Germany. Each `*_grid_import`
column is a cumulative kWh meter reading of energy drawn from the grid (net
of any on-site PV), so kW per interval = 4 x the 15-minute difference.

Writes check/data/opsd_months.json: one entry per building-month whose grid
meter has every 15-minute reading (local wall-clock time, CET/CEST, as a
utility bills it), with no negative step. Usage:

    curl -sS -o h15.csv https://data.open-power-system-data.org/household_data/2020-04-15/household_data_15min_singleindex.csv
    python3 check/fetch_opsd.py h15.csv
"""
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

BUILDINGS = ["industrial1", "industrial2", "industrial3", "public1", "public2"]


def main(path):
    cols = [f"DE_KN_{b}_grid_import" for b in BUILDINGS]
    series = {b: [] for b in BUILDINGS}  # (wall-clock string, cumulative kWh or None)
    with open(path, newline="") as f:
        r = csv.reader(f)
        head = next(r)
        idx = [head.index(c) for c in cols]
        loc = head.index("cet_cest_timestamp")
        for row in r:
            wall = row[loc][:16]  # "2016-03-27T03:00" (offset dropped: wall clock)
            for b, i in zip(BUILDINGS, idx):
                series[b].append((wall, float(row[i]) if row[i] else None))
    out = []
    for b in BUILDINGS:
        months = defaultdict(list)
        bad = defaultdict(int)
        s = series[b]
        for k in range(1, len(s)):
            (w0, v0), (w1, v1) = s[k - 1], s[k]
            month = w1[:7]
            if v0 is None or v1 is None or v1 < v0:
                bad[month] += 1
                continue
            months[month].append((w1, round(4 * (v1 - v0), 4)))
        for month, rows in sorted(months.items()):
            y, m = map(int, month.split("-"))
            days = (datetime(y + (m == 12), m % 12 + 1, 1) - datetime(y, m, 1)).days
            # DST months gain or lose 4 readings; insist on all the rest.
            if bad[month] or len(rows) < days * 96 - 4:
                continue
            if rows[0][0][8:16] != "01T00:15" and rows[0][0][8:16] != "01T00:00":
                continue
            out.append({"building": b, "month": month, "t": [w for w, _ in rows], "kw": [v for _, v in rows]})
    os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)
    dest = os.path.join(os.path.dirname(__file__), "data", "opsd_months.json")
    with open(dest, "w") as f:
        json.dump(out, f)
    for b in BUILDINGS:
        ms = [o for o in out if o["building"] == b]
        peak = max((max(o["kw"]) for o in ms), default=0)
        print(f"{b}: {len(ms)} complete months, highest 15-min peak {peak:.1f} kW")
    print(f"wrote {dest}")


if __name__ == "__main__":
    main(sys.argv[1])
