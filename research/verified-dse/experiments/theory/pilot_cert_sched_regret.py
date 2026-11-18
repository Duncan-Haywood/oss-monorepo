"""Routed regret of the two certifiable schedules (milestone 105). Runs no flow.
Writes pilot_cert_sched_regret_results.txt. Usage: python3 pilot_cert_sched_regret.py

Milestone 104 priced the 2-rung ladder (r2, r3; keeps 16, 5) and the 3-rung schedule (r1, r2, r3; keeps 35, 16, 8) and noted it measured no regret.
Here each schedule is run on the cached table: rank by rung score (random tie-break, 200 draws per cell), keep the top k, repeat, route the last
survivors at r4 and take the best. Regret = best routed score found / pool minimum - 1. Baseline: routing a random sample of the same size as the
schedule's routed survivors (5 and 8), and the optimum-hit rate. Predictions written first: (1) the 3-rung schedule has lower or equal mean
regret than the 2-rung one in at least 14 of 20 cells (it routes 8 against 5 and keeps 35 at r1); (2) both beat random routing of equal count
in mean regret over cells; (3) mean regret over cells is under 2% for both."""
import json
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

DRAWS = 200


def run(sc, rungs, keeps, rng):
    cand = list(range(len(sc)))
    for g, k in zip(rungs, keeps):
        tb = {i: rng.random() for i in cand}
        cand = sorted(cand, key=lambda i: (sc[i][g], tb[i]))[:k]
    return cand


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["cell | n | regret% 2-rung (16,5) | hit | regret% 3-rung (35,16,8) | hit | regret% random 5 | regret% random 8"]
    wins = []
    M = {k: [] for k in ("a", "b", "r5", "r8")}
    for tag in ("tight", "relaxed"):
        for d in flow.DESIGNS:
            sc = by[(tag, d)]
            n = len(sc)
            y = [p["r4"] for p in sc]
            best = min(y)
            rng = random.Random(f"cr{tag}{d}")
            res = {k: [] for k in ("a", "b", "r5", "r8")}
            hit = {"a": 0, "b": 0}
            for _ in range(DRAWS):
                for k, (rungs, keeps) in (("a", (("r2", "r3"), (16, 5))), ("b", (("r1", "r2", "r3"), (35, 16, 8)))):
                    c = run(sc, rungs, keeps, rng)
                    v = min(y[i] for i in c)
                    res[k].append(v / best - 1)
                    hit[k] += v <= best
                res["r5"].append(min(y[i] for i in rng.sample(range(n), 5)) / best - 1)
                res["r8"].append(min(y[i] for i in rng.sample(range(n), 8)) / best - 1)
            m = {k: 100 * statistics.mean(v) for k, v in res.items()}
            for k in M:
                M[k].append(m[k])
            wins.append(m["b"] <= m["a"] + 1e-9)
            out.append(f"{tag} {d} | {n} | {m['a']:.2f} | {hit['a']/DRAWS:.2f} | {m['b']:.2f} | {hit['b']/DRAWS:.2f} | {m['r5']:.2f} | {m['r8']:.2f}")
    mean = {k: statistics.mean(v) for k, v in M.items()}
    out += [f"cells where 3-rung mean regret <= 2-rung: {sum(wins)} of {len(wins)}",
            f"mean regret over cells %: 2-rung {mean['a']:.2f}, 3-rung {mean['b']:.2f}, random 5 {mean['r5']:.2f}, random 8 {mean['r8']:.2f}",
            f"worst cell mean regret %: 2-rung {max(M['a']):.2f}, 3-rung {max(M['b']):.2f}"]
    (HERE / "pilot_cert_sched_regret_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
