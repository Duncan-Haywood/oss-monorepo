#!/usr/bin/env python3
"""Validate portfolio/funding.yaml — owner-declared payout and donation methods."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

import yaml

REPO = Path(__file__).resolve().parents[2]
FUNDING = REPO / "portfolio" / "funding.yaml"


def validate(doc: dict) -> list[str]:
    problems: list[str] = []

    if doc.get("declared_by") != "account_owner":
        problems.append("declared_by must be 'account_owner'")

    declared_at = doc.get("declared_at")
    if not isinstance(declared_at, str) or len(declared_at) != 10:
        problems.append("declared_at must be YYYY-MM-DD")

    donation = doc.get("donation")
    if not isinstance(donation, dict) or not donation:
        problems.append("donation must be a non-empty mapping")

    bmc = (donation or {}).get("buymeacoffee") if isinstance(donation, dict) else None
    if not isinstance(bmc, dict):
        problems.append("donation.buymeacoffee must be present")
    else:
        url = bmc.get("url")
        if not isinstance(url, str) or not url:
            problems.append("donation.buymeacoffee.url must be a non-empty string")
        else:
            parsed = urlparse(url)
            if parsed.scheme != "https" or parsed.netloc != "buymeacoffee.com":
                problems.append(
                    "donation.buymeacoffee.url must be https://buymeacoffee.com/..."
                )
            if not parsed.path.strip("/"):
                problems.append("donation.buymeacoffee.url must include a username path")

        label = bmc.get("label")
        if not isinstance(label, str) or not label.strip():
            problems.append("donation.buymeacoffee.label must be a non-empty string")

    commercial = doc.get("commercial")
    if not isinstance(commercial, dict):
        problems.append("commercial must be a mapping")
    elif commercial.get("status") != "not_configured":
        problems.append("commercial.status must be 'not_configured' until owner configures MoR")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Exit 1 if invalid")
    args = parser.parse_args()

    if not FUNDING.is_file():
        msg = f"missing {FUNDING.relative_to(REPO)}"
        print(msg, file=sys.stderr)
        return 1

    doc = yaml.safe_load(FUNDING.read_text())
    if not isinstance(doc, dict):
        print("funding.yaml must be a mapping", file=sys.stderr)
        return 1

    problems = validate(doc)
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1

    print(f"OK: {FUNDING.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
