"""Command line: house-spans {span|size|table}. Python -m house_spans.cli works too."""
import argparse

from .model import CASES, DEPTH, SPECIES, Member, check, lateral_note, max_span, size_member, worst


def main(argv=None):
    p = argparse.ArgumentParser(prog="house-spans", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("span", "size"):
        s = sub.add_parser(name)
        s.add_argument("--case", choices=sorted(CASES), default="floor")
        s.add_argument("--species", choices=sorted(SPECIES), default="SPF")
        s.add_argument("--spacing", type=float, default=16.0, help="on-centre spacing, or tributary width, in inches")
        s.add_argument("--plies", type=int, default=1)
        s.add_argument("--pitch", type=float, default=0.0, help="roof rise per 12 of run")
        s.add_argument("--creep", action="store_true")
        if name == "span":
            s.add_argument("--size", choices=sorted(DEPTH), default="2x10")
        else:
            s.add_argument("--span", type=float, required=True, help="clear span in feet")
    t = sub.add_parser("table")
    t.add_argument("--case", choices=sorted(CASES), default="floor")
    t.add_argument("--species", choices=sorted(SPECIES), default="SPF")
    a = p.parse_args(argv)
    if a.cmd == "span":
        m = Member(a.size, a.plies, a.species, a.spacing, pitch=a.pitch)
        ft, gov = max_span(m, CASES[a.case], a.creep)
        print(f"{a.plies}-ply {a.size} {a.species} No. 2 at {a.spacing:g} in, {a.case}: max clear span {int(ft)} ft "
              f"{(ft - int(ft)) * 12:.0f} in, governed by {gov}")
        print("lateral support:", lateral_note(m))
    elif a.cmd == "size":
        r = size_member(a.span, CASES[a.case], a.species, a.spacing, a.plies, tuple(s for s in DEPTH if s != "2x4"), a.pitch, creep=a.creep)
        print("no 2x6 to 2x12 carries that span" if r is None else f"{a.plies}-ply {r[0]}: governed by {r[1]} at {r[2]:.2f}")
    else:
        print(f"max clear span (ft-in), {a.species} No. 2, case {a.case}")
        print("size     " + "".join(f"{sp:>14g} in" for sp in (12, 16, 19.2, 24)))
        for s in ("2x6", "2x8", "2x10", "2x12"):
            row = f"{s:<8} "
            for sp in (12, 16, 19.2, 24):
                ft, gov = max_span(Member(s, spacing_in=sp), CASES[a.case])
                row += f"  {int(ft)}'{(ft - int(ft)) * 12:>4.1f}\" {gov[:4]:<4}"
            print(row)


if __name__ == "__main__":
    main()
