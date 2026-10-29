"""Milestone 40: how much must the pilot estimate of iota^(k) be inflated to cover the true value?
Same cells, pilots and k scaling as kth_pilot.py (milestone 38). Runs no flow.
For each cell, the factor c80 = the 80th percentile over pilots of true / pilot (inf if the pilot is 0), the
smallest multiplier that makes c * pilot >= true in 80% of draws. Then the coverage of fixed multipliers
across cells and the leave-one-design-out check of the multiplier that covers 80% in the other designs.
Writes kth_inflate_results.txt. Usage: python3 kth_inflate.py"""
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound, flow  # noqa: E402

DRAWS, ETA, M = 300, 3, 16
MULTS = (1.0, 1.25, 1.5, 2.0, 3.0, 5.0)
rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
by = defaultdict(list)
for r in rows:
    if r["status"] == "ok":
        by[(r["tag"], r["design"])].append(flow.scores(r))

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
            rng = random.Random(f"kp{tag}{d}{g}")  # same seeds as kth_pilot.py
            kp = max(1, round(k * M / n))
            est = []
            for _ in range(DRAWS):
                idx = rng.sample(range(n), M)
                est.append(bound.kth_inversion([s[i] for i in idx], [y[i] for i in idx], kp))
            cells.append({"cell": f"{tag}:{d}:{g}", "design": d, "true": true, "est": est})

def cover(c, m):
    return sum(m * e >= c["true"] - 1e-12 for e in c["est"]) / DRAWS

out = [f"cells {len(cells)}; {DRAWS} pilots of {M} points per cell", "",
       "multiplier | cells with coverage >= 0.8 | median coverage | min coverage"]
for m in MULTS:
    cv = [cover(c, m) for c in cells]
    out.append(f"{m:.2f} | {sum(v >= 0.8 for v in cv)} | {statistics.median(cv):.2f} | {min(cv):.2f}")
zero = sum(1 for c in cells if sum(e == 0 for e in c["est"]) / DRAWS > 0.2)
out += ["", f"cells where the pilot value is 0 in more than 20% of draws (no multiplier covers them): {zero}"]

def c80(c):
    r = sorted((c["true"] / e) if e > 0 else float("inf") for e in c["est"])
    return r[int(0.8 * DRAWS) - 1]

f = sorted(c80(c) for c in cells)
fin = [x for x in f if x != float("inf")]
out += [f"per-cell multiplier for 80% coverage: median {statistics.median(f):.2f}, p90 {f[int(0.9 * len(f))]:.2f}, "
        f"max {'inf' if f[-1] == float('inf') else format(f[-1], '.2f')}; infinite in {len(f) - len(fin)} cells", ""]
# leave one design out: multiplier = smallest grid value covering >= 80% of draws in 80% of the other designs' cells
designs = sorted({c["design"] for c in cells})
out.append("leave-one-design-out: multiplier chosen on the other designs (smallest grid value with >= 0.8 coverage in >= 80% of their cells), then its coverage on the held-out design")
grid = MULTS + (8.0, 12.0, 20.0)
ok = tot = 0
for d in designs:
    tr = [c for c in cells if c["design"] != d]
    te = [c for c in cells if c["design"] == d]
    pick = next((m for m in grid if sum(cover(c, m) >= 0.8 for c in tr) >= 0.8 * len(tr)), None)
    if pick is None:
        out.append(f"{d} | no grid multiplier reaches the target on the other designs")
        continue
    good = sum(cover(c, pick) >= 0.8 for c in te)
    ok += good
    tot += len(te)
    out.append(f"{d} | multiplier {pick} | held-out cells with coverage >= 0.8: {good} of {len(te)}")
out.append(f"total held-out cells covered: {ok} of {tot}")
(HERE / "kth_inflate_results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
