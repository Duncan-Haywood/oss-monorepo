"""A pilot certificate T<1 is a deterministic no-worse-than-the-pilot guarantee (milestone 96).
Runs no flow. Writes pilot_cert_guarantee_results.txt. Usage: python3 pilot_cert_guarantee.py

Claim (proved): rho_j(p) counts rivals a rung ranks at or ahead of p, ties included. If ratio(p) = max_j rho_j(p)/k_j < 1 then
rho_j(p) < k_j for every cut, so p is in the top k_j under every tie-break and survives all cuts. Successive halving returns the
best y among the final survivors, hence returned y <= y(p). With p the pilot's best routed point and T = ratio(p) < 1, the pilot
alone certifies: returned cost <= pilot-best cost, for every tie-break. Milestone 95 showed T<1 does not bound regret against the
pool optimum; this says what it does bound (no relative-to-optimum statement; the optimum stays unknown).
Predictions written before running (m = 16): (1) zero violations of returned <= y(p) over all certified pilots x 200 tie-breaks;
(2) the pilot-best y(p) overstates the returned y, i.e. the search improves on the pilot in under half of certified draws;
(3) the mean excess of y(p) over the pool minimum among certified pilots is above the mean realised regret (the bound is loose)."""
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

def measure(m, by, pilots=PILOTS, draws=DRAWS):
    viol = tot = improved = 0
    exc = reg = 0.0
    npil = 0
    for tag in ("tight", "relaxed"):
        for d in flow.DESIGNS:
            sc = by[(tag, d)]
            n = len(sc)
            y = [s["r4"] for s in sc]
            best = min(y)
            s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
            keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
            for rungs, kp in ((("r1", "r2", "r3"), keep), (("r2", "r3"), keep[:2])):
                rs = [ratio(s, rungs, kp, i, n) for i in range(n)]
                rng = random.Random(f"prho{tag}{d}{m}{len(rungs)}")  # same pilots as milestones 84 and 95
                rh = random.Random(f"guar{tag}{d}{m}{len(rungs)}")
                for _ in range(pilots):
                    p = min(rng.sample(range(n), m), key=lambda i: y[i])
                    if rs[p] >= 1:
                        continue
                    npil += 1
                    exc += y[p] / best - 1
                    for _ in range(draws):
                        got = bound.halve([s[g] for g in rungs], y, kp, rh)
                        tot += 1
                        viol += got > y[p] + 1e-12
                        improved += got < y[p] - 1e-12
                        reg += got / best - 1
    return dict(m=m, certified=npil, draws=tot, violations=viol, improved=improved / tot,
                excess_of_pilot=exc / npil, realised=reg / tot)

if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["m | certified pilots | draws | violations of returned<=pilot-best | share of draws where search beats pilot-best | mean excess of pilot-best over pool minimum | mean realised regret"]
    for m in (8, 16, 24):
        r = measure(m, by)
        out.append(f"{m} | {r['certified']} | {r['draws']} | {r['violations']} | {r['improved']:.3f} | {r['excess_of_pilot']:.4f} | {r['realised']:.4f}")
    (HERE / "pilot_cert_guarantee_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
