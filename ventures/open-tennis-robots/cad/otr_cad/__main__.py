import argparse
import json
import sys
from pathlib import Path

from .params import Collector, Feeder


def fit_ring(argv) -> int:
    """`python -m otr_cad fit-ring WORD x6 [--set NAME=VALUE]`: the lift bearing pockets' drawn size from the
    printed fit ring (cad/README.md "Bearing fit test ring")."""
    ap = argparse.ArgumentParser(prog="otr_cad fit-ring", description="Pick lift_bearing_fit_mm from the fit ring.")
    ap.add_argument("words", nargs="+", help="one per bore in order: drops, slides, presses, hard or cracks")
    ap.add_argument("--set", action="append", default=[], metavar="NAME=VALUE")
    a = ap.parse_args(argv)
    p = Feeder(**{k: float(v) for k, v in (kv.split("=", 1) for kv in a.set)})
    try:
        r = p.pick_bore_over(a.words)
    except ValueError as e:
        print(f"fit-ring: {e} (bores: {', '.join(f'{o:+.2f}' for o in p.bearing_ring_steps)} mm over)", file=sys.stderr)
        return 2
    print(json.dumps({"bores_mm_over": list(p.bearing_ring_steps), "results": a.words, **r}, indent=2))
    if r["over"] is None:
        return 1
    print(f"rebuild: python -m otr_cad feeder --set lift_bearing_fit_mm={r['over']:g}", file=sys.stderr)
    return 0


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["fit-ring"]:
        return fit_ring(argv[1:])
    from .package import build          # build123d: not needed for fit-ring
    ap = argparse.ArgumentParser(prog="otr_cad", description="Build a manufacturing package for an Open Tennis Robots machine.")
    ap.add_argument("robot", choices=["collector", "feeder"])
    ap.add_argument("--out", default=None)
    ap.add_argument("--set", action="append", default=[], metavar="NAME=VALUE",
                    help="override a parameter, e.g. --set drum_len=500")
    ap.add_argument("--no-drawings", action="store_true")
    a = ap.parse_args(argv)
    overrides = {}
    for kv in a.set:
        k, v = kv.split("=", 1)
        overrides[k] = float(v)
    out = a.out or f"dist/{a.robot}"
    p = (Feeder if a.robot == "feeder" else Collector)(**overrides)
    m = build(Path(out), p, drawings=not a.no_drawings)
    print(json.dumps({k: m[k] for k in ("derived", "design_rules", "collisions", "ground_contacts_z_mm")}, indent=2))
    print(f"package: {out} and {out}-package.zip", file=sys.stderr)
    return 1 if m["design_rules"] or m["collisions"] else 0


sys.exit(main())
