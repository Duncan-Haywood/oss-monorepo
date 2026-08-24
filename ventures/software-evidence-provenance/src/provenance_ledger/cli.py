"""Command-line interface: build an evidence bundle, and reproduce one later."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .provenance import (
    STATUS_REPRODUCED,
    build_bundle,
    markdown_bundle,
    markdown_verification,
    verify_bundle,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _bump_usage(usage_file: Path, event: str) -> None:
    usage = json.loads(usage_file.read_text(encoding="utf-8")) if usage_file.exists() else {}
    usage[event] = int(usage.get(event, 0)) + 1
    usage_file.write_text(json.dumps(usage, indent=2) + "\n", encoding="utf-8")


def cmd_bundle(args: argparse.Namespace) -> int:
    """Hash a descriptor's inputs and write a reproducible evidence bundle."""
    try:
        descriptor = json.loads(args.descriptor.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"could not read descriptor {args.descriptor}: {exc}", file=sys.stderr)
        return 2

    base_dir = args.base_dir or args.descriptor.parent
    bundle = build_bundle(descriptor, base_dir=base_dir)

    if args.format == "markdown":
        output = markdown_bundle(bundle)
    else:
        output = json.dumps(bundle, indent=2, sort_keys=True) + "\n"

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
        print(f"wrote {args.output} at {_now_iso()}", file=sys.stderr)
    else:
        print(output, end="")

    if args.usage_file:
        _bump_usage(args.usage_file, "bundle_built")

    # A bundle with recorded problems (no release label, empty inputs, etc.) is
    # still emitted -- it documents the gap -- but exits non-zero so a CI step
    # can treat "I could not fully describe this release" as a signal.
    return 1 if bundle.get("problems") else 0


def cmd_verify(args: argparse.Namespace) -> int:
    """Re-hash a bundle's inputs against disk and report reproduced/changed/..."""
    try:
        bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"could not read bundle {args.bundle}: {exc}", file=sys.stderr)
        return 2

    base_dir = args.base_dir or args.bundle.parent
    report = verify_bundle(bundle, base_dir=base_dir)

    if args.format == "markdown":
        output = markdown_verification(report)
    else:
        output = json.dumps(report, indent=2, sort_keys=True) + "\n"

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")

    if args.usage_file:
        _bump_usage(args.usage_file, "bundle_verified")

    # Exit 0 only on a full reproduction. Anything else -- changed, incomplete,
    # inconclusive -- is a non-zero signal, never silently treated as success.
    return 0 if report["status"] == STATUS_REPRODUCED else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="provenance-ledger",
        description=(
            "Record the SHA-256 of a release's build inputs into a reproducible "
            "evidence bundle, and reproduce that bundle later. Local only; nothing "
            "is fetched, signed, or asserted to be secure or compliant."
        ),
    )
    sub = parser.add_subparsers(dest="subcommand", required=True)

    bundle = sub.add_parser("bundle", help="hash a release descriptor's inputs into an evidence bundle")
    bundle.add_argument("descriptor", type=Path, help="path to the release descriptor JSON")
    bundle.add_argument(
        "--base-dir",
        type=Path,
        help="root the descriptor's input paths are relative to (default: the descriptor's directory)",
    )
    bundle.add_argument("--format", choices=("json", "markdown"), default="json")
    bundle.add_argument("--output", type=Path, help="where to write the bundle (default: stdout)")
    bundle.add_argument("--usage-file", type=Path, help="optional local event-count file")
    bundle.set_defaults(func=cmd_bundle)

    verify = sub.add_parser("verify", help="re-hash a bundle's inputs against disk and report")
    verify.add_argument("bundle", type=Path, help="path to a bundle JSON produced by `bundle`")
    verify.add_argument(
        "--base-dir",
        type=Path,
        help="root the recorded input paths are relative to (default: the bundle's directory)",
    )
    verify.add_argument("--format", choices=("json", "markdown"), default="json")
    verify.add_argument("--output", type=Path, help="where to write the report (default: stdout)")
    verify.add_argument("--usage-file", type=Path, help="optional local event-count file")
    verify.set_defaults(func=cmd_verify)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
