"""Figure for milestone 6i: cell-mean transit density against walker count at the 1.6 m entrance, edge
entry against lobby entry, with the dense HERMES run's density (bo-360-160-160) as the dashed line.

Reads m6i_lobby_runs.csv (Part A) and the target density from m6i_lobby_results.txt; stdlib only.
"""
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import svg_lines  # noqa: E402

NAMES = {"sf": "SF", "cfsm": "CFSM", "orca": "ORCA"}
ENTRANCE = "1.6"

res = (HERE / "m6i_lobby_results.txt").read_text()
target = float(re.search(r"bo-360-160-160 ([\d.]+)/m\^2", res).group(1))
cells = {}
with open(HERE / "m6i_lobby_runs.csv") as f:
    for r in csv.DictReader(f):
        if r["part"] != "A" or r["entrance_m"] != ENTRANCE or int(r["failed"]) or r["transit_s"] == "nan":
            continue
        cells.setdefault((r["family"], r["entry"]), {}).setdefault(int(r["walkers"]), []).append(
            float(r["transit_density"]))
series = []
for (fam, entry), byn in sorted(cells.items()):
    ns = sorted(byn)
    series.append((f"{NAMES[fam]} {entry}", ns, [sum(byn[n]) / len(byn[n]) for n in ns]))
assert len(series) == 6, [s[0] for s in series]
svg = svg_lines("Milestone 6i: does moving the entrance lift the twins' density ceiling?",
                "Cell-mean density seen while crossing against walkers in the loop, 1.6 m entrance, edge and lobby"
                " entry in three recalibrated twins; dashed line: the dense HERMES run's density",
                "walkers in the loop (N)", "density seen while crossing (persons per m^2)", series, hline=target)
(HERE / "m6i_lobby.svg").write_text(svg)
print("wrote", HERE / "m6i_lobby.svg")
