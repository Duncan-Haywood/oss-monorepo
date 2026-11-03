"""Milestone 73: does R2's failure on the one-hot AND-OR mux follow the control fanout W?
Reads results.jsonl (run.py); writes results.txt. Runs no flow. Usage: python3 analyse.py"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

rows = {}
for line in open(HERE / "results.jsonl"):
    r = json.loads(line)
    if r["status"] == "ok":
        rows.setdefault(r["design"], []).append(r)
t = stats.kendall_tau_b
out = ["W | n | distinct R4 outcomes | tau ADP R2,R4 | tau area R2,R4 | tau period R2,R4 | R2 period range | R4 period range | R4/R2 best-period ratio | R2 pick regret % (ADP) | R2-area pick regret %"]
for d in sorted(rows, key=lambda k: int(k.replace("fanaow", ""))):
    rs = rows[d]
    p = rs[0]["period_ns"]
    r2 = [flow.scores(r)["r2"] for r in rs]
    r4 = [flow.scores(r)["r4"] for r in rs]
    a2 = [r["synth_netlist_area"] for r in rs]
    a4 = [r["final_area_notap"] for r in rs]
    p2 = [p - r["synth_netlist_wns"] for r in rs]
    p4 = [p - r["final_wns"] for r in rs]
    best = min(r4)
    reg = lambda s: 100 * (r4[min(range(len(rs)), key=lambda i: s[i])] / best - 1)
    out.append(f"{d.replace('fanaow','')} | {len(rs)} | {len(set(round(x, 3) for x in r4))} | {t(r2, r4):.2f} | {t(a2, a4):.2f} | {t(p2, p4):.2f} | "
               f"{min(p2):.2f}-{max(p2):.2f} | {min(p4):.2f}-{max(p4):.2f} | {min(p4) / min(p2):.2f} | {reg(r2):.1f} | {reg(a2):.1f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
