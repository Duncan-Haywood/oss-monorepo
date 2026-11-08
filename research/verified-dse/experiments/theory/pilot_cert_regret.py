"""What does a pilot certificate (T<1) say about the regret a halving search then incurs? (milestone 95)
Runs no flow. Writes pilot_cert_regret_results.txt. Usage: python3 pilot_cert_regret.py

Milestones 84, 90, 93 describe T<1 by whether the pool optimum satisfies the zero-regret condition. A practitioner asks the other
way round: given a certified pilot, how often is regret 0, and how large is it when not? Per cell (40: 2 clocks x 10 designs x 2 starts),
same pilots as milestone 84 (300 per cell, seed prho...), 200 tie-breaks of halving (as milestone 44) give the realised regret of the
search. Pilot-level pooling weights every cell equally.
Predictions written before running (m = 16): (1) precision P(cell guaranteed | T<1) is about 0.87 (7.7 certified guaranteed cells' worth
of pilots against 1.1 false); (2) P(regret 0 | T<1) is above P(regret 0 | T>=1) and above 0.9; (3) the largest mean regret in any certified
false cell stays under 5% (relative excess y/min y - 1)."""
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound, flow  # noqa: E402
from pilot_rho import ratio, ETA, PILOTS  # noqa: E402

DRAWS = 200

if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["m | cells | share of pilots certified | precision P(guaranteed cell | certified) | P(regret 0 | certified) | P(regret 0 | not certified) | mean rel. regret certified | mean rel. regret not certified | worst cell mean rel. regret among certified pilots (cell, certified share)"]
    for m in (8, 16, 24):
        nc = nn = gc = 0.0
        z_c = z_n = r_c = r_n = 0.0
        worst = (0.0, "")
        for tag in ("tight", "relaxed"):
            for d in flow.DESIGNS:
                sc = by[(tag, d)]
                n = len(sc)
                y = [s["r4"] for s in sc]
                best = min(y)
                star = min(range(n), key=lambda i: y[i])
                s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
                keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
                for name, rungs, kp in (("r1", ("r1", "r2", "r3"), keep), ("r2", ("r2", "r3"), keep[:2])):
                    rs = [ratio(s, rungs, kp, i, n) for i in range(n)]
                    rng = random.Random(f"orank{tag}{d}{name}")
                    reg = [bound.halve([s[g] for g in rungs], y, kp, rng) / best - 1 for _ in range(DRAWS)]
                    z, mr = statistics.mean(x <= 1e-12 for x in reg), statistics.mean(reg)
                    rng = random.Random(f"prho{tag}{d}{m}{len(rungs)}")  # same pilots as milestone 84
                    c = sum(rs[min(rng.sample(range(n), m), key=lambda i: y[i])] < 1 for _ in range(PILOTS)) / PILOTS
                    nc += c; nn += 1 - c
                    gc += c * (rs[star] < 1)
                    z_c += c * z; z_n += (1 - c) * z; r_c += c * mr; r_n += (1 - c) * mr
                    if c > 0.01 and mr > worst[0]:
                        worst = (mr, f"{tag}/{d}/{name}, {c:.2f}")
        out.append(f"{m} | 40 | {nc / (nc + nn):.3f} | {gc / nc:.3f} | {z_c / nc:.3f} | {z_n / nn:.3f} | {r_c / nc:.4f} | {r_n / nn:.4f} | {worst[0]:.4f} ({worst[1]})")
    (HERE / "pilot_cert_regret_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
