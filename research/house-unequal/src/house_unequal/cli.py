"""Command line: house-unequal --size 2x10 --case floor. python -m house_unequal.cli works too."""
import argparse

from house_spans.model import CASES, DEPTH, SPECIES, Member

from .model import max_total


def _fi(ft):
    n = int(ft * 12)
    return f"{n // 12} ft {n % 12} in"


def main(argv=None):
    p = argparse.ArgumentParser(prog="house-unequal", description=__doc__)
    p.add_argument("--case", choices=sorted(CASES), default="floor")
    p.add_argument("--species", choices=sorted(SPECIES), default="SPF")
    p.add_argument("--spacing", type=float, default=16.0, help="on-centre spacing in inches")
    p.add_argument("--size", choices=sorted(DEPTH), default="2x10")
    p.add_argument("--interior-bearing", type=float, default=3.5, help="bearing length at the beam, inches")
    a = p.parse_args(argv)
    m = Member(a.size, 1, a.species, a.spacing)
    print(f"{a.size} {a.species} No. 2 at {a.spacing:g} in, {a.case}: longest total clear width, beam placed so the short span is ratio x the long span")
    for ratio in (1.0, 0.9, 0.8, 0.7, 0.6, 0.5):
        tot, gov = max_total(m, CASES[a.case], ratio, a.interior_bearing)
        print(f"  ratio {ratio:.1f}: {_fi(tot)} total ({_fi(tot / (1 + ratio))} + {_fi(tot * ratio / (1 + ratio))}), governed by {gov}")


if __name__ == "__main__":
    main()
