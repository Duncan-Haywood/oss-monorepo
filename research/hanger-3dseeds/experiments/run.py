"""Is a 3D-designed hanger better than a 2D-designed one at 3 cm arm depth? Eight seeds each, wider bounds.

python3 experiments/run.py     (about 25 min on 4 cores; needs numpy)
Writes results.txt next to this file.
"""
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
R = HERE.parents[1]
sys.path[:0] = [str(R / "hanger-3d" / "src"), str(R / "hanger-fit" / "src"), str(HERE.parent / "src")]
from hanger_fit import model as m2  # noqa: E402
from hanger_fit.opt import cmaes, to_hanger  # noqa: E402
from hanger_3d.cloth3d import Arm, drape, score  # noqa: E402
from hanger3dseeds.stats import paired_summary  # noqa: E402
from hanger3dseeds.bounds import to_wide  # noqa: E402

ZH, SEEDS, BUDGET = 3.0, list(range(8)), 64
G = m2.garment("M", "tee")


def obj3(h):
    X, sh = drape(Arm(h, ZH), G)
    s = score(X, sh)
    return s["err_all"] + m2.CREASE_COST * max(0.0, s["crease"] - m2.CREASE_OK), s


def loop3(seed):
    u, fb, hist = cmaes(lambda u: obj3(to_wide(u))[0], 4, BUDGET, seed)
    h = to_wide(u)
    return seed, h, obj3(h)[1]


def loop2(seed):
    u, fb, hist = cmaes(lambda u: m2.objective(m2.score(to_hanger(u), G)), 4, 150, seed)
    h = to_hanger(u)
    X, sh = drape(Arm(h, ZH), G)
    return seed, h, score(X, sh)


def fmt(h):
    return f"w={h.w:.1f} slope={h.slope:.1f} bow={h.bow:.2f} r={h.r:.2f}"


def main():
    P = mp.Pool()
    r3 = P.map(loop3, SEEDS, chunksize=1)
    r2 = P.map(loop2, SEEDS, chunksize=1)
    X, sh = drape(Arm(m2.STOCK["wood-shaped"], ZH), G)
    stock = score(X, sh)
    out = [f"M tee, arm half-depth {ZH:g} cm, CMA-ES 4 variables, 3D loops {BUDGET} drapes on err_all (bounds widened: bow -2..5, r 0.15..6), "
           "2D loops 150 drapes on centre-line error (original bounds), both drawn in 3D",
           "loop seed err err_all crease sag design"]
    for name, rs in (("3d-wide", r3), ("2d-design", r2)):
        for s, h, sc in rs:
            out.append(f"{name} {s} {sc['err']:.3f} {sc['err_all']:.3f} {sc['crease']:.1f} {sc['sag']:.2f} {fmt(h)}")
    out.append(f"stock-wood-shaped - {stock['err']:.3f} {stock['err_all']:.3f} {stock['crease']:.1f} {stock['sag']:.2f} {fmt(m2.STOCK['wood-shaped'])}")
    a = [sc["err_all"] for _, _, sc in r3]
    b = [sc["err_all"] for _, _, sc in r2]
    out.append("")
    out.append("err_all, 3D-designed minus 2D-designed (cm; negative = 3D better)")
    out.append(paired_summary(a, b))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
