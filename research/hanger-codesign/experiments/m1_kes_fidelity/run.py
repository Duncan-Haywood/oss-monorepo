"""Milestone 1: does the hanger the 2D chain picks stay the pick in the 3D sheet, on fabrics with
measured KES-FB bending rigidity and weight?

    python3 experiments/m1_kes_fidelity/run.py     (about 4 min on 4 cores; needs numpy)

Writes results.txt next to this file. Reuses, unchanged: `hanger-fit` (2D chain, stock hangers,
worn-shape target), `hanger-3d` (3D sheet over an arm of finite depth) and `hanger-kes` (four
fabrics with B and W from Ramaiah, Radhalakshmi and Nachane, Table 3). Stretch stiffness EA is not
in that table; it is fixed at 150 N/m here (hanger-kes found its sweep did not move the width rule).

Predictions, written before the first run (programme LOG.md, 2026-11-10):
  P1  The stock-hanger ranking (wood-shaped best, then plastic and wire) is the same in all three
      models (2D chain at 5 mm rows, 3D slab arm, 3D 3 cm half-depth arm scored on the whole
      sheet) on all four fabrics. Refuted by any fabric where the order of the best hanger differs.
  P2  The best arm-width offset (wood shape, offsets -1..+3 cm) is the same in the 2D chain and
      the 3D slab on all four fabrics. Refuted by any disagreement.
  P3  With a 3 cm half-depth arm scored on the whole sheet, the best offset is within 1 cm of the
      2D one on all four fabrics. Refuted by a gap of 2 cm or more on any fabric.
  P4  On the slab arm the 3D and 2D errors of the wood-shaped hanger differ by under 0.10 cm on
      every fabric (hanger-3d found <0.05 cm on its assumed fabrics). Refuted by a larger gap.
"""
import dataclasses
import multiprocessing as mp
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = HERE.parents[2]
sys.path[:0] = [str(R / "hanger-3d" / "src"), str(R / "hanger-kes" / "src"),
                str(R / "hanger-sweep" / "src"), str(R / "hanger-fit" / "src")]
from hanger_fit import model as m2  # noqa: E402
from hanger_3d.cloth3d import DS, Arm, drape, score  # noqa: E402
from hanger_kes.kes import KES, kes_garment  # noqa: E402

EA = 150.0
SLAB, SHALLOW = 12.0, 3.0
STOCKS = ["wire", "plastic", "wood-shaped"]
OFFSETS = [-1.0, 0.0, 1.0, 2.0, 3.0]
FABRICS = sorted(KES)


def garment(code):
    return kes_garment(code, EA, "M")


def run2(h, g):
    """2D chain at the 3D sheet's 5 mm row spacing."""
    old = m2.SEG
    m2.SEG = DS
    try:
        return m2.score(h, g)["err"]
    finally:
        m2.SEG = old


def run3(args):
    h, code, zh, iters = args
    X, sh = drape(Arm(h, zh), garment(code), iters=iters)
    s = score(X, sh)
    return s["err"] if zh >= SLAB else s["err_all"]


def width(code, o):
    return dataclasses.replace(m2.STOCK["wood-shaped"], w=garment(code).half_shoulder + o)


def main():
    P = mp.Pool()
    out = [f"hanger-codesign milestone 1. Size M, EA {EA:g} N/m, B and W from hanger-kes (KES-FB, Table 3).",
           "err in cm RMS from the worn shape: 2D chain; 3D slab arm (centre column); 3D 3 cm half-depth arm (whole sheet).", ""]
    out.append("fabric description B(gf.cm2/cm) W(mg/cm2)")
    for c in FABRICS:
        out.append(f"{c} {KES[c][0]!r} {KES[c][1]} {KES[c][2]}")
    # Part 1: stock hangers
    out += ["", "1. stock hangers", "fabric hanger err2d err3d_slab err3d_zh3_all"]
    cases = [(c, n) for c in FABRICS for n in STOCKS]
    e2 = [run2(m2.STOCK[n], garment(c)) for c, n in cases]
    es = P.map(run3, [(m2.STOCK[n], c, SLAB, 3000) for c, n in cases])
    eh = P.map(run3, [(m2.STOCK[n], c, SHALLOW, 3000) for c, n in cases])
    rank = {}
    for i, (c, n) in enumerate(cases):
        out.append(f"{c} {n} {e2[i]:.3f} {es[i]:.3f} {eh[i]:.3f}")
        for k, v in (("2d", e2[i]), ("slab", es[i]), ("zh3", eh[i])):
            rank.setdefault((c, k), []).append((v, n))
    out.append("ranking best->worst per model")
    p1 = True
    for c in FABRICS:
        orders = {k: [n for _, n in sorted(rank[(c, k)])] for k in ("2d", "slab", "zh3")}
        same = orders["2d"] == orders["slab"] == orders["zh3"]
        p1 &= same
        out.append(f"{c} 2d={'>'.join(orders['2d'])} slab={'>'.join(orders['slab'])} zh3={'>'.join(orders['zh3'])} same={same}")
    gap = max(abs(es[i] - e2[i]) for i, (c, n) in enumerate(cases) if n == "wood-shaped")
    # Part 2: width offsets, wood shape
    out += ["", "2. arm width offset from the half shoulder (cm), wood-shaped profile",
            "fabric offset err2d err3d_slab err3d_zh3_all"]
    cases = [(c, o) for c in FABRICS for o in OFFSETS]
    w2 = [run2(width(c, o), garment(c)) for c, o in cases]
    ws = P.map(run3, [(width(c, o), c, SLAB, 3000) for c, o in cases])
    wh = P.map(run3, [(width(c, o), c, SHALLOW, 3000) for c, o in cases])
    best = {}
    for i, (c, o) in enumerate(cases):
        out.append(f"{c} {o:+.0f} {w2[i]:.3f} {ws[i]:.3f} {wh[i]:.3f}")
        for k, v in (("2d", w2[i]), ("slab", ws[i]), ("zh3", wh[i])):
            if v < best.get((c, k), (9e9, 0))[0]:
                best[(c, k)] = (v, o)
    out.append("best offset per fabric: 2d / slab / zh3")
    p2, p3 = True, True
    for c in FABRICS:
        b2, bs, bh = best[(c, "2d")][1], best[(c, "slab")][1], best[(c, "zh3")][1]
        p2 &= b2 == bs
        p3 &= abs(bh - b2) <= 1.0
        out.append(f"{c} {b2:+.0f} {bs:+.0f} {bh:+.0f}")
    # Convergence check: the softest and stiffest fabric at twice the iterations
    out += ["", "3. convergence: wood-shaped, 3000 vs 6000 L-BFGS iterations"]
    chk = [(m2.STOCK["wood-shaped"], c, z, it) for c in (FABRICS[0], FABRICS[-1]) for z in (SLAB, SHALLOW) for it in (3000, 6000)]
    rc = P.map(run3, chk)
    for j in range(0, len(chk), 2):
        out.append(f"{chk[j][1]} zh={chk[j][2]:g} {rc[j]:.4f} {rc[j+1]:.4f} diff={abs(rc[j]-rc[j+1]):.4f}")
    out += ["", f"P1 same stock ranking in all three models on all fabrics: {'held' if p1 else 'refuted'}",
            f"P2 best offset 2D == 3D slab on all fabrics: {'held' if p2 else 'refuted'}",
            f"P3 3 cm arm best offset within 1 cm of 2D on all fabrics: {'held' if p3 else 'refuted'}",
            f"P4 max |err3d_slab - err2d| wood-shaped = {gap:.3f} cm (< 0.10): {'held' if gap < 0.10 else 'refuted'}"]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
