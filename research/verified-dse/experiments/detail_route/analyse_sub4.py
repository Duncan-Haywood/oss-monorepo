"""Milestone 80: R4-rank subsample (4 points) of mult32 relaxed, detail-routed (R5). Writes results_mult32_sub4.txt. Stdlib only."""
import json, statistics, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

new = [r for r in map(json.loads, open(HERE / "results_mult32_sub4.jsonl")) if r.get("status") == "ok"]
sc = [flow.scores(r) for r in new]
r5 = [r["final_area_notap"] * (r["period_ns"] - r["droute_wns"]) for r in new]
out = [f"Milestone 80: mult32 relaxed, {len(new)} ok points evenly spaced in R4 rank, detail-routed. OpenROAD 2025-03, Yosys 0.51", ""]
for k in ("r1", "r2", "r3", "r4"):
    out.append(f"tau-b({k}, R5) = {stats.kendall_tau_b([s[k] for s in sc], r5)}")
order = sorted(range(len(new)), key=lambda i: sc[i]["r4"])
out.append("\nR4 rank -> R5 rank (1 = best):")
r5rank = {i: j + 1 for j, i in enumerate(sorted(range(len(new)), key=lambda i: r5[i]))}
for j, i in enumerate(order):
    out.append(f"  R4 #{j+1:2d}  R4 {sc[i]['r4']:.1f}  R5 {r5[i]:.1f}  R5 rank {r5rank[i]:2d}  droute {new[i]['t_droute']:.0f}s  drc {new[i]['drc_violations']}")
out.append(f"\nR4 pick regret vs R5: {100*stats.pick_regret([s['r4'] for s in sc], r5):.1f}%  R2 pick regret: {100*stats.pick_regret([s['r2'] for s in sc], r5):.1f}%")
out.append(f"detail-route time s: median {statistics.median(r['t_droute'] for r in new):.0f}, max {max(r['t_droute'] for r in new):.0f}")
(HERE / "results_mult32_sub4.txt").write_text("\n".join(out) + "\n"); print("\n".join(out))
