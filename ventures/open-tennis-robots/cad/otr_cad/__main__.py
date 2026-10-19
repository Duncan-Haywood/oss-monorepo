import argparse
import json
import sys
from pathlib import Path

from .package import build
from .params import Collector


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="otr_cad", description="Build a manufacturing package for an Open Tennis Robots machine.")
    ap.add_argument("robot", choices=["collector"])
    ap.add_argument("--out", default="dist/collector")
    ap.add_argument("--set", action="append", default=[], metavar="NAME=VALUE",
                    help="override a parameter, e.g. --set drum_len=500")
    ap.add_argument("--no-drawings", action="store_true")
    a = ap.parse_args(argv)
    overrides = {}
    for kv in a.set:
        k, v = kv.split("=", 1)
        overrides[k] = float(v)
    p = Collector(**overrides)
    m = build(Path(a.out), p, drawings=not a.no_drawings)
    print(json.dumps({k: m[k] for k in ("derived", "design_rules", "collisions", "ground_contacts_z_mm")}, indent=2))
    print(f"package: {a.out} and {a.out}-package.zip", file=sys.stderr)
    return 1 if m["design_rules"] or m["collisions"] else 0


sys.exit(main())
