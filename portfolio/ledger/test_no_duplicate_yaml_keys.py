"""No committed portfolio YAML file may repeat a mapping key.

WHY THIS EXISTS

Every reader of this data uses `yaml.safe_load`, and PyYAML's resolution of a
duplicated mapping key is to take the **last** one and say nothing. So a file
that repeats a key parses clean, validates clean, and quietly discards a
value. Nothing in the tree was asking.

Measured 2026-09-11: `portfolio/ledger/2026-09.yaml` carried two consecutive
`mrr_end: 0` lines inside one entry, on `main` at `773b380c`. Harmless in
itself — both values were `0` — but it is the benign instance of a shape that
is not. This repository resolves ledger conflicts by hand several times an
hour (four sibling sessions inside a 15-minute window is the ordinary case
here, per `session_gate.py`), and the way those conflicts are resolved is by
keeping both sides. Keep both sides one line too generously and you get a
duplicated `outcomes:` key rather than a duplicated `mrr_end:` — at which
point one session's entire record of what it shipped is discarded silently,
by the loader, with the file still parsing and every validator still green.

That is the same defect this repository keeps paying for in other forms: a
guard that cannot fire, so the bug is found by its consequence months later
rather than by anything that asks. The cheap version is to ask.

WHY A TEST RATHER THAN A SCRIPT

`portfolio/ledger` is already named in CLAUDE.md's starvation checklist
(`python3 -m pytest portfolio/ledger ...`), so a test file here is run by
every session that follows the list, and by `portfolio-validate.yml` on a
runner. A new script would need a new checklist line, and CLAUDE.md records
at length what happens to checklist lines nobody adds.

    python3 -m pytest portfolio/ledger/test_no_duplicate_yaml_keys.py
"""

from __future__ import annotations

import pathlib

import pytest
import yaml

REPO = pathlib.Path(__file__).resolve().parents[2]

# Enumerated by globbing rather than listed, so a ninth data file added under
# portfolio/ is covered the day it lands instead of the day someone remembers
# this file exists. CLAUDE.md records three separate occasions where a
# hand-maintained list of directories went stale and a guard went unrun.
PORTFOLIO_YAML = sorted(
    p
    for p in REPO.joinpath("portfolio").rglob("*.yaml")
    if "node_modules" not in p.parts
)


def duplicate_keys(text: str) -> list[tuple[str, int]]:
    """Every mapping key that appears more than once in its own mapping.

    Composes the nodes rather than loading them: `yaml.compose` keeps the
    source marks, so a finding can name the line a human has to go look at,
    and it stops short of the constructor that would collapse the duplicate
    and hide it.
    """
    found: list[tuple[str, int]] = []

    def walk(node) -> None:
        if isinstance(node, yaml.MappingNode):
            seen: dict[str, int] = {}
            for key_node, value_node in node.value:
                key = getattr(key_node, "value", None)
                if isinstance(key, str):
                    if key in seen:
                        found.append((key, key_node.start_mark.line + 1))
                    else:
                        seen[key] = key_node.start_mark.line + 1
                walk(value_node)
        elif isinstance(node, yaml.SequenceNode):
            for item in node.value:
                walk(item)

    root = yaml.compose(text)
    if root is not None:
        walk(root)
    return found


@pytest.mark.parametrize("path", PORTFOLIO_YAML, ids=lambda p: p.name)
def test_no_duplicate_mapping_keys(path: pathlib.Path) -> None:
    dupes = duplicate_keys(path.read_text())
    assert not dupes, (
        f"{path.relative_to(REPO)} repeats {len(dupes)} mapping key(s); "
        "PyYAML keeps only the last of each and discards the rest silently:\n"
        + "\n".join(f"  line {line}: {key!r} repeated" for key, line in dupes)
    )


def test_the_checker_finds_a_duplicate_it_is_given() -> None:
    """A guard that cannot fail is worth less than no guard.

    The shape asserted here is the dangerous one rather than the one actually
    measured: a second `outcomes:` key, which is what a too-generous ledger
    conflict resolution produces and which silently discards a whole session's
    record.
    """
    botched = (
        "entries:\n"
        "  - venture: example\n"
        "    outcomes:\n"
        "      - first session's record\n"
        "    outcomes:\n"
        "      - second session's record\n"
        "    mrr_end: 0\n"
    )
    assert duplicate_keys(botched) == [("outcomes", 5)]

    # And the loader really does discard the first one, which is the premise
    # this whole file rests on — asserted rather than assumed.
    loaded = yaml.safe_load(botched)["entries"][0]
    assert loaded["outcomes"] == ["second session's record"]


def test_the_checker_passes_a_clean_file() -> None:
    """Repeating a key in *different* mappings is ordinary and must not trip.

    Every ledger entry has its own `venture` and `mrr_end`; a checker that
    counted those as duplicates would fail on every correct file and be
    switched off within a day.
    """
    clean = (
        "entries:\n"
        "  - venture: a\n"
        "    mrr_end: 0\n"
        "  - venture: b\n"
        "    mrr_end: 0\n"
    )
    assert duplicate_keys(clean) == []


def test_it_is_actually_looking_at_files() -> None:
    """Guards against an empty parametrize silently reporting a pass."""
    assert len(PORTFOLIO_YAML) >= 8, PORTFOLIO_YAML
