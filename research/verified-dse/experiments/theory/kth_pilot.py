"""Pilot estimate of iota^(k) from m routed points versus the full-table value (milestone 38).
Runs no flow. Writes kth_pilot_results.txt. Usage: python3 kth_pilot.py"""
import json
import math
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound, flow  # noqa: E402

DRAWS, ETA, M = 300, 3, 16
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))

out = [f"pilot = {M} random routed points, iota^(k) computed on the pilot alone; {DRAWS} pilots per cell; log units",
       "clock | design | rung | k | true | pilot median | pilot p90 | share pilot >= true | share pilot >= 0.5 true"]
cells = []
for tag in ("tight", "relaxed"):
    for d in flow.DESIGNS:
        sc = by[(tag, d)]
        n = len(sc)
        y = [s["r4"] for s in sc]
        keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
        for g, k in zip(("r1", "r2", "r3"), keep):
            s = [p[g] for p in sc]
            true = bound.kth_inversion(s, y, k)
            if true <= 0:
                continue
            rng = random.Random(f"kp{tag}{d}{g}")
            # the pilot has M points, so a k-th rival needs k < M; scale k to the pilot's share of the pool
            kp = max(1, round(k * M / n))
            est = []
            for _ in range(DRAWS):
                idx = rng.sample(range(n), M)
                est.append(bound.kth_inversion([s[i] for i in idx], [y[i] for i in idx], kp))
            est.sort()
            c = {"cell": f"{tag}:{d}:{g}", "k": k, "kp": kp, "true": true, "med": statistics.median(est), "p90": est[int(0.9 * DRAWS)],
                 "ge": sum(e >= true - 1e-12 for e in est) / DRAWS, "half": sum(e >= 0.5 * true for e in est) / DRAWS}
            cells.append(c)
            out.append(f"{tag} | {d} | {g} | {k}->{kp} | {true:.3f} | {c['med']:.3f} | {c['p90']:.3f} | {c['ge']:.2f} | {c['half']:.2f}")
out += ["", f"cells with true iota^(k) > 0: {len(cells)}",
        f"pilot median / true: median {statistics.median([c['med'] / c['true'] for c in cells]):.2f}, min {min(c['med'] / c['true'] for c in cells):.2f}",
        f"cells where the pilot reaches the true value in at least 80% of draws: {sum(c['ge'] >= 0.8 for c in cells)}",
        f"cells where the pilot reaches half the true value in at least 80% of draws: {sum(c['half'] >= 0.8 for c in cells)}",
        f"cells where the pilot never reaches half the true value in 90% of draws: {sum(c['half'] < 0.1 for c in cells)}"]
(HERE / "kth_pilot_results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out[-6:]))
