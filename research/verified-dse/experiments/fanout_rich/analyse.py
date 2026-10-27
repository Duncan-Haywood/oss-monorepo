"""Milestone 30: per cell, how many distinct outcomes the 60 sequences give, tau-b(R2,R4) and R2 pick regret.
Runs no flow. Writes outcomes.txt. Usage: python3 analyse.py"""
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

cells = defaultdict(list)
fails = defaultdict(int)
for line in open(HERE / "results.jsonl"):
    r = json.loads(line)
    if r["status"] != "ok":
        fails[(r["design"], r["tag"])] += 1
        continue
    cells[(r["design"], r["tag"])].append(flow.scores(r))
out = ["cell | n ok | n failed | distinct R2 | distinct R4 | tau(R2,R4) | R2 pick regret % | R4 best / worst"]
taus = []
for c in sorted(cells):
    sc = cells[c]
    r2, r4 = [s["r2"] for s in sc], [s["r4"] for s in sc]
    tau = stats.kendall_tau_b(r2, r4)
    reg = stats.pick_regret(r2, r4) * 100
    taus.append(tau)
    out.append(f"{c[0]} {c[1]} | {len(sc)} | {fails[c]} | {len({round(x, 1) for x in r2})} | {len({round(x, 1) for x in r4})} | "
               f"{tau:.2f} | {reg:.1f} | {min(r4):.0f} / {max(r4):.0f}")
out.append(f"mean tau(R2,R4) over {len(taus)} cells: {sum(taus) / len(taus):.2f}")
(HERE / "outcomes.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
