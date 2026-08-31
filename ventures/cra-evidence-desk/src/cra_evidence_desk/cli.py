from __future__ import annotations

import argparse
import json
from pathlib import Path

from .core import article14_draft, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Match a local SBOM to advisories and draft CRA incident evidence; never file or certify.",
        epilog=(
            "No warranty. This is a customer-reviewed draft, not a filing, "
            "legal advice, or a compliance claim. You are responsible for "
            "reviewing the output. Best-effort; no SLA. Optional GitHub Sponsors "
            "never changes what the tool does."
        ),
    )
    parser.add_argument("sbom", type=Path)
    parser.add_argument("advisories", type=Path)
    parser.add_argument("--product", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--format", choices=("json", "draft"), default="draft")
    parser.add_argument("--usage-file", help="optional local aggregate event counter")
    args = parser.parse_args(argv)
    try:
        sbom = json.loads(args.sbom.read_text())
        advisories = json.loads(args.advisories.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        parser.error(f"could not read input: {exc}")
    result = report(sbom, advisories, args.product, args.version)
    if args.usage_file:
        _record_usage_event(args.usage_file, "evidence_report_generated")
    print(json.dumps(result, indent=2) if args.format == "json" else article14_draft(result), end="")
    return 0


def _record_usage_event(usage_file: str, event: str) -> None:
    """Best-effort local aggregate counter. A corrupt or unwritable counter
    file must never fail a run that already produced its evidence report --
    the local tally is a convenience, not the reason the tool was invoked.
    """
    path = Path(usage_file).expanduser()
    try:
        data = json.loads(path.read_text()) if path.exists() else {}
    except (OSError, json.JSONDecodeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    events = data.get("events")
    if not isinstance(events, dict):
        events = {}
    count = events.get(event, 0)
    events[event] = (count if isinstance(count, (int, float)) else 0) + 1
    data["events"] = events
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n")
    except OSError:
        pass


if __name__ == "__main__":
    raise SystemExit(main())
