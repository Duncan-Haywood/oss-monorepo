"""Run the print checks on hanger-fit's designs. Writes results.txt and cad/*.stl, cad/*.scad.

    PYTHONPATH=src python3 experiments/run.py        # under a second
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from hanger_print import geom, mesh, strength as S  # noqa: E402

# hanger-fit's adjustable shape (results.txt section D): slope 15.92, bow 0.59, r 2.86.
SHAPE = dict(slope=15.92, bow=0.59, r=2.86)
SIZES = [("child", 15), ("wS", 18), ("S", 21), ("M", 22), ("L", 23), ("XL", 24), ("XXL", 25)]
RACK = [16, 19, 22, 25]                                   # hanger-fit section E, k = 4 (w, cm)
STOCK = {"wire-like": dict(w=20.5, slope=22.0, bow=0.0, r=0.15),
         "plastic-like": dict(w=20.0, slope=20.0, bow=0.3, r=0.5),
         "wood-like": dict(w=22.5, slope=16.0, bow=0.8, r=2.0)}
BEDS = (220, 256)


def row(name, d):
    shells = geom.shells(d)
    sf = S.safety_factor(d)
    dreq = S.depth_for_sf(d)
    d3 = geom.Design(d.w, d.slope, d.bow, d.r, depth=max(dreq, 6.0))
    shells3 = geom.shells(d3)
    fit = [geom.bbox_fits(d, b) for b in BEDS] + [geom.bbox_fits(d, 220, half=True)]
    return (f"{name:<14} {d.w:5.1f} {d.r:4.2f} {sf:6.2f} {dreq:6.1f} {S.tip_deflection(d):6.3f} "
            f"{S.sliced_mass_g(shells3, d3.depth):6.0f}   "
            + "  ".join(("yes" if f[0] else "no ") + f"@{f[1]:2d}" for f in fit)
            + f"  {S.loop_stress(d):5.2f}")


def main():
    out = ["assumptions: PLA E 3500 MPa, allowable 40 MPa in plane, Kt 2, dynamic x2, design garment 1.5 kg, depth 12 mm unless stated",
           "== A. Printed designs: safety factor at depth 12 mm; depth needed for SF 3 (mass uses at least 6 mm); tip deflection; sliced mass at that depth; fits a 220 / 256 mm bed whole, and one arm with its hub on 220 (best turn, deg); loop stress MPa",
           f"{'design':<14} {'w_cm':>5} {'r_cm':>4} {'SF12':>6} {'d_SF3':>6} {'defl':>6} {'mass_g':>8}   {'bed220':<7} {'bed256':<7} {'half220':<8} {'loop':>5}"]
    for k, (nm, hs) in enumerate(SIZES):
        out.append(row("adj " + nm, geom.Design(w=hs + 0.8, **SHAPE)))
    for w in RACK:
        out.append(row(f"rack w{w}", geom.Design(w=w, **SHAPE)))
    for nm, p in STOCK.items():
        out.append(row(nm, geom.Design(**p)))
    out.append("== B. Round end against stiffness: w 23 cm, slope/bow of the adjustable shape, 12 mm deep")
    out.append(f"{'r_cm':>5} {'SF12':>7} {'d_SF3_mm':>9} {'mass_g':>7} {'defl_mm':>8}")
    for r in (0.15, 0.3, 0.5, 1.0, 1.5, 2.0, 2.86):
        d = geom.Design(w=23.0, slope=SHAPE["slope"], bow=SHAPE["bow"], r=r)
        dreq = S.depth_for_sf(d)
        d3 = geom.Design(d.w, d.slope, d.bow, d.r, depth=max(dreq, 6.0))
        out.append(f"{r:5.2f} {S.safety_factor(d):7.2f} {dreq:9.1f} {S.sliced_mass_g(geom.shells(d3), d3.depth):7.0f} "
                   f"{S.tip_deflection(d):8.3f}")
    out.append("== C. Tip deflection against the shape error hanger-fit reports")
    out.append("deflection of the printed adjustable arm at 12 mm depth, M size: "
               f"{S.tip_deflection(geom.Design(w=22.8, **SHAPE)):.3f} mm; hanger-fit's adjustable error: 1.6 mm (0.16 cm)")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")

    cad = HERE / "cad"
    cad.mkdir(exist_ok=True)
    for w in RACK:
        d = geom.Design(w=w, **SHAPE, depth=round(max(S.depth_for_sf(geom.Design(w=w, **SHAPE)), 6.0), 1))
        (cad / f"rack_w{w}.stl").write_text(mesh.stl(mesh.hanger_mesh(d), f"rack_w{w}"))
        (cad / f"rack_w{w}.scad").write_text(mesh.scad(d, f"rack w{w}"))
    print("\n".join(out))


if __name__ == "__main__":
    main()
