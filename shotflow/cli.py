from __future__ import annotations

import argparse
import json
from pathlib import Path

from .ingest import build_ingest_plan


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="shotflow",
        description="Plan safe, non-destructive ingest of photo and video shoots.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest = subparsers.add_parser(
        "plan-ingest",
        help="Create a JSON ingest manifest without copying, moving, or deleting files.",
    )
    ingest.add_argument("source", type=Path, help="Mounted card, drive, or shoot folder")
    ingest.add_argument("library", type=Path, help="Destination library root")
    ingest.add_argument("--shoot-name", required=True, help="Human-readable shoot name")
    ingest.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indentation for the manifest output",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "plan-ingest":
        plan = build_ingest_plan(args.source, args.library, shoot_name=args.shoot_name)
        print(json.dumps(plan.to_manifest(), indent=args.indent, sort_keys=True))
        return

    parser.error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
