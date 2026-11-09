"""Does widening the first keep make the three-rung cells certifiable? (milestone 103). Runs no flow.
Writes pilot_cert_first_results.txt. Usage: python3 pilot_cert_first.py

Milestones 101 and 102 varied the final and middle keeps with the first keep fixed at n//3. Grid here: first keep F in
(8, 16, 25, 35, 50=whole pool) with (M, K) = (16, 8) and (5, 3).
Predictions written first: (1) certified-cell count non-decreasing in F; (2) F = 50 (no cut at r1) certifies exactly
the same cells as F = 35 or more, i.e. the r1 cut stops binding by F = 35; (3) at F = 50 with (16, 8) at most 8 of 20 cells
are certified (the r2/r3 scores, not r1, block the other 12)."""
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
from pilot_rho import ratio  # noqa: E402
from pilot_cert_keep import three_rung_cells  # noqa: E402

FS = (8, 16, 25, 35, 50)
MK = ((5, 3), (16, 8))


def certified(s, n, F, M, K):
    keep = [min(F, n), M, K]
    return sum(ratio(s, ("r1", "r2", "r3"), keep, i, n) < 1 for i in range(n))


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    table = [(t, d, n, {(F, m): certified(s, n, F, *m) for F in FS for m in MK}) for t, d, n, s in three_rung_cells(by)]
    share = lambda F, m: sum(c[(F, m)] >= 1 for *_, c in table)
    mono = all(c[(F, m)] <= c[(F2, m)] for *_, c in table for m in MK for F in FS for F2 in FS if F <= F2)
    out = ["cells with c >= 1 (of %d); rows first keep F, columns (M,K) = %s" % (len(table), " ".join(map(str, MK)))]
    out += [f"F={F:2d} | " + " ".join(f"{share(F, m):2d}" for m in MK) for F in FS]
    out += ["monotone in F in every cell: " + str(mono)]
    (HERE / "pilot_cert_first_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
