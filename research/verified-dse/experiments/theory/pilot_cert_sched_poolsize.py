"""Does 'skip r1, score everything at r2, keep 8, route 8' survive a smaller pool? (milestone 107). Runs no flow.
Writes pilot_cert_sched_poolsize_results.txt. Usage: python3 pilot_cert_sched_poolsize.py

Milestone 106 picked (50, 8, 8) in all ten folds, but F = 50 is the whole pool. Here each cell's 50 routed points are subsampled to a pool of
N in (20, 30, 40) (SUBSETS random subsets per cell and design), and two schedules are scored by the regret of 105/106 (best routed survivor /
pool minimum - 1, with the minimum taken over the subsample, rank by rung score with random tie-breaks, DRAWS per subset): skip-r1 (N, 8, 8)
and the 105 schedule with the first keep capped at 70% of the pool, (round(0.7N), 16, 8). Predictions written first: (1) skip-r1 has mean
regret at most the 105-style schedule's plus 0.3 points at every N; (2) the absolute regret of skip-r1 rises as N falls (N=20 above N=40);
(3) skip-r1 beats random routing of 8 points at every N."""
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

DRAWS, SUBSETS = 20, 20
SIZES = (20, 30, 40)
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


def rand_regret(sc, k, rng):
    y = [p["r4"] for p in sc]
    best = min(y)
    return 100 * statistics.mean(min(rng.sample(y, k)) / best - 1 for _ in range(DRAWS))


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["pool N | skip-r1 (N,8,8) % | 105-style (0.7N,16,8) % | random 8 % | skip-r1 better in k of 10 designs"]
    res = {}
    for N in SIZES:
        a, b, c, wins = [], [], [], 0
        for d in flow.DESIGNS:
            ad, bd, cd = [], [], []
            for t in ("tight", "relaxed"):
                pool = by[(t, d)]
                rng = random.Random(f"pool{N}{t}{d}")
                for _ in range(SUBSETS):
                    sc = rng.sample(pool, min(N, len(pool)))
                    n = len(sc)
                    ad.append(regret(sc, (n, 8, 8), rng))
                    bd.append(regret(sc, (round(0.7 * n), 16, 8), rng))
                    cd.append(rand_regret(sc, 8, rng))
            a.append(statistics.mean(ad)); b.append(statistics.mean(bd)); c.append(statistics.mean(cd))
            wins += a[-1] < b[-1]
        res[N] = (statistics.mean(a), statistics.mean(b), statistics.mean(c))
        out.append(f"{N} | {res[N][0]:.2f} | {res[N][1]:.2f} | {res[N][2]:.2f} | {wins}")
    out += [f"(1) skip-r1 minus 105-style <= 0.3 at every N: {all(res[N][0] - res[N][1] <= 0.3 for N in SIZES)}",
            f"(2) skip-r1 regret N=20 above N=40: {res[20][0] > res[40][0]}",
            f"(3) skip-r1 beats random 8 at every N: {all(res[N][0] < res[N][2] for N in SIZES)}"]
    (HERE / "pilot_cert_sched_poolsize_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
