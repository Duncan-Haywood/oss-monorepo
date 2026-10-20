"""All experiments for hanger-wrap; writes results.txt next to this file (about 10 min on 4 cores).

PYTHONPATH=src python3 experiments/run.py
"""
import math
import multiprocessing as mp
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_wrap.model3d import CM, STOCK, Hanger, Sheet, drape, garment, score  # noqa: E402
from hanger_fit.model import drape as drape2, score as score2  # noqa: E402

HERE = Path(__file__).resolve().parent
ITERS = 1500          # then 500 more; the change between the two is the convergence tolerance


def one(args):
    """Score one (hanger, garment) in 2D and 3D: (key, 2D score, 3D score, 3D iterations)."""
    key, h, size, fabric, ds = args
    g = garment(size, fabric)
    s2 = score2(h, g)
    sh = Sheet(g, ds=ds, dt=ds)
    X, sh, it = drape(h, g, iters=ITERS, sh=sh)
    b1 = score(X, sh, g)
    X, sh, it2 = drape(h, g, iters=500, sh=sh, start=X)
    b = score(X, sh, g)
    b["drift"] = abs(b["err"] - b1["err"])
    return key, s2, b, it + it2


def run(jobs):
    with mp.Pool(4) as pool:
        return pool.map(one, jobs, chunksize=1)


def fmt(r):
    return f"{r:7.2f}"


def main():
    out = []
    P = out.append
    P("hanger-wrap results: 3D sheet drape vs the 2D chain of hanger-fit. err = seam-row RMS shape error (cm),")
    P("crease = sharpest bend along the seam (deg/cm), cross = sharpest bend across the arm (deg/cm).\n")

    # A. stock hangers the 3D grid can resolve, three fabrics, mid size
    P("== A. Stock hangers, size M: 2D chain vs 3D sheet")
    P("hanger fabric   err2D  err3D  crease2D crease3D  cross3D  drift")
    jobs = [((k, f), STOCK[k], "M", f, 0.5 * CM) for k in ("plastic", "wood-shaped") for f in ("tee", "shirt", "sweater")]
    resA = run(jobs)
    for (k, f), a, b, it in resA:
        P(f"{k:11s} {f:8s}{fmt(a['err'])}{fmt(b['err'])}{fmt(a['crease'])}{fmt(b['crease'])}{fmt(b['cross'])}{fmt(b['drift'])}")
    P("")

    # B. arm width sweep: does the 3D sheet agree on the best width? (size M tee, wood-shaped arm)
    P("== B. Arm half-width sweep, size M tee, r = 2 cm: 2D vs 3D")
    P("w_cm   err2D  err3D  crease2D crease3D")
    ws = [18.0, 19.0, 20.0, 21.0, 22.0, 22.8, 24.0, 25.0, 26.0]
    base = STOCK["wood-shaped"]
    resB = run([(w, replace(base, w=w), "M", "tee", 0.5 * CM) for w in ws])
    for w, a, b, it in resB:
        P(f"{w:5.1f}{fmt(a['err'])}{fmt(b['err'])}{fmt(a['crease'])}{fmt(b['crease'])}")
    e2 = [a["err"] for _, a, _, _ in resB]
    e3 = [b["err"] for _, _, b, _ in resB]
    P(f"argmin w: 2D {ws[int(np.argmin(e2))]:.1f}  3D {ws[int(np.argmin(e3))]:.1f}; correlation of err across w: {np.corrcoef(e2, e3)[0, 1]:.3f}")
    P("")

    # C. arm thickness: what the 3D sheet adds is the bend across the arm
    P("== C. Arm radius, size M tee, w = 22.8 cm: bend across the arm")
    P("r_cm   err2D  err3D  crease2D crease3D  cross3D")
    rs = [0.5, 1.0, 1.5, 2.0, 3.0]
    resC = run([(r, replace(base, w=22.8, r=r), "M", "tee", 0.5 * CM) for r in rs])
    for r, a, b, it in resC:
        P(f"{r:5.1f}{fmt(a['err'])}{fmt(b['err'])}{fmt(a['crease'])}{fmt(b['crease'])}{fmt(b['cross'])}")
    P("")

    # D. sizes on one stock hanger
    P("== D. Sizes on the wood-shaped stock hanger, tee: 2D vs 3D")
    P("size   err2D  err3D  crease2D crease3D")
    resD = run([(sz, STOCK["wood-shaped"], sz, "tee", 0.5 * CM) for sz in ("child", "S", "M", "XXL")])
    for sz, a, b, it in resD:
        P(f"{sz:6s}{fmt(a['err'])}{fmt(b['err'])}{fmt(a['crease'])}{fmt(b['crease'])}")
    P("")

    # E. resolution: 1 cm grid against the 0.5 cm grid
    P("== E. Grid resolution, size M tee, wood-shaped: 1 cm vs 0.5 cm spacing")
    resE = run([(ds, STOCK["wood-shaped"], "M", "tee", ds * CM) for ds in (1.0, 0.5)])
    for ds, a, b, it in resE:
        P(f"ds {ds:.1f} cm  err3D {b['err']:.2f}  crease3D {b['crease']:.1f}  cross3D {b['cross']:.1f}  iters {it}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
