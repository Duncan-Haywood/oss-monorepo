"""Command-line entry point, and the GitHub Action's implementation.

Usage::

    python3 -m wcag_triage.cli page1.html page2.html --output-dir ./evidence

Like the sibling reachability probe, ``--fail-on`` is opt-in and defaults to
never failing the build: a checker that breaks CI by default gets removed, and
a removed checker records nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .engine import audit_html
from .evidence import build_record, to_markdown


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="eaa-wcag-triage",
        description=(
            "Static WCAG 2.2 A/AA triage: report the accessibility failures a "
            "source-only pass can find on a page, split into task-blocking and "
            "degrading, with an explicit statement of what it could not check."
        ),
    )
    parser.add_argument("pages", nargs="+", help="HTML files to audit")
    parser.add_argument(
        "--output-dir", default=None, help="write record.json and record.md here"
    )
    parser.add_argument(
        "--fail-on",
        choices=["never", "any", "blocking"],
        default="never",
        help="exit non-zero when findings at this level exist (default: never)",
    )
    parser.add_argument(
        "--checked-at",
        default=None,
        help="ISO-8601 timestamp to stamp the record with (default: now, UTC)",
    )
    return parser


def run(argv=None) -> int:
    args = _build_parser().parse_args(argv)
    checked_at = args.checked_at or datetime.now(timezone.utc).isoformat()

    audits = {}
    for page in args.pages:
        path = Path(page)
        try:
            html = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            print(f"error: cannot read {page}: {exc}", file=sys.stderr)
            return 2
        audits[path.name] = audit_html(html)

    record = build_record(audits, checked_at)

    if args.output_dir:
        out = Path(args.output_dir)
        out.mkdir(parents=True, exist_ok=True)
        (out / "record.json").write_text(
            json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        (out / "record.md").write_text(to_markdown(record), encoding="utf-8")
    else:
        print(to_markdown(record))

    totals = record["totals"]
    if args.fail_on == "any" and totals["total"] > 0:
        return 1
    if args.fail_on == "blocking" and totals["blocking"] > 0:
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(run())
