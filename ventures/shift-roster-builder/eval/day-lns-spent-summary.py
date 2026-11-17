"""Where the day sweeps (dayLNS) gain in their 2 s window (README "The day sweeps past a spent budget", 2026-11-17).
  python3 eval/day-lns-spent-summary.py eval/day-lns-spent-explore.jsonl
Reads stage-overrun.mjs rows; for each build that ran the pass, the score it saved by phase and by time in the window."""
import json, sys
from collections import defaultdict
rows = [json.loads(l) for l in open(sys.argv[1]) if l.startswith("{")]
rows = [r for r in rows if r.get("run", "new") == (sys.argv[2] if len(sys.argv) > 2 else r.get("run", "new"))]
ran = [r for r in rows if r.get("dayLNS")]
print(f"{len(rows)} builds, day sweeps ran on {len(ran)}; started past the 20 s budget on {sum(r['dayLNS']['startedAt'] >= 20000 for r in ran)}")
by_phase, cuts = defaultdict(float), [100, 250, 500, 1000, 2000]
by_cut = {c: 0.0 for c in cuts}
open_gain_after = {c: 0 for c in cuts}
total = 0.0
for r in ran:
    d = r["dayLNS"]
    total += d["before"] - d["after"]
    for t, k, g in d["gains"]:
        by_phase[k] += g
        for c in cuts:
            if t <= c: by_cut[c] += g
        if g >= 50000:
            for c in cuts:
                if t > c: open_gain_after[c] += int(round(g / 100000))
    print(f"  seed {r['seed']} {r['P']}x{r['S']} w{r['week']}: started {d['startedAt']} ms, {d['kicks']} kicks, guide {d['guideFrom']}, saved {d['before'] - d['after']:.2f}, gains {d['gains']}")
print(f"saved in all: {total:.2f} (score units; 100,000 = one open hour)")
print("by phase:", {k: round(v, 2) for k, v in by_phase.items()})
for c in cuts:
    print(f"  kept with a {c} ms window: {by_cut[c]:.2f} ({100 * by_cut[c] / total if total else 0:.1f}%); open hours found only after {c} ms: {open_gain_after[c]}")
