"""Command line: show a plan's takeoff, bill of materials and rule checks, or write it as IFC."""
import argparse
import sys

from .plan import Params, make_plan
from .rules import check_layout
from .takeoff import bom_lines, takeoff


def main(argv=None):
    ap = argparse.ArgumentParser(prog="house-plan", description="Parametric house plan: takeoff, rules, IFC")
    ap.add_argument("--width", type=float, default=28.0, help="footprint width, ft")
    ap.add_argument("--depth", type=float, default=28.0, help="footprint depth, ft")
    ap.add_argument("--beds", type=int, default=2)
    ap.add_argument("--bed-depth", type=float, default=12.0)
    ap.add_argument("--pitch", type=int, default=6)
    ap.add_argument("--stud-oc", type=int, default=16, choices=(16, 24))
    ap.add_argument("--joist-oc", type=int, default=16, choices=(16, 24))
    ap.add_argument("--rafter-oc", type=int, default=24, choices=(16, 24))
    ap.add_argument("--ifc", metavar="PATH", help="also write an IFC4 file (needs ifcopenshell)")
    a = ap.parse_args(argv)
    p = Params(width=a.width, depth=a.depth, n_bed=a.beds, bed_depth=a.bed_depth, pitch=a.pitch,
               stud_oc=a.stud_oc, joist_oc=a.joist_oc, rafter_oc=a.rafter_oc)
    plan = make_plan(p)
    t = takeoff(plan)
    print(f"{p.width:g} x {p.depth:g} ft, {p.width * p.depth:.0f} sq ft; " + ", ".join(f"{r.name} {r.w:.1f}x{r.d:.1f}" for r in plan.rooms))
    print("sizes:", t["sizes"], "(central bearing wall)" if t["central_wall"] else "")
    print("\n".join(bom_lines(t)))
    print(f"framing {t['total_bf']:.0f} bf = {t['total_bf'] / t['floor_area']:.2f} bf/sq ft")
    problems = t["failures"] + check_layout(plan)
    for x in problems:
        print("FAIL:", x)
    if a.ifc:
        from .ifc import export
        export(plan, t, a.ifc)
        print("wrote", a.ifc)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
