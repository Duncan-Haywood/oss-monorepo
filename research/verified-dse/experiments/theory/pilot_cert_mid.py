"""Does widening the middle keep, with the final keep, make the three-rung cells certifiable? (milestone 102). Runs no flow.
Writes pilot_cert_mid_results.txt. Usage: python3 pilot_cert_mid.py

Milestone 101 widened only the final keep K (schedule (n//3, n//9, K)); 13 of 20 cells stayed uncertifiable up to K = 8. A point
is certified iff rho_j < k_j at every rung, so the middle cut M = k_2 may be binding too. Grid: M in (2, 5, 8, 12, 16) x K in
(1, 3, 5, 8), first keep fixed at n//3.
Predictions written first: (1) the number of certified cells is non-decreasing in M and in K (a looser cut cannot remove a
certified point); (2) at K = 1 widening M certifies at most 2 of 20 cells (a point must beat every rival at the last rung);
(3) at the widest corner (M = 16, K = 8) at most 12 of 20 cells have a certified point (so the middle cut does not rescue most)."""
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
from pilot_rho import ratio, ETA  # noqa: E402
from pilot_cert_keep import three_rung_cells  # noqa: E402

MS = (2, 5, 8, 12, 16)
KS = (1, 3, 5, 8)


def certified(s, n, M, K):
    keep = [max(1, n // ETA), M, K]
    return sum(ratio(s, ("r1", "r2", "r3"), keep, i, n) < 1 for i in range(n))


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    table = [(t, d, n, {(M, K): certified(s, n, M, K) for M in MS for K in KS}) for t, d, n, s in three_rung_cells(by)]
    share = lambda M, K: sum(c[(M, K)] >= 1 for *_, c in table)
    mono = all(c[(M, K)] <= c[(M2, K2)] for *_, c in table for M in MS for K in KS for M2 in MS for K2 in KS if M <= M2 and K <= K2)
    out = ["cells with c >= 1 (of %d); rows M (middle keep), columns K (final keep) = %s" % (len(table), " ".join(map(str, KS)))]
    out += [f"M={M:2d} | " + " ".join(f"{share(M, K):2d}" for K in KS) for M in MS]
    out += ["monotone in M and K in every cell: " + str(mono),
            "cell (tag, design, n): c at (M, K) = (5,5) (16,8)"]
    out += [f"{t} {d} n={n}: {c[(5, 5)]} {c[(16, 8)]}" for t, d, n, c in table]
    (HERE / "pilot_cert_mid_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
