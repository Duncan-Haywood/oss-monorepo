#!/usr/bin/env python3
"""Check a listing-photo folder and print the evidence record."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from check import check_folder
from record import render


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "folder",
        type=Path,
        help="Folder of .jpg / .jpeg / .png listing photos",
    )
    args = parser.parse_args(argv)
    folder = args.folder
    if not folder.is_dir():
        print(f"not a directory: {folder}", file=sys.stderr)
        return 2
    reports = check_folder(folder)
    sys.stdout.write(render(folder, reports))
    blocking = any(f.severity == "blocking" for r in reports for f in r.findings)
    return 1 if blocking else 0


if __name__ == "__main__":
    raise SystemExit(main())
