#!/usr/bin/env python3
"""Check usage.yaml is machine-readable and structurally sound.

README.md in this directory says usage.yaml "is what the router and the next
session read". Nothing in CI actually read it, so on 2026-08-26 a merge
resolution in #1387 left a stray blank line and a three-space `- slug:` under
`products:`. The file stopped parsing as YAML entirely and stayed that way:
every product's usage history — the only honest signal the portfolio has while
revenue is zero — was unreadable, and no check went red.

Parsing is necessary but not sufficient. A bad merge can also leave a file that
parses *fine* and is wrong, because YAML's duplicate-key rule is last-one-wins
and PyYAML applies it in silence. That happened twice, both times to
`note:`, and both times a whole reading's worth of truth went missing without a
red check:

  - `shopify-permission-drift` carried two `note:` keys on one reading, so the
    fuller of the two ("...and CI warning output") was the one discarded.
  - `dns-configuration-evidence` had two readings collide into one. Three
    signals — local_observations_compared, local_inconclusive_observations,
    qualified_operators — were left indented *inside* the preceding `note:`
    block scalar, where they read as prose rather than as numbers, and the
    second `note:` then overwrote the first. Both readings' notes and one
    reading's signals were lost.

So this also refuses a duplicate key anywhere in the file, and flags a note
whose text contains signal-shaped lines, which is what that second corruption
looks like from the outside.

    python3 portfolio/usage/validate_usage.py

Exits non-zero and prints every problem it found. PyYAML only (already in
portfolio/router/requirements.txt).
"""

from __future__ import annotations

import datetime as dt
import re
import sys
from pathlib import Path

import yaml

USAGE = Path(__file__).resolve().parent / "usage.yaml"

# A `some_signal_name: 12` (or `: null`) fragment inside a note's text.
#
# This searches the loaded string rather than the raw lines, because the notes
# here are written as `>-` folded scalars: YAML joins their lines with spaces,
# so a swallowed signal arrives mid-sentence with no newline to anchor on. That
# is how the dns-configuration-evidence corruption looked from here.
#
# The key must contain an underscore. Every signal name in this file is
# snake_case (live_url_visitors, landing_page_views, qualified_operators),
# while prose that happens to pair a colon with a number — "Baseline: 0
# visitors so far" — is a single word. That keeps the check quiet on ordinary
# notes and loud on the one shape that means lost numbers.
SWALLOWED_SIGNAL = re.compile(
    r"\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+):\s*(?:\d+(?:\.\d+)?|null)\b"
)


class _DuplicateKeyLoader(yaml.SafeLoader):
    """SafeLoader that records duplicate mapping keys instead of dropping them.

    PyYAML resolves a repeated key by keeping the last value and saying
    nothing. That is the failure mode above, so the keys are collected here
    (with the line number of the *second* occurrence, which is the edit a
    reviewer needs to look at) and reported as problems by check().
    """

    def __init__(self, stream) -> None:
        super().__init__(stream)
        self.duplicate_keys: list[tuple[int, object]] = []

    def construct_mapping(self, node, deep=False):  # type: ignore[override]
        seen: set[object] = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            try:
                if key in seen:
                    self.duplicate_keys.append((key_node.start_mark.line + 1, key))
                seen.add(key)
            except TypeError:
                # Unhashable key; the base constructor reports this properly.
                continue
        return super().construct_mapping(node, deep=deep)

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

    note = reading.get("note")
    if not note:
        problems.append(f"{where}: missing note — a number with no note is not a signal")
    elif isinstance(note, str):
        swallowed = [match.group(0) for match in SWALLOWED_SIGNAL.finditer(note)]
        if swallowed:
            problems.append(
                f"{where}: note contains signal-shaped line(s) {swallowed!r} — "
                "these read as prose, not as numbers. A merge folded a following "
                "reading's signals into this note; split them back out into "
                "their own reading"
            )
    return problems


def check(path: Path) -> list[str]:
    text = path.read_text()
    loader = _DuplicateKeyLoader(text)
    try:
        doc = loader.get_single_data()
    except yaml.YAMLError as error:
        # This is the failure that actually happened. Report it as the headline
        # rather than letting a traceback bury it.
        return [f"{path}: is not valid YAML — {error}"]
    finally:
        loader.dispose()

    if not isinstance(doc, dict):
        return [f"{path}: top level must be a mapping"]

    problems: list[str] = []
    for line, key in loader.duplicate_keys:
        problems.append(
            f"{path}:{line}: duplicate key {key!r} — YAML keeps the last one and "
            "discards the rest silently, so this is losing data"
        )
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
