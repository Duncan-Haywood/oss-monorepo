"""Re-solve each haul instance as a plain LP with SciPy's HiGHS and compare.

    node check/dump_haul.mjs > haul.json && python3 check/haul_differential.py haul.json

Each cell's bank net volume is a supply (> 0) or a demand (< 0); the side
with less gets a zero-cost dummy (export or import), as in haul.mjs. The LP
minimises the sum of volume x straight-line distance. Exit 1 on any
disagreement over 1e-7 relative.
"""
import json
import sys

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix


def solve(cells):
    c = np.array(cells)
    src = c[c[:, 2] > 0]
    snk = c[c[:, 2] < 0]
    a, b = src[:, 2], -snk[:, 2]
    m, n = len(a), len(b)
    cost = np.hypot(src[:, None, 0] - snk[None, :, 0], src[:, None, 1] - snk[None, :, 1])
    if a.sum() > b.sum():
        cost = np.hstack([cost, np.zeros((m, 1))]); b = np.append(b, a.sum() - b.sum()); n += 1
    elif b.sum() > a.sum():
        cost = np.vstack([cost, np.zeros((1, n))]); a = np.append(a, b.sum() - a.sum()); m += 1
    rows, cols = [], []
    for i in range(m):
        for j in range(n):
            rows += [i, m + j]; cols += [i * n + j, i * n + j]
    A = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(m + n, m * n)).tocsr()
    r = linprog(cost.ravel(), A_eq=A, b_eq=np.concatenate([a, b]), bounds=(0, None), method="highs")
    assert r.status == 0, r.message
    return r.fun, m, n


def main(path):
    bad = 0
    lines = []
    for case in json.load(open(path)):
        fun, m, n = solve(case["cells"])
        rel = abs(fun - case["moment"]) / max(1.0, abs(fun))
        ok = rel <= 1e-7 and case["optimal"]
        bad += not ok
        avg = case["moment"] / case["moved"] if case["moved"] else 0
        lines.append(f"{'ok ' if ok else 'BAD'} {case['name']}: {case['n']} cells, {m}x{n} LP; "
                     f"haul.mjs {case['moment']:.6f} cu yd-ft (avg {avg:.2f} ft, {case['pivots']} pivots, {case['ms']} ms), "
                     f"HiGHS {fun:.6f}, rel diff {rel:.1e}")
    print("\n".join(lines))
    print(f"{len(lines) - bad} of {len(lines)} instances agree")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
