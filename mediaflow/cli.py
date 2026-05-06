from __future__ import annotations

import argparse
import json
from pathlib import Path

from mediaflow.ingest import IngestOptions, detect_media_sources, execute_plan, plan_ingest


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="mediaflow",
        description="Plan and execute checksum-verified media ingests for large photo/video shoots.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    sources = subcommands.add_parser("sources", help="Detect likely camera-card or shoot-folder sources.")
    sources.add_argument(
        "roots",
        nargs="+",
        type=Path,
        help="Mount roots to scan, for example /Volumes on macOS or /media/$USER on Linux.",
    )

    ingest = subcommands.add_parser("ingest", help="Create a safe ingest plan, optionally executing it.")
    ingest.add_argument("--source", required=True, type=Path, help="Camera card, shoot folder, or archive folder.")
    ingest.add_argument("--destination", required=True, type=Path, help="Local library or external SSD root.")
    ingest.add_argument("--mode", choices=("copy", "move"), default="copy")
    ingest.add_argument("--source-kind", choices=("local", "removable"), default="local")
    ingest.add_argument(
        "--allow-source-removal",
        action="store_true",
        help="Required before move mode can remove originals after checksum verification.",
    )
    ingest.add_argument(
        "--execute",
        action="store_true",
        help="Copy or move files. Without this flag, only prints the plan summary.",
    )

    args = parser.parse_args()
    if args.command == "sources":
        candidates = detect_media_sources(args.roots)
        print(
            json.dumps(
                [
                    {
                        "path": str(candidate.path),
                        "media_count": candidate.media_count,
                        "confidence": candidate.confidence,
                        "reasons": list(candidate.reasons),
                    }
                    for candidate in candidates
                ],
                indent=2,
                sort_keys=True,
            )
        )
        return 0

    if args.command == "ingest":
        options = IngestOptions(
            mode=args.mode,
            source_kind=args.source_kind,
            allow_source_removal=args.allow_source_removal,
        )
        plan = plan_ingest(args.source, args.destination, options)
        if not args.execute:
            print(
                json.dumps(
                    {
                        "mode": plan.options.mode,
                        "source": str(plan.source),
                        "destination": str(plan.destination),
                        "operation_count": len(plan.operations),
                        "bytes": sum(operation.bytes for operation in plan.operations),
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
            return 0

        manifest_path = execute_plan(plan)
        print(f"Manifest written: {manifest_path}")
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
