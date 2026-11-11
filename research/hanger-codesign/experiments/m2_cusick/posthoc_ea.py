"""Post hoc (not predicted): does the drape coefficient level off as stretch stiffness EA grows
towards an inextensible sheet, and how much does the mesh matter there?

    python3 experiments/m2_cusick/posthoc_ea.py    (about 10 min on 4 cores; needs numpy)

Written after run.py refuted C5 (EA 40 against 800 N/m moved DC by 0.15 to 0.23). Fabrics A and D,
seeds 0 and 1, EA 150 to 12,800 N/m on the 5 mm grid, and EA 3200 on the 7.5 mm grid.
"""
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[2] / "hanger-kes" / "src"))
import cusick  # noqa: E402
from hanger_kes.kes import KES  # noqa: E402

EAS = [150.0, 800.0, 3200.0, 12800.0]
CASES = [(f, ea, h, s) for f in ("A", "D") for s in (0, 1)
         for ea, h in [(e, 0.005) for e in EAS] + [(3200.0, 0.0075)]]


def one(c):
    f, ea, h, s = c
    _, B, W = KES[f]
    r = cusick.drape(B, W, ea, seed=s, h=h, maxit=60000)
    return c, (r["dc"], r["iters"], r["last_change"], r["nodes"], r["drop"])


if __name__ == "__main__":
    res = dict(mp.Pool().map(one, CASES, chunksize=1))
    out = ["post hoc: DC against EA (5 mm grid unless stated), seeds 0 and 1",
           "fabric EA h_mm seed DC iters last_change nodes drop_cm"]
    for c in CASES:
        d, it, lc, n, dr = res[c]
        out.append(f"{c[0]} {c[1]:g} {c[2]*1000:g} {c[3]} {d:.4f} {it} {lc:.5f} {n} {dr:.2f}")
    out += ["", "fabric EA h_mm mean_DC"]
    for f in ("A", "D"):
        for ea, h in [(e, 0.005) for e in EAS] + [(3200.0, 0.0075)]:
            out.append(f"{f} {ea:g} {h*1000:g} {np.mean([res[(f, ea, h, s)][0] for s in (0, 1)]):.4f}")
    (HERE / "posthoc_ea.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
