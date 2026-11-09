"""Does a larger keep schedule make the three-rung cells certifiable? (milestone 101). Runs no flow.
Writes pilot_cert_keep_results.txt. Usage: python3 pilot_cert_keep.py

Milestone 100 found every three-rung cell has no certified point (ratio < 1) at the eta = 3 schedule k = (n//3, n//9, n//27)
(= 16, 5, 1 at n = 50). A point is certified iff rho_j < k_j at every rung, so it needs rho_r3 < k_last = 1, i.e. to beat every rival
at the last rung strictly. Raising the final keep k_last to K widens the set. The cost: the last stage routes K points, not 1.
Predictions written first: (1) c is non-decreasing in K for every cell (a looser cut cannot remove a certified point);
(2) with K = 2 still no cell has c >= 1 among the 20 three-rung cells' majority (fewer than 5 of 20);
(3) by K = 5 (the two-rung schedule's last keep) at least 15 of 20 three-rung cells have c >= 1."""
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
from pilot_rho import ratio, ETA  # noqa: E402

KS = (1, 2, 3, 5, 8)


def three_rung_cells(by):
    for tag in ("tight", "relaxed"):
        for d in flow.DESIGNS:
            sc = by[(tag, d)]
            n = len(sc)
            s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
            yield tag, d, n, s


def certified(s, n, K):
    keep = [max(1, n // ETA), max(1, n // ETA ** 2), K]
    return sum(ratio(s, ("r1", "r2", "r3"), keep, i, n) < 1 for i in range(n))


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    table = [(t, d, n, [certified(s, n, K) for K in KS]) for t, d, n, s in three_rung_cells(by)]
    out = ["K (final keep) | " + " | ".join(map(str, KS)), "cells with c >= 1 (of %d) | " % len(table) +
           " | ".join(str(sum(c[j] >= 1 for *_, c in table)) for j in range(len(KS))),
           "median c | " + " | ".join(str(sorted(c[j] for *_, c in table)[len(table) // 2]) for j in range(len(KS))),
           "monotone in K in every cell: " + str(all(all(a <= b for a, b in zip(c, c[1:])) for *_, c in table)),
           "cell (tag, design, n): c at each K"]
    out += [f"{t} {d} n={n}: " + " ".join(map(str, c)) for t, d, n, c in table]
    (HERE / "pilot_cert_keep_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
