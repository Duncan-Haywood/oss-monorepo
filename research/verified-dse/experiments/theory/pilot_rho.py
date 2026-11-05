"""Can a pilot observe the rank-displacement ratio of the pool optimum? (milestone 84)
Runs no flow. Writes pilot_rho_results.txt. Usage: python3 pilot_rho.py

rho_j(x) = number of rivals a rung's score ranks at or ahead of x. Rung scores are cheap and known for the whole pool, so
rho_j(p) is exactly observable for every routed pilot point p, though not for the unrouted optimum x*. Milestone 44's
zero-regret condition is ratio(x*) = max_j rho_j(x*)/k_j < 1. Pilot statistic: T = the ratio of the pilot's best routed point
(by y), and T3 = the smallest ratio among the pilot's three best routed points. Question: how often is T (or T3) >= ratio(x*),
i.e. does the pilot's observed ratio dominate the optimum's, so that T < 1 would certify zero regret in practice?
Pilot: m random pool points; 300 pilots per cell."""
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

ETA, PILOTS = 3, 300

def ratio(s, rungs, kp, i, n):
    return max(sum(1 for z in range(n) if z != i and s[g][z] <= s[g][i]) / k for g, k in zip(rungs, kp))

if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["m | statistic | cells | median coverage P(T >= ratio(x*)) | cells with coverage >= 0.8 | cells where ratio(x*)<1 (guaranteed): share of pilots with T<1 | cells ratio(x*)>=1: share of pilots with T<1 (false certificates)"]
    for m in (8, 16, 24):
        res = {"T": [], "T3": []}
        for tag in ("tight", "relaxed"):
            for d in flow.DESIGNS:
                sc = by[(tag, d)]
                n = len(sc)
                y = [s["r4"] for s in sc]
                star = min(range(n), key=lambda i: y[i])
                s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
                keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
                for rungs, kp in ((("r1", "r2", "r3"), keep), (("r2", "r3"), keep[:2])):
                    rs = [ratio(s, rungs, kp, i, n) for i in range(n)]
                    rng = random.Random(f"prho{tag}{d}{m}{len(rungs)}")
                    cov = {"T": 0, "T3": 0}; cert = {"T": 0, "T3": 0}
                    for _ in range(PILOTS):
                        pil = sorted(rng.sample(range(n), m), key=lambda i: y[i])
                        t = {"T": rs[pil[0]], "T3": min(rs[i] for i in pil[:3])}
                        for k in t:
                            cov[k] += t[k] >= rs[star] - 1e-12
                            cert[k] += t[k] < 1
                    for k in res:
                        res[k].append((cov[k] / PILOTS, rs[star] < 1, cert[k] / PILOTS))
        for k, v in res.items():
            g = [c for c in v if c[1]]
            f = [c for c in v if not c[1]]
            out.append(f"{m} | {k} | {len(v)} | {statistics.median(c[0] for c in v):.3f} | {sum(c[0] >= 0.8 for c in v)} | "
                       f"{statistics.mean(c[2] for c in g) if g else float('nan'):.3f} (n={len(g)}) | "
                       f"{statistics.mean(c[2] for c in f) if f else float('nan'):.3f} (n={len(f)})")
    (HERE / "pilot_rho_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
