"""Milestone 18: which component of the R2 score mis-ranks? Splits each rung's area-delay product into its area and period
factors and measures, per cell (20 designs x 2 clocks, full pools), Kendall tau-b of each factor against its routed (R4)
counterpart and the regret of the pick under alternative cheap scores. Runs no flow. Usage: python3 components.py"""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import stats  # noqa: E402

M = statistics.mean
TABLES = ("rung_bias", "large", "nonarith")


def parts(r):
    p = r["period_ns"]
    return {
        "a2": r["synth_netlist_area"], "p2": p - r["synth_netlist_wns"],
        "a3": r["detail_place_area"], "p3": p - r["detail_place_wns"],
        "a4": r["final_area_notap"], "p4": p - r["final_wns"],
    }


SCORES = {  # name -> function of parts: the cheap score whose argmin is the pick
    "adp2 (baseline)": lambda x: x["a2"] * x["p2"],
    "area2 only": lambda x: x["a2"],
    "area2 x period3": lambda x: x["a2"] * x["p3"],
    "adp3": lambda x: x["a3"] * x["p3"],
    "area3 only": lambda x: x["a3"],
    "oracle period4 x area2": lambda x: x["a2"] * x["p4"],
}
cells, out = {}, []
for name in TABLES:
    rows = [json.loads(l) for l in (HERE.parent / name / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(parts(r))
    for (tag, d), pool in sorted(by.items()):
        ref = [x["a4"] * x["p4"] for x in pool]
        c = {"n": len(pool)}
        c["tau_area2"] = stats.kendall_tau_b([x["a2"] for x in pool], [x["a4"] for x in pool])
        c["tau_per2"] = stats.kendall_tau_b([x["p2"] for x in pool], [x["p4"] for x in pool])
        c["tau_per3"] = stats.kendall_tau_b([x["p3"] for x in pool], [x["p4"] for x in pool])
        c["spread_a4"] = max(x["a4"] for x in pool) / min(x["a4"] for x in pool) - 1
        c["spread_p4"] = max(x["p4"] for x in pool) / min(x["p4"] for x in pool) - 1
        for s, fn in SCORES.items():
            c[s] = stats.pick_regret([fn(x) for x in pool], ref) * 100
        cells[(tag, d)] = c
        out.append((name, tag, d))

L = ["# milestone 18: area and period factors of the R2 score, 40 cells (20 designs x 2 clocks), full pools, no flow run", ""]
L.append("## mean over cells of tau-b against the routed factor")
for k in ("tau_area2", "tau_per2", "tau_per3"):
    L.append(f"{k}: tight {M(c[k] for (t, _), c in cells.items() if t == 'tight'):.2f}  relaxed {M(c[k] for (t, _), c in cells.items() if t == 'relaxed'):.2f}")
L.append(f"routed spread (max/min - 1) of area {M(c['spread_a4'] for c in cells.values()) * 100:.1f}%  of period {M(c['spread_p4'] for c in cells.values()) * 100:.1f}%")
L.append("")
L.append("## mean / median / max pick regret % over the 40 cells (pick = argmin of the cheap score; regret against routed area x period)")
summary = {}
for s in SCORES:
    v = [c[s] for c in cells.values()]
    summary[s] = {"mean": M(v), "median": statistics.median(v), "max": max(v), "cells_over_10pct": sum(x > 10 for x in v)}
    L.append(f"{s:26s} mean {M(v):6.2f}  median {statistics.median(v):6.2f}  max {max(v):6.2f}  cells>10%: {sum(x > 10 for x in v)}")
L.append("")
L.append("## per cell (tag design: tau_area2 tau_per2 tau_per3 | regret adp2, area2, area2xp3, adp3)")
for (tag, d), c in sorted(cells.items()):
    L.append(f"{tag:7s} {d:12s}: {c['tau_area2']:.2f} {c['tau_per2']:.2f} {c['tau_per3']:.2f} | {c['adp2 (baseline)']:6.2f} {c['area2 only']:6.2f} {c['area2 x period3']:6.2f} {c['adp3']:6.2f}")
(HERE / "results.txt").write_text("\n".join(L) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(L[:20]))
