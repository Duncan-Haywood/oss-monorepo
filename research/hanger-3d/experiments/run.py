"""All experiments for hanger-3d; writes results.txt next to this file.

python3 experiments/run.py      (about 10 min on 4 cores; needs numpy and hanger-fit's source)
"""
import math
import multiprocessing as mp
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[0] / "src"), str(HERE.parents[1] / "hanger-fit" / "src")]
from hanger_fit import model as m2  # noqa: E402
from hanger_3d.cloth3d import DS, Arm, drape, score  # noqa: E402

SLAB = 12.0      # arm half-depth (cm) beyond the sheet's 10: nothing varies in depth
STOCKS = ["wire", "plastic", "wood-shaped"]


def run3(args):
    h, g, zh = args
    X, sh = drape(Arm(h, zh), g)
    return score(X, sh)


def run2(h, g):
    old = m2.SEG
    m2.SEG = DS
    try:
        return m2.score(h, g)
    finally:
        m2.SEG = old


def main():
    out = []
    P = mp.Pool()
    # A. slab arm vs the 2D chain
    out.append("A. slab arm (zh=12 cm) vs hanger-fit 2D chain, size M. err cm RMS, crease deg/cm")
    out.append("hanger fabric err3d err2d@5mm err2d@2.5mm crease3d crease2d@5mm crease2d@2.5mm")
    cases = [(n, f) for n in STOCKS for f in ("tee", "shirt", "sweater")]
    r3 = P.map(run3, [(m2.STOCK[n], m2.garment("M", f), SLAB) for n, f in cases])
    worst, worst_c = 0.0, 0.0
    for (n, f), s3 in zip(cases, r3):
        g = m2.garment("M", f)
        a, b = run2(m2.STOCK[n], g), m2.score(m2.STOCK[n], g)
        worst = max(worst, abs(s3["err"] - a["err"]))
        worst_c = max(worst_c, abs(s3["crease"] - a["crease"]))
        out.append(f"{n} {f} {s3['err']:.3f} {a['err']:.3f} {b['err']:.3f} "
                   f"{s3['crease']:.1f} {a['crease']:.1f} {b['crease']:.1f}")
    out.append(f"max |err3d - err2d@5mm| = {worst:.3f} cm; max |crease3d - crease2d@5mm| = {worst_c:.1f} deg/cm")
    # B. arm depth
    out.append("")
    out.append("B. arm half-depth zh (cm), size M tee. err = centre column; err_all = whole sheet; sag = edge below centre (cm)")
    out.append("hanger zh err err_all crease sag")
    zhs = [12.0, 3.0, 1.0, 0.5, 0.0]
    cases = [(n, z) for n in STOCKS for z in zhs]
    r3 = P.map(run3, [(m2.STOCK[n], m2.garment("M", "tee"), z) for n, z in cases])
    for (n, z), s in zip(cases, r3):
        out.append(f"{n} {z:g} {s['err']:.3f} {s['err_all']:.3f} {s['crease']:.1f} {s['sag']:.2f}")
    # C. width offset
    out.append("")
    out.append("C. arm width offset from the half shoulder (cm), hanger slope 16 deg, bow 0.8, r 2.0, tee. err cm")
    out.append("size offset err2d err3d_slab err3d_zh1.5")
    offs = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0]
    sizes = ["child", "M", "XXL"]
    cases = [(s, o) for s in sizes for o in offs]
    hs = {(s, o): m2.Hanger(w=m2.SIZES[s] + o, slope=16.0, bow=0.8, r=2.0) for s, o in cases}
    ra = P.map(run3, [(hs[c], m2.garment(c[0], "tee"), SLAB) for c in cases])
    rb = P.map(run3, [(hs[c], m2.garment(c[0], "tee"), 1.5) for c in cases])
    best = {}
    for c, a, b in zip(cases, ra, rb):
        e2 = run2(hs[c], m2.garment(c[0], "tee"))["err"]
        out.append(f"{c[0]} {c[1]:+.1f} {e2:.3f} {a['err']:.3f} {b['err']:.3f}")
        for k, v in (("2d", e2), ("slab", a["err"]), ("zh1.5", b["err"])):
            if v < best.get((c[0], k), (9e9, 0))[0]:
                best[(c[0], k)] = (v, c[1])
    out.append("best offset (cm) per size: 2d / 3d slab / 3d zh=1.5")
    for s in sizes:
        out.append(f"{s} {best[(s,'2d')][1]:+.1f} {best[(s,'slab')][1]:+.1f} {best[(s,'zh1.5')][1]:+.1f}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
