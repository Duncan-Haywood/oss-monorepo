#!/usr/bin/env python3
"""Render one real subscriber record, so the product is a document and not a claim.

Defaults to `@naumu/mcp` 0.1.0 -> 0.1.5, which is the most instructive pair in
the held-out corpus rather than the most flattering: the hand labels say eight
of its description changes carry newly added model-directed text, and the rules
find two. The record this script writes is what a subscriber would actually
have received, misses included. `README.md` sets the ground truth beside it.

Usage
-----
    python3 render_sample.py                       # the default pair, to stdout
    python3 render_sample.py --out sample.md
    python3 render_sample.py --package @x/mcp --from 1.0.0 --to 2.0.0
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "research", "mcp-tool-drift"
    ),
)

from classify_drift import NPM, fetch, fetch_json  # noqa: E402

from drift_watch import diff_pins, pin_from_tarball  # noqa: E402
from subscriber_record import render_record  # noqa: E402


def take_pin(server: str, package: str, version: str, meta: dict):
    tarball = fetch(meta["versions"][version]["dist"]["tarball"])
    observed = meta["time"][version][:10]
    return pin_from_tarball(server, package, version, observed, tarball)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--package", default="@naumu/mcp")
    ap.add_argument("--server", default="io.github.naumu/mcp")
    ap.add_argument("--from", dest="old", default="0.1.0")
    ap.add_argument("--to", dest="new", default="0.1.5")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    meta = fetch_json(f"{NPM}/{urllib.parse.quote(args.package, safe='@')}")
    old = take_pin(args.server, args.package, args.old, meta)
    new = take_pin(args.server, args.package, args.new, meta)
    text = render_record(args.server, old, new, diff_pins(old, new))

    if args.out:
        with open(args.out, "w") as fh:
            fh.write(text + "\n")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
