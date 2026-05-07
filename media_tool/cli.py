from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from media_tool.ingest import build_ingest_plan, execute_ingest_plan


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Safely copy camera media into an organized shoot library.",
    )
    parser.add_argument("--source", required=True, type=Path, help="Source folder, SD card mount, or drive path.")
    parser.add_argument("--library", required=True, type=Path, help="Destination library or SSD folder.")
    parser.add_argument("--shoot", required=True, help="Shoot slug, for example smith-wedding-2026-05-07.")
    parser.add_argument("--dry-run", action="store_true", help="Plan the ingest without copying files.")
    args = parser.parse_args()

    try:
        plan = build_ingest_plan(source=args.source, library=args.library, shoot_slug=args.shoot)
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2

    kind_counts = Counter(copy.asset.kind.value for copy in plan.copies)

    print(f"Shoot: {plan.shoot_slug}")
    print(f"Source: {plan.source}")
    print(f"Library: {plan.library}")
    print(f"Assets: {len(plan.copies)}")
    for kind, count in sorted(kind_counts.items()):
        print(f"  {kind}: {count}")

    if args.dry_run:
        print("Dry run only. No files copied.")
        return 0

    try:
        manifest = execute_ingest_plan(plan)
    except (FileExistsError, OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    status_counts = Counter(result.status for result in manifest.results)
    print(f"Manifest: {manifest.manifest_path}")
    for status, count in sorted(status_counts.items()):
        print(f"  {status}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
