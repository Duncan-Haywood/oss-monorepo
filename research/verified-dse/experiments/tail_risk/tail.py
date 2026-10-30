"""Milestone 34: median, worst-design and tail regret for every arm and budget on the 12 held-out designs.
Re-runs experiments/r2_harsh_cut/replay.py in process (deterministic, no flow run) and tabulates its per-cell regrets.
Predictions are in LOG.md. Writes results.txt and summary.json. Usage: python3 tail.py"""
import json
import runpy
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
g = runpy.run_path(str(HERE.parent / "r2_harsh_cut" / "replay.py"))
reg, designs, ARMS, BUDGETS = g["reg"], g["designs"], g["ARMS"], g["BUDGETS"]
M = statistics.mean
per = {(dn, B, a): M(reg[((n, t, dn), B, a)] for t in ("tight", "relaxed")) for (n, dn) in designs for B in BUDGETS for a in ARMS}
out = [f"# milestone 34: regret % across {len(designs)} held-out designs (clock-averaged; 400 paired seeds; replay of r2_harsh_cut)",
       "columns per arm: mean / median / worst design (name) / designs above 5%\n"]
summary = {}
for B in BUDGETS:
    out.append(f"## budget {B} equivalents")
    for a in ARMS:
        v = {dn: per[(dn, B, a)] for (_, dn) in designs}
        w = max(v, key=v.get)
        row = {"mean": M(v.values()), "median": statistics.median(v.values()), "worst": v[w], "worst_design": w, "above5": sum(x > 5 for x in v.values())}
        summary[f"{a}_{B}"] = row
        out.append(f"{a:6s} {row['mean']:6.2f} / {row['median']:5.2f} / {row['worst']:5.2f} ({w}) / {row['above5']}")
    out.append("")
(HERE / "results.txt").write_text("\n".join(out))
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
