"""Smallest singular value of the Newton Jacobian along the load continuation of the DC dispatch
(results_fold.json, LOG.md 2026-11-14). Writes fold_sigma.svg."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

rows = json.loads((HERE / "results_fold.json").read_text())
series = []
for r in rows:
    if r.get("error") or r["kind"] != "typ":
        continue  # four colours: TYP cases only; API and SAD are in results_fold.txt (same shape, ratio 0.05 to 0.09)
    s0 = r["F"]["path"][0]["sigma"]
    series.append((f"{r['case'].split('_')[0]} {r['kind'].upper()}",
                   [p["mu"] for p in r["F"]["path"]], [p["sigma"] / s0 for p in r["F"]["path"]]))
c = next((r["F_control"] for r in rows if r.get("F_control")), None)
if c:
    s0 = c["path"][0]["sigma"]
    series.append(("control", [p["mu"] for p in c["path"]], [p["sigma"] / s0 for p in c["path"]]))
write_lines(HERE, "fold_sigma.svg",
            "Jacobian smallest singular value along the load continuation",
            "sigma_min of the power-flow Jacobian, relative to no load, against the load scale mu: it falls "
            "towards zero where each DC dispatch's continuation stops, and stays near 1 for the control.",
            "load scale mu (loads and dispatch scaled together)", "sigma_min / sigma_min at mu = 0",
            series, logy=True, hline=0.1,
            xticks=[0, 0.2, 0.4, 0.6, 0.8, 1.0])
