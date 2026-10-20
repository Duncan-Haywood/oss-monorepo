"""Command line: house-continuous {span|compare}. python -m house_continuous.cli works too."""
import argparse

from house_spans.model import CASES, DEPTH, SPECIES, Member
from house_spans.model import max_span as simple_max_span

from .model import max_span


def _fi(ft):
    n = int(ft * 12)
    return f"{n // 12} ft {n % 12} in"


def main(argv=None):
    p = argparse.ArgumentParser(prog="house-continuous", description=__doc__)
    p.add_argument("cmd", choices=("span", "compare"))
    p.add_argument("--case", choices=sorted(CASES), default="floor")
    p.add_argument("--species", choices=sorted(SPECIES), default="SPF")
    p.add_argument("--spacing", type=float, default=16.0, help="on-centre spacing in inches")
    p.add_argument("--size", choices=sorted(DEPTH), default="2x10")
    p.add_argument("--spans", type=int, choices=(2, 3), default=2)
    p.add_argument("--interior-bearing", type=float, default=3.5, help="bearing length at the middle support, inches")
    a = p.parse_args(argv)
    m = Member(a.size, 1, a.species, a.spacing)
    c = CASES[a.case]
    cont, gov = max_span(m, c, a.spans, interior_bearing_in=a.interior_bearing)
    simple, sgov = simple_max_span(m, c)
    print(f"{a.size} {a.species} No. 2 at {a.spacing:g} in, {a.case}:")
    print(f"  simple span      {_fi(simple)} clear, governed by {sgov}")
    print(f"  {a.spans}-span continuous {_fi(cont)} clear per span, governed by {gov}")


if __name__ == "__main__":
    main()
