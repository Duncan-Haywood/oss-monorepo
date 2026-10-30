"""Milestone 15: read results.jsonl; write results.txt (tables) and summary.json. Runs nothing new."""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

DESIGNS = ["barrel64", "barrel128", "popcount64", "popcount128", "alu32"]

rows = [json.loads(l) for l in (HERE / "results.jsonl").read_text().splitlines()]
ok = [r for r in rows if r["status"] == "ok"]
fails = defaultdict(int)
for r in rows:
    if r["status"] != "ok":
        fails[r["design"]] += 1
by = defaultdict(list)
for r in ok:
    by[(r["tag"], r["design"])].append(r)

out, summary = [], {}
RUNGS = ("r1", "r2", "r3")
for tag in ("tight", "relaxed"):
    out.append(f"## period {tag}\n")
    out.append("design | n | distinct r4 | " + " | ".join(f"tau {g} [95% CI]" for g in RUNGS) + " | " + " | ".join(f"regret {g} %" for g in RUNGS) + " | top5 hit r1/r2/r3")
    for d in DESIGNS:
        pts = by[(tag, d)]
        sc = [flow.scores(r) for r in pts]
        ref = [s["r4"] for s in sc]
        cells, regs, hits = [], [], []
        entry = {"n": len(pts), "distinct_r4": len({round(v, 3) for v in ref})}
        for g in RUNGS:
            x = [s[g] for s in sc]
            t = stats.kendall_tau_b(x, ref)
            lo, hi = stats.bootstrap_tau(x, ref) if t is not None else (None, None)
            reg = stats.pick_regret(x, ref) * 100
            hit = stats.topk_hit(x, ref, 5)
            entry[g] = {"tau": t, "lo": lo, "hi": hi, "regret_pct": reg, "top5": hit}
            cells.append("n/a" if t is None else f"{t:.2f} [{lo:.2f}, {hi:.2f}]")
            regs.append(f"{reg:.1f}")
            hits.append("Y" if hit else "n")
        out.append(f"{d} | {len(pts)} | {entry['distinct_r4']} | " + " | ".join(cells) + " | " + " | ".join(regs) + " | " + "/".join(hits))
        summary[f"{tag}:{d}"] = entry
    out.append("")
    for g in RUNGS:
        taus = [summary[f"{tag}:{d}"][g]["tau"] for d in DESIGNS if summary[f"{tag}:{d}"][g]["tau"] is not None]
        low = sum(t < 0.7 for t in taus)
        out.append(f"{tag} {g}: tau < 0.7 on {low} of {len(taus)} designs; median tau {statistics.median(taus):.2f}; "
                   f"median regret {statistics.median(summary[f'{tag}:{d}'][g]['regret_pct'] for d in DESIGNS):.1f}%")
    out.append("")
out.append("## wall time per point, mean seconds (tight; 1 core)")
t1 = statistics.mean(r["t1"] for r in ok if r["tag"] == "tight")
t2 = statistics.mean(r["t2_yosys"] for r in ok if r["tag"] == "tight")
tp = {k: statistics.mean(r[k] for r in ok if r["tag"] == "tight") for k in ("t_pnr_to_synth_netlist", "t_pnr_to_detail_place", "t_pnr_total")}
out.append(f"R1 {t1:.2f} | R2 yosys map {t2:.2f} (+ OpenROAD load/STA {tp['t_pnr_to_synth_netlist']:.2f}) | R3 {tp['t_pnr_to_detail_place']:.2f} | R4 total {tp['t_pnr_total']:.2f} (OpenROAD only)")
out.append(f"\nrejected by ABC/OpenROAD: {dict(fails)} of {len(rows)} runs failed in total {sum(fails.values())}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
