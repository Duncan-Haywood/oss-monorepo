#!/usr/bin/env python3
"""Check usage.yaml is machine-readable and structurally sound.

README.md in this directory says usage.yaml "is what the router and the next
session read". Nothing in CI actually read it, so on 2026-08-26 a merge
resolution in #1387 left a stray blank line and a three-space `- slug:` under
`products:`. The file stopped parsing as YAML entirely and stayed that way:
every product's usage history — the only honest signal the portfolio has while
revenue is zero — was unreadable, and no check went red.

    python3 portfolio/usage/validate_usage.py

Exits non-zero and prints every problem it found. PyYAML only (already in
portfolio/router/requirements.txt).
"""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import yaml

USAGE = Path(__file__).resolve().parent / "usage.yaml"

# README.md rule 1: "Count events, never people." These substrings in a signal
# name are the shapes that rule forbids. A signal is a count of events; none of
# these can be one.
FORBIDDEN_SIGNAL_TOKENS = (
    "ip_address",
    "email",
    "user_id",
    "device_id",
    "fingerprint",
    "cookie",
)


def _problems_for_reading(slug: str, index: int, reading: object) -> list[str]:
    where = f"{slug}: reading {index}"
    if not isinstance(reading, dict):
        return [f"{where}: expected a mapping, got {type(reading).__name__}"]

    problems: list[str] = []
    as_of = reading.get("as_of")
    if as_of is None:
        problems.append(f"{where}: missing as_of")
    elif not isinstance(as_of, dt.date):
        # A quoted or malformed date loads as a string and silently breaks any
        # trend read over these rows.
        problems.append(f"{where}: as_of {as_of!r} is not a YYYY-MM-DD date")

    signals = reading.get("signals")
    if signals is None:
        problems.append(f"{where}: missing signals")
    elif not isinstance(signals, dict):
        problems.append(f"{where}: signals must be a mapping")
    else:
        for name, value in signals.items():
            lowered = str(name).lower()
            for token in FORBIDDEN_SIGNAL_TOKENS:
                if token in lowered:
                    problems.append(
                        f"{where}: signal {name!r} looks like a person, not an event"
                    )
            if value is not None and not isinstance(value, (int, float)):
                problems.append(
                    f"{where}: signal {name!r} must be a number or null, got {value!r}"
                )

    if not reading.get("note"):
        problems.append(f"{where}: missing note — a number with no note is not a signal")
    return problems


def check(path: Path) -> list[str]:
    text = path.read_text()
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as error:
        # This is the failure that actually happened. Report it as the headline
        # rather than letting a traceback bury it.
        return [f"{path}: is not valid YAML — {error}"]

    if not isinstance(doc, dict):
        return [f"{path}: top level must be a mapping"]

    problems: list[str] = []
    if not doc.get("period"):
        problems.append(f"{path}: missing period")

    products = doc.get("products")
    if not isinstance(products, list) or not products:
        return problems + [f"{path}: no products found"]

    # One product legitimately appears once per surface it ships on — a CLI and
    # a browser page are separate things to measure. Two rows for the *same*
    # surface are not: they split one history in half.
    seen: dict[tuple[str, str], int] = {}
    for position, product in enumerate(products):
        if not isinstance(product, dict):
            problems.append(f"products[{position}]: expected a mapping")
            continue

        slug = product.get("slug")
        if not slug:
            problems.append(f"products[{position}]: missing slug")
            continue

        surface = product.get("surface")
        if not surface:
            problems.append(f"{slug}: missing surface")
        else:
            key = (str(slug), str(surface))
            if key in seen:
                problems.append(
                    f"{slug}: duplicate entry for surface {surface!r} "
                    f"(also at products[{seen[key]}]) — append a dated reading "
                    "to the existing product instead"
                )
            seen[key] = position

        readings = product.get("readings")
        if not isinstance(readings, list) or not readings:
            problems.append(f"{slug}: no readings — a baseline of zero is still a reading")
            continue
        for index, reading in enumerate(readings):
            problems.extend(_problems_for_reading(str(slug), index, reading))

    return problems


def main() -> int:
    problems = check(USAGE)
    if problems:
        print(f"usage.yaml: {len(problems)} problem(s)\n")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    doc = yaml.safe_load(USAGE.read_text())
    readings = sum(len(p.get("readings") or []) for p in doc["products"])
    print(
        f"usage.yaml is valid: {len(doc['products'])} products, {readings} readings."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
