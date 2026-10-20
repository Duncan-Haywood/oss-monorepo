"""Joint checks and CAD for the two-piece hanger. Writes results.txt and cad/*.stl|scad.

    python3 experiments/run.py        # under a second
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from hanger_split import split, joint  # noqa: E402
from hanger_print import geom, mesh, strength as S  # noqa: E402

SHAPE = dict(slope=15.92, bow=0.59, r=2.86)         # hanger-fit's adjustable shape
WIDTHS = [("child", 15.8), ("rack 16", 16), ("rack 19", 19), ("rack 22", 22), ("M adj", 22.8), ("rack 25", 25), ("XXL adj", 25.8)]
MARGIN = 10.0                                       # mm, brim and skirt allowance on a 220 bed


def depth_for_joint(d, j, creep, sf=3.0, peg=False):
    lo, hi = 1.0, 200.0
    for _ in range(60):
        mid = (lo + hi) / 2
        dd = geom.Design(d.w, d.slope, d.bow, d.r, depth=mid)
        if joint.checks(dd, j, creep, peg)[2] >= sf:
            hi = mid
        else:
            lo = mid
    return hi


def main():
    j = split.Joint()
    out = ["assumptions: PLA bearing 30 MPa, in-plane shear 15 MPa, tension 40 MPa, hole Kt 2.5, steel bolt shear 150 MPa, printed peg shear 12 MPa; "
           "design garment 1.5 kg, dynamic x2; depth 12 mm; creep factor multiplies every PLA allowable",
           f"default joint: M{j.bolt_d:g} bolts at y {j.y_low:g} and {j.y_high:g} mm (spacing {j.spacing:g}), boss radius {j.boss_r:g} mm, hole {j.hole_d:g} mm",
           "== A. One half, one arm with its hub: does it fit a 220 mm bed (best turn, deg; longer side mm), joint safety factor (creep 1 / 0.5) and governing mode",
           f"{'design':<10} {'w_cm':>5} {'fits220':>8} {'turn':>5} {'side_mm':>8} {'fits210':>8} {'Fb_N':>6} {'SF_c1':>6} {'SF_c.5':>7} {'mode':<8} {'arm_SF':>7}"]
    for nm, w in WIDTHS:
        d = geom.Design(w=w, **SHAPE)
        ok, a, bw, bh = split.bed_fit(d, j, 220)
        ok2 = max(bw, bh) <= 220 - MARGIN
        sf1 = joint.checks(d, j, 1.0)
        sf5 = joint.checks(d, j, 0.5)
        out.append(f"{nm:<10} {w:5.1f} {('yes' if ok else 'no'):>8} {a:5d} {max(bw, bh):8.1f} {('yes' if ok2 else 'no'):>8} "
                   f"{joint.bolt_force(d, j):6.1f} {sf1[2]:6.2f} {sf5[2]:7.2f} {sf5[1]:<8} {S.safety_factor(d):7.1f}")
    d = geom.Design(w=22.8, **SHAPE)
    out.append("== B. Bolt size and spacing, M size (w 22.8), depth 12, creep 0.5: governing safety factor (mode); boss radius = 2 x bolt diameter (6 mm minimum), spacing centred 1 mm below the hook; at 40 mm the bosses reach the hub edge")
    out.append(f"{'bolt':<6}" + "".join(f"{'s=' + str(s) + ' mm':>20}" for s in (20, 30, 40)))
    for bd in (3.0, 4.0, 5.0):
        row = f"M{bd:g}".ljust(6)
        for s in (20, 30, 40):
            jj = split.Joint(bolt_d=bd, boss_r=max(2.0 * bd, 6.0), y_low=-s / 2 - 1.0, y_high=s / 2 - 1.0)
            sf, gov, v = joint.checks(d, jj, 0.5)
            row += f"{v:12.2f} ({gov:<7})"
        out.append(row)
    out.append("== C. Hardware-free: printed pegs (shear 12 MPa along the layers) against steel M4 bolts, M size, creep 0.5")
    for peg in (False, True):
        for bd in (4.0, 5.0, 6.0):
            jj = split.Joint(bolt_d=bd, boss_r=max(2.0 * bd, 6.0))
            sf, gov, v = joint.checks(d, jj, 0.5, peg=peg)
            out.append(f"{'peg' if peg else 'bolt'} d={bd:g}: SF {v:5.2f} ({gov}); bolt-or-peg shear alone {sf['bolt']:6.2f}")
    out.append("== D. Depth (front to back) that gives the joint a safety factor of 3, M size, default joint, against the arm's own need")
    out.append(f"arm alone (hanger-print): {S.depth_for_sf(d):.2f} mm")
    for creep in (1.0, 0.5):
        out.append(f"joint, creep {creep}: bolts {depth_for_joint(d, j, creep):.1f} mm; printed M4-size pegs: depth does not help, "
                   f"shear alone is SF {joint.checks(d, j, creep, peg=True)[0]['bolt']:.2f}")
    out.append("== E. Extra plastic of the two bolt bosses per half, and the hanger's sliced mass for reference")
    out.append(f"bosses, both halves, solid: {2 * joint.joint_mass_g(d, j):.1f} g (one-piece hanger-print M size, at 6 mm: see hanger-print results.txt)")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")

    cad = HERE / "cad"
    cad.mkdir(exist_ok=True)
    for w in (16, 19, 22, 25, 25.8):
        dd = geom.Design(w=w, **SHAPE, depth=12.0)
        tag = f"w{w:g}".replace(".", "_")
        (cad / f"half_{tag}.stl").write_text(mesh.stl(split.half_mesh(dd, j), f"half_{tag}"))
        (cad / f"half_{tag}.scad").write_text(split.scad(dd, j, f"half {tag}"))
    dd = geom.Design(w=22.0, **SHAPE, depth=12.0)
    m = split.half_mesh(dd, j)
    (cad / "assembled_w22.stl").write_text(mesh.stl(m + split.turned(m, dd.depth), "assembled_w22"))
    print("\n".join(out))


if __name__ == "__main__":
    main()
