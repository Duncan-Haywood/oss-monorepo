"""Polity lifespans from Seshat's Cliopatria v0.2.1 (Chalstrey et al. 2025, Scientific Data,
doi:10.1038/s41597-025-04516-9; data CC BY 4.0, zenodo 10.5281/zenodo.23128623).

`data/cliopatria_v021_rows.csv` is the attribute table of `cliopatria_polities_only_v021.geojson`
with the polygons removed (changes made: geometry dropped, nothing else). One row is a named
polity over a range of years [FromYear, ToYear] with one territory.

A polity's lifespan here is its first continuous run of years under one Name: from its first
FromYear to the end of the first block of rows with no gap, ending at ToYear + 1. It is censored
when the run reaches 2024 (the last year mapped) and dropped when it starts in 3400 BCE (the
first year mapped, so its true start is unknown). Cliopatria samples years unevenly (a snapshot
every 100 to 300 years in the Bronze Age, every few years after 1800), so a lifespan is only as
precise as the snapshot spacing around its ends; `spacing()` reports it.
"""
import csv
from collections import defaultdict
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parents[2] / "data" / "cliopatria_v021_rows.csv"
FIRST, LAST = -3400, 2024
ERAS = ((-3400, -1000), (-1000, 0), (0, 500), (500, 1000), (1000, 1500), (1500, 1800), (1800, 2025))


def rows(path=DATA):
    return [r for r in csv.DictReader(open(path, newline="", encoding="utf-8")) if r["Type"] == "POLITY"]


def lifespans(path=DATA):
    g = defaultdict(list)
    for r in rows(path):
        g[r["Name"]].append((int(r["FromYear"]), int(r["ToYear"]), float(r["Area"] or 0)))
    out = []
    for name, iv in g.items():
        iv.sort()
        start, end, area0 = iv[0][0], iv[0][1], iv[0][2]
        peak = area0
        later = False
        for a, b, ar in iv[1:]:
            if a > end + 1:
                later = True
                break
            end = max(end, b)
            peak = max(peak, ar)
        all_end = max(b for _, b, _ in iv)
        out.append({"name": name, "start": start, "end": end + 1, "event": 0 if end >= LAST else 1,
                    "duration": end + 1 - start, "area0_km2": area0, "peak_km2": peak,
                    "returns_later": later, "left_truncated": start <= FIRST,
                    "span_all": all_end + 1 - start, "event_all": 0 if all_end >= LAST else 1})
    return out


def era_of(year):
    for lo, hi in ERAS:
        if lo <= year < hi:
            return f"{lo}..{hi}"
    return "?"


def spacing(path=DATA):
    """Median gap between successive snapshot start years, by era."""
    ys = sorted({int(r["FromYear"]) for r in rows(path)})
    gaps = defaultdict(list)
    for a, b in zip(ys, ys[1:]):
        gaps[era_of(a)].append(b - a)
    return {k: (float(np.median(v)), len(v) + 1) for k, v in gaps.items()}
