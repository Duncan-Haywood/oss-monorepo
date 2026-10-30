"""Optimum-anchored halving regret bound (milestone 39). Runs no flow. Writes anchored_results.txt. Usage: python3 anchored.py

kappa^(k) = k-th largest of max(0, log y(z) - log y(x*)) over rivals z the rung ranks at or ahead of the pool optimum x*
(0 if fewer than k rivals). If x* is first cut at cut j, the best survivor is within kappa_j; later cuts cost at most iota^(k_l).
Bound = max over j of kappa_j + sum_{l>j} iota^(k_l)."""
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


def kappa(s, y, k):
    """k-th largest excess over the optimum among rivals the rung ranks at or ahead of it (0 if fewer than k)."""
    star = min(range(len(y)), key=lambda i: y[i])
    vals = sorted((math.log(y[z]) - math.log(y[star]) for z in range(len(y)) if z != star and s[z] <= s[star]), reverse=True)
    return vals[k - 1] if len(vals) >= k else 0.0


def anchored(scores, y, keep):
    iotas = [bound.kth_inversion(s, y, k) for s, k in zip(scores, keep)]
    return max(kappa(s, y, k) + sum(iotas[j + 1:]) for j, (s, k) in enumerate(zip(scores, keep)))


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["log units; old = sum iota^(k_j) (milestone 37); new = optimum-anchored bound; realised = mean over 200 tie-breaks; spread = log(max y / min y)",
           "clock | design | start | n | keep | old | new | new/old | realised | max realised | spread"]
    cells, viol = [], 0
    for tag in ("tight", "relaxed"):
        for d in flow.DESIGNS:
            sc = by[(tag, d)]
            n = len(sc)
            y = [s["r4"] for s in sc]
            s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
            keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
            spread = math.log(max(y)) - math.log(min(y))
            for name, rungs, kp in (("r1", ("r1", "r2", "r3"), keep), ("r2", ("r2", "r3"), keep[:2])):
                rng = random.Random(f"anc{tag}{d}{name}")
                regs = [math.log(bound.halve([s[g] for g in rungs], y, kp, rng)) - math.log(min(y)) for _ in range(DRAWS)]
                sc_r = [s[g] for g in rungs]
                old = sum(bound.kth_inversion(x, y, k) for x, k in zip(sc_r, kp))
                new = anchored(sc_r, y, kp)
                viol += sum(r > new + 1e-9 for r in regs)
                cells.append({"old": old, "new": new, "real": statistics.mean(regs), "maxreal": max(regs), "spread": spread})
                out.append(f"{tag} | {d} | {name} | {n} | {kp} | {old:.3f} | {new:.3f} | {(new / old if old > 0 else float('nan')):.3f} | {statistics.mean(regs):.3f} | {max(regs):.3f} | {spread:.3f}")
    pos = [c for c in cells if c["old"] > 0]
    mr = [c for c in cells if c["maxreal"] > 0]
    out += ["", f"violations (over {len(cells)} cells x {DRAWS} tie-breaks): {viol}",
            f"cells with old > 0: {len(pos)}; new < old in {sum(c['new'] < c['old'] - 1e-12 for c in pos)}; new/old median {statistics.median([c['new'] / c['old'] for c in pos]):.3f}",
            f"non-vacuous (bound < spread): old {sum(c['old'] < c['spread'] for c in cells)}, new {sum(c['new'] < c['spread'] for c in cells)} of {len(cells)}",
            f"median bound / max realised regret over {len(mr)} cells with regret: old {statistics.median([c['old'] / c['maxreal'] for c in mr]):.2f}, new {statistics.median([c['new'] / c['maxreal'] for c in mr]):.2f}",
            f"cells with new bound = 0: {sum(c['new'] < 1e-12 for c in cells)}"]
    (HERE / "anchored_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out[-6:]))
