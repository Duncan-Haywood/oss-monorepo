"""Milestone 108: does milestone 106's held-out schedule choice, and milestone 1's rung bias, hold on a fresh, larger pool?

Usage: python3 analyse.py [results.jsonl] [out.txt]

The pool is 120 ABC pass sequences disjoint from milestone 1's 60, run under the tools of this session (versions in LOG.md), so it is
new data for every claim tested here; schedules and predictions were fixed on the milestone 1 table before this table existed.
Predictions, written in this file before the flow ran:
 (1) skip-r1 (N, 8, 8) has mean regret over the 20 cells at most the 105-style schedule (round(0.7N), 16, 8) plus 0.3 points;
 (2) both schedules beat random routing of 8 points in mean regret;
 (3) skip-r1's regret on the full pool exceeds its regret on random 50-point subsamples of the same pool (more points to beat, same K);
 (4) the median tau-b of r2 against r4 is within 0.15 of milestone 1's on the same designs, at each clock;
 (5) the generic-gate rung stays the weakest: median tau-b(r1, r4) below median tau-b(r2, r4) at each clock.
Regret is milestone 105's: best routed survivor / pool minimum - 1, ranking by rung score with random tie-breaks, DRAWS draws per cell.
"""
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow, stats  # noqa: E402

DRAWS, SUBSETS = 100, 20
RUNGS = ("r1", "r2", "r3")
CLOCKS = ("tight", "relaxed")


def regret(sc, keeps, rng, draws=DRAWS):
    y = [p["r4"] for p in sc]
    best = min(y)
    tot = 0.0
    for _ in range(draws):
        cand = list(range(len(sc)))
        for g, k in zip(RUNGS, keeps):
            tb = {i: rng.random() for i in cand}
            cand = sorted(cand, key=lambda i: (sc[i][g], tb[i]))[:k]
        tot += min(y[i] for i in cand) / best - 1
    return 100 * tot / draws


def rand_regret(sc, k, rng, draws=DRAWS):
    y = [p["r4"] for p in sc]
    best = min(y)
    return 100 * statistics.mean(min(rng.sample(y, k)) / best - 1 for _ in range(draws))


def load(path):
    by = defaultdict(list)
    for line in Path(path).read_text().splitlines():
        r = json.loads(line)
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    return by


def taus(by, rung):
    out = {}
    for t in CLOCKS:
        v = []
        for d in flow.DESIGNS:
            sc = by[(t, d)]
            tau = stats.kendall_tau_b([p[rung] for p in sc], [p["r4"] for p in sc])
            if tau is not None:  # None when a rung is constant
                v.append(tau)
        out[t] = statistics.median(v)
    return out


def main(src, dst):
    by = load(src)
    old = load(HERE.parent / "rung_bias" / "results.jsonl")
    out = ["# Milestone 108: fresh 120-sequence pool (disjoint from milestone 1), ten small designs, two clocks", "",
           "clock | design | n ok | skip-r1 (N,8,8) % | 105-style (0.7N,16,8) % | random 8 % | skip-r1 at N=50 subsample %"]
    a, b, c, s50 = [], [], [], []
    for t in CLOCKS:
        for d in flow.DESIGNS:
            sc = by[(t, d)]
            n = len(sc)
            rng = random.Random(f"fresh{t}{d}")
            ra, rb, rc = regret(sc, (n, 8, 8), rng), regret(sc, (round(0.7 * n), 16, 8), rng), rand_regret(sc, 8, rng)
            sub = statistics.mean(regret(p, (len(p), 8, 8), rng, 20) for p in (rng.sample(sc, min(50, n)) for _ in range(SUBSETS)))
            a.append(ra); b.append(rb); c.append(rc); s50.append(sub)
            out.append(f"{t} | {d} | {n} | {ra:.2f} | {rb:.2f} | {rc:.2f} | {sub:.2f}")
    ma, mb, mc, ms = (statistics.mean(x) for x in (a, b, c, s50))
    wins = sum(x < y for x, y in zip(a, b))
    ties = sum(x == y for x, y in zip(a, b))
    out += ["", f"mean over 20 cells: skip-r1 {ma:.2f}%, 105-style {mb:.2f}%, random 8 {mc:.2f}%, skip-r1 at N=50 {ms:.2f}%",
            f"skip-r1 better in {wins} of 20 cells, tied in {ties}", ""]
    t2n, t2o, t1n = taus(by, "r2"), taus(old, "r2"), taus(by, "r1")
    out.append("clock | median tau-b(r1,r4) fresh | median tau-b(r2,r4) fresh | same, milestone 1 table")
    for t in CLOCKS:
        out.append(f"{t} | {t1n[t]:.2f} | {t2n[t]:.2f} | {t2o[t]:.2f}")
    out += ["",
            f"(1) skip-r1 <= 105-style + 0.3: {ma <= mb + 0.3}",
            f"(2) both beat random 8: {ma < mc and mb < mc}",
            f"(3) full-pool skip-r1 regret above N=50 subsample: {ma > ms}",
            f"(4) r2 tau-b within 0.15 of milestone 1 at both clocks: {all(abs(t2n[t] - t2o[t]) <= 0.15 for t in CLOCKS)}",
            f"(5) r1 tau-b below r2 tau-b at both clocks: {all(t1n[t] < t2n[t] for t in CLOCKS)}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.jsonl", sys.argv[2] if len(sys.argv) > 2 else HERE / "results.txt")
