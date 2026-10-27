"""Milestone 31: why does R2 mis-rank fanao96 (milestone 30)? Splits the ADP into its area and period factors and tests
which recorded repair quantity (buffers added, area growth, WNS recovered by repair) tracks the R2->R4 reordering.
Runs no flow; reads ../fanout_rich/results.jsonl. Writes results.txt. Usage: python3 analyse.py"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

rows = {}
for line in open(HERE.parent / "fanout_rich" / "results.jsonl"):
    r = json.loads(line)
    if r["status"] == "ok":
        rows.setdefault((r["design"], r["tag"]), []).append(r)

t = stats.kendall_tau_b
out = ["cell | n | tau ADP R2,R4 | tau area R2,R4 | tau period R2,R4 | tau R2 period,R4 ADP | tau(buffers, R4-R2 ADP rank shift) | tau(area growth, same) | tau(WNS recovered, same)"]
for c in sorted(rows):
    rs = rows[c]
    p = rs[0]["period_ns"]
    r2 = [flow.scores(r)["r2"] for r in rs]
    r4 = [flow.scores(r)["r4"] for r in rs]
    a2 = [r["synth_netlist_area"] for r in rs]
    a4 = [r["final_area_notap"] for r in rs]
    p2 = [p - r["synth_netlist_wns"] for r in rs]
    p4 = [p - r["final_wns"] for r in rs]
    rk2 = {i: k for k, i in enumerate(sorted(range(len(rs)), key=lambda i: r2[i]))}
    rk4 = {i: k for k, i in enumerate(sorted(range(len(rs)), key=lambda i: r4[i]))}
    shift = [rk4[i] - rk2[i] for i in range(len(rs))]
    buf = [r["buffers_added"] for r in rs]
    grow = [a4[i] / a2[i] for i in range(len(rs))]
    rec = [p2[i] - p4[i] for i in range(len(rs))]
    out.append(f"{c[0]} {c[1]} | {len(rs)} | {t(r2, r4):.2f} | {t(a2, a4):.2f} | {t(p2, p4):.2f} | {t(p2, r4):.2f} | "
               f"{t(buf, shift):.2f} | {t(grow, shift):.2f} | {t(rec, shift):.2f}")
    out.append(f"   R2 period range {min(p2):.2f}-{max(p2):.2f}, R4 period {min(p4):.2f}-{max(p4):.2f}; area growth x{min(grow):.2f}-{max(grow):.2f}; buffers {min(buf)}-{max(buf)}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
