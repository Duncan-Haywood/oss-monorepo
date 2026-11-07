"""Exact power of the pilot rank-displacement certificate (milestone 93). Runs no flow.
Writes pilot_rho_exact_results.txt. Usage: python3 pilot_rho_exact.py

Milestone 92 bounded P(T<1) by the hit probability of G = {i : ratio(i) < 1}. T < 1 happens iff the pilot's y-best point is
in G, so with y distinct and r_i the 0-indexed y-rank of i in the pool of n,
    P(T<1) = sum_{i in G} C(n-1-r_i, m-1) / C(n,m)         (i is the pilot's best iff it is drawn and the other m-1 are all worse).
Predictions written before running: (1) the formula equals brute-force enumeration on small random instances (test file);
(2) in all 33 cell x m combinations the empirical share of T<1 from milestone 92's 300 pilots is within 3 binomial sigma of the exact
value (the bound was not within that, median gap 0.06 to 0.10); (3) y has no ties in these cells, so the formula applies as stated.
Outcome of the first run: (1) held, (2) held, (3) REFUTED: every cell has ties in y (11 to 48 duplicated values in 50 to 52). With ties a pilot's
sort picks the first tied point in sample order, i.e. uniformly among the pilot's members of the lowest tied group, so the exact value is
    P(T<1) = sum_g (G_g/s_g) [C(n-B_g, m) - C(n-B_g-s_g, m)] / C(n,m)
over y-tie groups g (size s_g, G_g of them in G, B_g points strictly better than the group). This tie-aware form is what is reported
(it reduces to the distinct-y formula when every s_g = 1)."""
import json
import random
import statistics
import sys
from collections import defaultdict
from math import comb
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
from pilot_rho import ratio, ETA, PILOTS  # noqa: E402


def exact_power(n, m, G, y):
    """P(the y-best of m points drawn uniformly without replacement is in G), ties in y broken uniformly (sample order)."""
    G, groups = set(G), defaultdict(list)
    for i in range(n):
        groups[y[i]].append(i)
    total, better = 0.0, 0
    for v in sorted(groups):
        mem = groups[v]
        s = len(mem)
        total += sum(i in G for i in mem) / s * (comb(n - better, m) - comb(n - better - s, m))
        better += s
    return total / comb(n, m)


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["m | guaranteed cells | cells with y ties | |z|>3 (emp vs exact) | max |z| | median emp | median exact | median |emp-exact| | median hit-bound minus exact"]
    for m in (8, 16, 24):
        zs, emps, exs, diffs, slack, ties = [], [], [], [], [], 0
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
                    if rs[star] >= 1:
                        continue
                    G = [i for i in range(n) if rs[i] < 1]
                    ties += len(set(y)) < n  # cells with any tie
                    rng = random.Random(f"ppow{tag}{d}{m}{len(rungs)}")  # same pilots as milestone 92
                    cert = 0
                    for _ in range(PILOTS):
                        pil = sorted(rng.sample(range(n), m), key=lambda i: y[i])
                        cert += rs[pil[0]] < 1
                    emp, ex = cert / PILOTS, exact_power(n, m, G, y)
                    sd = max((ex * (1 - ex) / PILOTS) ** 0.5, 1e-9)
                    zs.append((emp - ex) / sd); emps.append(emp); exs.append(ex); diffs.append(abs(emp - ex))
                    slack.append(1 - comb(n - len(G), m) / comb(n, m) - ex)
        out.append(f"{m} | {len(emps)} | {ties} | {sum(abs(z) > 3 for z in zs)} | {max(abs(z) for z in zs):.2f} | "
                   f"{statistics.median(emps):.3f} | {statistics.median(exs):.3f} | {statistics.median(diffs):.3f} | {statistics.median(slack):.3f}")
    (HERE / "pilot_rho_exact_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
