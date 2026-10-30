"""How far does each rung displace the pool optimum, and is a rank assumption on it enough for zero regret? (milestone 44)
Runs no flow. Writes optimum_rank_results.txt. Usage: python3 optimum_rank.py

Fact (the kappa = 0 case of milestone 39): x* is cut at a cut keeping k only if at least k rivals rank at or ahead of it, so
if rho_j = #rivals ranked at or ahead of x* under cut j's score is below k_j for every cut, regret is 0.
Rank-displacement assumption D(c): rho_j < c * k_j. This script reports rho_j / k_j per cell and the share with rho_j < k_j."""
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

DRAWS, ETA = 200, 3

if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["clock | design | start | n | keep | rho_j (rivals at or ahead of x*) | rho_j/k_j max | guaranteed 0 (all rho_j<k_j) | share of tie-breaks with regret 0"]
    cells = []
    for tag in ("tight", "relaxed"):
        for d in flow.DESIGNS:
            sc = by[(tag, d)]
            n = len(sc)
            y = [s["r4"] for s in sc]
            star = min(range(n), key=lambda i: y[i])
            s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
            keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
            for name, rungs, kp in (("r1", ("r1", "r2", "r3"), keep), ("r2", ("r2", "r3"), keep[:2])):
                rho = [sum(1 for z in range(n) if z != star and s[g][z] <= s[g][star]) for g in rungs]
                ratio = max(r / k for r, k in zip(rho, kp))
                rng = random.Random(f"orank{tag}{d}{name}")
                zero = statistics.mean(
                    bound.halve([s[g] for g in rungs], y, kp, rng) <= min(y) * (1 + 1e-12) for _ in range(DRAWS))
                guar = all(r < k for r, k in zip(rho, kp))
                cells.append({"ratio": ratio, "guar": guar, "zero": zero})
                out.append(f"{tag} | {d} | {name} | {n} | {kp} | {rho} | {ratio:.2f} | {guar} | {zero:.3f}")
    bad = [c for c in cells if c["guar"] and c["zero"] < 1 - 1e-9]
    out += ["", f"cells {len(cells)}; guaranteed-zero cells {sum(c['guar'] for c in cells)}; of those with any nonzero regret: {len(bad)} (must be 0)",
            f"cells with rho/k <= 1: {sum(c['ratio'] <= 1 for c in cells)}, <= 2: {sum(c['ratio'] <= 2 for c in cells)}, <= 4: {sum(c['ratio'] <= 4 for c in cells)}",
            f"among cells with rho/k > 1: mean share of tie-breaks with zero regret {statistics.mean([c['zero'] for c in cells if c['ratio'] > 1] or [float('nan')]):.3f}",
            f"median rho/k {statistics.median(c['ratio'] for c in cells):.2f}"]
    (HERE / "optimum_rank_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out[-5:]))
