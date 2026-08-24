from __future__ import annotations

import argparse
import json
from pathlib import Path

from .core import article14_draft, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Match a local SBOM to advisories and draft CRA incident evidence; never file or certify.")
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
        path = Path(args.usage_file).expanduser()
        data = json.loads(path.read_text()) if path.exists() else {"events": {}}
        data.setdefault("events", {})["evidence_report_generated"] = data["events"].get("evidence_report_generated", 0) + 1
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps(result, indent=2) if args.format == "json" else article14_draft(result), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
