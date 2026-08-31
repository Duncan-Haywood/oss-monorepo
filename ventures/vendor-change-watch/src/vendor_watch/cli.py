"""Command-line interface for vendor-change-watch."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

from vendor_watch import diff, snapshot, store, usage

DISCLAIMER = (
    "This tool reports what changed in the text of pages you configured, with "
    "source URLs and timestamps. It is not legal advice, does not review "
    "contracts, and does not assert that a vendor is or is not compliant with "
    "anything. You decide what a change means."
)

PAGE_TYPES = ("terms", "privacy", "subprocessors", "security", "other")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _data_dir(args: argparse.Namespace) -> Path:
    return Path(args.data_dir) if args.data_dir else store.default_data_dir()


def cmd_add(args: argparse.Namespace) -> int:
    data_dir = _data_dir(args)
    entry = store.add_watch(data_dir, args.vendor, args.url, args.type, args.label)
    usage.record_event(data_dir, "watch_added", _now_iso())
    print(f"Watching {entry['vendor']} ({entry['page_type']}): {entry['url']}")
    return 0


def cmd_remove(args: argparse.Namespace) -> int:
    data_dir = _data_dir(args)
    removed = store.remove_watch(data_dir, args.vendor, args.url, args.type)
    if removed:
        usage.record_event(data_dir, "watch_removed", _now_iso())
        print(f"Removed {args.vendor} ({args.type}): {args.url}")
        return 0
    print(f"No matching watch found for {args.vendor} ({args.type}): {args.url}", file=sys.stderr)
    return 1


def cmd_list(args: argparse.Namespace) -> int:
    data_dir = _data_dir(args)
    entries = store.load_watchlist(data_dir)
    if not entries:
        print("No vendors watched yet. Add one with: vendor-watch add --vendor NAME --url URL --type terms")
        return 0
    for entry in entries:
        label = f" ({entry['label']})" if entry.get("label") else ""
        print(f"{entry['vendor']}{label} [{entry['page_type']}] {entry['url']}")
    return 0


def _print_report(report: dict) -> None:
    status = report["status"]
    if status == "inconclusive":
        print(f"INCONCLUSIVE: {report['reason']}")
        return
    if status == "unknown":
        print(f"UNKNOWN: {report['reason']}")
        return
    if not report["changes"]:
        print(f"No change detected. Source: {report['source_url']}")
        return
    print(f"{len(report['changes'])} section(s) changed. Source: {report['source_url']}")
    for change in report["changes"]:
        print(f"  [{change['change']}] {change['heading']}")
    print()
    for limitation in report["limitations"]:
        print(f"  Note: {limitation}")


def cmd_check(args: argparse.Namespace) -> int:
    data_dir = _data_dir(args)
    entries = store.load_watchlist(data_dir)
    if args.vendor:
        entries = [e for e in entries if e["vendor"] == args.vendor]
    if not entries:
        print("Nothing to check.", file=sys.stderr)
        return 1

    exit_code = 0
    for entry in entries:
        captured_at = _now_iso()
        fetch_result = snapshot.fetch_page(entry["url"])
        new_snapshot = snapshot.build_snapshot(
            entry["vendor"], entry["url"], entry["page_type"], captured_at, fetch_result
        )
        store.save_snapshot(data_dir, new_snapshot)
        prior = store.list_snapshots(data_dir, entry["vendor"], entry["page_type"], entry["url"])
        print(f"\n== {entry['vendor']} [{entry['page_type']}] ==")
        if len(prior) < 2:
            print(f"First snapshot captured (fetch_status={new_snapshot['fetch_status']}). Nothing to compare yet.")
            usage.record_event(data_dir, "check_run", captured_at)
            continue
        before = diff.load_snapshot(prior[-2])
        after = diff.load_snapshot(prior[-1])
        report = diff.build_report(before, after)
        _print_report(report)
        usage.record_event(data_dir, "check_run", captured_at)
        if report["status"] == "observed" and report["changes"]:
            usage.record_event(data_dir, "change_detected", captured_at)
        elif report["status"] == "observed":
            usage.record_event(data_dir, "no_change_detected", captured_at)
        elif report["status"] == "inconclusive":
            usage.record_event(data_dir, "check_inconclusive", captured_at)
            exit_code = 2
    return exit_code


def _resolve_watch_url(data_dir: Path, vendor: str, page_type: str, url: str | None) -> str | None:
    """Resolve which watched URL a vendor/type pair refers to.

    A vendor can have more than one watched URL under the same page_type
    (e.g. two different "terms" pages), so vendor+type alone does not
    always name one watch. Returns None (after printing why) when the
    caller must pass --url to disambiguate.
    """
    if url:
        return url
    matches = [
        e for e in store.load_watchlist(data_dir) if e["vendor"] == vendor and e["page_type"] == page_type
    ]
    if len(matches) == 1:
        return matches[0]["url"]
    if not matches:
        print(f"No watch found for {vendor} [{page_type}].", file=sys.stderr)
        return None
    print(f"Multiple URLs are watched for {vendor} [{page_type}]; pass --url to pick one:", file=sys.stderr)
    for match in matches:
        print(f"  {match['url']}", file=sys.stderr)
    return None


def cmd_report(args: argparse.Namespace) -> int:
    data_dir = _data_dir(args)
    url = _resolve_watch_url(data_dir, args.vendor, args.type, args.url)
    if url is None:
        return 1
    pair = store.latest_two_snapshots(data_dir, args.vendor, args.type, url)
    if pair is None:
        print("Fewer than two snapshots exist for this vendor/type yet. Run `check` at least twice.", file=sys.stderr)
        return 1
    before = diff.load_snapshot(pair[0])
    after = diff.load_snapshot(pair[1])
    report = diff.build_report(before, after)
    _print_report(report)
    return 0


def cmd_usage(args: argparse.Namespace) -> int:
    data_dir = _data_dir(args)
    totals = usage.summarize(data_dir)
    if not totals:
        print("No local usage recorded yet.")
        return 0
    for event, count in sorted(totals.items()):
        print(f"{event}: {count}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="vendor-watch",
        description="Watch vendor terms/privacy/security pages you choose and show a source-linked "
        "diff when they change. " + DISCLAIMER,
    )
    parser.add_argument("--data-dir", default=None, help="Override the local data directory (default: ~/.vendor-watch)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="Add a page to the watchlist")
    add_parser.add_argument("--vendor", required=True)
    add_parser.add_argument("--url", required=True)
    add_parser.add_argument("--type", choices=PAGE_TYPES, required=True)
    add_parser.add_argument("--label", default=None)
    add_parser.set_defaults(func=cmd_add)

    remove_parser = subparsers.add_parser("remove", help="Remove a page from the watchlist")
    remove_parser.add_argument("--vendor", required=True)
    remove_parser.add_argument("--url", required=True)
    remove_parser.add_argument("--type", choices=PAGE_TYPES, required=True)
    remove_parser.set_defaults(func=cmd_remove)

    list_parser = subparsers.add_parser("list", help="List watched pages")
    list_parser.set_defaults(func=cmd_list)

    check_parser = subparsers.add_parser("check", help="Fetch current pages and diff against the prior snapshot")
    check_parser.add_argument("--vendor", default=None, help="Only check this vendor")
    check_parser.set_defaults(func=cmd_check)

    report_parser = subparsers.add_parser("report", help="Show the diff between the last two stored snapshots")
    report_parser.add_argument("--vendor", required=True)
    report_parser.add_argument("--type", choices=PAGE_TYPES, required=True)
    report_parser.add_argument(
        "--url", default=None, help="Required if this vendor/type has more than one watched URL"
    )
    report_parser.set_defaults(func=cmd_report)

    usage_parser = subparsers.add_parser("usage", help="Show locally recorded usage counts (nothing leaves this machine)")
    usage_parser.set_defaults(func=cmd_usage)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
