"""Post hoc (not predicted): is milestone 2b's leftover EA dependence on fabric D stretch or shear?

    python3 experiments/m2b_locking/posthoc_shear.py    (about 20 min on 4 cores; needs numpy)

Written after run.py. In the spring sheet the diagonal (shear) springs carry SHEAR = 0.1 of EA, so
raising EA from 800 to 3200 N/m also raises the shear spring stiffness from 80 to 320 N/m, and
milestone 2a's C6 found shear moves DC by 0.08 to 0.11. This swaps them: EA 3200 with the shear
spring of EA 800 (fraction 0.025, 80 N/m) and EA 800 with the shear spring of EA 3200 (fraction
0.4, 320 N/m). Fabric D on the 2.5 and 3.75 mm grids (where run.py found D close to mesh-converged),
fabric A on 3.75 mm for reference (A is not mesh-converged), seed 0.
"""
import multiprocessing as mp
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run as m2b  # noqa: E402
import cusick  # noqa: E402
from hanger_kes.kes import KES  # noqa: E402

CASES = [(f, ea, sh, h) for f, h in [("D", 0.0025), ("D", 0.00375), ("A", 0.00375)]
         for ea, sh in [(3200.0, 0.025), (800.0, 0.4)]]


def one(c):
    f, ea, sh, h = c
    _, B, W = KES[f]
    t = time.time()
    sp = cusick.Specimen(B, W, ea, h=h, shear=sh)
    r = cusick.solve(sp, 0, maxit=100000)
    return c, (r["dc"], r["iters"], r["last_change"], r["nodes"], time.time() - t)


if __name__ == "__main__":
    base = {}
    for l in (HERE / "results.txt").read_text().splitlines():
        t = l.split()
        if len(t) == 14 and t[0] in "AD" and t[3] == "0":
            base[(t[0], float(t[1]), float(t[2]))] = float(t[5])
    with mp.Pool() as pool:
        res = dict(pool.map(one, sorted(CASES, key=lambda c: c[3]), chunksize=1))
    out = ["post hoc: stretch and shear springs swapped (seed 0)",
           "fabric h_mm EA shear_frac shear_k_N/m DC iters last_change folds sec"]
    for c in CASES:
        d, it, lc, n, s = res[c]
        out.append(f"{c[0]} {c[3]*1000:g} {c[1]:g} {c[2]:g} {c[1]*c[2]:g} {d:.4f} {it} {lc:.5f} {n} {s:.0f}")
    out += ["", "fabric h_mm | DC(EA800,k80) DC(EA3200,k80) DC(EA800,k320) DC(EA3200,k320)  [run.py gives k80 at EA 800, k320 at EA 3200]"]
    for f, h in [("D", 0.0025), ("D", 0.00375), ("A", 0.00375)]:
        hm = h * 1000
        out.append(f"{f} {hm:g} | {base[(f, 800.0, hm)]:.4f} {res[(f, 3200.0, 0.025, h)][0]:.4f} "
                   f"{res[(f, 800.0, 0.4, h)][0]:.4f} {base[(f, 3200.0, hm)]:.4f}")
    (HERE / "posthoc_shear.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
