"""Summarise the committed snapshot of cost fields from prompts/runs/. Prints results.txt."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_runcost.runcost import load, summarise

runs = load(os.path.join(HERE, "costs_snapshot.jsonl"))
s = summarise(runs)
print(f"runs with cost_usd: {s['runs']}   dates {min(r['date'] for r in runs)} to {max(r['date'] for r in runs)}")
print(f"total ${s['total']:.2f}   mean ${s['mean']:.2f}   median ${s['median'][0]:.2f} (95% bootstrap {s['median'][1]:.2f} to {s['median'][2]:.2f})")
print(f"top 10% of runs hold {100 * s['top10_share']:.0f}% of spend; the top 1% (4 runs) hold {100 * s['top1_share']:.0f}%")
print("\ntrack        runs   total$  share  median$ (95% bootstrap)")
for t, v in s["tracks"].items():
    print(f"  {t:9s} {v['n']:5d} {v['total']:8.2f} {100 * v['share']:5.0f}%  {v['median']:.2f} ({v['lo']:.2f} to {v['hi']:.2f})")
print(f"\nleast squares cost ~ a*Min_tokens_in + b*Mtok_out: a = ${s['per_mtok_in']:.3f}, b = ${s['per_mtok_out']:.2f} per million")
for name, key in [("cost vs tool calls", "toolcall_exponent"), ("cost vs wall minutes", "wall_exponent"),
                  ("tokens_in vs tool calls", "tokens_in_exponent")]:
    e, lo, hi = s[key]
    print(f"log-log exponent, {name}: {e:.2f} (95% bootstrap {lo:.2f} to {hi:.2f})")
tc = sorted(r["tool_calls"] for r in runs if r.get("tool_calls"))
print(f"\ntool calls per run: median {tc[len(tc) // 2]}, max {tc[-1]}")
