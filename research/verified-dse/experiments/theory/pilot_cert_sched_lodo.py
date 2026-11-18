"""Leave-one-design-out choice of the keep schedule (milestone 106). Runs no flow.
Writes pilot_cert_sched_lodo_results.txt. Usage: python3 pilot_cert_sched_lodo.py

Milestone 105 compared two schedules chosen after seeing the table (in-sample). Here the three-rung keeps (F, M, K) are picked from a grid
by mean regret over the other nine designs (both clocks), then scored on the held-out design. Regret as in 105 (best routed survivor / pool
minimum - 1, rank by rung score with random tie-breaks, DRAWS per cell). Reference: the 105 schedule (35, 16, 8) and the in-grid oracle per
held-out design. Predictions written first: (1) the held-out mean regret of the selected schedule is at most the 105 schedule's plus 0.5
points; (2) it is above the oracle's (selection costs something) by at least 0.2 points; (3) the grid choice is not the same in all ten folds."""
import json
import random
import statistics
import sys
from collections import defaultdict
from itertools import product
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

DRAWS = 100
GRID = [(F, M, K) for F, M, K in product((16, 25, 35, 50), (8, 16), (3, 5, 8)) if F >= M >= K]
RUNGS = ("r1", "r2", "r3")


def regret(sc, keeps, rng):
    y = [p["r4"] for p in sc]
    best = min(y)
    tot = 0.0
    for _ in range(DRAWS):
        cand = list(range(len(sc)))
        for g, k in zip(RUNGS, keeps):
            tb = {i: rng.random() for i in cand}
            cand = sorted(cand, key=lambda i: (sc[i][g], tb[i]))[:k]
        tot += min(y[i] for i in cand) / best - 1
    return 100 * tot / DRAWS


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    # regret[design][keeps] = mean over the two clocks
    R = {}
    for d in flow.DESIGNS:
        R[d] = {g: statistics.mean(regret(by[(t, d)], g, random.Random(f"lodo{t}{d}{g}")) for t in ("tight", "relaxed")) for g in GRID}
    ref = (35, 16, 8)
    out = ["held-out design | chosen (F,M,K) | held-out regret% chosen | 105 schedule (35,16,8) | in-grid oracle | oracle (F,M,K)"]
    ch, rf, orc, picks = [], [], [], []
    for d in flow.DESIGNS:
        train = {g: statistics.mean(R[e][g] for e in flow.DESIGNS if e != d) for g in GRID}
        g = min(GRID, key=lambda k: (train[k], k))
        o = min(GRID, key=lambda k: (R[d][k], k))
        picks.append(g)
        ch.append(R[d][g]); rf.append(R[d][ref]); orc.append(R[d][o])
        out.append(f"{d} | {g} | {R[d][g]:.2f} | {R[d][ref]:.2f} | {R[d][o]:.2f} | {o}")
    m = lambda v: statistics.mean(v)
    full = {g: m(R[d][g] for d in flow.DESIGNS) for g in GRID}
    out += [f"mean held-out regret %: chosen {m(ch):.2f}, 105 schedule {m(rf):.2f}, oracle {m(orc):.2f}",
            f"distinct chosen schedules over 10 folds: {len(set(picks))}: {sorted(set(picks))}",
            f"in-sample best of grid on all 10 designs: {min(GRID, key=lambda k: (full[k], k))} at {min(full.values()):.2f}%; widest (50,16,8) {full[(50,16,8)]:.2f}%"]
    (HERE / "pilot_cert_sched_lodo_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
